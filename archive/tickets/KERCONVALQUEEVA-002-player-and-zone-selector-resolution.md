# KERCONVALQUEEVA-002 - Player and Zone Selector Resolution

**Status**: ✅ COMPLETED

## Assumption Reassessment
- `src/kernel/resolve-selectors.ts` does not exist yet and must be created.
- `test/unit/resolve-selectors.test.ts` does not exist yet and must be created.
- Existing primitives available for this ticket are:
  - `EvalContext` in `src/kernel/eval-context.ts`
  - `EvalError` helpers in `src/kernel/eval-error.ts`
  - selector-related type definitions in `src/kernel/types.ts`
- `src/kernel/index.ts` currently exports existing kernel modules only; selector resolution exports must be added.

## Goal
Implement deterministic selector resolution primitives for players and zones, including scalar cardinality helpers.

## Scope
- Add `resolvePlayerSel`, `resolveSinglePlayerSel` with support for all Spec 04 `PlayerSel` forms.
- Add `resolveZoneSel`, `resolveSingleZoneSel` for `zoneId:ownerSpec` parsing and expansion.
- Enforce deduplication + deterministic sorting (`PlayerId` ascending, `ZoneId` lexicographic).
- Return descriptive cardinality and missing-selector errors via `EvalError`.

## File List Expected To Touch
- Create `src/kernel/resolve-selectors.ts`
- Modify `src/kernel/index.ts` to re-export selector APIs
- Create `test/unit/resolve-selectors.test.ts`

## Out Of Scope
- Query execution over resolved selectors.
- Reference/value/condition evaluation.
- Spatial graph traversal (`adjacent`/`connected`) semantics.

## Acceptance Criteria
### Specific Tests That Must Pass
- `test/unit/resolve-selectors.test.ts`:
  - `'actor'`, `'active'`, `'all'`, `'allOther'`, `{ id }`, `{ chosen }`, `{ relative: 'left'|'right' }` resolve correctly.
  - `resolvePlayerSel('all')` is sorted and deduplicated.
  - invalid `{ id }` and non-player `{ chosen }` throw typed errors.
  - `resolveZoneSel('deck:none')`, `resolveZoneSel('hand:actor')`, `resolveZoneSel('hand:all')` resolve correctly.
  - unknown zone base/owner variant throws descriptive error with candidates.
  - `resolveSinglePlayerSel` and `resolveSingleZoneSel` throw `SELECTOR_CARDINALITY` on 0 or >1 matches.
- Existing schema tests remain green:
  - `test/unit/schemas-ast.test.ts`

### Clarified Scope Boundaries
- This ticket implements selector resolution only. It does not add `evalQuery`, `evalValue`, `evalCondition`, or `resolveRef`.
- Zone selector resolution targets `zoneBase:ownerSpec` strings using currently declared zones in `def.zones`; no spatial adjacency logic is included.
- Player resolution derives concrete players from `state.playerCount` and context players (`actorPlayer`, `activePlayer`) in `EvalContext`.

### Invariants That Must Remain True
- Selector resolution is pure and does not mutate `def`, `state`, or `bindings`.
- Deterministic ordering contract is preserved for all multi-result selectors.
- Scalar helper functions never silently choose from multi-target results.

## Outcome
- **Completion date**: 2026-02-10
- **What changed**:
  - Added `src/kernel/resolve-selectors.ts` implementing `resolvePlayerSel`, `resolveSinglePlayerSel`, `resolveZoneSel`, and `resolveSingleZoneSel`.
  - Added `test/unit/resolve-selectors.test.ts` with coverage for all required selector variants, error paths, and scalar cardinality helpers.
  - Updated `src/kernel/index.ts` to export selector resolution APIs.
- **Assumption corrections vs original plan**:
  - The repository had no pre-existing selector resolver or selector tests; both were created as new files.
  - Scope remained selector-only and intentionally excluded value/condition/query/reference evaluators.
- **Verification**:
  - `npm run build`
  - `node --test dist/test/unit/resolve-selectors.test.js`
  - `npm test`
