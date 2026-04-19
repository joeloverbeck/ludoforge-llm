// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../src/agents/index.js';
import { assertValidatedGameDef, createGameDefRuntime } from '../../src/kernel/index.js';
import { createPerfProfiler } from '../../src/kernel/perf-profiler.js';
import { runGame } from '../../src/sim/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const POLICY_PROFILES = ['us-baseline', 'arvn-evolved', 'nva-baseline', 'vc-baseline'] as const;
const STABLE_SEEDS = [
  1000, 1001, 1003, 1004, 1005, 1006, 1007, 1008, 1009,
  1011, 1013, 1014, 1015, 1016, 1017, 1018, 1019,
] as const;
const PLAYER_COUNT = 4;
const MAX_TURNS = 200;
const PROBE_STEP_COUNTER_KEY = 'decisionSequenceSatisfiability:probeStep';
const PROBE_STEP_OVERHEAD_LIMIT = 1.25;

interface CorpusMeasurement {
  readonly totalProbeSteps: number;
  readonly stopReasons: readonly string[];
}

const readProbeSteps = (profiler: ReturnType<typeof createPerfProfiler>): number =>
  profiler.dynamic.get(PROBE_STEP_COUNTER_KEY)?.count ?? 0;

const runCorpus = (
  def: ReturnType<typeof assertValidatedGameDef>,
  disableGuidedChooser: boolean,
): CorpusMeasurement => {
  const runtime = createGameDefRuntime(def);
  let totalProbeSteps = 0;
  const stopReasons: string[] = [];

  for (const seed of STABLE_SEEDS) {
    const profiler = createPerfProfiler();
    const agents = POLICY_PROFILES.map(
      (profileId) => new PolicyAgent({ profileId, traceLevel: 'summary', disableGuidedChooser }),
    );
    const trace = runGame(
      def,
      seed,
      agents,
      MAX_TURNS,
      PLAYER_COUNT,
      { skipDeltas: true, profiler },
      runtime,
    );
    totalProbeSteps += readProbeSteps(profiler);
    stopReasons.push(trace.stopReason);
  }

  return {
    totalProbeSteps,
    stopReasons,
  };
};

describe('Spec 138 guided-classifier overhead gate', () => {
  it('keeps total decision probe-step overhead below 25% on the stable 17-seed FITL corpus', () => {
    const { parsed, compiled } = compileProductionSpec();
    assertNoErrors(parsed);
    assertNoErrors(compiled);
    if (compiled.gameDef === null) {
      throw new Error('Expected compiled FITL gameDef');
    }

    const def = assertValidatedGameDef(compiled.gameDef);
    const legacy = runCorpus(def, true);
    const guided = runCorpus(def, false);
    const overheadRatio = legacy.totalProbeSteps === 0
      ? 0
      : guided.totalProbeSteps / legacy.totalProbeSteps;

    console.warn(
      `Spec 138 probe-step gate: legacy=${legacy.totalProbeSteps}, guided=${guided.totalProbeSteps}, ratio=${overheadRatio.toFixed(4)}`,
    );
    console.warn(`Legacy stop reasons: ${legacy.stopReasons.join(', ')}`);
    console.warn(`Guided stop reasons: ${guided.stopReasons.join(', ')}`);

    assert.ok(
      overheadRatio < PROBE_STEP_OVERHEAD_LIMIT,
      `expected guided probe-step ratio < ${PROBE_STEP_OVERHEAD_LIMIT}, received ${overheadRatio.toFixed(4)}`,
    );
  });
});
