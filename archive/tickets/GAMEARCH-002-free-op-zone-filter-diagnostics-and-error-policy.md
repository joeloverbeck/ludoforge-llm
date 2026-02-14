# GAMEARCH-002: Free-Op Zone Filter Diagnostics and Error Policy

**Status**: ✅ COMPLETED
**Priority**: P1
**Complexity**: S
**Parent spec**: specs/29-fitl-event-card-encoding.md (engine/runtime alignment follow-up)
**Depends on**: GAMEARCH-001

## Reassessed Current State (as of 2026-02-14)

- The core assumption is correct: `src/kernel/turn-flow-eligibility.ts` still uses silent `catch { return false; }` in free-op `zoneFilter` evaluation.
- `legalChoices` currently applies free-op zone filters through `EvalContext.freeOperationZoneFilter` and can throw raw evaluation errors during zones query evaluation.
- `applyMove` validates free-op grants through `isFreeOperationGrantedForMove`, which currently masks malformed filters because of silent catch.
- `legalMoves` is also in scope (not just `legalChoices`/`applyMove`), because free-op template variants are generated in `src/kernel/legal-moves-turn-order.ts` and rely on the same grant checks.
- Existing typed eval errors live in `src/kernel/eval-error.ts`, but free-op zone-filter failures currently do not surface a dedicated typed engine error with move/grant context.

## Description

Free-op zone-filter evaluation currently swallows runtime errors and returns `false`, hiding malformed specs and making failures non-diagnostic.

### What Must Change

1. Remove silent fallback behavior from free-op `zoneFilter` evaluation paths.
2. Surface malformed free-op filter evaluation as explicit typed engine errors with actionable metadata (error code + move/action context + failing grant/filter context + original cause).
3. Preserve deterministic failure semantics for identical malformed input across:
   - `legalMoves` free-op variant discovery,
   - `legalChoices` decision discovery,
   - `applyMove` final validation.

## Files to Touch

- `src/kernel/turn-flow-eligibility.ts`
- `src/kernel/eval-error.ts` **or** equivalent typed error utility module(s)
- `src/kernel/legal-moves-turn-order.ts` and/or `src/kernel/legal-moves.ts` (as needed)
- `src/kernel/legal-choices.ts` (as needed)
- `src/kernel/apply-move.ts` (as needed for stable error surfacing)
- `test/unit/kernel/legal-moves.test.ts`
- `test/unit/kernel/legal-choices.test.ts`
- `test/unit/kernel/apply-move.test.ts` and/or `test/unit/kernel/move-decision-sequence.test.ts`

## Out of Scope

- New grant schema fields.
- Turn-order policy expansion.
- Backward-compatibility alias layers for legacy silent behavior.

## Acceptance Criteria

### Tests That Must Pass

1. Unit tests prove malformed free-op `zoneFilter` produces explicit typed failure (not silent denial).
2. Unit tests verify deterministic error shape (stable code/metadata contract) for identical malformed input in:
   - `legalMoves` free-op template path,
   - `legalChoices`,
   - `applyMove` final validation path.
3. `npm run build` passes.
4. `npm test` passes.
5. `npm run lint` passes.

### Invariants That Must Remain True

- Invalid spec logic is observable and diagnosable.
- No silent fallback behavior that masks schema/logic defects.
- Engine/runtime logic remains game-agnostic (no game-specific branches or identifiers).

## Outcome

- Completion date: 2026-02-14
- What changed:
  - Added typed turn-flow runtime error utilities in `src/kernel/turn-flow-error.ts` with explicit code `FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED` and actionable context payload.
  - Removed silent `catch { return false; }` fallback from free-op grant zone-filter evaluation in `src/kernel/turn-flow-eligibility.ts`; malformed filters now throw typed errors.
  - Added free-op filter diagnostics plumbing in `EvalContext` and `src/kernel/eval-query.ts` so `legalChoices` free-op zone filtering also emits the same typed error family with move context.
  - Updated `src/kernel/apply-move.ts` validation catch policy to preserve typed free-op zone-filter errors (no coercion into generic illegal-param errors).
  - Added/updated unit coverage in:
    - `test/unit/kernel/legal-choices.test.ts`
    - `test/unit/kernel/legal-moves.test.ts`
    - `test/unit/kernel/apply-move.test.ts`
- Deviations from original plan:
  - Introduced a dedicated turn-flow error module (`turn-flow-error.ts`) instead of extending `eval-error.ts`, to keep eval-layer error codes generic and isolate turn-flow policy errors.
  - Included `legalMoves` path explicitly in implementation/tests because free-op template variant generation depends on the same zone-filter evaluation.
- Verification:
  - `npm run build` passed.
  - `node --test dist/test/unit/kernel/legal-choices.test.js dist/test/unit/kernel/legal-moves.test.js dist/test/unit/kernel/apply-move.test.js` passed.
  - `npm test` passed.
  - `npm run lint` passed.
