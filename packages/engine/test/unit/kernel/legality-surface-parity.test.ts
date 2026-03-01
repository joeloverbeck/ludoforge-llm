import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  ILLEGAL_MOVE_REASONS,
  asActionId,
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  legalChoicesDiscover,
  legalMoves,
  type ActionDef,
  type ActionPipelineDef,
  type ChoiceIllegalRequest,
  type FreeOperationBlockCause,
  type GameDef,
  type GameState,
  type Move,
} from '../../../src/kernel/index.js';
import { assertLegalitySurfaceParityForMove } from '../../helpers/legality-surface-parity-helpers.js';

const makeState = (overrides?: Partial<GameState>): GameState => ({
  globalVars: { resources: 0 },
  perPlayerVars: {},
  zoneVars: {},
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

const makeAction = (overrides?: Partial<ActionDef>): ActionDef => ({
  id: asActionId('op'),
  actor: 'active',
  executor: 'actor',
  phase: [asPhaseId('main')],
  params: [],
  pre: null,
  cost: [],
  effects: [],
  limits: [],
  ...overrides,
});

const makeDef = (overrides?: {
  readonly action?: ActionDef;
  readonly actionPipelines?: readonly ActionPipelineDef[];
}): GameDef =>
  ({
    metadata: { id: 'legality-surface-parity', players: { min: 2, max: 2 } },
    seats: [{ id: '0' }, { id: '1' }, { id: '2' }, { id: '3' }],
    constants: {},
    globalVars: [{ name: 'resources', type: 'int', init: 0, min: 0, max: 100 }],
    perPlayerVars: [],
    zones: [{ id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set' }],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }, { id: asPhaseId('other') }] },
    actions: [overrides?.action ?? makeAction()],
    ...(overrides?.actionPipelines === undefined ? {} : { actionPipelines: overrides.actionPipelines }),
    triggers: [],
    terminal: { conditions: [] },
  }) as unknown as GameDef;

const makeCardDrivenFreeOpDef = (operationActionId: ReturnType<typeof asActionId>): GameDef =>
  ({
    metadata: { id: 'free-op-legality-surface-parity', players: { min: 2, max: 2 } },
    seats: [{ id: '0' }, { id: '1' }],
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [{ id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set' }],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    turnOrder: {
      type: 'cardDriven',
      config: {
        turnFlow: {
          cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
          eligibility: { seats: ['0', '1'], overrideWindows: [] },
          optionMatrix: [],
          passRewards: [],
          freeOperationActionIds: [String(operationActionId)],
          durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
        },
      },
    },
    actions: [
      {
        id: operationActionId,
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
      {
        id: asActionId('operation-alt'),
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
    triggers: [],
    terminal: { conditions: [] },
  }) as unknown as GameDef;

describe('legality surface parity', () => {
  const legalScenarioCases: ReadonlyArray<{
    readonly name: string;
    readonly make: () => {
      readonly def: GameDef;
      readonly state: GameState;
      readonly move: Move;
    };
    readonly expectedChoiceReason: ChoiceIllegalRequest['reason'];
    readonly expectedApplyMoveReason: string;
  }> = [
    {
      name: 'phase mismatch',
      make: () => ({
        def: makeDef({ action: makeAction({ phase: [asPhaseId('other')] }) }),
        state: makeState({ currentPhase: asPhaseId('main') }),
        move: { actionId: asActionId('op'), params: {} },
      }),
      expectedChoiceReason: 'phaseMismatch',
      expectedApplyMoveReason: ILLEGAL_MOVE_REASONS.ACTION_NOT_LEGAL_IN_CURRENT_STATE,
    },
    {
      name: 'actor not applicable',
      make: () => ({
        def: makeDef({ action: makeAction({ actor: { id: asPlayerId(1) } }) }),
        state: makeState({ activePlayer: asPlayerId(0) }),
        move: { actionId: asActionId('op'), params: {} },
      }),
      expectedChoiceReason: 'actorNotApplicable',
      expectedApplyMoveReason: ILLEGAL_MOVE_REASONS.ACTION_ACTOR_NOT_APPLICABLE,
    },
    {
      name: 'executor not applicable',
      make: () => ({
        def: makeDef({ action: makeAction({ executor: { id: asPlayerId(9) } }) }),
        state: makeState({ activePlayer: asPlayerId(0) }),
        move: { actionId: asActionId('op'), params: {} },
      }),
      expectedChoiceReason: 'executorNotApplicable',
      expectedApplyMoveReason: ILLEGAL_MOVE_REASONS.ACTION_EXECUTOR_NOT_APPLICABLE,
    },
    {
      name: 'action limit exceeded',
      make: () => ({
        def: makeDef({
          action: makeAction({
            id: asActionId('limitedOp'),
            limits: [{ scope: 'phase', max: 1 }],
          }),
        }),
        state: makeState({
          actionUsage: { limitedOp: { turnCount: 0, phaseCount: 1, gameCount: 0 } },
        }),
        move: { actionId: asActionId('limitedOp'), params: {} },
      }),
      expectedChoiceReason: 'actionLimitExceeded',
      expectedApplyMoveReason: ILLEGAL_MOVE_REASONS.ACTION_NOT_LEGAL_IN_CURRENT_STATE,
    },
    {
      name: 'pipeline not applicable',
      make: () => {
        const action = makeAction();
        return {
          def: makeDef({
            action,
            actionPipelines: [
              {
                id: 'op-profile',
                actionId: action.id,
                applicability: { op: '==', left: { ref: 'activePlayer' }, right: 1 },
                legality: null,
                costValidation: null,
                costEffects: [],
                targeting: {},
                stages: [],
                atomicity: 'atomic',
              },
            ],
          }),
          state: makeState({ activePlayer: asPlayerId(0) }),
          move: { actionId: asActionId('op'), params: {} },
        };
      },
      expectedChoiceReason: 'pipelineNotApplicable',
      expectedApplyMoveReason: ILLEGAL_MOVE_REASONS.ACTION_NOT_LEGAL_IN_CURRENT_STATE,
    },
    {
      name: 'pipeline legality failed',
      make: () => {
        const action = makeAction();
        return {
          def: makeDef({
            action,
            actionPipelines: [
              {
                id: 'op-profile',
                actionId: action.id,
                legality: { op: '>=', left: { ref: 'gvar', var: 'resources' }, right: 5 },
                costValidation: null,
                costEffects: [],
                targeting: {},
                stages: [],
                atomicity: 'partial',
              },
            ],
          }),
          state: makeState({ globalVars: { resources: 0 } }),
          move: { actionId: asActionId('op'), params: {} },
        };
      },
      expectedChoiceReason: 'pipelineLegalityFailed',
      expectedApplyMoveReason: ILLEGAL_MOVE_REASONS.ACTION_PIPELINE_LEGALITY_PREDICATE_FAILED,
    },
    {
      name: 'pipeline atomic cost validation failed',
      make: () => {
        const action = makeAction();
        return {
          def: makeDef({
            action,
            actionPipelines: [
              {
                id: 'op-profile',
                actionId: action.id,
                legality: null,
                costValidation: { op: '>=', left: { ref: 'gvar', var: 'resources' }, right: 5 },
                costEffects: [],
                targeting: {},
                stages: [],
                atomicity: 'atomic',
              },
            ],
          }),
          state: makeState({ globalVars: { resources: 0 } }),
          move: { actionId: asActionId('op'), params: {} },
        };
      },
      expectedChoiceReason: 'pipelineAtomicCostValidationFailed',
      expectedApplyMoveReason: ILLEGAL_MOVE_REASONS.ACTION_PIPELINE_COST_VALIDATION_FAILED,
    },
  ];

  for (const scenario of legalScenarioCases) {
    it(`${scenario.name} maps consistently across legalChoicesDiscover, applyMove, and legalMoves`, () => {
      const { def, state, move } = scenario.make();

      assert.deepEqual(legalChoicesDiscover(def, state, move), {
        kind: 'illegal',
        complete: false,
        reason: scenario.expectedChoiceReason,
      });
      assert.equal(legalMoves(def, state).length, 0);
      assert.throws(() => applyMove(def, state, move), (error: unknown) => {
        assert.ok(error instanceof Error);
        const details = error as Error & { code?: unknown; reason?: unknown };
        assert.equal(details.code, 'ILLEGAL_MOVE');
        assert.equal(details.reason, scenario.expectedApplyMoveReason);
        return true;
      });
    });
  }

  type FreeOperationDeniedCauseForParity = Exclude<
    FreeOperationBlockCause,
    'granted' | 'nonCardDrivenTurnOrder' | 'notFreeOperationMove'
  >;

  const freeOperationDeniedMatrix: Readonly<Record<
    FreeOperationDeniedCauseForParity,
    {
      readonly choiceReason: Extract<ChoiceIllegalRequest['reason'],
      | 'freeOperationNoActiveSeatGrant'
      | 'freeOperationSequenceLocked'
      | 'freeOperationActionClassMismatch'
      | 'freeOperationActionIdMismatch'
      | 'freeOperationZoneFilterMismatch'>;
      readonly buildState: () => GameState;
    }
  >> = {
    noActiveSeatGrant: {
      choiceReason: 'freeOperationNoActiveSeatGrant',
      buildState: () =>
        makeState({
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
                  grantId: 'grant-1',
                  seat: '1',
                  operationClass: 'operation',
                  actionIds: ['operation'],
                  remainingUses: 1,
                },
              ],
            },
          },
        }),
    },
    sequenceLocked: {
      choiceReason: 'freeOperationSequenceLocked',
      buildState: () =>
        makeState({
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
                  grantId: 'grant-blocker',
                  seat: '1',
                  operationClass: 'operation',
                  actionIds: ['operation'],
                  sequenceBatchId: 'batch-0',
                  sequenceIndex: 0,
                  remainingUses: 1,
                },
                {
                  grantId: 'grant-active-seat',
                  seat: '0',
                  operationClass: 'operation',
                  actionIds: ['operation'],
                  sequenceBatchId: 'batch-0',
                  sequenceIndex: 1,
                  remainingUses: 1,
                },
              ],
            },
          },
        }),
    },
    actionClassMismatch: {
      choiceReason: 'freeOperationActionClassMismatch',
      buildState: () =>
        makeState({
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
                  seat: '0',
                  operationClass: 'limitedOperation',
                  actionIds: ['operation'],
                  remainingUses: 1,
                },
              ],
            },
          },
        }),
    },
    actionIdMismatch: {
      choiceReason: 'freeOperationActionIdMismatch',
      buildState: () =>
        makeState({
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
                  seat: '0',
                  operationClass: 'operation',
                  actionIds: ['operation-alt'],
                  remainingUses: 1,
                },
              ],
            },
          },
        }),
    },
    zoneFilterMismatch: {
      choiceReason: 'freeOperationZoneFilterMismatch',
      buildState: () =>
        makeState({
          globalVars: { resources: 0 },
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
                  seat: '0',
                  operationClass: 'operation',
                  actionIds: ['operation'],
                  zoneFilter: {
                    op: '==',
                    left: { ref: 'gvar', var: 'resources' },
                    right: 1,
                  },
                  remainingUses: 1,
                },
              ],
            },
          },
        }),
    },
  };

  for (const [cause, scenario] of Object.entries(freeOperationDeniedMatrix) as ReadonlyArray<
    readonly [FreeOperationDeniedCauseForParity, (typeof freeOperationDeniedMatrix)[FreeOperationDeniedCauseForParity]]
  >) {
    it(`projects ${cause} parity for denied free-operation probes`, () => {
      const operationActionId = asActionId('operation');
      const def = makeCardDrivenFreeOpDef(operationActionId);
      const state = scenario.buildState();
      const move: Move = { actionId: operationActionId, params: {}, freeOperation: true };

      assert.deepEqual(legalChoicesDiscover(def, state, move), {
        kind: 'illegal',
        complete: false,
        reason: scenario.choiceReason,
      });
      assert.equal(
        legalMoves(def, state).some((candidate) => candidate.freeOperation === true && candidate.actionId === operationActionId),
        false,
      );
      assert.throws(() => applyMove(def, state, move), (error: unknown) => {
        assert.ok(error instanceof Error);
        const details = error as Error & {
          code?: unknown;
          reason?: unknown;
          context?: { freeOperationDenial?: { cause?: string } };
        };
        assert.equal(details.code, 'ILLEGAL_MOVE');
        assert.equal(details.reason, ILLEGAL_MOVE_REASONS.FREE_OPERATION_NOT_GRANTED);
        assert.equal(details.context?.freeOperationDenial?.cause, cause);
        return true;
      });
    });
  }

  it('prioritizes free-operation denial parity when pipeline is also not applicable', () => {
    const operationActionId = asActionId('operation');
    const baseDef = makeCardDrivenFreeOpDef(operationActionId);
    const def = {
      ...baseDef,
      actionPipelines: [
        {
          id: 'operation-profile',
          actionId: operationActionId,
          applicability: { op: '==', left: { ref: 'activePlayer' }, right: 1 },
          legality: null,
          costValidation: null,
          costEffects: [],
          targeting: {},
          stages: [],
          atomicity: 'partial',
        },
      ],
    } as GameDef;
    const state = makeState({
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
              seat: '0',
              operationClass: 'operation',
              actionIds: ['operation-alt'],
              remainingUses: 1,
            },
          ],
        },
      },
    });
    const move: Move = { actionId: operationActionId, params: {}, freeOperation: true };

    assert.deepEqual(legalChoicesDiscover(def, state, move), {
      kind: 'illegal',
      complete: false,
      reason: 'freeOperationActionIdMismatch',
    });
    assert.equal(
      legalMoves(def, state).some((candidate) => candidate.freeOperation === true && candidate.actionId === operationActionId),
      false,
    );
    assert.throws(() => applyMove(def, state, move), (error: unknown) => {
      assert.ok(error instanceof Error);
      const details = error as Error & {
        code?: unknown;
        reason?: unknown;
        context?: { freeOperationDenial?: { cause?: string } };
      };
      assert.equal(details.code, 'ILLEGAL_MOVE');
      assert.equal(details.reason, ILLEGAL_MOVE_REASONS.FREE_OPERATION_NOT_GRANTED);
      assert.equal(details.context?.freeOperationDenial?.cause, 'actionIdMismatch');
      return true;
    });
  });

  it('keeps free-operation pipeline applicability parity when grants provide zone filters', () => {
    const operationActionId = asActionId('operation');
    const def = {
      metadata: { id: 'free-op-zone-filter-pipeline-parity', players: { min: 2, max: 2 } },
      seats: [{ id: '0' }, { id: '1' }],
      constants: {},
      globalVars: [],
      perPlayerVars: [],
      zones: [
        { id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set', category: 'board' },
        { id: asZoneId('city:none'), owner: 'none', visibility: 'public', ordering: 'set', category: 'city' },
      ],
      tokenTypes: [],
      setup: [],
      turnStructure: { phases: [{ id: asPhaseId('main') }] },
      turnOrder: {
        type: 'cardDriven' as const,
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: { seats: ['0', '1'], overrideWindows: [] },
            optionMatrix: [],
            passRewards: [],
            freeOperationActionIds: [String(operationActionId)],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
          },
        },
      },
      actions: [
        {
          id: operationActionId,
          actor: 'active',
          executor: 'actor',
          phase: [asPhaseId('main')],
          params: [{ name: 'zone', domain: { query: 'zones' } }],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
      ],
      actionPipelines: [
        {
          id: 'operation-profile',
          actionId: operationActionId,
          applicability: {
            op: '==',
            left: { aggregate: { op: 'count', query: { query: 'zones' } } },
            right: 2,
          },
          legality: null,
          costValidation: null,
          costEffects: [],
          targeting: {},
          stages: [],
          atomicity: 'partial',
        },
      ],
      triggers: [],
      terminal: { conditions: [] },
    } as unknown as GameDef;
    const state = makeState({
      zones: { 'board:none': [], 'city:none': [] },
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
              seat: '0',
              operationClass: 'operation',
              actionIds: ['operation'],
              zoneFilter: {
                op: '==',
                left: { ref: 'zoneProp', zone: '$zone', prop: 'category' },
                right: 'board',
              },
              remainingUses: 1,
            },
          ],
        },
      },
    });
    const move: Move = { actionId: operationActionId, params: { zone: 'board:none' }, freeOperation: true };

    assert.deepEqual(legalChoicesDiscover(def, state, move), {
      kind: 'illegal',
      complete: false,
      reason: 'pipelineNotApplicable',
    });
    assert.equal(
      legalMoves(def, state).some((candidate) => candidate.freeOperation === true && candidate.actionId === operationActionId),
      false,
    );
    assert.throws(() => applyMove(def, state, move), (error: unknown) => {
      assert.ok(error instanceof Error);
      const details = error as Error & { code?: unknown; reason?: unknown };
      assert.equal(details.code, 'ILLEGAL_MOVE');
      assert.equal(details.reason, ILLEGAL_MOVE_REASONS.ACTION_NOT_LEGAL_IN_CURRENT_STATE);
      return true;
    });
  });

  const selectorContractCases: ReadonlyArray<{
    readonly name: string;
    readonly make: () => { readonly def: GameDef; readonly state: GameState; readonly move: Move };
    readonly selector: 'actor' | 'executor';
  }> = [
    {
      name: 'invalid actor selector spec',
      make: () => ({
        def: makeDef({
          action: makeAction({
            actor: { badSelector: true } as unknown as ActionDef['actor'],
          }),
        }),
        state: makeState(),
        move: { actionId: asActionId('op'), params: {} },
      }),
      selector: 'actor',
    },
    {
      name: 'invalid executor selector spec',
      make: () => ({
        def: makeDef({
          action: makeAction({
            executor: { badSelector: true } as unknown as ActionDef['executor'],
          }),
        }),
        state: makeState(),
        move: { actionId: asActionId('op'), params: {} },
      }),
      selector: 'executor',
    },
  ];

  for (const scenario of selectorContractCases) {
    it(`${scenario.name} projects typed runtime contract errors across all surfaces`, () => {
      const { def, state, move } = scenario.make();

      const calls: ReadonlyArray<{ readonly surface: 'legalMoves' | 'legalChoices' | 'applyMove'; readonly run: () => unknown }> = [
        { surface: 'legalMoves', run: () => legalMoves(def, state) },
        { surface: 'legalChoices', run: () => legalChoicesDiscover(def, state, move) },
        { surface: 'applyMove', run: () => applyMove(def, state, move) },
      ];

      for (const call of calls) {
        assert.throws(call.run, (error: unknown) => {
          assert.ok(error instanceof Error);
          const details = error as Error & { code?: unknown; context?: Record<string, unknown> };
          assert.equal(details.code, 'RUNTIME_CONTRACT_INVALID');
          assert.equal(details.context?.reason, 'invalidSelectorSpec');
          assert.equal(details.context?.selector, scenario.selector);
          assert.equal(details.context?.surface, call.surface);
          assert.equal(details.context?.actionId, asActionId('op'));
          return true;
        });
      }
    });
  }

  it('projects full ordered selector-contract violations across all runtime surfaces', () => {
    const action = makeAction({
      actor: { chosen: '$actorOwner' },
      executor: { chosen: '$execOwner' },
      params: [],
    });
    const def = makeDef({
      action,
      actionPipelines: [
        {
          id: 'op-profile',
          actionId: action.id,
          applicability: { op: '==', left: 1, right: 1 },
          legality: null,
          costValidation: null,
          costEffects: [],
          targeting: {},
          stages: [],
          atomicity: 'atomic',
        },
      ],
    });
    const state = makeState();
    const move = { actionId: asActionId('op'), params: {} };
    const expectedViolations = [
      { role: 'actor', kind: 'bindingNotDeclared', binding: '$actorOwner' },
      { role: 'executor', kind: 'bindingNotDeclared', binding: '$execOwner' },
      { role: 'executor', kind: 'bindingWithPipelineUnsupported', binding: '$execOwner' },
    ];

    for (const call of [
      { surface: 'legalMoves' as const, run: () => legalMoves(def, state) },
      { surface: 'legalChoices' as const, run: () => legalChoicesDiscover(def, state, move) },
      { surface: 'applyMove' as const, run: () => applyMove(def, state, move) },
    ]) {
      assert.throws(call.run, (error: unknown) => {
        assert.ok(error instanceof Error);
        const details = error as Error & { code?: unknown; context?: Record<string, unknown> };
        assert.equal(details.code, 'RUNTIME_CONTRACT_INVALID');
        assert.equal(details.context?.reason, 'invalidSelectorSpec');
        assert.equal(details.context?.surface, call.surface);
        assert.equal(details.context?.selector, 'actor');
        assert.deepEqual(details.context?.selectorContractViolations, expectedViolations);
        return true;
      });
    }
  });

  it('projects executor-primary selector-contract violations with deterministic ordering across all runtime surfaces', () => {
    const action = makeAction({
      actor: 'active',
      executor: { chosen: '$execOwner' },
      params: [],
    });
    const def = makeDef({
      action,
      actionPipelines: [
        {
          id: 'op-profile',
          actionId: action.id,
          applicability: { op: '==', left: 1, right: 1 },
          legality: null,
          costValidation: null,
          costEffects: [],
          targeting: {},
          stages: [],
          atomicity: 'atomic',
        },
      ],
    });
    const state = makeState();
    const move = { actionId: asActionId('op'), params: {} };
    const expectedViolations = [
      { role: 'executor', kind: 'bindingNotDeclared', binding: '$execOwner' },
      { role: 'executor', kind: 'bindingWithPipelineUnsupported', binding: '$execOwner' },
    ];

    for (const call of [
      { surface: 'legalMoves' as const, run: () => legalMoves(def, state) },
      { surface: 'legalChoices' as const, run: () => legalChoicesDiscover(def, state, move) },
      { surface: 'applyMove' as const, run: () => applyMove(def, state, move) },
    ]) {
      assert.throws(call.run, (error: unknown) => {
        assert.ok(error instanceof Error);
        const details = error as Error & { code?: unknown; context?: Record<string, unknown> };
        assert.equal(details.code, 'RUNTIME_CONTRACT_INVALID');
        assert.equal(details.context?.reason, 'invalidSelectorSpec');
        assert.equal(details.context?.surface, call.surface);
        assert.equal(details.context?.selector, 'executor');
        assert.deepEqual(details.context?.selectorContractViolations, expectedViolations);
        return true;
      });
    }
  });

  it('malformed legality predicate projects typed predicate-evaluation errors across all surfaces', () => {
    const action = makeAction();
    const def = makeDef({
      action,
      actionPipelines: [
        {
          id: 'broken-legality',
          actionId: action.id,
          legality: { op: '>=', left: { ref: 'gvar', var: 'missingVar' }, right: 0 },
          costValidation: null,
          costEffects: [],
          targeting: {},
          stages: [],
          atomicity: 'atomic',
        },
      ],
    });
    const state = makeState();
    const move = { actionId: asActionId('op'), params: {} };

    for (const run of [
      () => legalMoves(def, state),
      () => legalChoicesDiscover(def, state, move),
      () => applyMove(def, state, move),
    ]) {
      assert.throws(run, (error: unknown) => {
        assert.ok(error instanceof Error);
        const details = error as Error & { code?: unknown; context?: Record<string, unknown> };
        assert.equal(details.code, 'ACTION_PIPELINE_PREDICATE_EVALUATION_FAILED');
        assert.equal(details.context?.actionId, asActionId('op'));
        assert.equal(details.context?.profileId, 'broken-legality');
        assert.equal(details.context?.predicate, 'legality');
        assert.equal(details.context?.reason, 'pipelinePredicateEvaluationFailed');
        return true;
      });
    }
  });

  it('keeps decision progression parity for binding export/import through nested control flow', () => {
    const def = makeDef({
      action: makeAction({
        effects: [
          {
            chooseOne: {
              internalDecisionId: 'decision:$mode',
              bind: '$mode',
              options: { query: 'enums', values: ['tokens', 'noop'] },
            },
          },
          {
            let: {
              bind: '$modeCopy',
              value: { ref: 'binding', name: '$mode' },
              in: [
                {
                  if: {
                    when: { op: '==', left: { ref: 'binding', name: '$modeCopy' }, right: 'tokens' },
                    then: [
                      {
                        chooseOne: {
                          internalDecisionId: 'decision:$token',
                          bind: '$token',
                          options: { query: 'tokensInZone', zone: 'board:none' },
                        },
                      },
                    ],
                    else: [],
                  },
                },
              ],
            },
          },
        ],
      }),
    });
    const state = makeState({
      zones: {
        'board:none': [{ id: asTokenId('tok-1'), type: 'piece', props: {} }],
      },
    });

    const trace = assertLegalitySurfaceParityForMove(def, state, {
      actionId: asActionId('op'),
      params: {},
    });
    assert.deepEqual(trace.map((step) => step.requestKind), ['pending', 'pending', 'complete']);
    assert.deepEqual(
      trace.filter((step) => step.requestKind === 'pending').map((step) => step.decisionId),
      ['decision:$mode', 'decision:$token'],
    );
  });

  it('keeps decision progression parity for nested branch-specific choices', () => {
    const def = makeDef({
      action: makeAction({
        effects: [
          {
            chooseOne: {
              internalDecisionId: 'decision:$branch',
              bind: '$branch',
              options: { query: 'enums', values: ['then', 'else'] },
            },
          },
          {
            if: {
              when: { op: '==', left: { ref: 'binding', name: '$branch' }, right: 'then' },
              then: [
                {
                  if: {
                    when: true,
                    then: [
                      {
                        chooseN: {
                          internalDecisionId: 'decision:$targets',
                          bind: '$targets',
                          options: { query: 'enums', values: ['a', 'b'] },
                          min: 1,
                          max: 1,
                        },
                      },
                    ],
                    else: [],
                  },
                },
              ],
              else: [
                {
                  chooseOne: {
                    internalDecisionId: 'decision:$fallback',
                    bind: '$fallback',
                    options: { query: 'enums', values: ['x'] },
                  },
                },
              ],
            },
          },
        ],
      }),
    });
    const state = makeState();

    const trace = assertLegalitySurfaceParityForMove(def, state, {
      actionId: asActionId('op'),
      params: {},
    });
    assert.deepEqual(trace.map((step) => step.requestKind), ['pending', 'pending', 'complete']);
    assert.deepEqual(
      trace.filter((step) => step.requestKind === 'pending').map((step) => step.decisionId),
      ['decision:$branch', 'decision:$targets'],
    );
  });

  it('parity helper emits divergence diagnostics with surface + step + action context', () => {
    const def = makeDef({
      action: makeAction({
        effects: [
          {
            chooseOne: {
              internalDecisionId: 'decision:$mode',
              bind: '$mode',
              options: { query: 'enums', values: ['x'] },
            },
          },
        ],
      }),
    });
    const state = makeState();
    const move = { actionId: asActionId('op'), params: {} };

    assert.throws(
      () =>
        assertLegalitySurfaceParityForMove(def, state, move, {
          probeActionPresence: () => false,
        }),
      /surface=legalMoves step=0 actionId=op/,
    );
  });

  it('fails fast when canonical chooser cannot resolve a pending decision', () => {
    const def = makeDef({
      action: makeAction({
        effects: [
          {
            chooseOne: {
              internalDecisionId: 'decision:$target',
              bind: '$target',
              options: { query: 'enums', values: [] },
            },
          },
        ],
      }),
    });
    const state = makeState();
    const move = { actionId: asActionId('op'), params: {} };

    assert.throws(
      () => assertLegalitySurfaceParityForMove(def, state, move),
      /surface=legalChoices step=0 actionId=op: no value selected for pending decision decision:\$target/,
    );
  });
});
