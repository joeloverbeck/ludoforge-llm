import { Worker } from 'node:worker_threads';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

function resolveRepoRoot() {
  let cursor = HERE;
  for (let depth = 0; depth < 8; depth++) {
    if (existsSync(join(cursor, 'pnpm-workspace.yaml'))) {
      return cursor;
    }
    cursor = join(cursor, '..');
  }
  return process.cwd();
}

const REPO_ROOT = resolveRepoRoot();

const {
  createEvalContext,
  createEvalRuntimeResources,
  evalValue,
  forkGameDefRuntimeForRun,
} = await import(join(REPO_ROOT, 'packages/engine/dist/src/kernel/index.js'));

const { PolicyAgent } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/agents/index.js'));

const { runGame } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/sim/index.js'));

export function stringifyForJson(value) {
  return JSON.stringify(value, (_key, innerValue) =>
    (typeof innerValue === 'bigint' ? `${innerValue}n` : innerValue), 2);
}

export function createDecisionStats() {
  return {
    strategicCount: 0,
    tacticalCount: 0,
    strategicGapSum: 0,
    tacticalGapSum: 0,
    tiedCount: 0,
    totalDecisions: 0,
  };
}

export function buildDecisionBreakdown(stats, roundValue = (value) => value) {
  return {
    strategic: roundValue(stats.strategicCount),
    tactical: roundValue(stats.tacticalCount),
    strategicAvgGap: stats.strategicCount > 0
      ? roundValue(stats.strategicGapSum / stats.strategicCount)
      : 0,
    tacticalAvgGap: stats.tacticalCount > 0
      ? roundValue(stats.tacticalGapSum / stats.tacticalCount)
      : 0,
    tiedDecisions: roundValue(stats.tiedCount),
    totalDecisions: roundValue(stats.totalDecisions),
  };
}

export function summarizeAllMoves(trace, def) {
  const bySeat = {};
  for (const seat of def.seats ?? []) {
    bySeat[seat.id.toLowerCase()] = {};
  }
  for (const entry of trace.decisions ?? []) {
    if (entry.playerId === undefined) {
      continue;
    }
    const playerIdx = Number(entry.playerId);
    const seatId = def.seats?.[playerIdx]?.id?.toLowerCase() ?? `p${playerIdx}`;
    const actionId = getDecisionActionId(entry);
    bySeat[seatId] = bySeat[seatId] ?? {};
    bySeat[seatId][actionId] = (bySeat[seatId][actionId] ?? 0) + 1;
  }
  return bySeat;
}

export function getDecisionActionId(entry) {
  if (entry.decision?.kind === 'actionSelection') {
    return entry.decision.actionId ?? entry.decision.move?.actionId ?? 'unknown';
  }
  return entry.decision?.kind ?? 'unknown';
}

export function getDecisionActionClass(entry) {
  if (entry.decision?.kind !== 'actionSelection') {
    return null;
  }
  return entry.decision.move?.actionClass ?? null;
}

export function computeSeatMargin(def, runtime, state, seatId) {
  const marginDefs = def.terminal.margins ?? [];
  const marginDef = marginDefs.find(
    (m) => m.seat.toLowerCase() === seatId.toLowerCase(),
  );
  if (!marginDef) {
    return 0;
  }

  const resources = createEvalRuntimeResources();
  const evalContext = createEvalContext({
    def,
    adjacencyGraph: runtime.adjacencyGraph,
    state,
    activePlayer: state.activePlayer,
    actorPlayer: state.activePlayer,
    bindings: {},
    runtimeTableIndex: runtime.runtimeTableIndex,
    resources,
  });

  const margin = evalValue(marginDef.value, evalContext);
  return typeof margin === 'number' ? margin : 0;
}

export function computeAllSeatMargins(def, runtime, state) {
  const margins = {};
  for (const seat of def.seats ?? []) {
    margins[seat.id.toLowerCase()] = computeSeatMargin(def, runtime, state, seat.id);
  }
  return margins;
}

export function classifyDecision(agentDecision) {
  if (!agentDecision?.candidates?.length) {
    return null;
  }

  const unpruned = agentDecision.candidates.filter((candidate) => !candidate.pruned);
  if (unpruned.length === 0) {
    return null;
  }

  const actionId = String(unpruned[0].actionId ?? '');
  const isStrategic = !actionId.toLowerCase().includes('coup');
  const gap = unpruned.length >= 2
    ? Number(unpruned[0].score ?? 0) - Number(unpruned[1].score ?? 0)
    : 0;
  const tied = unpruned.length >= 2 && gap < 0.001;

  return { isStrategic, gap, tied };
}

export function accumulateDecisionStats(stats, agentDecision) {
  const decision = classifyDecision(agentDecision);
  if (!decision) {
    return;
  }

  stats.totalDecisions++;
  if (decision.tied) {
    stats.tiedCount++;
  }

  if (decision.isStrategic) {
    stats.strategicCount++;
    stats.strategicGapSum += decision.gap;
    return;
  }

  stats.tacticalCount++;
  stats.tacticalGapSum += decision.gap;
}

