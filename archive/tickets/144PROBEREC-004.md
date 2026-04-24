# 144PROBEREC-004: Diagnostic harness rewire + SimulationOptions.decisionHook (seed 1049)

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — `SimulationOptions` extension + campaign diagnostic rewrite
**Deps**: `archive/tickets/144PROBEREC-002.md`, `archive/tickets/144PROBEREC-003.md`

## Problem

`campaigns/fitl-arvn-agent-evolution/diagnose-nolegalmoves.mjs` currently implements its own simulator loop (lines 106-177) that imports `publishMicroturn`, `applyPublishedDecision`, `advanceAutoresolvable` directly. The RNG mix constants (`CHANCE_RNG_MIX`, `AGENT_RNG_MIX = 0x9e3779b97f4a7c15n`) and derivation formulas are identical to `runGame`, **but** the diagnostic dispatches agents using `state.activePlayer` (line 138) while `runGame` uses `resolvePlayerIndexForSeat(validatedDef, microturn.seatId)` (`simulator.ts:191`). In FITL, the active player isn't always the decider — during event resolution or interrupt windows, a non-active faction can be the microturn decider. The diagnostic therefore picks the wrong agent (and wrong `agentRng`) for non-active-faction microturns, producing a different trajectory. Seed 1049 is the reproducer.

This ticket closes the divergence by routing the diagnostic through `runGame` itself, captured via a new `SimulationOptions.decisionHook` callback.

## Assumption Reassessment (2026-04-24)

1. `packages/engine/src/sim/sim-options.ts` currently exports `SimulationOptions` with five fields: `kernel`, `skipDeltas`, `traceRetention`, `snapshotDepth`, `profiler`. Adding an optional `decisionHook` is zero-blast-radius — confirmed.
2. `diagnose-nolegalmoves.mjs:138` uses `state.activePlayer`; `simulator.ts:191` uses `resolvePlayerIndexForSeat(validatedDef, microturn.seatId)`. This is the actual divergence source, not RNG mix (which is bit-identical).
3. After ticket 002 lands, `ProbeHoleRecoveryLog` events accumulate in `GameTrace.probeHoleRecoveries` — the diagnostic consumes them via the hook to report rollback firings without re-running the simulator.
4. The diagnostic's current output format (globals, zone tokens, last 10 decisions, last player decision snapshot) is preserved — it is captured from inside the hook on failure rather than after a hand-rolled loop.

## Architecture Check

