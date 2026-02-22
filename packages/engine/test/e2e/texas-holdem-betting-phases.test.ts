import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asPhaseId,
  asPlayerId,
  assertValidatedGameDef,
  areMovesEquivalent,
  initialState,
  legalMoves,
  type GameState,
  type Move,
  type Token,
  type ValidatedGameDef,
} from '../../src/kernel/index.js';
import { advanceToDecisionPoint } from '../../src/kernel/phase-advance.js';
import { assertNoDiagnostics, assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileTexasProductionSpec } from '../helpers/production-spec-helpers.js';
import { advancePhaseBounded, replayScript } from '../helpers/replay-harness.js';

/* ------------------------------------------------------------------ */
/*  Shared helpers (same pattern as texas-holdem-real-plays.test.ts)   */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Bug-catching helper: assert betting is available at phase entry    */
/* ------------------------------------------------------------------ */

const assertPostflopBettingAvailable = (
  def: ValidatedGameDef,
  state: GameState,
  expectedPhase: string,
  label: string,
): void => {
  assert.equal(state.currentPhase, expectedPhase, `${label}: wrong phase`);
  const moves = legalMoves(def, state);
  const actionIds = new Set(moves.map((m) => String(m.actionId)));
  const hasBetting =
    actionIds.has('check') || actionIds.has('call') || actionIds.has('raise') || actionIds.has('allIn');
  assert.equal(
    hasBetting,
    true,
    `${label}: no betting actions at ${expectedPhase} entry. Legal: [${[...actionIds].join(', ')}]`,
  );
};

/* ------------------------------------------------------------------ */
/*  Shared move factory                                                */
/* ------------------------------------------------------------------ */

