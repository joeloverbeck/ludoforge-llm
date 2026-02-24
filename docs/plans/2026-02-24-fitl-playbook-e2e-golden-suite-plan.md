# FITL Playbook E2E Golden Suite — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create an E2E test that replays FITL tutorial playbook Turn 1 with exact state assertions at every step.

**Architecture:** Compile production FITL spec, engineer the deck to match the playbook's 13-card mini-deck, replay a pre-resolved move script (VC event, NVA pass, ARVN compound op) and assert exact state after each move. Pattern follows Texas Hold'em golden vector (`packages/engine/test/e2e/texas-holdem-golden-vector.test.ts`).

**Tech Stack:** TypeScript, `node:test` runner, kernel APIs (`initialState`, `applyMove`, `legalMoves`, `advanceToDecisionPoint`, `resolveMoveDecisionSequence`), production spec compilation via `compileProductionSpec()`.

**Key references:**
- Design doc: `docs/plans/2026-02-24-fitl-playbook-e2e-golden-suite-design.md`
- Playbook source: `reports/fire-in-the-lake-playbook-turn-1.md`
- Texas Hold'em pattern: `packages/engine/test/e2e/texas-holdem-golden-vector.test.ts`
- Production helpers: `packages/engine/test/helpers/production-spec-helpers.ts`
- Move decision helpers: `packages/engine/test/helpers/move-decision-helpers.ts`
- Turn order helpers: `packages/engine/test/helpers/turn-order-helpers.ts`
- Replay harness: `packages/engine/test/helpers/replay-harness.ts`
- FITL game data: `data/games/fire-in-the-lake/`

---

## Task 1: Create test file scaffold with compilation and initial state assertions

**Files:**
- Create: `packages/engine/test/e2e/fitl-playbook-golden.test.ts`

**Step 1: Write the initial test scaffold**

Create the test file with imports, compilation, deck engineering helper, assertion helpers, and initial state assertions. This establishes all the shared infrastructure that every turn will use.

