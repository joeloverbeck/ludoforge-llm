# ENGINEARCH-037: Complete scoped-var contract DRYness for runtime mapping and public API boundaries

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — runtime mapping helper extraction + API surface tightening + tests
**Deps**: none

## Problem

Scoped-var type/schema contracts are centralized, but runtime scope mapping remains manually duplicated in execution helpers (for example per-scope branching in trace endpoint conversion/emission). This leaves scope-evolution work split across layers. Additionally, the new low-level contract module is publicly exported without explicit API boundary decision.

## Assumption Reassessment (2026-02-25)

1. AST/core types and Zod schemas now consume shared scoped contract helpers.
2. `var-change-trace.ts` already centralizes var-change trace emission, but `effects-resource.ts` still duplicates AST-to-trace/event scope mapping branches (trace endpoint mapping, var-change payload construction, emitted `varChanged` event payload construction).
3. `scoped-var-contract.ts` is currently re-exported from `kernel/index.ts`; this makes low-level schema helpers part of the public kernel API without an explicit boundary test.
4. **Mismatch + correction**: full contract DRYness is not complete until runtime mapping primitives are also centralized; API exposure of low-level contract internals should be intentional and minimal (either explicitly tested public API, or removed from public surface).

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
- emitted `varChanged` event payloads

Adopt helper(s) in current runtime callsites to eliminate repeated branch logic.

### 2. Decide and enforce API exposure

Review whether `scoped-var-contract.ts` should be public via `kernel/index.ts`.
- If internal-only, remove public re-export and keep consumers internal.
- If public by design, document stability expectations and add API-shape test coverage.

## Files to Touch

- `packages/engine/src/kernel/effects-resource.ts` (modify)
- `packages/engine/src/kernel/var-change-trace.ts` (modify only if needed to consume shared mapping helper)
- `packages/engine/src/kernel/scoped-var-contract.ts` or adjacent helper module (modify/new)
- `packages/engine/src/kernel/index.ts` (modify, depending on API decision)
- `packages/engine/test/unit/transfer-var.test.ts` (modify/add mapping parity assertions for emitted events)
- `packages/engine/test/unit/resource-transfer-trace.test.ts` (modify/add mapping parity assertions for trace endpoints)
- `packages/engine/test/unit/game-loop-api-shape.test.ts` (modify/add explicit API surface assertion for `scoped-var-contract` export decision)

## Out of Scope

- New gameplay mechanics
- Game-specific scope variants
- Runner visualization changes

## Acceptance Criteria

### Tests That Must Pass

1. Runtime endpoint/trace scope mapping logic is centralized and reused by relevant callsites.
2. Tests fail if scope mapping drifts between trace and emitted-event callsites.
3. Public API exposure decision is codified and covered by tests/docs.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Scoped-variable contract evolution touches one canonical mapping path per concern.
2. Kernel API surface is deliberate, minimal, and game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/resource-transfer-trace.test.ts` — assert runtime endpoint mapping parity via shared helper.
2. `packages/engine/test/unit/transfer-var.test.ts` — assert emitted `varChanged` event scope payload parity via shared helper.
3. `packages/engine/test/unit/game-loop-api-shape.test.ts` — API surface assertion for `kernel/index.ts` export decision.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test dist/test/unit/resource-transfer-trace.test.js dist/test/unit/transfer-var.test.js dist/test/unit/game-loop-api-shape.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- **Completion date**: 2026-02-25
- **What changed**:
  - Added `packages/engine/src/kernel/scoped-var-runtime-mapping.ts` as the canonical runtime scope-mapping helper for:
    - resolved endpoint -> `resourceTransfer` trace endpoint payload
    - resolved endpoint -> `varChange` trace payload
    - resolved endpoint -> emitted `varChanged` trigger event payload
  - Refactored `packages/engine/src/kernel/effects-resource.ts` to consume the shared helper and remove duplicated per-scope branch mapping logic.
  - Tightened kernel public API by removing `scoped-var-contract` re-export from `packages/engine/src/kernel/index.ts` and codified this boundary with API-shape assertions.
  - Updated affected tests/imports to align with internalized scoped-var-contract module usage.
- **Deviations from original plan**:
  - `var-change-trace.ts` did not require modification because centralizing mapping in `effects-resource.ts` plus the new runtime helper removed the duplicated callsite logic that was causing drift risk.
  - Additional import updates were required in existing schema tests due the `kernel/index.ts` API boundary tightening.
- **Verification results**:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/resource-transfer-trace.test.js packages/engine/dist/test/unit/transfer-var.test.js packages/engine/dist/test/unit/game-loop-api-shape.test.js packages/engine/dist/test/unit/scoped-var-contract.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
