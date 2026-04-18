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
import { makeExecutionEffectContext } from '../../helpers/effect-context-test-helpers.js';
import { eff } from '../../helpers/effect-tag-helper.js';

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const makeDef = (): GameDef =>
  ({
    metadata: { id: 'zobrist-phase-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [
      { name: 'score', type: 'int', init: 0, min: 0, max: 100 },
    ],
    perPlayerVars: [],
    globalMarkerLattices: [],
    zones: [{ id: 'deck:none', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
    tokenTypes: [{ id: 'card', props: {} }],
    turnStructure: {
      phases: [
        { id: 'setup' },
        { id: 'main' },
        { id: 'cleanup' },
      ],
    },
    actions: [
      {
        id: 'act',
        actor: 'active',
        executor: 'actor',
        phase: ['setup', 'main', 'cleanup'],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [{ scope: 'phase', max: 2 }],
      },
    ],
    triggers: [],
    setup: [],
  }) as unknown as GameDef;

const makeState = (_def: GameDef, table: ReturnType<typeof createZobristTable>): GameState => {
  const base: GameState = {
    globalVars: { score: 5 },
    perPlayerVars: { 0: {}, 1: {} },
    zoneVars: {},
    playerCount: 2,
    zones: { 'deck:none': [] },
    nextTokenOrdinal: 0,
    currentPhase: asPhaseId('setup'),
    activePlayer: asPlayerId(0),
    turnCount: 0,
    rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
    stateHash: 0n,
    _runningHash: 0n,
    actionUsage: {
      act: { turnCount: 1, phaseCount: 1, gameCount: 3 },
    },
    turnOrderState: { type: 'roundRobin' },
    markers: {},
  reveals: undefined,
  globalMarkers: undefined,
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
    adjacencyGraph: buildAdjacencyGraph(def.zones),
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

describe('zobrist incremental hash — phase and turn-flow effect handlers', () => {
  const def = makeDef();
  const table = createZobristTable(def);

  describe('gotoPhaseExact', () => {
    it('updates _runningHash to match full recompute after phase change', () => {
      const state = makeState(def, table);
      const ctx = makeCtx(def, state);

      const effect: EffectAST = eff({ gotoPhaseExact: { phase: 'main' } });
      const result = applyEffects([effect], ctx);

      assert.equal(
        String(result.state.currentPhase),
        'main',
        'phase should have changed',
      );
      const expected = computeFullHash(table, result.state);
      assert.equal(
        result.state._runningHash,
        expected,
        'incremental hash must match full recompute after gotoPhaseExact',
      );
    });

    it('no-ops when target phase equals current phase', () => {
      const state = makeState(def, table);
      const ctx = makeCtx(def, state);

      const effect: EffectAST = eff({ gotoPhaseExact: { phase: 'setup' } });
      const result = applyEffects([effect], ctx);

      assert.equal(result.state._runningHash, state._runningHash, 'hash must not change when phase is unchanged');
    });

    it('resets phaseCount usage when changing phase', () => {
      const state = makeState(def, table);
      assert.equal(state.actionUsage.act?.phaseCount, 1, 'precondition: phaseCount > 0');

      const ctx = makeCtx(def, state);
      const effect: EffectAST = eff({ gotoPhaseExact: { phase: 'main' } });
      const result = applyEffects([effect], ctx);

      assert.equal(result.state.actionUsage.act?.phaseCount, 0, 'phaseCount should be reset');
      const expected = computeFullHash(table, result.state);
      assert.equal(
        result.state._runningHash,
        expected,
        'incremental hash must match full recompute after phase change with usage reset',
      );
    });
  });

  describe('gotoPhaseExact — skip to non-adjacent phase', () => {
    it('updates _runningHash when jumping multiple phases forward', () => {
      const state = makeState(def, table);
      const ctx = makeCtx(def, state);

      const effect: EffectAST = eff({ gotoPhaseExact: { phase: 'cleanup' } });
      const result = applyEffects([effect], ctx);

      assert.equal(String(result.state.currentPhase), 'cleanup');
      const expected = computeFullHash(table, result.state);
      assert.equal(
        result.state._runningHash,
        expected,
        'incremental hash must match full recompute after multi-phase jump',
      );
    });
  });

  describe('advancePhase', () => {
    it('updates _runningHash to match full recompute after advancing', () => {
      const state = makeState(def, table);
      const ctx = makeCtx(def, state);

      const effect: EffectAST = eff({ advancePhase: {} });
      const result = applyEffects([effect], ctx);

      // Should have advanced from 'setup' to 'main'
      assert.equal(String(result.state.currentPhase), 'main');
      const expected = computeFullHash(table, result.state);
      assert.equal(
        result.state._runningHash,
        expected,
        'incremental hash must match full recompute after advancePhase',
      );
    });

    it('updates _runningHash correctly through turn-wrap (last phase)', () => {
      // Start at last phase to trigger turn wrap
      const baseState = makeState(def, table);
      const atCleanup: GameState = {
        ...baseState,
        currentPhase: asPhaseId('cleanup'),
      };
      const fullHash = computeFullHash(table, atCleanup);
      const state = { ...atCleanup, stateHash: fullHash, _runningHash: fullHash };

      const ctx = makeCtx(def, state);
      const effect: EffectAST = eff({ advancePhase: {} });
      const result = applyEffects([effect], ctx);

      // Turn wrap: turnCount should have incremented
      assert.ok(result.state.turnCount > state.turnCount, 'turn should have wrapped');
      const expected = computeFullHash(table, result.state);
      assert.equal(
        result.state._runningHash,
        expected,
        'incremental hash must match full recompute after turn-wrap advance',
      );
    });
  });

  describe('guard: no cachedRuntime', () => {
    it('does not crash when cachedRuntime is undefined', () => {
      const state = makeState(def, table);
      const ctx = makeCtx(def, state, { noCachedRuntime: true });

      const effect: EffectAST = eff({ gotoPhaseExact: { phase: 'main' } });
      const result = applyEffects([effect], ctx);

      assert.equal(String(result.state.currentPhase), 'main', 'phase must still change');
    });
  });
});
