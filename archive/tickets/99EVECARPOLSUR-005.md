# 99EVECARPOLSUR-005: Implement active-card surface resolution at runtime

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — policy-runtime.ts (surface resolution)
**Deps**: 99EVECARPOLSUR-002, 99EVECARPOLSUR-003, 99EVECARPOLSUR-004

## Problem

The three new active-card surface ref families are defined and parsed, but the runtime cannot resolve them. The `resolveSurface` method in `policy-runtime.ts` must be extended to handle `activeCardIdentity`, `activeCardTag`, and `activeCardMetadata` by looking up the active card via `resolveCurrentEventCardState` and the compiled `cardMetadataIndex`.

## Assumption Reassessment (2026-03-31)

1. `resolveSurface` in `policy-runtime.ts:173` dispatches on `ref.family` using an if/else chain — confirmed at lines 173-235.
2. `resolveCurrentEventCardState` at `event-execution.ts:209` returns `{ deckId, card } | null` — confirmed.
3. The preview surface path at `policy-runtime.ts:237-240` delegates to `previewRuntime.resolveSurface(candidate, ref)` — confirmed. Preview resolution for the new families should work through the same delegation if the preview runtime's `resolveSurface` also dispatches on family.
4. The `coalesce` operator in `policy-evaluation-core.ts` handles `undefined` fallback — confirmed, so no-card cases are handled at the expression level.

## Architecture Check

1. Resolution uses existing `resolveCurrentEventCardState` (kernel function) + `cardMetadataIndex` lookup (compiled data). No new kernel state or mutation.
2. Active card resolution can be cached per evaluation cycle — `resolveCurrentEventCardState` is O(decks) but decks are typically 1-2. Caching is optional optimization, not required.
3. When no active card exists, all three families return `undefined`. This is consistent with how other surfaces handle missing data (e.g., derived metrics for undefined metric IDs).

## What to Change

### 1. Add active card resolution helper

In `policy-runtime.ts`, add a helper (or inline) that:
1. Calls `resolveCurrentEventCardState(def, state)` to get the active card
2. If null, returns `undefined`
3. Looks up `cardId` in `def.cardMetadataIndex?.entries`
4. If not found, returns `undefined`
5. Returns the `CompiledCardMetadataEntry`

Cache the result per evaluation call (similar to `victorySurface` caching pattern at line 218-227).

### 2. Extend `resolveSurface` for current surface

Add three new family cases after the existing `victoryCurrentRank` handling (around line 234):

- `activeCardIdentity`: return `entry.cardId` if `id === 'id'`, `entry.deckId` if `id === 'deckId'`
- `activeCardTag`: return `entry.tags.includes(ref.id)` (boolean)
- `activeCardMetadata`: return `entry.metadata[ref.id]` (scalar value or `undefined`)

All three check visibility first (same pattern as existing families).

### 3. Ensure preview surface path works

Verify that the preview runtime's `resolveSurface` also dispatches through the same family-based resolution. The preview runtime receives a candidate's projected state — the same resolution logic should apply with the preview state instead of current state. If `previewRuntime.resolveSurface` delegates to the same dispatch, this should work automatically.

## Files to Touch

- `packages/engine/src/agents/policy-runtime.ts` (modify — extend `resolveSurface` for both current and preview paths)

## Out of Scope

- FITL agent profile visibility YAML (ticket 006)
- Integration/golden tests (ticket 007)
- Evaluating event effects (Spec 100)
- Performance optimization of active card resolution (caching is recommended but not mandated beyond the existing pattern)

## Acceptance Criteria

### Tests That Must Pass

1. `activeCardIdentity` with `id: 'id'` returns the correct card ID when a card is in the discard zone.
2. `activeCardIdentity` with `id: 'deckId'` returns the correct deck ID.
3. `activeCardTag` with a tag present on the card returns `true`.
4. `activeCardTag` with a tag NOT present returns `false`.
5. `activeCardMetadata` with an existing metadata key returns the scalar value.
6. `activeCardMetadata` with a missing key returns `undefined`.
7. All three families return `undefined` when no active card exists (empty discard zones).
8. All three families return `undefined` when visibility is `hidden`.
9. Preview path resolves active card from the preview state, not current state.
10. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Resolution is a pure read-only operation — no state mutation.
2. Same state + same card = same resolution result (determinism).
3. Missing `cardMetadataIndex` on GameDef returns `undefined` for all card families (graceful degradation).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-runtime.test.ts` — add resolution tests for all three families: happy path, no-card, hidden visibility, preview path.

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "activeCard"` (targeted)
2. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test`

## Outcome

- **Completion date**: 2026-03-31
- **What changed**:
  - `packages/engine/src/agents/policy-runtime.ts` — Extended `resolveSurface` with three new active card family cases (`activeCardIdentity`, `activeCardTag`, `activeCardMetadata`). Added `resolveActiveCardEntry` helper with per-evaluation caching.
  - `packages/engine/src/agents/policy-preview.ts` — Extended preview runtime's `resolveSurface` with the same three families resolving against preview state. Added `resolveActiveCardEntryFromState` and `resolveActiveCardFamilyValue` helpers.
  - `packages/engine/test/unit/agents/policy-runtime.test.ts` — Added 9 new tests covering all acceptance criteria.
- **Deviations**: None. Implementation matches ticket spec exactly.
- **Verification**: Typecheck clean. 5199 tests pass, 0 failures.
