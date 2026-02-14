# ARCHGSD-002 - Macro Hygiene and Binding Namespaces

**Status**: ✅ COMPLETED  
**Priority**: P0  
**Type**: Architecture / DSL Semantics  
**Depends on**: `ARCHGSD-001`

## Why this ticket exists
Effect macros currently expand by raw substitution (`src/cnl/expand-effect-macros.ts`) and do not isolate binder names across invocations. The compiler already validates lexical scope and unbound references (`src/cnl/compile-effects.ts`), but macro expansion itself has no hygiene layer, so repeated macro invocations can still collide on decision/binder names.

## Reassessed assumptions (current code/test reality)
- Lexical scoping already exists in lowering:
  - nested binder scopes (`forEach`, `let`, `rollRandom`, etc.) are tracked;
  - unbound references are compile errors;
  - binder shadowing is currently warning-only.
- Effect macros are expanded before lowering and currently:
  - substitute params recursively;
  - do not rename local binder names;
  - do not declare exported bindings;
  - can emit expanded effects that reuse the same bind names across invocations.
- Current test coverage includes macro expansion + compile flow, but does not cover hygienic binder renaming or macro export contracts.

## 1) Specification (updated scope)
- Introduce hygienic effect macro expansion semantics in `src/cnl/expand-effect-macros.ts`:
  - binder names declared inside a macro invocation are macro-local by default;
  - invocation-local binders are deterministically renamed with a macro namespace prefix;
  - references to those binders inside the same invocation are rewritten to the renamed symbol.
- Add explicit exported binding contract on macro definitions:
  - extend `EffectMacroDef` with `exports?: readonly string[]`;
  - only names listed in `exports` preserve caller-visible names;
  - non-exported binders are always renamed to invocation-local symbols.
- Add compile-time diagnostics for invalid macro export contracts:
  - exported name not declared as a macro binder => error;
  - duplicate export entries => error.
- Preserve determinism:
  - same source produces identical renamed bind IDs, decision names, and trace shape.
- No backward-compat aliases for old collision-prone behavior.

## 2) Invariants (must remain true)
- Two macros used in the same action pipeline cannot silently overwrite each other’s decision/binder names.
- Deterministic expansion: same source + seed produces identical choice IDs and trace structure.
- Existing non-colliding macros retain behavioral equivalence after migration.
- Runtime engine remains game-agnostic; hygiene is compiler/DSL behavior, not game-specific runtime logic.

## 3) Tests to add/modify
## New tests
- `test/unit/expand-effect-macros.test.ts`
  - add cases for invocation-local binder renaming;
  - add cases for explicit `exports` contract behavior;
  - add cases for invalid export diagnostics.
- `test/integration/effect-macro-compile.test.ts`
  - add end-to-end compile check that multiple macro invocations in one pipeline keep deterministic, non-colliding decision names.

## Existing tests/commands that must pass
- `npm run build`
- `npm run lint`
- `npm run test`
- `node --test dist/test/integration/fitl-card-flow-determinism.test.js`

## Outcome
- Completion date: 2026-02-14
- What changed:
  - Added hygienic decision-bind renaming in `src/cnl/expand-effect-macros.ts`.
  - Added explicit macro `exports` contract via `EffectMacroDef.exports` in `src/cnl/game-spec-doc.ts`.
  - Added export diagnostics (`EFFECT_MACRO_EXPORTS_INVALID`, `EFFECT_MACRO_EXPORT_DUPLICATE`, `EFFECT_MACRO_EXPORT_UNKNOWN_BINDING`).
  - Added/updated tests in `test/unit/expand-effect-macros.test.ts` and `test/integration/effect-macro-compile.test.ts`.
  - Updated production FITL macro data in `data/games/fire-in-the-lake.md` to explicitly export ambush template decision bindings.
- Deviations from earlier draft scope:
  - Did not enforce global compile-time decision-bind collision errors in `compile-effects`; that approach produced branch-scope false positives in production pipelines.
  - Hygiene now targets effect-macro decision binders (`chooseOne`/`chooseN`) where collisions materially impact move-param contracts.
  - Default export behavior is intentionally conservative: non-templated decision binds remain externally visible unless `exports` explicitly overrides.
- Verification:
  - `npm run lint` passed.
  - `npm test` passed.
  - `node --test dist/test/integration/fitl-card-flow-determinism.test.js` passed.
