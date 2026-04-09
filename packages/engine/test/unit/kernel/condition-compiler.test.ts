import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  buildAdjacencyGraph,
  createEnumerationSnapshot,
  evalCondition,
  evalValue,
  isEvalErrorCode,
  resolveRef,
  tryCompileCondition,
  tryCompileValueExpr,
  type ConditionAST,
  type EnumerationStateSnapshot,
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

const evaluateCompiled = (
  condition: ConditionAST,
  ctx: ReadContext,
  options?: { readonly useSnapshot?: boolean },
): boolean => {
  const compiled = tryCompileCondition(condition);
  assert.ok(compiled !== null);
  const snapshot = options?.useSnapshot === true
    ? createEnumerationSnapshot(ctx.def, ctx.state)
    : undefined;
  return compiled(ctx.state, ctx.activePlayer, ctx.bindings, snapshot);
};

const evaluateCompiledValue = (
  expr: ValueExpr,
  ctx: ReadContext,
  options?: { readonly snapshot?: EnumerationStateSnapshot },
): ReturnType<typeof evalValue> => {
  const compiled = tryCompileValueExpr(expr);
  assert.ok(compiled !== null);
  return compiled(ctx.state, ctx.activePlayer, ctx.bindings, options?.snapshot);
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

  it('prefers snapshot reads for gvar and active pvar accessors when provided', () => {
    const liveState = makeState();
    const ctx = makeCtx({ state: liveState });
    const gvarCondition: ConditionAST = {
      op: '==',
      left: { _t: 2, ref: 'gvar', var: 'resources' },
      right: 9,
    };
    const pvarCondition: ConditionAST = {
      op: '==',
      left: { _t: 2, ref: 'pvar', player: 'active', var: 'resources' },
      right: 7,
    };
    const compiledGvar = tryCompileCondition(gvarCondition);
    const compiledPvar = tryCompileCondition(pvarCondition);
    assert.ok(compiledGvar !== null);
    assert.ok(compiledPvar !== null);

    const snapshot: EnumerationStateSnapshot = {
      globalVars: { ...ctx.state.globalVars, resources: 9 },
      perPlayerVars: {
        ...ctx.state.perPlayerVars,
        [ctx.activePlayer]: { ...(ctx.state.perPlayerVars[ctx.activePlayer] ?? {}), resources: 7 },
      },
      zoneTotals: { get: (_zoneId: string, _tokenType?: string) => 0 },
      zoneVars: { get: (_zoneId: string, _varName: string) => undefined },
      markerStates: { get: (_spaceId: string, _markerName: string) => undefined },
    };

    assert.equal(compiledGvar(ctx.state, ctx.activePlayer, ctx.bindings), false);
    assert.equal(compiledPvar(ctx.state, ctx.activePlayer, ctx.bindings), false);
    assert.equal(compiledGvar(ctx.state, ctx.activePlayer, ctx.bindings, snapshot), true);
    assert.equal(compiledPvar(ctx.state, ctx.activePlayer, ctx.bindings, snapshot), true);
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

  it('compiles simple aggregate token counts and matches interpreter behavior', () => {
    const expr: ValueExpr = {
      _t: 5,
      aggregate: { op: 'count', query: { query: 'tokensInZone', zone: 'board:none' } },
    };
    const accessor = tryCompileValueExpr(expr);
    assert.ok(accessor !== null);

    const populatedState: GameState = {
      ...makeState(),
      zones: {
        'board:none': [
          { id: asTokenId('t1'), type: 'piece', props: {} },
          { id: asTokenId('t2'), type: 'piece', props: {} },
        ],
      },
    };
    const ctx = makeCtx({ state: populatedState });
    const condition: ConditionAST = { op: '>', left: expr, right: 0 };

    assert.equal(accessor(ctx.state, ctx.activePlayer, ctx.bindings), 2);
    assert.equal(evaluateCompiled(condition, ctx), evalCondition(condition, ctx));
  });

  it('prefers snapshot-backed zone totals for compiled aggregate counts when provided', () => {
    const expr: ValueExpr = {
      _t: 5,
      aggregate: { op: 'count', query: { query: 'tokensInZone', zone: 'board:none' } },
    };
    const condition: ConditionAST = { op: '==', left: expr, right: 4 };
    const compiled = tryCompileCondition(condition);
    assert.ok(compiled !== null);

    const ctx = makeCtx({
      state: {
        ...makeState(),
        zones: {
          'board:none': [
            { id: asTokenId('t1'), type: 'piece', props: {} },
            { id: asTokenId('t2'), type: 'piece', props: {} },
          ],
        },
      },
    });
    const snapshot = createEnumerationSnapshot(ctx.def, ctx.state);
    const originalGet = snapshot.zoneTotals.get.bind(snapshot.zoneTotals);
    let calls = 0;
    snapshot.zoneTotals.get = (zoneId: string, tokenType?: string): number => {
      calls += 1;
      if (zoneId === 'board:none' && tokenType === undefined) {
        return 4;
      }
      return originalGet(zoneId, tokenType);
    };

    assert.equal(compiled(ctx.state, ctx.activePlayer, ctx.bindings), false);
    assert.equal(compiled(ctx.state, ctx.activePlayer, ctx.bindings, snapshot), true);
    assert.equal(calls, 1);
  });

  it('keeps compiled aggregate zone totals equivalent with and without a real snapshot', () => {
    const expr: ValueExpr = {
      _t: 5,
      aggregate: { op: 'count', query: { query: 'tokensInZone', zone: 'board:none' } },
    };
    const condition: ConditionAST = { op: '==', left: expr, right: 2 };
    const compiled = tryCompileCondition(condition);
    assert.ok(compiled !== null);

    const ctx = makeCtx({
      state: {
        ...makeState(),
        zones: {
          'board:none': [
            { id: asTokenId('t1'), type: 'piece', props: {} },
            { id: asTokenId('t2'), type: 'piece', props: {} },
          ],
        },
      },
    });
    const snapshot = createEnumerationSnapshot(ctx.def, ctx.state);

    assert.equal(compiled(ctx.state, ctx.activePlayer, ctx.bindings), true);
    assert.equal(compiled(ctx.state, ctx.activePlayer, ctx.bindings, snapshot), true);
    assert.equal(compiled(ctx.state, ctx.activePlayer, ctx.bindings, snapshot), evalCondition(condition, ctx));
  });

  it('compiles scalar array literals and matches interpreter behavior', () => {
    const expr: ValueExpr = { _t: 1, scalarArray: [1, 'north', true] };
    const ctx = makeCtx();

    assert.deepEqual(evaluateCompiledValue(expr, ctx), evalValue(expr, ctx));
  });

  it('compiles zoneCount references for static zones and matches interpreter behavior', () => {
    const expr: ValueExpr = { _t: 2, ref: 'zoneCount', zone: 'board:none' };
    const ctx = makeCtx({
      state: {
        ...makeState(),
        zones: {
          'board:none': [
            { id: asTokenId('t1'), type: 'piece', props: {} },
            { id: asTokenId('t2'), type: 'piece', props: {} },
          ],
        },
      },
    });

    assert.equal(evaluateCompiledValue(expr, ctx), resolveRef({ ref: 'zoneCount', zone: 'board:none' }, ctx));
  });

  it('compiles zoneVar references for static zones and vars, including snapshot-backed reads', () => {
    const expr: ValueExpr = { _t: 2, ref: 'zoneVar', zone: 'board:none', var: 'threat' };
    const state: GameState = {
      ...makeState(),
      zoneVars: {
        'board:none': { threat: 2 },
      },
    };
    const ctx = makeCtx({ state });
    const snapshot: EnumerationStateSnapshot = {
      globalVars: ctx.state.globalVars,
      perPlayerVars: ctx.state.perPlayerVars,
      zoneTotals: { get: (_zoneId: string, _tokenType?: string) => 0 },
      zoneVars: { get: (zoneId: string, varName: string) => zoneId === 'board:none' && varName === 'threat' ? 5 : undefined },
      markerStates: { get: (_spaceId: string, _markerName: string) => undefined },
    };

    assert.equal(evaluateCompiledValue(expr, ctx), resolveRef({ ref: 'zoneVar', zone: 'board:none', var: 'threat' }, ctx));
    assert.equal(evaluateCompiledValue(expr, ctx, { snapshot }), 5);
  });

  it('compiles tokenProp references for binding-resolvable tokens and matches interpreter behavior', () => {
    const expr: ValueExpr = { _t: 2, ref: 'tokenProp', token: '$card', prop: 'cost' };
    const ctx = makeCtx({
      state: {
        ...makeState(),
        zones: {
          'board:none': [
            { id: asTokenId('t1'), type: 'piece', props: { cost: 9, faction: 'US' } },
          ],
        },
      },
      bindings: { '$card': asTokenId('t1') },
    });

    assert.equal(evaluateCompiledValue(expr, ctx), resolveRef({ ref: 'tokenProp', token: '$card', prop: 'cost' }, ctx));
  });

  it('compiles pvar references for fixed player id selectors and matches interpreter behavior', () => {
    const expr: ValueExpr = { _t: 2, ref: 'pvar', player: { id: asPlayerId(0) }, var: 'resources' };
    const ctx = makeCtx();
    const snapshot: EnumerationStateSnapshot = {
      globalVars: ctx.state.globalVars,
      perPlayerVars: {
        ...ctx.state.perPlayerVars,
        0: { ...(ctx.state.perPlayerVars[0] ?? {}), resources: 7 },
      },
      zoneTotals: { get: (_zoneId: string, _tokenType?: string) => 0 },
      zoneVars: { get: (_zoneId: string, _varName: string) => undefined },
      markerStates: { get: (_spaceId: string, _markerName: string) => undefined },
    };

    assert.equal(evaluateCompiledValue(expr, ctx), resolveRef({ ref: 'pvar', player: { id: asPlayerId(0) }, var: 'resources' }, ctx));
    assert.equal(evaluateCompiledValue(expr, ctx, { snapshot }), 7);
  });

  it('preserves missing-zone and missing-zoneVar error behavior for compiled simple references', () => {
    const missingZoneCountExpr: ValueExpr = { _t: 2, ref: 'zoneCount', zone: 'missing:none' };
    const missingZoneVarExpr: ValueExpr = { _t: 2, ref: 'zoneVar', zone: 'board:none', var: 'threat' };
    const ctx = makeCtx();

    assert.throws(
      () => evaluateCompiledValue(missingZoneCountExpr, ctx),
      (error: unknown) => isEvalErrorCode(error, 'MISSING_VAR'),
    );
    assert.throws(
      () => evaluateCompiledValue(missingZoneVarExpr, ctx),
      (error: unknown) => isEvalErrorCode(error, 'MISSING_VAR'),
    );
  });

  it('preserves missing token binding and tokenProp errors for compiled tokenProp references', () => {
    const missingBindingExpr: ValueExpr = { _t: 2, ref: 'tokenProp', token: '$missing', prop: 'cost' };
    const missingPropExpr: ValueExpr = { _t: 2, ref: 'tokenProp', token: '$card', prop: 'missingProp' };
    const ctx = makeCtx({
      state: {
        ...makeState(),
        zones: {
          'board:none': [{ id: asTokenId('t1'), type: 'piece', props: { cost: 9 } }],
        },
      },
      bindings: { '$card': asTokenId('t1') },
    });

    assert.throws(
      () => evaluateCompiledValue(missingBindingExpr, ctx),
      (error: unknown) => isEvalErrorCode(error, 'MISSING_BINDING'),
    );
    assert.throws(
      () => evaluateCompiledValue(missingPropExpr, ctx),
      (error: unknown) => isEvalErrorCode(error, 'MISSING_VAR'),
    );
  });

  it('preserves missing-zone error behavior for compiled aggregate counts', () => {
    const expr: ValueExpr = {
      _t: 5,
      aggregate: { op: 'count', query: { query: 'tokensInZone', zone: 'missing:none' } },
    };
    const accessor = tryCompileValueExpr(expr);
    assert.ok(accessor !== null);
    const ctx = makeCtx();
    const condition: ConditionAST = { op: '>', left: expr, right: 0 };

    assert.throws(
      () => accessor(ctx.state, ctx.activePlayer, ctx.bindings),
      (error: unknown) => isEvalErrorCode(error, 'MISSING_VAR'),
    );
    assert.throws(
      () => evaluateCompiled(condition, ctx),
      (error: unknown) => isEvalErrorCode(error, 'MISSING_VAR'),
    );
    assert.throws(
      () => evalCondition(condition, ctx),
      (error: unknown) => isEvalErrorCode(error, 'MISSING_VAR'),
    );
  });

  it('compiles boolean combinations with short-circuit semantics', () => {
    const andCtx = makeCtx();
    const andCondition: ConditionAST = {
      op: 'and',
      args: [
        false,
        { op: '==', left: { _t: 2, ref: 'binding', name: '$missing' }, right: true },
      ],
    };
    const orCtx = makeCtx();
    const orCondition: ConditionAST = {
      op: 'or',
      args: [
        true,
        { op: '==', left: { _t: 2, ref: 'binding', name: '$missing' }, right: true },
      ],
    };
    const notCondition: ConditionAST = {
      op: 'not',
      arg: {
        op: '>=',
        left: { _t: 2, ref: 'pvar', player: 'active', var: 'resources' },
        right: 6,
      },
    };

    assert.equal(evaluateCompiled(andCondition, andCtx), false);
    assert.equal(evaluateCompiled(andCondition, andCtx), evalCondition(andCondition, andCtx));
    assert.equal(evaluateCompiled(orCondition, orCtx), true);
    assert.equal(evaluateCompiled(orCondition, orCtx), evalCondition(orCondition, orCtx));
    assert.equal(evaluateCompiled(notCondition, andCtx), true);
    assert.equal(evaluateCompiled(notCondition, andCtx), evalCondition(notCondition, andCtx));
  });

  it('threads snapshot through nested boolean combinators', () => {
    const ctx = makeCtx();
    const condition: ConditionAST = {
      op: 'and',
      args: [
        {
          op: 'or',
          args: [
            { op: '==', left: { _t: 2, ref: 'gvar', var: 'resources' }, right: 9 },
            { op: '==', left: { _t: 2, ref: 'pvar', player: 'active', var: 'resources' }, right: 7 },
          ],
        },
        {
          op: 'not',
          arg: { op: '==', left: { _t: 2, ref: 'gvar', var: 'phaseFlag' }, right: true },
        },
      ],
    };
    const compiled = tryCompileCondition(condition);
    assert.ok(compiled !== null);

    const snapshot: EnumerationStateSnapshot = {
      globalVars: { ...ctx.state.globalVars, resources: 9, phaseFlag: false },
      perPlayerVars: {
        ...ctx.state.perPlayerVars,
        [ctx.activePlayer]: { ...(ctx.state.perPlayerVars[ctx.activePlayer] ?? {}), resources: 7 },
      },
      zoneTotals: { get: (_zoneId: string, _tokenType?: string) => 0 },
      zoneVars: { get: (_zoneId: string, _varName: string) => undefined },
      markerStates: { get: (_spaceId: string, _markerName: string) => undefined },
    };

    assert.equal(compiled(ctx.state, ctx.activePlayer, ctx.bindings), false);
    assert.equal(compiled(ctx.state, ctx.activePlayer, ctx.bindings, snapshot), true);
  });

  it('reuses one snapshot across different invocation active players', () => {
    const condition: ConditionAST = {
      op: '>=',
      left: { _t: 2, ref: 'pvar', player: 'active', var: 'resources' },
      right: 5,
    };
    const compiled = tryCompileCondition(condition);
    assert.ok(compiled !== null);

    const ctx = makeCtx();
    const snapshot = createEnumerationSnapshot(ctx.def, ctx.state);

    assert.equal(compiled(ctx.state, asPlayerId(0), ctx.bindings, snapshot), false);
    assert.equal(compiled(ctx.state, asPlayerId(1), ctx.bindings, snapshot), true);
    assert.equal(
      compiled(ctx.state, asPlayerId(0), ctx.bindings, snapshot),
      compiled(ctx.state, asPlayerId(0), ctx.bindings),
    );
    assert.equal(
      compiled(ctx.state, asPlayerId(1), ctx.bindings, snapshot),
      compiled(ctx.state, asPlayerId(1), ctx.bindings),
    );
  });

  it('keeps executor-shifted pvar(active) evaluation equivalent with and without snapshot', () => {
    const condition: ConditionAST = {
      op: '==',
      left: { _t: 2, ref: 'pvar', player: 'active', var: 'resources' },
      right: 1,
    };
    const compiled = tryCompileCondition(condition);
    assert.ok(compiled !== null);

    const shiftedCtx = makeCtx({
      activePlayer: asPlayerId(0),
      actorPlayer: asPlayerId(1),
      state: {
        ...makeState(),
        activePlayer: asPlayerId(1),
      },
    });
    const snapshot = createEnumerationSnapshot(shiftedCtx.def, shiftedCtx.state);

    assert.equal(compiled(shiftedCtx.state, shiftedCtx.activePlayer, shiftedCtx.bindings), true);
    assert.equal(compiled(shiftedCtx.state, shiftedCtx.activePlayer, shiftedCtx.bindings, snapshot), true);
    assert.equal(
      compiled(shiftedCtx.state, shiftedCtx.activePlayer, shiftedCtx.bindings, snapshot),
      evalCondition(condition, shiftedCtx),
    );
  });

  it('returns null for non-compilable expressions and selectors', () => {
    const aggregateExpr: ValueExpr = {
      _t: 5,
      aggregate: { op: 'count', query: { query: 'zones' } },
    };
    const filteredAggregateExpr: ValueExpr = {
      _t: 5,
      aggregate: {
        op: 'count',
        query: {
          query: 'tokensInZone',
          zone: 'board:none',
          filter: { op: 'and', args: [{ prop: 'type', op: 'eq', value: 'piece' }] },
        },
      },
    };
    const dynamicZoneAggregateExpr: ValueExpr = {
      _t: 5,
      aggregate: {
        op: 'count',
        query: { query: 'tokensInZone', zone: { zoneExpr: { _t: 2, ref: 'binding', name: '$zone' } } },
      },
    };
    const mapSpacesAggregateExpr: ValueExpr = {
      _t: 5,
      aggregate: { op: 'count', query: { query: 'tokensInMapSpaces' } },
    };
    const sumAggregateExpr: ValueExpr = {
      _t: 5,
      aggregate: {
        op: 'sum',
        query: { query: 'tokensInZone', zone: 'board:none' },
        bind: '$token',
        valueExpr: 1,
      },
    };
    const concatExpr: ValueExpr = { _t: 3, concat: ['a', 'b'] };
    const ifExpr: ValueExpr = { _t: 4, if: { when: true, then: 1, else: 0 } };
    const arithmeticExpr: ValueExpr = { _t: 6, op: '+', left: 1, right: 2 };

    assert.equal(tryCompileValueExpr(aggregateExpr), null);
    assert.equal(tryCompileValueExpr(filteredAggregateExpr), null);
    assert.equal(tryCompileValueExpr(dynamicZoneAggregateExpr), null);
    assert.equal(tryCompileValueExpr(mapSpacesAggregateExpr), null);
    assert.equal(tryCompileValueExpr(sumAggregateExpr), null);
    assert.equal(tryCompileValueExpr(concatExpr), null);
    assert.equal(tryCompileValueExpr(ifExpr), null);
    assert.equal(tryCompileValueExpr(arithmeticExpr), null);
    assert.equal(tryCompileValueExpr({ _t: 2, ref: 'gvar', var: { ref: 'binding', name: '$var' } }), null);
    assert.equal(tryCompileValueExpr({ _t: 2, ref: 'zoneVar', zone: 'board:none', var: { ref: 'binding', name: '$var' } }), null);
    assert.equal(tryCompileValueExpr({ _t: 2, ref: 'pvar', player: 'actor', var: 'resources' }), null);
    assert.equal(tryCompileValueExpr({ _t: 2, ref: 'pvar', player: { relative: 'left' }, var: 'resources' }), null);

    const aggregateCondition: ConditionAST = { op: '==', left: aggregateExpr, right: 0 };
    const booleanCombination: ConditionAST = { op: 'and', args: [true, false] };
    const mixedBooleanCombination: ConditionAST = {
      op: 'or',
      args: [true, { op: 'in', item: 'x', set: { _t: 1, scalarArray: ['x'] } }],
    };
    assert.equal(tryCompileCondition(aggregateCondition), null);
    assert.ok(tryCompileCondition(booleanCombination) !== null);
    assert.equal(tryCompileCondition(mixedBooleanCombination), null);
  });

  it('compiles nested boolean trees when every sub-condition is compilable', () => {
    const ctx = makeCtx({ bindings: { '$value': 4 } });
    const condition: ConditionAST = {
      op: 'and',
      args: [
        {
          op: 'or',
          args: [
            { op: '==', left: { _t: 2, ref: 'gvar', var: 'resources' }, right: 0 },
            { op: '==', left: { _t: 2, ref: 'binding', name: '$value' }, right: 4 },
          ],
        },
        {
          op: 'not',
          arg: { op: '<', left: { _t: 2, ref: 'pvar', player: 'active', var: 'resources' }, right: 5 },
        },
      ],
    };

    assert.equal(evaluateCompiled(condition, ctx), true);
    assert.equal(evaluateCompiled(condition, ctx), evalCondition(condition, ctx));
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
