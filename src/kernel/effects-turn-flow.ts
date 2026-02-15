import { effectRuntimeError } from './effect-error.js';
import { resetPhaseUsage } from './action-usage.js';
import { advancePhase } from './phase-advance.js';
import { dispatchLifecycleEvent } from './phase-lifecycle.js';
import type { EffectContext, EffectResult } from './effect-context.js';
import type { EffectAST, GameState, TurnFlowPendingFreeOperationGrant } from './types.js';

const isTurnFlowActionClass = (
  value: string,
): value is 'pass' | 'event' | 'operation' | 'limitedOperation' | 'operationPlusSpecialActivity' =>
  value === 'pass' ||
  value === 'event' ||
  value === 'operation' ||
  value === 'limitedOperation' ||
  value === 'operationPlusSpecialActivity';

const resolveGrantFaction = (
  token: string,
  activeFaction: string,
  factionOrder: readonly string[],
): string | null => {
  if (token === 'self') {
    return activeFaction;
  }
  return factionOrder.includes(token) ? token : null;
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

export const applyGrantFreeOperation = (
  effect: Extract<EffectAST, { readonly grantFreeOperation: unknown }>,
  ctx: EffectContext,
): EffectResult => {
  if (ctx.state.turnOrderState.type !== 'cardDriven') {
    throw effectRuntimeError('turnFlowRuntimeValidationFailed', 'grantFreeOperation requires cardDriven turn order state', {
      effectType: 'grantFreeOperation',
      turnOrderType: ctx.state.turnOrderState.type,
    });
  }

  const grant = effect.grantFreeOperation;
  if (!isTurnFlowActionClass(grant.operationClass)) {
    throw effectRuntimeError('turnFlowRuntimeValidationFailed', 'grantFreeOperation.operationClass is invalid', {
      effectType: 'grantFreeOperation',
      operationClass: grant.operationClass,
    });
  }

  const runtime = ctx.state.turnOrderState.runtime;
  const activeFaction = String(ctx.activePlayer);
  const faction = resolveGrantFaction(grant.faction, activeFaction, runtime.factionOrder);
  if (faction === null) {
    throw effectRuntimeError('turnFlowRuntimeValidationFailed', `grantFreeOperation.faction is unknown: ${grant.faction}`, {
      effectType: 'grantFreeOperation',
      faction: grant.faction,
      availableFactions: runtime.factionOrder,
    });
  }

  let executeAsFaction: string | undefined;
  if (grant.executeAsFaction !== undefined) {
    const resolvedExecuteAs = resolveGrantFaction(grant.executeAsFaction, activeFaction, runtime.factionOrder);
    if (resolvedExecuteAs === null) {
      throw effectRuntimeError('turnFlowRuntimeValidationFailed', `grantFreeOperation.executeAsFaction is unknown: ${grant.executeAsFaction}`, {
        effectType: 'grantFreeOperation',
        executeAsFaction: grant.executeAsFaction,
        availableFactions: runtime.factionOrder,
      });
    }
    executeAsFaction = resolvedExecuteAs;
  }

  const uses = grant.uses ?? 1;
  if (!Number.isSafeInteger(uses) || uses <= 0) {
    throw effectRuntimeError('turnFlowRuntimeValidationFailed', 'grantFreeOperation.uses must be a positive integer', {
      effectType: 'grantFreeOperation',
      uses,
    });
  }

  const existing = runtime.pendingFreeOperationGrants ?? [];
  const fallbackBaseId = `freeOpEffect:${ctx.state.turnCount}:${activeFaction}:${existing.length}`;
  const grantId = makeUniqueGrantId(existing, grant.id ?? fallbackBaseId);
  const sequenceBatchId = grant.sequence === undefined ? undefined : `${grantId}:${grant.sequence.chain}`;
  const sequenceIndex = grant.sequence?.step;
  if (sequenceIndex !== undefined && (!Number.isSafeInteger(sequenceIndex) || sequenceIndex < 0)) {
    throw effectRuntimeError('turnFlowRuntimeValidationFailed', 'grantFreeOperation.sequence.step must be a non-negative integer', {
      effectType: 'grantFreeOperation',
      sequenceStep: sequenceIndex,
    });
  }

  const appended: TurnFlowPendingFreeOperationGrant = {
    grantId,
    faction,
    ...(executeAsFaction === undefined ? {} : { executeAsFaction }),
    operationClass: grant.operationClass,
    ...(grant.actionIds === undefined ? {} : { actionIds: [...grant.actionIds] }),
    ...(grant.zoneFilter === undefined ? {} : { zoneFilter: grant.zoneFilter }),
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

export const applyGotoPhase = (
  effect: Extract<EffectAST, { readonly gotoPhase: unknown }>,
  ctx: EffectContext,
): EffectResult => {
  const targetPhase = effect.gotoPhase.phase;
  const phaseIds = ctx.def.turnStructure.phases.map((phase) => phase.id);
  if (!phaseIds.some((phaseId) => phaseId === targetPhase)) {
    throw effectRuntimeError('turnFlowRuntimeValidationFailed', `gotoPhase.phase is unknown: ${targetPhase}`, {
      effectType: 'gotoPhase',
      phase: targetPhase,
      phaseCandidates: phaseIds,
    });
  }

  const currentPhaseIndex = phaseIds.findIndex((phaseId) => phaseId === ctx.state.currentPhase);
  const targetPhaseIndex = phaseIds.findIndex((phaseId) => phaseId === targetPhase);
  if (currentPhaseIndex < 0 || targetPhaseIndex < 0) {
    throw effectRuntimeError('turnFlowRuntimeValidationFailed', `gotoPhase could not resolve current/target phase indices`, {
      effectType: 'gotoPhase',
      currentPhase: ctx.state.currentPhase,
      targetPhase,
    });
  }

  if (targetPhaseIndex < currentPhaseIndex) {
    throw effectRuntimeError(
      'turnFlowRuntimeValidationFailed',
      `gotoPhase cannot cross a turn boundary (current=${String(ctx.state.currentPhase)}, target=${targetPhase})`,
      {
        effectType: 'gotoPhase',
        currentPhase: ctx.state.currentPhase,
        targetPhase,
      },
    );
  }

  if (ctx.state.currentPhase === targetPhase) {
    return { state: ctx.state, rng: ctx.rng };
  }

  const maxAdvances = Math.max(1, targetPhaseIndex - currentPhaseIndex);
  let currentState = ctx.state;
  for (let step = 0; step < maxAdvances; step += 1) {
    currentState = advancePhase(ctx.def, currentState);
    if (currentState.currentPhase === targetPhase) {
      return {
        state: currentState,
        rng: { state: currentState.rng },
      };
    }
  }

  throw effectRuntimeError('turnFlowRuntimeValidationFailed', `gotoPhase could not reach phase: ${targetPhase}`, {
    effectType: 'gotoPhase',
    phase: targetPhase,
    maxAdvances,
  });
};

const resolvePhaseId = (
  ctx: EffectContext,
  phase: string,
  effectType: string,
  field: 'phase' | 'resumePhase',
): GameState['currentPhase'] => {
  const phaseDefs = [...ctx.def.turnStructure.phases, ...(ctx.def.turnStructure.interrupts ?? [])];
  const candidate = phaseDefs.find((entry) => entry.id === phase)?.id;
  if (candidate === undefined) {
    throw effectRuntimeError('turnFlowRuntimeValidationFailed', `${effectType}.${field} is unknown: ${phase}`, {
      effectType,
      field,
      phase,
      phaseCandidates: phaseDefs.map((entry) => entry.id),
    });
  }
  return candidate;
};

export const applyPushInterruptPhase = (
  effect: Extract<EffectAST, { readonly pushInterruptPhase: unknown }>,
  ctx: EffectContext,
): EffectResult => {
  const targetPhase = resolvePhaseId(ctx, effect.pushInterruptPhase.phase, 'pushInterruptPhase', 'phase');
  const resumePhase = resolvePhaseId(ctx, effect.pushInterruptPhase.resumePhase, 'pushInterruptPhase', 'resumePhase');
  const exitedState = dispatchLifecycleEvent(ctx.def, ctx.state, {
    type: 'phaseExit',
    phase: ctx.state.currentPhase,
  });
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
  });
  return {
    state: finalState,
    rng: { state: finalState.rng },
  };
};

export const applyPopInterruptPhase = (
  _effect: Extract<EffectAST, { readonly popInterruptPhase: unknown }>,
  ctx: EffectContext,
): EffectResult => {
  const activeStack = ctx.state.interruptPhaseStack ?? [];
  if (activeStack.length === 0) {
    throw effectRuntimeError('turnFlowRuntimeValidationFailed', 'popInterruptPhase requires a non-empty interruptPhaseStack', {
      effectType: 'popInterruptPhase',
    });
  }

  const exitedState = dispatchLifecycleEvent(ctx.def, ctx.state, {
    type: 'phaseExit',
    phase: ctx.state.currentPhase,
  });
  const stackAfterExit = exitedState.interruptPhaseStack ?? [];
  const resumeFrame = stackAfterExit.at(-1);
  if (resumeFrame === undefined) {
    throw effectRuntimeError('turnFlowRuntimeValidationFailed', 'popInterruptPhase found no frame to resume after phaseExit', {
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
  });
  return {
    state: finalState,
    rng: { state: finalState.rng },
  };
};
