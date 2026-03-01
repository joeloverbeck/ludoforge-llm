# CROGAMPRIELE-002: Batch marker declarations compiler pass (A2)

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — compiler pipeline (new expansion pass), GameSpecDoc types
**Deps**: None (independent compiler pass)

## Problem

FITL defines 20 capability markers with identical `states: [inactive, unshaded, shaded]` and `defaultState: inactive`. This repetition is error-prone and verbose (~60 lines). A `batch:` syntax on `globalMarkerLattices` should expand into individual marker declarations at compile time.

## Assumption Reassessment (2026-03-01)

1. `GameSpecGlobalMarkerLatticeDef` exists in `game-spec-doc.ts:27-31` with `id`, `states`, `defaultState`.
2. `GameSpecDoc.globalMarkerLattices` is typed as `readonly GameSpecGlobalMarkerLatticeDef[] | null` (`game-spec-doc.ts:380`).
3. Space markers (`markerLattices`) live inside `MapPayload` data assets (`types-core.ts:368`) — they are NOT a top-level `GameSpecDoc` field. Batch expansion applies to `globalMarkerLattices` only.
4. `GlobalMarkerLatticeDef` in `types-core.ts:328-332` is the kernel-level type — the expansion produces `GameSpecGlobalMarkerLatticeDef` entries that lower to `GlobalMarkerLatticeDef` via existing `lowerGlobalMarkerLattices`.

## Architecture Check

1. Batch expansion at compile time avoids kernel complexity — the GameDef sees only individual markers.
2. Scope is explicitly limited to `globalMarkerLattices` since `spaceMarkerLattices` is not a GameSpecDoc field.
3. No backwards-compatibility shims — individual and batch forms coexist in the same array via a union type.

## What to Change

### 1. Add `GameSpecBatchGlobalMarkerLattice` type and widen array type in `game-spec-doc.ts`

```typescript
export interface GameSpecBatchGlobalMarkerLattice {
  readonly batch: {
    readonly ids: readonly string[];
    readonly states: readonly string[];
    readonly defaultState: string;
  };
}

// Change globalMarkerLattices field type:
readonly globalMarkerLattices: readonly (GameSpecGlobalMarkerLatticeDef | GameSpecBatchGlobalMarkerLattice)[] | null;
```

### 2. Create `expand-batch-markers.ts`

New file implementing `expandBatchMarkers(doc: GameSpecDoc): { doc: GameSpecDoc; diagnostics: Diagnostic[] }`.

Algorithm:
1. If `doc.globalMarkerLattices` is null or empty, return doc unchanged.
2. Iterate entries. For individual entries (`id` key), pass through.
3. For batch entries (`batch` key):
   a. Validate: `batch.ids` non-empty, `batch.defaultState` in `batch.states`.
   b. For each ID in `batch.ids`, emit `{ id, states: batch.states, defaultState: batch.defaultState }`.
4. Collect all IDs (individual + expanded). Check for cross-entry duplicates.
5. Return new doc with expanded `globalMarkerLattices`.

### 3. Create unit tests

Test file covering:
- Batch of 20 markers expands to 20 individual declarations.
- Mixed batch + individual entries in same array.
- Duplicate ID within batch produces diagnostic.
- Duplicate ID across batch and individual produces diagnostic.
- Empty `batch.ids` produces diagnostic.
- `batch.defaultState` not in `batch.states` produces diagnostic.
- Null/empty `globalMarkerLattices` = no-op.

## Files to Touch

- `packages/engine/src/cnl/game-spec-doc.ts` (modify — add batch type, widen `globalMarkerLattices` array type)
- `packages/engine/src/cnl/expand-batch-markers.ts` (new)
- `packages/engine/test/unit/expand-batch-markers.test.ts` (new)

## Out of Scope

- Space markers / `markerLattices` inside `MapPayload` — not a GameSpecDoc field
- Wiring into `compiler-core.ts` (CROGAMPRIELE-008)
- `expandTemplates` orchestrator (CROGAMPRIELE-008)
- Any other expansion passes
- Kernel type changes
- JSON Schema updates
- Game spec migrations

## Acceptance Criteria

### Tests That Must Pass

1. Batch with N IDs produces exactly N individual `GameSpecGlobalMarkerLatticeDef` entries, each with correct `states` and `defaultState`.
2. Mixed batch + individual entries are correctly combined in output.
3. Duplicate IDs within a single batch produce a diagnostic error.
4. Duplicate IDs across batch and individual entries produce a diagnostic error.
5. Empty `batch.ids` produces a diagnostic error.
6. `batch.defaultState` not present in `batch.states` produces a diagnostic error.
7. Null `globalMarkerLattices` passes through unchanged.
8. Existing suite: `pnpm turbo test`

### Invariants

1. `expandBatchMarkers` is a pure function: same input doc produces same output doc.
2. Output doc's `globalMarkerLattices` contains only individual `GameSpecGlobalMarkerLatticeDef` entries — no `batch` entries remain.
3. No mutation of the input `GameSpecDoc`.
4. Order of expanded markers follows order of IDs in `batch.ids`.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/expand-batch-markers.test.ts` — covers all 7 scenarios above. Rationale: validates batch expansion, coexistence with individual entries, and all error conditions.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/expand-batch-markers.test.js`
3. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`

## Outcome

- **Completion date**: 2026-03-01
- **What changed**:
  - `compiler-diagnostic-codes.ts` — added `COMPILER_DIAGNOSTIC_CODES_BATCH_MARKERS` with 3 codes (`IDS_EMPTY`, `DEFAULT_STATE_INVALID`, `DUPLICATE_ID`)
  - `game-spec-doc.ts` — added `GameSpecBatchGlobalMarkerLattice` interface; widened `globalMarkerLattices` to `readonly (GameSpecGlobalMarkerLatticeDef | GameSpecBatchGlobalMarkerLattice)[] | null`
  - `expand-batch-markers.ts` (new) — `isBatchEntry` type guard + `expandBatchMarkers` pure function
  - `cnl/index.ts` — added export for `expand-batch-markers`
  - `test/unit/expand-batch-markers.test.ts` (new) — 9 test cases covering all acceptance criteria
  - `test/unit/parser.test.ts` — added type assertion at line 257 to accommodate widened union type
- **Deviations from plan**: One additional file touched (`parser.test.ts`) — the widened union type required a type assertion where the parser test accessed `.id` directly on `globalMarkerLattices[0]`
- **Verification**: build clean, 9/9 new tests pass, 3190/3190 full suite pass, typecheck clean, lint clean
