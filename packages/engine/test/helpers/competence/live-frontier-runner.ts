import { runGameSteps } from '../../../src/sim/run-game-steps.js';
import {
  serializeGameState,
  type Agent,
  type Decision,
  type DecisionLog,
  type GameDefRuntime,
  type GameState,
  type MicroturnState,
  type PolicyAgentDecisionTrace,
  type PolicyPlanMicroturnTrace,
  type PolicyPlanTrace,
  type ValidatedGameDef,
} from '../../../src/kernel/index.js';
import type { SimulationOptions } from '../../../src/sim/sim-options.js';

export interface CompetenceAdvanceContext {
  readonly state: GameState;
  readonly microturn: MicroturnState;
}

export interface RunToCompetenceDecisionInput {
  readonly def: ValidatedGameDef;
  readonly seed: number;
  readonly agents: readonly Agent[];
  readonly playerCount?: number;
  readonly runtime?: GameDefRuntime;
  readonly options?: SimulationOptions;
  readonly maxTurns?: number;
  readonly microturnBound?: number;
  readonly advanceUntil: (context: CompetenceAdvanceContext) => boolean;
}

export interface CompetenceRunResult {
  readonly targetMicroturn: MicroturnState;
  readonly targetFrontier: readonly Decision[];
  readonly selectedDecision: Decision;
  readonly preState: GameState;
  readonly postState: GameState;
  readonly decisions: readonly DecisionLog[];
  readonly agentDecision?: PolicyAgentDecisionTrace;
  readonly planTrace?: PolicyPlanTrace;
  readonly microturnTraces: readonly PolicyPlanMicroturnTrace[];
  readonly stopReason: 'turnCompleted' | 'terminal' | 'maxTurns' | 'noLegalMoves';
}

const DEFAULT_MAX_TURNS = 20;
const DEFAULT_MICROTURN_BOUND = 100;

const decisionKey = (decision: Decision): string => JSON.stringify(decision);

const sameTurn = (candidate: DecisionLog, target: DecisionLog): boolean =>
  String(candidate.turnId) === String(target.turnId);

const planMicroturnsFrom = (logs: readonly DecisionLog[]): readonly PolicyPlanMicroturnTrace[] =>
  logs.flatMap((log) => log.agentDecision?.plan?.microturns ?? []);

const resultFromTarget = (
  targetMicroturn: MicroturnState,
  preState: GameState,
  targetLog: DecisionLog,
  postState: GameState,
  decisions: readonly DecisionLog[],
  stopReason: CompetenceRunResult['stopReason'],
): CompetenceRunResult => ({
  targetMicroturn,
  targetFrontier: targetMicroturn.legalActions,
  selectedDecision: targetLog.decision,
  preState,
  postState,
  decisions,
  ...(targetLog.agentDecision === undefined ? {} : { agentDecision: targetLog.agentDecision }),
  ...(targetLog.agentDecision?.plan === undefined ? {} : { planTrace: targetLog.agentDecision.plan }),
  microturnTraces: planMicroturnsFrom(decisions),
  stopReason,
});

export const runToCompetenceDecision = (input: RunToCompetenceDecisionInput): CompetenceRunResult => {
  const maxTurns = input.maxTurns ?? DEFAULT_MAX_TURNS;
  const microturnBound = input.microturnBound ?? DEFAULT_MICROTURN_BOUND;
  const iterator = runGameSteps({
    def: input.def,
    seed: input.seed,
    agents: input.agents,
    maxTurns,
    ...(input.playerCount === undefined ? {} : { playerCount: input.playerCount }),
    ...(input.options === undefined ? {} : { options: input.options }),
    ...(input.runtime === undefined ? {} : { runtime: input.runtime }),
  });

  let lastPublishedState: GameState | undefined;
  let targetMicroturn: MicroturnState | undefined;
  let preState: GameState | undefined;
  let targetLog: DecisionLog | undefined;
  let appliedMicroturnCount = 0;
  const decisions: DecisionLog[] = [];

  for (let next = iterator.next(); !next.done; next = iterator.next()) {
    const step = next.value;
    if (step.kind === 'auto') {
      lastPublishedState = step.state;
      if (targetLog !== undefined) {
        const currentTargetLog = targetLog;
        decisions.push(...step.autoResolvedLogs.filter((log) => sameTurn(log, currentTargetLog)));
        if (step.autoResolvedLogs.some((log) => sameTurn(log, currentTargetLog) && log.turnRetired)) {
          return resultFromTarget(targetMicroturn!, preState!, currentTargetLog, step.state, decisions, 'turnCompleted');
        }
      }
      continue;
    }

    if (step.kind === 'recovery') {
      lastPublishedState = step.state;
      continue;
    }

    if (step.kind === 'player') {
      appliedMicroturnCount += 1;
      if (appliedMicroturnCount > microturnBound) {
        throw new Error(`competence runner exceeded microturn bound ${microturnBound}`);
      }

      if (targetLog === undefined) {
        const candidatePreState = lastPublishedState ?? step.state;
        if (!input.advanceUntil({ state: candidatePreState, microturn: step.microturn })) {
          lastPublishedState = step.state;
          continue;
        }
        if (!step.microturn.legalActions.some((decision) => decisionKey(decision) === decisionKey(step.decisionLog.decision))) {
          throw new Error('competence runner selected decision absent from published frontier');
        }
        targetMicroturn = step.microturn;
        preState = candidatePreState;
        targetLog = step.decisionLog;
        decisions.push(step.decisionLog);
        if (step.decisionLog.turnRetired) {
          return resultFromTarget(targetMicroturn, preState, targetLog, step.state, decisions, 'turnCompleted');
        }
      } else if (sameTurn(step.decisionLog, targetLog)) {
        decisions.push(step.decisionLog);
        if (step.decisionLog.turnRetired) {
          return resultFromTarget(targetMicroturn!, preState!, targetLog, step.state, decisions, 'turnCompleted');
        }
      } else {
        return resultFromTarget(targetMicroturn!, preState!, targetLog, lastPublishedState ?? step.state, decisions, 'turnCompleted');
      }
      lastPublishedState = step.state;
      continue;
    }

    if (targetLog !== undefined) {
      return resultFromTarget(targetMicroturn!, preState!, targetLog, step.state, decisions, step.stopReason);
    }
  }

  throw new Error('competence runner did not reach a matching target microturn');
};

export const canonicalStateChanged = (before: GameState, after: GameState): boolean =>
  JSON.stringify(serializeGameState(before)) !== JSON.stringify(serializeGameState(after));
