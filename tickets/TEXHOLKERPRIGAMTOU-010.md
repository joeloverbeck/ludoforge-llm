# TEXHOLKERPRIGAMTOU-010: Generic Move-Domain Cardinality Controls for `intsInRange`

**Status**: TODO  
**Priority**: HIGH  
**Effort**: Medium  
**Dependencies**: None  
**Blocks**: TEXHOLKERPRIGAMTOU-011

## Problem

Current `intsInRange` expands every integer between `min..max`. In no-limit poker this creates thousands of `raise` moves per decision, which amplifies both `legalMoves()` runtime and `GreedyAgent` evaluation cost. This is a generic query-layer scaling issue, not a Texas-only issue.

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

### C. Keep this engine-generic

No poker-specific logic in kernel/eval-query.

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
- `test/unit/compile-conditions.test.ts` or relevant compiler tests
  - compile/lower paths preserve new fields without mutation.

### Regression suites

- `npm run build`
- `npm test`

## Out of Scope

- Do not add game-specific branching in kernel.
- Do not change Texas GameSpecDoc in this ticket.
