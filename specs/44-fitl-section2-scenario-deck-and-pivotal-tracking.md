# Spec 44: FITL Section 2 — Scenario Deck Exclusions & Pivotal Tracking

**Status**: Draft
**Priority**: P2
**Complexity**: M
**Dependencies**: Spec 29 (event card encoding), Spec 43 (coup round)
**Estimated effort**: 2–3 days
**Source sections**: Rules Section 2 (Sequence of Play), Scenarios (setup instructions)

## Overview

Gap analysis of Section 2 rules against the current FITL game data revealed 5 actionable gaps and 1 deferred gap. This spec covers scenario deck exclusion lists, `leaderBoxCardCount` initialization, pivotal event single-use enforcement, and the Period Events optional variant.

## Gaps Summary

| Gap | Description | Tier | Impact |
|-----|-------------|------|--------|
| 1 | Short scenario missing `excludedCardIds` (pivotals + 1 coup) | Data-only | Incorrect deck composition |
| 2 | Medium/Full scenarios missing pivotal exclusion from draw deck | Data-only | Pivotals shuffled into deck |
| 3 | `leaderBoxCardCount` not initialized in Short/Medium scenarios | Data-only | Wrong pivotal availability |
| 4 | Pivotal events can be played multiple times | Data + vocab | Rules violation |
| 5 | Period Events optional variant not representable | Schema + data | Missing variant |
| 6 | Short scenario capabilities conditional on Period Events | Deferred | Minor; needs variant system |

## Tier 1: Data-Only Changes (No Schema/Engine Changes)

### Ticket FITLSCENDECK-001: Short Scenario Deck Exclusions

**Rules reference**: "remove 1 Failed Coup and all Pivotal Events" (Short scenario setup)

**Current state**: Short scenario `deckComposition` in `40-content-data-assets.md` (line ~1421):
```yaml
deckComposition:
  pileCount: 3
  eventsPerPile: 8
  coupsPerPile: 1
```
No `excludedCardIds` field, despite the schema already supporting it (`schemas-gamespec.ts:189`, `types-events.ts:131`).

**Required change**: Add `excludedCardIds` to the Short scenario's `deckComposition`:
```yaml
deckComposition:
  pileCount: 3
  eventsPerPile: 8
  coupsPerPile: 1
  excludedCardIds:
    - card-121   # Linebacker II (US pivotal)
    - card-122   # Easter Offensive (NVA pivotal)
    - card-123   # Vietnamization (ARVN pivotal)
    - card-124   # Tet Offensive (VC pivotal)
    - card-129   # Failed Attempt (1 of 2 removed in Short)
```

**Rationale**: The Short scenario removes all 4 pivotal events and 1 of the 2 Failed Attempt coup cards. There are 6 coup cards total (card-125 through card-130), of which card-129 and card-130 are both "Failed Attempt". Removing card-129 leaves 5 coup cards: 3 for the 3 piles plus 2 remaining unused.

**File**: `data/games/fire-in-the-lake/40-content-data-assets.md`

**Verification**: Compile Short scenario; confirm `excludedCardIds` contains exactly 5 entries.

---

### Ticket FITLSCENDECK-002: Medium/Full Scenario Pivotal Exclusions

**Rules reference**: "Distribute Pivotal Events" (Medium and Full scenario setup) — pivotals are handed to players, not shuffled into the draw deck.

**Current state**: Neither Medium nor Full scenario has `excludedCardIds`. This means the 4 pivotal event cards would be shuffled into the draw deck alongside regular events, which is incorrect.

**Required change — Medium** (`40-content-data-assets.md`, line ~1795):
```yaml
deckComposition:
  pileCount: 3
  eventsPerPile: 12
  coupsPerPile: 1
  excludedCardIds:
    - card-121   # Linebacker II (US pivotal)
    - card-122   # Easter Offensive (NVA pivotal)
    - card-123   # Vietnamization (ARVN pivotal)
    - card-124   # Tet Offensive (VC pivotal)
```

**Required change — Full** (`40-content-data-assets.md`, line ~1086):
```yaml
deckComposition:
  pileCount: 6
  eventsPerPile: 12
  coupsPerPile: 1
  excludedCardIds:
    - card-121   # Linebacker II (US pivotal)
    - card-122   # Easter Offensive (NVA pivotal)
    - card-123   # Vietnamization (ARVN pivotal)
    - card-124   # Tet Offensive (VC pivotal)
```

**Rationale**: Pivotals are distributed face-up to their owning factions. They are never part of the shuffled draw deck in any scenario. The deck builder logic should exclude these IDs when constructing piles.

