# ARCHGSD-007 - Binder Surface Registry and Exhaustive Validation

**Status**: TODO  
**Priority**: P1  
**Type**: Architecture / Compiler Infrastructure  
**Depends on**: `ARCHGSD-005`

## Why this ticket exists
Binder behavior is spread across ad hoc logic. A universal game DSL needs a single authoritative registry of binder-declaring and binder-referencing fields.

## 1) Specification (what must change)
- Introduce an internal binder-surface registry in compiler code (shared by macro expansion + lowering checks).
- Registry must enumerate all binder-producing constructs currently supported (for example `chooseOne`, `chooseN`, `rollRandom`, `forEach`, `let`, `removeByPriority` family as applicable).
- Drive both hygiene rewriting and validation from this registry.
- Add an exhaustiveness test that fails when a new binder-capable AST node is added without registry updates.
- Keep runtime/kernel untouched and game-agnostic.

## 2) Invariants (must remain true)
- Binder handling is centralized and deterministic.
- Adding new binder-capable effects cannot silently bypass hygiene/validation.
- Game-specific behavior remains encoded in `GameSpecDoc`/data assets, not kernel.

## 3) Tests to add/modify
## New tests
- `test/unit/cnl/binder-surface-registry.test.ts`
  - validates registry coverage of current binder-producing/referencing nodes.
- `test/unit/expand-effect-macros.test.ts`
  - regression coverage for each registered binder class.

## Existing tests/commands that must pass
- `npm run build`
- `npm run lint`
- `npm test`
