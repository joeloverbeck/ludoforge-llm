import {
  effectRuntimeError,
  makeTurnFlowActiveSeatUnresolvableEffectRuntimeContext,
} from './effect-error.js';
import { resetPhaseUsage } from './action-usage.js';
import { advancePhase, buildAdvancePhaseRequest } from './phase-advance.js';
import { updatePhaseHash, updatePhaseUsageResetHash } from './zobrist-phase-hash.js';
import { findPhaseDef } from './phase-lookup.js';
import { dispatchLifecycleEvent } from './phase-lifecycle.js';
import { resolveBindingTemplate } from './binding-template.js';
import {
  collectTurnFlowFreeOperationGrantContractViolations,
  isTurnFlowActionClass,
  renderTurnFlowFreeOperationGrantContractViolation,
} from '../contracts/index.js';
import { EFFECT_RUNTIME_REASONS } from './runtime-reasons.js';
import { createEvalRuntimeResources } from './eval-context.js';
import {
  grantRequiresUsableProbe,
  isFreeOperationGrantUsableInCurrentState,
} from './free-operation-viability.js';
import {
  appendSkippedSequenceStep,
  ensureFreeOperationSequenceBatchContext,
  resolveSequenceProgressionPolicy,
} from './free-operation-sequence-progression.js';
import { insertGrant } from './grant-lifecycle.js';
import { resolveFreeOperationGrantSeatToken } from './free-operation-seat-resolution.js';
import { resolveFreeOperationExecutionContext } from './free-operation-execution-context.js';
import { toMoveExecutionPolicy, type MoveExecutionPolicy } from './execution-policy.js';
import { updateReadScopeRaw } from './effect-context.js';
import type { EffectCursor, EffectEnv, MutableReadScope, PartialEffectResult } from './effect-context.js';
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
import type { EffectBudgetState } from './effects-control.js';
import type { ApplyEffectsWithBudget } from './effect-registry.js';

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
  env: EffectEnv,
  grant: Extract<EffectAST, { readonly grantFreeOperation: unknown }>['grantFreeOperation'],
): readonly TurnFlowFreeOperationGrantContract[] => {
  const step = grant.sequence?.step;
  if (step === undefined || step <= 0) {
    return [];
  }
  return (env.freeOperationProbeScope?.priorGrantDefinitions ?? []).filter(
    (candidate) =>
      candidate.sequence !== undefined
      && candidate.sequence.batch === grant.sequence!.batch
      && candidate.sequence.step < step,
  );
};

