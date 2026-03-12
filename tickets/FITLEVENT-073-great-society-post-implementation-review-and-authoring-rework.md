# FITLEVENT-073: Review Great Society implementation for authoring-pattern rework

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None by default — review may identify a follow-up engine ticket, but this ticket is primarily FITL authoring and architecture review
**Deps**: `tickets/README.md`, `reports/fire-in-the-lake-rules-section-5.md`, `reports/fire-in-the-lake-rules-section-6.md`, `data/games/fire-in-the-lake/41-events/065-096.md`, `packages/engine/test/integration/fitl-commitment-phase.test.ts`, `packages/engine/test/integration/fitl-events-1965-arvn.test.ts`, `archive/tickets/ENGINEARCH-152-legal-moves-choiceful-event-discoverability-contract.md`

## Problem

Card 73 (“Great Society”) is now implemented to current rules fidelity, but it was authored under delivery pressure and should be reviewed before we treat it as the preferred pattern for similar cards. In particular, the shaded side was converted from automatic removal to an explicit `chooseN` + `forEach(moveToken)` encoding so US chooses any 3 Available US pieces, including Bases. That may be the correct long-term authoring pattern, or it may reveal a missing shared abstraction for “other faction chooses N eligible pieces from zone A to zone B”.

## Assumption Reassessment (2026-03-12)

1. Rules support the present behavior: unshaded Great Society conducts an immediate Commitment Phase, and unshaded Medevac applies to that immediate phase while remaining in effect through the coming Coup Round.
2. The current implementation stays data-driven in `GameSpecDoc` and does not add FITL-specific engine logic. That satisfies the immediate architectural boundary.
3. The remaining open question is not correctness but pattern quality: if multiple FITL events need the same “chooser-owned selection from a pool” structure, duplicating local `chooseN` + `forEach` blocks may be less clean than introducing a reusable agnostic authoring primitive or shared macro.

## Architecture Check

1. A post-implementation review is cleaner than silently declaring the current encoding final. It gives us a chance to decide whether card 73 is a good exemplar or whether it should be folded into a more reusable authoring pattern.
2. The review must preserve the boundary that game-specific behavior stays in Fire-in-the-Lake data/macros while any shared primitive remains generic in compiler/kernel contracts.
3. No backwards-compatibility layer is needed. If the current card should be reworked, rework it directly to the cleaner pattern and update tests.

## What to Change

### 1. Review card-73 against adjacent event-authoring patterns

Compare Great Society’s shaded implementation with nearby events that:
- route decisions to a non-executing faction,
- remove chosen pieces from a single zone,
- cap selection by availability,
- allow mixed piece types including Bases.

Determine whether the present encoding is already the cleanest canonical form or is duplicating a pattern that should be factored into a shared FITL macro or agnostic primitive.

### 2. Decide whether card 73 should be reworked now

If review concludes that the current implementation is merely locally correct, produce and implement a rework plan. If the current form is acceptable, document why it is the canonical pattern and add any missing comments/tests needed to make that explicit.

### 3. Capture follow-up architecture only where justified

If review uncovers a true abstraction gap, file or update a separate ticket for that shared capability rather than embedding one-off complexity into card 73.

## Files to Touch

- `data/games/fire-in-the-lake/41-events/065-096.md` (modify, if rework is justified)
- `data/games/fire-in-the-lake/20-macros.md` (modify, only if a shared FITL macro is warranted)
- `packages/engine/test/integration/fitl-commitment-phase.test.ts` (modify if authoring shape changes)
- `packages/engine/test/integration/fitl-events-1965-arvn.test.ts` (modify if authoring shape changes)
- `tickets/FITLEVENT-073-great-society-post-implementation-review-and-authoring-rework.md` (modify as assumptions are corrected)

## Out of Scope

- Changing card 73 behavior away from the published rules.
- Introducing FITL-specific branches into `GameDef`, simulation, or kernel code.
- Broad event-authoring refactors unrelated to the review findings.

## Acceptance Criteria

### Tests That Must Pass

1. Review concludes explicitly whether card 73 should remain as authored or be reworked.
2. If reworked, the resulting implementation still passes Great Society fidelity tests, including Medevac interaction and shaded US-owned choice.
3. Existing suite: `node scripts/run-tests.mjs test/integration/fitl-commitment-phase.test.ts test/integration/fitl-events-1965-arvn.test.ts`
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Great Society remains fully data-authored; no game-specific runtime logic is added to engine layers.
2. Any shared abstraction proposed by the review is generic enough to serve multiple games/events, or else it stays in FITL data/macros rather than engine code.
3. No backwards-compatibility aliasing or dual-path event behavior is introduced.

## Tests

### New/Modified Tests

1. `packages/engine/test/integration/fitl-commitment-phase.test.ts` — preserve the immediate Commitment + Medevac interaction and shaded-choice behavior while authoring shape changes.
2. `packages/engine/test/integration/fitl-events-1965-arvn.test.ts` — keep the compiled contract assertions aligned with the chosen canonical authoring form.
3. `packages/engine/test/integration/fitl-events-text-only-behavior-backfill.test.ts` — modify only if the review concludes card 73 belongs in broader event-authoring regression coverage.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node scripts/run-tests.mjs test/integration/fitl-commitment-phase.test.ts test/integration/fitl-events-1965-arvn.test.ts`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm run check:ticket-deps`