```typescript
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  asActionId,
  assertValidatedGameDef,
  initialState,
  legalMoves,
  type GameState,
  type Move,
  type Token,
  type ValidatedGameDef,
} from '../../src/kernel/index.js';
import { advanceToDecisionPoint } from '../../src/kernel/phase-advance.js';
import { assertNoDiagnostics, assertNoErrors } from '../helpers/diagnostic-helpers.js';
import {
  completeMoveDecisionSequenceOrThrow,
  pickDeterministicDecisionValue,
} from '../helpers/move-decision-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
import { requireCardDrivenRuntime } from '../helpers/turn-order-helpers.js';

// ---------------------------------------------------------------------------
// Playbook deck order (top to bottom)
// ---------------------------------------------------------------------------

const PLAYBOOK_DECK_IDS: readonly string[] = [
  'card-107', // 01 Burning Bonze
  'card-55',  // 02 Trucks
  'card-68',  // 03 Green Berets
  'card-1',   // 04 Gulf of Tonkin
  'card-97',  // 05 Brinks Hotel
  'card-79',  // 06 Henry Cabot Lodge
  'card-101', // 07 Booby Traps
  'card-125', // 08 Coup! Nguyen Khanh
  'card-75',  // 09 Sihanouk
  'card-17',  // 10 Claymores
  'card-51',  // 11 301st Supply Bn
  'card-43',  // 12 Economic Aid
  'card-112', // 13 Colonel Chau
];

// ---------------------------------------------------------------------------
// Compilation
// ---------------------------------------------------------------------------

const compileFitlDef = (): ValidatedGameDef => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assertNoDiagnostics(compiled, parsed.sourceMap);
  if (compiled.gameDef === null) {
    throw new Error('Expected compiled FITL gameDef to be present');
  }
  return assertValidatedGameDef(compiled.gameDef);
};

// ---------------------------------------------------------------------------
// Deck engineering — reorder deck:none to match the playbook mini-deck
// ---------------------------------------------------------------------------

const engineerPlaybookDeck = (state: GameState): GameState => {
  const deckTokens = state.zones['deck:none'] ?? [];
  const tokenById = new Map<string, Token>();
  for (const token of deckTokens) {
    tokenById.set(String(token.id), token);
  }

  const orderedDeck: Token[] = [];
  for (const cardId of PLAYBOOK_DECK_IDS) {
    const token = tokenById.get(cardId);
    if (token === undefined) {
      throw new Error(`Playbook card ${cardId} not found in deck:none`);
    }
    orderedDeck.push(token);
  }

  return {
    ...state,
    zones: {
      ...state.zones,
      'deck:none': orderedDeck,
    },
  };
};

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------

const assertGlobalVar = (state: GameState, varName: string, expected: number, label: string): void => {
  assert.equal(
    Number(state.globalVars[varName]),
    expected,
    `${label}: expected ${varName}=${expected}, got ${Number(state.globalVars[varName])}`,
  );
};

const countTokensInZone = (
  state: GameState,
  zoneId: string,
  faction: string,
  type: string,
): number =>
  (state.zones[zoneId] ?? []).filter(
    (token) => String(token.props.faction) === faction && String(token.props.type) === type,
  ).length;

const assertZoneTokenCount = (
  state: GameState,
  zoneId: string,
  faction: string,
  type: string,
  expected: number,
  label: string,
): void => {
  const actual = countTokensInZone(state, zoneId, faction, type);
  assert.equal(actual, expected, `${label}: expected ${faction} ${type} in ${zoneId} = ${expected}, got ${actual}`);
};

const assertMarkerState = (
  state: GameState,
  spaceId: string,
  markerId: string,
  expected: string | undefined,
  label: string,
): void => {
  const actual = state.markers[spaceId]?.[markerId];
  assert.equal(actual, expected, `${label}: expected ${markerId} at ${spaceId} = ${String(expected)}, got ${String(actual)}`);
};

const assertEligibility = (state: GameState, seat: string, expected: boolean, label: string): void => {
  const runtime = requireCardDrivenRuntime(state);
  const actual = runtime.eligibility[seat];
  assert.equal(actual, expected, `${label}: expected seat ${seat} eligibility=${expected}, got ${actual}`);
};

const assertActivePlayer = (state: GameState, expected: number, label: string): void => {
  assert.equal(Number(state.activePlayer), expected, `${label}: expected activePlayer=${expected}, got ${Number(state.activePlayer)}`);
};

const zoneCount = (state: GameState, zoneId: string): number =>
  (state.zones[zoneId] ?? []).length;

const zoneHasCard = (state: GameState, zoneId: string, cardId: string): boolean =>
  (state.zones[zoneId] ?? []).some((token) => String(token.id) === cardId);

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('FITL playbook golden suite', () => {
  const def = compileFitlDef();
  const raw = initialState(def, 42, 4).state;
  const engineered = engineerPlaybookDeck(raw);
  let state = advanceToDecisionPoint(def, engineered);

  it('initial state matches Full Game 1964 setup with playbook deck', () => {
    // Card lifecycle: Burning Bonze current, Trucks preview
    assert.ok(zoneHasCard(state, 'played:none', 'card-107'), 'Burning Bonze should be in played:none');
    assert.ok(zoneHasCard(state, 'lookahead:none', 'card-55'), 'Trucks should be in lookahead:none');
    assert.equal(zoneCount(state, 'deck:none'), 11, 'deck should have 11 remaining cards');

    // All factions eligible
    assertEligibility(state, '0', true, 'setup US');
    assertEligibility(state, '1', true, 'setup ARVN');
    assertEligibility(state, '2', true, 'setup NVA');
    assertEligibility(state, '3', true, 'setup VC');

    // Active player is VC (seat 3) — first in Burning Bonze seat order
    assertActivePlayer(state, 3, 'setup');

    // Global variables
    assertGlobalVar(state, 'aid', 15, 'setup');
    assertGlobalVar(state, 'arvnResources', 30, 'setup');
    assertGlobalVar(state, 'nvaResources', 10, 'setup');
    assertGlobalVar(state, 'vcResources', 5, 'setup');
    assertGlobalVar(state, 'patronage', 15, 'setup');
    assertGlobalVar(state, 'trail', 1, 'setup');

    // Saigon setup
    assertMarkerState(state, 'saigon:none', 'supportOpposition', 'passiveSupport', 'setup Saigon');
    assertZoneTokenCount(state, 'saigon:none', 'US', 'troops', 2, 'setup Saigon');
    assertZoneTokenCount(state, 'saigon:none', 'US', 'base', 1, 'setup Saigon');
    assertZoneTokenCount(state, 'saigon:none', 'ARVN', 'troops', 2, 'setup Saigon');
    assertZoneTokenCount(state, 'saigon:none', 'ARVN', 'police', 3, 'setup Saigon');
  });

  // Turn 1 tests will follow here (Tasks 2-4)
});
```

