import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildAdjacencyGraph,
  asPhaseId,
  asPlayerId,
  asZoneId,
  evalNumericValue,
  evalStringValue,
  evalIntegerValue,
  isEvalErrorCode,
  type ReadContext,
  type GameDef,
  type GameState,
} from '../../src/kernel/index.js';
import { makeEvalContext } from '../helpers/eval-context-test-helpers.js';

const makeDef = (): GameDef => ({
  metadata: { id: 'eval-value-typed-test', players: { min: 1, max: 4 } },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [
    { id: asZoneId('deck:none'), zoneKind: 'aux', owner: 'none', visibility: 'hidden', ordering: 'stack' },
  ],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [] },
  actions: [],
  triggers: [],
  terminal: { conditions: [] },
});

const makeState = (): GameState => ({
  globalVars: { score: 42, name_var: 0 },
  perPlayerVars: {},
  zoneVars: {},
  playerCount: 2,
  zones: { 'deck:none': [] },
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

const makeCtx = (overrides?: Partial<ReadContext>): ReadContext =>
  makeEvalContext({
    def: makeDef(),
    adjacencyGraph: buildAdjacencyGraph([]),
    state: makeState(),
    activePlayer: asPlayerId(0),
    actorPlayer: asPlayerId(1),
    bindings: { '$x': 42 },
    ...overrides,
  });

describe('evalNumericValue', () => {
  it('returns number for numeric literal', () => {
    const ctx = makeCtx();
    assert.equal(evalNumericValue(7, ctx), 7);
  });

  it('returns number for numeric expression', () => {
    const ctx = makeCtx();
    assert.equal(evalNumericValue({ _t: 6, op: '+', left: 3, right: 4 } as const, ctx), 7);
  });

  it('returns number for numeric ref', () => {
    const ctx = makeCtx();
    assert.equal(evalNumericValue({ _t: 2, ref: 'gvar', var: 'score' } as const, ctx), 42);
  });

  it('throws TYPE_MISMATCH for string value', () => {
    const ctx = makeCtx();
    assert.throws(
      () => evalNumericValue('hello', ctx),
      (error: unknown) => isEvalErrorCode(error, 'TYPE_MISMATCH'),
    );
  });

  it('throws TYPE_MISMATCH for boolean value', () => {
    const ctx = makeCtx();
    assert.throws(
      () => evalNumericValue(true, ctx),
      (error: unknown) => isEvalErrorCode(error, 'TYPE_MISMATCH'),
    );
  });

  it('throws TYPE_MISMATCH for array value', () => {
    const ctx = makeCtx();
    assert.throws(
      () => evalNumericValue({ _t: 1, scalarArray: ['a', 'b'] } as const, ctx),
      (error: unknown) => isEvalErrorCode(error, 'TYPE_MISMATCH'),
    );
  });

  it('includes label in error message when provided', () => {
    const ctx = makeCtx();
    assert.throws(
      () => evalNumericValue('bad', ctx, 'scoring'),
      (error: unknown) => {
        if (!isEvalErrorCode(error, 'TYPE_MISMATCH')) return false;
        return error.message.includes('scoring');
      },
    );
  });
});

describe('evalStringValue', () => {
  it('returns string for string literal', () => {
    const ctx = makeCtx();
    assert.equal(evalStringValue('hello', ctx), 'hello');
  });

  it('returns string for concat expression', () => {
    const ctx = makeCtx();
    assert.equal(evalStringValue({ _t: 3, concat: ['a', 'b'] } as const, ctx), 'ab');
  });

  it('throws TYPE_MISMATCH for number value', () => {
    const ctx = makeCtx();
    assert.throws(
      () => evalStringValue(42, ctx),
      (error: unknown) => isEvalErrorCode(error, 'TYPE_MISMATCH'),
    );
  });

  it('throws TYPE_MISMATCH for boolean value', () => {
    const ctx = makeCtx();
    assert.throws(
      () => evalStringValue(true, ctx),
      (error: unknown) => isEvalErrorCode(error, 'TYPE_MISMATCH'),
    );
  });

  it('throws TYPE_MISMATCH for array value', () => {
    const ctx = makeCtx();
    assert.throws(
      () => evalStringValue({ _t: 1, scalarArray: ['a', 'b'] } as const, ctx),
      (error: unknown) => isEvalErrorCode(error, 'TYPE_MISMATCH'),
    );
  });

  it('includes label in error message when provided', () => {
    const ctx = makeCtx();
    assert.throws(
      () => evalStringValue(42, ctx, 'markerState'),
      (error: unknown) => {
        if (!isEvalErrorCode(error, 'TYPE_MISMATCH')) return false;
        return error.message.includes('markerState');
      },
    );
  });
});

describe('evalIntegerValue', () => {
  it('returns integer for integer literal', () => {
    const ctx = makeCtx();
    assert.equal(evalIntegerValue(5, ctx), 5);
  });

  it('returns integer for integer expression', () => {
    const ctx = makeCtx();
    assert.equal(evalIntegerValue({ _t: 6, op: '+', left: 2, right: 3 } as const, ctx), 5);
  });

  it('throws TYPE_MISMATCH for string value', () => {
    const ctx = makeCtx();
    assert.throws(
      () => evalIntegerValue('hello', ctx),
      (error: unknown) => isEvalErrorCode(error, 'TYPE_MISMATCH'),
    );
  });

  it('throws TYPE_MISMATCH for boolean value', () => {
    const ctx = makeCtx();
    assert.throws(
      () => evalIntegerValue(true, ctx),
      (error: unknown) => isEvalErrorCode(error, 'TYPE_MISMATCH'),
    );
  });

  it('throws TYPE_MISMATCH for non-safe-integer number', () => {
    const ctx = makeCtx();
    assert.throws(
      () => evalIntegerValue(Number.MAX_SAFE_INTEGER + 1, ctx),
      (error: unknown) => isEvalErrorCode(error, 'TYPE_MISMATCH'),
    );
  });

  it('includes label in error message when provided', () => {
    const ctx = makeCtx();
    assert.throws(
      () => evalIntegerValue('bad', ctx, 'delta'),
      (error: unknown) => {
        if (!isEvalErrorCode(error, 'TYPE_MISMATCH')) return false;
        return error.message.includes('delta');
      },
    );
  });
});
