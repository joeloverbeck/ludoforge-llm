# FITLSEC2SCEDEC-005: Add `periodFilter` Schema Extension and Scenario Data

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — schema/type contract extension in `packages/engine/src/kernel/`
**Deps**: `specs/44-fitl-section2-scenario-deck-and-pivotal-tracking.md`, `reports/fire-in-the-lake-rules-section-2.md`, `reports/fire-in-the-lake-rules-section-6.md`

## Problem

FITL Section 2 defines an optional Period Events setup mode that maps period cohorts to scenario piles:
- Short: 1965-only cards
- Medium: 1968-only cards
- Full: pile 1 = 1964, piles 2-3 = 1965, piles 4-6 = 1968

Current `deckComposition` supports include/exclude by card id and tag, but has no per-pile period assignment representation. This ticket adds declarative data/schema support only (no materialization behavior change yet).

## Assumption Reassessment (2026-02-24)

1. `ScenarioDeckComposition` is not limited to id filters anymore. Current schema/type already include:
   - `includedCardIds` / `excludedCardIds`
   - `includedCardTags` / `excludedCardTags`
   - required `materializationStrategy`
2. Production FITL scenarios currently rely on `excludedCardTags: [pivotal]` (not explicit pivotal `excludedCardIds` in Medium/Full), and Short additionally excludes `card-129`.
3. `leaderBoxCardCount` setup is already fixed and covered by `fitl-scenario-leader-box-init.test.ts`; it is not in scope for this ticket.
4. Existing integration coverage (`fitl-scenario-deck-exclusions.test.ts`) currently validates deck exclusions only; period option representation coverage is missing.
5. Event cards already expose `metadata.period` values in `41-content-event-decks.md`, so no card data shape change is required.

## Architecture Check

1. Adding a declarative `periodFilter` field is beneficial over status quo because it preserves scenario intent in GameSpecDoc rather than embedding period logic in ad hoc code/tests.
2. This is still a bounded interim contract: it introduces no FITL-specific runtime branches and does not alter deck materialization behavior in this ticket.
3. Ideal long-term architecture should generalize per-pile selectors beyond `period` (for arbitrary card metadata/tag predicates). That generalization is intentionally deferred to avoid over-scoping this ticket.

## Updated Scope

1. Extend scenario deck composition schema/type with optional `periodFilter`.
2. Add `periodFilter` entries to Full/Short/Medium scenario `deckComposition` blocks with `enabled: false` and rulebook-aligned pile assignments.
3. Add tests that lock the schema contract and production data presence/shape.
4. Do not change deck materialization runtime behavior in this ticket.

## What to Change

### 1. Extend `ScenarioDeckComposition` interface

File: `packages/engine/src/kernel/types-events.ts`

Add optional field:

```ts
readonly periodFilter?: {
  readonly enabled: boolean;
  readonly pileAssignments: readonly {
    readonly piles: readonly number[];
    readonly period: string;
  }[];
};
```

### 2. Extend `ScenarioDeckCompositionSchema`

File: `packages/engine/src/kernel/schemas-gamespec.ts`

Add optional strict `periodFilter` object:

- `enabled: boolean`
- `pileAssignments: [{ piles: positive int[], period: non-empty string }]`

### 3. Add scenario data

File: `data/games/fire-in-the-lake/40-content-data-assets.md`

Add `deckComposition.periodFilter` with `enabled: false`:

- Full: `[1] -> 1964`, `[2,3] -> 1965`, `[4,5,6] -> 1968`
- Short: `[1,2,3] -> 1965`
- Medium: `[1,2,3] -> 1968`

### 4. Add/strengthen tests

- Schema-level parse coverage for `periodFilter` present/absent.
- Production FITL scenario data assertions for all three scenarios.

## Files to Touch

- `packages/engine/src/kernel/types-events.ts` (modify)
- `packages/engine/src/kernel/schemas-gamespec.ts` (modify)
- `data/games/fire-in-the-lake/40-content-data-assets.md` (modify)
- `packages/engine/test/unit/schemas-scenario.test.ts` (modify)
- `packages/engine/test/integration/fitl-scenario-deck-exclusions.test.ts` (modify)
- `packages/engine/test/unit/types-exhaustive.test.ts` (modify)

## Out of Scope

- Runtime deck materialization changes using `periodFilter`
- Any pivotal eligibility/usage behavior
- Any `leaderBoxCardCount` logic/data changes
- Any scenario-option/variant execution UI
- Any non-FITL game data

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/engine test` passes.
2. `pnpm turbo test` passes.
3. `pnpm turbo lint` passes.
4. `ScenarioDeckCompositionSchema` accepts payloads with and without `periodFilter`.
5. Full/Short/Medium production scenarios all include `deckComposition.periodFilter.enabled === false`.
6. Full scenario assignments are exactly `1964:[1]`, `1965:[2,3]`, `1968:[4,5,6]`.

### Invariants

1. `periodFilter` is optional and strict.
2. Existing deck composition selectors (`included/excluded` ids/tags) remain unchanged.
3. No runtime behavior change in materialization; this ticket is representational contract + data.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/schemas-scenario.test.ts` — add parse assertions for `periodFilter` present/absent.
2. `packages/engine/test/integration/fitl-scenario-deck-exclusions.test.ts` — assert `periodFilter` presence and exact pile mappings for Full/Short/Medium.
3. `packages/engine/test/unit/types-exhaustive.test.ts` — include `periodFilter` in compile-time shape check.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo test`
3. `pnpm turbo lint`

## Verification

1. `pnpm -F @ludoforge/engine test` ✅
2. `pnpm turbo test` ✅
3. `pnpm turbo lint` ✅

## Outcome

- Completion date: 2026-02-24
- Actually changed vs originally planned:
  - Corrected stale assumptions in this ticket before implementation (deck composition currently uses tag filters and leader-box initialization already exists).
  - Implemented optional `periodFilter` schema/type contract plus scenario data entries for Full/Short/Medium with `enabled: false`.
  - Added coverage in existing schema, integration, and type-shape tests.
- Deviations from original ticket text:
  - Test plan was implemented by extending existing test files instead of introducing a new dedicated schema test file.
  - No runtime deck-materialization behavior changes were introduced; this remains declarative data-contract work only.
