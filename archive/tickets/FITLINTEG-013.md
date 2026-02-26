# FITLINTEG-013: Add leader zone and card-zone assertion capability to playbook harness

**Status**: ✅ COMPLETED
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None — test helper + test data only
**Deps**: None

## Problem

The FITL playbook narrative explicitly states "Nguyen Khanh is placed in the RVN Leader box" during the Turn 8 coup round, but the golden test does not assert the presence of `card-125` in `leader:none`. The `PlaybookStateSnapshot` system supports `currentCard` and `previewCard` (checking `played:none` and `lookahead:none`), but has no generic "card in zone" assertion capability for other card zones like `leader:none`.

## Assumption Reassessment (2026-02-26)

1. The `cardLifecycle.leader` setting in `data/games/fire-in-the-lake/30-rules-actions.md` defines `leader:none` as the leader destination in turn-flow card lifecycle. Confirmed.
2. Card tokens are detected by `token.props.cardId` today; this is already the source of truth in `zoneHasCard` within `packages/engine/test/helpers/fitl-playbook-harness.ts`. Confirmed.
3. The 1964 Full scenario pre-places cards `card-121` to `card-124` in `leader:none` in `data/games/fire-in-the-lake/40-content-data-assets.md`. Confirmed.
4. `PlaybookStateSnapshot.zoneTokenCounts` requires `faction` and `type` and cannot represent card tokens cleanly. Confirmed.
5. **Discrepancy corrected**: the original scope only targeted Turn 8 end-state coverage. Given existing unasserted baseline behavior, the initial-state golden assertion should also verify leader cards to lock down the full lifecycle invariant.

## Architecture Check

1. Adding `cardsInZones` to `PlaybookStateSnapshot` is cleaner than overloading `zoneTokenCounts` with card-specific semantics; it keeps assertions explicit by data kind.
2. This is still generic test-harness architecture: the check consumes `(zone, cardId, present)` and reuses `zoneHasCard` with no FITL-specific branching.
3. No backward-compatibility aliases/shims are introduced.
4. This is more robust than current architecture because it closes a real blind spot (card lifecycle across non-`played` zones) without coupling to one game implementation detail.

## What to Change

### 1. Add `cardsInZones` to `PlaybookStateSnapshot`

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

Reuse the existing `zoneHasCard` helper. For each check, assert presence or absence with clear failure messages.

### 3. Add leader-zone assertions in golden coverage

Add assertion to `TURN_8.expectedEndState`:

```typescript
cardsInZones: [
  { zone: 'leader:none', cardId: 'card-125', present: true },
],
```

Also extend the initial-state assertion in the same golden suite to verify initial leader cards (`card-121`..`card-124`) are present in `leader:none`.

## Files to Touch

- `packages/engine/test/helpers/fitl-playbook-harness.ts` (modify — add type + assertion)
- `packages/engine/test/e2e/fitl-playbook-golden.test.ts` (modify — add leader assertions to Turn 8 and initial-state baseline)

## Out of Scope

- Asserting card lifecycle transitions during non-coup turns
- Changing runtime/kernel card lifecycle behavior (this ticket is assertion-surface only)

## Acceptance Criteria

### Tests That Must Pass

1. FITL golden suite asserts:
   - `card-125` is in `leader:none` at Turn 8 end state.
   - initial-state baseline includes leader cards `card-121`..`card-124` in `leader:none`.
2. Existing suite passes under forced execution: `pnpm turbo test --force`
3. Lint passes: `pnpm turbo lint`

### Invariants

1. `cardsInZones` checks must be generic (no game-specific identifiers in the harness assertion logic)
2. `zoneHasCard` helper must remain the single source of truth for card-in-zone detection

## Test Plan

### New/Modified Tests

1. `packages/engine/test/e2e/fitl-playbook-golden.test.ts` — add `cardsInZones` checks for initial-state leader baseline and Turn 8 coup leader placement.
2. `packages/engine/test/helpers/fitl-playbook-harness.ts` — add `cardsInZones` assertion branch (test-helper behavior change supporting the golden suite).

### Commands

1. `cd packages/engine && node --test dist/test/e2e/fitl-playbook-golden.test.js`
2. `pnpm turbo test --force`
3. `pnpm turbo lint`

## Outcome

- Completion date: 2026-02-26
- What was actually changed:
  - Added generic `cardsInZones` support to `PlaybookStateSnapshot` in `packages/engine/test/helpers/fitl-playbook-harness.ts`.
  - Added assertion logic in `assertPlaybookSnapshot` for card presence/absence using existing `zoneHasCard`.
  - Updated FITL playbook golden test (`packages/engine/test/e2e/fitl-playbook-golden.test.ts`) to assert:
    - initial leader baseline (`card-121`..`card-124` in `leader:none`)
    - Turn 8 coup leader placement (`card-125` in `leader:none`)
    - Turn 8 negative-path check (`card-125` absent from `played:none`)
- What changed vs originally planned:
  - Scope was expanded slightly to include initial-state leader assertions and a negative-path `present: false` assertion for stronger invariant coverage.
- Verification results:
  - `pnpm turbo build` passed.
  - `cd packages/engine && node --test dist/test/e2e/fitl-playbook-golden.test.js` passed.
  - `pnpm turbo test --force` passed.
  - `pnpm turbo lint` passed.