const consumePhaseTransitionBudget = (env: EffectEnv, effectType: string): boolean => {
  const budget = env.phaseTransitionBudget;
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

const lifecycleBudgetOptions = (env: EffectEnv): MoveExecutionPolicy | undefined =>
  toMoveExecutionPolicy(
    env.verifyCompiledEffects === undefined ? undefined : { verifyCompiledEffects: env.verifyCompiledEffects },
    env.phaseTransitionBudget,
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
  env: EffectEnv,
  cursor: EffectCursor,
  scope: MutableReadScope,
  _budget: EffectBudgetState,
  _applyBatch: ApplyEffectsWithBudget,
): PartialEffectResult => {
  if (cursor.state.turnOrderState.type !== 'cardDriven') {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.TURN_FLOW_RUNTIME_VALIDATION_FAILED, 'grantFreeOperation requires cardDriven turn order state', {
      effectType: 'grantFreeOperation',
      turnOrderType: cursor.state.turnOrderState.type,
    });
  }

  const grant = effect.grantFreeOperation;
  if (!isTurnFlowActionClass(grant.operationClass)) {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.TURN_FLOW_RUNTIME_VALIDATION_FAILED, 'grantFreeOperation.operationClass is invalid', {
      effectType: 'grantFreeOperation',
      operationClass: grant.operationClass,
    });
  }

  const runtime = cursor.state.turnOrderState.runtime;
  const seatResolution = createSeatResolutionContext(env.def, cursor.state.playerCount);
  const activeSeat = resolveTurnFlowSeatForPlayerIndex(
    runtime.seatOrder,
    Number(env.activePlayer),
    seatResolution.index,
  );
  if (activeSeat === null) {
    const activeSeatInvariant = makeActiveSeatUnresolvableInvariantContext(
      TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS.FREE_OPERATION_GRANT_APPLICATION,
      Number(env.activePlayer),
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
  const fallbackBaseId = `freeOpEffect:${cursor.state.turnCount}:${activeSeat}:${existing.length}`;
  const grantId = makeUniqueGrantId(existing, grant.id ?? fallbackBaseId);
  const sequenceBatchBaseId = grant.sequence === undefined
    ? undefined
    : grant.id ?? `${env.traceContext?.effectPathRoot ?? 'freeOpEffect'}:${activeSeat}`;
  const sequenceBatchId = grant.sequence === undefined ? undefined : `${sequenceBatchBaseId}:${grant.sequence.batch}`;
  const sequenceIndex = grant.sequence?.step;
  const sequenceProgressionPolicy = resolveSequenceProgressionPolicy(grant);
  if (
    sequenceBatchId !== undefined
    && sequenceProgressionPolicy === 'strictInOrder'
    && env.freeOperationProbeScope?.blockedStrictSequenceBatchIds.includes(sequenceBatchId)
  ) {
    return {
      state: cursor.state,
      rng: cursor.rng,
    };
  }

  const resolvedZoneFilter = grant.zoneFilter === undefined
    ? undefined
    : resolveTemplateTree(grant.zoneFilter, cursor.bindings);
  const resolvedGrant = resolvedZoneFilter === undefined
    ? grant
    : {
        ...grant,
        zoneFilter: resolvedZoneFilter,
      };
  updateReadScopeRaw(scope, cursor);
  const grantEvalContext = scope;
  const resolvedExecutionContext = resolveFreeOperationExecutionContext(
    grant.executionContext,
    grantEvalContext,
  );
  env.freeOperationProbeScope?.priorGrantDefinitions.push(resolvedGrant);

  if (
    grantRequiresUsableProbe(resolvedGrant)
    && !isFreeOperationGrantUsableInCurrentState(
      env.def,
      cursor.state,
      resolvedGrant,
      activeSeat,
      runtime.seatOrder,
      seatResolution,
      {
        sequenceProbeCandidates: buildSequenceProbeCandidates(env, resolvedGrant),
        evalContext: grantEvalContext,
      },
    )
  ) {
    if (
      sequenceBatchId !== undefined
      && sequenceIndex !== undefined
      && sequenceProgressionPolicy === 'strictInOrder'
      && !env.freeOperationProbeScope?.blockedStrictSequenceBatchIds.includes(sequenceBatchId)
    ) {
      env.freeOperationProbeScope?.blockedStrictSequenceBatchIds.push(sequenceBatchId);
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
        ? cursor.state
        : {
          ...cursor.state,
          turnOrderState: {
            type: 'cardDriven',
            runtime: {
              ...runtime,
              ...(nextSequenceContexts === undefined ? {} : { freeOperationSequenceContexts: nextSequenceContexts }),
            },
          },
        },
      rng: cursor.rng,
    };
  }

  const appended: TurnFlowPendingFreeOperationGrant = {
    grantId,
    phase: sequenceIndex === undefined || sequenceIndex === 0 ? 'ready' : 'sequenceWaiting',
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

  const nextPending = insertGrant(existing, appended).grants;
  const nextSequenceContexts = sequenceBatchId === undefined
    ? runtime.freeOperationSequenceContexts
    : ensureFreeOperationSequenceBatchContext(
      runtime.freeOperationSequenceContexts,
      sequenceBatchId,
      sequenceProgressionPolicy,
    );
  return {
    state: {
      ...cursor.state,
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
          ...runtime,
          pendingFreeOperationGrants: nextPending,
          ...(nextSequenceContexts === undefined ? {} : { freeOperationSequenceContexts: nextSequenceContexts }),
        },
      },
    },
    rng: cursor.rng,
  };
};

