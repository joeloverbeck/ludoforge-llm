import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { makeExecutionEffectContext, type EffectContextTestOverrides } from '../helpers/effect-context-test-helpers.js';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  buildAdjacencyGraph,
  createCollector,
  createRng,
  isEffectErrorCode,
  applyEffects,
  TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS,
  type EffectAST,
  type EffectContext,
  type GameDef,
  type GameState,
} from '../../src/kernel/index.js';

import {
  applyGrantFreeOperation as applyGrantFreeOperationNative,
  applyGotoPhaseExact as applyGotoPhaseExactNative,
  applyAdvancePhase as applyAdvancePhaseNative,
  applyPushInterruptPhase as applyPushInterruptPhaseNative,
  applyPopInterruptPhase as applyPopInterruptPhaseNative,
} from '../../src/kernel/effects-turn-flow.js';
import { toEffectEnv, toEffectCursor } from '../../src/kernel/effect-context.js';
import type { EffectBudgetState } from '../../src/kernel/effects-control.js';
import type { ApplyEffectsWithBudget } from '../../src/kernel/effect-registry.js';

const dummyBudget: EffectBudgetState = { remaining: 10_000, max: 10_000 };
const dummyApplyBatch: ApplyEffectsWithBudget = () => { throw new Error('unexpected applyBatch call'); };

type SimpleHandler<E> = (effect: E, ctx: EffectContext) => import('../../src/kernel/effect-context.js').EffectResult;
const adaptHandler = <E>(native: (effect: E, env: import('../../src/kernel/effect-context.js').EffectEnv, cursor: import('../../src/kernel/effect-context.js').EffectCursor, budget: EffectBudgetState, applyBatch: ApplyEffectsWithBudget) => import('../../src/kernel/effect-context.js').EffectResult): SimpleHandler<E> =>
  (effect, ctx) => native(effect, toEffectEnv(ctx), toEffectCursor(ctx), dummyBudget, dummyApplyBatch);

const applyGrantFreeOperation = adaptHandler(applyGrantFreeOperationNative);
const applyGotoPhaseExact = adaptHandler(applyGotoPhaseExactNative);
const applyAdvancePhase = adaptHandler(applyAdvancePhaseNative);
const applyPushInterruptPhase = adaptHandler(applyPushInterruptPhaseNative);
const applyPopInterruptPhase = adaptHandler(applyPopInterruptPhaseNative);

const makeDef = (overrides?: Partial<GameDef>): GameDef =>
  ({
    metadata: { id: 'turn-flow-test', players: { min: 2, max: 4 } },
    seats: [{ id: '0' }, { id: '1' }, { id: '2' }, { id: '3' }],
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zoneVars: [],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: {
      phases: [
        { id: asPhaseId('setup') },
        { id: asPhaseId('main') },
        { id: asPhaseId('cleanup') },
      ],
      interrupts: [
        { id: asPhaseId('coup') },
      ],
    },
    turnOrder: {
      type: 'cardDriven',
      config: {
        turnFlow: {
          cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
          eligibility: { seats: ['0', '1', '2', '3'] },
          windows: [],
          actionClassByActionId: { attack: 'operation', defend: 'limitedOperation' },
          optionMatrix: [],
          passRewards: [],
          durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
        },
      },
    },
    actions: [
      {
        id: asActionId('attack'),
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
    ...overrides,
  }) as unknown as GameDef;

const makeCardDrivenState = (overrides?: Partial<GameState>): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  zoneVars: {},
  playerCount: 4,
  zones: {},
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
  stateHash: 0n,
  actionUsage: {},
  turnOrderState: {
    type: 'cardDriven',
    runtime: {
      seatOrder: ['0', '1', '2', '3'],
      eligibility: { '0': true, '1': true, '2': true, '3': true },
      currentCard: {
        firstEligible: '0',
        secondEligible: '1',
        actedSeats: [],
        passedSeats: [],
        nonPassCount: 0,
        firstActionClass: null,
      },
    },
  },
  markers: {},
  ...overrides,
});

const makeCtx = (overrides?: EffectContextTestOverrides): EffectContext => makeExecutionEffectContext({
  def: makeDef(),
  adjacencyGraph: buildAdjacencyGraph([]),
  state: makeCardDrivenState(),
  rng: createRng(42n),
  activePlayer: asPlayerId(0),
  actorPlayer: asPlayerId(0),
  bindings: {},
  moveParams: {},
  collector: createCollector(),
  ...overrides,
});

