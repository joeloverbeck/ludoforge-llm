// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
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

const makeZoneFilteredAdmissibleDef = (): GameDef =>
  asTaggedGameDef({
    metadata: { id: 'pending-move-admissibility-zone-filtered-admissible', players: { min: 2, max: 2 } },
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
        id: 'pending-move-admissibility-zone-filtered-admissible-profile',
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
            ],
          },
        ],
        atomicity: 'partial',
      },
    ],
    triggers: [],
    terminal: { conditions: [] },
  });

const makeZoneFilteredAdmissibleState = (): GameState => ({
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
            op: '==',
            left: { _t: 2, ref: 'zoneProp', zone: '$targetProvince', prop: 'country' },
            right: 'cambodia',
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

    // Spec 17 §4: the public probe MUST NOT surface a floating unsatisfiable
    // move as viable — the internal-discovery rewrite is filtered through the
    // shared admissibility classifier before reaching the client.
    const viability = probeMoveViability(def, state, move);
    assert.equal(
      viability.viable,
      false,
      'public probeMoveViability must route the internal-discovery rewrite through the admissibility classifier per spec 17 §4',
    );

    const admission = classifyMoveDecisionSequenceAdmissionForLegalMove(
      def,
      state,
      move,
      MISSING_BINDING_POLICY_CONTEXTS.LEGAL_MOVES_FREE_OPERATION_DECISION_SEQUENCE,
    );
    assert.equal(admission, 'unsatisfiable');

    // Verify the classifier returns the correct reason code when given the
    // internal-discovery rewrite shape directly (what the probe uses
    // internally before filtering). This guards the classifier contract.
    const rewrittenVerdict = {
      viable: true as const,
      complete: false as const,
      move,
      warnings: [] as const,
      code: undefined,
      context: undefined,
      error: undefined,
      nextDecision: undefined,
      nextDecisionSet: undefined,
      stochasticDecision: undefined,
    };
    const admissibility = classifyMoveAdmissibility(def, state, move, rewrittenVerdict);
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
        serializeVerdict(classifyMoveAdmissibility(def, state, move, rewrittenVerdict)),
        serializeVerdict(admissibility),
      );
    }
  });

  /*
   * Spec 17 §4 proof: the `deriveMoveViabilityVerdict` internal-discovery rewrite
   * MUST pass through the shared admissibility classifier before reaching any client.
   * A move whose decision params are fully specified but whose grant zone filter
   * is violated must be reported as inadmissible uniformly across all four layers.
   *
   * This is the fixture class that, when omitted, allows regressions like the
   * An Loc / Gulf of Tonkin event-card and seed 2046 canary failures to land:
   * the raw probe correctly rejects the wrong-zone move, the rewrite rescues
   * it into "viable, incomplete", and nothing downstream re-filters it before
   * the client sees viable: true.
   */
  it('keeps all four layers aligned for a complete-structurally grant-zone-filter-violating free-operation move', () => {
    const def = makeZoneFilteredAdmissibleDef();
    const state = makeZoneFilteredAdmissibleState();
    const wrongZoneMove: Move = {
      actionId: OPERATION_ACTION_ID,
      params: { $targetProvince: 'board:vietnam' },
      freeOperation: true,
    };

    const enumerated = enumerateLegalMoves(def, state);
    const enumeratedWrongZone = enumerated.moves.find(({ move: candidate }) =>
      candidate.actionId === OPERATION_ACTION_ID
      && candidate.freeOperation === true
      && candidate.params.$targetProvince === 'board:vietnam');
    assert.equal(
      enumeratedWrongZone,
      undefined,
      'enumeration must not surface the wrong-zone free-operation move as playable',
    );

    const viability = probeMoveViability(def, state, wrongZoneMove);
    assert.equal(
      viability.viable,
      false,
      'probeMoveViability must report viable: false for a complete move that violates the grant zone filter',
    );

    const admission = classifyMoveDecisionSequenceAdmissionForLegalMove(
      def,
      state,
      wrongZoneMove,
      MISSING_BINDING_POLICY_CONTEXTS.LEGAL_MOVES_FREE_OPERATION_DECISION_SEQUENCE,
    );
    assert.notEqual(admission, 'satisfiable', 'decision-sequence admission must not classify the wrong-zone move as satisfiable');

    const admissibility = classifyMoveAdmissibility(def, state, wrongZoneMove, viability);
    assert.equal(
      admissibility.kind,
      'inadmissible',
      'classifyMoveAdmissibility must classify the wrong-zone move as inadmissible',
    );

    const completion = completeTemplateMove(def, state, wrongZoneMove, createRng(0n));
    assert.notEqual(
      completion.kind,
      'completed',
      'completeTemplateMove must not classify the wrong-zone move as completed',
    );

    for (const seed of DETERMINISM_SEEDS) {
      void seed;
      assert.equal(
        serializeVerdict(classifyMoveAdmissibility(def, state, wrongZoneMove, viability)),
        serializeVerdict(admissibility),
      );
    }
  });

  it('keeps all four layers aligned for a complete-executable grant-zone-filter-satisfying free-operation move', () => {
    const def = makeZoneFilteredAdmissibleDef();
    const state = makeZoneFilteredAdmissibleState();
    const rightZoneMove: Move = {
      actionId: OPERATION_ACTION_ID,
      params: { $targetProvince: 'board:cambodia' },
      freeOperation: true,
    };

    const enumerated = enumerateLegalMoves(def, state);
    const enumeratedWrongZone = enumerated.moves.find(({ move: candidate }) =>
      candidate.actionId === OPERATION_ACTION_ID
      && candidate.freeOperation === true
      && candidate.params.$targetProvince === 'board:vietnam');
    assert.equal(
      enumeratedWrongZone,
      undefined,
      'enumeration must not surface the grant-zone-filter-violating variant',
    );

    const viability = probeMoveViability(def, state, rightZoneMove);
    assert.equal(
      viability.viable,
      true,
      'probeMoveViability must report viable: true for a complete move that satisfies the grant zone filter',
    );
    if (!viability.viable) {
      assert.fail('expected grant-zone-satisfying move to probe as viable');
    }
    assert.equal(viability.complete, true);

    const admission = classifyMoveDecisionSequenceAdmissionForLegalMove(
      def,
      state,
      rightZoneMove,
      MISSING_BINDING_POLICY_CONTEXTS.LEGAL_MOVES_FREE_OPERATION_DECISION_SEQUENCE,
    );
    assert.equal(admission, 'satisfiable');

    const admissibility = classifyMoveAdmissibility(def, state, rightZoneMove, viability);
    assert.deepEqual(admissibility, { kind: 'complete' });

    const completion = completeTemplateMove(def, state, rightZoneMove, createRng(0n));
    assert.equal(completion.kind, 'completed');

    for (const seed of DETERMINISM_SEEDS) {
      void seed;
      assert.equal(
        serializeVerdict(classifyMoveAdmissibility(def, state, rightZoneMove, viability)),
        serializeVerdict(admissibility),
      );
    }
  });
});

