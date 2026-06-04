import { runGameSteps } from '../../../src/sim/run-game-steps.js';
import { computeDeltas } from '../../../src/sim/delta.js';
import {
  advanceAutoresolvable,
  applyPublishedDecisionFromCanonicalState,
  asPlayerId,
  createGameDefRuntime,
  createRng,
  forkGameDefRuntimeForRun,
  publishMicroturnFromCanonicalState,
  rollbackToActionSelection,
  serializeGameState,
  terminalResult,
  withResolvedHash,
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
import { cardDrivenRuntime } from '../../../src/kernel/card-driven-accessors.js';
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
  readonly bootstrapState?: GameState;
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
const AGENT_RNG_MIX = 0x9e3779b97f4a7c15n;
const CHANCE_RNG_MIX = 0x9e3779b97f4a7c15n ^ 0xa0761d6478bd642fn;

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
  const bootstrapState = input.bootstrapState;
  if (bootstrapState !== undefined) {
    return runToCompetenceDecisionFromBootstrapState({ ...input, bootstrapState });
  }

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

const runToCompetenceDecisionFromBootstrapState = (
  input: RunToCompetenceDecisionInput & { readonly bootstrapState: GameState },
): CompetenceRunResult => {
  const maxTurns = input.maxTurns ?? DEFAULT_MAX_TURNS;
  const microturnBound = input.microturnBound ?? DEFAULT_MICROTURN_BOUND;
  const runtime = input.runtime === undefined
    ? createGameDefRuntime(input.def)
    : forkGameDefRuntimeForRun(input.runtime);
  let state = withResolvedHash(input.def, input.bootstrapState, runtime);
  const playerCount = input.playerCount ?? state.playerCount;
  if (input.agents.length !== playerCount) {
    throw new RangeError(
      `agents length must equal resolved player count ${playerCount}, received ${input.agents.length}`,
    );
  }

  let currentChanceRng = createRng(BigInt(input.seed) ^ CHANCE_RNG_MIX);
  const agentRngByPlayer = Array.from(
    { length: playerCount },
    (_, playerIndex) => createRng(BigInt(input.seed) ^ (BigInt(playerIndex + 1) * AGENT_RNG_MIX)),
  );
  const decisions: DecisionLog[] = [];
  let targetMicroturn: MicroturnState | undefined;
  let preState: GameState | undefined;
  let targetLog: DecisionLog | undefined;
  let appliedMicroturnCount = 0;

  while (true) {
    const autoResult = advanceAutoresolvable(input.def, state, currentChanceRng, runtime);
    state = autoResult.state;
    currentChanceRng = autoResult.rng;
    if (targetLog !== undefined) {
      const currentTargetLog = targetLog;
      decisions.push(...autoResult.autoResolvedLogs.filter((log) => sameTurn(log, currentTargetLog)));
      if (autoResult.autoResolvedLogs.some((log) => sameTurn(log, currentTargetLog) && log.turnRetired)) {
        return resultFromTarget(targetMicroturn!, preState!, currentTargetLog, state, decisions, 'turnCompleted');
      }
    }

    if (terminalResult(input.def, state, runtime) !== null) {
      if (targetLog !== undefined) {
        return resultFromTarget(targetMicroturn!, preState!, targetLog, state, decisions, 'terminal');
      }
      throw new Error('competence runner reached terminal state before a matching target microturn');
    }
    if (cardDrivenRuntime(state)?.lifecycleStatus.stalled === true) {
      if (targetLog !== undefined) {
        return resultFromTarget(targetMicroturn!, preState!, targetLog, state, decisions, 'noLegalMoves');
      }
      throw new Error('competence runner stalled before a matching target microturn');
    }
    if (state.turnCount >= maxTurns) {
      if (targetLog !== undefined) {
        return resultFromTarget(targetMicroturn!, preState!, targetLog, state, decisions, 'maxTurns');
      }
      throw new Error('competence runner exceeded maxTurns before a matching target microturn');
    }

    let microturn: MicroturnState;
    try {
      microturn = publishMicroturnFromCanonicalState(input.def, state, runtime);
    } catch (error) {
      if (error instanceof Error && isNoBridgeableMicroturnError(error)) {
        const rollback = rollbackToActionSelection(input.def, state, runtime, error.message);
        if (rollback === null) {
          if (targetLog !== undefined) {
            return resultFromTarget(targetMicroturn!, preState!, targetLog, state, decisions, 'noLegalMoves');
          }
          throw error;
        }
        state = rollback.state;
        continue;
      }
      throw error;
    }

    if (microturn.seatId === '__chance' || microturn.seatId === '__kernel') {
      throw new Error(`Expected player microturn after auto-resolution, received ${microturn.seatId}`);
    }

    appliedMicroturnCount += 1;
    if (appliedMicroturnCount > microturnBound) {
      throw new Error(`competence runner exceeded microturn bound ${microturnBound}`);
    }

    const player = resolvePlayerIndex(input.def, String(microturn.seatId));
    const agent = player < 0 ? undefined : input.agents[player];
    const agentRng = player < 0 ? undefined : agentRngByPlayer[player];
    if (agent === undefined || agentRng === undefined || player < 0) {
      throw new Error(`missing agent or agent RNG for player seat ${String(microturn.seatId)}`);
    }

    if (targetLog !== undefined && String(microturn.seatId) !== String(targetLog.seatId)) {
      return resultFromTarget(targetMicroturn!, preState!, targetLog, state, decisions, 'turnCompleted');
    }

    const selected = agent.chooseDecision({
      def: input.def,
      state,
      microturn,
      rng: agentRng,
      runtime,
    });
    agentRngByPlayer[player] = selected.rng;

    const beforeDecision = state;
    const applied = applyPublishedDecisionFromCanonicalState(
      input.def,
      state,
      microturn,
      selected.decision,
      input.options?.kernel,
      runtime,
    );
    state = applied.state;
    const decisionLog: DecisionLog = {
      ...applied.log,
      playerId: asPlayerId(player),
      deltas: input.options?.skipDeltas === true ? [] : computeDeltas(beforeDecision, state),
      ...(selected.agentDecision === undefined ? {} : { agentDecision: selected.agentDecision }),
    };

    if (targetLog === undefined) {
      if (!input.advanceUntil({ state: beforeDecision, microturn })) {
        continue;
      }
      if (!microturn.legalActions.some((decision) => decisionKey(decision) === decisionKey(decisionLog.decision))) {
        throw new Error('competence runner selected decision absent from published frontier');
      }
      targetMicroturn = microturn;
      preState = beforeDecision;
      targetLog = decisionLog;
      decisions.push(decisionLog);
      if (decisionLog.turnRetired) {
        return resultFromTarget(targetMicroturn, preState, targetLog, state, decisions, 'turnCompleted');
      }
    } else if (sameTurn(decisionLog, targetLog)) {
      decisions.push(decisionLog);
      if (decisionLog.turnRetired) {
        return resultFromTarget(targetMicroturn!, preState!, targetLog, state, decisions, 'turnCompleted');
      }
    }
  }
};

const isNoBridgeableMicroturnError = (error: Error): boolean =>
  error.message.includes('no simple actionSelection moves are currently bridgeable')
  || error.message.includes('has no bridgeable continuations');

const resolvePlayerIndex = (
  def: Pick<RunToCompetenceDecisionInput['def'], 'seats'>,
  seatId: string,
): number => {
  const explicitIndex = (def.seats ?? []).findIndex((seat) => seat.id === seatId);
  if (explicitIndex >= 0) {
    return explicitIndex;
  }
  const parsed = Number(seatId);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : -1;
};

export const canonicalStateChanged = (before: GameState, after: GameState): boolean =>
  JSON.stringify(serializeGameState(before)) !== JSON.stringify(serializeGameState(after));