describe('applyGrantFreeOperation', () => {
  it('throws when turn order state is not cardDriven', () => {
    const ctx = makeCtx({
      state: {
        ...makeCardDrivenState(),
        turnOrderState: { type: 'roundRobin' },
      },
    });
    const effect = {
      grantFreeOperation: { seat: 'self', operationClass: 'operation' },
    } as unknown as Extract<EffectAST, { readonly grantFreeOperation: unknown }>;

    assert.throws(() => applyGrantFreeOperation(effect, ctx), (err: unknown) =>
      isEffectErrorCode(err, 'EFFECT_RUNTIME'),
    );
  });

  it('throws for invalid operationClass', () => {
    const ctx = makeCtx();
    const effect = {
      grantFreeOperation: { seat: 'self', operationClass: 'invalidClass' },
    } as unknown as Extract<EffectAST, { readonly grantFreeOperation: unknown }>;

    assert.throws(() => applyGrantFreeOperation(effect, ctx), (err: unknown) =>
      isEffectErrorCode(err, 'EFFECT_RUNTIME'),
    );
  });

  it('throws for invalid viabilityPolicy', () => {
    const ctx = makeCtx();
    const effect = {
      grantFreeOperation: {
        seat: 'self',
        operationClass: 'operation',
        viabilityPolicy: 'invalidPolicy',
      },
    } as unknown as Extract<EffectAST, { readonly grantFreeOperation: unknown }>;

    assert.throws(() => applyGrantFreeOperation(effect, ctx), (err: unknown) => {
      if (!isEffectErrorCode(err, 'EFFECT_RUNTIME')) {
        return false;
      }
      assert.equal(err.context?.effectType, 'grantFreeOperation');
      assert.match(String(err.message), /grantFreeOperation\.viabilityPolicy is invalid/i);
      return true;
    });
  });

  it('throws when required grantFreeOperation omits postResolutionTurnFlow', () => {
    const ctx = makeCtx();
    const effect = {
      grantFreeOperation: {
        seat: 'self',
        operationClass: 'operation',
        completionPolicy: 'required',
      },
    } as unknown as Extract<EffectAST, { readonly grantFreeOperation: unknown }>;

    assert.throws(() => applyGrantFreeOperation(effect, ctx), (err: unknown) => {
      if (!isEffectErrorCode(err, 'EFFECT_RUNTIME')) {
        return false;
      }
      assert.equal(err.context?.effectType, 'grantFreeOperation');
      assert.match(String(err.message), /postResolutionTurnFlow is required/i);
      return true;
    });
  });

  it('throws when postResolutionTurnFlow is set without completionPolicy required', () => {
    const ctx = makeCtx();
    const effect = {
      grantFreeOperation: {
        seat: 'self',
        operationClass: 'operation',
        postResolutionTurnFlow: 'resumeCardFlow',
      },
    } as unknown as Extract<EffectAST, { readonly grantFreeOperation: unknown }>;

    assert.throws(() => applyGrantFreeOperation(effect, ctx), (err: unknown) => {
      if (!isEffectErrorCode(err, 'EFFECT_RUNTIME')) {
        return false;
      }
      assert.equal(err.context?.effectType, 'grantFreeOperation');
      assert.match(String(err.message), /requires completionPolicy: required/i);
      return true;
    });
  });

  it('throws when sequenceContext is set without sequence using the shared contract surface text', () => {
    const ctx = makeCtx();
    const effect = {
      grantFreeOperation: {
        seat: 'self',
        operationClass: 'operation',
        sequenceContext: { captureMoveZoneCandidatesAs: 'selected-space' },
      },
    } as unknown as Extract<EffectAST, { readonly grantFreeOperation: unknown }>;

    assert.throws(() => applyGrantFreeOperation(effect, ctx), (err: unknown) => {
      if (!isEffectErrorCode(err, 'EFFECT_RUNTIME')) {
        return false;
      }
      assert.equal(err.context?.effectType, 'grantFreeOperation');
      assert.match(String(err.message), /grantFreeOperation\.sequenceContext requires grantFreeOperation\.sequence/i);
      return true;
    });
  });

  it('throws when sequenceContext omits both capture and require keys', () => {
    const ctx = makeCtx();
    const effect = {
      grantFreeOperation: {
        seat: 'self',
        operationClass: 'operation',
        sequence: { batch: 'ctx-chain', step: 0 },
        sequenceContext: {},
      },
    } as unknown as Extract<EffectAST, { readonly grantFreeOperation: unknown }>;

    assert.throws(() => applyGrantFreeOperation(effect, ctx), (err: unknown) => {
      if (!isEffectErrorCode(err, 'EFFECT_RUNTIME')) {
        return false;
      }
      assert.equal(err.context?.effectType, 'grantFreeOperation');
      assert.match(String(err.message), /grantFreeOperation\.sequenceContext must declare at least one capture\/require key/i);
      return true;
    });
  });

  it('throws when sequence.step is negative using the shared contract surface text', () => {
    const ctx = makeCtx();
    const effect = {
      grantFreeOperation: {
        seat: 'self',
        operationClass: 'operation',
        sequence: { batch: 'ctx-chain', step: -1 },
      },
    } as unknown as Extract<EffectAST, { readonly grantFreeOperation: unknown }>;

    assert.throws(() => applyGrantFreeOperation(effect, ctx), (err: unknown) => {
      if (!isEffectErrorCode(err, 'EFFECT_RUNTIME')) {
        return false;
      }
      assert.equal(err.context?.effectType, 'grantFreeOperation');
      assert.match(String(err.message), /grantFreeOperation\.sequence\.step must be a non-negative integer/i);
      return true;
    });
  });

  it('keeps explicit postResolutionTurnFlow on emitted required pending grants', () => {
    const ctx = makeCtx();
    const effect = {
      grantFreeOperation: {
        seat: 'self',
        operationClass: 'operation',
        completionPolicy: 'required',
        postResolutionTurnFlow: 'resumeCardFlow',
      },
    } as unknown as Extract<EffectAST, { readonly grantFreeOperation: unknown }>;

    const result = applyGrantFreeOperation(effect, ctx);
    const tos = result.state.turnOrderState;
    assert.equal(tos.type, 'cardDriven');
    if (tos.type !== 'cardDriven') return;
    const grants = tos.runtime.pendingFreeOperationGrants ?? [];
    assert.equal(grants[0]?.postResolutionTurnFlow, 'resumeCardFlow');
  });

  it('resolves "self" seat to active player', () => {
    const ctx = makeCtx();
    const effect = {
      grantFreeOperation: { seat: 'self', operationClass: 'operation' },
    } as unknown as Extract<EffectAST, { readonly grantFreeOperation: unknown }>;

    const result = applyGrantFreeOperation(effect, ctx);
    const tos = result.state.turnOrderState;
    assert.equal(tos.type, 'cardDriven');
    if (tos.type !== 'cardDriven') return;
    const grants = tos.runtime.pendingFreeOperationGrants ?? [];
    assert.equal(grants.length, 1);
    assert.equal(grants[0]!.seat, '0');
  });

  it('resolves named seat correctly', () => {
    const ctx = makeCtx();
    const effect = {
      grantFreeOperation: { seat: '2', operationClass: 'operation' },
    } as unknown as Extract<EffectAST, { readonly grantFreeOperation: unknown }>;

    const result = applyGrantFreeOperation(effect, ctx);
    const tos = result.state.turnOrderState;
    if (tos.type !== 'cardDriven') throw new Error('Expected cardDriven');
    const grants = tos.runtime.pendingFreeOperationGrants ?? [];
    assert.equal(grants[0]!.seat, '2');
  });

  it('throws for unknown seat', () => {
    const ctx = makeCtx();
    const effect = {
      grantFreeOperation: { seat: 'unknownSeat', operationClass: 'operation' },
    } as unknown as Extract<EffectAST, { readonly grantFreeOperation: unknown }>;

    assert.throws(() => applyGrantFreeOperation(effect, ctx), (err: unknown) =>
      isEffectErrorCode(err, 'EFFECT_RUNTIME'),
    );
  });

  it('throws when self seat cannot resolve from canonical seat ids', () => {
    const ctx = makeCtx({
      def: makeDef({
        seats: [{ id: 'us' }, { id: 'nva' }, { id: 'arvn' }, { id: 'vc' }],
      }),
    });
    const effect = {
      grantFreeOperation: { seat: 'self', operationClass: 'operation' },
    } as unknown as Extract<EffectAST, { readonly grantFreeOperation: unknown }>;

    assert.throws(() => applyGrantFreeOperation(effect, ctx), (err: unknown) => {
      if (!isEffectErrorCode(err, 'EFFECT_RUNTIME')) {
        return false;
      }
      assert.equal(err.context?.reason, 'turnFlowRuntimeValidationFailed');
      assert.equal(err.context?.effectType, 'grantFreeOperation');
      assert.equal(err.context?.invariant, 'turnFlow.activeSeat.unresolvable');
      assert.equal(err.context?.surface, TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS.FREE_OPERATION_GRANT_APPLICATION);
      assert.equal(err.context?.activePlayer, 0);
      assert.deepEqual(err.context?.seatOrder, ['0', '1', '2', '3']);
      assert.match(String(err.message), /turnFlow\.activeSeat\.freeOperationGrantApplication could not resolve active seat/i);
      return true;
    });
  });

  it('generates unique grant IDs', () => {
    const ctx = makeCtx();
    const effect = {
      grantFreeOperation: { seat: 'self', operationClass: 'operation' },
    } as unknown as Extract<EffectAST, { readonly grantFreeOperation: unknown }>;

    const result1 = applyGrantFreeOperation(effect, ctx);
    const ctx2 = makeCtx({ state: result1.state });
    const result2 = applyGrantFreeOperation(effect, ctx2);

    const tos = result2.state.turnOrderState;
    if (tos.type !== 'cardDriven') throw new Error('Expected cardDriven');
    const grants = tos.runtime.pendingFreeOperationGrants ?? [];
    assert.equal(grants.length, 2);
    assert.notEqual(grants[0]!.grantId, grants[1]!.grantId);
  });

  it('sets remainingUses from grant.uses', () => {
    const ctx = makeCtx();
    const effect = {
      grantFreeOperation: { seat: 'self', operationClass: 'operation', uses: 3 },
    } as unknown as Extract<EffectAST, { readonly grantFreeOperation: unknown }>;

    const result = applyGrantFreeOperation(effect, ctx);
    const tos = result.state.turnOrderState;
    if (tos.type !== 'cardDriven') throw new Error('Expected cardDriven');
    const grants = tos.runtime.pendingFreeOperationGrants ?? [];
    assert.equal(grants[0]!.remainingUses, 3);
  });

  it('throws for non-positive uses', () => {
    const ctx = makeCtx();
    const effect = {
      grantFreeOperation: { seat: 'self', operationClass: 'operation', uses: 0 },
    } as unknown as Extract<EffectAST, { readonly grantFreeOperation: unknown }>;

    assert.throws(() => applyGrantFreeOperation(effect, ctx), (err: unknown) =>
      isEffectErrorCode(err, 'EFFECT_RUNTIME'),
    );
  });

  it('keeps explicit viabilityPolicy on emitted pending grants', () => {
    const ctx = makeCtx();
    const effect = {
      grantFreeOperation: {
        seat: 'self',
        operationClass: 'operation',
        viabilityPolicy: 'emitAlways',
      },
    } as unknown as Extract<EffectAST, { readonly grantFreeOperation: unknown }>;

    const result = applyGrantFreeOperation(effect, ctx);
    const tos = result.state.turnOrderState;
    if (tos.type !== 'cardDriven') throw new Error('Expected cardDriven');
    const grants = tos.runtime.pendingFreeOperationGrants ?? [];
    assert.equal(grants.length, 1);
    assert.equal(grants[0]?.viabilityPolicy, 'emitAlways');
  });

  it('suppresses effect-issued grants when viabilityPolicy requires current usability and probe fails', () => {
    const ctx = makeCtx();
    const effect = {
      grantFreeOperation: {
        seat: 'self',
        operationClass: 'operation',
        actionIds: ['attack'],
        viabilityPolicy: 'requireUsableAtIssue',
        zoneFilter: { op: '==', left: 1, right: 2 },
      },
    } as unknown as Extract<EffectAST, { readonly grantFreeOperation: unknown }>;

    const result = applyGrantFreeOperation(effect, ctx);
    const tos = result.state.turnOrderState;
    if (tos.type !== 'cardDriven') throw new Error('Expected cardDriven');
    const grants = tos.runtime.pendingFreeOperationGrants ?? [];
    assert.equal(grants.length, 0);
  });

  it('emits sequence-later effect-issued grants in non-event effect contexts when earlier sequence steps are usable', () => {
    const ctx = makeCtx();
    const result = applyEffects(
      [
        {
          grantFreeOperation: {
            seat: 'self',
            operationClass: 'operation',
            actionIds: ['attack'],
            viabilityPolicy: 'requireUsableAtIssue',
            sequence: { batch: 'usable-sequence', step: 0 },
          },
        },
        {
          grantFreeOperation: {
            seat: 'self',
            operationClass: 'operation',
            actionIds: ['attack'],
            viabilityPolicy: 'requireUsableAtIssue',
            sequence: { batch: 'usable-sequence', step: 1 },
          },
        },
      ],
      ctx,
    );
    const tos = result.state.turnOrderState;
    if (tos.type !== 'cardDriven') throw new Error('Expected cardDriven');
    const grants = tos.runtime.pendingFreeOperationGrants ?? [];
    assert.equal(grants.length, 2);
    assert.deepEqual(grants.map((grant) => grant.sequenceIndex), [0, 1]);
  });

  it('suppresses sequence-later effect-issued grants in non-event effect contexts when earlier sequence steps are unusable', () => {
    const ctx = makeCtx();
    const result = applyEffects(
      [
        {
          grantFreeOperation: {
            seat: 'self',
            operationClass: 'operation',
            actionIds: ['attack'],
            viabilityPolicy: 'requireUsableAtIssue',
            sequence: { batch: 'unusable-sequence', step: 0 },
            zoneFilter: { op: '==', left: 1, right: 2 },
          },
        },
        {
          grantFreeOperation: {
            seat: 'self',
            operationClass: 'operation',
            actionIds: ['attack'],
            viabilityPolicy: 'requireUsableAtIssue',
            sequence: { batch: 'unusable-sequence', step: 1 },
          },
        },
      ],
      ctx,
    );
    const tos = result.state.turnOrderState;
    if (tos.type !== 'cardDriven') throw new Error('Expected cardDriven');
    const grants = tos.runtime.pendingFreeOperationGrants ?? [];
    assert.equal(grants.length, 0);
  });

  it('emits nested sequence-later effect-issued grants when earlier nested sequence steps are usable', () => {
    const ctx = makeCtx();
    const result = applyEffects(
      [
        {
          if: {
            when: { op: '==', left: 1, right: 1 },
            then: [
              {
                grantFreeOperation: {
                  seat: 'self',
                  operationClass: 'operation',
                  actionIds: ['attack'],
                  viabilityPolicy: 'requireUsableAtIssue',
                  sequence: { batch: 'nested-usable-sequence', step: 0 },
                },
              },
              {
                grantFreeOperation: {
                  seat: 'self',
                  operationClass: 'operation',
                  actionIds: ['attack'],
                  viabilityPolicy: 'requireUsableAtIssue',
                  sequence: { batch: 'nested-usable-sequence', step: 1 },
                },
              },
            ],
          },
        },
      ],
      ctx,
    );
    const tos = result.state.turnOrderState;
    if (tos.type !== 'cardDriven') throw new Error('Expected cardDriven');
    const grants = tos.runtime.pendingFreeOperationGrants ?? [];
    assert.equal(grants.length, 2);
    assert.deepEqual(grants.map((grant) => grant.sequenceIndex), [0, 1]);
  });

  it('suppresses nested sequence-later effect-issued grants when earlier nested sequence steps are unusable', () => {
    const ctx = makeCtx();
    const result = applyEffects(
      [
        {
          if: {
            when: { op: '==', left: 1, right: 1 },
            then: [
              {
                grantFreeOperation: {
                  seat: 'self',
                  operationClass: 'operation',
                  actionIds: ['attack'],
                  viabilityPolicy: 'requireUsableAtIssue',
                  sequence: { batch: 'nested-unusable-sequence', step: 0 },
                  zoneFilter: { op: '==', left: 1, right: 2 },
                },
              },
              {
                grantFreeOperation: {
                  seat: 'self',
                  operationClass: 'operation',
                  actionIds: ['attack'],
                  viabilityPolicy: 'requireUsableAtIssue',
                  sequence: { batch: 'nested-unusable-sequence', step: 1 },
                },
              },
            ],
          },
        },
      ],
      ctx,
    );
    const tos = result.state.turnOrderState;
    if (tos.type !== 'cardDriven') throw new Error('Expected cardDriven');
    const grants = tos.runtime.pendingFreeOperationGrants ?? [];
    assert.equal(grants.length, 0);
  });

  it('records skippedStepIndices for implementWhatCanInOrder effect-issued sequences and still emits later usable steps', () => {
    const ctx = makeCtx();
    const result = applyEffects(
      [
        {
          grantFreeOperation: {
            seat: 'self',
            operationClass: 'operation',
            actionIds: ['attack'],
            viabilityPolicy: 'requireUsableAtIssue',
            sequence: { batch: 'implement-what-can', step: 0, progressionPolicy: 'implementWhatCanInOrder' },
            zoneFilter: { op: '==', left: 1, right: 2 },
          },
        },
        {
          grantFreeOperation: {
            seat: 'self',
            operationClass: 'operation',
            actionIds: ['attack'],
            viabilityPolicy: 'requireUsableAtIssue',
            sequence: { batch: 'implement-what-can', step: 1, progressionPolicy: 'implementWhatCanInOrder' },
          },
        },
      ],
      ctx,
    );
    const tos = result.state.turnOrderState;
    if (tos.type !== 'cardDriven') throw new Error('Expected cardDriven');
    const grants = tos.runtime.pendingFreeOperationGrants ?? [];
    assert.equal(grants.length, 1);
    assert.deepEqual(grants.map((grant) => grant.sequenceIndex), [1]);
    const sequenceBatchId = grants[0]?.sequenceBatchId;
    assert.notEqual(sequenceBatchId, undefined);
    assert.deepEqual(tos.runtime.freeOperationSequenceContexts?.[sequenceBatchId!], {
      capturedMoveZonesByKey: {},
      progressionPolicy: 'implementWhatCanInOrder',
      skippedStepIndices: [0],
    });
  });

  it('preserves strictInOrder suppression without recording skippedStepIndices', () => {
    const ctx = makeCtx();
    const result = applyEffects(
      [
        {
          grantFreeOperation: {
            seat: 'self',
            operationClass: 'operation',
            actionIds: ['attack'],
            viabilityPolicy: 'requireUsableAtIssue',
            sequence: { batch: 'strict-sequence', step: 0, progressionPolicy: 'strictInOrder' },
            zoneFilter: { op: '==', left: 1, right: 2 },
          },
        },
        {
          grantFreeOperation: {
            seat: 'self',
            operationClass: 'operation',
            actionIds: ['attack'],
            viabilityPolicy: 'requireUsableAtIssue',
            sequence: { batch: 'strict-sequence', step: 1, progressionPolicy: 'strictInOrder' },
          },
        },
      ],
      ctx,
    );
    const tos = result.state.turnOrderState;
    if (tos.type !== 'cardDriven') throw new Error('Expected cardDriven');
    assert.deepEqual(tos.runtime.pendingFreeOperationGrants ?? [], []);
    assert.equal(tos.runtime.freeOperationSequenceContexts, undefined);
  });

  it('suppresses later strictInOrder effect-issued grants even when only the earlier step requests issue-time usability gating', () => {
    const ctx = makeCtx();
    const result = applyEffects(
      [
        {
          grantFreeOperation: {
            seat: 'self',
            operationClass: 'operation',
            actionIds: ['attack'],
            viabilityPolicy: 'requireUsableAtIssue',
            sequence: { batch: 'strict-sequence-no-policy-later', step: 0, progressionPolicy: 'strictInOrder' },
            zoneFilter: { op: '==', left: 1, right: 2 },
          },
        },
        {
          grantFreeOperation: {
            seat: 'self',
            operationClass: 'operation',
            actionIds: ['attack'],
            sequence: { batch: 'strict-sequence-no-policy-later', step: 1, progressionPolicy: 'strictInOrder' },
          },
        },
      ],
      ctx,
    );
    const tos = result.state.turnOrderState;
    if (tos.type !== 'cardDriven') throw new Error('Expected cardDriven');
    assert.deepEqual(tos.runtime.pendingFreeOperationGrants ?? [], []);
    assert.equal(tos.runtime.freeOperationSequenceContexts, undefined);
  });

  it('keeps strictInOrder suppression scoped to the blocked effect-issued batch', () => {
    const ctx = makeCtx();
    const result = applyEffects(
      [
        {
          grantFreeOperation: {
            seat: 'self',
            operationClass: 'operation',
            actionIds: ['attack'],
            viabilityPolicy: 'requireUsableAtIssue',
            sequence: { batch: 'strict-sequence-batch-a', step: 0, progressionPolicy: 'strictInOrder' },
            zoneFilter: { op: '==', left: 1, right: 2 },
          },
        },
        {
          grantFreeOperation: {
            seat: 'self',
            operationClass: 'operation',
            actionIds: ['attack'],
            sequence: { batch: 'strict-sequence-batch-a', step: 1, progressionPolicy: 'strictInOrder' },
          },
        },
        {
          grantFreeOperation: {
            seat: 'self',
            operationClass: 'operation',
            actionIds: ['attack'],
            sequence: { batch: 'strict-sequence-batch-b', step: 0, progressionPolicy: 'strictInOrder' },
          },
        },
      ],
      ctx,
    );
    const tos = result.state.turnOrderState;
    if (tos.type !== 'cardDriven') throw new Error('Expected cardDriven');
    assert.equal(tos.runtime.pendingFreeOperationGrants?.length, 1);
    assert.equal(tos.runtime.pendingFreeOperationGrants?.[0]?.sequenceBatchId?.endsWith(':strict-sequence-batch-b'), true);
    assert.equal(tos.runtime.pendingFreeOperationGrants?.[0]?.sequenceIndex, 0);
    assert.deepEqual(tos.runtime.freeOperationSequenceContexts, {
      'freeOpEffect:0:strict-sequence-batch-b': {
        capturedMoveZonesByKey: {},
        progressionPolicy: 'strictInOrder',
        skippedStepIndices: [],
      },
    });
  });
});

