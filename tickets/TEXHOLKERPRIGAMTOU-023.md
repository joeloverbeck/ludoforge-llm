# TEXHOLKERPRIGAMTOU-023: Canonical Binder Hygiene Walker for Macro Expansion

**Status**: TODO
**Priority**: HIGH
**Effort**: Medium
**Dependencies**: TEXHOLKERPRIGAMTOU-018
**Blocks**: none

## 1) What needs to change / be added

1. Replace ad hoc binder declaration/reference rewrites in macro expansion with one canonical AST-driven binder hygiene walker.
2. Centralize binder-surface ownership in one registry that covers:
- declared binders (for example `bind`, `itemBind`, `accBind`, aggregate binders)
- binding references (`ref: binding`, selector binding sites, template placeholders)
3. Ensure macro expansion uses this single walker for:
- local binder renaming
- leak detection
- unresolved template detection
4. Remove duplicated/manual rewrite branches that can drift when new AST shapes are added.
5. Add guardrails so introducing a new binder-bearing AST node requires touching the central registry (failing tests if omitted).

## 2) Invariants that should pass

1. Binder hygiene rewrite is complete and deterministic across all binder-bearing AST shapes.
2. No non-exported local binder leaks after macro expansion.
3. No unresolved local binding templates survive expansion.
4. Adding new binder-bearing effect/value/query shapes cannot silently bypass hygiene rewriting.
5. Macro expansion behavior remains game-agnostic and independent of any specific game YAML.

## 3) Tests that should pass

1. Unit: macro expansion rewrites declaration + references for all supported binder surfaces, including aggregate binders.
2. Unit/property: macro hygiene property tests continue to pass and detect leaks/templates deterministically.
3. Unit: negative test that simulates missing registry coverage for a binder surface and fails deterministically.
4. Integration: compile integration test(s) with nested macros and mixed binder surfaces (effects + value expressions + queries).
5. Regression: `npm run build`, `npm test`, `npm run lint`.
