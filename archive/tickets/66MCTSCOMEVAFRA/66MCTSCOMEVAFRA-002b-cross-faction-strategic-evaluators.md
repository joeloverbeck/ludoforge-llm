# 66MCTSCOMEVAFRA-002b: Cross-Faction Strategic Evaluators

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — test infrastructure only
**Deps**: 66MCTSCOMEVAFRA-001

## Problem

Three evaluators cut across faction tickets: resource discipline, monsoon awareness, and strategic pass value. They should live in one place so later scenario composition can reuse shared policy instead of duplicating state-inspection logic across VC/NVA/US/ARVN tickets.

## Assumption Reassessment (2026-03-18)

1. FITL faction resources are stored in `state.globalVars`, not in `state.perPlayerVars`. Production compilation already asserts pass rewards against `arvnResources`, `nvaResources`, and `vcResources`; there is no separate `usResources` pass reward in the current turn-flow config.
2. Monsoon is not represented by a dedicated gameplay var in this test harness. The engine derives the monsoon legality window from card-driven turn flow when the `lookahead` card is a Coup card.
3. The current production turn-flow config already owns monsoon restrictions and pivotal blocking. A competence evaluator must derive from that canonical config instead of hardcoding `march` / `sweep` / `pivotalEvent` lists in test code.
4. `pass` is a first-class action and FITL production data already defines faction-specific pass rewards through `turnFlow.passRewards`.
5. The focused evaluator test file already exists at `packages/engine/test/e2e/mcts-fitl/fitl-competence-evaluators.test.ts`. The older `packages/engine/test/unit/e2e-helpers/...` path referenced by this and neighboring tickets does not exist in the current worktree.

## Architecture Check

1. Cross-faction helpers are still the right shape, but they should centralize reusable state readers first: faction-resource lookup, pass-reward lookup, lookahead-card inspection, and monsoon-window detection.
2. `resourceDiscipline` is worth adding if it evaluates resource starvation through generic move metadata (`actionClass`, `freeOperation`, pass rewards) rather than brittle faction-specific branches.
3. `monsoonAwareness` is only worth adding if it derives the restricted action set from `def.turnOrder.config.turnFlow`. A hardcoded evaluator would just duplicate engine legality in a second, drift-prone place.
4. `passStrategicValue` should not hardcode FITL card opinions inside the evaluator. The clean architecture is a small shared evaluator factory with configurable card-strength/relevance input supplied by the scenario that uses it.
5. All evaluators remain pure functions of `CompetenceEvalContext`; FITL-specific knowledge stays under `packages/engine/test/`.

## What to Change

### 1. Add shared cross-faction inspection helpers in `fitl-competence-evaluators.ts`

Add private helpers that later tickets can reuse without copying logic:

- faction resource-var lookup from `playerId`
- pass-reward lookup from card-driven turn flow
- lookahead-card / Coup detection from the current game state
- monsoon-restricted action lookup from the compiled turn-flow config

These helpers must read canonical engine/test surfaces and avoid FITL-only aliases or duplicated action lists.

### 2. `resourceDiscipline` evaluator

- `minBudget`: `'turn'`
- Logic:
  - If the acting faction has resources above `0`, skip.
  - If the move is `pass`, pass.
  - If the move is marked `freeOperation`, skip/pass because the evaluator is about paid resource discipline, not free grants.
  - If the move is a resource-pressuring action class (`operation`, `operationPlusSpecialActivity`, `limitedOperation`) while the faction is at `0` resources and could gain resources by passing, fail.
  - Otherwise skip/pass with an explanation that the move was outside this evaluator's domain (for example pure event handling).
- Scope correction: drop the earlier ARVN-specific `Available < 12 pieces` branch from this ticket. That is a faction-policy heuristic and belongs in the ARVN strategic ticket, not in a shared evaluator.

### 3. `monsoonAwareness` evaluator

- `minBudget`: `'background'`
- Logic:
  - Detect monsoon from the state/lookahead card.
  - If not monsoon, skip.
  - Read restricted actions from the compiled turn-flow config rather than a hardcoded list.
  - Fail only if the chosen move action id is restricted by the current monsoon config.
- Scope correction: this evaluator is a config-derived safety assertion, not a replacement for legality tests. It exists to keep competence scenarios aligned with the canonical turn-flow contract.

### 4. `passStrategicValue` evaluator factory

Replace the original zero-argument proposal with a configurable factory:

```typescript
passStrategicValue(options: {
  readonly minAdequateResources: number;
  readonly isUpcomingCardStrong: (ctx: CompetenceEvalContext) => boolean;
}): CompetenceEvaluator
```

- `minBudget`: `'background'`
- Logic:
  - Skip if the move is not `pass`.
  - Read the faction's current resources and pass reward.
  - Pass when the faction is resource-starved or when the upcoming card is not strategically strong for that scenario.
  - Fail when the faction passed despite adequate resources and a strong upcoming card.
- Architecture reason: card relevance is scenario knowledge, not shared evaluator knowledge. Parameterizing it keeps the cross-faction layer generic and extensible.

