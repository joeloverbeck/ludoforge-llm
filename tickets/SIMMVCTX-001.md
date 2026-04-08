# SIMMVCTX-001: Extract MoveContext construction from simulator to kernel

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small-Medium
**Engine Changes**: Yes — new kernel export, modify simulator
**Deps**: `specs/63-grant-array-authority.md`

**Note**: The Spec 63 dependency is soft — this ticket is not blocked by it, but grant consolidation may simplify adjacent simulator code.

## Problem

`simulator.ts:37-62` defines `captureMoveContext()` which extracts game-semantic metadata from moves using string pattern matching (`actionId.includes('shaded')`) and magic parameter names (`$cardId`, `cardId`, `__windowId`). The kernel defines the `MoveContext` type (`types-core.ts:1487-1492`) but provides no extraction function. This is a boundary inversion: the simulator reaches into kernel-domain semantics without a kernel-provided API.

The function has been patched twice in ~3 weeks (commits `4c31b6cf` and `8669140e`) to accommodate kernel state machine changes, confirming the coupling is actively maintained.

## Assumption Reassessment (2026-04-08)

1. **`captureMoveContext` confirmed at `simulator.ts:37-62`**: Extracts `eventSide` via `actionId.includes('shaded'/'unshaded')`, `currentCardId` via `move.params['$cardId']` or `move.params['cardId']`, `turnFlowWindow` via `move.params['__windowId']`.
2. **`MoveContext` type at `types-core.ts:1487-1492`**: Has fields `currentCardId?`, `previewCardId?`, `eventSide?`, `turnFlowWindow?`.
3. **No existing `move-context.ts`**: The type lives in the monolithic `types-core.ts`. A new file is needed for the extraction function.
4. **The magic parameter names (`$cardId`, `__windowId`) are kernel conventions**: They appear in effect handlers and move construction within the kernel. The extraction logic belongs with those conventions.

## Architecture Check

1. Moving extraction to the kernel respects the boundary: the kernel owns `MoveContext`, so it should own construction from its own move/action conventions. FOUNDATIONS 5 (One Rules Protocol) — the simulator and runner should consume the same kernel-provided API.
2. String pattern matching on `actionId` is fragile. If action naming conventions change, the kernel extraction function changes in one place rather than requiring simulator patches. FOUNDATIONS 15 (Architectural Completeness).
3. No backwards-compatibility shims — `captureMoveContext` in simulator.ts is replaced, not aliased. FOUNDATIONS 14 (No Backwards Compat).

## What to Change

### 1. Create kernel extraction function

Create `packages/engine/src/kernel/move-context.ts` exporting:

```typescript
import type { Move } from './types.js';
import type { MoveContext } from './types-core.js';

/**
 * Extract MoveContext metadata from a move's actionId and params.
 * Returns undefined if no context fields are present.
 */
export function extractMoveContext(move: Move): MoveContext | undefined;
```

The implementation moves the string matching and parameter extraction logic from `simulator.ts:37-62` into this function.

### 2. Update simulator

Replace the local `captureMoveContext` function in `simulator.ts` with an import of `extractMoveContext` from the kernel.

### 3. Export from kernel barrel (if applicable)

If the kernel has a barrel export (`index.ts`), add `extractMoveContext` to it so the simulator can import it cleanly.

## Files to Touch

- `packages/engine/src/kernel/move-context.ts` (new)
- `packages/engine/src/sim/simulator.ts` (modify — replace local function with kernel import)
- `packages/engine/src/kernel/index.ts` (modify — add export, if barrel exists)

## Out of Scope

- Changing the `MoveContext` type shape
- Refactoring the simulator's grant error-recovery logic (that's Spec 63's domain)
- Adding MoveContext to the event stream (separate concern)

## Acceptance Criteria

### Tests That Must Pass

1. `captureMoveContext` no longer exists in `simulator.ts`
2. `extractMoveContext` is exported from the kernel and used by the simulator
3. Existing suite: `pnpm -F @ludoforge/engine test`
4. Determinism canary: `packages/engine/test/determinism/fitl-policy-agent-canary.test.ts`

### Invariants

1. `extractMoveContext` produces identical output to the former `captureMoveContext` for all inputs
2. The kernel is the single owner of MoveContext construction logic (FOUNDATIONS 5)
3. No behavioral change to simulation — pure boundary correction

## Test Plan

### New/Modified Tests

1. `packages/engine/test/kernel/move-context.test.ts` — unit tests for `extractMoveContext`:
   - Returns `undefined` for moves with no context fields
   - Extracts `eventSide: 'shaded'` from actionId containing 'shaded'
   - Extracts `eventSide: 'unshaded'` from actionId containing 'unshaded'
   - Extracts `currentCardId` from `$cardId` param (preferred) and `cardId` param (fallback)
   - Extracts `turnFlowWindow` from `__windowId` param
   - Returns combined context when multiple fields present

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern move-context`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`
