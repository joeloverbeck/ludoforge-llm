import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  createSeatResolutionContext,
  isFreeOperationGrantUsableInCurrentState,
  type ActionDef,
  type ActionPipelineDef,
  type GameDef,
  type GameState,
  type Token,
  type TurnFlowPendingFreeOperationGrant,
} from '../../../src/kernel/index.js';
import { doesGrantPotentiallyAuthorizeMove } from '../../../src/kernel/free-operation-grant-authorization.js';
import { eff } from '../../helpers/effect-tag-helper.js';

const makeBaseDef = (overrides: {
  readonly actions: readonly ActionDef[];
  readonly actionPipelines: readonly ActionPipelineDef[];
  readonly zones?: readonly { readonly id: ReturnType<typeof asZoneId> }[];
}): GameDef =>
  ({
    metadata: { id: 'free-operation-viability-test', players: { min: 2, max: 2 } },
    seats: [{ id: '0' }, { id: '1' }],
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: overrides.zones ?? [],
    tokenTypes: [],
    setup: [],
    turnStructure: {
      phases: [{ id: asPhaseId('main') }],
    },
    turnOrder: {
      type: 'cardDriven',
      config: {
        turnFlow: {
          cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
          eligibility: { seats: ['0', '1'] },
          windows: [],
          actionClassByActionId: { operation: 'operation' },
          optionMatrix: [],
          passRewards: [],
          freeOperationActionIds: ['operation'],
          durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
        },
      },
    },
    actions: overrides.actions,
    actionPipelines: overrides.actionPipelines,
    triggers: [],
    terminal: { conditions: [] },
  }) as unknown as GameDef;

const makeBaseState = (): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  zoneVars: {},
  playerCount: 2,
  zones: {},
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
  stateHash: 0n,
  _runningHash: 0n,
  actionUsage: {},
  turnOrderState: {
    type: 'cardDriven',
    runtime: {
      seatOrder: ['0', '1'],
      eligibility: { '0': true, '1': true },
      currentCard: {
        firstEligible: '0',
        secondEligible: '1',
        actedSeats: [],
        passedSeats: [],
        nonPassCount: 0,
        firstActionClass: null,
      },
      pendingEligibilityOverrides: [],
      pendingFreeOperationGrants: [],
    },
  },
  markers: {},
});

const makeToken = (id: string): Token => ({
  id: asTokenId(id),
  type: 'piece',
  props: { faction: 'none' },
});

