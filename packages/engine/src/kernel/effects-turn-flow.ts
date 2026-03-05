import {
  effectRuntimeError,
  makeTurnFlowActiveSeatUnresolvableEffectRuntimeContext,
} from './effect-error.js';
import { resetPhaseUsage } from './action-usage.js';
import { advancePhase } from './phase-advance.js';
import { findPhaseDef } from './phase-lookup.js';
import { dispatchLifecycleEvent } from './phase-lifecycle.js';
import { resolveBindingTemplate } from './binding-template.js';
import { isTurnFlowActionClass } from '../contracts/index.js';
import { EFFECT_RUNTIME_REASONS } from './runtime-reasons.js';
import { createEvalRuntimeResources } from './eval-context.js';
import type { MoveExecutionPolicy } from './execution-policy.js';
import type { EffectContext, EffectResult } from './effect-context.js';
import type { EffectAST, GameState, TurnFlowPendingFreeOperationGrant } from './types.js';
import { createSeatResolutionContext, resolveTurnFlowSeatForPlayerIndex } from './seat-resolution.js';
import {
  activeSeatUnresolvableInvariantMessage,
  makeActiveSeatUnresolvableInvariantContext,
} from './turn-flow-invariant-contracts.js';
import { TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS } from './turn-flow-active-seat-invariant-surfaces.js';

const resolveGrantSeat = (
  token: string,
  activeSeat: string,
  seatOrder: readonly string[],
): string | null => {
  if (token === 'self') {
    return activeSeat;
  }
  return seatOrder.includes(token) ? token : null;
};

const makeUniqueGrantId = (
  grants: readonly TurnFlowPendingFreeOperationGrant[],
  baseId: string,
): string => {
  const existing = new Set(grants.map((grant) => grant.grantId));
  if (!existing.has(baseId)) {
    return baseId;
  }
  let suffix = 2;
  let candidate = `${baseId}#${suffix}`;
  while (existing.has(candidate)) {
    suffix += 1;
    candidate = `${baseId}#${suffix}`;
  }
  return candidate;
};

const consumePhaseTransitionBudget = (ctx: EffectContext, effectType: string): boolean => {
  const budget = ctx.phaseTransitionBudget;
  if (budget === undefined) {
    return true;
  }
  if (!Number.isSafeInteger(budget.remaining) || budget.remaining < 0) {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.TURN_FLOW_RUNTIME_VALIDATION_FAILED, 'phaseTransitionBudget.remaining must be a non-negative integer', {
      effectType,
      remaining: budget.remaining,
    });
  }
  if (budget.remaining <= 0) {
    return false;
  }
  budget.remaining -= 1;
  return true;
};

const lifecycleBudgetOptions = (ctx: EffectContext): MoveExecutionPolicy | undefined =>
  ctx.phaseTransitionBudget === undefined ? undefined : { phaseTransitionBudget: ctx.phaseTransitionBudget };

const resolveTemplateTree = <T>(value: T, bindings: Readonly<Record<string, unknown>>): T => {
  if (typeof value === 'string') {
    return resolveBindingTemplate(value, bindings) as T;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => resolveTemplateTree(entry, bindings)) as T;
  }
  if (value !== null && typeof value === 'object') {
    const resolvedEntries = Object.entries(value).map(([key, entry]) => [key, resolveTemplateTree(entry, bindings)] as const);
    return Object.fromEntries(resolvedEntries) as T;
  }
  return value;
};

