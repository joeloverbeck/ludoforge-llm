import type {
  AgentDecisionTrace,
  ClassifiedMove,
  GameDef,
  GameDefRuntime,
  GameState,
  Move,
  PlayerId,
  Rng,
} from '@ludoforge/engine/runtime';
import { createGameDefRuntime, createRng } from '@ludoforge/engine/runtime';

import { isAgentSeatController, type SeatController } from '../seat/seat-controller.js';
import { selectAgentMove } from './ai-move-policy.js';

const AGENT_RNG_MIX = 0x9e3779b97f4a7c15n;

export interface InitializeAgentTurnSessionInput {
  readonly def: GameDef;
  readonly seed: number;
  readonly playerCount: number;
}

export interface ResolveAgentTurnStepInput {
  readonly controller: SeatController | undefined;
  readonly def: GameDef;
  readonly legalMoves: readonly ClassifiedMove[];
  readonly playerId: PlayerId;
  readonly state: GameState;
}

export type AgentTurnStepResult =
  | { readonly kind: 'human-turn' }
  | { readonly kind: 'illegal-template'; readonly error: unknown }
  | { readonly kind: 'no-legal-moves' }
  | { readonly kind: 'no-session' }
  | { readonly kind: 'selected-move'; readonly move: Move; readonly agentDecision?: AgentDecisionTrace };

export interface AgentTurnOrchestrator {
  resetSession(): void;
  initializeSession(input: InitializeAgentTurnSessionInput): void;
  resolveStep(input: ResolveAgentTurnStepInput): AgentTurnStepResult;
}

function createAgentRngByPlayer(seed: number, playerCount: number): ReadonlyMap<PlayerId, Rng> {
  return new Map(
    Array.from(
      { length: playerCount },
      (_unused, playerIndex) => {
        return [
          playerIndex as PlayerId,
          createRng(BigInt(seed) ^ (BigInt(playerIndex + 1) * AGENT_RNG_MIX)),
        ] as const;
      },
    ),
  );
}

export function createAgentTurnOrchestrator(): AgentTurnOrchestrator {
  let runtime: GameDefRuntime | null = null;
  let agentRngByPlayer = new Map<PlayerId, Rng>();

  return {
    resetSession() {
      runtime = null;
      agentRngByPlayer = new Map<PlayerId, Rng>();
    },

    initializeSession(input) {
      runtime = createGameDefRuntime(input.def);
      agentRngByPlayer = new Map(createAgentRngByPlayer(input.seed, input.playerCount));
    },

    resolveStep(input) {
      if (runtime === null) {
        return { kind: 'no-session' };
      }

      if (!isAgentSeatController(input.controller)) {
        return { kind: 'human-turn' };
      }

      const rng = agentRngByPlayer.get(input.playerId);
      if (rng === undefined) {
        return {
          kind: 'illegal-template',
          error: `Missing agent RNG for player ${String(input.playerId)}.`,
        };
      }

      let selection: ReturnType<typeof selectAgentMove>;
      try {
        selection = selectAgentMove({
          controller: input.controller,
          def: input.def,
          state: input.state,
          playerId: input.playerId,
          legalMoves: input.legalMoves,
          rng,
          runtime,
        });
      } catch (error) {
        return { kind: 'illegal-template', error };
      }

      if (selection === null) {
        return { kind: 'no-legal-moves' };
      }

      agentRngByPlayer.set(input.playerId, selection.rng);
      return {
        kind: 'selected-move',
        move: selection.move,
        ...(selection.agentDecision === undefined ? {} : { agentDecision: selection.agentDecision }),
      };
    },
  };
}
