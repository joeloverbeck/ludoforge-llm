import type { ClassifiedMove, Move } from '../../src/kernel/index.js';

export function completeClassifiedMove(move: Move): ClassifiedMove {
  return {
    move,
    viability: {
      viable: true,
      complete: true,
      move,
      warnings: [],
    },
  };
}

export function pendingClassifiedMove(move: Move, decisionId = 'decision:$pending'): ClassifiedMove {
  return {
    move,
    viability: {
      viable: true,
      complete: false,
      move,
      warnings: [],
      nextDecision: {
        kind: 'pending',
        complete: false,
        decisionKey: decisionId as never,
        name: decisionId,
        options: [],
        targetKinds: [],
        type: 'chooseOne',
      },
    },
  };
}

export function stochasticClassifiedMove(move: Move): ClassifiedMove {
  return {
    move,
    viability: {
      viable: true,
      complete: false,
      move,
      warnings: [],
      stochasticDecision: {
        kind: 'pendingStochastic',
        complete: false,
        source: 'rollRandom',
        alternatives: [],
        outcomes: [],
      },
    },
  };
}

export function completeClassifiedMoves(moves: readonly Move[]): readonly ClassifiedMove[] {
  return moves.map(completeClassifiedMove);
}
