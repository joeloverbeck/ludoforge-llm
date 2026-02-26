# ENGINEARCH-048: Split strict vs malformed scoped endpoint contracts to restore compile-time guarantees

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes - kernel scoped endpoint contract typing + effect callsite typing
**Deps**: none

## Problem

`ScopedVarResolvableEndpoint` currently makes `pvar.player` and `zoneVar.zone` optional for all call sites. This was introduced to support malformed `transferVar` payload handling, but it weakens compile-time guarantees for well-typed effect handlers (`setVar`/`addVar`) and shifts preventable contract failures to runtime.

## Assumption Reassessment (2026-02-26)

1. `resolveRuntimeScopedEndpoint` is currently used by `setVar`, `addVar`, and `transferVar` endpoint resolution paths.
2. `SetVarPayload`/`AddVarPayload`/`TransferVarEndpoint` AST contracts are already strict (selector-required for `pvar`/`zoneVar`), but the shared runtime resolver input type still permits missing selectors globally (`player?:`, `zone?:`).
3. Existing runtime malformed-selector behavior is already covered in unit tests (`scoped-var-runtime-access.test.ts` and `transfer-var.test.ts`), including deterministic missing-selector diagnostics.
4. **Mismatch + correction**: the remaining gap is compile-time callsite strictness, not missing runtime behavior tests. Keep malformed-payload support only in explicit tolerant paths while restoring strict resolver contracts for normal effect callsites.

## Architecture Check

1. Distinguishing strict endpoint contracts from malformed endpoint contracts is cleaner than one permissive union because normal effect call sites regain compile-time correctness.
2. This is pure kernel typing/contract work and remains game-agnostic (`GameSpecDoc` data rules unchanged; `GameDef`/runtime remains generic).
3. No backwards-compatibility aliases or shim paths are introduced.

## What to Change

### 1. Split endpoint contract types + resolver surface

In `scoped-var-runtime-access.ts`, introduce:
- strict endpoint type (selector-required for `pvar`/`zoneVar`)
- malformed endpoint type (selector-optional) used only where payloads can be malformed at runtime
- strict resolver entrypoint for strict callsites
- tolerant resolver entrypoint for malformed payload paths

### 2. Constrain resolver signatures and callsites

- Keep endpoint resolution behavior and diagnostics unchanged.
- Route strict callsites (`setVar`/`addVar`) through strict resolver typing so missing selectors fail at compile time.
- Keep malformed-path checks for `transferVar` endpoints via tolerant resolver typing.

### 3. Add typing + behavior guard tests

Add tests proving:
- strict resolver typing rejects selector-omission payloads at compile time
- strict/tolerant resolver paths both preserve current runtime scope resolution behavior
- malformed-path missing-selector diagnostics remain deterministic

## Files to Touch

- `packages/engine/src/kernel/scoped-var-runtime-access.ts` (modify)
- `packages/engine/src/kernel/effects-var.ts` (modify)
- `packages/engine/src/kernel/effects-resource.ts` (modify)
- `packages/engine/test/unit/scoped-var-runtime-access.test.ts` (modify/add)
- `packages/engine/test/unit/transfer-var.test.ts` (modify only if needed for parity/regression clarity)

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

1. `packages/engine/test/unit/scoped-var-runtime-access.test.ts` - assert strict/tolerant endpoint resolution behavior and malformed missing-selector diagnostics.
2. `packages/engine/test/unit/scoped-var-runtime-access.test.ts` - add compile-time type assertions that strict resolver contracts reject selector omissions.
3. `packages/engine/test/unit/effects-var.test.ts` - ensure strict-path behavior remains unchanged.
4. `packages/engine/test/unit/transfer-var.test.ts` - ensure malformed transfer endpoint diagnostics remain unchanged.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/scoped-var-runtime-access.test.js packages/engine/dist/test/unit/effects-var.test.js packages/engine/dist/test/unit/transfer-var.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completion date: 2026-02-26
- What was actually changed:
  - Split scoped endpoint contracts in `scoped-var-runtime-access.ts` into strict (`ScopedVarResolvableEndpoint`) and tolerant malformed (`ScopedVarMalformedResolvableEndpoint`) variants.
  - Added explicit strict vs tolerant resolver entrypoints:
    - `resolveRuntimeScopedEndpoint` (strict, selector-required for `pvar`/`zoneVar`)
    - `resolveRuntimeScopedEndpointWithMalformedSupport` (tolerant, selector-optional)
  - Updated `effects-resource.ts` (`transferVar`) to use the tolerant resolver path for malformed runtime payload handling.
  - Strengthened `scoped-var-runtime-access.test.ts` with compile-time strictness assertions (`@ts-expect-error` for omitted selectors) and runtime parity coverage for tolerant resolver behavior.
- Deviations from originally planned ticket framing:
  - `effects-var.ts` required no code changes because its existing callsites now inherit strict compile-time selector requirements directly from the strict resolver signature.
  - `transfer-var.test.ts` already covered malformed-selector diagnostics sufficiently, so no additional changes were required there.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/scoped-var-runtime-access.test.js packages/engine/dist/test/unit/effects-var.test.js packages/engine/dist/test/unit/transfer-var.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
