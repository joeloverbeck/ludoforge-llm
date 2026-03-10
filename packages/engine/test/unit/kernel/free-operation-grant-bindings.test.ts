import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  collectGrantAwareMoveZoneCandidates,
  resolveGrantAwareMoveRuntimeBindings,
} from '../../../src/kernel/free-operation-grant-bindings.js';
import { asActionId, asPhaseId, asPlayerId } from '../../../src/kernel/branded.js';
import type { GameDef, GameState, Move, TurnFlowPendingFreeOperationGrant } from '../../../src/kernel/types.js';

const createExecutionContextBindingDef = (): GameDef =>
  ({
    metadata: { id: 'free-op-grant-bindings-unit', players: { min: 2, max: 2 }, maxTriggerDepth: 4 },
    seats: [{ id: 'US' }, { id: 'NVA' }],
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [
      {
        id: 'boardCambodia:none',
        owner: 'none',
        visibility: 'public',
        ordering: 'set',
        category: 'province',
        attributes: { population: 1, econ: 0, country: 'cambodia', coastal: false },
      },
      {
        id: 'boardVietnam:none',
        owner: 'none',
        visibility: 'public',
        ordering: 'set',
        category: 'province',
        attributes: { population: 1, econ: 0, country: 'southVietnam', coastal: false },
      },
    ],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    turnOrder: {
      type: 'cardDriven',
      config: {
        turnFlow: {
          cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
          eligibility: { seats: ['US', 'NVA'] },
          windows: [],
          optionMatrix: [{ first: 'event', second: ['operation'] }],
          passRewards: [],
          freeOperationActionIds: ['operation'],
          durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
        },
      },
    },
    actions: [
      {
        id: asActionId('operation'),
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
    ],
    actionPipelines: [
      {
        id: 'operation-grant-context-profile',
        actionId: asActionId('operation'),
        applicability: {
          op: 'and',
          args: [
            { op: '==', left: { ref: 'binding', name: '__freeOperation' }, right: true },
            { op: '==', left: { ref: 'grantContext', key: 'zoneProfile' }, right: 'cambodia-only' },
          ],
        },
        legality: null,
        costValidation: null,
        costEffects: [],
        targeting: {},
        stages: [
          {
            effects: [
              {
                chooseOne: {
                  internalDecisionId: 'decision:$candidateZone',
                  bind: '$grantZone',
                  options: { query: 'zones' },
                },
              },
            ],
          },
        ],
        atomicity: 'partial',
      },
    ],
    triggers: [],
    terminal: { conditions: [] },
  }) as unknown as GameDef;

const createExecutionContextBindingState = (): GameState =>
  ({
    activePlayer: asPlayerId(0),
    playerCount: 2,
    currentPhase: asPhaseId('main'),
    actionUsage: {},
    globalVars: {},
    perPlayerVars: {},
    zones: {
      'boardCambodia:none': [],
      'boardVietnam:none': [],
    },
    turn: 1,
    rng: 0,
    pendingEffects: [],
    log: [],
    turnOrderState: {
      type: 'cardDriven',
      runtime: {
        seatOrder: ['US', 'NVA'],
        eligibility: { US: true, NVA: true },
        currentCard: {
          firstEligible: 'US',
          secondEligible: null,
          actedSeats: [],
          passedSeats: [],
          nonPassCount: 0,
          firstActionClass: null,
        },
        pendingEligibilityOverrides: [],
        pendingFreeOperationGrants: [],
      },
    },
  }) as unknown as GameState;

describe('free-operation grant bindings', () => {
  it('threads executionContext into pipeline dispatch when deriving canonical free-operation bindings', () => {
    const def = createExecutionContextBindingDef();
    const state = createExecutionContextBindingState();
    const move: Move = {
      actionId: asActionId('operation'),
      params: { 'decision:$candidateZone': 'boardCambodia:none' },
      freeOperation: true,
    };
    const grant: TurnFlowPendingFreeOperationGrant = {
      grantId: 'grant-context-binding',
      seat: 'US',
      operationClass: 'operation',
      actionIds: ['operation'],
      moveZoneBindings: ['$grantZone'],
      executionContext: { zoneProfile: 'cambodia-only' },
      remainingUses: 1,
    };
    const grantWithoutContext = {
      seat: grant.seat,
      moveZoneBindings: ['$grantZone'],
    } as const;

    assert.throws(
      () => resolveGrantAwareMoveRuntimeBindings(def, state, move, grantWithoutContext),
      (error: unknown) =>
        error instanceof Error
        && 'code' in error
        && (error as Error & { readonly code?: string }).code === 'ACTION_PIPELINE_APPLICABILITY_EVALUATION_FAILED',
    );

    const withContext = resolveGrantAwareMoveRuntimeBindings(def, state, move, grant);
    assert.equal(withContext['$grantZone'], 'boardCambodia:none');
    assert.deepEqual(collectGrantAwareMoveZoneCandidates(def, state, move, grant), ['boardCambodia:none']);
  });
});