export const applyGrantFreeOperation = (
  effect: Extract<EffectAST, { readonly grantFreeOperation: unknown }>,
  ctx: EffectContext,
): EffectResult => {
  if (ctx.state.turnOrderState.type !== 'cardDriven') {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.TURN_FLOW_RUNTIME_VALIDATION_FAILED, 'grantFreeOperation requires cardDriven turn order state', {
      effectType: 'grantFreeOperation',
      turnOrderType: ctx.state.turnOrderState.type,
    });
  }

  const grant = effect.grantFreeOperation;
  if (!isTurnFlowActionClass(grant.operationClass)) {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.TURN_FLOW_RUNTIME_VALIDATION_FAILED, 'grantFreeOperation.operationClass is invalid', {
      effectType: 'grantFreeOperation',
      operationClass: grant.operationClass,
    });
  }

  const runtime = ctx.state.turnOrderState.runtime;
  const seatResolution = createSeatResolutionContext(ctx.def, ctx.state.playerCount);
  const activeSeat = resolveTurnFlowSeatForPlayerIndex(
    runtime.seatOrder,
    Number(ctx.activePlayer),
    seatResolution.index,
  );
  if (activeSeat === null) {
    const activeSeatInvariant = makeActiveSeatUnresolvableInvariantContext(
      TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS.FREE_OPERATION_GRANT_APPLICATION,
      Number(ctx.activePlayer),
      runtime.seatOrder,
    );
    throw effectRuntimeError(
      EFFECT_RUNTIME_REASONS.TURN_FLOW_RUNTIME_VALIDATION_FAILED,
      activeSeatUnresolvableInvariantMessage(activeSeatInvariant),
      makeTurnFlowActiveSeatUnresolvableEffectRuntimeContext(activeSeatInvariant),
    );
  }
  const seat = resolveGrantSeat(grant.seat, activeSeat, runtime.seatOrder);
  if (seat === null) {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.TURN_FLOW_RUNTIME_VALIDATION_FAILED, `grantFreeOperation.seat is unknown: ${grant.seat}`, {
      effectType: 'grantFreeOperation',
      seat: grant.seat,
      availableSeats: runtime.seatOrder,
    });
  }

  let executeAsSeat: string | undefined;
  if (grant.executeAsSeat !== undefined) {
    const resolvedExecuteAs = resolveGrantSeat(grant.executeAsSeat, activeSeat, runtime.seatOrder);
    if (resolvedExecuteAs === null) {
      throw effectRuntimeError(EFFECT_RUNTIME_REASONS.TURN_FLOW_RUNTIME_VALIDATION_FAILED, `grantFreeOperation.executeAsSeat is unknown: ${grant.executeAsSeat}`, {
        effectType: 'grantFreeOperation',
        executeAsSeat: grant.executeAsSeat,
        availableSeats: runtime.seatOrder,
      });
    }
    executeAsSeat = resolvedExecuteAs;
  }

  const uses = grant.uses ?? 1;
  if (!Number.isSafeInteger(uses) || uses <= 0) {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.TURN_FLOW_RUNTIME_VALIDATION_FAILED, 'grantFreeOperation.uses must be a positive integer', {
      effectType: 'grantFreeOperation',
      uses,
    });
  }

  const existing = runtime.pendingFreeOperationGrants ?? [];
  const fallbackBaseId = `freeOpEffect:${ctx.state.turnCount}:${activeSeat}:${existing.length}`;
  const grantId = makeUniqueGrantId(existing, grant.id ?? fallbackBaseId);
  const sequenceBatchId = grant.sequence === undefined ? undefined : `${grantId}:${grant.sequence.chain}`;
  const sequenceIndex = grant.sequence?.step;
  if (sequenceIndex !== undefined && (!Number.isSafeInteger(sequenceIndex) || sequenceIndex < 0)) {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.TURN_FLOW_RUNTIME_VALIDATION_FAILED, 'grantFreeOperation.sequence.step must be a non-negative integer', {
      effectType: 'grantFreeOperation',
      sequenceStep: sequenceIndex,
    });
  }

  const appended: TurnFlowPendingFreeOperationGrant = {
    grantId,
    seat,
    ...(executeAsSeat === undefined ? {} : { executeAsSeat }),
    operationClass: grant.operationClass,
    ...(grant.actionIds === undefined ? {} : { actionIds: [...grant.actionIds] }),
    ...(grant.zoneFilter === undefined ? {} : { zoneFilter: resolveTemplateTree(grant.zoneFilter, ctx.bindings) }),
    ...(grant.allowDuringMonsoon === undefined ? {} : { allowDuringMonsoon: grant.allowDuringMonsoon }),
    remainingUses: uses,
    ...(sequenceBatchId === undefined ? {} : { sequenceBatchId }),
    ...(sequenceIndex === undefined ? {} : { sequenceIndex }),
  };

  const nextPending = [...existing, appended];
  return {
    state: {
      ...ctx.state,
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
          ...runtime,
          pendingFreeOperationGrants: nextPending,
        },
      },
    },
    rng: ctx.rng,
  };
};

