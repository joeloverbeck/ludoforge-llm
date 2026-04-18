// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ILLEGAL_MOVE_REASONS,
  TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS,
  asActionId,
  asPhaseId,
  asPlayerId,
  asZoneId,
  createSeatResolutionContext,
  evaluateMoveLegality,
  type ActionDef,
  type ActionPipelineDef,
  type GameDef,
  type GameState,
  type Move,
  type TurnFlowPendingFreeOperationGrant,
} from '../../../src/kernel/index.js';
import { resolveStrongestRequiredFreeOperationOutcomeGrant } from '../../../src/kernel/free-operation-outcome-policy.js';
import { eff } from '../../helpers/effect-tag-helper.js';
import { asTaggedGameDef } from '../../helpers/gamedef-fixtures.js';

const PHASE_ID = asPhaseId('main');
const OPERATION_ACTION_ID = asActionId('operation');

const makeAction = (effects: ActionDef['effects'] = []): ActionDef => ({
  id: OPERATION_ACTION_ID,
  actor: 'active',
  executor: 'actor',
  phase: [PHASE_ID],
  params: [],
  pre: null,
  cost: [],
  effects,
  limits: [],
});

const makeProfile = (effects: ActionPipelineDef['stages'][number]['effects']): ActionPipelineDef => ({
  id: 'operation-profile',
  actionId: OPERATION_ACTION_ID,
  legality: null,
  costValidation: null,
  costEffects: [],
  targeting: {},
  stages: [{ effects }],
  atomicity: 'partial',
});

const makeDef = (overrides?: {
  readonly metadataId?: string;
  readonly actions?: readonly ActionDef[];
  readonly actionPipelines?: readonly ActionPipelineDef[];
  readonly globalVars?: readonly GameDef['globalVars'][number][];
  readonly zones?: GameDef['zones'];
}): GameDef =>
  asTaggedGameDef({
    metadata: { id: overrides?.metadataId ?? 'evaluate-move-legality-test', players: { min: 2, max: 2 } },
    seats: [{ id: '0' }, { id: '1' }],
    constants: {},
    globalVars: overrides?.globalVars ?? [],
    perPlayerVars: [],
    zones: overrides?.zones ?? [
      { id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set' },
      { id: asZoneId('city:none'), owner: 'none', visibility: 'public', ordering: 'set' },
    ],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: PHASE_ID }] },
    turnOrder: {
      type: 'cardDriven',
      config: {
        turnFlow: {
          cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
          eligibility: { seats: ['0', '1'] },
          windows: [],
          optionMatrix: [],
          passRewards: [],
          freeOperationActionIds: ['operation'],
          durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
          actionClassByActionId: { operation: 'operation' },
        },
      },
    },
    actions: overrides?.actions ?? [makeAction()],
    actionPipelines: overrides?.actionPipelines,
    triggers: [],
    terminal: { conditions: [] },
  });

const makeState = (pendingFreeOperationGrants?: readonly TurnFlowPendingFreeOperationGrant[]): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  zoneVars: {},
  playerCount: 2,
  zones: {
    'board:none': [],
    'city:none': [],
  },
  nextTokenOrdinal: 0,
  currentPhase: PHASE_ID,
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
      pendingFreeOperationGrants: pendingFreeOperationGrants ?? [],
    },
  },
  markers: {},
  reveals: undefined,
  globalMarkers: undefined,
  activeLastingEffects: undefined,
  interruptPhaseStack: undefined,
});

const makeGrant = (overrides?: Partial<TurnFlowPendingFreeOperationGrant>): TurnFlowPendingFreeOperationGrant => ({
  grantId: overrides?.grantId ?? 'grant-required-outcome',
  phase: 'ready',
  seat: '0',
  operationClass: 'operation',
  actionIds: ['operation'],
  completionPolicy: 'required',
  outcomePolicy: 'mustChangeGameplayState',
  postResolutionTurnFlow: 'resumeCardFlow',
  remainingUses: 1,
  ...overrides,
});

const makeMove = (overrides?: Partial<Move>): Move => ({
  actionId: OPERATION_ACTION_ID,
  params: {},
  freeOperation: true,
  ...overrides,
});

const deepFreeze = <T>(value: T): T => {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const nested of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nested);
  }
  return value;
};

