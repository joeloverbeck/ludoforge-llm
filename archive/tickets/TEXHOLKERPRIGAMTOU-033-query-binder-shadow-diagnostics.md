# TEXHOLKERPRIGAMTOU-033: Query-Scoped Binder Shadow Diagnostics

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Dependencies**: TEXHOLKERPRIGAMTOU-032
**Blocks**: None

## Reassessed assumptions (2026-02-16)

1. Query-scoped binders already participate in lexical binding scope resolution (for example `nextPlayerByCondition.bind` and aggregate `bind`) via `compile-conditions` context propagation.
2. Effect-level binder shadow diagnostics (`CNL_COMPILER_BINDING_SHADOWED`) already exist in `compile-effects`, but equivalent warning emission is missing in `compile-conditions` for query-level binder declarations.
3. Binder-surface drift coverage already includes query binder declaration surfaces (including `query.nextPlayerByCondition.bind`) via the declarative contract + guard tests in `test/unit/binder-surface-registry.test.ts`; this ticket should not re-add duplicate registry guards.
4. Existing tests cover next-player lowering and binder validity, but do not assert shadow-warning behavior for query binders.

## Architectural reassessment

Adding query-binder shadow diagnostics is more beneficial than the current architecture because it makes capture-risk signaling consistent across binder declaration surfaces while preserving current runtime semantics.

Scope is intentionally narrow: extend compile-time warning diagnostics only. Do not introduce aliasing/back-compat behavior, name rewriting, or game-specific branches.

## 1) What should be added/changed

1. Extend `compile-conditions` lowering so query-level binder declarations emit `CNL_COMPILER_BINDING_SHADOWED` warnings when they shadow existing in-scope bindings.
2. Cover both query binder declaration surfaces currently lowered in `compile-conditions`:
- `nextPlayerByCondition.bind`
- aggregate `bind` (`sum`/`min`/`max`).
3. Keep warning-only semantics for shadowing (no renames, no behavior changes).
4. Keep binder-surface contract/registry behavior as-is unless tests show drift; avoid duplicate architecture.

## 2) Invariants that must pass

1. Query binder names that shadow outer scope generate deterministic warning diagnostics with stable code/path.
2. Non-shadowing query binder declarations produce no new warnings.
3. Lowered query/runtime semantics remain unchanged except for added diagnostics.
4. No aliasing/backward-compat shims are introduced.

## 3) Tests that must pass

1. Add/extend compile-lowering tests that intentionally shadow bindings in `nextPlayerByCondition` and aggregate query scopes and assert warning diagnostics.
2. Add/extend regression tests proving non-shadowing query binders compile without shadow warnings.
3. Keep binder-surface registry guard tests green (existing query-binder drift coverage).
4. Full repository gates:
- `npm run build`
- `npm run lint`
- `npm test`

## Outcome

- Completion date: 2026-02-16
- What changed:
- Reassessed and corrected scope before implementation: query binder drift guard coverage was already present, so implementation focused on missing compile-time shadow diagnostics in `compile-conditions`.
- Implemented warning diagnostics for query-level binder shadowing at:
  - `nextPlayerByCondition.bind`
  - `aggregate.bind` (`sum`/`min`/`max`)
- Added unit coverage for:
  - shadow warning emission for `nextPlayerByCondition.bind`
  - shadow warning emission for `aggregate.bind`
  - non-shadowing aggregate binder regression (no warning)
- Verification:
- `npm run build` passed
- `npm run lint` passed
- `npm test` passed
- Deviations vs original plan:
- Did not add new binder-surface drift tests because that coverage already existed and was verified green; avoiding duplicate architecture/tests was cleaner and more robust.
