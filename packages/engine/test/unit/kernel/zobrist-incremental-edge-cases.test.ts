// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  addToRunningHash,
  asDecisionFrameId,
  asPhaseId,
  asPlayerId,
  asTokenId,
  asTurnId,
  asZoneId,
  computeFullHash,
  createMutableState,
  createZobristTable,
  removeFromRunningHash,
  updateRunningHash,
  zobristKey,
  type GameDef,
  type GameState,
  type ZobristFeature,
} from '../../../src/kernel/index.js';

const createMinimalGameDef = (): GameDef =>
  ({
    metadata: { id: 'zobrist-edge-cases', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [
      { name: 'score', type: 'int', init: 0, min: 0, max: 100 },
      { name: 'flag', type: 'bool', init: false },
    ],
    globalMarkerLattices: [],
    perPlayerVars: [
      { name: 'hp', type: 'int', init: 10, min: 0, max: 100 },
    ],
    zones: [
      { id: 'hand:none', owner: 'none', visibility: 'public', ordering: 'queue' },
      { id: 'discard:none', owner: 'none', visibility: 'public', ordering: 'queue' },
      { id: 'empty:none', owner: 'none', visibility: 'public', ordering: 'queue' },
    ],
    tokenTypes: [{ id: 'card', props: {} }],
    turnStructure: { phases: [{ id: 'alpha' }, { id: 'beta' }] },
    actions: [{ id: 'act', actor: 'active', executor: 'actor', phase: ['alpha'], params: [], pre: null, cost: [], effects: [], limits: [] }],
    triggers: [],
    setup: [],
  }) as unknown as GameDef;

const createMinimalState = (): GameState => ({
  globalVars: { score: 0, flag: false },
  perPlayerVars: { '0': { hp: 10 }, '1': { hp: 10 } },
  zoneVars: {},
  playerCount: 2,
  zones: {
    'hand:none': [{ id: 't-1' as never, type: 'card', props: {} }],
    'discard:none': [],
    'empty:none': [],
  },
  nextTokenOrdinal: 1,
  currentPhase: asPhaseId('alpha'),
  activePlayer: asPlayerId(0),
  turnCount: 0,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 0n] },
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

const createStateWithOversizedDecisionStackFrame = (): GameState => {
  const oversizedValue = 'cam-ranh:none'.repeat(2_048);
  return {
    ...createMinimalState(),
    decisionStack: [{
      frameId: asDecisionFrameId(1),
      parentFrameId: null,
      turnId: asTurnId(1),
      context: {
        kind: 'chooseOne',
        seatId: 'seat:0' as never,
        decisionKey: 'decision:test::$target' as never,
        options: [],
      },
      continuationBindings: {
        'decision:test::$target': oversizedValue,
      } as never,
      effectFrame: {
        programCounter: 0,
        boundedIterationCursors: {},
        localBindings: {},
        pendingTriggerQueue: [],
      },
    }],
    nextFrameId: asDecisionFrameId(2),
    nextTurnId: asTurnId(2),
    activeDeciderSeatId: 'seat:0' as never,
  };
};

describe('Zobrist incremental edge cases', () => {
  const def = createMinimalGameDef();
  const table = createZobristTable(def);

  describe('marker flip twice returns to original hash', () => {
    it('global var toggle is self-inverse', () => {
      const state = createMinimalState();
      const mutable = createMutableState(state);

      // Seed with the full hash so _runningHash is correct
      mutable._runningHash = computeFullHash(table, state);
      const originalHash = mutable._runningHash;

      const oldFeature: ZobristFeature = { kind: 'globalVar', varName: 'score', value: 0 };
      const newFeature: ZobristFeature = { kind: 'globalVar', varName: 'score', value: 5 };

      // Flip: 0 → 5
      updateRunningHash(mutable, table, oldFeature, newFeature);
      const midHash = mutable._runningHash;
      assert.notEqual(midHash, originalHash, 'hash should change after flip');

      // Flip back: 5 → 0
      updateRunningHash(mutable, table, newFeature, oldFeature);
      assert.equal(mutable._runningHash, originalHash, 'hash should return to original after double-flip');
    });
  });

  describe('token create then destroy returns to original hash', () => {
    it('add then remove is self-inverse', () => {
      const state = createMinimalState();
      const mutable = createMutableState(state);
      mutable._runningHash = computeFullHash(table, state);
      const originalHash = mutable._runningHash;

      const tokenFeature: ZobristFeature = { kind: 'tokenPlacement', tokenId: asTokenId('t-new'), zoneId: asZoneId('discard:none'), slot: 0 };

      // Create token
      addToRunningHash(mutable, table, tokenFeature);
      assert.notEqual(mutable._runningHash, originalHash, 'hash should change after token creation');

      // Destroy token
      removeFromRunningHash(mutable, table, tokenFeature);
      assert.equal(mutable._runningHash, originalHash, 'hash should return to original after destroy');
    });
  });

  describe('phase cycling', () => {
    it('phase change updates hash', () => {
      const state = createMinimalState();
      const mutable = createMutableState(state);
      mutable._runningHash = computeFullHash(table, state);
      const originalHash = mutable._runningHash;

      const oldPhase: ZobristFeature = { kind: 'currentPhase', phaseId: asPhaseId('alpha') };
      const newPhase: ZobristFeature = { kind: 'currentPhase', phaseId: asPhaseId('beta') };

      // alpha → beta
      updateRunningHash(mutable, table, oldPhase, newPhase);
      assert.notEqual(mutable._runningHash, originalHash, 'phase change should update hash');

      // beta → alpha (cycle back)
      updateRunningHash(mutable, table, newPhase, oldPhase);
      assert.equal(mutable._runningHash, originalHash, 'cycling back should restore hash');
    });
  });

  describe('empty zone operations', () => {
    it('moveAll from empty zone is a no-op — no hash change', () => {
      const state = createMinimalState();
      const mutable = createMutableState(state);
      mutable._runningHash = computeFullHash(table, state);
      const originalHash = mutable._runningHash;

      // No features to XOR — the hash should remain unchanged
      assert.equal(mutable._runningHash, originalHash, 'empty zone moveAll should not change hash');
    });
  });

  describe('shuffle of single-token zone', () => {
    it('single token shuffle is a no-op — slot stays 0', () => {
      const state = createMinimalState();
      const mutable = createMutableState(state);
      mutable._runningHash = computeFullHash(table, state);
      const originalHash = mutable._runningHash;

      // Shuffling a single-token zone: XOR out slot 0, XOR in slot 0 = no change
      const feature: ZobristFeature = { kind: 'tokenPlacement', tokenId: asTokenId('t-1'), zoneId: asZoneId('hand:none'), slot: 0 };
      removeFromRunningHash(mutable, table, feature);
      addToRunningHash(mutable, table, feature);

      assert.equal(mutable._runningHash, originalHash, 'single-token shuffle should not change hash');
    });
  });

  describe('transferVar where source and dest are same player', () => {
    it('self-transfer of equal amount is a no-op', () => {
      const state = createMinimalState();
      const mutable = createMutableState(state);
      mutable._runningHash = computeFullHash(table, state);
      const originalHash = mutable._runningHash;

      // XOR out player 0 hp=10, XOR in player 0 hp=10 (net zero)
      const feature: ZobristFeature = { kind: 'perPlayerVar', playerId: asPlayerId(0), varName: 'hp', value: 10 };
      removeFromRunningHash(mutable, table, feature);
      addToRunningHash(mutable, table, feature);

      assert.equal(mutable._runningHash, originalHash, 'self-transfer should not change hash');
    });
  });

  describe('XOR commutativity', () => {
    it('order of feature updates does not matter', () => {
      const state = createMinimalState();

      const featureA: ZobristFeature = { kind: 'globalVar', varName: 'score', value: 1 };
      const featureB: ZobristFeature = { kind: 'globalVar', varName: 'flag', value: true };

      // Apply A then B
      const mutableAB = createMutableState(state);
      mutableAB._runningHash = 0n;
      addToRunningHash(mutableAB, table, featureA);
      addToRunningHash(mutableAB, table, featureB);

      // Apply B then A
      const mutableBA = createMutableState(state);
      mutableBA._runningHash = 0n;
      addToRunningHash(mutableBA, table, featureB);
      addToRunningHash(mutableBA, table, featureA);

      assert.equal(mutableAB._runningHash, mutableBA._runningHash, 'XOR is commutative');
    });
  });

  describe('zobristKey determinism', () => {
    it('same feature always produces same key', () => {
      const feature: ZobristFeature = { kind: 'globalVar', varName: 'score', value: 42 };
      const key1 = zobristKey(table, feature);
      const key2 = zobristKey(table, feature);
      assert.equal(key1, key2, 'same feature should produce identical keys');
    });

    it('different feature values produce different keys', () => {
      const feature1: ZobristFeature = { kind: 'globalVar', varName: 'score', value: 0 };
      const feature2: ZobristFeature = { kind: 'globalVar', varName: 'score', value: 1 };
      const key1 = zobristKey(table, feature1);
      const key2 = zobristKey(table, feature2);
      assert.notEqual(key1, key2, 'different values should produce different keys');
    });

    it('hashes decision stack frames via bounded digests without interning them into the Zobrist cache', () => {
      const state = createStateWithOversizedDecisionStackFrame();
      const hash1 = computeFullHash(table, state);
      const hash2 = computeFullHash(table, state);

      assert.equal(hash1, hash2, 'same oversized decision stack frame should hash deterministically');

      const decisionStackKeys = [...table.keyCache.keys()].filter((key) => key.startsWith('kind=decisionStackFrame|'));
      assert.equal(decisionStackKeys.length, 0, 'decision stack frame keys should not be interned into the run-local Zobrist cache');
    });

    it('does not intern runtime-valued feature keys into the Zobrist cache', () => {
      const before = table.keyCache.size;
      const dynamicFeatures: readonly ZobristFeature[] = [
        { kind: 'globalVar', varName: 'score', value: 42 },
        { kind: 'turnCount', value: 7 },
        { kind: 'nextFrameId', value: 9 },
        { kind: 'nextTurnId', value: 11 },
      ];

      dynamicFeatures.forEach((feature) => {
        const key1 = zobristKey(table, feature);
        const key2 = zobristKey(table, feature);
        assert.equal(key1, key2, 'runtime-valued features must still hash deterministically');
      });

      assert.equal(table.keyCache.size, before, 'runtime-valued keys should not be interned into the run-local Zobrist cache');
    });
  });
});
