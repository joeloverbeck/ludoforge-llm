import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asZoneId,
  enumerateLegalMoves,
  legalMoves,
  probeMoveViability,
  type ActionDef,
  type ActionPipelineDef,
  type GameDef,
  type GameState,
} from '../../../src/kernel/index.js';
import {
  MOVE_VIABILITY_VERDICT_CODES,
  toMoveViabilityVerdictCode,
  type MoveViabilityVerdictCode,
} from '../../../src/kernel/viability-predicate.js';
import { eff } from '../../helpers/effect-tag-helper.js';
import { asTaggedGameDef } from '../../helpers/gamedef-fixtures.js';

const OPERATION_ACTION_ID = asActionId('operation');

const makeCardDrivenFreeOpDef = (): GameDef =>
  asTaggedGameDef({
    metadata: { id: 'viability-predicate-test', players: { min: 2, max: 2 } },
    seats: [{ id: '0' }, { id: '1' }],
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [
      {
        id: asZoneId('board:cambodia'),
        owner: 'none',
        visibility: 'public',
        ordering: 'set',
        category: 'province',
        attributes: { population: 1, econ: 0, terrainTags: [], country: 'cambodia', coastal: false },
        adjacentTo: [],
      },
      {
        id: asZoneId('board:vietnam'),
        owner: 'none',
        visibility: 'public',
        ordering: 'set',
        category: 'province',
        attributes: { population: 1, econ: 0, terrainTags: [], country: 'southVietnam', coastal: false },
        adjacentTo: [],
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
    actions: [
      {
        id: OPERATION_ACTION_ID,
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      } satisfies ActionDef,
    ],
    actionPipelines: [
      {
        id: 'operation-profile',
        actionId: OPERATION_ACTION_ID,
        legality: null,
        costValidation: null,
        costEffects: [],
        targeting: {},
        stages: [
          {
            effects: [
              eff({
                chooseOne: {
                  internalDecisionId: 'decision:$targetProvince',
                  bind: '$targetProvince',
                  options: { query: 'zones' },
                },
              }),
            ],
          },
        ],
        atomicity: 'partial',
      } satisfies ActionPipelineDef,
    ],
    triggers: [],
    terminal: { conditions: [] },
  });

const makeDeferredFreeOperationState = (): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  zoneVars: {},
  playerCount: 2,
  zones: { 'board:cambodia': [], 'board:vietnam': [] },
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
      pendingFreeOperationGrants: [
        {
          grantId: 'grant-0',
          phase: 'ready',
          seat: '0',
          operationClass: 'operation',
          actionIds: ['operation'],
          zoneFilter: {
            op: 'and',
            args: [
              {
                op: '==',
                left: { _t: 2, ref: 'zoneProp', zone: '$targetProvince', prop: 'country' },
                right: 'cambodia',
              },
              {
                op: '==',
                left: { _t: 2, ref: 'zoneProp', zone: '$supportProvince', prop: 'country' },
                right: 'cambodia',
              },
            ],
          },
          remainingUses: 1,
        },
      ],
    },
  },
  markers: {},
  reveals: undefined,
  globalMarkers: undefined,
  activeLastingEffects: undefined,
  interruptPhaseStack: undefined,
});

const assertExhaustiveVerdictCode = (code: MoveViabilityVerdictCode): string => {
  switch (code) {
    case 'VIABLE':
    case 'ILLEGAL_MOVE':
    case 'RUNTIME_CONTRACT_INVALID':
    case 'ACTION_PIPELINE_APPLICABILITY_EVALUATION_FAILED':
    case 'ACTION_PIPELINE_PREDICATE_EVALUATION_FAILED':
    case 'LEGAL_CHOICES_UNKNOWN_ACTION':
    case 'LEGAL_CHOICES_VALIDATION_FAILED':
    case 'LEGAL_MOVES_VALIDATION_FAILED':
    case 'INITIAL_STATE_NO_PHASES':
    case 'PHASE_ADVANCE_NO_PHASES':
    case 'PHASE_ADVANCE_CURRENT_PHASE_NOT_FOUND':
    case 'PHASE_ADVANCE_NEXT_PHASE_NOT_FOUND':
    case 'DECISION_POINT_NO_PHASES':
    case 'DECISION_POINT_STALL_LOOP_DETECTED':
    case 'TURN_FLOW_PASS_REWARD_NON_NUMERIC_RESOURCE':
    case 'TERMINAL_SCORING_CONFIG_MISSING':
    case 'TERMINAL_SCORING_NON_NUMERIC':
    case 'TERMINAL_MARGIN_NON_NUMERIC':
    case 'TERMINAL_CHECKPOINT_SEAT_UNMAPPED':
    case 'TERMINAL_WINNER_SEAT_UNMAPPED':
    case 'DERIVED_VALUE_FORMULA_NON_NUMERIC_VAR':
    case 'DERIVED_VALUE_CONTRACT_MISSING':
    case 'DERIVED_VALUE_ZONE_ATTRIBUTE_INVALID':
    case 'HASH_DRIFT':
      return code;
    default: {
      const exhaustive: never = code;
      return exhaustive;
    }
  }
};

describe('move viability predicate', () => {
  it('keeps enumerateLegalMoves and probeMoveViability in parity for deferred free-operation templates', () => {
    const def = makeCardDrivenFreeOpDef();
    const state = makeDeferredFreeOperationState();
    const move = legalMoves(def, state).find((candidate) =>
      candidate.actionId === OPERATION_ACTION_ID && candidate.freeOperation === true
    );
    assert.ok(move, 'expected a deferred free-operation template in legalMoves');

    const classified = enumerateLegalMoves(def, state).moves.find(({ move: candidate }) =>
      candidate.actionId === move.actionId && candidate.freeOperation === true
    );
    assert.ok(classified, 'expected enumerateLegalMoves to retain the deferred free-operation template');

    const directProbe = probeMoveViability(def, state, move);
    const classifiedVerdict = toMoveViabilityVerdictCode(classified.viability);
    const directVerdict = toMoveViabilityVerdictCode(directProbe);

    assert.equal(classifiedVerdict, directVerdict);
    assert.equal(classified.viability.viable, directProbe.viable);
    assert.equal(directProbe.viable, true);
    if (directProbe.viable) {
      assert.equal(directProbe.complete, false);
    }
  });

  it('covers every shared viability verdict code exhaustively', () => {
    assert.deepEqual(
      MOVE_VIABILITY_VERDICT_CODES.map((code) => assertExhaustiveVerdictCode(code)),
      [...MOVE_VIABILITY_VERDICT_CODES],
    );
  });
});
