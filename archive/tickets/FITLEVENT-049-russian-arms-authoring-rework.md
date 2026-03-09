# FITLEVENT-049: Reassess Russian Arms authored-data rework against the current architecture

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — ticket scope corrected to verification and closure
**Deps**: archive/tickets/GAMESPECAUTH-001-remove-predicate-alias-shorthand-from-authored-filters.md, archive/tickets/GAMESPECAUTH-002-control-flow-limit-binding-scope.md, data/games/fire-in-the-lake/41-content-event-decks.md, packages/engine/test/integration/fitl-events-russian-arms.test.ts

## Problem

This ticket originally assumed card 49 still encoded temporary authored-data workarounds that should be rewritten once generic authoring improvements landed. Reassessment against the current branch shows that assumption is stale.

The current Russian Arms authored data already uses the canonical token-filter contract, and the shaded doubling flow already depends on the generic scoped-binding model that the dependency tickets validated. The remaining discrepancy is in this ticket's narrative and scope, not in the engine or FITL production data.

## Assumption Reassessment (2026-03-09)

1. Russian Arms is already implemented correctly in production FITL data and passes focused integration verification on the current branch.
2. The unshaded filters already use the canonical `{ prop, op, value }` predicate form introduced by the compiler-boundary cleanup in `GAMESPECAUTH-001`; there is no remaining alias-shorthand workaround to remove here.
3. The shaded doubling flow already uses the generic `let` plus `forEach.limit` scoped-binding model that `GAMESPECAUTH-002` verified directly; the current card is not blocked on missing control-flow scope support.
4. The repeated `chooseN` plus `forEach` staging in shaded Russian Arms is explicit, but it is not obviously a workaround. It is the current generic way to model sequential selections whose legality depends on the evolving available troop pool after each prior choice.
5. Corrected scope: close this ticket by correcting its assumptions, verifying the production card and surrounding regressions, and not forcing a speculative authored-data rewrite.

## Architecture Check

1. The current architecture is already cleaner than the original ticket proposed. Canonical predicate authoring and scoped-binding resolution are already generic and already in use by this card.
2. Rewriting Russian Arms again without a genuinely better generic authoring primitive would add churn without reducing engine or data complexity. The repeated staged choices encode a real sequential constraint rather than a temporary compatibility hack.
3. The more durable architectural choice is to keep the engine generic, keep FITL rules in `GameSpecDoc`, and only introduce a new authoring abstraction when it is broadly justified across multiple cards, not just to compress one event.
4. No backwards-compatibility aliasing should remain. That cleanup is already handled by the dependency tickets and does not require further Russian Arms-specific changes.

## What to Change

### 1. Correct the ticket assumptions and scope

Replace the outdated “pending re-authoring” narrative with the current architectural reality: Russian Arms already uses the canonical generic authoring surfaces that this ticket cited as missing.

### 2. Verify current production behavior and nearby regressions

Run the focused Russian Arms and adjacent NVA/Bombard integration suites to confirm the current authored data and free-operation semantics remain correct.

### 3. Avoid speculative data churn

Do not rewrite the card unless a genuinely cleaner, reusable generic authoring primitive exists and improves more than this single event. That broader abstraction work is outside this ticket.

## Files to Touch

- `tickets/FITLEVENT-049-russian-arms-authoring-rework.md` (modify)
- `data/games/fire-in-the-lake/41-content-event-decks.md` (verification target only)
- `packages/engine/test/integration/fitl-events-russian-arms.test.ts` (verification target only)
- `packages/engine/test/integration/fitl-events-1968-nva.test.ts` (verification target only)
- `packages/engine/test/integration/fitl-nva-vc-special-activities.test.ts` (verification target only)

## Out of Scope

- New engine/compiler work beyond the dependency tickets
- Re-authoring Russian Arms just to reduce visible repetition without a broader reusable abstraction
- Other FITL card cleanups unless they are directly required by a future generic authoring primitive
- Visual config changes

## Acceptance Criteria

### Tests That Must Pass

1. Russian Arms behavior remains identical at runtime for all currently covered scenarios.
2. The ticket records that current Russian Arms authored data already sits on the intended canonical generic surfaces and does not need another card-specific rewrite.
3. Existing suite: `pnpm turbo test`

### Invariants

1. FITL rules stay encoded only in FITL `GameSpecDoc` data.
2. Engine/runtime remain game-agnostic; this ticket does not introduce card-specific engine branching or authoring aliases.
3. Sequential event constraints should remain explicit until a more general reusable authoring abstraction exists.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-events-russian-arms.test.ts` — verifies canonical authored-shape assertions already present for Russian Arms plus runtime behavior for both sides.
2. `packages/engine/test/integration/fitl-events-1968-nva.test.ts` — verifies card 49 metadata/text still compile in the 1968 NVA-first deck.
3. `packages/engine/test/integration/fitl-nva-vc-special-activities.test.ts` — verifies adjacent NVA special-activity/Bombard behavior remains stable.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-events-russian-arms.test.js`
3. `node --test packages/engine/dist/test/integration/fitl-events-1968-nva.test.js`
4. `node --test packages/engine/dist/test/integration/fitl-nva-vc-special-activities.test.js`
5. `pnpm turbo test`
6. `pnpm turbo lint`

## Outcome

- Completion date: 2026-03-10
- What actually changed:
  - Corrected the ticket assumptions and scope after reassessing Russian Arms against the current production authored data, dependency tickets, and focused integration coverage.
  - Verified that Russian Arms already uses canonical token-filter authoring and the current generic scoped-binding control-flow model.
  - Verified that the card and adjacent regressions pass without further production data or engine changes.
- Deviations from original plan:
  - No Russian Arms authored-data rewrite was implemented because the original premise was stale.
  - No engine changes were needed. The architecture already supports the intended generic behavior, and forcing a card-specific rewrite would not improve extensibility.
  - No test files were modified because the existing focused coverage already proves the relevant invariants for this ticket's corrected scope.
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `node --test packages/engine/dist/test/integration/fitl-events-russian-arms.test.js`
  - `node --test packages/engine/dist/test/integration/fitl-events-1968-nva.test.js`
  - `node --test packages/engine/dist/test/integration/fitl-nva-vc-special-activities.test.js`
  - `pnpm turbo test`
  - `pnpm turbo lint`
