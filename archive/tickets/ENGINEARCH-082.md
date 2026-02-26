# ENGINEARCH-082: Harden transfer-endpoint module boundary and narrow public API

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None - runner-only
**Deps**: None

## Problem

The `transfer-endpoint-utils` extraction improved separation of concerns, but its exported surface still includes low-level parser/guard helpers. That leaks internal parsing details and allows future call sites to bypass the canonical transfer-endpoint contract. Naming also still contains one generic artifact (`ScopeEndpointKind`) inside transfer-specific code.

## Assumption Reassessment (2026-02-26)

1. `packages/runner/src/model/transfer-endpoint-utils.ts` currently exports internal helpers (`invalidTransferEndpointScope`, `endpointPayloadMustBeObject`, `endpointVarNameMustBeString`, `asTransferEndpointPayloadObject`, `endpointVarNameAsString`) in addition to canonical entry points.
2. `packages/runner/test/model/transfer-endpoint-utils.test.ts` currently imports one internal helper directly (`endpointVarNameAsString`). This still reinforces a wider API than desired, but less than originally assumed.
3. `transfer-endpoint-utils.ts` currently imports `ScopeKind` from `model-utils.ts` and uses `ScopeEndpointKind` naming; this creates avoidable coupling between generic model helpers and transfer-specific internals.
4. `packages/runner/src/model/model-utils.ts` does not currently re-export transfer-endpoint utilities. No runtime bug exists there, but boundary intent should still be explicitly tested.
5. **Scope correction**: keep behavior and error strings unchanged; focus on API narrowing, transfer-local typing, and boundary tests.

## Architecture Reassessment

1. Narrowing exports to canonical operations (`normalizeTransferEndpoint`, `formatTransferEndpointDisplay`) and externally consumed transfer types improves encapsulation and prevents parser-level coupling.
2. Moving transfer scope typing local to the transfer module strengthens bounded context and keeps `model-utils` generic.
3. This change is strictly better than the current architecture for long-term extensibility: a smaller contract, fewer cross-module dependencies, and stronger anti-coupling tests.

## What to Change

### 1. Narrow transfer-endpoint-utils public API

- Make low-level parser/guard functions internal (non-exported).
- Keep only canonical transfer API and required externally consumed transfer types exported.
- Rename `ScopeEndpointKind` to transfer-specific naming (`TransferEndpointScopeKind`) as an internal transfer-domain type.

### 2. Decouple transfer scope typing from model-utils

- Replace imported `ScopeKind` in `transfer-endpoint-utils.ts` with a local transfer scope union.
- Ensure no functional behavior changes or error-message regressions.

### 3. Enforce architectural boundary in tests

- Refactor transfer-endpoint tests so behavior is validated through public entry points only.
- Add boundary assertion test ensuring `model-utils` does not expose transfer endpoint utilities.

## Files to Touch

- `packages/runner/src/model/transfer-endpoint-utils.ts` (modify)
- `packages/runner/test/model/transfer-endpoint-utils.test.ts` (modify)
- `packages/runner/test/model/model-utils.test.ts` (modify)

## Out of Scope

- Any change to transfer endpoint runtime semantics or error strings
- Any engine/kernel/schema changes
- Any visual-config or game-specific behavior changes
- Any back-compat aliases or shim exports

## Acceptance Criteria

### Tests That Must Pass

1. Transfer endpoint behavior remains unchanged for valid and invalid payloads/scopes.
2. Transfer-endpoint tests no longer import internal transfer parser/guard helpers.
3. Model-utils boundary test asserts transfer endpoint functions are not exposed from `model-utils`.
4. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Transfer endpoint logic has a minimal, explicit, transfer-scoped public API.
2. Generic model utilities and transfer endpoint utilities remain cleanly separated with no alias/back-compat exports.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/model/transfer-endpoint-utils.test.ts` - remove direct internal-helper import and preserve behavior/error coverage through public API entry points.
2. `packages/runner/test/model/model-utils.test.ts` - add boundary assertion that transfer endpoint utilities are not exported.

### Commands

1. `pnpm -F @ludoforge/runner test -- transfer-endpoint-utils model-utils translate-effect-trace trace-projection`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner lint`
4. `pnpm -F @ludoforge/runner typecheck`

## Outcome

- **Completion date**: 2026-02-26
- **What actually changed**:
  - `transfer-endpoint-utils` now keeps parser/guard helpers internal; only canonical transfer operations and externally consumed transfer types remain exported.
  - Transfer scope typing was localized to `transfer-endpoint-utils` (removed dependency on `model-utils` `ScopeKind`) and renamed to transfer-specific internal naming.
  - Transfer-endpoint tests no longer import internal parser/guard helpers.
  - Added explicit module-boundary assertion in `model-utils.test.ts` to ensure transfer utilities are not exposed there.
- **Deviations from original plan**:
  - `packages/runner/src/model/model-utils.ts` required no production-code changes; boundary enforcement was test-only.
  - Original assumption that multiple internal helpers were directly tested was corrected to one helper import.
- **Verification results**:
  - `pnpm -F @ludoforge/runner test -- transfer-endpoint-utils model-utils translate-effect-trace trace-projection` passed.
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
  - `pnpm -F @ludoforge/runner typecheck` passed.
