import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { RandomAgent } from '../../src/agents/index.js';
import {
  assertValidatedGameDef,
  createGameDefRuntime,
  type Agent,
  type GameDefRuntime,
  type ValidatedGameDef,
} from '../../src/kernel/index.js';
import { runGame } from '../../src/sim/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import {
  compileProductionSpec,
  compileTexasProductionSpec,
} from '../helpers/production-spec-helpers.js';

// ---------------------------------------------------------------------------
// Skip guard — requires node --expose-gc
// ---------------------------------------------------------------------------

const gc: (() => void) | undefined = (globalThis as Record<string, unknown>).gc as (() => void) | undefined;
const HAS_GC = typeof gc === 'function';

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

const createRandomAgents = (count: number): readonly Agent[] =>
  Array.from({ length: count }, () => new RandomAgent());

const FITL_PLAYER_COUNT = 4;
const TEXAS_PLAYER_COUNT = 6;
const MAX_TURNS = 200;
const FITL_GAME_COUNT = 5;
const TEXAS_GAME_COUNT = 20;
const GC_PERCENT_THRESHOLD = 16;

interface GcMeasurement {
  readonly totalMs: number;
  readonly gcMs: number;
  readonly gcPercent: number;
}

/**
 * Measure GC pressure over N games.
 *
 * Strategy: run gc() before and after each game, measure total wall-clock time
 * and time spent in explicit gc() calls. The ratio gives an approximation of
 * GC pressure.
 */
const measureGcPressure = (
  def: ValidatedGameDef,
  playerCount: number,
  gameCount: number,
  runtime: GameDefRuntime,
): GcMeasurement => {
  if (!HAS_GC || gc === undefined) {
    return { totalMs: 0, gcMs: 0, gcPercent: 0 };
  }

  // Warm up — compile caches, JIT
  const warmAgents = createRandomAgents(playerCount);
  try {
    runGame(def, 999, warmAgents, MAX_TURNS, playerCount, { skipDeltas: true }, runtime);
  } catch {
    // Warm-up failure is non-fatal (e.g. FITL stall loops with RandomAgent)
  }
  gc();

  const totalStart = performance.now();
  let gcMs = 0;

  for (let i = 0; i < gameCount; i++) {
    const seed = 5000 + i;
    const agents = createRandomAgents(playerCount);
    try {
      runGame(def, seed, agents, MAX_TURNS, playerCount, { skipDeltas: true }, runtime);
    } catch {
      // Swallow runtime errors (stall loops, etc.) — we're measuring GC, not correctness
    }

    const gcStart = performance.now();
    gc();
    gcMs += performance.now() - gcStart;
  }

  const totalMs = performance.now() - totalStart;
  const gcPercent = totalMs > 0 ? (gcMs / totalMs) * 100 : 0;

  return { totalMs, gcMs, gcPercent };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('draft-state GC measurement (advisory)', { skip: !HAS_GC && 'requires --expose-gc' }, () => {
  it(`FITL: GC% < ${GC_PERCENT_THRESHOLD}% over ${FITL_GAME_COUNT} games`, () => {
    const def = compileFitlDef();
    const runtime = createGameDefRuntime(def);
    const result = measureGcPressure(def, FITL_PLAYER_COUNT, FITL_GAME_COUNT, runtime);

    console.warn(
      `FITL GC measurement: total=${result.totalMs.toFixed(0)}ms, gc=${result.gcMs.toFixed(0)}ms, gc%=${result.gcPercent.toFixed(2)}%`,
    );

    assert.ok(
      result.gcPercent < GC_PERCENT_THRESHOLD,
      `FITL GC% (${result.gcPercent.toFixed(2)}%) exceeds threshold (${GC_PERCENT_THRESHOLD}%)`,
    );
  });

  it(`Texas Hold'em: GC% < ${GC_PERCENT_THRESHOLD}% over ${TEXAS_GAME_COUNT} games`, () => {
    const def = compileTexasDef();
    const runtime = createGameDefRuntime(def);
    const result = measureGcPressure(def, TEXAS_PLAYER_COUNT, TEXAS_GAME_COUNT, runtime);

    console.warn(
      `Texas GC measurement: total=${result.totalMs.toFixed(0)}ms, gc=${result.gcMs.toFixed(0)}ms, gc%=${result.gcPercent.toFixed(2)}%`,
    );

    assert.ok(
      result.gcPercent < GC_PERCENT_THRESHOLD,
      `Texas GC% (${result.gcPercent.toFixed(2)}%) exceeds threshold (${GC_PERCENT_THRESHOLD}%)`,
    );
  });
});
