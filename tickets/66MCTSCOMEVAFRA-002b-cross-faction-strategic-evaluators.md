# 66MCTSCOMEVAFRA-002b: Cross-Faction Strategic Evaluators

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — test infrastructure only
**Deps**: 66MCTSCOMEVAFRA-001

## Problem

Three evaluators apply to all factions, not just one. They encode cross-faction strategic principles: resource discipline, monsoon awareness, and strategic pass value. These are factored out of faction-specific tickets to avoid duplication.

## Assumption Reassessment (2026-03-18)

1. NVA/VC resources are per-player vars accessible via `state.perPlayerVars` or `state.globalVars` — need to verify exact location during implementation. FITL uses `globalVars` for faction resources (e.g., `nvaResources`, `vcResources`, `usResources`, `arvnResources`).
2. Monsoon is determined by the current card being the last before a Coup card — can be detected via `state.globalVars.monsoon` or by checking the deck/lookahead for a coup card.
3. `pass` actionId exists — confirmed in `TURN_1_MOVES` where NVA passes with `actionId: asActionId('pass')`.

## Architecture Check

1. Cross-faction evaluators avoid duplicating resource/monsoon checks in each faction ticket.
2. All evaluators are pure functions of `CompetenceEvalContext`.
3. Strategic knowledge comes from FITL rules Sections 5-8, encoded in test code only.

## What to Change

### 1. `resourceDiscipline` evaluator

- `minBudget`: `'turn'`
- Logic: When faction resources = 0, the agent should `pass` (not waste resources on low-value ops). NVA/VC pass at 0; ARVN passes if Available < 12 pieces. Skips evaluation if resources > 0.
- Returns fail if the agent chose a resource-spending operation at 0 resources.

### 2. `monsoonAwareness` evaluator

- `minBudget`: `'background'`
- Logic: During monsoon turn (last card before Coup), no Sweep, no March, no Pivotal Event. These are hard constraints from the rules.
- Skips evaluation if not a monsoon turn.
- Returns fail if the agent chose Sweep, March, or a Pivotal Event during monsoon.

### 3. `passStrategicValue` evaluator

- `minBudget`: `'background'`
- Logic: When the agent passes, it should gain resources AND the upcoming card should be weak/irrelevant to the faction. Detects pointless passing vs. strategic passing.
- Skips evaluation if the move was not `pass`.
- Returns fail if the agent passed when a strong card was upcoming and resources were adequate.

### 4. Unit tests for all three evaluators

| Test | Evaluator | Description |
|------|-----------|-------------|
| resource-discipline-pass-at-zero | `resourceDiscipline` | Agent passes at 0 resources → pass |
| resource-discipline-op-at-zero | `resourceDiscipline` | Agent rallies at 0 resources → fail |
| resource-discipline-skip-nonzero | `resourceDiscipline` | Resources > 0 → skip (pass) |
| monsoon-sweep-blocked | `monsoonAwareness` | Sweep during monsoon → fail |
| monsoon-rally-allowed | `monsoonAwareness` | Rally during monsoon → pass |
| monsoon-skip-non-monsoon | `monsoonAwareness` | Not monsoon turn → skip (pass) |
| pass-strategic-good | `passStrategicValue` | Pass when low resources + weak upcoming card → pass |
| pass-strategic-bad | `passStrategicValue` | Pass when high resources + strong upcoming card → fail |
| pass-skip-non-pass | `passStrategicValue` | Move is not pass → skip (pass) |

## Files to Touch

- `packages/engine/test/e2e/mcts-fitl/fitl-competence-evaluators.ts` (modify — add 3 evaluators)
- `packages/engine/test/unit/e2e-helpers/fitl-competence-evaluators.test.ts` (modify — add 9 tests)

## Out of Scope

- Faction-specific evaluators (tickets 004–007)
- Scenario composition (tickets 008, 008b)
- Production code changes
- Monsoon detection in production engine — evaluator reads state, does not implement rules

## Acceptance Criteria

### Tests That Must Pass

1. All 9 unit tests listed above pass.
2. `pnpm turbo typecheck` — no type errors.
3. `pnpm turbo lint` — no lint errors.
4. `pnpm -F @ludoforge/engine test` — all existing tests still pass.

### Invariants

1. No production source code changes.
2. Each evaluator is a pure function of `CompetenceEvalContext`.
3. Evaluators skip gracefully (return pass with skip explanation) when the move type or game state doesn't match their domain.
4. Budget gating: `resourceDiscipline` at `'turn'`, others at `'background'`.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/e2e-helpers/fitl-competence-evaluators.test.ts` — 9 new test cases

### Commands

1. `pnpm turbo build && node --test dist/test/unit/e2e-helpers/fitl-competence-evaluators.test.js`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`
