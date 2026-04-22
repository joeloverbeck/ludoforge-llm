// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyDecision,
  applyPublishedDecision,
  asActionId,
  asTokenId,
  asDecisionFrameId,
  asPhaseId,
  asPlayerId,
  asTurnId,
  createGameDefRuntime,
  publishMicroturn,
  resolveActiveDeciderSeatIdForPlayer,
  toStochasticDecisionStackContext,
  type ActionDef,
  type DecisionStackFrame,
  type GameDef,
  type GameState,
} from '../../../src/kernel/index.js';
import { eff } from '../../helpers/effect-tag-helper.js';
import { asTaggedGameDef } from '../../helpers/gamedef-fixtures.js';

const makeBaseDef = (actions: readonly ActionDef[]): GameDef =>
  asTaggedGameDef({
    metadata: { id: 'microturn-smoke', players: { min: 2, max: 2 } },
    seats: [{ id: '0' }, { id: '1' }],
    constants: {},
    globalVars: [{ name: 'resources', type: 'int', init: 0, min: 0, max: 10 }],
    perPlayerVars: [],
    zones: [{ id: 'board:none', owner: 'none', visibility: 'public', ordering: 'set' }],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions,
    triggers: [],
    terminal: { conditions: [] },
  });

const makeBaseState = (def: GameDef, overrides?: Partial<GameState>): GameState => ({
  globalVars: { resources: 0 },
  perPlayerVars: {},
  zoneVars: {},
  playerCount: 2,
  zones: { 'board:none': [] },
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 0,
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
  decisionStack: [],
  nextFrameId: asDecisionFrameId(0),
  nextTurnId: asTurnId(0),
  activeDeciderSeatId: resolveActiveDeciderSeatIdForPlayer(def, 0),
  ...overrides,
});

const chooseOneEffect = (bind: string, values: readonly string[]) => eff({
  chooseOne: {
    internalDecisionId: `decision:${bind}`,
    bind,
    options: { query: 'enums', values: [...values] },
  },
});

const chooseNExactEffect = (bind: string, values: readonly string[], n: number) => eff({
  chooseN: {
    internalDecisionId: `decision:${bind}`,
    bind,
    options: { query: 'enums', values: [...values] },
    n,
  },
});

