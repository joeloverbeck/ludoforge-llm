# ENGINEARCH-165: Canonical `rollRandom` -> exact `chooseN` cardinality contract

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — `effects-choice`, `legal-choices`, decision-sequence satisfiability, move validation
**Deps**: archive/tickets/FITLEVENTARCH/FITLEVENTARCH-007-stochastic-option-legality-soundness.md, archive/tickets/ENGINEARCH-097-cross-seat-choice-probe-authority-decoupling.md

## Problem

The engine does not currently preserve a sound contract when a `rollRandom` result feeds an exact `chooseN` cardinality through bindings. In practice, discovery can merge branch-local pending requests into an impossible combined request such as `min=6, max=1`, causing the move to disappear from `legalMoves`, fail decision normalization, or raise runtime cardinality errors even though each stochastic branch is individually legal.

This forces GameSpec authors to replace a natural game-agnostic encoding with data-side branch ladders for every possible die result.

## Assumption Reassessment (2026-03-11)

1. `packages/engine/src/kernel/effects-choice.ts` currently merges stochastic alternatives in `mergePendingChoiceRequests()` by intersecting option sets while independently taking `max(min)` and `min(max)`, which can yield impossible `chooseN` ranges after branch-local option intersections.
2. `packages/engine/src/kernel/move-decision-sequence.ts` and `packages/engine/src/kernel/legal-choices.ts` correctly surface `pendingStochastic`, but downstream admission/validation still depends on the merged pending shape staying internally coherent.
3. The current FITL card-65 shaded encoding in `data/games/fire-in-the-lake/41-events/065-096.md` uses a six-branch workaround instead of the natural `rollRandom` -> `min(dieRoll, availablePieces)` -> exact `chooseN` form because the natural form became unsound during discovery.

## Architecture Check

1. The fix belongs in generic stochastic discovery and pending-choice normalization, not in event-card data or FITL-specific runtime branches.
2. A canonical engine rule for stochastic exact-cardinality choices keeps `GameSpecDoc` expressive while preserving `GameDef`, legality probing, and move validation as game-agnostic layers.
3. No backwards-compatibility shims should be added. The engine should have one sound representation for stochastic pending choices, and data should be updated to use it.

## What to Change

### 1. Make stochastic pending-choice merging cardinality-safe

Rework `mergePendingChoiceRequests()` and related `rollRandom` discovery plumbing so merged stochastic alternatives cannot produce impossible `chooseN` requests. If alternatives cannot be losslessly merged into one canonical pending choice, preserve the branch-local shape explicitly rather than fabricating an invalid combined range.

### 2. Align legality/admission with the corrected stochastic contract

Update legal-move discovery, decision-sequence satisfiability, and move validation so a move remains admitted when every stochastic branch is internally satisfiable, even if branch-local option sets differ. The corrected flow must not suppress legal event sides solely because a merged pending request became incoherent.

### 3. Add a direct engine regression for the card-65 shape

Add a synthetic kernel regression that encodes:

1. `rollRandom`
2. bind exact count from the roll and availability
3. `chooseN` with `min == max == bound`
4. chooser-owned decision authority

The regression should fail on the old merge contract and pass on the new one.

## Files to Touch

- `packages/engine/src/kernel/effects-choice.ts` (modify)
- `packages/engine/src/kernel/legal-choices.ts` (modify)
- `packages/engine/src/kernel/decision-sequence-satisfiability.ts` (modify)
- `packages/engine/src/kernel/move-decision-sequence.ts` (modify)
- `packages/engine/src/kernel/apply-move.ts` (modify)
- `packages/engine/test/unit/kernel/legal-choices.test.ts` (modify)
- `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` (modify)
- `packages/engine/test/integration/decision-sequence.test.ts` (modify)

## Out of Scope

- Rewriting FITL card data in this ticket
- UI presentation changes in runner choice panels
- Game-specific card text/documentation refreshes

## Acceptance Criteria

### Tests That Must Pass

1. A natural `rollRandom`-driven exact `chooseN` encoding never yields a pending request with `min > max`.
2. `legalMoves` continues to surface a move when each stochastic branch is satisfiable, even if branch-local option sets differ.
3. `applyMove` accepts a move completed under the corrected stochastic contract without cardinality mismatch failures.
4. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Stochastic choice discovery remains conservative and game-agnostic.
2. Merged or preserved stochastic pending requests must always be internally coherent.
3. Engine legality and runtime validation must agree on the same cardinality contract.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` — regression for `rollRandom`-bound exact `chooseN` discovery and satisfiability.
2. `packages/engine/test/unit/kernel/legal-choices.test.ts` — regression that no incoherent `chooseN` pending request is surfaced under stochastic merging.
3. `packages/engine/test/integration/decision-sequence.test.ts` — end-to-end stochastic exact-cardinality completion contract.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/move-decision-sequence.test.js packages/engine/dist/test/unit/kernel/legal-choices.test.js packages/engine/dist/test/integration/decision-sequence.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm run check:ticket-deps`