export const applyGotoPhaseExact = (
  effect: Extract<EffectAST, { readonly gotoPhaseExact: unknown }>,
  ctx: EffectContext,
): EffectResult => {
  const targetPhase = effect.gotoPhaseExact.phase;
  const phaseIds = ctx.def.turnStructure.phases.map((phase) => phase.id);
  if (!phaseIds.some((phaseId) => phaseId === targetPhase)) {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.TURN_FLOW_RUNTIME_VALIDATION_FAILED, `gotoPhaseExact.phase is unknown: ${targetPhase}`, {
      effectType: 'gotoPhaseExact',
      phase: targetPhase,
      phaseCandidates: phaseIds,
    });
  }

  const currentPhaseIndex = phaseIds.findIndex((phaseId) => phaseId === ctx.state.currentPhase);
  const targetPhaseIndex = phaseIds.findIndex((phaseId) => phaseId === targetPhase);
  if (currentPhaseIndex < 0 || targetPhaseIndex < 0) {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.TURN_FLOW_RUNTIME_VALIDATION_FAILED, `gotoPhaseExact could not resolve current/target phase indices`, {
      effectType: 'gotoPhaseExact',
      currentPhase: ctx.state.currentPhase,
      targetPhase,
    });
  }

  if (targetPhaseIndex < currentPhaseIndex) {
    throw effectRuntimeError(
      EFFECT_RUNTIME_REASONS.TURN_FLOW_RUNTIME_VALIDATION_FAILED,
      `gotoPhaseExact cannot cross a turn boundary (current=${String(ctx.state.currentPhase)}, target=${targetPhase})`,
      {
        effectType: 'gotoPhaseExact',
        currentPhase: ctx.state.currentPhase,
        targetPhase,
      },
    );
  }

  if (ctx.state.currentPhase === targetPhase) {
    return { state: ctx.state, rng: ctx.rng };
  }
  if (!consumePhaseTransitionBudget(ctx, 'gotoPhaseExact')) {
    return { state: ctx.state, rng: ctx.rng };
  }
  const lifecycleResources = createEvalRuntimeResources({
    collector: ctx.collector,
    queryRuntimeCache: ctx.queryRuntimeCache,
  });
  const targetPhaseId = phaseIds[targetPhaseIndex]!;

  const exitedState = dispatchLifecycleEvent(ctx.def, ctx.state, {
    type: 'phaseExit',
    phase: ctx.state.currentPhase,
  }, undefined, lifecycleBudgetOptions(ctx), lifecycleResources);
  const enteredState = resetPhaseUsage({
    ...exitedState,
    currentPhase: targetPhaseId,
  });
  const finalState = dispatchLifecycleEvent(ctx.def, enteredState, {
    type: 'phaseEnter',
    phase: targetPhaseId,
  }, undefined, lifecycleBudgetOptions(ctx), lifecycleResources);
  return {
    state: finalState,
    rng: { state: finalState.rng },
  };
};

export const applyAdvancePhase = (
  _effect: Extract<EffectAST, { readonly advancePhase: unknown }>,
  ctx: EffectContext,
): EffectResult => {
  if (!consumePhaseTransitionBudget(ctx, 'advancePhase')) {
    return { state: ctx.state, rng: ctx.rng };
  }
  const nextState = advancePhase(
    ctx.def,
    ctx.state,
    createEvalRuntimeResources({
      collector: ctx.collector,
      queryRuntimeCache: ctx.queryRuntimeCache,
    }),
    undefined,
    lifecycleBudgetOptions(ctx),
  );
  return {
    state: nextState,
    rng: { state: nextState.rng },
  };
};

const resolvePhaseId = (
  ctx: EffectContext,
  phase: string,
  effectType: string,
  field: 'phase' | 'resumePhase',
): GameState['currentPhase'] => {
  const candidate = findPhaseDef(ctx.def, phase)?.id;
  if (candidate === undefined) {
    const phaseCandidates = [
      ...ctx.def.turnStructure.phases.map((entry) => entry.id),
      ...(ctx.def.turnStructure.interrupts ?? []).map((entry) => entry.id),
    ];
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.TURN_FLOW_RUNTIME_VALIDATION_FAILED, `${effectType}.${field} is unknown: ${phase}`, {
      effectType,
      field,
      phase,
      phaseCandidates,
    });
  }
  return candidate;
};

