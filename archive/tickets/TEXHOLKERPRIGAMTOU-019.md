# TEXHOLKERPRIGAMTOU-019: Dedicated Runtime Error Taxonomy for Data-Asset Queries

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Dependencies**: TEXHOLKERPRIGAMTOU-010
**Blocks**: TEXHOLKERPRIGAMTOU-020

## 1) What needs to be fixed/added

Introduce dedicated eval/runtime error codes for data-asset query/reference failures instead of overloading generic `MISSING_VAR`/`TYPE_MISMATCH` categories.

Current code assumptions (reassessed):
- `assetRows` runtime-table failures are currently emitted from `src/kernel/eval-query.ts` as generic `MISSING_VAR`/`TYPE_MISMATCH`.
- `assetField` runtime-table failures are currently emitted from `src/kernel/resolve-ref.ts` as generic `MISSING_VAR`/`TYPE_MISMATCH`.
- Action actor/executor resolution currently treats `MISSING_VAR` as "outside player count" not-applicable; this must remain stable and must not accidentally absorb data-asset failures.
- There is no existing simulator failed-action-trace contract that asserts eval error reason codes for these paths; coverage belongs primarily in kernel unit tests.

Scope:
- Add specific `EvalErrorCode` members for data-asset table/query/reference failures (for example: asset missing, table contract missing, table-path missing/invalid, row shape invalid, field declaration missing, field value missing/type mismatch).
- Update shared error helpers and runtime throw sites in both query (`assetRows`) and reference (`assetField`) paths.
- Keep error payloads machine-readable with stable metadata keys (`tableId`, `assetId`, `tablePath`, `field`, `row`, `rowIndex`, and path-segment metadata when relevant).
- Preserve non-data-asset eval behavior and reason codes.
- Update tests to assert exact reason-code behavior and structured context keys.

Constraints:
- No game-specific error branching.
- Reason codes must remain stable once introduced.

## 2) Invariants that should pass

1. Data-asset runtime failures (`assetRows` and `assetField`) map to dedicated reason codes rather than generic `MISSING_VAR`/`TYPE_MISMATCH`.
2. Error contexts include enough metadata for deterministic debugging (`assetId`, `tableId`, `tablePath`, `field`, `row`, `rowIndex`, segment metadata where relevant).
3. Existing non-data-asset error codes remain unchanged.
4. Action actor/executor not-applicable behavior for out-of-range player selectors remains unchanged.

## 3) Tests that should pass

1. Unit (`test/unit/eval-query.test.ts`): each `assetRows` failure mode maps to expected dedicated code.
2. Unit (`test/unit/resolve-ref.test.ts`): `assetField` failure modes map to expected dedicated code.
3. Unit (`test/unit/eval-error.test.ts`): new codes are constructible/guarded by canonical helpers.
4. Unit: structured context payloads include required keys for representative `assetRows`/`assetField` failures.
5. Unit: unrelated eval paths keep existing reason codes.
6. Regression: `npm run build`, `npm test`, `npm run lint`.

## Outcome

- Completion date: 2026-02-15
- What changed:
  - Added dedicated `EvalErrorCode` taxonomy for data-asset query/reference failures (`DATA_ASSET_*` codes).
  - Added shared runtime-table-to-eval-error mapping helpers so `assetRows` (`eval-query`) and `assetField` (`resolve-ref`) use consistent codes and context payloads.
  - Updated unit tests for `eval-query`, `resolve-ref`, and `eval-error` to assert dedicated codes and required context keys.
- Deviations from original plan:
  - Replaced the proposed simulator failed-action-trace assertion with explicit kernel unit coverage, because this codepath does not expose a stable simulator reason-code contract for eval errors.
  - Expanded scope to include `assetField` reference failures in addition to `assetRows` query failures to keep architecture consistent across data-asset access surfaces.
- Verification:
  - `npm run build` passed.
  - `npm test` passed.
  - `npm run lint` passed.
