// @test-class: architectural-invariant
//
// Spec 149 Phase 4 reset gate.
//
// The original <=250 ms same-seam target was retired on 2026-05-04 after the
// Spec 150 successor path proved that budget infeasible for the current
// architecture. The active F14 default-flip/deletion cut is gated at <=1800 ms
// for the same one-card FITL workload with all four baseline profiles and
// verifyIncrementalHash enabled.

import * as assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../../src/agents/index.js';
import {
  assertValidatedGameDef,
  createGameDefRuntime,
  type Agent,
} from '../../../src/kernel/index.js';
import { runGame } from '../../../src/sim/index.js';
import { getFitlProductionFixture } from '../../helpers/production-spec-helpers.js';

const FITL_BASELINE_PROFILES = [
  'us-baseline',
  'arvn-baseline',
  'nva-baseline',
  'vc-baseline',
] as const;

const WORKLOAD = {
  seed: 42,
  maxTurns: 1,
  playerCount: 4,
} as const;

const PHASE4_RESET_CEILING_MS = 1_800;

describe('Spec 149 Phase 4 FITL per-card reset gate', () => {
  it(`runs the one-card successor-runtime workload within ${PHASE4_RESET_CEILING_MS} ms`, () => {
    const def = assertValidatedGameDef(getFitlProductionFixture().gameDef);
    const runtime = createGameDefRuntime(def);
    const elapsedMs = measure(def, runtime);

    assert.ok(
      Number.isFinite(elapsedMs) && elapsedMs > 0,
      `Expected positive elapsedMs, got ${elapsedMs}.`,
    );
    assert.ok(
      elapsedMs <= PHASE4_RESET_CEILING_MS,
      `SPEC149_PHASE4_PER_CARD_RESET_GATE elapsedMs=${round2(elapsedMs)} ` +
      `ceilingMs=${PHASE4_RESET_CEILING_MS} seed=${WORKLOAD.seed} ` +
      `maxTurns=${WORKLOAD.maxTurns} profiles=${FITL_BASELINE_PROFILES.join(',')} ` +
      `verifyIncrementalHash=true`,
    );
  });
});

function measure(
  def: ReturnType<typeof assertValidatedGameDef>,
  runtime: ReturnType<typeof createGameDefRuntime>,
): number {
  const agents: Agent[] = FITL_BASELINE_PROFILES.map(
    (profileId) => new PolicyAgent({ profileId, traceLevel: 'summary' }),
  );

  const startedAt = performance.now();
  runGame(
    def,
    WORKLOAD.seed,
    agents,
    WORKLOAD.maxTurns,
    WORKLOAD.playerCount,
    {
      kernel: { verifyIncrementalHash: true },
      skipDeltas: true,
      traceRetention: 'finalStateOnly',
    },
    runtime,
  );
  return performance.now() - startedAt;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