Important notes for the implementor:
- The test uses `node:test` (NOT Vitest or Jest). Engine tests always use `node:test`.
- `compileProductionSpec()` compiles from `data/games/fire-in-the-lake/` — never create separate fixture files for FITL.
- `state.markers[spaceId][markerId]` is how space markers are stored. The `supportOpposition` marker uses the lattice states: `activeSupport`, `passiveSupport`, `passiveOpposition`, `activeOpposition`. Neutral has no entry (undefined or the lattice default).
- `requireCardDrivenRuntime(state).eligibility` is a `Record<string, boolean>` — seats `'0'`=US, `'1'`=ARVN, `'2'`=NVA, `'3'`=VC.
- The `assertValidatedGameDef` is imported from `../../src/kernel/index.js`, NOT from a test helper.
- Token `id` (e.g. `'card-107'`) is a `TokenId` branded type. `String(token.id)` extracts the string value.
- `initialState` auto-runs setup effects (scenario placement, deck shuffle). We override the deck after setup to get our playbook order.
- `advanceToDecisionPoint` draws the first card and reveals the preview, leaving the engine ready for the first player's decision.

**Step 2: Build and run the test to verify it passes**

Run:
```bash
pnpm turbo build && node --test packages/engine/dist/test/e2e/fitl-playbook-golden.test.js
```

Expected: The `initial state matches Full Game 1964 setup with playbook deck` test passes. If the marker for neutral Saigon is not `undefined` but a specific string like `'neutral'`, adjust the assertion — check `state.markers['saigon:none']?.supportOpposition` to see the actual value and update accordingly.

**Step 3: Commit**

```bash
git add packages/engine/test/e2e/fitl-playbook-golden.test.ts
git commit -m "test: scaffold FITL playbook E2E golden suite with initial state assertions"
```

---

## Task 2: Implement Turn 1 Move 1 — VC shaded event (Burning Bonze)

**Files:**
- Modify: `packages/engine/test/e2e/fitl-playbook-golden.test.ts`

**Step 1: Add the Turn 1 Move 1 test**

Inside the `describe('FITL playbook golden suite')` block, after the initial state test, add:

```typescript
  it('turn 1 move 1: VC executes shaded Burning Bonze event', () => {
    // VC (seat 3) plays the shaded side of card-107 (Burning Bonze)
    // Shaded: "Shift Saigon 1 level toward Active Opposition. Aid -12."
    const eventTemplate: Move = {
      actionId: asActionId('event'),
      params: { eventCardId: 'card-107', side: 'shaded' },
    };

    // Resolve all decision prompts for this event
    const resolvedMove = completeMoveDecisionSequenceOrThrow(
      eventTemplate,
      def,
      state,
      (request) => pickDeterministicDecisionValue(request),
      'VC Burning Bonze shaded event',
    );

    state = applyMove(def, state, resolvedMove).state;

    // Saigon shifts from passiveSupport toward opposition → becomes neutral
    // The marker lattice default for supportOpposition should represent neutral.
    // Check what the actual default/neutral value is:
    const saigonSupport = state.markers['saigon:none']?.supportOpposition;
    // Neutral means no support/opposition — could be 'neutral' or undefined depending on lattice config.
    // The playbook says "marker's removal because absence indicates Neutral".
    // In our engine, the lattice has explicit states. Check the lattice definition in vocabulary:
    // The lattice for supportOpposition likely has a default state that represents neutral.
    // Assert whatever the engine produces — the key fact is it's NOT passiveSupport anymore.
    assert.notEqual(saigonSupport, 'passiveSupport', 'Saigon should no longer be passiveSupport');
    assert.notEqual(saigonSupport, 'activeSupport', 'Saigon should not be activeSupport');

    // Aid drops from 15 to 3
    assertGlobalVar(state, 'aid', 3, 'after VC event');

    // Active player shifts to NVA (seat 2)
    assertActivePlayer(state, 2, 'after VC event');
  });
```

