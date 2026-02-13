import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyEffects,
  asPhaseId,
  asPlayerId,
  asZoneId,
  buildAdjacencyGraph,
  createRng,
  type EffectAST,
  type EffectContext,
  type GameDef,
  type GameState,
  type MapSpaceDef,
  createCollector,
} from '../../src/kernel/index.js';

function makeDef(): GameDef {
  return {
    metadata: { id: 'faction-costs-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [
      { name: 'resources', type: 'int', init: 30, min: 0, max: 75 },
    ],
    perPlayerVars: [],
    zones: [
      { id: asZoneId('quangTri:none'), owner: 'none', visibility: 'public', ordering: 'set' },
      { id: asZoneId('route1:none'), owner: 'none', visibility: 'public', ordering: 'set' },
      { id: asZoneId('saigon:none'), owner: 'none', visibility: 'public', ordering: 'set' },
    ],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }], activePlayerOrder: 'roundRobin' },
    actions: [],
    triggers: [],
    endConditions: [],
  };
}

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    globalVars: { resources: 30 },
    perPlayerVars: {},
    playerCount: 2,
    zones: {
      'quangTri:none': [],
      'route1:none': [],
      'saigon:none': [],
    },
    nextTokenOrdinal: 1,
    currentPhase: asPhaseId('main'),
    activePlayer: asPlayerId(0),
    turnCount: 1,
    rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
    stateHash: 0n,
    actionUsage: {},
    markers: {},
    ...overrides,
  };
}

const mapSpaces: readonly MapSpaceDef[] = [
  { id: 'quangTri:none', spaceType: 'province', population: 1, econ: 0, terrainTags: ['highland'], country: 'southVietnam', coastal: true, adjacentTo: [] },
  { id: 'route1:none', spaceType: 'loc', population: 0, econ: 1, terrainTags: ['highway'], country: 'southVietnam', coastal: false, adjacentTo: [] },
  { id: 'saigon:none', spaceType: 'city', population: 6, econ: 0, terrainTags: [], country: 'southVietnam', coastal: false, adjacentTo: [] },
];

function makeCtx(overrides?: Partial<EffectContext>): EffectContext {
  return {
    def: makeDef(),
    adjacencyGraph: buildAdjacencyGraph([]),
    state: makeState(),
    rng: createRng(42n),
    activePlayer: asPlayerId(0),
    actorPlayer: asPlayerId(0),
    bindings: { __freeOperation: false },
    moveParams: {},
    collector: createCollector(),
    mapSpaces,
    ...overrides,
  };
}

describe('FITL per-province-city-cost macro', () => {
  describe('runtime behavior', () => {
    it('charges cost for Province space', () => {
      const effects: readonly EffectAST[] = [
        { if: {
          when: {
            op: 'and',
            args: [
              { op: '!=', left: { ref: 'binding', name: '__freeOperation' }, right: true },
              { op: '!=', left: { ref: 'zoneProp', zone: 'quangTri:none', prop: 'spaceType' }, right: 'loc' },
            ],
          },
          then: [{ addVar: { scope: 'global', var: 'resources', delta: -3 } }],
        } },
      ];

      const ctx = makeCtx({ bindings: { __freeOperation: false } });
      const result = applyEffects(effects, ctx);
      assert.equal(result.state.globalVars.resources, 27, 'Province: resources should be 30 - 3 = 27');
    });

    it('charges cost for City space', () => {
      const effects: readonly EffectAST[] = [
        { if: {
          when: {
            op: 'and',
            args: [
              { op: '!=', left: { ref: 'binding', name: '__freeOperation' }, right: true },
              { op: '!=', left: { ref: 'zoneProp', zone: 'saigon:none', prop: 'spaceType' }, right: 'loc' },
            ],
          },
          then: [{ addVar: { scope: 'global', var: 'resources', delta: -3 } }],
        } },
      ];

      const ctx = makeCtx({ bindings: { __freeOperation: false } });
      const result = applyEffects(effects, ctx);
      assert.equal(result.state.globalVars.resources, 27, 'City: resources should be 30 - 3 = 27');
    });

    it('does NOT charge cost for LoC space', () => {
      const effects: readonly EffectAST[] = [
        { if: {
          when: {
            op: 'and',
            args: [
              { op: '!=', left: { ref: 'binding', name: '__freeOperation' }, right: true },
              { op: '!=', left: { ref: 'zoneProp', zone: 'route1:none', prop: 'spaceType' }, right: 'loc' },
            ],
          },
          then: [{ addVar: { scope: 'global', var: 'resources', delta: -3 } }],
        } },
      ];

      const ctx = makeCtx({ bindings: { __freeOperation: false } });
      const result = applyEffects(effects, ctx);
      assert.equal(result.state.globalVars.resources, 30, 'LoC: resources should remain at 30 (no charge)');
    });

    it('skips cost when __freeOperation is true', () => {
      const effects: readonly EffectAST[] = [
        { if: {
          when: {
            op: 'and',
            args: [
              { op: '!=', left: { ref: 'binding', name: '__freeOperation' }, right: true },
              { op: '!=', left: { ref: 'zoneProp', zone: 'quangTri:none', prop: 'spaceType' }, right: 'loc' },
            ],
          },
          then: [{ addVar: { scope: 'global', var: 'resources', delta: -3 } }],
        } },
      ];

      const ctx = makeCtx({ bindings: { __freeOperation: true } });
      const result = applyEffects(effects, ctx);
      assert.equal(result.state.globalVars.resources, 30, 'Free operation: resources should remain at 30');
    });
  });
});