describe('applyGotoPhaseExact', () => {
  it('throws for unknown target phase', () => {
    const ctx = makeCtx();
    const effect = {
      gotoPhaseExact: { phase: 'nonExistent' },
    } as unknown as Extract<EffectAST, { readonly gotoPhaseExact: unknown }>;

    assert.throws(() => applyGotoPhaseExact(effect, ctx), (err: unknown) =>
      isEffectErrorCode(err, 'EFFECT_RUNTIME'),
    );
  });

  it('returns same state for same-phase no-op', () => {
    const ctx = makeCtx();
    const effect = {
      gotoPhaseExact: { phase: 'main' },
    } as unknown as Extract<EffectAST, { readonly gotoPhaseExact: unknown }>;

    const result = applyGotoPhaseExact(effect, ctx);
    assert.equal(result.state.currentPhase, ctx.state.currentPhase);
  });

  it('throws for backward phase transition', () => {
    const ctx = makeCtx({
      state: makeCardDrivenState({ currentPhase: asPhaseId('cleanup') }),
    });
    const effect = {
      gotoPhaseExact: { phase: 'setup' },
    } as unknown as Extract<EffectAST, { readonly gotoPhaseExact: unknown }>;

    assert.throws(() => applyGotoPhaseExact(effect, ctx), (err: unknown) =>
      isEffectErrorCode(err, 'EFFECT_RUNTIME'),
    );
  });

  it('transitions forward to target phase', () => {
    const ctx = makeCtx({
      state: makeCardDrivenState({ currentPhase: asPhaseId('setup') }),
    });
    const effect = {
      gotoPhaseExact: { phase: 'cleanup' },
    } as unknown as Extract<EffectAST, { readonly gotoPhaseExact: unknown }>;

    const result = applyGotoPhaseExact(effect, ctx);
    assert.equal(result.state.currentPhase, asPhaseId('cleanup'));
  });

  it('respects phase transition budget exhaustion', () => {
    const ctx = makeCtx({
      state: makeCardDrivenState({ currentPhase: asPhaseId('setup') }),
      phaseTransitionBudget: { remaining: 0 },
    });
    const effect = {
      gotoPhaseExact: { phase: 'main' },
    } as unknown as Extract<EffectAST, { readonly gotoPhaseExact: unknown }>;

    const result = applyGotoPhaseExact(effect, ctx);
    assert.equal(result.state.currentPhase, asPhaseId('setup')); // unchanged
  });
});

