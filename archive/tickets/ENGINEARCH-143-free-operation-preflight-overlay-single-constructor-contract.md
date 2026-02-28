# ENGINEARCH-143: Free-Operation Preflight Overlay Single-Constructor Contract

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel free-operation preflight context construction ownership
**Deps**: archive/tickets/ENGINEARCH-135-apply-move-free-operation-preflight-zone-filter-contract-parity.md, archive/tickets/ENGINEARCH-136-canonical-free-operation-analysis-api-without-legacy-overlaps.md, archive/tickets/ENGINEARCH-142-free-operation-denial-precedence-parity-before-pipeline-preflight.md

## Problem

Free-operation preflight context overlay fields (`executionPlayerOverride`, `freeOperationZoneFilter`, diagnostics payload) are currently assembled at multiple call sites (`applyMove`, `legalChoicesDiscover`). This duplication increases drift risk for strict/discovery parity and makes future policy extensions fragile.

## Assumption Reassessment (2026-02-28)

1. Confirmed: both strict (`applyMove`) and discovery (`legalChoicesDiscover`) thread free-operation preflight context into `resolveActionApplicabilityPreflight`, and both still assemble the overlay inline.
2. Confirmed: overlay assembly is duplicated with two local shapes (`MoveFreeOperationAnalysis` direct mapping in `apply-move.ts` and `DiscoveryFreeOperationAnalysis` remapping in `legal-choices.ts`), so contract edits currently require parallel maintenance.
3. Discrepancy corrected: there is no standalone `free-operation-*analysis` helper module; canonical discovery analysis originates from `packages/engine/src/kernel/turn-flow-eligibility.ts`.
4. Discrepancy corrected: existing tests cover behavior (zone-filter threading, executeAsSeat preflight effects), but no dedicated constructor-level contract test currently protects overlay-shape ownership.

## Architecture Reassessment

1. A canonical overlay constructor is more robust than call-site object literals because it creates one ownership point for the `executionPlayerOverride` + zone-filter diagnostics contract.
2. This keeps architecture cleaner without over-abstracting preflight itself: only the duplicated free-operation overlay assembly is centralized, while surface-specific denial mapping remains local and explicit.
3. The change is kernel-only and game-agnostic; no game-specific identifiers or branches are introduced.
4. No backward-compatibility aliases/shims: migrate both call sites directly to the canonical helper and remove duplicate local shaping.

## Updated Scope

### 1. Introduce a canonical free-operation preflight overlay builder

Add a kernel helper that accepts canonical discovery analysis output plus diagnostics surface context and returns the free-operation preflight overlay fields used by `resolveActionApplicabilityPreflight`.

### 2. Migrate strict/discovery call sites

Update `packages/engine/src/kernel/apply-move.ts` and `packages/engine/src/kernel/legal-choices.ts` to consume the shared builder instead of manual overlay assembly/local adapter interfaces.

### 3. Add contract tests for overlay construction

Add focused kernel unit tests that fail if required overlay fields (execution override, zone filter, diagnostics source/action/params) drift by surface or by presence/absence of zone filters.

## Files to Touch

- `packages/engine/src/kernel/free-operation-preflight-overlay.ts` (new)
- `packages/engine/src/kernel/apply-move.ts` (modify)
- `packages/engine/src/kernel/legal-choices.ts` (modify)
- `packages/engine/test/unit/kernel/free-operation-preflight-overlay.test.ts` (new)
- `packages/engine/test/unit/kernel/apply-move.test.ts` / `packages/engine/test/unit/kernel/legal-choices.test.ts` (behavior preserved; no mandatory net-new cases unless regression appears)

## Out of Scope

- Free-operation denial taxonomy changes.
- Turn-flow gameplay semantics changes.
- Any GameSpecDoc or visual-config changes.

## Acceptance Criteria

### Tests That Must Pass

1. Strict and discovery preflight overlay fields are produced by one canonical constructor.
2. Required overlay fields remain parity-locked across surfaces for equivalent analysis input.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Free-operation preflight overlay contract has one ownership point in kernel code.
2. Engine/runtime remains game-agnostic and data-driven.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/free-operation-preflight-overlay.test.ts` (new) — assert canonical constructor output by surface and by zone-filter presence.
2. `packages/engine/test/unit/kernel/apply-move.test.ts` and `packages/engine/test/unit/kernel/legal-choices.test.ts` (existing) — verify call-site behavior remains unchanged after consolidation.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/free-operation-preflight-overlay.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/apply-move.test.js`
4. `node --test packages/engine/dist/test/unit/kernel/legal-choices.test.js`
5. `pnpm -F @ludoforge/engine test`
6. `pnpm turbo lint`

## Outcome

- **Completion date**: 2026-02-28
- **What actually changed**:
  - Added canonical free-operation preflight overlay constructor:
    - `packages/engine/src/kernel/free-operation-preflight-overlay.ts`
  - Migrated strict/discovery call sites to the shared constructor:
    - `packages/engine/src/kernel/apply-move.ts`
    - `packages/engine/src/kernel/legal-choices.ts`
  - Added constructor-level contract coverage:
    - `packages/engine/test/unit/kernel/free-operation-preflight-overlay.test.ts`
  - Reassessed/corrected ticket assumptions and scope to match current architecture and test boundaries.
- **Deviations from original plan**:
  - No behavioral regressions were found, so existing `apply-move`/`legal-choices` tests were validated as regression guards without net-new call-site-specific cases.
- **Verification results**:
  - `pnpm turbo build` ✅
  - `node --test packages/engine/dist/test/unit/kernel/free-operation-preflight-overlay.test.js` ✅
  - `node --test packages/engine/dist/test/unit/kernel/apply-move.test.js` ✅
  - `node --test packages/engine/dist/test/unit/kernel/legal-choices.test.js` ✅
  - `pnpm -F @ludoforge/engine test` ✅ (`# pass 326`, `# fail 0`)
  - `pnpm turbo lint` ✅