**File**: `data/games/fire-in-the-lake/40-content-data-assets.md`

**Verification**: Compile Medium and Full scenarios; confirm `excludedCardIds` contains exactly 4 entries each.

---

### Ticket FITLSCENDECK-003: `leaderBoxCardCount` Initialization

**Rules reference**: Short starts with Young Turks (leader) + Khanh (beneath) = 2 cards in leader box. Medium starts with Ky (leader) + Khanh + Young Turks (beneath) = 3 cards. Full starts with Duong Van Minh (initial leader, not a card) = 0 cards.

**Current state**: `leaderBoxCardCount` in `10-vocabulary.md` (line ~351):
```yaml
- name: leaderBoxCardCount
  type: int
  init: 0
  min: 0
  max: 8
```
No scenario overrides this initial value. The Full scenario is correct at 0. Short and Medium are wrong.

**Impact**: The pivotal event precondition checks `leaderBoxCardCount >= 2` (pivotals are available only after 2+ coup cards have been processed). Short scenario has no pivotals so this is harmless there, but Medium scenario starts with 3 leader cards — pivotals should be immediately available. Without initialization, Medium incorrectly blocks pivotals until 2 coup rounds are completed.

**Required change — Short** (add to `initialTrackValues` in `40-content-data-assets.md`, Short scenario, after line ~1451):
```yaml
        - trackId: leaderBoxCardCount
          value: 2
```

**Required change — Medium** (add to `initialTrackValues` in `40-content-data-assets.md`, Medium scenario, after line ~1835):
```yaml
        - trackId: leaderBoxCardCount
          value: 3
```

Full scenario: no change needed (init 0 is correct — Duong Van Minh is the starting leader with no coup cards in the box).

**File**: `data/games/fire-in-the-lake/40-content-data-assets.md`

**Verification**: Compile all 3 scenarios; confirm Short `leaderBoxCardCount` = 2, Medium = 3, Full = 0.

---

## Tier 2: Data + Vocabulary Changes

### Ticket FITLSCENDECK-004: Pivotal Event Single-Use Enforcement

**Rules reference**: Section 2.3.8 — "placing its Pivotal Event card on the played Event card" (after playing, it goes to the played pile and cannot be reused). "A canceled Pivotal Event card is returned to its owner for possible later use."

**Current state**: The `pivotalEvent` action in `30-rules-actions.md` (line ~996) has:
```yaml
- id: pivotalEvent
  actor: active
  executor: 'actor'
  phase: [main]
  params:
    - name: eventCardId
      domain: { query: enums, values: [card-121, card-122, card-123, card-124] }
  pre:
    op: or
    args:
      - op: and
        args:
          - { op: '==', left: { ref: activePlayer }, right: 0 }
          - { op: '==', left: { ref: binding, name: eventCardId }, right: card-121 }
      - op: and
        args:
          - { op: '==', left: { ref: activePlayer }, right: 2 }
          - { op: '==', left: { ref: binding, name: eventCardId }, right: card-122 }
      - op: and
        args:
          - { op: '==', left: { ref: activePlayer }, right: 1 }
          - { op: '==', left: { ref: binding, name: eventCardId }, right: card-123 }
      - op: and
        args:
          - { op: '==', left: { ref: activePlayer }, right: 3 }
          - { op: '==', left: { ref: binding, name: eventCardId }, right: card-124 }
  cost: []
  effects: []
  limits: []
```

**Problem**: No `limits` and no precondition checking whether the pivotal has already been played. A player could invoke `pivotalEvent` for the same card repeatedly across turns.

**Required changes**:

#### Step A: Add 4 pivotal-used globalVars to vocabulary

Add to `10-vocabulary.md` `globalVars` section:
```yaml
  - name: pivotalUsed_card121
    type: int
    init: 0
    min: 0
    max: 1
  - name: pivotalUsed_card122
    type: int
    init: 0
    min: 0
    max: 1
  - name: pivotalUsed_card123
    type: int
    init: 0
    min: 0
    max: 1
  - name: pivotalUsed_card124
    type: int
    init: 0
    min: 0
    max: 1
```

#### Step B: Add precondition checks to `pivotalEvent` action

