// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  addToRunningHash,
  asPhaseId,
  asPlayerId,
  createMutableState,
  createZobristTable,
  type GameDef,
  type GameState,
  removeFromRunningHash,
  updateRunningHash,
  zobristKey,
  type ZobristFeature,
} from '../../../src/kernel/index.js';

const createMinimalGameDef = (): GameDef =>
  ({
    metadata: { id: 'zobrist-helpers-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [{ name: 'score', type: 'int', init: 0, min: 0, max: 10 }],
    globalMarkerLattices: [],
    perPlayerVars: [],
    zones: [{ id: 'deck:none', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
    tokenTypes: [{ id: 'card', props: {} }],
    turnStructure: { phases: [{ id: 'main' }] },
    actions: [{ id: 'act', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] }],
    triggers: [],
    setup: [],
  }) as unknown as GameDef;

const createMinimalState = (): GameState => ({
  globalVars: { score: 0 },
  perPlayerVars: {},
  zoneVars: {},
  playerCount: 2,
  zones: { 'deck:none': [] },
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 0,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 0n] },
  stateHash: 0n,
  _runningHash: 0x1234n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
  reveals: undefined,
  globalMarkers: undefined,
  activeLastingEffects: undefined,
  interruptPhaseStack: undefined,
});

describe('zobrist incremental helpers', () => {
  const def = createMinimalGameDef();
  const table = createZobristTable(def);

  const oldFeature: ZobristFeature = { kind: 'globalVar', varName: 'score', value: 0 };
  const newFeature: ZobristFeature = { kind: 'globalVar', varName: 'score', value: 5 };

  describe('updateRunningHash', () => {
    it('XORs out old feature and XORs in new feature', () => {
      const state = createMinimalState();
      const mutable = createMutableState(state);
      const initialHash = mutable._runningHash;

      updateRunningHash(mutable, table, oldFeature, newFeature);

      const expected = initialHash ^ zobristKey(table, oldFeature) ^ zobristKey(table, newFeature);
      assert.equal(mutable._runningHash, expected);
    });

    it('is its own inverse when applied twice with swapped features', () => {
      const state = createMinimalState();
      const mutable = createMutableState(state);
      const initialHash = mutable._runningHash;

      updateRunningHash(mutable, table, oldFeature, newFeature);
      updateRunningHash(mutable, table, newFeature, oldFeature);

      assert.equal(mutable._runningHash, initialHash);
    });
  });

  describe('addToRunningHash', () => {
    it('XORs in the feature key', () => {
      const state = createMinimalState();
      const mutable = createMutableState(state);
      const initialHash = mutable._runningHash;

      addToRunningHash(mutable, table, newFeature);

      const expected = initialHash ^ zobristKey(table, newFeature);
      assert.equal(mutable._runningHash, expected);
    });
  });

  describe('removeFromRunningHash', () => {
    it('XORs out the feature key', () => {
      const state = createMinimalState();
      const mutable = createMutableState(state);
      const initialHash = mutable._runningHash;

      removeFromRunningHash(mutable, table, oldFeature);

      const expected = initialHash ^ zobristKey(table, oldFeature);
      assert.equal(mutable._runningHash, expected);
    });
  });

  describe('add then remove is identity', () => {
    it('restores the original hash when a feature is added then removed', () => {
      const state = createMinimalState();
      const mutable = createMutableState(state);
      const initialHash = mutable._runningHash;

      addToRunningHash(mutable, table, newFeature);
      removeFromRunningHash(mutable, table, newFeature);

      assert.equal(mutable._runningHash, initialHash);
    });
  });
});