Important notes for the implementor:
- `applyMove` with default options auto-advances to the next decision point. No need to call `advanceToDecisionPoint` separately.
- The `event` action requires `eventCardId` and `side` params — these are the standard event action params defined in the FITL rules.
- The `completeMoveDecisionSequenceOrThrow` resolves any additional choices the event might present (e.g., branch selection). Burning Bonze shaded has no branches — it's a flat effect list (`shiftMarker` + `addVar`). The deterministic picker should suffice.
- Check the actual neutral marker value by inspecting the state. The `supportOpposition` space marker lattice in `10-vocabulary.md` defines the states. Look for the default state. If it's something like `'neutral'`, update the assertion to `assert.equal(saigonSupport, 'neutral', ...)`.

**Step 2: Build and run the test**

Run:
```bash
pnpm turbo build && node --test packages/engine/dist/test/e2e/fitl-playbook-golden.test.js
```

Expected: Both tests pass. If the neutral marker assertion fails, read the actual value from the error message and fix the assertion.

**Step 3: Refine the neutral marker assertion**

Once you see what value the engine uses for neutral Saigon, replace the `notEqual` assertions with an exact `assertMarkerState` call. For example, if neutral is `'neutral'`:

```typescript
assertMarkerState(state, 'saigon:none', 'supportOpposition', 'neutral', 'after VC event');
```

**Step 4: Build and run again to confirm**

```bash
pnpm turbo build && node --test packages/engine/dist/test/e2e/fitl-playbook-golden.test.js
```

Expected: All tests pass.

**Step 5: Commit**

```bash
git add packages/engine/test/e2e/fitl-playbook-golden.test.ts
git commit -m "test: add Turn 1 Move 1 — VC Burning Bonze shaded event"
```

---

## Task 3: Implement Turn 1 Move 2 — NVA passes

**Files:**
- Modify: `packages/engine/test/e2e/fitl-playbook-golden.test.ts`

**Step 1: Add the NVA pass test**

After the VC event test, add:

```typescript
  it('turn 1 move 2: NVA passes (+1 resource)', () => {
    // NVA (seat 2) decides to pass.
    // Insurgent pass reward: +1 NVA resource (rule 2.3.3)
    const passMove: Move = { actionId: asActionId('pass'), params: {} };
    state = applyMove(def, state, passMove).state;

    // NVA resources increase from 10 to 11
    assertGlobalVar(state, 'nvaResources', 11, 'after NVA pass');

    // Active player shifts to ARVN (seat 1) — next eligible faction
    assertActivePlayer(state, 1, 'after NVA pass');
  });
```

Important notes for the implementor:
- The `pass` action has no params and no decision sequence — it's a simple action.
- Pass rewards are defined in the turn flow config: seat `'2'` (NVA) gets `nvaResources` +1.
- After NVA passes, ARVN (seat 1) becomes active as the 2nd eligible faction.
- NVA passed, so NVA remains eligible next turn (unlike acting factions who become ineligible).

**Step 2: Build and run**

```bash
pnpm turbo build && node --test packages/engine/dist/test/e2e/fitl-playbook-golden.test.js
```

Expected: All three tests pass.

**Step 3: Commit**

