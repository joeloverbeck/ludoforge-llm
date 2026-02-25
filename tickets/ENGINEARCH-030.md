# ENGINEARCH-030: Restore deterministic EFFECT_RUNTIME classification for malformed transferVar endpoints

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — runtime error wrapping, transfer effect boundary tests
**Deps**: none

## Problem

`transferVar` endpoint shape is now enforced by discriminated contracts, but runtime path handling regressed for malformed payloads that still reach execution (for example via non-schema call paths). Instead of deterministic `EFFECT_RUNTIME` classification, errors can leak as `EvalError` (`TYPE_MISMATCH`), weakening runtime boundary guarantees.

## Assumption Reassessment (2026-02-25)

1. `effects-resource.resolveEndpoint` currently assumes `pvar.player` and `zoneVar.zone` always exist and directly resolves selectors.
2. `resolvePlayerSel` throws `EvalError` for invalid selector payloads, which currently bubbles through transfer execution in malformed cases.
3. **Mismatch + correction**: strict schema contracts reduce malformed payload risk but do not remove the need for robust runtime boundary classification; runtime must still normalize malformed endpoint failures into `EFFECT_RUNTIME`.

## Architecture Check

1. Preserving `EFFECT_RUNTIME` boundary semantics is cleaner and more robust than relying on upstream schema discipline alone because engine runtime remains defensible under all entry paths.
2. This is fully game-agnostic runtime hardening; no `GameSpecDoc`, `visual-config.yaml`, or game-specific behavior/data coupling is introduced.
3. No backward-compatibility shims/aliases: malformed endpoint payloads continue to fail fast, but with consistent error family and metadata.

## What to Change

### 1. Reinstate explicit runtime shape guards in transfer endpoint resolution

In `effects-resource.ts`, restore/introduce explicit checks for required endpoint identity fields before selector/zone resolution:
- `pvar` requires `player`
- `zoneVar` requires `zone`

Wrap failures via `effectRuntimeError('resourceRuntimeValidationFailed', ...)` so error codes stay deterministic.

### 2. Lock boundary behavior with targeted tests

Reintroduce/adjust unit coverage proving malformed transfer endpoint payloads (injected as `unknown as EffectAST`) fail with `EFFECT_RUNTIME` classification, not raw `EvalError`.

## Files to Touch

- `packages/engine/src/kernel/effects-resource.ts` (modify)
- `packages/engine/test/unit/transfer-var.test.ts` (modify)

## Out of Scope

- Expanding transfer endpoint contract matrix coverage (covered by `ENGINEARCH-029`)
- Runner event-log rendering behavior (covered by `EVTLOG-012`)
- Any game-specific `GameSpecDoc` or `visual-config.yaml` changes

## Acceptance Criteria

### Tests That Must Pass

1. Malformed `transferVar` endpoint payload with missing `pvar.player` fails with `EFFECT_RUNTIME`.
2. Malformed `transferVar` endpoint payload with missing `zoneVar.zone` fails with `EFFECT_RUNTIME`.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Transfer runtime endpoint validation failures are consistently surfaced as `EFFECT_RUNTIME` regardless of call path.
2. Runtime boundary hardening stays game-agnostic and does not depend on game-specific data contracts.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/transfer-var.test.ts` — assert `EFFECT_RUNTIME` classification for malformed endpoint payload injection cases.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test -- test/unit/transfer-var`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
