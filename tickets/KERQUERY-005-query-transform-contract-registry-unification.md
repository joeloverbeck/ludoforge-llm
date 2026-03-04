# KERQUERY-005: Unify query-transform contracts into a single registry

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel query contract/inference/validation architecture
**Deps**: packages/engine/src/kernel/query-kind-map.ts, packages/engine/src/kernel/query-shape-inference.ts, packages/engine/src/kernel/query-domain-kinds.ts, packages/engine/src/kernel/validate-gamedef-behavior.ts, packages/engine/src/kernel/query-partition-types.ts, packages/engine/test/unit/kernel/query-kind-contract.test.ts, packages/engine/test/unit/query-shape-inference.test.ts, packages/engine/test/unit/validate-gamedef.test.ts, packages/engine/test/unit/types-exhaustive.test.ts

## Problem

Transform-query contract ownership is still split across multiple files: output contract lives in the kind map, while transform-specific input-shape rules are hardcoded in validation. This duplication increases drift risk as new transforms are added.

## Assumption Reassessment (2026-03-04)

1. Current architecture uses `OPTIONS_QUERY_KIND_CONTRACT_MAP` for partition/domain/runtime-shape output contracts.
2. Transform input compatibility rules (for example `tokenZones` source shape constraints) are implemented separately inside `validateOptionsQuery`.
3. Existing tests verify behavior but do not enforce a single-source contract model for transform input/output semantics.

## Architecture Check

1. A unified transform registry (input + output contracts) is cleaner than distributing contract logic across map + validator switches.
2. This change stays strictly game-agnostic and only affects generic query AST/kernel validation paths.
3. No backward compatibility layer is needed; canonical contract declarations should be migrated directly.

## What to Change

### 1. Introduce a transform contract registry

1. Define shared transform contract descriptors that include:
   - output partition/domain/runtime-shape contract
   - source input-shape compatibility policy
2. Use this registry as the single source of truth for transform queries (`tokenZones` now; extensible for future transforms).

### 2. Refactor consumers to use the unified contract source

1. Keep leaf/recursive partition inference aligned with the unified contract declarations.
2. Replace ad hoc transform-shape checks in `validateOptionsQuery` with registry-driven validation hooks.
3. Preserve existing diagnostic behavior unless explicitly improved by this ticket.

### 3. Strengthen drift-prevention tests

1. Add/adjust tests so transform input/output contract mismatches are caught if any consumer diverges from the registry.
2. Keep type-level exhaustiveness checks aligned with new contract ownership.

## Files to Touch

- `packages/engine/src/kernel/query-kind-map.ts` (modify)
- `packages/engine/src/kernel/query-domain-kinds.ts` (modify if needed)
- `packages/engine/src/kernel/query-shape-inference.ts` (modify if needed)
- `packages/engine/src/kernel/query-partition-types.ts` (modify if needed)
- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify)
- `packages/engine/test/unit/kernel/query-kind-contract.test.ts` (modify/add)
- `packages/engine/test/unit/query-shape-inference.test.ts` (modify/add)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify/add)
- `packages/engine/test/unit/types-exhaustive.test.ts` (modify if needed)

## Out of Scope

- Runtime indexing/performance work (`KERQUERY-003`)
- Additional runtime type mismatch error payload redesign (`KERQUERY-002`)
- Game-specific `GameSpecDoc`/`visual-config.yaml` content changes

## Acceptance Criteria

### Tests That Must Pass

1. Transform output contracts and input-shape constraints are declared once and consumed by inference + validation layers.
2. `tokenZones` behavior remains: output domain `zone`, runtime shape `string`, source compatibility enforced by shared contract policy.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Contract ownership remains engine-level and game-agnostic (`GameDef`/simulation do not encode game-specific branching).
2. No aliasing/backward-compatibility shims; obsolete split contract paths are removed.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/query-kind-contract.test.ts` — validates unified contract declarations for transform output semantics.
2. `packages/engine/test/unit/validate-gamedef.test.ts` — validates transform input-shape compatibility through registry-driven checks.
3. `packages/engine/test/unit/query-shape-inference.test.ts` — validates inference paths remain aligned with unified contracts.
4. `packages/engine/test/unit/types-exhaustive.test.ts` — keeps partition/contract exhaustiveness checks synchronized after refactor.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/query-kind-contract.test.js packages/engine/dist/test/unit/query-shape-inference.test.js packages/engine/dist/test/unit/validate-gamedef.test.js packages/engine/dist/test/unit/types-exhaustive.test.js`
3. `pnpm -F @ludoforge/engine test`
