import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildAdjacencyGraph,
  createCollector,
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  isEvalErrorCode,
  resolveRef,
  type EvalContext,
  type GameDef,
  type GameState,
  type Token,
} from '../../src/kernel/index.js';

const makeDef = (): GameDef => ({
  metadata: { id: 'resolve-ref-test', players: { min: 1, max: 4 } },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [
    { id: asZoneId('deck:none'), owner: 'none', visibility: 'hidden', ordering: 'stack' },
    { id: asZoneId('hand:0'), owner: 'player', visibility: 'owner', ordering: 'stack' },
    { id: asZoneId('hand:1'), owner: 'player', visibility: 'owner', ordering: 'stack' },
    { id: asZoneId('hand:2'), owner: 'player', visibility: 'owner', ordering: 'stack' },
  ],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [] },
  actions: [],
  triggers: [],
  terminal: { conditions: [] },
});

const makeDefWithMarkers = (): GameDef => ({
  ...makeDef(),
  markerLattices: [
    {
      id: 'supportOpposition',
      states: ['activeOpposition', 'passiveOpposition', 'neutral', 'passiveSupport', 'activeSupport'],
      defaultState: 'neutral',
    },
  ],
});

const makeDefWithGlobalMarkers = (): GameDef => ({
  ...makeDef(),
  globalMarkerLattices: [
    {
      id: 'cap_topGun',
      states: ['inactive', 'unshaded', 'shaded'],
      defaultState: 'inactive',
    },
  ],
});

const makeToken = (id: string, props: Readonly<Record<string, number | string | boolean>>): Token => ({
  id: asTokenId(id),
  type: 'card',
  props,
});

