// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  advanceToDecisionPoint,
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  terminalResult,
  type ConditionAST,
  type GameDef,
  type GameState,
  type Token,
  type TokenFilterExpr,
  type TriggerLogEntry,
} from '../../src/kernel/index.js';

const classFilter: TokenFilterExpr = { prop: 'class', op: 'eq', value: 'special' };

const matchingCount = (zone: string) => ({
  _t: 5 as const,
  aggregate: {
    op: 'count' as const,
    query: { query: 'tokensInZone' as const, zone, filter: classFilter },
  },
});

const finalSpecialClassCardCondition: ConditionAST = {
  op: 'and',
  args: [
    { op: '==', left: matchingCount('played:none'), right: 1 },
    { op: '==', left: matchingCount('lookahead:none'), right: 0 },
    { op: '==', left: matchingCount('deck:none'), right: 0 },
  ],
};

const createDef = (): GameDef =>
  ({
    metadata: { id: 'terminal-future-stream-class-filter-test', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
    seats: [{ id: 'alpha' }, { id: 'beta' }],
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [
      { id: asZoneId('played:none'), zoneKind: 'aux', owner: 'none', visibility: 'public', ordering: 'queue' },
      { id: asZoneId('lookahead:none'), zoneKind: 'aux', owner: 'none', visibility: 'public', ordering: 'queue' },
      { id: asZoneId('deck:none'), zoneKind: 'aux', owner: 'none', visibility: 'hidden', ordering: 'stack' },
      { id: asZoneId('leader:none'), zoneKind: 'aux', owner: 'none', visibility: 'public', ordering: 'queue' },
    ],
    tokenTypes: [{ id: 'card', props: { class: 'string' } }],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('phaseA') }, { id: asPhaseId('phaseB') }] },
    turnOrder: {
      type: 'cardDriven',
      config: {
        turnFlow: {
          cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
          eligibility: { seats: ['alpha', 'beta'] },
          windows: [],
          optionMatrix: [],
          passRewards: [],
          durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
        },
      },
    },
    actions: [],
    triggers: [],
    terminal: {
      conditions: [],
      checkpoints: [
        {
          id: 'final-special-class-card',
          seat: 'alpha',
          timing: 'finalCoup',
          phases: ['phaseA', 'phaseB'],
          when: finalSpecialClassCardCondition,
        },
      ],
    },
  }) as unknown as GameDef;

const card = (id: string, cardClass: 'ordinary' | 'special'): Token => ({
  id: asTokenId(id),
  type: 'card',
  props: { class: cardClass },
});

const createState = (overrides: Partial<GameState> = {}): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  zoneVars: {},
  playerCount: 2,
  zones: {
    'played:none': [card('current-final-special', 'special')],
    'lookahead:none': [card('lookahead-ordinary', 'ordinary')],
    'deck:none': [card('deck-ordinary', 'ordinary')],
    'leader:none': [],
  },
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('phaseA'),
  activePlayer: asPlayerId(0),
  turnCount: 3,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [17n, 29n] },
  stateHash: 0n,
  _runningHash: 0n,
  actionUsage: {},
  turnOrderState: {
    type: 'cardDriven',
    runtime: {
      seatOrder: ['alpha', 'beta'],
      eligibility: { alpha: true, beta: true },
      currentCard: {
        firstEligible: 'alpha',
        secondEligible: 'beta',
        actedSeats: [],
        passedSeats: [],
        nonPassCount: 0,
        firstActionClass: null,
      },
      pendingEligibilityOverrides: [],
    },
  },
  markers: {},
  reveals: undefined,
  globalMarkers: undefined,
  activeLastingEffects: undefined,
  interruptPhaseStack: undefined,
  ...overrides,
});

describe('future-stream class-filter terminal checkpoints', () => {
  it('fires in each authored phase when the current card is the final matching class', () => {
    const def = createDef();

    for (const phase of [asPhaseId('phaseA'), asPhaseId('phaseB')]) {
      const state = createState({ currentPhase: phase });

      assert.deepEqual(terminalResult(def, state), {
        type: 'win',
        player: asPlayerId(0),
        victory: {
          timing: 'finalCoup',
          checkpointId: 'final-special-class-card',
          winnerSeat: 'alpha',
        },
      });
    }

    assert.equal(
      terminalResult(
        def,
        createState({
          zones: {
            'played:none': [card('current-special', 'special')],
            'lookahead:none': [card('lookahead-ordinary', 'ordinary')],
            'deck:none': [card('future-special', 'special')],
            'leader:none': [],
          },
        }),
      ),
      null,
    );
  });

  it('does not advance phase or reveal another card once the checkpoint fires', () => {
    const def = createDef();
    const state = createState({ currentPhase: asPhaseId('phaseB') });
    const logs: TriggerLogEntry[] = [];

    const next = advanceToDecisionPoint(def, state, logs);
    const result = terminalResult(def, next);

    assert.equal(result?.type, 'win');
    assert.equal(result.victory?.checkpointId, 'final-special-class-card');
    assert.equal(next.currentPhase, state.currentPhase);
    assert.equal(next.turnCount, state.turnCount);
    assert.equal(next.zones['played:none']?.[0]?.id, state.zones['played:none']?.[0]?.id);
    assert.equal(next.zones['lookahead:none']?.[0]?.id, state.zones['lookahead:none']?.[0]?.id);
    assert.equal(next.zones['deck:none']?.[0]?.id, state.zones['deck:none']?.[0]?.id);
    assert.deepEqual(logs, []);
  });
});
