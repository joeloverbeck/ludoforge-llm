// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyEffects,
  asPhaseId,
  asPlayerId,
  buildAdjacencyGraph,
  computeFullHash,
  createCollector,
  createGameDefRuntime,
  createRng,
  createZobristTable,
  type EffectAST,
  type GameDef,
  type GameState,
} from '../../../src/kernel/index.js';
import { createDraftTracker, createMutableState } from '../../../src/kernel/state-draft.js';
import { makeExecutionEffectContext } from '../../helpers/effect-context-test-helpers.js';
import { eff } from '../../helpers/effect-tag-helper.js';

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const makeDef = (): GameDef =>
  ({
    metadata: { id: 'zobrist-markers-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    markerLattices: [
      {
        id: 'support',
        states: ['passive-opposition', 'active-opposition', 'neutral', 'passive-support', 'active-support'],
        defaultState: 'neutral',
      },
    ],
    globalMarkerLattices: [
      {
        id: 'capability',
        states: ['inactive', 'active', 'shaded'],
        defaultState: 'inactive',
      },
      {
        id: 'toggle',
        states: ['off', 'on'],
        defaultState: 'off',
      },
    ],
    zones: [{ id: 'board:none', owner: 'none', visibility: 'open', ordering: 'set' }],
    tokenTypes: [{ id: 'piece', props: {} }],
    turnStructure: { phases: [{ id: 'main' }] },
    actions: [
      {
        id: 'act',
        actor: 'active',
        executor: 'actor',
        phase: ['main'],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
    ],
    triggers: [],
    setup: [],
  }) as unknown as GameDef;

const makeState = (_def: GameDef, table: ReturnType<typeof createZobristTable>): GameState => {
  const base: GameState = {
    globalVars: {},
    perPlayerVars: { 0: {}, 1: {} },
    zoneVars: {},
    playerCount: 2,
    zones: { 'board:none': [] },
    nextTokenOrdinal: 0,
    currentPhase: asPhaseId('main'),
    activePlayer: asPlayerId(0),
    turnCount: 0,
    rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
    stateHash: 0n,
    _runningHash: 0n,
    actionUsage: {},
    turnOrderState: { type: 'roundRobin' },
    markers: {},
    reveals: undefined,
    globalMarkers: {},
    activeLastingEffects: undefined,
    interruptPhaseStack: undefined,
  };
  const fullHash = computeFullHash(table, base);
  return { ...base, stateHash: fullHash, _runningHash: fullHash };
};

const makeCtx = (def: GameDef, state: GameState, opts?: { noCachedRuntime?: boolean }) => {
  const runtime = opts?.noCachedRuntime ? undefined : createGameDefRuntime(def);
  const baseCtx = makeExecutionEffectContext({
    def,
    adjacencyGraph: buildAdjacencyGraph([]),
    state,
    rng: createRng(42n),
    activePlayer: state.activePlayer,
    actorPlayer: asPlayerId(0),
    bindings: {},
    moveParams: {},
    collector: createCollector(),
  });
  return runtime ? { ...baseCtx, cachedRuntime: runtime } : baseCtx;
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('zobrist incremental hash — marker effect handlers', () => {
  const def = makeDef();
  const table = createZobristTable(def);

  describe('applySetMarker', () => {
    it('updates _runningHash to match full recompute', () => {
      const state = makeState(def, table);
      const ctx = makeCtx(def, state);

      const effect: EffectAST = eff({ setMarker: { space: 'board:none', marker: 'support', state: 'active-support' } });
      const result = applyEffects([effect], ctx);

      const expected = computeFullHash(table, result.state);
      assert.equal(result.state._runningHash, expected, 'incremental hash must match full recompute after setMarker');
    });

    it('setting marker to current state produces no net hash change', () => {
      // First set to a non-default state
      const state = makeState(def, table);
      const ctx1 = makeCtx(def, state);
      const setup: EffectAST = eff({ setMarker: { space: 'board:none', marker: 'support', state: 'passive-support' } });
      const setupResult = applyEffects([setup], ctx1);

      // Now set to the same value again
      const ctx2 = makeCtx(def, setupResult.state);
      const noop: EffectAST = eff({ setMarker: { space: 'board:none', marker: 'support', state: 'passive-support' } });
      const result = applyEffects([noop], ctx2);

      assert.equal(result.state._runningHash, setupResult.state._runningHash, 'hash must not change when setting same state');
    });
  });

  describe('applyShiftMarker', () => {
    it('forward shift updates _runningHash to match full recompute', () => {
      const state = makeState(def, table);
      const ctx = makeCtx(def, state);

      // neutral (index 2) + delta 1 = passive-support (index 3)
      const effect: EffectAST = eff({ shiftMarker: { space: 'board:none', marker: 'support', delta: 1 } });
      const result = applyEffects([effect], ctx);

      const expected = computeFullHash(table, result.state);
      assert.equal(result.state._runningHash, expected, 'incremental hash must match full recompute after shiftMarker forward');
    });

    it('backward shift updates _runningHash to match full recompute', () => {
      const state = makeState(def, table);
      const ctx = makeCtx(def, state);

      // neutral (index 2) - 1 = active-opposition (index 1)
      const effect: EffectAST = eff({ shiftMarker: { space: 'board:none', marker: 'support', delta: -1 } });
      const result = applyEffects([effect], ctx);

      const expected = computeFullHash(table, result.state);
      assert.equal(result.state._runningHash, expected, 'incremental hash must match full recompute after shiftMarker backward');
    });
  });

  describe('applySetGlobalMarker', () => {
    it('updates _runningHash to match full recompute', () => {
      const state = makeState(def, table);
      const ctx = makeCtx(def, state);

      const effect: EffectAST = eff({ setGlobalMarker: { marker: 'capability', state: 'active' } });
      const result = applyEffects([effect], ctx);

      const expected = computeFullHash(table, result.state);
      assert.equal(result.state._runningHash, expected, 'incremental hash must match full recompute after setGlobalMarker');
    });

    it('tracker-backed path clones globalMarkers before mutation and preserves the original state', () => {
      const baseState = {
        ...makeState(def, table),
        globalMarkers: { capability: 'inactive' },
      };
      const mutable = createMutableState(baseState);
      const tracker = createDraftTracker();
      const preMutationGlobalMarkers = mutable.globalMarkers;
      const ctx = { ...makeCtx(def, mutable), tracker };

      const effect: EffectAST = eff({ setGlobalMarker: { marker: 'capability', state: 'active' } });
      const result = applyEffects([effect], ctx);

      assert.equal(tracker.globalMarkers, true);
      assert.notEqual(result.state.globalMarkers, preMutationGlobalMarkers);
      assert.deepEqual(baseState.globalMarkers, { capability: 'inactive' });
      assert.deepEqual(result.state.globalMarkers, { capability: 'active' });
    });
  });

  describe('applyFlipGlobalMarker', () => {
    it('updates _runningHash to match full recompute', () => {
      const state = makeState(def, table);
      const ctx = makeCtx(def, state);

      // Toggle starts at 'off'; flip to 'on'
      const effect: EffectAST = eff({ flipGlobalMarker: { marker: 'toggle', stateA: 'off', stateB: 'on' } });
      const result = applyEffects([effect], ctx);

      const expected = computeFullHash(table, result.state);
      assert.equal(result.state._runningHash, expected, 'incremental hash must match full recompute after flipGlobalMarker');
    });

    it('flipping twice produces hash matching full recompute', () => {
      const state = makeState(def, table);

      // First flip: off → on
      const ctx1 = makeCtx(def, state);
      const flip1: EffectAST = eff({ flipGlobalMarker: { marker: 'toggle', stateA: 'off', stateB: 'on' } });
      const r1 = applyEffects([flip1], ctx1);

      // Second flip: on → off
      const ctx2 = makeCtx(def, r1.state);
      const flip2: EffectAST = eff({ flipGlobalMarker: { marker: 'toggle', stateA: 'off', stateB: 'on' } });
      const r2 = applyEffects([flip2], ctx2);

      const expected = computeFullHash(table, r2.state);
      assert.equal(r2.state._runningHash, expected, 'incremental hash must match full recompute after double flip');
    });
  });

  describe('applyShiftGlobalMarker', () => {
    it('updates _runningHash to match full recompute', () => {
      const state = makeState(def, table);
      const ctx = makeCtx(def, state);

      // capability: inactive (index 0) + delta 2 = shaded (index 2)
      const effect: EffectAST = eff({ shiftGlobalMarker: { marker: 'capability', delta: 2 } });
      const result = applyEffects([effect], ctx);

      const expected = computeFullHash(table, result.state);
      assert.equal(result.state._runningHash, expected, 'incremental hash must match full recompute after shiftGlobalMarker');
    });
  });

  describe('guard: no cachedRuntime', () => {
    it('does not crash when cachedRuntime is undefined', () => {
      const state = makeState(def, table);
      const ctx = makeCtx(def, state, { noCachedRuntime: true });

      const effect: EffectAST = eff({ setMarker: { space: 'board:none', marker: 'support', state: 'active-support' } });
      // Must not throw
      const result = applyEffects([effect], ctx);

      // Marker was changed, but hash was not updated (no table available)
      assert.equal(result.state.markers['board:none']?.['support'], 'active-support', 'marker must still be updated');
      assert.equal(result.state._runningHash, state._runningHash, 'hash must not change when no zobrist table');
    });
  });

  describe('multiple marker effects in sequence', () => {
    it('incremental hash matches full recompute after a sequence of marker mutations', () => {
      const state = makeState(def, table);
      const ctx = makeCtx(def, state);

      const effects: EffectAST[] = [
        eff({ setMarker: { space: 'board:none', marker: 'support', state: 'passive-opposition' } }),
        eff({ setGlobalMarker: { marker: 'capability', state: 'shaded' } }),
        eff({ flipGlobalMarker: { marker: 'toggle', stateA: 'off', stateB: 'on' } }),
      ];
      const result = applyEffects(effects, ctx);

      const expected = computeFullHash(table, result.state);
      assert.equal(result.state._runningHash, expected, 'incremental hash must match full recompute after multiple marker effects');
    });
  });
});
