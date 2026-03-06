# LEGACTTOO-013: Normalizer — Scope Context for Scoped Variables

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — `tooltip-ir.ts` (optional fields on 4 message types), `tooltip-normalizer.ts` (3 function updates)
**Deps**: archive/tickets/LEGACTTOO/LEGACTTOO-004-core-normalizer-variable-token-marker-rules.md

## Problem

`addVar`, `setVar`, and `transferVar` all carry scope context (`scope: 'global' | 'pvar' | 'zoneVar'`) plus optional `player`/`zone` fields. The normalizer extracts only `var`, discarding scope entirely. This makes player-scoped `addVar { scope: 'pvar', var: 'resources', player: 'arvn', delta: 3 }` indistinguishable from global-scoped `addVar { scope: 'global', var: 'resources', delta: 3 }` in the IR.

Downstream tooltip rendering (LEGACTTOO-006/007) needs scope context to produce accurate text like "ARVN gains 3 Resources" vs "Gain 3 Resources".

## Assumption Reassessment (2026-03-06, corrected)

1. `ScopedVarPayloadContract` is a generic 3-variant union: `{ scope: 'global', var }`, `{ scope: 'pvar', var, player: PlayerSel }`, `{ scope: 'zoneVar', var, zone: ZoneRef }`. **Confirmed.**
2. `AddVarPayload`, `SetVarPayload`, `TransferVarEndpoint` all use this generic contract via `types-ast.ts`. **Confirmed.**
3. `PayMessage`, `GainMessage`, `SetMessage`, `TransferMessage` have no scope/player/zone fields. **Confirmed.**
4. ~~`PlayerSel` is currently `string`.~~ **Corrected:** `PlayerSel` is a union: `'actor' | 'active' | 'all' | 'allOther' | { id: PlayerId } | { chosen: string } | { relative: 'left' | 'right' }`. Normalizer needs a `stringifyPlayerSel` helper. `ZoneRef` is `string | { zoneExpr: ValueExpr }` — confirmed, and `stringifyZoneRef` already exists.
5. `TransferMessage` has TWO endpoints (`from`/`to`), each with independent scope. A single `scope`/`scopeOwner` pair cannot capture both. Per-endpoint fields are needed: `fromScope`/`fromScopeOwner`/`toScope`/`toScopeOwner`.

## Architecture Check

1. Adding optional `scope`/`scopeOwner` fields to IR messages follows the extensibility pattern already used in this module.
2. Keeps the normalizer game-agnostic — it captures scope structurally, not semantically. The content planner (LEGACTTOO-006) decides how to render "ARVN" vs "the active player".
3. No backwards-compatibility shims — new fields are optional.

## What to Change

### 1. Add optional scope fields to `PayMessage`, `GainMessage`, `SetMessage`

```typescript
readonly scope?: 'global' | 'player' | 'zone';
readonly scopeOwner?: string;  // stringified PlayerSel or ZoneRef
```

### 1b. Add per-endpoint scope fields to `TransferMessage`

```typescript
readonly fromScope?: 'global' | 'player' | 'zone';
readonly fromScopeOwner?: string;
readonly toScope?: 'global' | 'player' | 'zone';
readonly toScopeOwner?: string;
```

### 2. Add `stringifyPlayerSel` helper to normalizer

`PlayerSel` is a complex union; needs a helper analogous to the existing `stringifyZoneRef`.

### 3. Update `normalizeAddVar`, `normalizeSetVar`, `normalizeTransferVar`

Extract `scope` from the payload. When `scope` is `'pvar'`, set `scope: 'player'` and `scopeOwner` to the stringified player. When `scope` is `'zoneVar'`, set `scope: 'zone'` and `scopeOwner` to the stringified zone ref. When `scope` is `'global'`, omit both fields. For `transferVar`, apply per-endpoint.

## Files to Touch

- `packages/engine/src/kernel/tooltip-ir.ts` (modify — add optional fields to 4 message types, per-endpoint for Transfer)
- `packages/engine/src/kernel/tooltip-normalizer.ts` (modify — add `stringifyPlayerSel`, update 3 normalizer functions)
- `packages/engine/test/unit/kernel/tooltip-normalizer.test.ts` (modify — add scope-aware tests)

## Out of Scope

- Content planner rendering of scope context (LEGACTTOO-006)
- Template patterns for player/zone-qualified variable names (LEGACTTOO-007)

## Acceptance Criteria

### Tests That Must Pass

1. `addVar` global scope → `PayMessage`/`GainMessage` with no `scope`/`scopeOwner`
2. `addVar` pvar scope → message with `scope: 'player'`, `scopeOwner: 'arvn'`
3. `addVar` zoneVar scope → message with `scope: 'zone'`, `scopeOwner: 'saigon'`
4. `setVar` pvar scope → `SetMessage` with `scope: 'player'`
5. `transferVar` with pvar endpoints → `TransferMessage` with `fromScope: 'player'`, `fromScopeOwner`, `toScope: 'player'`, `toScopeOwner`
6. Existing suite: `pnpm -F @ludoforge/engine test:unit`

### Invariants

1. Existing tests pass without modification (new fields are optional).
2. No game-specific identifiers in normalizer logic.
3. Global-scope variables produce no `scope`/`scopeOwner` fields (clean default).

## Outcome

### Changed vs Originally Planned

- **PlayerSel type correction**: Ticket originally assumed `PlayerSel` is `string`. Corrected to handle the full union type (`'actor' | 'active' | 'all' | 'allOther' | { id: PlayerId } | { chosen: string } | { relative: 'left' | 'right' }`). Added `stringifyPlayerSel` helper.
- **TransferMessage per-endpoint scope**: Ticket originally proposed a single `scope`/`scopeOwner` pair. Changed to per-endpoint fields (`fromScope`/`fromScopeOwner`/`toScope`/`toScopeOwner`) to correctly model two independently-scoped endpoints.
- **Shared `extractScopeFields` helper**: Added a reusable helper that maps AST scope literals (`pvar`/`zoneVar`) to semantic IR scope names (`player`/`zone`), avoiding duplication across the 3 normalizer functions.
- **8 new tests** added (vs 5 planned): extra tests for `PlayerId` object stringification, `ZoneRef` expression stringification, and global transfer endpoint (no scope fields).

### Files Modified

- `packages/engine/src/kernel/tooltip-ir.ts` — added optional scope fields to `PayMessage`, `GainMessage`, `SetMessage`, `TransferMessage`
- `packages/engine/src/kernel/tooltip-normalizer.ts` — added `stringifyPlayerSel`, `extractScopeFields`, `extractEndpointScopeFields`; updated `normalizeAddVar`, `normalizeSetVar`, `normalizeTransferVar`
- `packages/engine/test/unit/kernel/tooltip-normalizer.test.ts` — added 8 scope-context tests

### Verification

- `pnpm -F @ludoforge/engine test:unit` — 3040/3040 pass
- `pnpm turbo typecheck` — 3/3 packages pass

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/tooltip-normalizer.test.ts` — add 5 tests for scope context preservation across addVar, setVar, transferVar

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm turbo typecheck`
