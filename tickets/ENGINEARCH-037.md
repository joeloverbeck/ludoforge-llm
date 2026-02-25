# ENGINEARCH-037: Complete scoped-var contract DRYness for runtime mapping and public API boundaries

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — runtime mapping helper extraction + API surface tightening + tests
**Deps**: none

## Problem

Scoped-var type/schema contracts are centralized, but runtime scope mapping remains manually duplicated in execution helpers (for example per-scope branching in trace endpoint conversion/emission). This leaves scope-evolution work split across layers. Additionally, the new low-level contract module is publicly exported without explicit API boundary decision.

## Assumption Reassessment (2026-02-25)

1. AST/core types and Zod schemas now consume shared scoped contract helpers.
2. Runtime trace endpoint construction still uses local scope branch mapping logic in effect/trace helpers.
3. **Mismatch + correction**: full contract DRYness is not complete until runtime mapping primitives are also centralized; API exposure of low-level contract internals should be intentional and minimal.

## Architecture Check

1. Shared runtime mapping helpers reduce multi-file scope-translation drift and simplify future scope additions.
2. This remains game-agnostic kernel infrastructure and does not leak game-specific rules into `GameDef` or simulation.
3. No backwards-compatibility aliasing/shims; canonical scope contracts remain strict.

## What to Change

### 1. Extract reusable runtime mapping helpers

Create helper(s) for scope-aware mapping between:
- AST/resource endpoint variants
- trace endpoint variants
- var-change trace branch payloads

Adopt helper(s) in current runtime callsites to eliminate repeated branch logic.

### 2. Decide and enforce API exposure

Review whether `scoped-var-contract.ts` should be public via `kernel/index.ts`.
- If internal-only, remove public re-export and keep consumers internal.
- If public by design, document stability expectations and add API-shape test coverage.

## Files to Touch

- `packages/engine/src/kernel/effects-resource.ts` (modify)
- `packages/engine/src/kernel/var-change-trace.ts` (modify)
- `packages/engine/src/kernel/scoped-var-contract.ts` or adjacent helper module (modify/new)
- `packages/engine/src/kernel/index.ts` (modify, depending on API decision)
- `packages/engine/test/unit/` (modify/add tests for runtime mapping helper behavior)

## Out of Scope

- New gameplay mechanics
- Game-specific scope variants
- Runner visualization changes

## Acceptance Criteria

### Tests That Must Pass

1. Runtime endpoint/trace scope mapping logic is centralized and reused by relevant callsites.
2. Tests fail if scope mapping drifts between callsites.
3. Public API exposure decision is codified and covered by tests/docs.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Scoped-variable contract evolution touches one canonical mapping path per concern.
2. Kernel API surface is deliberate, minimal, and game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/resource-transfer-trace.test.ts` — assert runtime endpoint mapping parity via shared helper.
2. `packages/engine/test/unit/effects-var.test.ts` or dedicated mapping test — assert var-change branch mapping parity via shared helper.
3. `packages/engine/test/unit/kernel/*.test.ts` (as appropriate) — API surface assertion for `kernel/index.ts` export decision.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test -- test/unit/resource-transfer-trace.test.ts test/unit/effects-var.test.ts`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
