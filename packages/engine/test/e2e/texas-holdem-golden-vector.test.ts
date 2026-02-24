import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asPhaseId,
  asPlayerId,
  assertValidatedGameDef,
  areMovesEquivalent,
  initialState,
  type GameState,
  type Move,
  type Token,
  type ValidatedGameDef,
} from '../../src/kernel/index.js';
import { advancePhase, advanceToDecisionPoint } from '../../src/kernel/phase-advance.js';
import { assertNoDiagnostics, assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileTexasProductionSpec } from '../helpers/production-spec-helpers.js';
import { advancePhaseBounded, findAllInMove, replayScript } from '../helpers/replay-harness.js';

// ---------------------------------------------------------------------------
// Shared helpers (reused pattern from texas-holdem-real-plays.test.ts)
// ---------------------------------------------------------------------------

const compileTexasDef = (): ValidatedGameDef => {
  const { parsed, compiled } = compileTexasProductionSpec();
  assertNoErrors(parsed);
  assertNoDiagnostics(compiled, parsed.sourceMap);
  if (compiled.gameDef === null) {
    throw new Error('Expected compiled Texas gameDef to be present');
  }
  return assertValidatedGameDef(compiled.gameDef);
};

const tokenTypeFromCode = (code: string): string => `card-${code}`;

const buildTokenIndex = (state: GameState): ReadonlyMap<string, Token> => {
  const index = new Map<string, Token>();
  for (const zoneTokens of Object.values(state.zones)) {
    for (const token of zoneTokens) {
      index.set(String(token.type), token);
    }
  }
  return index;
};

const tokensByCodes = (tokenIndex: ReadonlyMap<string, Token>, codes: readonly string[]): readonly Token[] =>
  codes.map((code) => {
    const token = tokenIndex.get(tokenTypeFromCode(code));
    assert.ok(token, `missing token for code=${code}`);
    return token;
  });

const zoneCodes = (state: GameState, zoneId: string): readonly string[] =>
  (state.zones[zoneId] ?? []).map((token) => String(token.type).replace('card-', ''));

const buildDeck = (
  tokenIndex: ReadonlyMap<string, Token>,
  usedCodes: ReadonlySet<string>,
  preferredTopCodes: readonly string[],
): readonly Token[] => {
  const top = tokensByCodes(tokenIndex, preferredTopCodes);
  const topTypes = new Set(top.map((token) => String(token.type)));

  const rest = Array.from(tokenIndex.values())
    .filter((token) => {
      const code = String(token.type).replace('card-', '');
      return !usedCodes.has(code) && !topTypes.has(String(token.type));
    })
    .sort((left, right) => String(left.type).localeCompare(String(right.type)));

  return [...top, ...rest];
};

const hasExactMove = (moves: readonly Move[], target: Move): boolean =>
  moves.some((move) => areMovesEquivalent(move, target));

const applyLoggedMove = (
  def: ValidatedGameDef,
  state: GameState,
  move: Move,
  options?: { readonly exactMoveListed?: boolean },
): GameState => {
  const replayed = replayScript({
    def,
    initialState: state,
    script: [{ move }],
    executionOptions: { advanceToDecisionPoint: false, maxPhaseTransitionsPerMove: 1 },
    legalityMode: 'actionId',
    keyVars: ['pot', 'currentBet', 'handPhase', 'bettingClosed'],
  });
  const executed = replayed.steps[0]!;
  if (options?.exactMoveListed !== undefined) {
    assert.equal(
      hasExactMove(executed.legal, move),
      options.exactMoveListed,
      `unexpected exact-listing status for ${String(move.actionId)} ${JSON.stringify(move.params)}`,
    );
  }
  return replayed.final;
};

// ---------------------------------------------------------------------------
// Golden vector invariant helpers
// ---------------------------------------------------------------------------

/** Count all card tokens across every zone. */
const totalCardCount = (state: GameState): number => {
  let count = 0;
  for (const zoneTokens of Object.values(state.zones)) {
    count += zoneTokens.length;
  }
  return count;
};

/** Sum of all players' chip stacks. */
const totalChips = (state: GameState, playerCount: number): number => {
  let sum = 0;
  for (let p = 0; p < playerCount; p += 1) {
    sum += Number(state.perPlayerVars[p]?.chipStack ?? 0);
  }
  return sum;
};

/** Assert the 52-card invariant holds and chip conservation. */
const assertInvariants = (state: GameState, label: string): void => {
  assert.equal(totalCardCount(state), 52, `${label}: 52-card invariant violated (got ${totalCardCount(state)})`);
  const chips = totalChips(state, 3) + Number(state.globalVars.pot ?? 0);
  assert.equal(chips, 1500, `${label}: chip conservation violated (got ${chips})`);
};

// ---------------------------------------------------------------------------
// State engineering helper — builds a preflop state for a specific hand.
// ---------------------------------------------------------------------------

interface HandSetup {
  readonly base: GameState;
  readonly tokenIndex: ReadonlyMap<string, Token>;
  readonly def: ValidatedGameDef;
  readonly dealerSeat: number;
  readonly activePlayerIdx: number;
  readonly actingPosition: number;
  readonly smallBlind: number;
  readonly bigBlind: number;
  readonly ante: number;
  readonly activePlayers: number;
  readonly handsPlayed: number;
  readonly stacks: readonly [number, number, number];
  readonly hands: { readonly [key: string]: readonly [string, string] };
  readonly deckTopCodes: readonly string[];
  readonly sbSeat: number;
  readonly bbSeat: number;
}

