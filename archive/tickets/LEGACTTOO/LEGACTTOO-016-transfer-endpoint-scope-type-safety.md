# LEGACTTOO-016: Transfer Endpoint Scope — Type-Safe Field Mapping

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — `tooltip-normalizer.ts` (refactor `extractEndpointScopeFields`)
**Deps**: archive/tickets/LEGACTTOO/LEGACTTOO-013.md

## Problem

`extractEndpointScopeFields` returns `Record<string, string>`, a deliberately loose type that bypasses TypeScript's structural checking. It uses computed property keys (`[`${prefix}Scope`]`) to build `fromScope`/`toScope` etc. dynamically. When the result is spread into a `TransferMessage` object literal, TypeScript cannot verify that the keys match the interface — a typo like `fromScop` or a missed rename would compile silently.

By contrast, `extractScopeFields` (used by `normalizeAddVar`/`normalizeSetVar`) returns the properly typed `ScopeFields` and gets full compile-time checking.

## Assumption Reassessment (2026-03-06)

1. `extractEndpointScopeFields` is the only function in `tooltip-normalizer.ts` that returns `Record<string, string>`. **Confirmed.**
2. `TransferMessage` has typed optional fields: `fromScope?`, `fromScopeOwner?`, `toScope?`, `toScopeOwner?` — all `string` or `'global' | 'player' | 'zone'`. **Confirmed.**
3. `extractScopeFields` already exists and correctly produces `ScopeFields` for a single endpoint. **Confirmed.**
4. No other consumers of `extractEndpointScopeFields` exist — it's only called in `normalizeTransferVar`. **Confirmed.**

## Architecture Check

1. Replacing `Record<string, string>` with explicit field mapping eliminates a type-safety escape hatch. The compiler can then catch key mismatches at build time.
2. Reusing `extractScopeFields` for each endpoint and remapping at the call site follows DRY — two extraction helpers that share core logic are unified into one.
3. No game-specific logic involved. Pure structural refactor.
4. No backwards-compatibility shims.

## What to Change

### 1. Remove `extractEndpointScopeFields` entirely

### 2. In `normalizeTransferVar`, call `extractScopeFields` on each endpoint and map explicitly

```typescript
const fromScope = extractScopeFields(from);
const toScope = extractScopeFields(to);
return [{
  kind: 'transfer',
  resource: from.var,
  amount: numAmount,
  from: from.var,
  to: to.var,
  ...(amountExpr !== undefined ? { amountExpr } : {}),
  ...(fromScope.scope !== undefined ? { fromScope: fromScope.scope, fromScopeOwner: fromScope.scopeOwner } : {}),
  ...(toScope.scope !== undefined ? { toScope: toScope.scope, toScopeOwner: toScope.scopeOwner } : {}),
  astPath,
}];
```

## Files to Touch

- `packages/engine/src/kernel/tooltip-normalizer.ts` (modify — remove `extractEndpointScopeFields`, update `normalizeTransferVar`)

## Out of Scope

- Changing `ScopeFields` type definition (already correct)
- Adding new tests (existing scope tests in LEGACTTOO-013 cover all transfer endpoint scenarios)

## Acceptance Criteria

### Tests That Must Pass

1. `transferVar with pvar endpoints → TransferMessage with per-endpoint scope` (existing)
2. `transferVar with global endpoints → TransferMessage with no scope fields` (existing)
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`

### Invariants

1. No `Record<string, string>` return types in normalizer functions.
2. All field names spread into message literals are compile-time verified against their interface.

## Test Plan

### New/Modified Tests

1. No new tests needed — existing LEGACTTOO-013 tests already assert the exact field names and values on `TransferMessage`.

### Commands

1. `node --test packages/engine/dist/test/unit/kernel/tooltip-normalizer.test.js`
2. `pnpm turbo typecheck`

## Outcome

Implemented exactly as planned. Removed `extractEndpointScopeFields` (12 lines) and updated `normalizeTransferVar` to call `extractScopeFields` on each endpoint with explicit typed field mapping. No behavioral change — all 58 existing normalizer tests pass. Zero `Record<string, string>` return types remain in the normalizer. Typecheck passes across both packages.
