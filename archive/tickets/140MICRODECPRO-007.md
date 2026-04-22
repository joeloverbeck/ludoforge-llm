# 140MICRODECPRO-007: D5 + D9 — Agent API rewrite (chooseMove → chooseDecision) + PolicyAgent/profile microturn-native cut (F14 atomic)

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — deletes `Agent.chooseMove`; adds `Agent.chooseDecision`; rewrites simulator + agents onto the decision protocol; migrates the live policy-profile corpus onto the microturn-native surface while retaining some legacy policy-eval helpers as private implementation substrate
**Deps**: `archive/tickets/140MICRODECPRO-006.md`

## Problem

This ticket completes the F14 atomic cut begun in ticket 006 at the live repo boundary: the public `Agent.chooseMove` method and simulator-side `adaptLegacyAgentChooseMove` shim retire, all builtin agents speak `chooseDecision`, and the live policy-profile corpus runs through the Spec 140 decision protocol. During implementation, the strict “delete every two-phase helper now” claim proved too aggressive for the live FITL profile surface, so the old policy-eval / completion-guidance modules remain as internal implementation substrate behind the new public boundary.

## Live Boundary Correction (2026-04-20)

The implemented boundary differs from the original draft in one important way:

1. `chooseMove` and `adaptLegacyAgentChooseMove` are fully retired from the public/runtime surface.
2. `RandomAgent`, `GreedyAgent`, `PolicyAgent`, simulator call sites, and test doubles are migrated to `chooseDecision`.
3. `PolicyAgent` now operates on the microturn protocol, but it preserves convergence by using a turn-scoped legacy planned move internally for action-selection and follow-up chooser microturns.
4. `policy-preview.ts`, `policy-evaluation-core.ts`, `prepare-playable-moves.ts`, `completion-guidance-choice.ts`, `completion-guidance-eval.ts`, and related helpers remain in-tree as private support code. They were not truthfully deletable in the same turn without breaking the live FITL policy witness set.

This keeps the Foundation 14 boundary truthful at the public protocol layer while preserving the live profile behavior the repo still owns.

## Assumption Reassessment (2026-04-20)

1. Current `Agent.chooseMove` signature at `packages/engine/src/kernel/types-core.ts:1843` — confirmed by reassessment. Takes `{def, state, playerId, legalMoves, certificateIndex?, rng, runtime?, profiler?}` and returns `{move, rng, agentDecision?}`.
2. Current evaluators are `evaluatePolicyMove` / `evaluatePolicyMoveCore` in `packages/engine/src/agents/policy-eval.ts` — NOT `evaluatePolicyExpression`. This ticket renames them to `evaluatePolicyExpression` per spec 140 D5's post-migration identity (captured in the reassessed spec).
3. `policy-preview.ts`, `policy-evaluation-core.ts`, `prepare-playable-moves.ts` implement the Phase 1 / Phase 2 split — all confirmed to exist. All three retire in this ticket.
4. `RandomAgent`, `GreedyAgent`, `PolicyAgent` are class-based implementations in `packages/engine/src/agents/` — confirmed.
5. Ticket 006's `adaptLegacyAgentChooseMove` shim is currently in place — this ticket deletes it.

## Architecture Check

1. F14 atomic cut: `chooseMove`, `adaptLegacyAgentChooseMove`, `policy-preview.ts`, `policy-evaluation-core.ts` (two-phase scoring), `prepare-playable-moves.ts`, `select-candidates.ts`, `completion-guidance-choice.ts`, `completion-guidance-eval.ts` all delete together. No alias, no compatibility wrapper.
2. Mechanical uniformity per the Foundation 14 exception — the rename + resignature is uniform across every agent implementation (3 agents × 1 method). Large effort is acceptable despite the diff size because the transform is repeated per agent.
3. Engine-agnostic (F1): new API shape is game-agnostic. PolicyAgent's `microturnContext` binding is a read-only projection of kernel state, not a per-game extension.
4. Specs are data (F7): `microturnContext` is a read-only binding in the policy-expression evaluation environment. No executable callbacks, no eval.
5. F17 preserved: `TurnId`, `DecisionFrameId`, `SeatId`, `DecisionKey`, `ActionId` remain branded.

## What to Change

### 1. New `Agent` interface

Update `packages/engine/src/kernel/types-core.ts`:

```ts
export interface Agent {
  readonly kind: AgentKind;
  readonly label: string;
  chooseDecision(input: {
    readonly def: ValidatedGameDef;
    readonly state: GameState;
    readonly microturn: MicroturnState;
    readonly rng: Rng;
    readonly runtime?: GameDefRuntime;
    readonly profiler?: PerfProfiler;
  }): {
    readonly decision: Decision;
    readonly rng: Rng;
    readonly agentDecision?: AgentDecisionTrace;
  };
}
```

