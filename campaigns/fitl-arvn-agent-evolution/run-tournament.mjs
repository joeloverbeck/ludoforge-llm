#!/usr/bin/env node
/**
 * FITL ARVN agent evolution tournament runner.
 *
 * Compiles the production FITL spec, runs N games with 1 evolved ARVN PolicyAgent
 * vs 3 baseline faction PolicyAgents, and reports composite score as JSON.
 *
 * Usage:
 *   node run-tournament.mjs [--seeds N] [--players N] [--evolved-seat SEAT]
 *                           [--max-turns N] [--trace-seed N]
 *                           [--evolved-profile PROFILE]
 *                           [--profile-completion PROFILE=greedy|agentGuided]
 *
 * Output (stdout, last line): JSON with { compositeScore, avgMargin, winRate, ... }
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Repo root resolution
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Engine imports (from compiled dist)
// ---------------------------------------------------------------------------
const { loadGameSpecBundleFromEntrypoint, runGameSpecStagesFromBundle } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/cnl/index.js'));

const {
  assertValidatedGameDef,
  createGameDefRuntime,
  evalValue,
  createEvalContext,
  createEvalRuntimeResources,
} = await import(join(REPO_ROOT, 'packages/engine/dist/src/kernel/index.js'));

const { PolicyAgent } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/agents/index.js'));

const { runGame } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/sim/index.js'));

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);

function getArg(name, defaultValue) {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && args[idx + 1] !== undefined ? args[idx + 1] : defaultValue;
}

const SEED_COUNT = Number(getArg('seeds', '3'));
const PLAYER_COUNT = Number(getArg('players', '4'));
const EVOLVED_SEAT = getArg('evolved-seat', 'arvn');
const EVOLVED_PROFILE = getArg('evolved-profile', `${EVOLVED_SEAT.toLowerCase()}-evolved`);
const MAX_TURNS = Number(getArg('max-turns', '500'));
const TRACE_ALL = getArg('trace-all', 'true') === 'true';
const TRACE_SEED = getArg('trace-seed', null);
const PROFILE_COMPLETION_OVERRIDE = getArg('profile-completion', '');

function parseProfileCompletionOverride(raw) {
  if (raw === '') {
    return null;
  }
  const [profileId, completion, ...extra] = raw.split('=');
  if (extra.length > 0 || !profileId || !completion) {
    process.stderr.write(`ERROR: --profile-completion must use PROFILE=greedy|agentGuided, got "${raw}"\n`);
    process.exit(1);
  }
  if (completion !== 'greedy' && completion !== 'agentGuided') {
    process.stderr.write(`ERROR: preview completion override must be greedy or agentGuided, got "${completion}"\n`);
    process.exit(1);
  }
  return { profileId, completion };
}

const profileCompletionOverride = parseProfileCompletionOverride(PROFILE_COMPLETION_OVERRIDE);

function applyProfileCompletionOverride(gameDef, override) {
  if (override === null) {
    return gameDef;
  }
  const catalog = gameDef.agents;
  const profile = catalog?.profiles?.[override.profileId];
  if (catalog === undefined || profile === undefined) {
    process.stderr.write(`ERROR: profile "${override.profileId}" not found for --profile-completion\n`);
    process.exit(1);
  }
  return {
    ...gameDef,
    agents: {
      ...catalog,
      profiles: {
        ...catalog.profiles,
        [override.profileId]: {
          ...profile,
          preview: {
            ...profile.preview,
            completion: override.completion,
          },
        },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Seat-to-player-index mapping (resolved after compilation)
// ---------------------------------------------------------------------------
function findSeatPlayerIndex(def, seatId) {
  const seatDefs = def.seats ?? [];
  for (let i = 0; i < seatDefs.length; i++) {
    if (seatDefs[i].id.toLowerCase() === seatId.toLowerCase()) {
      return i;
    }
  }
  return -1;
}

// ---------------------------------------------------------------------------
// Compute victory margin for a specific seat from game state
// ---------------------------------------------------------------------------
function computeSeatMargin(def, runtime, state, seatId) {
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

// ---------------------------------------------------------------------------
// Compute all-seat margins from game state
// ---------------------------------------------------------------------------
function computeAllSeatMargins(def, runtime, state) {
  const margins = {};
  for (const seat of def.seats ?? []) {
    margins[seat.id.toLowerCase()] = computeSeatMargin(def, runtime, state, seat.id);
  }
  return margins;
}

// ---------------------------------------------------------------------------
// Trace helpers
// ---------------------------------------------------------------------------
function stringifyForJson(value) {
  return JSON.stringify(value, (_key, innerValue) =>
    (typeof innerValue === 'bigint' ? `${innerValue}n` : innerValue), 2);
}

function getDecisionActionId(entry) {
  if (entry.decision?.kind === 'actionSelection') {
    return entry.decision.actionId ?? entry.decision.move?.actionId ?? 'unknown';
  }
  return entry.decision?.kind ?? 'unknown';
}

function getDecisionActionClass(entry) {
  if (entry.decision?.kind !== 'actionSelection') {
    return null;
  }
  return entry.decision.move?.actionClass ?? null;
}

function summarizeAllMoves(trace, def) {
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

function classifyDecision(agentDecision) {
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

function createDecisionStats() {
  return {
    strategicCount: 0,
    tacticalCount: 0,
    strategicGapSum: 0,
    tacticalGapSum: 0,
    tiedCount: 0,
    totalDecisions: 0,
  };
}

function accumulateDecisionStats(stats, agentDecision) {
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

function buildDecisionBreakdown(stats, roundValue = (value) => value) {
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

function extractSelfMargin(agentDecision) {
  const value = agentDecision?.stateFeatures?.selfMargin;
  return typeof value === 'number' ? value : null;
}

function enrichEvolvedMovesWithMargins(evolvedMoves, finalMargin) {
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

// ---------------------------------------------------------------------------
// Step 1: Compile the FITL spec
// ---------------------------------------------------------------------------
const entrypoint = join(REPO_ROOT, 'data', 'games', 'fire-in-the-lake.game-spec.md');

if (!existsSync(entrypoint)) {
  process.stderr.write(`ERROR: Entrypoint not found: ${entrypoint}\n`);
  process.exit(1);
}

process.stderr.write('Compiling FITL spec...\n');
const bundle = loadGameSpecBundleFromEntrypoint(entrypoint);
const staged = runGameSpecStagesFromBundle(bundle);

if (staged.validation.blocked) {
  process.stderr.write('ERROR: Validation blocked\n');
  for (const d of staged.validation.diagnostics ?? []) {
    process.stderr.write(`  ${d.severity}: ${d.message}\n`);
  }
  process.exit(1);
}

if (staged.compilation.blocked) {
  process.stderr.write('ERROR: Compilation blocked\n');
  for (const d of staged.compilation.diagnostics ?? []) {
    process.stderr.write(`  ${d.severity}: ${d.message}\n`);
  }
  process.exit(1);
}

const compiled = staged.compilation.result;
if (!compiled || !compiled.gameDef) {
  process.stderr.write('ERROR: Compilation produced no gameDef\n');
  process.exit(1);
}

const def = assertValidatedGameDef(applyProfileCompletionOverride(compiled.gameDef, profileCompletionOverride));
const runtime = createGameDefRuntime(def);

// Resolve evolved seat index
const evolvedPlayerIndex = findSeatPlayerIndex(def, EVOLVED_SEAT);
if (evolvedPlayerIndex < 0) {
  process.stderr.write(`ERROR: Seat "${EVOLVED_SEAT}" not found in game def\n`);
  process.exit(1);
}

process.stderr.write(`Evolved seat: ${EVOLVED_SEAT} (player index ${evolvedPlayerIndex})\n`);

// Build seat-to-profile mapping: evolved seat uses arvn-evolved, others use their baselines
const seatProfiles = (def.seats ?? []).map((seat) => {
  if (seat.id.toLowerCase() === EVOLVED_SEAT.toLowerCase()) {
    return EVOLVED_PROFILE;
  }
  // Use the faction's baseline profile
  const seatId = seat.id.toLowerCase();
  return `${seatId}-baseline`;
});

process.stderr.write(`Seat profiles: ${seatProfiles.join(', ')}\n`);
if (profileCompletionOverride !== null) {
  process.stderr.write(
    `Preview completion override: ${profileCompletionOverride.profileId}=${profileCompletionOverride.completion}\n`,
  );
}

// ---------------------------------------------------------------------------
// Step 2: Run tournament simulations
// ---------------------------------------------------------------------------
let wins = 0;
let completed = 0;
let truncated = 0;
let errors = 0;
let totalMargin = 0;
let traceSaved = false;
const traceDir = join(HERE, 'traces');
const aggregateDecisionStats = createDecisionStats();
const round4 = (v) => Math.round(v * 10000) / 10000;

for (let seedOffset = 0; seedOffset < SEED_COUNT; seedOffset++) {
  const seed = 1000 + seedOffset;

  try {
    const agents = seatProfiles.map(
      (profileId) => new PolicyAgent({ profileId, traceLevel: 'verbose' }),
    );

    const trace = runGame(def, seed, agents, MAX_TURNS, PLAYER_COUNT, undefined, runtime);

    // Extract evolved seat margin from final state
    const evolvedMargin = computeSeatMargin(def, runtime, trace.finalState, EVOLVED_SEAT);

    // Determine if evolved seat won
    let evolvedWon = false;
    if (trace.result !== null && trace.result.type === 'win') {
      const victory = trace.result.victory;
      if (victory && victory.winnerSeat &&
          victory.winnerSeat.toLowerCase() === EVOLVED_SEAT.toLowerCase()) {
        evolvedWon = true;
      }
      completed++;
    } else if (trace.stopReason === 'maxTurns') {
      // Game truncated — use margin at truncation point
      truncated++;
      completed++;
    } else if (trace.stopReason === 'noLegalMoves') {
      completed++;
    } else {
      process.stderr.write(
        `Seed ${seed}: unexpected stopReason=${trace.stopReason}, result=${JSON.stringify(trace.result)}\n`,
      );
      errors++;
      continue;
    }

    if (evolvedWon) {
      wins++;
    }
    totalMargin += evolvedMargin;

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

    const seedDecisionStats = createDecisionStats();
    for (const evolvedMove of evolvedMoves) {
      accumulateDecisionStats(seedDecisionStats, evolvedMove.agentDecision);
    }

    aggregateDecisionStats.strategicCount += seedDecisionStats.strategicCount;
    aggregateDecisionStats.tacticalCount += seedDecisionStats.tacticalCount;
    aggregateDecisionStats.strategicGapSum += seedDecisionStats.strategicGapSum;
    aggregateDecisionStats.tacticalGapSum += seedDecisionStats.tacticalGapSum;
    aggregateDecisionStats.tiedCount += seedDecisionStats.tiedCount;
    aggregateDecisionStats.totalDecisions += seedDecisionStats.totalDecisions;

    // Compute all-seat margins for diagnostic output
    const allMargins = computeAllSeatMargins(def, runtime, trace.finalState);
    const marginStr = Object.entries(allMargins).map(([s, m]) => `${s}=${m}`).join(', ');
    process.stderr.write(
      `  seed ${seed}: ${(trace.decisions ?? []).length} decisions, margins=[${marginStr}], ` +
      `won=${evolvedWon}, stop=${trace.stopReason}\n`,
    );

    // Save trace — all seeds when TRACE_ALL, or single seed via --trace-seed
    const shouldSaveTrace = TRACE_ALL ||
      (TRACE_SEED !== null && seed === Number(TRACE_SEED) && !traceSaved);

    if (shouldSaveTrace) {
      // Enriched: all-seat margins at game end
      const allSeatMargins = computeAllSeatMargins(def, runtime, trace.finalState);

      // Enriched: per-seat action summaries (opponent visibility)
      const movesBySeat = summarizeAllMoves(trace, def);

      // Enriched: opponent moves (non-evolved) with action summaries
      const opponentMoves = playerDecisions
        .filter((entry) => Number(entry.playerId) !== evolvedPlayerIndex)
        .map((entry) => ({
          seat: def.seats?.[Number(entry.playerId)]?.id?.toLowerCase() ?? `p${entry.playerId}`,
          actionId: getDecisionActionId(entry),
          actionClass: getDecisionActionClass(entry),
        }));

      const traceSummary = {
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
        evolvedSeat: EVOLVED_SEAT,
        evolvedPlayerIndex,
        evolvedMargin,
        allSeatMargins,
        movesBySeat,
        evolvedMoveCount: evolvedMovesWithMargins.length,
        decisionBreakdown: buildDecisionBreakdown(seedDecisionStats, round4),
        evolvedMoves: evolvedMovesWithMargins,
        opponentMoveCount: opponentMoves.length,
        opponentMoves,
      };

      if (TRACE_ALL) {
        mkdirSync(traceDir, { recursive: true });
        writeFileSync(join(traceDir, `trace-${seed}.json`), stringifyForJson(traceSummary));
      } else {
        writeFileSync(join(HERE, 'last-trace.json'), stringifyForJson(traceSummary));
        traceSaved = true;
      }
    }
  } catch (err) {
    process.stderr.write(`Seed ${seed} error: ${err.message}\n`);
    if (err.stack) {
      process.stderr.write(`  ${err.stack.split('\n').slice(1, 4).join('\n  ')}\n`);
    }
    errors++;
  }
}

// ---------------------------------------------------------------------------
// Step 3: Compute and output results
// ---------------------------------------------------------------------------
const gamesWithMargin = completed;
const avgMargin = gamesWithMargin > 0 ? totalMargin / gamesWithMargin : 0;
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

const result = {
  compositeScore: round4(compositeScore),
  avgMargin: round4(avgMargin),
  winRate: round4(winRate),
  wins,
  completed,
  truncated,
  errors,
  seeds: SEED_COUNT,
  playerCount: PLAYER_COUNT,
  evolvedSeat: EVOLVED_SEAT,
  evolvedProfile: EVOLVED_PROFILE,
  maxTurns: MAX_TURNS,
  profileCompletionOverride: profileCompletionOverride ?? null,
  decisionBreakdown: buildDecisionBreakdown(averagedDecisionStats, round4),
};

// Output JSON as the last line of stdout (harness parses this)
process.stdout.write(JSON.stringify(result) + '\n');

// Fail if too many errors
if (errors > SEED_COUNT * 0.3) {
  process.stderr.write(`Too many errors: ${errors}/${SEED_COUNT} (>30%)\n`);
  process.exit(1);
}

process.exit(0);
