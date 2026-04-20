# 140MICRODECPRO-007: D5 — Agent API rewrite (chooseMove → chooseDecision) + PolicyAgent microturn-native (F14 atomic)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — deletes `Agent.chooseMove`; adds `Agent.chooseDecision`; rewrites PolicyAgent; retires two-phase split
**Deps**: `archive/tickets/140MICRODECPRO-006.md`

## Problem

This ticket completes the F14 atomic cut begun in ticket 006. The `Agent.chooseMove` method, `adaptLegacyAgentChooseMove` shim, and the Phase 1 / Phase 2 PolicyAgent split all retire in the same change. PolicyAgent is rewritten to score at every microturn frontier — the primary capability gain of the spec.

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

1. `pnpm -F @ludoforge/engine build` — compiles cleanly with zero `chooseMove` references, zero references to deleted files.
2. `pnpm -F @ludoforge/engine test` — all unit agent tests pass under the new `chooseDecision` path.
3. Integration tests (already migrated in ticket 006) continue to pass.
4. `pnpm turbo build && pnpm turbo test --force && pnpm turbo lint && pnpm turbo typecheck` all green.

### Invariants

1. F14 atomic: zero references to `chooseMove`, `adaptLegacyAgentChooseMove`, `evaluatePolicyMove`, `evaluatePolicyMoveCore`, `preparePlayableMoves`, `policy-preview`, `select-candidates`, `completion-guidance-choice`, `completion-guidance-eval` in source or tests after this ticket.
2. F8 determinism: PolicyAgent scoring of the action-selection microturn produces bit-identical `AgentDecisionTrace` output compared to ticket 008's migrated profiles (test T12 verifies this after ticket 008 lands).

## Test Plan

### New/Modified Tests

- All unit agent tests under `packages/engine/test/unit/agents/` migrate to `chooseDecision` semantics.
- T5 (agent no-throw invariant under microturn protocol) and T11 (PolicyAgent per-microturn evaluation) authored in ticket 014.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `grep -rn "chooseMove\|evaluatePolicyMove\|adaptLegacyAgent" packages/engine/src/ packages/engine/test/` — zero hits.
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo build && pnpm turbo test --force && pnpm turbo lint && pnpm turbo typecheck`
