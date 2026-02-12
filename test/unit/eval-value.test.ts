import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildAdjacencyGraph,
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  evalValue,
  isEvalErrorCode,
  type EvalContext,
  type GameDef,
  type GameState,
  type Token,
  type ValueExpr,
} from '../../src/kernel/index.js';

const makeDef = (): GameDef => ({
  metadata: { id: 'eval-value-test', players: { min: 1, max: 4 } },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [
    { id: asZoneId('deck:none'), owner: 'none', visibility: 'hidden', ordering: 'stack' },
    { id: asZoneId('hand:0'), owner: 'player', visibility: 'owner', ordering: 'stack' },
    { id: asZoneId('hand:1'), owner: 'player', visibility: 'owner', ordering: 'stack' },
    { id: asZoneId('tableau:0'), owner: 'player', visibility: 'public', ordering: 'set' },
  ],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [], activePlayerOrder: 'roundRobin' },
  actions: [],
  triggers: [],
  endConditions: [],
});

const makeToken = (id: string, props: Readonly<Record<string, number | string | boolean>>): Token => ({
  id: asTokenId(id),
  type: 'card',
  props,
});

const makeState = (): GameState => ({
  globalVars: { a: 3, b: 4 },
  perPlayerVars: {},
  playerCount: 2,
  zones: {
    'deck:none': [makeToken('deck-1', { vp: 1, cost: 3 }), makeToken('deck-2', { vp: 2, cost: 1 })],
    'hand:0': [],
    'hand:1': [makeToken('hand-1', { vp: 10, cost: 5, label: 'x' })],
    'tableau:0': [makeToken('tab-1', { vp: 3, cost: 8 }), makeToken('tab-2', { vp: 4, cost: 2 })],
  },
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [1n, 2n] },
  stateHash: 0n,
  actionUsage: {},
  markers: {},
});

const makeCtx = (overrides?: Partial<EvalContext>): EvalContext => ({
  def: makeDef(),
  adjacencyGraph: buildAdjacencyGraph([]),
  state: makeState(),
  activePlayer: asPlayerId(0),
  actorPlayer: asPlayerId(1),
  bindings: { '$x': 42 },
  ...overrides,
});

describe('evalValue', () => {
  it('passes through literal number/boolean/string values', () => {
    const ctx = makeCtx();

    assert.equal(evalValue(7, ctx), 7);
    assert.equal(evalValue(true, ctx), true);
    assert.equal(evalValue('ok', ctx), 'ok');
  });

  it('delegates reference evaluation to resolveRef', () => {
    const ctx = makeCtx();
    assert.equal(evalValue({ ref: 'gvar', var: 'a' }, ctx), 3);
  });

  it('evaluates integer arithmetic (+, -, *)', () => {
    const ctx = makeCtx();

    assert.equal(evalValue({ op: '+', left: 3, right: 4 }, ctx), 7);
    assert.equal(evalValue({ op: '-', left: 10, right: 3 }, ctx), 7);
    assert.equal(evalValue({ op: '*', left: 5, right: 2 }, ctx), 10);
  });

  it('throws TYPE_MISMATCH for non-numeric arithmetic operands', () => {
    const ctx = makeCtx();
    assert.throws(
      () => evalValue({ op: '+', left: 1, right: 'bad' }, ctx),
      (error: unknown) => isEvalErrorCode(error, 'TYPE_MISMATCH'),
    );
  });

  it('evaluates count/sum/min/max aggregates with expected empty defaults', () => {
    const ctx = makeCtx();

    const countExpr: ValueExpr = { aggregate: { op: 'count', query: { query: 'tokensInZone', zone: 'deck:none' } } };
    assert.equal(evalValue(countExpr, ctx), 2);

    const emptyCountExpr: ValueExpr = {
      aggregate: { op: 'count', query: { query: 'tokensInZone', zone: 'hand:0' } },
    };
    assert.equal(evalValue(emptyCountExpr, ctx), 0);

    assert.equal(
      evalValue(
        { aggregate: { op: 'sum', query: { query: 'tokensInZone', zone: 'tableau:0' }, prop: 'vp' } },
        ctx,
      ),
      7,
    );
    assert.equal(
      evalValue(
        { aggregate: { op: 'min', query: { query: 'tokensInZone', zone: 'tableau:0' }, prop: 'cost' } },
        ctx,
      ),
      2,
    );
    assert.equal(
      evalValue(
        { aggregate: { op: 'max', query: { query: 'tokensInZone', zone: 'tableau:0' }, prop: 'cost' } },
        ctx,
      ),
      8,
    );

    assert.equal(
      evalValue({ aggregate: { op: 'sum', query: { query: 'tokensInZone', zone: 'hand:0' }, prop: 'vp' } }, ctx),
      0,
    );
    assert.equal(
      evalValue({ aggregate: { op: 'min', query: { query: 'tokensInZone', zone: 'hand:0' }, prop: 'vp' } }, ctx),
      0,
    );
    assert.equal(
      evalValue({ aggregate: { op: 'max', query: { query: 'tokensInZone', zone: 'hand:0' }, prop: 'vp' } }, ctx),
      0,
    );
  });

  it('throws TYPE_MISMATCH when aggregate prop is missing or non-numeric', () => {
    const ctx = makeCtx();

    assert.throws(
      () => evalValue({ aggregate: { op: 'sum', query: { query: 'tokensInZone', zone: 'deck:none' }, prop: 'missing' } }, ctx),
      (error: unknown) => isEvalErrorCode(error, 'TYPE_MISMATCH'),
    );

    assert.throws(
      () => evalValue({ aggregate: { op: 'sum', query: { query: 'tokensInZone', zone: 'hand:1' }, prop: 'label' } }, ctx),
      (error: unknown) => isEvalErrorCode(error, 'TYPE_MISMATCH'),
    );
  });

  it('supports numeric aggregates without prop and enforces safe integer outputs', () => {
    const ctx = makeCtx();

    assert.equal(evalValue({ aggregate: { op: 'sum', query: { query: 'intsInRange', min: 1, max: 3 } } }, ctx), 6);

    assert.throws(
      () => evalValue({ op: '+', left: Number.MAX_SAFE_INTEGER, right: 1 }, ctx),
      (error: unknown) => isEvalErrorCode(error, 'TYPE_MISMATCH'),
    );
  });

  it('throws TYPE_MISMATCH for non-safe arithmetic operands', () => {
    const ctx = makeCtx();

    assert.throws(
      () => evalValue({ op: '+', left: Number.MAX_SAFE_INTEGER + 1, right: 0 }, ctx),
      (error: unknown) => isEvalErrorCode(error, 'TYPE_MISMATCH'),
    );

    assert.throws(
      () => evalValue({ op: '+', left: Number.POSITIVE_INFINITY, right: 1 }, ctx),
      (error: unknown) => isEvalErrorCode(error, 'TYPE_MISMATCH'),
    );
  });
});
