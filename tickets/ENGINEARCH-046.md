# ENGINEARCH-046: Add effect-level zone selector normalization regression coverage for scoped var/resource handlers

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — tests only (runtime contract lock-in)
**Deps**: none

## Problem

Current regression tests prove player-selector normalization behavior and helper-level zone normalization behavior, but there is no effect-level coverage for unresolved zone selector paths in `setVar.zoneVar`, `addVar.zoneVar`, and `transferVar.zoneVar`. This leaves a wiring regression gap.

## Assumption Reassessment (2026-02-26)

1. Effect-level tests currently assert pvar normalization in `effects-var.test.ts` and `transfer-var.test.ts`.
2. `scoped-var-runtime-access.test.ts` asserts helper-level zone normalization, not effect wiring.
3. **Mismatch + correction**: effect-level zone normalization assertions are missing and should be added to lock behavior at handler boundaries.

## Architecture Check

1. Handler-level regression tests are cleaner than helper-only tests because they protect real integration seams.
2. This is game-agnostic kernel test hardening; no game-specific logic crosses into runtime.
3. No backwards-compatibility aliases/shims are introduced.

## What to Change

### 1. Add setVar/addVar zoneVar unresolved selector tests

In `effects-var.test.ts`, add cases where zone selectors depend on missing bindings and assert normalized `EFFECT_RUNTIME` payloads/messages.

### 2. Add transferVar zoneVar unresolved selector tests

In `transfer-var.test.ts`, add unresolved zone selector cases for source and destination endpoints.

### 3. Keep assertions contract-oriented

Assert error class/code and normalization markers (for example normalization message and presence of source error code), avoiding brittle snapshots.

## Files to Touch

- `packages/engine/test/unit/effects-var.test.ts` (modify)
- `packages/engine/test/unit/transfer-var.test.ts` (modify)

## Out of Scope

- Runtime logic changes
- Selector resolver internals
- Runner/UI behavior

## Acceptance Criteria

### Tests That Must Pass

1. Unresolved zone selectors in scoped var/resource effects emit normalized `EFFECT_RUNTIME` failures.
2. Existing happy-path var/resource behavior remains unchanged.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Zone selector normalization is protected at effect integration boundaries, not only helper boundaries.
2. Runtime contracts remain deterministic and game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/effects-var.test.ts` — add unresolved zone binding coverage for `setVar` and `addVar`.
2. `packages/engine/test/unit/transfer-var.test.ts` — add unresolved zone binding coverage for `transferVar` endpoints.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/effects-var.test.js packages/engine/dist/test/unit/transfer-var.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
