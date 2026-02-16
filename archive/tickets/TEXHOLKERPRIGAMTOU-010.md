# TEXHOLKERPRIGAMTOU-010: Generic Move-Domain Cardinality Controls for `intsInRange`

**Status**: ✅ COMPLETED  
**Priority**: HIGH  
**Effort**: Medium  
**Dependencies**: None  
**Blocks**: TEXHOLKERPRIGAMTOU-011

## Problem

Current `intsInRange` expands every integer between `min..max`. In no-limit poker this creates thousands of `raise` moves per decision, which amplifies both `legalMoves()` runtime and `GreedyAgent` evaluation cost. This is a generic query-layer scaling issue, not a Texas-only issue.

## Assumption Reassessment (2026-02-16)

1. `intsInRange` currently supports only `{ min, max }` in runtime eval (`src/kernel/eval-query.ts`), AST schema/types (`src/kernel/schemas-ast.ts`, `src/kernel/types-ast.ts`), and CNL lowering (`src/cnl/compile-conditions.ts`).
2. Existing generic query-budget protection (`maxQueryResults`, default 10_000) only enforces a hard ceiling; it does not provide deterministic domain rebucketing for large-but-valid ranges.
3. Texas tournament and property suites already exist (`test/e2e/texas-holdem-tournament.test.ts`, `test/unit/texas-holdem-properties.test.ts`). This ticket should not introduce Texas-specific behavior/tests; it should deliver reusable query mechanics consumed later by ticket `-011`.
4. Validation coverage for `intsInRange` currently checks safe-integer bounds and `min <= max` (`src/kernel/validate-gamedef-behavior.ts`, `test/unit/validate-gamedef.test.ts`), but does not validate `step`/`alwaysInclude`/`maxResults` because those fields do not yet exist.

## 1) What Should Change / Be Added

### A. Extend `intsInRange` with optional cardinality controls

Add optional fields to the `OptionsQuery` shape for `intsInRange`:

- `step?: NumericValueExpr`
- `alwaysInclude?: readonly NumericValueExpr[]`
- `maxResults?: NumericValueExpr`

Behavior:

1. Generate arithmetic progression from `min` to `max` using `step` (default `1`).
2. Add `alwaysInclude` values if they are within bounds.
3. De-duplicate and return sorted ascending integers.
4. If `maxResults` is set and candidate count exceeds it, downsample deterministically while preserving:
   - minimum value,
   - maximum value,
   - all in-bounds `alwaysInclude` values.

### B. Validate malformed query specs early

Validation/schema checks should reject:

- `step <= 0`
- non-integer `step`
- non-integer `maxResults`
- `maxResults < 2` when `min < max`
- non-integer entries in `alwaysInclude`

### C. Keep this engine-generic

No poker-specific logic in kernel/eval-query.

### D. Propagate through the full compile/runtime pipeline

Update all relevant representations so fields are preserved end-to-end:

- GameSpecDoc query shape (`src/cnl/game-spec-doc.ts`)
- CNL lowering (`src/cnl/compile-conditions.ts`)
- Kernel AST type/schema (`src/kernel/types-ast.ts`, `src/kernel/schemas-ast.ts`)
- Runtime behavior validation (`src/kernel/validate-gamedef-behavior.ts`)
- Runtime query evaluation (`src/kernel/eval-query.ts`)

## 2) Invariants That Must Pass

1. Determinism: identical state/query yields identical output ordering.
2. Backward compatibility for existing specs that omit new fields: behavior matches old `intsInRange` semantics.
3. Bounds safety: every emitted integer is `min <= value <= max`.
4. Endpoint integrity: `min` and `max` are present whenever `min <= max`.
5. Inclusion integrity: any in-bounds `alwaysInclude` values are present.
6. No duplicates.
7. Query-budget safety: output count is finite and respects `maxResults` when configured.

## 3) Tests That Should Pass

### New / updated unit tests

- `test/unit/eval-query.test.ts`
  - `intsInRange` default behavior unchanged.
  - `step` behavior returns arithmetic progression.
  - `alwaysInclude` injects values correctly.
  - `maxResults` deterministic downsampling preserves required endpoints/inclusions.
- `test/unit/schemas-ast.test.ts`
  - schema accepts new fields.
  - invalid `step`/`maxResults` rejected.
- `test/unit/compile-conditions.test.ts`
  - compile/lower paths preserve new fields without mutation.
- `test/unit/validate-gamedef.test.ts`
  - malformed `intsInRange` cardinality controls are rejected with explicit diagnostics.

### Regression suites

- `npm run build`
- `npm run lint`
- `npm test`

## Out of Scope

- Do not add game-specific branching in kernel.
- Do not change Texas GameSpecDoc in this ticket.

## Outcome

- Completion date: 2026-02-16
- Implemented:
  - Added `intsInRange` optional controls (`step`, `alwaysInclude`, `maxResults`) in AST/types, schema, CNL lowering, runtime validation, and runtime evaluation.
  - Added deterministic downsampling that preserves `min`, `max`, and in-bounds `alwaysInclude`.
  - Added/updated tests in:
    - `test/unit/eval-query.test.ts`
    - `test/unit/schemas-ast.test.ts`
    - `test/unit/compile-conditions.test.ts`
    - `test/unit/validate-gamedef.test.ts`
  - Regenerated schema artifacts:
    - `schemas/GameDef.schema.json`
    - `schemas/Trace.schema.json`
    - `schemas/EvalReport.schema.json`
- Deviations from original plan:
  - No changes were required in `src/cnl/game-spec-doc.ts` because query nodes in GameSpecDoc parsing are represented as `unknown` and lowered through `compile-conditions`.
- Verification:
  - `npm run build` ✅
  - `npm run lint` ✅
  - `npm test` ✅
