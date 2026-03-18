# CNLDIAG-001: Emit targeted diagnostic when `op: in` condition uses `left`/`right` instead of `item`/`set`

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/src/cnl/compile-conditions-conditions.ts`
**Deps**: `packages/engine/src/cnl/compile-conditions-conditions.ts`, `packages/engine/src/cnl/compiler-diagnostic-codes.ts`

## Problem

The condition DSL has two families of binary operators with different field name conventions:

| Operator family | Fields | Examples |
|----------------|--------|----------|
| Comparison | `left`, `right` | `==`, `!=`, `<`, `<=`, `>`, `>=` |
| Membership | `item`, `set` | `in` |

When a GameSpec author writes `{ op: in, left: ..., right: [...] }` (using comparison-style fields for a membership operator), the compiler emits:

```
[error] CNL_COMPILER_MISSING_CAPABILITY at ...filter.args.0.item: Cannot lower value expression to kernel AST: undefined.
[error] CNL_COMPILER_MISSING_CAPABILITY at ...filter.args.0.set: Cannot lower value expression to kernel AST: undefined.
```

This error is correct but misleading — it says `item` and `set` are `undefined` without explaining that the author likely used `left`/`right` instead. The author's mental model is "I used `op: in` and provided operands, but it doesn't work." The error gives no hint about the field name mismatch.

This exact mistake was made during Easter Offensive implementation, causing a detour into a verbose `op: or` workaround.

## Assumption Reassessment (2026-03-18)

1. The condition lowering for `op: in` is at `compile-conditions-conditions.ts` lines 109-120. It reads `source.item` and `source.set` directly, with no fallback to `source.left`/`source.right`.
2. The `lowerValueNode(undefined, ...)` call produces the generic `CNL_COMPILER_MISSING_CAPABILITY` diagnostic, which doesn't mention the field name mismatch.
3. No existing diagnostic code covers this specific case. A new diagnostic code is needed.

## Architecture Check

1. **Cleaner than alternatives**: This is a targeted diagnostic improvement in the compiler's condition lowering path. No fallback aliasing (`left` → `item`) is introduced — the correct fix is for the author to use `item`/`set`, and the diagnostic guides them there. This preserves the intentional distinction between comparison and membership operators in the AST type system.
2. **GameDef/runtime agnostic boundary preserved**: This change is entirely within the CNL compiler (`packages/engine/src/cnl/`). No kernel, runtime, or GameSpecDoc changes.
3. **No backwards-compatibility aliasing**: The compiler does NOT accept `left`/`right` for `op: in`. It emits a clear error explaining the correct field names. This is the clean approach — one canonical syntax per operator, with helpful diagnostics when the wrong syntax is used.

## What to Change

### 1. Add a new diagnostic code

In `compiler-diagnostic-codes.ts`, add a new code:

```typescript
CNL_COMPILER_CONDITION_MEMBERSHIP_FIELD_MISMATCH: 'CNL_COMPILER_CONDITION_MEMBERSHIP_FIELD_MISMATCH',
```

### 2. Detect `left`/`right` on `op: in` and emit targeted diagnostic

In `compile-conditions-conditions.ts`, inside the `case 'in':` block (lines 109-120), add detection before the `lowerValueNode` calls:

```typescript
case 'in': {
  // Detect common authoring mistake: using comparison fields for membership operator
  if (source.item === undefined && (source.left !== undefined || source.right !== undefined)) {
    return {
      value: null,
      diagnostics: [{
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_CONDITION_MEMBERSHIP_FIELD_MISMATCH,
        path,
        severity: 'error',
        message: `Condition "op: in" requires "item" and "set" fields, not "left" and "right". `
          + `Use: { op: in, item: <value-to-test>, set: <array-or-value-expr> }.`,
        suggestion: 'Rename "left" to "item" and "right" to "set".',
      }],
    };
  }
  const item = runtime.lowerValueNode(source.item, context, `${path}.item`);
  // ... rest unchanged
}
```

This early return avoids the confusing downstream "undefined" errors entirely.

### 3. Consider symmetric check for comparison operators

For completeness, the comparison operator cases (`==`, `!=`, `<`, etc.) could similarly detect `item`/`set` fields and suggest `left`/`right`. This is the same class of mistake in reverse. Implementation follows the same pattern.

## Files to Touch

- `packages/engine/src/cnl/compiler-diagnostic-codes.ts` (modify — add new code)
- `packages/engine/src/cnl/compile-conditions-conditions.ts` (modify — add detection logic)

## Out of Scope

- Accepting `left`/`right` as aliases for `item`/`set` (this would blur the clean operator-family distinction)
- Adding `op: in` support to value expressions (membership is a condition concept, not a value computation)
- GameSpecDoc YAML changes (the fix is in the compiler diagnostic, not in game data)

## Acceptance Criteria

### Tests That Must Pass

1. Unit test: `op: in` with `left`/`right` emits `CNL_COMPILER_CONDITION_MEMBERSHIP_FIELD_MISMATCH` error with actionable message
2. Unit test: `op: in` with correct `item`/`set` continues to compile successfully
3. Unit test: comparison operator (`==`) with `item`/`set` emits symmetric mismatch error (if symmetric check is implemented)
4. Existing suite: `pnpm turbo test --force`

### Invariants

1. `op: in` with `item`/`set` behavior is unchanged
2. No new operator aliases or fallback logic introduced
3. Diagnostic message includes the correct field names and a concrete usage example

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cnl/compile-conditions-membership-fields.test.ts` — Verifies targeted diagnostic for field name mismatch on `op: in`, and confirms correct syntax still compiles.

### Commands

1. `node --test dist/test/unit/cnl/compile-conditions-membership-fields.test.js` (targeted)
2. `pnpm turbo test --force && pnpm turbo lint && pnpm turbo typecheck` (full verification)

## Outcome

- **Completion date**: 2026-03-18
- **What changed**:
  - `packages/engine/src/cnl/compiler-diagnostic-codes.ts` — added `CNL_COMPILER_CONDITION_MEMBERSHIP_FIELD_MISMATCH` and `CNL_COMPILER_CONDITION_COMPARISON_FIELD_MISMATCH` diagnostic codes
  - `packages/engine/src/cnl/compile-conditions-conditions.ts` — added early detection in `case 'in':` for `left`/`right` fields and in comparison operators for `item`/`set` fields, emitting targeted diagnostics before the confusing `undefined` cascade
  - `packages/engine/test/unit/cnl/compile-conditions-membership-fields.test.ts` — 6 new tests covering both mismatch directions and happy paths
- **Deviations**: none — all deliverables implemented as specified, including the symmetric check (ticket item 3)
- **Verification**: 4978 tests pass, lint clean, typecheck clean