describe('applyAdvancePhase', () => {
  it('advances to next phase in sequence', () => {
    const ctx = makeCtx({
      state: makeCardDrivenState({ currentPhase: asPhaseId('setup') }),
    });
    const effect = {
      advancePhase: {},
    } as unknown as Extract<EffectAST, { readonly advancePhase: unknown }>;

    const result = applyAdvancePhase(effect, ctx);
    assert.equal(result.state.currentPhase, asPhaseId('main'));
  });

  it('respects phase transition budget exhaustion', () => {
    const ctx = makeCtx({
      state: makeCardDrivenState({ currentPhase: asPhaseId('setup') }),
      phaseTransitionBudget: { remaining: 0 },
    });
    const effect = {
      advancePhase: {},
    } as unknown as Extract<EffectAST, { readonly advancePhase: unknown }>;

    const result = applyAdvancePhase(effect, ctx);
    assert.equal(result.state.currentPhase, asPhaseId('setup')); // unchanged
  });
});

describe('applyPushInterruptPhase', () => {
  it('pushes interrupt phase onto stack', () => {
    const ctx = makeCtx();
    const effect = {
      pushInterruptPhase: { phase: 'coup', resumePhase: 'main' },
    } as unknown as Extract<EffectAST, { readonly pushInterruptPhase: unknown }>;

    const result = applyPushInterruptPhase(effect, ctx);
    assert.equal(result.state.currentPhase, asPhaseId('coup'));
    const stack = result.state.interruptPhaseStack ?? [];
    assert.equal(stack.length, 1);
    assert.equal(stack[0]!.phase, asPhaseId('coup'));
    assert.equal(stack[0]!.resumePhase, asPhaseId('main'));
  });

  it('throws for unknown phase', () => {
    const ctx = makeCtx();
    const effect = {
      pushInterruptPhase: { phase: 'nonExistent', resumePhase: 'main' },
    } as unknown as Extract<EffectAST, { readonly pushInterruptPhase: unknown }>;

    assert.throws(() => applyPushInterruptPhase(effect, ctx), (err: unknown) =>
      isEffectErrorCode(err, 'EFFECT_RUNTIME'),
    );
  });

  it('throws for unknown resumePhase', () => {
    const ctx = makeCtx();
    const effect = {
      pushInterruptPhase: { phase: 'coup', resumePhase: 'nonExistent' },
    } as unknown as Extract<EffectAST, { readonly pushInterruptPhase: unknown }>;

    assert.throws(() => applyPushInterruptPhase(effect, ctx), (err: unknown) =>
      isEffectErrorCode(err, 'EFFECT_RUNTIME'),
    );
  });

  it('respects phase transition budget exhaustion', () => {
    const ctx = makeCtx({
      phaseTransitionBudget: { remaining: 0 },
    });
    const effect = {
      pushInterruptPhase: { phase: 'coup', resumePhase: 'main' },
    } as unknown as Extract<EffectAST, { readonly pushInterruptPhase: unknown }>;

    const result = applyPushInterruptPhase(effect, ctx);
    assert.equal(result.state.currentPhase, asPhaseId('main')); // unchanged
  });
});

