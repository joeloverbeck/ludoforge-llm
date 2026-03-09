# FITLEVENT-049: Rework Russian Arms to use improved authored-data methods instead of current workaround encoding

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — depends on prior generic engine work
**Deps**: tickets/GAMESPECAUTH-001-expression-token-filters.md, tickets/GAMESPECAUTH-002-control-flow-limit-binding-scope.md, data/games/fire-in-the-lake/41-content-event-decks.md, packages/engine/test/integration/fitl-events-russian-arms.test.ts

## Problem

Card 49 is currently correct and tested, but its authored data uses workaround patterns forced by current engine/compiler limits:

1. property-form token filters instead of the more natural expression-shaped filter form
2. repeated staged space selection for shaded doubling
3. local binding workarounds to satisfy current control-flow limit resolution behavior

Once the generic engine authoring improvements land, this card should be rewritten to the clearer authored shape it was originally pushing toward.

## Assumption Reassessment (2026-03-09)

1. Russian Arms is already implemented correctly in production FITL data and passes targeted plus full-suite verification.
2. The current authored form is intentionally more verbose than ideal because it avoids generic compiler/runtime limits rather than expressing FITL rules directly.
3. The corrected scope is a cleanup/re-authoring pass after the generic engine fixes land, not another behavior change ticket.

## Architecture Check

1. Reworking the card after generic engine fixes is cleaner than leaving permanent workaround data in the production spec because it demonstrates the improved authoring model on a real multi-step FITL event.
2. This preserves the boundary that game-specific behavior belongs in `GameSpecDoc`; the engine tickets stay generic and this ticket only updates FITL authored data.
3. No backwards-compatibility aliasing should be kept. Rewrite the card directly to the preferred authored form once the engine supports it.

## What to Change

### 1. Simplify unshaded authored filters

Rewrite ARVN-piece selection and base-destination filtering to use the improved generic token-filter authoring surface.

### 2. Simplify shaded doubling flow

Re-author shaded doubling using the improved local-binding/control-flow scoping model so the data can express per-space troop counts directly without workaround duplication.

### 3. Keep behavior and tests intact

Preserve exact card text, seat ownership, Bombard grant semantics, South Vietnam restriction, stacking safety, and shortage behavior while simplifying the authored shape.

## Files to Touch

- `data/games/fire-in-the-lake/41-content-event-decks.md` (modify)
- `packages/engine/test/integration/fitl-events-russian-arms.test.ts` (modify if assertions should target the new authored shape)

## Out of Scope

- New engine/compiler work beyond the dependency tickets
- Other FITL card cleanups unless they are directly required by the same authoring improvement
- Visual config changes

## Acceptance Criteria

### Tests That Must Pass

1. Russian Arms behavior remains identical at runtime for all currently covered scenarios.
2. Russian Arms authored data no longer needs the current workaround structure once the generic engine fixes are available.
3. Existing suite: `pnpm turbo test`

### Invariants

1. FITL rules stay encoded only in FITL `GameSpecDoc` data.
2. Engine/runtime remain game-agnostic; this ticket is a consumer of generic engine improvements, not a source of new engine branching.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-events-russian-arms.test.ts` — retain runtime assertions and update any structural assertions to match the preferred authored form.
2. `packages/engine/test/integration/fitl-events-1968-nva.test.ts` — verify card 49 metadata/text still compile as expected.
3. `packages/engine/test/integration/fitl-nva-vc-special-activities.test.ts` — regression-check free Bombard interaction remains unchanged.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-events-russian-arms.test.js`
3. `node --test packages/engine/dist/test/integration/fitl-events-1968-nva.test.js`
4. `node --test packages/engine/dist/test/integration/fitl-nva-vc-special-activities.test.js`
5. `pnpm turbo test`
