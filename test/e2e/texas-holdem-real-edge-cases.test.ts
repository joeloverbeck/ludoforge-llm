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
import { advancePhaseBounded, replayScript } from '../helpers/replay-harness.js';

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

describe('texas hold\'em real-play action-by-action replay e2e', () => {
  it('real #1: reproduces PokerStars #27738502010 preflop all-in ladder with refund and 3-layer pot award', () => {
    const def = compileTexasDef();
    const base = advanceToDecisionPoint(def, initialState(def, 27738502010, 9));
    const tokenIndex = buildTokenIndex(base);

    const handsByPlayer = {
      '0': ['JD', 'JC'],
      '1': ['7S', '7H'],
      '2': ['6S', '6H'],
      '3': ['QD', 'QC'],
      '4': ['5D', '5H'],
      '5': ['TS', 'TH'],
      '6': ['KH', 'AS'],
      '7': ['AD', 'KD'],
      '8': ['9S', '9H'],
    } as const;

    const runoutDeckTop = ['KS', '2D', '2C', '3C', 'AH', '8H', 'QS', '4D'] as const;
    const used = new Set<string>([
      ...Object.values(handsByPlayer).flatMap((codes) => codes),
      ...runoutDeckTop,
    ]);

    let state: GameState = {
      ...base,
      currentPhase: asPhaseId('preflop'),
      activePlayer: asPlayerId(1),
      globalVars: {
        ...base.globalVars,
        activePlayers: 9,
        dealerSeat: 7,
        actingPosition: 1,
        handPhase: 0,
        blindLevel: 15,
        smallBlind: 250,
        bigBlind: 500,
        ante: 60,
        preflopBigBlindSeat: 0,
        preflopBigBlindOptionOpen: true,
        pot: 1290,
        currentBet: 500,
        lastRaiseSize: 500,
        bettingClosed: false,
        oddChipRemainder: 0,
      },
      perPlayerVars: {
        ...base.perPlayerVars,
        '0': { ...base.perPlayerVars['0']!, chipStack: 8622, eliminated: false, handActive: true, allIn: false, streetBet: 500, totalBet: 560, actedSinceLastFullRaise: false },
        '1': { ...base.perPlayerVars['1']!, chipStack: 25651, eliminated: false, handActive: true, allIn: false, streetBet: 0, totalBet: 60, actedSinceLastFullRaise: false },
        '2': { ...base.perPlayerVars['2']!, chipStack: 21415, eliminated: false, handActive: true, allIn: false, streetBet: 0, totalBet: 60, actedSinceLastFullRaise: false },
        '3': { ...base.perPlayerVars['3']!, chipStack: 60880, eliminated: false, handActive: true, allIn: false, streetBet: 0, totalBet: 60, actedSinceLastFullRaise: false },
        '4': { ...base.perPlayerVars['4']!, chipStack: 17984, eliminated: false, handActive: true, allIn: false, streetBet: 0, totalBet: 60, actedSinceLastFullRaise: false },
        '5': { ...base.perPlayerVars['5']!, chipStack: 8278, eliminated: false, handActive: true, allIn: false, streetBet: 0, totalBet: 60, actedSinceLastFullRaise: false },
        '6': { ...base.perPlayerVars['6']!, chipStack: 8293, eliminated: false, handActive: true, allIn: false, streetBet: 0, totalBet: 60, actedSinceLastFullRaise: false },
        '7': { ...base.perPlayerVars['7']!, chipStack: 4344, eliminated: false, handActive: true, allIn: false, streetBet: 0, totalBet: 60, actedSinceLastFullRaise: false },
        '8': { ...base.perPlayerVars['8']!, chipStack: 23243, eliminated: false, handActive: true, allIn: false, streetBet: 250, totalBet: 310, actedSinceLastFullRaise: false },
      },
      zones: {
        ...base.zones,
        'hand:0': tokensByCodes(tokenIndex, handsByPlayer['0']),
        'hand:1': tokensByCodes(tokenIndex, handsByPlayer['1']),
        'hand:2': tokensByCodes(tokenIndex, handsByPlayer['2']),
        'hand:3': tokensByCodes(tokenIndex, handsByPlayer['3']),
        'hand:4': tokensByCodes(tokenIndex, handsByPlayer['4']),
        'hand:5': tokensByCodes(tokenIndex, handsByPlayer['5']),
        'hand:6': tokensByCodes(tokenIndex, handsByPlayer['6']),
        'hand:7': tokensByCodes(tokenIndex, handsByPlayer['7']),
        'hand:8': tokensByCodes(tokenIndex, handsByPlayer['8']),
        'community:none': [],
        'burn:none': [],
        'muck:none': [],
        'deck:none': buildDeck(tokenIndex, used, runoutDeckTop),
      },
    };

    state = applyLoggedMove(def, state, { actionId: 'fold' as Move['actionId'], params: {} });
    state = applyLoggedMove(def, state, { actionId: 'fold' as Move['actionId'], params: {} });

    state = applyLoggedMove(def, state, { actionId: 'raise' as Move['actionId'], params: { raiseAmount: 2500 } }, { exactMoveListed: false });
    assert.equal(Number(state.globalVars.pot), 3790);
    assert.equal(Number(state.globalVars.currentBet), 2500);

    state = applyLoggedMove(def, state, { actionId: 'allIn' as Move['actionId'], params: {} });
    assert.equal(Number(state.globalVars.pot), 21774);
    assert.equal(Number(state.globalVars.currentBet), 17984);

    state = applyLoggedMove(def, state, { actionId: 'fold' as Move['actionId'], params: {} });
    state = applyLoggedMove(def, state, { actionId: 'call' as Move['actionId'], params: {} });
    state = applyLoggedMove(def, state, { actionId: 'fold' as Move['actionId'], params: {} });
    state = applyLoggedMove(def, state, { actionId: 'call' as Move['actionId'], params: {} });
    state = applyLoggedMove(def, state, { actionId: 'fold' as Move['actionId'], params: {} });

    state = applyLoggedMove(def, state, { actionId: 'raise' as Move['actionId'], params: { raiseAmount: 33468 } });
    assert.equal(Number(state.globalVars.pot), 78769);
    assert.equal(Number(state.globalVars.currentBet), 33468);

    state = applyLoggedMove(def, state, { actionId: 'call' as Move['actionId'], params: {} });
    assert.equal(Number(state.globalVars.pot), 84278);
    assert.equal(Number(state.perPlayerVars['3']?.chipStack ?? -1), 27412);
    assert.equal(Number(state.perPlayerVars['8']?.chipStack ?? -1), 0);
    assert.equal(state.perPlayerVars['8']?.allIn, true);

    state = advancePhaseBounded({
      def,
      initialState: state,
      until: (current) => current.currentPhase === 'showdown',
      maxSteps: 24,
      keyVars: ['pot', 'handPhase', 'handsPlayed'],
    }).state;

    assert.equal(state.currentPhase, 'showdown');
    assert.deepEqual([...zoneCodes(state, 'burn:none')].sort(), ['KS', 'AH', 'QS'].sort());
    assert.deepEqual([...zoneCodes(state, 'community:none')].sort(), ['2D', '2C', '3C', '8H', '4D'].sort());
    assert.equal(Number(state.globalVars.pot ?? -1), 0);

    assert.equal(Number(state.perPlayerVars['0']?.chipStack ?? -1), 8622);
    assert.equal(Number(state.perPlayerVars['1']?.chipStack ?? -1), 25651);
    assert.equal(Number(state.perPlayerVars['2']?.chipStack ?? -1), 21415);
    assert.equal(Number(state.perPlayerVars['3']?.chipStack ?? -1), 111690);
    assert.equal(Number(state.perPlayerVars['4']?.chipStack ?? -1), 0);
    assert.equal(Number(state.perPlayerVars['5']?.chipStack ?? -1), 8278);
    assert.equal(Number(state.perPlayerVars['6']?.chipStack ?? -1), 0);
    assert.equal(Number(state.perPlayerVars['7']?.chipStack ?? -1), 4344);
    assert.equal(Number(state.perPlayerVars['8']?.chipStack ?? -1), 0);

    const cleanup = advancePhase(def, state);
    assert.equal(cleanup.currentPhase, 'hand-cleanup');
    assert.equal(cleanup.perPlayerVars['4']?.eliminated, true);
    assert.equal(cleanup.perPlayerVars['6']?.eliminated, true);
    assert.equal(cleanup.perPlayerVars['8']?.eliminated, true);
    assert.equal(Number(cleanup.globalVars.activePlayers ?? -1), 6);
  });

  it('real #2: reproduces PokerStars #129750342299 with uncalled refund and odd-chip side-pot split', () => {
    const def = compileTexasDef();
    const base = advanceToDecisionPoint(def, initialState(def, 129750342299, 8));
    const tokenIndex = buildTokenIndex(base);

    const handsByPlayer = {
      '0': ['5H', '4H'],
      '1': ['AC', 'KD'],
      '2': ['JS', 'JH'],
      '3': ['9D', '9H'],
      '4': ['6C', '6D'],
      '5': ['2H', '2S'],
      '6': ['AS', '3S'],
      '7': ['QH', 'AD'],
    } as const;

    const runoutDeckTop = ['2D', 'TC', '7S', 'KC', '9C', '7D', '8D', '7C'] as const;
    const used = new Set<string>([
      ...Object.values(handsByPlayer).flatMap((codes) => codes),
      ...runoutDeckTop,
    ]);

    let state: GameState = {
      ...base,
      currentPhase: asPhaseId('preflop'),
      activePlayer: asPlayerId(0),
      globalVars: {
        ...base.globalVars,
        activePlayers: 8,
        dealerSeat: 5,
        actingPosition: 0,
        handPhase: 0,
        blindLevel: 23,
        smallBlind: 1500,
        bigBlind: 3000,
        ante: 375,
        preflopBigBlindSeat: 7,
        preflopBigBlindOptionOpen: true,
        pot: 7500,
        currentBet: 3000,
        lastRaiseSize: 3000,
        bettingClosed: false,
        oddChipRemainder: 0,
      },
      perPlayerVars: {
        ...base.perPlayerVars,
        '0': { ...base.perPlayerVars['0']!, chipStack: 1857, eliminated: false, handActive: true, allIn: false, streetBet: 0, totalBet: 375, actedSinceLastFullRaise: false },
        '1': { ...base.perPlayerVars['1']!, chipStack: 57429, eliminated: false, handActive: true, allIn: false, streetBet: 0, totalBet: 375, actedSinceLastFullRaise: false },
        '2': { ...base.perPlayerVars['2']!, chipStack: 32122, eliminated: false, handActive: true, allIn: false, streetBet: 0, totalBet: 375, actedSinceLastFullRaise: false },
        '3': { ...base.perPlayerVars['3']!, chipStack: 36525, eliminated: false, handActive: true, allIn: false, streetBet: 0, totalBet: 375, actedSinceLastFullRaise: false },
        '4': { ...base.perPlayerVars['4']!, chipStack: 35733, eliminated: false, handActive: true, allIn: false, streetBet: 0, totalBet: 375, actedSinceLastFullRaise: false },
        '5': { ...base.perPlayerVars['5']!, chipStack: 42941, eliminated: false, handActive: true, allIn: false, streetBet: 0, totalBet: 375, actedSinceLastFullRaise: false },
        '6': { ...base.perPlayerVars['6']!, chipStack: 42721, eliminated: false, handActive: true, allIn: false, streetBet: 1500, totalBet: 1875, actedSinceLastFullRaise: false },
        '7': { ...base.perPlayerVars['7']!, chipStack: 23208, eliminated: false, handActive: true, allIn: false, streetBet: 3000, totalBet: 3375, actedSinceLastFullRaise: false },
      },
      zones: {
        ...base.zones,
        'hand:0': tokensByCodes(tokenIndex, handsByPlayer['0']),
        'hand:1': tokensByCodes(tokenIndex, handsByPlayer['1']),
        'hand:2': tokensByCodes(tokenIndex, handsByPlayer['2']),
        'hand:3': tokensByCodes(tokenIndex, handsByPlayer['3']),
        'hand:4': tokensByCodes(tokenIndex, handsByPlayer['4']),
        'hand:5': tokensByCodes(tokenIndex, handsByPlayer['5']),
        'hand:6': tokensByCodes(tokenIndex, handsByPlayer['6']),
        'hand:7': tokensByCodes(tokenIndex, handsByPlayer['7']),
        'community:none': [],
        'burn:none': [],
        'muck:none': [],
        'deck:none': buildDeck(tokenIndex, used, runoutDeckTop),
      },
    };

    state = applyLoggedMove(def, state, { actionId: 'call' as Move['actionId'], params: {} });
    assert.equal(Number(state.globalVars.pot), 9357);
    assert.equal(state.perPlayerVars['0']?.allIn, true);

    state = applyLoggedMove(def, state, { actionId: 'call' as Move['actionId'], params: {} });
    assert.equal(Number(state.globalVars.pot), 12357);

    state = applyLoggedMove(def, state, { actionId: 'fold' as Move['actionId'], params: {} });
    state = applyLoggedMove(def, state, { actionId: 'fold' as Move['actionId'], params: {} });
    state = applyLoggedMove(def, state, { actionId: 'fold' as Move['actionId'], params: {} });
    state = applyLoggedMove(def, state, { actionId: 'fold' as Move['actionId'], params: {} });

    state = applyLoggedMove(def, state, { actionId: 'allIn' as Move['actionId'], params: {} });
    assert.equal(Number(state.globalVars.pot), 55078);
    assert.equal(Number(state.globalVars.currentBet), 44221);

    state = applyLoggedMove(def, state, { actionId: 'call' as Move['actionId'], params: {} });
    assert.equal(Number(state.globalVars.pot), 78286);

    state = applyLoggedMove(def, state, { actionId: 'fold' as Move['actionId'], params: {} });
    assert.equal(Number(state.globalVars.pot), 78286);

    state = advancePhaseBounded({
      def,
      initialState: state,
      until: (current) => current.currentPhase === 'showdown',
      maxSteps: 24,
      keyVars: ['pot', 'handPhase', 'handsPlayed', 'oddChipRemainder'],
    }).state;

    assert.equal(state.currentPhase, 'showdown');
    assert.deepEqual([...zoneCodes(state, 'burn:none')].sort(), ['2D', '9C', '8D'].sort());
    assert.deepEqual([...zoneCodes(state, 'community:none')].sort(), ['TC', '7S', 'KC', '7D', '7C'].sort());
    assert.equal(Number(state.globalVars.pot ?? -1), 0);
    assert.equal(Number(state.globalVars.oddChipRemainder ?? -1), 0);

    assert.equal(Number(state.perPlayerVars['0']?.chipStack ?? -1), 0);
    assert.equal(Number(state.perPlayerVars['1']?.chipStack ?? -1), 54429);
    assert.equal(Number(state.perPlayerVars['2']?.chipStack ?? -1), 32122);
    assert.equal(Number(state.perPlayerVars['3']?.chipStack ?? -1), 36525);
    assert.equal(Number(state.perPlayerVars['4']?.chipStack ?? -1), 35733);
    assert.equal(Number(state.perPlayerVars['5']?.chipStack ?? -1), 42941);
    assert.equal(Number(state.perPlayerVars['6']?.chipStack ?? -1), 48150);
    assert.equal(Number(state.perPlayerVars['7']?.chipStack ?? -1), 30136);

    const seat8Contribution = 26583;
    const seat9Contribution = 26583;
    const seat8Collected = Number(state.perPlayerVars['6']?.chipStack ?? 0) - (44596 - seat8Contribution);
    const seat9Collected = Number(state.perPlayerVars['7']?.chipStack ?? 0) - (26583 - seat9Contribution);
    assert.equal(seat8Collected, 30137);
    assert.equal(seat9Collected, 30136);

    const seat8Score = Number(state.perPlayerVars['6']?.showdownScore ?? -1);
    const seat9Score = Number(state.perPlayerVars['7']?.showdownScore ?? -2);
    assert.equal(seat8Score, seat9Score);

    const cleanup = advancePhase(def, state);
    assert.equal(cleanup.currentPhase, 'hand-cleanup');
    assert.equal(cleanup.perPlayerVars['0']?.eliminated, true);
    assert.equal(cleanup.perPlayerVars['6']?.eliminated, false);
    assert.equal(cleanup.perPlayerVars['7']?.eliminated, false);
    assert.equal(Number(cleanup.globalVars.activePlayers ?? -1), 7);
  });
});
