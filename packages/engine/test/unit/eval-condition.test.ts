import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildAdjacencyGraph,
  createCollector,
  asPhaseId,
  asPlayerId,
  asZoneId,
  evalCondition,
  isEvalErrorCode,
  type EvalContext,
  type GameDef,
  type GameState,
} from '../../src/kernel/index.js';

const makeDef = (): GameDef => ({
  metadata: { id: 'eval-condition-test', players: { min: 1, max: 4 } },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [
    { id: asZoneId('deck:none'), owner: 'none', visibility: 'hidden', ordering: 'stack' },
    { id: asZoneId('hand:0'), owner: 'player', visibility: 'owner', ordering: 'stack' },
  ],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [] },
  actions: [],
  triggers: [],
  terminal: { conditions: [] },
});

const makeState = (): GameState => ({
  globalVars: { a: 3, b: 5 },
  perPlayerVars: {},
  zoneVars: {},
  playerCount: 2,
  zones: {
    'deck:none': [],
    'hand:0': [],
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

const makeCtx = (overrides?: Partial<EvalContext>): EvalContext => ({
  def: makeDef(),
  adjacencyGraph: buildAdjacencyGraph([]),
  state: makeState(),
  activePlayer: asPlayerId(0),
  actorPlayer: asPlayerId(1),
  bindings: {},
  collector: createCollector(),
  ...overrides,
});

describe('evalCondition', () => {
  it('evaluates comparison operators', () => {
    const ctx = makeCtx();

    assert.equal(evalCondition({ op: '==', left: 3, right: 3 }, ctx), true);
    assert.equal(evalCondition({ op: '==', left: 3, right: 4 }, ctx), false);
    assert.equal(evalCondition({ op: '!=', left: 3, right: 4 }, ctx), true);
    assert.equal(evalCondition({ op: '<', left: 3, right: 5 }, ctx), true);
    assert.equal(evalCondition({ op: '<', left: 5, right: 3 }, ctx), false);
    assert.equal(evalCondition({ op: '<=', left: 3, right: 3 }, ctx), true);
    assert.equal(evalCondition({ op: '>', left: 5, right: 3 }, ctx), true);
    assert.equal(evalCondition({ op: '>=', left: 3, right: 3 }, ctx), true);
  });

  it('evaluates boolean logic including vacuous and/or', () => {
    const ctx = makeCtx();

    assert.equal(evalCondition({ op: 'and', args: [{ op: '==', left: 1, right: 1 }] }, ctx), true);
    assert.equal(
      evalCondition({ op: 'and', args: [{ op: '==', left: 1, right: 1 }, { op: '==', left: 1, right: 2 }] }, ctx),
      false,
    );
    assert.equal(evalCondition({ op: 'and', args: [] }, ctx), true);

    assert.equal(
      evalCondition({ op: 'or', args: [{ op: '==', left: 1, right: 2 }, { op: '==', left: 2, right: 2 }] }, ctx),
      true,
    );
    assert.equal(
      evalCondition({ op: 'or', args: [{ op: '==', left: 1, right: 2 }, { op: '==', left: 2, right: 3 }] }, ctx),
      false,
    );
    assert.equal(evalCondition({ op: 'or', args: [] }, ctx), false);

    assert.equal(evalCondition({ op: 'not', arg: { op: '==', left: 1, right: 1 } }, ctx), false);
    assert.equal(evalCondition({ op: 'not', arg: { op: '==', left: 1, right: 2 } }, ctx), true);
  });

  it('evaluates nested expressions', () => {
    const ctx = makeCtx();
    const condition = {
      op: 'and',
      args: [
        {
          op: 'or',
          args: [
            { op: '==', left: { ref: 'gvar', var: 'a' }, right: 9 },
            { op: '==', left: { ref: 'gvar', var: 'a' }, right: 3 },
          ],
        },
        { op: 'not', arg: { op: '==', left: { ref: 'gvar', var: 'b' }, right: 9 } },
      ],
    } as const;

    assert.equal(evalCondition(condition, ctx), true);
  });

  it('short-circuits and/or evaluation', () => {
    const ctx = makeCtx();

    assert.equal(
      evalCondition(
        {
          op: 'and',
          args: [
            { op: '==', left: 1, right: 2 },
            { op: '==', left: { ref: 'binding', name: '$missing' }, right: 1 },
          ],
        },
        ctx,
      ),
      false,
    );

    assert.equal(
      evalCondition(
        {
          op: 'or',
          args: [
            { op: '==', left: 2, right: 2 },
            { op: '==', left: { ref: 'binding', name: '$missing' }, right: 1 },
          ],
        },
        ctx,
      ),
      true,
    );
  });

  it('throws TYPE_MISMATCH for non-numeric ordering comparisons', () => {
    const ctx = makeCtx();
    assert.throws(
      () => evalCondition({ op: '<', left: 1, right: 'bad' }, ctx),
      (error: unknown) => isEvalErrorCode(error, 'TYPE_MISMATCH'),
    );
  });

  it('supports in membership against bound collections', () => {
    const ctx = makeCtx({ bindings: { '$set': [1, 3, 5] } });

    assert.equal(evalCondition({ op: 'in', item: 3, set: { ref: 'binding', name: '$set' } }, ctx), true);
    assert.equal(evalCondition({ op: 'in', item: 2, set: { ref: 'binding', name: '$set' } }, ctx), false);
  });

  it('throws TYPE_MISMATCH when in set is not a collection', () => {
    const ctx = makeCtx({ bindings: { '$set': 3 } });
    assert.throws(
      () => evalCondition({ op: 'in', item: 3, set: { ref: 'binding', name: '$set' } }, ctx),
      (error: unknown) => isEvalErrorCode(error, 'TYPE_MISMATCH'),
    );
  });

  it('throws TYPE_MISMATCH when in set mixes scalar types', () => {
    const ctx = makeCtx({ bindings: { '$set': [1, '2', 3] } });
    assert.throws(
      () => evalCondition({ op: 'in', item: 3, set: { ref: 'binding', name: '$set' } }, ctx),
      (error: unknown) => isEvalErrorCode(error, 'TYPE_MISMATCH'),
    );
  });

  it('throws TYPE_MISMATCH when in item and set scalar types do not match', () => {
    const ctx = makeCtx({ bindings: { '$set': [1, 2, 3] } });
    assert.throws(
      () => evalCondition({ op: 'in', item: '3', set: { ref: 'binding', name: '$set' } }, ctx),
      (error: unknown) => isEvalErrorCode(error, 'TYPE_MISMATCH'),
    );
  });

  it('evaluates zonePropIncludes for array properties', () => {
    const ctx = makeCtx({
      def: {
        ...makeDef(),
        zones: [
          ...makeDef().zones,
          {
            id: asZoneId('quang-tri'),
            owner: 'none' as const,
            visibility: 'public' as const,
            ordering: 'set' as const,
            category: 'province',
            attributes: { population: 1, econ: 0, terrainTags: ['highland', 'jungle'], country: 'south-vietnam', coastal: false },
          },
        ],
      },
    });

    assert.equal(
      evalCondition({ op: 'zonePropIncludes', zone: 'quang-tri', prop: 'terrainTags', value: 'highland' }, ctx),
      true,
    );
    assert.equal(
      evalCondition({ op: 'zonePropIncludes', zone: 'quang-tri', prop: 'terrainTags', value: 'coastal' }, ctx),
      false,
    );
  });

  it('throws TYPE_MISMATCH when zonePropIncludes targets a non-array property', () => {
    const ctx = makeCtx({
      def: {
        ...makeDef(),
        zones: [
          ...makeDef().zones,
          {
            id: asZoneId('hue'),
            owner: 'none' as const,
            visibility: 'public' as const,
            ordering: 'set' as const,
            category: 'city',
            attributes: { population: 2, econ: 3, country: 'south-vietnam', coastal: false },
          },
        ],
      },
    });
    assert.throws(
      () => evalCondition({ op: 'zonePropIncludes', zone: 'hue', prop: 'population', value: 2 }, ctx),
      (error: unknown) =>
        isEvalErrorCode(error, 'TYPE_MISMATCH') &&
        typeof error.context === 'object' &&
        error.context !== null &&
        Object.hasOwn(error.context, 'condition'),
    );
  });

  it('throws ZONE_PROP_NOT_FOUND when zonePropIncludes zone not found', () => {
    const ctx = makeCtx();
    assert.throws(
      () => evalCondition({ op: 'zonePropIncludes', zone: 'unknown', prop: 'terrainTags', value: 'highland' }, ctx),
      (error: unknown) =>
        isEvalErrorCode(error, 'ZONE_PROP_NOT_FOUND') &&
        error.context?.zoneId === 'unknown',
    );
  });

  it('evaluates boolean literal true as truthy', () => {
    const ctx = makeCtx({});
    assert.equal(evalCondition(true, ctx), true);
  });

  it('evaluates boolean literal false as falsy', () => {
    const ctx = makeCtx({});
    assert.equal(evalCondition(false, ctx), false);
  });

  it('supports boolean literals inside compound conditions (and/or)', () => {
    const ctx = makeCtx({});
    assert.equal(evalCondition({ op: 'and', args: [true, true] }, ctx), true);
    assert.equal(evalCondition({ op: 'and', args: [true, false] }, ctx), false);
    assert.equal(evalCondition({ op: 'or', args: [false, true] }, ctx), true);
    assert.equal(evalCondition({ op: 'or', args: [false, false] }, ctx), false);
  });

});
