import type { GameDef, GameState } from './types.js';

export type CardDrivenConfig = NonNullable<Extract<GameDef['turnOrder'], { readonly type: 'cardDriven' }>['config']>;
export type CardDrivenRuntime = Extract<GameState['turnOrderState'], { readonly type: 'cardDriven' }>['runtime'];

export const cardDrivenConfig = (def: GameDef): CardDrivenConfig | null =>
  def.turnOrder?.type === 'cardDriven' ? def.turnOrder.config : null;

export const cardDrivenRuntime = (state: GameState): CardDrivenRuntime | null =>
  state.turnOrderState.type === 'cardDriven' ? state.turnOrderState.runtime : null;
