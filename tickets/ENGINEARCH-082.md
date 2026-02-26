# ENGINEARCH-082: Harden transfer-endpoint module boundary and narrow public API

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None - runner-only
**Deps**: None

## Problem

The new `transfer-endpoint-utils` module correctly extracts transfer endpoint behavior, but its exported surface is still broader than needed and includes low-level parser/guard helpers. This allows future call sites to couple to internal parsing primitives instead of the canonical transfer endpoint contract. Naming also still contains one generic artifact (`ScopeEndpointKind`) inside transfer-specific code.

## Assumption Reassessment (2026-02-26)

1. `packages/runner/src/model/transfer-endpoint-utils.ts` currently exports internal helpers (`invalidTransferEndpointScope`, `endpointPayloadMustBeObject`, `endpointVarNameMustBeString`, `asTransferEndpointPayloadObject`, `endpointVarNameAsString`) in addition to public entry points.
2. `packages/runner/test/model/transfer-endpoint-utils.test.ts` currently tests some of those internal helpers directly, reinforcing an overly wide public API.
3. `transfer-endpoint-utils.ts` currently imports `ScopeKind` from `model-utils.ts` and uses `ScopeEndpointKind` naming, which partially weakens the intended bounded context.
4. **Mismatch + correction**: extraction happened, but architectural encapsulation is incomplete. Scope should be tightened to a minimal, transfer-specific public API plus boundary-enforcement tests.

## Architecture Check

1. Restricting exports to canonical public transfer operations (`normalizeTransferEndpoint`, `formatTransferEndpointDisplay`) yields a cleaner, more robust API and prevents accidental partial-parser coupling.
2. Keeping transfer scope typing local to the transfer module avoids unnecessary cross-module coupling and strengthens separations between generic model helpers and transfer-domain helpers.
3. This remains runner model-layer work, game-agnostic, with no GameSpecDoc/GameDef leakage and no compatibility aliases/shims.

## What to Change

### 1. Narrow transfer-endpoint-utils public API

- Make low-level parser/guard functions internal (non-exported).
- Keep only canonical public transfer API/types exported (as actually needed by call sites).
- Rename `ScopeEndpointKind` to transfer-specific naming (`TransferEndpointScopeKind`).

### 2. Decouple transfer scope typing from model-utils

- Replace imported `ScopeKind` with local transfer scope union in `transfer-endpoint-utils.ts`.
- Ensure no functional behavior changes or error-message regressions.

### 3. Enforce architectural boundary in tests

- Refactor tests so they validate behavior through public entry points, not internal helpers.
- Add boundary assertion test to ensure `model-utils` does not expose transfer endpoint utilities.

## Files to Touch

- `packages/runner/src/model/transfer-endpoint-utils.ts` (modify)
- `packages/runner/src/model/model-utils.ts` (modify or test-only impact if unchanged)
- `packages/runner/test/model/transfer-endpoint-utils.test.ts` (modify)
- `packages/runner/test/model/model-utils.test.ts` (modify)

## Out of Scope

- Any change to transfer endpoint runtime semantics or error strings
- Any engine/kernel/schema changes
- Any visual-config or game-specific behavior changes

## Acceptance Criteria

### Tests That Must Pass

1. Transfer endpoint behavior remains unchanged for valid and invalid payloads/scopes.
2. Tests no longer rely on direct imports of internal transfer parser/guard helpers.
3. Model-utils boundary test asserts transfer endpoint functions are not exposed from `model-utils`.
4. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Transfer endpoint logic has a minimal, explicit, transfer-scoped public API.
2. Generic model utilities and transfer endpoint utilities remain cleanly separated with no alias/back-compat exports.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/model/transfer-endpoint-utils.test.ts` - shift assertions to public API entry points only; preserve full behavior/error coverage.
2. `packages/runner/test/model/model-utils.test.ts` - add boundary assertion that transfer endpoint utilities are not exported.

### Commands

1. `pnpm -F @ludoforge/runner test -- model-utils transfer-endpoint-utils trace-projection translate-effect-trace`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner lint`
4. `pnpm -F @ludoforge/runner typecheck`
