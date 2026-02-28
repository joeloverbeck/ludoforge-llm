# ENGINEARCH-110: Choice Options Runtime-Shape Contract Parity Across CNL and GameDef Validation

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — validator parity for choice-option compile/runtime-shape contracts
**Deps**: specs/51-cross-game-primitive-elevation.md

## Problem

`chooseOne`/`chooseN` now reject non-move-param-encodable option-query shapes during CNL lowering, but direct `GameDef` validation still accepts those shapes and allows later runtime failures. This creates contract drift between two valid ingestion paths.

## Assumption Reassessment (2026-02-27)

1. CNL compile path enforces `chooseOne`/`chooseN` option runtime-shape constraints in `compile-effects`.
2. `validate-gamedef-behavior` currently validates choice query structure/cardinality but does not enforce the same move-param-encodable option-shape invariant.
3. Existing ticket test-path assumption was incorrect: there is no `packages/engine/test/unit/kernel/validate-gamedef-behavior.test.ts`; direct `GameDef` behavior validation coverage lives in `packages/engine/test/unit/validate-gamedef.test.ts`.
4. Mismatch: behavior contract depends on ingestion path; corrected scope is parity enforcement in game-agnostic validator logic plus shared contract helper reuse.

## Architecture Check

1. One invariant across both compile and direct-GameDef paths is cleaner and more robust than path-dependent validation.
2. The contract is generic to `OptionsQuery` runtime-shape semantics and remains game-agnostic.
3. Shared helper ownership for move-param-encodable query shapes is preferable to duplicated local allowlists in compiler/validator modules.
4. No backwards-compatibility aliases/shims; invalid specs should fail fast at validation time.

## What to Change

### 1. Enforce choice option-shape contract in GameDef validation

Add validator checks for `chooseOne.options` and `chooseN.options` requiring move-param-encodable runtime shapes.

### 2. Reuse shared shape inference and contract vocabulary

Avoid duplicating ad-hoc shape logic; use shared inferencer/contract helpers so compiler and validator cannot drift.
If current helper surface is insufficient, extend `packages/engine/src/kernel/query-shape-inference.ts` with a reusable `isMoveParamEncodableQueryRuntimeShape`/contract helper and consume it from both compile and validator flows.

### 3. Add direct-GameDef contract tests

Add tests that fail validation for object-shaped choice option domains (for example `assetRows`) while preserving valid scalar/token domains.

## Files to Touch

- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify)
- `packages/engine/src/kernel/query-shape-inference.ts` (modify if needed for shared helper usage)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)

## Out of Scope

- Runtime `effects-choice` behavior changes for already-valid specs.
- Game-specific query rules or visual configuration changes.

## Acceptance Criteria

### Tests That Must Pass

1. Invalid `chooseOne`/`chooseN` option-query runtime shapes are rejected by direct `GameDef` validation.
2. Valid scalar/token choice-option domains remain accepted.
3. Compiler + validator consume the same move-param-encodable runtime-shape contract helper.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Choice-option validity is ingestion-path agnostic (CNL and direct `GameDef` agree).
2. Validation logic remains game-agnostic and independent of GameSpecDoc game-specific payloads.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-gamedef.test.ts` — reject object-shaped choice option queries and accept valid scalar/token shapes for direct `GameDef` validation.
2. `packages/engine/test/unit/compile-effects.test.ts` — confirm CNL contract behavior remains aligned (modify only if parity assertions need extension).

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`
3. `node --test packages/engine/dist/test/unit/compile-effects.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm -F @ludoforge/engine lint`

## Outcome

Implemented versus originally planned:

1. Added shared contract helper `isMoveParamEncodableQueryRuntimeShape` in `query-shape-inference` and switched compiler choice-shape validation to consume it (removed duplicated local allowlist from `compile-effects`).
2. Added direct `GameDef` behavior parity checks for `chooseOne.options` and `chooseN.options` in `validate-gamedef-behavior` with explicit `EFFECT_CHOICE_OPTIONS_RUNTIME_SHAPE_INVALID` diagnostics.
3. Added/extended direct validation tests in `validate-gamedef.test.ts`:
   - reject object-shaped (`assetRows`) choice options for both `chooseOne` and `chooseN`
   - accept move-param-encodable (`players`, `tokensInZone`) choice options
4. `compile-effects` tests already covered CNL-side rejection behavior; no additional changes were needed there after shared-helper adoption.
