# SEATRES-025: Typed asset-selection failure reasons and cascade-gating hardening

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — compiler derivation-failure contracts and diagnostic gating
**Deps**: tickets/SEATRES-024-extract-shared-data-asset-selection-policy-for-compiler-and-validator.md

## Problem

Compiler currently tracks asset derivation failures as booleans (`map`, `pieceCatalog`, `seatCatalog`). Booleans hide root-cause categories (`invalid payload`, `missing ref`, `ambiguous`) and make downstream cascade-gating coarse. As selection rules tighten, reason-aware gating is needed to keep diagnostics minimal and deterministic.

## Assumption Reassessment (2026-03-01)

1. `deriveSectionsFromDataAssets()` exposes boolean `derivationFailures` flags only, losing failure reason granularity.
2. Compiler-core already uses these booleans to emit/suppress cascade diagnostics (for example zones/tokenTypes fallback warnings and seat-catalog-required behavior).
3. No active ticket introduces typed failure reasons for scenario-linked asset derivation.

## Architecture Check

1. Typed failure reasons are more robust than booleans and enable principled root-cause-first diagnostic policy.
2. This is game-agnostic compiler infrastructure; it models contract failure classes, not game semantics.
3. No compatibility aliases: strict contract violations remain errors/warnings, but cascades become reason-aware and cleaner.

## What to Change

### 1. Replace boolean derivation failures with typed failure metadata

1. Introduce typed selection failure shape per asset kind:
   - `none`
   - `invalidPayload`
   - `missingReference`
   - `ambiguousSelection`
2. Thread these reasons through `deriveSectionsFromDataAssets()` return contract.

### 2. Harden compiler-core cascade gating using failure reasons

1. Gate/suppress secondary diagnostics when root-cause reason is already authoritative.
2. Add explicit policy for explicit-YAML sections + ambiguous data assets so behavior is deterministic and documented.

## Files to Touch

- `packages/engine/src/cnl/compile-data-assets.ts` (modify)
- `packages/engine/src/cnl/compiler-core.ts` (modify)
- `packages/engine/test/unit/compiler-structured-results.test.ts` (modify/add)
- `packages/engine/test/integration/compile-pipeline.test.ts` (modify/add)

## Out of Scope

- Validator selection parity implementation (covered by prior tickets)
- Runtime/kernel execution behavior
- Runner/visual presentation concerns

## Acceptance Criteria

### Tests That Must Pass

1. Compiler emits root-cause diagnostics with reason-aware suppression of secondary cascades.
2. Behavior for explicit `doc.zones` / `doc.tokenTypes` with ambiguous data assets is explicitly covered and deterministic.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Diagnostic ordering remains root-cause-first and reason-aware.
2. `GameSpecDoc` remains data source; `GameDef`/runtime remain agnostic and do not encode selection fallbacks.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compiler-structured-results.test.ts` — add reason-specific gating assertions for ambiguous vs invalid vs missing-ref paths.
2. `packages/engine/test/integration/compile-pipeline.test.ts` — add explicit-YAML + ambiguous-asset contract tests for map/piece/seat.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/compiler-structured-results.test.js`
3. `node --test packages/engine/dist/test/integration/compile-pipeline.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo test --force && pnpm turbo typecheck && pnpm turbo lint`
