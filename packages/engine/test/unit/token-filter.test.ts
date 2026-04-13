import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { asTokenId } from '../../src/kernel/branded.js';
import { isEvalErrorCode } from '../../src/kernel/eval-error.js';
import { tokenFilterPathSuffix } from '../../src/kernel/token-filter-expr-utils.js';
import {
  filterTokensByExprInContext,
  filterTokensByExpr,
  matchesTokenFilterExprInContext,
  matchesTokenFilterExpr,
  matchesTokenFilterPredicate,
  resolveLiteralTokenFilterValue,
} from '../../src/kernel/token-filter.js';
import type { FreeOperationExecutionOverlay } from '../../src/kernel/free-operation-overlay.js';
import type { GameDef, GameState, Token, TokenFilterExpr, TokenFilterPredicate } from '../../src/kernel/types.js';
import type { ReadContext } from '../../src/kernel/eval-context.js';
import { asPhaseId, asPlayerId, asZoneId, buildAdjacencyGraph } from '../../src/kernel/index.js';
import { makeEvalContext } from '../helpers/eval-context-test-helpers.js';

function makeToken(id: string, props: Token['props']): Token {
  return {
    id: asTokenId(id),
    type: 'card',
    props,
  };
}

const makeDef = (): GameDef =>
  ({
    metadata: { id: 'token-filter-test', players: { min: 2, max: 2 } },
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
  globalVars: { resources: 4 },
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

describe('token-filter', () => {
  it('matches literal token filter predicates and supports id field lookups', () => {
    const token = makeToken('card-1', { suit: 'hearts', rank: 10 });

    assert.equal(matchesTokenFilterPredicate(token, { prop: 'suit', op: 'eq', value: 'hearts' }), true);
    assert.equal(matchesTokenFilterPredicate(token, { prop: 'id', op: 'eq', value: 'card-1' }), true);
    assert.equal(matchesTokenFilterPredicate(token, { prop: 'rank', op: 'in', value: [10, 12] }), true);
    assert.equal(matchesTokenFilterPredicate(token, { prop: 'rank', op: 'notIn', value: [1, 2] }), true);
  });

  it('fails closed for non-literal unresolved values under default resolution', () => {
    const token = makeToken('card-2', { rank: 5 });
    const predicate: TokenFilterPredicate = {
      prop: 'rank',
      op: 'eq',
      value: { _t: 2 as const, ref: 'gvar', var: 'tick' },
    };

    assert.equal(resolveLiteralTokenFilterValue(predicate.value), null);
    assert.equal(matchesTokenFilterPredicate(token, predicate), false);
    assert.equal(matchesTokenFilterExpr(token, { op: 'and', args: [predicate] }), false);
  });

  it('supports caller-provided value resolution for dynamic predicates', () => {
    const token = makeToken('card-3', { rank: 7 });
    const predicate: TokenFilterPredicate = {
      prop: 'rank',
      op: 'eq',
      value: { _t: 2 as const, ref: 'gvar', var: 'tick' },
    };

    const resolved = matchesTokenFilterPredicate(token, predicate, (value) =>
      typeof value === 'object' && value !== null && 'ref' in value ? 7 : null,
    );
    assert.equal(resolved, true);
  });

  it('supports caller-provided set resolution for membership predicates', () => {
    const token = makeToken('card-4', { faction: 'ARVN' });
    const predicate: TokenFilterPredicate = {
      prop: 'faction',
      op: 'in',
      value: { _t: 2 as const, ref: 'binding', name: '$targetFactions' },
    };

    const resolved = matchesTokenFilterPredicate(token, predicate, (value) =>
      typeof value === 'object' && value !== null && 'ref' in value ? ['ARVN', 'US'] : null,
    );
    assert.equal(resolved, true);
  });

  it('rejects caller-provided scalar membership set resolution', () => {
    const token = makeToken('card-4b', { faction: 'ARVN' });
    const predicate: TokenFilterPredicate = {
      prop: 'faction',
      op: 'in',
      value: { _t: 2 as const, ref: 'binding', name: '$targetFactions' },
    };

    assert.throws(
      () =>
        matchesTokenFilterPredicate(token, predicate, (value) =>
          typeof value === 'object' && value !== null && 'ref' in value ? 'ARVN' : null,
        ),
      (error: unknown) => isEvalErrorCode(error, 'TYPE_MISMATCH'),
    );
  });

  it('rejects caller-provided mixed membership set resolution', () => {
    const token = makeToken('card-4c', { faction: 'ARVN' });
    const predicate: TokenFilterPredicate = {
      prop: 'faction',
      op: 'in',
      value: { _t: 2 as const, ref: 'binding', name: '$targetFactions' },
    };

    assert.throws(
      () =>
        matchesTokenFilterPredicate(token, predicate, (value) =>
          typeof value === 'object' && value !== null && 'ref' in value ? ['ARVN', 1] : null,
        ),
      (error: unknown) => isEvalErrorCode(error, 'TYPE_MISMATCH'),
    );
  });

  it('filters token lists by expression filters', () => {
    const tokens: readonly Token[] = [
      makeToken('a', { suit: 'hearts' }),
      makeToken('b', { suit: 'clubs' }),
      makeToken('c', { suit: 'hearts' }),
    ];

    const filtered = filterTokensByExpr(tokens, {
      op: 'or',
      args: [
        { prop: 'suit', op: 'eq', value: 'hearts' },
        { op: 'not', arg: { prop: 'suit', op: 'eq', value: 'clubs' } },
      ],
    });
    assert.deepEqual(filtered.map((token) => token.id), [asTokenId('a'), asTokenId('c')]);
  });

  it('applies free-operation token interpretations when matching token props', () => {
    const token = makeToken('cube-1', { faction: 'ARVN', type: 'police' });
    const overlay: FreeOperationExecutionOverlay = {
      tokenInterpretations: [
        {
          when: {
            op: 'and' as const,
            args: [
              { prop: 'faction', op: 'eq' as const, value: 'ARVN' },
              { prop: 'type', op: 'in' as const, value: ['troops', 'police'] },
            ],
          },
          assign: {
            faction: 'US',
            type: 'troops',
          },
        },
      ],
    };

    assert.equal(matchesTokenFilterPredicate(token, { prop: 'faction', op: 'eq', value: 'US' }, undefined, overlay), true);
    assert.equal(matchesTokenFilterPredicate(token, { prop: 'type', op: 'eq', value: 'troops' }, undefined, overlay), true);
    assert.equal(matchesTokenFilterPredicate(token, { prop: 'faction', op: 'eq', value: 'ARVN' }, undefined, overlay), false);
  });

  it('evaluates nested and/or/not token-filter trees', () => {
    const token = makeToken('a', { suit: 'hearts', rank: 10, elite: false });
    const expression = {
      op: 'or' as const,
      args: [
        {
          op: 'and' as const,
          args: [
            { prop: 'suit', op: 'eq' as const, value: 'clubs' },
            { prop: 'rank', op: 'eq' as const, value: 10 },
          ],
        },
        {
          op: 'not' as const,
          arg: {
            op: 'and' as const,
            args: [
              { prop: 'elite', op: 'eq' as const, value: true },
              { prop: 'rank', op: 'eq' as const, value: 10 },
            ],
          },
        },
      ],
    } as TokenFilterExpr;

    assert.equal(matchesTokenFilterExpr(token, expression), true);
  });

  it('falls back to the interpreter when a custom value resolver is provided', () => {
    const token = makeToken('custom-resolver', { faction: 'VC' });
    const expr: TokenFilterExpr = {
      prop: 'faction',
      op: 'eq',
      value: { _t: 2 as const, ref: 'binding', name: '$faction' },
    };

    assert.equal(
      matchesTokenFilterExpr(
        token,
        expr,
        (value) => (typeof value === 'object' && value !== null && 'ref' in value ? 'VC' : null),
      ),
      true,
    );
  });

  it('falls back to the interpreter when an overlay is provided', () => {
    const token = makeToken('overlay-token', { faction: 'ARVN' });
    const expr: TokenFilterExpr = {
      prop: 'faction',
      op: 'eq',
      value: 'US',
    };
    const overlay: FreeOperationExecutionOverlay = {
      tokenInterpretations: [
        {
          when: {
            prop: 'faction',
            op: 'eq',
            value: 'ARVN',
          },
          assign: {
            faction: 'US',
          },
        },
      ],
    };

    assert.equal(matchesTokenFilterExpr(token, expr, undefined, overlay), true);
  });

  it('uses the context-aware compiled helper for dynamic predicate values', () => {
    const token = makeToken('ctx-token', { faction: 'VC', originZone: 'alpha:none' });
    const ctx = makeCtx({
      bindings: { '$targetFactions': ['VC', 'NVA'] },
      freeOperationOverlay: {
        capturedSequenceZonesByKey: { patrolPath: ['alpha:none', 'beta:none'] },
      },
    });
    const dynamicMembership: TokenFilterExpr = {
      prop: 'faction',
      op: 'in',
      value: { _t: 2 as const, ref: 'binding', name: '$targetFactions' },
    };
    const capturedZones: TokenFilterExpr = {
      prop: 'originZone',
      op: 'in',
      value: { _t: 2 as const, ref: 'capturedSequenceZones', key: 'patrolPath' },
    };

    assert.equal(matchesTokenFilterExprInContext(token, dynamicMembership, ctx), true);
    assert.equal(matchesTokenFilterExprInContext(token, capturedZones, ctx), true);
    assert.deepEqual(filterTokensByExprInContext([token], dynamicMembership, ctx).map((entry) => entry.id), [asTokenId('ctx-token')]);
  });

  it('keeps generic custom-resolver helpers on the interpreter path', () => {
    const token = makeToken('custom-resolver-ctx', { faction: 'ARVN' });
    const ctx = makeCtx({ bindings: { '$targetFaction': 'VC' } });
    const expr: TokenFilterExpr = {
      prop: 'faction',
      op: 'eq',
      value: { _t: 2 as const, ref: 'binding', name: '$targetFaction' },
    };

    assert.equal(
      matchesTokenFilterExpr(
        token,
        expr,
        (value) => (typeof value === 'object' && value !== null && 'ref' in value ? 'ARVN' : null),
      ),
      true,
    );
    assert.equal(matchesTokenFilterExprInContext(token, expr, ctx), false);
  });

  it('rejects zero-arity boolean token filter expressions', () => {
    const token = makeToken('a', { suit: 'hearts' });

    assert.throws(
      () => matchesTokenFilterExpr(token, { op: 'and', args: [] } as unknown as TokenFilterExpr),
      (error: unknown) => {
        if (!isEvalErrorCode(error, 'TYPE_MISMATCH')) {
          return false;
        }
        return error.context?.reason === 'empty_args'
          && error.context?.op === 'and'
          && Array.isArray(error.context.path)
          && tokenFilterPathSuffix(error.context.path) === '';
      },
    );
    assert.throws(
      () => matchesTokenFilterExpr(token, { op: 'or', args: [] } as unknown as TokenFilterExpr),
      (error: unknown) => {
        if (!isEvalErrorCode(error, 'TYPE_MISMATCH')) {
          return false;
        }
        return error.context?.reason === 'empty_args'
          && error.context?.op === 'or'
          && Array.isArray(error.context.path)
          && tokenFilterPathSuffix(error.context.path) === '';
      },
    );
  });

  it('preserves nested traversal paths for zero-arity token filter expressions', () => {
    const token = makeToken('a', { suit: 'hearts' });
    const nested = {
      op: 'not',
      arg: {
        op: 'or',
        args: [
          { prop: 'suit', op: 'eq', value: 'hearts' },
          { op: 'and', args: [] },
        ],
      },
    } as unknown as TokenFilterExpr;

    assert.throws(
      () => matchesTokenFilterExpr(token, nested),
      (error: unknown) => {
        if (!isEvalErrorCode(error, 'TYPE_MISMATCH')) {
          return false;
        }
        return error.context?.reason === 'empty_args'
          && error.context?.op === 'and'
          && Array.isArray(error.context.path)
          && tokenFilterPathSuffix(error.context.path) === '.arg.args[1]';
      },
    );
  });

  it('fails closed for unsupported token filter operators', () => {
    const token = makeToken('a', { suit: 'hearts' });
    const malformed = {
      op: 'xor',
      args: [{ prop: 'suit', op: 'eq', value: 'hearts' }],
    } as unknown as TokenFilterExpr;

    assert.throws(
      () => matchesTokenFilterExpr(token, malformed),
      (error: unknown) => {
        if (!isEvalErrorCode(error, 'TYPE_MISMATCH')) {
          return false;
        }
        return error.context?.reason === 'unsupported_operator'
          && Array.isArray(error.context.path)
          && tokenFilterPathSuffix(error.context.path) === '';
      },
    );
  });

  it('fails closed for unsupported token filter predicate operators', () => {
    const token = makeToken('a', { suit: 'hearts' });
    const malformed = {
      op: 'and',
      args: [{ prop: 'suit', op: 'xor', value: ['hearts'] }],
    } as unknown as TokenFilterExpr;

    assert.throws(
      () => matchesTokenFilterExpr(token, malformed),
      (error: unknown) => isEvalErrorCode(error, 'TYPE_MISMATCH'),
    );
  });

  it('reports nested paths for malformed predicate-like token filter nodes', () => {
    const token = makeToken('a', { suit: 'hearts' });
    const malformed = {
      op: 'and',
      args: [
        { prop: 'suit', op: 'eq', value: 'hearts' },
        { prop: 'rank' },
      ],
    } as unknown as TokenFilterExpr;

    assert.throws(
      () => matchesTokenFilterExpr(token, malformed),
      (error: unknown) => {
        if (!isEvalErrorCode(error, 'TYPE_MISMATCH')) {
          return false;
        }
        return error.context?.reason === 'unsupported_operator'
          && Array.isArray(error.context.path)
          && tokenFilterPathSuffix(error.context.path) === '.args[1]';
      },
    );
  });
});
