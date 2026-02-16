# TEXHOLKERPRIGAMTOU-015: Blind Escalation from Scenario Schedule (No Hardcoded Branches)

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Dependencies**: TEXHOLKERPRIGAMTOU-010
**Blocks**: TEXHOLKERPRIGAMTOU-006, TEXHOLKERPRIGAMTOU-009

## 0) Reassessed assumptions (current code/test reality)

What already exists in the codebase:
- Generic runtime table primitives are already implemented and covered (`assetRows`, `assetField`, runtime table contracts/index, compile/validate/eval tests).
- Texas scenario data already embeds blind schedule rows in `data/games/texas-holdem/40-content-data-assets.md` under `payload.settings.blindSchedule`.
- Runtime table contracts are auto-derived from scenario payload arrays, so no engine-side Texas-specific table plumbing is required.

What is still incorrect today:
- `data/games/texas-holdem/20-macros.md` macro `escalate-blinds` is still hardcoded with threshold branches and fixed blind values.

Discrepancies from original ticket assumptions:
- Original text implied missing table primitives and used `blindSchedule.levels`; actual production Texas payload path is `settings.blindSchedule`.
- Original scope included generic diagnostics for unsorted/duplicate schedule rows. There is currently no generic table-constraint DSL for sorted/unique semantics; this ticket should not add Texas-specific engine validators.

## 1) Updated scope

Migrate Texas blind escalation from hardcoded branch logic to schedule-driven lookup in the Texas GameSpecDoc macro.

Scope:
- Refactor Texas `escalate-blinds` macro to query schedule rows from table id `tournament-standard::settings.blindSchedule`.
- Derive next-level transition threshold from schedule data (`handsUntilNext`) instead of hardcoded hand-count constants.
- Update `smallBlind`, `bigBlind`, `ante`, and `blindLevel` from the selected schedule row fields (`sb`, `bb`, `ante`, `level`).
- Remove hardcoded blind/ante values and hardcoded threshold branches from the macro.

Out of scope:
- Any Texas-specific kernel/compiler branch.
- New engine-level schema contracts for row ordering/uniqueness.

## 2) Invariants that should pass

1. Blind escalation values are sourced from scenario schedule table rows only.
2. Transition threshold is derived from schedule data (`handsUntilNext`), not constants.
3. Escalation remains deterministic.
4. Alternate scenarios can change schedule rows without engine changes.
5. Macro logic remains data-driven and free of hardcoded blind/ante literals.

## 3) Tests that should pass

1. Unit (Texas spec structure): `escalate-blinds` contains table-query driven logic and no hardcoded blind escalation branch literals.
2. Unit (macro runtime behavior): executing `escalate-blinds` effects updates `smallBlind`, `bigBlind`, `ante`, `blindLevel` from schedule row data at boundary conditions.
3. Regression: Texas runtime bootstrap integration still passes.
4. Regression: `npm run build`, `npm run lint`, and relevant test suite(s) pass.

## Outcome

- Completion date: 2026-02-16
- Actually changed:
  - Replaced hardcoded `escalate-blinds` branch chain in `data/games/texas-holdem/20-macros.md` with schedule-driven table lookups from `tournament-standard::settings.blindSchedule`.
  - Added Texas coverage in `test/unit/texas-holdem-spec-structure.test.ts` to assert schedule-driven escalation shape and removal of hardcoded blind constants.
  - Added runtime boundary tests in `test/unit/texas-blind-escalation.test.ts` validating threshold behavior and blind/ante updates from schedule rows.
  - Added binder-hygiene fix for `assetField.row` rewrites in `src/cnl/binder-surface-registry.ts` plus regression test in `test/unit/binder-surface-registry.test.ts` (required to make macro expansion + binding scope validation work correctly with schedule-row binders).
- Deviations from original plan:
  - Included a generic compiler hygiene fix (`assetField.row` rewrite support) that was not explicitly listed in the ticket but was required for the schedule-driven macro architecture to compile correctly under macro expansion.
- Verification results:
  - `npm test` passed.
  - `npm run lint` passed.
