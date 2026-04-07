import { applyTrustedMove, createGameDefRuntime, createRng, enumerateLegalMoves, initialState, terminalResult, advanceToDecisionPoint } from '../kernel/index.js';
import { assertValidatedGameDef } from '../kernel/index.js';
import { createSeatResolutionContext } from '../kernel/identity.js';
import { skipPendingSkippableFreeOperationGrants } from '../kernel/turn-flow-eligibility.js';
import { perfStart, perfEnd } from '../kernel/perf-profiler.js';
import type {
  Agent,
  GameDefRuntime,
  GameTrace,
  Move,
  MoveContext,
  MoveLog,
  Rng,
  SimulationStopReason,
  TerminalResult,
  ValidatedGameDef,
} from '../kernel/index.js';
import { isNoPlayableMovesAfterPreparationError } from '../agents/no-playable-move.js';
import { computeDeltas } from './delta.js';
import type { SimulationOptions } from './sim-options.js';
import { extractDecisionPointSnapshot } from './snapshot.js';

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

const captureMoveContext = (move: Move): MoveContext | undefined => {
  const actionId = String(move.actionId);
  const eventSide = actionId.includes('shaded')
    ? 'shaded'
    : actionId.includes('unshaded')
      ? 'unshaded'
      : undefined;
  const currentCardId = typeof move.params['$cardId'] === 'string'
    ? move.params['$cardId']
    : typeof move.params['cardId'] === 'string'
      ? move.params['cardId']
      : undefined;
  const turnFlowWindow = typeof move.params['__windowId'] === 'string'
    ? move.params['__windowId']
    : undefined;

  if (eventSide === undefined && currentCardId === undefined && turnFlowWindow === undefined) {
    return undefined;
  }

  return {
    ...(currentCardId !== undefined ? { currentCardId } : {}),
    ...(eventSide !== undefined ? { eventSide } : {}),
    ...(turnFlowWindow !== undefined ? { turnFlowWindow } : {}),
  };
};

const createAgentRngByPlayer = (seed: number, playerCount: number): readonly Rng[] =>
  Array.from(
    { length: playerCount },
    (_, playerIndex) => createRng(BigInt(seed) ^ (BigInt(playerIndex + 1) * AGENT_RNG_MIX)),
  );

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

  // initialState receives the profiler so lifecycle events during init are captured.
  // applyTrustedMove does NOT receive the profiler to avoid 30%+ deep instrumentation overhead.
  const initOptions = profiler !== undefined
    ? (kernelOptions !== undefined ? { ...kernelOptions, profiler } : { profiler })
    : kernelOptions;

  let state = initialState(validatedDef, seed, playerCount, initOptions, resolvedRuntime).state;
  if (agents.length !== state.playerCount) {
    throw new RangeError(
      `agents length must equal resolved player count ${state.playerCount}, received ${agents.length}`,
    );
  }
  const moveLogs: MoveLog[] = [];
  const agentRngByPlayer = [...createAgentRngByPlayer(seed, state.playerCount)];
  let result: TerminalResult | null = null;
  let stopReason: SimulationStopReason;

  while (true) {
    const t0_term = perfStart(profiler);
    const terminal = terminalResult(validatedDef, state, resolvedRuntime);
    perfEnd(profiler, 'simTerminalResult', t0_term);
    if (terminal !== null) {
      result = terminal;
      stopReason = 'terminal';
      break;
    }

    if (moveLogs.length >= maxTurns) {
      stopReason = 'maxTurns';
      break;
    }

    const t0_legal = perfStart(profiler);
    const legalMoveResult = enumerateLegalMoves(validatedDef, state, undefined, resolvedRuntime);
    perfEnd(profiler, 'simLegalMoves', t0_legal);
    if (legalMoveResult.moves.length === 0) {
      stopReason = 'noLegalMoves';
      break;
    }

    const player = state.activePlayer;
    const agent = agents[player];
    const agentRng = agentRngByPlayer[player];
    if (agent === undefined || agentRng === undefined) {
      throw new Error(`missing agent or agent RNG for player ${String(player)}`);
    }

    let selected;
    const snapshot = snapshotDepth === 'none'
      ? undefined
      : extractDecisionPointSnapshot(validatedDef, state, resolvedRuntime, snapshotDepth);
    const t0_agent = perfStart(profiler);
    try {
      selected = agent.chooseMove({
        def: validatedDef,
        state,
        playerId: player,
        legalMoves: legalMoveResult.moves,
        rng: agentRng,
        runtime: resolvedRuntime,
      });
    } catch (error) {
      perfEnd(profiler, 'simAgentChooseMove', t0_agent);
      if (isNoPlayableMovesAfterPreparationError(error)) {
        // If a skipIfNoLegalCompletion grant is pending, skip it and retry.
        // The grant surfaced as a legal move (via the broadened
        // isRequiredPendingFreeOperationGrant predicate) but the agent
        // couldn't complete it — remove the grant and re-enumerate.
        const seatResolution = createSeatResolutionContext(validatedDef, state.playerCount);
        const skippedState = skipPendingSkippableFreeOperationGrants(validatedDef, state, seatResolution);
        if (skippedState !== null) {
          state = advanceToDecisionPoint(validatedDef, skippedState, undefined, undefined, undefined, resolvedRuntime);
          continue;
        }
        stopReason = 'noLegalMoves';
        break;
      }
      throw error;
    }
    perfEnd(profiler, 'simAgentChooseMove', t0_agent);
    agentRngByPlayer[player] = selected.rng;

    const preState = state;
    const moveContext = captureMoveContext(selected.move.move);
    const t0_apply = perfStart(profiler);
    const applied = applyTrustedMove(validatedDef, state, selected.move, kernelOptions, resolvedRuntime);
    perfEnd(profiler, 'simApplyMove', t0_apply);
    state = applied.state;

    const t0_delta = perfStart(profiler);
    const deltas = options?.skipDeltas === true ? [] : computeDeltas(preState, state);
    perfEnd(profiler, 'simComputeDeltas', t0_delta);

    moveLogs.push({
      stateHash: state.stateHash,
      player,
      move: selected.move.move,
      legalMoveCount: legalMoveResult.moves.length,
      deltas,
      triggerFirings: applied.triggerFirings,
      warnings: applied.warnings,
      ...(applied.effectTrace !== undefined ? { effectTrace: applied.effectTrace } : {}),
      ...(applied.conditionTrace !== undefined ? { conditionTrace: applied.conditionTrace } : {}),
      ...(applied.decisionTrace !== undefined ? { decisionTrace: applied.decisionTrace } : {}),
      ...(applied.selectorTrace !== undefined ? { selectorTrace: applied.selectorTrace } : {}),
      ...(moveContext !== undefined ? { moveContext } : {}),
      ...(selected.agentDecision !== undefined ? { agentDecision: selected.agentDecision } : {}),
      ...(snapshot !== undefined ? { snapshot } : {}),
    });
  }

  return {
    gameDefId: validatedDef.metadata.id,
    seed,
    moves: moveLogs,
    finalState: state,
    result,
    turnsCount: state.turnCount,
    stopReason,
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
