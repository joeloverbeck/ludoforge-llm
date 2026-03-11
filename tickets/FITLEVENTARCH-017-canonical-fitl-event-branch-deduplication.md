# FITLEVENTARCH-017: Canonical FITL Event Branch Deduplication for Recurring Choice Matrices

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Large
**Engine Changes**: Yes — generic event-card authoring/schema/compiler support in `packages/engine/src/cnl/` and `packages/engine/src/kernel/` if a stricter canonical event-composition shape is adopted
**Deps**: tickets/README.md, archive/tickets/FITLEVENTARCH/FITLEVENTARCH-016-event-scoped-interrupts-and-branch-delta-composition.md, archive/tickets/FITLEVENTARCH-006-event-target-canonical-payload-ownership.md, archive/tickets/GAMESPECDOC-004-binding-and-param-semantics-spec.md, data/games/fire-in-the-lake/41-events/001-032.md, data/games/fire-in-the-lake/41-events/033-064.md, data/games/fire-in-the-lake/41-events/097-130.md

## Problem

Fire in the Lake event data contains multiple branch matrices where each branch repeats a large shared payload and only a small delta varies. Honolulu is not the only duplicated branch shape in FITL data, but its proposed interrupt redesign was rejected because that part is not recurring. The remaining architecture question is narrower: whether recurring branch duplication across several FITL cards justifies one canonical event authoring composition pattern for shared branch payload plus varying deltas/effects.

## Assumption Reassessment (2026-03-11)

1. Confirmed: the exact Honolulu pattern does not recur broadly. In current `data/games/*`, authored `pushInterruptPhase` appears only 5 times total, with 4 of those in Honolulu and 1 shared `commitment` interrupt on Great Society.
2. Confirmed: recurring duplicated branch matrices do exist in FITL event data even when no interrupt is involved. Current concrete candidates include card 43, card 50, card 63, card 64, and card 97.
3. Confirmed: these repetitions are authored-data duplication, not a missing runtime interrupt abstraction. The generic interrupt stack already exists and is not in scope here.
4. Mismatch correction: this ticket must not revisit event-scoped interrupts. Scope is limited to recurring branch deduplication patterns that can be expressed as a cleaner canonical event authoring contract, if and only if that contract is justified across multiple cards.

## Architecture Check

1. If a new event composition shape is introduced, it should remove repeated branch boilerplate across multiple cards, not optimize a single card. Otherwise the current explicit branches are clearer.
2. The cleanest acceptable design is data-first: game-specific numbers and effects stay in `GameSpecDoc`, while any helper introduced into compiler/schema/runtime remains generic and reusable across games.
3. No aliases or fallback dual-shapes. If a new canonical branch-composition contract is adopted, migrate selected FITL cards to that contract and remove reliance on the older repeated representation for those cards.
4. The design bar is high: prefer no change over adding a narrow DSL construct that only compresses YAML without improving maintainability, validation clarity, or execution semantics.

## What to Change

### 1. Inventory and classify recurring branch-duplication patterns in FITL event data

Document the concrete recurring shapes in current FITL events:
- branches that differ only by resource/track deltas,
- branches that share the same follow-up effect block,
- branches that share the same free-operation or target payload with only one varying effect.

Use that inventory to determine whether there is one coherent canonical pattern or multiple unrelated patterns.

### 2. If justified, design one canonical event-side composition contract

Only proceed if the inventory shows enough repeated structure across multiple cards.

The contract should support a shape like:
- shared branch effects or grants,
- per-branch deltas/effect fragments,
- deterministic lowering into the existing event execution model,
- strict canonical validation with no aliasing or fallback legacy shape.

The design must explicitly exclude inline/event-scoped interrupt declaration.

### 3. Migrate a representative multi-card FITL slice

If the canonical pattern is justified, migrate the smallest set of FITL cards that demonstrates real reuse, likely including:
- at least one pure delta matrix,
- at least one shared-follow-up branch matrix,
- Honolulu only for the duplicated delta/shared-follow-up portion, not for interrupt redesign.

### 4. Harden tests around canonical branch composition

Add unit coverage for lowering/validation and integration coverage for migrated cards so the canonical representation is pinned behaviorally, not just structurally.

## Files to Touch

- `tickets/FITLEVENTARCH-017-canonical-fitl-event-branch-deduplication.md` (new)
- `data/games/fire-in-the-lake/41-events/001-032.md` (modify if migration is justified)
- `data/games/fire-in-the-lake/41-events/033-064.md` (modify if migration is justified)
- `data/games/fire-in-the-lake/41-events/097-130.md` (modify if migration is justified)
- `packages/engine/src/cnl/` (modify relevant lowering/validation modules if canonical contract is introduced)
- `packages/engine/src/kernel/types-events.ts` (modify if event contract changes)
- `packages/engine/src/kernel/schemas-extensions.ts` (modify if event contract changes)
- `packages/engine/test/unit/` (modify/add canonical branch-composition tests if implemented)
- `packages/engine/test/integration/` (modify/add FITL migrated-card coverage if implemented)

## Out of Scope

- Event-scoped interrupt or subphase architecture.
- Changing the generic interrupt stack mechanism.
- One-off YAML cleanup for a single card with no broader canonical payoff.
- Game-specific engine branching for Fire in the Lake card IDs or faction semantics.

## Acceptance Criteria

### Tests That Must Pass

1. If a canonical branch-composition contract is introduced, at least two distinct FITL cards beyond a single one-off example use it successfully.
2. Migrated cards preserve their prior gameplay behavior after the canonical representation is adopted.
3. Existing suite: `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

### Invariants

1. Game-specific values and follow-up behavior remain authored in `GameSpecDoc` data, not hardcoded in engine/runtime.
2. Any new branch-composition surface remains generic and does not encode FITL resources, factions, or event IDs.
3. No event-scoped interrupt declaration mechanism is introduced by this ticket.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-top-level.test.ts` — verify any canonical branch-composition contract lowers deterministically and rejects non-canonical shapes.
2. `packages/engine/test/unit/cross-validate.test.ts` or adjacent event-schema/validation tests — ensure validation is strict and there is no alias/fallback path.
3. `packages/engine/test/integration/fitl-events-honolulu-conference.test.ts` — if Honolulu is migrated for branch deduplication only, preserve current Aid/Patronage and interrupt behavior exactly.
4. `packages/engine/test/integration/` migrated-card tests for at least one non-Honolulu FITL event — prove the contract is genuinely reusable rather than Honolulu-specific.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/engine lint`
4. `pnpm run check:ticket-deps`
