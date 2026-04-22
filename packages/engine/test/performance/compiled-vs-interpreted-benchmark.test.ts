// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assertValidatedGameDef,
  createGameDefRuntime,
  type Agent,
  type GameDefRuntime,
  type ValidatedGameDef,
} from '../../src/kernel/index.js';
import { createPerfProfiler } from '../../src/kernel/perf-profiler.js';
import { runGame } from '../../src/sim/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { createSeededChoiceAgents } from '../helpers/test-agents.js';
import {
  compileProductionSpec,
  compileTexasProductionSpec,
} from '../helpers/production-spec-helpers.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const compileFitlDef = (): ValidatedGameDef => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assertNoErrors(compiled);
  if (compiled.gameDef === null) {
    throw new Error('Expected compiled FITL gameDef to be present');
  }
  return assertValidatedGameDef(compiled.gameDef);
};

const compileTexasDef = (): ValidatedGameDef => {
  const { parsed, compiled } = compileTexasProductionSpec();
  assertNoErrors(parsed);
  assertNoErrors(compiled);
  if (compiled.gameDef === null) {
    throw new Error('Expected compiled Texas gameDef to be present');
  }
  return assertValidatedGameDef(compiled.gameDef);
};

/**
 * Create a runtime with an empty compiledLifecycleEffects map.
 * This forces the interpreted path for all lifecycle effects.
 */
const createInterpretedOnlyRuntime = (def: ValidatedGameDef): GameDefRuntime => {
  const fullRuntime = createGameDefRuntime(def);
  return {
    ...fullRuntime,
    compiledLifecycleEffects: new Map(),
  };
};

interface BenchmarkResult {
  readonly label: string;
  readonly gameCount: number;
  readonly totalMs: number;
  readonly avgMs: number;
  readonly medianMs: number;
  readonly minMs: number;
  readonly maxMs: number;
}

const median = (sorted: readonly number[]): number => {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
};

/**
 * Run a single game, returning elapsed ms or null if the game hit an error.
 */
const runSingleGame = (
  def: ValidatedGameDef,
  seed: number,
  playerCount: number,
  maxTurns: number,
  runtime: GameDefRuntime,
): number | null => {
  const agents = createSeededChoiceAgents(playerCount);
  const start = performance.now();
  try {
    runGame(def, seed, agents, maxTurns, playerCount, { skipDeltas: true }, runtime);
    return performance.now() - start;
  } catch {
    return null;
  }
};

const runBenchmark = (
  label: string,
  def: ValidatedGameDef,
  playerCount: number,
  targetGames: number,
  maxTurns: number,
  runtime: GameDefRuntime,
): BenchmarkResult => {
  // Warm up — JIT, caches
  try {
    const warmAgents = createSeededChoiceAgents(playerCount);
    runGame(def, 999, warmAgents, maxTurns, playerCount, { skipDeltas: true }, runtime);
  } catch {
    // Warm-up failure is non-fatal
  }

  const gameTimes: number[] = [];
  let skipped = 0;

  for (let i = 0; gameTimes.length < targetGames && i < targetGames + 20; i++) {
    const seed = 5000 + i;
    const elapsed = runSingleGame(def, seed, playerCount, maxTurns, runtime);
    if (elapsed !== null) {
      gameTimes.push(elapsed);
    } else {
      skipped++;
    }
  }

  if (skipped > 0) {
    console.warn(`  ${label}: skipped ${skipped} seeds due to runtime errors`);
  }

  const totalMs = gameTimes.reduce((a, b) => a + b, 0);
  const sorted = [...gameTimes].sort((a, b) => a - b);

  return {
    label,
    gameCount: gameTimes.length,
    totalMs,
    avgMs: gameTimes.length > 0 ? totalMs / gameTimes.length : 0,
    medianMs: gameTimes.length > 0 ? median(sorted) : 0,
    minMs: sorted[0] ?? 0,
    maxMs: sorted[sorted.length - 1] ?? 0,
  };
};

const formatResult = (r: BenchmarkResult): string =>
  `${r.label}: total=${r.totalMs.toFixed(0)}ms avg=${r.avgMs.toFixed(1)}ms median=${r.medianMs.toFixed(1)}ms min=${r.minMs.toFixed(1)}ms max=${r.maxMs.toFixed(1)}ms (${r.gameCount} games)`;

