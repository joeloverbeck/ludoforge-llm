import type { GameTrace, StateDelta, TraceEval, TraceMetrics, TriggerLogEntry, VariableValue } from '../kernel/types.js';
import type { Decision } from '../kernel/microturn/types.js';

import { DegeneracyFlag } from '../kernel/diagnostics.js';
import { reconstructPerPlayerVarTrajectory, parsePerPlayerVarPath } from './delta.js';
import { DEFAULT_EVAL_CONFIG, type EvalConfig } from './eval-config.js';

type PerPlayerVars = Readonly<Record<number, Readonly<Record<string, VariableValue>>>>;

interface CompoundTurnLog {
  readonly stateHash: bigint;
  readonly playerId?: number;
  readonly actionId: string;
  readonly legalActionCount: number;
  readonly deltas: readonly StateDelta[];
  readonly triggerFirings: readonly TriggerLogEntry[];
}

const isActionSelectionDecision = (
  decision: Decision,
): decision is Extract<Decision, { readonly kind: 'actionSelection' }> => decision.kind === 'actionSelection';

const extractActionId = (decision: Decision): string | null => {
  if (!isActionSelectionDecision(decision)) {
    return null;
  }
  return decision.actionId;
};

const toCompoundTurnLogs = (trace: GameTrace): readonly CompoundTurnLog[] =>
  trace.compoundTurns.map((summary) => {
    const slice = trace.decisions.slice(summary.decisionIndexRange.start, summary.decisionIndexRange.end);
    const first = slice[0]!;
    const last = slice.at(-1)!;
    const actionSelection = slice.find((entry) => isActionSelectionDecision(entry.decision));
    return {
      stateHash: last.stateHash,
      actionId: (actionSelection === undefined ? null : extractActionId(actionSelection.decision)) ?? first.decision.kind,
      legalActionCount: actionSelection?.legalActionCount ?? first.legalActionCount,
      deltas: slice.flatMap((entry) => entry.deltas),
      triggerFirings: slice.flatMap((entry) => entry.triggerFirings),
      ...(slice.find((entry) => entry.playerId !== undefined)?.playerId === undefined
        ? {}
        : { playerId: Number(slice.find((entry) => entry.playerId !== undefined)!.playerId) }),
    };
  });