Extend each `op: and` branch in the `pre` field with an additional check that the pivotal has not been used:
```yaml
  pre:
    op: or
    args:
      - op: and
        args:
          - { op: '==', left: { ref: activePlayer }, right: 0 }
          - { op: '==', left: { ref: binding, name: eventCardId }, right: card-121 }
          - { op: '==', left: { ref: globalVar, name: pivotalUsed_card121 }, right: 0 }
      - op: and
        args:
          - { op: '==', left: { ref: activePlayer }, right: 2 }
          - { op: '==', left: { ref: binding, name: eventCardId }, right: card-122 }
          - { op: '==', left: { ref: globalVar, name: pivotalUsed_card122 }, right: 0 }
      - op: and
        args:
          - { op: '==', left: { ref: activePlayer }, right: 1 }
          - { op: '==', left: { ref: binding, name: eventCardId }, right: card-123 }
          - { op: '==', left: { ref: globalVar, name: pivotalUsed_card123 }, right: 0 }
      - op: and
        args:
          - { op: '==', left: { ref: activePlayer }, right: 3 }
          - { op: '==', left: { ref: binding, name: eventCardId }, right: card-124 }
          - { op: '==', left: { ref: globalVar, name: pivotalUsed_card124 }, right: 0 }
```

#### Step C: Add set-used effect to `pivotalEvent` action

Add effects that mark the pivotal as used when played:
```yaml
  effects:
    - if:
        condition: { op: '==', left: { ref: binding, name: eventCardId }, right: card-121 }
        then:
          - setVar: { scope: global, var: pivotalUsed_card121, value: 1 }
    - if:
        condition: { op: '==', left: { ref: binding, name: eventCardId }, right: card-122 }
        then:
          - setVar: { scope: global, var: pivotalUsed_card122, value: 1 }
    - if:
        condition: { op: '==', left: { ref: binding, name: eventCardId }, right: card-123 }
        then:
          - setVar: { scope: global, var: pivotalUsed_card123, value: 1 }
    - if:
        condition: { op: '==', left: { ref: binding, name: eventCardId }, right: card-124 }
        then:
          - setVar: { scope: global, var: pivotalUsed_card124, value: 1 }
```

**Note on cancellation**: The rules say a canceled pivotal is returned to its owner. The cancellation/interrupt system should NOT set the used flag. This means the `setVar` effects should only fire when the pivotal successfully resolves (i.e., is not canceled). If the current interrupt system cancels the entire action before effects run, this is already handled correctly. If cancellation happens after effects, a reset mechanism would be needed — but that is an edge case for the interrupt system spec, not this ticket.

**Files**: `data/games/fire-in-the-lake/10-vocabulary.md`, `data/games/fire-in-the-lake/30-rules-actions.md`

**Verification**:
- Compile and confirm 4 new globalVars exist
- Confirm `pivotalEvent` precondition includes used-flag checks
- Confirm `pivotalEvent` effects include set-used-flag conditionals
- Unit test: after playing card-121 pivotal, legalMoves should not include pivotalEvent with card-121

---

## Tier 3: Schema Extension + Data

### Ticket FITLSCENDECK-005: Period Events Optional Variant

**Rules reference**: "Period Events Option" (Section 2.1 setup) — If desired, select Event cards by period:
- **Short**: All piles from "1965" period cards only
- **Medium**: All piles from "1968" period cards only
- **Full**: Top pile from "1964", piles 2–3 from "1965", bottom 3 piles from "1968"

**Current state**: Event cards already have `period` metadata tags (e.g., `metadata: { period: "1965" }`). But there is no mechanism in the scenario data or schema to specify which periods map to which piles.

**Required schema change**: Extend `ScenarioDeckComposition` with an optional `periodFilter` field.

#### Step A: Type definition (`types-events.ts`)

Add to `ScenarioDeckComposition` interface:
```typescript
readonly periodFilter?: {
  readonly enabled: boolean;
  readonly pileAssignments: readonly {
    readonly piles: readonly number[];
    readonly period: string;
  }[];
};
```

#### Step B: Zod schema (`schemas-gamespec.ts`)

Extend `ScenarioDeckCompositionSchema`:
```typescript
export const ScenarioDeckCompositionSchema = z
  .object({
    pileCount: IntegerSchema.positive(),
    eventsPerPile: IntegerSchema.positive(),
    coupsPerPile: IntegerSchema.positive(),
    includedCardIds: z.array(StringSchema.min(1)).optional(),
    excludedCardIds: z.array(StringSchema.min(1)).optional(),
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
  })
  .strict();
```

#### Step C: JSON Schema artifact

Run `pnpm turbo schema:artifacts` to regenerate `GameDef.schema.json` (if applicable to GameSpecDoc schemas). If `periodFilter` is a GameSpecDoc-only concept that does not propagate to GameDef, the JSON Schema may not need changes — but verify.

#### Step D: Data — Add `periodFilter` to all 3 scenarios

