# FITLEVENT-073: Review Great Society implementation for authoring-pattern rework

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: No engine changes expected unless reassessment proves a real architecture gap beyond current data-authored event primitives
**Deps**: `tickets/README.md`, `reports/fire-in-the-lake-rules-section-5.md`, `reports/fire-in-the-lake-rules-section-6.md`, `data/games/fire-in-the-lake/41-events/065-096.md`, `packages/engine/test/integration/fitl-commitment-phase.test.ts`, `packages/engine/test/integration/fitl-events-1965-arvn.test.ts`, `packages/engine/test/integration/fitl-events-text-only-behavior-backfill.test.ts`, `archive/tickets/ENGINEARCH-152-legal-moves-choiceful-event-discoverability-contract.md`

## Problem

Card 73 (“Great Society”) was reopened on the assumption that its current shaded authoring might be an expedient local fix rather than the right long-term pattern. Before changing production data again, that assumption needs to be revalidated against current `HEAD`, adjacent FITL patterns, and the live test surface. The known risk is ticket/test drift: the production card now uses explicit `chooseN` + `forEach(moveToken)` so US chooses any 3 Available US pieces, including Bases, while at least one broader regression test still assumes the older automatic-removal shape.

## Assumption Reassessment (2026-03-12)

1. Rules support the present behavior: unshaded Great Society conducts an immediate Commitment Phase, and unshaded Medevac applies to that immediate phase while remaining in effect through the coming Coup Round. Existing integration coverage already proves this on current `HEAD`.
2. The current production implementation stays fully data-driven in `GameSpecDoc` and does not add FITL-specific engine logic. That architectural boundary is already satisfied.
3. The current shaded `chooseN` + `forEach(moveToken)` encoding is cleaner than the old priority-removal form for this event because it makes chooser ownership explicit, preserves mixed-piece eligibility including Bases, and composes naturally with `legalMoves()` / pending-decision discovery instead of burying policy in removal heuristics.
4. The real discrepancy is in stale ticket/test assumptions, not known card-73 runtime behavior: `packages/engine/test/integration/fitl-events-text-only-behavior-backfill.test.ts` still expects the obsolete `removeByPriority` contract, and the prior command example referenced a nonexistent repo-root `scripts/run-tests.mjs`.
5. The remaining open question is narrow: do adjacent cards reveal a reusable macro or agnostic primitive that would be meaningfully cleaner than the current direct authoring? Initial comparison suggests “no” for now, because the existing generic choice primitives already express the behavior cleanly and consistently.

## Architecture Check

1. The current architecture is already pointed in the right direction: explicit chooser-owned selection is a better fit than implicit priority removal whenever event text grants a faction discretion over a mixed eligible pool.
2. Adjacent FITL patterns already use the same underlying shape: `chooseN` to bind a legal subset and `forEach(moveToken)` to apply the movement/removal. That consistency is more robust and extensible than adding another one-off removal primitive or reintroducing opaque priority logic.
3. The review must still preserve the boundary that game-specific behavior stays in Fire in the Lake data/macros while any shared primitive remains generic in compiler/kernel contracts.
4. No backwards-compatibility layer is needed. If reassessment proves a cleaner pattern, rework directly to that pattern and update tests. If reassessment confirms the current form, harden tests and close the ticket without churn in production data.

## What to Change

### 1. Revalidate card-73 assumptions against current data and tests

Compare Great Society’s shaded implementation with nearby events that:
- route decisions to a non-executing faction,
- remove chosen pieces from a single zone,
- cap selection by availability,
- allow mixed piece types including Bases.

Determine whether the present encoding is already the cleanest canonical form or is duplicating a pattern that should be factored into a shared FITL macro or agnostic primitive.

### 2. Correct stale regression coverage before changing production data

If review concludes that the current implementation is acceptable, update the stale regression tests to assert the canonical contract rather than the obsolete one. Only touch production authoring if the review proves a cleaner pattern than the current `chooseN` + `forEach` form.

### 3. Capture follow-up architecture only where justified

If review uncovers a true abstraction gap, file or update a separate ticket for that shared capability rather than embedding one-off complexity into card 73. If no such gap is found, explicitly record that the current generic choice primitives are sufficient.

## Files to Touch