const mean = (values: readonly number[]): number => {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const computeGameLength = (trace: GameTrace): number => trace.turnsCount;

const computeAvgBranchingFactor = (turns: readonly CompoundTurnLog[]): number =>
  mean(turns.map((turn) => turn.legalActionCount));

const countMovesByAction = (turns: readonly CompoundTurnLog[]): readonly number[] => {
  const counts = new Map<string, number>();
  for (const turn of turns) {
    counts.set(turn.actionId, (counts.get(turn.actionId) ?? 0) + 1);
  }
  return Array.from(counts.values());
};

const computeActionDiversity = (turns: readonly CompoundTurnLog[]): number => {
  if (turns.length === 0) {
    return 0;
  }
  const counts = countMovesByAction(turns);
  if (counts.length <= 1) {
    return 0;
  }

  const totalMoves = turns.length;
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

const computeInteractionProxy = (turns: readonly CompoundTurnLog[]): number => {
  const interactionRatios: number[] = [];

  for (const turn of turns) {
    if (turn.playerId === undefined) {
      continue;
    }
    let totalPerPlayerVarDeltas = 0;
    let interactionDeltas = 0;
    for (const delta of turn.deltas) {
      const parsedPath = parsePerPlayerVarPath(delta.path);
      if (parsedPath === null) {
        continue;
      }
      totalPerPlayerVarDeltas += 1;
      if (parsedPath.playerId !== turn.playerId) {
        interactionDeltas += 1;
      }
    }
    if (totalPerPlayerVarDeltas > 0) {
      interactionRatios.push(interactionDeltas / totalPerPlayerVarDeltas);
    }
  }

  return mean(interactionRatios);
};

const computeDominantActionFreq = (turns: readonly CompoundTurnLog[]): number => {
  if (turns.length === 0) {
    return 0;
  }
  const counts = countMovesByAction(turns);
  return Math.max(...counts) / turns.length;
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
  const compoundTurns = toCompoundTurnLogs(trace);
  const trajectory = reconstructPerPlayerVarTrajectory(
    trace.finalState.perPlayerVars,
    trace.decisions,
    trace.compoundTurns,
  );

  return {
    gameLength: computeGameLength(trace),
    avgBranchingFactor: computeAvgBranchingFactor(compoundTurns),
    actionDiversity: computeActionDiversity(compoundTurns),
    resourceTension: computeResourceTension(trajectory),
    interactionProxy: computeInteractionProxy(compoundTurns),
    dominantActionFreq: computeDominantActionFreq(compoundTurns),
    dramaMeasure: computeDramaMeasure(trajectory, config.scoringVar, trace.turnsCount),
  };
};

const hasRepeatedStateHash = (turns: readonly CompoundTurnLog[]): boolean => {
  const seen = new Set<bigint>();
  for (const turn of turns) {
    if (seen.has(turn.stateHash)) {
      return true;
    }
    seen.add(turn.stateHash);
  }
  return false;
};

const hasStallRun = (
  turns: readonly CompoundTurnLog[],
  stallTurnThreshold: number,
): boolean => {
  if (turns.length === 0) {
    return false;
  }

  let consecutiveCount = 1;
  for (let index = 1; index < turns.length; index += 1) {
    if (turns[index]?.stateHash === turns[index - 1]?.stateHash) {
      consecutiveCount += 1;
    } else {
      consecutiveCount = 1;
    }

    if (consecutiveCount >= stallTurnThreshold) {
      return true;
    }
  }

  return stallTurnThreshold <= 1;
};

const hasTriggerDepthExceeded = (turns: readonly CompoundTurnLog[]): boolean =>
  turns.some((turn) => turn.triggerFirings.some((entry) => entry.kind === 'truncated'));

const computeDegeneracyFlags = (
  trace: GameTrace,
  metrics: TraceMetrics,
  config: EvalConfig,
): readonly DegeneracyFlag[] => {
  const flags: DegeneracyFlag[] = [];
  const turns = toCompoundTurnLogs(trace);

  if (hasRepeatedStateHash(turns)) {
    flags.push(DegeneracyFlag.LOOP_DETECTED);
  }
  if (trace.stopReason === 'noLegalMoves') {
    flags.push(DegeneracyFlag.NO_LEGAL_MOVES);
  }
  if (metrics.dominantActionFreq > (config.dominantActionThreshold ?? DEFAULT_EVAL_CONFIG.dominantActionThreshold)) {
    flags.push(DegeneracyFlag.DOMINANT_ACTION);
  }
  if (trace.result !== null && trace.turnsCount < (config.trivialWinThreshold ?? DEFAULT_EVAL_CONFIG.trivialWinThreshold)) {
    flags.push(DegeneracyFlag.TRIVIAL_WIN);
  }
  if (hasStallRun(turns, config.stallTurnThreshold ?? DEFAULT_EVAL_CONFIG.stallTurnThreshold)) {
    flags.push(DegeneracyFlag.STALL);
  }
  if (hasTriggerDepthExceeded(turns)) {
    flags.push(DegeneracyFlag.TRIGGER_DEPTH_EXCEEDED);
  }

  return flags;
};

export const evaluateTrace = (trace: GameTrace, config: EvalConfig = {}): TraceEval => {
  const effectiveConfig: EvalConfig = { ...DEFAULT_EVAL_CONFIG, ...config };
  const metrics = computeMetrics(trace, effectiveConfig);

  return {
    seed: trace.seed,
    turnCount: trace.turnsCount,
    stopReason: trace.stopReason,
    metrics,
    degeneracyFlags: computeDegeneracyFlags(trace, metrics, effectiveConfig),
  };
};
