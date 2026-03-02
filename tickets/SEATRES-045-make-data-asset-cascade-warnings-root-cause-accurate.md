# SEATRES-045: Make data-asset cascade warnings root-cause accurate

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — compiler cascade-warning phrasing contract
**Deps**: archive/tickets/SEATRES/SEATRES-026-model-scenario-selection-failure-reasons-and-suppress-dependent-cascades.md

## Problem

Compiler cascade warnings currently use fixed map/piece-failure wording even when the actual root cause is scenario-selection failure. This can misstate why sections are unavailable, reducing diagnostic precision and maintainability.

## Assumption Reassessment (2026-03-02)

1. `compile-data-assets.ts` now records scenario-root-cause derivation reasons (`scenario-selector-missing`, `scenario-ambiguous`) into map/piece/seat failure sets.
2. `compiler-core.ts` cascade warnings (`CNL_DATA_ASSET_CASCADE_ZONES_MISSING`, `CNL_DATA_ASSET_CASCADE_TOKEN_TYPES_MISSING`) still use static text claiming map/piece derivation failure.
3. No active ticket in `tickets/*` currently scopes root-cause-aware message generation for these cascade warnings.

## Architecture Check

1. Diagnostics should be truthful about root cause; message-level precision improves debuggability without changing strict failure behavior.
2. This remains game-agnostic compiler policy logic and does not introduce game-specific branching into `GameDef` or runtime/simulation.
3. No backwards-compatibility aliases/shims: existing diagnostic codes remain; only message/suggestion text is made root-cause-aware.

## What to Change

### 1. Derive cascade-warning wording from derivation failure reasons

1. In `compiler-core.ts`, make `dataAssetCascadeZonesDiagnostic` and `dataAssetCascadeTokenTypesDiagnostic` accept derivation failure reasons.
2. Emit wording based on highest-priority root cause (scenario selection failure vs direct map/piece selection/payload failure), while keeping deterministic ordering.

### 2. Preserve strict policy while improving operator guidance

1. Keep suppression codes and gating behavior unchanged.
2. Update suggestions to point to the actual blocking source (for example scenario selector resolution when relevant).

## Files to Touch

- `packages/engine/src/cnl/compiler-core.ts` (modify)
- `packages/engine/test/unit/compiler-structured-results.test.ts` (modify/add)
- `packages/engine/test/integration/compile-pipeline.test.ts` (modify/add)

## Out of Scope

- Validator diagnostic taxonomy or validator message parity
- Runtime/kernel simulation behavior
- Visual configuration (`visual-config.yaml`) concerns

## Acceptance Criteria

### Tests That Must Pass

1. Scenario-ambiguous root cause + missing explicit zones emits `CNL_DATA_ASSET_CASCADE_ZONES_MISSING` with scenario-selection-accurate message and no `doc.zones` required-section cascade.
2. Scenario-selector-missing root cause + missing explicit tokenTypes emits `CNL_DATA_ASSET_CASCADE_TOKEN_TYPES_MISSING` with scenario-selection-accurate message.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Root-cause-first suppression remains deterministic and unchanged in behavior.
2. Compiler remains game-agnostic: no game-specific identifiers or branches are introduced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compiler-structured-results.test.ts` — assert cascade warning messages reflect scenario root cause when scenario selection fails.
2. `packages/engine/test/integration/compile-pipeline.test.ts` — verify message correctness in parse/compile integration path.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/compiler-structured-results.test.js`
3. `node --test packages/engine/dist/test/integration/compile-pipeline.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo typecheck && pnpm turbo lint`
