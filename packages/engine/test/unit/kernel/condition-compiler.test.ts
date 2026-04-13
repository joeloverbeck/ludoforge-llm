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
  return compiled(ctx, snapshot);
};

const evaluateCompiledValue = (
  expr: ValueExpr,
  ctx: ReadContext,
  options?: { readonly snapshot?: EnumerationStateSnapshot },
): ReturnType<typeof evalValue> => {
  const compiled = tryCompileValueExpr(expr);
  assert.ok(compiled !== null);
  return compiled(ctx, options?.snapshot);
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

    assert.equal(compiledGvar(ctx), false);
    assert.equal(compiledPvar(ctx), false);
    assert.equal(compiledGvar(ctx, snapshot), true);
    assert.equal(compiledPvar(ctx, snapshot), true);
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

    assert.equal(accessor(ctx), 2);
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

    assert.equal(compiled(ctx), false);
    assert.equal(compiled(ctx, snapshot), true);
    assert.equal(calls, 1);
  });

  it('compiles arithmetic expressions across the full live operator family', () => {
    const ctx = makeCtx({
      bindings: {
        '$left': 7,
        '$right': 3,
        '$negLeft': -7,
        '$negRight': 3,
      },
    });
    const cases: readonly ValueExpr[] = [
      { _t: 6, op: '+', left: { _t: 2, ref: 'binding', name: '$left' }, right: { _t: 2, ref: 'binding', name: '$right' } },
      { _t: 6, op: '-', left: { _t: 2, ref: 'binding', name: '$left' }, right: { _t: 2, ref: 'binding', name: '$right' } },
      { _t: 6, op: '*', left: { _t: 2, ref: 'binding', name: '$left' }, right: { _t: 2, ref: 'binding', name: '$right' } },
      { _t: 6, op: '/', left: { _t: 2, ref: 'binding', name: '$left' }, right: { _t: 2, ref: 'binding', name: '$right' } },
      { _t: 6, op: 'floorDiv', left: { _t: 2, ref: 'binding', name: '$negLeft' }, right: { _t: 2, ref: 'binding', name: '$negRight' } },
      { _t: 6, op: 'ceilDiv', left: { _t: 2, ref: 'binding', name: '$negLeft' }, right: { _t: 2, ref: 'binding', name: '$negRight' } },
      { _t: 6, op: 'min', left: { _t: 2, ref: 'binding', name: '$left' }, right: { _t: 2, ref: 'binding', name: '$right' } },
      { _t: 6, op: 'max', left: { _t: 2, ref: 'binding', name: '$left' }, right: { _t: 2, ref: 'binding', name: '$right' } },
    ];

    for (const expr of cases) {
      assert.equal(evaluateCompiledValue(expr, ctx), evalValue(expr, ctx));
    }
  });

  it('matches interpreter behavior for concat over scalars and scalar arrays', () => {
    const ctx = makeCtx({
      bindings: {
        '$suffix': 'north',
        '$letters': ['b', 'c'],
      },
    });
    const scalarConcat: ValueExpr = {
      _t: 3,
      concat: ['a-', { _t: 2, ref: 'binding', name: '$suffix' }, '-', { _t: 2, ref: 'gvar', var: 'resources' }],
    };
    const arrayConcat: ValueExpr = {
      _t: 3,
      concat: [{ _t: 1, scalarArray: ['a'] }, { _t: 2, ref: 'binding', name: '$letters' }, { _t: 1, scalarArray: ['d'] }],
    };

    assert.deepEqual(evaluateCompiledValue(scalarConcat, ctx), evalValue(scalarConcat, ctx));
    assert.deepEqual(evaluateCompiledValue(arrayConcat, ctx), evalValue(arrayConcat, ctx));
  });

  it('matches interpreter behavior for if expressions, including nested arithmetic composition', () => {
    const truthyCtx = makeCtx({ bindings: { '$threshold': 3 } });
    const falsyCtx = makeCtx({ bindings: { '$threshold': 9 } });
    const expr: ValueExpr = {
      _t: 4,
      if: {
        when: { op: '>=', left: { _t: 2, ref: 'gvar', var: 'resources' }, right: { _t: 2, ref: 'binding', name: '$threshold' } },
        then: {
          _t: 6,
          op: '+',
          left: { _t: 2, ref: 'gvar', var: 'resources' },
          right: { _t: 2, ref: 'pvar', player: 'active', var: 'resources' },
        },
        else: {
          _t: 3,
          concat: ['fallback-', { _t: 2, ref: 'binding', name: '$threshold' }],
        },
      },
    };

    assert.equal(evaluateCompiledValue(expr, truthyCtx), evalValue(expr, truthyCtx));
    assert.equal(evaluateCompiledValue(expr, falsyCtx), evalValue(expr, falsyCtx));
  });

  it('matches interpreter errors for arithmetic division by zero and mixed concat parts', () => {
    const divisionExpr: ValueExpr = {
      _t: 6,
      op: '/',
      left: 4,
      right: 0,
    };
    const mixedConcatExpr: ValueExpr = {
      _t: 3,
      concat: ['x', { _t: 1, scalarArray: ['y'] }],
    };
    const ctx = makeCtx();

    assert.throws(
      () => evaluateCompiledValue(divisionExpr, ctx),
      (error: unknown) => isEvalErrorCode(error, 'DIVISION_BY_ZERO'),
    );
    assert.throws(
      () => evalValue(divisionExpr, ctx),
      (error: unknown) => isEvalErrorCode(error, 'DIVISION_BY_ZERO'),
    );
    assert.throws(
      () => evaluateCompiledValue(mixedConcatExpr, ctx),
      (error: unknown) => isEvalErrorCode(error, 'TYPE_MISMATCH'),
    );
    assert.throws(
      () => evalValue(mixedConcatExpr, ctx),
      (error: unknown) => isEvalErrorCode(error, 'TYPE_MISMATCH'),
    );
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

    assert.equal(compiled(ctx), true);
    assert.equal(compiled(ctx, snapshot), true);
    assert.equal(compiled(ctx, snapshot), evalCondition(condition, ctx));
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
      () => accessor(ctx),
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

    assert.equal(compiled(ctx), false);
    assert.equal(compiled(ctx, snapshot), true);
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

    const playerZeroCtx = { ...ctx, activePlayer: asPlayerId(0) };
    const playerOneCtx = { ...ctx, activePlayer: asPlayerId(1) };

    assert.equal(compiled(playerZeroCtx, snapshot), false);
    assert.equal(compiled(playerOneCtx, snapshot), true);
    assert.equal(
      compiled(playerZeroCtx, snapshot),
      compiled(playerZeroCtx),
    );
    assert.equal(
      compiled(playerOneCtx, snapshot),
      compiled(playerOneCtx),
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

    assert.equal(compiled(shiftedCtx), true);
    assert.equal(compiled(shiftedCtx, snapshot), true);
    assert.equal(
      compiled(shiftedCtx, snapshot),
      evalCondition(condition, shiftedCtx),
    );
  });

  it('compiles in, zonePropIncludes, and marker lattice conditions with interpreter parity', () => {
    const def: GameDef = ({
      ...makeDef(),
      zones: [
        {
          id: asZoneId('board:none'),
          zoneKind: 'board',
          owner: 'none',
          visibility: 'public',
          ordering: 'set',
          category: 'province',
          attributes: { terrainTags: ['urban', 'coastal'], population: 2 },
        },
        {
          id: asZoneId('saigon:none'),
          zoneKind: 'board',
          owner: 'none',
          visibility: 'public',
          ordering: 'set',
          category: 'city',
          attributes: { population: 2 },
        },
        {
          id: asZoneId('central-laos:none'),
          zoneKind: 'board',
          owner: 'none',
          visibility: 'public',
          ordering: 'set',
          category: 'province',
          attributes: { population: 0 },
        },
      ],
      markerLattices: [
        {
          id: 'supportOpposition',
          states: ['activeOpposition', 'passiveOpposition', 'neutral', 'passiveSupport', 'activeSupport'],
          defaultState: 'neutral',
          constraints: [
            {
              when: {
                op: '==',
                left: { _t: 2, ref: 'zoneProp', zone: '$space', prop: 'population' },
                right: 0,
              },
              allowedStates: ['neutral'],
            },
          ],
        },
      ],
    }) as unknown as GameDef;
    const ctx = makeCtx({
      def,
      state: {
        ...makeState(),
        zones: {
          'board:none': [],
          'saigon:none': [],
          'central-laos:none': [],
        },
        markers: {
          'saigon:none': { supportOpposition: 'activeSupport' },
          'central-laos:none': { supportOpposition: 'neutral' },
        },
      },
      bindings: {
        '$faction': 'US',
      },
    });

    const memberCondition: ConditionAST = {
      op: 'in',
      item: { _t: 2, ref: 'binding', name: '$faction' },
      set: { _t: 1, scalarArray: ['US', 'ARVN'] },
    };
    const nonMemberCondition: ConditionAST = {
      op: 'in',
      item: { _t: 2, ref: 'binding', name: '$faction' },
      set: { _t: 1, scalarArray: ['NVA', 'VC'] },
    };
    const zonePropCondition: ConditionAST = {
      op: 'zonePropIncludes',
      zone: 'board:none',
      prop: 'terrainTags',
      value: 'coastal',
    };
    const legalMarkerState: ConditionAST = {
      op: 'markerStateAllowed',
      space: 'saigon:none',
      marker: 'supportOpposition',
      state: 'activeSupport',
    };
    const illegalMarkerState: ConditionAST = {
      op: 'markerStateAllowed',
      space: 'central-laos:none',
      marker: 'supportOpposition',
      state: 'activeSupport',
    };
    const legalMarkerShift: ConditionAST = {
      op: 'markerShiftAllowed',
      space: 'saigon:none',
      marker: 'supportOpposition',
      delta: -1,
    };

    assert.equal(evaluateCompiled(memberCondition, ctx), evalCondition(memberCondition, ctx));
    assert.equal(evaluateCompiled(nonMemberCondition, ctx), evalCondition(nonMemberCondition, ctx));
    assert.equal(evaluateCompiled(zonePropCondition, ctx), evalCondition(zonePropCondition, ctx));
    assert.equal(evaluateCompiled(legalMarkerState, ctx), evalCondition(legalMarkerState, ctx));
    assert.equal(evaluateCompiled(illegalMarkerState, ctx), evalCondition(illegalMarkerState, ctx));
    assert.equal(evaluateCompiled(legalMarkerShift, ctx), evalCondition(legalMarkerShift, ctx));
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
    const dynamicConcatExpr: ValueExpr = {
      _t: 3,
      concat: [{ _t: 2, ref: 'pvar', player: 'actor', var: 'resources' }, 'b'],
    };
    const ifWithDynamicCondition: ValueExpr = {
      _t: 4,
      if: {
        when: { op: '==', left: { _t: 2, ref: 'pvar', player: 'actor', var: 'resources' }, right: 1 },
        then: 1,
        else: 0,
      },
    };
    const arithmeticWithDynamicChild: ValueExpr = {
      _t: 6,
      op: '+',
      left: 1,
      right: { _t: 2, ref: 'pvar', player: 'actor', var: 'resources' },
    };
    const inWithDynamicOperand: ConditionAST = {
      op: 'in',
      item: { _t: 2, ref: 'pvar', player: 'actor', var: 'resources' },
      set: { _t: 1, scalarArray: [1] },
    };
    const zonePropWithDynamicValue: ConditionAST = {
      op: 'zonePropIncludes',
      zone: 'board:none',
      prop: 'terrainTags',
      value: { _t: 2, ref: 'pvar', player: 'actor', var: 'resources' },
    };
    const markerStateWithDynamicValue: ConditionAST = {
      op: 'markerStateAllowed',
      space: 'board:none',
      marker: 'supportOpposition',
      state: { _t: 2, ref: 'pvar', player: 'actor', var: 'resources' },
    };
    const markerShiftWithDynamicValue: ConditionAST = {
      op: 'markerShiftAllowed',
      space: 'board:none',
      marker: 'supportOpposition',
      delta: { _t: 2, ref: 'pvar', player: 'actor', var: 'resources' },
    };

    assert.equal(tryCompileValueExpr(aggregateExpr), null);
    assert.equal(tryCompileValueExpr(filteredAggregateExpr), null);
    assert.equal(tryCompileValueExpr(dynamicZoneAggregateExpr), null);
    assert.equal(tryCompileValueExpr(mapSpacesAggregateExpr), null);
    assert.equal(tryCompileValueExpr(sumAggregateExpr), null);
    assert.ok(tryCompileValueExpr(concatExpr) !== null);
    assert.ok(tryCompileValueExpr(ifExpr) !== null);
    assert.ok(tryCompileValueExpr(arithmeticExpr) !== null);
    assert.equal(tryCompileValueExpr(dynamicConcatExpr), null);
    assert.equal(tryCompileValueExpr(ifWithDynamicCondition), null);
    assert.equal(tryCompileValueExpr(arithmeticWithDynamicChild), null);
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
    assert.ok(tryCompileCondition(mixedBooleanCombination) !== null);
    assert.equal(tryCompileCondition(inWithDynamicOperand), null);
    assert.equal(tryCompileCondition(zonePropWithDynamicValue), null);
    assert.equal(tryCompileCondition(markerStateWithDynamicValue), null);
    assert.equal(tryCompileCondition(markerShiftWithDynamicValue), null);
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
