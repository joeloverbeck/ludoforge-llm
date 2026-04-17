import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asZoneId,
  classifyMoveAdmissibility,
  illegalMoveError,
  kernelRuntimeError,
  ILLEGAL_MOVE_REASONS,
  type ActionDef,
  type ActionPipelineDef,
  type ChoicePendingRequest,
  type ChoiceStochasticPendingRequest,
  type GameDef,
  type GameState,
  type Move,
  type MoveAdmissibilityVerdict,
  type RuntimeWarning,
} from '../../../src/kernel/index.js';
import { eff } from '../../helpers/effect-tag-helper.js';
import { asTaggedGameDef } from '../../helpers/gamedef-fixtures.js';
import type { MoveViabilityResult } from '../../../src/kernel/viability-predicate.js';

const stringifyBigInt = (value: unknown): string =>
  JSON.stringify(value, (_key, entry) => (typeof entry === 'bigint' ? entry.toString() : entry));

const PHASE_ID = asPhaseId('main');

const makeBaseDef = (overrides?: {
  metadataId?: string;
  actions?: readonly ActionDef[];
  actionPipelines?: readonly ActionPipelineDef[];
}): GameDef =>
  asTaggedGameDef({
    metadata: { id: overrides?.metadataId ?? 'move-admissibility-test', players: { min: 2, max: 2 } },
    seats: [{ id: '0' }, { id: '1' }],
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [{ id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set' }],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: PHASE_ID }] },
    actions: overrides?.actions ?? [],
    actionPipelines: overrides?.actionPipelines,
    triggers: [],
    terminal: { conditions: [] },
  });

const makeBaseState = (): GameState => ({
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
  turnOrderState: { type: 'roundRobin' },
  markers: {},
  reveals: undefined,
  globalMarkers: undefined,
  activeLastingEffects: undefined,
  interruptPhaseStack: undefined,
});

const makeMove = (actionId: string): Move => ({
  actionId: asActionId(actionId),
  params: {},
});

const makeAction = (actionId: string): ActionDef => ({
  id: asActionId(actionId),
  actor: 'active',
  executor: 'actor',
  phase: [PHASE_ID],
  params: [],
  pre: null,
  cost: [],
  effects: [],
  limits: [],
});

const makeWarnings = (): readonly RuntimeWarning[] => [];

const makePendingDecision = (): ChoicePendingRequest => ({
  kind: 'pending',
  complete: false,
  decisionKey: '$target' as ChoicePendingRequest['decisionKey'],
  name: '$target',
  type: 'chooseOne',
  options: [{ value: 'allowed', legality: 'legal', illegalReason: null }],
  targetKinds: [],
});

const makePendingDecisionSet = (): readonly ChoicePendingRequest[] => ([
  {
    kind: 'pending',
    complete: false,
    decisionKey: '$first' as ChoicePendingRequest['decisionKey'],
    name: '$first',
    type: 'chooseOne',
    options: [{ value: 'allowed', legality: 'legal', illegalReason: null }],
    targetKinds: [],
  },
]);

const makeStochasticDecision = (): ChoiceStochasticPendingRequest => ({
  kind: 'pendingStochastic',
  complete: false,
  source: 'rollRandom',
  alternatives: [],
  outcomes: [
    {
      bindings: { $draw: 1 },
    },
  ],
});

const makeCompleteViability = (move: Move): MoveViabilityResult => ({
  viable: true,
  complete: true,
  move,
  warnings: makeWarnings(),
  code: undefined,
  context: undefined,
  error: undefined,
  nextDecision: undefined,
  nextDecisionSet: undefined,
  stochasticDecision: undefined,
});

const makePendingViability = (
  move: Move,
  overrides?: Partial<Extract<MoveViabilityResult, { readonly viable: true; readonly complete: false }>>,
): MoveViabilityResult => ({
  viable: true,
  complete: false,
  move,
  warnings: makeWarnings(),
  code: undefined,
  context: undefined,
  error: undefined,
  nextDecision: undefined,
  nextDecisionSet: undefined,
  stochasticDecision: undefined,
  ...overrides,
});

const makeIllegalViability = (move: Move): MoveViabilityResult => {
  const error = illegalMoveError(move, ILLEGAL_MOVE_REASONS.UNKNOWN_ACTION_ID);
  return {
    viable: false,
    complete: undefined,
    move: undefined,
    warnings: undefined,
    code: 'ILLEGAL_MOVE',
    context: error.context!,
    error,
    nextDecision: undefined,
    nextDecisionSet: undefined,
    stochasticDecision: undefined,
  };
};

const makeRuntimeErrorViability = (): MoveViabilityResult => ({
  viable: false,
  complete: undefined,
  move: undefined,
  warnings: undefined,
  code: 'LEGAL_MOVES_VALIDATION_FAILED',
  context: undefined,
  error: kernelRuntimeError('LEGAL_MOVES_VALIDATION_FAILED', 'validation failed'),
  nextDecision: undefined,
  nextDecisionSet: undefined,
  stochasticDecision: undefined,
});

const createAdmissionFixture = (
  actionId: string,
  effects: ActionPipelineDef['stages'][number]['effects'],
): { def: GameDef; state: GameState; move: Move } => {
  const def = makeBaseDef({
    metadataId: `move-admissibility-${actionId}`,
    actions: [makeAction(actionId)],
    actionPipelines: [
      {
        id: `${actionId}-profile`,
        actionId: asActionId(actionId),
        legality: null,
        costValidation: null,
        costEffects: [],
        targeting: {},
        stages: [{ effects }],
        atomicity: 'partial',
      },
    ],
  });
  return {
    def,
    state: makeBaseState(),
    move: makeMove(actionId),
  };
};

const assertDeterministic = (
  verdict: MoveAdmissibilityVerdict,
  expected: MoveAdmissibilityVerdict,
): void => {
  assert.deepEqual(verdict, expected);
  assert.equal(stringifyBigInt(verdict), stringifyBigInt(expected));
};

describe('move admissibility', () => {
  it('classifies complete viable moves as complete', () => {
    const move = makeMove('complete-op');
    const result = classifyMoveAdmissibility(makeBaseDef(), makeBaseState(), move, makeCompleteViability(move));

    assert.deepEqual(result, { kind: 'complete' });
  });

  it('classifies stochastic pending moves as pending admissible', () => {
    const move = makeMove('stochastic-op');
    const result = classifyMoveAdmissibility(
      makeBaseDef(),
      makeBaseState(),
      move,
      makePendingViability(move, { stochasticDecision: makeStochasticDecision() }),
    );

    assert.deepEqual(result, { kind: 'pendingAdmissible', continuation: 'stochastic' });
  });

  it('classifies nextDecision pending moves as pending admissible', () => {
    const move = makeMove('decision-op');
    const result = classifyMoveAdmissibility(
      makeBaseDef(),
      makeBaseState(),
      move,
      makePendingViability(move, { nextDecision: makePendingDecision() }),
    );

    assert.deepEqual(result, { kind: 'pendingAdmissible', continuation: 'decision' });
  });

  it('classifies nextDecisionSet pending moves as pending admissible', () => {
    const move = makeMove('decision-set-op');
    const result = classifyMoveAdmissibility(
      makeBaseDef(),
      makeBaseState(),
      move,
      makePendingViability(move, { nextDecisionSet: makePendingDecisionSet() }),
    );

    assert.deepEqual(result, { kind: 'pendingAdmissible', continuation: 'decisionSet' });
  });

  it('classifies illegal moves as inadmissible illegalMove', () => {
    const move = makeMove('illegal-op');
    const result = classifyMoveAdmissibility(makeBaseDef(), makeBaseState(), move, makeIllegalViability(move));

    assert.deepEqual(result, { kind: 'inadmissible', reason: 'illegalMove' });
  });

  it('classifies non-illegal runtime failures as inadmissible runtimeError', () => {
    const result = classifyMoveAdmissibility(
      makeBaseDef(),
      makeBaseState(),
      makeMove('runtime-error-op'),
      makeRuntimeErrorViability(),
    );

    assert.deepEqual(result, { kind: 'inadmissible', reason: 'runtimeError' });
  });

  it('classifies floating incomplete moves with unsatisfiable admission as floatingUnsatisfiable', () => {
    const fixture = createAdmissionFixture('unsat-admission-op', [
      eff({
        chooseOne: {
          internalDecisionId: 'decision:$target',
          bind: '$target',
          options: { query: 'enums', values: [] },
        },
      }) as ActionDef['effects'][number],
    ]);

    const result = classifyMoveAdmissibility(
      fixture.def,
      fixture.state,
      fixture.move,
      makePendingViability(fixture.move),
    );

    assert.deepEqual(result, { kind: 'inadmissible', reason: 'floatingUnsatisfiable' });
  });

  it('classifies floating incomplete moves with non-unsatisfiable admission as floatingUnresolved', () => {
    const fixture = createAdmissionFixture('missing-binding-admission-op', [
      eff({
        if: {
          when: { op: '==', left: { _t: 2, ref: 'binding', name: '$missing' }, right: 1 },
          then: [],
        },
      }) as ActionDef['effects'][number],
    ]);

    const result = classifyMoveAdmissibility(
      fixture.def,
      fixture.state,
      fixture.move,
      makePendingViability(fixture.move),
    );

    assert.deepEqual(result, { kind: 'inadmissible', reason: 'floatingUnresolved' });
  });

  it('returns byte-identical verdicts for repeated calls', () => {
    const move = makeMove('deterministic-op');
    const def = makeBaseDef();
    const state = makeBaseState();
    const viability = makePendingViability(move, { nextDecision: makePendingDecision() });

    const first = classifyMoveAdmissibility(def, state, move, viability);
    const second = classifyMoveAdmissibility(def, state, move, viability);

    assertDeterministic(first, second);
  });

  it('does not mutate its inputs', () => {
    const move = makeMove('purity-op');
    const def = makeBaseDef();
    const state = makeBaseState();
    const viability = makePendingViability(move, { nextDecisionSet: makePendingDecisionSet() });

    const before = {
      def: structuredClone(def),
      state: structuredClone(state),
      move: structuredClone(move),
      viability: structuredClone(viability),
    };

    classifyMoveAdmissibility(def, state, move, viability);

    assert.deepEqual(def, before.def);
    assert.deepEqual(state, before.state);
    assert.deepEqual(move, before.move);
    assert.deepEqual(viability, before.viability);
  });
});
