import { createTrustedExecutableMove, type ClassifiedMove, type Move, type TrustedExecutableMove } from '../../src/kernel/index.js';

export function trustedMove(
  move: Move,
  sourceStateHash = 0n,
  provenance: TrustedExecutableMove['provenance'] = 'enumerateLegalMoves',
): TrustedExecutableMove {
  return createTrustedExecutableMove(move, sourceStateHash, provenance);
}

export function completeClassifiedMove(move: Move, sourceStateHash = 0n): ClassifiedMove {
  return {
    move,
    viability: {
      viable: true,
      complete: true,
      move,
      warnings: [],
    },
    trustedMove: trustedMove(move, sourceStateHash),
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
    trustedMove: undefined,
  };
}

export function stochasticClassifiedMove(move: Move, sourceStateHash = 0n): ClassifiedMove {
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
    trustedMove: trustedMove(move, sourceStateHash),
  };
}

export function completeClassifiedMoves(moves: readonly Move[], sourceStateHash = 0n): readonly ClassifiedMove[] {
  return moves.map((move) => completeClassifiedMove(move, sourceStateHash));
}
