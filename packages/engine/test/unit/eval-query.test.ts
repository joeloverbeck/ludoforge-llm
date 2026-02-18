import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildAdjacencyGraph,
  buildRuntimeTableIndex,
  createCollector,
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  evalQuery,
  isEvalErrorCode,
  type EvalContext,
  type GameDef,
  type GameState,
  type Token,
} from '../../src/kernel/index.js';

const makeDef = (): GameDef => ({
  metadata: { id: 'eval-query-test', players: { min: 1, max: 4 } },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [
    {
      id: asZoneId('deck:none'),
      owner: 'none',
      visibility: 'hidden',
      ordering: 'stack',
      adjacentTo: [asZoneId('hand:1'), asZoneId('hand:0')],
    },
    {
      id: asZoneId('hand:0'),
      owner: 'player',
      visibility: 'owner',
      ordering: 'stack',
      adjacentTo: [asZoneId('deck:none'), asZoneId('bench:1')],
    },
    {
      id: asZoneId('hand:1'),
      owner: 'player',
      visibility: 'owner',
      ordering: 'stack',
      adjacentTo: [asZoneId('deck:none')],
    },
    {
      id: asZoneId('bench:1'),
      owner: 'player',
      visibility: 'public',
      ordering: 'queue',
      adjacentTo: [asZoneId('hand:0'), asZoneId('tableau:2')],
    },
    {
      id: asZoneId('tableau:2'),
      owner: 'player',
      visibility: 'public',
      ordering: 'set',
      adjacentTo: [asZoneId('bench:1')],
    },
    {
      id: asZoneId('battlefield:none'),
      owner: 'none',
      visibility: 'public',
      ordering: 'set',
    },
  ],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [] },
  actions: [],
  triggers: [],
  terminal: { conditions: [] },
});

const makeToken = (id: string): Token => ({
  id: asTokenId(id),
  type: 'card',
  props: { cost: 1 },
});

const makeFactionToken = (id: string, faction: string): Token => ({
  id: asTokenId(id),
  type: 'piece',
  props: { faction },
});

const makeState = (): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  playerCount: 3,
  zones: {
    'deck:none': [makeToken('deck-1'), makeToken('deck-2')],
    'hand:0': [makeToken('hand-0'), makeToken('hand-0b')],
    'hand:1': [makeToken('hand-1')],
    'bench:1': [],
    'tableau:2': [],
    'battlefield:none': [
      makeFactionToken('us-troop-1', 'US'),
      makeFactionToken('us-troop-2', 'US'),
      makeFactionToken('arvn-troop-1', 'ARVN'),
      makeFactionToken('nva-guerrilla-1', 'NVA'),
      makeFactionToken('vc-guerrilla-1', 'VC'),
    ],
  },
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(2),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [1n, 2n] },
  stateHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
});

const makeCtx = (overrides?: Partial<EvalContext>): EvalContext => {
  const def = makeDef();
  return {
    def,
    adjacencyGraph: buildAdjacencyGraph(def.zones),
    state: makeState(),
    activePlayer: asPlayerId(2),
    actorPlayer: asPlayerId(1),
    bindings: {},
    collector: createCollector(),
    ...overrides,
  };
};

