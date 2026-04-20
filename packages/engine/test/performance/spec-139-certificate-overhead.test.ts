// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../src/agents/index.js';
import {
  type AgentMicroturnDecisionInput,
  type AgentMicroturnDecisionResult,
  assertValidatedGameDef,
  classifyMoveDecisionSequenceSatisfiability,
  createGameDefRuntime,
  enumerateLegalMoves,
  type Agent,
  type ClassifiedMove,
  type ValidatedGameDef,
} from '../../src/kernel/index.js';
import { createPerfProfiler } from '../../src/kernel/perf-profiler.js';
import { runGame } from '../../src/sim/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
import { createSpec139CertificateSearchFixture } from '../helpers/spec-139-certificate-search-fixture.js';

const POLICY_PROFILES = ['us-baseline', 'arvn-evolved', 'nva-baseline', 'vc-baseline'] as const;
const STABLE_SEEDS = [
  1000, 1001, 1003, 1004, 1005, 1006, 1007, 1008, 1009,
  1011, 1013, 1014, 1015, 1016, 1017, 1018, 1019,
] as const;
const PLAYER_COUNT = 4;
const MAX_TURNS = 200;
const PROBE_STEP_COUNTER_KEY = 'decisionSequenceSatisfiability:probeStep';
const PROBE_STEP_OVERHEAD_LIMIT = 1.50;

interface CorpusMeasurement {
  readonly totalProbeSteps: number;
  readonly measuredTemplates: number;
}

interface CapturedTemplate {
  readonly state: Parameters<Agent['chooseDecision']>[0]['state'];
  readonly move: ClassifiedMove['move'];
}

const captureCorpusTemplates = (
  def: ValidatedGameDef,
): readonly CapturedTemplate[] => {
  const runtime = createGameDefRuntime(def);
  const templates: CapturedTemplate[] = [];

  for (const seed of STABLE_SEEDS) {
    const agents: Agent[] = POLICY_PROFILES.map((profileId) => {
      const inner = new PolicyAgent({ profileId, traceLevel: 'summary' });
      return {
        chooseDecision(input: AgentMicroturnDecisionInput): AgentMicroturnDecisionResult {
          for (const classified of enumerateLegalMoves(input.def, input.state, undefined, input.runtime).moves) {
            if (classified.viability.complete || classified.viability.stochasticDecision !== undefined) {
              continue;
            }
            templates.push({
              state: input.state,
              move: classified.move,
            });
          }
          return inner.chooseDecision(input);
        },
      } as Agent;
    });
    runGame(
      def,
      seed,
      agents,
      MAX_TURNS,
      PLAYER_COUNT,
      { skipDeltas: true },
      runtime,
    );
  }

  return templates;
};

const measureCapturedTemplates = (
  def: ValidatedGameDef,
  templates: readonly CapturedTemplate[],
  emitCompletionCertificate: boolean,
): CorpusMeasurement => {
  const profiler = createPerfProfiler();
  const runtime = createGameDefRuntime(def);

  for (const template of templates) {
    classifyMoveDecisionSequenceSatisfiability(
      def,
      template.state,
      template.move,
      {
        emitCompletionCertificate,
        profiler,
      },
      runtime,
    );
  }

  return {
    totalProbeSteps: profiler.dynamic.get(PROBE_STEP_COUNTER_KEY)?.count ?? 0,
    measuredTemplates: templates.length,
  };
};

describe('Spec 139 certificate overhead gate', () => {
  it('keeps total decision probe-step overhead below 1.50x on the stable 17-seed FITL corpus at the classifier seam', () => {
    const { parsed, compiled } = compileProductionSpec();
    assertNoErrors(parsed);
    assertNoErrors(compiled);
    if (compiled.gameDef === null) {
      throw new Error('Expected compiled FITL gameDef');
    }

    const def = assertValidatedGameDef(compiled.gameDef);
    const capturedTemplates = captureCorpusTemplates(def);
    const withoutCertificate = measureCapturedTemplates(def, capturedTemplates, false);
    const withCertificate = measureCapturedTemplates(def, capturedTemplates, true);
    const overheadRatio = withoutCertificate.totalProbeSteps === 0
      ? 0
      : withCertificate.totalProbeSteps / withoutCertificate.totalProbeSteps;

    assert.ok(withoutCertificate.measuredTemplates > 0, 'expected stable corpus to exercise incomplete template classification');
    assert.equal(withCertificate.measuredTemplates, withoutCertificate.measuredTemplates);
    assert.ok(
      overheadRatio < PROBE_STEP_OVERHEAD_LIMIT,
      `expected certificate probe-step ratio < ${PROBE_STEP_OVERHEAD_LIMIT}, received ${overheadRatio.toFixed(4)}`,
    );

    const fixture = createSpec139CertificateSearchFixture();
    const baselineProfiler = createPerfProfiler();
    const certificateProfiler = createPerfProfiler();
    const baseline = classifyMoveDecisionSequenceSatisfiability(
      fixture.def,
      fixture.state,
      fixture.move,
      {
        emitCompletionCertificate: false,
        validateSatisfiedMove: fixture.isSupportedMove,
        profiler: baselineProfiler,
      },
    );
    const certified = classifyMoveDecisionSequenceSatisfiability(
      fixture.def,
      fixture.state,
      fixture.move,
      {
        emitCompletionCertificate: true,
        validateSatisfiedMove: fixture.isSupportedMove,
        profiler: certificateProfiler,
      },
    );

    assert.equal(baseline.classification, 'satisfiable');
    assert.equal(certified.classification, 'satisfiable');
    assert.ok(
      (certificateProfiler.dynamic.get(PROBE_STEP_COUNTER_KEY)?.count ?? 0)
        >= (baselineProfiler.dynamic.get(PROBE_STEP_COUNTER_KEY)?.count ?? 0),
      'expected adversarial comparison point to record deterministic probe-step counts in both modes',
    );
  });
});
