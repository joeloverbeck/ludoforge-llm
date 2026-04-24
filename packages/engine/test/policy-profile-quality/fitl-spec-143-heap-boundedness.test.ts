// @test-class: architectural-invariant
// @profile-variant: all-baselines

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
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
const SAMPLE_EVERY_DECISIONS = 25;
const AGENT_RNG_MIX = 0x9e3779b97f4a7c15n;
const TEST_FILE = fileURLToPath(import.meta.url);
const ALLOWED_STOP_REASONS = new Set(['terminal', 'maxTurns', 'noLegalMoves']);

// Spec 143's checked-in heap report identified `maxTurns=3` as the smallest
// stable capture bound that still surfaced the same rising-heap pattern on the
// motivating seed. Keep this witness on that stable prefix instead of the
// later, flakier tail of the full run.
//
// Post-003/004/008 calibration on 2026-04-24 at this bound:
// start≈149 MiB, peak≈252 MiB, growth≈103 MiB on seed 1002 with the four
// baseline profiles. A 170 MiB ceiling leaves generous Node/V8 headroom while
// still flagging a clear retained-state regression.
const HEAP_GROWTH_CEILING_MB = 170;

type StopReason = 'terminal' | 'maxTurns' | 'noLegalMoves' | 'error';

type HeapSample = {
  readonly decisionCount: number;
  readonly playerDecisionCount: number;
  readonly turnCount: number;
  readonly heapUsedMb: number;
};

type HeapWitnessResult = {
  readonly stopReason: StopReason;
  readonly totalDecisionCount: number;
  readonly playerDecisionCount: number;
  readonly startSample: HeapSample;
  readonly midpointSample: HeapSample;
  readonly finalSample: HeapSample;
  readonly peakSample: HeapSample;
  readonly errorMessage?: string;
};

const heapUsedMb = (): number => Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 100) / 100;

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

const recordSample = (
  samples: HeapSample[],
  decisionCount: number,
  playerDecisionCount: number,
  turnCount: number,
): void => {
  samples.push({
    decisionCount,
    playerDecisionCount,
    turnCount,
    heapUsedMb: heapUsedMb(),
  });
};

const requireFirstSample = (samples: readonly HeapSample[]): HeapSample => {
  const first = samples[0];
  if (first === undefined) {
    throw new Error('Expected at least one heap sample');
  }
  return first;
};

const requireLastSample = (samples: readonly HeapSample[]): HeapSample => {
  const last = samples[samples.length - 1];
  if (last === undefined) {
    throw new Error('Expected at least one heap sample');
  }
  return last;
};

const midpointSampleFor = (samples: readonly HeapSample[], totalDecisionCount: number): HeapSample => {
  const midpoint = totalDecisionCount / 2;
  let best = requireFirstSample(samples);

  for (const sample of samples) {
    if (Math.abs(sample.decisionCount - midpoint) < Math.abs(best.decisionCount - midpoint)) {
      best = sample;
    }
  }

  return best;
};

const peakSampleFor = (samples: readonly HeapSample[]): HeapSample => {
  let peak = requireFirstSample(samples);

  for (const sample of samples) {
    if (sample.heapUsedMb > peak.heapUsedMb) {
      peak = sample;
    }
  }

  return peak;
};

