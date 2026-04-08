import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asActionId,
  asPhaseId,
  asPlayerId,
  createSeatResolutionContext,
  doesCompletedProbeMoveChangeGameplayState,
  isFreeOperationGrantUsableInCurrentState,
  type ActionDef,
  type ActionPipelineDef,
  type GameDef,
  type GameState,
} from '../../../src/kernel/index.js';
import { eff } from '../../helpers/effect-tag-helper.js';

const makeBaseDef = (overrides: {
  readonly actions: readonly ActionDef[];
  readonly actionPipelines: readonly ActionPipelineDef[];
}): GameDef =>
  ({
    metadata: { id: 'free-operation-viability-test', players: { min: 2, max: 2 } },
    seats: [{ id: '0' }, { id: '1' }],
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [],
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

describe('free-operation viability runtime', () => {
  it('treats choice validation failures as conservatively gameplay-changing in completed probe execution', () => {
    const action: ActionDef = {
      id: asActionId('operation'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [
        eff({
          chooseOne: {
            internalDecisionId: 'decision:$delta',
            bind: '$delta',
            options: { query: 'enums', values: ['alpha', 'beta'] },
          },
        }) as ActionDef['effects'][number],
      ],
      limits: [],
    };

    const def = makeBaseDef({
      actions: [action],
      actionPipelines: [],
    });
    const state = makeBaseState();
    const changed = doesCompletedProbeMoveChangeGameplayState(
      def,
      state,
      {
        actionId: asActionId('operation'),
        params: { '$delta': 'gamma' },
      },
      createSeatResolutionContext(def, state.playerCount),
    );

    assert.equal(changed, true);
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
});
