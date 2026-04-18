// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  buildAdjacencyGraph,
  getCompiledTokenFilter,
  type GameDef,
  type GameState,
  type ReadContext,
  type Token,
  type TokenFilterExpr,
} from '../../../src/kernel/index.js';
import { makeEvalContext } from '../../helpers/eval-context-test-helpers.js';

const makeDef = (): GameDef =>
  ({
    metadata: { id: 'compiled-token-filter-cache-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [{ id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set' }],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [],
    triggers: [],
    terminal: { conditions: [] },
  }) as unknown as GameDef;

const makeState = (): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  zoneVars: {},
  playerCount: 2,
  zones: { 'board:none': [] },
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(1),
  turnCount: 1,
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
});

const makeCtx = (
  overrides?: Partial<ReadContext> & {
    readonly state?: GameState;
    readonly bindings?: Readonly<Record<string, unknown>>;
  },
): ReadContext => {
  const def = overrides?.def ?? makeDef();
  const state = overrides?.state ?? makeState();
  return makeEvalContext({
    def,
    adjacencyGraph: buildAdjacencyGraph(def.zones),
    state,
    activePlayer: overrides?.activePlayer ?? state.activePlayer,
    actorPlayer: overrides?.actorPlayer ?? state.activePlayer,
    bindings: overrides?.bindings ?? {},
    ...(overrides?.freeOperationOverlay === undefined ? {} : { freeOperationOverlay: overrides.freeOperationOverlay }),
  });
};

const makeToken = (id: string, props: Token['props']): Token => ({
  id: asTokenId(id),
  type: 'piece',
  props,
});

describe('compiled token-filter cache', () => {
  it('reuses the compiled function for the same expression reference', () => {
    const expr: TokenFilterExpr = {
      op: 'and',
      args: [
        { prop: 'faction', op: 'eq', value: 'VC' },
        { prop: 'type', op: 'in', value: ['troops', 'base'] },
      ],
    };

    const first = getCompiledTokenFilter(expr);
    const second = getCompiledTokenFilter(expr);

    assert.ok(first !== null);
    assert.equal(first, second);
  });

  it('creates independent cache entries for distinct expression references', () => {
    const firstExpr: TokenFilterExpr = { prop: 'faction', op: 'eq', value: 'VC' };
    const secondExpr: TokenFilterExpr = { prop: 'faction', op: 'eq', value: 'VC' };

    const first = getCompiledTokenFilter(firstExpr);
    const second = getCompiledTokenFilter(secondExpr);

    assert.ok(first !== null);
    assert.ok(second !== null);
    assert.notEqual(first, second);
  });

  it('caches null results for non-compilable expressions', () => {
    const expr: TokenFilterExpr = {
      field: { kind: 'zoneProp', prop: 'support' },
      op: 'eq',
      value: 'activeSupport',
    };

    const first = getCompiledTokenFilter(expr);
    const second = getCompiledTokenFilter(expr);

    assert.equal(first, null);
    assert.equal(second, null);
  });

  it('reuses cached dynamic filters with the same ReadContext-aware behavior', () => {
    const expr: TokenFilterExpr = {
      prop: 'faction',
      op: 'in',
      value: { _t: 2, ref: 'binding', name: '$targetFactions' },
    };
    const ctx = makeCtx({ bindings: { '$targetFactions': ['VC', 'NVA'] } });
    const token = makeToken('piece-1', { faction: 'VC' });

    const first = getCompiledTokenFilter(expr);
    const second = getCompiledTokenFilter(expr);

    assert.ok(first !== null);
    assert.equal(first, second);
    const compiled = first;
    assert.equal(compiled(token, ctx), true);
    assert.equal(compiled(token, ctx), true);
  });
});