describe('microturn publication', () => {
  it('publishes player-visible action-selection decisions with matching kind and projected observation', () => {
    const action: ActionDef = {
      id: asActionId('gain'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [eff({ addVar: { scope: 'global', var: 'resources', delta: 1 } })],
      limits: [],
    };
    const def = makeBaseDef([action]);
    const runtime = createGameDefRuntime(def);
    const state = makeBaseState(def);

    const microturn = publishMicroturn(def, state, runtime);
    assert.equal(microturn.kind, 'actionSelection');
    assert.equal(microturn.legalActions.length, 1);
    assert.equal(microturn.legalActions[0]?.kind, 'actionSelection');
    assert.ok(microturn.legalActions.every((entry) => entry.kind === microturn.kind));
    assert.equal(microturn.projectedState.observation !== undefined, true);

    const applied = applyDecision(def, state, microturn.legalActions[0]!, undefined, runtime);
    assert.equal(applied.state.globalVars.resources, 1);
    assert.equal(applied.state.turnCount, 0);
    assert.deepEqual(applied.state.decisionStack, []);
    assert.equal(applied.log.decisionContextKind, 'actionSelection');
    assert.equal(applied.log.turnRetired, true);
  });

  it('publishes downstream chooseOne decisions with matching kind and projected observation', () => {
    const action: ActionDef = {
      id: asActionId('choose-and-gain'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [
        chooseOneEffect('$target', ['A', 'B']),
        eff({ addVar: { scope: 'global', var: 'resources', delta: 1 } }),
      ],
      limits: [],
    };
    const def = makeBaseDef([action]);
    const runtime = createGameDefRuntime(def);
    const state = makeBaseState(def);

    const actionSelection = publishMicroturn(def, state, runtime);
    const afterActionSelection = applyDecision(def, state, actionSelection.legalActions[0]!, undefined, runtime);
    assert.equal(afterActionSelection.state.decisionStack?.length, 2);

    const chooseOne = publishMicroturn(def, afterActionSelection.state, runtime);
    assert.equal(chooseOne.kind, 'chooseOne');
    assert.equal(chooseOne.legalActions.length, 2);
    assert.ok(chooseOne.legalActions.every((entry) => entry.kind === chooseOne.kind));
    assert.equal(chooseOne.projectedState.observation !== undefined, true);

    const chosen = chooseOne.legalActions.find((entry) => entry.kind === 'chooseOne' && entry.value === 'A');
    assert.ok(chosen);

    const afterChoice = applyDecision(def, afterActionSelection.state, chosen, undefined, runtime);
    assert.equal(afterChoice.state.globalVars.resources, 1);
    assert.equal(afterChoice.state.turnCount, 0);
    assert.deepEqual(afterChoice.state.decisionStack, []);
    assert.equal(afterChoice.log.decisionContextKind, 'chooseOne');
    assert.equal(afterChoice.log.turnRetired, true);
  });

  it('auto-completes exact-cardinality chooseN selections when the final set is uniquely determined', () => {
    const action: ActionDef = {
      id: asActionId('choose-all'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [
        chooseNExactEffect('$targets', ['A', 'B', 'C'], 3),
        eff({ addVar: { scope: 'global', var: 'resources', delta: 1 } }),
      ],
      limits: [],
    };
    const def = makeBaseDef([action]);
    const runtime = createGameDefRuntime(def);
    let state = makeBaseState(def);

    const actionSelection = publishMicroturn(def, state, runtime);
    state = applyDecision(def, state, actionSelection.legalActions[0]!, undefined, runtime).state;

    assert.equal(state.globalVars.resources, 1);
    assert.equal(state.turnCount, 0);
    assert.deepEqual(state.decisionStack, []);
  });

  it('preserves auto-completed exact-cardinality bindings when later pending decisions still remain', () => {
    const action: ActionDef = {
      id: asActionId('forced-then-followup'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [
        chooseNExactEffect('$targets', ['A'], 1),
        chooseOneEffect('$followup', ['done']),
        eff({ addVar: { scope: 'global', var: 'resources', delta: 1 } }),
      ],
      limits: [],
    };
    const def = makeBaseDef([action]);
    const runtime = createGameDefRuntime(def);
    let state = makeBaseState(def);

    const actionSelection = publishMicroturn(def, state, runtime);
    state = applyDecision(def, state, actionSelection.legalActions[0]!, undefined, runtime).state;

    const followup = publishMicroturn(def, state, runtime);
    assert.equal(followup.kind, 'chooseOne');
    const accumulatedBindings = state.decisionStack?.[0]?.accumulatedBindings as Readonly<Record<string, unknown>> | undefined;
    assert.ok(
      Object.keys(accumulatedBindings ?? {}).some((key) => key.includes('$targets')),
      'expected carried root bindings to retain the auto-completed decision key',
    );

    const done = followup.legalActions.find(
      (entry) => entry.kind === 'chooseOne' && entry.value === 'done',
    );
    assert.ok(done);
    state = applyDecision(def, state, done, undefined, runtime).state;

    assert.equal(state.globalVars.resources, 1);
    assert.deepEqual(state.decisionStack, []);
  });

  it('publishes executable intermediate chooseNStep add decisions when exact-cardinality selection still has real choice', () => {
    const action: ActionDef = {
      id: asActionId('choose-two-of-three'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [
        chooseNExactEffect('$targets', ['A', 'B', 'C'], 2),
        eff({ addVar: { scope: 'global', var: 'resources', delta: 1 } }),
      ],
      limits: [],
    };
    const def = makeBaseDef([action]);
    const runtime = createGameDefRuntime(def);
    let state = makeBaseState(def);

    const actionSelection = publishMicroturn(def, state, runtime);
    state = applyDecision(def, state, actionSelection.legalActions[0]!, undefined, runtime).state;

    let chooseN = publishMicroturn(def, state, runtime);
    assert.equal(chooseN.kind, 'chooseNStep');
    assert.equal(
      chooseN.legalActions.filter((entry) => entry.kind === 'chooseNStep' && entry.command === 'add').length,
      3,
    );
    assert.equal(
      chooseN.legalActions.some((entry) => entry.kind === 'chooseNStep' && entry.command === 'confirm'),
      false,
    );

    const addA = chooseN.legalActions.find(
      (entry) => entry.kind === 'chooseNStep' && entry.command === 'add' && entry.value === 'A',
    );
    assert.ok(addA);
    state = applyDecision(def, state, addA, undefined, runtime).state;

    chooseN = publishMicroturn(def, state, runtime);
    assert.equal(chooseN.kind, 'chooseNStep');
    assert.equal(
      chooseN.legalActions.filter((entry) => entry.kind === 'chooseNStep' && entry.command === 'add').length,
      2,
    );
    assert.equal(
      chooseN.legalActions.some((entry) => entry.kind === 'chooseNStep' && entry.command === 'confirm'),
      false,
    );

    const addB = chooseN.legalActions.find(
      (entry) => entry.kind === 'chooseNStep' && entry.command === 'add' && entry.value === 'B',
    );
    assert.ok(addB);
    state = applyDecision(def, state, addB, undefined, runtime).state;

    chooseN = publishMicroturn(def, state, runtime);
    assert.equal(chooseN.kind, 'chooseNStep');
    assert.equal(
      chooseN.legalActions.filter((entry) => entry.kind === 'chooseNStep' && entry.command === 'add').length,
      0,
    );
    assert.equal(
      chooseN.legalActions.some((entry) => entry.kind === 'chooseNStep' && entry.command === 'confirm'),
      true,
    );

    const confirm = chooseN.legalActions.find(
      (entry) => entry.kind === 'chooseNStep' && entry.command === 'confirm',
    );
    assert.ok(confirm);
    const completed = applyDecision(def, state, confirm, undefined, runtime);
    assert.equal(completed.state.globalVars.resources, 1);
    assert.equal(completed.state.turnCount, 0);
    assert.deepEqual(completed.state.decisionStack, []);
    assert.equal(completed.log.decisionContextKind, 'chooseNStep');
    assert.equal(completed.log.turnRetired, true);
  });

  it('publishes downstream chooseOne decisions from suspended action-pipeline continuations', () => {
    const def = asTaggedGameDef({
      metadata: { id: 'microturn-pipeline-publication', players: { min: 2, max: 2 } },
      seats: [{ id: '0' }, { id: '1' }],
      constants: {},
      globalVars: [
        { name: 'resources', type: 'int', init: 0, min: 0, max: 10 },
      ],
      perPlayerVars: [],
      zones: [{ id: 'board:none', owner: 'none', visibility: 'public', ordering: 'set' }],
      tokenTypes: [],
      setup: [],
      turnStructure: { phases: [{ id: asPhaseId('main') }] },
      actions: [{
        id: asActionId('pipeline-choice'),
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      }],
      actionPipelines: [{
        id: 'pipeline-choice-profile',
        actionId: asActionId('pipeline-choice'),
        legality: null,
        costValidation: null,
        costEffects: [],
        targeting: {},
        atomicity: 'atomic',
        stages: [
          {
            legality: null,
            costValidation: null,
            effects: [
              chooseNExactEffect('$targetSpaces', ['kontum', 'pleiku'], 1),
            ],
          },
          {
            legality: null,
            costValidation: null,
            effects: [
              chooseOneEffect('$targetFaction', ['arvn', 'nva']),
              eff({ addVar: { scope: 'global', var: 'resources', delta: 1 } }),
            ],
          },
        ],
      }],
      triggers: [],
      terminal: { conditions: [] },
    });
    const runtime = createGameDefRuntime(def);
    let state = makeBaseState(def);

    const actionSelection = publishMicroturn(def, state, runtime);
    state = applyDecision(def, state, actionSelection.legalActions[0]!, undefined, runtime).state;

    let chooseN = publishMicroturn(def, state, runtime);
    assert.equal(chooseN.kind, 'chooseNStep');
    const addKontum = chooseN.legalActions.find(
      (entry) => entry.kind === 'chooseNStep' && entry.command === 'add' && entry.value === 'kontum',
    );
    assert.ok(addKontum);
    state = applyDecision(def, state, addKontum, undefined, runtime).state;

    chooseN = publishMicroturn(def, state, runtime);
    const confirm = chooseN.legalActions.find(
      (entry) => entry.kind === 'chooseNStep' && entry.command === 'confirm',
    );
    assert.ok(confirm);
    state = applyDecision(def, state, confirm, undefined, runtime).state;

    const chooseOne = publishMicroturn(def, state, runtime);
    assert.equal(chooseOne.kind, 'chooseOne');
    assert.equal(chooseOne.legalActions.length, 2);
    assert.ok(chooseOne.legalActions.every((entry) => entry.kind === 'chooseOne'));
  });

  it('filters resumed chooseOne continuations that would throw at execution time', () => {
    const def = asTaggedGameDef({
      metadata: { id: 'microturn-publication-invalid-resume-option', players: { min: 2, max: 2 } },
      seats: [{ id: '0' }, { id: '1' }],
      constants: {},
      globalVars: [],
      perPlayerVars: [],
      zones: [
        { id: 'city:none', owner: 'none', visibility: 'public', ordering: 'set', category: 'city' },
        { id: 'loc-road:none', owner: 'none', visibility: 'public', ordering: 'set', category: 'loc' },
        { id: 'available-ARVN:none', owner: 'none', visibility: 'public', ordering: 'set' },
      ],
      tokenTypes: [{ id: 'base', props: { faction: 'string', type: 'string' } }],
      setup: [],
      turnStructure: { phases: [{ id: asPhaseId('main') }] },
      stackingConstraints: [{
        id: 'no-bases-on-locs',
        description: 'Bases may not occupy LoCs',
        spaceFilter: { category: ['loc'] },
        pieceFilter: { pieceTypeIds: ['base'] },
        rule: 'prohibit',
      }],
      actions: [{
        id: asActionId('place-base'),
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [
          chooseOneEffect('$targetSpace', ['city:none', 'loc-road:none']),
          eff({
            forEach: {
              bind: '$piece',
              over: {
                query: 'tokensInZone',
                zone: 'available-ARVN:none',
                filter: {
                  op: 'and',
                  args: [
                    { prop: 'faction', op: 'eq', value: 'ARVN' },
                    { prop: 'type', op: 'eq', value: 'base' },
                  ],
                },
              },
              limit: 1,
              effects: [
                eff({
                  moveToken: {
                    token: '$piece',
                    from: 'available-ARVN:none',
                    to: '$targetSpace',
                  },
                }),
              ],
            },
          }),
        ],
        limits: [],
      }],
      triggers: [],
      terminal: { conditions: [] },
    });
    const runtime = createGameDefRuntime(def);
    let state = makeBaseState(def, {
      zones: {
        'board:none': [],
        'city:none': [],
        'loc-road:none': [],
        'available-ARVN:none': [{ id: asTokenId('arvn-base-1'), type: 'base', props: { faction: 'ARVN', type: 'base' } }],
      },
    });

    const actionSelection = publishMicroturn(def, state, runtime);
    state = applyDecision(def, state, actionSelection.legalActions[0]!, undefined, runtime).state;

    const chooseOne = publishMicroturn(def, state, runtime);
    assert.equal(chooseOne.kind, 'chooseOne');
    assert.deepEqual(
      chooseOne.legalActions.map((entry) => entry.kind === 'chooseOne' ? entry.value : null),
      ['city:none'],
    );
  });

  it('publishes kernel-owned turnRetirement decisions without a player projection', () => {
    const def = makeBaseDef([]);
    const runtime = createGameDefRuntime(def);
    const retirementFrame: DecisionStackFrame = {
      frameId: asDecisionFrameId(0),
      parentFrameId: null,
      turnId: asTurnId(0),
      context: {
        kind: 'turnRetirement',
        seatId: '__kernel',
        retiringTurnId: asTurnId(0),
      },
      accumulatedBindings: {},
      effectFrame: {
        programCounter: 0,
        boundedIterationCursors: {},
        localBindings: {},
        pendingTriggerQueue: [],
      },
    };
    const state = makeBaseState(def, {
      decisionStack: [retirementFrame],
      activeDeciderSeatId: '__kernel',
    });

    const microturn = publishMicroturn(def, state, runtime);
    assert.equal(microturn.kind, 'turnRetirement');
    assert.ok(microturn.legalActions.every((entry) => entry.kind === microturn.kind));
    assert.equal(microturn.projectedState.observation, undefined);

    const applied = applyDecision(def, state, microturn.legalActions[0]!, undefined, runtime);
    assert.equal(applied.state.turnCount, 1);
    assert.equal(applied.state.activePlayer, asPlayerId(1));
    assert.deepEqual(applied.state.decisionStack, []);
    assert.equal(applied.log.turnRetired, true);
  });

  it('throws a permanent stochastic distribution invariant when publication cannot derive a single-bind frontier', () => {
    assert.throws(
      () => toStochasticDecisionStackContext({
        move: { actionId: asActionId('gain'), params: {} },
        complete: false,
        warnings: [],
        stochasticDecision: {
          kind: 'pendingStochastic',
          complete: false,
          source: 'rollRandom',
          alternatives: [],
          outcomes: [
            { bindings: { '$left': 'A', '$right': 'B' } },
          ],
        },
      }),
      /MICROTURN_STOCHASTIC_DISTRIBUTION_REQUIRES_SINGLE_BIND/,
    );
  });

  it('throws a permanent apply-side contract error for unsupported decision kinds', () => {
    const action: ActionDef = {
      id: asActionId('gain'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [eff({ addVar: { scope: 'global', var: 'resources', delta: 1 } })],
      limits: [],
    };
    const def = makeBaseDef([action]);
    const runtime = createGameDefRuntime(def);
    const state = makeBaseState(def);
    const microturn = publishMicroturn(def, state, runtime);

    assert.throws(
      () => applyPublishedDecision(def, state, microturn, { kind: 'badKind' } as never, undefined, runtime),
      /MICROTURN_DECISION_KIND_UNSUPPORTED/,
    );
  });
});
