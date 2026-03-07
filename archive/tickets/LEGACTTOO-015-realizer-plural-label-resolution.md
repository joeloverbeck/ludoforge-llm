# LEGACTTOO-015: Wire Plural Label Resolution Into Template Functions

**Status**: COMPLETED
**Priority**: LOW
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/src/kernel/tooltip-template-realizer.ts`
**Deps**: archive/tickets/LEGACTTOO-007-template-realizer-blocker-extractor-golden-tests.md

## Problem

The shared `resolveLabel` accepts an optional `count` parameter for singular/plural dispatch, but no template function in the realizer actually passes it. Messages like `PlaceMessage`, `PayMessage`, `GainMessage`, `DrawMessage` have numeric `amount`/`count` fields that could drive singular vs plural label selection (e.g., "Place 1 US Troop" vs "Place 3 US Troops"), but currently the label always resolves to plural (the default when count is undefined).

## Assumption Reassessment (2026-03-07)

1. `resolveLabel` at `tooltip-label-resolver.ts:38-48` has `count?: number` — returns singular when `count === 1`, plural otherwise.
2. `VerbalizationLabelEntry` has `singular` and `plural` fields.
3. Template functions like `realizePay`, `realizeGain`, `realizeDraw`, `realizePlace` have access to `msg.amount` or `msg.count` but don't pass them to `resolveLabel`.
4. Tests verify the label appears but don't test singular/plural in template context.

## Architecture Check

1. Minimal change — pass existing numeric fields to `resolveLabel` as count context.
2. No new types or modules needed.
3. No game-specific logic — plural rules are generic.

## What to Change

### 1. Pass count to `resolveLabel` in relevant template functions

For each template function that has a numeric amount/count and resolves a token/resource label:
- `realizePay`: `resolveLabel(msg.resource, ctx, msg.amount)`
- `realizeGain`: `resolveLabel(msg.resource, ctx, msg.amount)`
- `realizeTransfer`: `resolveLabel(msg.resource, ctx, msg.amount)` (and `msg.amount` for resource only, not from/to)

**Excluded** (no pluralization benefit):
- `realizeDraw`: `msg.source` is a deck name — pluralizing it is wrong ("Event Decks" makes no sense)
- `realizeRemove`: `RemoveMessage` has no numeric count field (`budget` is a string expression)

The key targets are resource labels that have singular/plural forms in `VerbalizationDef.labels`.

## Files to Touch

- `packages/engine/src/kernel/tooltip-template-realizer.ts` (modify)
- `packages/engine/test/unit/kernel/tooltip-template-realizer.test.ts` (modify)

## Out of Scope

- Adding count fields to IR messages that don't have them
- Grammar engine (articles, verb agreement)

## Acceptance Criteria

### Tests That Must Pass

1. `Pay 1 {resource}` with singular label → "Pay 1 US Troop".
2. `Pay 3 {resource}` with plural label → "Pay 3 US Troops".
3. `Gain 1 {resource}` → singular, `Gain 5 {resource}` → plural.
4. `Transfer 1 {resource}` → singular, `Transfer 3 {resource}` → plural.
5. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Labels without singular/plural (plain string) are unaffected by count.
2. Template realizer remains pure and deterministic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/tooltip-template-realizer.test.ts` — add singular/plural tests for pay, gain, draw templates.

### Commands

1. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`

## Outcome

**Scope corrections** from the original ticket:
- Removed `realizeDraw` — deck names don't pluralize
- Removed `realizeRemove` — no numeric count field exists
- Added `realizeTransfer` — has `msg.amount` and `msg.resource`, was missing from original ticket

**Changes made:**
- `tooltip-template-realizer.ts`: Passed `msg.amount` as count to `resolveLabel` in `realizePay`, `realizeGain`, and `realizeTransfer` (3 one-line changes)
- `tooltip-template-realizer.test.ts`: Added 8 new tests covering singular (amount=1), plural (amount>1), amount=0, plain string labels, and transfer singular/plural

All 56 tests pass. Typecheck clean.
