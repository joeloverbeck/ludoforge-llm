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
  type ZoneDef,
  createCollector,
} from '../../src/kernel/index.js';
import { findDeep } from '../helpers/ast-search-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const mapZones: readonly ZoneDef[] = [
  { id: asZoneId('quangTri:none'), owner: 'none', visibility: 'public', ordering: 'set', category: 'province', attributes: { population: 1, econ: 0, terrainTags: ['highland'], country: 'southVietnam', coastal: true } },
  { id: asZoneId('route1:none'), owner: 'none', visibility: 'public', ordering: 'set', category: 'loc', attributes: { population: 0, econ: 1, terrainTags: ['highway'], country: 'southVietnam', coastal: false } },
  { id: asZoneId('saigon:none'), owner: 'none', visibility: 'public', ordering: 'set', category: 'city', attributes: { population: 6, econ: 0, terrainTags: [], country: 'southVietnam', coastal: false } },
];

function makeDef(): GameDef {
  return {
    metadata: { id: 'faction-costs-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [
      { name: 'resources', type: 'int', init: 30, min: 0, max: 75 },
    ],
    perPlayerVars: [],
    zones: mapZones,
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [],
    triggers: [],
    terminal: { conditions: [] },
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
    turnOrderState: { type: 'roundRobin' },
    markers: {},
    ...overrides,
  };
}

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
              { op: '!=', left: { ref: 'zoneProp', zone: 'quangTri:none', prop: 'category' }, right: 'loc' },
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
              { op: '!=', left: { ref: 'zoneProp', zone: 'saigon:none', prop: 'category' }, right: 'loc' },
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
              { op: '!=', left: { ref: 'zoneProp', zone: 'route1:none', prop: 'category' }, right: 'loc' },
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
              { op: '!=', left: { ref: 'zoneProp', zone: 'quangTri:none', prop: 'category' }, right: 'loc' },
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

describe('FITL production free-operation guard and exception contracts', () => {
  it('guards shared per-province-city-cost with __freeOperation != true', () => {
    const { parsed } = compileProductionSpec();
    const perSpaceCost = parsed.doc.effectMacros?.find((macro) => macro.id === 'per-province-city-cost');
    assert.ok(perSpaceCost, 'Expected per-province-city-cost macro');

    const freeOpGuards = findDeep(perSpaceCost.effects, (node) =>
      node?.if?.when?.op === 'and' &&
      findDeep(node.if.when, (inner) =>
        inner?.op === '!=' &&
        inner?.left?.ref === 'binding' &&
        inner?.left?.name === '__freeOperation' &&
        inner?.right === true,
      ).length >= 1,
    );
    assert.ok(freeOpGuards.length >= 1, 'Expected __freeOperation guard in per-province-city-cost macro');
  });

  it('keeps ARVN Train sub-action pacify and base-replacement costs unguarded by free operation', () => {
    const { parsed } = compileProductionSpec();
    const trainArvn = parsed.doc.actionPipelines?.find((profile) => profile.id === 'train-arvn-profile');
    assert.ok(trainArvn, 'Expected train-arvn-profile');

    const subAction = trainArvn.stages.find((stage) => stage.stage === 'sub-action');
    assert.ok(subAction, 'Expected sub-action stage in train-arvn-profile');

    const replaceBranch = findDeep(subAction.effects, (node) =>
      node?.if?.when?.op === 'and' &&
      findDeep(node.if.when, (inner) => inner?.right === 'replace-cubes-with-base').length >= 1,
    );
    assert.ok(replaceBranch.length >= 1, 'Expected replace-cubes-with-base branch');
    const replaceDirectCost = findDeep(replaceBranch[0].if.then, (node) =>
      node?.addVar?.var === 'arvnResources' && node?.addVar?.delta === -3,
    );
    assert.ok(replaceDirectCost.length >= 1, 'Expected direct ARVN -3 cost in replace-cubes-with-base branch');
    const replaceFreeGuards = findDeep(replaceBranch[0].if.then, (node) =>
      node?.if?.when?.left?.ref === 'binding' && node?.if?.when?.left?.name === '__freeOperation',
    );
    assert.equal(replaceFreeGuards.length, 0, 'Replace-cubes-with-base cost should not be wrapped by __freeOperation');

    const pacifyBranch = findDeep(subAction.effects, (node) =>
      node?.if?.when?.op === 'and' &&
      findDeep(node.if.when, (inner) => inner?.right === 'pacify').length >= 1,
    );
    assert.ok(pacifyBranch.length >= 1, 'Expected pacify branch');
    const pacifyDirectCost = findDeep(pacifyBranch[0].if.then, (node) =>
      (node?.addVar?.var === 'arvnResources' &&
        (node?.addVar?.delta === -3 || node?.addVar?.delta?.op === '*')) ||
      node?.macro === 'rvn-leader-pacification-cost',
    );
    assert.ok(pacifyDirectCost.length >= 1, 'Expected ARVN pacification costs (direct or macro) in pacify branch');
  });

  it('keeps NVA trail-improvement cost unguarded by free operation', () => {
    const { parsed } = compileProductionSpec();
    const rallyNva = parsed.doc.actionPipelines?.find((profile) => profile.id === 'rally-nva-profile');
    assert.ok(rallyNva, 'Expected rally-nva-profile');

    const trailStage = rallyNva.stages.find((stage) => stage.stage === 'trail-improvement');
    assert.ok(trailStage, 'Expected trail-improvement stage');
    const trailCost = findDeep(trailStage.effects, (node) =>
      node?.addVar?.var === 'nvaResources' && node?.addVar?.delta === -2,
    );
    assert.ok(trailCost.length >= 1, 'Expected direct NVA -2 trail-improvement cost');

    const trailFreeGuards = findDeep(trailStage.effects, (node) =>
      node?.if?.when?.left?.ref === 'binding' && node?.if?.when?.left?.name === '__freeOperation',
    );
    assert.equal(trailFreeGuards.length, 0, 'Trail-improvement cost should not be wrapped by __freeOperation');
  });
});
