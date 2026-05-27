// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  constraintsSatisfied,
  probeRoleBoundPostState,
  routeGraphProviderForDef,
} from '../../../src/agents/plan-role-constraint-eval.js';
import type { PlanRoleBinding } from '../../../src/agents/plan-execution.js';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asTokenId,
  assertValidatedGameDef,
  type ActionDef,
  type ActionPipelineDef,
  type ConditionAST,
  type CompiledPlanTemplate,
  type GameDef,
  type GameState,
  initialState,
} from '../../../src/kernel/index.js';
import { eff } from '../../helpers/effect-tag-helper.js';
import { createSyntheticDecisionDef } from '../../helpers/synthetic-decision-fixture.js';

const roleBinding = (role: string, selectedId: string): PlanRoleBinding => ({
  role,
  selectedId,
  quality: 0,
  rank: 0,
  components: {},
});

const state = (): GameState => ({
  zones: {
    'zone-a': [{ id: asTokenId('token-a'), type: 'piece', props: {} }],
    'zone-b': [{ id: asTokenId('token-b'), type: 'piece', props: {} }],
    'zone-c': [],
    'zone-d': [],
  },
} as unknown as GameState);

const routeGraphDef = (): GameDef => ({
  ...createSyntheticDecisionDef(),
  runtimeDataAssets: [{
    id: 'test-route-graph',
    kind: 'routeGraph',
    payload: {
      routeClasses: [{ id: 'land' }, { id: 'trail' }],
      edges: [
        { from: 'zone-a', to: 'zone-b', classes: ['land'] },
        { from: 'zone-b', to: 'zone-c', classes: ['land'] },
        { from: 'zone-c', to: 'zone-d', classes: ['trail'] },
      ],
      defaultMaxHops: 3,
    },
  }],
});

const compoundProbeDef = (): GameDef => assertValidatedGameDef({
  metadata: { id: 'compound-post-state-probe', players: { min: 2, max: 2 } },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [{ id: asPhaseId('main') }] },
  actions: [
    { id: asActionId('operate'), actor: 'active', executor: 'actor', phase: [asPhaseId('main')], params: [], pre: null, cost: [], effects: [], limits: [] },
    { id: asActionId('sa'), actor: 'active', executor: 'actor', phase: [asPhaseId('main')], params: [], pre: null, cost: [], effects: [], limits: [] },
  ] satisfies ActionDef[],
  actionPipelines: [
    {
      id: 'operate-profile',
      actionId: asActionId('operate'),
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [{
        effects: [
          eff({
            chooseN: {
              internalDecisionId: 'decision:$targetSpaces',
              bind: '$targetSpaces',
              options: { query: 'enums', values: ['op-a', 'op-b'] },
              n: 1,
            },
          }) as ActionPipelineDef['stages'][number]['effects'][number],
        ],
      }],
      atomicity: 'atomic',
    },
    {
      id: 'sa-profile',
      actionId: asActionId('sa'),
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [{
        effects: [
          eff({
            chooseOne: {
              internalDecisionId: 'decision:$destination',
              bind: '$destination',
              options: { query: 'enums', values: ['sa-a', 'sa-b'] },
            },
          }) as ActionPipelineDef['stages'][number]['effects'][number],
        ],
      }],
      atomicity: 'atomic',
    },
  ],
  triggers: [],
  terminal: { conditions: [] },
});

