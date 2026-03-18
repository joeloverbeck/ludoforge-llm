# 66MCTSCOMEVAFRA-009: Documentation — Competence Testing Guide + Failure Escalation Protocol

**Status**: NOT IMPLEMENTED
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None — documentation only
**Deps**: 66MCTSCOMEVAFRA-008, archive/tickets/66MCTSCOMEVAFRA/66MCTSCOMEVAFRA-008b-engineered-scenarios-s11-s15.md

## Problem

The competence evaluation framework needs a developer guide explaining: how to add new scenarios, how to add new evaluators, what the budget tiers mean, and the failure escalation protocol (Section 6.3 of the spec). Without this, future developers won't know how to respond when competence tests fail after optimization changes.

## Assumption Reassessment (2026-03-18)

1. `docs/` directory exists for technical documentation — confirmed in project structure.
2. The failure escalation protocol is defined in spec section 6.3 — confirmed.
3. The evaluator implementation pattern is defined in spec section 3.4 — confirmed.
4. Budget tier semantics are defined in spec sections 1.1 and 2.1 — confirmed.

## Architecture Check

1. Documentation only — no code changes.
2. Single doc file in `docs/` — follows existing project conventions.
3. References test file paths and evaluator names for traceability.

## What to Change

### 1. Create `docs/fitl-competence-testing-guide.md`

Sections:

1. **Overview** — purpose of competence tests, relationship to crash-freedom tests, three evaluation layers.
2. **Running competence tests** — env var, test lane, commands.
3. **Budget tiers** — `interactive` (sanity), `turn` (non-random), `background` (strategic quality). Which evaluators apply at each tier.
4. **Adding a new evaluator** — step-by-step: create factory function, write unit tests, compose into scenarios.
5. **Adding a new scenario** — step-by-step: define `CompetenceScenario`, choose evaluators, add to `COMPETENCE_SCENARIOS` array.
6. **Engineered scenarios** — when to use `engineerScenarioState`, how to define overrides.
7. **Failure escalation protocol** — from spec section 6.3:
   - Step 1: Examine MCTS diagnostics (pool exhaustion? flat visits? decision nodes?)
   - Step 2: Examine rollout quality (reaching terminal? meaningful signal?)
   - Step 3: Examine evaluation heuristic (victory-threshold-blind? range-normalized?)
   - Step 4: File targeted improvement tickets referencing failing scenarios
8. **Relationship to pool sizing** — competence bar defined first, pool optimization measured against it.
9. **Strategic knowledge sources** — links to FITL rules reports and data files.

## Files to Touch

- `docs/fitl-competence-testing-guide.md` (new)

## Out of Scope

- Code changes of any kind
- Updating CLAUDE.md (done when spec is archived)
- Updating spec 66 itself
- Creating evaluation function improvement specs

## Acceptance Criteria

### Tests That Must Pass

1. No tests — documentation only.
2. `pnpm turbo lint` — no lint errors (documentation shouldn't affect lint).

### Invariants

1. No production or test code changes.
2. All file paths referenced in the guide are accurate (verified against actual codebase).
3. Failure escalation protocol matches spec section 6.3 exactly.
4. Commands in the guide are copy-pasteable and correct.

## Test Plan

### New/Modified Tests

None — documentation only.

### Commands

1. Verify referenced file paths exist: `ls packages/engine/test/e2e/mcts-fitl/fitl-competence*.ts`
2. Verify test lane works: `RUN_MCTS_FITL_E2E=1 pnpm -F @ludoforge/engine test:e2e:mcts:fitl:competence`

## Archival Note

Archived on 2026-03-18 as part of the MCTS retirement cleanup. This work item remained unfinished and was removed from the active planning surface so the repository no longer presents MCTS as current architecture.
