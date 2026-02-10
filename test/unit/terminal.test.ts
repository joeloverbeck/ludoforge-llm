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
    turnStructure: { phases: [{ id: asPhaseId('main') }], activePlayerOrder: 'roundRobin' },
    actions: [],
    triggers: [],
    endConditions: [],
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
  ...overrides,
});

describe('terminalResult', () => {
  it('returns null when no end condition matches', () => {
    const def: GameDef = {
      ...createBaseDef(),
      endConditions: [{ when: { op: '==', left: 1, right: 0 }, result: { type: 'draw' } }],
    };

    assert.equal(terminalResult(def, createBaseState()), null);
  });

  it('resolves win result player selector to a concrete player', () => {
    const def: GameDef = {
      ...createBaseDef(),
      endConditions: [{ when: { op: '==', left: 1, right: 1 }, result: { type: 'win', player: 'active' } }],
    };

    assert.deepEqual(terminalResult(def, createBaseState({ activePlayer: asPlayerId(2) })), {
      type: 'win',
      player: asPlayerId(2),
    });
  });

  it('resolves lossAll and draw result variants', () => {
    const lossAllDef: GameDef = {
      ...createBaseDef(),
      endConditions: [{ when: { op: '==', left: 2, right: 2 }, result: { type: 'lossAll' } }],
    };
    const drawDef: GameDef = {
      ...createBaseDef(),
      endConditions: [{ when: { op: '==', left: 2, right: 2 }, result: { type: 'draw' } }],
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
      scoring: { method: 'highest', value: { ref: 'pvar', player: 'actor', var: 'points' } },
      endConditions: [{ when: { op: '==', left: 1, right: 1 }, result: { type: 'score' } }],
    };

    const lowestDef: GameDef = {
      ...createBaseDef(),
      scoring: { method: 'lowest', value: { ref: 'pvar', player: 'actor', var: 'points' } },
      endConditions: [{ when: { op: '==', left: 1, right: 1 }, result: { type: 'score' } }],
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

  it('uses first matching end condition in declaration order', () => {
    const def: GameDef = {
      ...createBaseDef(),
      scoring: { method: 'highest', value: 99 },
      endConditions: [
        { when: { op: '==', left: 1, right: 1 }, result: { type: 'draw' } },
        { when: { op: '==', left: 1, right: 1 }, result: { type: 'score' } },
      ],
    };

    assert.deepEqual(terminalResult(def, createBaseState()), { type: 'draw' });
  });
});
