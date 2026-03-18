# 66MCTSCOMEVAFRA-004: VC Strategic Evaluators (Layer 3)

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Large
**Engine Changes**: None — test infrastructure only
**Deps**: 66MCTSCOMEVAFRA-001

## Problem

The VC faction needs 7 strategic evaluators encoding principles from FITL Rules Section 8.5 and the factions guide. These evaluators check whether the MCTS agent follows sound VC strategy: rallying at bases, terrorizing high-population support spaces, expanding bases where guerrillas mass, growing opposition, managing resources via tax, subverting ARVN, and taxing efficiently.

## Assumption Reassessment (2026-03-18)

1. VC bases are tokens of type `'vc-bases'` — need to verify exact token type in FITL GameDef during implementation.
2. VC guerrillas are `'vc-guerrillas'` (underground state tracked via token props) — need to verify.
3. Support/opposition markers are in `state.markers[zoneId].supportOpposition` — confirmed in `fitl-mcts-test-helpers.ts:146`.
4. Population is a zone property (`zone.population` or `zone.props.population`) — need to verify exact path.
5. VC resources are in `state.globalVars.vcResources` — need to verify exact var name.
6. LoC econ values are zone properties — need to verify.

## Architecture Check

1. All evaluators are pure functions of `CompetenceEvalContext` — compare `stateBefore` vs `stateAfter`.
2. Each evaluator self-skips if the move type doesn't match (e.g., `vcRallyQuality` skips if move isn't `rally`).
3. Strategic knowledge is from FITL rules 8.5, encoded in test code only — no production changes.
4. All evaluators have `minBudget: 'background'` — they require enough search budget to be meaningful.

## What to Change

### 1. `vcRallyQuality` — "Rally in spaces with VC bases where <4 underground guerrillas" (8.5.2)

- Skips if move is not `rally`.
- Checks: after rally, guerrillas were placed in base provinces (not random empty spaces).
- Compares zone token counts before/after for VC guerrillas in zones with VC bases.

### 2. `vcTerrorTarget` — "Terror in highest-population spaces with Active/Passive Support" (8.5.1)

- Skips if move is not `terror`.
- Checks: targeted spaces had Support marker and high population.
- Compares markers before/after to identify terror targets.

### 3. `vcBaseExpansion` — "Place bases wherever 4+ VC guerrillas" (8.5.2)

- Skips if move is not `rally`.
- Checks: if any zone had 4+ VC guerrillas before the move, a base should have been placed.
- Compares VC base counts before/after.

### 4. `vcOppositionGrowth` — "VC victory = opposition + bases"

- Always evaluates (not move-type-gated).
- Checks: opposition total increased or maintained.
- Uses `computeVcVictory` to compare before/after.

### 5. `vcResourceManagement` — "Tax when 0 resources, don't tax at >9 unless on LoCs" (8.5.1)

- Checks resource state before and action taken.
- Fail if resources dropped to 0 without a tax action following.
- Fail if resources >9 and a costly operation was chosen when tax was available.

### 6. `vcSubvertTargeting` — "Subvert removes ARVN cubes or replaces with VC guerrilla" (8.5)

- Skips if move is not `subvert`.
- Checks: subvert targeted spaces where VC has underground guerrillas co-located with ARVN cubes.
- Prefers spaces with only 1 ARVN cube (flip) or max COIN control removal.

### 7. `vcTaxEfficiency` — "Tax priority: 2-Econ LoCs > 1-Econ LoCs > Active Support spaces" (8.5.1)

- Skips if move is not `tax`.
- Checks: tax targets prioritized 2-Econ LoCs first, then 1-Econ, then Active Support.
- Validates resource generation isn't random.

### 8. Unit tests — synthetic state deltas

| Test | Evaluator | Description |
|------|-----------|-------------|
| rally-at-base-pass | `vcRallyQuality` | Guerrillas placed at base zone → pass |
| rally-at-empty-fail | `vcRallyQuality` | Guerrillas placed in zone without base → fail |
| rally-skip-non-rally | `vcRallyQuality` | Move is `terror` → skip |
| terror-high-pop-support | `vcTerrorTarget` | Terror in 2-pop Active Support space → pass |
| terror-low-pop-neutral | `vcTerrorTarget` | Terror in 0-pop Neutral space → fail |
| base-expansion-trigger | `vcBaseExpansion` | 4+ guerrillas, base placed → pass |
| base-expansion-miss | `vcBaseExpansion` | 4+ guerrillas, no base placed → fail |
| opposition-maintained | `vcOppositionGrowth` | VC victory score ≥ before → pass |
| opposition-dropped | `vcOppositionGrowth` | VC victory score < before → fail |
| resource-zero-tax | `vcResourceManagement` | 0 resources, chose tax → pass |
| resource-zero-rally | `vcResourceManagement` | 0 resources, chose rally → fail |
| subvert-arvn-cubes | `vcSubvertTargeting` | Subvert at space with ARVN cubes + underground VC → pass |
| tax-2econ-first | `vcTaxEfficiency` | Tax targeted 2-Econ LoC → pass |
| tax-random-order | `vcTaxEfficiency` | Tax skipped 2-Econ LoC for low-value space → fail |

## Files to Touch

- `packages/engine/test/e2e/mcts-fitl/fitl-competence-evaluators.ts` (modify — add 7 evaluators)
- `packages/engine/test/unit/e2e-helpers/fitl-competence-evaluators.test.ts` (modify — add 14 tests)

## Out of Scope

- NVA, US, ARVN evaluators (tickets 005–007)
- Non-player AI flowchart implementation (Spec 30) — these evaluate MCTS, not the NP bot
- Production code changes
- Evaluation function / heuristic improvements
- Scenario composition (tickets 008, 008b)

## Acceptance Criteria

### Tests That Must Pass

1. All 14 unit tests listed above pass.
2. `pnpm turbo typecheck` — no type errors.
3. `pnpm turbo lint` — no lint errors.
4. `pnpm -F @ludoforge/engine test` — all existing tests still pass.

### Invariants

1. No production source code changes.
2. All evaluators are pure functions of `CompetenceEvalContext`.
3. All evaluators skip gracefully when move type doesn't match.
4. All evaluators have `minBudget: 'background'` (except `vcOppositionGrowth` which may use `'turn'` since it's not move-type-gated).
5. Strategic knowledge sourced from FITL Rules 8.5 — document section references in code comments.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/e2e-helpers/fitl-competence-evaluators.test.ts` — 14 new test cases

### Commands

1. `pnpm turbo build && node --test dist/test/unit/e2e-helpers/fitl-competence-evaluators.test.js`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`
