# ENG-208: Harden Free-Operation Discovery API Surface

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — kernel module API boundaries and export contracts
**Deps**: archive/tickets/ENG-206-decouple-viability-probe-from-kernel-cycle.md, packages/engine/src/kernel/free-operation-discovery-analysis.ts, packages/engine/src/kernel/index.ts, packages/engine/test/unit/kernel/free-operation-analysis-api-contract.test.ts

## Problem

`free-operation-discovery-analysis.ts` currently exports low-level helper(s) intended for internal orchestration and that surface is re-exported via the kernel barrel. This broadens the public API and creates avoidable coupling risk for future refactors.

## Assumption Reassessment (2026-03-08)

1. `doesGrantAuthorizeMove` is exported from `free-operation-discovery-analysis.ts` and publicly reachable through `src/kernel/index.ts`.
2. Existing API contract test only verifies presence of `resolveFreeOperationDiscoveryAnalysis`; it does not enforce a strict curated export list for the module.
3. Mismatch: current boundary allows accidental public API growth. Correction: explicitly separate internal helper surfaces from public discovery API and enforce with export-contract guards.

## Architecture Check

1. Curated exports are cleaner than permissive `export *` propagation for boundary modules and reduce architectural drift.
2. This work is game-agnostic: it changes kernel/module contracts only and does not encode any game-specific behavior.
3. No backward-compatibility aliases/shims: remove unintended surface directly and update callsites/tests to canonical APIs.

## What to Change

### 1. Split internal vs public free-operation discovery surfaces

Move internal helper(s) such as grant authorization predicates into an internal-only module boundary (or keep local/non-exported where feasible), while preserving the public discovery API (`resolveFreeOperationDiscoveryAnalysis`, applicability/granted/monsoon checks).

### 2. Enforce strict export contracts

Add/strengthen source-level export contract tests so free-operation discovery modules cannot accidentally expose new APIs without explicit architectural review.

### 3. Tighten barrel re-export policy for this boundary

Ensure `src/kernel/index.ts` does not re-export internal-only helpers from this area.

## Files to Touch

- `packages/engine/src/kernel/free-operation-discovery-analysis.ts` (modify)
- `packages/engine/src/kernel/index.ts` (modify)
- `packages/engine/src/kernel/<internal-free-op-authorizer>.ts` (new/modify as needed)
- `packages/engine/test/unit/kernel/free-operation-analysis-api-contract.test.ts` (modify)
- `packages/engine/test/unit/kernel/<free-op-export-surface-guard>.test.ts` (new/modify)

## Out of Scope

- Grant semantics/policy redesign (ENG-202/ENG-203/ENG-207).
- Ia Drang card data behavior changes (ENG-204).

## Acceptance Criteria

### Tests That Must Pass

1. Public free-operation discovery API is explicitly curated and excludes internal helper exports.
2. Kernel barrel does not expose internal free-operation discovery helpers.
3. Existing suite: `node --test packages/engine/dist/test/unit/kernel/free-operation-analysis-api-contract.test.js`

### Invariants

1. Kernel module boundaries remain acyclic and dependency-safe.
2. Free-operation discovery behavior remains deterministic and game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/free-operation-analysis-api-contract.test.ts` — enforce strict allowed free-operation discovery public API.
2. `packages/engine/test/unit/kernel/<free-op-export-surface-guard>.test.ts` — prevent accidental export/boundary expansion in discovery modules.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/free-operation-analysis-api-contract.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
