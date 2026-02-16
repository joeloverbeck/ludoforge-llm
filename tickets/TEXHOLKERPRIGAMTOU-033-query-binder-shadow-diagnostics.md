# TEXHOLKERPRIGAMTOU-033: Query-Scoped Binder Shadow Diagnostics

**Status**: TODO
**Priority**: MEDIUM
**Effort**: Medium
**Dependencies**: TEXHOLKERPRIGAMTOU-032
**Blocks**: None

## Problem

Query-scoped binders (including `nextPlayerByCondition.bind`) currently participate in scope but do not emit shadow diagnostics consistently with effect-level binders. This inconsistency increases capture risk in large GameSpecDoc logic blocks.

## 1) What should be added/changed

1. Extend binder-scope diagnostics so query-level binder declarations emit shadow warnings when they capture existing in-scope bindings.
2. Ensure behavior is consistent with existing effect binder shadow policies.
3. Keep warning-only semantics for shadowing (do not silently rewrite names).
4. Update binder-surface coverage so drift tests include the query-binder diagnostic path.

## 2) Invariants that must pass

1. Query binder names that shadow outer scope generate deterministic warning diagnostics.
2. Non-shadowing binder declarations produce no new warnings.
3. Diagnostics include stable codes and precise paths.
4. Lowered/query runtime semantics remain unchanged except for added diagnostics.

## 3) Tests that must pass

1. Add/extend compile-lowering tests that intentionally shadow bindings in query scopes and assert warning diagnostics.
2. Add/extend binder-surface registry tests to ensure query binder surfaces remain synchronized with AST union definitions.
3. Add/extend regression tests proving non-shadowing query binders compile without warnings.
4. Full repository gates:
- `npm run build`
- `npm run lint`
- `npm test`
