# FITL Playbook E2E Golden Suite Design

**Date**: 2026-02-24
**Status**: Approved

## Goal

Create a comprehensive E2E golden test suite that replays the Fire in the Lake tutorial playbook turn-by-turn, asserting exact state at every step. Turn 1 is the first deliverable; future turns will be added incrementally, each chaining from the previous turn's end state.

## Approach

**Pre-resolved Move Script** (matching Texas Hold'em golden vector pattern):
- Compile the full FITL production spec
- Engineer initial state with the playbook's exact 13-card mini-deck
- Replay a script of fully-resolved moves using `completeMoveDecisionSequenceOrThrow`
- Assert exact state after each move using concise assertion helpers

## File Location

```
packages/engine/test/e2e/fitl-playbook-golden.test.ts
```

Uses `node:test` runner. No external fixture files.

## Compilation and State Engineering

### Step 1: Compile production spec

```typescript
const { parsed, compiled } = compileProductionSpec();
assertNoErrors(parsed);
assertNoDiagnostics(compiled, parsed.sourceMap);
const def = assertValidatedGameDef(compiled.gameDef!);
```

### Step 2: Engineer the deck

Call `initialState(def, seed, 4)` with any seed, then replace `deck:none` with exactly the 13 playbook cards in order:

| Position | Card | ID |
|----------|------|----|
| 01 (top) | Burning Bonze | card-107 |
| 02 | Trucks | card-55 |
| 03 | Green Berets | card-68 |
| 04 | Gulf of Tonkin | card-1 |
| 05 | Brinks Hotel | card-97 |
| 06 | Henry Cabot Lodge | card-79 |
| 07 | Booby Traps | card-101 |
| 08 | Coup! Nguyen Khanh | card-125 |
| 09 | Sihanouk | card-75 |
| 10 | Claymores | card-17 |
| 11 | 301st Supply Bn | card-51 |
| 12 | Economic Aid | card-43 |
| 13 (bottom) | Colonel Chau | card-112 |

Remaining deck cards are removed (not used in the tutorial).

### Step 3: Advance to first decision point

```typescript
const ready = advanceToDecisionPoint(def, engineeredState);
```

## Initial State Assertions (Pre-Turn 1)

- Card lifecycle: Burning Bonze in `played:none`, Trucks in `lookahead:none`, 11 cards in `deck:none`
- All 4 factions eligible
- Active player: seat 3 (VC)
- Global vars: `aid`=15, `arvnResources`=30, `nvaResources`=10, `vcResources`=5, `patronage`=15, `trail`=1
- Saigon: `supportOpposition`=`passiveSupport`
- Saigon tokens: 2 US troops, 1 US base, 2 ARVN troops, 3 ARVN police

## Turn 1 Move Script

### Move 1: VC shaded event (Burning Bonze)

VC plays the shaded side of card-107:
- Effect: Saigon shifts 1 level toward Active Opposition (passiveSupport -> neutral)
- Effect: Aid -12

Assertions:
- Saigon `supportOpposition` = neutral (marker removed)
- `aid` = 3
- Active player -> NVA (seat 2)

### Move 2: NVA passes

Assertions:
- `nvaResources` = 11 (+1 insurgent pass reward)
- NVA remains eligible next turn
- Active player -> ARVN (seat 1)

### Move 3: ARVN Op & Special Activity (Train + Govern)

Compound move: `arvnOp` with `operationPlusSpecialActivity` action class.

**Train in Saigon:**
- Target: `saigon:none`
- Choice: `arvn-cubes`
- Places 6 ARVN troops from available
- Cost: 3 ARVN resources

**Pacify sub-action in Saigon:**
- 1 level toward support (neutral -> passiveSupport)
- Cost: 3 ARVN resources

**Govern in An Loc + Can Tho:**
- Both cities choose 'aid' mode
- Aid += 3 per city (population 1 x 3) = +6
- Minh leader bonus: Aid += 5

Assertions:
- `arvnResources` = 24 (30 - 3 train - 3 pacify)
- Saigon `supportOpposition` = `passiveSupport`
- Saigon: 8 ARVN troops (2 original + 6 placed), 3 ARVN police
- `aid` = 14 (3 + 6 govern + 5 Minh)

## End-of-Turn Assertions

- VC and ARVN -> Ineligible
- NVA and US -> Eligible
- Trucks becomes current card, Green Berets becomes preview
- 10 cards remain in deck

## Helper Functions

- `engineerPlaybookDeck(state, def)` - Reorders deck to playbook order
- `assertZoneTokenCount(state, zoneId, faction, type, expected)` - Token counting
- `assertMarkerState(state, spaceId, markerId, expected)` - Space marker check
- `assertGlobalVar(state, varName, expected)` - Global variable check
- `assertEligibility(state, seat, expected)` - Eligibility state check

## Extensibility

Structure: `describe('FITL playbook golden suite')` with nested `it()` per turn. Module-level state variable chains across tests. Future turns added as additional `it()` blocks.
