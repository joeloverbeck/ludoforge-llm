# FITLRULES1-002: FITL Victory Conditions & Derived Values

**Status**: TODO
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Possibly — may need new ValueExpr node for population-weighted marker aggregation

## Problem

`90-terminal.md` has a stub terminal section (`1==2 → draw`) that never triggers. The engine supports full victory evaluation via `TerminalEvaluationDef` with `checkpoints`, `margins`, and `ranking` (see `src/kernel/terminal.ts`, `src/kernel/types-victory.ts`).

FITL victory (rules 1.9, 7.0) requires per-faction victory margins computed from piece counts, population-weighted marker totals, and global variables. These margins are checked during Coup Rounds for instant wins and used for final-Coup ranking.

This ticket also subsumes the "derived victory values" gap — Control (COIN and NVA) and Total Support/Opposition are not tracked. They don't need separate derived-value config; the victory margin formulas directly compute them using ValueExpr AST.

## Victory Formulas (Rules 1.9)

Each faction has a victory margin (higher = closer to winning):

| Faction | Margin Formula |
|---------|----------------|
| **US** | Total Support + Available US pieces (troops + bases in `available-US:none`) |
| **ARVN** | COIN Controlled Population + Patronage (`gvar: patronage`) |
| **NVA** | NVA Controlled Population + count(NVA Bases on map) |
| **VC** | Total Opposition + count(VC Bases on map) |

### Component Definitions

- **Total Support**: Sum of `population × 1` for each Province/City where `supportOpposition` marker is `passiveSupport` or `activeSupport`.
- **Total Opposition**: Sum of `population × 1` for each Province/City where `supportOpposition` marker is `passiveOpposition` or `activeOpposition`.
- **COIN Controlled Population**: Sum of `population` for each space where total COIN pieces (US + ARVN) exceed total Insurgent pieces (NVA + VC).
- **NVA Controlled Population**: Sum of `population` for each space where total NVA+VC pieces exceed total COIN pieces.

### Instant Win During Coup Round

Each faction wins instantly if their margin meets threshold. Per rules, the thresholds are faction-specific and depend on the scenario. For the standard "Full" scenario, typical thresholds might be derived from the scenario setup — these should be confirmed and encoded as `checkpoints` with `timing: duringCoup`.

### Final Coup Ranking

When the final Coup card is reached, margins are computed and the faction with the highest margin wins. If tied, the order is NVA > VC > ARVN > US (Insurgents favored).

## What to Change

**File**: `data/games/fire-in-the-lake/90-terminal.md`

Replace the stub with real victory conditions using the engine's `checkpoints`, `margins`, and `ranking` fields.

### Structure

```yaml
terminal:
  conditions: []
  checkpoints:
    - id: us-victory
      faction: US
      timing: duringCoup
      when:
        op: '>='
        left: <US margin ValueExpr>
        right: <US threshold>
    - id: arvn-victory
      faction: ARVN
      timing: duringCoup
      when:
        op: '>='
        left: <ARVN margin ValueExpr>
        right: <ARVN threshold>
    - id: nva-victory
      faction: NVA
      timing: duringCoup
      when:
        op: '>='
        left: <NVA margin ValueExpr>
        right: <NVA threshold>
    - id: vc-victory
      faction: VC
      timing: duringCoup
      when:
        op: '>='
        left: <VC margin ValueExpr>
        right: <VC threshold>
    - id: final-coup-ranking
      faction: NVA  # default winner if margins tied
      timing: finalCoup
      when: <is-final-coup condition>
  margins:
    - faction: US
      value: <US margin ValueExpr>
    - faction: ARVN
      value: <ARVN margin ValueExpr>
    - faction: NVA
      value: <NVA margin ValueExpr>
    - faction: VC
      value: <VC margin ValueExpr>
  ranking:
    order: desc
```

### Key Implementation Challenge

The victory formulas require **population-weighted marker aggregation** — e.g., "sum of population for spaces where `supportOpposition` is `activeSupport` or `passiveSupport`". This is a cross-zone aggregate that filters by marker state and sums a zone property.

**Before implementing**, verify whether the existing `ValueExpr` / `OptionsQuery` system can express this. Relevant types:
- `aggregate` with `op: sum` or `op: count` — check if it supports zone-property aggregation
- `tokensInMapSpaces` query — only counts tokens, not zone properties
- `mapSpaces` query with filter — may allow iterating spaces but needs property extraction

If the existing AST cannot express population-weighted marker totals, a new `ValueExpr` node type may be needed (e.g., `{ aggregateOverSpaces: { filter: ..., property: 'population', op: 'sum' } }`). This would require kernel changes in `src/kernel/eval-value.ts`.

## Invariants

1. Victory checkpoints must only trigger during Coup Rounds (not during normal turns).
2. Each faction's margin formula must match the rules exactly.
3. Instant-win detection order must follow faction priority (per card-driven eligibility).
4. Final Coup ranking must use margins with NVA > VC > ARVN > US tiebreaker.
5. The stub `1==2` condition must be removed entirely.

## Tests

1. **Unit test**: Compile production spec, verify `terminal.checkpoints` has 5 entries (4 faction wins + 1 final Coup).
2. **Unit test**: Compile production spec, verify `terminal.margins` has 4 entries with correct faction names.
3. **Integration test**: Set up a game state where US margin meets threshold → `terminalResult()` returns `{ type: 'win', player: 0 }`.
4. **Integration test**: Set up a game state for final Coup → `terminalResult()` returns ranking with correct order.
5. **Integration test**: Normal turn (not Coup Round) → `terminalResult()` returns `null` (no early termination).
6. **Validation test**: Verify initial game state does NOT trigger any instant-win checkpoint.
