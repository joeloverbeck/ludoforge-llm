import {
  effectRuntimeError,
  makeTurnFlowActiveSeatUnresolvableEffectRuntimeContext,
} from './effect-error.js';
import { resetPhaseUsage } from './action-usage.js';
import { advancePhase, buildAdvancePhaseRequest } from './phase-advance.js';
import { findPhaseDef } from './phase-lookup.js';
import { dispatchLifecycleEvent } from './phase-lifecycle.js';
import { resolveBindingTemplate } from './binding-template.js';
import {
  collectTurnFlowFreeOperationGrantContractViolations,
  isTurnFlowActionClass,
  renderTurnFlowFreeOperationGrantContractViolation,
} from '../contracts/index.js';
import { EFFECT_RUNTIME_REASONS } from './runtime-reasons.js';
import { createEvalContext, createEvalRuntimeResources } from './eval-context.js';
import {
  grantRequiresUsableProbe,
  isFreeOperationGrantUsableInCurrentState,
} from './free-operation-viability.js';
import {
  appendSkippedSequenceStep,
  ensureFreeOperationSequenceBatchContext,
  resolveSequenceProgressionPolicy,
} from './free-operation-sequence-progression.js';
import { resolveFreeOperationGrantSeatToken } from './free-operation-seat-resolution.js';
import { resolveFreeOperationExecutionContext } from './free-operation-execution-context.js';
import { toMoveExecutionPolicy, type MoveExecutionPolicy } from './execution-policy.js';
import type { EffectContext, EffectResult } from './effect-context.js';
import type {
  EffectAST,
  GameState,
  TurnFlowFreeOperationGrantContract,
  TurnFlowPendingFreeOperationGrant,
} from './types.js';
import { createSeatResolutionContext, resolveTurnFlowSeatForPlayerIndex } from './identity.js';
import {
  activeSeatUnresolvableInvariantMessage,
  makeActiveSeatUnresolvableInvariantContext,
} from './turn-flow-invariant-contracts.js';
import { TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS } from './turn-flow-active-seat-invariant-surfaces.js';

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

