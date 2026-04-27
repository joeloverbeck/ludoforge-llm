import {
  advanceAutoresolvable,
  applyPublishedDecisionFromCanonicalState,
  asPlayerId,
  createGameDefRuntime,
  forkGameDefRuntimeForRun,
  createRng,
  initialState,
  publishMicroturnFromCanonicalState,
  rollbackToActionSelection,
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
  ProbeHoleRecoveryLog,
  Rng,
  SimulationStopReason,
  TerminalResult,
  ValidatedGameDef,
} from '../kernel/index.js';
import { computeDeltas } from './delta.js';
import { synthesizeCompoundTurnSummaries } from './compound-turns.js';
import type { SimulationOptions } from './sim-options.js';
import { extractMicroturnSnapshot } from './snapshot.js';

const AGENT_RNG_MIX = 0x9e3779b97f4a7c15n;
const OOM_TRACE_INTERVAL = 25;

const shouldLogOomTrace = (): boolean => process.env.ENGINE_OOM_TRACE === '1';

const heapUsedMb = (): number => Math.round(process.memoryUsage().heapUsed / 1024 / 1024);

const maybeLogOomTrace = (
  label: string,
  state: GameTrace['finalState'],
  decisions: number,
  runtime?: GameDefRuntime,
): void => {
  if (!shouldLogOomTrace()) {
    return;
  }
  if (decisions % OOM_TRACE_INTERVAL !== 0) {
    return;
  }
  const zobristKeyCacheSize = runtime?.zobristTable.keyCache.size ?? 0;
  const decisionStackDepth = state.decisionStack?.length ?? 0;
  console.error(
    `[oom-trace] ${label} turn=${state.turnCount} decisions=${decisions} heapMb=${heapUsedMb()} zobristKeys=${zobristKeyCacheSize} stackDepth=${decisionStackDepth}`,
  );
};

const emitDecisionHook = (
  options: SimulationOptions | undefined,
  decisionLog: DecisionLog,
  turnCount: number,
): void => {
  options?.decisionHook?.({
    kind: 'decision',
    decisionLog,
    turnCount,
    stateHash: decisionLog.stateHash,
  });
};

const emitProbeHoleRecoveryHook = (
  options: SimulationOptions | undefined,
  probeHoleRecovery: ProbeHoleRecoveryLog,
  turnCount: number,
): void => {
  options?.decisionHook?.({
    kind: 'probeHoleRecovery',
    probeHoleRecovery,
    turnCount,
    stateHash: probeHoleRecovery.stateHashAfter,
  });
};

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

const isNoBridgeableMicroturnError = (error: unknown): boolean =>
  error instanceof Error
  && (
    error.message.includes('no simple actionSelection moves are currently bridgeable')
    || error.message.includes('has no bridgeable continuations')
  );

