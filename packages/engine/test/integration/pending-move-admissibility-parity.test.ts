import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asZoneId,
  classifyMoveAdmissibility,
  classifyMoveDecisionSequenceAdmissionForLegalMove,
  completeTemplateMove,
  createRng,
  enumerateLegalMoves,
  probeMoveViability,
  type ActionDef,
  type ActionPipelineDef,
  type ConditionAST,
  type GameDef,
  type GameState,
  type Move,
  type RuntimeWarning,
} from '../../src/kernel/index.js';
import { MISSING_BINDING_POLICY_CONTEXTS } from '../../src/kernel/missing-binding-policy.js';
import { eff } from '../helpers/effect-tag-helper.js';
import { asTaggedGameDef } from '../helpers/gamedef-fixtures.js';

/**
 * Spec 17 Contract §3 proof: enumeration, direct viability probing,
 * decision-sequence admission, and template completion must stay aligned on the
 * broad admissibility class for pending moves. A failure here means one layer
 * drifted from the shared admissibility classifier or from the canonical
 * floating-incomplete construction path.
 */

const PHASE_ID = asPhaseId('main');
const OPERATION_ACTION_ID = asActionId('operation');
const DETERMINISM_SEEDS = [0n, 1n, 2n, 3n, 5n, 8n, 13n, 21n] as const;

const makeOperationAction = (): ActionDef => ({
  id: OPERATION_ACTION_ID,
  actor: 'active',
  executor: 'actor',
  phase: [PHASE_ID],
  params: [],
  pre: null,
  cost: [],
  effects: [],
  limits: [],
});

const makeFreeOperationDef = (
  metadataId: string,
  effects: ActionPipelineDef['stages'][number]['effects'],
): GameDef =>
  asTaggedGameDef({
    metadata: { id: metadataId, players: { min: 2, max: 2 } },
    seats: [{ id: '0' }, { id: '1' }],
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [{ id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set' }],
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
          actionClassByActionId: { operation: 'operation' },
          optionMatrix: [],
          passRewards: [],
          freeOperationActionIds: ['operation'],
          durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
        },
      },
    },
    actions: [makeOperationAction()],
    actionPipelines: [
      {
        id: `${metadataId}-profile`,
        actionId: OPERATION_ACTION_ID,
        legality: null,
        costValidation: null,
        costEffects: [],
        targeting: {},
        stages: [{ effects }],
        atomicity: 'partial',
      },
    ],
    triggers: [],
    terminal: { conditions: [] },
  });

const makeFreeOperationState = (zoneFilter?: ConditionAST): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  zoneVars: {},
  playerCount: 2,
  zones: { 'board:none': [] },
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
      pendingFreeOperationGrants: [
        {
          grantId: 'grant-0',
          phase: 'ready',
          seat: '0',
          operationClass: 'operation',
          actionIds: ['operation'],
          ...(zoneFilter === undefined ? {} : { zoneFilter }),
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

const makeFreeOperationTemplateMove = (): Move => ({
  actionId: OPERATION_ACTION_ID,
  params: {},
  freeOperation: true,
});

const makeZoneFilteredFloatingUnsatDef = (): GameDef =>
  asTaggedGameDef({
    metadata: { id: 'pending-move-admissibility-floating-unsat', players: { min: 2, max: 2 } },
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
    turnStructure: { phases: [{ id: PHASE_ID }] },
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
    actions: [makeOperationAction()],
    actionPipelines: [
      {
        id: 'pending-move-admissibility-floating-unsat-profile',
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
              }) as ActionDef['effects'][number],
              eff({
                chooseOne: {
                  internalDecisionId: 'decision:$deadEnd',
                  bind: '$deadEnd',
                  options: { query: 'enums', values: [] },
                },
              }) as ActionDef['effects'][number],
            ],
          },
        ],
        atomicity: 'partial',
      },
    ],
    triggers: [],
    terminal: { conditions: [] },
  });

const makeZoneFilteredFloatingUnsatState = (): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  zoneVars: {},
  playerCount: 2,
  zones: { 'board:cambodia': [], 'board:vietnam': [] },
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

const findProbeRejectedWarning = (warnings: readonly RuntimeWarning[]): RuntimeWarning | undefined =>
  warnings.find((warning) => warning.code === 'MOVE_ENUM_PROBE_REJECTED');

const serializeVerdict = (value: unknown): string => JSON.stringify(value);

