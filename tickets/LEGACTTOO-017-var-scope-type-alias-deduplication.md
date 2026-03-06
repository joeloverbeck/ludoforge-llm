# LEGACTTOO-017: VarScope Type Alias — Deduplicate Scope Literal Union

**Status**: PENDING
**Priority**: LOW
**Effort**: Small
**Engine Changes**: Yes — `tooltip-ir.ts` (new type alias, update 6 field declarations), `tooltip-normalizer.ts` (import and use alias in `ScopeFields`)
**Deps**: archive/tickets/LEGACTTOO/LEGACTTOO-013.md

## Problem

The scope literal union `'global' | 'player' | 'zone'` is repeated 6 times across `tooltip-ir.ts`:
- `PayMessage.scope`
- `GainMessage.scope`
- `SetMessage.scope`
- `TransferMessage.fromScope`
- `TransferMessage.toScope`

Plus once in `tooltip-normalizer.ts` (`ScopeFields.scope`).

If a new scope variant is added (e.g., `'team'` for team-scoped variables), every occurrence must be found and updated manually. Missing one produces a silent type mismatch — the normalizer could produce a scope value that a message type doesn't accept, or vice versa.

## Assumption Reassessment (2026-03-06)

1. The literal `'global' | 'player' | 'zone'` appears in exactly 6 field declarations in `tooltip-ir.ts` and 1 in `tooltip-normalizer.ts`. **Confirmed.**
2. All 7 occurrences use the identical 3-member union. **Confirmed.**
3. `scoped-var-contract.ts` defines `AST_SCOPED_VAR_SCOPES` with AST-level scope names (`global`, `pvar`, `zoneVar`) — these are intentionally different from the IR-level semantic names (`global`, `player`, `zone`). The new alias is for IR-level only. **Confirmed.**
4. No existing type alias covers this. **Confirmed.**

## Architecture Check

1. A single `VarScope` type alias is the standard DRY pattern for repeated literal unions. Adding or removing a scope variant becomes a single-line change.
2. Keeps IR-level scope naming (`player`/`zone`) separate from AST-level naming (`pvar`/`zoneVar`) in `scoped-var-contract.ts` — no conflation.
3. No game-specific logic. Pure type-level refactor.
4. No backwards-compatibility shims — direct replacement, no aliasing.

## What to Change

### 1. Add `VarScope` type alias in `tooltip-ir.ts`

```typescript
export type VarScope = 'global' | 'player' | 'zone';
```

Place near the top, after `MessageBase`.

### 2. Replace all 6 inline unions in `tooltip-ir.ts` with `VarScope`

- `PayMessage.scope?: VarScope`
- `GainMessage.scope?: VarScope`
- `SetMessage.scope?: VarScope`
- `TransferMessage.fromScope?: VarScope`
- `TransferMessage.toScope?: VarScope`

### 3. Update `ScopeFields` in `tooltip-normalizer.ts`

Import `VarScope` from `tooltip-ir.ts` and use it:
```typescript
type ScopeFields = {
  readonly scope?: VarScope;
  readonly scopeOwner?: string;
};
```

## Files to Touch

- `packages/engine/src/kernel/tooltip-ir.ts` (modify — add type alias, update 5 field declarations)
- `packages/engine/src/kernel/tooltip-normalizer.ts` (modify — import and use `VarScope` in `ScopeFields`)

## Out of Scope

- Unifying with AST-level scope names in `scoped-var-contract.ts` (intentionally different naming layers)
- Adding new scope variants (this ticket only deduplicates the existing union)

## Acceptance Criteria

### Tests That Must Pass

1. Existing suite: `pnpm -F @ludoforge/engine test:unit`
2. `pnpm turbo typecheck`

### Invariants

1. The literal `'global' | 'player' | 'zone'` no longer appears inline in any message interface — all use `VarScope`.
2. `VarScope` is the single source of truth for IR-level scope names.

## Test Plan

### New/Modified Tests

1. No new tests needed — pure type-level refactor with no runtime behavior change. Existing scope tests from LEGACTTOO-013 provide coverage.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm turbo typecheck`