const runHeapWitness = (
  def: ValidatedGameDef,
  runtime: GameDefRuntime,
): HeapWitnessResult => {
  const agents: readonly Agent[] = POLICY_PROFILES.map(
    (profileId) => new PolicyAgent({ profileId, traceLevel: 'summary' }),
  );
  const seatIds = (def.seats ?? []).map((seat) => String(seat.id));
  let agentRngByPlayer = [...createAgentRngByPlayer(SEED, PLAYER_COUNT, createRng)];
  let currentChanceRng = createRng(BigInt(SEED) ^ AGENT_RNG_MIX);
  let totalDecisionCount = 0;
  let playerDecisionCount = 0;
  let nextSampleDecision = SAMPLE_EVERY_DECISIONS;

  const initial = initialState(def, SEED, PLAYER_COUNT, undefined, runtime);
  let state = initial.state;
  const samples: HeapSample[] = [];

  recordSample(samples, totalDecisionCount, playerDecisionCount, state.turnCount);

  try {
    while (true) {
      const autoResult = advanceAutoresolvable(def, state, currentChanceRng, runtime);
      state = autoResult.state;
      currentChanceRng = autoResult.rng;
      totalDecisionCount += autoResult.autoResolvedLogs.length;

      while (totalDecisionCount >= nextSampleDecision) {
        recordSample(samples, totalDecisionCount, playerDecisionCount, state.turnCount);
        nextSampleDecision += SAMPLE_EVERY_DECISIONS;
      }

      if (terminalResult(def, state, runtime) !== null) {
        recordSample(samples, totalDecisionCount, playerDecisionCount, state.turnCount);
        return {
          stopReason: 'terminal',
          totalDecisionCount,
          playerDecisionCount,
          startSample: requireFirstSample(samples),
          midpointSample: midpointSampleFor(samples, totalDecisionCount),
          finalSample: requireLastSample(samples),
          peakSample: peakSampleFor(samples),
        };
      }

      if (state.turnCount >= MAX_TURNS) {
        recordSample(samples, totalDecisionCount, playerDecisionCount, state.turnCount);
        return {
          stopReason: 'maxTurns',
          totalDecisionCount,
          playerDecisionCount,
          startSample: requireFirstSample(samples),
          midpointSample: midpointSampleFor(samples, totalDecisionCount),
          finalSample: requireLastSample(samples),
          peakSample: peakSampleFor(samples),
        };
      }

      let microturn;
      try {
        microturn = publishMicroturn(def, state, runtime);
      } catch (error) {
        if (isNoBridgeableMicroturnError(error)) {
          recordSample(samples, totalDecisionCount, playerDecisionCount, state.turnCount);
          return {
            stopReason: 'noLegalMoves',
            totalDecisionCount,
            playerDecisionCount,
            startSample: requireFirstSample(samples),
            midpointSample: midpointSampleFor(samples, totalDecisionCount),
            finalSample: requireLastSample(samples),
            peakSample: peakSampleFor(samples),
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

      const selected = agent.chooseDecision({
        def,
        state,
        microturn,
        rng: agentRng,
        runtime,
      });
      agentRngByPlayer[playerIndex] = selected.rng;

      const applied = applyPublishedDecision(def, state, microturn, selected.decision, undefined, runtime);
      state = applied.state;
      totalDecisionCount += 1;
      playerDecisionCount += 1;

      while (totalDecisionCount >= nextSampleDecision) {
        recordSample(samples, totalDecisionCount, playerDecisionCount, state.turnCount);
        nextSampleDecision += SAMPLE_EVERY_DECISIONS;
      }
    }
  } catch (error) {
    recordSample(samples, totalDecisionCount, playerDecisionCount, state.turnCount);
    return {
      stopReason: 'error',
      totalDecisionCount,
      playerDecisionCount,
      startSample: requireFirstSample(samples),
      midpointSample: midpointSampleFor(samples, totalDecisionCount),
      finalSample: requireLastSample(samples),
      peakSample: peakSampleFor(samples),
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
};

describe('FITL spec 143 heap boundedness witness', () => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assertNoErrors(compiled);
  if (compiled.gameDef === null) {
    throw new Error('Expected compiled FITL gameDef');
  }

  const def = assertValidatedGameDef(compiled.gameDef);
  const runtime = createGameDefRuntime(def);

  it(`seed ${SEED}: stays under the calibrated heap-growth ceiling`, { timeout: 60_000 }, () => {
    const result = runHeapWitness(def, runtime);
    const midpointGrowthMb = result.midpointSample.heapUsedMb - result.startSample.heapUsedMb;
    const peakGrowthMb = result.peakSample.heapUsedMb - result.startSample.heapUsedMb;
    const passed = ALLOWED_STOP_REASONS.has(result.stopReason) && peakGrowthMb < HEAP_GROWTH_CEILING_MB;

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
    assert.equal(result.totalDecisionCount > 0, true, `seed ${SEED} should advance at least one decision`);
    assert.ok(
      peakGrowthMb < HEAP_GROWTH_CEILING_MB,
      [
        `seed ${SEED}: peak heap growth ${peakGrowthMb.toFixed(2)} MiB exceeded ceiling ${HEAP_GROWTH_CEILING_MB} MiB`,
        `start=${result.startSample.heapUsedMb.toFixed(2)} MiB`,
        `midpoint=${result.midpointSample.heapUsedMb.toFixed(2)} MiB at decisions=${result.midpointSample.decisionCount}`,
        `final=${result.finalSample.heapUsedMb.toFixed(2)} MiB at decisions=${result.finalSample.decisionCount}`,
        `peak=${result.peakSample.heapUsedMb.toFixed(2)} MiB at decisions=${result.peakSample.decisionCount}`,
        `midpointGrowth=${midpointGrowthMb.toFixed(2)} MiB`,
        `stopReason=${result.stopReason}`,
      ].join(' | '),
    );
  });
});
