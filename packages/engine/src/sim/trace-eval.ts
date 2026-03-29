import type { GameTrace, MoveLog, TraceEval, TraceMetrics, VariableValue } from '../kernel/types.js';

import { reconstructPerPlayerVarTrajectory, parsePerPlayerVarPath } from './delta.js';
import { DEFAULT_EVAL_CONFIG, type EvalConfig } from './eval-config.js';

type PerPlayerVars = Readonly<Record<number, Readonly<Record<string, VariableValue>>>>;

const mean = (values: readonly number[]): number => {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const computeGameLength = (trace: GameTrace): number => trace.turnsCount;

const computeAvgBranchingFactor = (moves: readonly MoveLog[]): number =>
  mean(moves.map((move) => move.legalMoveCount));

const countMovesByAction = (moves: readonly MoveLog[]): readonly number[] => {
  const counts = new Map<string, number>();
  for (const move of moves) {
    const actionId = move.move.actionId;
    counts.set(actionId, (counts.get(actionId) ?? 0) + 1);
  }
  return Array.from(counts.values());
};

const computeActionDiversity = (moves: readonly MoveLog[]): number => {
  if (moves.length === 0) {
    return 0;
  }
  const counts = countMovesByAction(moves);
  if (counts.length <= 1) {
    return 0;
  }

  const totalMoves = moves.length;
  let entropy = 0;
  for (const count of counts) {
    const probability = count / totalMoves;
    entropy -= probability * Math.log2(probability);
  }

  const normalized = entropy / Math.log2(counts.length);
  return Math.min(1, Math.max(0, normalized));
};

const variance = (values: readonly number[]): number => {
  if (values.length === 0) {
    return 0;
  }
  const average = mean(values);
  return mean(values.map((value) => (value - average) ** 2));
};

const computeResourceTension = (trajectory: readonly PerPlayerVars[]): number => {
  const perTurnVariances: number[] = [];

  for (const snapshot of trajectory.slice(1)) {
    const variableNames = new Set<string>();
    for (const vars of Object.values(snapshot)) {
      for (const [varName, value] of Object.entries(vars)) {
        if (typeof value === 'number') {
          variableNames.add(varName);
        }
      }
    }

    const snapshotVariances: number[] = [];
    for (const varName of variableNames) {
      const values: number[] = [];
      for (const vars of Object.values(snapshot)) {
        const value = vars[varName];
        if (typeof value === 'number') {
          values.push(value);
        }
      }
      snapshotVariances.push(variance(values));
    }

    if (snapshotVariances.length > 0) {
      perTurnVariances.push(mean(snapshotVariances));
    }
  }

  return mean(perTurnVariances);
};

const computeInteractionProxy = (moves: readonly MoveLog[]): number => {
  const interactionRatios: number[] = [];

  for (const move of moves) {
    let totalPerPlayerVarDeltas = 0;
    let interactionDeltas = 0;
    for (const delta of move.deltas) {
      const parsedPath = parsePerPlayerVarPath(delta.path);
      if (parsedPath === null) {
        continue;
      }
      totalPerPlayerVarDeltas += 1;
      if (parsedPath.playerId !== move.player) {
        interactionDeltas += 1;
      }
    }
    if (totalPerPlayerVarDeltas > 0) {
      interactionRatios.push(interactionDeltas / totalPerPlayerVarDeltas);
    }
  }

  return mean(interactionRatios);
};

const computeDominantActionFreq = (moves: readonly MoveLog[]): number => {
  if (moves.length === 0) {
    return 0;
  }
  const counts = countMovesByAction(moves);
  return Math.max(...counts) / moves.length;
};

const uniqueLeader = (snapshot: PerPlayerVars, scoringVar: string): number | null => {
  let bestPlayerId: number | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  let tie = false;

  for (const [playerIdText, vars] of Object.entries(snapshot)) {
    const value = vars[scoringVar];
    if (typeof value !== 'number') {
      continue;
    }
    const playerId = Number(playerIdText);
    if (value > bestScore) {
      bestScore = value;
      bestPlayerId = playerId;
      tie = false;
      continue;
    }
    if (value === bestScore) {
      tie = true;
    }
  }

  if (bestPlayerId === null || tie) {
    return null;
  }
  return bestPlayerId;
};

const computeDramaMeasure = (
  trajectory: readonly PerPlayerVars[],
  scoringVar: string | undefined,
  turnsCount: number,
): number => {
  if (scoringVar === undefined || turnsCount === 0) {
    return 0;
  }

  let leadChanges = 0;
  let previousUniqueLeader = trajectory[0] === undefined ? null : uniqueLeader(trajectory[0], scoringVar);
  for (const snapshot of trajectory.slice(1)) {
    const leader = uniqueLeader(snapshot, scoringVar);
    if (leader === null) {
      continue;
    }
    if (previousUniqueLeader !== null && leader !== previousUniqueLeader) {
      leadChanges += 1;
    }
    previousUniqueLeader = leader;
  }

  return leadChanges / turnsCount;
};

const computeMetrics = (
  trace: GameTrace,
  config: EvalConfig,
): TraceMetrics => {
  const trajectory = reconstructPerPlayerVarTrajectory(trace.finalState.perPlayerVars, trace.moves);

  return {
    gameLength: computeGameLength(trace),
    avgBranchingFactor: computeAvgBranchingFactor(trace.moves),
    actionDiversity: computeActionDiversity(trace.moves),
    resourceTension: computeResourceTension(trajectory),
    interactionProxy: computeInteractionProxy(trace.moves),
    dominantActionFreq: computeDominantActionFreq(trace.moves),
    dramaMeasure: computeDramaMeasure(trajectory, config.scoringVar, trace.turnsCount),
  };
};

export const evaluateTrace = (trace: GameTrace, config: EvalConfig = {}): TraceEval => {
  const effectiveConfig: EvalConfig = { ...DEFAULT_EVAL_CONFIG, ...config };

  return {
    seed: trace.seed,
    turnCount: trace.turnsCount,
    stopReason: trace.stopReason,
    metrics: computeMetrics(trace, effectiveConfig),
    degeneracyFlags: [],
  };
};
