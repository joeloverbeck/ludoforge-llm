# 64MCTSPEROPT-006: familyKey() / abstractMoveKey() for Search Control

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — move-key module, cache integration
**Deps**: 64MCTSPEROPT-002

## Problem

FITL's root includes many near-duplicate ready variants (e.g., `vcTransferResources{amount:1}` through `{amount:5}`). Without a coarse grouping key, high-cardinality ready families crowd out strategically distinct action families (rally, march, attack get zero visits). The spec (section 3.4) requires a `familyKey()` that groups moves by `actionId` (and optionally a light parameter-shape signature), intentionally coarser than `moveKey`.

## Assumption Reassessment (2026-03-17)

1. `canonicalMoveKey()` in `move-key.ts` serializes `actionId + params + compound` — too fine-grained for family grouping — **confirmed**.
2. `resolveTurnFlowActionClass()` in `packages/engine/src/kernel/turn-flow-action-class.ts` classifies into `operation | limitedOperation | specialActivity | operationPlusSpecialActivity | event | pass` — **confirmed**, spec notes this as a natural ingredient for `familyKey`.
3. `CachedLegalMoveInfo` from ticket 002 has a `familyKey?: string` field — spec says "optional in Phase 2; populated once familyKey() lands in Phase 3."

## Architecture Check

1. `familyKey` is a search-control key, not a semantic equivalence proof — intentionally coarse.
2. Uses `actionId` as primary grouping signal, with optional `TurnFlowActionClass` for coarser operation/event/pass distinction.
3. Game-agnostic: works for any game, not just FITL.

## What to Change

### 1. Add `familyKey()` function to `move-key.ts`

```typescript
export function familyKey(move: Move): string {
  return move.actionId;
}
```

Simple default: group by `actionId`. This already separates rally, march, attack, transfer, etc.

### 2. Add optional `abstractMoveKey()` with action-class integration

When `TurnFlowActionClass` is available (FITL and similar games), provide a coarser key:
```typescript
export function abstractMoveKey(move: Move, actionClass?: TurnFlowActionClass): string {
  if (actionClass) return actionClass;
  return move.actionId;
}
```

### 3. Populate `familyKey` in `CachedLegalMoveInfo`

When initializing `CachedClassificationEntry` (from ticket 002), compute and store `familyKey` alongside `moveKey`. Computed once per cached move.

### 4. Add family-level aggregate helpers

- `getRepresentedFamilies(entry: CachedClassificationEntry): Set<string>` — returns unique family keys of classified moves.
- `countByFamily(entry: CachedClassificationEntry): Map<string, number>` — count of children per family.

## Files to Touch

- `packages/engine/src/agents/mcts/move-key.ts` (modify — add `familyKey()`, `abstractMoveKey()`)
- `packages/engine/src/agents/mcts/state-cache.ts` (modify — populate `familyKey` in `CachedLegalMoveInfo`, add family helpers)

## Out of Scope

- Family-first widening logic (ticket 64MCTSPEROPT-007)
- Pending-family coverage rules (ticket 64MCTSPEROPT-008)
- Budget profiles (ticket 64MCTSPEROPT-009)
- Changes to `search.ts` selection/expansion (those consume familyKey via tickets 007/008)
- Any game-specific heuristics in the family key

## Acceptance Criteria

### Tests That Must Pass

1. `familyKey({ actionId: 'rally', params: { zone: 'saigon' } })` === `familyKey({ actionId: 'rally', params: { zone: 'hue' } })` — same family.
2. `familyKey({ actionId: 'rally', ... })` !== `familyKey({ actionId: 'march', ... })` — different families.
3. `abstractMoveKey(move, 'operation')` returns `'operation'` — coarser than actionId.
4. `CachedLegalMoveInfo` entries have `familyKey` populated after `initClassificationEntry()`.
5. `getRepresentedFamilies()` returns correct unique set.
6. `countByFamily()` returns correct counts.
7. `pnpm -F @ludoforge/engine test` — full suite passes.
8. `pnpm turbo typecheck` passes.

### Invariants

1. `familyKey` is coarser than `moveKey` — moves with different params but same `actionId` share a family.
2. `familyKey` is computed once per cached move, not rebuilt every visit.
3. No game-specific logic in `familyKey()` — uses only `actionId`.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/mcts/family-key.test.ts` (new) — covers familyKey, abstractMoveKey, family helpers.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`

## Outcome

- **Completion date**: 2026-03-18
- **What changed**:
  - `move-key.ts`: added `familyKey()` (groups by `actionId`) and `abstractMoveKey()` (optional `TurnFlowActionClass` coarser grouping)
  - `state-cache.ts`: added `familyKey` field to `CachedLegalMoveInfo`, populated in `initClassificationEntry()`; added `getRepresentedFamilies()` and `countByFamily()` helpers
  - `index.ts`: re-exported new functions
  - New test file `family-key.test.ts` with 10 tests covering all acceptance criteria
  - Fixed `availability-checking.test.ts` and `lazy-expansion.test.ts` to include required `familyKey` field in manually constructed `CachedLegalMoveInfo` objects
- **Deviations**: None — implementation matches ticket exactly
- **Verification**: 5060/5060 engine tests pass, typecheck clean, lint clean
