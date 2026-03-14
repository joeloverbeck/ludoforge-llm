# 62CONPIESOU-005: Finish prioritized sourcing adoption for card 87

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Possibly none; confirm with tests first
**Deps**: archive/tickets/KERQUERY/62CONPIESOU-001-prioritized-query-ast-and-recursive-infrastructure.md, archive/tickets/62CONPIESOU-004.md, archive/tickets/62BINCCHOPRO-001.md, specs/62-conditional-piece-sourcing.md, specs/62b-incremental-choice-protocol.md

## Status Note

This ticket originally targeted kernel architecture that is already present in the repository. The remaining gap is narrower: card 87 still uses `concat` authoring and therefore does not consume the prioritized legality system that now exists.

## Problem

Spec 62 and Spec 62b were introduced to support qualifier-aware prioritized sourcing for unified `chooseN` decisions. The current engine now has that infrastructure, but card 87 (`Nguyen Chanh Thi`) is still authored with `concat`, so the real FITL rule from Rule 1.4.1 is not yet enforced at the event level.

The remaining bug is authored-data drift, not missing core architecture.

## Assumption Reassessment (2026-03-14)

1. `packages/engine/src/kernel/prioritized-tier-legality.ts` already exists and provides shared tier-admissibility logic. Confirmed.
2. `packages/engine/src/kernel/effects-choice.ts` already enforces prioritized submitted-array validation for `chooseN`. Confirmed.
3. `packages/engine/src/kernel/legal-choices.ts` already supports transient `chooseN` selections and prioritized legality re-evaluation during discovery. Confirmed.
4. `packages/engine/src/kernel/advance-choose-n.ts` already implements the engine-owned incremental `chooseN` sub-loop proposed by Spec 62b. Confirmed.
5. `packages/runner/src/store/game-store.ts` already drives incremental `chooseN` through `bridge.advanceChooseN(...)`; the runner is not the source of truth for selection legality anymore. Confirmed.
6. The kernel already has unit coverage for prioritized legality in `prioritized-tier-legality.test.ts`, `effects-choice.test.ts`, `legal-choices.test.ts`, and `advance-choose-n.test.ts`. Confirmed.
7. `data/games/fire-in-the-lake/41-events/065-096.md` still authors card 87 with `concat`, so the FITL event has not yet adopted the architecture. Confirmed.
8. `packages/engine/test/integration/fitl-events-nguyen-chanh-thi.test.ts` currently checks the event flow but does not pin the prioritized-sourcing invariant that motivated Specs 62/62b. Confirmed.

## Architecture Check

1. **Do not rebuild architecture that already exists**: The clean, robust architecture is already the shared-helper plus incremental `chooseN` design from Spec 62b. Reworking it here would be churn, not improvement.
2. **Adopt the existing architecture in authored data**: The durable next step is to encode card 87 with `prioritized` plus `qualifierKey: type`, so FITL consumes the generic kernel capability instead of bypassing it with `concat`.
3. **Strengthen the rule at the regression boundary**: The highest-value tests now are event-level regression tests that prove the real card follows qualifier-aware sourcing rules, plus any missing unit coverage revealed by those tests.
4. **Only change kernel code if tests expose a real hole**: No speculative refactor, no duplicate helper, no alternate aliasing path.

## Scope Correction

This ticket should no longer claim ownership of the core kernel implementation. That work is already in the tree.

This ticket should instead:

- re-author card 87 to use `prioritized`
- use `qualifierKey: type` so Rule 1.4.1 is enforced per piece type
- update the event's cardinality expressions to count the same prioritized domain
- add regression coverage that proves map pieces of a given type stay blocked while Available pieces of that same type remain
- add or tighten any missing unit coverage only if the card-level regression reveals a gap

## What to Change

### 1. Re-author card 87 unshaded sourcing

Replace the card's current `concat` sourcing with `prioritized`:

- tier 1: ARVN pieces in `available-ARVN:none`
- tier 2: ARVN pieces already on the map within 3 spaces of Hue
- `qualifierKey: type`

### 2. Keep min/max in sync with the authored sourcing rule

Any aggregate counts that currently duplicate the `concat` domain must count the same prioritized domain instead, so legality and cardinality stay aligned.

### 3. Add regression coverage at the card boundary

Cover the real behavior that matters:

- map ARVN Troops remain illegal while Available ARVN Troops remain
- a different type can unlock independently if no Available piece of that type exists
- apply-time move resolution rejects a card-87 selection that violates prioritized sourcing

## Files to Touch

- `data/games/fire-in-the-lake/41-events/065-096.md` (modify — card 87)
- `packages/engine/test/integration/fitl-events-nguyen-chanh-thi.test.ts` (modify)
- `packages/engine/test/unit/effects-choice.test.ts` (modify only if qualifier-aware apply-time coverage is still missing after the card regression is added)

## Out of Scope

- Re-implementing `prioritized` query support
- Re-implementing incremental `chooseN`
- New aliases, fallback compatibility paths, or duplicate legality systems
- Any FITL-specific branch in engine code
- Any hidden tier metadata on query results
- UI presentation changes

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo build` succeeds
2. Card 87 unshaded is authored with `query: prioritized`
3. Card 87 uses `qualifierKey: type`
4. Card-87 legality blocks lower-tier pieces while same-type Available pieces remain
5. Card-87 legality still allows independent types to unlock correctly
6. Apply-time validation rejects an illegal card-87 final selection
7. `pnpm -F @ludoforge/engine test` succeeds

### Invariants

1. Legal choice discovery and move application agree on admissibility.
2. Lower-priority tiers never satisfy the same qualified remainder when higher tiers still can.
3. Qualifier matching is driven entirely by authored data via `qualifierKey: type`.
4. No FITL-specific identifiers are introduced into shared kernel code.
5. The ticket reflects the current architecture instead of restating already-completed kernel work.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-events-nguyen-chanh-thi.test.ts` — real card-87 prioritized-sourcing regression coverage
2. `packages/engine/test/unit/effects-choice.test.ts` — qualifier-aware apply-time rejection only if current coverage is insufficient

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test`

## Outcome

Actual change versus original plan:

- No new kernel architecture was added because the shared prioritized-tier helper, incremental `chooseN` protocol, discovery-time legality, and apply-time validation were already implemented.
- Card 87 was re-authored to use `prioritized` with `qualifierKey: type`, so the authored FITL event now consumes the existing generic architecture.
- Regression coverage was strengthened at the card boundary and at apply-time qualifier validation.
