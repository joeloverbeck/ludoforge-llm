// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyDecision,
  asActionId,
  asTokenId,
  asDecisionFrameId,
  asPhaseId,
  asPlayerId,
  asTurnId,
  createGameDefRuntime,
  deserializeGameState,
  publishMicroturn,
  resolveActiveDeciderSeatIdForPlayer,
  serializeGameState,
  type ActionDef,
  type Decision,
  type GameDef,
  type GameState,
  type MicroturnState,
} from '../../../src/kernel/index.js';
import { eff } from '../../helpers/effect-tag-helper.js';
import { asTaggedGameDef } from '../../helpers/gamedef-fixtures.js';
import { validateCompoundTurnInventory } from '../../fixtures/spec-140-compound-turn-shapes/validate.js';

const makeBaseDef = (actions: readonly ActionDef[]): GameDef =>
  asTaggedGameDef({
    metadata: { id: 'microturn-effect-frame-suspend-resume', players: { min: 2, max: 2 } },
    seats: [{ id: '0' }, { id: '1' }],
    constants: {},
    globalVars: [
      { name: 'kontumCount', type: 'int', init: 0, min: 0, max: 10 },
      { name: 'pleikuCount', type: 'int', init: 0, min: 0, max: 10 },
      { name: 'postSelectionEffect', type: 'int', init: 0, min: 0, max: 10 },
    ],
    perPlayerVars: [],
    zones: [{ id: 'board:none', owner: 'none', visibility: 'public', ordering: 'set' }],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions,
    triggers: [],
    terminal: { conditions: [] },
  });

const makeBaseState = (def: GameDef): GameState => ({
  globalVars: { kontumCount: 0, pleikuCount: 0, postSelectionEffect: 0 },
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
});

const chooseNSteps = (microturn: ReturnType<typeof publishMicroturn>): readonly Extract<Decision, { readonly kind: 'chooseNStep' }>[] =>
  microturn.legalActions.filter((action): action is Extract<Decision, { readonly kind: 'chooseNStep' }> => action.kind === 'chooseNStep');

const requireChooseNStepMicroturn = (microturn: MicroturnState): MicroturnState & {
  readonly kind: 'chooseNStep';
  readonly decisionContext: Extract<MicroturnState['decisionContext'], { readonly kind: 'chooseNStep' }>;
} => {
  assert.equal(microturn.kind, 'chooseNStep');
  return microturn as MicroturnState & {
    readonly kind: 'chooseNStep';
    readonly decisionContext: Extract<MicroturnState['decisionContext'], { readonly kind: 'chooseNStep' }>;
  };
};

const requireDecision = (
  microturn: ReturnType<typeof publishMicroturn>,
  predicate: (decision: Decision) => boolean,
): Decision => {
  const decision = microturn.legalActions.find(predicate);
  assert.ok(decision, 'expected matching published decision');
  return decision;
};

const makePrototypeAction = (): ActionDef => ({
  id: asActionId('outer-zone-choice'),
  actor: 'active',
  executor: 'actor',
  phase: [asPhaseId('main')],
  params: [],
  pre: null,
  cost: [],
  effects: [
    eff({
      chooseOne: {
        internalDecisionId: 'decision:$zoneSet',
        bind: '$zoneSet',
        options: { query: 'enums', values: ['highlands', 'delta'] },
      },
    }),
    eff({
      if: {
        when: { op: '==', left: { _t: 2 as const, ref: 'binding', name: '$zoneSet' }, right: 'highlands' },
        then: [
          eff({
            forEach: {
              bind: '$zone',
              over: { query: 'enums', values: ['kontum', 'pleiku'] },
              effects: [
                eff({
                  if: {
                    when: { op: '==', left: { _t: 2 as const, ref: 'binding', name: '$zone' }, right: 'kontum' },
                    then: [
                      eff({
                        chooseN: {
                          internalDecisionId: 'decision:$selectedKontum',
                          bind: '$selectedKontum',
                          options: { query: 'enums', values: ['k-guerrilla-a', 'k-guerrilla-b', 'k-guerrilla-c'] },
                          min: 1,
                          max: 3,
                        },
                      }),
                      eff({ addVar: { scope: 'global', var: 'kontumCount', delta: 1 } }),
                    ],
                    else: [
                      eff({
                        chooseN: {
                          internalDecisionId: 'decision:$selectedPleiku',
                          bind: '$selectedPleiku',
                          options: { query: 'enums', values: ['p-guerrilla-a', 'p-guerrilla-b', 'p-guerrilla-c'] },
                          min: 1,
                          max: 3,
                        },
                      }),
                      eff({ addVar: { scope: 'global', var: 'pleikuCount', delta: 1 } }),
                    ],
                  },
                }),
              ],
            },
          }),
        ],
        else: [
          eff({ addVar: { scope: 'global', var: 'postSelectionEffect', delta: 9 } }),
        ],
      },
    }),
    eff({ addVar: { scope: 'global', var: 'postSelectionEffect', delta: 1 } }),
  ],
  limits: [],
});

