import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyEffects,
  asPhaseId,
  asPlayerId,
  asTokenId,
  buildAdjacencyGraph,
  computeFullHash,
  createCollector,
  createGameDefRuntime,
  createRng,
  createZobristTable,
  type EffectAST,
  type GameDef,
  type GameState,
  type Token,
} from '../../../src/kernel/index.js';
import { makeExecutionEffectContext } from '../../helpers/effect-context-test-helpers.js';
import { eff } from '../../helpers/effect-tag-helper.js';

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const makeDef = (): GameDef =>
  ({
    metadata: { id: 'zobrist-tokens-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    globalMarkerLattices: [],
    zones: [
      { id: 'hand:none', owner: 'none', visibility: 'hidden', ordering: 'stack' },
      { id: 'discard:none', owner: 'none', visibility: 'open', ordering: 'stack' },
      { id: 'board:none', owner: 'none', visibility: 'open', ordering: 'stack' },
    ],
    tokenTypes: [
      { id: 'card', props: { suit: { type: 'enum', values: ['hearts', 'spades'], default: 'hearts' } } },
    ],
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

const tok = (id: string, props?: Record<string, string | number | boolean>): Token => ({
  id: asTokenId(id),
  type: 'card',
  props: props ?? { suit: 'hearts' },
});

const makeState = (def: GameDef, table: ReturnType<typeof createZobristTable>, zones?: Record<string, readonly Token[]>): GameState => {
  const base: GameState = {
    globalVars: {},
    perPlayerVars: { 0: {}, 1: {} },
    zoneVars: {},
    playerCount: 2,
    zones: zones ?? {
      'hand:none': [tok('tok_card_0'), tok('tok_card_1'), tok('tok_card_2')],
      'discard:none': [tok('tok_card_3')],
      'board:none': [],
    },
    nextTokenOrdinal: 4,
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
  globalMarkers: undefined,
  activeLastingEffects: undefined,
  interruptPhaseStack: undefined,
  };
  const fullHash = computeFullHash(table, base);
  return { ...base, stateHash: fullHash, _runningHash: fullHash };
};

const makeCtx = (
  def: GameDef,
  state: GameState,
  opts?: { noCachedRuntime?: boolean; bindings?: Record<string, unknown> },
) => {
  const runtime = opts?.noCachedRuntime ? undefined : createGameDefRuntime(def);
  const baseCtx = makeExecutionEffectContext({
    def,
    adjacencyGraph: buildAdjacencyGraph(def.zones),
    state,
    rng: createRng(42n),
    activePlayer: state.activePlayer,
    actorPlayer: asPlayerId(0),
    bindings: opts?.bindings ?? {},
    moveParams: {},
    collector: createCollector(),
  });
  return runtime ? { ...baseCtx, cachedRuntime: runtime } : baseCtx;
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('zobrist incremental hash — token effect handlers', () => {
  const def = makeDef();
  const table = createZobristTable(def);

  describe('moveToken', () => {
    it('updates _runningHash to match full recompute', () => {
      const state = makeState(def, table);
      const ctx = makeCtx(def, state, { bindings: { $tok: 'tok_card_1' } });

      const effect: EffectAST = eff({
        moveToken: { token: '$tok', from: 'hand:none', to: 'discard:none' },
      });
      const result = applyEffects([effect], ctx);

      const expected = computeFullHash(table, result.state);
      assert.equal(result.state._runningHash, expected, 'incremental hash must match full recompute after moveToken');
    });

    it('updates _runningHash for same-zone move', () => {
      const state = makeState(def, table);
      const ctx = makeCtx(def, state, { bindings: { $tok: 'tok_card_1' } });

      const effect: EffectAST = eff({
        moveToken: { token: '$tok', from: 'hand:none', to: 'hand:none', position: 'bottom' },
      });
      const result = applyEffects([effect], ctx);

      const expected = computeFullHash(table, result.state);
      assert.equal(result.state._runningHash, expected, 'incremental hash must match full recompute for same-zone moveToken');
    });
  });

  describe('moveTokenAdjacent', () => {
    it('delegates to moveToken — _runningHash matches full recompute', () => {
      const adjDef = {
        ...def,
        zones: [
          { id: 'zoneA:none', owner: 'none', visibility: 'open', ordering: 'stack', adjacentTo: [{ to: 'zoneB:none' }] },
          { id: 'zoneB:none', owner: 'none', visibility: 'open', ordering: 'stack', adjacentTo: [{ to: 'zoneA:none' }] },
        ],
      } as unknown as GameDef;
      const adjTable = createZobristTable(adjDef);
      const adjState = makeState(adjDef, adjTable, {
        'zoneA:none': [tok('tok_card_0')],
        'zoneB:none': [],
      });
      const adjCtx = makeCtx(adjDef, adjState, {
        bindings: { $tok: 'tok_card_0', $destZone: 'zoneB:none' },
      });

      const effect: EffectAST = eff({
        moveTokenAdjacent: { token: '$tok', from: 'zoneA:none', direction: '$destZone' },
      });
      const result = applyEffects([effect], adjCtx);

      const expected = computeFullHash(adjTable, result.state);
      assert.equal(result.state._runningHash, expected, 'incremental hash must match full recompute after moveTokenAdjacent');
    });
  });

  describe('createToken', () => {
    it('updates _runningHash to match full recompute', () => {
      const state = makeState(def, table);
      const ctx = makeCtx(def, state);

      const effect: EffectAST = eff({
        createToken: { type: 'card', zone: 'board:none', props: { suit: 'spades' } },
      });
      const result = applyEffects([effect], ctx);

      const expected = computeFullHash(table, result.state);
      assert.equal(result.state._runningHash, expected, 'incremental hash must match full recompute after createToken');
    });
  });

  describe('destroyToken', () => {
    it('updates _runningHash to match full recompute', () => {
      const state = makeState(def, table);
      const ctx = makeCtx(def, state, { bindings: { $tok: 'tok_card_3' } });

      const effect: EffectAST = eff({
        destroyToken: { token: '$tok' },
      });
      const result = applyEffects([effect], ctx);

      const expected = computeFullHash(table, result.state);
      assert.equal(result.state._runningHash, expected, 'incremental hash must match full recompute after destroyToken');
    });
  });

  describe('draw', () => {
    it('updates _runningHash for single-token draw', () => {
      const state = makeState(def, table);
      const ctx = makeCtx(def, state);

      const effect: EffectAST = eff({
        draw: { from: 'hand:none', to: 'board:none', count: 1 },
      });
      const result = applyEffects([effect], ctx);

      const expected = computeFullHash(table, result.state);
      assert.equal(result.state._runningHash, expected, 'incremental hash must match full recompute after single draw');
    });

    it('updates _runningHash for multi-token draw', () => {
      const state = makeState(def, table);
      const ctx = makeCtx(def, state);

      const effect: EffectAST = eff({
        draw: { from: 'hand:none', to: 'board:none', count: 2 },
      });
      const result = applyEffects([effect], ctx);

      const expected = computeFullHash(table, result.state);
      assert.equal(result.state._runningHash, expected, 'incremental hash must match full recompute after multi draw');
    });
  });

  describe('moveAll', () => {
    it('updates _runningHash for all matched tokens', () => {
      const state = makeState(def, table);
      const ctx = makeCtx(def, state);

      const effect: EffectAST = eff({
        moveAll: { from: 'hand:none', to: 'board:none' },
      });
      const result = applyEffects([effect], ctx);

      const expected = computeFullHash(table, result.state);
      assert.equal(result.state._runningHash, expected, 'incremental hash must match full recompute after moveAll');
    });
  });

  describe('shuffle', () => {
    it('updates _runningHash for all slot reassignments', () => {
      const state = makeState(def, table);
      const ctx = makeCtx(def, state);

      const effect: EffectAST = eff({
        shuffle: { zone: 'hand:none' },
      });
      const result = applyEffects([effect], ctx);

      const expected = computeFullHash(table, result.state);
      assert.equal(result.state._runningHash, expected, 'incremental hash must match full recompute after shuffle');
    });
  });

  describe('setTokenProp', () => {
    it('does NOT modify _runningHash', () => {
      const state = makeState(def, table);
      const ctx = makeCtx(def, state, { bindings: { $tok: 'tok_card_0' } });

      const effect: EffectAST = eff({
        setTokenProp: { token: '$tok', prop: 'suit', value: 'spades' },
      });
      const result = applyEffects([effect], ctx);

      const expected = computeFullHash(table, result.state);
      assert.equal(result.state._runningHash, expected, 'hash must still match full recompute after setTokenProp');
      assert.equal(result.state._runningHash, state._runningHash, 'hash must not change from setTokenProp alone');
    });
  });

  describe('graceful degradation without zobristTable', () => {
    it('moveToken works without cachedRuntime', () => {
      const state = makeState(def, table);
      const ctx = makeCtx(def, state, { noCachedRuntime: true, bindings: { $tok: 'tok_card_1' } });

      const effect: EffectAST = eff({
        moveToken: { token: '$tok', from: 'hand:none', to: 'discard:none' },
      });
      // Should not throw — hash update is skipped gracefully
      const result = applyEffects([effect], ctx);
      assert.ok(result.state, 'moveToken completes without cachedRuntime');
    });
  });
});
