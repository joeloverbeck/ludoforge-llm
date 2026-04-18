// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asZoneId,
  buildAdjacencyGraph,
  createEvalContext,
  createEvalRuntimeResources,
  getCompiledPipelinePredicates,
  type ActionPipelineDef,
  type ConditionAST,
  type GameDef,
  type GameState,
} from '../../../src/kernel/index.js';

const makeState = (): GameState => ({
  globalVars: { resources: 4 },
  perPlayerVars: { 0: { resources: 3 } },
  zoneVars: {},
  playerCount: 1,
  zones: { 'board:none': [] },
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
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

const makeDef = (
  actionPipelines?: readonly ActionPipelineDef[],
): GameDef =>
  ({
    metadata: { id: 'compiled-condition-cache-test', players: { min: 1, max: 1 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [{ id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set' }],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [],
    ...(actionPipelines === undefined ? {} : { actionPipelines }),
    triggers: [],
    terminal: { conditions: [] },
  }) as unknown as GameDef;

const makeCtx = (state: GameState, bindings: Readonly<Record<string, unknown>> = {}) =>
  createEvalContext({
    def: makeDef(),
    adjacencyGraph: buildAdjacencyGraph(makeDef().zones),
    state,
    activePlayer: state.activePlayer,
    actorPlayer: state.activePlayer,
    bindings,
    resources: createEvalRuntimeResources(),
  });

describe('compiled condition cache', () => {
  it('returns an empty map when the definition has no action pipelines', () => {
    const cache = getCompiledPipelinePredicates(makeDef());

    assert.equal(cache.size, 0);
  });

  it('stores compilable pipeline and stage predicates while omitting boolean and non-compilable conditions', () => {
    const pipelineLegality: ConditionAST = {
      op: '>=',
      left: { _t: 2, ref: 'gvar', var: 'resources' },
      right: 3,
    };
    const pipelineCostValidation: ConditionAST = {
      op: '==',
      left: { _t: 2, ref: 'binding', name: '$cost' },
      right: 2,
    };
    const stageLegality: ConditionAST = {
      op: 'and',
      args: [
        { op: '==', left: { _t: 2, ref: 'binding', name: '$choice' }, right: 'a' },
        true,
      ],
    };
    const nonCompilableStageCostValidation: ConditionAST = { op: 'adjacent', left: 'board:none', right: 'board:none' };

    const def = makeDef([
      {
        id: 'profile',
        actionId: asActionId('op'),
        legality: pipelineLegality,
        costValidation: pipelineCostValidation,
        costEffects: [],
        targeting: {},
        stages: [
          {
            legality: stageLegality,
            costValidation: nonCompilableStageCostValidation,
            effects: [],
          },
          {
            legality: true,
            costValidation: false,
            effects: [],
          },
        ],
        atomicity: 'atomic',
      },
    ]);

    const cache = getCompiledPipelinePredicates(def);
    const compiledPipelineLegality = cache.get(pipelineLegality);
    const compiledPipelineCostValidation = cache.get(pipelineCostValidation);
    const compiledStageLegality = cache.get(stageLegality);

    assert.equal(cache.size, 3);
    assert.ok(compiledPipelineLegality !== undefined);
    assert.ok(compiledPipelineCostValidation !== undefined);
    assert.ok(compiledStageLegality !== undefined);
    assert.equal(cache.get(nonCompilableStageCostValidation), undefined);

    const state = makeState();
    assert.equal(compiledPipelineLegality(makeCtx(state)), true);
    assert.equal(compiledPipelineCostValidation(makeCtx(state, { '$cost': 2 })), true);
    assert.equal(compiledStageLegality(makeCtx(state, { '$choice': 'a' })), true);
  });

  it('reuses the cached map for the same actionPipelines array reference', () => {
    const condition: ConditionAST = {
      op: '>=',
      left: { _t: 2, ref: 'gvar', var: 'resources' },
      right: 1,
    };
    const pipelines: readonly ActionPipelineDef[] = [{
      id: 'profile',
      actionId: asActionId('op'),
      legality: condition,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [],
      atomicity: 'partial',
    }];
    const def = makeDef(pipelines);

    const first = getCompiledPipelinePredicates(def);
    const second = getCompiledPipelinePredicates(def);

    assert.equal(first, second);
  });

  it('creates separate cache entries for different actionPipelines array references', () => {
    const firstCondition: ConditionAST = {
      op: '>=',
      left: { _t: 2, ref: 'gvar', var: 'resources' },
      right: 1,
    };
    const secondCondition: ConditionAST = {
      op: '>=',
      left: { _t: 2, ref: 'gvar', var: 'resources' },
      right: 1,
    };

    const first = getCompiledPipelinePredicates(makeDef([{
      id: 'profile-a',
      actionId: asActionId('op'),
      legality: firstCondition,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [],
      atomicity: 'partial',
    }]));
    const second = getCompiledPipelinePredicates(makeDef([{
      id: 'profile-b',
      actionId: asActionId('op'),
      legality: secondCondition,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [],
      atomicity: 'partial',
    }]));

    assert.notEqual(first, second);
    assert.ok(first.get(firstCondition) !== undefined);
    assert.ok(second.get(secondCondition) !== undefined);
  });
});
