# KERCONVALQUEEVA-010: Enforce `assetRows.cardinality` Even Without `where`

**Status**: TODO
**Priority**: HIGH
**Effort**: Small
**Dependencies**: KERCONVALQUEEVA-009

## 1) What needs to change/be added

- Fix `evalQuery` so `assetRows.cardinality` is enforced for all `assetRows` queries, including when `where` is omitted.
- Remove/adjust early-return behavior that bypasses cardinality checks when `where` is empty.
- Keep semantics generic:
  - `many` => unchanged behavior.
  - `exactlyOne` => throws on 0 or >1 rows.
  - `zeroOrOne` => throws on >1 rows.
- Keep deterministic runtime error contracts and context payloads.

## 2) Invariants that should pass

1. `cardinality: exactlyOne` always enforces exactly one result, regardless of `where` presence.
2. `cardinality: zeroOrOne` always enforces max-one result, regardless of `where` presence.
3. `cardinality: many` preserves current list behavior and does not throw cardinality errors.
4. Error codes and contexts remain deterministic and stable.

## 3) Tests that should pass

1. Unit (`eval-query`): `assetRows` + `exactlyOne` + no `where` throws `DATA_ASSET_CARDINALITY_MULTIPLE_MATCHES` when table has >1 rows.
2. Unit (`eval-query`): `assetRows` + `exactlyOne` + no `where` succeeds when table has exactly 1 row.
3. Unit (`eval-query`): `assetRows` + `exactlyOne` + no `where` throws `DATA_ASSET_CARDINALITY_NO_MATCH` when table has 0 rows.
4. Unit (`eval-query`): `assetRows` + `zeroOrOne` + no `where` throws on >1 and allows 0/1.
5. Regression: `npm run build`, `npm test`, `npm run lint`.