**Short** (`40-content-data-assets.md`):
```yaml
deckComposition:
  pileCount: 3
  eventsPerPile: 8
  coupsPerPile: 1
  excludedCardIds: [card-121, card-122, card-123, card-124, card-129]
  periodFilter:
    enabled: false
    pileAssignments:
      - piles: [1, 2, 3]
        period: "1965"
```

**Medium** (`40-content-data-assets.md`):
```yaml
deckComposition:
  pileCount: 3
  eventsPerPile: 12
  coupsPerPile: 1
  excludedCardIds: [card-121, card-122, card-123, card-124]
  periodFilter:
    enabled: false
    pileAssignments:
      - piles: [1, 2, 3]
        period: "1968"
```

**Full** (`40-content-data-assets.md`):
```yaml
deckComposition:
  pileCount: 6
  eventsPerPile: 12
  coupsPerPile: 1
  excludedCardIds: [card-121, card-122, card-123, card-124]
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

**Note**: `enabled: false` by default — the period variant is opt-in. Deck builder logic checks `periodFilter.enabled` before applying pile-based period filtering. When enabled, each pile only draws from event cards whose `metadata.period` matches the assigned period.

**Files**: `packages/engine/src/kernel/schemas-gamespec.ts`, `packages/engine/src/kernel/types-events.ts`, `data/games/fire-in-the-lake/40-content-data-assets.md`

**Verification**:
- `pnpm turbo build` passes
- `pnpm turbo schema:artifacts` regenerates without error
- Compile all 3 scenarios with period filter present
- Schema validation accepts `periodFilter` as optional
- Period counts: 24 "1964" cards, 48 "1965" cards, 48 "1968" cards (matches rules NOTE)

---

## Deferred

### Gap 6: Short Scenario Conditional Capabilities

**Rules say**: "Capabilities: (if using period Events) Shaded—AAA"

**Current data**: Short scenario has `startingCapabilities: [{ capabilityId: aaa, side: shaded }]` unconditionally.

**Why deferred**: Making this conditional requires a variant/option system that does not exist yet. The capability is only meaningful when using Period Events. Since `periodFilter.enabled` defaults to `false`, having AAA always active is a minor inaccuracy that does not affect gameplay when Period Events are not used (AAA modifies NVA air defense but doesn't break anything on its own).

**Future**: When a game variant/option system is designed (likely post-MVP), revisit this to make `startingCapabilities` conditional on `periodFilter.enabled`.

---

## Implementation Order

1. **FITLSCENDECK-001** (Short deck exclusions) — no dependencies
2. **FITLSCENDECK-002** (Medium/Full pivotal exclusions) — no dependencies
3. **FITLSCENDECK-003** (`leaderBoxCardCount` init) — no dependencies
4. **FITLSCENDECK-004** (Pivotal single-use) — depends on vocabulary changes in step A
5. **FITLSCENDECK-005** (Period filter schema + data) — depends on 001/002 for combined `excludedCardIds` edits

Tickets 001–003 can be implemented in parallel. Ticket 004 is independent. Ticket 005 depends on the final form of `deckComposition` from 001/002.

## Files Changed

| File | Tickets | Change Type |
|------|---------|-------------|
| `data/games/fire-in-the-lake/40-content-data-assets.md` | 001, 002, 003, 005 | Data |
| `data/games/fire-in-the-lake/10-vocabulary.md` | 004 | Data |
| `data/games/fire-in-the-lake/30-rules-actions.md` | 004 | Data |
| `packages/engine/src/kernel/schemas-gamespec.ts` | 005 | Schema |
| `packages/engine/src/kernel/types-events.ts` | 005 | Type |

## Verification Checklist

- [ ] `pnpm turbo build` — clean compilation
- [ ] `pnpm turbo test` — all existing tests pass
- [ ] Short scenario `excludedCardIds` = 5 entries (4 pivotals + 1 Failed Attempt)
- [ ] Medium scenario `excludedCardIds` = 4 entries (4 pivotals)
- [ ] Full scenario `excludedCardIds` = 4 entries (4 pivotals)
- [ ] Short `leaderBoxCardCount` init = 2
- [ ] Medium `leaderBoxCardCount` init = 3
- [ ] Full `leaderBoxCardCount` init = 0 (default)
- [ ] `pivotalEvent` action has single-use precondition per card
- [ ] `pivotalEvent` action sets used flag on successful play
- [ ] `ScenarioDeckCompositionSchema` accepts optional `periodFilter`
- [ ] `ScenarioDeckComposition` interface includes `periodFilter`
- [ ] All 3 scenarios have `periodFilter` with correct pile assignments
- [ ] `pnpm turbo schema:artifacts` — regenerated without error
