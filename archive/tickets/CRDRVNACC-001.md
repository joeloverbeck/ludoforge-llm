# CRDRVNACC-001: Extract shared card-driven turn-order accessors

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — new shared module in kernel, modify 6 kernel files
**Deps**: None

## Problem

Two accessor functions (`cardDrivenConfig`, `cardDrivenRuntime`) and their associated type aliases (`CardDrivenConfig`, `CardDrivenRuntime`) are independently reimplemented across 6 kernel files. This is 9 duplicate function bodies and 9 duplicate type alias definitions. If the `GameDef` or `GameState` discriminated union shape changes, all copies must be updated in lockstep — a DRY violation that risks projection drift.

## Assumption Reassessment (2026-04-08)

1. **Duplicates confirmed**: `cardDrivenConfig` exists in 5 files (`turn-flow-eligibility.ts:72`, `turn-flow-lifecycle.ts:18`, `legal-moves-turn-order.ts:17`, `turn-flow-action-class.ts:8`, `free-operation-action-domain.ts:5`). `cardDrivenRuntime` exists in 4 files (`turn-flow-eligibility.ts:75`, `turn-flow-lifecycle.ts:21`, `free-operation-viability.ts:66`, `legal-moves-turn-order.ts:20`).
2. **No circular dependency risk**: All consumer files import from `types.js` and/or `contracts/index.js`. A new `card-driven-accessors.ts` depending only on `types.js` introduces no cycles.
3. **All implementations identical**: Each file defines the same one-liner arrow function with the same discriminated union narrowing logic.

## Architecture Check

1. Extracting to a shared module is strictly DRY cleanup — no behavioral change, no new abstractions, just consolidation of identical code.
2. The accessors narrow from generic `GameDef`/`GameState` unions to the `cardDriven` variant. This is engine-internal type narrowing, not game-specific logic. FOUNDATIONS 1 (Engine Agnosticism) preserved.
3. No backwards-compatibility shims — duplicates are deleted, not aliased. FOUNDATIONS 14 (No Backwards Compat) satisfied.

## What to Change

### 1. Create shared accessor module

Create `packages/engine/src/kernel/card-driven-accessors.ts` exporting:

```typescript
import type { GameDef, GameState } from './types.js';

export type CardDrivenConfig = Extract<GameDef['turnOrder'], { type: 'cardDriven' }>['config'];
export type CardDrivenRuntime = Extract<GameState['turnOrderState'], { type: 'cardDriven' }>['runtime'];

export const cardDrivenConfig = (def: GameDef): CardDrivenConfig | null =>
  def.turnOrder?.type === 'cardDriven' ? def.turnOrder.config : null;

export const cardDrivenRuntime = (state: GameState): CardDrivenRuntime | null =>
  state.turnOrderState.type === 'cardDriven' ? state.turnOrderState.runtime : null;
```

### 2. Update 6 consumer files

In each file, replace the local type alias and function definitions with imports from `card-driven-accessors.ts`. Delete the local definitions.

| File | Remove |
|------|--------|
| `turn-flow-eligibility.ts` | Lines ~66-76 (both types + both functions) |
| `turn-flow-lifecycle.ts` | Lines ~15-22 (both types + both functions) |
| `free-operation-viability.ts` | Line ~64-66 (type + runtime function) |
| `legal-moves-turn-order.ts` | Lines ~14-21 (both types + both functions) |
| `turn-flow-action-class.ts` | Lines ~6-9 (type + config function) |
| `free-operation-action-domain.ts` | Lines ~3-6 (type + config function) |

## Files to Touch

- `packages/engine/src/kernel/card-driven-accessors.ts` (new)
- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/src/kernel/turn-flow-lifecycle.ts` (modify)
- `packages/engine/src/kernel/free-operation-viability.ts` (modify)
- `packages/engine/src/kernel/legal-moves-turn-order.ts` (modify)
- `packages/engine/src/kernel/turn-flow-action-class.ts` (modify)
- `packages/engine/src/kernel/free-operation-action-domain.ts` (modify)

## Out of Scope

- Changing the accessor logic or signatures
- Refactoring the card-driven turn-order system beyond DRY extraction
- Adding new accessors for other turn-order variants

## Acceptance Criteria

### Tests That Must Pass

1. No local definitions of `cardDrivenConfig`, `cardDrivenRuntime`, `CardDrivenConfig`, or `CardDrivenRuntime` remain in the 6 consumer files
2. All consumer files import from `card-driven-accessors.ts`
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. The shared accessors return the exact same types as the local versions (discriminated union narrowing preserved)
2. No new circular dependencies introduced
3. No behavioral change — pure refactor

## Test Plan

### New/Modified Tests

1. No new tests required — this is a mechanical extraction with no behavioral change. Existing tests covering turn-flow eligibility, lifecycle, legal moves, and free operations already exercise these accessors.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`

## Outcome

- Completed: 2026-04-08
- What changed:
  - Added `packages/engine/src/kernel/card-driven-accessors.ts` as the shared home for `CardDrivenConfig`, `CardDrivenRuntime`, `cardDrivenConfig`, and `cardDrivenRuntime`.
  - Updated the six consumer modules to import the shared accessors/types and removed their local duplicate definitions.
- Deviations from original plan:
  - `free-operation-viability.ts` still referenced `CardDrivenRuntime` in a function signature after the extraction, so the shared type import was added there during verification-owned cleanup.
- Verification results:
  - `pnpm -F @ludoforge/engine test` ✅
  - `pnpm turbo typecheck` ✅
  - `pnpm turbo lint` ✅
