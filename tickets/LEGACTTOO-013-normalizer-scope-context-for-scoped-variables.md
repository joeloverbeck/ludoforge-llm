# LEGACTTOO-013: Normalizer — Scope Context for Scoped Variables

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — `tooltip-ir.ts` (optional fields on 4 message types), `tooltip-normalizer.ts` (3 function updates)
**Deps**: archive/tickets/LEGACTTOO/LEGACTTOO-004-core-normalizer-variable-token-marker-rules.md

## Problem

`addVar`, `setVar`, and `transferVar` all carry scope context (`scope: 'global' | 'pvar' | 'zoneVar'`) plus optional `player`/`zone` fields. The normalizer extracts only `var`, discarding scope entirely. This makes player-scoped `addVar { scope: 'pvar', var: 'resources', player: 'arvn', delta: 3 }` indistinguishable from global-scoped `addVar { scope: 'global', var: 'resources', delta: 3 }` in the IR.

Downstream tooltip rendering (LEGACTTOO-006/007) needs scope context to produce accurate text like "ARVN gains 3 Resources" vs "Gain 3 Resources".

## Assumption Reassessment (2026-03-06)

1. `ScopedVarPayloadContract` is a generic 3-variant union: `{ scope: 'global', var }`, `{ scope: 'pvar', var, player: PlayerSel }`, `{ scope: 'zoneVar', var, zone: ZoneRef }`.
2. `AddVarPayload`, `SetVarPayload`, `TransferVarEndpoint` all use this generic contract via `types-ast.ts`.
3. `PayMessage`, `GainMessage`, `SetMessage`, `TransferMessage` have no scope/player/zone fields.
4. `PlayerSel` is currently `string`. `ZoneRef` is `string | { zoneExpr: ValueExpr }`.

## Architecture Check

1. Adding optional `scope`/`scopeOwner` fields to IR messages follows the extensibility pattern already used in this module.
2. Keeps the normalizer game-agnostic — it captures scope structurally, not semantically. The content planner (LEGACTTOO-006) decides how to render "ARVN" vs "the active player".
3. No backwards-compatibility shims — new fields are optional.

## What to Change

### 1. Add optional scope fields to `PayMessage`, `GainMessage`, `SetMessage`, `TransferMessage`

```typescript
readonly scope?: 'global' | 'player' | 'zone';
readonly scopeOwner?: string;  // player id or zone ref string
```

### 2. Update `normalizeAddVar`, `normalizeSetVar`, `normalizeTransferVar`

Extract `scope` from the payload. When `scope` is `'pvar'`, set `scope: 'player'` and `scopeOwner` to the stringified player. When `scope` is `'zoneVar'`, set `scope: 'zone'` and `scopeOwner` to the stringified zone ref. When `scope` is `'global'`, omit both fields.

## Files to Touch

- `packages/engine/src/kernel/tooltip-ir.ts` (modify — add optional fields to 4 message types)
- `packages/engine/src/kernel/tooltip-normalizer.ts` (modify — 3 function updates)
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
5. `transferVar` endpoints with different scopes → `TransferMessage` preserves scope info
6. Existing suite: `pnpm -F @ludoforge/engine test:unit`

### Invariants

1. Existing tests pass without modification (new fields are optional).
2. No game-specific identifiers in normalizer logic.
3. Global-scope variables produce no `scope`/`scopeOwner` fields (clean default).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/tooltip-normalizer.test.ts` — add 5 tests for scope context preservation across addVar, setVar, transferVar

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm turbo typecheck`