describe('plan role constraint runtime evaluation', () => {
  it('preserves notEqual role-binding semantics', () => {
    const current = roleBinding('destination', 'zone-b');
    assert.equal(constraintsSatisfied(
      current,
      [{ kind: 'notEqual', role: 'origin' }],
      { origin: roleBinding('origin', 'zone-a') },
      state(),
      null,
    ), true);
    assert.equal(constraintsSatisfied(
      current,
      [{ kind: 'notEqual', role: 'origin' }],
      { origin: roleBinding('origin', 'zone-b') },
      state(),
      null,
    ), false);
  });

  it('evaluates locatedIn against literal-zone and role-container constraints', () => {
    assert.equal(constraintsSatisfied(
      roleBinding('unit', 'token-a'),
      [{ kind: 'locatedIn', role: 'unit', container: 'zone-a' }],
      {},
      state(),
      null,
    ), true);
    assert.equal(constraintsSatisfied(
      roleBinding('unit', 'token-a'),
      [{ kind: 'locatedIn', role: 'unit', container: 'zone-b' }],
      {},
      state(),
      null,
    ), false);
    assert.equal(constraintsSatisfied(
      roleBinding('escort', 'token-a'),
      [{ kind: 'locatedIn', role: 'escort', container: 'origin' }],
      { origin: roleBinding('origin', 'zone-a') },
      state(),
      null,
    ), true);
    assert.equal(constraintsSatisfied(
      roleBinding('escort', 'token-a'),
      [{ kind: 'locatedIn', role: 'escort', container: 'origin' }],
      { origin: roleBinding('origin', 'zone-b') },
      state(),
      null,
    ), false);
  });

  it('evaluates distinctOriginDestination from bound role zones', () => {
    assert.equal(constraintsSatisfied(
      roleBinding('destination', 'zone-b'),
      [{ kind: 'distinctOriginDestination', origin: 'origin', destination: 'destination' }],
      { origin: roleBinding('origin', 'token-a') },
      state(),
      null,
    ), true);
    assert.equal(constraintsSatisfied(
      roleBinding('destination', 'zone-a'),
      [{ kind: 'distinctOriginDestination', origin: 'origin', destination: 'destination' }],
      { origin: roleBinding('origin', 'token-a') },
      state(),
      null,
    ), false);
  });

  it('evaluates reachable with route class and max-hop bounds', () => {
    const provider = routeGraphProviderForDef(routeGraphDef());
    assert.notEqual(provider, null);
    assert.equal(constraintsSatisfied(
      roleBinding('destination', 'zone-c'),
      [{ kind: 'reachable', from: 'origin', to: 'destination', via: 'land', maxHops: 2 }],
      { origin: roleBinding('origin', 'zone-a') },
      state(),
      provider,
    ), true);
    assert.equal(constraintsSatisfied(
      roleBinding('destination', 'zone-c'),
      [{ kind: 'reachable', from: 'origin', to: 'destination', via: 'land', maxHops: 1 }],
      { origin: roleBinding('origin', 'zone-a') },
      state(),
      provider,
    ), false);
    assert.equal(constraintsSatisfied(
      roleBinding('destination', 'zone-d'),
      [{ kind: 'reachable', from: 'origin', to: 'destination', via: 'land' }],
      { origin: roleBinding('origin', 'zone-a') },
      state(),
      provider,
    ), false);
  });

  it('evaluates adjacent through the compiled routeGraph provider', () => {
    const provider = routeGraphProviderForDef(routeGraphDef());
    assert.notEqual(provider, null);
    assert.equal(constraintsSatisfied(
      roleBinding('destination', 'zone-b'),
      [{ kind: 'adjacent', a: 'origin', b: 'destination' }],
      { origin: roleBinding('origin', 'zone-a') },
      state(),
      provider,
    ), true);
    assert.equal(constraintsSatisfied(
      roleBinding('destination', 'zone-c'),
      [{ kind: 'adjacent', a: 'origin', b: 'destination' }],
      { origin: roleBinding('origin', 'zone-a') },
      state(),
      provider,
    ), false);
  });

  it('fails closed when route constraints lack a routeGraph provider', () => {
    assert.throws(
      () => constraintsSatisfied(
        roleBinding('destination', 'zone-b'),
        [{ kind: 'reachable', from: 'origin', to: 'destination' }],
        { origin: roleBinding('origin', 'zone-a') },
        state(),
        null,
      ),
      /reachable constraint reached runtime evaluation without a compiled RouteGraphProvider/u,
    );
    assert.throws(
      () => constraintsSatisfied(
        roleBinding('destination', 'zone-b'),
        [{ kind: 'adjacent', a: 'origin', b: 'destination' }],
        { origin: roleBinding('origin', 'zone-a') },
        state(),
        null,
      ),
      /adjacent constraint reached runtime evaluation without a compiled RouteGraphProvider/u,
    );
  });

  it('evaluates bounded postState predicates after applying a role-bound decision', () => {
    const def = routeGraphDef();
    const baseState = {
      ...initialState(def, 7, 2).state,
      zones: { left: [], right: [] },
    } as unknown as GameState;
    const context = {
      def,
      rootMove: { actionId: asActionId('branch'), params: {} },
      root: { actionTags: ['branch'], actionIds: [] },
      steps: [{
        label: 'choose-side',
        role: 'side',
        match: { decisionKind: 'chooseOne', targetKind: 'zone', decisionPath: '$pick' },
      }],
    };
    const constraint = {
      kind: 'postState' as const,
      step: 'choose-side',
      role: 'side',
      maxSteps: 2,
      predicate: { kind: 'roleLocatedIn' as const, role: 'side', container: 'left' },
    };

    assert.equal(constraintsSatisfied(
      roleBinding('side', 'left'),
      [constraint],
      {},
      baseState,
      null,
      context,
    ), true);
    assert.equal(constraintsSatisfied(
      roleBinding('side', 'right'),
      [constraint],
      {},
      baseState,
      null,
      context,
    ), false);
    assert.equal(JSON.stringify(constraintsSatisfied(
      roleBinding('side', 'left'),
      [constraint],
      {},
      baseState,
      null,
      context,
    )), JSON.stringify(true));
  });

  it('evaluates bounded postState condition predicates with role-zone bindings', () => {
    const def = routeGraphDef();
    const baseState = {
      ...initialState(def, 7, 2).state,
      zones: { left: [], right: [] },
    } as unknown as GameState;
    const context = {
      def,
      rootMove: { actionId: asActionId('branch'), params: {} },
      root: { actionTags: ['branch'], actionIds: [] },
      steps: [{
        label: 'choose-side',
        role: 'side',
        match: { decisionKind: 'chooseOne', targetKind: 'zone', decisionPath: '$pick' },
      }],
      playerId: asPlayerId(1),
    };
    const constraint = {
      kind: 'postState' as const,
      step: 'choose-side',
      role: 'side',
      maxSteps: 2,
      predicate: {
        kind: 'condition' as const,
        condition: { op: '==', left: { _t: 2, ref: 'binding', name: 'chosenZone' }, right: 'left' } satisfies ConditionAST,
        bindings: { chosenZone: 'side' },
      },
    };

    assert.equal(constraintsSatisfied(
      roleBinding('side', 'left'),
      [constraint],
      {},
      baseState,
      null,
      context,
    ), true);
    assert.equal(constraintsSatisfied(
      roleBinding('side', 'right'),
      [constraint],
      {},
      baseState,
      null,
      context,
    ), false);
  });

  it('materializes operation chooseN and compound special-activity params for postState probes', () => {
    const def = compoundProbeDef();
    const baseState = initialState(def, 196_005, 2).state;
    const steps: CompiledPlanTemplate['steps'] = [
      {
        label: 'operation-target',
        role: 'operationTarget',
        match: { decisionKind: 'chooseNStep', targetKind: 'zone', decisionPath: '$targetSpaces', actionTag: 'operate' },
      },
      {
        label: 'sa-destination',
        role: 'saDestination',
        match: { decisionKind: 'chooseOne', targetKind: 'zone', decisionPath: '$destination', actionTag: 'sa' },
      },
    ];
    const constraint = {
      kind: 'postState' as const,
      step: 'sa-destination',
      role: 'saDestination',
      maxSteps: 4,
      predicate: { kind: 'roleLocatedIn' as const, role: 'saDestination', container: 'sa-b' },
    };
    const postState = probeRoleBoundPostState(
      roleBinding('saDestination', 'sa-b'),
      constraint,
      { operationTarget: roleBinding('operationTarget', 'op-a') },
      {
        def,
        rootMove: { actionId: asActionId('operate'), params: {} },
        root: {
          actionTags: ['operate'],
          actionIds: [],
          compound: { specialTags: ['sa'], timing: 'after' },
        },
        steps,
        playerId: asPlayerId(1),
      },
      baseState,
    );

    assert.equal(postState.kind, 'ready');
    const missingEarlierRoleResult = probeRoleBoundPostState(
      roleBinding('saDestination', 'sa-b'),
      constraint,
      {},
      {
        def,
        rootMove: { actionId: asActionId('operate'), params: {} },
        root: {
          actionTags: ['operate'],
          actionIds: [],
          compound: { specialTags: ['sa'], timing: 'after' },
        },
        steps,
        playerId: asPlayerId(1),
      },
      baseState,
    );
    assert.deepEqual(
      missingEarlierRoleResult,
      { kind: 'unavailable', reason: 'postStateObserverInsufficient' },
      'missing earlier role bindings should fail closed',
    );
    assert.deepEqual(
      probeRoleBoundPostState(
        roleBinding('saDestination', 'sa-b'),
        { ...constraint, maxSteps: -1 },
        { operationTarget: roleBinding('operationTarget', 'op-a') },
        {
          def,
          rootMove: { actionId: asActionId('operate'), params: {} },
          root: {
            actionTags: ['operate'],
            actionIds: [],
            compound: { specialTags: ['sa'], timing: 'after' },
          },
          steps,
          playerId: asPlayerId(1),
        },
        baseState,
      ),
      { kind: 'unavailable', reason: 'postStatePredicateFailed' },
      'applyMove failures that are not probe-materialization exhaustion should fail as predicate failures',
    );
  });
});
