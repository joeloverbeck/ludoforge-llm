import type { GameDef } from './types.js';

type CardDrivenConfig = NonNullable<Extract<GameDef['turnOrder'], { readonly type: 'cardDriven' }>['config']>;

const cardDrivenConfig = (def: GameDef): CardDrivenConfig | null =>
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
