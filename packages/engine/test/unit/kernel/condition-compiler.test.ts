import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asPhaseId,
  asPlayerId,
  asZoneId,
  buildAdjacencyGraph,
  evalCondition,
  isEvalErrorCode,
  tryCompileCondition,
  tryCompileValueExpr,
  type ConditionAST,
  type GameDef,
  type GameState,
  type ReadContext,
  type ValueExpr,
} from '../../../src/kernel/index.js';
import { makeEvalContext } from '../../helpers/eval-context-test-helpers.js';

const makeDef = (): GameDef =>
  ({
    metadata: { id: 'condition-compiler-test', players: { min: 2, max: 2 } },
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
  globalVars: {
    monsoon: true,
    resources: 4,
    phaseFlag: false,
  },
  perPlayerVars: {
    0: { resources: 1, flag: false },
    1: { resources: 5, flag: true },
  },
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

const evaluateCompiled = (condition: ConditionAST, ctx: ReadContext): boolean => {
  const compiled = tryCompileCondition(condition);
  assert.ok(compiled !== null);
  return compiled(ctx.state, ctx.activePlayer, ctx.bindings);
};

describe('condition compiler', () => {
  it('compiles boolean literals', () => {
    const ctx = makeCtx();
    assert.equal(evaluateCompiled(true, ctx), true);
    assert.equal(evaluateCompiled(false, ctx), false);
  });

  it('compiles gvar, active pvar, and templated binding comparisons', () => {
    const ctx = makeCtx({
      bindings: {
        suffix: 'north',
        'flag-north': true,
      },
    });

    const gvarCondition: ConditionAST = {
      op: '==',
      left: { _t: 2, ref: 'gvar', var: 'monsoon' },
      right: true,
    };
    const pvarCondition: ConditionAST = {
      op: '>=',
      left: { _t: 2, ref: 'pvar', player: 'active', var: 'resources' },
      right: 3,
    };
    const bindingCondition: ConditionAST = {
      op: '==',
      left: { _t: 2, ref: 'binding', name: 'flag-{suffix}' },
      right: true,
    };

    assert.equal(evaluateCompiled(gvarCondition, ctx), evalCondition(gvarCondition, ctx));
    assert.equal(evaluateCompiled(pvarCondition, ctx), evalCondition(pvarCondition, ctx));
    assert.equal(evaluateCompiled(bindingCondition, ctx), evalCondition(bindingCondition, ctx));
  });

  it('supports all six comparison operators for Tier 1 value accessors', () => {
    const ctx = makeCtx({ bindings: { '$value': 4 } });
    const cases: readonly [ConditionAST, boolean][] = [
      [{ op: '==', left: { _t: 2, ref: 'gvar', var: 'resources' }, right: 4 }, true],
      [{ op: '!=', left: { _t: 2, ref: 'gvar', var: 'resources' }, right: 3 }, true],
      [{ op: '<', left: { _t: 2, ref: 'binding', name: '$value' }, right: 5 }, true],
      [{ op: '<=', left: { _t: 2, ref: 'binding', name: '$value' }, right: 4 }, true],
      [{ op: '>', left: { _t: 2, ref: 'pvar', player: 'active', var: 'resources' }, right: 3 }, true],
      [{ op: '>=', left: { _t: 2, ref: 'pvar', player: 'active', var: 'resources' }, right: 5 }, true],
    ];

    for (const [condition, expected] of cases) {
      assert.equal(evaluateCompiled(condition, ctx), expected);
      assert.equal(evaluateCompiled(condition, ctx), evalCondition(condition, ctx));
    }
  });

  it('returns null for non-compilable expressions and selectors', () => {
    const aggregateExpr: ValueExpr = {
      _t: 5,
      aggregate: { op: 'count', query: { query: 'zones' } },
    };
    const concatExpr: ValueExpr = { _t: 3, concat: ['a', 'b'] };
    const ifExpr: ValueExpr = { _t: 4, if: { when: true, then: 1, else: 0 } };
    const arithmeticExpr: ValueExpr = { _t: 6, op: '+', left: 1, right: 2 };

    assert.equal(tryCompileValueExpr(aggregateExpr), null);
    assert.equal(tryCompileValueExpr(concatExpr), null);
    assert.equal(tryCompileValueExpr(ifExpr), null);
    assert.equal(tryCompileValueExpr(arithmeticExpr), null);
    assert.equal(tryCompileValueExpr({ _t: 2, ref: 'gvar', var: { ref: 'binding', name: '$var' } }), null);
    assert.equal(tryCompileValueExpr({ _t: 2, ref: 'pvar', player: 'actor', var: 'resources' }), null);

    const aggregateCondition: ConditionAST = { op: '==', left: aggregateExpr, right: 0 };
    const booleanCombination: ConditionAST = { op: 'and', args: [true, false] };
    assert.equal(tryCompileCondition(aggregateCondition), null);
    assert.equal(tryCompileCondition(booleanCombination), null);
  });

  it('matches interpreter errors for missing binding, missing vars, and ordering type mismatch', () => {
    const missingBindingCondition: ConditionAST = {
      op: '==',
      left: { _t: 2, ref: 'binding', name: '$missing' },
      right: true,
    };
    const missingGlobalCondition: ConditionAST = {
      op: '==',
      left: { _t: 2, ref: 'gvar', var: 'missing' },
      right: true,
    };
    const missingPlayerVarCondition: ConditionAST = {
      op: '>=',
      left: { _t: 2, ref: 'pvar', player: 'active', var: 'resources' },
      right: 1,
    };
    const orderingTypeMismatchCondition: ConditionAST = {
      op: '>',
      left: { _t: 2, ref: 'binding', name: '$flag' },
      right: 0,
    };

    const baseCtx = makeCtx();
    const missingPlayerCtx = makeCtx({
      state: {
        ...makeState(),
        perPlayerVars: {},
      },
    });
    const mismatchCtx = makeCtx({ bindings: { '$flag': true } });

    assert.throws(
      () => evaluateCompiled(missingBindingCondition, baseCtx),
      (error: unknown) => isEvalErrorCode(error, 'MISSING_BINDING'),
    );
    assert.throws(
      () => evalCondition(missingBindingCondition, baseCtx),
      (error: unknown) => isEvalErrorCode(error, 'MISSING_BINDING'),
    );

    assert.throws(
      () => evaluateCompiled(missingGlobalCondition, baseCtx),
      (error: unknown) => isEvalErrorCode(error, 'MISSING_VAR'),
    );
    assert.throws(
      () => evalCondition(missingGlobalCondition, baseCtx),
      (error: unknown) => isEvalErrorCode(error, 'MISSING_VAR'),
    );

    assert.throws(
      () => evaluateCompiled(missingPlayerVarCondition, missingPlayerCtx),
      (error: unknown) => isEvalErrorCode(error, 'MISSING_VAR'),
    );
    assert.throws(
      () => evalCondition(missingPlayerVarCondition, missingPlayerCtx),
      (error: unknown) => isEvalErrorCode(error, 'MISSING_VAR'),
    );

    assert.throws(
      () => evaluateCompiled(orderingTypeMismatchCondition, mismatchCtx),
      (error: unknown) => isEvalErrorCode(error, 'TYPE_MISMATCH'),
    );
    assert.throws(
      () => evalCondition(orderingTypeMismatchCondition, mismatchCtx),
      (error: unknown) => isEvalErrorCode(error, 'TYPE_MISMATCH'),
    );
  });
});