describe('evaluateMoveLegality', () => {
  it('returns legal for a complete free operation that satisfies mustChangeGameplayState', () => {
    const def = makeDef({
      metadataId: 'evaluate-move-legality-complete-legal',
      globalVars: [{ name: 'progress', type: 'int', init: 0, min: 0, max: 10 }],
      actions: [makeAction([eff({ addVar: { scope: 'global', var: 'progress', delta: 1 } })])],
    });
    const state = {
      ...makeState([makeGrant()]),
      globalVars: { progress: 0 },
    };

    assert.deepEqual(
      evaluateMoveLegality(def, state, makeMove()),
      { kind: 'legal' },
    );
  });

  it('returns legal when no required or potential outcome-policy grant applies', () => {
    const def = makeDef({ metadataId: 'evaluate-move-legality-no-grant' });
    const state = makeState();

    assert.deepEqual(
      evaluateMoveLegality(def, state, makeMove()),
      { kind: 'legal' },
    );
  });

  it('returns FREE_OPERATION_OUTCOME_POLICY_FAILED for complete no-op free operations under a required grant', () => {
    const def = makeDef({ metadataId: 'evaluate-move-legality-complete-illegal' });
    const state = makeState([makeGrant()]);

    assert.deepEqual(
      evaluateMoveLegality(def, state, makeMove()),
      {
        kind: 'illegal',
        reason: ILLEGAL_MOVE_REASONS.FREE_OPERATION_OUTCOME_POLICY_FAILED,
        context: {
          actionId: OPERATION_ACTION_ID,
          params: {},
          reason: ILLEGAL_MOVE_REASONS.FREE_OPERATION_OUTCOME_POLICY_FAILED,
          grantId: 'grant-required-outcome',
          outcomePolicy: 'mustChangeGameplayState',
        },
      },
    );
  });

  it('returns FREE_OPERATION_OUTCOME_POLICY_FAILED for incomplete free operations without any legal state-changing completion', () => {
    const def = makeDef({
      metadataId: 'evaluate-move-legality-incomplete-illegal',
      actionPipelines: [
        makeProfile([
          eff({
            chooseOne: {
              internalDecisionId: 'decision:$zone',
              bind: '$zone',
              options: { query: 'enums', values: ['board:none', 'city:none'] },
            },
          }) as ActionPipelineDef['stages'][number]['effects'][number],
        ]),
      ],
    });
    const state = makeState([makeGrant()]);

    assert.deepEqual(
      evaluateMoveLegality(def, state, makeMove()),
      {
        kind: 'illegal',
        reason: ILLEGAL_MOVE_REASONS.FREE_OPERATION_OUTCOME_POLICY_FAILED,
        context: {
          actionId: OPERATION_ACTION_ID,
          params: {},
          reason: ILLEGAL_MOVE_REASONS.FREE_OPERATION_OUTCOME_POLICY_FAILED,
          grantId: 'grant-required-outcome',
          outcomePolicy: 'mustChangeGameplayState',
        },
      },
    );
  });

  it('treats match-evaluation zone-filter failures as no grant', () => {
    const def = makeDef({ metadataId: 'evaluate-move-legality-zone-filter-tolerance' });
    const state = makeState([
      makeGrant({
        grantId: 'grant-zone-filter-indeterminate',
        zoneFilter: {
          op: '==',
          left: { _t: 2 as const, ref: 'gvar', var: 'missingVar' },
          right: 1,
        },
      }),
    ]);
    const move = makeMove();
    const seatResolution = createSeatResolutionContext(def, state.playerCount);

    assert.throws(
      () =>
        resolveStrongestRequiredFreeOperationOutcomeGrant(
          def,
          state,
          move,
          seatResolution,
          TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS.FREE_OPERATION_GRANT_MATCH_EVALUATION,
        ),
      (error: unknown) => {
        assert.equal(
          (error as { readonly code?: unknown }).code,
          'FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED',
        );
        return true;
      },
    );

    assert.deepEqual(evaluateMoveLegality(def, state, move), { kind: 'legal' });
  });

  it('is pure for frozen inputs and repeated calls', () => {
    const def = deepFreeze(makeDef({
      metadataId: 'evaluate-move-legality-pure',
      globalVars: [{ name: 'progress', type: 'int', init: 0, min: 0, max: 10 }],
      actions: [makeAction([eff({ addVar: { scope: 'global', var: 'progress', delta: 1 } })])],
    }));
    const state = deepFreeze({
      ...makeState([makeGrant()]),
      globalVars: { progress: 0 },
    });
    const move = deepFreeze(makeMove());

    const first = evaluateMoveLegality(def, state, move);
    const second = evaluateMoveLegality(def, state, move);

    assert.deepEqual(first, { kind: 'legal' });
    assert.deepEqual(second, first);
    assert.deepEqual(def.globalVars, [{ name: 'progress', type: 'int', init: 0, min: 0, max: 10 }]);
    assert.deepEqual(state.globalVars, { progress: 0 });
    assert.deepEqual(move, { actionId: OPERATION_ACTION_ID, params: {}, freeOperation: true });
  });
});
