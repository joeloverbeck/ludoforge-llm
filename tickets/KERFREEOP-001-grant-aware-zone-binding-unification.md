# KERFREEOP-001: Unify grant-aware free-operation zone binding derivation

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/kernel/free-operation-grant-authorization.ts`, `packages/engine/src/kernel/free-operation-viability.ts`, `packages/engine/src/kernel/free-operation-discovery-analysis.ts`, shared preflight/binding helpers
**Deps**: `tickets/README.md`, `tickets/_TEMPLATE.md`, `packages/engine/src/kernel/free-operation-grant-authorization.ts`, `packages/engine/src/kernel/free-operation-viability.ts`, `packages/engine/src/kernel/free-operation-discovery-analysis.ts`, `packages/engine/src/kernel/action-applicability-preflight.ts`

## Problem

Free-operation zone-filter matching now depends on action-aware canonical bindings in one engine path, but not all of them. Authorization/discovery uses a new action-aware path, while viability probing still uses raw move params and neither path fully threads grant context such as `executeAsSeat` or `executionContext`. That can cause declarative free-operation grants to be admitted, suppressed, or filtered against the wrong action profile.

## Assumption Reassessment (2026-03-10)

1. Current code confirms `collectGrantMoveZoneCandidates()` in `free-operation-grant-authorization.ts` now derives candidates from action-aware bindings, not just raw `move.params`.
2. Current code also confirms `collectProbeMoveZoneCandidates()` in `free-operation-viability.ts` still derives candidates from raw `buildMoveRuntimeBindings(move)`, so viability and authorization can diverge.
3. Current grant-aware binding code does not thread `executionPlayerOverride` or `freeOperationOverlay` into `resolveActionApplicabilityPreflight()`. The corrected scope is to centralize zone-binding derivation behind one helper that accepts the full resolved grant context, not to patch each caller independently.

## Architecture Check

1. A single generic helper for "derive canonical move bindings and zone candidates for a free-operation grant" is cleaner than parallel authorization/probe implementations because it makes grant legality, event viability, and move probing share one contract.
2. This preserves the GameSpecDoc/GameDef boundary because FITL-specific card semantics remain in declarative grant data while the engine only exposes generic support for grant-aware canonicalization.
3. No backwards-compatibility aliases or shims should be introduced. Existing call sites should move to the unified helper directly.

## What to Change

### 1. Introduce a shared grant-aware binding resolver

Create a generic helper that:
- accepts `def`, `state`, `move`, and the pending grant context,
- resolves canonical pipeline bindings from the applicable action profile,
- supports grant-driven execution semantics such as `executeAsSeat` and `executionContext`,
- returns both resolved bindings and zone candidates for `moveZoneBindings` / `moveZoneProbeBindings`.

This helper should become the single source of truth for free-operation zone-candidate derivation.

### 2. Replace drifted callers

Update authorization, discovery, and viability probing to use the shared helper instead of separate ad hoc implementations. In particular:
- remove the duplicated probe-only binding logic from `free-operation-viability.ts`,
- make viability probing and authorization evaluate the same candidate zones for the same move/grant pair,
- keep the behavior generic across all games and all grant execution modes.

### 3. Add grant-context regression coverage

Add tests proving that zone-filter matching and viability behave identically when grants depend on:
- `executeAsSeat`,
- `executionContext`,
- canonical pipeline bindings that differ from raw `move.params`.

## Files to Touch

- `packages/engine/src/kernel/free-operation-grant-authorization.ts` (modify)
- `packages/engine/src/kernel/free-operation-viability.ts` (modify)
- `packages/engine/src/kernel/free-operation-discovery-analysis.ts` (modify)
- `packages/engine/src/kernel/action-applicability-preflight.ts` (modify if helper extraction needs a reusable surface)
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify)
- `packages/engine/test/unit/kernel/legal-moves.test.ts` (modify if helper-level unit coverage is needed)

## Out of Scope

- Re-encoding any FITL card event text or card data unrelated to free-operation zone-binding semantics.
- UI or visual-config changes.
- Backwards-compatibility compatibility layers for old helper call patterns.

## Acceptance Criteria

### Tests That Must Pass

1. A free-operation grant with `executeAsSeat` and `moveZoneBindings` evaluates the same candidate zones in viability probing and final authorization.
2. A free-operation grant with `executionContext` and `moveZoneBindings` evaluates the same candidate zones in viability probing and final authorization.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. There is exactly one engine-owned path for deriving canonical free-operation move bindings and zone candidates.
2. Grant-aware zone filtering remains fully game-agnostic and does not branch on FITL-specific identifiers or rules.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — add cross-checks for `executeAsSeat` and `executionContext` grants that use zone filters and move-zone bindings.
2. `packages/engine/test/unit/kernel/legal-moves.test.ts` — add targeted unit coverage if the new shared helper needs deterministic contract tests.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
3. `pnpm -F @ludoforge/engine test`
