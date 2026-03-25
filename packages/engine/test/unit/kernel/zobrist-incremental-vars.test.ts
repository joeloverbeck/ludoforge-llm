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
import { makeExecutionEffectContext } from '../../helpers/effect-context-test-helpers.js';
import { eff } from '../../helpers/effect-tag-helper.js';

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const makeDef = (): GameDef =>
  ({
    metadata: { id: 'zobrist-vars-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [
      { name: 'score', type: 'int', init: 0, min: 0, max: 100 },
      { name: 'flag', type: 'boolean', init: false },
    ],
    perPlayerVars: [
      { name: 'hp', type: 'int', init: 10, min: 0, max: 50 },
      { name: 'gold', type: 'int', init: 0, min: 0, max: 999 },
    ],
    globalMarkerLattices: [],
    zones: [{ id: 'deck:none', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
    tokenTypes: [{ id: 'card', props: {} }],
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
    globalVars: { score: 5, flag: false },
    perPlayerVars: {
      0: { hp: 10, gold: 20 },
      1: { hp: 8, gold: 15 },
    },
    zoneVars: {},
    playerCount: 2,
    zones: { 'deck:none': [] },
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
  };
  const fullHash = computeFullHash(table, base);
  return { ...base, stateHash: fullHash, _runningHash: fullHash };
};

/**
 * Create an EffectContext with cachedRuntime containing the zobristTable,
 * suitable for use with `applyEffects` (which creates a tracker internally).
 */
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
  // Spread in cachedRuntime — the test helper doesn't expose it in its options type
  return runtime ? { ...baseCtx, cachedRuntime: runtime } : baseCtx;
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('zobrist incremental hash — variable effect handlers', () => {
  const def = makeDef();
  const table = createZobristTable(def);

  describe('applySetVar on global variable', () => {
    it('updates _runningHash to match full recompute', () => {
      const state = makeState(def, table);
      const ctx = makeCtx(def, state);

      const effect: EffectAST = eff({ setVar: { scope: 'global', var: 'score', value: 42 } });
      const result = applyEffects([effect], ctx);

      const expected = computeFullHash(table, result.state);
      assert.equal(result.state._runningHash, expected, 'incremental hash must match full recompute after setVar on global');
    });
  });

  describe('applySetVar on per-player variable', () => {
    it('updates _runningHash to match full recompute', () => {
      const state = makeState(def, table);
      const ctx = makeCtx(def, state);

      const effect: EffectAST = eff({ setVar: { scope: 'pvar', player: 'actor', var: 'hp', value: 3 } });
      const result = applyEffects([effect], ctx);

      const expected = computeFullHash(table, result.state);
      assert.equal(result.state._runningHash, expected, 'incremental hash must match full recompute after setVar on pvar');
    });
  });

  describe('applySetVar with no change (same value)', () => {
    it('_runningHash remains unchanged', () => {
      const state = makeState(def, table);
      const ctx = makeCtx(def, state);

      // Set score to its current value (5)
      const effect: EffectAST = eff({ setVar: { scope: 'global', var: 'score', value: 5 } });
      const result = applyEffects([effect], ctx);

      assert.equal(result.state._runningHash, state._runningHash, 'hash must not change when value is unchanged');
    });
  });

  describe('applyAddVar on global variable', () => {
    it('updates _runningHash to match full recompute', () => {
      const state = makeState(def, table);
      const ctx = makeCtx(def, state);

      const effect: EffectAST = eff({ addVar: { scope: 'global', var: 'score', delta: 10 } });
      const result = applyEffects([effect], ctx);

      const expected = computeFullHash(table, result.state);
      assert.equal(result.state._runningHash, expected, 'incremental hash must match full recompute after addVar on global');
    });
  });

  describe('applyTransferVar between two per-player variables', () => {
    it('updates _runningHash to match full recompute', () => {
      const state = makeState(def, table);
      const ctx = makeCtx(def, state);

      const effect: EffectAST = eff({
        transferVar: {
          from: { scope: 'pvar', var: 'gold', player: 'active' },
          to: { scope: 'pvar', var: 'gold', player: { id: asPlayerId(1) } },
          amount: 5,
        },
      });
      const result = applyEffects([effect], ctx);

      const expected = computeFullHash(table, result.state);
      assert.equal(result.state._runningHash, expected, 'incremental hash must match full recompute after transferVar');
    });
  });

  describe('applySetActivePlayer', () => {
    it('updates _runningHash to match full recompute', () => {
      const state = makeState(def, table);
      const ctx = makeCtx(def, state);

      const effect: EffectAST = eff({ setActivePlayer: { player: { id: asPlayerId(1) } } });
      const result = applyEffects([effect], ctx);

      const expected = computeFullHash(table, result.state);
      assert.equal(result.state._runningHash, expected, 'incremental hash must match full recompute after setActivePlayer');
    });
  });

  describe('guard: no cachedRuntime', () => {
    it('does not crash when cachedRuntime is undefined', () => {
      const state = makeState(def, table);
      const ctx = makeCtx(def, state, { noCachedRuntime: true });

      const effect: EffectAST = eff({ setVar: { scope: 'global', var: 'score', value: 99 } });
      // Must not throw
      const result = applyEffects([effect], ctx);

      // Variable was changed, but hash was not updated (no table available)
      assert.equal(result.state.globalVars.score, 99, 'value must still be updated');
      // Hash stays as the original running hash (no incremental update, no full recompute)
      assert.equal(result.state._runningHash, state._runningHash, 'hash must not change when no zobrist table');
    });
  });

  describe('multiple variable effects in sequence', () => {
    it('incremental hash matches full recompute after a sequence of variable mutations', () => {
      const state = makeState(def, table);
      const ctx = makeCtx(def, state);

      const effects: EffectAST[] = [
        eff({ setVar: { scope: 'global', var: 'score', value: 42 } }),
        eff({ addVar: { scope: 'pvar', player: 'active', var: 'hp', delta: -3 } }),
        eff({ setActivePlayer: { player: { id: asPlayerId(1) } } }),
      ];
      const result = applyEffects(effects, ctx);

      const expected = computeFullHash(table, result.state);
      assert.equal(result.state._runningHash, expected, 'incremental hash must match full recompute after multiple effects');
    });
  });
});