- `data/games/fire-in-the-lake/41-events/065-096.md` (read/confirm only unless reassessment proves a production rework is justified)
- `data/games/fire-in-the-lake/20-macros.md` (read/confirm only unless a shared FITL macro is clearly warranted)
- `packages/engine/test/integration/fitl-commitment-phase.test.ts` (read/confirm existing behavioral coverage)
- `packages/engine/test/integration/fitl-events-1965-arvn.test.ts` (read/confirm canonical compiled-shape coverage)
- `packages/engine/test/integration/fitl-events-text-only-behavior-backfill.test.ts` (modify to remove stale card-73 assumptions)
- `tickets/FITLEVENT-073-great-society-post-implementation-review-and-authoring-rework.md` (modify as assumptions are corrected)

## Out of Scope

- Changing card 73 behavior away from the published rules.
- Introducing FITL-specific branches into `GameDef`, simulation, or kernel code.
- Broad event-authoring refactors unrelated to the review findings.
- Inventing a new removal abstraction when current generic choice primitives already model the behavior cleanly.

## Acceptance Criteria

### Tests That Must Pass

1. Review concludes explicitly whether card 73 should remain as authored or be reworked.
2. If no rework is justified, the ticket records why the current `chooseN` + `forEach` contract is the preferred architecture and aligns stale tests with that contract.
3. If reworked, the resulting implementation still passes Great Society fidelity tests, including Medevac interaction and shaded US-owned choice.
4. Existing suite: `pnpm -F @ludoforge/engine build`
5. Existing suite: `node packages/engine/dist/test/integration/fitl-commitment-phase.test.js`
6. Existing suite: `node packages/engine/dist/test/integration/fitl-events-1965-arvn.test.js`
7. Existing suite: `node packages/engine/dist/test/integration/fitl-events-text-only-behavior-backfill.test.js`
8. Existing suite: `pnpm -F @ludoforge/engine lint`
9. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Great Society remains fully data-authored; no game-specific runtime logic is added to engine layers.
2. Explicit chooser-owned selection remains the canonical fit for mixed eligible pools unless a demonstrably cleaner generic primitive replaces it.
3. Any shared abstraction proposed by the review is generic enough to serve multiple games/events, or else it stays in FITL data/macros rather than engine code.
4. No backwards-compatibility aliasing or dual-path event behavior is introduced.

## Tests

### New/Modified Tests

1. `packages/engine/test/integration/fitl-commitment-phase.test.ts` — preserve the immediate Commitment + Medevac interaction and shaded chooser-owned behavior.
2. `packages/engine/test/integration/fitl-events-1965-arvn.test.ts` — keep the compiled contract assertions aligned with the chosen canonical authoring form.
3. `packages/engine/test/integration/fitl-events-text-only-behavior-backfill.test.ts` — replace the stale `removeByPriority` expectation with a card-73 assertion that matches the canonical `chooseN` + `forEach` contract.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node packages/engine/dist/test/integration/fitl-commitment-phase.test.js`
3. `node packages/engine/dist/test/integration/fitl-events-1965-arvn.test.js`
4. `node packages/engine/dist/test/integration/fitl-events-text-only-behavior-backfill.test.js`
5. `pnpm -F @ludoforge/engine lint`
6. `pnpm -F @ludoforge/engine test`
7. `pnpm run check:ticket-deps`

## Outcome

- Completion date: 2026-03-12
- What actually changed:
  - Reassessed card 73 against current production data, adjacent chooser-owned event patterns, and the live test surface.
  - Confirmed the current `chooseN` + `forEach(moveToken)` shaded authoring is the cleaner long-term architecture than the old priority-removal form because it keeps chooser ownership, mixed-piece eligibility, and decision-surface behavior explicit.
  - Corrected the ticket’s stale assumptions, scope, touched-file list, and command examples.
  - Updated `packages/engine/test/integration/fitl-events-text-only-behavior-backfill.test.ts` so its card-73 regression matches the canonical compiled contract already covered elsewhere.
- Deviations from original plan:
  - No production FITL data changes were needed in `data/games/fire-in-the-lake/41-events/065-096.md`.
  - No new macro or engine primitive was warranted; the existing generic choice primitives already express the behavior cleanly.
  - `packages/engine/test/integration/fitl-commitment-phase.test.ts` and `packages/engine/test/integration/fitl-events-1965-arvn.test.ts` only needed confirmation, not modification.
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `node packages/engine/dist/test/integration/fitl-commitment-phase.test.js`
  - `node packages/engine/dist/test/integration/fitl-events-1965-arvn.test.js`
  - `node packages/engine/dist/test/integration/fitl-events-text-only-behavior-backfill.test.js`
  - `pnpm -F @ludoforge/engine lint` (passes with pre-existing warnings, no errors)
  - `pnpm -F @ludoforge/engine test`
  - `pnpm run check:ticket-deps`
