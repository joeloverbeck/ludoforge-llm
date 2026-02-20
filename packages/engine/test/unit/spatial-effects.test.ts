import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyEffect,
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  buildAdjacencyGraph,
  createRng,
  isEffectErrorCode,
  type EffectContext,
  type GameDef,
  type GameState,
  type Token,
  createCollector,
} from '../../src/kernel/index.js';

const makeDef = (): GameDef => ({
  metadata: { id: 'spatial-effects-test', players: { min: 1, max: 2 } },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [
    { id: asZoneId('a:none'), owner: 'none', visibility: 'public', ordering: 'set', adjacentTo: [{ to: asZoneId('b:none') }] },
    { id: asZoneId('b:none'), owner: 'none', visibility: 'public', ordering: 'set', adjacentTo: [{ to: asZoneId('a:none') }] },
    { id: asZoneId('c:none'), owner: 'none', visibility: 'public', ordering: 'set' },
  ],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [] },
  actions: [],
  triggers: [],
  terminal: { conditions: [] },
});

const token = (id: string): Token => ({ id: asTokenId(id), type: 'pawn', props: {} });

const makeState = (): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  playerCount: 2,
  zones: {
    'a:none': [token('t1'), token('t2')],
    'b:none': [token('u1')],
    'c:none': [],
  },
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [1n, 2n] },
  stateHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
});

const makeCtx = (overrides?: Partial<EffectContext>): EffectContext => {
  const def = makeDef();
  return {
    def,
    adjacencyGraph: buildAdjacencyGraph(def.zones),
    state: makeState(),
    rng: createRng(101n),
    activePlayer: asPlayerId(0),
    actorPlayer: asPlayerId(0),
    bindings: {},
    moveParams: {},
    collector: createCollector(),
    ...overrides,
  };
};

describe('moveTokenAdjacent spatial runtime', () => {
  it('moves a token to an adjacent zone, conserves token count, and emits tokenEntered', () => {
    const ctx = makeCtx();
    const movingToken = ctx.state.zones['a:none']?.[0];
    assert.ok(movingToken !== undefined);

    const totalBefore = Object.values(ctx.state.zones).reduce((sum, zoneTokens) => sum + zoneTokens.length, 0);
    const result = applyEffect(
      { moveTokenAdjacent: { token: '$token', from: 'a:none', direction: 'b:none' } },
      { ...ctx, bindings: { $token: movingToken } },
    );
    const totalAfter = Object.values(result.state.zones).reduce((sum, zoneTokens) => sum + zoneTokens.length, 0);

    assert.equal(totalAfter, totalBefore);
    assert.equal(result.state.zones['a:none']?.length, 1);
    assert.equal(result.state.zones['b:none']?.[0]?.id, movingToken.id);
    assert.deepEqual(result.emittedEvents, [{ type: 'tokenEntered', zone: asZoneId('b:none') }]);
    assert.equal(result.rng, ctx.rng);
  });

  it('throws SPATIAL_DESTINATION_NOT_ADJACENT when destination is not adjacent', () => {
    const ctx = makeCtx();
    const movingToken = ctx.state.zones['a:none']?.[0];
    assert.ok(movingToken !== undefined);

    assert.throws(
      () =>
        applyEffect(
          { moveTokenAdjacent: { token: '$token', from: 'a:none', direction: 'c:none' } },
          { ...ctx, bindings: { $token: movingToken } },
        ),
      (error: unknown) => isEffectErrorCode(error, 'SPATIAL_DESTINATION_NOT_ADJACENT'),
    );
  });

  it('throws SPATIAL_DESTINATION_REQUIRED when direction is omitted', () => {
    const ctx = makeCtx();
    const movingToken = ctx.state.zones['a:none']?.[0];
    assert.ok(movingToken !== undefined);

    assert.throws(
      () => applyEffect({ moveTokenAdjacent: { token: '$token', from: 'a:none' } }, { ...ctx, bindings: { $token: movingToken } }),
      (error: unknown) => isEffectErrorCode(error, 'SPATIAL_DESTINATION_REQUIRED'),
    );
  });

  it('resolves $destination from moveParams or bindings', () => {
    const moveParamCtx = makeCtx({ moveParams: { $to: asZoneId('b:none') } });
    const moveParamToken = moveParamCtx.state.zones['a:none']?.[0];
    assert.ok(moveParamToken !== undefined);

    const moveParamResult = applyEffect(
      { moveTokenAdjacent: { token: '$token', from: 'a:none', direction: '$to' } },
      { ...moveParamCtx, bindings: { $token: moveParamToken } },
    );
    assert.equal(moveParamResult.state.zones['b:none']?.[0]?.id, moveParamToken.id);

    const bindingCtx = makeCtx({ bindings: { $to: asZoneId('b:none') } });
    const bindingToken = bindingCtx.state.zones['a:none']?.[0];
    assert.ok(bindingToken !== undefined);

    const bindingResult = applyEffect(
      { moveTokenAdjacent: { token: '$token', from: 'a:none', direction: '$to' } },
      { ...bindingCtx, bindings: { ...bindingCtx.bindings, $token: bindingToken } },
    );
    assert.equal(bindingResult.state.zones['b:none']?.[0]?.id, bindingToken.id);
  });
});