const fold = (): Move => ({ actionId: 'fold' as Move['actionId'], params: {} });
const check = (): Move => ({ actionId: 'check' as Move['actionId'], params: {} });
const call = (): Move => ({ actionId: 'call' as Move['actionId'], params: {} });
const raise = (amount: number): Move => ({ actionId: 'raise' as Move['actionId'], params: { raiseAmount: amount } });
const allIn = (): Move => ({ actionId: 'allIn' as Move['actionId'], params: {} });

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('texas hold\'em post-flop betting phases e2e', () => {
  it('Hand A: full 4-street betting (flop check-bet-call, turn check-bet-call, river check-bet-call)', () => {
    const def = compileTexasDef();
    const base = advanceToDecisionPoint(def, initialState(def, 600, 2).state);
    const tokenIndex = buildTokenIndex(base);

    // P0 = dealer/SB, P1 = BB
    const handsByPlayer = {
      '0': ['AD', '7S'],
      '1': ['5H', '4H'],
    } as const;

    // Deck top: burn, 3S, AS, 6C (flop), burn, 6D (turn), burn, 7D (river), extras
    const runoutDeckTop = ['3S', 'AS', '6C', '6D', '7D'] as const;
    const burnCodes = ['2C', '2D', '2S'] as const; // 3 burns needed
    const deckTopOrdered = [burnCodes[0]!, ...runoutDeckTop.slice(0, 3), burnCodes[1]!, runoutDeckTop[3]!, burnCodes[2]!, runoutDeckTop[4]!] as const;

    const used = new Set<string>([
      ...Object.values(handsByPlayer).flatMap((codes) => [...codes]),
      ...runoutDeckTop,
      ...burnCodes,
    ]);

    let state: GameState = {
      ...base,
      currentPhase: asPhaseId('preflop'),
      activePlayer: asPlayerId(0),
      globalVars: {
        ...base.globalVars,
        activePlayers: 2,
        dealerSeat: 0,
        actingPosition: 0,
        handPhase: 0,
        blindLevel: 0,
        smallBlind: 100,
        bigBlind: 200,
        ante: 0,
        preflopBigBlindSeat: 1,
        preflopBigBlindOptionOpen: true,
        pot: 300,
        currentBet: 200,
        lastRaiseSize: 200,
        bettingClosed: false,
        oddChipRemainder: 0,
      },
      perPlayerVars: {
        ...base.perPlayerVars,
        '0': { ...base.perPlayerVars['0']!, chipStack: 9900, eliminated: false, handActive: true, allIn: false, streetBet: 100, totalBet: 100, actedSinceLastFullRaise: false },
        '1': { ...base.perPlayerVars['1']!, chipStack: 9800, eliminated: false, handActive: true, allIn: false, streetBet: 200, totalBet: 200, actedSinceLastFullRaise: false },
      },
      zones: {
        ...base.zones,
        'hand:0': tokensByCodes(tokenIndex, handsByPlayer['0']),
        'hand:1': tokensByCodes(tokenIndex, handsByPlayer['1']),
        'community:none': [],
        'burn:none': [],
        'muck:none': [],
        'deck:none': buildDeck(tokenIndex, used, [...deckTopOrdered]),
      },
    };

    // === PREFLOP ===
    assert.equal(state.currentPhase, 'preflop');
    assert.equal(Number(state.activePlayer), 0);

    // P0 (SB/dealer) calls 200 (limps)
    state = applyLoggedMove(def, state, call());
    assert.equal(state.currentPhase, 'preflop');
    assert.equal(Number(state.activePlayer), 1);
    assert.equal(Number(state.globalVars.pot), 400);

    // P1 (BB) raises to 800
    state = applyLoggedMove(def, state, raise(800));
    assert.equal(state.currentPhase, 'preflop');
    assert.equal(Number(state.activePlayer), 0);
    assert.equal(Number(state.globalVars.pot), 1000);

    // P0 calls
    state = applyLoggedMove(def, state, call());
    // Should advance to flop
    assert.equal(state.currentPhase, 'flop');
    assert.equal(Number(state.globalVars.pot), 1600);

    // === FLOP [3S, AS, 6C] ===
    assertPostflopBettingAvailable(def, state, 'flop', 'Hand A flop entry');
    assert.equal(zoneCodes(state, 'community:none').length, 3);

    // In HU postflop: SB (P0) acts first
    // But the engine may set active player to P1 (BB first in non-HU)
    // We'll check who is active and adjust
    const flopActive = Number(state.activePlayer);

    if (flopActive === 1) {
      // P1 checks
      state = applyLoggedMove(def, state, check());
      assert.equal(state.currentPhase, 'flop');
      // P0 bets 600
      state = applyLoggedMove(def, state, raise(600));
      assert.equal(state.currentPhase, 'flop');
      assert.equal(Number(state.globalVars.pot), 2200);
      // P1 calls
      state = applyLoggedMove(def, state, call());
    } else {
      // P0 bets, P1 was supposed to check first — adapt to engine's HU postflop order
      // HU: SB is OOP postflop, so P0 should act first
      // P0 checks (wait, the hand says P1 checks first but we adapt to engine)
      // Actually the report says: "EastLansing checks" (SB=P0), "n00ki5 bets" (BB=P1)
      // So if engine gives P0 first, that matches the report
      state = applyLoggedMove(def, state, check());
      assert.equal(state.currentPhase, 'flop');
      // P1 bets 600
      state = applyLoggedMove(def, state, raise(600));
      assert.equal(state.currentPhase, 'flop');
      assert.equal(Number(state.globalVars.pot), 2200);
      // P0 calls
      state = applyLoggedMove(def, state, call());
    }
    assert.equal(state.currentPhase, 'turn');
    assert.equal(Number(state.globalVars.pot), 2800);

    // === TURN ===
    assertPostflopBettingAvailable(def, state, 'turn', 'Hand A turn entry');
    assert.equal(zoneCodes(state, 'community:none').length, 4);

    const turnActive = Number(state.activePlayer);
    if (turnActive === 0) {
      // P0 checks, P1 bets 1500, P0 calls
      state = applyLoggedMove(def, state, check());
      assert.equal(state.currentPhase, 'turn');
      state = applyLoggedMove(def, state, raise(1500));
      assert.equal(state.currentPhase, 'turn');
      state = applyLoggedMove(def, state, call());
    } else {
      state = applyLoggedMove(def, state, check());
      assert.equal(state.currentPhase, 'turn');
      state = applyLoggedMove(def, state, raise(1500));
      assert.equal(state.currentPhase, 'turn');
      state = applyLoggedMove(def, state, call());
    }
    assert.equal(state.currentPhase, 'river');
    assert.equal(Number(state.globalVars.pot), 5800);

    // === RIVER ===
    assertPostflopBettingAvailable(def, state, 'river', 'Hand A river entry');
    assert.equal(zoneCodes(state, 'community:none').length, 5);

    const riverActive = Number(state.activePlayer);
    if (riverActive === 0) {
      // P0 checks, P1 bets 3000, P0 calls
      state = applyLoggedMove(def, state, check());
      assert.equal(state.currentPhase, 'river');
      state = applyLoggedMove(def, state, raise(3000));
      assert.equal(state.currentPhase, 'river');
      state = applyLoggedMove(def, state, call());
    } else {
      state = applyLoggedMove(def, state, check());
      assert.equal(state.currentPhase, 'river');
      state = applyLoggedMove(def, state, raise(3000));
      assert.equal(state.currentPhase, 'river');
      state = applyLoggedMove(def, state, call());
    }

    // === SHOWDOWN ===
    assert.equal(state.currentPhase, 'showdown');
    assert.equal(Number(state.globalVars.pot ?? -1), 0);
    // Total chips in play: 20000. P1 wins pot of 11800 -> P1: 10000 + 5900 = 15900... let's verify
    // P1 (5H 4H) has straight 3-4-5-6-7, P0 (AD 7S) has two pair A/7
    // P1 should win
    const p0Stack = Number(state.perPlayerVars['0']?.chipStack ?? -1);
    const p1Stack = Number(state.perPlayerVars['1']?.chipStack ?? -1);
    assert.equal(p0Stack + p1Stack, 20000, 'total chips must be conserved');
    // P1 should have more chips (winner)
    assert.equal(p1Stack > p0Stack, true, 'P1 (straight) should beat P0 (two pair)');
  });

  it('Hand B: turn raise -> re-raise all-in, then runout', () => {
    const def = compileTexasDef();
    const base = advanceToDecisionPoint(def, initialState(def, 601, 2).state);
    const tokenIndex = buildTokenIndex(base);

    // P0 = BB (cat5Cane), P1 = dealer/SB (Fluffdog)
    const handsByPlayer = {
      '0': ['JC', 'JD'],
      '1': ['2D', '2H'],
    } as const;

    // Deck: burn, 2C, TD, 6S (flop), burn, 4D (turn), burn, 6H (river)
    const runoutDeckTop = ['2C', 'TD', '6S', '4D', '6H'] as const;
    const burnCodes = ['3C', '3D', '3S'] as const;
    const deckTopOrdered = [burnCodes[0]!, ...runoutDeckTop.slice(0, 3), burnCodes[1]!, runoutDeckTop[3]!, burnCodes[2]!, runoutDeckTop[4]!] as const;

    const used = new Set<string>([
      ...Object.values(handsByPlayer).flatMap((codes) => [...codes]),
      ...runoutDeckTop,
      ...burnCodes,
    ]);

    let state: GameState = {
      ...base,
      currentPhase: asPhaseId('preflop'),
      activePlayer: asPlayerId(1), // SB/dealer acts first preflop in HU
      globalVars: {
        ...base.globalVars,
        activePlayers: 2,
        dealerSeat: 1,
        actingPosition: 1,
        handPhase: 0,
        blindLevel: 0,
        smallBlind: 15,
        bigBlind: 30,
        ante: 0,
        preflopBigBlindSeat: 0,
        preflopBigBlindOptionOpen: true,
        pot: 45,
        currentBet: 30,
        lastRaiseSize: 30,
        bettingClosed: false,
        oddChipRemainder: 0,
      },
      perPlayerVars: {
        ...base.perPlayerVars,
        '0': { ...base.perPlayerVars['0']!, chipStack: 2670, eliminated: false, handActive: true, allIn: false, streetBet: 30, totalBet: 30, actedSinceLastFullRaise: false },
        '1': { ...base.perPlayerVars['1']!, chipStack: 3285, eliminated: false, handActive: true, allIn: false, streetBet: 15, totalBet: 15, actedSinceLastFullRaise: false },
      },
      zones: {
        ...base.zones,
        'hand:0': tokensByCodes(tokenIndex, handsByPlayer['0']),
        'hand:1': tokensByCodes(tokenIndex, handsByPlayer['1']),
        'community:none': [],
        'burn:none': [],
        'muck:none': [],
        'deck:none': buildDeck(tokenIndex, used, [...deckTopOrdered]),
      },
    };

    // === PREFLOP ===
    assert.equal(state.currentPhase, 'preflop');

    // P1 (SB/dealer) raises to 60
    state = applyLoggedMove(def, state, raise(60));
    assert.equal(state.currentPhase, 'preflop');

    // P0 (BB) re-raises to 150
    state = applyLoggedMove(def, state, raise(150));
    assert.equal(state.currentPhase, 'preflop');

    // P1 calls
    state = applyLoggedMove(def, state, call());
    assert.equal(state.currentPhase, 'flop');
    assert.equal(Number(state.globalVars.pot), 300);

    // === FLOP [2C, TD, 6S] ===
    assertPostflopBettingAvailable(def, state, 'flop', 'Hand B flop entry');
    assert.equal(zoneCodes(state, 'community:none').length, 3);

    const flopActive = Number(state.activePlayer);
    if (flopActive === 0) {
      // P0 bets 180
      state = applyLoggedMove(def, state, raise(180));
      assert.equal(state.currentPhase, 'flop');
      // P1 calls
      state = applyLoggedMove(def, state, call());
    } else {
      // P1 acts first in engine's order
      state = applyLoggedMove(def, state, raise(180));
      assert.equal(state.currentPhase, 'flop');
      state = applyLoggedMove(def, state, call());
    }
    assert.equal(state.currentPhase, 'turn');
    assert.equal(Number(state.globalVars.pot), 660);

    // === TURN [4D] ===
    assertPostflopBettingAvailable(def, state, 'turn', 'Hand B turn entry');
    assert.equal(zoneCodes(state, 'community:none').length, 4);

    const turnActive = Number(state.activePlayer);
    if (turnActive === 0) {
      // P0 bets 450
      state = applyLoggedMove(def, state, raise(450));
      assert.equal(state.currentPhase, 'turn');
      // P1 raises to 900
      state = applyLoggedMove(def, state, raise(900));
      assert.equal(state.currentPhase, 'turn');
      // P0 re-raises all-in (2370 total street bet = remaining stack)
      state = applyLoggedMove(def, state, allIn());
      assert.equal(state.currentPhase, 'turn');
      assert.equal(state.perPlayerVars['0']?.allIn, true);
      // P1 calls
      state = applyLoggedMove(def, state, call());
    } else {
      state = applyLoggedMove(def, state, raise(450));
      assert.equal(state.currentPhase, 'turn');
      state = applyLoggedMove(def, state, raise(900));
      assert.equal(state.currentPhase, 'turn');
      state = applyLoggedMove(def, state, allIn());
      assert.equal(state.currentPhase, 'turn');
      state = applyLoggedMove(def, state, call());
    }

    // Both effectively all-in -> advance through river to showdown
    state = advancePhaseBounded({
      def,
      initialState: state,
      until: (current) => current.currentPhase === 'showdown',
      maxSteps: 16,
      keyVars: ['pot', 'handPhase', 'bettingClosed'],
    }).state;

    assert.equal(state.currentPhase, 'showdown');
    assert.equal(Number(state.globalVars.pot ?? -1), 0);

    const p0Stack = Number(state.perPlayerVars['0']?.chipStack ?? -1);
    const p1Stack = Number(state.perPlayerVars['1']?.chipStack ?? -1);
    assert.equal(p0Stack + p1Stack, 6000, 'total chips must be conserved (2700+3300)');
    // P1 (2D 2H) makes full house 222/66 on board [2C TD 6S 4D 6H] => wins
    assert.equal(p1Stack > p0Stack, true, 'P1 (full house 222/66) should beat P0 (pair of jacks)');
  });

  it('Hand C: check-check on flop, river raise -> fold (no showdown)', () => {
    const def = compileTexasDef();
    const base = advanceToDecisionPoint(def, initialState(def, 602, 2).state);
    const tokenIndex = buildTokenIndex(base);

    // P0 = BB (MP3), P1 = dealer/SB (Hero)
    const handsByPlayer = {
      '0': ['AC', 'KH'],
      '1': ['QS', 'JH'],
    } as const;

    // Deck: burn, 6S, 4H, 4S (flop), burn, 5C (turn), burn, 7C (river)
    const runoutDeckTop = ['6S', '4H', '4S', '5C', '7C'] as const;
    const burnCodes = ['2C', '2D', '2S'] as const;
    const deckTopOrdered = [burnCodes[0]!, ...runoutDeckTop.slice(0, 3), burnCodes[1]!, runoutDeckTop[3]!, burnCodes[2]!, runoutDeckTop[4]!] as const;

    const used = new Set<string>([
      ...Object.values(handsByPlayer).flatMap((codes) => [...codes]),
      ...runoutDeckTop,
      ...burnCodes,
    ]);

    let state: GameState = {
      ...base,
      currentPhase: asPhaseId('preflop'),
      activePlayer: asPlayerId(1), // SB/dealer acts first preflop in HU
      globalVars: {
        ...base.globalVars,
        activePlayers: 2,
        dealerSeat: 1,
        actingPosition: 1,
        handPhase: 0,
        blindLevel: 0,
        smallBlind: 50,
        bigBlind: 100,
        ante: 0,
        preflopBigBlindSeat: 0,
        preflopBigBlindOptionOpen: true,
        pot: 150,
        currentBet: 100,
        lastRaiseSize: 100,
        bettingClosed: false,
        oddChipRemainder: 0,
      },
      perPlayerVars: {
        ...base.perPlayerVars,
        '0': { ...base.perPlayerVars['0']!, chipStack: 5810, eliminated: false, handActive: true, allIn: false, streetBet: 100, totalBet: 100, actedSinceLastFullRaise: false },
        '1': { ...base.perPlayerVars['1']!, chipStack: 14106, eliminated: false, handActive: true, allIn: false, streetBet: 50, totalBet: 50, actedSinceLastFullRaise: false },
      },
      zones: {
        ...base.zones,
        'hand:0': tokensByCodes(tokenIndex, handsByPlayer['0']),
        'hand:1': tokensByCodes(tokenIndex, handsByPlayer['1']),
        'community:none': [],
        'burn:none': [],
        'muck:none': [],
        'deck:none': buildDeck(tokenIndex, used, [...deckTopOrdered]),
      },
    };

    // === PREFLOP ===
    assert.equal(state.currentPhase, 'preflop');

    // P1 (SB/dealer) raises to 300
    state = applyLoggedMove(def, state, raise(300));
    assert.equal(state.currentPhase, 'preflop');

    // P0 (BB) re-raises to 600
    state = applyLoggedMove(def, state, raise(600));
    assert.equal(state.currentPhase, 'preflop');

    // P1 calls
    state = applyLoggedMove(def, state, call());
    assert.equal(state.currentPhase, 'flop');
    assert.equal(Number(state.globalVars.pot), 1200);

    // === FLOP [6S, 4H, 4S] ===
    assertPostflopBettingAvailable(def, state, 'flop', 'Hand C flop entry');
    assert.equal(zoneCodes(state, 'community:none').length, 3);

    // Both check => advance to turn
    const flopActive = Number(state.activePlayer);
    if (flopActive === 0) {
      state = applyLoggedMove(def, state, check());
      assert.equal(state.currentPhase, 'flop');
      state = applyLoggedMove(def, state, check());
    } else {
      state = applyLoggedMove(def, state, check());
      assert.equal(state.currentPhase, 'flop');
      state = applyLoggedMove(def, state, check());
    }
    assert.equal(state.currentPhase, 'turn');
    assert.equal(Number(state.globalVars.pot), 1200);

    // === TURN [5C] ===
    assertPostflopBettingAvailable(def, state, 'turn', 'Hand C turn entry');
    assert.equal(zoneCodes(state, 'community:none').length, 4);

    const turnActive = Number(state.activePlayer);
    if (turnActive === 0) {
      // P0 checks, P1 bets 900, P0 calls
      state = applyLoggedMove(def, state, check());
      assert.equal(state.currentPhase, 'turn');
      state = applyLoggedMove(def, state, raise(900));
      assert.equal(state.currentPhase, 'turn');
      state = applyLoggedMove(def, state, call());
    } else {
      state = applyLoggedMove(def, state, check());
      assert.equal(state.currentPhase, 'turn');
      state = applyLoggedMove(def, state, raise(900));
      assert.equal(state.currentPhase, 'turn');
      state = applyLoggedMove(def, state, call());
    }
    assert.equal(state.currentPhase, 'river');
    assert.equal(Number(state.globalVars.pot), 3000);

    // === RIVER [7C] ===
    assertPostflopBettingAvailable(def, state, 'river', 'Hand C river entry');
    assert.equal(zoneCodes(state, 'community:none').length, 5);

    const riverActive = Number(state.activePlayer);
    if (riverActive === 0) {
      // P0 checks, P1 bets 1000, P0 raises all-in (4410), P1 folds
      state = applyLoggedMove(def, state, check());
      assert.equal(state.currentPhase, 'river');
      state = applyLoggedMove(def, state, raise(1000));
      assert.equal(state.currentPhase, 'river');
      state = applyLoggedMove(def, state, allIn());
      assert.equal(state.currentPhase, 'river');
      state = applyLoggedMove(def, state, fold());
    } else {
      state = applyLoggedMove(def, state, check());
      assert.equal(state.currentPhase, 'river');
      state = applyLoggedMove(def, state, raise(1000));
      assert.equal(state.currentPhase, 'river');
      state = applyLoggedMove(def, state, allIn());
      assert.equal(state.currentPhase, 'river');
      state = applyLoggedMove(def, state, fold());
    }

    // P0 wins without showdown
    // The exact phase after fold may be 'showdown' or direct resolution
    const p0Stack = Number(state.perPlayerVars['0']?.chipStack ?? -1);
    const p1Stack = Number(state.perPlayerVars['1']?.chipStack ?? -1);
    const totalChips = 5910 + 14156;
    assert.equal(p0Stack + p1Stack, totalChips, `total chips must be conserved (${totalChips})`);
    // P0 wins the pot (other player folded)
    assert.equal(p0Stack > 5910, true, 'P0 should have won the pot from the fold');
  });

  it('Hand D: flop check-raise all-in with uncalled bet returned', () => {
    const def = compileTexasDef();
    const base = advanceToDecisionPoint(def, initialState(def, 603, 2).state);
    const tokenIndex = buildTokenIndex(base);

    // P0 = dealer/SB (CHASE52OUTS), P1 = BB (arvan1985)
    const handsByPlayer = {
      '0': ['KS', 'KH'],
      '1': ['9D', '8D'],
    } as const;

    // Deck: burn, QC, 5D, 7D (flop), burn, 2S (turn), burn, 3H (river)
    const runoutDeckTop = ['QC', '5D', '7D', '2S', '3H'] as const;
    const burnCodes = ['2C', '2D', '4C'] as const;
    const deckTopOrdered = [burnCodes[0]!, ...runoutDeckTop.slice(0, 3), burnCodes[1]!, runoutDeckTop[3]!, burnCodes[2]!, runoutDeckTop[4]!] as const;

    const used = new Set<string>([
      ...Object.values(handsByPlayer).flatMap((codes) => [...codes]),
      ...runoutDeckTop,
      ...burnCodes,
    ]);

    let state: GameState = {
      ...base,
      currentPhase: asPhaseId('preflop'),
      activePlayer: asPlayerId(0), // SB/dealer acts first preflop in HU
      globalVars: {
        ...base.globalVars,
        activePlayers: 2,
        dealerSeat: 0,
        actingPosition: 0,
        handPhase: 0,
        blindLevel: 0,
        smallBlind: 100,
        bigBlind: 200,
        ante: 0,
        preflopBigBlindSeat: 1,
        preflopBigBlindOptionOpen: true,
        pot: 300,
        currentBet: 200,
        lastRaiseSize: 200,
        bettingClosed: false,
        oddChipRemainder: 0,
      },
      perPlayerVars: {
        ...base.perPlayerVars,
        '0': { ...base.perPlayerVars['0']!, chipStack: 10550, eliminated: false, handActive: true, allIn: false, streetBet: 100, totalBet: 100, actedSinceLastFullRaise: false },
        '1': { ...base.perPlayerVars['1']!, chipStack: 10663, eliminated: false, handActive: true, allIn: false, streetBet: 200, totalBet: 200, actedSinceLastFullRaise: false },
      },
      zones: {
        ...base.zones,
        'hand:0': tokensByCodes(tokenIndex, handsByPlayer['0']),
        'hand:1': tokensByCodes(tokenIndex, handsByPlayer['1']),
        'community:none': [],
        'burn:none': [],
        'muck:none': [],
        'deck:none': buildDeck(tokenIndex, used, [...deckTopOrdered]),
      },
    };

    // === PREFLOP ===
    assert.equal(state.currentPhase, 'preflop');

    // P0 (SB/dealer) raises to 600
    state = applyLoggedMove(def, state, raise(600));
    assert.equal(state.currentPhase, 'preflop');

    // P1 (BB) re-raises to 1466
    state = applyLoggedMove(def, state, raise(1466));
    assert.equal(state.currentPhase, 'preflop');

    // P0 calls
    state = applyLoggedMove(def, state, call());
    assert.equal(state.currentPhase, 'flop');
    assert.equal(Number(state.globalVars.pot), 2932);

    // === FLOP [QC, 5D, 7D] ===
    assertPostflopBettingAvailable(def, state, 'flop', 'Hand D flop entry');
    assert.equal(zoneCodes(state, 'community:none').length, 3);

    const flopActive = Number(state.activePlayer);
    if (flopActive === 1) {
      // P1 checks
      state = applyLoggedMove(def, state, check());
      assert.equal(state.currentPhase, 'flop');
      // P0 bets 3032
      state = applyLoggedMove(def, state, raise(3032));
      assert.equal(state.currentPhase, 'flop');
      // P1 raises all-in (9397 total street bet)
      state = applyLoggedMove(def, state, allIn());
      assert.equal(state.currentPhase, 'flop');
      // P0 calls all-in (remaining stack)
      state = applyLoggedMove(def, state, call());
    } else {
      // P0 acts first
      state = applyLoggedMove(def, state, check());
      assert.equal(state.currentPhase, 'flop');
      state = applyLoggedMove(def, state, raise(3032));
      assert.equal(state.currentPhase, 'flop');
      state = applyLoggedMove(def, state, allIn());
      assert.equal(state.currentPhase, 'flop');
      state = applyLoggedMove(def, state, call());
    }

    // Both all-in -> advance through to showdown
    state = advancePhaseBounded({
      def,
      initialState: state,
      until: (current) => current.currentPhase === 'showdown',
      maxSteps: 16,
      keyVars: ['pot', 'handPhase', 'bettingClosed'],
    }).state;

    assert.equal(state.currentPhase, 'showdown');
    assert.equal(Number(state.globalVars.pot ?? -1), 0);

    const p0Stack = Number(state.perPlayerVars['0']?.chipStack ?? -1);
    const p1Stack = Number(state.perPlayerVars['1']?.chipStack ?? -1);
    const totalChips = 10650 + 10863;
    assert.equal(p0Stack + p1Stack, totalChips, `total chips must be conserved (${totalChips})`);
    // P0 (KS KH) has pair of kings, P1 (9D 8D) has flush draw at best
    // On board QC 5D 7D 2S 3H, P0 wins with pair of kings
    assert.equal(p0Stack > p1Stack, true, 'P0 (pair of kings) should beat P1 (9-high)');
  });
});
