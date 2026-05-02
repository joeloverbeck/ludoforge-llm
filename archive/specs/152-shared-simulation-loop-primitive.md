# Spec 152: Shared Simulation Loop Primitive

**Status**: COMPLETED
**Priority**: P3 (smallest of the three architectural specs falling out of PR #231; the dependency gate has cleared — Spec 150's lifecycle termination contract has landed, so the loop primitive can be built directly on the field-based signal)
**Complexity**: M (kernel-level extraction of the simulator's iteration shape into a reusable function; consumer-side migrations for `runVerifiedGameWithDiagnostics` and any future custom-loop callers; no public-API regression for existing `runGame` callers)
**Dependencies**:
- Foundation 1 (Engine Agnosticism) — the loop primitive is generic; no game-specific code.
- Foundation 5 (One Rules Protocol, Many Clients) — this is the foundation the spec exists to honor. The simulator's loop logic must be the canonical implementation; helpers and probes consume it, not re-implement it.
- Foundation 8 (Determinism Is Sacred) — the primitive's iteration order, RNG threading, and decision-log emission are deterministic; same inputs yield same outputs across all consumers.
- Foundation 15 (Architectural Completeness) — PR #231's fix had to patch `runVerifiedGameWithDiagnostics` in lockstep with the simulator (`bailOnLifecycleStall` opt-in + catch arm). Two clients, two patches, same logic. F15 says address the duplication.
- Foundation 19 (Decision-Granularity Uniformity) — the primitive yields one step per kernel-atomic decision (auto / player / recovery / terminal); the iteration grain matches the kernel's microturn protocol.
- Spec 150 (lifecycle termination contract) — **COMPLETED**. Provides the structural state field (`cardDrivenRuntime(state)?.lifecycleStatus.stalled`) the loop primitive checks. The bail-flag-and-exception mechanism PR #231 introduced has been removed from both the simulator and `runVerifiedGameWithDiagnostics`; the primitive can now be built directly on the field-based signal.
- Spec 151 (decision-stack serialization canonicality) — **COMPLETED**. The trace shape the primitive emits is canonically serializable.

**Source**:
- PR #231 investigation. PR #231 introduced a kernel termination contract (`bailOnLifecycleStall` opt-in + `LIFECYCLE_NO_PROGRESS` catch sites) that had to be ported across both the simulator and `test/helpers/zobrist-incremental-property-helpers.ts:runVerifiedGameWithDiagnostics`. Spec 150 has since unified the termination signal as a structural `lifecycleStatus.stalled` field, and the bail flag plus catch arms have been deleted from both call sites. The residual duplication this spec addresses is the loop body itself — `runVerifiedGameWithDiagnostics` still has its own `while (true)` at `zobrist-incremental-property-helpers.ts:158`, its own kernel-options plumbing (`verifyIncrementalHash`), and its own decision-count book-keeping.
- Verified `while (true)` sites that drive `runGame`-style iteration manually (post-Spec-150): `packages/engine/test/helpers/zobrist-incremental-property-helpers.ts:158` (`runVerifiedGameWithDiagnostics`) and `campaigns/fitl-perf-optimization/diagnose-spec-143-heap.mjs:535` (heap-profiling diagnostic). Other `while (true)` sites under `packages/engine/test/helpers/` (`drive-parity-helpers.ts:117` preview-drive, `lint-policy-helpers.ts:8,23` directory-traversal) are not full simulation loops and are out of scope.

## Brainstorm Context

**Original framing.** F5 says "the simulator, web runner, and AI agents MUST all use the same action, legality, and event protocol." In practice, the kernel exposes the *primitives* (`advanceAutoresolvable`, `publishMicroturn*`, `applyPublishedDecisionFromCanonicalState`, `terminalResult`) and `runGame` composes them into a loop. Test helpers and analytics tools that need slight variations on `runGame`'s loop today reimplement it: the helper has its own `while (true)`, its own `currentChanceRng`, its own `agentRngByPlayer`, its own per-iteration termination check.

This is fine *until* the loop's protocol changes. PR #231 added two new things to the simulator's loop:
1. A bail option in kernelOptions.
2. Two catch sites that translate `LIFECYCLE_NO_PROGRESS` into `stopReason='noLegalMoves'`.

Each of those had to be ported into `runVerifiedGameWithDiagnostics`. If we forget one helper, that helper silently breaks (helper-vs-canonical tests caught one such drift). With Spec 150 simplifying the protocol to a state-field check, the change is trivial — but the same duplication problem persists for any future kernel-protocol change.

**Motivation.**
1. **F5 enforcement.** The simulator loop should be a kernel primitive consumable by helpers and probes, not a re-implementable shape.
2. **F15 maintenance cost.** Every kernel-protocol change today is N edits across N loop sites. With one primitive, it's one edit.
3. **F9 trace fidelity.** The `runGame` loop emits a fully-shaped `GameTrace`. Helpers today emit partial structures. Centralizing the loop also means helpers can opt into the trace shape they need by composing options, not by reimplementing emission.

**Prior art surveyed.**
- **`Array.prototype.reduce`** is the JavaScript-canonical example of a higher-order iteration primitive. The state machine is hidden; callers supply only what they vary (the reducer). This spec is a similar shape: callers supply only what varies (agent selection, intercept hooks, custom termination), the loop is shared.
- **TypeScript `for await...of` and async iterators** — the iterator protocol generalizes "advance one step" so consumers can layer behavior on each step without touching the loop. A `runGameSteps(def, seed, ...)` async (or sync) iterator that yields each microturn would let helpers consume only the steps they care about.
- **Pre-existing `runGame` itself** — already takes `SimulationOptions` with `decisionHook`, `traceRetention`, `snapshotDepth`, `profiler`. The hook surface is the right shape for the helper today; the helper just needs more flexibility over what counts as a step.

**Synthesis.** Refactor `runGame` so its main loop body is a separate, exported function `runGameLoop(input: RunGameInput): GameTrace` (or `runGameSteps(input)` returning an iterator). The simulator's outer wrapper provides validation, runtime forking, and result-shape enforcement. The helper consumes either the iterator or the `runGameLoop` directly with its own option set.

**Concrete API options:**

A. **Iterator-yielding primitive.** `function* runGameSteps(input): Generator<RunGameStep, GameTrace>` — each step is a `{ kind: 'auto' | 'player' | 'recovery' | 'terminal' | 'maxTurns' | 'noLegalMoves', state, ... }`. Helper consumes by iteration. Trade-off: a generator + return-value pattern is unusual but maps cleanly to "each step is a hook point."

B. **Exposed `runGameLoop` with extension hooks.** Same shape as today's `runGame` but each iteration calls a configurable `iterationCallback(step)`. The helper substitutes its own callback. Trade-off: callback model is familiar but the helper has to track its own state across calls.

C. **Inversion: runGame parameterized by an "executor."** The loop is identical, but the `applyMove` call is replaced with a configurable `applyMoveExecutor` so the helper can wrap with `verifyIncrementalHash` policy. Trade-off: most flexible, but couples the helper to internal step types.

Recommendation: **Option A (iterator)**, because:
- It composes naturally with future use cases (e.g., a debugger / time-travel UI that needs to pause between steps).
- It cleanly preserves F11 — each step yields a state; consumers cannot accidentally mutate.
- F8 is preserved — generators in V8 are deterministic given deterministic inputs.

**Alternatives explicitly considered (and rejected).**
- **Leave the helpers alone** and rely on tests catching drift. Rejected — that's exactly what produced PR #231's regression: the helper-vs-canonical test caught the drift only when one of them broke.
- **Force every helper to call `runGame` directly.** Rejected — helpers legitimately need finer control (e.g., the verify-incremental-hash helper has different traceRetention needs and emits its own diagnostic shape). Forcing them through `runGame`'s outer interface either loses flexibility or balloons `runGame`'s argument list.
- **Stick with hook-based extension only.** PR #231-style: the simulator already has `decisionHook`. We just need more hooks. Rejected — the hooks model couples extension to existing event types; the loop primitive is a more general abstraction.

**User constraints reflected.**
- F1 ✅: the primitive is engine-agnostic, generic over GameDef/state.
- F5 ✅: this is the foundation the spec honors.
- F8 ✅: deterministic; the generator's iteration order matches the current loop exactly.
- F9 ✅: trace emission still happens canonically inside the primitive.
- F11 ✅: yielded steps carry immutable state references.
- F15 ✅: addresses the duplication root cause.

## Overview

```ts
// sim/run-game-steps.ts (new)
export interface RunGameStepAuto {
  readonly kind: 'auto';
  readonly state: GameState;
  readonly autoResolvedLogs: readonly DecisionLog[];
}
export interface RunGameStepPlayer {
  readonly kind: 'player';
  readonly state: GameState;
  readonly microturn: MicroturnState;
  readonly applied: ApplyDecisionResult;     // populated AFTER the agent decides
  readonly decisionLog: DecisionLog;
}
export interface RunGameStepRecovery {
  readonly kind: 'recovery';
  readonly state: GameState;
  readonly logEntry: ProbeHoleRecoveryLog;
}
export interface RunGameStepTerminal {
  readonly kind: 'terminal' | 'maxTurns' | 'noLegalMoves';
  readonly state: GameState;
  readonly result: TerminalResult | null;
  readonly stopReason: SimulationStopReason;
}
export type RunGameStep = RunGameStepAuto | RunGameStepPlayer | RunGameStepRecovery | RunGameStepTerminal;

export function* runGameSteps(input: RunGameInput): Generator<RunGameStep, GameTrace, void> {
  // ...same loop body as today's runGame, yielding each step as it happens...
}

// sim/simulator.ts (becomes a thin wrapper)
export const runGame = (...args): GameTrace => {
  for (const _step of runGameSteps(buildInput(args))) {
    // accumulate decisions, deltas, snapshots per the same shape as today
  }
  // The generator's return value carries the GameTrace; collect it.
};
```

The helper migrates:

```ts
// test/helpers/zobrist-incremental-property-helpers.ts
export const runVerifiedGameWithDiagnostics = (def, seed, ...): RunVerifiedGameDiagnostics => {
  let decisionCount = 0;
  for (const step of runGameSteps({ def, seed, agents: ..., options: { kernel: { verifyIncrementalHash: { interval: ... } } }, ... })) {
    if (step.kind === 'auto') decisionCount += step.autoResolvedLogs.length;
    if (step.kind === 'player') decisionCount += 1;
    if (step.kind === 'terminal' || step.kind === 'maxTurns' || step.kind === 'noLegalMoves') {
      return { outcome: 'completed', decisionCount, stopReason: step.stopReason, finalStateHash: step.state.stateHash, turnsCount: step.state.turnCount };
    }
  }
  // Generators that finish without yielding a terminal step should be unreachable; treat as runtime contract violation.
  throw kernelRuntimeError('RUNTIME_CONTRACT_INVALID', 'runGameSteps generator exited without terminal step');
};
```

## What to Change

### 1. New file `sim/run-game-steps.ts`

- Export the `RunGameStep*` types.
- Export `runGameSteps(input)` generator function. Body is the existing `runGame` loop, with `yield` calls at each step.
- The function's return value (post-`for...of`) is the assembled `GameTrace`.

### 2. Refactor `sim/simulator.ts:runGame`

- Becomes a thin wrapper that consumes the generator and accumulates the per-step data into a `GameTrace`.
- `decisionLogs.push(...)` happens inside the loop body but driven by `step` rather than inline.
- Backwards-compatible signature for callers.

### 3. Migrate consumer helpers

- `packages/engine/test/helpers/zobrist-incremental-property-helpers.ts:runVerifiedGameWithDiagnostics` — consume the generator, drop its own `while (true)` body and decision-count book-keeping; pass `verifyIncrementalHash` through `runGameSteps`'s `options.kernel` field. (Bail-flag handling is already gone — Spec 150 removed it.)
- `campaigns/fitl-perf-optimization/diagnose-spec-143-heap.mjs:535` — verified custom simulation loop in a heap-profiling diagnostic. Migrate to consume `runGameSteps` while preserving its periodic snapshot/sample emissions.
- Out of scope (verified to lack custom simulation loops): `packages/engine/test/integration/agents-never-throw-microturn.test.ts` (tests `publishMicroturn` in isolation per case), `campaigns/fitl-arvn-agent-evolution/diagnose-nolegalmoves.mjs` (calls `runGame` directly), `packages/engine/test/helpers/drive-parity-helpers.ts:117` (preview-drive loop, not a full simulation loop).

### 4. Tests

- `test/integration/run-game-steps-protocol.test.ts` — verify the iterator protocol: every legal trace exits via exactly one `terminal | maxTurns | noLegalMoves` step.
- `test/determinism/run-game-steps-replay-identity.test.ts` — running the same input twice yields the exact same step sequence (using a content-equality helper).
- Existing `runGame` tests stay green unchanged.

## Out of Scope

- A web-runner integration of the iterator (the runner today uses `runGame` via its bridge; migrating it to `runGameSteps` for live debugging is a separate spec).
- An async iterator variant — current consumers are synchronous; if/when the runner needs async, it's a separate spec.
- Dropping `runGame`'s public API — F14 doesn't require it; `runGame` stays as the canonical entry point and is now implemented in terms of `runGameSteps`.

## Acceptance Criteria

### Tests That Must Pass

1. `runGame(input)` returns the same `GameTrace` for any (def, seed, agents, maxTurns) before and after the refactor — byte-identical.
2. The generator emits exactly one terminal step per run (terminal, maxTurns, or noLegalMoves).
3. Steps emitted are deterministic and replayable.
4. The helper rewrite passes `helper-vs-canonical-run-parity.test.ts` without regression.
5. Lint enforcement: after migration, the only sites in `packages/engine/test/helpers/`, `packages/engine/test/integration/`, `packages/engine/test/determinism/`, and `campaigns/` that drive `runGame`-style iteration (calls to `advanceAutoresolvable` and `publishMicroturn` inside a `while`/`for` body) MUST live in `sim/run-game-steps.ts`. Verified out-of-scope `while (true)` sites — `drive-parity-helpers.ts` (preview drive), `lint-policy-helpers.ts` (directory traversal) — remain permitted because they are not simulation loops.

### Invariants

1. The loop body lives in exactly one place (`runGameSteps`).
2. Consumers cannot diverge in their interpretation of "is the lifecycle stalled" — Spec 150's state field is the only signal anywhere.
3. F8: same (def, seed, agents, options) → same step sequence → same trace.

## Test Plan

### New/Modified Tests

- `test/integration/run-game-steps-protocol.test.ts` — new.
- `test/determinism/run-game-steps-replay-identity.test.ts` — new.
- Existing test suites stay green; the helper migration covered by `helper-vs-canonical-run-parity.test.ts`.

### Commands

1. `pnpm -F @ludoforge/engine build`.
2. `pnpm -F @ludoforge/engine test:integration:slow-parity`.
3. `pnpm -F @ludoforge/engine test:integration:fitl-events` and `fitl-rules`.
4. Determinism shards: full set.
5. `pnpm turbo lint typecheck`.

## Follow-On Tickets

Namespace: `152SIMLOOPRIM`

Anticipated decomposition (finalized by `/spec-to-tickets`):
1. Extract `runGameSteps` generator from `runGame`'s loop body into `packages/engine/src/sim/run-game-steps.ts`; export `RunGameStep*` types and `RunGameInput`.
2. Refactor `sim/simulator.ts:runGame` into a thin wrapper that consumes the generator and assembles the `GameTrace`. All existing `runGame` callers stay green byte-for-byte.
3. Migrate `runVerifiedGameWithDiagnostics` (`packages/engine/test/helpers/zobrist-incremental-property-helpers.ts`) to consume `runGameSteps`; drop its `while (true)` body and decision-count book-keeping. Verify with `test/determinism/helper-vs-canonical-run-parity.test.ts`.
4. Migrate `campaigns/fitl-perf-optimization/diagnose-spec-143-heap.mjs` to consume `runGameSteps` while preserving its periodic-sample emissions.
5. Add `test/integration/run-game-steps-protocol.test.ts` (one-terminal-step invariant) and `test/determinism/run-game-steps-replay-identity.test.ts` (replay identity).

## Tickets

Decomposed via `/spec-to-tickets` on 2026-05-02:

- [`archive/tickets/152SIMLOOPRIM-001.md`](../archive/tickets/152SIMLOOPRIM-001.md) — Extract `runGameSteps` generator and refactor `runGame` into thin wrapper (covers What to Change §1 + §2)
- [`archive/tickets/152SIMLOOPRIM-002.md`](../archive/tickets/152SIMLOOPRIM-002.md) — Migrate `runVerifiedGameWithDiagnostics` to consume `runGameSteps` (covers What to Change §3, helper)
- [`archive/tickets/152SIMLOOPRIM-003.md`](../archive/tickets/152SIMLOOPRIM-003.md) — Migrate `diagnose-spec-143-heap.mjs` to consume `runGameSteps` (covers What to Change §3, campaign script)
- [`archive/tickets/152SIMLOOPRIM-004.md`](../archive/tickets/152SIMLOOPRIM-004.md) — Add `runGameSteps` protocol and replay-identity tests (covers What to Change §4)

## Notes

This spec is intentionally last in the dependency chain. Spec 150 (so the primitive doesn't bake in the exception/flag pattern PR #231 used) and Spec 151 (so the trace shape the primitive emits is canonically serializable) have both landed; the dependency gate is cleared. It's the smallest of the three by impact and lowest priority; the F5 violation it addresses is real but not a CI blocker.

## Outcome

Completed: 2026-05-02

Landed through archived tickets `152SIMLOOPRIM-001` through `152SIMLOOPRIM-004`:

1. Extracted the canonical simulator loop into `runGameSteps`.
2. Refactored `runGame` into a thin wrapper over the shared primitive.
3. Migrated the verified diagnostics helper and heap diagnostic campaign to consume the primitive.
4. Added generator protocol and replay-identity coverage.

Deviation from original plan: implementation was split across four archived tickets instead of one monolithic change; `runGame` remained the public canonical entry point.

Verification included package build, engine test suites, focused compiled `runGameSteps` protocol and replay-identity tests, Turbo lint/typecheck, and ticket dependency integrity checks recorded in the archived ticket outcomes.
