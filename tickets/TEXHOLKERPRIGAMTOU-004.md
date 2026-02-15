# TEXHOLKERPRIGAMTOU-004: GameSpecDoc — Metadata, Vocabulary, Data Assets & Terminal

**Status**: TODO
**Priority**: HIGH
**Effort**: Medium
**Dependencies**: TEXHOLKERPRIGAMTOU-001, -002, -003 (primitives must exist for the spec to reference them)
**Blocks**: TEXHOLKERPRIGAMTOU-005, TEXHOLKERPRIGAMTOU-006, TEXHOLKERPRIGAMTOU-007

## Summary

Create the Texas Hold 'Em GameSpecDoc directory and write the four "structural" files that define the game's metadata, vocabulary (zones, variables), data assets (card deck, tournament scenario), and terminal conditions. These files contain no game logic — only declarations.

## What to Change

### 1. Create directory

```
data/games/texas-holdem/
```

### 2. Write `00-metadata.md`

**File**: `data/games/texas-holdem/00-metadata.md` (new)

Contents per spec section 2.1:
- `metadata.id`: `texas-holdem-nlhe-tournament`
- `metadata.players.min`: 2, `metadata.players.max`: 10
- `metadata.defaultScenarioAssetId`: `tournament-standard`
- `metadata.maxTriggerDepth`: 5

### 3. Write `10-vocabulary.md`

**File**: `data/games/texas-holdem/10-vocabulary.md` (new)

**Zones** (per spec section 2.2):
| Zone ID | Owner | Visibility | Ordering | Purpose |
|---------|-------|------------|----------|---------|
| `deck` | none | hidden | stack | 52-card shuffled deck |
| `burn` | none | hidden | set | Burned cards |
| `community` | none | public | queue | Up to 5 shared cards |
| `hand` | player | owner | set | 2 private hole cards |
| `muck` | none | hidden | set | Folded/discarded cards |

**Per-player variables**: `chipStack`, `streetBet`, `totalBet`, `handActive`, `allIn`, `eliminated`, `seatIndex` — all with types, init values, min/max per spec.

**Global variables**: `pot`, `currentBet`, `lastRaiseSize`, `dealerSeat`, `smallBlind`, `bigBlind`, `ante`, `blindLevel`, `handsPlayed`, `handPhase`, `activePlayers`, `playersInHand`, `actingPosition`, `bettingClosed` — all with types, init values, min/max per spec.

### 4. Write `40-content-data-assets.md`

**File**: `data/games/texas-holdem/40-content-data-assets.md` (new)

**Standard 52-card deck** data asset (`id: standard-52-deck`, `kind: pieceCatalog`):
- Single piece type `card` with props: `rank` (int, 2-14), `suit` (int, 0-3), `rankName` (string), `suitName` (string)
- Inventory: 52 cards created in setup phase via `createToken`

**Tournament scenario** data asset (`id: tournament-standard`, `kind: scenario`):
- `startingChips`: 1000
- `blindSchedule`: 10 levels per spec section 2.5, each with `level`, `sb`, `bb`, `ante`, `handsUntilNext`

### 5. Write `90-terminal.md`

**File**: `data/games/texas-holdem/90-terminal.md` (new)

Terminal conditions per spec section 2.6:
- When `activePlayers == 1`, result is `win` for the sole non-eliminated player
- Scoring: `method: highest`, `value: chipStack`

## Files to Touch

| File | Change Type |
|------|-------------|
| `data/games/texas-holdem/00-metadata.md` | Create |
| `data/games/texas-holdem/10-vocabulary.md` | Create |
| `data/games/texas-holdem/40-content-data-assets.md` | Create |
| `data/games/texas-holdem/90-terminal.md` | Create |

## Out of Scope

- **DO NOT** write `20-macros.md` (that's TEXHOLKERPRIGAMTOU-005)
- **DO NOT** write `30-rules-actions.md` (that's TEXHOLKERPRIGAMTOU-006)
- **DO NOT** modify any `src/` files — this ticket is data-only
- **DO NOT** modify any existing game specs (FITL files)
- **DO NOT** modify test files
- **DO NOT** modify kernel types, schemas, or compiler code
- **DO NOT** add setup effects (deck creation, chip distribution) — those belong in macros/rules

## Acceptance Criteria

### Tests That Must Pass

1. **Regression**: `npm test` — all existing tests still pass (new data files should not break anything)
2. **Build**: `npm run build` succeeds (no source changes in this ticket)
3. **Manual verification**: Each file is valid Markdown with fenced YAML blocks that parse without YAML errors

### Invariants That Must Remain True

1. **Valid YAML**: All fenced YAML blocks parse under YAML 1.2 strict mode (no bare booleans, quoted strings where ambiguous)
2. **Consistent IDs**: Zone IDs, variable names, and data asset IDs match exactly what the macros (ticket -005) and rules (ticket -006) will reference
3. **No game logic**: These files contain only declarations — no `onEnter` effects, no action definitions, no macros
4. **Schema compliance**: Variable definitions must have valid `type`, `init`, `min`, `max` fields matching the `VariableDef` schema. Zone definitions must have valid `owner`, `visibility`, `ordering` fields matching the `ZoneDef` schema.
5. **Player-owned zones**: `hand` zone must have `owner: player` (one per player). All other zones have `owner: none`.
6. **Data asset format**: Piece catalog and scenario assets follow the existing `DataAssetEnvelope` pattern used by FITL
7. **Blind schedule**: 10 levels (0-9), monotonically increasing blind values, `handsUntilNext` >= 1
8. **Card deck**: Exactly 52 unique card definitions (13 ranks x 4 suits), rank range 2-14, suit range 0-3