test('validates the spec-140 FITL compound-turn inventory fixture', () => {
  const entries = validateCompoundTurnInventory();
  assert.ok(entries.length >= 100, 'inventory should cover the full live FITL compound-turn surface');
});

test('suspends and resumes effect frames across outer chooseOne and nested chooseN frames', () => {
  const def = makeBaseDef([makePrototypeAction()]);
  const runtime = createGameDefRuntime(def);
  let state = makeBaseState(def);

  const initialActionSelection = publishMicroturn(def, state, runtime);
  assert.equal(initialActionSelection.kind, 'actionSelection');

  state = applyDecision(def, state, initialActionSelection.legalActions[0]!, undefined, runtime).state;
  const outerChoice = publishMicroturn(def, state, runtime);
  assert.equal(outerChoice.kind, 'chooseOne');
  assert.equal(state.decisionStack?.[0]?.context.kind, 'actionSelection');
  assert.equal(state.decisionStack?.[1]?.context.kind, 'chooseOne');
  assert.equal(state.decisionStack?.[1]?.parentFrameId, state.decisionStack?.[0]?.frameId ?? null);

  const chooseHighlands = requireDecision(
    outerChoice,
    (decision) => decision.kind === 'chooseOne' && decision.value === 'highlands',
  );
  state = applyDecision(def, state, chooseHighlands, undefined, runtime).state;
  assert.equal(state.decisionStack?.[1]?.parentFrameId, state.decisionStack?.[0]?.frameId ?? null);
  assert.ok(state.decisionStack?.[1]?.effectFrame.suspendedFrame, 'nested chooseN should retain a suspended effect frame through the enclosing if/forEach path');

  let firstChooseN = requireChooseNStepMicroturn(publishMicroturn(def, state, runtime));
  assert.match(String(firstChooseN.decisionContext.decisionKey), /\$selectedKontum/);
  assert.deepEqual(firstChooseN.decisionContext.selectedSoFar, []);

  const roundTripped = deserializeGameState(serializeGameState(state));
  assert.deepEqual(roundTripped, state);
  assert.equal(roundTripped.stateHash, state.stateHash);

  const kontumAddA = requireDecision(
    firstChooseN,
    (decision) => decision.kind === 'chooseNStep' && decision.command === 'add' && decision.value === 'k-guerrilla-a',
  );
  state = applyDecision(def, state, kontumAddA, undefined, runtime).state;
  firstChooseN = requireChooseNStepMicroturn(publishMicroturn(def, state, runtime));
  assert.deepEqual(firstChooseN.decisionContext.selectedSoFar, ['k-guerrilla-a']);

  const kontumAddB = requireDecision(
    firstChooseN,
    (decision) => decision.kind === 'chooseNStep' && decision.command === 'add' && decision.value === 'k-guerrilla-b',
  );
  state = applyDecision(def, state, kontumAddB, undefined, runtime).state;
  firstChooseN = requireChooseNStepMicroturn(publishMicroturn(def, state, runtime));
  assert.deepEqual(firstChooseN.decisionContext.selectedSoFar, ['k-guerrilla-a', 'k-guerrilla-b']);
  assert.ok(chooseNSteps(firstChooseN).some((decision) => decision.command === 'confirm'));

  const kontumConfirm = requireDecision(
    firstChooseN,
    (decision) => decision.kind === 'chooseNStep' && decision.command === 'confirm',
  );
  state = applyDecision(def, state, kontumConfirm, undefined, runtime).state;
  assert.equal(state.decisionStack?.[1]?.parentFrameId, state.decisionStack?.[0]?.frameId ?? null);

  const pleikuChooseN = requireChooseNStepMicroturn(publishMicroturn(def, state, runtime));
  assert.match(String(pleikuChooseN.decisionContext.decisionKey), /\$selectedPleiku/);
  assert.deepEqual(state.globalVars, { kontumCount: 0, pleikuCount: 0, postSelectionEffect: 0 });

  const pleikuAdd = requireDecision(
    pleikuChooseN,
    (decision) => decision.kind === 'chooseNStep' && decision.command === 'add' && decision.value === 'p-guerrilla-a',
  );
  state = applyDecision(def, state, pleikuAdd, undefined, runtime).state;
  const pleikuAfterAdd = requireChooseNStepMicroturn(publishMicroturn(def, state, runtime));
  const pleikuConfirm = requireDecision(
    pleikuAfterAdd,
    (decision) => decision.kind === 'chooseNStep' && decision.command === 'confirm',
  );
  state = applyDecision(def, state, pleikuConfirm, undefined, runtime).state;

  assert.deepEqual(state.globalVars, {
    kontumCount: 1,
    pleikuCount: 1,
    postSelectionEffect: 1,
  });
  assert.equal(state.turnCount, 0);
  assert.deepEqual(state.decisionStack, []);
});

