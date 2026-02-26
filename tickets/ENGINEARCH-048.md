# ENGINEARCH-048: Split strict vs malformed scoped endpoint contracts to restore compile-time guarantees

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes - kernel scoped endpoint contract typing + effect callsite typing
**Deps**: none

## Problem

`ScopedVarResolvableEndpoint` currently makes `pvar.player` and `zoneVar.zone` optional for all call sites. This was introduced to support malformed `transferVar` payload handling, but it weakens compile-time guarantees for well-typed effect handlers (`setVar`/`addVar`) and shifts preventable contract failures to runtime.

## Assumption Reassessment (2026-02-26)

1. `resolveRuntimeScopedEndpoint` is now the canonical resolver used by var/resource effects.
2. The shared endpoint type currently permits missing selectors globally (`player?:`, `zone?:`) rather than only where malformed payloads are intentionally tolerated.
3. Existing runtime behavior is correct and tested, but static contract strength regressed.
4. **Mismatch + correction**: keep malformed-payload support where required, while restoring strict selector-required types for normal call sites.

## Architecture Check

1. Distinguishing strict endpoint contracts from malformed endpoint contracts is cleaner than one permissive union because normal effect call sites regain compile-time correctness.
2. This is pure kernel typing/contract work and remains game-agnostic (`GameSpecDoc` data rules unchanged; `GameDef`/runtime remains generic).
3. No backwards-compatibility aliases or shim paths are introduced.

## What to Change

### 1. Split endpoint contract types

In `scoped-var-runtime-access.ts`, introduce:
- strict endpoint type (selector-required for `pvar`/`zoneVar`)
- malformed endpoint type (selector-optional) used only where payloads can be malformed at runtime

### 2. Constrain resolver signatures and callsites

- Keep `resolveRuntimeScopedEndpoint` behavior unchanged.
- Update signatures (via overloads or separate helpers) so strict call sites (`setVar`/`addVar`) pass strict endpoint types.
- Keep malformed-path checks for `transferVar` endpoints.

### 3. Add typing + behavior guard tests

Add tests proving:
- strict resolver path still resolves all scopes correctly
- malformed-path missing-selector diagnostics remain deterministic

## Files to Touch

- `packages/engine/src/kernel/scoped-var-runtime-access.ts` (modify)
- `packages/engine/src/kernel/effects-var.ts` (modify)
- `packages/engine/src/kernel/effects-resource.ts` (modify)
- `packages/engine/test/unit/scoped-var-runtime-access.test.ts` (modify/add)

## Out of Scope

- Selector normalization rollout to other effect families (tracked separately)
- Gameplay rule changes
- Runner/UI/visual-config changes

## Acceptance Criteria

### Tests That Must Pass

1. Strict call sites (`setVar`/`addVar`) use selector-required endpoint contracts.
2. Missing-selector diagnostics for malformed transfer endpoints remain unchanged.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Compile-time endpoint contracts are maximally strict for normal effect handlers.
2. Runtime malformed-payload handling remains explicit and deterministic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/scoped-var-runtime-access.test.ts` - assert strict endpoint resolution behavior and malformed missing-selector diagnostics.
2. `packages/engine/test/unit/effects-var.test.ts` - ensure strict-path behavior remains unchanged.
3. `packages/engine/test/unit/transfer-var.test.ts` - ensure malformed transfer endpoint diagnostics remain unchanged.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/scoped-var-runtime-access.test.js packages/engine/dist/test/unit/effects-var.test.js packages/engine/dist/test/unit/transfer-var.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
