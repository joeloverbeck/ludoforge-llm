# 100COMEVEEFF-003: Implement effect AST walker and annotation builder

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — new compiler module
**Deps**: `archive/tickets/100COMEVEEFF-001.md`

## Problem

The core work of Spec 100: walk each event card's effect ASTs and extract a flat numeric feature vector summarizing what each card side does. This is the main analysis module — everything else (wiring, surface refs, tests) depends on this producing correct annotation data.

## Assumption Reassessment (2026-03-31)

1. `walkEffects` exists at `packages/engine/src/kernel/effect-compiler-patterns.ts:931` (NOT `cnl/` as spec states). The new module must import from `kernel/` path.
2. Event card types: `EventDeckDef`, `EventCardDef`, `EventSideDef` are in `types-core.ts`. Each side has `effects`, `branches`, `targets`, `lastingEffects` arrays.
3. Effect AST uses `_k` discriminant tags for exhaustive dispatch. All 34+ effect kinds are in the `EffectAST` union type in `types-core.ts`.
4. `GameDef.globalVars` and `GameDef.perPlayerVars` are available for variable scope resolution.
5. Zone ownership and seat resolution require access to `GameDef.zones` (for zone-to-seat mapping).

## Architecture Check

1. The walker is a pure function: `(eventDecks, gameDef) → CompiledEventAnnotationIndex`. No side effects, no mutation. Returns a new immutable structure.
2. Fully engine-agnostic — dispatches on generic `_k` tags without knowing game semantics. Works for FITL, Texas Hold'em, or any future game.
3. Conservative counting (both branches of `if/else` counted) is intentional — this is a heuristic signal, not exact prediction. Over-estimation is safer than under-estimation for policy scoring.
4. Reuses the recursive descent pattern from `walkEffects` but with a counting visitor instead of an effect-application visitor.

## What to Change

### 1. Create `packages/engine/src/cnl/compile-event-annotations.ts`

New module exporting `buildEventAnnotationIndex`:

```typescript
export function buildEventAnnotationIndex(
  eventDecks: readonly CompiledEventDeckDef[],
  gameDef: { readonly globalVars: ...; readonly perPlayerVars: ...; readonly zones: ... }
): CompiledEventAnnotationIndex;
```

Internal implementation:
- `annotateEventSide(side: EventSideDef, context: AnnotationContext): CompiledEventSideAnnotation`
- `walkAndCount(effects: readonly EffectAST[], acc: MutableAnnotationAccumulator): void` — recursive walker
- `resolveTokenSeat(effect: EffectAST, context: AnnotationContext): string` — seat attribution
- `resolveVarScope(varId: string, context: AnnotationContext): 'global' | 'perPlayer'` — variable scope

### 2. Effect traversal coverage

Walk ALL effect arrays on each `EventSideDef`:
1. `side.effects`
2. `side.branches[].effects`
3. `side.targets[].effects`
4. `side.lastingEffects[].setupEffects`
5. `side.lastingEffects[].teardownEffects`
6. `side.branches[].targets[].effects`
7. `side.branches[].lastingEffects[].setupEffects`
8. `side.branches[].lastingEffects[].teardownEffects`

### 3. Leaf effect dispatch (by `_k` tag)

Token effects:
- `moveToken` → `tokenPlacements[targetSeat]++` or `tokenRemovals[sourceSeat]++`
- `createToken` → `tokenCreations[targetSeat]++`, `tokenPlacements[targetSeat]++`
- `destroyToken` → `tokenDestructions[sourceSeat]++`, `tokenRemovals[sourceSeat]++`
- `moveAll` → `tokenPlacements['dynamic']++`, `tokenRemovals['dynamic']++`
- `moveTokenAdjacent` → `tokenPlacements['dynamic']++`, `tokenRemovals['dynamic']++`

Marker effects:
- `setMarker`/`shiftMarker` → `markerModifications++`
- `setGlobalMarker`/`flipGlobalMarker`/`shiftGlobalMarker` → `globalMarkerModifications++`

Variable effects:
- `setVar`/`addVar` on global → `globalVarModifications++`
- `setVar`/`addVar` on perPlayer → `perPlayerVarModifications++`
- `transferVar` → `varTransfers++`

Deck effects:
- `draw` → `drawCount++`
- `shuffle` → `shuffleCount++`

Phase control:
- `gotoPhaseExact`/`advancePhase`/`pushInterruptPhase`/`popInterruptPhase` → `hasPhaseControl = true`

Decision points:
- `chooseOne`/`chooseN` → `hasDecisionPoints = true`

All effects → `effectNodeCount++`

### 4. Structural property extraction

Read directly from `EventSideDef`:
- `freeOperationGrants` → `grantsOperation = true`, collect seat IDs into `grantOperationSeats`
- `eligibilityOverrides` → `hasEligibilityOverride = true`
- `lastingEffects` length > 0 → `hasLastingEffect = true`
- `branches` length > 0 → `hasBranches = true`

### 5. Seat resolution strategy

For token effects with resolvable zone targets:
- Literal seat ID → that seat
- `self`/`active` → first seat in card's `seatOrder` (heuristic)
- Dynamic expression → `'dynamic'`

### 6. Unit tests

Create `packages/engine/test/unit/cnl/compile-event-annotations.test.ts`:
- Synthetic effect tree tests (known counts for each effect kind)
- Conservative counting test (both if/else branches counted)
- Per-seat attribution test
- Structural property extraction test
- Empty event deck produces empty index
- Unrecognized `_k` tags contribute only to `effectNodeCount`

## Files to Touch

- `packages/engine/src/cnl/compile-event-annotations.ts` (new)
- `packages/engine/test/unit/cnl/compile-event-annotations.test.ts` (new)

## Out of Scope

- Wiring into compiler pipeline (ticket 004)
- Surface ref parsing or resolution (tickets 005/006)
- FITL golden tests or cross-game tests (ticket 008)
- Runtime policy evaluation

## Acceptance Criteria

### Tests That Must Pass

1. Walker correctly counts token placements/removals/creations/destructions per seat for a synthetic effect tree
2. Conservative counting: `if/else` branches both contribute to counts
3. Marker, variable, deck, phase, and decision effects all counted correctly
4. Structural properties (`grantsOperation`, `hasEligibilityOverride`, etc.) extracted from side-level fields
5. Empty event deck → empty annotation index
6. `effectNodeCount` counts all visited nodes including nested control flow
7. Existing suite: `pnpm turbo test`

### Invariants

1. The walker is a pure function — no mutation of input structures
2. All annotation numeric fields are non-negative
3. `tokenCreations` is always a subset of `tokenPlacements` (creation implies placement)
4. `tokenDestructions` is always a subset of `tokenRemovals` (destruction implies removal)
5. `effectNodeCount >= sum of all other counts` (every counted effect also increments node count)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cnl/compile-event-annotations.test.ts` — comprehensive walker unit tests with synthetic effect trees

### Commands

1. `node --test packages/engine/dist/test/unit/cnl/compile-event-annotations.test.js`
2. `pnpm turbo typecheck`
3. `pnpm turbo test`