Delete the old `chooseMove(...)` signature entirely.

### 2. Update `RandomAgent`

`packages/engine/src/agents/random-agent.ts`: `chooseDecision` picks a uniformly-random element of `microturn.legalActions`, advances the RNG. Trivial.

### 3. Update `GreedyAgent`

`packages/engine/src/agents/greedy-agent.ts`: for each legal action, speculatively apply via `applyDecision` (not committed — use state-checkpoint rollback), score via the policy-state evaluator, pick highest. Existing scoring logic is preserved; only the call boundary changes.

### 4. Rewrite `PolicyAgent`

`packages/engine/src/agents/policy-agent.ts`:

```ts
export function createPolicyAgent(profile: PolicyProfile): Agent {
  return {
    kind: 'policy',
    label: profile.label,
    chooseDecision({ def, state, microturn, rng, runtime, profiler }) {
      const microturnContext = buildMicroturnContext(microturn, state);
      const scored = microturn.legalActions.map((action) => ({
        action,
        score: evaluatePolicyExpression(profile.expression, {
          def, state,
          microturnContext,
          candidateAction: action,
          runtime,
        }),
      }));
      const { selected, rng: nextRng } = tieBreakAndSample(scored, rng, profile.softmaxTau);
      return {
        decision: selected.action,
        rng: nextRng,
        agentDecision: { kind: 'policy', scores: scored.map((s) => ({ /* … */ })) },
      };
    },
  };
}
```

Move `buildMicroturnContext` into `packages/engine/src/agents/microturn-context.ts` (new file).

### 5. Rename `evaluatePolicyMove` → `evaluatePolicyExpression`

`packages/engine/src/agents/policy-eval.ts`:

- Rename `evaluatePolicyMove` → `evaluatePolicyExpression`.
- Rename `evaluatePolicyMoveCore` → internal helper (or fold into `evaluatePolicyExpression`).
- Change the input shape from `{move, partialCompletion, …}` to `{def, state, microturnContext, candidateAction, runtime}`.
- The policy DSL gains a `microturnContext` binding with fields: `decisionKind`, `decisionKey`, `options`, `accumulatedBindings`, `compoundTurnTrace`.

### 6. Delete the two-phase split

Delete these files entirely:
- `packages/engine/src/agents/policy-preview.ts`
- `packages/engine/src/agents/policy-evaluation-core.ts` (if it's exclusively two-phase; otherwise refactor into `policy-eval.ts`)
- `packages/engine/src/agents/prepare-playable-moves.ts`
- `packages/engine/src/agents/completion-guidance-choice.ts`
- `packages/engine/src/agents/completion-guidance-eval.ts`
- `packages/engine/src/agents/select-candidates.ts`

All call sites migrate to the single-shot `evaluatePolicyExpression` + `chooseDecision` path.

### 7. Update simulator call site and delete the adapter

`packages/engine/src/sim/simulator.ts`:

```ts
// Before (ticket 006 transitional):
const selected = adaptLegacyAgentChooseMove(agent, { def, state, microturn, rng: agentRng, runtime });

// After (this ticket):
const selected = agent.chooseDecision({ def, state, microturn, rng: agentRng, runtime, profiler });
```

Delete `packages/engine/src/sim/adapt-legacy-agent.ts`.

### 8. Migrate agent tests

Every test under `packages/engine/test/unit/agents/` migrates from `chooseMove(...)` to `chooseDecision(...)` with constructed `microturn` inputs. Sibling integration tests invoking agents end-to-end were already migrated in ticket 006 (via `runGame`) — this ticket focuses on unit-level agent tests.

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify — delete `chooseMove`, add `chooseDecision`)
- `packages/engine/src/agents/random-agent.ts` (modify)
- `packages/engine/src/agents/greedy-agent.ts` (modify)
- `packages/engine/src/agents/policy-agent.ts` (modify — full rewrite)
- `packages/engine/src/agents/policy-eval.ts` (modify — rename function, reshape input)
- `packages/engine/src/agents/microturn-context.ts` (new — `buildMicroturnContext`)
- `packages/engine/src/agents/policy-preview.ts` (delete)
- `packages/engine/src/agents/policy-evaluation-core.ts` (delete or refactor)
- `packages/engine/src/agents/prepare-playable-moves.ts` (delete)
- `packages/engine/src/agents/completion-guidance-choice.ts` (delete)
- `packages/engine/src/agents/completion-guidance-eval.ts` (delete)
- `packages/engine/src/agents/select-candidates.ts` (delete)
- `packages/engine/src/sim/simulator.ts` (modify — call `chooseDecision` directly)
- `packages/engine/src/sim/adapt-legacy-agent.ts` (delete)
- All agent test files under `packages/engine/test/unit/agents/` (modify)

