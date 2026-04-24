// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

import { PolicyAgent } from '../../src/agents/index.js';
import {
  advanceAutoresolvable,
  applyPublishedDecision,
  assertValidatedGameDef,
  createGameDefRuntime,
  createRng,
  initialState,
  publishMicroturn,
  terminalResult,
  type Agent,
  type GameDefRuntime,
  type Rng,
  type ValidatedGameDef,
} from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { emitPolicyProfileQualityRecord } from '../helpers/policy-profile-quality-report-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const POLICY_PROFILES = ['us-baseline', 'arvn-baseline', 'nva-baseline', 'vc-baseline'] as const;
const SEED = 1002;
const MAX_TURNS = 3;
const PLAYER_COUNT = 4;
const AGENT_RNG_MIX = 0x9e3779b97f4a7c15n;
const TEST_FILE = fileURLToPath(import.meta.url);
const ALLOWED_STOP_REASONS = new Set(['terminal', 'maxTurns', 'noLegalMoves']);
const DECILE_COUNT = 10;
const WARMUP_DECISIONS = 3;
const TRIM_FRACTION = 0.05;

// Per-decision cost drift ceiling: trimmed last-decile average /
// trimmed first-decile average after discarding the earliest warmup decisions.
// Post-008 calibration on 2026-04-24 from this test's direct compiled run at the
// same stable `maxTurns=3` prefix used by the Spec 143 heap witness measured
// first-decile avg≈13.243ms, last-decile avg≈14.675ms, ratio≈1.108 on seed 1002.
// Ceiling 1.75x absorbs normal JIT/GC/decision-shape variance without masking
// a retained-state regression that makes later decisions materially slower.
const COST_DRIFT_CEILING = 1.75;

type StopReason = 'terminal' | 'maxTurns' | 'noLegalMoves' | 'error';

type DecisionTimingSample = {
  readonly decisionIndex: number;
  readonly turnCount: number;
  readonly durationMs: number;
};

type CostWitnessResult = {
  readonly stopReason: StopReason;
  readonly totalDecisionCount: number;
  readonly playerDecisionCount: number;
  readonly firstDecileAverageMs: number;
  readonly lastDecileAverageMs: number;
  readonly costDriftRatio: number;
  readonly firstDecileSampleCount: number;
  readonly lastDecileSampleCount: number;
  readonly errorMessage?: string;
};

const createAgentRngByPlayer = (
  seed: number,
  playerCount: number,
  createRngImpl: (seed: bigint) => Rng,
): readonly Rng[] =>
  Array.from(
    { length: playerCount },
    (_, playerIndex) => createRngImpl(BigInt(seed) ^ (BigInt(playerIndex + 1) * AGENT_RNG_MIX)),
  );

