import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  buildAdjacencyGraph,
  createCollector,
  queryAdjacentZones,
  queryConnectedZones,
  queryTokensInAdjacentZones,
  type EvalContext,
  type GameDef,
  type GameState,
  type Token,
} from '../../src/kernel/index.js';

const makeToken = (id: string): Token => ({
  id: asTokenId(id),
  type: 'pawn',
  props: {},
});

const makeDef = (): GameDef => ({
  metadata: { id: 'spatial-queries-test', players: { min: 1, max: 2 } },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [
    { id: asZoneId('a:none'), owner: 'none', visibility: 'public', ordering: 'set', adjacentTo: [{ to: asZoneId('c:none') }, { to: asZoneId('b:none') }] },
    { id: asZoneId('b:none'), owner: 'none', visibility: 'public', ordering: 'set', adjacentTo: [{ to: asZoneId('a:none') }, { to: asZoneId('d:none') }] },
    { id: asZoneId('c:none'), owner: 'none', visibility: 'public', ordering: 'set', adjacentTo: [{ to: asZoneId('a:none') }, { to: asZoneId('d:none') }] },
    { id: asZoneId('d:none'), owner: 'none', visibility: 'public', ordering: 'set', adjacentTo: [{ to: asZoneId('b:none') }, { to: asZoneId('c:none') }, { to: asZoneId('e:none') }] },
    { id: asZoneId('e:none'), owner: 'none', visibility: 'public', ordering: 'set', adjacentTo: [{ to: asZoneId('d:none') }] },
  ],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [] },
  actions: [],
  triggers: [],
  terminal: { conditions: [] },
});

const makeState = (): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  zoneVars: {},
  playerCount: 2,
  zones: {
    'a:none': [],
    'b:none': [makeToken('b-1'), makeToken('b-2')],
    'c:none': [makeToken('c-1')],
    'd:none': [makeToken('d-1')],
    'e:none': [],
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

const makeCtx = (overrides?: Partial<EvalContext>): EvalContext => {
  const def = makeDef();
  return {
    def,
    adjacencyGraph: buildAdjacencyGraph(def.zones),
    state: makeState(),
    activePlayer: asPlayerId(0),
    actorPlayer: asPlayerId(0),
    bindings: {},
    collector: createCollector(),
    ...overrides,
  };
};

describe('spatial query helpers', () => {
  it('adjacentZones returns sorted normalized neighbors', () => {
    const ctx = makeCtx();

    assert.deepEqual(queryAdjacentZones(ctx.adjacencyGraph, asZoneId('a:none')), [asZoneId('b:none'), asZoneId('c:none')]);
  });

  it('tokensInAdjacentZones returns zone-major then token-order traversal', () => {
    const ctx = makeCtx();

    const tokens = queryTokensInAdjacentZones(ctx.adjacencyGraph, ctx.state, asZoneId('a:none'));
    assert.deepEqual(tokens.map((token) => token.id), [asTokenId('b-1'), asTokenId('b-2'), asTokenId('c-1')]);
  });

  it('connectedZones handles cycles without duplicates in BFS order', () => {
    const ctx = makeCtx();

    const connected = queryConnectedZones(ctx.adjacencyGraph, ctx.state, asZoneId('a:none'), ctx);
    assert.deepEqual(connected, [asZoneId('b:none'), asZoneId('c:none'), asZoneId('d:none'), asZoneId('e:none')]);
    assert.equal(new Set(connected).size, connected.length);
  });

  it('connectedZones supports include/exclude start', () => {
    const ctx = makeCtx();

    const withoutStart = queryConnectedZones(ctx.adjacencyGraph, ctx.state, asZoneId('a:none'), ctx, undefined, {
      includeStart: false,
      maxDepth: 0,
    });
    const withStart = queryConnectedZones(ctx.adjacencyGraph, ctx.state, asZoneId('a:none'), ctx, undefined, {
      includeStart: true,
      maxDepth: 0,
    });

    assert.deepEqual(withoutStart, []);
    assert.deepEqual(withStart, [asZoneId('a:none')]);
  });

  it('connectedZones honors maxDepth', () => {
    const ctx = makeCtx();

    const depthOne = queryConnectedZones(ctx.adjacencyGraph, ctx.state, asZoneId('a:none'), ctx, undefined, { maxDepth: 1 });
    const depthUnlimited = queryConnectedZones(ctx.adjacencyGraph, ctx.state, asZoneId('a:none'), ctx);

    assert.deepEqual(depthOne, [asZoneId('b:none'), asZoneId('c:none')]);
    assert.deepEqual(depthUnlimited, [asZoneId('b:none'), asZoneId('c:none'), asZoneId('d:none'), asZoneId('e:none')]);
  });

  it('connectedZones applies via using $zone binding', () => {
    const ctx = makeCtx({
      bindings: {
        $allowed: [asZoneId('b:none'), asZoneId('d:none')],
      },
    });

    const connected = queryConnectedZones(
      ctx.adjacencyGraph,
      ctx.state,
      asZoneId('a:none'),
      ctx,
      {
        op: 'in',
        item: { ref: 'binding', name: '$zone' },
        set: { ref: 'binding', name: '$allowed' },
      },
    );

    assert.deepEqual(connected, [asZoneId('b:none'), asZoneId('d:none')]);
  });
});
