import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  applyTrustedMove,
  asActionId,
  asPhaseId,
  asPlayerId,
  asZoneId,
  createTrustedExecutableMove,
  probeMoveViability,
  type ActionDef,
  type GameDef,
  type GameState,
  type Move,
} from '../../../src/kernel/index.js';
import { eff } from '../../helpers/effect-tag-helper.js';
import { asTaggedGameDef } from '../../helpers/gamedef-fixtures.js';

const RESOURCES_VAR = { name: 'resources', type: 'int', init: 10, min: 0, max: 100 } as const;

const makeBaseDef = (): GameDef =>
  asTaggedGameDef({
    metadata: { id: 'apply-move-immutability-test', players: { min: 2, max: 2 } },
    seats: [{ id: '0' }, { id: '1' }],
    constants: {},
    globalVars: [RESOURCES_VAR],
    perPlayerVars: [],
    zones: [{ id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set' }],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [{
      id: asActionId('gain'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [eff({ addVar: { scope: 'global', var: 'resources', delta: 1 } })],
      limits: [],
    } satisfies ActionDef],
    triggers: [],
    terminal: { conditions: [] },
  });

const makeBaseState = (): GameState => ({
  globalVars: { resources: 10 },
  perPlayerVars: {},
  zoneVars: {},
  playerCount: 2,
  zones: { 'board:none': [] },
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
  stateHash: 0n,
  _runningHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
  reveals: undefined,
  globalMarkers: undefined,
  activeLastingEffects: undefined,
  interruptPhaseStack: undefined,
});

const deepFreeze = <T>(value: T): T => {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return value;
  }

  Object.freeze(value);
  for (const nested of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nested);
  }
  return value;
};

const GAIN_MOVE: Move = { actionId: asActionId('gain'), params: {} };

describe('applyMove draft-state external immutability contract', () => {
  it('does not mutate a deeply frozen input state for applyMove', () => {
    const def = makeBaseDef();
    const frozenState = deepFreeze(makeBaseState());

    const result = applyMove(def, frozenState, GAIN_MOVE, { advanceToDecisionPoint: false });

    assert.notEqual(result.state, frozenState);
    assert.equal(Number(frozenState.globalVars.resources), 10);
    assert.equal(Number(result.state.globalVars.resources), 11);
  });

  it('does not mutate a deeply frozen input state for applyTrustedMove', () => {
    const def = makeBaseDef();
    const frozenState = deepFreeze(makeBaseState());
    const trustedMove = createTrustedExecutableMove(GAIN_MOVE, frozenState.stateHash, 'enumerateLegalMoves');

    const result = applyTrustedMove(def, frozenState, trustedMove, { advanceToDecisionPoint: false });

    assert.notEqual(result.state, frozenState);
    assert.equal(Number(frozenState.globalVars.resources), 10);
    assert.equal(Number(result.state.globalVars.resources), 11);
  });

  it('does not mutate a deeply frozen input state for probeMoveViability', () => {
    const def = makeBaseDef();
    const frozenState = deepFreeze(makeBaseState());

    const viability = probeMoveViability(def, frozenState, GAIN_MOVE);

    assert.equal(viability.viable, true);
    if (!viability.viable) {
      assert.fail('expected gain move to remain viable under probeMoveViability');
    }
    assert.equal(viability.complete, true);
    assert.deepEqual(viability.move, GAIN_MOVE);
    assert.deepEqual(viability.warnings, []);
    assert.equal(Number(frozenState.globalVars.resources), 10);
  });

  it('keeps probeMoveViability stable for identical inputs after move execution elsewhere', () => {
    const def = makeBaseDef();
    const probeState = makeBaseState();

    const baseline = probeMoveViability(def, probeState, GAIN_MOVE);
    const executed = applyMove(def, makeBaseState(), GAIN_MOVE, { advanceToDecisionPoint: false });
    const replayed = probeMoveViability(def, probeState, GAIN_MOVE);

    assert.deepEqual(replayed, baseline);
    assert.equal(Number(executed.state.globalVars.resources), 11);
    assert.equal(Number(probeState.globalVars.resources), 10);
  });
});