const formatComparison = (compiled: BenchmarkResult, interpreted: BenchmarkResult): string => {
  const diffPercent = ((compiled.avgMs - interpreted.avgMs) / interpreted.avgMs) * 100;
  const sign = diffPercent > 0 ? '+' : '';
  return `  Compiled vs Interpreted: ${sign}${diffPercent.toFixed(2)}% (${diffPercent > 0 ? 'compiled SLOWER' : 'compiled FASTER'})`;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FITL_PLAYER_COUNT = 4;
const TEXAS_PLAYER_COUNT = 6;
const TEXAS_MAX_TURNS = 300;
const TEXAS_GAME_COUNT = 15;
const FITL_MAX_TURNS = 200;
const FITL_GAME_COUNT = 5;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('compiled vs interpreted effect path benchmark', () => {
  it('Texas Hold\'em: compiled vs interpreted parity benchmark', () => {
    const def = compileTexasDef();
    const compiledRuntime = createGameDefRuntime(def);
    const interpretedRuntime = createInterpretedOnlyRuntime(def);

    const compiledResult = runBenchmark(
      'Texas Compiled',
      def, TEXAS_PLAYER_COUNT, TEXAS_GAME_COUNT, TEXAS_MAX_TURNS,
      compiledRuntime,
    );

    const interpretedResult = runBenchmark(
      'Texas Interpreted',
      def, TEXAS_PLAYER_COUNT, TEXAS_GAME_COUNT, TEXAS_MAX_TURNS,
      interpretedRuntime,
    );

    console.warn('\n=== Texas Hold\'em Benchmark ===');
    console.warn(formatResult(compiledResult));
    console.warn(formatResult(interpretedResult));
    console.warn(formatComparison(compiledResult, interpretedResult));

    // Advisory — do not fail on performance, just report
    assert.ok(true, 'benchmark completed');
  });

  it('FITL: compiled vs interpreted parity benchmark', () => {
    const def = compileFitlDef();
    const compiledRuntime = createGameDefRuntime(def);
    const interpretedRuntime = createInterpretedOnlyRuntime(def);

    const compiledResult = runBenchmark(
      'FITL Compiled',
      def, FITL_PLAYER_COUNT, FITL_GAME_COUNT, FITL_MAX_TURNS,
      compiledRuntime,
    );

    const interpretedResult = runBenchmark(
      'FITL Interpreted',
      def, FITL_PLAYER_COUNT, FITL_GAME_COUNT, FITL_MAX_TURNS,
      interpretedRuntime,
    );

    console.warn('\n=== FITL Benchmark ===');
    console.warn(formatResult(compiledResult));
    console.warn(formatResult(interpretedResult));
    console.warn(formatComparison(compiledResult, interpretedResult));

    // Advisory — do not fail on performance, just report
    assert.ok(true, 'benchmark completed');
  });

  it('Texas Hold\'em: profiler breakdown (compiled path)', () => {
    const def = compileTexasDef();
    const runtime = createGameDefRuntime(def);
    const profiler = createPerfProfiler();
    const agents = createSeededChoiceAgents(TEXAS_PLAYER_COUNT);

    runGame(def, 42, agents, TEXAS_MAX_TURNS, TEXAS_PLAYER_COUNT, {
      skipDeltas: true,
      profiler,
    }, runtime);

    console.warn('\n=== Texas Hold\'em Profiler (Compiled Path, seed=42) ===');
    for (const [key, bucket] of Object.entries(profiler.data)) {
      if (bucket.count > 0) {
        console.warn(`  ${key}: ${bucket.totalMs.toFixed(1)}ms (${bucket.count} calls)`);
      }
    }
    for (const [key, bucket] of profiler.dynamic.entries()) {
      if (bucket.count > 0) {
        console.warn(`  [dyn] ${key}: ${bucket.totalMs.toFixed(1)}ms (${bucket.count} calls)`);
      }
    }

    assert.ok(true, 'profiler breakdown completed');
  });

  it('FITL: profiler breakdown (compiled path)', () => {
    const def = compileFitlDef();
    const runtime = createGameDefRuntime(def);
    const profiler = createPerfProfiler();
    const agents = createSeededChoiceAgents(FITL_PLAYER_COUNT);

    runGame(def, 42, agents, FITL_MAX_TURNS, FITL_PLAYER_COUNT, {
      skipDeltas: true,
      profiler,
    }, runtime);

    console.warn('\n=== FITL Profiler (Compiled Path, seed=42) ===');
    for (const [key, bucket] of Object.entries(profiler.data)) {
      if (bucket.count > 0) {
        console.warn(`  ${key}: ${bucket.totalMs.toFixed(1)}ms (${bucket.count} calls)`);
      }
    }
    for (const [key, bucket] of profiler.dynamic.entries()) {
      if (bucket.count > 0) {
        console.warn(`  [dyn] ${key}: ${bucket.totalMs.toFixed(1)}ms (${bucket.count} calls)`);
      }
    }

    assert.ok(true, 'profiler breakdown completed');
  });
});