describe('evalQuery', () => {
  it('returns tokensInZone in state container order and without mutating zone arrays', () => {
    const ctx = makeCtx();

    const result = evalQuery({ query: 'tokensInZone', zone: 'deck:none' }, ctx);
    assert.deepEqual(
      result.map((token) => (token as Token).id),
      [asTokenId('deck-1'), asTokenId('deck-2')],
    );

    const mutableCopy = [...result] as Token[];
    mutableCopy.push(makeToken('deck-3'));
    assert.equal(ctx.state.zones['deck:none']?.length, 2);
  });

  it('resolves tokensInZone zoneExpr dynamically at runtime', () => {
    const ctx = makeCtx({
      bindings: { $targetZone: 'hand:1' },
    });

    const result = evalQuery(
      { query: 'tokensInZone', zone: { zoneExpr: { ref: 'binding', name: '$targetZone' } } },
      ctx,
    );

    assert.deepEqual(
      result.map((token) => (token as Token).id),
      [asTokenId('hand-1')],
    );
  });

  it('evaluates intsInRange edge cases', () => {
    const ctx = makeCtx();

    assert.deepEqual(evalQuery({ query: 'intsInRange', min: 1, max: 5 }, ctx), [1, 2, 3, 4, 5]);
    assert.deepEqual(evalQuery({ query: 'intsInRange', min: 3, max: 3 }, ctx), [3]);
    assert.deepEqual(evalQuery({ query: 'intsInRange', min: 5, max: 3 }, ctx), []);
  });

  it('evaluates intsInRange with dynamic ValueExpr bounds', () => {
    const ctx = makeCtx({
      bindings: { $min: 2 },
    });

    assert.deepEqual(
      evalQuery(
        {
          query: 'intsInRange',
          min: { ref: 'binding', name: '$min' },
          max: { op: '+', left: { ref: 'binding', name: '$min' }, right: 2 },
        },
        ctx,
      ),
      [2, 3, 4],
    );
  });

  it('returns empty domain when dynamic intsInRange bounds are invalid', () => {
    const nonInteger = makeCtx({ bindings: { $min: 1.5, $max: 4 } });
    assert.deepEqual(
      evalQuery(
        {
          query: 'intsInRange',
          min: { ref: 'binding', name: '$min' },
          max: { ref: 'binding', name: '$max' },
        },
        nonInteger,
      ),
      [],
    );

    const nonNumeric = makeCtx({ bindings: { $min: 'x', $max: 4 } });
    assert.deepEqual(
      evalQuery(
        {
          query: 'intsInRange',
          min: { ref: 'binding', name: '$min' },
          max: { ref: 'binding', name: '$max' },
        },
        nonNumeric,
      ),
      [],
    );

    const nonFinite = makeCtx({ bindings: { $min: 1 } });
    assert.deepEqual(
      evalQuery(
        {
          query: 'intsInRange',
          min: { ref: 'binding', name: '$min' },
          max: { op: '/', left: 1, right: 0 },
        },
        nonFinite,
      ),
      [],
    );
  });

  it('evaluates intsInRange with step and alwaysInclude controls', () => {
    const ctx = makeCtx();

    assert.deepEqual(
      evalQuery(
        {
          query: 'intsInRange',
          min: 1,
          max: 9,
          step: 3,
        },
        ctx,
      ),
      [1, 4, 7, 9],
    );

    assert.deepEqual(
      evalQuery(
        {
          query: 'intsInRange',
          min: 1,
          max: 9,
          step: 4,
          alwaysInclude: [8, 5, 12],
        },
        ctx,
      ),
      [1, 5, 8, 9],
    );
  });

  it('downsamples intsInRange deterministically while preserving required endpoints and inclusions', () => {
    const ctx = makeCtx();

    assert.deepEqual(
      evalQuery(
        {
          query: 'intsInRange',
          min: 1,
          max: 20,
          step: 1,
          alwaysInclude: [7, 13],
          maxResults: 6,
        },
        ctx,
      ),
      [1, 2, 7, 11, 13, 20],
    );
  });

  it('applies intsInRange maxResults before global query bound checks', () => {
    const ctx = makeCtx({ maxQueryResults: 3 });

    assert.deepEqual(
      evalQuery(
        {
          query: 'intsInRange',
          min: 1,
          max: 100,
          maxResults: 3,
        },
        ctx,
      ),
      [1, 2, 100],
    );
  });

  it('returns empty domain when intsInRange cardinality controls resolve invalidly at runtime', () => {
    const ctx = makeCtx({ bindings: { $badStep: 0, $badMaxResults: 1, $nonInt: 2.5 } });

    assert.deepEqual(
      evalQuery(
        {
          query: 'intsInRange',
          min: 1,
          max: 5,
          step: { ref: 'binding', name: '$badStep' },
        },
        ctx,
      ),
      [],
    );

    assert.deepEqual(
      evalQuery(
        {
          query: 'intsInRange',
          min: 1,
          max: 5,
          maxResults: { ref: 'binding', name: '$badMaxResults' },
        },
        ctx,
      ),
      [],
    );

    assert.deepEqual(
      evalQuery(
        {
          query: 'intsInRange',
          min: 1,
          max: 5,
          alwaysInclude: [{ ref: 'binding', name: '$nonInt' }],
        },
        ctx,
      ),
      [],
    );
  });

  it('evaluates intsInVarRange from declared int-variable bounds and clamps overrides', () => {
    const ctx = makeCtx({
      def: {
        ...makeDef(),
        globalVars: [
          { name: 'resourcePool', type: 'int', init: 3, min: 0, max: 5 },
          { name: 'flag', type: 'boolean', init: false },
        ],
        perPlayerVars: [{ name: 'budget', type: 'int', init: 1, min: 0, max: 2 }],
      },
    });

    assert.deepEqual(evalQuery({ query: 'intsInVarRange', var: 'resourcePool' }, ctx), [0, 1, 2, 3, 4, 5]);
    assert.deepEqual(evalQuery({ query: 'intsInVarRange', var: 'resourcePool', min: 1 }, ctx), [1, 2, 3, 4, 5]);
    assert.deepEqual(evalQuery({ query: 'intsInVarRange', var: 'resourcePool', min: -3, max: 99 }, ctx), [0, 1, 2, 3, 4, 5]);
    assert.deepEqual(evalQuery({ query: 'intsInVarRange', scope: 'perPlayer', var: 'budget', max: 1 }, ctx), [0, 1]);
    assert.deepEqual(evalQuery({ query: 'intsInVarRange', var: 'resourcePool', min: 0, max: 5, step: 2 }, ctx), [0, 2, 4, 5]);
    assert.deepEqual(
      evalQuery({ query: 'intsInVarRange', var: 'resourcePool', min: 0, max: 5, step: 2, alwaysInclude: [1], maxResults: 4 }, ctx),
      [0, 1, 2, 5],
    );
  });

  it('returns empty domain for intsInVarRange when source var is missing, non-int, or bounds are invalid', () => {
    const ctx = makeCtx({
      def: {
        ...makeDef(),
        globalVars: [{ name: 'flag', type: 'boolean', init: true }],
        perPlayerVars: [],
      },
      bindings: { $badMax: 1.5 },
    });

    assert.deepEqual(evalQuery({ query: 'intsInVarRange', var: 'missing' }, ctx), []);
    assert.deepEqual(evalQuery({ query: 'intsInVarRange', var: 'flag' }, ctx), []);
    assert.deepEqual(evalQuery({ query: 'intsInVarRange', var: 'missing', min: 1, max: { ref: 'binding', name: '$badMax' } }, ctx), []);
    assert.deepEqual(evalQuery({ query: 'intsInVarRange', var: 'missing', step: 0 }, ctx), []);
  });

  it('echoes enums and returns players sorted ascending', () => {
    const ctx = makeCtx();

    assert.deepEqual(evalQuery({ query: 'enums', values: ['red', 'blue', 'green'] }, ctx), ['red', 'blue', 'green']);
    assert.deepEqual(evalQuery({ query: 'players' }, ctx), [asPlayerId(0), asPlayerId(1), asPlayerId(2)]);
  });

  it('evaluates nextInOrderByCondition with wrap-around and per-player predicates', () => {
    const def = {
      ...makeDef(),
      perPlayerVars: [
        { name: 'eliminated', type: 'boolean' as const, init: false },
        { name: 'handActive', type: 'boolean' as const, init: true },
        { name: 'allIn', type: 'boolean' as const, init: false },
      ],
    };
    const state: GameState = {
      ...makeState(),
      playerCount: 4,
      perPlayerVars: {
        '0': { eliminated: false, handActive: true, allIn: false },
        '1': { eliminated: false, handActive: false, allIn: false },
        '2': { eliminated: false, handActive: true, allIn: false },
        '3': { eliminated: true, handActive: true, allIn: false },
      },
      zones: {
        ...makeState().zones,
        'hand:2': [],
        'hand:3': [],
      },
    };
    const zones = [
      ...def.zones,
      { id: asZoneId('hand:2'), owner: 'player' as const, visibility: 'owner' as const, ordering: 'stack' as const },
      { id: asZoneId('hand:3'), owner: 'player' as const, visibility: 'owner' as const, ordering: 'stack' as const },
    ];
    const ctx = makeCtx({
      def: { ...def, zones },
      adjacencyGraph: buildAdjacencyGraph(zones),
      state,
    });

    const result = evalQuery(
      {
        query: 'nextInOrderByCondition',
                source: { query: 'players' },
                from: 2,
        bind: '$seatCandidate',
        where: {
          op: 'and',
          args: [
            { op: '==', left: { ref: 'pvar', player: { chosen: '$seatCandidate' }, var: 'eliminated' }, right: false },
            { op: '==', left: { ref: 'pvar', player: { chosen: '$seatCandidate' }, var: 'handActive' }, right: true },
            { op: '==', left: { ref: 'pvar', player: { chosen: '$seatCandidate' }, var: 'allIn' }, right: false },
          ],
        },
      },
      ctx,
    );

    assert.deepEqual(result, [asPlayerId(0)]);
  });

  it('returns empty array when nextInOrderByCondition finds no match', () => {
    const ctx = makeCtx();
    const result = evalQuery(
      {
        query: 'nextInOrderByCondition',
                source: { query: 'players' },
                from: 0,
        bind: '$seatCandidate',
        where: { op: '==', left: { ref: 'binding', name: '$seatCandidate' }, right: 99 },
      },
      ctx,
    );
    assert.deepEqual(result, []);
  });

  it('respects includeFrom for nextInOrderByCondition', () => {
    const ctx = makeCtx();

    const includeFrom = evalQuery(
      {
        query: 'nextInOrderByCondition',
                source: { query: 'players' },
                from: 1,
        bind: '$seatCandidate',
        includeFrom: true,
        where: {
          op: 'or',
          args: [
            { op: '==', left: { ref: 'binding', name: '$seatCandidate' }, right: 1 },
            { op: '==', left: { ref: 'binding', name: '$seatCandidate' }, right: 2 },
          ],
        },
      },
      ctx,
    );
    const excludeFrom = evalQuery(
      {
        query: 'nextInOrderByCondition',
                source: { query: 'players' },
                from: 1,
        bind: '$seatCandidate',
        includeFrom: false,
        where: {
          op: 'or',
          args: [
            { op: '==', left: { ref: 'binding', name: '$seatCandidate' }, right: 1 },
            { op: '==', left: { ref: 'binding', name: '$seatCandidate' }, right: 2 },
          ],
        },
      },
      ctx,
    );

    assert.deepEqual(includeFrom, [asPlayerId(1)]);
    assert.deepEqual(excludeFrom, [asPlayerId(2)]);
  });

  it('uses first matching anchor when source order contains duplicate values', () => {
    const ctx = makeCtx();
    const result = evalQuery(
      {
        query: 'nextInOrderByCondition',
        source: { query: 'enums', values: ['anchor', 'x', 'anchor', 'y'] },
        from: 'anchor',
        bind: '$candidate',
        includeFrom: false,
        where: {
          op: 'or',
          args: [
            { op: '==', left: { ref: 'binding', name: '$candidate' }, right: 'x' },
            { op: '==', left: { ref: 'binding', name: '$candidate' }, right: 'y' },
          ],
        },
      },
      ctx,
    );

    assert.deepEqual(result, ['x']);
  });

  it('applies includeFrom traversal from first matching anchor when source has duplicates', () => {
    const ctx = makeCtx();
    const result = evalQuery(
      {
        query: 'nextInOrderByCondition',
        source: { query: 'enums', values: ['anchor', 'x', 'anchor', 'y'] },
        from: 'anchor',
        bind: '$candidate',
        includeFrom: true,
        where: {
          op: 'or',
          args: [
            { op: '==', left: { ref: 'binding', name: '$candidate' }, right: 'x' },
            { op: '==', left: { ref: 'binding', name: '$candidate' }, right: 'y' },
          ],
        },
      },
      ctx,
    );

    assert.deepEqual(result, ['x']);
  });

  it('supports non-player explicit order domains for nextInOrderByCondition', () => {
    const ctx = makeCtx();
    const result = evalQuery(
      {
        query: 'nextInOrderByCondition',
                source: { query: 'enums', values: ['preflop', 'flop', 'turn', 'river'] },
                from: 'turn',
        bind: '$street',
        where: {
          op: '==',
          left: { ref: 'binding', name: '$street' },
          right: 'river',
        },
      },
      ctx,
    );

    assert.deepEqual(result, ['river']);
  });

  it('returns empty array when nextInOrderByCondition anchor is absent from source order', () => {
    const ctx = makeCtx();
    const result = evalQuery(
      {
        query: 'nextInOrderByCondition',
                source: { query: 'players' },
                from: 99,
        bind: '$seatCandidate',
        where: { op: '==', left: { ref: 'binding', name: '$seatCandidate' }, right: 0 },
      },
      ctx,
    );
    assert.deepEqual(result, []);
  });

  it('returns empty array when nextInOrderByCondition from has missing binding', () => {
    const ctx = makeCtx();
    const result = evalQuery(
      {
        query: 'nextInOrderByCondition',
        source: { query: 'players' },
        from: { ref: 'binding', name: '$missingAnchor' },
        bind: '$seatCandidate',
        where: { op: '==', left: { ref: 'binding', name: '$seatCandidate' }, right: 0 },
      },
      ctx,
    );
    assert.deepEqual(result, []);
  });

  it('returns empty array when nextInOrderByCondition from has missing var', () => {
    const ctx = makeCtx();
    const result = evalQuery(
      {
        query: 'nextInOrderByCondition',
        source: { query: 'players' },
        from: { ref: 'gvar', var: 'missingDealerButton' },
        bind: '$seatCandidate',
        where: { op: '==', left: { ref: 'binding', name: '$seatCandidate' }, right: 0 },
      },
      ctx,
    );
    assert.deepEqual(result, []);
  });

  it('returns empty array when nextInOrderByCondition from divides by zero', () => {
    const ctx = makeCtx();
    const result = evalQuery(
      {
        query: 'nextInOrderByCondition',
        source: { query: 'players' },
        from: { op: '/', left: 1, right: 0 },
        bind: '$seatCandidate',
        where: { op: '==', left: { ref: 'binding', name: '$seatCandidate' }, right: 0 },
      },
      ctx,
    );
    assert.deepEqual(result, []);
  });

  it('surfaces non-recoverable from errors in nextInOrderByCondition', () => {
    const ctx = makeCtx();
    assert.throws(
      () =>
        evalQuery(
          {
            query: 'nextInOrderByCondition',
            source: { query: 'players' },
            from: { op: '+', left: 'invalid-anchor-type', right: 1 },
            bind: '$seatCandidate',
            where: { op: '==', left: { ref: 'binding', name: '$seatCandidate' }, right: 0 },
          },
          ctx,
        ),
      (error: unknown) => isEvalErrorCode(error, 'TYPE_MISMATCH'),
    );
  });

  it('returns zones sorted, and filter.owner=actor resolves correctly', () => {
    const ctx = makeCtx();

    assert.deepEqual(evalQuery({ query: 'zones' }, ctx), ['battlefield:none', 'bench:1', 'deck:none', 'hand:0', 'hand:1', 'tableau:2']);
    assert.deepEqual(evalQuery({ query: 'zones', filter: { owner: 'actor' } }, ctx), ['bench:1', 'hand:1']);
  });

  it('evaluates assetRows using runtimeDataAssets and preserves table order', () => {
    const ctx = makeCtx({
      def: {
        ...makeDef(),
        runtimeDataAssets: [
          {
            id: 'tournament-standard',
            kind: 'scenario',
            payload: {
              blindSchedule: {
                levels: [
                  { level: 1, smallBlind: 10, phase: 'early' },
                  { level: 2, smallBlind: 20, phase: 'early' },
                  { level: 3, smallBlind: 40, phase: 'mid' },
                ],
              },
            },
          },
        ],
        tableContracts: [
          {
            id: 'tournament-standard::blindSchedule.levels',
            assetId: 'tournament-standard',
            tablePath: 'blindSchedule.levels',
            fields: [
              { field: 'level', type: 'int' },
              { field: 'phase', type: 'string' },
              { field: 'smallBlind', type: 'int' },
            ],
          },
        ],
      },
    });

    const rows = evalQuery({ query: 'assetRows', tableId: 'tournament-standard::blindSchedule.levels' }, ctx);
    assert.deepEqual(
      rows.map((row) => (row as Record<string, unknown>).smallBlind),
      [10, 20, 40],
    );

    const filtered = evalQuery(
      {
        query: 'assetRows',
        tableId: 'tournament-standard::blindSchedule.levels',
        where: [{ field: 'phase', op: 'eq', value: 'early' }],
      },
      ctx,
    );
    assert.deepEqual(
      filtered.map((row) => (row as Record<string, unknown>).level),
      [1, 2],
    );
  });

  it('throws dedicated data-asset runtime errors for missing assetRows assets and invalid table paths', () => {
    const ctx = makeCtx({
      def: {
        ...makeDef(),
        runtimeDataAssets: [
          {
            id: 'tournament-standard',
            kind: 'scenario',
            payload: {
              blindSchedule: {
                levels: [{ level: 1, smallBlind: 10 }],
              },
            },
          },
        ],
        tableContracts: [
          {
            id: 'tournament-standard::blindSchedule.levels',
            assetId: 'tournament-standard',
            tablePath: 'blindSchedule.levels',
            fields: [
              { field: 'level', type: 'int' },
              { field: 'smallBlind', type: 'int' },
            ],
          },
          {
            id: 'tournament-standard::blindSchedule',
            assetId: 'tournament-standard',
            tablePath: 'blindSchedule',
            fields: [],
          },
          {
            id: 'missing-asset::blindSchedule.levels',
            assetId: 'missing',
            tablePath: 'blindSchedule.levels',
            fields: [],
          },
        ],
      },
    });

    assert.throws(
      () => evalQuery({ query: 'assetRows', tableId: 'missing-asset::blindSchedule.levels' }, ctx),
      (error: unknown) =>
        isEvalErrorCode(error, 'DATA_ASSET_RUNTIME_ASSET_MISSING') &&
        error.context?.tableId === 'missing-asset::blindSchedule.levels' &&
        error.context?.assetId === 'missing',
    );
    assert.throws(
      () => evalQuery({ query: 'assetRows', tableId: 'missing-contract' }, ctx),
      (error: unknown) =>
        isEvalErrorCode(error, 'DATA_ASSET_TABLE_CONTRACT_MISSING') &&
        error.context?.tableId === 'missing-contract',
    );
    assert.throws(
      () => evalQuery({ query: 'assetRows', tableId: 'tournament-standard::blindSchedule' }, ctx),
      (error: unknown) =>
        isEvalErrorCode(error, 'DATA_ASSET_TABLE_TYPE_INVALID') &&
        error.context?.tableId === 'tournament-standard::blindSchedule' &&
        error.context?.assetId === 'tournament-standard',
    );
  });

  it('throws dedicated data-asset field errors for assetRows where predicates', () => {
    const ctx = makeCtx({
      def: {
        ...makeDef(),
        runtimeDataAssets: [
          {
            id: 'tournament-standard',
            kind: 'scenario',
            payload: {
              blindSchedule: {
                levels: [{ level: 1, smallBlind: 10 }],
              },
            },
          },
        ],
        tableContracts: [
          {
            id: 'tournament-standard::blindSchedule.levels',
            assetId: 'tournament-standard',
            tablePath: 'blindSchedule.levels',
            fields: [{ field: 'smallBlind', type: 'int' }],
          },
        ],
      },
    });

    assert.throws(
      () =>
        evalQuery(
          {
            query: 'assetRows',
            tableId: 'tournament-standard::blindSchedule.levels',
            where: [{ field: 'missingField', op: 'eq', value: 10 }],
          },
          ctx,
        ),
      (error: unknown) =>
        isEvalErrorCode(error, 'DATA_ASSET_FIELD_UNDECLARED') &&
        error.context?.tableId === 'tournament-standard::blindSchedule.levels' &&
        error.context?.field === 'missingField',
    );
  });

  it('enforces assetRows cardinality modes for strict single-row invariants', () => {
    const ctx = makeCtx({
      def: {
        ...makeDef(),
        runtimeDataAssets: [
          {
            id: 'tournament-standard',
            kind: 'scenario',
            payload: {
              blindSchedule: {
                levels: [
                  { level: 1, phase: 'early', smallBlind: 10 },
                  { level: 2, phase: 'early', smallBlind: 20 },
                  { level: 3, phase: 'mid', smallBlind: 40 },
                ],
              },
            },
          },
        ],
        tableContracts: [
          {
            id: 'tournament-standard::blindSchedule.levels',
            assetId: 'tournament-standard',
            tablePath: 'blindSchedule.levels',
            fields: [
              { field: 'level', type: 'int' },
              { field: 'phase', type: 'string' },
              { field: 'smallBlind', type: 'int' },
            ],
          },
        ],
      },
    });

    const exactlyOne = evalQuery(
      {
        query: 'assetRows',
        tableId: 'tournament-standard::blindSchedule.levels',
        cardinality: 'exactlyOne',
        where: [{ field: 'level', op: 'eq', value: 3 }],
      },
      ctx,
    );
    assert.equal(exactlyOne.length, 1);
    assert.equal((exactlyOne[0] as Record<string, unknown>).smallBlind, 40);

    assert.throws(
      () =>
        evalQuery(
          {
            query: 'assetRows',
            tableId: 'tournament-standard::blindSchedule.levels',
            cardinality: 'exactlyOne',
            where: [{ field: 'level', op: 'eq', value: 99 }],
          },
          ctx,
        ),
      (error: unknown) =>
        isEvalErrorCode(error, 'DATA_ASSET_CARDINALITY_NO_MATCH') &&
        error.context?.tableId === 'tournament-standard::blindSchedule.levels' &&
        error.context?.actualMatchCount === 0,
    );

    assert.throws(
      () =>
        evalQuery(
          {
            query: 'assetRows',
            tableId: 'tournament-standard::blindSchedule.levels',
            cardinality: 'exactlyOne',
            where: [{ field: 'phase', op: 'eq', value: 'early' }],
          },
          ctx,
        ),
      (error: unknown) =>
        isEvalErrorCode(error, 'DATA_ASSET_CARDINALITY_MULTIPLE_MATCHES') &&
        error.context?.tableId === 'tournament-standard::blindSchedule.levels' &&
        error.context?.actualMatchCount === 2,
    );

    const zeroOrOne = evalQuery(
      {
        query: 'assetRows',
        tableId: 'tournament-standard::blindSchedule.levels',
        cardinality: 'zeroOrOne',
        where: [{ field: 'level', op: 'eq', value: 99 }],
      },
      ctx,
    );
    assert.deepEqual(zeroOrOne, []);

    assert.throws(
      () =>
        evalQuery(
          {
            query: 'assetRows',
            tableId: 'tournament-standard::blindSchedule.levels',
            cardinality: 'zeroOrOne',
            where: [{ field: 'phase', op: 'eq', value: 'early' }],
          },
          ctx,
        ),
      (error: unknown) =>
        isEvalErrorCode(error, 'DATA_ASSET_CARDINALITY_MULTIPLE_MATCHES') &&
        error.context?.tableId === 'tournament-standard::blindSchedule.levels' &&
        error.context?.actualMatchCount === 2,
    );
  });

  it('enforces assetRows cardinality modes when where is omitted', () => {
    const baseDef = makeDef();
    const tableContract = {
      id: 'tournament-standard::blindSchedule.levels',
      assetId: 'tournament-standard',
      tablePath: 'blindSchedule.levels',
      fields: [
        { field: 'level', type: 'int' },
        { field: 'phase', type: 'string' },
        { field: 'smallBlind', type: 'int' },
      ],
    } as const;

    const multiRowCtx = makeCtx({
      def: {
        ...baseDef,
        runtimeDataAssets: [
          {
            id: 'tournament-standard',
            kind: 'scenario',
            payload: {
              blindSchedule: {
                levels: [
                  { level: 1, phase: 'early', smallBlind: 10 },
                  { level: 2, phase: 'early', smallBlind: 20 },
                ],
              },
            },
          },
        ],
        tableContracts: [tableContract],
      },
    });

    assert.throws(
      () =>
        evalQuery(
          {
            query: 'assetRows',
            tableId: 'tournament-standard::blindSchedule.levels',
            cardinality: 'exactlyOne',
          },
          multiRowCtx,
        ),
      (error: unknown) =>
        isEvalErrorCode(error, 'DATA_ASSET_CARDINALITY_MULTIPLE_MATCHES') &&
        error.context?.actualMatchCount === 2,
    );

    assert.throws(
      () =>
        evalQuery(
          {
            query: 'assetRows',
            tableId: 'tournament-standard::blindSchedule.levels',
            cardinality: 'zeroOrOne',
          },
          multiRowCtx,
        ),
      (error: unknown) =>
        isEvalErrorCode(error, 'DATA_ASSET_CARDINALITY_MULTIPLE_MATCHES') &&
        error.context?.actualMatchCount === 2,
    );

    const singleRowCtx = makeCtx({
      def: {
        ...baseDef,
        runtimeDataAssets: [
          {
            id: 'tournament-standard',
            kind: 'scenario',
            payload: {
              blindSchedule: {
                levels: [{ level: 3, phase: 'mid', smallBlind: 40 }],
              },
            },
          },
        ],
        tableContracts: [tableContract],
      },
    });

    const exactlyOne = evalQuery(
      {
        query: 'assetRows',
        tableId: 'tournament-standard::blindSchedule.levels',
        cardinality: 'exactlyOne',
      },
      singleRowCtx,
    );
    assert.equal(exactlyOne.length, 1);
    assert.equal((exactlyOne[0] as Record<string, unknown>).smallBlind, 40);

    const zeroOrOne = evalQuery(
      {
        query: 'assetRows',
        tableId: 'tournament-standard::blindSchedule.levels',
        cardinality: 'zeroOrOne',
      },
      singleRowCtx,
    );
    assert.equal(zeroOrOne.length, 1);

    const emptyRowCtx = makeCtx({
      def: {
        ...baseDef,
        runtimeDataAssets: [
          {
            id: 'tournament-standard',
            kind: 'scenario',
            payload: {
              blindSchedule: {
                levels: [],
              },
            },
          },
        ],
        tableContracts: [tableContract],
      },
    });

    assert.throws(
      () =>
        evalQuery(
          {
            query: 'assetRows',
            tableId: 'tournament-standard::blindSchedule.levels',
            cardinality: 'exactlyOne',
          },
          emptyRowCtx,
        ),
      (error: unknown) =>
        isEvalErrorCode(error, 'DATA_ASSET_CARDINALITY_NO_MATCH') &&
        error.context?.actualMatchCount === 0,
    );

    assert.deepEqual(
      evalQuery(
        {
          query: 'assetRows',
          tableId: 'tournament-standard::blindSchedule.levels',
          cardinality: 'zeroOrOne',
        },
        emptyRowCtx,
      ),
      [],
    );
  });

  it('returns equivalent rows for indexed eq lookup and non-indexed singleton membership lookup', () => {
    const def: GameDef = {
      ...makeDef(),
      runtimeDataAssets: [
        {
          id: 'tournament-standard',
          kind: 'scenario',
          payload: {
            blindSchedule: {
              levels: [
                { level: 1, phase: 'early', smallBlind: 10 },
                { level: 2, phase: 'mid', smallBlind: 20 },
                { level: 3, phase: 'late', smallBlind: 40 },
              ],
            },
          },
        },
      ],
      tableContracts: [
        {
          id: 'tournament-standard::blindSchedule.levels',
          assetId: 'tournament-standard',
          tablePath: 'blindSchedule.levels',
          fields: [
            { field: 'level', type: 'int' },
            { field: 'phase', type: 'string' },
            { field: 'smallBlind', type: 'int' },
          ],
          uniqueBy: [['level']],
        },
      ],
    };
    const ctx = makeCtx({
      def,
      runtimeTableIndex: buildRuntimeTableIndex(def),
    });

    const indexed = evalQuery(
      {
        query: 'assetRows',
        tableId: 'tournament-standard::blindSchedule.levels',
        where: [{ field: 'level', op: 'eq', value: 2 }],
      },
      ctx,
    );
    const fallback = evalQuery(
      {
        query: 'assetRows',
        tableId: 'tournament-standard::blindSchedule.levels',
        where: [{ field: 'level', op: 'in', value: [2] }],
      },
      ctx,
    );

    assert.deepEqual(indexed, fallback);
    assert.deepEqual(
      indexed.map((row) => (row as Record<string, unknown>).smallBlind),
      [20],
    );
  });

  it('produces identical cardinality failure for indexed and fallback-equivalent constraints', () => {
    const def: GameDef = {
      ...makeDef(),
      runtimeDataAssets: [
        {
          id: 'tournament-standard',
          kind: 'scenario',
          payload: {
            blindSchedule: {
              levels: [
                { level: 1, phase: 'early', smallBlind: 10 },
                { level: 1, phase: 'early', smallBlind: 15 },
                { level: 2, phase: 'mid', smallBlind: 20 },
              ],
            },
          },
        },
      ],
      tableContracts: [
        {
          id: 'tournament-standard::blindSchedule.levels',
          assetId: 'tournament-standard',
          tablePath: 'blindSchedule.levels',
          fields: [
            { field: 'level', type: 'int' },
            { field: 'phase', type: 'string' },
            { field: 'smallBlind', type: 'int' },
          ],
          uniqueBy: [['level']],
        },
      ],
    };
    const ctx = makeCtx({
      def,
      runtimeTableIndex: buildRuntimeTableIndex(def),
    });

    const assertMultipleMatches = (query: Extract<Parameters<typeof evalQuery>[0], { query: 'assetRows' }>): void => {
      assert.throws(
        () => evalQuery(query, ctx),
        (error: unknown) =>
          isEvalErrorCode(error, 'DATA_ASSET_CARDINALITY_MULTIPLE_MATCHES') &&
          error.context?.tableId === 'tournament-standard::blindSchedule.levels' &&
          error.context?.actualMatchCount === 2,
      );
    };

    assertMultipleMatches({
      query: 'assetRows',
      tableId: 'tournament-standard::blindSchedule.levels',
      cardinality: 'exactlyOne',
      where: [{ field: 'level', op: 'eq', value: 1 }],
    });
    assertMultipleMatches({
      query: 'assetRows',
      tableId: 'tournament-standard::blindSchedule.levels',
      cardinality: 'exactlyOne',
      where: [{ field: 'level', op: 'in', value: [1] }],
    });
  });

  it('applies zones filter.condition and composes it with owner filtering', () => {
    const ctx = makeCtx({
      bindings: {
        $allowedZones: [asZoneId('hand:0'), asZoneId('hand:1')],
      },
    });

    assert.deepEqual(
      evalQuery(
        {
          query: 'zones',
          filter: {
            condition: {
              op: 'in',
              item: { ref: 'binding', name: '$zone' },
              set: { ref: 'binding', name: '$allowedZones' },
            },
          },
        },
        ctx,
      ),
      ['hand:0', 'hand:1'],
    );

    assert.deepEqual(
      evalQuery(
        {
          query: 'zones',
          filter: {
            owner: 'actor',
            condition: {
              op: 'in',
              item: { ref: 'binding', name: '$zone' },
              set: { ref: 'binding', name: '$allowedZones' },
            },
          },
        },
        ctx,
      ),
      ['hand:1'],
    );
  });

  it('resolves templated binding query names against current bindings', () => {
    const ctx = makeCtx({
      bindings: {
        $space: 'hand:0',
        '$choices@hand:0': [asZoneId('hand:0'), asZoneId('hand:1')],
      },
    });

    assert.deepEqual(
      evalQuery({ query: 'binding', name: '$choices@{$space}' }, ctx),
      ['hand:0', 'hand:1'],
    );
  });

  it('concatenates query sources left-to-right and preserves duplicates', () => {
    const ctx = makeCtx();

    const result = evalQuery(
      {
        query: 'concat',
        sources: [
          { query: 'tokensInZone', zone: 'hand:0' },
          { query: 'tokensInZone', zone: 'hand:1' },
          { query: 'tokensInZone', zone: 'hand:0' },
        ],
      },
      ctx,
    );

    assert.deepEqual(
      result.map((token) => (token as Token).id),
      [asTokenId('hand-0'), asTokenId('hand-0b'), asTokenId('hand-1'), asTokenId('hand-0'), asTokenId('hand-0b')],
    );
  });

  it('rejects concat sources that produce incompatible runtime shapes', () => {
    const ctx = makeCtx({
      bindings: {
        $numbers: [1, 2],
      },
    });

    assert.throws(
      () =>
        evalQuery(
          {
            query: 'concat',
            sources: [
              { query: 'binding', name: '$numbers' },
              { query: 'enums', values: ['x'] },
            ],
          },
          ctx,
        ),
      (error: unknown) => isEvalErrorCode(error, 'TYPE_MISMATCH'),
    );
  });

  it('rejects concat binding sources that contain mixed runtime shapes', () => {
    const ctx = makeCtx({
      bindings: {
        $mixed: [1, 'x'],
      },
    });

    assert.throws(
      () =>
        evalQuery(
          {
            query: 'concat',
            sources: [{ query: 'binding', name: '$mixed' }],
          },
          ctx,
        ),
      (error: unknown) => isEvalErrorCode(error, 'TYPE_MISMATCH'),
    );
  });

  it('mapSpaces query evaluates zoneProp filters only across map spaces', () => {
    const defWithMapSpaces = {
      ...makeDef(),
      zones: makeDef().zones.map((zone) => {
        if (zone.id === asZoneId('battlefield:none')) {
          return { ...zone, category: 'province', attributes: { population: 1, econ: 0, terrainTags: ['lowland'], country: 'southVietnam', coastal: false } };
        }
        if (zone.id === asZoneId('tableau:2')) {
          return { ...zone, category: 'city', attributes: { population: 2, econ: 0, terrainTags: ['urban'], country: 'southVietnam', coastal: false } };
        }
        return zone;
      }),
    };
    const ctx = makeCtx({
      def: defWithMapSpaces,
      adjacencyGraph: buildAdjacencyGraph(defWithMapSpaces.zones),
    });

    assert.deepEqual(
      evalQuery(
        {
          query: 'mapSpaces',
          filter: {
            condition: {
              op: '==',
              left: { ref: 'zoneProp', zone: '$zone', prop: 'category' },
              right: 'city',
            },
          },
        },
        ctx,
      ),
      ['tableau:2'],
    );
  });

  it('tokensInMapSpaces query composes map-space condition filters with token filters', () => {
    const defWithMapSpaces = {
      ...makeDef(),
      zones: makeDef().zones.map((zone) => {
        if (zone.id === asZoneId('battlefield:none')) {
          return { ...zone, category: 'province', attributes: { population: 1, econ: 0, terrainTags: ['lowland'], country: 'southVietnam', coastal: false } };
        }
        if (zone.id === asZoneId('tableau:2')) {
          return { ...zone, category: 'city', attributes: { population: 2, econ: 0, terrainTags: ['urban'], country: 'northVietnam', coastal: false } };
        }
        return zone;
      }),
    };
    const ctx = makeCtx({
      def: defWithMapSpaces,
      adjacencyGraph: buildAdjacencyGraph(defWithMapSpaces.zones),
    });

    assert.deepEqual(
      evalQuery(
        {
          query: 'tokensInMapSpaces',
          spaceFilter: {
            condition: {
              op: '==',
              left: { ref: 'zoneProp', zone: '$zone', prop: 'country' },
              right: 'southVietnam',
            },
          },
          filter: [{ prop: 'faction', op: 'eq', value: 'US' }],
        },
        ctx,
      ).map((token) => (token as Token).id),
      [asTokenId('us-troop-1'), asTokenId('us-troop-2')],
    );
  });

  it('zones query no longer suppresses zoneProp lookup errors from non-map zones', () => {
    const defWithMapSpaces = {
      ...makeDef(),
      zones: makeDef().zones.map((zone) => {
        if (zone.id === asZoneId('battlefield:none')) {
          return { ...zone, category: 'province', attributes: { population: 1, econ: 0, terrainTags: ['lowland'], country: 'southVietnam', coastal: false } };
        }
        return zone;
      }),
    };
    const ctx = makeCtx({
      def: defWithMapSpaces,
      adjacencyGraph: buildAdjacencyGraph(defWithMapSpaces.zones),
    });

    assert.throws(
      () =>
        evalQuery(
          {
            query: 'zones',
            filter: {
              condition: {
                op: '==',
                left: { ref: 'zoneProp', zone: '$zone', prop: 'category' },
                right: 'city',
              },
            },
          },
          ctx,
        ),
      (error: unknown) => isEvalErrorCode(error, 'ZONE_PROP_NOT_FOUND'),
    );
  });

  it('filters owner-scoped zones using canonical ZoneDef.owner metadata', () => {
    const def = makeDef();
    const malformedZoneId = asZoneId('ghost:1');
    const zones = [
      ...def.zones,
      {
        id: malformedZoneId,
        owner: 'none' as const,
        visibility: 'public' as const,
        ordering: 'set' as const,
      },
    ];
    const state = makeState();
    const ctx = makeCtx({
      def: { ...def, zones },
      adjacencyGraph: buildAdjacencyGraph(zones),
      state: {
        ...state,
        zones: {
          ...state.zones,
          [malformedZoneId]: [],
        },
      },
    });

    assert.deepEqual(evalQuery({ query: 'zones' }, ctx), [
      'battlefield:none',
      'bench:1',
      'deck:none',
      'ghost:1',
      'hand:0',
      'hand:1',
      'tableau:2',
    ]);
    assert.deepEqual(evalQuery({ query: 'zones', filter: { owner: 'actor' } }, ctx), ['bench:1', 'hand:1']);
  });

  it('evaluates spatial query variants with deterministic ordering', () => {
    const ctx = makeCtx();

    assert.deepEqual(evalQuery({ query: 'adjacentZones', zone: 'deck:none' }, ctx), [
      asZoneId('hand:0'),
      asZoneId('hand:1'),
    ]);
    assert.deepEqual(
      evalQuery({ query: 'tokensInAdjacentZones', zone: 'deck:none' }, ctx).map((token) => (token as Token).id),
      [asTokenId('hand-0'), asTokenId('hand-0b'), asTokenId('hand-1')],
    );
    assert.deepEqual(
      evalQuery(
        {
          query: 'connectedZones',
          zone: 'deck:none',
          via: {
            op: 'in',
            item: { ref: 'binding', name: '$zone' },
            set: { ref: 'binding', name: '$allowed' },
          },
        },
        {
          ...ctx,
          bindings: {
            ...ctx.bindings,
            $allowed: [asZoneId('hand:0'), asZoneId('bench:1')],
          },
        },
      ),
      [asZoneId('hand:0'), asZoneId('bench:1')],
    );
  });

  it('evaluates spatial query variants when zone is resolved from zoneExpr', () => {
    const ctx = makeCtx({
      bindings: {
        $origin: 'deck:none',
        $allowed: [asZoneId('hand:0'), asZoneId('bench:1')],
      },
    });

    assert.deepEqual(
      evalQuery({ query: 'adjacentZones', zone: { zoneExpr: { ref: 'binding', name: '$origin' } } }, ctx),
      [asZoneId('hand:0'), asZoneId('hand:1')],
    );
    assert.deepEqual(
      evalQuery({ query: 'tokensInAdjacentZones', zone: { zoneExpr: { ref: 'binding', name: '$origin' } } }, ctx).map((token) => (token as Token).id),
      [asTokenId('hand-0'), asTokenId('hand-0b'), asTokenId('hand-1')],
    );
    assert.deepEqual(
      evalQuery(
        {
          query: 'connectedZones',
          zone: { zoneExpr: { ref: 'binding', name: '$origin' } },
          via: {
            op: 'in',
            item: { ref: 'binding', name: '$zone' },
            set: { ref: 'binding', name: '$allowed' },
          },
        },
        ctx,
      ),
      [asZoneId('hand:0'), asZoneId('bench:1')],
    );
  });

  it('tokensInZone with no filter returns all tokens (backward-compatible)', () => {
    const ctx = makeCtx();

    const result = evalQuery({ query: 'tokensInZone', zone: 'battlefield:none' }, ctx);
    assert.equal(result.length, 5);
  });

  it('tokensInZone with filter op=eq returns only matching tokens', () => {
    const ctx = makeCtx();

    const result = evalQuery(
      { query: 'tokensInZone', zone: 'battlefield:none', filter: [{ prop: 'faction', op: 'eq', value: 'US' }] },
      ctx,
    );
    assert.deepEqual(
      result.map((token) => (token as Token).id),
      [asTokenId('us-troop-1'), asTokenId('us-troop-2')],
    );
  });

  it('tokensInZone filter supports token identity via prop=id', () => {
    const ctx = makeCtx();

    const result = evalQuery(
      { query: 'tokensInZone', zone: 'battlefield:none', filter: [{ prop: 'id', op: 'eq', value: 'nva-guerrilla-1' }] },
      ctx,
    );
    assert.deepEqual(
      result.map((token) => (token as Token).id),
      [asTokenId('nva-guerrilla-1')],
    );
  });

  it('tokensInZone with filter op=neq returns non-matching tokens', () => {
    const ctx = makeCtx();

    const result = evalQuery(
      { query: 'tokensInZone', zone: 'battlefield:none', filter: [{ prop: 'faction', op: 'neq', value: 'US' }] },
      ctx,
    );
    assert.deepEqual(
      result.map((token) => (token as Token).id),
      [asTokenId('arvn-troop-1'), asTokenId('nva-guerrilla-1'), asTokenId('vc-guerrilla-1')],
    );
  });

  it('tokensInZone with filter op=in returns tokens matching any value in array', () => {
    const ctx = makeCtx();

    const result = evalQuery(
      {
        query: 'tokensInZone',
        zone: 'battlefield:none',
        filter: [{ prop: 'faction', op: 'in', value: ['US', 'ARVN'] }],
      },
      ctx,
    );
    assert.deepEqual(
      result.map((token) => (token as Token).id),
      [asTokenId('us-troop-1'), asTokenId('us-troop-2'), asTokenId('arvn-troop-1')],
    );
  });

  it('tokensInZone with filter op=notIn returns tokens not matching any value in array', () => {
    const ctx = makeCtx();

    const result = evalQuery(
      {
        query: 'tokensInZone',
        zone: 'battlefield:none',
        filter: [{ prop: 'faction', op: 'notIn', value: ['US', 'ARVN'] }],
      },
      ctx,
    );
    assert.deepEqual(
      result.map((token) => (token as Token).id),
      [asTokenId('nva-guerrilla-1'), asTokenId('vc-guerrilla-1')],
    );
  });

  it('tokensInZone with filter on missing token prop returns empty array', () => {
    const ctx = makeCtx();

    const result = evalQuery(
      {
        query: 'tokensInZone',
        zone: 'battlefield:none',
        filter: [{ prop: 'nonexistent', op: 'eq', value: 'anything' }],
      },
      ctx,
    );
    assert.deepEqual(result, []);
  });

  it('tokensInZone with compound filter (AND) returns only tokens matching all predicates', () => {
    const ctx = makeCtx();

    // Tokens have only 'faction' prop, so filter on faction=US AND faction!=ARVN
    // Both US troops match faction=US AND faction!=ARVN
    const result = evalQuery(
      {
        query: 'tokensInZone',
        zone: 'battlefield:none',
        filter: [
          { prop: 'faction', op: 'in', value: ['US', 'ARVN'] },
          { prop: 'faction', op: 'neq', value: 'ARVN' },
        ],
      },
      ctx,
    );
    assert.deepEqual(
      result.map((token) => (token as Token).id),
      [asTokenId('us-troop-1'), asTokenId('us-troop-2')],
    );
  });

  it('tokensInZone with empty filter array returns all tokens', () => {
    const ctx = makeCtx();

    const result = evalQuery(
      { query: 'tokensInZone', zone: 'battlefield:none', filter: [] },
      ctx,
    );
    assert.equal(result.length, 5);
  });

  it('rejects token membership filters with scalar set values for in/notIn', () => {
    const ctx = makeCtx();

    assert.throws(
      () =>
        evalQuery(
          { query: 'tokensInZone', zone: 'battlefield:none', filter: [{ prop: 'faction', op: 'in', value: 'US' }] },
          ctx,
        ),
      (error: unknown) => isEvalErrorCode(error, 'TYPE_MISMATCH'),
    );
  });

  it('rejects token membership filters with field/set type mismatches', () => {
    const ctx = makeCtx();

    assert.throws(
      () =>
        evalQuery(
          { query: 'tokensInZone', zone: 'deck:none', filter: [{ prop: 'cost', op: 'in', value: ['1'] }] },
          ctx,
        ),
      (error: unknown) => isEvalErrorCode(error, 'TYPE_MISMATCH'),
    );
  });

  it('rejects assetRows membership predicates with mixed scalar set types', () => {
    const ctx = makeCtx({
      def: {
        ...makeDef(),
        runtimeDataAssets: [
          {
            id: 'tournament-standard',
            kind: 'scenario',
            payload: {
              blindSchedule: {
                levels: [{ level: 1, phase: 'early' }],
              },
            },
          },
        ],
        tableContracts: [
          {
            id: 'tournament-standard::blindSchedule.levels',
            assetId: 'tournament-standard',
            tablePath: 'blindSchedule.levels',
            fields: [
              { field: 'level', type: 'int' },
              { field: 'phase', type: 'string' },
            ],
          },
        ],
      },
    });

    assert.throws(
      () =>
        evalQuery(
          {
            query: 'assetRows',
            tableId: 'tournament-standard::blindSchedule.levels',
            where: [{ field: 'phase', op: 'in', value: ['early', 2] }],
          },
          ctx,
        ),
      (error: unknown) => isEvalErrorCode(error, 'TYPE_MISMATCH'),
    );
  });

  it('throws QUERY_BOUNDS_EXCEEDED when a query would exceed maxQueryResults', () => {
    const ctx = makeCtx({ maxQueryResults: 3 });

    assert.throws(
      () => evalQuery({ query: 'intsInRange', min: 1, max: 10 }, ctx),
      (error: unknown) => isEvalErrorCode(error, 'QUERY_BOUNDS_EXCEEDED'),
    );
    assert.throws(
      () => evalQuery({ query: 'adjacentZones', zone: 'deck:none' }, makeCtx({ maxQueryResults: 1 })),
      (error: unknown) => isEvalErrorCode(error, 'QUERY_BOUNDS_EXCEEDED'),
    );
    assert.throws(
      () =>
        evalQuery(
          {
            query: 'concat',
            sources: [
              { query: 'tokensInZone', zone: 'hand:0' },
              { query: 'tokensInZone', zone: 'hand:1' },
            ],
          },
          makeCtx({ maxQueryResults: 2 }),
        ),
      (error: unknown) => isEvalErrorCode(error, 'QUERY_BOUNDS_EXCEEDED'),
    );
  });
});
