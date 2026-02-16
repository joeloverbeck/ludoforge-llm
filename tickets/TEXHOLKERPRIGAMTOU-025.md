# TEXHOLKERPRIGAMTOU-025: Unify Effect Semantics for Discovery vs Execution

**Status**: TODO
**Priority**: HIGH
**Effort**: Large
**Dependencies**: TEXHOLKERPRIGAMTOU-024
**Blocks**: TEXHOLKERPRIGAMTOU-026, TEXHOLKERPRIGAMTOU-027

## 1) What needs to change / be added

1. Replace the current split semantics between `legalChoices` effect walking and runtime effect dispatch with a shared effect interpreter core.
2. Introduce explicit interpreter mode at the kernel level:
- `discovery` mode for parameter/choice probing
- `execution` mode for actual state mutation execution
3. Move control-flow traversal (`if`, `let`, `forEach`, `reduce`, `removeByPriority`) into the shared interpreter so both surfaces use identical binding/state progression semantics.
4. Preserve game-agnosticity: do not add game-specific exceptions, hooks, or branches.
5. Remove redundant ad-hoc traversal logic from `legalChoices` once parity is achieved.

## 2) Invariants that should pass

1. Discovery and execution evaluate identical effect semantics for all non-random branches, differing only by declared mode behavior.
2. Binding propagation/scoping rules are identical across legal discovery and runtime apply paths.
3. No game-specific behavior is introduced in kernel interpreter logic.
4. Determinism remains stable for identical seed + inputs.
5. Runtime errors surfaced by malformed effect graphs are consistent across surfaces.

## 3) Tests that should pass

1. Unit: interpreter mode contract tests for each effect family (`choose*`, control-flow, resource, var, lifecycle).
2. Unit: parity matrix tests proving equal binding/state outcomes between `legalChoices` discovery and execution simulation for equivalent inputs.
3. Unit: regression test for let-scoped binder exports (including effect-produced binders like `actualBind`).
4. Integration: Texas and at least one non-Texas fixture path to confirm no game-specific coupling/regressions.
5. Regression: `npm run build`, `npm test`, `npm run lint`.
