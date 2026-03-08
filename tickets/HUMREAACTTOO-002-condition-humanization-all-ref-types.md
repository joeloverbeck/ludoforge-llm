# HUMREAACTTOO-002: Condition Humanization for All Reference Types

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — tooltip-modifier-humanizer updates
**Deps**: HUMREAACTTOO-001 (canonical value stringifier must exist first)

## Problem

`humanizeValue()` in `tooltip-modifier-humanizer.ts` only handles `gvar`, `pvar`, `binding`, and `globalMarkerState` references. The remaining 8 ref types (`markerState`, `zoneCount`, `tokenProp`, `assetField`, `zoneProp`, `activePlayer`, `tokenZone`, `zoneVar`) fall through to `<value>`, producing unreadable condition descriptions in modifier tooltips. For example, a condition like "if Population of Saigon >= 2" renders as "if <value> >= 2".

Additionally, `extractValueNames()` does not extract variable names from the missing ref types, so suppression checks may miss them.

## Assumption Reassessment (2026-03-08)

1. `humanizeValue` in `tooltip-modifier-humanizer.ts` handles `gvar`, `pvar`, `binding`, `globalMarkerState` but not the 8 other ref types — **verified**.
2. `extractValueNames` exists in the same file and is used for suppression checks — **needs verification at implementation time**.
3. The `resolveLabel()` function is available in the modifier humanizer context for verbalization-aware display names — **verified** (imported and used throughout the file).

## Architecture Check

1. This extends the existing humanizer to cover all ref types, using `resolveLabel()` for verbalization-aware output — consistent with the existing pattern.
2. No game-specific logic — ref type handling is generic. Game-specific display names come from verbalization labels.
3. No new abstractions — just extending existing switch/case coverage.

## What to Change

### 1. Update `humanizeValue` in `tooltip-modifier-humanizer.ts`

Add cases for all 8 missing ref types, using `resolveLabel()` for display names:

| Ref type | Output pattern |
|----------|----------------|
| `markerState` | `"{resolveLabel(marker)} of {resolveLabel(space)}"` |
| `zoneCount` | `"pieces in {resolveLabel(zone)}"` |
| `tokenProp` | `"{resolveLabel(token)}.{prop}"` |
| `assetField` | `"{field}"` |
| `zoneProp` | `"{resolveLabel(zone)}.{prop}"` |
| `activePlayer` | `"active player"` |
| `tokenZone` | `"zone of {resolveLabel(token)}"` |
| `zoneVar` | `"{resolveLabel(var)} of {resolveLabel(zone)}"` |

### 2. Update `extractValueNames` in `tooltip-modifier-humanizer.ts`

Add extraction for the missing ref types so suppression pattern checks cover variable names from all reference kinds.

## Files to Touch

- `packages/engine/src/kernel/tooltip-modifier-humanizer.ts` (modify)

## Out of Scope

- Creating `tooltip-value-stringifier.ts` (that's HUMREAACTTOO-001)
- `SelectMessage.target` expansion (that's HUMREAACTTOO-003)
- `SummaryMessage` or macro changes (that's HUMREAACTTOO-004)
- Binding name sanitization (that's HUMREAACTTOO-005)
- Template realizer changes
- Runner UI components

## Acceptance Criteria

### Tests That Must Pass

1. Updated `tooltip-modifier-humanizer.test.ts`: each of the 8 new ref types in a condition context produces readable English (not `<value>`).
2. Updated `tooltip-modifier-humanizer.test.ts`: `extractValueNames` returns names for all ref types that contain extractable variable/zone/marker names.
3. Existing modifier humanizer tests pass unchanged.
4. Existing suite: `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test`

### Invariants

1. Existing modifier humanization for `gvar`, `pvar`, `binding`, `globalMarkerState` is unchanged.
2. No game-specific logic — display names come from `resolveLabel()` which reads verbalization data.
3. Immutability preserved — no mutations in humanizer functions.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/tooltip-modifier-humanizer.test.ts` — add test cases for each of the 8 new ref types in condition context, plus `extractValueNames` coverage.

### Commands

1. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
