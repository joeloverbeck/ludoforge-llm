import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { asPhaseId, asPlayerId, terminalResult, type GameDef, type GameState } from '../../src/kernel/index.js';

const createBaseDef = (): GameDef =>
  ({
    metadata: { id: 'terminal-test', players: { min: 3, max: 3 } },
    constants: {},
    globalVars: [{ name: 'done', type: 'int', init: 0, min: 0, max: 1 }],
    perPlayerVars: [{ name: 'points', type: 'int', init: 0, min: 0, max: 99 }],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [],
    triggers: [],
    terminal: { conditions: [] },
  }) as unknown as GameDef;

const createBaseState = (overrides: Partial<GameState> = {}): GameState => ({
  globalVars: { done: 0 },
  perPlayerVars: {
    '0': { points: 0 },
    '1': { points: 0 },
    '2': { points: 0 },
  },
  playerCount: 3,
  zones: {},
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(1),
  turnCount: 4,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [11n, 22n] },
  stateHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
  ...overrides,
});

describe('terminalResult', () => {
  it('returns null when no end condition matches', () => {
    const def: GameDef = {
      ...createBaseDef(),
      terminal: { conditions: [{ when: { op: '==', left: 1, right: 0 }, result: { type: 'draw' } }] },
    };

    assert.equal(terminalResult(def, createBaseState()), null);
  });

  it('resolves win result player selector to a concrete player', () => {
    const def: GameDef = {
      ...createBaseDef(),
      terminal: { conditions: [{ when: { op: '==', left: 1, right: 1 }, result: { type: 'win', player: 'active' } }] },
    };

    assert.deepEqual(terminalResult(def, createBaseState({ activePlayer: asPlayerId(2) })), {
      type: 'win',
      player: asPlayerId(2),
    });
  });

  it('resolves lossAll and draw result variants', () => {
    const lossAllDef: GameDef = {
      ...createBaseDef(),
      terminal: { conditions: [{ when: { op: '==', left: 2, right: 2 }, result: { type: 'lossAll' } }] },
    };
    const drawDef: GameDef = {
      ...createBaseDef(),
      terminal: { conditions: [{ when: { op: '==', left: 2, right: 2 }, result: { type: 'draw' } }] },
    };
    const state = createBaseState();

    assert.deepEqual(terminalResult(lossAllDef, state), { type: 'lossAll' });
    assert.deepEqual(terminalResult(drawDef, state), { type: 'draw' });
  });

  it('builds deterministic score ranking for highest and lowest modes', () => {
    const scoreState = createBaseState({
      perPlayerVars: {
        '0': { points: 5 },
        '1': { points: 7 },
        '2': { points: 5 },
      },
    });

    const highestDef: GameDef = {
      ...createBaseDef(),
      terminal: {
        conditions: [{ when: { op: '==', left: 1, right: 1 }, result: { type: 'score' } }],
        scoring: { method: 'highest', value: { ref: 'pvar', player: 'actor', var: 'points' } },
      },
    };

    const lowestDef: GameDef = {
      ...createBaseDef(),
      terminal: {
        conditions: [{ when: { op: '==', left: 1, right: 1 }, result: { type: 'score' } }],
        scoring: { method: 'lowest', value: { ref: 'pvar', player: 'actor', var: 'points' } },
      },
    };

    assert.deepEqual(terminalResult(highestDef, scoreState), {
      type: 'score',
      ranking: [
        { player: asPlayerId(1), score: 7 },
        { player: asPlayerId(0), score: 5 },
        { player: asPlayerId(2), score: 5 },
      ],
    });
    assert.deepEqual(terminalResult(lowestDef, scoreState), {
      type: 'score',
      ranking: [
        { player: asPlayerId(0), score: 5 },
        { player: asPlayerId(2), score: 5 },
        { player: asPlayerId(1), score: 7 },
      ],
    });
  });

  it('throws typed error when score result is configured without terminal.scoring', () => {
    const def: GameDef = {
      ...createBaseDef(),
      terminal: {
        conditions: [{ when: { op: '==', left: 1, right: 1 }, result: { type: 'score' } }],
      },
    };

    assert.throws(
      () => terminalResult(def, createBaseState()),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        const details = error as Error & { code?: unknown };
        assert.equal(details.code, 'TERMINAL_SCORING_CONFIG_MISSING');
        return true;
      },
    );
  });

  it('throws typed error when scoring expression is non-numeric', () => {
    const def: GameDef = {
      ...createBaseDef(),
      terminal: {
        conditions: [{ when: { op: '==', left: 1, right: 1 }, result: { type: 'score' } }],
        scoring: { method: 'highest', value: true as unknown as number },
      },
    };

    assert.throws(
      () => terminalResult(def, createBaseState()),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        const details = error as Error & { code?: unknown };
        assert.equal(details.code, 'TERMINAL_SCORING_NON_NUMERIC');
        return true;
      },
    );
  });

  it('uses first matching end condition in declaration order', () => {
    const def: GameDef = {
      ...createBaseDef(),
      terminal: {
        conditions: [
          { when: { op: '==', left: 1, right: 1 }, result: { type: 'draw' } },
          { when: { op: '==', left: 1, right: 1 }, result: { type: 'score' } },
        ],
        scoring: { method: 'highest', value: 99 },
      },
    };

    assert.deepEqual(terminalResult(def, createBaseState()), { type: 'draw' });
  });

  it('resolves during-coup victory checkpoints before endConditions', () => {
    const def: GameDef = {
      ...createBaseDef(),
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: { seats: ['us', 'nva', 'arvn'], overrideWindows: [] },
            actionClassByActionId: { pass: 'pass' },
            optionMatrix: [],
            passRewards: [],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
          },
        },
      },
      terminal: {
        conditions: [{ when: { op: '==', left: 1, right: 1 }, result: { type: 'draw' } }],
        checkpoints: [
          {
            id: 'us-threshold',
            seat: 'us',
            timing: 'duringCoup',
            when: { op: '>', left: { ref: 'gvar', var: 'done' }, right: 0 },
          },
        ],
      },
    };
    const state = createBaseState({
      globalVars: { done: 1 },
      playerCount: 3,
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
          seatOrder: ['us', 'nva', 'arvn'],
          eligibility: { us: true, nva: true, arvn: true },
          currentCard: {
            firstEligible: 'us',
            secondEligible: 'nva',
            actedSeats: [],
            passedSeats: [],
            nonPassCount: 0,
            firstActionClass: null,
          },
          pendingEligibilityOverrides: [],
        },
      },
    });

    assert.deepEqual(terminalResult(def, state), {
      type: 'win',
      player: asPlayerId(0),
      victory: {
        timing: 'duringCoup',
        checkpointId: 'us-threshold',
        winnerSeat: 'us',
      },
    });
  });

  it('emits deterministic final-coup margin ranking metadata with configurable tie-break precedence', () => {
    const def: GameDef = {
      ...createBaseDef(),
      globalVars: [
        { name: 'finalCoup', type: 'int', init: 0, min: 0, max: 1 },
        { name: 'mUs', type: 'int', init: 0, min: -99, max: 99 },
        { name: 'mNva', type: 'int', init: 0, min: -99, max: 99 },
        { name: 'mArvn', type: 'int', init: 0, min: -99, max: 99 },
      ],
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: { seats: ['us', 'nva', 'arvn'], overrideWindows: [] },
            actionClassByActionId: { pass: 'pass' },
            optionMatrix: [],
            passRewards: [],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
          },
        },
      },
      terminal: {
        conditions: [{ when: { op: '==', left: 1, right: 1 }, result: { type: 'draw' } }],
        checkpoints: [
          {
            id: 'final-coup',
            seat: 'us',
            timing: 'finalCoup',
            when: { op: '==', left: { ref: 'gvar', var: 'finalCoup' }, right: 1 },
          },
        ],
        margins: [
          { seat: 'us', value: { ref: 'gvar', var: 'mUs' } },
          { seat: 'nva', value: { ref: 'gvar', var: 'mNva' } },
          { seat: 'arvn', value: { ref: 'gvar', var: 'mArvn' } },
        ],
        ranking: { order: 'desc', tieBreakOrder: ['us', 'nva', 'arvn'] },
      },
    };
    const state = createBaseState({
      globalVars: { finalCoup: 1, mUs: 8, mNva: 8, mArvn: 2 },
      playerCount: 3,
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
          seatOrder: ['us', 'nva', 'arvn'],
          eligibility: { us: true, nva: true, arvn: true },
          currentCard: {
            firstEligible: 'us',
            secondEligible: 'nva',
            actedSeats: [],
            passedSeats: [],
            nonPassCount: 0,
            firstActionClass: null,
          },
          pendingEligibilityOverrides: [],
        },
      },
    });

    assert.deepEqual(terminalResult(def, state), {
      type: 'win',
      player: asPlayerId(0),
      victory: {
        timing: 'finalCoup',
        checkpointId: 'final-coup',
        winnerSeat: 'us',
        ranking: [
          { seat: 'us', margin: 8, rank: 1, tieBreakKey: 'us' },
          { seat: 'nva', margin: 8, rank: 2, tieBreakKey: 'nva' },
          { seat: 'arvn', margin: 2, rank: 3, tieBreakKey: 'arvn' },
        ],
      },
    });
  });
});
