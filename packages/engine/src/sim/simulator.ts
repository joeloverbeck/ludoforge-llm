import {
  advanceAutoresolvable,
  applyDecision,
  asPlayerId,
  createGameDefRuntime,
  createRng,
  initialState,
  publishMicroturn,
  terminalResult,
} from '../kernel/index.js';
import { assertValidatedGameDef } from '../kernel/index.js';
import { CHANCE_RNG_MIX } from '../kernel/microturn/constants.js';
import { perfStart, perfEnd } from '../kernel/perf-profiler.js';
import type {
  Agent,
  DecisionLog,
  GameDefRuntime,
  GameTrace,
  Rng,
  SimulationStopReason,
  TerminalResult,
  ValidatedGameDef,
} from '../kernel/index.js';
import { computeDeltas } from './delta.js';
import { synthesizeCompoundTurnSummaries } from './compound-turns.js';
import type { SimulationOptions } from './sim-options.js';
import { extractMicroturnSnapshot } from './snapshot.js';
import { adaptLegacyAgentChooseMove } from './adapt-legacy-agent.js';

const AGENT_RNG_MIX = 0x9e3779b97f4a7c15n;


const validateSeed = (seed: number): void => {
  if (!Number.isSafeInteger(seed)) {
    throw new RangeError(`seed must be a safe integer, received ${String(seed)}`);
  }
};

const validateMaxTurns = (maxTurns: number): void => {
  if (!Number.isSafeInteger(maxTurns)) {
    throw new RangeError(`maxTurns must be a safe integer, received ${String(maxTurns)}`);
  }
  if (maxTurns < 0) {
    throw new RangeError(`maxTurns must be a non-negative safe integer, received ${String(maxTurns)}`);
  }
};

const createAgentRngByPlayer = (seed: number, playerCount: number): readonly Rng[] =>
  Array.from(
    { length: playerCount },
    (_, playerIndex) => createRng(BigInt(seed) ^ (BigInt(playerIndex + 1) * AGENT_RNG_MIX)),
  );

const resolvePlayerIndexForSeat = (
  def: ValidatedGameDef,
  seatId: string,
): number => {
  const explicitIndex = (def.seats ?? []).findIndex((seat) => seat.id === seatId);
  if (explicitIndex >= 0) {
    return explicitIndex;
  }

  const parsed = Number(seatId);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : -1;
};

export const runGame = (
  def: ValidatedGameDef,
  seed: number,
  agents: readonly Agent[],
  maxTurns: number,
  playerCount?: number,
  options?: SimulationOptions,
  runtime?: GameDefRuntime,
): GameTrace => {
  validateSeed(seed);
  validateMaxTurns(maxTurns);
  const validatedDef = assertValidatedGameDef(def);
  const resolvedRuntime = runtime ?? createGameDefRuntime(validatedDef);
  const snapshotDepth = options?.snapshotDepth ?? 'none';
  const kernelOptions = options?.kernel;
  const profiler = options?.profiler;
  const chanceRng = createRng(BigInt(seed) ^ CHANCE_RNG_MIX);

  // initialState receives the profiler so lifecycle events during init are captured.
  // Simulator-side profiling remains opt-in; kernel execution still uses the existing bucket contract.
  const initOptions = profiler !== undefined
    ? (kernelOptions !== undefined ? { ...kernelOptions, profiler } : { profiler })
    : kernelOptions;

  let state = initialState(validatedDef, seed, playerCount, initOptions, resolvedRuntime).state;
  if (agents.length !== state.playerCount) {
    throw new RangeError(
      `agents length must equal resolved player count ${state.playerCount}, received ${agents.length}`,
    );
  }
  const decisionLogs: DecisionLog[] = [];
  const agentRngByPlayer = [...createAgentRngByPlayer(seed, state.playerCount)];
  let result: TerminalResult | null = null;
  let stopReason: SimulationStopReason;
  let currentChanceRng = chanceRng;

  while (true) {
    const t0_auto = perfStart(profiler);
    const autoResult = advanceAutoresolvable(validatedDef, state, currentChanceRng, resolvedRuntime);
    perfEnd(profiler, 'simLegalMoves', t0_auto);
    state = autoResult.state;
    currentChanceRng = autoResult.rng;
    decisionLogs.push(...autoResult.autoResolvedLogs);

    const t0_term = perfStart(profiler);
    const terminal = terminalResult(validatedDef, state, resolvedRuntime);
    perfEnd(profiler, 'simTerminalResult', t0_term);
    if (terminal !== null) {
      result = terminal;
      stopReason = 'terminal';
      break;
    }

    if (state.turnCount >= maxTurns) {
      stopReason = 'maxTurns';
      break;
    }

    let microturn;
    try {
      microturn = publishMicroturn(validatedDef, state, resolvedRuntime);
    } catch (error) {
      if (error instanceof Error && error.message.includes('no simple actionSelection moves are currently bridgeable')) {
        stopReason = 'noLegalMoves';
        break;
      }
      throw error;
    }

    if (microturn.seatId === '__chance' || microturn.seatId === '__kernel') {
      throw new Error(`Expected player microturn after auto-resolution, received ${microturn.seatId}`);
    }

    const player = resolvePlayerIndexForSeat(validatedDef, microturn.seatId);
    const agent = player < 0 ? undefined : agents[player];
    const agentRng = player < 0 ? undefined : agentRngByPlayer[player];
    if (agent === undefined || agentRng === undefined || player < 0) {
      throw new Error(`missing agent or agent RNG for player seat ${String(microturn.seatId)}`);
    }

    const snapshot = snapshotDepth === 'none'
      ? undefined
      : extractMicroturnSnapshot(validatedDef, state, microturn, resolvedRuntime, snapshotDepth);
    let selected;
    const t0_agent = perfStart(profiler);
    try {
      selected = adaptLegacyAgentChooseMove(agent, {
        def: validatedDef,
        state,
        microturn,
        rng: agentRng,
        runtime: resolvedRuntime,
      });
    } catch (error) {
      perfEnd(profiler, 'simAgentChooseMove', t0_agent);
      throw error;
    }
    perfEnd(profiler, 'simAgentChooseMove', t0_agent);
    agentRngByPlayer[player] = selected.rng;

    const preState = state;
    const t0_apply = perfStart(profiler);
    const applied = applyDecision(validatedDef, state, selected.decision, kernelOptions, resolvedRuntime);
    perfEnd(profiler, 'simApplyMove', t0_apply);
    state = applied.state;

    const t0_delta = perfStart(profiler);
    const deltas = options?.skipDeltas === true ? [] : computeDeltas(preState, state);
    perfEnd(profiler, 'simComputeDeltas', t0_delta);

    decisionLogs.push({
      ...applied.log,
      playerId: asPlayerId(player),
      deltas,
      ...(snapshot === undefined ? {} : { snapshot }),
      ...(selected.agentDecision === undefined ? {} : { agentDecision: selected.agentDecision }),
    });
  }

  return {
    gameDefId: validatedDef.metadata.id,
    seed,
    decisions: decisionLogs,
    compoundTurns: synthesizeCompoundTurnSummaries(decisionLogs, stopReason),
    finalState: state,
    result,
    turnsCount: state.turnCount,
    stopReason,
    traceProtocolVersion: 'spec-140',
  };
};

export const runGames = (
  def: ValidatedGameDef,
  seeds: readonly number[],
  agents: readonly Agent[],
  maxTurns: number,
  playerCount?: number,
  options?: SimulationOptions,
  runtime?: GameDefRuntime,
): readonly GameTrace[] => seeds.map((seed) => runGame(def, seed, agents, maxTurns, playerCount, options, runtime));
