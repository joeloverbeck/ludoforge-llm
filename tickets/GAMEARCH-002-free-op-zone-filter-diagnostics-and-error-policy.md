# GAMEARCH-002: Free-Op Zone Filter Diagnostics and Error Policy

**Status**: TODO
**Priority**: P1
**Complexity**: S
**Parent spec**: specs/29-fitl-event-card-encoding.md (engine/runtime alignment follow-up)
**Depends on**: GAMEARCH-001

## Description

Zone-filter evaluation currently swallows runtime errors and returns `false`, hiding malformed specs and making failures non-diagnostic.

### What Must Change

1. Remove silent `catch { return false; }` behavior from free-op filter evaluation paths.
2. Route filter evaluation errors through typed engine diagnostics/errors with actionable metadata.
3. Ensure deterministic failure semantics across `legalMoves`, `legalChoices`, and `applyMove`.

## Files to Touch

- `src/kernel/turn-flow-eligibility.ts`
- `src/kernel/eval-error.ts` (or equivalent typed error utilities)
- `src/kernel/legal-choices.ts` and/or `src/kernel/move-decision-sequence.ts` (as needed)
- `test/unit/kernel/legal-choices.test.ts`
- `test/unit/kernel/move-decision-sequence.test.ts`

## Out of Scope

- New grant schema fields.
- Turn-order policy expansion.

## Acceptance Criteria

### Tests That Must Pass

1. Unit tests prove malformed `zoneFilter` produces explicit, typed failure (not silent denial).
2. Unit tests verify identical malformed input yields deterministic error shape in:
   - `legalChoices`
   - final move validation path
3. `npm run build` passes.
4. `npm test` passes.
5. `npm run lint` passes.

### Invariants That Must Remain True

- Invalid spec logic is observable and diagnosable.
- No silent fallback behavior that masks schema/logic defects.
