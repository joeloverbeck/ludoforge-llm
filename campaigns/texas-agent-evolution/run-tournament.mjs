#!/usr/bin/env node
/**
 * Texas Hold'em tournament runner for the improve-loop campaign.
 *
 * Compiles the production Texas Hold'em spec, runs N tournament simulations
 * with 1 evolved PolicyAgent vs (P-1) baseline PolicyAgents, and reports
 * win rate as JSON to stdout.
 *
 * Usage:
 *   node run-tournament.mjs [--seeds N] [--players N] [--evolved-seat N]
 *                           [--max-turns N] [--trace-seed N]
 *
 * Output (stdout, last line): JSON with { winRate, wins, completed, errors, ... }
 */

import { existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Repo root resolution (mirrors production-spec-helpers.ts pattern)
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

const { assertValidatedGameDef } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/kernel/index.js'));

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

const SEED_COUNT = Number(getArg('seeds', '50'));
const PLAYER_COUNT = Number(getArg('players', '4'));
const EVOLVED_SEAT = Number(getArg('evolved-seat', '0'));
const MAX_TURNS = Number(getArg('max-turns', '10000'));
const TRACE_SEED = getArg('trace-seed', null);

// ---------------------------------------------------------------------------
// Step 1: Compile the Texas Hold'em spec
// ---------------------------------------------------------------------------
const entrypoint = join(REPO_ROOT, 'data', 'games', 'texas-holdem.game-spec.md');

if (!existsSync(entrypoint)) {
  process.stderr.write(`ERROR: Entrypoint not found: ${entrypoint}\n`);
  process.exit(1);
}

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

// ---------------------------------------------------------------------------
// Step 2: Run tournament simulations
// ---------------------------------------------------------------------------
let wins = 0;
let completed = 0;
let errors = 0;
let traceSaved = false;

for (let seedOffset = 0; seedOffset < SEED_COUNT; seedOffset++) {
  const seed = 1000 + seedOffset;

  try {
    const agents = Array.from({ length: PLAYER_COUNT }, (_, i) =>
      i === EVOLVED_SEAT
        ? new PolicyAgent({ profileId: 'baseline', traceLevel: 'detailed' })
        : new PolicyAgent({ profileId: 'baseline' }),
    );

    const trace = runGame(def, seed, agents, MAX_TURNS, PLAYER_COUNT);

    if (trace.result !== null && trace.result.type === 'score') {
      const winner = trace.result.ranking[0]?.player;
      if (Number(winner) === EVOLVED_SEAT) {
        wins++;
      }
      completed++;
    } else if (trace.stopReason === 'maxTurns' || trace.stopReason === 'noLegalMoves') {
      // Game didn't reach terminal — count as non-win
      completed++;
    } else {
      // Unexpected: no result and not maxTurns/noLegalMoves
      process.stderr.write(`Seed ${seed}: unexpected stopReason=${trace.stopReason}, result=${JSON.stringify(trace.result)}\n`);
      errors++;
    }

    // Save trace for one representative game (for OBSERVE phase analysis)
    if (TRACE_SEED !== null && seed === Number(TRACE_SEED) && !traceSaved) {
      const evolvedMoves = trace.moves
        .filter((m) => Number(m.player) === EVOLVED_SEAT)
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
              ranking: trace.result.type === 'score'
                ? trace.result.ranking.map((r) => ({
                    player: Number(r.player),
                    score: r.score,
                  }))
                : undefined,
            }
          : null,
        evolvedSeat: EVOLVED_SEAT,
        evolvedMoveCount: evolvedMoves.length,
        evolvedMoves,
      };

      const tracePath = join(HERE, 'last-trace.json');
      writeFileSync(tracePath, JSON.stringify(traceSummary, null, 2));
      traceSaved = true;
    }
  } catch (err) {
    process.stderr.write(`Seed ${seed} error: ${err.message}\n`);
    errors++;
  }
}

// ---------------------------------------------------------------------------
// Step 3: Output results
// ---------------------------------------------------------------------------
const winRate = completed > 0 ? wins / completed : 0;

const result = {
  winRate: Math.round(winRate * 10000) / 10000,
  wins,
  completed,
  errors,
  seeds: SEED_COUNT,
  playerCount: PLAYER_COUNT,
  evolvedSeat: EVOLVED_SEAT,
};

// Output JSON as the last line of stdout (harness parses this)
process.stdout.write(JSON.stringify(result) + '\n');

// Fail if too many errors
if (errors > SEED_COUNT * 0.1) {
  process.stderr.write(`Too many errors: ${errors}/${SEED_COUNT} (>10%)\n`);
  process.exit(1);
}

process.exit(0);
