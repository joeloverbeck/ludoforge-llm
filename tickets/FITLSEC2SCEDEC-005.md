# FITLSEC2SCEDEC-005: Add `periodFilter` Schema Extension and Scenario Data

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — schema + type extension in `packages/engine/src/kernel/`
**Deps**: FITLSEC2SCEDEC-001, FITLSEC2SCEDEC-002 (depends on the final form of `deckComposition` blocks having `excludedCardIds` already in place)

## Problem

The FITL rules include a "Period Events Option" (Section 2.1 setup) allowing players to select event cards by historical period:
- **Short**: All piles from "1965" period cards only
- **Medium**: All piles from "1968" period cards only
- **Full**: Top pile from "1964", piles 2-3 from "1965", bottom 3 piles from "1968"

Event cards already have `period` metadata tags, but there is no mechanism in the scenario data or schema to specify which periods map to which piles. This ticket adds the schema/type extension and the data entries (defaulting to `enabled: false` since the variant is opt-in).

## Assumption Reassessment (2026-02-23)

1. `ScenarioDeckCompositionSchema` at `schemas-gamespec.ts:183-191` currently has `pileCount`, `eventsPerPile`, `coupsPerPile`, `includedCardIds?`, `excludedCardIds?` — confirmed, no `periodFilter`.
2. `ScenarioDeckComposition` interface at `types-events.ts:126-132` matches the schema — confirmed, no `periodFilter`.
3. Event cards have `metadata.period` with values like `"1964"`, `"1965"`, `"1968"` — to be confirmed during implementation by checking `41-content-event-decks.md`.
4. The spec calls for `enabled: false` by default — the deck builder would only apply period filtering when `enabled: true`. The deck builder logic itself is not part of this ticket.

## Architecture Check

1. Extends the existing schema/type with an optional field — fully backward compatible.
2. The `periodFilter` field is a GameSpecDoc-level concept. The compiler passes `ScenarioDeckComposition` through to `GameDef` scenarios. Running `pnpm turbo schema:artifacts` will regenerate JSON schemas if applicable.
3. No aliasing or shims. The field is optional and defaults to absent — existing data without it continues to compile.

## What to Change

### 1. Extend `ScenarioDeckComposition` interface (`types-events.ts`)

Add to the `ScenarioDeckComposition` interface (after `excludedCardIds` at line ~131):

```typescript
readonly periodFilter?: {
  readonly enabled: boolean;
  readonly pileAssignments: readonly {
    readonly piles: readonly number[];
    readonly period: string;
  }[];
};
```

### 2. Extend `ScenarioDeckCompositionSchema` Zod schema (`schemas-gamespec.ts`)

Add to the `.object({...})` block (after `excludedCardIds` at line ~189):

```typescript
periodFilter: z
  .object({
    enabled: z.boolean(),
    pileAssignments: z.array(
      z
        .object({
          piles: z.array(IntegerSchema.positive()),
          period: StringSchema.min(1),
        })
        .strict(),
    ),
  })
  .strict()
  .optional(),
```

### 3. Regenerate JSON Schema artifacts

Run `pnpm turbo schema:artifacts` to update `GameDef.schema.json` (or confirm no JSON Schema changes are needed if `periodFilter` is handled entirely at the GameSpecDoc level).

### 4. Add `periodFilter` data to all 3 scenarios

In `data/games/fire-in-the-lake/40-content-data-assets.md`, add `periodFilter` to each scenario's `deckComposition` block (after `excludedCardIds`, which should already exist from FITLSEC2SCEDEC-001 and FITLSEC2SCEDEC-002):

**Short scenario** (line ~1421 area):
```yaml
        periodFilter:
          enabled: false
          pileAssignments:
            - piles: [1, 2, 3]
              period: "1965"
```

**Medium scenario** (line ~1795 area):
```yaml
        periodFilter:
          enabled: false
          pileAssignments:
            - piles: [1, 2, 3]
              period: "1968"
```

**Full scenario** (line ~1086 area):
```yaml
        periodFilter:
          enabled: false
          pileAssignments:
            - piles: [1]
              period: "1964"
            - piles: [2, 3]
              period: "1965"
            - piles: [4, 5, 6]
              period: "1968"
```

## Files to Touch

- `packages/engine/src/kernel/types-events.ts` (modify — extend `ScenarioDeckComposition` interface)
- `packages/engine/src/kernel/schemas-gamespec.ts` (modify — extend `ScenarioDeckCompositionSchema`)
- `data/games/fire-in-the-lake/40-content-data-assets.md` (modify — add `periodFilter` to all 3 scenario `deckComposition` blocks)

## Out of Scope

- Deck builder logic that actually implements period-based filtering (future work — this ticket only adds the schema and data representation)
- Short scenario deck exclusions (FITLSEC2SCEDEC-001)
- Medium/Full scenario pivotal exclusions (FITLSEC2SCEDEC-002)
- `leaderBoxCardCount` initialization (FITLSEC2SCEDEC-003)
- Pivotal single-use enforcement (FITLSEC2SCEDEC-004)
- Gap 6 (Short scenario conditional capabilities) — explicitly deferred per spec
- Any changes to `10-vocabulary.md`, `30-rules-actions.md`, or `41-content-event-decks.md`
- Texas Hold'em or any other game data

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo build` — clean compilation (TypeScript types and Zod schema compile without error)
2. `pnpm turbo test` — all existing tests pass
3. `pnpm turbo schema:artifacts` — regenerates without error
4. **New test — schema validation**: Construct a `ScenarioDeckComposition` object with `periodFilter` present and verify it passes `ScenarioDeckCompositionSchema.parse()`.
5. **New test — schema validation (absent)**: Construct a `ScenarioDeckComposition` object without `periodFilter` and verify it still passes `ScenarioDeckCompositionSchema.parse()` (backward compatibility).
6. **New test — production data**: Compile production spec, iterate all 3 scenario assets, and assert each has `deckComposition.periodFilter` with `enabled: false`.
7. **New test — Full scenario pile assignments**: Assert Full scenario's `periodFilter.pileAssignments` has 3 entries covering piles [1], [2,3], [4,5,6] with periods "1964", "1965", "1968" respectively.
8. **Existing test**: `packages/engine/test/unit/types-exhaustive.test.ts` still passes (existing `ScenarioDeckComposition` exhaustiveness check).

### Invariants

1. The `periodFilter` field is optional — omitting it must not break compilation.
2. All 3 scenarios have `periodFilter.enabled: false` (variant is opt-in, not active by default).
3. The existing `pileCount`, `eventsPerPile`, `coupsPerPile`, `includedCardIds`, `excludedCardIds` fields remain unchanged and functional.
4. The `.strict()` modifier on the schema ensures no unknown fields sneak in.
5. No runtime behavior change — this is purely declarative data. Deck builder logic is a future ticket.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/schemas-deck-composition-period-filter.test.ts` — new unit test for `ScenarioDeckCompositionSchema` with and without `periodFilter`.
2. `packages/engine/test/integration/fitl-scenario-deck-exclusions.test.ts` — extend (should exist from FITLSEC2SCEDEC-001/002) to assert `periodFilter` presence and structure in all 3 scenarios.

### Commands

1. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test`
2. `pnpm turbo build && pnpm turbo test`
3. `pnpm turbo schema:artifacts`