function addDecisionStats(target, source) {
  target.strategicCount += source.strategicCount;
  target.tacticalCount += source.tacticalCount;
  target.strategicGapSum += source.strategicGapSum;
  target.tacticalGapSum += source.tacticalGapSum;
  target.tiedCount += source.tiedCount;
  target.totalDecisions += source.totalDecisions;
}

function extractSelfMargin(agentDecision) {
  const value = agentDecision?.stateFeatures?.selfMargin;
  return typeof value === 'number' ? value : null;
}

export function enrichEvolvedMovesWithMargins(evolvedMoves, finalMargin) {
  const margins = evolvedMoves.map((move) => extractSelfMargin(move.agentDecision));

  return evolvedMoves.map((move, index) => {
    const marginBefore = margins[index];
    const nextMargin = index + 1 < margins.length ? margins[index + 1] : finalMargin;
    const marginAfter = marginBefore !== null && nextMargin !== null ? nextMargin : null;

    return {
      ...move,
      marginBefore,
      marginAfter,
      marginDelta:
        marginBefore !== null && marginAfter !== null ? marginAfter - marginBefore : null,
    };
  });
}

function shouldBuildTraceSummary({ seed, traceMode, traceSeed }) {
  if (traceMode === 'all') {
    return true;
  }
  if (traceSeed !== null && traceSeed !== undefined) {
    return seed === Number(traceSeed);
  }
  return traceMode === 'last' && seed === 1000;
}

function errorResult(seed, error) {
  const message = error instanceof Error
    ? `${error.message}${error.stack ? `\n${error.stack}` : ''}`
    : String(error);
  return {
    seed,
    evolvedWon: false,
    evolvedMargin: 0,
    allSeatMargins: {},
    decisionStats: createDecisionStats(),
    traceSummary: null,
    error: message,
    stopReason: null,
    completed: false,
    truncated: false,
    decisionCount: 0,
  };
}

export function runSeed({
  def,
  runtime,
  seed,
  seatProfiles,
  evolvedPlayerIndex,
  maxTurns,
  playerCount,
  traceMode,
  traceSeed = null,
  evolvedSeat,
}) {
  try {
    const perRunRuntime = forkGameDefRuntimeForRun(runtime);
    const agents = seatProfiles.map(
      (profileId) => new PolicyAgent({ profileId, traceLevel: 'verbose' }),
    );

    const trace = runGame(def, seed, agents, maxTurns, playerCount, undefined, perRunRuntime);
    const evolvedMargin = computeSeatMargin(def, perRunRuntime, trace.finalState, evolvedSeat);

    let evolvedWon = false;
    let completed = false;
    let truncated = false;
    let error = null;
    if (trace.result !== null && trace.result.type === 'win') {
      const victory = trace.result.victory;
      if (victory && victory.winnerSeat &&
          victory.winnerSeat.toLowerCase() === evolvedSeat.toLowerCase()) {
        evolvedWon = true;
      }
      completed = true;
    } else if (trace.stopReason === 'maxTurns') {
      truncated = true;
      completed = true;
    } else if (trace.stopReason === 'noLegalMoves') {
      completed = true;
    } else {
      error = `unexpected stopReason=${trace.stopReason}, result=${JSON.stringify(trace.result)}`;
    }

    const playerDecisions = (trace.decisions ?? []).filter((entry) => entry.playerId !== undefined);
    const evolvedMoves = playerDecisions
      .filter((entry) => Number(entry.playerId) === evolvedPlayerIndex)
      .map((entry) => ({
        move: entry.decision?.kind === 'actionSelection' ? entry.decision.move : null,
        decisionKind: entry.decision?.kind ?? null,
        actionId: getDecisionActionId(entry),
        legalMoveCount: entry.legalActionCount ?? 0,
        agentDecision: entry.agentDecision ?? null,
      }));
    const evolvedMovesWithMargins = enrichEvolvedMovesWithMargins(evolvedMoves, evolvedMargin);

    const decisionStats = createDecisionStats();
    for (const evolvedMove of evolvedMoves) {
      accumulateDecisionStats(decisionStats, evolvedMove.agentDecision);
    }

    const allSeatMargins = computeAllSeatMargins(def, perRunRuntime, trace.finalState);
    let traceSummary = null;
    if (shouldBuildTraceSummary({ seed, traceMode, traceSeed })) {
      const movesBySeat = summarizeAllMoves(trace, def);
      const opponentMoves = playerDecisions
        .filter((entry) => Number(entry.playerId) !== evolvedPlayerIndex)
        .map((entry) => ({
          seat: def.seats?.[Number(entry.playerId)]?.id?.toLowerCase() ?? `p${entry.playerId}`,
          actionId: getDecisionActionId(entry),
          actionClass: getDecisionActionClass(entry),
        }));

      const round4 = (value) => Math.round(value * 10000) / 10000;
      traceSummary = {
        seed,
        stopReason: trace.stopReason,
        turnsCount: trace.turnsCount,
        totalMoves: (trace.decisions ?? []).length,
        result: trace.result
          ? {
              type: trace.result.type,
              victory: trace.result.type === 'win' ? trace.result.victory : undefined,
            }
          : null,
        evolvedSeat,
        evolvedPlayerIndex,
        evolvedMargin,
        allSeatMargins,
        movesBySeat,
        evolvedMoveCount: evolvedMovesWithMargins.length,
        decisionBreakdown: buildDecisionBreakdown(decisionStats, round4),
        evolvedMoves: evolvedMovesWithMargins,
        opponentMoveCount: opponentMoves.length,
        opponentMoves,
      };
    }

    return {
      seed,
      evolvedWon,
      evolvedMargin,
      allSeatMargins,
      decisionStats,
      traceSummary,
      error,
      stopReason: trace.stopReason,
      completed,
      truncated,
      decisionCount: (trace.decisions ?? []).length,
    };
  } catch (error) {
    return errorResult(seed, error);
  }
}