/**
 * Run-boundary contract:
 * callers may pass a shared `GameDefRuntime` reused across many `runGame`
 * invocations. `runGame` forks that runtime via
 * `forkGameDefRuntimeForRun(...)` before execution so `runLocal` members
 * restart from their declared initial state while `sharedStructural` members
 * remain shared by reference. The caller-supplied runtime is never mutated by
 * `runGame`. Any helper that advances state with a caller-supplied runtime
 * must honor the same contract: fork internally, or require a pre-forked
 * runtime via the explicit `ForkedGameDefRuntimeForRun` assertion pattern in
 * `gamedef-runtime.ts`.
 */
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
  const resolvedRuntime = runtime === undefined
    ? createGameDefRuntime(validatedDef)
    : forkGameDefRuntimeForRun(runtime);
  const snapshotDepth = options?.snapshotDepth ?? 'none';
  const traceRetention = options?.traceRetention ?? 'full';
  const kernelOptions = options?.kernel;
  const profiler = options?.profiler;
  const chanceRng = createRng(BigInt(seed) ^ CHANCE_RNG_MIX);
  const shouldRetainTrace = traceRetention === 'full';

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
  const probeHoleRecoveries: ProbeHoleRecoveryLog[] = [];
  const agentRngByPlayer = [...createAgentRngByPlayer(seed, state.playerCount)];
  let result: TerminalResult | null = null;
  let stopReason: SimulationStopReason;
  let currentChanceRng = chanceRng;
  let appliedDecisionCount = 0;

  while (true) {
    maybeLogOomTrace('loop-start', state, appliedDecisionCount, resolvedRuntime);
    const t0_auto = perfStart(profiler);
    const autoResult = advanceAutoresolvable(validatedDef, state, currentChanceRng, resolvedRuntime);
    perfEnd(profiler, 'simLegalMoves', t0_auto);
    state = autoResult.state;
    currentChanceRng = autoResult.rng;
    if (shouldRetainTrace) {
      decisionLogs.push(...autoResult.autoResolvedLogs);
    }
    for (const log of autoResult.autoResolvedLogs) {
      emitDecisionHook(options, log, state.turnCount);
    }

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
      // state is canonical: initialState sets stateHash + _runningHash, every
      // subsequent advanceAutoresolvable / applyPublishedDecision /
      // rollbackToActionSelection result preserves canonicality.
      microturn = publishMicroturnFromCanonicalState(validatedDef, state, resolvedRuntime);
    } catch (error) {
      if (isNoBridgeableMicroturnError(error)) {
        const rollback = rollbackToActionSelection(
          validatedDef,
          state,
          resolvedRuntime,
          error instanceof Error ? error.message : String(error),
        );
        if (rollback === null) {
          stopReason = 'noLegalMoves';
          break;
        }
        state = rollback.state;
        if (shouldRetainTrace) {
          probeHoleRecoveries.push(rollback.logEntry);
        }
        emitProbeHoleRecoveryHook(options, rollback.logEntry, state.turnCount);
        continue;
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
      selected = agent.chooseDecision({
        def: validatedDef,
        state,
        microturn,
        rng: agentRng,
        ...(profiler === undefined ? {} : { profiler }),
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
    const applied = applyPublishedDecisionFromCanonicalState(
      validatedDef,
      state,
      microturn,
      selected.decision,
      kernelOptions,
      resolvedRuntime,
    );
    perfEnd(profiler, 'simApplyMove', t0_apply);
    state = applied.state;
    appliedDecisionCount += 1;

    const t0_delta = perfStart(profiler);
    const deltas = options?.skipDeltas === true ? [] : computeDeltas(preState, state);
    perfEnd(profiler, 'simComputeDeltas', t0_delta);

    const decisionLog: DecisionLog = {
      ...applied.log,
      playerId: asPlayerId(player),
      deltas,
      ...(snapshot === undefined ? {} : { snapshot }),
      ...(selected.agentDecision === undefined ? {} : { agentDecision: selected.agentDecision }),
    };
    if (shouldRetainTrace) {
      decisionLogs.push(decisionLog);
    }
    emitDecisionHook(options, decisionLog, state.turnCount);
  }

  return {
    gameDefId: validatedDef.metadata.id,
    seed,
    decisions: shouldRetainTrace ? decisionLogs : [],
    probeHoleRecoveries: shouldRetainTrace ? probeHoleRecoveries : [],
    recoveredFromProbeHole: probeHoleRecoveries.length,
    compoundTurns: shouldRetainTrace ? synthesizeCompoundTurnSummaries(decisionLogs, stopReason) : [],
    finalState: state,
    result,
    turnsCount: state.turnCount,
    stopReason,
    traceProtocolVersion: 'spec-140',
  };
};

/**
 * Batch variant of `runGame`.
 *
 * Inherits the canonical `runGame` run-boundary contract for every seed in the
 * batch. When callers provide a shared `GameDefRuntime`, each underlying
 * `runGame` invocation forks it independently before advancing state.
 */
export const runGames = (
  def: ValidatedGameDef,
  seeds: readonly number[],
  agents: readonly Agent[],
  maxTurns: number,
  playerCount?: number,
  options?: SimulationOptions,
  runtime?: GameDefRuntime,
): readonly GameTrace[] => seeds.map((seed) => runGame(def, seed, agents, maxTurns, playerCount, options, runtime));