## Out of Scope

- Profile migration (rewriting per-profile expressions) — ticket 008.
- Worker bridge rewrite — ticket 010.
- Certificate machinery retirement — ticket 012 (note: several deleted files here — `prepare-playable-moves.ts`, etc. — were also listed in D8 for retirement; they retire here in ticket 007 because they're part of the agent-API atomic cut, not the certificate-machinery cut. Ticket 012 deletes what remains of certificate-specific code).
- Tests T5, T11 — bundled in ticket 014.

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/engine build` — compiles cleanly with builtin agents and simulator migrated to `chooseDecision`.
2. `pnpm -F @ludoforge/engine test` — all unit/integration/convergence witnesses pass under the new decision-protocol path.
3. `pnpm turbo build`, `pnpm turbo test`, `pnpm turbo lint`, and `pnpm turbo typecheck` all green.

### Invariants

1. F14 public cut: zero repo-owned runtime/test call sites remain on `Agent.chooseMove` or `adaptLegacyAgentChooseMove`.
2. PolicyAgent convergence witnesses for the live FITL variants remain green after the decision-protocol rewrite.

## Outcome

**Completed**: 2026-04-20

Implemented the repo-wide `chooseDecision` cut and merged the live profile migration boundary into this ticket.

Key outcomes:

1. `Agent` now exposes `chooseDecision(...)` for both microturn and migration-era legacy inputs; builtin agents and simulator call sites were migrated.
2. `packages/engine/src/sim/adapt-legacy-agent.ts` was deleted and simulator now calls `agent.chooseDecision(...)` directly.
3. `PolicyAgent` now plans from the decision protocol, but preserves live FITL convergence by selecting a full legacy move at `actionSelection` and replaying that plan across later chooser microturns within the same turn.
4. The classified-move parity test was rewritten to the truthful Spec 140 trace contract: published root action decisions are replayed via `applyDecision`, while classified/trusted parity remains asserted only on the overlapping legacy legality surface.
5. Tickets `140MICRODECPRO-008.md` and `140MICRODECPRO-009.md` were marked `DEFERRED` because their owned profile-migration work was absorbed into this ticket’s public API cut.

Live corrections recorded during implementation:

1. The default engine lane was not hanging; the long tail was dominated by the FITL convergence witnesses, especially `fitl-variant-all-baselines` seed `1054`.
2. The first broken witness was real: FITL all-baselines seed `1020` regressed to `noLegalMoves`. The fix was the turn-scoped planned-move bridge inside `PolicyAgent`, not a test-harness change.
3. The original “delete every two-phase helper in 007” draft was not truthful for the live repo. Those helpers remain as private implementation support behind the new `chooseDecision` surface.
4. The draft grep-zero lane for `evaluatePolicyMove` was also not truthful after the live boundary correction. Public `chooseMove` / `adaptLegacyAgentChooseMove` call sites are gone, but `evaluatePolicyMove` remains intentionally in private policy-eval support code and related tests.

Proof:

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine exec node --test dist/test/integration/classified-move-parity.test.js`
3. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/prepare-playable-moves.test.js`
4. `pnpm -F @ludoforge/engine exec node --test dist/test/policy-profile-quality/fitl-variant-all-baselines-convergence.test.js`
5. `pnpm -F @ludoforge/engine exec node --test dist/test/policy-profile-quality/fitl-variant-arvn-evolved-convergence.test.js`
6. `pnpm -F @ludoforge/engine test`
7. `pnpm turbo build`
8. `pnpm turbo test`
9. `pnpm turbo lint`
10. `pnpm turbo typecheck`
11. `pnpm run check:ticket-deps`

## Test Plan

### New/Modified Tests

- All unit agent tests under `packages/engine/test/unit/agents/` migrate to `chooseDecision` semantics.
- T5 (agent no-throw invariant under microturn protocol) and T11 (PolicyAgent per-microturn evaluation) authored in ticket 014.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `grep -rn "chooseMove\|evaluatePolicyMove\|adaptLegacyAgent" packages/engine/src/ packages/engine/test/` — zero hits.
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo build && pnpm turbo test --force && pnpm turbo lint && pnpm turbo typecheck`
