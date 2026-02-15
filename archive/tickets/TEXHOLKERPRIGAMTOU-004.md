# TEXHOLKERPRIGAMTOU-004: GameSpecDoc - Metadata, Vocabulary, Data Assets, Terminal (Schema-Aligned)

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Dependencies**: None
**Blocks**: TEXHOLKERPRIGAMTOU-005, TEXHOLKERPRIGAMTOU-006, TEXHOLKERPRIGAMTOU-007

## Why This Ticket Was Reassessed

The previous draft assumed kernel primitives and data-asset shapes that do not match the current codebase.

### Corrected assumptions

1. `reveal`, `evaluateSubset`, and `commitResource` already exist in `src/kernel` and are already covered by tests.
2. This ticket is **data + tests**, not data-only:
- We need at least one focused test to lock structural invariants for the new Texas Hold'em spec fragments.
3. Current schema contracts for data assets are stricter than the previous draft:
- `pieceCatalog` entries require `faction`, `statusDimensions`, `transitions`, and inventory entries with `total`.
- `scenario` payload requires `mapAssetId`, `pieceCatalogAssetId`, `scenarioName`, and `yearRange`.
4. `terminal.result.type: win` requires a concrete player selector; dynamic "sole non-eliminated player" selection is better represented as `type: score` with `terminal.scoring`.
5. `data/<game>/...` remains optional as a runtime input per repo rules, but is valid and useful as a canonical fixture and production-spec source.

## Summary

Create the Texas Hold'em GameSpecDoc directory and implement four structural files:
- metadata
- vocabulary
- data assets
- terminal

No macros/actions/rules in this ticket.

## What to Change

### 1. Create directory

```
data/games/texas-holdem/
```

### 2. Write `00-metadata.md`

**File**: `data/games/texas-holdem/00-metadata.md` (new)

Required values:
- `metadata.id`: `texas-holdem-nlhe-tournament`
- `metadata.players.min`: 2
- `metadata.players.max`: 10
- `metadata.defaultScenarioAssetId`: `tournament-standard`
- `metadata.maxTriggerDepth`: 5

### 3. Write `10-vocabulary.md`

**File**: `data/games/texas-holdem/10-vocabulary.md` (new)

Declare:
- Zones: `deck`, `burn`, `community`, `hand`, `muck`
- Per-player vars: `chipStack`, `streetBet`, `totalBet`, `handActive`, `allIn`, `eliminated`, `seatIndex`
- Global vars: `pot`, `currentBet`, `lastRaiseSize`, `dealerSeat`, `smallBlind`, `bigBlind`, `ante`, `blindLevel`, `handsPlayed`, `handPhase`, `activePlayers`, `playersInHand`, `actingPosition`, `bettingClosed`

Notes:
- Keep all values schema-valid for current `VariableDef` lowering.
- Do not encode action/macro logic here.

### 4. Write `40-content-data-assets.md`

**File**: `data/games/texas-holdem/40-content-data-assets.md` (new)

Declare these assets in a schema-valid way:

1. Minimal map asset (required by current scenario schema contract)
- `id: texas-holdem-table-map`
- `kind: map`
- Payload may be minimal but must satisfy map schema.

2. Standard deck catalog
- `id: standard-52-deck`
- `kind: pieceCatalog`
- Represent 52 unique cards as piece catalog data in a schema-valid way.

3. Tournament scenario
- `id: tournament-standard`
- `kind: scenario`
- Must include required scenario fields:
  - `mapAssetId: texas-holdem-table-map`
  - `pieceCatalogAssetId: standard-52-deck`
  - `scenarioName`
  - `yearRange`
- Include tournament payload metadata needed by later tickets (for example blind schedule/start stack fields).

### 5. Write `90-terminal.md`

**File**: `data/games/texas-holdem/90-terminal.md` (new)

Terminal declaration:
- End condition when `activePlayers == 1`
- Use `result.type: score`
- Provide `scoring.method: highest`, `scoring.value: chipStack` (per-player expression)

## Tests to Add / Modify

| File | Change Type |
|------|-------------|
| `test/unit/texas-holdem-spec-structure.test.ts` | Create |

Test should validate:
1. Texas Hold'em source directory loads and parses without parser diagnostics.
2. Metadata, zones, variables, data assets, and terminal sections are present.
3. Data assets include map + pieceCatalog + scenario with consistent ids.
4. Terminal condition/scoring structure matches this ticket's assumptions.

## Files to Touch

| File | Change Type |
|------|-------------|
| `data/games/texas-holdem/00-metadata.md` | Create |
| `data/games/texas-holdem/10-vocabulary.md` | Create |
| `data/games/texas-holdem/40-content-data-assets.md` | Create |
| `data/games/texas-holdem/90-terminal.md` | Create |
| `test/unit/texas-holdem-spec-structure.test.ts` | Create |

## Out of Scope

- Do not write `20-macros.md` (ticket -005)
- Do not write `30-rules-actions.md` (ticket -006)
- Do not modify kernel/compiler behavior in `src/`
- Do not modify FITL game data

## Acceptance Criteria

### Verification commands

1. `npm run build`
2. `npm run lint`
3. `npm test`

### Invariants

1. All fenced YAML parses under repo parser.
2. Section ids and variable names are consistent and deterministic.
3. Structural files contain declarations only (no action/macro/rule behavior).
4. New Texas Hold'em structural test passes and captures key schema assumptions.

## Architecture Note

The current schema requires `scenario.mapAssetId` even for non-map-centric games like poker. This ticket follows that contract using a minimal map asset. If we want cleaner long-term architecture, we should consider a future schema change that makes `mapAssetId` optional when a game does not use map spaces.

## Outcome

- Completion date: 2026-02-15
- Implemented:
  - Added a generic scenario extension surface: `ScenarioPayload.settings` in:
    - `src/kernel/types-events.ts`
    - `src/kernel/schemas-gamespec.ts`
  - Created structural Texas Hold'em GameSpecDoc fragments:
    - `data/games/texas-holdem/00-metadata.md`
    - `data/games/texas-holdem/10-vocabulary.md`
    - `data/games/texas-holdem/40-content-data-assets.md`
    - `data/games/texas-holdem/90-terminal.md`
  - Added structural test coverage:
    - `test/unit/texas-holdem-spec-structure.test.ts`
- Deviations from original plan:
  - Extended core schema/types to support generic scenario settings because strict scenario payload validation previously blocked game-specific tournament configuration (for example blind schedule) in a game-agnostic way.
  - Terminal declaration uses `result.type: score` plus scoring configuration instead of a dynamic `win` selector expression.
- Verification:
  - `npm run build` passed
  - `npm run test:unit -- --test-name-pattern=\"texas hold'em spec structure\"` passed
  - `npm test` passed
  - `npm run lint` passed