```bash
git add packages/engine/test/e2e/fitl-playbook-golden.test.ts
git commit -m "test: add Turn 1 Move 2 — NVA pass"
```

---

## Task 4: Implement Turn 1 Move 3 — ARVN Op & Special Activity (Train + Govern)

**Files:**
- Modify: `packages/engine/test/e2e/fitl-playbook-golden.test.ts`

**Step 1: Discover the exact move structure**

Before writing the final test, we need to discover how the ARVN compound move (Train + Govern) is represented. This is the most complex move in Turn 1 because it involves:
1. Choosing `arvnOp` as the action
2. The `operationPlusSpecialActivity` action class
3. Train with choices: target Saigon, choose ARVN cubes, place 6, pacify 1 level
4. Govern with choices: target An Loc + Can Tho, both in 'aid' mode

Add a **diagnostic section** that enumerates legal moves for ARVN and logs the structure:

```typescript
  it('turn 1 move 3: ARVN Train in Saigon + Govern in An Loc & Can Tho', () => {
    // First, enumerate legal moves to understand the move structure
    const legal = legalMoves(def, state);
    const arvnOpMoves = legal.filter((m) => String(m.actionId) === 'arvnOp');

    // The ARVN should have arvnOp available with operationPlusSpecialActivity class
    assert.ok(arvnOpMoves.length > 0, 'ARVN should have arvnOp legal moves');

    // Find the template move for arvnOp
    const template = arvnOpMoves[0]!;

    // Build the compound move: arvnOp (Train) + govern (Special Activity)
    // First resolve the govern (special activity) move
    const governTemplate: Move = {
      actionId: asActionId('govern'),
      params: {},
    };

    const resolvedGovern = completeMoveDecisionSequenceOrThrow(
      governTemplate,
      def,
      state,
      (request) => {
        // Select An Loc and Can Tho as govern spaces
        if (request.name === 'targetSpaces') return ['an-loc:none', 'can-tho:none'];
        // Both spaces choose 'aid' mode
        if (request.name?.startsWith('$governMode@')) return 'aid';
        return pickDeterministicDecisionValue(request);
      },
      'ARVN govern',
    );

    // Now build the compound arvnOp move with train choices + govern as special activity
    const compoundMove = completeMoveDecisionSequenceOrThrow(
      {
        ...template,
        actionClass: 'operationPlusSpecialActivity',
        compound: {
          specialActivity: resolvedGovern,
          timing: 'after',
        },
      },
      def,
      state,
      (request) => {
        // Train: select Saigon
        if (request.name === 'targetSpaces') return ['saigon:none'];
        // Train: choose ARVN cubes (not rangers)
        if (request.name === '$trainChoice') return 'arvn-cubes';
        // Sub-action: select Saigon for pacify
        if (request.name === '$subActionSpaces') return ['saigon:none'];
        // Sub-action: choose pacify
        if (request.name === '$subAction') return 'pacify';
        // Pacify: 1 level
        if (request.name === '$pacLevels') return 1;
        return pickDeterministicDecisionValue(request);
      },
      'ARVN Train in Saigon',
    );

    state = applyMove(def, state, compoundMove).state;

    // ARVN resources: 30 - 3 (train) - 3 (pacify) = 24
    assertGlobalVar(state, 'arvnResources', 24, 'after ARVN op');

    // Saigon shifts from neutral to passiveSupport (pacified)
    assertMarkerState(state, 'saigon:none', 'supportOpposition', 'passiveSupport', 'after ARVN pacify');

    // Saigon now has 8 ARVN troops (2 original + 6 placed) and 3 ARVN police
    assertZoneTokenCount(state, 'saigon:none', 'ARVN', 'troops', 8, 'after ARVN train');
    assertZoneTokenCount(state, 'saigon:none', 'ARVN', 'police', 3, 'after ARVN train');
    // US pieces unchanged
    assertZoneTokenCount(state, 'saigon:none', 'US', 'troops', 2, 'after ARVN train');
    assertZoneTokenCount(state, 'saigon:none', 'US', 'base', 1, 'after ARVN train');

    // Aid: 3 + 6 (govern: 2 cities x pop 1 x 3) + 5 (Minh leader bonus) = 14
    assertGlobalVar(state, 'aid', 14, 'after ARVN govern');

    // Patronage unchanged (govern chose 'aid' mode, not 'patronage' mode)
    assertGlobalVar(state, 'patronage', 15, 'after ARVN op');
  });
```

