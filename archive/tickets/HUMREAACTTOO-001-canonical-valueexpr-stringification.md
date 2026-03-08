# HUMREAACTTOO-001: Canonical ValueExpr Stringification

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — new kernel module, refactor two normalizer modules
**Deps**: Spec 55 (tooltip pipeline, complete)

## Problem

`stringifyValueExpr()` is duplicated in `tooltip-normalizer.ts` (module-private) and `tooltip-normalizer-compound.ts` (lines 34-54). Both copies only handle 4 of 12 Reference types (`gvar`, `pvar`, `binding`, `globalMarkerState`). Missing types (`markerState`, `zoneCount`, `tokenProp`, `assetField`, `zoneProp`, `activePlayer`, `tokenZone`, `zoneVar`) all fall through to `<value>` or `<ref>`, producing unreadable tooltip output.

## Assumption Reassessment (2026-03-08)

1. `tooltip-normalizer.ts` contains a module-private `stringifyValueExpr` — **verified** (not exported, duplicated logic).
2. `tooltip-normalizer-compound.ts` contains minimal local copies of `stringifyValueExpr`, `stringifyNumericExpr`, `stringifyZoneRef` at lines 34-54 — **verified**.
3. Neither copy handles `markerState`, `zoneCount`, `tokenProp`, `assetField`, `zoneProp`, `activePlayer`, `tokenZone`, `zoneVar` — **verified** (grep for these terms returns no matches in either file's stringify functions).

## Architecture Check

1. Extracting to a dedicated module eliminates duplication (DRY) and provides a single location for future ref-type additions.
2. Purely engine-internal kernel utility — no GameSpecDoc or game-specific concerns. The module is game-agnostic (translates AST Reference nodes, not game identifiers).
3. No backwards-compatibility shims — the old private functions are replaced by imports from the new module.

## What to Change

### 1. Create `packages/engine/src/kernel/tooltip-value-stringifier.ts`

Extract and unify `stringifyValueExpr`, `stringifyNumericExpr`, and `stringifyZoneRef` into a single exported module. Extend `stringifyValueExpr` to handle all 12 Reference types:

| Ref type | Output pattern |
|----------|----------------|
| `gvar` | `expr.var` |
| `pvar` | `expr.var` |
| `binding` | `expr.displayName ?? expr.name` |
| `globalMarkerState` | `expr.marker` |
| `markerState` | `"{marker} of {space}"` |
| `zoneCount` | `"pieces in {zone}"` |
| `tokenProp` | `"{token}.{prop}"` |
| `assetField` | `"{field}"` |
| `zoneProp` | `"{zone}.{prop}"` |
| `activePlayer` | `"activePlayer"` |
| `tokenZone` | `"zone of {token}"` |
| `zoneVar` | `"{var} of {zone}"` |

Also handle arithmetic expressions (`{left} {op} {right}`) and aggregate expressions (`count/sum of ...`).

### 2. Update `tooltip-normalizer.ts`

Remove the local `stringifyValueExpr` and related helpers. Import from `tooltip-value-stringifier.ts` instead.

### 3. Update `tooltip-normalizer-compound.ts`

Remove the local copies of `stringifyValueExpr`, `stringifyNumericExpr`, `stringifyZoneRef` (lines 34-54). Import from `tooltip-value-stringifier.ts` instead.

## Files to Touch

- `packages/engine/src/kernel/tooltip-value-stringifier.ts` (new)
- `packages/engine/src/kernel/tooltip-normalizer.ts` (modify — remove local stringifier, import from new module)
- `packages/engine/src/kernel/tooltip-normalizer-compound.ts` (modify — remove local copies, import from new module)

## Out of Scope

- Updating `humanizeValue` in `tooltip-modifier-humanizer.ts` (that's HUMREAACTTOO-002)
- Changing `SelectMessage.target` type or `normalizeChooseN` (that's HUMREAACTTOO-003)
- `SummaryMessage` type or macro override changes (that's HUMREAACTTOO-004)
- Binding name sanitization (that's HUMREAACTTOO-005)
- Runner UI components
- Verbalization YAML content in game data files

## Acceptance Criteria

### Tests That Must Pass

1. New `tooltip-value-stringifier.test.ts`: each of the 12 ref types produces correct output string (not `<value>` or `<ref>`).
2. New `tooltip-value-stringifier.test.ts`: arithmetic expressions render as `"{left} {op} {right}"`.
3. New `tooltip-value-stringifier.test.ts`: aggregate expressions render as `"count/sum of ..."`.
4. Existing `tooltip-normalizer.test.ts` passes unchanged (behavioral equivalence).
5. Existing `tooltip-normalizer-compound.test.ts` passes unchanged (behavioral equivalence).
6. Existing suite: `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test`

### Invariants

1. All existing tooltip normalization behavior is identical before and after extraction — this is a refactor + extension, not a rewrite.
2. No game-specific logic in `tooltip-value-stringifier.ts` — it translates AST Reference nodes generically.
3. Immutability: the new module is pure (no mutations, no side effects).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/tooltip-value-stringifier.test.ts` — unit tests for all 12 ref types, arithmetic, aggregates, and edge cases (unknown ref type falls back gracefully).

### Commands

1. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`

## Outcome

- **Completion date**: 2026-03-08
- **What changed**:
  - Created `packages/engine/src/kernel/tooltip-value-stringifier.ts` — canonical exported `stringifyValueExpr`, `stringifyNumericExpr`, `stringifyZoneRef` handling all 12 Reference types + arithmetic + aggregate + concat + conditional expressions.
  - Updated `packages/engine/src/kernel/tooltip-normalizer.ts` — removed local stringifier copies, imports from new module.
  - Updated `packages/engine/src/kernel/tooltip-normalizer-compound.ts` — removed local stringifier copies, imports from new module. Also fixed pre-existing unsafe `as ValueExpr` cast in `stringifyTokenFilter` by introducing `stringifyPredicateValue` that properly handles `ValueExpr | readonly (string | number | boolean)[]`.
  - Created `packages/engine/test/unit/kernel/tooltip-value-stringifier.test.ts` — 30 unit tests.
- **Deviations from plan**:
  - Added `Array.isArray` guard on the `concat` branch of `stringifyValueExpr` to prevent collision with `Array.prototype.concat` when non-ValueExpr objects pass through (discovered via patrol action crash in integration tests).
  - Added `stringifyPredicateValue` helper in compound normalizer to fix pre-existing unsafe cast of `TokenFilterPredicate.value` (which is `ValueExpr | readonly (string | number | boolean)[]`, not just `ValueExpr`). Array values now render as `"a, b, c"` instead of `<expr>`.
- **Verification**: 4370/4370 engine tests pass, typecheck clean (3/3 packages).