describe('free-operation viability runtime', () => {
  it('counts chooseN branch traversal against maxParamExpansions before the first completed selection resolves', () => {
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
      id: 'operation-profile-branch-budget',
      actionId: asActionId('operation'),
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [
        {
          effects: [
            eff({
              chooseN: {
                internalDecisionId: 'decision:$targets',
                bind: '$targets',
                options: {
                  query: 'enums',
                  values: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'],
                },
                min: 8,
                max: 8,
              },
            }) as ActionPipelineDef['stages'][number]['effects'][number],
          ],
        },
      ],
      atomicity: 'partial',
    };

    const def = makeBaseDef({
      actions: [action],
      actionPipelines: [profile],
      zones: [{ id: asZoneId('hot:none') }, { id: asZoneId('cold:none') }],
    });
    const state = makeBaseState();
    const seatResolution = createSeatResolutionContext(def, state.playerCount);

    const usableWithinBudget = isFreeOperationGrantUsableInCurrentState(
      def,
      state,
      {
        seat: '0',
        operationClass: 'operation',
        actionIds: ['operation'],
        viabilityPolicy: 'requireUsableAtIssue',
      },
      '0',
      ['0', '1'],
      seatResolution,
      {
        budgets: {
          maxParamExpansions: 32,
          maxDecisionProbeSteps: 32,
        },
      },
    );

    const blockedByTraversalBudget = isFreeOperationGrantUsableInCurrentState(
      def,
      state,
      {
        seat: '0',
        operationClass: 'operation',
        actionIds: ['operation'],
        viabilityPolicy: 'requireUsableAtIssue',
      },
      '0',
      ['0', '1'],
      seatResolution,
      {
        budgets: {
          maxParamExpansions: 7,
          maxDecisionProbeSteps: 32,
        },
      },
    );

    assert.equal(usableWithinBudget, true);
    assert.equal(blockedByTraversalBudget, false);
  });

  it('uses moveZoneProbeBindings to reject probe branches before moveZoneBindings resolve', () => {
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

    const def = makeBaseDef({
      actions: [action],
      actionPipelines: [],
      zones: [{ id: asZoneId('hot:none') }, { id: asZoneId('cold:none') }],
    });
    const state: GameState = {
      ...makeBaseState(),
      zones: {
        'hot:none': [],
        'cold:none': [makeToken('cold-token')],
      },
    };
    const grant: TurnFlowPendingFreeOperationGrant = {
      grantId: '__probe__',
      phase: 'ready' as const,
      seat: '0',
      operationClass: 'operation' as const,
      actionIds: ['operation'],
      moveZoneBindings: ['$dest'],
      moveZoneProbeBindings: ['$spaces'],
      remainingUses: 1,
      zoneFilter: {
        op: '==' as const,
        left: {
          _t: 5 as const,
          aggregate: {
            op: 'count' as const,
            query: {
              query: 'tokensInZone' as const,
              zone: '$zone',
            },
          },
        },
        right: 0,
      },
    };
    const coldProbeMove = {
      actionId: asActionId('operation'),
      params: {
        $spaces: [asZoneId('cold:none')],
      },
      freeOperation: true,
    };
    const hotProbeMove = {
      actionId: asActionId('operation'),
      params: {
        $spaces: [asZoneId('hot:none')],
      },
      freeOperation: true,
    };

    assert.equal(
      doesGrantPotentiallyAuthorizeMove(def, state, [grant], grant, coldProbeMove),
      true,
      'default potential-authorization remains conservative until moveZoneBindings resolve',
    );
    assert.equal(
      doesGrantPotentiallyAuthorizeMove(def, state, [grant], grant, coldProbeMove, { useProbeBindings: true }),
      false,
      'probe bindings should reject a cold branch before $dest resolves',
    );
    assert.equal(
      doesGrantPotentiallyAuthorizeMove(def, state, [grant], grant, hotProbeMove, { useProbeBindings: true }),
      true,
      'probe bindings should preserve the viable hot branch',
    );
  });

  it('caps high-cardinality chooseN viability probes before materializing the full search tree', () => {
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
            eff({
              chooseN: {
                internalDecisionId: 'decision:$targets',
                bind: '$targets',
                options: {
                  query: 'enums',
                  values: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p'],
                },
                min: 8,
                max: 8,
              },
            }) as ActionPipelineDef['stages'][number]['effects'][number],
            eff({
              chooseOne: {
                internalDecisionId: 'decision:$unreachable',
                bind: '$unreachable',
                options: { query: 'enums', values: [] },
              },
            }) as ActionPipelineDef['stages'][number]['effects'][number],
          ],
        },
      ],
      atomicity: 'partial',
    };

    const def = makeBaseDef({
      actions: [action],
      actionPipelines: [profile],
    });
    const state = makeBaseState();

    const usable = isFreeOperationGrantUsableInCurrentState(
      def,
      state,
      {
        seat: '0',
        operationClass: 'operation',
        actionIds: ['operation'],
        viabilityPolicy: 'requireUsableAtIssue',
      },
      '0',
      ['0', '1'],
      createSeatResolutionContext(def, state.playerCount),
      {
        budgets: {
          maxParamExpansions: 5,
          maxDecisionProbeSteps: 32,
        },
      },
    );

    assert.equal(usable, false);
  });

  it('tries lower-complexity early choices before dense branches during grant usability probing', () => {
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
      id: 'operation-profile-complexity-order',
      actionId: asActionId('operation'),
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [
        {
          effects: [
            eff({
              chooseOne: {
                internalDecisionId: 'decision:$targetSpace',
                bind: '$targetSpace',
                options: { query: 'enums', values: ['dense:none', 'sparse:none'] },
              },
            }) as ActionPipelineDef['stages'][number]['effects'][number],
            eff({
              if: {
                when: { op: '==', left: { _t: 2 as const, ref: 'binding', name: '$targetSpace' }, right: 'dense:none' },
                then: [
                  eff({
                    chooseN: {
                      internalDecisionId: 'decision:$denseBranch',
                      bind: '$denseBranch',
                      options: {
                        query: 'enums',
                        values: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'],
                      },
                      min: 8,
                      max: 8,
                    },
                  }) as ActionPipelineDef['stages'][number]['effects'][number],
                  eff({
                    chooseOne: {
                      internalDecisionId: 'decision:$never',
                      bind: '$never',
                      options: { query: 'enums', values: [] },
                    },
                  }) as ActionPipelineDef['stages'][number]['effects'][number],
                ],
                else: [],
              },
            }) as ActionPipelineDef['stages'][number]['effects'][number],
          ],
        },
      ],
      atomicity: 'partial',
    };

    const def = {
      ...makeBaseDef({
        actions: [action],
        actionPipelines: [profile],
      }),
      zones: [
        { id: asZoneId('dense:none'), owner: 'none', visibility: 'public', ordering: 'set' },
        { id: asZoneId('sparse:none'), owner: 'none', visibility: 'public', ordering: 'set' },
      ],
    } as unknown as GameDef;
    const state: GameState = {
      ...makeBaseState(),
      zones: {
        'dense:none': Array.from({ length: 10 }, (_, index) => makeToken(`dense-${index}`)),
        'sparse:none': [],
      },
    };

    const usable = isFreeOperationGrantUsableInCurrentState(
      def,
      state,
      {
        seat: '0',
        operationClass: 'operation',
        actionIds: ['operation'],
        viabilityPolicy: 'requireUsableAtIssue',
      },
      '0',
      ['0', '1'],
      createSeatResolutionContext(def, state.playerCount),
      {
        budgets: {
          maxParamExpansions: 7,
          maxDecisionProbeSteps: 32,
        },
      },
    );

    assert.equal(usable, true);
  });
});