export const applyGotoPhaseExact = (
  effect: Extract<EffectAST, { readonly gotoPhaseExact: unknown }>,
  env: EffectEnv,
  cursor: EffectCursor,
  _scope: MutableReadScope,
  _budget: EffectBudgetState,
  _applyBatch: ApplyEffectsWithBudget,
): PartialEffectResult => {
  const targetPhase = effect.gotoPhaseExact.phase;
  const phases = env.def.turnStructure.phases;
  if (!phases.some((phase) => phase.id === targetPhase)) {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.TURN_FLOW_RUNTIME_VALIDATION_FAILED, `gotoPhaseExact.phase is unknown: ${targetPhase}`, {
      effectType: 'gotoPhaseExact',
      phase: targetPhase,
      phaseCandidates: phases.map((phase) => phase.id),
    });
  }

  const currentPhaseIndex = phases.findIndex((phase) => phase.id === cursor.state.currentPhase);
  const targetPhaseIndex = phases.findIndex((phase) => phase.id === targetPhase);
  if (currentPhaseIndex < 0 || targetPhaseIndex < 0) {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.TURN_FLOW_RUNTIME_VALIDATION_FAILED, `gotoPhaseExact could not resolve current/target phase indices`, {
      effectType: 'gotoPhaseExact',
      currentPhase: cursor.state.currentPhase,
      targetPhase,
    });
  }

  if (targetPhaseIndex < currentPhaseIndex) {
    throw effectRuntimeError(
      EFFECT_RUNTIME_REASONS.TURN_FLOW_RUNTIME_VALIDATION_FAILED,
      `gotoPhaseExact cannot cross a turn boundary (current=${String(cursor.state.currentPhase)}, target=${targetPhase})`,
      {
        effectType: 'gotoPhaseExact',
        currentPhase: cursor.state.currentPhase,
        targetPhase,
      },
    );
  }

  if (cursor.state.currentPhase === targetPhase) {
    return { state: cursor.state, rng: cursor.rng };
  }
  if (!consumePhaseTransitionBudget(env, 'gotoPhaseExact')) {
    return { state: cursor.state, rng: cursor.rng };
  }
  const lifecycleResources = createEvalRuntimeResources({
    collector: env.collector,
  });
  const targetPhaseId = phases[targetPhaseIndex]!.id;

  const exitedState = dispatchLifecycleEvent(env.def, cursor.state, {
    type: 'phaseExit',
    phase: cursor.state.currentPhase,
  }, undefined, lifecycleBudgetOptions(env), lifecycleResources, 'lifecycle', env.cachedRuntime, env.profiler);
  const table = env.cachedRuntime?.zobristTable;
  const phaseChangedState = {
    ...exitedState,
    currentPhase: targetPhaseId,
    ...(table ? { _runningHash: updatePhaseHash(exitedState._runningHash, table, exitedState.currentPhase, targetPhaseId) } : {}),
  };
  const enteredState = resetPhaseUsage(
    table ? { ...phaseChangedState, _runningHash: updatePhaseUsageResetHash(phaseChangedState._runningHash, table, phaseChangedState.actionUsage) } : phaseChangedState,
  );
  const finalState = dispatchLifecycleEvent(env.def, enteredState, {
    type: 'phaseEnter',
    phase: targetPhaseId,
  }, undefined, lifecycleBudgetOptions(env), lifecycleResources, 'lifecycle', env.cachedRuntime, env.profiler);
  return {
    state: finalState,
    rng: { state: finalState.rng },
  };
};

export const applyAdvancePhase = (
  _effect: Extract<EffectAST, { readonly advancePhase: unknown }>,
  env: EffectEnv,
  cursor: EffectCursor,
  _scope: MutableReadScope,
  _budget: EffectBudgetState,
  _applyBatch: ApplyEffectsWithBudget,
): PartialEffectResult => {
  if (!consumePhaseTransitionBudget(env, 'advancePhase')) {
    return { state: cursor.state, rng: cursor.rng };
  }
  const policy = lifecycleBudgetOptions(env);
  const nextState = advancePhase(buildAdvancePhaseRequest(
    env.def,
    cursor.state,
    createEvalRuntimeResources({
      collector: env.collector,
    }),
    {
      policy,
      ...(env.cachedRuntime === undefined ? {} : { cachedRuntime: env.cachedRuntime }),
    },
  ));
  return {
    state: nextState,
    rng: { state: nextState.rng },
  };
};

