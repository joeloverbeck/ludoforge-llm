# 130CANHOTPAT-002: EffectCursor + ClassifiedMove — eliminate conditional spreads

**Status**: COMPLETE
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel effect-context, types-core, effect handler files, legal-moves
**Deps**: None

## Problem

`EffectCursor` has an optional `tracker?` field and `ClassifiedMove` has an optional `trustedMove?` field. Construction sites for these types conditionally include these properties, creating V8 hidden class polymorphism at high-frequency call sites (~10K/game for EffectCursor, ~3K/game for ClassifiedMove).

## Assumption Reassessment (2026-04-13)

1. `EffectCursor` defined in `packages/engine/src/kernel/effect-context.ts:241-249` with `tracker?: DraftTracker` — confirmed
2. `ClassifiedMove` defined in `packages/engine/src/kernel/types-core.ts:1126-1130` with `trustedMove?: TrustedExecutableMove` — confirmed
3. EffectCursor imported by 11 kernel files (effects-*.ts family) — confirmed
4. ClassifiedMove construction sites in `legal-moves.ts` (~8 sites) — confirmed
5. EffectCursor construction sites across `effect-context.ts`, `effect-dispatch.ts`, `effects-control.ts` (~15 sites) — confirmed

## Architecture Check

1. Converting `tracker?` to `tracker: DraftTracker | undefined` is type-safe — accessing `.tracker` on an object where it was previously absent already returned `undefined`.
2. Both types are engine-internal — no game-specific logic involved.
3. All construction sites migrated atomically per Foundation 14.

## What to Change

### 1. Update EffectCursor interface in `effect-context.ts`

```typescript
// Before
tracker?: DraftTracker;

// After
tracker: DraftTracker | undefined;
```

### 2. Update all EffectCursor construction sites (~15 sites)

In `effect-context.ts`, `effect-dispatch.ts`, `effects-control.ts`, and other effect handler files, ensure every object literal producing an EffectCursor includes `tracker` explicitly:

- Sites that currently omit `tracker`: add `tracker: undefined`
- Sites that conditionally spread `tracker`: convert to `tracker: value ?? undefined`

### 3. Update ClassifiedMove interface in `types-core.ts`

```typescript
// Before
readonly trustedMove?: TrustedExecutableMove;

// After
readonly trustedMove: TrustedExecutableMove | undefined;
```

### 4. Update all ClassifiedMove construction sites (~8 sites)

In `legal-moves.ts`, ensure every ClassifiedMove literal includes `trustedMove`:

- Sites that omit `trustedMove`: add `trustedMove: undefined`
- Sites that conditionally include it: convert to always-present with `undefined` fallback

## Files to Touch

- `packages/engine/src/kernel/effect-context.ts` (modify)
- `packages/engine/src/kernel/effect-dispatch.ts` (modify)
- `packages/engine/src/kernel/effects-control.ts` (modify)
- `packages/engine/src/kernel/effects-*.ts` (modify — multiple effect handler files as needed)
- `packages/engine/src/kernel/types-core.ts` (modify — ClassifiedMove)
- `packages/engine/src/kernel/legal-moves.ts` (modify)

## Out of Scope

- GameState optional fields — ticket 001
- PolicyEvaluationCoreResult — ticket 003
- MoveViabilityProbeResult — ticket 004
- ESLint rule — ticket 005

## Acceptance Criteria

### Tests That Must Pass

1. All existing engine tests pass unchanged
2. `stateHash` determinism preserved

### Invariants

1. Every EffectCursor object has `tracker` as an own property (possibly `undefined`)
2. Every ClassifiedMove object has `trustedMove` as an own property (possibly `undefined`)
3. No `?` optional syntax on EffectCursor.tracker or ClassifiedMove.trustedMove

## Test Plan

### New/Modified Tests

1. Test files with direct EffectCursor or ClassifiedMove construction — add missing fields (guided by `tsc --noEmit`)

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo typecheck`
4. `pnpm turbo test`

## Outcome (2026-04-13)

- Landed the `EffectCursor` and `ClassifiedMove` contract changes so `tracker` and `trustedMove` are now always-present as `| undefined` instead of conditionally omitted.
- Updated the live constructor paths in `effect-context.ts`, compiled delegate cursor construction, and legal-move classification so direct object literals no longer create alternate shapes by omitting those fields.
- Updated direct fixture and contract-test surfaces, including `ClassifiedMove` test helpers and runner-side test literals that construct `ClassifiedMove` values directly.
- No schema or generated-artifact fallout was required for this ticket.
- Verification run:
  - `pnpm -F @ludoforge/engine build`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo typecheck`
  - `pnpm turbo test`
