# TEXHOLKERPRIGAMTOU-015: Blind Escalation from Scenario Schedule (No Hardcoded Branches)

**Status**: TODO
**Priority**: HIGH
**Effort**: Large
**Dependencies**: TEXHOLKERPRIGAMTOU-010
**Blocks**: TEXHOLKERPRIGAMTOU-006, TEXHOLKERPRIGAMTOU-009

## 1) What needs to be fixed/added

Migrate Texas blind escalation from hardcoded threshold branches to schedule-driven runtime lookup from scenario data.

Scope:
- Refactor Texas `escalate-blinds` macro to read schedule rows from scenario payload table primitives.
- Use a canonical schedule row selection rule based on `handsPlayed` / `blindLevel`.
- Remove hardcoded blind/ante values from macro logic.
- Keep all values fully data-driven in `GameSpecDoc` assets.

Constraints:
- No engine game-specific schedule logic.
- No parallel hardcoded fallback branch set.
- Deterministic selection when schedule boundaries are reached.

## 2) Invariants that should pass

1. Blind escalation values are sourced only from scenario schedule data.
2. Level transitions are deterministic and monotonic.
3. Invalid or incomplete schedule data yields explicit diagnostics.
4. Different scenarios can define different schedules with no engine changes.
5. Texas macro logic remains concise and data-driven.

## 3) Tests that should pass

1. Unit: schedule row selection boundary tests.
2. Unit: escalation updates `smallBlind`, `bigBlind`, `ante`, `blindLevel` from table data.
3. Unit: invalid schedule diagnostics (missing fields, unsorted thresholds, duplicates).
4. Integration: alternate scenario with different schedule changes runtime behavior correctly.
5. Regression: `npm run build`, `npm test`, `npm run lint`.
