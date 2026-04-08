import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asPhaseId,
  asPlayerId,
  asZoneId,
  buildAdjacencyGraph,
  evalCondition,
  unwrapEvalCondition,
  type ReadContext,
  type GameDef,
  type GameState,
} from '../../src/kernel/index.js';
import { makeEvalContext } from '../helpers/eval-context-test-helpers.js';

const makeDef = (): GameDef => ({
  metadata: { id: 'spatial-conditions-test', players: { min: 1, max: 2 } },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [
    { id: asZoneId('a:none'), owner: 'none', visibility: 'public', ordering: 'set', adjacentTo: [{ to: asZoneId('c:none') }, { to: asZoneId('b:none') }], attributes: { population: 1 } },
    { id: asZoneId('b:none'), owner: 'none', visibility: 'public', ordering: 'set', adjacentTo: [{ to: asZoneId('a:none') }, { to: asZoneId('d:none') }], attributes: { population: 1 } },
    { id: asZoneId('c:none'), owner: 'none', visibility: 'public', ordering: 'set', adjacentTo: [{ to: asZoneId('a:none') }, { to: asZoneId('d:none') }], attributes: { population: 0 } },
    { id: asZoneId('d:none'), owner: 'none', visibility: 'public', ordering: 'set', adjacentTo: [{ to: asZoneId('b:none') }, { to: asZoneId('c:none') }, { to: asZoneId('e:none') }], attributes: { population: 1 } },
    { id: asZoneId('e:none'), owner: 'none', visibility: 'public', ordering: 'set', adjacentTo: [{ to: asZoneId('d:none') }], attributes: { population: 1 } },
    { id: asZoneId('f:none'), owner: 'none', visibility: 'public', ordering: 'set', attributes: { population: 1 } },
  ],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [] },
  actions: [],
  triggers: [],
  terminal: { conditions: [] },
  markerLattices: [
    {
      id: 'supportOpposition',
      states: ['activeOpposition', 'passiveOpposition', 'neutral', 'passiveSupport', 'activeSupport'],
      defaultState: 'neutral',
      constraints: [
        {
          when: { op: '==', left: { _t: 2 as const, ref: 'zoneProp', zone: '$space', prop: 'population' }, right: 0 },
          allowedStates: ['neutral'],
        },
      ],
    },
  ],
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
  _runningHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
});

const makeCtx = (overrides?: Partial<ReadContext>): ReadContext => {
  const def = makeDef();
  return makeEvalContext({
    def,
    adjacencyGraph: buildAdjacencyGraph(def.zones),
    state: makeState(),
    activePlayer: asPlayerId(0),
    actorPlayer: asPlayerId(0),
    bindings: {},
    ...overrides,
  });
};

describe('spatial condition runtime', () => {
  it('evaluates adjacent true and false cases', () => {
    const ctx = makeCtx();

    assert.equal(unwrapEvalCondition(evalCondition({ op: 'adjacent', left: 'a:none', right: 'b:none' }, ctx)), true);
    assert.equal(unwrapEvalCondition(evalCondition({ op: 'adjacent', left: 'a:none', right: 'e:none' }, ctx)), false);
  });

  it('evaluates connected true and false cases', () => {
    const ctx = makeCtx();

    assert.equal(unwrapEvalCondition(evalCondition({ op: 'connected', from: 'a:none', to: 'e:none' }, ctx)), true);
    assert.equal(unwrapEvalCondition(evalCondition({ op: 'connected', from: 'a:none', to: 'f:none' }, ctx)), false);
  });

  it('evaluates connected with via filter pass/fail', () => {
    const passCtx = makeCtx({ bindings: { $allowed: [asZoneId('b:none'), asZoneId('d:none')] } });
    const failCtx = makeCtx({ bindings: { $allowed: [asZoneId('b:none')] } });
    const condition = {
      op: 'connected',
      from: 'a:none',
      to: 'd:none',
      via: { op: 'in', item: { _t: 2 as const, ref: 'binding', name: '$zone' }, set: { _t: 2 as const, ref: 'binding', name: '$allowed' } },
    } as const;

    assert.equal(unwrapEvalCondition(evalCondition(condition, passCtx)), true);
    assert.equal(unwrapEvalCondition(evalCondition(condition, failCtx)), false);
  });

  it('evaluates connected maxDepth boundary behavior', () => {
    const ctx = makeCtx();

    assert.equal(unwrapEvalCondition(evalCondition({ op: 'connected', from: 'a:none', to: 'd:none', maxDepth: 1 }, ctx)), false);
    assert.equal(unwrapEvalCondition(evalCondition({ op: 'connected', from: 'a:none', to: 'd:none', maxDepth: 2 }, ctx)), true);
  });

  it('evaluates markerShiftAllowed for legal shifts, edge no-ops, and constraint failures', () => {
    const baseState = makeState();
    const legalCtx = makeCtx({
      state: {
        ...baseState,
        markers: { 'a:none': { supportOpposition: 'passiveSupport' } },
      },
    });
    const noopCtx = makeCtx({
      state: {
        ...baseState,
        markers: { 'a:none': { supportOpposition: 'activeSupport' } },
      },
    });
    const illegalCtx = makeCtx({
      state: {
        ...baseState,
        markers: { 'c:none': { supportOpposition: 'neutral' } },
      },
    });

    assert.equal(
      unwrapEvalCondition(evalCondition({ op: 'markerShiftAllowed', space: 'a:none', marker: 'supportOpposition', delta: 1 }, legalCtx)),
      true,
    );
    assert.equal(
      unwrapEvalCondition(evalCondition({ op: 'markerShiftAllowed', space: 'a:none', marker: 'supportOpposition', delta: 1 }, noopCtx)),
      false,
    );
    assert.equal(
      unwrapEvalCondition(evalCondition({ op: 'markerShiftAllowed', space: 'c:none', marker: 'supportOpposition', delta: 1 }, illegalCtx)),
      false,
    );
  });
});
