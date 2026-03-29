export type BuiltinAgentId = 'random' | 'greedy' | 'policy';

export class NoPlayableMovesAfterPreparationError extends Error {
  readonly code = 'NO_PLAYABLE_MOVES_AFTER_PREPARATION';
  readonly agentId: BuiltinAgentId;
  readonly legalMoveCount: number;

  constructor(agentId: BuiltinAgentId, legalMoveCount: number) {
    super(
      `${agentId} agent could not derive a playable move from ${String(legalMoveCount)} classified legal move(s)`,
    );
    this.name = 'NoPlayableMovesAfterPreparationError';
    this.agentId = agentId;
    this.legalMoveCount = legalMoveCount;
  }
}

export const isNoPlayableMovesAfterPreparationError = (
  value: unknown,
): value is NoPlayableMovesAfterPreparationError => value instanceof NoPlayableMovesAfterPreparationError;
