# KERFREEOP-001: Unify grant-aware free-operation zone binding derivation

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — neutral shared free-operation binding/preflight helper(s), `packages/engine/src/kernel/free-operation-grant-authorization.ts`, `packages/engine/src/kernel/free-operation-viability.ts`
**Deps**: `tickets/README.md`, `tickets/_TEMPLATE.md`, `packages/engine/src/kernel/free-operation-grant-authorization.ts`, `packages/engine/src/kernel/free-operation-viability.ts`, `packages/engine/src/kernel/free-operation-discovery-analysis.ts`, `packages/engine/test/unit/kernel/free-operation-probe-boundary-guard.test.ts`

## Problem

Free-operation zone-filter matching now depends on action-aware canonical bindings in one engine path, but not all of them. Authorization/discovery uses a new action-aware path, while viability probing still uses raw move params and neither path fully threads grant context such as `executeAsSeat` or `executionContext`. That can cause declarative free-operation grants to be admitted, suppressed, or filtered against the wrong action profile.

## Assumption Reassessment (2026-03-10)

1. Current code confirms `collectGrantMoveZoneCandidates()` in `free-operation-grant-authorization.ts` now derives candidates from action-aware bindings, not just raw `move.params`.
2. Current code also confirms `collectProbeMoveZoneCandidates()` in `free-operation-viability.ts` still derives candidates from raw `buildMoveRuntimeBindings(move)`, so viability and authorization can diverge.
3. Current authorization/discovery code still builds its canonical move bindings through a local helper that does not thread resolved grant execution context (`executeAsSeat` -> `executionPlayerOverride`, `executionContext` -> `freeOperationOverlay.grantContext`) into `resolveActionApplicabilityPreflight()`. Action-aware rebinding exists, but it is not yet fully grant-aware.
4. Current discovery analysis already consumes `collectGrantMoveZoneCandidates()` from authorization. The behavioral split is between authorization/discovery and viability probing; discovery may not need a direct logic change if both callers converge on one neutral helper.
5. Current unit architecture guard (`packages/engine/test/unit/kernel/free-operation-probe-boundary-guard.test.ts`) explicitly forbids `free-operation-viability.ts` from importing `free-operation-grant-authorization.ts` directly. Any unification must therefore happen through a shared helper module, not by adding a one-way dependency from viability to authorization.

## Architecture Check

1. A single neutral helper for "derive canonical move bindings and zone candidates for a free-operation grant" is cleaner than parallel authorization/probe implementations because it makes grant legality, event viability, and move probing share one contract without violating current module-boundary guards.
2. This preserves the GameSpecDoc/GameDef boundary because FITL-specific card semantics remain in declarative grant data while the engine only exposes generic support for grant-aware canonicalization.
3. No backwards-compatibility aliases or shims should be introduced. Existing call sites should move to the unified helper directly.
4. Do not broaden this into a general `legal-moves.ts` refactor unless the same shared helper materially reduces duplication there too. The bug is specifically about free-operation grant binding derivation parity.

## What to Change

### 1. Introduce a neutral shared grant-aware binding resolver

Create a generic helper that:
- accepts `def`, `state`, `move`, and the pending grant context,
- resolves canonical pipeline bindings from the applicable action profile,
- supports grant-driven execution semantics such as `executeAsSeat` and `executionContext`,
- returns both resolved bindings and zone candidates for `moveZoneBindings` / `moveZoneProbeBindings`.

This helper should live in a shared kernel module that both authorization and viability can import without crossing the existing boundary guard.

### 2. Replace drifted callers

Update authorization and viability probing to use the shared helper instead of separate ad hoc implementations. In particular:
- remove the duplicated probe-only binding logic from `free-operation-viability.ts`,
- make viability probing and authorization evaluate the same candidate zones for the same move/grant pair,
- keep discovery behavior aligned by continuing to consume the authorization surface or by switching it to the same shared helper if that is the smaller change,
- keep the behavior generic across all games and all grant execution modes.

### 3. Add grant-context regression coverage

Add tests proving that zone-filter matching and viability behave identically when grants depend on:
- `executeAsSeat`,
- `executionContext`,
- canonical pipeline bindings that differ from raw `move.params`,
- issue-time usability policies (`requireUsableAtIssue` / `requireUsableForEventPlay`) that currently rely on viability probing rather than final authorization alone.

## Files to Touch

- new shared kernel helper for free-operation binding/preflight derivation (add)
- `packages/engine/src/kernel/free-operation-grant-authorization.ts` (modify)
- `packages/engine/src/kernel/free-operation-viability.ts` (modify)
- `packages/engine/src/kernel/free-operation-discovery-analysis.ts` (modify only if needed to adopt the shared helper cleanly)
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify)
- `packages/engine/test/unit/kernel/free-operation-probe-boundary-guard.test.ts` (modify if the shared-helper boundary needs an explicit guard)

## Out of Scope

- Re-encoding any FITL card event text or card data unrelated to free-operation zone-binding semantics.
- UI or visual-config changes.
- Backwards-compatibility compatibility layers for old helper call patterns.

## Acceptance Criteria

### Tests That Must Pass

1. A free-operation grant with `executeAsSeat` and `moveZoneBindings` evaluates the same candidate zones in viability probing and final authorization.
2. A free-operation grant with `executionContext` and `moveZoneBindings` evaluates the same candidate zones in viability probing and final authorization.
3. A grant gated by `requireUsableAtIssue` or `requireUsableForEventPlay` does not diverge from final authorization when canonical bindings depend on grant context.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. There is exactly one engine-owned path for deriving canonical free-operation move bindings and zone candidates.
2. Grant-aware zone filtering remains fully game-agnostic and does not branch on FITL-specific identifiers or rules.
3. The final design preserves the existing module-boundary rule that viability must not depend directly on authorization.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — add cross-checks for `executeAsSeat` and `executionContext` grants that use zone filters and move-zone bindings, including issue-time viability policies.
2. `packages/engine/test/unit/kernel/free-operation-probe-boundary-guard.test.ts` — strengthen the architecture guard if a new neutral helper module becomes the canonical dependency boundary.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
3. `node packages/engine/dist/test/unit/kernel/free-operation-probe-boundary-guard.test.js`
4. `pnpm -F @ludoforge/engine test`

## Outcome

- Added a neutral shared helper module for grant-aware canonical binding and zone-candidate derivation, then switched authorization and viability probing to use it without introducing a direct viability -> authorization dependency.
- Broadened the implementation into `legal-moves.ts` because that path was still reconstructing pending-grant execution semantics locally. `legal-moves` now resolves effective execution players and free-operation preflight overlays through the same shared helpers, removing another architectural drift point instead of preserving it.
- Extended the preflight overlay helper so callers can explicitly opt out of forced `skipPhaseCheck`, which lets `legal-moves` reuse the same generic overlay builder without reintroducing ad hoc grant-preflight objects.
- Added a hard integration regression for `executeAsSeat` plus `requireUsableAtIssue` plus `moveZoneBindings`, plus focused unit coverage for `executionContext`, overlay phase-gating behavior, and the architecture boundary that now keeps `legal-moves` on the shared helper path.
