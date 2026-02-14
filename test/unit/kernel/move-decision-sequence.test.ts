import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asZoneId,
  isMoveDecisionSequenceSatisfiable,
  resolveMoveDecisionSequence,
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
      phase: asPhaseId('main'),
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

  it('returns incomplete for unsatisfiable chooseN', () => {
    const action: ActionDef = {
      id: asActionId('unsat-op'),
      actor: 'active',
      phase: asPhaseId('main'),
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
    assert.equal((result.nextDecision?.options ?? []).length, 0);
    assert.equal(result.nextDecision?.min, 1);
    assert.equal(isMoveDecisionSequenceSatisfiable(def, makeBaseState(), makeMove('unsat-op')), false);
  });

  it('respects custom chooser for decision sequence completion', () => {
    const action: ActionDef = {
      id: asActionId('custom-choose-op'),
      actor: 'active',
      phase: asPhaseId('main'),
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
      choose: (request) => request.options?.[2],
    });
    assert.equal(result.complete, true);
    assert.equal(result.move.params['decision:$target'], 'c');
  });

  it('throws typed error when maxSteps is exceeded', () => {
    const action: ActionDef = {
      id: asActionId('stuck-op'),
      actor: 'active',
      phase: asPhaseId('main'),
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
    assert.throws(
      () => resolveMoveDecisionSequence(def, makeBaseState(), makeMove('stuck-op'), { maxSteps: 0 }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        const details = error as Error & { code?: unknown };
        assert.equal(details.code, 'MOVE_DECISION_SEQUENCE_MAX_STEPS_EXCEEDED');
        return true;
      },
    );
  });

  it('discovers nested templated decision ids in deterministic order', () => {
    const action: ActionDef = {
      id: asActionId('nested-op'),
      actor: 'active',
      phase: asPhaseId('main'),
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
        return request.options?.[1];
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
      phase: asPhaseId('main'),
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
      phase: asPhaseId('main'),
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
        { id: asZoneId('board:cambodia'), owner: 'none', visibility: 'public', ordering: 'set' },
        { id: asZoneId('board:vietnam'), owner: 'none', visibility: 'public', ordering: 'set' },
      ],
      mapSpaces: [
        {
          id: 'board:cambodia',
          spaceType: 'province',
          population: 1,
          econ: 0,
          terrainTags: [],
          country: 'cambodia',
          coastal: false,
          adjacentTo: [],
        },
        {
          id: 'board:vietnam',
          spaceType: 'province',
          population: 1,
          econ: 0,
          terrainTags: [],
          country: 'southVietnam',
          coastal: false,
          adjacentTo: [],
        },
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
    assert.deepEqual(result.nextDecision?.options, ['board:cambodia']);
  });

  it('rejects decision selections outside the free-operation zone filter domain', () => {
    const action: ActionDef = {
      id: asActionId('operation'),
      actor: 'active',
      phase: asPhaseId('main'),
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
        { id: asZoneId('board:cambodia'), owner: 'none', visibility: 'public', ordering: 'set' },
        { id: asZoneId('board:vietnam'), owner: 'none', visibility: 'public', ordering: 'set' },
      ],
      mapSpaces: [
        {
          id: 'board:cambodia',
          spaceType: 'province',
          population: 1,
          econ: 0,
          terrainTags: [],
          country: 'cambodia',
          coastal: false,
          adjacentTo: [],
        },
        {
          id: 'board:vietnam',
          spaceType: 'province',
          population: 1,
          econ: 0,
          terrainTags: [],
          country: 'southVietnam',
          coastal: false,
          adjacentTo: [],
        },
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
