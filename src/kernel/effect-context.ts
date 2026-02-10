import type { PlayerId } from './branded.js';
import type { AdjacencyGraph } from './spatial.js';
import type { GameDef, GameState, MoveParamValue, Rng, TriggerEvent } from './types.js';

export const DEFAULT_MAX_EFFECT_OPS = 10_000;

export interface EffectContext {
  readonly def: GameDef;
  readonly adjacencyGraph: AdjacencyGraph;
  readonly state: GameState;
  readonly rng: Rng;
  readonly activePlayer: PlayerId;
  readonly actorPlayer: PlayerId;
  readonly bindings: Readonly<Record<string, unknown>>;
  readonly moveParams: Readonly<Record<string, MoveParamValue>>;
  readonly maxEffectOps?: number;
}

export interface EffectResult {
  readonly state: GameState;
  readonly rng: Rng;
  readonly emittedEvents?: readonly TriggerEvent[];
}

export function getMaxEffectOps(ctx: Pick<EffectContext, 'maxEffectOps'>): number {
  return ctx.maxEffectOps ?? DEFAULT_MAX_EFFECT_OPS;
}
