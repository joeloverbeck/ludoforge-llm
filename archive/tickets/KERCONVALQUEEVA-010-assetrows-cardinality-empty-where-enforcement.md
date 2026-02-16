# KERCONVALQUEEVA-010: Enforce `assetRows.cardinality` Even Without `where`

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Dependencies**: KERCONVALQUEEVA-009 (completed; archived)

## Assumption Reassessment (2026-02-16)

- Confirmed discrepancy in runtime code:
  - `src/kernel/eval-query.ts` currently returns early in `evalAssetRowsQuery` when `where` is omitted, which bypasses `cardinality` checks.
- Confirmed discrepancy in test assumptions:
  - Existing `assetRows` cardinality tests in `test/unit/eval-query.test.ts` only exercise `cardinality` with non-empty `where`.
  - No existing unit test currently asserts `cardinality` behavior when `where` is omitted.
- Architectural reassessment:
  - Proposed change remains beneficial vs current architecture because it restores invariant enforcement at the query boundary without adding game-specific logic.
  - Keep implementation generic by running cardinality validation against the final matched row set for both filtered and unfiltered paths, instead of introducing special-case branches.

## 1) What needs to change/be added

- Fix `evalAssetRowsQuery` so `assetRows.cardinality` is enforced for all `assetRows` queries, including when `where` is omitted.
- Adjust early-return behavior so unfiltered queries still flow through cardinality validation.
- Keep semantics generic:
  - `many` => unchanged behavior.
  - `exactlyOne` => throws on 0 or >1 rows.
  - `zeroOrOne` => throws on >1 rows.
- Keep deterministic runtime error contracts and context payloads.
- Keep behavior engine-agnostic and data-driven; do not introduce game-specific special cases.

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
5. Unit regression (`eval-query`): existing `where`-based cardinality tests remain passing.
6. Regression: `npm run build`, `npm test`, `npm run lint`.

## Outcome

- Completion date: 2026-02-16
- What changed:
  - Updated `src/kernel/eval-query.ts` to remove the `assetRows` no-`where` early-return bypass and enforce cardinality over both filtered and unfiltered row sets.
  - Added explicit no-`where` cardinality coverage in `test/unit/eval-query.test.ts` for:
    - `exactlyOne` with 0, 1, and >1 rows,
    - `zeroOrOne` with 0, 1, and >1 rows.
  - Reassessed and corrected ticket assumptions/scope before implementation.
- Deviations from original plan:
  - No functional deviation; scope stayed focused on runtime-cardinality enforcement and test hardening.
  - Expanded tests beyond minimum throw-path checks to also assert success paths for both cardinality modes.
- Verification results:
  - `npm run build` passed.
  - `node --test dist/test/unit/eval-query.test.js` passed.
  - `npm test` passed.
  - `npm run lint` passed.
