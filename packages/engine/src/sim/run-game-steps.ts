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
import { cardDrivenRuntime } from '../kernel/card-driven-accessors.js';
import { CHANCE_RNG_MIX } from '../kernel/microturn/constants.js';
import { perfStart, perfEnd } from '../kernel/perf-profiler.js';
import type {
  Agent,
  ApplyDecisionResult,
  DecisionLog,
  GameDefRuntime,
  GameState,
  GameTrace,
  MicroturnState,
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

interface PerDecisionProfileEntry {
  readonly turnId: number;
  readonly seatId: string;
  readonly decisionKind: string;
  readonly decisionKey: string;
  readonly wallClockMs: number;
  readonly candidateCount: number;
  readonly sourceStateHash: string;
}

const pendingPerDecisionProfileBuffers = new Set<PerDecisionProfileEntry[]>();
let perDecisionProfileBeforeExitRegistered = false;

export interface RunGameInput {
  readonly def: ValidatedGameDef;
  readonly seed: number;
  readonly agents: readonly Agent[];
  readonly maxTurns: number;
  readonly playerCount?: number;
  readonly options?: SimulationOptions;
  readonly runtime?: GameDefRuntime;
}

export interface RunGameStepAuto {
  readonly kind: 'auto';
  readonly state: GameState;
  readonly autoResolvedLogs: readonly DecisionLog[];
}

export interface RunGameStepPlayer {
  readonly kind: 'player';
  readonly state: GameState;
  readonly microturn: MicroturnState;
  readonly applied: ApplyDecisionResult;
  readonly decisionLog: DecisionLog;
}

export interface RunGameStepRecovery {
  readonly kind: 'recovery';
  readonly state: GameState;
  readonly logEntry: ProbeHoleRecoveryLog;
}

export interface RunGameStepTerminal {
  readonly kind: 'terminal' | 'maxTurns' | 'noLegalMoves';
  readonly state: GameState;
  readonly result: TerminalResult | null;
  readonly stopReason: SimulationStopReason;
}

export type RunGameStep =
  | RunGameStepAuto
  | RunGameStepPlayer
  | RunGameStepRecovery
  | RunGameStepTerminal;

const shouldLogOomTrace = (): boolean => process.env.ENGINE_OOM_TRACE === '1';

const shouldRecordPerDecisionProfile = (): boolean =>
  process.env.ENGINE_PER_DECISION_PROFILE === '1';

const heapUsedMb = (): number => Math.round(process.memoryUsage().heapUsed / 1024 / 1024);

const createPerDecisionProfileBuffer = (): PerDecisionProfileEntry[] => {
  if (!perDecisionProfileBeforeExitRegistered) {
    process.once('beforeExit', flushPendingPerDecisionProfiles);
    perDecisionProfileBeforeExitRegistered = true;
  }
  const buffer: PerDecisionProfileEntry[] = [];
  pendingPerDecisionProfileBuffers.add(buffer);
  return buffer;
};

const stateHashToHex = (stateHash: bigint): string => `0x${stateHash.toString(16)}`;

const decisionKeyToString = (decisionKey: DecisionLog['decisionKey']): string =>
  decisionKey === null ? '' : String(decisionKey);

const recordPerDecisionProfileEntry = (
  buffer: PerDecisionProfileEntry[] | undefined,
  decisionLog: DecisionLog,
  wallClockMs: number,
): void => {
  if (buffer === undefined) {
    return;
  }
  buffer.push({
    turnId: Number(decisionLog.turnId),
    seatId: String(decisionLog.seatId),
    decisionKind: String(decisionLog.decisionContextKind),
    decisionKey: decisionKeyToString(decisionLog.decisionKey),
    wallClockMs,
    candidateCount: decisionLog.legalActionCount,
    sourceStateHash: stateHashToHex(decisionLog.stateHash),
  });
};

const flushPerDecisionProfile = (buffer: PerDecisionProfileEntry[] | undefined): void => {
  if (buffer === undefined) {
    return;
  }
  pendingPerDecisionProfileBuffers.delete(buffer);
  process.stderr.write(`[per-decision-profile] ${JSON.stringify({ kind: 'per-decision-profile', entries: buffer })}\n`);
};

const flushPendingPerDecisionProfiles = (): void => {
  const buffers = [...pendingPerDecisionProfileBuffers];
  pendingPerDecisionProfileBuffers.clear();
  for (const buffer of buffers) {
    flushPerDecisionProfile(buffer);
  }
};

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

const assembleTrace = (
  validatedDef: ValidatedGameDef,
  seed: number,
  state: GameState,
  result: TerminalResult | null,
  stopReason: SimulationStopReason,
  shouldRetainTrace: boolean,
  decisionLogs: readonly DecisionLog[],
  probeHoleRecoveries: readonly ProbeHoleRecoveryLog[],
): GameTrace => ({
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
});

export function* runGameSteps(input: RunGameInput): Generator<RunGameStep, GameTrace, void> {
  const { def, seed, agents, maxTurns, playerCount, options, runtime } = input;
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
  let currentChanceRng = chanceRng;
  let appliedDecisionCount = 0;
  const perDecisionProfileBuffer = shouldRecordPerDecisionProfile()
    ? createPerDecisionProfileBuffer()
    : undefined;

  while (true) {
    maybeLogOomTrace('loop-start', state, appliedDecisionCount, resolvedRuntime);
    const autoStartedAt = perDecisionProfileBuffer === undefined ? 0 : performance.now();
    const t0_auto = perfStart(profiler);
    const autoResult = advanceAutoresolvable(validatedDef, state, currentChanceRng, resolvedRuntime);
    perfEnd(profiler, 'simLegalMoves', t0_auto);
    const autoElapsedMs = perDecisionProfileBuffer === undefined ? 0 : performance.now() - autoStartedAt;
    state = autoResult.state;
    currentChanceRng = autoResult.rng;
    if (shouldRetainTrace) {
      decisionLogs.push(...autoResult.autoResolvedLogs);
    }
    const autoElapsedPerLog = autoResult.autoResolvedLogs.length === 0
      ? 0
      : autoElapsedMs / autoResult.autoResolvedLogs.length;
    for (const log of autoResult.autoResolvedLogs) {
      recordPerDecisionProfileEntry(perDecisionProfileBuffer, log, autoElapsedPerLog);
      emitDecisionHook(options, log, state.turnCount);
    }
    yield { kind: 'auto', state, autoResolvedLogs: autoResult.autoResolvedLogs };

    const t0_term = perfStart(profiler);
    const terminal = terminalResult(validatedDef, state, resolvedRuntime);
    perfEnd(profiler, 'simTerminalResult', t0_term);
    if (terminal !== null) {
      const stopReason: SimulationStopReason = 'terminal';
      yield { kind: 'terminal', state, result: terminal, stopReason };
      flushPerDecisionProfile(perDecisionProfileBuffer);
      return assembleTrace(
        validatedDef,
        seed,
        state,
        terminal,
        stopReason,
        shouldRetainTrace,
        decisionLogs,
        probeHoleRecoveries,
      );
    }

    if (cardDrivenRuntime(state)?.lifecycleStatus.stalled === true) {
      const stopReason: SimulationStopReason = 'noLegalMoves';
      yield { kind: 'noLegalMoves', state, result: null, stopReason };
      flushPerDecisionProfile(perDecisionProfileBuffer);
      return assembleTrace(
        validatedDef,
        seed,
        state,
        null,
        stopReason,
        shouldRetainTrace,
        decisionLogs,
        probeHoleRecoveries,
      );
    }

    if (state.turnCount >= maxTurns) {
      const stopReason: SimulationStopReason = 'maxTurns';
      yield { kind: 'maxTurns', state, result: null, stopReason };
      flushPerDecisionProfile(perDecisionProfileBuffer);
      return assembleTrace(
        validatedDef,
        seed,
        state,
        null,
        stopReason,
        shouldRetainTrace,
        decisionLogs,
        probeHoleRecoveries,
      );
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
          const stopReason: SimulationStopReason = 'noLegalMoves';
          yield { kind: 'noLegalMoves', state, result: null, stopReason };
          flushPerDecisionProfile(perDecisionProfileBuffer);
          return assembleTrace(
            validatedDef,
            seed,
            state,
            null,
            stopReason,
            shouldRetainTrace,
            decisionLogs,
            probeHoleRecoveries,
          );
        }
        state = rollback.state;
        if (shouldRetainTrace) {
          probeHoleRecoveries.push(rollback.logEntry);
        }
        emitProbeHoleRecoveryHook(options, rollback.logEntry, state.turnCount);
        yield { kind: 'recovery', state, logEntry: rollback.logEntry };
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
    const decisionStartedAt = perDecisionProfileBuffer === undefined ? 0 : performance.now();
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
    recordPerDecisionProfileEntry(
      perDecisionProfileBuffer,
      decisionLog,
      perDecisionProfileBuffer === undefined ? 0 : performance.now() - decisionStartedAt,
    );
    if (shouldRetainTrace) {
      decisionLogs.push(decisionLog);
    }
    emitDecisionHook(options, decisionLog, state.turnCount);
    yield { kind: 'player', state, microturn, applied, decisionLog };
  }
}
