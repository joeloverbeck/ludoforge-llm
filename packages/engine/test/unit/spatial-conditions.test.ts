import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asPhaseId,
  asPlayerId,
  asZoneId,
  buildAdjacencyGraph,
  createCollector,
  evalCondition,
  type EvalContext,
  type GameDef,
  type GameState,
} from '../../src/kernel/index.js';

const makeDef = (): GameDef => ({
  metadata: { id: 'spatial-conditions-test', players: { min: 1, max: 2 } },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [
    { id: asZoneId('a:none'), owner: 'none', visibility: 'public', ordering: 'set', adjacentTo: [{ to: asZoneId('c:none') }, { to: asZoneId('b:none') }] },
    { id: asZoneId('b:none'), owner: 'none', visibility: 'public', ordering: 'set', adjacentTo: [{ to: asZoneId('a:none') }, { to: asZoneId('d:none') }] },
    { id: asZoneId('c:none'), owner: 'none', visibility: 'public', ordering: 'set', adjacentTo: [{ to: asZoneId('a:none') }, { to: asZoneId('d:none') }] },
    { id: asZoneId('d:none'), owner: 'none', visibility: 'public', ordering: 'set', adjacentTo: [{ to: asZoneId('b:none') }, { to: asZoneId('c:none') }, { to: asZoneId('e:none') }] },
    { id: asZoneId('e:none'), owner: 'none', visibility: 'public', ordering: 'set', adjacentTo: [{ to: asZoneId('d:none') }] },
    { id: asZoneId('f:none'), owner: 'none', visibility: 'public', ordering: 'set' },
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
    'b:none': [],
    'c:none': [],
    'd:none': [],
    'e:none': [],
    'f:none': [],
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

describe('spatial condition runtime', () => {
  it('evaluates adjacent true and false cases', () => {
    const ctx = makeCtx();

    assert.equal(evalCondition({ op: 'adjacent', left: 'a:none', right: 'b:none' }, ctx), true);
    assert.equal(evalCondition({ op: 'adjacent', left: 'a:none', right: 'e:none' }, ctx), false);
  });

  it('evaluates connected true and false cases', () => {
    const ctx = makeCtx();

    assert.equal(evalCondition({ op: 'connected', from: 'a:none', to: 'e:none' }, ctx), true);
    assert.equal(evalCondition({ op: 'connected', from: 'a:none', to: 'f:none' }, ctx), false);
  });

  it('evaluates connected with via filter pass/fail', () => {
    const passCtx = makeCtx({ bindings: { $allowed: [asZoneId('b:none'), asZoneId('d:none')] } });
    const failCtx = makeCtx({ bindings: { $allowed: [asZoneId('b:none')] } });
    const condition = {
      op: 'connected',
      from: 'a:none',
      to: 'd:none',
      via: { op: 'in', item: { ref: 'binding', name: '$zone' }, set: { ref: 'binding', name: '$allowed' } },
    } as const;

    assert.equal(evalCondition(condition, passCtx), true);
    assert.equal(evalCondition(condition, failCtx), false);
  });

  it('evaluates connected maxDepth boundary behavior', () => {
    const ctx = makeCtx();

    assert.equal(evalCondition({ op: 'connected', from: 'a:none', to: 'd:none', maxDepth: 1 }, ctx), false);
    assert.equal(evalCondition({ op: 'connected', from: 'a:none', to: 'd:none', maxDepth: 2 }, ctx), true);
  });
});
