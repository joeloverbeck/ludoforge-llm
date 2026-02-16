# TEXHOLKERPRIGAMTOU-026: Explicit Binding Lifecycle Contract (No Name-Based Scope Semantics)

**Status**: TODO
**Priority**: HIGH
**Effort**: Large
**Dependencies**: TEXHOLKERPRIGAMTOU-025
**Blocks**: TEXHOLKERPRIGAMTOU-027

## 1) What needs to change / be added

1. Define explicit binding lifecycle semantics in kernel/compiler contracts:
- lexical-only bindings
- exported bindings
- move-param bindings
- effect-produced bindings
2. Eliminate implicit `$`-prefix naming as the primary scope/export mechanism; naming may remain conventional but not semantic.
3. Update AST/schema/compiler lowering/runtime evaluation to use explicit binding scope metadata instead of inferred behavior.
4. Ensure all control-flow/effect forms that create bindings (`let`, `chooseOne`, `chooseN`, `commitResource.actualBind`, etc.) declare lifecycle behavior explicitly.
5. Keep migration strict (no backwards-compat aliasing); invalid legacy semantics should fail with diagnostics.

## 2) Invariants that should pass

1. Binding visibility/export behavior is determined only by explicit contract fields, never by string naming patterns.
2. Binding scope behavior is deterministic and identical across discovery and execution surfaces.
3. Binding collisions/shadowing rules are explicit and deterministic.
4. Game specs can express complex chained bindings without hidden scope leaks.
5. Kernel remains game-agnostic with no per-game binding logic.

## 3) Tests that should pass

1. Unit: schema/compiler validation tests rejecting missing/invalid binding lifecycle declarations.
2. Unit: control-flow binding scope tests for lexical, exported, and shadowed bindings.
3. Unit: effect-produced binding tests (`actualBind` and similar) under explicit lifecycle semantics.
4. Integration: representative GameSpec docs (Texas + at least one other game fixture) compile/run with explicit binding contracts.
5. Regression: `npm run build`, `npm test`, `npm run lint`.
