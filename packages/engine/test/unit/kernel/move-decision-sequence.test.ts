import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asZoneId,
  isMoveDecisionSequenceSatisfiable,
  pickDeterministicChoiceValue,
  resolveMoveDecisionSequence,
  type ChoicePendingRequest,
  type ActionDef,
  type ActionPipelineDef,
  type GameDef,
  type GameState,
  type Move,
} from '../../../src/kernel/index.js';

const makeBaseDef = (overrides?: {
  actions?: readonly ActionDef[];
  actionPipelines?: readonly ActionPipelineDef[];
}): GameDef =>
  ({
    metadata: { id: 'move-decision-sequence-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [{ id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set' }],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: overrides?.actions ?? [],
    actionPipelines: overrides?.actionPipelines,
    triggers: [],
    terminal: { conditions: [] },
  }) as unknown as GameDef;

const makeBaseState = (overrides?: Partial<GameState>): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  playerCount: 2,
  zones: { 'board:none': [] },
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
  stateHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
  ...overrides,
});

const makeMove = (actionId: string): Move => ({
  actionId: asActionId(actionId),
  params: {},
});

describe('move decision sequence helpers', () => {
  it('completes a satisfiable chooseOne decision sequence using default chooser', () => {
    const action: ActionDef = {
      id: asActionId('choose-one-op'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const profile: ActionPipelineDef = {
      id: 'choose-one-profile',
      actionId: asActionId('choose-one-op'),
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [
        {
          effects: [
            {
              chooseOne: {
                internalDecisionId: 'decision:$target',
                bind: '$target',
                options: { query: 'enums', values: ['a', 'b'] },
              },
            } as GameDef['actions'][number]['effects'][number],
          ],
        },
      ],
      atomicity: 'partial',
    };

    const def = makeBaseDef({ actions: [action], actionPipelines: [profile] });
    const result = resolveMoveDecisionSequence(def, makeBaseState(), makeMove('choose-one-op'));
    assert.equal(result.complete, true);
    assert.equal(result.move.params['decision:$target'], 'a');
  });

  it('default chooser follows canonical legality precedence', () => {
    const request: ChoicePendingRequest = {
      kind: 'pending',
      complete: false,
      decisionId: 'decision:$mode',
      name: '$mode',
      type: 'chooseOne',
      options: [
        { value: 'unknown', legality: 'unknown', illegalReason: null },
        { value: 'legal', legality: 'legal', illegalReason: null },
        { value: 'illegal', legality: 'illegal', illegalReason: null },
      ],
      targetKinds: [],
    };

    assert.equal(pickDeterministicChoiceValue(request), 'legal');
  });

  it('returns incomplete for unsatisfiable chooseN', () => {
    const action: ActionDef = {
      id: asActionId('unsat-op'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const profile: ActionPipelineDef = {
      id: 'unsat-profile',
      actionId: asActionId('unsat-op'),
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [
        {
          effects: [
            {
              chooseN: {
                internalDecisionId: 'decision:$targets',
                bind: '$targets',
                options: { query: 'enums', values: [] },
                min: 1,
                max: 1,
              },
            } as GameDef['actions'][number]['effects'][number],
          ],
        },
      ],
      atomicity: 'partial',
    };

    const def = makeBaseDef({ actions: [action], actionPipelines: [profile] });
    const result = resolveMoveDecisionSequence(def, makeBaseState(), makeMove('unsat-op'));
    assert.equal(result.complete, false);
    assert.equal(result.nextDecision?.name, '$targets');
    assert.equal(result.nextDecision?.type, 'chooseN');
    assert.equal(result.nextDecision?.options.length ?? 0, 0);
    assert.equal(result.nextDecision?.min, 1);
    assert.equal(isMoveDecisionSequenceSatisfiable(def, makeBaseState(), makeMove('unsat-op')), false);
  });

  it('reports satisfiable when at least one downstream branch can complete', () => {
    const action: ActionDef = {
      id: asActionId('branching-op'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const profile: ActionPipelineDef = {
      id: 'branching-profile',
      actionId: asActionId('branching-op'),
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [
        {
          effects: [
            {
              chooseOne: {
                internalDecisionId: 'decision:$mode',
                bind: '$mode',
                options: { query: 'enums', values: ['trap', 'safe'] },
              },
            } as GameDef['actions'][number]['effects'][number],
            {
              if: {
                when: { op: '==', left: { ref: 'binding', name: '$mode' }, right: 'trap' },
                then: [
                  {
                    chooseOne: {
                      internalDecisionId: 'decision:$trapChoice',
                      bind: '$trapChoice',
                      options: { query: 'enums', values: [] },
                    },
                  } as GameDef['actions'][number]['effects'][number],
                ],
                else: [
                  {
                    chooseOne: {
                      internalDecisionId: 'decision:$safeChoice',
                      bind: '$safeChoice',
                      options: { query: 'enums', values: ['ok'] },
                    },
                  } as GameDef['actions'][number]['effects'][number],
                ],
              },
            } as GameDef['actions'][number]['effects'][number],
          ],
        },
      ],
      atomicity: 'partial',
    };

    const def = makeBaseDef({ actions: [action], actionPipelines: [profile] });
    const state = makeBaseState();

    assert.equal(resolveMoveDecisionSequence(def, state, makeMove('branching-op')).complete, false);
    assert.equal(isMoveDecisionSequenceSatisfiable(def, state, makeMove('branching-op')), true);
  });

  it('respects custom chooser for decision sequence completion', () => {
    const action: ActionDef = {
      id: asActionId('custom-choose-op'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const profile: ActionPipelineDef = {
      id: 'custom-choose-profile',
      actionId: asActionId('custom-choose-op'),
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [
        {
          effects: [
            {
              chooseOne: {
                internalDecisionId: 'decision:$target',
                bind: '$target',
                options: { query: 'enums', values: ['a', 'b', 'c'] },
              },
            } as GameDef['actions'][number]['effects'][number],
          ],
        },
      ],
      atomicity: 'partial',
    };

    const def = makeBaseDef({ actions: [action], actionPipelines: [profile] });
    const result = resolveMoveDecisionSequence(def, makeBaseState(), makeMove('custom-choose-op'), {
      choose: (request) => request.options[2]?.value,
    });
    assert.equal(result.complete, true);
    assert.equal(result.move.params['decision:$target'], 'c');
  });

  it('returns incomplete with warning when decision probe step budget is exceeded', () => {
    const action: ActionDef = {
      id: asActionId('stuck-op'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const profile: ActionPipelineDef = {
      id: 'stuck-profile',
      actionId: asActionId('stuck-op'),
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [
        {
          effects: [
            {
              chooseOne: {
                internalDecisionId: 'decision:$target',
                bind: '$target',
                options: { query: 'enums', values: ['a'] },
              },
            } as GameDef['actions'][number]['effects'][number],
          ],
        },
      ],
      atomicity: 'partial',
    };

    const def = makeBaseDef({ actions: [action], actionPipelines: [profile] });
    const result = resolveMoveDecisionSequence(def, makeBaseState(), makeMove('stuck-op'), {
      budgets: { maxDecisionProbeSteps: 0 },
    });
    assert.equal(result.complete, false);
    assert.equal(result.nextDecision, undefined);
    assert.equal(result.warnings.some((warning) => warning.code === 'MOVE_ENUM_DECISION_PROBE_STEP_BUDGET_EXCEEDED'), true);
  });

  it('returns incomplete with warning when deferred predicate budget is exceeded', () => {
    const action: ActionDef = {
      id: asActionId('deferred-op'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const profile: ActionPipelineDef = {
      id: 'deferred-profile',
      actionId: asActionId('deferred-op'),
      legality: { op: '==', left: { ref: 'binding', name: '$missing' }, right: 1 },
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [{ effects: [] }],
      atomicity: 'partial',
    };

    const result = resolveMoveDecisionSequence(
      makeBaseDef({ actions: [action], actionPipelines: [profile] }),
      makeBaseState(),
      makeMove('deferred-op'),
      {
        budgets: { maxDeferredPredicates: 0 },
      },
    );

    assert.equal(result.complete, false);
    assert.equal(result.warnings.some((warning) => warning.code === 'MOVE_ENUM_DEFERRED_PREDICATE_BUDGET_EXCEEDED'), true);
  });

  it('discovers nested templated decision ids in deterministic order', () => {
    const action: ActionDef = {
      id: asActionId('nested-op'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const profile: ActionPipelineDef = {
      id: 'nested-profile',
      actionId: asActionId('nested-op'),
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [
        {
          effects: [
            {
              forEach: {
                over: { query: 'enums', values: ['north', 'south'] },
                bind: '$region',
                effects: [
                  {
                    chooseOne: {
                      internalDecisionId: 'decision:$mode@{$region}',
                      bind: '$mode@{$region}',
                      options: { query: 'enums', values: ['a', 'b'] },
                    },
                  },
                ],
              },
            } as GameDef['actions'][number]['effects'][number],
          ],
        },
      ],
      atomicity: 'partial',
    };

    const def = makeBaseDef({ actions: [action], actionPipelines: [profile] });
    const selectedDecisionIds: string[] = [];
    const result = resolveMoveDecisionSequence(def, makeBaseState(), makeMove('nested-op'), {
      choose: (request) => {
        selectedDecisionIds.push(request.decisionId);
        return request.options[1]?.value;
      },
    });

    assert.equal(result.complete, true);
    assert.deepEqual(selectedDecisionIds, [
      'decision:$mode@{$region}::$mode@north',
      'decision:$mode@{$region}::$mode@south',
    ]);
    assert.equal(result.move.params['decision:$mode@{$region}::$mode@north'], 'b');
    assert.equal(result.move.params['decision:$mode@{$region}::$mode@south'], 'b');
  });

  it('throws for malformed decision-path expressions instead of treating them as unsatisfiable', () => {
    const action: ActionDef = {
      id: asActionId('broken-decision-op'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const profile: ActionPipelineDef = {
      id: 'broken-decision-profile',
      actionId: asActionId('broken-decision-op'),
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [
        {
          effects: [
            {
              if: {
                when: { op: '==', left: { ref: 'gvar', var: 'missingVar' }, right: 1 },
                then: [],
              },
            } as GameDef['actions'][number]['effects'][number],
          ],
        },
      ],
      atomicity: 'partial',
    };

    const def = makeBaseDef({ actions: [action], actionPipelines: [profile] });
    const state = makeBaseState();
    const move = makeMove('broken-decision-op');

    assert.throws(() => isMoveDecisionSequenceSatisfiable(def, state, move));
  });

  it('applies free-operation zone filters at decision checkpoints for template moves', () => {
    const action: ActionDef = {
      id: asActionId('operation'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const profile: ActionPipelineDef = {
      id: 'operation-profile',
      actionId: asActionId('operation'),
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [
        {
          effects: [
            {
              chooseOne: {
                internalDecisionId: 'decision:$zone',
                bind: '$zone',
                options: { query: 'zones' },
              },
            } as GameDef['actions'][number]['effects'][number],
          ],
        },
      ],
      atomicity: 'partial',
    };

    const def: GameDef = {
      ...makeBaseDef({ actions: [action], actionPipelines: [profile] }),
      zones: [
        { id: asZoneId('board:cambodia'), owner: 'none', visibility: 'public', ordering: 'set', category: 'province', attributes: { population: 1, econ: 0, terrainTags: [], country: 'cambodia', coastal: false }, adjacentTo: [] },
        { id: asZoneId('board:vietnam'), owner: 'none', visibility: 'public', ordering: 'set', category: 'province', attributes: { population: 1, econ: 0, terrainTags: [], country: 'southVietnam', coastal: false }, adjacentTo: [] },
      ],
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: { factions: ['0', '1'], overrideWindows: [] },
            optionMatrix: [],
            passRewards: [],
            freeOperationActionIds: ['operation'],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
          },
        },
      },
    } as unknown as GameDef;

    const state = makeBaseState({
      zones: { 'board:cambodia': [], 'board:vietnam': [] },
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
          factionOrder: ['0', '1'],
          eligibility: { '0': true, '1': true },
          currentCard: {
            firstEligible: '0',
            secondEligible: '1',
            actedFactions: [],
            passedFactions: [],
            nonPassCount: 0,
            firstActionClass: null,
          },
          pendingEligibilityOverrides: [],
          pendingFreeOperationGrants: [
            {
              grantId: 'grant-0',
              faction: '0',
              operationClass: 'operation',
              actionIds: ['operation'],
              zoneFilter: {
                op: '==',
                left: { ref: 'zoneProp', zone: '$zone', prop: 'country' },
                right: 'cambodia',
              },
              remainingUses: 1,
            },
          ],
        },
      },
    });

    const result = resolveMoveDecisionSequence(
      def,
      state,
      { actionId: asActionId('operation'), params: {}, freeOperation: true },
      { choose: () => undefined },
    );

    assert.equal(result.complete, false);
    assert.equal(result.nextDecision?.decisionId, 'decision:$zone');
    assert.deepEqual(result.nextDecision?.options.map((option) => option.value), ['board:cambodia']);
  });

  it('rejects decision selections outside the free-operation zone filter domain', () => {
    const action: ActionDef = {
      id: asActionId('operation'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const profile: ActionPipelineDef = {
      id: 'operation-profile',
      actionId: asActionId('operation'),
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [
        {
          effects: [
            {
              chooseOne: {
                internalDecisionId: 'decision:$zone',
                bind: '$zone',
                options: { query: 'zones' },
              },
            } as GameDef['actions'][number]['effects'][number],
          ],
        },
      ],
      atomicity: 'partial',
    };

    const def: GameDef = {
      ...makeBaseDef({ actions: [action], actionPipelines: [profile] }),
      zones: [
        { id: asZoneId('board:cambodia'), owner: 'none', visibility: 'public', ordering: 'set', category: 'province', attributes: { population: 1, econ: 0, terrainTags: [], country: 'cambodia', coastal: false }, adjacentTo: [] },
        { id: asZoneId('board:vietnam'), owner: 'none', visibility: 'public', ordering: 'set', category: 'province', attributes: { population: 1, econ: 0, terrainTags: [], country: 'southVietnam', coastal: false }, adjacentTo: [] },
      ],
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: { factions: ['0', '1'], overrideWindows: [] },
            optionMatrix: [],
            passRewards: [],
            freeOperationActionIds: ['operation'],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
          },
        },
      },
    } as unknown as GameDef;

    const state = makeBaseState({
      zones: { 'board:cambodia': [], 'board:vietnam': [] },
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
          factionOrder: ['0', '1'],
          eligibility: { '0': true, '1': true },
          currentCard: {
            firstEligible: '0',
            secondEligible: '1',
            actedFactions: [],
            passedFactions: [],
            nonPassCount: 0,
            firstActionClass: null,
          },
          pendingEligibilityOverrides: [],
          pendingFreeOperationGrants: [
            {
              grantId: 'grant-0',
              faction: '0',
              operationClass: 'operation',
              actionIds: ['operation'],
              zoneFilter: {
                op: '==',
                left: { ref: 'zoneProp', zone: '$zone', prop: 'country' },
                right: 'cambodia',
              },
              remainingUses: 1,
            },
          ],
        },
      },
    });

    assert.throws(
      () =>
        resolveMoveDecisionSequence(def, state, {
          actionId: asActionId('operation'),
          params: { 'decision:$zone': 'board:vietnam' },
          freeOperation: true,
        }),
      (error: unknown) => error instanceof Error && error.message.includes('invalid selection for chooseOne'),
    );
  });
});
