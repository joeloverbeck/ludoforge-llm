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
  it('real #1: replays the full preflop all-in sequence and verifies runout + side-pot settlement', () => {
    const def = compileTexasDef();
    const base = advanceToDecisionPoint(def, initialState(def, 501, 6).state);
    const tokenIndex = buildTokenIndex(base);

    const handsByPlayer = {
      '0': ['4H', '4C'],
      '1': ['QH', 'QC'],
      '2': ['AS', 'KS'],
      '3': ['9S', '5D'],
      '4': ['JD', 'TD'],
      '5': ['7C', '2H'],
    } as const;

    const runoutDeckTop = ['3C', '8S', '6S', '2S', 'JC', 'QD', 'AD', 'TH'] as const;
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
        activePlayers: 6,
        dealerSeat: 3,
        actingPosition: 0,
        handPhase: 0,
        blindLevel: 3,
        smallBlind: 50,
        bigBlind: 100,
        ante: 10,
        preflopBigBlindSeat: 5,
        preflopBigBlindOptionOpen: true,
        pot: 210,
        currentBet: 100,
        lastRaiseSize: 100,
        bettingClosed: false,
        oddChipRemainder: 0,
      },
      perPlayerVars: {
        ...base.perPlayerVars,
        '0': { ...base.perPlayerVars['0']!, chipStack: 2510, eliminated: false, handActive: true, allIn: false, streetBet: 0, totalBet: 10, actedSinceLastFullRaise: false },
        '1': { ...base.perPlayerVars['1']!, chipStack: 1820, eliminated: false, handActive: true, allIn: false, streetBet: 0, totalBet: 10, actedSinceLastFullRaise: false },
        '2': { ...base.perPlayerVars['2']!, chipStack: 940, eliminated: false, handActive: true, allIn: false, streetBet: 0, totalBet: 10, actedSinceLastFullRaise: false },
        '3': { ...base.perPlayerVars['3']!, chipStack: 1200, eliminated: false, handActive: true, allIn: false, streetBet: 0, totalBet: 10, actedSinceLastFullRaise: false },
        '4': { ...base.perPlayerVars['4']!, chipStack: 3290, eliminated: false, handActive: true, allIn: false, streetBet: 50, totalBet: 60, actedSinceLastFullRaise: false },
        '5': { ...base.perPlayerVars['5']!, chipStack: 670, eliminated: false, handActive: true, allIn: false, streetBet: 100, totalBet: 110, actedSinceLastFullRaise: false },
      },
      zones: {
        ...base.zones,
        'hand:0': tokensByCodes(tokenIndex, handsByPlayer['0']),
        'hand:1': tokensByCodes(tokenIndex, handsByPlayer['1']),
        'hand:2': tokensByCodes(tokenIndex, handsByPlayer['2']),
        'hand:3': tokensByCodes(tokenIndex, handsByPlayer['3']),
        'hand:4': tokensByCodes(tokenIndex, handsByPlayer['4']),
        'hand:5': tokensByCodes(tokenIndex, handsByPlayer['5']),
        'community:none': [],
        'burn:none': [],
        'muck:none': [],
        'deck:none': buildDeck(tokenIndex, used, runoutDeckTop),
      },
    };

    assert.equal(state.currentPhase, 'preflop');
    assert.equal(Number(state.activePlayer), 0);

    state = applyLoggedMove(def, state, { actionId: 'raise' as Move['actionId'], params: { raiseAmount: 250 } }, { exactMoveListed: false });
    assert.equal(Number(state.activePlayer), 1);
    assert.equal(Number(state.globalVars.pot), 460);
    assert.equal(Number(state.globalVars.currentBet), 250);

    state = applyLoggedMove(def, state, { actionId: 'call' as Move['actionId'], params: {} });
    assert.equal(Number(state.activePlayer), 2);
    assert.equal(Number(state.globalVars.pot), 710);

    state = applyLoggedMove(def, state, { actionId: 'allIn' as Move['actionId'], params: {} });
    assert.equal(Number(state.activePlayer), 3);
    assert.equal(Number(state.globalVars.pot), 1650);
    assert.equal(Number(state.globalVars.currentBet), 940);
    assert.equal(state.perPlayerVars['2']?.allIn, true);

    state = applyLoggedMove(def, state, { actionId: 'fold' as Move['actionId'], params: {} });
    assert.equal(Number(state.activePlayer), 4);
    assert.equal(state.perPlayerVars['3']?.handActive, false);

    state = applyLoggedMove(def, state, { actionId: 'allIn' as Move['actionId'], params: {} });
    assert.equal(Number(state.activePlayer), 5);
    assert.equal(Number(state.globalVars.pot), 4940);
    assert.equal(Number(state.globalVars.currentBet), 3340);

    state = applyLoggedMove(def, state, { actionId: 'fold' as Move['actionId'], params: {} });
    assert.equal(Number(state.activePlayer), 0);
    assert.equal(state.perPlayerVars['5']?.handActive, false);

    state = applyLoggedMove(def, state, { actionId: 'call' as Move['actionId'], params: {} });
    assert.equal(Number(state.activePlayer), 1);
    assert.equal(Number(state.globalVars.pot), 7200);
    assert.equal(state.perPlayerVars['0']?.allIn, true);

    state = applyLoggedMove(def, state, { actionId: 'call' as Move['actionId'], params: {} });
    state = advancePhaseBounded({
      def,
      initialState: state,
      until: (current) => current.currentPhase === 'showdown',
      maxSteps: 16,
      keyVars: ['pot', 'handPhase', 'handsPlayed'],
    }).state;

    assert.equal(state.currentPhase, 'showdown');
    assert.deepEqual([...zoneCodes(state, 'burn:none')].sort(), ['3C', 'JC', 'AD'].sort());
    assert.deepEqual([...zoneCodes(state, 'community:none')].sort(), ['8S', '6S', '2S', 'QD', 'TH'].sort());
    assert.equal(Number(state.globalVars.pot ?? -1), 0);
    assert.equal(Number(state.perPlayerVars['0']?.chipStack ?? -1), 0);
    assert.equal(Number(state.perPlayerVars['1']?.chipStack ?? -1), 2640);
    assert.equal(Number(state.perPlayerVars['2']?.chipStack ?? -1), 3920);
    assert.equal(Number(state.perPlayerVars['3']?.chipStack ?? -1), 1200);
    assert.equal(Number(state.perPlayerVars['4']?.chipStack ?? -1), 2210);
    assert.equal(Number(state.perPlayerVars['5']?.chipStack ?? -1), 670);

    const cleanup = advancePhase(def, state);
    assert.equal(cleanup.currentPhase, 'hand-cleanup');
    assert.equal(cleanup.perPlayerVars['0']?.eliminated, true);
    assert.equal(Number(cleanup.globalVars.activePlayers ?? -1), 5);
  });

  it('real #2: replays the full logged hand action-by-action from preflop through showdown', () => {
    const def = compileTexasDef();
    const base = advanceToDecisionPoint(def, initialState(def, 502, 8).state);
    const tokenIndex = buildTokenIndex(base);

    const handsByPlayer = {
      '0': ['AS', 'KS'],
      '1': ['AH', 'KH'],
      '2': ['AC', 'KC'],
      '3': ['AD', 'QD'],
      '4': ['QS', 'TS'],
      '5': ['QH', 'QC'],
      '6': ['9H', '8H'],
      '7': ['8S', '9S'],
    } as const;

    const runoutDeckTop = ['2C', '4S', 'JC', '7D', '3C', '7S', '5C', 'JD'] as const;
    const used = new Set<string>([
      ...Object.values(handsByPlayer).flatMap((codes) => codes),
      ...runoutDeckTop,
    ]);

    let state: GameState = {
      ...base,
      currentPhase: asPhaseId('preflop'),
      activePlayer: asPlayerId(3),
      globalVars: {
        ...base.globalVars,
        activePlayers: 8,
        dealerSeat: 0,
        actingPosition: 3,
        handPhase: 0,
        smallBlind: 80,
        bigBlind: 160,
        ante: 16,
        preflopBigBlindSeat: 2,
        preflopBigBlindOptionOpen: true,
        pot: 368,
        currentBet: 160,
        lastRaiseSize: 160,
        bettingClosed: false,
        oddChipRemainder: 0,
      },
      perPlayerVars: {
        ...base.perPlayerVars,
        '0': { ...base.perPlayerVars['0']!, chipStack: 12937, eliminated: false, handActive: true, allIn: false, streetBet: 0, totalBet: 16, actedSinceLastFullRaise: false },
        '1': { ...base.perPlayerVars['1']!, chipStack: 23103, eliminated: false, handActive: true, allIn: false, streetBet: 80, totalBet: 96, actedSinceLastFullRaise: false },
        '2': { ...base.perPlayerVars['2']!, chipStack: 23011, eliminated: false, handActive: true, allIn: false, streetBet: 160, totalBet: 176, actedSinceLastFullRaise: false },
        '3': { ...base.perPlayerVars['3']!, chipStack: 11674, eliminated: false, handActive: true, allIn: false, streetBet: 0, totalBet: 16, actedSinceLastFullRaise: false },
        '4': { ...base.perPlayerVars['4']!, chipStack: 18887, eliminated: false, handActive: true, allIn: false, streetBet: 0, totalBet: 16, actedSinceLastFullRaise: false },
        '5': { ...base.perPlayerVars['5']!, chipStack: 9177, eliminated: false, handActive: true, allIn: false, streetBet: 0, totalBet: 16, actedSinceLastFullRaise: false },
        '6': { ...base.perPlayerVars['6']!, chipStack: 9956, eliminated: false, handActive: true, allIn: false, streetBet: 0, totalBet: 16, actedSinceLastFullRaise: false },
        '7': { ...base.perPlayerVars['7']!, chipStack: 15947, eliminated: false, handActive: true, allIn: false, streetBet: 0, totalBet: 16, actedSinceLastFullRaise: false },
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

    assert.equal(state.currentPhase, 'preflop');
    assert.equal(Number(state.activePlayer), 3);
    assert.equal(Number(state.globalVars.pot), 368);

    state = applyLoggedMove(def, state, { actionId: 'fold' as Move['actionId'], params: {} });
    assert.equal(Number(state.activePlayer), 4);

    state = applyLoggedMove(def, state, { actionId: 'fold' as Move['actionId'], params: {} });
    assert.equal(Number(state.activePlayer), 5);

    state = applyLoggedMove(def, state, { actionId: 'raise' as Move['actionId'], params: { raiseAmount: 480 } }, { exactMoveListed: true });
    assert.equal(Number(state.globalVars.pot), 848);
    assert.equal(Number(state.globalVars.currentBet), 480);
    assert.equal(Number(state.activePlayer), 6);

    state = applyLoggedMove(def, state, { actionId: 'fold' as Move['actionId'], params: {} });
    assert.equal(Number(state.activePlayer), 7);

    state = applyLoggedMove(def, state, { actionId: 'call' as Move['actionId'], params: {} });
    assert.equal(Number(state.globalVars.pot), 1328);
    assert.equal(Number(state.activePlayer), 0);

    state = applyLoggedMove(def, state, { actionId: 'fold' as Move['actionId'], params: {} });
    assert.equal(Number(state.activePlayer), 1);

    state = applyLoggedMove(def, state, { actionId: 'fold' as Move['actionId'], params: {} });
    assert.equal(Number(state.activePlayer), 2);

    state = applyLoggedMove(def, state, { actionId: 'fold' as Move['actionId'], params: {} });
    assert.equal(state.currentPhase, 'flop');
    assert.equal(Number(state.globalVars.pot), 1328);
    assert.deepEqual(zoneCodes(state, 'community:none'), ['4S', 'JC', '7D']);
    assert.deepEqual(zoneCodes(state, 'burn:none'), ['2C']);
    assert.equal(Number(state.activePlayer), 5);

    state = applyLoggedMove(def, state, { actionId: 'raise' as Move['actionId'], params: { raiseAmount: 929 } }, { exactMoveListed: false });
    assert.equal(Number(state.globalVars.pot), 2257);
    assert.equal(Number(state.globalVars.currentBet), 929);
    assert.equal(Number(state.activePlayer), 7);

    state = applyLoggedMove(def, state, { actionId: 'call' as Move['actionId'], params: {} });
    assert.equal(state.currentPhase, 'turn');
    assert.deepEqual([...zoneCodes(state, 'community:none')].sort(), ['4S', 'JC', '7D', '7S'].sort());
    assert.deepEqual([...zoneCodes(state, 'burn:none')].sort(), ['2C', '3C'].sort());
    assert.equal(Number(state.activePlayer), 5);

    state = applyLoggedMove(def, state, { actionId: 'raise' as Move['actionId'], params: { raiseAmount: 2230 } }, { exactMoveListed: false });
    assert.equal(Number(state.globalVars.pot), 5416);
    assert.equal(Number(state.globalVars.currentBet), 2230);
    assert.equal(Number(state.activePlayer), 7);

    state = applyLoggedMove(def, state, { actionId: 'raise' as Move['actionId'], params: { raiseAmount: 4460 } }, { exactMoveListed: true });
    assert.equal(Number(state.globalVars.pot), 9876);
    assert.equal(Number(state.globalVars.currentBet), 4460);
    assert.equal(Number(state.activePlayer), 5);

    state = applyLoggedMove(def, state, { actionId: 'raise' as Move['actionId'], params: { raiseAmount: 7680 } }, { exactMoveListed: false });
    assert.equal(Number(state.globalVars.pot), 15326);
    assert.equal(Number(state.globalVars.currentBet), 7680);
    assert.equal(Number(state.activePlayer), 7);

    state = applyLoggedMove(def, state, { actionId: 'call' as Move['actionId'], params: {} });
    assert.equal(state.currentPhase, 'river');
    assert.deepEqual([...zoneCodes(state, 'community:none')].sort(), ['4S', 'JC', '7D', '7S', 'JD'].sort());
    assert.deepEqual([...zoneCodes(state, 'burn:none')].sort(), ['2C', '3C', '5C'].sort());
    assert.equal(Number(state.globalVars.pot), 18546);
    assert.equal(Number(state.activePlayer), 5);

    state = applyLoggedMove(def, state, { actionId: 'allIn' as Move['actionId'], params: {} });
    assert.equal(Number(state.globalVars.pot), 18634);
    assert.equal(Number(state.globalVars.currentBet), 88);
    assert.equal(Number(state.activePlayer), 7);

    state = applyLoggedMove(def, state, { actionId: 'call' as Move['actionId'], params: {} });
    assert.equal(state.currentPhase, 'showdown');
    assert.equal(Number(state.globalVars.pot ?? -1), 0);
    assert.equal(Number(state.perPlayerVars['5']?.chipStack ?? -1), 18722);
    assert.equal(Number(state.perPlayerVars['7']?.chipStack ?? -1), 6770);
    assert.equal(Number(state.perPlayerVars['0']?.chipStack ?? -1), 12937);
    assert.equal(Number(state.perPlayerVars['1']?.chipStack ?? -1), 23103);
    assert.equal(Number(state.perPlayerVars['2']?.chipStack ?? -1), 23011);
    assert.equal(Number(state.perPlayerVars['3']?.chipStack ?? -1), 11674);
    assert.equal(Number(state.perPlayerVars['4']?.chipStack ?? -1), 18887);
    assert.equal(Number(state.perPlayerVars['6']?.chipStack ?? -1), 9956);

    const heroScore = Number(state.perPlayerVars['5']?.showdownScore ?? 0);
    const villainScore = Number(state.perPlayerVars['7']?.showdownScore ?? 0);
    assert.equal(heroScore > villainScore, true);

    const cleanup = advancePhase(def, state);
    assert.equal(cleanup.currentPhase, 'hand-cleanup');
  });
});
