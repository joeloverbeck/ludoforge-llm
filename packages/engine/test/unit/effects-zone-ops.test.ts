import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { makeExecutionEffectContext, type EffectContextTestOverrides } from '../helpers/effect-context-test-helpers.js';
import {
  buildAdjacencyGraph,
  applyEffect,
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  createRng,
  isEffectErrorCode,
  nextInt,
  type EffectContext,
  type GameDef,
  type GameState,
  type Token,
  createCollector,
} from '../../src/kernel/index.js';
import { eff } from '../helpers/effect-tag-helper.js';
import { isNormalizedEffectRuntimeFailure } from '../helpers/effect-error-assertions.js';

const makeDef = (): GameDef => ({
  metadata: { id: 'effects-zone-ops-test', players: { min: 1, max: 2 } },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [
    { id: asZoneId('deck:none'), owner: 'none', visibility: 'hidden', ordering: 'stack' },
    { id: asZoneId('discard:none'), owner: 'none', visibility: 'public', ordering: 'stack' },
    { id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set', adjacentTo: [{ to: asZoneId('discard:none') }] },
  ],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [] },
  actions: [],
  triggers: [],
  terminal: { conditions: [] },
});

const token = (id: string, rank: number): Token => ({
  id: asTokenId(id),
  type: 'card',
  props: { rank },
});

const makeState = (): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  zoneVars: {},
  playerCount: 2,
  zones: {
    'deck:none': [token('d1', 1), token('d2', 2), token('d3', 3), token('d4', 1)],
    'discard:none': [token('x1', 9)],
    'board:none': [],
  },
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
});

const makeCtx = (overrides?: EffectContextTestOverrides): EffectContext => makeExecutionEffectContext({
  def: makeDef(),
  adjacencyGraph: buildAdjacencyGraph(makeDef().zones),
  state: makeState(),
  rng: createRng(123n),
  activePlayer: asPlayerId(0),
  actorPlayer: asPlayerId(0),
  bindings: {},
  moveParams: {},
  collector: createCollector(),
  ...overrides,
});

