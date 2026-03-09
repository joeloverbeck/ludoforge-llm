# HUMREAACTTOO-003: ChooseN Domain Context

**Status**: DONE
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — tooltip IR type change, normalizer-compound update, template realizer update
**Deps**: None

## Problem

`normalizeChooseN()` classifies all non-space, non-token queries as `target: 'items'` with no domain context. The template realizer renders these as the ambiguous `"Select up to N items"`, which is meaningless to the user. For example, a ChooseN over `intsInRange` (choosing a bet amount) or `players` (choosing a target faction) both render identically as `"Select up to N items"`.

## Assumption Reassessment (2026-03-08)

1. `SelectMessage.target` in `tooltip-ir.ts` is typed as `'spaces' | 'zones' | 'items'` — **verified** (line 20, only 3 options).
2. `SelectMessage` has no `optionHints` field — **verified** (grep returns no matches).
3. `normalizeChooseN` in `tooltip-normalizer-compound.ts` exists and classifies query types — **verified** (line 101).
4. `realizeSelect` in `tooltip-template-realizer.ts` exists — **verified**, but has no `optionHints` handling.

## Architecture Check

1. Expanding the `target` union is a safe additive type change — existing `'spaces' | 'zones' | 'items'` values remain valid.
2. `optionHints` is optional, so all existing SelectMessages without it remain valid.
3. No game-specific logic — query type classification is based on AST node kinds, not game identifiers.

## What to Change

### 1. Expand `SelectMessage.target` in `tooltip-ir.ts`

Change from:
```typescript
readonly target: 'spaces' | 'zones' | 'items';
```
To:
```typescript
readonly target: 'spaces' | 'zones' | 'items' | 'players' | 'values' | 'markers' | 'rows';
```

Add optional field:
```typescript
readonly optionHints?: readonly string[];
```

### 2. Update `normalizeChooseN` in `tooltip-normalizer-compound.ts`

Expand classification logic:

| Query type | target |
|------------|--------|
| `mapSpaces`, `zones`, `adjacentZones`, `connectedZones`, `tokenZones` | `'spaces'` |
| `tokensInZone`, `tokensInMapSpaces`, `tokensInAdjacentZones` | `'zones'` |
| `players` | `'players'` |
| `intsInRange`, `intsInVarRange` | `'values'` |
| `globalMarkers` | `'markers'` |
| `assetRows` | `'rows'` |
| `enums` | `'items'` + populate `optionHints` from enum values |
| fallback | `'items'` |

### 3. Update `realizeSelect` in `tooltip-template-realizer.ts`

- When `optionHints` is present and has <=5 items, render `"Choose from: {options}"`.
- Expand `singularTarget` mapping for new target types: `'players'` → `"player"`, `'values'` → `"value"`, `'markers'` → `"marker"`, `'rows'` → `"row"`.

## Files to Touch

- `packages/engine/src/kernel/tooltip-ir.ts` (modify — expand `SelectMessage`)
- `packages/engine/src/kernel/tooltip-normalizer-compound.ts` (modify — update `normalizeChooseN`)
- `packages/engine/src/kernel/tooltip-template-realizer.ts` (modify — update `realizeSelect`)

## Out of Scope

- `tooltip-value-stringifier.ts` extraction (HUMREAACTTOO-001)
- Modifier humanizer ref type coverage (HUMREAACTTOO-002)
- `SummaryMessage` or macro changes (HUMREAACTTOO-004)
- Binding name sanitization (HUMREAACTTOO-005)
- Runner UI components
- Content planner changes (the planner already handles `select` messages generically)

## Acceptance Criteria

### Tests That Must Pass

1. Updated `tooltip-normalizer-compound.test.ts`: `normalizeChooseN` with `players` query → `target: 'players'`.
2. Updated `tooltip-normalizer-compound.test.ts`: `normalizeChooseN` with `intsInRange` query → `target: 'values'`.
3. Updated `tooltip-normalizer-compound.test.ts`: `normalizeChooseN` with `enums` query → `target: 'items'` + `optionHints` populated.
4. Updated `tooltip-normalizer-compound.test.ts`: `normalizeChooseN` with `globalMarkers` query → `target: 'markers'`.
5. Updated `tooltip-normalizer-compound.test.ts`: `normalizeChooseN` with `assetRows` query → `target: 'rows'`.
6. Updated `tooltip-template-realizer.test.ts`: `realizeSelect` with `target: 'players'` → `"Select N players"`.
7. Updated `tooltip-template-realizer.test.ts`: `realizeSelect` with `optionHints: ['Fold', 'Call', 'Raise']` → `"Choose from: Fold, Call, Raise"`.
8. Existing suite: `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test`

### Invariants

1. Existing `SelectMessage` instances with `target: 'spaces' | 'zones' | 'items'` produce identical output.
2. No game-specific logic in classification — query type detection is based on AST node shape.
3. `optionHints` is optional — omitted when not applicable.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/tooltip-normalizer-compound.test.ts` — add classification tests for each new query type.
2. `packages/engine/test/unit/kernel/tooltip-template-realizer.test.ts` — add rendering tests for new targets and `optionHints`.

### Commands

1. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