Important notes for the implementor:
- **This is the hardest task.** The compound move structure may not match the above exactly. Key debugging approach:
  1. First, enumerate `legalMoves(def, state)` and log all moves to understand what's available.
  2. Check if `arvnOp` is the right actionId or if the engine uses `train` directly with an actionClass.
  3. The compound move payload structure (`compound.specialActivity`, `compound.timing`) is defined in `types-core.ts:517-520`. The govern move must be a fully-resolved `Move` object.
  4. If `completeMoveDecisionSequenceOrThrow` fails, read the error message — it tells you which choice name (`request.name`) it's stuck on and what options are available. Use that to fix the decision callback.
- **Choice name discovery**: If choice names differ from what's shown above (e.g., `$trainChoice` vs `trainChoice`), the error from `completeMoveDecisionSequenceOrThrow` will say `choice="actualName"` — use that value.
- **Piece placement**: The engine places from `available-ARVN:none`. After placing 6 ARVN troops into Saigon, the available zone should have 6 fewer ARVN troops.
- **Minh leader bonus**: The `train-arvn-profile` has a final stage `rvn-leader-minh-aid-bonus` that adds +5 aid when `activeLeader` marker is `minh`. This fires automatically as part of the train action pipeline.
- **Govern disjointness**: The `govern-profile` has `compoundParamConstraints` requiring `targetSpaces` to be disjoint between the operation and special activity. Since Train targets Saigon and Govern targets An Loc + Can Tho, this constraint is satisfied.
- If the compound approach doesn't work (some engines model this differently), try executing `arvnOp` first (with train decisions), then check if govern appears as a separate legal move afterward. The option matrix allows Op & Special Activity to be sequential.

**Step 2: Build and run**

```bash
pnpm turbo build && node --test packages/engine/dist/test/e2e/fitl-playbook-golden.test.js
```

Expected: If the move structure is correct, all four tests pass. If not, iterate on the move construction based on error messages.

**Step 3: Commit**

```bash
git add packages/engine/test/e2e/fitl-playbook-golden.test.ts
git commit -m "test: add Turn 1 Move 3 — ARVN Train in Saigon + Govern"
```

---

## Task 5: Implement Turn 1 end-of-turn assertions

**Files:**
- Modify: `packages/engine/test/e2e/fitl-playbook-golden.test.ts`

**Step 1: Add end-of-turn state assertions**

After the ARVN move test, add:

```typescript
  it('turn 1 end: eligibility, card advancement, and turn-end bookkeeping', () => {
    // After two factions acted (VC 1st, ARVN 2nd), the turn ends (rule 2.3.6).
    // US did nothing (not even pass) — eligibility token stays in place.
    // VC and ARVN → Ineligible; NVA (passed) and US → Eligible.
    const runtime = requireCardDrivenRuntime(state);

    // Eligibility
    assertEligibility(state, '0', true, 'turn end US');     // US: eligible (didn't act)
    assertEligibility(state, '1', false, 'turn end ARVN');   // ARVN: ineligible (acted as 2nd)
    assertEligibility(state, '2', true, 'turn end NVA');     // NVA: eligible (passed → returns to eligible)
    assertEligibility(state, '3', false, 'turn end VC');     // VC: ineligible (acted as 1st)

    // Card lifecycle: Trucks (card-55) is now current, Green Berets (card-68) is preview
    assert.ok(zoneHasCard(state, 'played:none', 'card-55'), 'Trucks should be current card');
    assert.ok(zoneHasCard(state, 'lookahead:none', 'card-68'), 'Green Berets should be preview');
    assert.equal(zoneCount(state, 'deck:none'), 10, 'deck should have 10 remaining cards');

    // Burning Bonze should be under Trucks in played:none
    assert.ok(zoneHasCard(state, 'played:none', 'card-107'), 'Burning Bonze should still be in played');

    // Global state should be consistent
    assertGlobalVar(state, 'aid', 14, 'turn end');
    assertGlobalVar(state, 'arvnResources', 24, 'turn end');
    assertGlobalVar(state, 'nvaResources', 11, 'turn end');
    assertGlobalVar(state, 'vcResources', 5, 'turn end');
    assertGlobalVar(state, 'patronage', 15, 'turn end');
  });
```