### 5. Focused evaluator tests for all three evaluators

| Test | Evaluator | Description |
|------|-----------|-------------|
| resource-discipline-pass-at-zero | `resourceDiscipline` | Zero resources + `pass` + pass reward available → pass |
| resource-discipline-paid-op-at-zero | `resourceDiscipline` | Zero resources + paid operation class → fail |
| resource-discipline-free-op-at-zero | `resourceDiscipline` | Zero resources + `freeOperation` move → skip/pass |
| resource-discipline-skip-nonzero | `resourceDiscipline` | Resources > 0 → skip/pass |
| monsoon-config-restricted-action-fails | `monsoonAwareness` | Lookahead Coup + restricted action id from config → fail |
| monsoon-safe-action-passes | `monsoonAwareness` | Lookahead Coup + unrestricted action id → pass |
| monsoon-skip-non-monsoon | `monsoonAwareness` | No Coup in lookahead → skip/pass |
| pass-strategic-good-low-resources | `passStrategicValue` | Pass when resources are below adequacy threshold → pass |
| pass-strategic-good-weak-card | `passStrategicValue` | Pass when upcoming card predicate says weak → pass |
| pass-strategic-bad | `passStrategicValue` | Pass when resources are adequate and upcoming card is strong → fail |
| pass-skip-non-pass | `passStrategicValue` | Move is not `pass` → skip/pass |

## Files to Touch

- `packages/engine/test/e2e/mcts-fitl/fitl-competence-evaluators.ts` (modify — add 3 evaluators)
- `packages/engine/test/e2e/mcts-fitl/fitl-competence-evaluators.test.ts` (modify — add focused evaluator tests)

## Out of Scope

- Faction-specific evaluators (tickets 004–007)
- Scenario composition (tickets 008, 008b)
- Production code changes
- Re-encoding card-specific strength heuristics into the shared evaluator layer
- Re-implementing engine legality inside test helpers

## Acceptance Criteria

### Tests That Must Pass

1. The new focused evaluator tests listed above pass.
2. `pnpm turbo typecheck` — no type errors.
3. `pnpm turbo lint` — no lint errors.
4. `pnpm -F @ludoforge/engine test` — all existing tests still pass.

### Invariants

1. No production source code changes.
2. Each evaluator is a pure function of `CompetenceEvalContext`.
3. Evaluators skip gracefully (return pass with skip explanation) when the move type or game state doesn't match their domain.
4. `monsoonAwareness` derives restricted actions from the compiled turn-flow config instead of hardcoded ids.
5. `passStrategicValue` stays configurable; scenario-specific card relevance is supplied by callers, not embedded in the shared evaluator module.
6. Budget gating: `resourceDiscipline` at `'turn'`, others at `'background'`.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/e2e/mcts-fitl/fitl-competence-evaluators.test.ts` — add focused tests for resource starvation, monsoon config derivation, and configurable pass-value behavior

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/e2e/mcts-fitl/fitl-competence-evaluators.test.js`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`

## Outcome

- Completion date: 2026-03-18
- What actually changed:
  - Added shared cross-faction evaluator plumbing in `packages/engine/test/e2e/mcts-fitl/fitl-competence-evaluators.ts` for pass-reward lookup, resource lookup, lookahead Coup detection, and monsoon restriction derivation from canonical turn-flow config.
  - Implemented `resourceDiscipline()` as a paid-action starvation evaluator keyed off action class, `freeOperation`, and pass rewards instead of hardcoded faction-specific branches.
  - Implemented `monsoonAwareness()` as a config-derived monsoon restriction guard that reads the compiled turn-flow contract rather than duplicating fixed action ids in test code.
  - Implemented `passStrategicValue()` as a configurable evaluator factory so scenario-specific card-strength knowledge stays outside the shared evaluator layer.
  - Expanded `packages/engine/test/e2e/mcts-fitl/fitl-competence-evaluators.test.ts` with focused coverage for zero-resource passing, paid-action failure, free-operation skip handling, monsoon restriction derivation, and strategic/non-strategic pass behavior.
- Deviations from original plan:
  - Replaced the original zero-argument `passStrategicValue` proposal with a factory that accepts `minAdequateResources` and `isUpcomingCardStrong`.
  - Dropped the ARVN-specific `Available < 12 pieces` rule from this shared ticket because it is a faction-policy heuristic better owned by the ARVN evaluator ticket.
  - Kept `monsoonAwareness`, but narrowed it to config-alignment rather than a second hardcoded legality system.
  - Corrected the ticket’s stale test-path assumptions to the actual `packages/engine/test/e2e/mcts-fitl/` layout.
- Verification results:
  - `pnpm turbo build` passed.
  - `node --test packages/engine/dist/test/e2e/mcts-fitl/fitl-competence-evaluators.test.js` passed.
  - `pnpm turbo typecheck` passed.
  - `pnpm turbo lint` passed.
  - `pnpm -F @ludoforge/engine test` passed (`# pass 438`, `# fail 0`).
