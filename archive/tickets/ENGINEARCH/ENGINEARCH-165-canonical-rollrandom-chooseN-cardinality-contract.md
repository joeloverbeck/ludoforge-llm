# ENGINEARCH-165: Canonical `rollRandom` -> exact `chooseN` cardinality contract

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — stochastic pending-choice normalization in `effects-choice`, plus regression coverage updates
**Deps**: archive/tickets/FITLEVENTARCH/FITLEVENTARCH-007-stochastic-option-legality-soundness.md, archive/tickets/ENGINEARCH-097-cross-seat-choice-probe-authority-decoupling.md

## Problem

The engine does not currently preserve a sound contract when a `rollRandom` result feeds an exact `chooseN` cardinality through bindings. In practice, discovery can merge branch-local pending requests into an impossible combined request such as `min=6, max=1`, causing the move to disappear from `legalMoves`, fail decision normalization, or raise runtime cardinality errors even though each stochastic branch is individually legal.

This forces GameSpec authors to replace a natural game-agnostic encoding with data-side branch ladders for every possible die result.

## Assumption Reassessment (2026-03-11)

1. `packages/engine/src/kernel/effects-choice.ts` currently merges same-decision stochastic alternatives in `mergePendingChoiceRequests()` by intersecting option sets while independently taking `max(min)` and `min(max)`. That merge is not lossless and can yield impossible `chooseN` ranges such as `min > max`.
2. The surrounding legality/discovery flow already has first-class support for unresolved stochasticity: `packages/engine/src/kernel/legal-choices.ts`, `packages/engine/src/kernel/move-decision-sequence.ts`, and `packages/engine/src/kernel/apply-move.ts` surface `pendingStochastic` / `nextDecisionSet` correctly. The architectural gap is upstream normalization, not the existence of stochastic transport.
3. There is already direct coverage for stochastic discovery and card-65 behavior in `packages/engine/test/unit/effects-choice.test.ts` and `packages/engine/test/integration/fitl-events-international-forces.test.ts`, but there is no regression yet for the exact natural `rollRandom` -> exact `chooseN` shape that exposes the lossy merge.
4. The current FITL card-65 shaded encoding in `data/games/fire-in-the-lake/41-events/065-096.md` still uses a six-branch workaround. That authored cleanup remains blocked on generic stochastic decision completion/normalization work tracked separately in `tickets/ENGINEARCH-166-generic-stochastic-decision-completion-and-normalization.md`.

## Architecture Check

1. The fix belongs in generic stochastic discovery and pending-choice normalization, not in FITL-specific runtime branches.
2. The canonical rule should be: merge pending requests only when the merge is lossless; otherwise preserve branch-local requests as `pendingStochastic`.
3. A sound stochastic pending contract keeps `GameSpecDoc`, legality probing, and move validation game-agnostic without aliasing branch-local decision shapes into a fabricated canonical request.
4. No backwards-compatibility shims should be added. Authoring cleanup should happen only once the engine can normalize/complete branch-local stochastic decisions without aliasing them into one shared move-param payload.

## What to Change

### 1. Make stochastic pending-choice normalization lossless

Rework `mergePendingChoiceRequests()` and related `rollRandom` discovery plumbing so discovery only returns a merged pending request when alternatives are structurally identical after normalization. If alternatives differ in option set or cardinality, preserve the branch-local shape explicitly as `pendingStochastic` instead of fabricating a combined request.

### 2. Align tests with the corrected stochastic normalization contract

Update the direct kernel and decision-sequence regressions so they assert the corrected rule:

1. structurally identical stochastic pending requests may collapse to one canonical pending request
2. differing exact `chooseN` branches must remain explicit as `pendingStochastic`
3. the old lossy merged request must not reappear through test helpers or stale expectations

### 3. Add direct regressions at the actual failure surface

Add:

1. a kernel/unit regression for `rollRandom`-bound exact `chooseN` discovery in `effects-choice.test.ts`
2. a decision-sequence regression that confirms the stochastic alternatives remain surfaced rather than collapsed into an incoherent pending request
3. an updated FITL card-65 integration expectation focused on stochastic chooser-owned alternatives rather than premature move completion

## Files to Touch

- `packages/engine/src/kernel/effects-choice.ts` (modify)
- `packages/engine/test/unit/effects-choice.test.ts` (modify)
- `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` (modify)
- `packages/engine/test/integration/fitl-events-international-forces.test.ts` (modify)

## Out of Scope

- Changing generic stochastic decision completion/normalization for authored move-param payloads; that remains `ENGINEARCH-166`
- UI presentation changes in runner choice panels
- FITL card-data cleanup beyond assertion updates

## Acceptance Criteria

### Tests That Must Pass

1. A natural `rollRandom`-driven exact `chooseN` encoding never yields a pending request with `min > max`.
2. When stochastic alternatives differ, discovery preserves them as `pendingStochastic` instead of collapsing them into a lossy merged request.
3. FITL card-65 shaded integration coverage reflects the corrected stochastic-alternative contract without assuming branch-agnostic move completion.
4. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Stochastic choice discovery remains conservative and game-agnostic.
2. Merged pending requests must be lossless; preserved stochastic alternatives must remain internally coherent per branch.
3. Engine legality and runtime validation must agree on the same cardinality contract.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/effects-choice.test.ts` — regression for `rollRandom`-bound exact `chooseN` discovery and lossless stochastic normalization.
2. `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` — regression that the exact-cardinality shape remains surfaced as stochastic alternatives instead of an incoherent merged pending request.
3. `packages/engine/test/integration/fitl-events-international-forces.test.ts` — integration regression that card-65 shaded still exposes exact chooser-owned stochastic alternatives under the corrected engine contract.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/effects-choice.test.js packages/engine/dist/test/unit/kernel/move-decision-sequence.test.js packages/engine/dist/test/integration/fitl-events-international-forces.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm run check:ticket-deps`

## Outcome

- Completion date: 2026-03-11
- What changed:
  - `packages/engine/src/kernel/effects-choice.ts` now treats stochastic pending-choice normalization as lossless-only. Identical branch-local pending requests still collapse to one canonical pending request, but differing exact `chooseN` alternatives remain explicit as `pendingStochastic` instead of being merged into an incoherent `min > max` shape.
  - Added a direct unit regression in `packages/engine/test/unit/effects-choice.test.ts` for `rollRandom`-bound exact `chooseN` discovery.
  - Added a decision-sequence regression in `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` confirming that same-decision exact-cardinality alternatives remain surfaced as stochastic alternatives.
  - Updated `packages/engine/test/integration/fitl-events-international-forces.test.ts` to assert the corrected stochastic-alternative contract for card-65 shaded without relying on lossy branch collapse during move normalization.
- Deviations from original plan:
  - The ticket was narrowed after reassessment. Existing legality/discovery plumbing in `legal-choices`, `move-decision-sequence`, and `apply-move` already transported `pendingStochastic`; the actual defect was confined to lossy normalization in `effects-choice`.
  - The attempted authored cleanup for the natural card-65 shaded encoding was intentionally not landed here. Branch-aware stochastic move completion/normalization is a separate architectural gap and remains tracked by `tickets/ENGINEARCH-166-generic-stochastic-decision-completion-and-normalization.md`.
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `node --test packages/engine/dist/test/unit/effects-choice.test.js packages/engine/dist/test/unit/kernel/move-decision-sequence.test.js packages/engine/dist/test/integration/fitl-events-international-forces.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm -F @ludoforge/engine lint` (passes with pre-existing warnings only)
  - `pnpm run lint` (passes with pre-existing warnings only)
  - `pnpm run check:ticket-deps`