const makeState = (): GameState => ({
  globalVars: { threat: 5, tempo: 2 },
  perPlayerVars: {
    0: { money: 7 },
    1: { money: 10 },
    2: { money: 4 },
  },
  zoneVars: {},
  playerCount: 3,
  zones: {
    'deck:none': [makeToken('deck-1', { cost: 3 }), makeToken('deck-2', { cost: 1 })],
    'hand:0': [],
    'hand:1': [makeToken('hand-1', { cost: 2 })],
    'hand:2': [],
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

const makeCtx = (overrides?: Partial<EvalContext>): EvalContext => ({
  def: makeDef(),
  adjacencyGraph: buildAdjacencyGraph([]),
  state: makeState(),
  activePlayer: asPlayerId(2),
  actorPlayer: asPlayerId(1),
  bindings: {
    '$x': 42,
    '$card': makeToken('bound-1', { cost: 9, color: 'blue', faceUp: true }),
  },
  collector: createCollector(),
  ...overrides,
});

describe('resolveRef', () => {
  it('resolves gvar and throws MISSING_VAR when global var is absent', () => {
    const ctx = makeCtx();

    assert.equal(resolveRef({ ref: 'gvar', var: 'threat' }, ctx), 5);

    assert.throws(() => resolveRef({ ref: 'gvar', var: 'missing' }, ctx), (error: unknown) =>
      isEvalErrorCode(error, 'MISSING_VAR'),
    );
  });

  it('resolves pvar and enforces single-player selector cardinality', () => {
    const ctx = makeCtx();

    assert.equal(resolveRef({ ref: 'pvar', player: 'actor', var: 'money' }, ctx), 10);

    assert.throws(() => resolveRef({ ref: 'pvar', player: 'all', var: 'money' }, ctx), (error: unknown) =>
      isEvalErrorCode(error, 'SELECTOR_CARDINALITY'),
    );
  });

  it('resolves zoneCount and enforces single-zone selector cardinality', () => {
    const ctx = makeCtx();

    assert.equal(resolveRef({ ref: 'zoneCount', zone: 'deck:none' }, ctx), 2);

    assert.throws(() => resolveRef({ ref: 'zoneCount', zone: 'hand:all' }, ctx), (error: unknown) =>
      isEvalErrorCode(error, 'SELECTOR_CARDINALITY'),
    );
  });

  it('resolves tokenProp from a bound token and reports unbound/missing prop errors', () => {
    const ctx = makeCtx();

    assert.equal(resolveRef({ ref: 'tokenProp', token: '$card', prop: 'cost' }, ctx), 9);

    assert.throws(
      () => resolveRef({ ref: 'tokenProp', token: '$missing', prop: 'cost' }, ctx),
      (error: unknown) =>
        isEvalErrorCode(error, 'MISSING_BINDING') &&
        Array.isArray(error.context?.availableBindings),
    );

    assert.throws(() => resolveRef({ ref: 'tokenProp', token: '$card', prop: 'missingProp' }, ctx), (error: unknown) =>
      isEvalErrorCode(error, 'MISSING_VAR') &&
      Array.isArray(error.context?.availableBindings),
    );
  });

  it('resolves binding and rejects missing or non-scalar binding values', () => {
    const ctx = makeCtx();

    assert.equal(resolveRef({ ref: 'binding', name: '$x' }, ctx), 42);

    assert.throws(() => resolveRef({ ref: 'binding', name: '$missing' }, ctx), (error: unknown) =>
      isEvalErrorCode(error, 'MISSING_BINDING') &&
      Array.isArray(error.context?.availableBindings),
    );

    const objectBindingCtx = makeCtx({ bindings: { '$obj': { nested: true } } });
    assert.throws(() => resolveRef({ ref: 'binding', name: '$obj' }, objectBindingCtx), (error: unknown) =>
      isEvalErrorCode(error, 'TYPE_MISMATCH'),
    );
  });

  it('resolves assetField from row bindings and reports dedicated data-asset row/field errors', () => {
    const ctx = makeCtx({
      def: {
        ...makeDef(),
        runtimeDataAssets: [
          {
            id: 'tournament-standard',
            kind: 'scenario',
            payload: { blindSchedule: { levels: [] } },
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
              { field: 'phase', type: 'string' },
            ],
          },
        ],
      },
      bindings: {
        '$blindRow': { level: 3, smallBlind: 40, phase: 'mid' },
      },
    });

    assert.equal(resolveRef({ ref: 'assetField', row: '$blindRow', tableId: 'tournament-standard::blindSchedule.levels', field: 'smallBlind' }, ctx), 40);

    assert.throws(
      () => resolveRef({ ref: 'assetField', row: '$missingRow', tableId: 'tournament-standard::blindSchedule.levels', field: 'smallBlind' }, ctx),
      (error: unknown) => isEvalErrorCode(error, 'MISSING_BINDING'),
    );
    assert.throws(
      () => resolveRef({ ref: 'assetField', row: '$blindRow', tableId: 'tournament-standard::blindSchedule.levels', field: 'missing' }, ctx),
      (error: unknown) =>
        isEvalErrorCode(error, 'DATA_ASSET_FIELD_UNDECLARED') && error.context?.field === 'missing',
    );
    assert.throws(
      () =>
        resolveRef(
          { ref: 'assetField', row: '$blindRow', tableId: 'tournament-standard::blindSchedule.levels', field: 'phase' },
          makeCtx({
            def: {
              ...makeDef(),
              runtimeDataAssets: [
                {
                  id: 'tournament-standard',
                  kind: 'scenario',
                  payload: { blindSchedule: { levels: [] } },
                },
              ],
              tableContracts: [
                {
                  id: 'tournament-standard::blindSchedule.levels',
                  assetId: 'tournament-standard',
                  tablePath: 'blindSchedule.levels',
                  fields: [{ field: 'phase', type: 'string' }],
                },
              ],
            },
            bindings: { '$blindRow': { phase: ['mid'] } },
          }),
        ),
      (error: unknown) =>
        isEvalErrorCode(error, 'DATA_ASSET_FIELD_TYPE_INVALID') &&
        error.context?.field === 'phase' &&
        error.context?.expectedType === 'string',
    );
  });

  it('throws dedicated data-asset errors for assetField row-binding and table-contract failures', () => {
    const ctx = makeCtx({
      def: {
        ...makeDef(),
        tableContracts: [
          {
            id: 'missing-asset::blindSchedule.levels',
            assetId: 'missing-asset',
            tablePath: 'blindSchedule.levels',
            fields: [{ field: 'smallBlind', type: 'int' }],
          },
        ],
      },
      bindings: {
        '$blindRow': 42,
      },
    });

    assert.throws(
      () => resolveRef({ ref: 'assetField', row: '$blindRow', tableId: 'missing-asset::blindSchedule.levels', field: 'smallBlind' }, ctx),
      (error: unknown) =>
        isEvalErrorCode(error, 'DATA_ASSET_RUNTIME_ASSET_MISSING') &&
        error.context?.tableId === 'missing-asset::blindSchedule.levels',
    );

    assert.throws(
      () => resolveRef({ ref: 'assetField', row: '$blindRow', tableId: 'missing-contract', field: 'smallBlind' }, ctx),
      (error: unknown) =>
        isEvalErrorCode(error, 'DATA_ASSET_TABLE_CONTRACT_MISSING') && error.context?.tableId === 'missing-contract',
    );

    const rowBindingTypeCtx = makeCtx({
      def: {
        ...makeDef(),
        runtimeDataAssets: [
          {
            id: 'tournament-standard',
            kind: 'scenario',
            payload: { blindSchedule: { levels: [] } },
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
      bindings: {
        '$blindRow': 42,
      },
    });
    assert.throws(
      () => resolveRef({ ref: 'assetField', row: '$blindRow', tableId: 'tournament-standard::blindSchedule.levels', field: 'smallBlind' }, rowBindingTypeCtx),
      (error: unknown) =>
        isEvalErrorCode(error, 'DATA_ASSET_ROW_BINDING_TYPE_INVALID') &&
        error.context?.row === '$blindRow',
    );
  });

  it('resolves tokenZone — returns zone ID containing the bound token', () => {
    const handToken = makeToken('hand-1', { cost: 2 });
    const ctx = makeCtx({ bindings: { '$x': 42, '$card': handToken } });
    assert.equal(resolveRef({ ref: 'tokenZone', token: '$card' }, ctx), 'hand:1');
  });

  it('resolves tokenZone when binding is a token id string', () => {
    const ctx = makeCtx({ bindings: { '$cardId': 'hand-1' } });
    assert.equal(resolveRef({ ref: 'tokenZone', token: '$cardId' }, ctx), 'hand:1');
  });

  it('throws MISSING_BINDING when tokenZone binding is not found', () => {
    const ctx = makeCtx();
    assert.throws(
      () => resolveRef({ ref: 'tokenZone', token: '$missing' }, ctx),
      (error: unknown) => isEvalErrorCode(error, 'MISSING_BINDING'),
    );
  });

  it('throws TYPE_MISMATCH when tokenZone binding is not a token', () => {
    const ctx = makeCtx();
    assert.throws(
      () => resolveRef({ ref: 'tokenZone', token: '$x' }, ctx),
      (error: unknown) => isEvalErrorCode(error, 'TYPE_MISMATCH'),
    );
  });

  it('throws MISSING_VAR when token is not in any zone', () => {
    const orphanToken = makeToken('orphan-1', { cost: 0 });
    const ctx = makeCtx({ bindings: { '$orphan': orphanToken } });
    assert.throws(
      () => resolveRef({ ref: 'tokenZone', token: '$orphan' }, ctx),
      (error: unknown) => isEvalErrorCode(error, 'MISSING_VAR'),
    );
  });

  it('resolves zoneProp — returns scalar properties from zone attributes', () => {
    const ctx = makeCtx({
      def: {
        ...makeDef(),
        zones: [
          ...makeDef().zones,
          {
            id: asZoneId('saigon'),
            owner: 'none' as const,
            visibility: 'public' as const,
            ordering: 'set' as const,
            adjacentTo: [{ to: asZoneId('hue') }],
            category: 'city',
            attributes: { population: 2, econ: 3, terrainTags: ['lowland'], country: 'south-vietnam', coastal: true },
          },
        ],
      },
    });
    assert.equal(resolveRef({ ref: 'zoneProp', zone: 'saigon', prop: 'population' }, ctx), 2);
    assert.equal(resolveRef({ ref: 'zoneProp', zone: 'saigon', prop: 'coastal' }, ctx), true);
  });

  it('throws ZONE_PROP_NOT_FOUND when zone is not in def.zones', () => {
    const ctx = makeCtx();
    assert.throws(
      () => resolveRef({ ref: 'zoneProp', zone: 'unknown', prop: 'population' }, ctx),
      (error: unknown) =>
        isEvalErrorCode(error, 'ZONE_PROP_NOT_FOUND') &&
        error.context?.zoneId === 'unknown',
    );
  });

  it('throws ZONE_PROP_NOT_FOUND when property is not on zone', () => {
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
            attributes: { population: 1, econ: 1, country: 'south-vietnam', coastal: false },
          },
        ],
      },
    });
    assert.throws(
      () => resolveRef({ ref: 'zoneProp', zone: 'hue', prop: 'missingProp' }, ctx),
      (error: unknown) => isEvalErrorCode(error, 'ZONE_PROP_NOT_FOUND'),
    );
  });

  it('throws TYPE_MISMATCH when zoneProp targets an array property', () => {
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
            attributes: { population: 1, econ: 1, terrainTags: ['highland'], country: 'south-vietnam', coastal: false },
          },
        ],
      },
    });
    assert.throws(
      () => resolveRef({ ref: 'zoneProp', zone: 'hue', prop: 'terrainTags' }, ctx),
      (error: unknown) =>
        isEvalErrorCode(error, 'TYPE_MISMATCH') &&
        typeof error.context === 'object' &&
        error.context !== null &&
        Object.hasOwn(error.context, 'reference'),
    );
  });

  it('resolves markerState using a bound zone selector', () => {
    const stateWithMarkers: GameState = {
      ...makeState(),
      markers: {
        'hand:1': { supportOpposition: 'neutral' },
      },
    };
    const ctx = makeCtx({
      state: stateWithMarkers,
      bindings: {
        '$space': 'hand:1',
      },
    });

    assert.equal(
      resolveRef({ ref: 'markerState', space: '$space', marker: 'supportOpposition' }, ctx),
      'neutral',
    );
  });

  it('throws MISSING_BINDING for markerState when bound zone selector is absent', () => {
    const stateWithMarkers: GameState = {
      ...makeState(),
      markers: {
        'hand:1': { supportOpposition: 'neutral' },
      },
    };
    const ctx = makeCtx({ state: stateWithMarkers, bindings: {} });

    assert.throws(
      () => resolveRef({ ref: 'markerState', space: '$missingSpace', marker: 'supportOpposition' }, ctx),
      (error: unknown) => isEvalErrorCode(error, 'MISSING_BINDING'),
    );
  });

  it('returns marker lattice default state when marker is not explicitly set on the space', () => {
    const ctx = makeCtx({
      def: makeDefWithMarkers(),
      state: makeState(),
      bindings: { '$space': 'deck:none' },
    });

    assert.equal(
      resolveRef({ ref: 'markerState', space: '$space', marker: 'supportOpposition' }, ctx),
      'neutral',
    );
  });

  it('throws MISSING_VAR when marker lattice does not exist', () => {
    const ctx = makeCtx({
      state: makeState(),
      bindings: { '$space': 'deck:none' },
    });

    assert.throws(
      () => resolveRef({ ref: 'markerState', space: '$space', marker: 'supportOpposition' }, ctx),
      (error: unknown) => isEvalErrorCode(error, 'MISSING_VAR'),
    );
  });

  it('throws MISSING_VAR for markerState when bound map-space id is unknown', () => {
    const ctx = makeCtx({
      def: makeDefWithMarkers(),
      state: makeState(),
      bindings: { '$space': 'quang-nam:none' },
    });

    assert.throws(
      () => resolveRef({ ref: 'markerState', space: '$space', marker: 'supportOpposition' }, ctx),
      (error: unknown) =>
        isEvalErrorCode(error, 'MISSING_VAR') &&
        error.context?.spaceId === 'quang-nam:none' &&
        Array.isArray(error.context?.availableMapSpaceIds) &&
        (error.context?.availableMapSpaceIds as unknown[]).includes('deck:none'),
    );
  });

  it('resolves globalMarkerState from state when explicitly set', () => {
    const ctx = makeCtx({
      def: makeDefWithGlobalMarkers(),
      state: {
        ...makeState(),
        globalMarkers: { cap_topGun: 'unshaded' },
      },
    });

    assert.equal(resolveRef({ ref: 'globalMarkerState', marker: 'cap_topGun' }, ctx), 'unshaded');
  });

  it('resolves globalMarkerState using lattice default when not explicitly set', () => {
    const ctx = makeCtx({
      def: makeDefWithGlobalMarkers(),
      state: makeState(),
    });

    assert.equal(resolveRef({ ref: 'globalMarkerState', marker: 'cap_topGun' }, ctx), 'inactive');
  });

  it('throws MISSING_VAR when global marker lattice does not exist', () => {
    const ctx = makeCtx();

    assert.throws(
      () => resolveRef({ ref: 'globalMarkerState', marker: 'cap_topGun' }, ctx),
      (error: unknown) => isEvalErrorCode(error, 'MISSING_VAR'),
    );
  });

  it('resolves activePlayer — returns numeric active player ID', () => {
    const ctx = makeCtx({ activePlayer: asPlayerId(2) });
    assert.equal(resolveRef({ ref: 'activePlayer' }, ctx), 2);
  });

  it('resolves activePlayer for player 0', () => {
    const ctx = makeCtx({ activePlayer: asPlayerId(0) });
    assert.equal(resolveRef({ ref: 'activePlayer' }, ctx), 0);
  });
});