const resolvePlayerIndexForSeat = (seatId: string, seatIds: readonly string[]): number => {
  const explicitIndex = seatIds.indexOf(seatId);
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

const trimmedMean = (values: readonly number[], trimFraction: number): number => {
  if (values.length === 0) {
    throw new Error('trimmedMean requires at least one value');
  }

  const sorted = [...values].sort((left, right) => left - right);
  const trimCount = Math.min(Math.floor(sorted.length * trimFraction), Math.floor((sorted.length - 1) / 2));
  const trimmed = sorted.slice(trimCount, sorted.length - trimCount);
  const sum = trimmed.reduce((total, value) => total + value, 0);
  return sum / trimmed.length;
};

const selectDecile = (
  timings: readonly DecisionTimingSample[],
  decileIndex: number,
  options: { readonly dropLeading?: number } = {},
): readonly DecisionTimingSample[] => {
  if (timings.length === 0) {
    return [];
  }

  const start = Math.floor((timings.length * decileIndex) / DECILE_COUNT);
  const endExclusive = Math.max(start + 1, Math.ceil((timings.length * (decileIndex + 1)) / DECILE_COUNT));
  const slice = timings.slice(start, endExclusive);
  return slice.slice(options.dropLeading ?? 0);
};

const summarizeCostDrift = (timings: readonly DecisionTimingSample[]): {
  readonly firstDecileAverageMs: number;
  readonly lastDecileAverageMs: number;
  readonly costDriftRatio: number;
  readonly firstDecileSampleCount: number;
  readonly lastDecileSampleCount: number;
} => {
  const firstDecile = selectDecile(timings, 0, { dropLeading: WARMUP_DECISIONS });
  const lastDecile = selectDecile(timings, DECILE_COUNT - 1);

  if (firstDecile.length === 0) {
    throw new Error(
      `Expected at least one post-warmup sample in first decile, got 0 from ${timings.length} decision timings`,
    );
  }
  if (lastDecile.length === 0) {
    throw new Error(`Expected at least one sample in last decile, got 0 from ${timings.length} decision timings`);
  }

  const firstDecileAverageMs = trimmedMean(firstDecile.map((sample) => sample.durationMs), TRIM_FRACTION);
  const lastDecileAverageMs = trimmedMean(lastDecile.map((sample) => sample.durationMs), TRIM_FRACTION);

  return {
    firstDecileAverageMs,
    lastDecileAverageMs,
    costDriftRatio: lastDecileAverageMs / firstDecileAverageMs,
    firstDecileSampleCount: firstDecile.length,
    lastDecileSampleCount: lastDecile.length,
  };
};

const runCostWitness = (
  def: ValidatedGameDef,
  runtime: GameDefRuntime,
): CostWitnessResult => {
  const agents: readonly Agent[] = POLICY_PROFILES.map(
    (profileId) => new PolicyAgent({ profileId, traceLevel: 'summary' }),
  );
  const seatIds = (def.seats ?? []).map((seat) => String(seat.id));
  let agentRngByPlayer = [...createAgentRngByPlayer(SEED, PLAYER_COUNT, createRng)];
  let currentChanceRng = createRng(BigInt(SEED) ^ AGENT_RNG_MIX);
  let totalDecisionCount = 0;
  let playerDecisionCount = 0;

  const initial = initialState(def, SEED, PLAYER_COUNT, undefined, runtime);
  let state = initial.state;
  const timings: DecisionTimingSample[] = [];

  try {
    while (true) {
      const autoResult = advanceAutoresolvable(def, state, currentChanceRng, runtime);
      state = autoResult.state;
      currentChanceRng = autoResult.rng;
      totalDecisionCount += autoResult.autoResolvedLogs.length;

      if (terminalResult(def, state, runtime) !== null) {
        return {
          stopReason: 'terminal',
          totalDecisionCount,
          playerDecisionCount,
          ...summarizeCostDrift(timings),
        };
      }

      if (state.turnCount >= MAX_TURNS) {
        return {
          stopReason: 'maxTurns',
          totalDecisionCount,
          playerDecisionCount,
          ...summarizeCostDrift(timings),
        };
      }

      let microturn;
      try {
        microturn = publishMicroturn(def, state, runtime);
      } catch (error) {
        if (isNoBridgeableMicroturnError(error)) {
          return {
            stopReason: 'noLegalMoves',
            totalDecisionCount,
            playerDecisionCount,
            ...summarizeCostDrift(timings),
          };
        }
        throw error;
      }

      const playerIndex = resolvePlayerIndexForSeat(String(microturn.seatId), seatIds);
      const agent = playerIndex < 0 ? undefined : agents[playerIndex];
      const agentRng = playerIndex < 0 ? undefined : agentRngByPlayer[playerIndex];
      if (agent === undefined || agentRng === undefined || playerIndex < 0) {
        throw new Error(`missing agent or RNG for seat ${String(microturn.seatId)}`);
      }

      const startedAt = performance.now();
      const selected = agent.chooseDecision({
        def,
        state,
        microturn,
        rng: agentRng,
        runtime,
      });
      agentRngByPlayer[playerIndex] = selected.rng;

      const applied = applyPublishedDecision(def, state, microturn, selected.decision, undefined, runtime);
      const durationMs = performance.now() - startedAt;

      state = applied.state;
      totalDecisionCount += 1;
      playerDecisionCount += 1;
      timings.push({
        decisionIndex: playerDecisionCount,
        turnCount: state.turnCount,
        durationMs,
      });
    }
  } catch (error) {
    return {
      stopReason: 'error',
      totalDecisionCount,
      playerDecisionCount,
      ...(timings.length > 0
        ? summarizeCostDrift(timings)
        : {
            firstDecileAverageMs: Number.NaN,
            lastDecileAverageMs: Number.NaN,
            costDriftRatio: Number.NaN,
            firstDecileSampleCount: 0,
            lastDecileSampleCount: 0,
          }),
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
};

describe('FITL spec 143 cost stability witness', () => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assertNoErrors(compiled);
  if (compiled.gameDef === null) {
    throw new Error('Expected compiled FITL gameDef');
  }

  const def = assertValidatedGameDef(compiled.gameDef);
  const runtime = createGameDefRuntime(def);

  it(`seed ${SEED}: keeps later decision cost under the calibrated drift ceiling`, { timeout: 60_000 }, () => {
    const result = runCostWitness(def, runtime);
    const passed = ALLOWED_STOP_REASONS.has(result.stopReason) && result.costDriftRatio < COST_DRIFT_CEILING;

    emitPolicyProfileQualityRecord({
      file: TEST_FILE,
      variantId: 'all-baselines',
      seed: SEED,
      passed,
      stopReason: result.stopReason,
      decisions: result.totalDecisionCount,
    });

    assert.equal(
      ALLOWED_STOP_REASONS.has(result.stopReason),
      true,
      `seed ${SEED}: expected bounded completion with stopReason terminal|maxTurns|noLegalMoves, got ${result.stopReason}${result.errorMessage === undefined ? '' : ` (${result.errorMessage})`}`,
    );
    assert.equal(result.playerDecisionCount > WARMUP_DECISIONS, true, `seed ${SEED} should advance enough player decisions to clear warmup`);
    assert.ok(
      result.costDriftRatio < COST_DRIFT_CEILING,
      [
        `seed ${SEED}: cost drift ratio ${result.costDriftRatio.toFixed(3)} exceeded ceiling ${COST_DRIFT_CEILING.toFixed(2)}`,
        `firstDecileAvg=${result.firstDecileAverageMs.toFixed(3)}ms`,
        `lastDecileAvg=${result.lastDecileAverageMs.toFixed(3)}ms`,
        `firstDecileSamples=${result.firstDecileSampleCount}`,
        `lastDecileSamples=${result.lastDecileSampleCount}`,
        `playerDecisions=${result.playerDecisionCount}`,
        `totalDecisions=${result.totalDecisionCount}`,
        `stopReason=${result.stopReason}`,
      ].join(' | '),
    );
  });
});
