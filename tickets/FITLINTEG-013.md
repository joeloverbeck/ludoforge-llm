# FITLINTEG-013: Add leader zone and card-zone assertion capability to playbook harness

**Status**: PENDING
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None — test helper + test data only
**Deps**: None

## Problem

The FITL playbook narrative explicitly states "Nguyen Khanh is placed in the RVN Leader box" during the Turn 8 coup round, but the golden test does not assert the presence of card-125 in `leader:none`. The `PlaybookStateSnapshot` system supports `currentCard` and `previewCard` (checking `played:none` and `lookahead:none`), but has no generic "card in zone" assertion capability for other card zones like `leader:none`.

## Assumption Reassessment (2026-02-26)

1. The `cardLifecycle.leader` setting in `30-rules-actions.md:24` defines `leader:none` as the destination for coup cards. Confirmed.
2. Card tokens have a `cardId` prop (e.g., `{ cardId: 'card-125' }`). Confirmed by `zoneHasCard` helper in `fitl-playbook-harness.ts:113-114`.
3. The 1964 scenario pre-places cards 121-124 in `leader:none`. Confirmed in `40-content-data-assets.md:1092-1100`.
4. The existing `zoneTokenCounts` assertion requires `faction` and `type` filters, which are not applicable to card tokens. A separate card-zone check is needed.

## Architecture Check

1. Adding a `cardInZone` check to `PlaybookStateSnapshot` follows the existing pattern of `currentCard`/`previewCard` but generalizes it. Cleaner than overloading `zoneTokenCounts` with card-specific logic.
2. No game-specific branching. The card-zone assertion uses generic token props (`cardId`), not FITL-specific identifiers.
3. No backwards-compatibility shims.

## What to Change

### 1. Add `cardInZone` to `PlaybookStateSnapshot`

```typescript
export interface CardInZoneCheck {
  readonly zone: string;
  readonly cardId: string;
  readonly present: boolean; // true = assert present, false = assert absent
}

// In PlaybookStateSnapshot:
readonly cardsInZones?: readonly CardInZoneCheck[];
```

### 2. Add assertion logic to `assertPlaybookSnapshot`

Reuse the existing `zoneHasCard` helper. For each check, assert presence or absence.

### 3. Add leader zone assertion to Turn 8 golden test

In `TURN_8.expectedEndState`:
```typescript
cardsInZones: [
  { zone: 'leader:none', cardId: 'card-125', present: true },
],
```

## Files to Touch

- `packages/engine/test/helpers/fitl-playbook-harness.ts` (modify — add type + assertion)
- `packages/engine/test/e2e/fitl-playbook-golden.test.ts` (modify — add leader assertion to Turn 8)

## Out of Scope

- Asserting the full set of leader cards (121-124) at game start — the initial state assertion could be expanded separately
- Asserting card lifecycle transitions during non-coup turns

## Acceptance Criteria

### Tests That Must Pass

1. FITL golden test Turn 8 — asserts card-125 in `leader:none`
2. Existing suite: `pnpm turbo test --force`

### Invariants

1. `cardsInZones` checks must be generic (no game-specific identifiers in the harness assertion logic)
2. `zoneHasCard` helper must remain the single source of truth for card-in-zone detection

## Test Plan

### New/Modified Tests

1. `packages/engine/test/e2e/fitl-playbook-golden.test.ts` — add `cardsInZones` to Turn 8 end state
2. `packages/engine/test/helpers/fitl-playbook-harness.ts` — add assertion branch for `cardsInZones`

### Commands

1. `cd packages/engine && node --test dist/test/e2e/fitl-playbook-golden.test.js`
2. `pnpm turbo test --force`