1. `SimulationOptions.decisionHook` is an optional callback with no semantic effect on simulation output. It does not read or mutate state; it receives a read-only view of each `DecisionLog` (and each `ProbeHoleRecoveryLog`) as the simulator produces it. F#8 (determinism) is preserved — the hook cannot influence agent choices, RNG advancement, or state transitions.
2. The hook is engine-agnostic: it receives generic `DecisionLog` / `ProbeHoleRecoveryLog` payloads. No game-specific branching in engine code (F#1).
3. Routing the diagnostic through `runGame` eliminates the duplicated loop — one rules protocol, one client-dispatch path (F#5). The diagnostic is a pure consumer of trace events.
4. No backward-compatibility shim: the old hand-rolled loop is deleted outright (F#14). Any external callers of `diagnose-nolegalmoves.mjs` continue to work since the CLI interface (`--seed`, `--max-turns`, `--evolved-seat`) is preserved.

## What to Change

### 1. Extend `SimulationOptions` with `decisionHook`

In `packages/engine/src/sim/sim-options.ts`:
```ts
export interface DecisionHookContext {
  readonly kind: 'decision' | 'probeHoleRecovery';
  readonly decisionLog?: DecisionLog;          // present when kind='decision'
  readonly probeHoleRecovery?: ProbeHoleRecoveryLog;  // present when kind='probeHoleRecovery'
  readonly turnCount: number;
  readonly stateHash: bigint;
}

export interface SimulationOptions {
  // ... existing fields ...
  readonly decisionHook?: (context: DecisionHookContext) => void;
}
```

### 2. Wire the hook inside `runGame`

In `packages/engine/src/sim/simulator.ts`:
- After `decisionLogs.push(...autoResult.autoResolvedLogs)` at line 159, invoke `options?.decisionHook` for each auto-resolved log.
- After the `decisionLogs.push({ ... })` at line 237-245, invoke `options?.decisionHook` with the new `DecisionLog`.
- After `probeHoleRecoveries.push(rollback.logEntry)` (added in ticket 002), invoke `options?.decisionHook` with the `ProbeHoleRecoveryLog`.

The hook is invoked regardless of `shouldRetainTrace` (the hook is the consumer's own retention policy). If an exception is thrown from the hook, propagate it — do NOT swallow (hook authors are responsible for their own error handling, and silently dropping throws would mask bugs).

### 3. Rewrite `diagnose-nolegalmoves.mjs`

Replace lines 42-49 and 106-177 (the hand-rolled loop) with a single `runGame` invocation:

```js
import { runGame } from '.../sim/index.js';

const captured = { decisions: [], failure: null, stoppedAt: null };
const hook = (ctx) => {
  if (ctx.kind === 'decision' && ctx.decisionLog) {
    captured.decisions.push({
      turnCount: ctx.turnCount,
      seat: ctx.decisionLog.seatId?.toLowerCase?.() ?? null,
      actionId: getDecisionActionId(ctx.decisionLog.decision),
      legalCount: ctx.decisionLog.legalActionCount ?? 0,
      decisionKind: ctx.decisionLog.decision?.kind ?? null,
      stateHash: ctx.stateHash,
    });
  } else if (ctx.kind === 'probeHoleRecovery' && ctx.probeHoleRecovery) {
    captured.decisions.push({
      turnCount: ctx.turnCount,
      kind: 'probeHoleRecovery',
      seat: ctx.probeHoleRecovery.seatId.toLowerCase(),
      blacklistedActionId: ctx.probeHoleRecovery.blacklistedActionId,
      reason: ctx.probeHoleRecovery.reason,
    });
  }
  captured.stoppedAt = ctx.stateHash;
};

const trace = runGame(def, SEED, agents, MAX_TURNS, PLAYER_COUNT, { decisionHook: hook, traceRetention: 'full' }, runtime);
```

On failure detection (via `trace.stopReason === 'noLegalMoves'`), the diagnostic reports from `trace.finalState` plus the captured hook output. No re-running. The existing output format (globals, zone tokens, last 10 decisions, last player decision snapshot) is preserved — only the data source changes.

Delete the `AGENT_RNG_MIX`, `currentChanceRng`, and `agentRngByPlayer` variables — they're no longer needed.

### 4. Direct-vs-diagnostic parity smoke test

Add `packages/engine/test/integration/diagnose-parity-runGame.test.ts` (`@test-class: architectural-invariant`): for a handful of seeds (1001, 1020, 1049, 1054), assert that `runGame` produces identical `stopReason`, `finalState.stateHash`, and `decisions.length` as the diagnostic when both are run on the same seed. Catches future regressions that re-introduce a divergence.

## Files to Touch

- `packages/engine/src/sim/sim-options.ts` (modify — add `decisionHook` + `DecisionHookContext`)
- `packages/engine/src/sim/simulator.ts` (modify — invoke hook at decision-log and probe-hole-recovery emission sites)
- `campaigns/fitl-arvn-agent-evolution/diagnose-nolegalmoves.mjs` (modify — replace hand-rolled loop with `runGame` + hook)
- `packages/engine/test/integration/diagnose-parity-runGame.test.ts` (new)

## Out of Scope

- Deep probe / LRU / cache — ticket 001.
- Rollback / blacklist / `ProbeHoleRecoveryLog` type / `GameTrace` migration — ticket 002.
- Seed-1001 fixture / F#18 amendment / convergence-witness re-bless / residual recovery completion — ticket 003.
- Replay-identity determinism proof for recovery traces — ticket 005. (`Trace.schema.json` was absorbed by ticket 002.)
- Other campaign diagnostics (only `diagnose-nolegalmoves.mjs` is in scope — a repo-wide grep shows it's the only copy).

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/engine test packages/engine/test/integration/diagnose-parity-runGame.test.ts` — direct `runGame` and diagnostic-via-hook produce identical outcomes on seeds 1001/1020/1049/1054.
2. `node campaigns/fitl-arvn-agent-evolution/diagnose-nolegalmoves.mjs --seed 1049` — runs without divergence from direct `runGame`; seed 1049 no longer produces the two-trajectory anomaly.
3. Existing engine suite: `pnpm turbo test`.

### Invariants

1. `SimulationOptions.decisionHook` is side-effect-only w.r.t. the caller. The simulator passes the same `GameTrace` output regardless of whether a hook is attached (enforced by a test that compares `runGame(...)` with and without hook).
2. The diagnostic and `runGame` MUST share one dispatch path. The CLI entry point contains zero calls to `publishMicroturn`, `applyPublishedDecision`, or `advanceAutoresolvable` after this ticket.
3. Hook exceptions propagate — the simulator does not swallow.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/diagnose-parity-runGame.test.ts` — parity across 4 seeds (`@test-class: architectural-invariant`).

Manual verification for the CLI:
- `node campaigns/fitl-arvn-agent-evolution/diagnose-nolegalmoves.mjs --seed 1049` — expect `stopReason=terminal` (not `noLegalMoves`), decision count matches `runGame` direct invocation.
- `node campaigns/fitl-arvn-agent-evolution/diagnose-nolegalmoves.mjs --seed 1001` — expect `stopReason=terminal` (post-003 behavior).

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test packages/engine/test/integration/diagnose-parity-runGame.test.ts`
3. `node campaigns/fitl-arvn-agent-evolution/diagnose-nolegalmoves.mjs --seed 1049`
4. `pnpm turbo lint`
5. `pnpm turbo typecheck`
6. `pnpm turbo test`

## Outcome

Completion date: 2026-04-25

Implemented `SimulationOptions.decisionHook` as a side-effect-only simulator observer. `runGame` now invokes the hook for retained and non-retained `DecisionLog` events and for `ProbeHoleRecoveryLog` events as they are produced; hook exceptions propagate to the caller.

Rewired `campaigns/fitl-arvn-agent-evolution/diagnose-nolegalmoves.mjs` through `runGame` and deleted the hand-rolled simulator loop, RNG plumbing, and direct calls to `publishMicroturn`, `applyPublishedDecision`, and `advanceAutoresolvable`. The CLI interface is unchanged, and seed 1049 now follows direct `runGame` to `stopReason=terminal`.

Added hook invariants to `packages/engine/test/unit/sim/simulator.test.ts` and a production-seed parity test at `packages/engine/test/integration/diagnose-parity-runGame.test.ts` covering seeds 1001, 1020, 1049, and 1054.

Verification:
- `pnpm -F @ludoforge/engine build`
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/sim/simulator.test.js`
- `pnpm -F @ludoforge/engine exec node --test dist/test/integration/diagnose-parity-runGame.test.js`
- `node campaigns/fitl-arvn-agent-evolution/diagnose-nolegalmoves.mjs --seed 1049`
- `pnpm -F @ludoforge/engine test packages/engine/test/integration/diagnose-parity-runGame.test.ts`
- `pnpm turbo lint`
- `pnpm turbo typecheck`
- `pnpm turbo test` — failed in pre-existing/broader Spec 140/Spec 133 lanes outside this ticket's hook/diagnostic boundary:
  - `dist/test/integration/classified-move-parity.test.js`
  - `dist/test/integration/spec-140-bounded-termination.test.js`
  - `dist/test/integration/spec-140-foundations-conformance.test.js`
  - `dist/test/integration/spec-140-profile-migration.test.js`
  - `dist/test/unit/infrastructure/test-class-markers.test.js` (post-review cleanup fixed the stale `@witness-id` marker in `packages/engine/test/integration/fitl-march-dead-end-recovery.test.ts`; direct marker scan now passes)

Broad-lane failure classification: not owned by 144PROBEREC-004. Direct reruns showed the Spec 140 failures throw `ILLEGAL_MOVE` for `actionId=pass` because the active seat still has unresolved required free-operation grants, which is recovery/grant semantics from tickets 002/003 rather than `SimulationOptions.decisionHook` or the diagnostic harness rewire. The marker failure was a stale `@witness-id` marker in `packages/engine/test/integration/fitl-march-dead-end-recovery.test.ts`, also from the completed ticket 003 seam; post-review cleanup corrected it to `@witness:`.

Post-review follow-up: `tickets/144PROBEREC-007.md` now owns the remaining recovery fallback grant reconciliation blocker, and `tickets/144PROBEREC-005.md` depends on that repair before replay-identity proof. Targeted cleanup verification: `pnpm -F @ludoforge/engine exec node --test dist/test/unit/infrastructure/test-class-markers.test.js`.