Important notes for the implementor:
- After `applyMove` for the ARVN op (with default `advanceToDecisionPoint: true`), the engine should have already advanced through the turn-end boundary, drawn the next card, and prepared for Turn 2.
- If the state after ARVN's move is still in Turn 1 (i.e., Burning Bonze is still the current card), it means the turn hasn't ended yet. The engine may be waiting for the US to explicitly do something. Check if there's a legal `pass` or if the turn auto-ends. In the playbook, "The US can do nothing (not even Pass), so their Eligibility token remains in place." If the engine requires all 4 seats to pass through, there may be an extra auto-advance step.
- If the turn hasn't advanced, you may need to check `legalMoves(def, state)` — if it returns moves for US (seat 0), the engine expects US to act even though the playbook says they can't. This would be a design question to raise with the user.
- The card-driven turn flow should auto-end the turn after 2 factions have acted (1st eligible + 2nd eligible = turn over per rule 2.3.6).

**Step 2: Build and run**

```bash
pnpm turbo build && node --test packages/engine/dist/test/e2e/fitl-playbook-golden.test.js
```

Expected: All five tests pass.

**Step 3: Commit**

```bash
git add packages/engine/test/e2e/fitl-playbook-golden.test.ts
git commit -m "test: add Turn 1 end-of-turn assertions (eligibility, cards, vars)"
```

---

## Task 6: Final verification and cleanup

**Files:**
- Modify: `packages/engine/test/e2e/fitl-playbook-golden.test.ts` (if needed)

**Step 1: Run the full E2E test suite**

```bash
pnpm turbo build && pnpm -F @ludoforge/engine test:e2e
```

Expected: All existing E2E tests (Texas Hold'em + FITL playbook) pass.

**Step 2: Run typecheck and lint**

```bash
pnpm turbo typecheck && pnpm turbo lint
```

Expected: No errors.

**Step 3: Run the full test suite**

```bash
pnpm turbo test --force
```

Expected: All tests pass. No regressions.

**Step 4: Final commit if any cleanup was needed**

```bash
git add packages/engine/test/e2e/fitl-playbook-golden.test.ts
git commit -m "test: finalize FITL playbook E2E golden suite Turn 1"
```

---

## Key Risks and Mitigations

1. **Neutral marker representation**: The engine's `supportOpposition` lattice may use `'neutral'` or undefined for neutral spaces. Task 2 handles this by inspecting the actual value first.

2. **Compound move structure**: The ARVN Train+Govern compound move is the riskiest part. If the compound payload doesn't work as expected, the implementor should enumerate legal moves and inspect the structure. The `CompoundMovePayload` interface in `types-core.ts:517-520` defines the contract.

3. **Turn auto-ending**: The card-driven turn flow should auto-end after 2 factions act. If it doesn't, the implementor needs to check whether the engine expects remaining factions to explicitly pass.

4. **Decision choice names**: The choice callback parameter names (`$trainChoice`, `$subActionSpaces`, etc.) come from the `bind` property in the YAML rule definitions at `data/games/fire-in-the-lake/30-rules-actions.md`. The error message from `completeMoveDecisionSequenceOrThrow` reveals the actual names if they differ.

5. **ARVN troop availability**: The full game setup places various ARVN troops on the map. After placing 6 in Saigon from available, verify there are enough ARVN troops in `available-ARVN:none`. The catalog defines 30 ARVN troops total, minus those already placed in the scenario.