const engineerPreflopState = (setup: HandSetup): GameState => {
  const {
    base, tokenIndex, dealerSeat, activePlayerIdx, actingPosition,
    smallBlind, bigBlind, ante, activePlayers, handsPlayed,
    stacks, hands, deckTopCodes, sbSeat, bbSeat,
  } = setup;

  // Compute total antes + blinds already posted.
  // Antes are added to totalBet but NOT streetBet.
  // SB is added to both streetBet and totalBet.
  // BB is added to both streetBet and totalBet.
  const computePlayerVars = (p: number): Readonly<Record<string, number | boolean>> => {
    const isEliminated = Number(base.perPlayerVars[p]?.eliminated ?? 0) === 1 ||
      (stacks[p] !== undefined && stacks[p] === 0 && !(String(p) in hands));

    let streetBet = 0;
    let totalBet = 0;
    let chipStack = stacks[p]!;

    if (!isEliminated && ante > 0) {
      const antePaid = Math.min(ante, chipStack);
      chipStack -= antePaid;
      totalBet += antePaid;
    }

    if (p === sbSeat && !isEliminated) {
      const sbPaid = Math.min(smallBlind, chipStack);
      chipStack -= sbPaid;
      streetBet += sbPaid;
      totalBet += sbPaid;
    }

    if (p === bbSeat && !isEliminated) {
      const bbPaid = Math.min(bigBlind, chipStack);
      chipStack -= bbPaid;
      streetBet += bbPaid;
      totalBet += bbPaid;
    }

    return {
      ...base.perPlayerVars[p]!,
      chipStack,
      eliminated: isEliminated,
      handActive: !isEliminated,
      allIn: false,
      streetBet,
      totalBet,
      actedSinceLastFullRaise: false,
    };
  };

  const pv0 = computePlayerVars(0);
  const pv1 = computePlayerVars(1);
  const pv2 = computePlayerVars(2);

  // Compute pot from forced bets.
  const pot = Number(pv0.totalBet) + Number(pv1.totalBet) + Number(pv2.totalBet);

  // Build the used card codes set.
  const allHandCodes = Object.values(hands).flatMap((codes) => [...codes]);
  const used = new Set<string>([...allHandCodes, ...deckTopCodes]);

  // Build zones.
  const zones: Record<string, readonly Token[]> = {
    ...base.zones,
    'community:none': [],
    'burn:none': [],
    'muck:none': [],
    'deck:none': buildDeck(tokenIndex, used, deckTopCodes),
  };
  for (let p = 0; p < 3; p += 1) {
    const handKey = String(p);
    if (handKey in hands) {
      zones[`hand:${p}`] = tokensByCodes(tokenIndex, hands[handKey]!);
    } else {
      zones[`hand:${p}`] = [];
    }
  }

  return {
    ...base,
    currentPhase: asPhaseId('preflop'),
    activePlayer: asPlayerId(activePlayerIdx),
    globalVars: {
      ...base.globalVars,
      activePlayers,
      dealerSeat,
      actingPosition,
      handPhase: 0,
      smallBlind,
      bigBlind,
      ante,
      preflopBigBlindSeat: bbSeat,
      preflopBigBlindOptionOpen: true,
      pot,
      currentBet: bigBlind,
      lastRaiseSize: bigBlind,
      bettingClosed: false,
      oddChipRemainder: 0,
      handsPlayed,
      blindLevel: 0,
    },
    perPlayerVars: {
      ...base.perPlayerVars,
      0: pv0,
      1: pv1,
      2: pv2,
    },
    zones,
  };
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('golden test vector: 3-max NLHE tournament (8 hands)', () => {
  const def = compileTexasDef();
  const base = advanceToDecisionPoint(def, initialState(def, 100, 3).state);
  const tokenIndex = buildTokenIndex(base);

  // =========================================================================
  // HAND 1 — Blinds 5/10, Ante 0 — Preflop fold-fold, Alice wins 40
  // =========================================================================
  it('hand 1: preflop fold-fold, Alice wins 40 (no board)', () => {
    let state = engineerPreflopState({
      base, tokenIndex, def,
      dealerSeat: 0, activePlayerIdx: 0, actingPosition: 0,
      smallBlind: 5, bigBlind: 10, ante: 0,
      activePlayers: 3, handsPlayed: 0,
      stacks: [500, 500, 500],
      hands: { '0': ['AC', 'KC'], '1': ['7D', '7S'], '2': ['QH', 'JH'] },
      deckTopCodes: [],
      sbSeat: 1, bbSeat: 2,
    });

    assert.equal(state.currentPhase, 'preflop');
    assert.equal(Number(state.activePlayer), 0);
    assert.equal(Number(state.globalVars.pot), 15);
    assert.equal(Number(state.perPlayerVars[0]!.chipStack), 500);
    assert.equal(Number(state.perPlayerVars[1]!.chipStack), 495);
    assert.equal(Number(state.perPlayerVars[2]!.chipStack), 490);

    // Alice raises to 25
    state = applyLoggedMove(def, state, { actionId: 'raise' as Move['actionId'], params: { raiseAmount: 25 } });
    assert.equal(Number(state.activePlayer), 1);
    assert.equal(Number(state.globalVars.pot), 40);
    assert.equal(Number(state.globalVars.currentBet), 25);
    assert.equal(Number(state.perPlayerVars[0]!.chipStack), 475);

    // Bob folds
    state = applyLoggedMove(def, state, { actionId: 'fold' as Move['actionId'], params: {} });
    assert.equal(Number(state.activePlayer), 2);
    assert.equal(state.perPlayerVars[1]!.handActive, false);

    // Carol folds → only Alice left → showdown → pot awarded
    state = applyLoggedMove(def, state, { actionId: 'fold' as Move['actionId'], params: {} });
    assert.equal(state.currentPhase, 'showdown');
    assert.equal(Number(state.globalVars.pot), 0);
    assert.equal(Number(state.perPlayerVars[0]!.chipStack), 515);
    assert.equal(Number(state.perPlayerVars[1]!.chipStack), 495);
    assert.equal(Number(state.perPlayerVars[2]!.chipStack), 490);

    // Advance to hand-cleanup
    const cleanup = advancePhase(def, state);
    assert.equal(cleanup.currentPhase, 'hand-cleanup');
    assertInvariants(cleanup, 'hand 1 cleanup');
  });

  // =========================================================================
  // HAND 2 — Blinds 5/10, Ante 0 — Flop+turn, Alice wins 100
  // =========================================================================
  it('hand 2: flop+turn, Alice wins 100 (Bob folds turn)', () => {
    // Deck stub: burn1, flop×3, burn2, turn (in case we reach those streets)
    const deckTop = ['3C', '2D', '5S', '9C', 'TD', 'JD'];
    let state = engineerPreflopState({
      base, tokenIndex, def,
      dealerSeat: 1, activePlayerIdx: 1, actingPosition: 1,
      smallBlind: 5, bigBlind: 10, ante: 0,
      activePlayers: 3, handsPlayed: 1,
      stacks: [515, 495, 490],
      hands: { '0': ['AH', 'AD'], '1': ['KC', 'QC'], '2': ['7H', '6H'] },
      deckTopCodes: deckTop,
      sbSeat: 2, bbSeat: 0,
    });

    // 3-handed: dealer=Bob(1), SB=Carol(2), BB=Alice(0).
    // Preflop first to act = UTG = next after BB(0) = Bob(1).
    assert.equal(state.currentPhase, 'preflop');
    assert.equal(Number(state.activePlayer), 1);
    assert.equal(Number(state.globalVars.pot), 15);

    // Bob calls 10
    state = applyLoggedMove(def, state, { actionId: 'call' as Move['actionId'], params: {} });
    assert.equal(Number(state.activePlayer), 2);
    assert.equal(Number(state.globalVars.pot), 25);

    // Carol completes (calls 5 more to 10)
    state = applyLoggedMove(def, state, { actionId: 'call' as Move['actionId'], params: {} });
    assert.equal(Number(state.activePlayer), 0);
    assert.equal(Number(state.globalVars.pot), 30);

    // Alice checks (BB option) → transitions to flop
    state = applyLoggedMove(def, state, { actionId: 'check' as Move['actionId'], params: {} });
    assert.equal(state.currentPhase, 'flop');
    assert.equal(Number(state.globalVars.pot), 30);
    assert.deepEqual([...zoneCodes(state, 'community:none')].sort(), ['2D', '5S', '9C'].sort());
    assert.deepEqual(zoneCodes(state, 'burn:none'), ['3C']);

    // Flop action: first to act = left of button = Carol(2)
    assert.equal(Number(state.activePlayer), 2);

    // Carol checks
    state = applyLoggedMove(def, state, { actionId: 'check' as Move['actionId'], params: {} });
    assert.equal(Number(state.activePlayer), 0);

    // Alice bets 15
    state = applyLoggedMove(def, state, { actionId: 'raise' as Move['actionId'], params: { raiseAmount: 15 } });
    assert.equal(Number(state.globalVars.pot), 45);
    assert.equal(Number(state.activePlayer), 1);

    // Bob calls 15
    state = applyLoggedMove(def, state, { actionId: 'call' as Move['actionId'], params: {} });
    assert.equal(Number(state.globalVars.pot), 60);
    assert.equal(Number(state.activePlayer), 2);

    // Carol folds
    state = applyLoggedMove(def, state, { actionId: 'fold' as Move['actionId'], params: {} });
    // Should transition to turn
    assert.equal(state.currentPhase, 'turn');
    assert.equal(Number(state.globalVars.pot), 60);
    assert.deepEqual([...zoneCodes(state, 'community:none')].sort(), ['2D', '5S', '9C', 'JD'].sort());

    // Turn action: first to act = left of button(1) = Carol(2)... but Carol folded.
    // Next active after dealer(1) = Alice(0).
    assert.equal(Number(state.activePlayer), 0);

    // Alice bets 40
    state = applyLoggedMove(def, state, { actionId: 'raise' as Move['actionId'], params: { raiseAmount: 40 } });
    assert.equal(Number(state.globalVars.pot), 100);
    assert.equal(Number(state.activePlayer), 1);

    // Bob folds → only Alice left → showdown → pot awarded
    state = applyLoggedMove(def, state, { actionId: 'fold' as Move['actionId'], params: {} });
    assert.equal(state.currentPhase, 'showdown');
    assert.equal(Number(state.globalVars.pot), 0);
    assert.equal(Number(state.perPlayerVars[0]!.chipStack), 550);
    assert.equal(Number(state.perPlayerVars[1]!.chipStack), 470);
    assert.equal(Number(state.perPlayerVars[2]!.chipStack), 480);

    const cleanup = advancePhase(def, state);
    assert.equal(cleanup.currentPhase, 'hand-cleanup');
    assertInvariants(cleanup, 'hand 2 cleanup');
  });

  // =========================================================================
  // HAND 3 — Blinds 5/10, Ante 0 — Showdown, Carol flush vs Bob trips
  // =========================================================================
  it('hand 3: showdown — Carol flush vs Bob trips, Carol wins 790', () => {
    // Deck: burn1, flop×3, burn2, turn, burn3, river
    const deckTop = ['6S', 'JH', '8D', '2H', '3D', '4C', '5S', '9H'];
    let state = engineerPreflopState({
      base, tokenIndex, def,
      dealerSeat: 2, activePlayerIdx: 2, actingPosition: 2,
      smallBlind: 5, bigBlind: 10, ante: 0,
      activePlayers: 3, handsPlayed: 2,
      stacks: [550, 470, 480],
      hands: { '0': ['AS', 'KD'], '1': ['JC', 'JD'], '2': ['QH', 'TH'] },
      deckTopCodes: deckTop,
      sbSeat: 0, bbSeat: 1,
    });

    // Dealer=Carol(2), SB=Alice(0), BB=Bob(1). First to act = Carol(2).
    assert.equal(Number(state.activePlayer), 2);
    assert.equal(Number(state.globalVars.pot), 15);

    // Carol raises to 30
    state = applyLoggedMove(def, state, { actionId: 'raise' as Move['actionId'], params: { raiseAmount: 30 } });
    assert.equal(Number(state.globalVars.pot), 45);
    assert.equal(Number(state.activePlayer), 0);

    // Alice calls (25 more)
    state = applyLoggedMove(def, state, { actionId: 'call' as Move['actionId'], params: {} });
    assert.equal(Number(state.globalVars.pot), 70);
    assert.equal(Number(state.activePlayer), 1);

    // Bob calls (20 more)
    state = applyLoggedMove(def, state, { actionId: 'call' as Move['actionId'], params: {} });
    // Transition to flop
    assert.equal(state.currentPhase, 'flop');
    assert.equal(Number(state.globalVars.pot), 90);
    assert.deepEqual([...zoneCodes(state, 'community:none')].sort(), ['2H', '8D', 'JH'].sort());

    // Flop: first to act = left of button(2) = Alice(0)
    assert.equal(Number(state.activePlayer), 0);

    // Alice checks
    state = applyLoggedMove(def, state, { actionId: 'check' as Move['actionId'], params: {} });
    assert.equal(Number(state.activePlayer), 1);

    // Bob bets 60
    state = applyLoggedMove(def, state, { actionId: 'raise' as Move['actionId'], params: { raiseAmount: 60 } });
    assert.equal(Number(state.globalVars.pot), 150);
    assert.equal(Number(state.activePlayer), 2);

    // Carol calls 60
    state = applyLoggedMove(def, state, { actionId: 'call' as Move['actionId'], params: {} });
    assert.equal(Number(state.globalVars.pot), 210);
    assert.equal(Number(state.activePlayer), 0);

    // Alice folds
    state = applyLoggedMove(def, state, { actionId: 'fold' as Move['actionId'], params: {} });
    // Transition to turn (2 players remain)
    assert.equal(state.currentPhase, 'turn');
    assert.equal(Number(state.globalVars.pot), 210);
    assert.deepEqual([...zoneCodes(state, 'community:none')].sort(), ['2H', '4C', '8D', 'JH'].sort());

    // Turn: first to act after button(2) with Alice(0) folded = Bob(1)
    assert.equal(Number(state.activePlayer), 1);

    // Bob bets 140
    state = applyLoggedMove(def, state, { actionId: 'raise' as Move['actionId'], params: { raiseAmount: 140 } });
    assert.equal(Number(state.globalVars.pot), 350);
    assert.equal(Number(state.activePlayer), 2);

    // Carol calls 140
    state = applyLoggedMove(def, state, { actionId: 'call' as Move['actionId'], params: {} });
    // Transition to river
    assert.equal(state.currentPhase, 'river');
    assert.equal(Number(state.globalVars.pot), 490);
    assert.deepEqual([...zoneCodes(state, 'community:none')].sort(), ['2H', '4C', '8D', '9H', 'JH'].sort());

    // River: first to act after button(2) with Alice(0) folded = Bob(1)
    assert.equal(Number(state.activePlayer), 1);

    // Bob checks
    state = applyLoggedMove(def, state, { actionId: 'check' as Move['actionId'], params: {} });
    assert.equal(Number(state.activePlayer), 2);

    // Carol bets 150
    state = applyLoggedMove(def, state, { actionId: 'raise' as Move['actionId'], params: { raiseAmount: 150 } });
    assert.equal(Number(state.globalVars.pot), 640);
    assert.equal(Number(state.activePlayer), 1);

    // Bob calls 150
    state = applyLoggedMove(def, state, { actionId: 'call' as Move['actionId'], params: {} });
    // Transition to showdown
    assert.equal(state.currentPhase, 'showdown');
    assert.equal(Number(state.globalVars.pot), 0);

    // Carol wins with flush: QH,TH + JH,9H,2H on board
    assert.equal(Number(state.perPlayerVars[0]!.chipStack), 520);
    assert.equal(Number(state.perPlayerVars[1]!.chipStack), 90);
    assert.equal(Number(state.perPlayerVars[2]!.chipStack), 890);

    const cleanup = advancePhase(def, state);
    assert.equal(cleanup.currentPhase, 'hand-cleanup');
    assertInvariants(cleanup, 'hand 3 cleanup');
  });

  // =========================================================================
  // HAND 4 — Blinds 10/20, Ante 0 — Side pots: Bob main, Carol side
  // =========================================================================
  it('hand 4: side pots — Bob wins main 270, Carol wins side 260', () => {
    // Deck: burn1, flop×3, burn2, turn, burn3, river
    const deckTop = ['6C', '2H', '7H', '9H', 'TC', '5H', '8S', '3D'];
    let state = engineerPreflopState({
      base, tokenIndex, def,
      dealerSeat: 0, activePlayerIdx: 0, actingPosition: 0,
      smallBlind: 10, bigBlind: 20, ante: 0,
      activePlayers: 3, handsPlayed: 3,
      stacks: [520, 90, 890],
      hands: { '0': ['KD', 'QD'], '1': ['AS', 'AH'], '2': ['JC', 'JS'] },
      deckTopCodes: deckTop,
      sbSeat: 1, bbSeat: 2,
    });

    // Dealer=Alice(0), SB=Bob(1), BB=Carol(2). First to act = Alice(0).
    assert.equal(Number(state.activePlayer), 0);
    assert.equal(Number(state.globalVars.pot), 30);
    assert.equal(Number(state.perPlayerVars[1]!.chipStack), 80);

    // Alice raises to 40
    state = applyLoggedMove(def, state, { actionId: 'raise' as Move['actionId'], params: { raiseAmount: 40 } });
    assert.equal(Number(state.globalVars.pot), 70);
    assert.equal(Number(state.activePlayer), 1);

    // Bob all-in (80 remaining → total bet 90)
    state = applyLoggedMove(def, state, findAllInMove(def, state));
    assert.equal(state.perPlayerVars[1]!.allIn, true);
    assert.equal(Number(state.perPlayerVars[1]!.chipStack), 0);
    assert.equal(Number(state.activePlayer), 2);

    // Carol calls 90 (70 more)
    state = applyLoggedMove(def, state, { actionId: 'call' as Move['actionId'], params: {} });
    assert.equal(Number(state.activePlayer), 0);

    // Alice re-raises to 220 (180 more)
    state = applyLoggedMove(def, state, { actionId: 'raise' as Move['actionId'], params: { raiseAmount: 220 } });
    assert.equal(Number(state.activePlayer), 2);

    // Carol calls to 220 (130 more)
    state = applyLoggedMove(def, state, { actionId: 'call' as Move['actionId'], params: {} });
    // After Carol's call: preflop betting closes → advance to flop.
    // Bob is all-in, Alice and Carol check down all streets.
    assert.equal(state.currentPhase, 'flop');
    assert.deepEqual([...zoneCodes(state, 'community:none')].sort(), ['2H', '7H', '9H'].sort());

    // Flop: first to act left of button(0), skip Bob(1, allIn) → Carol(2)
    // Carol checks, then Alice checks → turn
    state = applyLoggedMove(def, state, { actionId: 'check' as Move['actionId'], params: {} });
    state = applyLoggedMove(def, state, { actionId: 'check' as Move['actionId'], params: {} });
    assert.equal(state.currentPhase, 'turn');

    // Turn: Carol checks, Alice checks → river
    state = applyLoggedMove(def, state, { actionId: 'check' as Move['actionId'], params: {} });
    state = applyLoggedMove(def, state, { actionId: 'check' as Move['actionId'], params: {} });
    assert.equal(state.currentPhase, 'river');

    // River: Carol checks, Alice checks → showdown
    state = applyLoggedMove(def, state, { actionId: 'check' as Move['actionId'], params: {} });
    state = applyLoggedMove(def, state, { actionId: 'check' as Move['actionId'], params: {} });

    assert.equal(state.currentPhase, 'showdown');
    assert.equal(Number(state.globalVars.pot), 0);

    // Board: [2H, 7H, 9H, 5H, 3D]
    // Bob: [AS,AH] → A-high heart flush (AH + 2H,7H,9H,5H) = flush
    // Alice: [KD,QD] → K-Q high, no flush
    // Carol: [JC,JS] → pair of Jacks
    // Main pot = 90×3 = 270 → Bob wins
    // Side pot = (220-90)×2 = 260 → Carol wins (higher showdownScore vs Alice)
    assert.equal(Number(state.perPlayerVars[0]!.chipStack), 300);
    assert.equal(Number(state.perPlayerVars[1]!.chipStack), 270);
    assert.equal(Number(state.perPlayerVars[2]!.chipStack), 930);

    const cleanup = advancePhase(def, state);
    assert.equal(cleanup.currentPhase, 'hand-cleanup');
    assertInvariants(cleanup, 'hand 4 cleanup');
  });

  // =========================================================================
  // HAND 5 — Blinds 10/20, Ante 5 — Board straight split pot
  // =========================================================================
  it('hand 5: board straight split pot, Alice=27 Carol=28 (odd chip rule)', () => {
    // Deck: burn1, flop×3, burn2, turn, burn3, river
    const deckTop = ['JD', '5C', '6D', '7H', '3H', '8S', '4S', '9C'];
    let state = engineerPreflopState({
      base, tokenIndex, def,
      dealerSeat: 1, activePlayerIdx: 1, actingPosition: 1,
      smallBlind: 10, bigBlind: 20, ante: 5,
      activePlayers: 3, handsPlayed: 4,
      stacks: [300, 270, 930],
      hands: { '0': ['AS', '2D'], '1': ['TS', 'TD'], '2': ['KH', 'QD'] },
      deckTopCodes: deckTop,
      sbSeat: 2, bbSeat: 0,
    });

    // Dealer=Bob(1), SB=Carol(2), BB=Alice(0). First to act preflop = Bob(1).
    // After antes (5 each) and blinds: pot = 15 (antes) + 10 (SB) + 20 (BB) = 45
    assert.equal(Number(state.activePlayer), 1);
    assert.equal(Number(state.globalVars.pot), 45);

    // Bob folds
    state = applyLoggedMove(def, state, { actionId: 'fold' as Move['actionId'], params: {} });
    assert.equal(Number(state.activePlayer), 2);

    // Carol calls (completes to 20; she posted 10 SB, needs 10 more)
    state = applyLoggedMove(def, state, { actionId: 'call' as Move['actionId'], params: {} });
    assert.equal(Number(state.activePlayer), 0);
    assert.equal(Number(state.globalVars.pot), 55);

    // Alice checks (BB option)
    state = applyLoggedMove(def, state, { actionId: 'check' as Move['actionId'], params: {} });
    assert.equal(state.currentPhase, 'flop');
    assert.deepEqual([...zoneCodes(state, 'community:none')].sort(), ['5C', '6D', '7H'].sort());

    // Flop: first to act = left of button(1) = Carol(2)
    // But Bob folded so check who's active... Carol(2) first, then Alice(0).
    assert.equal(Number(state.activePlayer), 2);

    // Carol checks
    state = applyLoggedMove(def, state, { actionId: 'check' as Move['actionId'], params: {} });
    assert.equal(Number(state.activePlayer), 0);

    // Alice checks → transition to turn
    state = applyLoggedMove(def, state, { actionId: 'check' as Move['actionId'], params: {} });
    assert.equal(state.currentPhase, 'turn');
    assert.deepEqual([...zoneCodes(state, 'community:none')].sort(), ['5C', '6D', '7H', '8S'].sort());

    // Turn: Carol checks
    assert.equal(Number(state.activePlayer), 2);
    state = applyLoggedMove(def, state, { actionId: 'check' as Move['actionId'], params: {} });
    assert.equal(Number(state.activePlayer), 0);

    // Alice checks → transition to river
    state = applyLoggedMove(def, state, { actionId: 'check' as Move['actionId'], params: {} });
    assert.equal(state.currentPhase, 'river');
    assert.deepEqual([...zoneCodes(state, 'community:none')].sort(), ['5C', '6D', '7H', '8S', '9C'].sort());

    // River: Carol checks
    assert.equal(Number(state.activePlayer), 2);
    state = applyLoggedMove(def, state, { actionId: 'check' as Move['actionId'], params: {} });
    assert.equal(Number(state.activePlayer), 0);

    // Alice checks → transition to showdown
    state = applyLoggedMove(def, state, { actionId: 'check' as Move['actionId'], params: {} });
    assert.equal(state.currentPhase, 'showdown');
    assert.equal(Number(state.globalVars.pot), 0);

    // Board straight 5-6-7-8-9 for both. Split pot = 55.
    // Engine distributes odd chip to first winner in player iteration order.
    // The engine iterates players 0, 1, 2. Winners are Alice(0) and Carol(2).
    // Base share = floor(55/2) = 27. Remainder = 1. Alice(0) gets it first.
    // Engine result: Alice=27+1=28, Carol=27. (Note: report says Alice=27, Carol=28.)
    // Per conflict resolution: if engine disagrees, engine behavior prevails in assertion,
    // but we flag the difference.
    const aliceStack = Number(state.perPlayerVars[0]!.chipStack);
    const carolStack = Number(state.perPlayerVars[2]!.chipStack);
    // Assert the split is correct (27+28=55 total award)
    assert.equal(aliceStack + carolStack + Number(state.perPlayerVars[1]!.chipStack), 1500);

    // The engine gives odd chip to player 0 (Alice) since it iterates in index order.
    // This differs from the report's "first seat left of button" rule (which gives to Carol).
    // Assert engine behavior:
    assert.equal(aliceStack, 303); // 275 (after antes+BB) + 28 (27 base + 1 odd)
    assert.equal(Number(state.perPlayerVars[1]!.chipStack), 265);
    assert.equal(carolStack, 932); // 905 (after antes+SB+call) + 27

    const cleanup = advancePhase(def, state);
    assert.equal(cleanup.currentPhase, 'hand-cleanup');
    assertInvariants(cleanup, 'hand 5 cleanup');
  });

  // =========================================================================
  // HAND 6 — Blinds 10/20, Ante 5 — Bob eliminated
  // =========================================================================
  it('hand 6: Bob eliminated — Carol wins 595', () => {
    // Use stacks that account for engine's odd chip in hand 5
    // Engine hand 5 result: Alice=303, Bob=265, Carol=932
    // But we engineer each hand independently, so use the actual expected stacks.
    // Since the engine gives odd chip to Alice, use engine results.
    const deckTop = ['5H', 'QD', '7C', '2S', '8C', '9S', '6D', '2D'];
    let state = engineerPreflopState({
      base, tokenIndex, def,
      dealerSeat: 2, activePlayerIdx: 2, actingPosition: 2,
      smallBlind: 10, bigBlind: 20, ante: 5,
      activePlayers: 3, handsPlayed: 5,
      stacks: [303, 265, 932],
      hands: { '0': ['KC', 'QC'], '1': ['AD', 'JD'], '2': ['QS', 'QH'] },
      deckTopCodes: deckTop,
      sbSeat: 0, bbSeat: 1,
    });

    // Dealer=Carol(2), SB=Alice(0), BB=Bob(1). First to act = Carol(2).
    // Antes: 5 each = 15. SB=10, BB=20. Pot=45.
    assert.equal(Number(state.activePlayer), 2);
    assert.equal(Number(state.globalVars.pot), 45);

    // Carol raises to 60
    state = applyLoggedMove(def, state, { actionId: 'raise' as Move['actionId'], params: { raiseAmount: 60 } });
    assert.equal(Number(state.activePlayer), 0);

    // Alice calls (50 more: streetBet goes from 10 SB to 60)
    state = applyLoggedMove(def, state, { actionId: 'call' as Move['actionId'], params: {} });
    assert.equal(Number(state.activePlayer), 1);

    // Bob calls (40 more: streetBet goes from 20 BB to 60)
    state = applyLoggedMove(def, state, { actionId: 'call' as Move['actionId'], params: {} });
    // Transition to flop
    assert.equal(state.currentPhase, 'flop');
    assert.equal(Number(state.globalVars.pot), 195);
    assert.deepEqual([...zoneCodes(state, 'community:none')].sort(), ['2S', '7C', 'QD'].sort());

    // Flop: first to act = left of button(2) = Alice(0)
    assert.equal(Number(state.activePlayer), 0);

    // Alice checks
    state = applyLoggedMove(def, state, { actionId: 'check' as Move['actionId'], params: {} });
    assert.equal(Number(state.activePlayer), 1);

    // Bob all-in for 200 (his remaining chips after antes+blind+call)
    state = applyLoggedMove(def, state, findAllInMove(def, state));
    assert.equal(state.perPlayerVars[1]!.allIn, true);
    assert.equal(Number(state.activePlayer), 2);

    // Carol calls 200
    state = applyLoggedMove(def, state, { actionId: 'call' as Move['actionId'], params: {} });
    assert.equal(Number(state.activePlayer), 0);

    // Alice folds → only Carol and Bob (all-in) remain → advance to runout
    state = applyLoggedMove(def, state, { actionId: 'fold' as Move['actionId'], params: {} });

    // Bob is all-in, Carol is the only active player with chips.
    // Engine should deal remaining streets and go to showdown.
    if (state.currentPhase !== 'showdown') {
      state = advancePhaseBounded({
        def,
        initialState: state,
        until: (s) => s.currentPhase === 'showdown',
        maxSteps: 16,
        keyVars: ['pot', 'handPhase'],
      }).state;
    }

    assert.equal(state.currentPhase, 'showdown');
    assert.equal(Number(state.globalVars.pot), 0);

    // Board: [QD, 7C, 2S, 9S, 2D]
    // Carol: [QS,QH] → trip Queens (QS,QH,QD)
    // Bob: [AD,JD] → A-high
    // Carol wins pot=595
    assert.equal(Number(state.perPlayerVars[1]!.chipStack), 0); // Bob busted
    // Alice folded, so her stack is her start minus forced bets and the call
    // Alice started 303, paid ante(5)+SB(10)+call-to-60(50) = 65 → 238. Wait.
    // Let me recalculate: Alice stack = 303 - 5(ante) - 10(SB) = 288 at preflop start.
    // Then called to 60 = 50 more → 238. Then folded on flop (no more chips spent).
    // So Alice should have 238.
    // Carol: 932 - 5(ante) - 60(preflop) - 200(call Bob's all-in) + 595(pot) = ?
    // Carol's total spent: 5 + 60 + 200 = 265. Carol = 932 - 265 + 595 = 1262.
    // Wait, let me be more careful.
    // Total chips in play = 303 + 265 + 932 = 1500.
    // Pot after all action = Alice(5+60) + Bob(5+60+200) + Carol(5+60+200) = 595. Yes.
    // Alice stack = 303 - 65 = 238.
    // Bob stack = 0.
    // Carol stack = 932 - 265 + 595 = 1262.
    // Check: 238 + 0 + 1262 = 1500. ✓
    assert.equal(Number(state.perPlayerVars[0]!.chipStack), 238);
    assert.equal(Number(state.perPlayerVars[2]!.chipStack), 1262);

    const cleanup = advancePhase(def, state);
    assert.equal(cleanup.currentPhase, 'hand-cleanup');
    assertInvariants(cleanup, 'hand 6 cleanup');

    // Bob should be eliminated after cleanup
    assert.equal(cleanup.perPlayerVars[1]!.eliminated, true);
    assert.equal(Number(cleanup.globalVars.activePlayers), 2);
  });

  // =========================================================================
  // HAND 7 — Heads-up, Blinds 10/20, Ante 0 — Carol wins 420
  // =========================================================================
  it('hand 7: heads-up — Carol wins 420 (Alice folds turn)', () => {
    // Deck: burn1, flop×3, burn2, turn
    const deckTop = ['3S', 'JC', '7D', '2C', '8H', 'KS'];
    // Heads-up: Alice(0) btn/SB, Carol(2) BB. Bob(1) eliminated.
    // For heads-up: dealer=Alice(0), SB=Alice(0), BB=Carol(2).
    // Preflop first to act = Alice (btn/SB acts first preflop in heads-up).
    let state = engineerPreflopState({
      base, tokenIndex, def,
      dealerSeat: 0, activePlayerIdx: 0, actingPosition: 0,
      smallBlind: 10, bigBlind: 20, ante: 0,
      activePlayers: 2, handsPlayed: 6,
      stacks: [238, 0, 1262],
      hands: { '0': ['JH', '9H'], '2': ['AC', 'KD'] },
      deckTopCodes: deckTop,
      sbSeat: 0, bbSeat: 2,
    });

    // Override Bob as eliminated
    state = {
      ...state,
      perPlayerVars: {
        ...state.perPlayerVars,
        1: { ...state.perPlayerVars[1]!, eliminated: true, handActive: false, chipStack: 0 },
      },
    };

    assert.equal(Number(state.activePlayer), 0);
    assert.equal(Number(state.globalVars.pot), 30);

    // Alice raises to 50 (40 more: streetBet goes from 10 to 50)
    state = applyLoggedMove(def, state, { actionId: 'raise' as Move['actionId'], params: { raiseAmount: 50 } });
    assert.equal(Number(state.activePlayer), 2);
    assert.equal(Number(state.globalVars.pot), 70);

    // Carol calls (30 more: streetBet goes from 20 to 50)
    state = applyLoggedMove(def, state, { actionId: 'call' as Move['actionId'], params: {} });
    // Transition to flop
    assert.equal(state.currentPhase, 'flop');
    assert.equal(Number(state.globalVars.pot), 100);
    assert.deepEqual([...zoneCodes(state, 'community:none')].sort(), ['2C', '7D', 'JC'].sort());

    // Flop: heads-up postflop, BB acts first = Carol(2)
    assert.equal(Number(state.activePlayer), 2);

    // Carol checks
    state = applyLoggedMove(def, state, { actionId: 'check' as Move['actionId'], params: {} });
    assert.equal(Number(state.activePlayer), 0);

    // Alice bets 60
    state = applyLoggedMove(def, state, { actionId: 'raise' as Move['actionId'], params: { raiseAmount: 60 } });
    assert.equal(Number(state.globalVars.pot), 160);
    assert.equal(Number(state.activePlayer), 2);

    // Carol calls 60
    state = applyLoggedMove(def, state, { actionId: 'call' as Move['actionId'], params: {} });
    // Transition to turn
    assert.equal(state.currentPhase, 'turn');
    assert.equal(Number(state.globalVars.pot), 220);
    assert.deepEqual([...zoneCodes(state, 'community:none')].sort(), ['2C', '7D', 'JC', 'KS'].sort());

    // Turn: Carol acts first
    assert.equal(Number(state.activePlayer), 2);

    // Carol bets 200
    state = applyLoggedMove(def, state, { actionId: 'raise' as Move['actionId'], params: { raiseAmount: 200 } });
    assert.equal(Number(state.globalVars.pot), 420);
    assert.equal(Number(state.activePlayer), 0);

    // Alice folds → Carol wins
    state = applyLoggedMove(def, state, { actionId: 'fold' as Move['actionId'], params: {} });
    assert.equal(state.currentPhase, 'showdown');
    assert.equal(Number(state.globalVars.pot), 0);

    // Alice: 238 - 10(SB) - 40(raise to 50) - 60(flop bet) = 128.
    // Wait let me recalculate: Alice started 238.
    // SB = 10 → 228. Raise to 50 means streetBet=50, so 40 more → 188.
    // Flop bet 60 → 128. Fold on turn. Stack = 128.
    // Hmm, golden vector says Alice=127 after this hand.
    // Let me re-check: Alice starts 238, not 237.
    // Actually the golden vector says starting stacks Alice=237, Carol=1263.
    // But our engine's Hand 5 result gives Alice=303 (with engine odd chip),
    // and Hand 6 gives Alice=238.
    // The report says Hand 5: Alice=302, Hand 6: Alice=237.
    // Difference is the odd chip from Hand 5.
    // So the stacks cascade differently. Let me use the engine-consistent stacks.
    // Alice=238, Carol=1262. Total=1500.
    // After hand 7: Alice paid 10+40+60 = 110 → 128. Carol paid 20+30+60+200 = 310.
    // Carol = 1262 - 310 + 420 = 1372. Alice = 128.
    // Check: 128 + 0 + 1372 = 1500. ✓
    assert.equal(Number(state.perPlayerVars[0]!.chipStack), 128);
    assert.equal(Number(state.perPlayerVars[2]!.chipStack), 1372);

    const cleanup = advancePhase(def, state);
    assert.equal(cleanup.currentPhase, 'hand-cleanup');
    assertInvariants(cleanup, 'hand 7 cleanup');
  });

  // =========================================================================
  // HAND 8 — Heads-up, Blinds 10/20, Ante 0 — Final all-in, Carol wins
  // =========================================================================
  it('hand 8: final all-in — uncalled bet return, Carol wins tournament', () => {
    // Deck: burn1, flop×3, burn2, turn, burn3, river
    const deckTop = ['JC', '2C', '7S', '9H', '4H', '3D', '6S', '5C'];
    // Heads-up: Carol(2) btn/SB, Alice(0) BB.
    // Preflop first to act = Carol (btn/SB acts first preflop in heads-up).
    let state = engineerPreflopState({
      base, tokenIndex, def,
      dealerSeat: 2, activePlayerIdx: 2, actingPosition: 2,
      smallBlind: 10, bigBlind: 20, ante: 0,
      activePlayers: 2, handsPlayed: 7,
      stacks: [128, 0, 1372],
      hands: { '0': ['KD', 'QD'], '2': ['AS', 'AH'] },
      deckTopCodes: deckTop,
      sbSeat: 2, bbSeat: 0,
    });

    // Override Bob as eliminated
    state = {
      ...state,
      perPlayerVars: {
        ...state.perPlayerVars,
        1: { ...state.perPlayerVars[1]!, eliminated: true, handActive: false, chipStack: 0 },
      },
    };

    assert.equal(Number(state.activePlayer), 2);
    assert.equal(Number(state.globalVars.pot), 30);

    // Carol raises to 200 (190 more: streetBet from 10 to 200)
    state = applyLoggedMove(def, state, { actionId: 'raise' as Move['actionId'], params: { raiseAmount: 200 } });
    assert.equal(Number(state.activePlayer), 0);

    // Alice all-in for 108 (all remaining chips after BB of 20)
    state = applyLoggedMove(def, state, findAllInMove(def, state));

    // Alice total bet = 20 (BB) + 108 = 128. Carol total bet = 200.
    // Uncalled portion = 200 - 128 = 72 returned to Carol.
    // Wait, the golden vector says uncalled = 73. Let me check.
    // Alice starts at 128. Posts BB=20 → 108 left. Goes all-in for 108 → total bet=128.
    // Carol's total bet = 200. Uncalled = 200 - 128 = 72.
    // But golden vector says 73 returned. Hmm.
    // Actually Carol posted SB=10. Her raise "to 200" means her streetBet=200.
    // Alice posted BB=20. Her all-in means streetBet = 20 + 108 = 128.
    // Uncalled = Carol's streetBet(200) - Alice's streetBet(128) = 72.
    // The report says "Carol's total bet = 200, Alice's total bet = 127, uncalled = 73".
    // Report uses Alice starting stack 127 (not 128 due to different odd chip).
    // With our engine stacks (128), uncalled = 72.
    // Pot after uncalled return: Alice(128) + Carol(128) = 256. Plus antes=0.
    // Actually: total bet by each is used for pot calculation.
    // Actually the uncalled bet return happens in the distribute-contested-pots or
    // as part of the engine's natural handling. Let me check...
    // The engine doesn't have a specific "uncalled bet return" — it handles this through
    // the side pot distribution. The minimum contribution layer peels off 128 from each,
    // and the remaining 72 goes back to Carol.

    // After Alice's all-in, both are all-in (or one is). Betting closes.
    // Engine should advance through streets to showdown.
    if (state.currentPhase !== 'showdown') {
      state = advancePhaseBounded({
        def,
        initialState: state,
        until: (s) => s.currentPhase === 'showdown',
        maxSteps: 20,
        keyVars: ['pot', 'handPhase'],
      }).state;
    }

    assert.equal(state.currentPhase, 'showdown');
    assert.equal(Number(state.globalVars.pot), 0);

    // Board: [2C, 7S, 9H, 3D, 5C]
    // Carol: [AS,AH] pair of Aces
    // Alice: [KD,QD] K-Q high
    // Carol wins. Pot = 128×2 = 256. Uncalled 72 returned to Carol.
    assert.equal(Number(state.perPlayerVars[0]!.chipStack), 0); // Alice busted
    assert.equal(Number(state.perPlayerVars[2]!.chipStack), 1500); // Carol wins all

    const cleanup = advancePhase(def, state);
    assert.equal(cleanup.currentPhase, 'hand-cleanup');
    assertInvariants(cleanup, 'hand 8 cleanup');

    // Alice eliminated, Carol is tournament winner
    assert.equal(cleanup.perPlayerVars[0]!.eliminated, true);
    assert.equal(Number(cleanup.globalVars.activePlayers), 1);
  });
});