/*
 * Spec 17 §1 / Foundations #5 conformance: the shared admissibility
 * classifier MUST predict what `applyMove` does. This is the cross-pathway
 * invariant that closes the gap between probe-time legality claims and
 * apply-time enforcement. Any divergence between classifier verdict and
 * apply outcome is a FOUNDATIONS #5 ("One Rules Protocol") violation and a
 * regression these tests will detect immediately.
 */
describe('admissibility/apply cross-pathway conformance', () => {
  const loadIllegalMoveReason = (error: unknown): string | undefined => {
    if (!(error instanceof Error) || !('reason' in error)) return undefined;
    return (error as Error & { reason?: string }).reason;
  };

  const applyThrowsIllegalMove = (
    def: GameDef,
    state: GameState,
    move: Move,
  ): boolean => {
    try {
      applyMove(def, state, move);
      return false;
    } catch (error) {
      return loadIllegalMoveReason(error) !== undefined;
    }
  };

  it('complete-executable classifier verdict predicts applyMove success', () => {
    const def = makeZoneFilteredAdmissibleDef();
    const state = makeZoneFilteredAdmissibleState();
    const rightZoneMove: Move = {
      actionId: OPERATION_ACTION_ID,
      params: { $targetProvince: 'board:cambodia' },
      freeOperation: true,
    };

    const viability = probeMoveViability(def, state, rightZoneMove);
    if (!viability.viable) {
      assert.fail('classifier-executable move must probe as viable');
    }
    const admissibility = classifyMoveAdmissibility(def, state, rightZoneMove, viability);
    assert.deepEqual(admissibility, { kind: 'complete' });

    // Invariant: classifier says `complete` ⇒ applyMove must not throw
    // ILLEGAL_MOVE. Any divergence here indicates a probe/apply
    // legality-protocol split (FOUNDATIONS #5 violation).
    assert.doesNotThrow(() => applyMove(def, state, rightZoneMove));
  });

  it('definitively-inadmissible classifier verdict predicts applyMove ILLEGAL_MOVE', () => {
    const def = makeZoneFilteredAdmissibleDef();
    const state = makeZoneFilteredAdmissibleState();
    const wrongZoneMove: Move = {
      actionId: OPERATION_ACTION_ID,
      params: { $targetProvince: 'board:vietnam' },
      freeOperation: true,
    };

    // The probe must reject this move (rewritten viable verdict filtered
    // through the admissibility classifier per Spec 17 §4).
    const viability = probeMoveViability(def, state, wrongZoneMove);
    assert.equal(viability.viable, false);

    // Invariant: classifier says inadmissible on a definitive ground ⇒
    // applyMove must throw ILLEGAL_MOVE. Any case where the classifier
    // claims a move is illegal but apply accepts it silently is a silent
    // no-op — the exact failure mode spec 17 was written to eliminate.
    assert.equal(
      applyThrowsIllegalMove(def, state, wrongZoneMove),
      true,
      'applyMove must throw ILLEGAL_MOVE for a classifier-inadmissible move',
    );
  });

  it('every enumerated legal move is classifier-admissible and apply-acceptable', () => {
    const def = makeZoneFilteredAdmissibleDef();
    const state = makeZoneFilteredAdmissibleState();

    const enumerated = enumerateLegalMoves(def, state);
    assert.equal(enumerated.moves.length > 0, true, 'expected at least one enumerated move');

    for (const entry of enumerated.moves) {
      const viability = probeMoveViability(def, state, entry.move);
      assert.equal(
        viability.viable,
        true,
        `enumerated move ${JSON.stringify(entry.move.params)} must probe as viable`,
      );
      const admissibility = classifyMoveAdmissibility(def, state, entry.move, viability);
      assert.notEqual(
        admissibility.kind === 'inadmissible'
          && (admissibility.reason === 'floatingUnsatisfiable'
            || admissibility.reason === 'freeOperationOutcomePolicyFailed'
            || admissibility.reason === 'illegalMove'
            || admissibility.reason === 'runtimeError'),
        true,
        `enumerated move ${JSON.stringify(entry.move.params)} must not be definitively inadmissible`,
      );
      if (viability.complete) {
        // Trusted executable complete moves must apply cleanly.
        assert.doesNotThrow(
          () => applyMove(def, state, entry.move),
          `enumerated complete move ${JSON.stringify(entry.move.params)} must apply without throwing`,
        );
      }
    }
  });

  it('rejects complete move with wrong-zone params uniformly across probe / classifier / applyMove', () => {
    const def = makeZoneFilteredAdmissibleDef();
    const state = makeZoneFilteredAdmissibleState();
    const wrongZoneMove: Move = {
      actionId: OPERATION_ACTION_ID,
      params: { $targetProvince: 'board:vietnam' },
      freeOperation: true,
    };

    const viability = probeMoveViability(def, state, wrongZoneMove);
    assert.equal(viability.viable, false, 'probe must reject');

    // Classifier, when fed the raw illegal viability, maps to `illegalMove`.
    const admissibilityFromIllegal = classifyMoveAdmissibility(def, state, wrongZoneMove, viability);
    assert.equal(
      admissibilityFromIllegal.kind === 'inadmissible'
        && (admissibilityFromIllegal.reason === 'illegalMove'
          || admissibilityFromIllegal.reason === 'floatingUnsatisfiable'),
      true,
    );

    // Classifier, when fed the internal-discovery rewrite directly, rejects
    // with a definitive reason (either `floatingUnsatisfiable` or
    // `freeOperationOutcomePolicyFailed`). All paths converge on inadmissible.
    const rewrittenVerdict = {
      viable: true as const,
      complete: false as const,
      move: wrongZoneMove,
      warnings: [] as const,
      code: undefined,
      context: undefined,
      error: undefined,
      nextDecision: undefined,
      nextDecisionSet: undefined,
      stochasticDecision: undefined,
    };
    const admissibilityFromRewrite = classifyMoveAdmissibility(def, state, wrongZoneMove, rewrittenVerdict);
    assert.equal(admissibilityFromRewrite.kind, 'inadmissible');
    if (admissibilityFromRewrite.kind === 'inadmissible') {
      assert.equal(
        admissibilityFromRewrite.reason === 'floatingUnsatisfiable'
          || admissibilityFromRewrite.reason === 'freeOperationOutcomePolicyFailed',
        true,
        `classifier on rewritten verdict must reject with a definitive reason, got ${admissibilityFromRewrite.reason}`,
      );
    }

    // applyMove must also reject.
    assert.equal(
      applyThrowsIllegalMove(def, state, wrongZoneMove),
      true,
    );
  });
});