export const applyPushInterruptPhase = (
  effect: Extract<EffectAST, { readonly pushInterruptPhase: unknown }>,
  ctx: EffectContext,
): EffectResult => {
  if (!consumePhaseTransitionBudget(ctx, 'pushInterruptPhase')) {
    return { state: ctx.state, rng: ctx.rng };
  }
  const lifecycleResources = createEvalRuntimeResources({
    collector: ctx.collector,
    queryRuntimeCache: ctx.queryRuntimeCache,
  });
  const targetPhase = resolvePhaseId(ctx, effect.pushInterruptPhase.phase, 'pushInterruptPhase', 'phase');
  const resumePhase = resolvePhaseId(ctx, effect.pushInterruptPhase.resumePhase, 'pushInterruptPhase', 'resumePhase');
  const exitedState = dispatchLifecycleEvent(ctx.def, ctx.state, {
    type: 'phaseExit',
    phase: ctx.state.currentPhase,
  }, undefined, lifecycleBudgetOptions(ctx), lifecycleResources);
  const nextStack = [
    ...(exitedState.interruptPhaseStack ?? []),
    { phase: targetPhase, resumePhase },
  ] as const;
  const enteredState = resetPhaseUsage({
    ...exitedState,
    currentPhase: targetPhase,
    interruptPhaseStack: nextStack,
  });
  const finalState = dispatchLifecycleEvent(ctx.def, enteredState, {
    type: 'phaseEnter',
    phase: targetPhase,
  }, undefined, lifecycleBudgetOptions(ctx), lifecycleResources);
  return {
    state: finalState,
    rng: { state: finalState.rng },
  };
};

export const applyPopInterruptPhase = (
  _effect: Extract<EffectAST, { readonly popInterruptPhase: unknown }>,
  ctx: EffectContext,
): EffectResult => {
  if (!consumePhaseTransitionBudget(ctx, 'popInterruptPhase')) {
    return { state: ctx.state, rng: ctx.rng };
  }
  const lifecycleResources = createEvalRuntimeResources({
    collector: ctx.collector,
    queryRuntimeCache: ctx.queryRuntimeCache,
  });
  const activeStack = ctx.state.interruptPhaseStack ?? [];
  if (activeStack.length === 0) {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.TURN_FLOW_RUNTIME_VALIDATION_FAILED, 'popInterruptPhase requires a non-empty interruptPhaseStack', {
      effectType: 'popInterruptPhase',
    });
  }

  const exitedState = dispatchLifecycleEvent(ctx.def, ctx.state, {
    type: 'phaseExit',
    phase: ctx.state.currentPhase,
  }, undefined, lifecycleBudgetOptions(ctx), lifecycleResources);
  const stackAfterExit = exitedState.interruptPhaseStack ?? [];
  const resumeFrame = stackAfterExit.at(-1);
  if (resumeFrame === undefined) {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.TURN_FLOW_RUNTIME_VALIDATION_FAILED, 'popInterruptPhase found no frame to resume after phaseExit', {
      effectType: 'popInterruptPhase',
    });
  }

  const nextStack = stackAfterExit.slice(0, -1);
  const resumeBaseState: GameState = {
    ...exitedState,
    currentPhase: resumeFrame.resumePhase,
  };
  const { interruptPhaseStack, ...resumeStateWithoutStack } = resumeBaseState;
  void interruptPhaseStack;
  const resumedState = resetPhaseUsage(
    nextStack.length === 0
      ? resumeStateWithoutStack
      : {
          ...resumeBaseState,
          interruptPhaseStack: nextStack,
        },
  );
  const finalState = dispatchLifecycleEvent(ctx.def, resumedState, {
    type: 'phaseEnter',
    phase: resumeFrame.resumePhase,
  }, undefined, lifecycleBudgetOptions(ctx), lifecycleResources);
  return {
    state: finalState,
    rng: { state: finalState.rng },
  };
};
