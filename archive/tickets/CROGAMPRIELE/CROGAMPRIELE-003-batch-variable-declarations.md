# CROGAMPRIELE-003: Batch variable declarations compiler pass (A3)

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — compiler pipeline (new expansion pass), GameSpecDoc types
**Deps**: None (independent compiler pass)

## Problem

FITL defines 13 operation counters (identical `type: int`, `init: 0`, `min: 0`, `max: 20`) and ~18 momentum flags (identical `type: boolean`, `init: false`). This repetition totals ~120 lines of YAML. A `batch:` syntax on `globalVars` and `perPlayerVars` should expand into individual variable declarations at compile time.

## Assumption Reassessment (2026-03-01)

1. `GameSpecVarDef` exists in `game-spec-doc.ts:19-25` with `name`, `type`, `init`, optional `min`/`max`.
2. `GameSpecDoc.globalVars` is `readonly GameSpecVarDef[] | null` (`game-spec-doc.ts:381`).
3. `GameSpecDoc.perPlayerVars` is `readonly GameSpecVarDef[] | null` (`game-spec-doc.ts:382`).
4. Both fields use the same `GameSpecVarDef` type — batch expansion applies identically to both.
5. `VariableDef` in `types-core.ts:56-70` is the kernel-level discriminated union (`IntVariableDef | BooleanVariableDef`). The expansion produces `GameSpecVarDef` entries that lower via existing `lowerVarDefs` / `lowerIntVarDefs`.

## Architecture Check

1. Batch expansion at compile time avoids kernel complexity — the GameDef sees only individual vars.
2. Same batch syntax works for both `globalVars` and `perPlayerVars` since they share the same type.
3. No backwards-compatibility shims — individual and batch forms coexist via union type.

## What to Change

### 1. Add `GameSpecBatchVarDef` type and widen array types in `game-spec-doc.ts`

```typescript
export interface GameSpecBatchVarDef {
  readonly batch: {
    readonly names: readonly string[];
    readonly type: 'int' | 'boolean';
    readonly init: unknown;
    readonly min?: unknown;
    readonly max?: unknown;
  };
}

// Change globalVars and perPlayerVars field types:
readonly globalVars: readonly (GameSpecVarDef | GameSpecBatchVarDef)[] | null;
readonly perPlayerVars: readonly (GameSpecVarDef | GameSpecBatchVarDef)[] | null;
```

### 2. Create `expand-batch-vars.ts`

New file implementing `expandBatchVars(doc: GameSpecDoc): { doc: GameSpecDoc; diagnostics: Diagnostic[] }`.

Algorithm:
1. Process both `doc.globalVars` and `doc.perPlayerVars` with the same logic.
2. For each array: iterate entries. Individual entries (`name` key) pass through.
3. For batch entries (`batch` key):
   a. Validate: `batch.names` non-empty, `batch.type` is `'int'` or `'boolean'`.
   b. For `int` batches: validate `init` is within `[min, max]`.
   c. For `boolean` batches: `min`/`max` are ignored.
   d. For each name in `batch.names`, emit `{ name, type: batch.type, init: batch.init, min: batch.min, max: batch.max }` (omitting `min`/`max` for boolean).
4. Collect all names across both fields. Check for cross-entry duplicates.
5. Return new doc with expanded arrays.

### 3. Create unit tests

Test file covering:
- Batch of 13 int counters expands correctly with shared bounds.
- Batch of 18 boolean flags expands correctly (no min/max).
- Mixed batch + individual entries in same array.
- Both `globalVars` and `perPlayerVars` are processed.
- Duplicate name within batch produces diagnostic.
- Duplicate name across batch and individual produces diagnostic.
- Duplicate name across `globalVars` and `perPlayerVars` — note: this may be valid (different scopes), so check existing validation behavior.
- Empty `batch.names` produces diagnostic.
- Invalid `batch.type` produces diagnostic.
- For `int` batch: `init` outside `[min, max]` produces diagnostic.
- Null/empty arrays = no-op.

## Files to Touch

- `packages/engine/src/cnl/game-spec-doc.ts` (modify — add batch var type, widen both array types)
- `packages/engine/src/cnl/expand-batch-vars.ts` (new)
- `packages/engine/test/unit/expand-batch-vars.test.ts` (new)

## Out of Scope

- `zoneVars` — batch syntax not specified for zone-scoped variables
- Wiring into `compiler-core.ts` (CROGAMPRIELE-008)
- `expandTemplates` orchestrator (CROGAMPRIELE-008)
- Any other expansion passes
- Kernel type changes
- JSON Schema updates
- Game spec migrations

## Acceptance Criteria

### Tests That Must Pass

1. Int batch with N names produces N individual `GameSpecVarDef` entries with correct `type`, `init`, `min`, `max`.
2. Boolean batch with N names produces N individual entries with `type: 'boolean'`, `init`, and no `min`/`max`.
3. Mixed batch + individual entries are correctly combined in output.
4. Both `globalVars` and `perPlayerVars` arrays are expanded independently.
5. Duplicate names within a single batch produce a diagnostic error.
6. Duplicate names across batch and individual entries produce a diagnostic error.
7. Empty `batch.names` produces a diagnostic error.
8. For int batches, `init` outside `[min, max]` produces a diagnostic error.
9. Null arrays pass through unchanged.
10. Existing suite: `pnpm turbo test`

### Invariants

1. `expandBatchVars` is a pure function: same input doc produces same output doc.
2. Output doc's `globalVars` and `perPlayerVars` contain only individual `GameSpecVarDef` entries — no `batch` entries remain.
3. No mutation of the input `GameSpecDoc`.
4. Order of expanded vars follows order of names in `batch.names`.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/expand-batch-vars.test.ts` — covers all scenarios above. Rationale: validates batch expansion for both int and boolean types across both variable scopes, plus all error conditions.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/expand-batch-vars.test.js`
3. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`

## Outcome

### Files Modified
- `packages/engine/src/cnl/compiler-diagnostic-codes.ts` — added `COMPILER_DIAGNOSTIC_CODES_BATCH_VARS` block with 4 codes
- `packages/engine/src/cnl/game-spec-doc.ts` — added `GameSpecBatchVarDef` interface, widened `globalVars` and `perPlayerVars` to `(GameSpecVarDef | GameSpecBatchVarDef)[]`

### Files Created
- `packages/engine/src/cnl/expand-batch-vars.ts` — `expandBatchVars()` expansion pass following `expand-batch-markers.ts` pattern
- `packages/engine/test/unit/expand-batch-vars.test.ts` — 12 test cases covering all acceptance criteria

### Design Decision
- Duplicate detection is per-field (within `globalVars` and `perPlayerVars` independently), not cross-scope, matching the existing `expand-batch-markers.ts` pattern and respecting semantic scope boundaries.

### Verification
- `pnpm turbo build` — clean
- 12/12 new tests pass
- 3202/3202 full suite tests pass (0 failures)
- `pnpm turbo typecheck` — clean
- `pnpm turbo lint` — clean
