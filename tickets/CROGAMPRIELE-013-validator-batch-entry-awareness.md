# CROGAMPRIELE-013: Validator batch-entry awareness for variable sections

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — validator logic
**Deps**: archive/tickets/CROGAMPRIELE/CROGAMPRIELE-003-batch-variable-declarations.md

## Problem

`validateVariableSection` in `validate-metadata.ts:186-219` does not know about `GameSpecBatchVarDef` entries. When `validateGameSpec` runs on a doc containing batch var entries (before template expansion), it produces false-positive diagnostics:

1. `CNL_VALIDATOR_UNKNOWN_KEY` warning for the `batch` key (since `VARIABLE_KEYS` is `['name', 'type', 'init', 'min', 'max']`).
2. `CNL_VALIDATOR_VARIABLE_REQUIRED_FIELD_MISSING` error for missing `name` field.
3. `CNL_VALIDATOR_VARIABLE_REQUIRED_FIELD_MISSING` error for missing top-level `type` field.

This doesn't matter today because no production specs use batch var syntax yet. It becomes a blocking issue when CROGAMPRIELE-010/011 migrate the FITL and Texas Hold'em specs to use `batch:` syntax — the production spec test helpers call `validateGameSpec` before `compileGameSpecToGameDef`, and error diagnostics would fail those assertions.

Note: `globalMarkerLattices` (the batch markers counterpart) does not have this problem because there is no `validateMarkerLatticeSection` — marker lattices are not validated by `validateGameSpec`.

## Assumption Reassessment (2026-03-01)

1. `validateVariableSection` in `validate-metadata.ts:186-219` iterates `globalVars` and `perPlayerVars` entries, calling `isRecord()` → `validateUnknownKeys()` → required field checks.
2. `VARIABLE_KEYS` in `validate-spec-shared.ts:24` is `['name', 'type', 'init', 'min', 'max']` — does not include `'batch'`.
3. Production spec test helpers (`compileProductionSpec` in `test/helpers/production-spec-helpers.ts`) call `validateGameSpec` before `compileGameSpecToGameDef` and assert zero error diagnostics.
4. `validateGameSpec` is a separate pre-flight step, NOT called inside `compileGameSpecToGameDef`. Callers invoke it independently.
5. CROGAMPRIELE-008 (orchestrator wiring) does not address this — it only wires `expandTemplates` into `compileGameSpecToGameDef`, not into the validation step.

## Architecture Check

1. The cleanest approach is to make `validateVariableSection` skip batch entries — they will be validated by `expandBatchVars` itself (which already checks `names` non-empty, `type` validity, `init` bounds). Double-validating would be redundant.
2. This keeps the validator in its role (structural pre-flight checks) and the expansion pass in its role (semantic expansion + validation). No game-specific logic enters either layer.
3. No backwards-compatibility shims — batch entries are simply recognized and skipped by the validator.

## What to Change

### 1. Update `validateVariableSection` to skip batch entries

In `validate-metadata.ts`, after the `isRecord(variable)` check, add an early-continue for entries with a `batch` key:

```typescript
if ('batch' in variable) {
  // Batch entries are validated by expandBatchVars — skip here.
  continue;
}
```

### 2. Add test for validator skipping batch entries

Add a test confirming that `validateGameSpec` on a doc with batch var entries produces zero diagnostics related to those entries.

## Files to Touch

- `packages/engine/src/cnl/validate-metadata.ts` (modify — add batch entry skip)
- `packages/engine/test/unit/validate-metadata.test.ts` or equivalent (modify — add test)

## Out of Scope

- Changing `VARIABLE_KEYS` to include `'batch'` — not appropriate since batch entries have entirely different structure
- Adding a full batch entry validator to `validateGameSpec` — `expandBatchVars` already validates batch semantics
- Spec migrations (CROGAMPRIELE-010, 011) — those depend on this but are separate work
- Orchestrator wiring (CROGAMPRIELE-008) — separate concern

## Acceptance Criteria

### Tests That Must Pass

1. `validateGameSpec` on a doc with `globalVars` containing a `GameSpecBatchVarDef` produces no error/warning diagnostics for that entry.
2. `validateGameSpec` on a doc with `perPlayerVars` containing a `GameSpecBatchVarDef` produces no error/warning diagnostics for that entry.
3. `validateGameSpec` on a doc with mixed individual + batch entries validates individual entries normally and skips batch entries.
4. Existing suite: `pnpm turbo test`

### Invariants

1. `validateVariableSection` never produces diagnostics for batch entries — those are the responsibility of `expandBatchVars`.
2. Individual `GameSpecVarDef` entries continue to be validated exactly as before.
3. No game-specific logic in the validator.

## Test Plan

### New/Modified Tests

1. Validator test file — add 3 test cases for batch entry skipping (globalVars, perPlayerVars, mixed). Rationale: ensures validator doesn't produce false positives that would block spec migration tickets.

### Commands

1. `pnpm turbo build`
2. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`
