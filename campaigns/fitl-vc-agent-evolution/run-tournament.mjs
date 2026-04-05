#!/usr/bin/env node
/**
 * FITL VC agent evolution tournament runner.
 *
 * Compiles the production FITL spec, runs N games with 1 evolved VC PolicyAgent
 * vs 3 baseline faction PolicyAgents, and reports composite score as JSON.
 *
 * Usage:
 *   node run-tournament.mjs [--seeds N] [--players N] [--evolved-seat SEAT]
 *                           [--max-turns N] [--trace-seed N]
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
const EVOLVED_SEAT = getArg('evolved-seat', 'vc');
const MAX_TURNS = Number(getArg('max-turns', '500'));
const TRACE_ALL = getArg('trace-all', 'true') === 'true';
const TRACE_SEED = getArg('trace-seed', null);

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

const def = assertValidatedGameDef(compiled.gameDef);
const runtime = createGameDefRuntime(def);

// Resolve evolved seat index
const evolvedPlayerIndex = findSeatPlayerIndex(def, EVOLVED_SEAT);
if (evolvedPlayerIndex < 0) {
  process.stderr.write(`ERROR: Seat "${EVOLVED_SEAT}" not found in game def\n`);
  process.exit(1);
}

process.stderr.write(`Evolved seat: ${EVOLVED_SEAT} (player index ${evolvedPlayerIndex})\n`);

// Build seat-to-profile mapping: evolved seat uses vc-evolved, others use their baselines
const seatProfiles = (def.seats ?? []).map((seat) => {
  if (seat.id.toLowerCase() === EVOLVED_SEAT.toLowerCase()) {
    return 'vc-evolved';
  }
  // Use the faction's baseline profile
  const seatId = seat.id.toLowerCase();
  return `${seatId}-baseline`;
});

process.stderr.write(`Seat profiles: ${seatProfiles.join(', ')}\n`);

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

for (let seedOffset = 0; seedOffset < SEED_COUNT; seedOffset++) {
  const seed = 1000 + seedOffset;

  try {
    const agents = seatProfiles.map(
      (profileId) => new PolicyAgent({ profileId, traceLevel: 'verbose' }),
    );

    const trace = runGame(def, seed, agents, MAX_TURNS, PLAYER_COUNT, undefined, runtime);

    // Extract VC margin from final state
    const vcMargin = computeSeatMargin(def, runtime, trace.finalState, EVOLVED_SEAT);

    // Determine if VC won
    let vcWon = false;
    if (trace.result !== null && trace.result.type === 'win') {
      const victory = trace.result.victory;
      if (victory && victory.winnerSeat &&
          victory.winnerSeat.toLowerCase() === EVOLVED_SEAT.toLowerCase()) {
        vcWon = true;
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

    if (vcWon) {
      wins++;
    }
    totalMargin += vcMargin;

    process.stderr.write(
      `  seed ${seed}: ${trace.moves.length} moves, VC margin=${vcMargin}, ` +
      `won=${vcWon}, stop=${trace.stopReason}\n`,
    );

    // Save trace — all seeds when TRACE_ALL, or single seed via --trace-seed
    const shouldSaveTrace = TRACE_ALL ||
      (TRACE_SEED !== null && seed === Number(TRACE_SEED) && !traceSaved);

    if (shouldSaveTrace) {
      const evolvedMoves = trace.moves
        .filter((m) => Number(m.player) === evolvedPlayerIndex)
        .map((m) => ({
          move: m.move,
          legalMoveCount: m.legalMoveCount,
          agentDecision: m.agentDecision ?? null,
        }));

      const traceSummary = {
        seed,
        stopReason: trace.stopReason,
        turnsCount: trace.turnsCount,
        totalMoves: trace.moves.length,
        result: trace.result
          ? {
              type: trace.result.type,
              victory: trace.result.type === 'win' ? trace.result.victory : undefined,
            }
          : null,
        evolvedSeat: EVOLVED_SEAT,
        evolvedPlayerIndex,
        vcMargin,
        evolvedMoveCount: evolvedMoves.length,
        evolvedMoves,
      };

      if (TRACE_ALL) {
        mkdirSync(traceDir, { recursive: true });
        writeFileSync(join(traceDir, `trace-${seed}.json`), JSON.stringify(traceSummary, null, 2));
      } else {
        writeFileSync(join(HERE, 'last-trace.json'), JSON.stringify(traceSummary, null, 2));
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

const round4 = (v) => Math.round(v * 10000) / 10000;

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
  maxTurns: MAX_TURNS,
};

// Output JSON as the last line of stdout (harness parses this)
process.stdout.write(JSON.stringify(result) + '\n');

// Fail if too many errors
if (errors > SEED_COUNT * 0.3) {
  process.stderr.write(`Too many errors: ${errors}/${SEED_COUNT} (>30%)\n`);
  process.exit(1);
}

process.exit(0);