test('resumes sibling token effects after chooseOne inside forEach without replaying the earlier loop state', () => {
  const def = asTaggedGameDef({
    metadata: { id: 'microturn-token-suspend-resume', players: { min: 2, max: 2 } },
    seats: [{ id: '0' }, { id: '1' }],
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [
      { id: 'source:none', owner: 'none', visibility: 'public', ordering: 'stack' },
      { id: 'dest-a:none', owner: 'none', visibility: 'public', ordering: 'stack' },
      { id: 'dest-b:none', owner: 'none', visibility: 'public', ordering: 'stack' },
    ],
    tokenTypes: [{ id: 'piece', props: { marked: 'boolean' } }],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [{
      id: asActionId('move-and-mark'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [
        eff({
          forEach: {
            bind: '$token',
            over: { query: 'tokensInZone', zone: 'source:none' },
            effects: [
              eff({
                chooseOne: {
                  internalDecisionId: 'decision:$destination',
                  bind: '$destination',
                  options: { query: 'enums', values: ['dest-a:none', 'dest-b:none'] },
                },
              }),
              eff({
                moveToken: {
                  token: '$token',
                  from: { zoneExpr: { _t: 2 as const, ref: 'tokenZone', token: '$token' } },
                  to: '$destination',
                },
              }),
              eff({
                setTokenProp: {
                  token: '$token',
                  prop: 'marked',
                  value: true,
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
  let state: GameState = {
    globalVars: {},
    perPlayerVars: {},
    zoneVars: {},
    playerCount: 2,
    zones: {
      'source:none': [{ id: asTokenId('tok_piece_0'), type: 'piece', props: { marked: false } }],
      'dest-a:none': [],
      'dest-b:none': [],
    },
    nextTokenOrdinal: 1,
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
  };

  const actionSelection = publishMicroturn(def, state, runtime);
  state = applyDecision(def, state, actionSelection.legalActions[0]!, undefined, runtime).state;

  const destinationChoice = publishMicroturn(def, state, runtime);
  const chooseDestA = requireDecision(
    destinationChoice,
    (decision) => decision.kind === 'chooseOne' && decision.value === 'dest-a:none',
  );
  state = applyDecision(def, state, chooseDestA, undefined, runtime).state;

  assert.deepEqual(state.zones['source:none'], []);
  assert.equal(state.zones['dest-a:none']?.length, 1);
  assert.equal(state.zones['dest-a:none']?.[0]?.id, 'tok_piece_0');
  assert.equal(state.zones['dest-a:none']?.[0]?.props.marked, true);
  assert.equal(state.turnCount, 0);
  assert.deepEqual(state.decisionStack, []);
});

test('resumes through nested let scopes and preserves exported bindings after chooseOne', () => {
  const def = makeBaseDef([{
    id: asActionId('nested-let-choice'),
    actor: 'active',
    executor: 'actor',
    phase: [asPhaseId('main')],
    params: [],
    pre: null,
    cost: [],
    effects: [
      eff({
        let: {
          bind: '$outer',
          value: 'alpha',
          in: [
            eff({
              let: {
                bind: '$inner',
                value: 'beta',
                in: [
                  eff({
                    chooseOne: {
                      internalDecisionId: 'decision:$target',
                      bind: '$target',
                      options: { query: 'enums', values: ['kontum', 'pleiku'] },
                    },
                  }),
                ],
              },
            }),
            eff({
              if: {
                when: { op: '==', left: { _t: 2 as const, ref: 'binding', name: '$target' }, right: 'pleiku' },
                then: [eff({ setVar: { scope: 'global', var: 'kontumCount', value: 2 } })],
                else: [eff({ setVar: { scope: 'global', var: 'kontumCount', value: 1 } })],
              },
            }),
          ],
        },
      }),
      eff({ setVar: { scope: 'global', var: 'pleikuCount', value: 1 } }),
      eff({ setVar: { scope: 'global', var: 'postSelectionEffect', value: 1 } }),
    ],
    limits: [],
  }]);
  const runtime = createGameDefRuntime(def);
  let state = makeBaseState(def);

  const actionSelection = publishMicroturn(def, state, runtime);
  state = applyDecision(def, state, actionSelection.legalActions[0]!, undefined, runtime).state;

  const targetChoice = publishMicroturn(def, state, runtime);
  const choosePleiku = requireDecision(
    targetChoice,
    (decision) => decision.kind === 'chooseOne' && decision.value === 'pleiku',
  );
  state = applyDecision(def, state, choosePleiku, undefined, runtime).state;

  assert.deepEqual(state.globalVars, {
    kontumCount: 2,
    pleikuCount: 1,
    postSelectionEffect: 1,
  });
  assert.equal(state.turnCount, 0);
  assert.deepEqual(state.decisionStack, []);
});

test('resumes later action-pipeline stages after an earlier chooseN stage completes', () => {
  const def = asTaggedGameDef({
    metadata: { id: 'microturn-pipeline-suspend-resume', players: { min: 2, max: 2 } },
    seats: [{ id: '0' }, { id: '1' }],
    constants: {},
    globalVars: [
      { name: 'kontumCount', type: 'int', init: 0, min: 0, max: 10 },
      { name: 'pleikuCount', type: 'int', init: 0, min: 0, max: 10 },
      { name: 'postSelectionEffect', type: 'int', init: 0, min: 0, max: 10 },
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
            eff({
              chooseN: {
                internalDecisionId: 'decision:$targetSpaces',
                bind: '$targetSpaces',
                options: { query: 'enums', values: ['kontum', 'pleiku'] },
                min: 1,
                max: 1,
              },
            }),
          ],
        },
        {
          legality: null,
          costValidation: null,
          effects: [
            eff({
              chooseOne: {
                internalDecisionId: 'decision:$targetFaction',
                bind: '$targetFaction',
                options: { query: 'enums', values: ['arvn', 'nva'] },
              },
            }),
            eff({
              if: {
                when: { op: '==', left: { _t: 2 as const, ref: 'binding', name: '$targetFaction' }, right: 'nva' },
                then: [eff({ setVar: { scope: 'global', var: 'kontumCount', value: 2 } })],
                else: [eff({ setVar: { scope: 'global', var: 'kontumCount', value: 1 } })],
              },
            }),
          ],
        },
        {
          legality: null,
          costValidation: null,
          effects: [
            eff({ setVar: { scope: 'global', var: 'pleikuCount', value: 1 } }),
            eff({ setVar: { scope: 'global', var: 'postSelectionEffect', value: 1 } }),
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

  let chooseTargetSpace = requireChooseNStepMicroturn(publishMicroturn(def, state, runtime));
  const addKontum = requireDecision(
    chooseTargetSpace,
    (decision) => decision.kind === 'chooseNStep' && decision.command === 'add' && decision.value === 'kontum',
  );
  state = applyDecision(def, state, addKontum, undefined, runtime).state;
  chooseTargetSpace = requireChooseNStepMicroturn(publishMicroturn(def, state, runtime));
  const confirmTargetSpace = requireDecision(
    chooseTargetSpace,
    (decision) => decision.kind === 'chooseNStep' && decision.command === 'confirm',
  );
  state = applyDecision(def, state, confirmTargetSpace, undefined, runtime).state;

  const chooseFaction = publishMicroturn(def, state, runtime);
  assert.equal(chooseFaction.kind, 'chooseOne');
  const chooseNva = requireDecision(
    chooseFaction,
    (decision) => decision.kind === 'chooseOne' && decision.value === 'nva',
  );
  state = applyDecision(def, state, chooseNva, undefined, runtime).state;

  assert.deepEqual(state.globalVars, {
    kontumCount: 2,
    pleikuCount: 1,
    postSelectionEffect: 1,
  });
  assert.equal(state.turnCount, 0);
  assert.deepEqual(state.decisionStack, []);
});

test('preserves outer pipeline tails when a resumed chooseOne leads to a nested chooseN', () => {
  const def = asTaggedGameDef({
    metadata: { id: 'microturn-pipeline-nested-tail-resume', players: { min: 2, max: 2 } },
    seats: [{ id: '0' }, { id: '1' }],
    constants: {},
    globalVars: [
      { name: 'kontumCount', type: 'int', init: 0, min: 0, max: 10 },
      { name: 'pleikuCount', type: 'int', init: 0, min: 0, max: 10 },
      { name: 'postSelectionEffect', type: 'int', init: 0, min: 0, max: 10 },
    ],
    perPlayerVars: [],
    zones: [{ id: 'board:none', owner: 'none', visibility: 'public', ordering: 'set' }],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [{
      id: asActionId('pipeline-nested-tail-choice'),
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
      id: 'pipeline-nested-tail-choice-profile',
      actionId: asActionId('pipeline-nested-tail-choice'),
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
            eff({
              chooseN: {
                internalDecisionId: 'decision:$targetSpaces',
                bind: '$targetSpaces',
                options: { query: 'enums', values: ['kontum'] },
                min: 1,
                max: 1,
              },
            }),
          ],
        },
        {
          legality: null,
          costValidation: null,
          effects: [
            eff({
              chooseOne: {
                internalDecisionId: 'decision:$targetMode',
                bind: '$targetMode',
                options: { query: 'enums', values: ['rangers'] },
              },
            }),
            eff({
              let: {
                bind: '$remaining',
                value: 1,
                in: [
                  eff({
                    if: {
                      when: { op: '>', left: { _t: 2 as const, ref: 'binding', name: '$remaining' }, right: 0 },
                      then: [
                        eff({
                          chooseN: {
                            internalDecisionId: 'decision:$sourceSpaces',
                            bind: '$sourceSpaces',
                            options: { query: 'enums', values: ['reserve'] },
                            min: 0,
                            max: 1,
                          },
                        }),
                      ],
                    },
                  }),
                ],
              },
            }),
          ],
        },
        {
          legality: null,
          costValidation: null,
          effects: [
            eff({
              chooseN: {
                internalDecisionId: 'decision:$followUpSpaces',
                bind: '$followUpSpaces',
                options: { query: 'binding', name: '$targetSpaces' },
                min: 0,
                max: 1,
              },
            }),
            eff({ setVar: { scope: 'global', var: 'postSelectionEffect', value: 1 } }),
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

  const chooseMode = publishMicroturn(def, state, runtime);
  assert.equal(chooseMode.kind, 'chooseOne');
  const chooseRangers = requireDecision(
    chooseMode,
    (decision) => decision.kind === 'chooseOne' && decision.value === 'rangers',
  );
  state = applyDecision(def, state, chooseRangers, undefined, runtime).state;

  let chooseSourceSpaces = requireChooseNStepMicroturn(publishMicroturn(def, state, runtime));
  const confirmSourceSpaces = requireDecision(
    chooseSourceSpaces,
    (decision) => decision.kind === 'chooseNStep' && decision.command === 'confirm',
  );
  state = applyDecision(def, state, confirmSourceSpaces, undefined, runtime).state;

  const chooseFollowUp = requireChooseNStepMicroturn(publishMicroturn(def, state, runtime));
  assert.match(String(chooseFollowUp.decisionContext.decisionKey), /\$followUpSpaces/);
  const confirmFollowUp = requireDecision(
    chooseFollowUp,
    (decision) => decision.kind === 'chooseNStep' && decision.command === 'confirm',
  );
  state = applyDecision(def, state, confirmFollowUp, undefined, runtime).state;

  assert.equal(state.globalVars.postSelectionEffect, 1);
  assert.equal(state.turnCount, 0);
  assert.deepEqual(state.decisionStack, []);
});