describe('pending move admissibility parity', () => {
  it('keeps all four layers aligned for an admissible free-operation template', () => {
    const def = makeFreeOperationDef(
      'pending-move-admissibility-admissible',
      [
        eff({
          chooseN: {
            internalDecisionId: 'decision:$targets',
            bind: '$targets',
            options: { query: 'enums', values: ['allowed'] },
            min: 1,
            max: 1,
          },
        }) as ActionDef['effects'][number],
      ],
    );
    const state = makeFreeOperationState();
    const move = makeFreeOperationTemplateMove();

    const enumerated = enumerateLegalMoves(def, state);
    const classified = enumerated.moves.find(({ move: candidate }) => candidate.actionId === OPERATION_ACTION_ID && candidate.freeOperation === true);
    assert.ok(classified, 'expected enumeration to retain the admissible free-operation template');
    assert.equal(findProbeRejectedWarning(enumerated.warnings), undefined);

    const viability = probeMoveViability(def, state, move);
    assert.equal(viability.viable, true);
    if (!viability.viable) {
      assert.fail('expected admissible free-operation template to probe as viable');
    }
    assert.equal(viability.complete, false);
    assert.ok(viability.nextDecision !== undefined, 'expected a real pending decision');
    assert.equal(viability.nextDecisionSet, undefined);
    assert.equal(viability.stochasticDecision, undefined);

    const admission = classifyMoveDecisionSequenceAdmissionForLegalMove(
      def,
      state,
      move,
      MISSING_BINDING_POLICY_CONTEXTS.LEGAL_MOVES_FREE_OPERATION_DECISION_SEQUENCE,
    );
    assert.notEqual(admission, 'unsatisfiable');

    const admissibility = classifyMoveAdmissibility(def, state, move, viability);
    assert.deepEqual(admissibility, { kind: 'pendingAdmissible', continuation: 'decision' });

    const completion = completeTemplateMove(def, state, move, createRng(0n));
    assert.equal(completion.kind, 'completed');

    for (const seed of DETERMINISM_SEEDS) {
      void seed;
      assert.equal(
        serializeVerdict(classifyMoveAdmissibility(def, state, move, viability)),
        serializeVerdict(admissibility),
      );
    }
  });

  it('keeps all four layers aligned for a floating unsatisfiable free-operation template', () => {
    const def = makeZoneFilteredFloatingUnsatDef();
    const state = makeZoneFilteredFloatingUnsatState();
    const move = makeFreeOperationTemplateMove();

    const enumerated = enumerateLegalMoves(def, state);
    const classified = enumerated.moves.find(({ move: candidate }) => candidate.actionId === OPERATION_ACTION_ID && candidate.freeOperation === true);
    assert.equal(classified, undefined, 'expected enumeration to reject the floating unsatisfiable template');
    assert.equal(
      findProbeRejectedWarning(enumerated.warnings),
      undefined,
      'expected early free-operation admission filtering to omit the move before probe-rejection warning emission',
    );

    const viability = probeMoveViability(def, state, move);
    assert.equal(viability.viable, true);
    if (!viability.viable) {
      assert.fail('expected floating template to preserve the viable incomplete probe shape');
    }
    assert.equal(viability.complete, false);
    assert.equal(viability.nextDecision, undefined);
    assert.equal(viability.nextDecisionSet, undefined);
    assert.equal(viability.stochasticDecision, undefined);

    const admission = classifyMoveDecisionSequenceAdmissionForLegalMove(
      def,
      state,
      move,
      MISSING_BINDING_POLICY_CONTEXTS.LEGAL_MOVES_FREE_OPERATION_DECISION_SEQUENCE,
    );
    assert.equal(admission, 'unsatisfiable');

    const admissibility = classifyMoveAdmissibility(def, state, move, viability);
    assert.deepEqual(admissibility, { kind: 'inadmissible', reason: 'floatingUnsatisfiable' });

    const completionKinds = new Set(
      DETERMINISM_SEEDS.map((seed) => completeTemplateMove(def, state, move, createRng(seed)).kind),
    );
    assert.equal(completionKinds.has('completed'), false);
    assert.equal(completionKinds.has('stochasticUnresolved'), false);
    assert.equal(completionKinds.size >= 1, true);

    for (const seed of DETERMINISM_SEEDS) {
      void seed;
      assert.equal(
        serializeVerdict(classifyMoveAdmissibility(def, state, move, viability)),
        serializeVerdict(admissibility),
      );
    }
  });
});
