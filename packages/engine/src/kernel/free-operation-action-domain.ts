import type { GameDef } from './types.js';

const cardDrivenConfig = (def: GameDef) =>
  def.turnOrder?.type === 'cardDriven' ? def.turnOrder.config : null;

export const resolveEffectiveFreeOperationActionDomain = (
  actionIds: readonly string[] | undefined,
  defaultActionIds: readonly string[] | undefined,
): readonly string[] => actionIds ?? defaultActionIds ?? [];

export const resolveTurnFlowDefaultFreeOperationActionDomain = (
  def: GameDef,
): readonly string[] =>
  cardDrivenConfig(def)?.turnFlow.freeOperationActionIds ?? [];

export const resolveGrantFreeOperationActionDomain = (
  def: GameDef,
  grant: { readonly actionIds?: readonly string[] },
): readonly string[] =>
  resolveEffectiveFreeOperationActionDomain(grant.actionIds, resolveTurnFlowDefaultFreeOperationActionDomain(def));
