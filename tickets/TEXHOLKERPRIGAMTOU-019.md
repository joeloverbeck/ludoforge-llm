# TEXHOLKERPRIGAMTOU-019: Dedicated Runtime Error Taxonomy for Data-Asset Queries

**Status**: TODO
**Priority**: MEDIUM
**Effort**: Medium
**Dependencies**: TEXHOLKERPRIGAMTOU-010
**Blocks**: TEXHOLKERPRIGAMTOU-020

## 1) What needs to be fixed/added

Introduce dedicated runtime error codes for data-asset query/reference failures instead of overloading generic `MISSING_VAR`/`TYPE_MISMATCH` categories.

Scope:
- Add specific eval/runtime error codes (for example: asset missing, table missing, row shape invalid, field missing, field scalar mismatch).
- Update runtime throw sites and structured context payloads.
- Keep error reporting machine-readable and stable for simulator/tooling layers.
- Update diagnostics/tests to assert exact reason-code behavior.

Constraints:
- No game-specific error branching.
- Reason codes must remain stable once introduced.

## 2) Invariants that should pass

1. Data-asset runtime failures map to dedicated reason codes.
2. Error contexts include enough metadata for deterministic debugging (asset id, table id, field, row index when relevant).
3. Existing non-data-asset error codes remain unchanged.

## 3) Tests that should pass

1. Unit: each failure mode maps to the expected dedicated error code.
2. Unit: error context payloads include required keys.
3. Unit: unrelated eval paths keep existing reason codes.
4. Integration: simulator surfaces dedicated data-asset runtime reasons in failed action traces.
5. Regression: `npm run build`, `npm test`, `npm run lint`.
