# ENGINEARCH-051: Complete effect-level resolver-normalization coverage for token and reveal/conceal handlers

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — test coverage hardening for kernel effect handlers
**Deps**: none

## Problem

Selector/zone normalization was wired into multiple token and reveal/conceal handlers, but regression tests currently cover only a subset of touched entrypoints. This leaves architecture-contract drift risk in effect families that were modified but are not asserted.

## Assumption Reassessment (2026-02-26)

1. `effects-token.ts` now routes zone resolution for `moveToken`, `moveTokenAdjacent`, `createToken`, `draw`, `moveAll`, and `shuffle` through shared normalization.
2. `effects-reveal.ts` now routes both `reveal` and `conceal` selector/zone resolution through shared normalization.
3. **Mismatch + correction**: unresolved-selector normalization assertions currently exist for `draw`, `reveal.zone`, and `reveal.to`, but are missing for `moveToken`, `moveTokenAdjacent.from`, `createToken.zone`, `moveAll`, `shuffle`, `conceal.zone`, and `conceal.from`.
4. **Scope correction**: affected effect families are split across multiple unit files; constraining this ticket to two files would force cross-domain test sprawl and weaken maintainability.

## Architecture Check

1. Contract tests at every modified effect boundary are cleaner than partial coverage and reduce future regressions.
2. This work is kernel runtime test hardening only; no game-specific behavior is added to GameDef/runtime.
3. No backwards-compatibility aliasing/shims are introduced.

## What to Change

### 1. Expand token effect normalization tests

Add unresolved selector/binding-path assertions for the modified token handlers proving normalized `EFFECT_RUNTIME` diagnostics:
- `moveToken.from`/`moveToken.to`
- `moveTokenAdjacent.from`
- `createToken.zone`
- `moveAll.from`/`moveAll.to`
- `shuffle.zone`

### 2. Expand conceal normalization tests

Add unresolved `conceal.zone` and unresolved `conceal.from` selector assertions proving normalized `EFFECT_RUNTIME` diagnostics.

## Files to Touch

- `packages/engine/test/unit/effects-token-move-draw.test.ts` (modify)
- `packages/engine/test/unit/effects-zone-ops.test.ts` (modify)
- `packages/engine/test/unit/effects-lifecycle.test.ts` (modify)
- `packages/engine/test/unit/effects-reveal.test.ts` (modify)

## Out of Scope

- Runtime logic refactors
- Selector resolver internals
- Runner/UI changes

## Acceptance Criteria

### Tests That Must Pass

1. All token handlers modified by normalization wiring have direct unresolved-selector normalization regression tests.
2. Both reveal and conceal unresolved selector paths assert normalized `EFFECT_RUNTIME` behavior.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Effect-level resolver failure contracts remain consistent across token and reveal/conceal families.
2. Runtime remains game-agnostic with no game-specific branches.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/effects-token-move-draw.test.ts` — add unresolved selector/binding normalization assertions for all modified token handlers.
2. `packages/engine/test/unit/effects-zone-ops.test.ts` — add unresolved normalization assertions for `moveAll`, `shuffle`, and `moveTokenAdjacent.from`.
3. `packages/engine/test/unit/effects-lifecycle.test.ts` — add unresolved normalization assertion for `createToken.zone`.
4. `packages/engine/test/unit/effects-reveal.test.ts` — add unresolved `conceal` selector/zone normalization assertions.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/effects-token-move-draw.test.js packages/engine/dist/test/unit/effects-zone-ops.test.js packages/engine/dist/test/unit/effects-lifecycle.test.js packages/engine/dist/test/unit/effects-reveal.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completion date: 2026-02-26
- What changed:
  - Corrected ticket assumptions and scope to match actual test ownership across token/reveal unit files.
  - Added unresolved-selector normalization regression tests for:
    - `moveToken.from` and `moveToken.to`
    - `moveTokenAdjacent.from`
    - `createToken.zone`
    - `moveAll.from` and `moveAll.to`
    - `shuffle.zone`
    - `conceal.zone` and `conceal.from`
- Deviations from original plan:
  - Expanded file touch list from two files to four (`effects-zone-ops` and `effects-lifecycle` were required for clean domain-local coverage).
- Verification:
  - `pnpm -F @ludoforge/engine build` passed.
  - Focused `node --test` run for the four touched unit files passed.
  - `pnpm -F @ludoforge/engine test` passed (289/289).
  - `pnpm -F @ludoforge/engine lint` passed.
