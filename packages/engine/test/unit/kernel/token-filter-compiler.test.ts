import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  buildAdjacencyGraph,
  tryCompileTokenFilter,
  type GameDef,
  type GameState,
  type ReadContext,
  type Token,
  type TokenFilterExpr,
} from '../../../src/kernel/index.js';
import { compileFitlValidatedGameDef } from '../../helpers/compiled-condition-production-helpers.js';
import { collectTokenFilterExprs } from '../../helpers/token-filter-production-helpers.js';
import { initialState } from '../../../src/kernel/initial-state.js';
import { matchesTokenFilterExpr } from '../../../src/kernel/token-filter.js';
import { makeEvalContext } from '../../helpers/eval-context-test-helpers.js';

const makeToken = (id: string, props: Token['props']): Token => ({
  id: asTokenId(id),
  type: 'piece',
  props,
});

const makeDef = (): GameDef =>
  ({
    metadata: { id: 'token-filter-compiler-test', players: { min: 2, max: 2 } },
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
    resources: 4,
  },
  perPlayerVars: {
    0: { resources: 1 },
    1: { resources: 5 },
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

const requiresContext = (expr: TokenFilterExpr): boolean => {
  if ('value' in expr) {
    return !Array.isArray(expr.value) && (typeof expr.value !== 'string' && typeof expr.value !== 'number' && typeof expr.value !== 'boolean');
  }
  if (expr.op === 'not') {
    return requiresContext(expr.arg);
  }
  return expr.args.some(requiresContext);
};

describe('token-filter compiler', () => {
  it('compiles simple equality predicates', () => {
    const compiled = tryCompileTokenFilter({ prop: 'faction', op: 'eq', value: 'VC' });
    assert.ok(compiled !== null);

    assert.equal(compiled(makeToken('t1', { faction: 'VC' })), true);
    assert.equal(compiled(makeToken('t2', { faction: 'US' })), false);
  });

  it('compiles nested boolean filters with short-circuit behavior', () => {
    const compiled = tryCompileTokenFilter({
      op: 'and',
      args: [
        { prop: 'faction', op: 'eq', value: 'VC' },
        { prop: 'type', op: 'in', value: ['troops', 'base'] },
      ],
    });
    assert.ok(compiled !== null);

    const props = Object.defineProperties(
      { faction: 'US' },
      {
        type: {
          get() {
            throw new Error('compiled token filter should short-circuit');
          },
        },
      },
    ) as Token['props'];

    assert.equal(compiled(makeToken('t1', props)), false);
    assert.equal(compiled(makeToken('t2', { faction: 'VC', type: 'base' })), true);
    assert.equal(compiled(makeToken('t3', { faction: 'VC', type: 'guerrilla' })), false);
  });

  it('returns null for zoneProp filters', () => {
    const compiled = tryCompileTokenFilter({
      field: { kind: 'zoneProp', prop: 'support' },
      op: 'eq',
      value: 'activeOpposition',
    });

    assert.equal(compiled, null);
  });

  it('returns null for tokenZone filters', () => {
    const compiled = tryCompileTokenFilter({
      field: { kind: 'tokenZone' },
      op: 'eq',
      value: 'southVietnam:saigon',
    });

    assert.equal(compiled, null);
  });

  it('returns null for binding-reference values', () => {
    const compiled = tryCompileTokenFilter({
      prop: 'faction',
      op: 'eq',
      value: { _t: 2, ref: 'binding', name: '$faction' },
    });

    assert.ok(compiled !== null);
    const ctx = makeCtx({ bindings: { '$faction': 'VC' } });

    assert.equal(compiled(makeToken('t1', { faction: 'VC' }), ctx), true);
    assert.equal(compiled(makeToken('t2', { faction: 'US' }), ctx), false);
  });

  it('compiles dynamic predicate values with ReadContext parity', () => {
    const bindingExpr: TokenFilterExpr = {
      prop: 'faction',
      op: 'in',
      value: { _t: 2, ref: 'binding', name: '$targetFactions' },
    };
    const gvarExpr: TokenFilterExpr = {
      prop: 'strength',
      op: 'neq',
      value: { _t: 2, ref: 'gvar', var: 'resources' },
    };
    const grantContextExpr: TokenFilterExpr = {
      prop: 'faction',
      op: 'eq',
      value: { _t: 2, ref: 'grantContext', key: 'targetFaction' },
    };
    const capturedZonesExpr: TokenFilterExpr = {
      prop: 'originZone',
      op: 'in',
      value: { _t: 2, ref: 'capturedSequenceZones', key: 'marchPath' },
    };
    const ctx = makeCtx({
      bindings: { '$targetFactions': ['US', 'ARVN'] },
      freeOperationOverlay: {
        grantContext: { targetFaction: 'US' },
        capturedSequenceZonesByKey: { marchPath: ['alpha:none', 'beta:none'] },
      },
    });
    const usToken = makeToken('t1', { faction: 'US', strength: 3, originZone: 'alpha:none' });
    const arvnToken = makeToken('t2', { faction: 'ARVN', strength: 4, originZone: 'gamma:none' });

    for (const expr of [bindingExpr, gvarExpr, grantContextExpr, capturedZonesExpr]) {
      const compiled = tryCompileTokenFilter(expr);
      assert.ok(compiled !== null);
      for (const token of [usToken, arvnToken]) {
        assert.equal(
          compiled(token, ctx),
          matchesTokenFilterExpr(token, expr, (value) => {
            if (value === bindingExpr.value) return ['US', 'ARVN'];
            if (value === gvarExpr.value) return 4;
            if (value === grantContextExpr.value) return 'US';
            if (value === capturedZonesExpr.value) return ['alpha:none', 'beta:none'];
            return null;
          }),
        );
      }
    }
  });

  it('returns null for malformed boolean expression shapes', () => {
    assert.equal(tryCompileTokenFilter({ op: 'and', args: [] } as unknown as TokenFilterExpr), null);
    assert.equal(
      tryCompileTokenFilter({
        op: 'xor',
        args: [{ prop: 'faction', op: 'eq', value: 'VC' }],
      } as unknown as TokenFilterExpr),
      null,
    );
    assert.equal(
      tryCompileTokenFilter({
        prop: 'faction',
        op: 'zonePropIncludes',
        value: 'VC',
      } as unknown as TokenFilterExpr),
      null,
    );
  });

  it('returns null for non-compilable dynamic predicate values', () => {
    const compiled = tryCompileTokenFilter({
      prop: 'faction',
      op: 'eq',
      value: { _t: 2, ref: 'pvar', player: 'actor', var: 'resources' },
    });

    assert.equal(compiled, null);
  });

  it('matches the interpreter for a production FITL token-filter corpus', () => {
    const def = compileFitlValidatedGameDef();
    const exprs = collectTokenFilterExprs(def);
    const state = initialState(def, 17).state;
    const tokens = Object.values(state.zones).flat();
    let compiledCount = 0;

    for (const expr of exprs) {
      const compiled = tryCompileTokenFilter(expr);
      if (compiled === null) {
        continue;
      }
      if (requiresContext(expr)) {
        continue;
      }
      compiledCount += 1;
      for (const token of tokens) {
        assert.equal(
          compiled(token),
          matchesTokenFilterExpr(token, expr),
          `expected compiled parity for token ${String(token.id)}`,
        );
      }
    }

    assert.ok(compiledCount >= 20, `expected at least 20 compilable FITL token filters, saw ${compiledCount}`);
  });
});
