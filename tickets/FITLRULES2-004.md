# FITLRULES2-004: Pivotal Event Configuration (Rule 2.3.8)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — data-only change in GameSpecDoc YAML
**Deps**: FITLRULES2-003 (monsoon `blockPivotal` must be in place first)

## Problem

No `pivotal` section exists in the turnFlow config at `data/games/fire-in-the-lake/30-rules-actions.md`. Rule 2.3.8 defines pivotal event mechanics: each faction has a unique pivotal event card (cards 121-124) with preconditions. When a faction plays its pivotal event, it interrupts normal turn flow. If multiple factions attempt pivotal events in the same turn, a trumping hierarchy determines which succeeds.

The kernel already implements pivotal event handling. The `TurnFlowPivotalDef` type at `src/kernel/types-turn-flow.ts:71-76`:

```typescript
export interface TurnFlowPivotalDef {
  readonly actionIds: readonly string[];
  readonly requirePreActionWindow?: boolean;
  readonly disallowWhenLookaheadIsCoup?: boolean;
  readonly interrupt?: TurnFlowInterruptResolutionDef;
}
```

The interrupt resolution type at `src/kernel/types-turn-flow.ts:52-69`:

```typescript
export interface TurnFlowInterruptCancellationDef {
  readonly winner: TurnFlowInterruptMoveSelectorDef;
  readonly canceled: TurnFlowInterruptMoveSelectorDef;
}

export interface TurnFlowInterruptMoveSelectorDef {
  readonly actionId?: string;
  readonly actionClass?: TurnFlowActionClass;
  readonly eventCardId?: string;
  readonly eventCardTagsAll?: readonly string[];
  readonly eventCardTagsAny?: readonly string[];
  readonly paramEquals?: Readonly<Record<string, string | number | boolean>>;
}

export interface TurnFlowInterruptResolutionDef {
  readonly precedence: readonly string[];
  readonly cancellation?: readonly TurnFlowInterruptCancellationDef[];
}
```

## Existing Pivotal Cards

Cards 121-124 already exist in `data/games/fire-in-the-lake/41-content-event-decks.md` with `tags: [pivotal, <FACTION>]` and `playCondition` preconditions:

| Card | Order | Tags | Faction |
|------|-------|------|---------|
| 121 | 121 | `[pivotal, US]` | US |
| 122 | 122 | `[pivotal, NVA]` | NVA |
| 123 | 123 | `[pivotal, ARVN]` | ARVN |
| 124 | 124 | `[pivotal, VC]` | VC |

## What to Change

**File**: `data/games/fire-in-the-lake/30-rules-actions.md`

### Change 1: Add pivotal action stubs

Add 4 pivotal event action profiles (one per faction) to the actions section. Each should be locked to the owning faction and the specific event card ID:

```yaml
- id: pivotalUS
  label: "Pivotal Event: US"
  executor: { type: faction, value: '0' }
  actionClass: event
  params: []
  decisions: []
  effects: []

- id: pivotalNVA
  label: "Pivotal Event: NVA"
  executor: { type: faction, value: '2' }
  actionClass: event
  params: []
  decisions: []
  effects: []

- id: pivotalARVN
  label: "Pivotal Event: ARVN"
  executor: { type: faction, value: '1' }
  actionClass: event
  params: []
  decisions: []
  effects: []

- id: pivotalVC
  label: "Pivotal Event: VC"
  executor: { type: faction, value: '3' }
  actionClass: event
  params: []
  decisions: []
  effects: []
```

**Note**: The actual effects of pivotal events (the card-specific game actions) are Spec 29 scope. These stubs exist only to wire pivotal events into the turn flow framework.

### Change 2: Add pivotal section to turnFlow config

Add a `pivotal` section after the `monsoon` block in the turnFlow config:

```yaml
pivotal:
  actionIds: [pivotalUS, pivotalNVA, pivotalARVN, pivotalVC]
  requirePreActionWindow: true
  disallowWhenLookaheadIsCoup: true
  interrupt:
    precedence: ['3', '1', '2', '0']
    cancellation:
      - winner: { eventCardTagsAny: [pivotal] }
        canceled: { eventCardTagsAny: [pivotal] }
```

**Trumping hierarchy (Rule 2.3.8)**: `precedence: ['3', '1', '2', '0']` means:
- VC (faction `'3'`) trumps all others
- ARVN (faction `'1'`) trumps NVA and US
- NVA (faction `'2'`) trumps US
- US (faction `'0'`) cannot trump anyone

When two factions attempt pivotal events, the one with higher precedence (earlier in the array) wins; the other's pivotal event is canceled.

**Other pivotal rules encoded**:
- `requirePreActionWindow: true` — pivotal events happen in a pre-action interrupt window
- `disallowWhenLookaheadIsCoup: true` — pivotal events cannot be played during monsoon (reinforces FITLRULES2-003's `blockPivotal`)

## Invariants

1. Compiled `GameDef` must contain a `pivotal` section with exactly 4 `actionIds`.
2. Pivotal events must be blocked when lookahead is a coup card (monsoon).
3. When two factions attempt pivotal events, the trumping hierarchy determines which succeeds.
4. VC trumps all; ARVN trumps NVA and US; NVA trumps US; US cannot trump.
5. Pivotal events require the pre-action window to be active.
6. Each pivotal action is locked to its owning faction.
7. Pivotal action stubs must compile without errors even with empty effects arrays.

## Tests

1. **Compile test**: Compile production FITL spec and assert `turnFlow.pivotal` exists with 4 `actionIds`, `requirePreActionWindow: true`, `disallowWhenLookaheadIsCoup: true`, and `interrupt.precedence` of `['3', '1', '2', '0']`.
2. **Compile test — action stubs**: Assert 4 pivotal action profiles exist in compiled `GameDef` with correct `executor` faction bindings.
3. **Integration runtime — monsoon blocks pivotal**: Set up monsoon active, verify no pivotal actions appear in legal moves.
4. **Integration runtime — trumping**: Set up two factions attempting pivotal events, verify higher-precedence faction's event wins.
5. **Regression**: Existing FITL turn flow golden tests still pass.