export function reduceSeedResults(seedResults) {
  let wins = 0;
  let completed = 0;
  let truncated = 0;
  let errors = 0;
  let totalMargin = 0;
  const aggregateDecisionStats = createDecisionStats();
  const round4 = (value) => Math.round(value * 10000) / 10000;
  const sortedResults = [...seedResults].sort((a, b) => a.seed - b.seed);

  for (const result of sortedResults) {
    if (result.error !== null) {
      errors++;
      continue;
    }
    if (result.completed) {
      completed++;
    }
    if (result.truncated) {
      truncated++;
    }
    if (result.evolvedWon) {
      wins++;
    }
    totalMargin += result.evolvedMargin;
    addDecisionStats(aggregateDecisionStats, result.decisionStats);
  }

  const avgMargin = completed > 0 ? totalMargin / completed : 0;
  const winRate = completed > 0 ? wins / completed : 0;
  const compositeScore = avgMargin + 10 * winRate;
  const averagedDecisionStats = completed > 0
    ? {
        strategicCount: aggregateDecisionStats.strategicCount / completed,
        tacticalCount: aggregateDecisionStats.tacticalCount / completed,
        strategicGapSum: aggregateDecisionStats.strategicGapSum / completed,
        tacticalGapSum: aggregateDecisionStats.tacticalGapSum / completed,
        tiedCount: aggregateDecisionStats.tiedCount / completed,
        totalDecisions: aggregateDecisionStats.totalDecisions / completed,
      }
    : createDecisionStats();

  return {
    compositeScore: round4(compositeScore),
    avgMargin: round4(avgMargin),
    winRate: round4(winRate),
    wins,
    completed,
    truncated,
    errors,
    decisionBreakdown: buildDecisionBreakdown(averagedDecisionStats, round4),
    seedResults: sortedResults,
  };
}

export function runSeedsSerial(options) {
  return options.seeds.map((seed) => runSeed({ ...options, seed }));
}

export function runSeedsWithWorkerPool({
  def,
  runtime,
  seeds,
  seatProfiles,
  evolvedPlayerIndex,
  maxTurns,
  playerCount,
  traceMode,
  traceSeed = null,
  evolvedSeat,
  concurrency,
  disableWasm,
}) {
  const poolSize = Math.max(1, Math.min(concurrency, seeds.length));
  if (poolSize === 1) {
    return Promise.resolve(runSeedsSerial({
      def,
      runtime,
      seeds,
      seatProfiles,
      evolvedPlayerIndex,
      maxTurns,
      playerCount,
      traceMode,
      traceSeed,
      evolvedSeat,
    }));
  }

  return new Promise((resolve, reject) => {
    const queue = [...seeds];
    const results = new Map();
    const workers = [];
    let settled = false;

    const finish = async () => {
      if (settled) return;
      if (results.size !== seeds.length) return;
      settled = true;
      await Promise.allSettled(workers.map((worker) => worker.terminate()));
      resolve(seeds.map((seed) => results.get(seed)));
    };

    const fail = async (error) => {
      if (settled) return;
      settled = true;
      await Promise.allSettled(workers.map((worker) => worker.terminate()));
      reject(error);
    };

    const assign = (worker) => {
      const seed = queue.shift();
      if (seed === undefined) {
        worker.postMessage({ type: 'shutdown' });
        return;
      }
      worker.postMessage({ type: 'run', seed });
    };

    for (let index = 0; index < poolSize; index++) {
      const worker = new Worker(new URL('./run-seed-worker.mjs', import.meta.url), {
        workerData: {
          def,
          seatProfiles,
          evolvedPlayerIndex,
          maxTurns,
          playerCount,
          traceMode,
          traceSeed,
          evolvedSeat,
          disableWasm,
        },
      });
      workers.push(worker);
      worker.on('message', (message) => {
        if (message?.type === 'ready') {
          assign(worker);
          return;
        }
        if (message?.type === 'result') {
          results.set(message.result.seed, message.result);
          assign(worker);
          void finish();
          return;
        }
        if (message?.type === 'fatal') {
          void fail(new Error(message.error));
        }
      });
      worker.on('error', (error) => {
        void fail(error);
      });
      worker.on('exit', (code) => {
        if (!settled && code !== 0) {
          void fail(new Error(`Seed worker exited with code ${code}`));
        }
      });
    }
  });
}
