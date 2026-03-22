import { createAgent, normalizeAgentDescriptor } from '@ludoforge/engine/agents';
import type {
  AgentDecisionTrace,
  AgentDescriptor,
  ClassifiedMove,
  GameDef,
  GameDefRuntime,
  GameState,
  PlayerId,
  Rng,
  TrustedExecutableMove,
} from '@ludoforge/engine/runtime';

import {
  isAgentSeatController,
  normalizeSeatController,
  type SeatController,
} from '../seat/seat-controller.js';

export type AiPlaybackSpeed = '1x' | '2x' | '4x';

export interface AgentMoveSelectionResult {
  readonly move: TrustedExecutableMove;
  readonly rng: Rng;
  readonly agentDecision?: AgentDecisionTrace;
}

export interface SelectAgentMoveInput {
  readonly controller: SeatController;
  readonly def: GameDef;
  readonly state: GameState;
  readonly playerId: PlayerId;
  readonly legalMoves: readonly ClassifiedMove[];
  readonly rng: Rng;
  readonly runtime: GameDefRuntime;
}

const MIN_RANDOM = 0;
const MAX_RANDOM = 0.999_999_999;
const BASE_STEP_DELAY_MS = 500;
const SPEED_MULTIPLIERS: Readonly<Record<AiPlaybackSpeed, number>> = {
  '1x': 1,
  '2x': 2,
  '4x': 4,
};
function clampRandom(value: number): number {
  if (!Number.isFinite(value)) {
    return MIN_RANDOM;
  }
  return Math.min(MAX_RANDOM, Math.max(MIN_RANDOM, value));
}

export function resolveAgentDescriptor(controller: SeatController | undefined): AgentDescriptor {
  const normalized = normalizeSeatController(controller);
  if (!isAgentSeatController(normalized)) {
    throw new Error('Cannot resolve an agent descriptor for a human-controlled seat.');
  }
  return normalizeAgentDescriptor(normalized.agent);
}

export function selectAgentMove(input: SelectAgentMoveInput): AgentMoveSelectionResult | null {
  if (input.legalMoves.length === 0) {
    return null;
  }

  const descriptor = resolveAgentDescriptor(input.controller);
  const agent = createAgent(descriptor);
  return agent.chooseMove({
    def: input.def,
    state: input.state,
    playerId: input.playerId,
    legalMoves: input.legalMoves,
    rng: input.rng,
    runtime: input.runtime,
  });
}

export function selectRandomIndex(length: number, random: () => number = Math.random): number {
  if (length <= 0) {
    throw new Error('length must be greater than zero');
  }
  const normalized = clampRandom(random());
  return Math.floor(normalized * length);
}

export function resolveAiPlaybackDelayMs(speed: AiPlaybackSpeed, baseDelayMs = BASE_STEP_DELAY_MS): number {
  const multiplier = SPEED_MULTIPLIERS[speed];
  if (!Number.isFinite(baseDelayMs) || baseDelayMs < 0) {
    throw new Error('AI playback base delay must be a finite number >= 0.');
  }

  return Math.round(baseDelayMs / multiplier);
}