const buildSequenceProbeCandidates = (
  ctx: EffectContext,
  grant: Extract<EffectAST, { readonly grantFreeOperation: unknown }>['grantFreeOperation'],
): readonly TurnFlowFreeOperationGrantContract[] => {
  const step = grant.sequence?.step;
  if (step === undefined || step <= 0) {
    return [];
  }
  return (ctx.freeOperationProbeScope?.priorGrantDefinitions ?? []).filter(
    (candidate) =>
      candidate.sequence !== undefined
      && candidate.sequence.batch === grant.sequence!.batch
      && candidate.sequence.step < step,
  );
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
  toMoveExecutionPolicy(
    ctx.verifyCompiledEffects === undefined ? undefined : { verifyCompiledEffects: ctx.verifyCompiledEffects },
    ctx.phaseTransitionBudget,
  );

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
  const seat = resolveFreeOperationGrantSeatToken(grant.seat, activeSeat, runtime.seatOrder);
  if (seat === null) {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.TURN_FLOW_RUNTIME_VALIDATION_FAILED, `grantFreeOperation.seat is unknown: ${grant.seat}`, {
      effectType: 'grantFreeOperation',
      seat: grant.seat,
      availableSeats: runtime.seatOrder,
    });
  }

  let executeAsSeat: string | undefined;
  if (grant.executeAsSeat !== undefined) {
    const resolvedExecuteAs = resolveFreeOperationGrantSeatToken(grant.executeAsSeat, activeSeat, runtime.seatOrder);
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
  for (const violation of collectTurnFlowFreeOperationGrantContractViolations({
    operationClass: grant.operationClass,
    ...(grant.uses === undefined ? {} : { uses: grant.uses }),
    ...(grant.viabilityPolicy === undefined ? {} : { viabilityPolicy: grant.viabilityPolicy }),
    ...(grant.moveZoneBindings === undefined ? {} : { moveZoneBindings: grant.moveZoneBindings }),
    ...(grant.moveZoneProbeBindings === undefined ? {} : { moveZoneProbeBindings: grant.moveZoneProbeBindings }),
    ...(grant.completionPolicy === undefined ? {} : { completionPolicy: grant.completionPolicy }),
    ...(grant.outcomePolicy === undefined ? {} : { outcomePolicy: grant.outcomePolicy }),
    ...(grant.postResolutionTurnFlow === undefined ? {} : { postResolutionTurnFlow: grant.postResolutionTurnFlow }),
    ...(grant.sequence === undefined ? {} : { sequence: grant.sequence }),
    ...(grant.sequenceContext === undefined ? {} : { sequenceContext: grant.sequenceContext }),
    ...(grant.executionContext === undefined ? {} : { executionContext: grant.executionContext }),
    ...(grant.tokenInterpretations === undefined ? {} : { tokenInterpretations: grant.tokenInterpretations }),
  })) {
    if (
      violation.code === 'viabilityPolicyInvalid'
      || violation.code === 'moveZoneBindingsInvalid'
      || violation.code === 'moveZoneProbeBindingsInvalid'
      || violation.code === 'completionPolicyInvalid'
      || violation.code === 'outcomePolicyInvalid'
      || violation.code === 'postResolutionTurnFlowInvalid'
      || violation.code === 'requiredPostResolutionTurnFlowMissing'
      || violation.code === 'postResolutionTurnFlowRequiresRequiredCompletionPolicy'
      || violation.code === 'sequenceStepInvalid'
      || violation.code === 'sequenceContextInvalid'
      || violation.code === 'sequenceContextRequiresSequence'
      || violation.code === 'executionContextInvalid'
    ) {
      const surface = renderTurnFlowFreeOperationGrantContractViolation(violation);
      throw effectRuntimeError(
        EFFECT_RUNTIME_REASONS.TURN_FLOW_RUNTIME_VALIDATION_FAILED,
        surface.message,
        {
          effectType: 'grantFreeOperation',
          ...(grant.viabilityPolicy === undefined ? {} : { viabilityPolicy: grant.viabilityPolicy }),
          ...(grant.moveZoneBindings === undefined ? {} : { moveZoneBindings: grant.moveZoneBindings }),
          ...(grant.moveZoneProbeBindings === undefined ? {} : { moveZoneProbeBindings: grant.moveZoneProbeBindings }),
          ...(grant.completionPolicy === undefined ? {} : { completionPolicy: grant.completionPolicy }),
          ...(grant.outcomePolicy === undefined ? {} : { outcomePolicy: grant.outcomePolicy }),
          ...(grant.postResolutionTurnFlow === undefined ? {} : { postResolutionTurnFlow: grant.postResolutionTurnFlow }),
          ...(grant.executionContext === undefined ? {} : { executionContext: grant.executionContext }),
        },
      );
    }
  }

  const existing = runtime.pendingFreeOperationGrants ?? [];
  const fallbackBaseId = `freeOpEffect:${ctx.state.turnCount}:${activeSeat}:${existing.length}`;
  const grantId = makeUniqueGrantId(existing, grant.id ?? fallbackBaseId);
  const sequenceBatchBaseId = grant.sequence === undefined
    ? undefined
    : grant.id ?? `${ctx.traceContext?.effectPathRoot ?? 'freeOpEffect'}:${activeSeat}`;
  const sequenceBatchId = grant.sequence === undefined ? undefined : `${sequenceBatchBaseId}:${grant.sequence.batch}`;
  const sequenceIndex = grant.sequence?.step;
  const sequenceProgressionPolicy = resolveSequenceProgressionPolicy(grant);
  if (
    sequenceBatchId !== undefined
    && sequenceProgressionPolicy === 'strictInOrder'
    && ctx.freeOperationProbeScope?.blockedStrictSequenceBatchIds.includes(sequenceBatchId)
  ) {
    return {
      state: ctx.state,
      rng: ctx.rng,
    };
  }

  const resolvedZoneFilter = grant.zoneFilter === undefined
    ? undefined
    : resolveTemplateTree(grant.zoneFilter, ctx.bindings);
  const resolvedGrant = resolvedZoneFilter === undefined
    ? grant
    : {
        ...grant,
        zoneFilter: resolvedZoneFilter,
      };
  const grantEvalContext = createEvalContext({
    def: ctx.def,
    adjacencyGraph: ctx.adjacencyGraph,
    state: ctx.state,
    activePlayer: ctx.activePlayer,
    actorPlayer: ctx.actorPlayer,
    bindings: ctx.bindings,
    resources: ctx.resources,
    ...(ctx.runtimeTableIndex === undefined ? {} : { runtimeTableIndex: ctx.runtimeTableIndex }),
    ...(ctx.freeOperationOverlay === undefined ? {} : { freeOperationOverlay: ctx.freeOperationOverlay }),
    ...(ctx.maxQueryResults === undefined ? {} : { maxQueryResults: ctx.maxQueryResults }),
  });
  const resolvedExecutionContext = resolveFreeOperationExecutionContext(
    grant.executionContext,
    grantEvalContext,
  );
  ctx.freeOperationProbeScope?.priorGrantDefinitions.push(resolvedGrant);

  if (
    grantRequiresUsableProbe(resolvedGrant)
    && !isFreeOperationGrantUsableInCurrentState(
      ctx.def,
      ctx.state,
      resolvedGrant,
      activeSeat,
      runtime.seatOrder,
      seatResolution,
      {
        sequenceProbeCandidates: buildSequenceProbeCandidates(ctx, resolvedGrant),
        evalContext: grantEvalContext,
      },
    )
  ) {
    if (
      sequenceBatchId !== undefined
      && sequenceIndex !== undefined
      && sequenceProgressionPolicy === 'strictInOrder'
      && !ctx.freeOperationProbeScope?.blockedStrictSequenceBatchIds.includes(sequenceBatchId)
    ) {
      ctx.freeOperationProbeScope?.blockedStrictSequenceBatchIds.push(sequenceBatchId);
    }
    const nextSequenceContexts =
      sequenceBatchId !== undefined
      && sequenceIndex !== undefined
      && sequenceProgressionPolicy === 'implementWhatCanInOrder'
        ? appendSkippedSequenceStep(
          runtime.freeOperationSequenceContexts,
          sequenceBatchId,
          sequenceProgressionPolicy,
          sequenceIndex,
        )
        : runtime.freeOperationSequenceContexts;
    return {
      state: nextSequenceContexts === runtime.freeOperationSequenceContexts
        ? ctx.state
        : {
          ...ctx.state,
          turnOrderState: {
            type: 'cardDriven',
            runtime: {
              ...runtime,
              ...(nextSequenceContexts === undefined ? {} : { freeOperationSequenceContexts: nextSequenceContexts }),
            },
          },
        },
      rng: ctx.rng,
    };
  }

  const appended: TurnFlowPendingFreeOperationGrant = {
    grantId,
    seat,
    ...(executeAsSeat === undefined ? {} : { executeAsSeat }),
    operationClass: grant.operationClass,
    ...(grant.actionIds === undefined ? {} : { actionIds: [...grant.actionIds] }),
    ...(resolvedZoneFilter === undefined ? {} : { zoneFilter: resolvedZoneFilter }),
    ...(grant.tokenInterpretations === undefined ? {} : { tokenInterpretations: grant.tokenInterpretations }),
    ...(grant.moveZoneBindings === undefined ? {} : { moveZoneBindings: [...grant.moveZoneBindings] }),
    ...(grant.moveZoneProbeBindings === undefined ? {} : { moveZoneProbeBindings: [...grant.moveZoneProbeBindings] }),
    ...(grant.sequenceContext === undefined ? {} : { sequenceContext: grant.sequenceContext }),
    ...(resolvedExecutionContext === undefined ? {} : { executionContext: resolvedExecutionContext }),
    ...(grant.allowDuringMonsoon === undefined ? {} : { allowDuringMonsoon: grant.allowDuringMonsoon }),
    ...(grant.viabilityPolicy === undefined ? {} : { viabilityPolicy: grant.viabilityPolicy }),
    ...(grant.completionPolicy === undefined ? {} : { completionPolicy: grant.completionPolicy }),
    ...(grant.outcomePolicy === undefined ? {} : { outcomePolicy: grant.outcomePolicy }),
    ...(grant.postResolutionTurnFlow === undefined ? {} : { postResolutionTurnFlow: grant.postResolutionTurnFlow }),
    remainingUses: uses,
    ...(sequenceBatchId === undefined ? {} : { sequenceBatchId }),
    ...(sequenceIndex === undefined ? {} : { sequenceIndex }),
  };

  const nextPending = [...existing, appended];
  const nextSequenceContexts = sequenceBatchId === undefined
    ? runtime.freeOperationSequenceContexts
    : ensureFreeOperationSequenceBatchContext(
      runtime.freeOperationSequenceContexts,
      sequenceBatchId,
      sequenceProgressionPolicy,
    );
  return {
    state: {
      ...ctx.state,
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
          ...runtime,
          pendingFreeOperationGrants: nextPending,
          ...(nextSequenceContexts === undefined ? {} : { freeOperationSequenceContexts: nextSequenceContexts }),
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
  });
  const targetPhaseId = phaseIds[targetPhaseIndex]!;

  const exitedState = dispatchLifecycleEvent(ctx.def, ctx.state, {
    type: 'phaseExit',
    phase: ctx.state.currentPhase,
  }, undefined, lifecycleBudgetOptions(ctx), lifecycleResources, 'lifecycle', ctx.cachedRuntime, ctx.profiler);
  const enteredState = resetPhaseUsage({
    ...exitedState,
    currentPhase: targetPhaseId,
  });
  const finalState = dispatchLifecycleEvent(ctx.def, enteredState, {
    type: 'phaseEnter',
    phase: targetPhaseId,
  }, undefined, lifecycleBudgetOptions(ctx), lifecycleResources, 'lifecycle', ctx.cachedRuntime, ctx.profiler);
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
  const policy = lifecycleBudgetOptions(ctx);
  const nextState = advancePhase(buildAdvancePhaseRequest(
    ctx.def,
    ctx.state,
    createEvalRuntimeResources({
      collector: ctx.collector,
    }),
    {
      policy,
      ...(ctx.cachedRuntime === undefined ? {} : { cachedRuntime: ctx.cachedRuntime }),
    },
  ));
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
  });
  const targetPhase = resolvePhaseId(ctx, effect.pushInterruptPhase.phase, 'pushInterruptPhase', 'phase');
  const resumePhase = resolvePhaseId(ctx, effect.pushInterruptPhase.resumePhase, 'pushInterruptPhase', 'resumePhase');
  const exitedState = dispatchLifecycleEvent(ctx.def, ctx.state, {
    type: 'phaseExit',
    phase: ctx.state.currentPhase,
  }, undefined, lifecycleBudgetOptions(ctx), lifecycleResources, 'lifecycle', ctx.cachedRuntime);
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
  }, undefined, lifecycleBudgetOptions(ctx), lifecycleResources, 'lifecycle', ctx.cachedRuntime);
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
  }, undefined, lifecycleBudgetOptions(ctx), lifecycleResources, 'lifecycle', ctx.cachedRuntime);
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
  }, undefined, lifecycleBudgetOptions(ctx), lifecycleResources, 'lifecycle', ctx.cachedRuntime);
  return {
    state: finalState,
    rng: { state: finalState.rng },
  };
};
