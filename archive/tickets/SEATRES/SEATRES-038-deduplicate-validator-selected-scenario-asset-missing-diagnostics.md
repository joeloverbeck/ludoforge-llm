# SEATRES-038: Deduplicate validator selected-scenario missing-asset diagnostics

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — validator data-asset diagnostics and scenario-selection seat-check flow
**Deps**: archive/tickets/SEATRES/SEATRES-021-align-validator-seat-catalog-selection-with-compiler-inference.md

## Problem

Validator currently emits duplicate `CNL_VALIDATOR_REFERENCE_MISSING` diagnostics for selected-scenario `pieceCatalogAssetId` and `seatCatalogAssetId` missing-reference cases. The same path/message can be reported once during per-scenario explicit reference validation and again during selected-scenario canonical seat-check selection. This creates noisy output and weakens deterministic root-cause reporting.

## Assumption Reassessment (2026-03-02)

1. `validateDataAssets()` now performs both broad per-scenario reference checks and selected-scenario canonical seat-check selection checks.
2. In current code, missing selected-scenario `pieceCatalogAssetId` and `seatCatalogAssetId` are each emitted in two places under `CNL_VALIDATOR_REFERENCE_MISSING` with the same selector path:
   - per-scenario reference validation loop (`scenarioRefs` walk), and
   - selected-scenario canonical seat-check linked-asset selection.
3. Current tests in `validate-spec-scenario.test.ts` cover ambiguity/missing-reference presence but do not assert one-diagnostic cardinality for these selected-scenario missing-reference selector paths.
4. Active tickets `SEATRES-022` through `SEATRES-037` do not explicitly cover duplicate-validator-diagnostic suppression for these selected-scenario missing-reference paths.

## Architecture Check

1. Deterministic one-root-cause-per-path diagnostics are cleaner and more robust than duplicate emissions from layered checks.
2. This is purely validator contract hygiene and remains game-agnostic; it does not add game-specific behavior to `GameDef` or simulation.
3. No compatibility shims/aliases: duplicate diagnostics are removed, while strict missing-reference failures remain hard errors.

## What to Change

### 1. Eliminate duplicate selected-scenario missing-reference emissions

1. Keep one authoritative emission for missing `scenario.pieceCatalogAssetId` / `scenario.seatCatalogAssetId` at the selector path.
2. Prevent second emission in selected-scenario canonical seat-check path when the selector already points to a missing asset id.
3. Preserve ambiguity diagnostics and seat-reference cascade suppression behavior introduced by prior seat-selection parity work.
4. Avoid generic post-hoc diagnostic de-dup filters; gate canonical seat-check linked-asset selection from re-emitting known selector missing-reference failures.

### 2. Add regression tests for one-diagnostic-per-missing-reference behavior

1. Add test for missing selected-scenario `seatCatalogAssetId` asserting exactly one diagnostic at the selector path.
2. Add test for missing selected-scenario `pieceCatalogAssetId` asserting exactly one diagnostic at the selector path.

## Files to Touch

- `packages/engine/src/cnl/validate-extensions.ts` (modify)
- `packages/engine/test/unit/validate-spec-scenario.test.ts` (modify/add)

## Out of Scope

- Compiler diagnostic taxonomy split (`SEATRES-022`)
- Typed derivation reason modeling (`SEATRES-025`, `SEATRES-026`)
- Runtime seat-resolution behavior and simulator state transitions

## Acceptance Criteria

### Tests That Must Pass

1. Missing selected-scenario `seatCatalogAssetId` yields exactly one `CNL_VALIDATOR_REFERENCE_MISSING` diagnostic at the assetId path.
2. Missing selected-scenario `pieceCatalogAssetId` yields exactly one `CNL_VALIDATOR_REFERENCE_MISSING` diagnostic at the assetId path.
3. Existing suite: `pnpm -F @ludoforge/engine test`
4. Repo quality gates for touched code: `pnpm turbo typecheck` and `pnpm turbo lint`

### Invariants

1. Validator diagnostics stay deterministic and root-cause-first; no duplicate same-path/same-cause emissions.
2. `GameSpecDoc` remains the game-specific source; `GameDef`/simulation remain game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-spec-scenario.test.ts` — assert single-emission behavior for missing selected-scenario `seatCatalogAssetId`. Rationale: prevents diagnostic noise regressions.
2. `packages/engine/test/unit/validate-spec-scenario.test.ts` — assert single-emission behavior for missing selected-scenario `pieceCatalogAssetId`. Rationale: enforces deterministic validator reporting contract.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/validate-spec-scenario.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo test --force && pnpm turbo typecheck && pnpm turbo lint`

## Outcome

1. Implemented targeted deduplication by gating canonical selected-scenario linked-asset selection when the selected scenario already references a missing `pieceCatalogAssetId` or `seatCatalogAssetId`; this keeps one authoritative `CNL_VALIDATOR_REFERENCE_MISSING` emission at the selector path.
2. Added explicit regression assertions for one-diagnostic cardinality on:
   - `doc.dataAssets.3.payload.seatCatalogAssetId`
   - `doc.dataAssets.3.payload.pieceCatalogAssetId`
3. Consolidated canonical map/piece/seat linked-asset resolution under one validator-local helper (`selectCanonicalScenarioLinkedAsset`) so missing-reference suppression policy is centralized and future linked-asset additions use one contract.
4. Verified with build, focused unit test, full engine test suite, workspace `test`, workspace typecheck, and workspace lint; all passed.
