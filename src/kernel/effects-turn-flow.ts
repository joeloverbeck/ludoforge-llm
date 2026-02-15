import { EffectRuntimeError } from './effect-error.js';
import type { EffectContext, EffectResult } from './effect-context.js';
import type { EffectAST, TurnFlowPendingFreeOperationGrant } from './types.js';

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
    throw new EffectRuntimeError('EFFECT_RUNTIME', 'grantFreeOperation requires cardDriven turn order state', {
      effectType: 'grantFreeOperation',
      turnOrderType: ctx.state.turnOrderState.type,
    });
  }

  const grant = effect.grantFreeOperation;
  if (!isTurnFlowActionClass(grant.operationClass)) {
    throw new EffectRuntimeError('EFFECT_RUNTIME', 'grantFreeOperation.operationClass is invalid', {
      effectType: 'grantFreeOperation',
      operationClass: grant.operationClass,
    });
  }

  const runtime = ctx.state.turnOrderState.runtime;
  const activeFaction = String(ctx.activePlayer);
  const faction = resolveGrantFaction(grant.faction, activeFaction, runtime.factionOrder);
  if (faction === null) {
    throw new EffectRuntimeError('EFFECT_RUNTIME', `grantFreeOperation.faction is unknown: ${grant.faction}`, {
      effectType: 'grantFreeOperation',
      faction: grant.faction,
      availableFactions: runtime.factionOrder,
    });
  }

  let executeAsFaction: string | undefined;
  if (grant.executeAsFaction !== undefined) {
    const resolvedExecuteAs = resolveGrantFaction(grant.executeAsFaction, activeFaction, runtime.factionOrder);
    if (resolvedExecuteAs === null) {
      throw new EffectRuntimeError('EFFECT_RUNTIME', `grantFreeOperation.executeAsFaction is unknown: ${grant.executeAsFaction}`, {
        effectType: 'grantFreeOperation',
        executeAsFaction: grant.executeAsFaction,
        availableFactions: runtime.factionOrder,
      });
    }
    executeAsFaction = resolvedExecuteAs;
  }

  const uses = grant.uses ?? 1;
  if (!Number.isSafeInteger(uses) || uses <= 0) {
    throw new EffectRuntimeError('EFFECT_RUNTIME', 'grantFreeOperation.uses must be a positive integer', {
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
    throw new EffectRuntimeError('EFFECT_RUNTIME', 'grantFreeOperation.sequence.step must be a non-negative integer', {
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
