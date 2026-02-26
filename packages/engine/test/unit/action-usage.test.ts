import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asPhaseId,
  asPlayerId,
  resetTurnUsage,
  resetPhaseUsage,
  incrementActionUsage,
  type GameState,
} from '../../src/kernel/index.js';

const makeState = (
  actionUsage: GameState['actionUsage'] = {},
): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  zoneVars: {},
  playerCount: 2,
  zones: {},
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
  stateHash: 0n,
  actionUsage,
  turnOrderState: { type: 'roundRobin' },
  markers: {},
});

describe('resetTurnUsage', () => {
  it('zeros turnCount while preserving phaseCount and gameCount', () => {
    const state = makeState({
      attack: { turnCount: 3, phaseCount: 5, gameCount: 10 },
      defend: { turnCount: 1, phaseCount: 2, gameCount: 4 },
    });

    const result = resetTurnUsage(state);

    assert.deepEqual(result.actionUsage, {
      attack: { turnCount: 0, phaseCount: 5, gameCount: 10 },
      defend: { turnCount: 0, phaseCount: 2, gameCount: 4 },
    });
  });

  it('returns unchanged shape when actionUsage is empty', () => {
    const state = makeState({});
    const result = resetTurnUsage(state);
    assert.deepEqual(result.actionUsage, {});
  });

  it('returns a new state object (immutability)', () => {
    const state = makeState({ a: { turnCount: 1, phaseCount: 1, gameCount: 1 } });
    const result = resetTurnUsage(state);
    assert.notEqual(result, state);
    assert.notEqual(result.actionUsage, state.actionUsage);
  });
});

describe('resetPhaseUsage', () => {
  it('zeros phaseCount while preserving turnCount and gameCount', () => {
    const state = makeState({
      attack: { turnCount: 3, phaseCount: 5, gameCount: 10 },
      defend: { turnCount: 1, phaseCount: 2, gameCount: 4 },
    });

    const result = resetPhaseUsage(state);

    assert.deepEqual(result.actionUsage, {
      attack: { turnCount: 3, phaseCount: 0, gameCount: 10 },
      defend: { turnCount: 1, phaseCount: 0, gameCount: 4 },
    });
  });

  it('returns unchanged shape when actionUsage is empty', () => {
    const state = makeState({});
    const result = resetPhaseUsage(state);
    assert.deepEqual(result.actionUsage, {});
  });

  it('returns a new state object (immutability)', () => {
    const state = makeState({ a: { turnCount: 1, phaseCount: 1, gameCount: 1 } });
    const result = resetPhaseUsage(state);
    assert.notEqual(result, state);
    assert.notEqual(result.actionUsage, state.actionUsage);
  });
});

describe('incrementActionUsage', () => {
  it('increments all three counters for an existing action', () => {
    const state = makeState({
      attack: { turnCount: 1, phaseCount: 2, gameCount: 3 },
    });

    const result = incrementActionUsage(state, 'attack' as never);

    assert.deepEqual(result.actionUsage['attack'], {
      turnCount: 2,
      phaseCount: 3,
      gameCount: 4,
    });
  });

  it('initializes from {0,0,0} for unknown action IDs', () => {
    const state = makeState({});
    const result = incrementActionUsage(state, 'newAction' as never);

    assert.deepEqual(result.actionUsage['newAction'], {
      turnCount: 1,
      phaseCount: 1,
      gameCount: 1,
    });
  });

  it('does not mutate original state', () => {
    const state = makeState({
      attack: { turnCount: 1, phaseCount: 1, gameCount: 1 },
    });
    const result = incrementActionUsage(state, 'attack' as never);

    assert.notEqual(result, state);
    assert.equal(state.actionUsage['attack']!.turnCount, 1);
    assert.equal(result.actionUsage['attack']!.turnCount, 2);
  });

  it('does not affect other action IDs', () => {
    const state = makeState({
      attack: { turnCount: 1, phaseCount: 1, gameCount: 1 },
      defend: { turnCount: 5, phaseCount: 5, gameCount: 5 },
    });
    const result = incrementActionUsage(state, 'attack' as never);

    assert.deepEqual(result.actionUsage['defend'], {
      turnCount: 5,
      phaseCount: 5,
      gameCount: 5,
    });
  });
});