const resolvePhaseId = (
  env: EffectEnv,
  phase: string,
  effectType: string,
  field: 'phase' | 'resumePhase',
): GameState['currentPhase'] => {
  const candidate = findPhaseDef(env.def, phase)?.id;
  if (candidate === undefined) {
    const phaseCandidates = [
      ...env.def.turnStructure.phases.map((entry) => entry.id),
      ...(env.def.turnStructure.interrupts ?? []).map((entry) => entry.id),
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
  env: EffectEnv,
  cursor: EffectCursor,
  _scope: MutableReadScope,
  _budget: EffectBudgetState,
  _applyBatch: ApplyEffectsWithBudget,
): PartialEffectResult => {
  if (!consumePhaseTransitionBudget(env, 'pushInterruptPhase')) {
    return { state: cursor.state, rng: cursor.rng };
  }
  const lifecycleResources = createEvalRuntimeResources({
    collector: env.collector,
  });
  const targetPhase = resolvePhaseId(env, effect.pushInterruptPhase.phase, 'pushInterruptPhase', 'phase');
  const resumePhase = resolvePhaseId(env, effect.pushInterruptPhase.resumePhase, 'pushInterruptPhase', 'resumePhase');
  const exitedState = dispatchLifecycleEvent(env.def, cursor.state, {
    type: 'phaseExit',
    phase: cursor.state.currentPhase,
  }, undefined, lifecycleBudgetOptions(env), lifecycleResources, 'lifecycle', env.cachedRuntime);
  const nextStack = [
    ...(exitedState.interruptPhaseStack ?? []),
    { phase: targetPhase, resumePhase },
  ] as const;
  const pushTable = env.cachedRuntime?.zobristTable;
  const phaseChangedPush = {
    ...exitedState,
    currentPhase: targetPhase,
    interruptPhaseStack: nextStack,
    ...(pushTable ? { _runningHash: updatePhaseHash(exitedState._runningHash, pushTable, exitedState.currentPhase, targetPhase) } : {}),
  };
  const enteredState = resetPhaseUsage(
    pushTable ? { ...phaseChangedPush, _runningHash: updatePhaseUsageResetHash(phaseChangedPush._runningHash, pushTable, phaseChangedPush.actionUsage) } : phaseChangedPush,
  );
  const finalState = dispatchLifecycleEvent(env.def, enteredState, {
    type: 'phaseEnter',
    phase: targetPhase,
  }, undefined, lifecycleBudgetOptions(env), lifecycleResources, 'lifecycle', env.cachedRuntime);
  return {
    state: finalState,
    rng: { state: finalState.rng },
  };
};

export const applyPopInterruptPhase = (
  _effect: Extract<EffectAST, { readonly popInterruptPhase: unknown }>,
  env: EffectEnv,
  cursor: EffectCursor,
  _scope: MutableReadScope,
  _budget: EffectBudgetState,
  _applyBatch: ApplyEffectsWithBudget,
): PartialEffectResult => {
  if (!consumePhaseTransitionBudget(env, 'popInterruptPhase')) {
    return { state: cursor.state, rng: cursor.rng };
  }
  const lifecycleResources = createEvalRuntimeResources({
    collector: env.collector,
  });
  const activeStack = cursor.state.interruptPhaseStack ?? [];
  if (activeStack.length === 0) {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.TURN_FLOW_RUNTIME_VALIDATION_FAILED, 'popInterruptPhase requires a non-empty interruptPhaseStack', {
      effectType: 'popInterruptPhase',
    });
  }

  const exitedState = dispatchLifecycleEvent(env.def, cursor.state, {
    type: 'phaseExit',
    phase: cursor.state.currentPhase,
  }, undefined, lifecycleBudgetOptions(env), lifecycleResources, 'lifecycle', env.cachedRuntime);
  const stackAfterExit = exitedState.interruptPhaseStack ?? [];
  const resumeFrame = stackAfterExit.at(-1);
  if (resumeFrame === undefined) {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.TURN_FLOW_RUNTIME_VALIDATION_FAILED, 'popInterruptPhase found no frame to resume after phaseExit', {
      effectType: 'popInterruptPhase',
    });
  }

  const nextStack = stackAfterExit.slice(0, -1);
  const popTable = env.cachedRuntime?.zobristTable;
  const phaseHashPop = popTable
    ? updatePhaseHash(exitedState._runningHash, popTable, exitedState.currentPhase, resumeFrame.resumePhase)
    : exitedState._runningHash;
  const resumeBaseState: GameState = {
    ...exitedState,
    currentPhase: resumeFrame.resumePhase,
    _runningHash: phaseHashPop,
  };
  const { interruptPhaseStack, ...resumeStateWithoutStack } = resumeBaseState;
  void interruptPhaseStack;
  const preResetState = nextStack.length === 0
    ? resumeStateWithoutStack
    : {
        ...resumeBaseState,
        interruptPhaseStack: nextStack,
      };
  const resumedState = resetPhaseUsage(
    popTable ? { ...preResetState, _runningHash: updatePhaseUsageResetHash(preResetState._runningHash, popTable, preResetState.actionUsage) } : preResetState,
  );
  const finalState = dispatchLifecycleEvent(env.def, resumedState, {
    type: 'phaseEnter',
    phase: resumeFrame.resumePhase,
  }, undefined, lifecycleBudgetOptions(env), lifecycleResources, 'lifecycle', env.cachedRuntime);
  return {
    state: finalState,
    rng: { state: finalState.rng },
  };
};
