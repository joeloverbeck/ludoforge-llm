# ARCHGSD-015: Schema-Driven Binder Surface Rewriter Coverage

**Status**: TODO
**Priority**: MEDIUM
**Effort**: Large
**Dependencies**: TEXHOLKERPRIGAMTOU-015
**Blocks**: Reliable macro hygiene as AST surface grows

## 1) What needs to change/be added

Replace fragile hand-maintained binder referencer path coverage with a schema/contract-driven mechanism.

Scope:
- Define explicit binder-surface metadata as part of AST/query/ref schema ownership (single source of truth).
- Generate or centrally derive binder rewrite/collection paths from that metadata.
- Add a hard guard that fails tests/build when new binder-capable nodes are added without metadata.
- Migrate existing manual registry entries (`EFFECT_BINDER_SURFACES`, `NON_EFFECT_BINDER_REFERENCER_SURFACES`) to the new mechanism.

Out of scope:
- Continuing to patch individual missing paths ad hoc.

## 2) Invariants that must pass

1. Every binder declaration/reference surface is covered by rewrite + collection walkers.
2. Adding new AST/ref/query binder surfaces requires metadata updates and is enforced by tests.
3. Macro expansion hygiene is deterministic and non-game-specific.
4. No binder leakage or unbound-reference regressions caused by missing rewrite coverage.

## 3) Tests that must pass

1. Unit: generated/derived binder surface set matches supported AST/query/ref nodes.
2. Unit: binder rewrite handles representative paths (`binding`, `aggregate.bind`, `token refs`, `assetField.row`, zone selector templates).
3. Property: macro hygiene expansion remains deterministic under randomized binder names.
4. Regression: Texas production spec compile path continues to pass with strict binding validation.
5. Regression: `npm run build`, `npm test`, `npm run lint`.
