import type {
  AgentDecisionTrace,
  GameDef,
  GameDefRuntime,
  GameState,
  PlayerId,
  Rng,
} from '@ludoforge/engine/runtime';
import { createGameDefRuntime, createRng } from '@ludoforge/engine/runtime';
import type { Decision, MicroturnState } from '../../../engine/src/kernel/microturn/types.js';

import { isAgentSeatController, type SeatController } from '../seat/seat-controller.js';
import { selectAgentDecision } from './ai-move-policy.js';

const AGENT_RNG_MIX = 0x9e3779b97f4a7c15n;

export interface InitializeAgentTurnSessionInput {
  readonly def: GameDef;
  readonly seed: number;
  readonly playerCount: number;
}

export interface ResolveAgentTurnStepInput {
  readonly controller: SeatController | undefined;
  readonly def: GameDef;
  readonly microturn: MicroturnState;
  readonly state: GameState;
}

export type AgentTurnStepResult =
  | { readonly kind: 'human-turn' }
  | { readonly kind: 'illegal-decision'; readonly error: unknown }
  | { readonly kind: 'no-legal-actions' }
  | { readonly kind: 'no-session' }
  | { readonly kind: 'selected-decision'; readonly decision: Decision; readonly agentDecision?: AgentDecisionTrace };

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

      const playerId = input.state.activePlayer;
      const rng = agentRngByPlayer.get(playerId);
      if (rng === undefined) {
        return {
          kind: 'illegal-decision',
          error: `Missing agent RNG for player ${String(playerId)}.`,
        };
      }

      let selection: ReturnType<typeof selectAgentDecision>;
      try {
        selection = selectAgentDecision({
          controller: input.controller,
          def: input.def,
          state: input.state,
          microturn: input.microturn,
          rng,
          runtime,
        });
      } catch (error) {
        return { kind: 'illegal-decision', error };
      }

      if (selection === null) {
        return { kind: 'no-legal-actions' };
      }

      agentRngByPlayer.set(playerId, selection.rng);
      return {
        kind: 'selected-decision',
        decision: selection.decision,
        ...(selection.agentDecision === undefined ? {} : { agentDecision: selection.agentDecision }),
      };
    },
  };
}
