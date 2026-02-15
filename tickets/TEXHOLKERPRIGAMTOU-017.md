# TEXHOLKERPRIGAMTOU-017: Runtime Asset Indexing and Precompiled Table Accessors

**Status**: TODO
**Priority**: HIGH
**Effort**: Medium
**Dependencies**: TEXHOLKERPRIGAMTOU-016
**Blocks**: TEXHOLKERPRIGAMTOU-018

## 1) What needs to be fixed/added

Eliminate repeated per-query asset lookup/path traversal by introducing precompiled runtime indexes/accessors.

Scope:
- Build a canonical runtime asset index (normalized id -> asset metadata/payload handle) during def/state setup.
- Build table accessor/index structures once (not during each `evalQuery` call).
- Update eval context to consume indexed structures.
- Remove repeated normalize/split/walk logic from hot runtime query paths.

Constraints:
- Deterministic behavior and ordering must remain identical to current semantics.
- No game-specific optimization paths.
- Keep runtime surface generic and data-driven.

## 2) Invariants that should pass

1. Query results are identical before/after indexing refactor.
2. Table row ordering remains deterministic.
3. Asset/table lookup is O(1) by id at runtime (or equivalent indexed behavior).
4. No additional mutable global state is introduced.

## 3) Tests that should pass

1. Unit: runtime index builder produces expected normalized keys and collisions behavior.
2. Unit: `assetRows` results unchanged versus baseline fixtures.
3. Unit: error behavior unchanged for missing assets/tables.
4. Performance test: repeated table queries show reduced overhead versus non-indexed path.
5. Regression: `npm run build`, `npm test`, `npm run lint`.