describe('effects moveAll and shuffle', () => {
  it('moveAll without filter moves all tokens and preserves source order', () => {
    const ctx = makeCtx();

    const result = applyEffect(eff({ moveAll: { from: 'deck:none', to: 'discard:none' } }), ctx);

    assert.equal(result.state.zones['deck:none']?.length, 0);
    assert.deepEqual(
      result.state.zones['discard:none']?.map((entry) => entry.id),
      [asTokenId('d1'), asTokenId('d2'), asTokenId('d3'), asTokenId('d4'), asTokenId('x1')],
    );
    assert.equal(result.rng, ctx.rng);
  });

  it('moveAll with filter moves only matching tokens and preserves relative order', () => {
    const ctx = makeCtx();

    const result = applyEffect(
      eff({
        moveAll: {
          from: 'deck:none',
          to: 'discard:none',
          filter: {
            op: '>=',
            left: { _t: 2 as const, ref: 'tokenProp', token: '$token', prop: 'rank' },
            right: 2,
          },
        },
      }),
      ctx,
    );

    assert.deepEqual(
      result.state.zones['deck:none']?.map((entry) => entry.id),
      [asTokenId('d1'), asTokenId('d4')],
    );
    assert.deepEqual(
      result.state.zones['discard:none']?.map((entry) => entry.id),
      [asTokenId('d2'), asTokenId('d3'), asTokenId('x1')],
    );
  });

  it('moveAll same source and destination is a no-op', () => {
    const ctx = makeCtx();

    const result = applyEffect(eff({ moveAll: { from: 'deck:none', to: 'deck:none' } }), ctx);

    assert.equal(result.state, ctx.state);
    assert.equal(result.rng, ctx.rng);
  });

  it('moveAll on empty source is a no-op', () => {
    const state = makeState();
    const ctx = makeCtx({
      state: {
        ...state,
        zones: {
          ...state.zones,
          'deck:none': [],
        },
      },
    });

    const result = applyEffect(eff({ moveAll: { from: 'deck:none', to: 'discard:none' } }), ctx);

    assert.equal(result.state, ctx.state);
    assert.equal(result.rng, ctx.rng);
  });

  it('shuffle yields deterministic order for known seed', () => {
    const ctx = makeCtx({ rng: createRng(7n) });
    const original = ctx.state.zones['deck:none'] ?? [];

    const expected = [...original];
    let expectedRng = ctx.rng;
    for (let index = expected.length - 1; index > 0; index -= 1) {
      const [swapIndex, nextRngState] = nextInt(expectedRng, 0, index);
      expectedRng = nextRngState;
      if (swapIndex !== index) {
        const temp = expected[index]!;
        expected[index] = expected[swapIndex]!;
        expected[swapIndex] = temp;
      }
    }

    const result = applyEffect(eff({ shuffle: { zone: 'deck:none' } }), ctx);

    assert.deepEqual(
      result.state.zones['deck:none']?.map((entry) => entry.id),
      expected.map((entry) => entry.id),
    );
    assert.deepEqual(result.rng.state, expectedRng.state);
  });

  it('shuffle advances rng state for zone size >= 2', () => {
    const ctx = makeCtx({ rng: createRng(11n) });

    const result = applyEffect(eff({ shuffle: { zone: 'deck:none' } }), ctx);

    assert.notDeepEqual(result.rng.state, ctx.rng.state);
  });

  it('shuffle leaves state and rng unchanged for zones of size 0 or 1', () => {
    const state = makeState();
    const ctx = makeCtx({
      rng: createRng(29n),
      state: {
        ...state,
        zones: {
          ...state.zones,
          'board:none': [],
          'discard:none': [token('only', 1)],
        },
      },
    });

    const emptyResult = applyEffect(eff({ shuffle: { zone: 'board:none' } }), ctx);
    assert.equal(emptyResult.state, ctx.state);
    assert.equal(emptyResult.rng, ctx.rng);

    const singleResult = applyEffect(eff({ shuffle: { zone: 'discard:none' } }), ctx);
    assert.equal(singleResult.state, ctx.state);
    assert.equal(singleResult.rng, ctx.rng);
  });

  it('moveAll emits one moveToken trace entry per token moved', () => {
    const ctx = makeCtx({
      collector: createCollector({ trace: true }),
      traceContext: { eventContext: 'actionEffect', actionId: 'test-moveAll', effectPathRoot: 'test.effects' },
      effectPath: '',
    });

    applyEffect(eff({ moveAll: { from: 'deck:none', to: 'discard:none' } }), ctx);

    const trace = ctx.collector.trace ?? [];
    assert.equal(trace.length, 4);
    for (const entry of trace) {
      assert.equal(entry.kind, 'moveToken');
      assert.equal(entry.from, 'deck:none');
      assert.equal(entry.to, 'discard:none');
      assert.equal(entry.provenance.actionId, 'test-moveAll');
      assert.equal(entry.provenance.effectPath, 'test.effects');
    }
    const first = trace[0]!;
    const last = trace[3]!;
    assert.equal(first.kind, 'moveToken');
    assert.equal(last.kind, 'moveToken');
    if (first.kind === 'moveToken') assert.equal(first.tokenId, 'd1');
    if (last.kind === 'moveToken') assert.equal(last.tokenId, 'd4');
  });

  it('moveAll with filter emits entries only for matched tokens', () => {
    const ctx = makeCtx({
      collector: createCollector({ trace: true }),
      traceContext: { eventContext: 'actionEffect', actionId: 'test-moveAll', effectPathRoot: 'test.effects' },
      effectPath: '',
    });

    applyEffect(
      eff({
        moveAll: {
          from: 'deck:none',
          to: 'discard:none',
          filter: {
            op: '>=',
            left: { _t: 2 as const, ref: 'tokenProp', token: '$token', prop: 'rank' },
            right: 2,
          },
        },
      }),
      ctx,
    );

    const trace = ctx.collector.trace ?? [];
    assert.equal(trace.length, 2);
    const first = trace[0]!;
    const second = trace[1]!;
    if (first.kind === 'moveToken') assert.equal(first.tokenId, 'd2');
    if (second.kind === 'moveToken') assert.equal(second.tokenId, 'd3');
  });

  it('shuffle emits a shuffle trace entry with provenance', () => {
    const ctx = makeCtx({
      collector: createCollector({ trace: true }),
      traceContext: { eventContext: 'actionEffect', actionId: 'test-shuffle', effectPathRoot: 'test.effects' },
      effectPath: '',
    });

    applyEffect(eff({ shuffle: { zone: 'deck:none' } }), ctx);

    const trace = ctx.collector.trace ?? [];
    assert.equal(trace.length, 1);
    const entry = trace[0]!;
    assert.equal(entry.kind, 'shuffle');
    assert.equal(entry.zone, 'deck:none');
    assert.equal(entry.provenance.actionId, 'test-shuffle');
    assert.equal(entry.provenance.effectPath, 'test.effects');
  });

  it('moveAll on empty source emits no trace entries', () => {
    const state = makeState();
    const ctx = makeCtx({
      state: { ...state, zones: { ...state.zones, 'deck:none': [] } },
      collector: createCollector({ trace: true }),
      traceContext: { eventContext: 'actionEffect', actionId: 'test-moveAll', effectPathRoot: 'test.effects' },
      effectPath: '',
    });

    applyEffect(eff({ moveAll: { from: 'deck:none', to: 'discard:none' } }), ctx);

    assert.deepEqual(ctx.collector.trace, []);
  });

  it('moveAll with same source and destination emits no trace entries', () => {
    const ctx = makeCtx({
      collector: createCollector({ trace: true }),
      traceContext: { eventContext: 'actionEffect', actionId: 'test-moveAll', effectPathRoot: 'test.effects' },
      effectPath: '',
    });

    applyEffect(eff({ moveAll: { from: 'deck:none', to: 'deck:none' } }), ctx);

    assert.deepEqual(ctx.collector.trace, []);
  });

  it('moveTokenAdjacent without direction throws SPATIAL_DESTINATION_REQUIRED', () => {
    const ctx = makeCtx();
    const effect = eff({ moveTokenAdjacent: { token: '$token', from: 'board:none' } });

    assert.throws(() => applyEffect(effect, ctx), (error: unknown) => {
      return isEffectErrorCode(error, 'SPATIAL_DESTINATION_REQUIRED');
    });
  });

  it('moveAll normalizes unresolved from selector bindings to effect runtime errors', () => {
    const ctx = makeCtx();

    assert.throws(
      () =>
        applyEffect(
          eff({
            moveAll: {
              from: { zoneExpr: { _t: 2 as const, ref: 'binding', name: '$missingFromZone' } },
              to: 'discard:none',
            },
          }),
          ctx,
        ),
      (error: unknown) => isNormalizedEffectRuntimeFailure(error, 'moveAll.from zone resolution failed'),
    );
  });

  it('moveAll normalizes unresolved to selector bindings to effect runtime errors', () => {
    const ctx = makeCtx();

    assert.throws(
      () =>
        applyEffect(
          eff({
            moveAll: {
              from: 'deck:none',
              to: { zoneExpr: { _t: 2 as const, ref: 'binding', name: '$missingToZone' } },
            },
          }),
          ctx,
        ),
      (error: unknown) => isNormalizedEffectRuntimeFailure(error, 'moveAll.to zone resolution failed'),
    );
  });

  it('shuffle normalizes unresolved zone selector bindings to effect runtime errors', () => {
    const ctx = makeCtx();

    assert.throws(
      () => applyEffect(eff({ shuffle: { zone: { zoneExpr: { _t: 2 as const, ref: 'binding', name: '$missingZone' } } } }), ctx),
      (error: unknown) => isNormalizedEffectRuntimeFailure(error, 'shuffle.zone resolution failed'),
    );
  });

  it('moveTokenAdjacent normalizes unresolved from selector bindings to effect runtime errors', () => {
    const ctx = makeCtx();

    assert.throws(
      () =>
        applyEffect(
          eff({
            moveTokenAdjacent: {
              token: '$token',
              from: { zoneExpr: { _t: 2 as const, ref: 'binding', name: '$missingFromZone' } },
              direction: 'discard:none',
            },
          }),
          ctx,
        ),
      (error: unknown) => isNormalizedEffectRuntimeFailure(error, 'moveTokenAdjacent.from zone resolution failed'),
    );
  });
});