describe('applyPopInterruptPhase', () => {
  it('throws when interrupt stack is empty', () => {
    const ctx = makeCtx();
    const effect = {
      popInterruptPhase: {},
    } as unknown as Extract<EffectAST, { readonly popInterruptPhase: unknown }>;

    assert.throws(() => applyPopInterruptPhase(effect, ctx), (err: unknown) =>
      isEffectErrorCode(err, 'EFFECT_RUNTIME'),
    );
  });

  it('pops stack and resumes to correct phase', () => {
    const ctx = makeCtx({
      state: makeCardDrivenState({
        currentPhase: asPhaseId('coup'),
        interruptPhaseStack: [
          { phase: asPhaseId('coup'), resumePhase: asPhaseId('main') },
        ],
      }),
    });
    const effect = {
      popInterruptPhase: {},
    } as unknown as Extract<EffectAST, { readonly popInterruptPhase: unknown }>;

    const result = applyPopInterruptPhase(effect, ctx);
    assert.equal(result.state.currentPhase, asPhaseId('main'));
    const stack = result.state.interruptPhaseStack;
    assert.ok(stack === undefined || stack.length === 0);
  });

  it('respects phase transition budget exhaustion', () => {
    const ctx = makeCtx({
      state: makeCardDrivenState({
        currentPhase: asPhaseId('coup'),
        interruptPhaseStack: [
          { phase: asPhaseId('coup'), resumePhase: asPhaseId('main') },
        ],
      }),
      phaseTransitionBudget: { remaining: 0 },
    });
    const effect = {
      popInterruptPhase: {},
    } as unknown as Extract<EffectAST, { readonly popInterruptPhase: unknown }>;

    const result = applyPopInterruptPhase(effect, ctx);
    assert.equal(result.state.currentPhase, asPhaseId('coup')); // unchanged
  });
});
