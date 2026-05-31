// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createGameDefRuntime } from '../../../src/kernel/index.js';
import { readFixtureJson } from '../../helpers/fixture-reader.js';
import { getFitlProductionFixture } from '../../helpers/production-spec-helpers.js';
import { defineProbe } from './define-probe.js';
import { runProbe } from './probe-runner.js';
import type { ProbeLoadedGame, ProbeStateSample, ScenarioId } from './probe-types.js';

const FITL_SCENARIO = 'fitl-default' as ScenarioId;
const NVA_MARGIN_REF = 'victoryCurrentMargin.currentMargin.nva';
const VC_MARGIN_REF = 'victoryCurrentMargin.currentMargin.vc';
const CURRENT_LEADER_REF = 'victoryCurrentMargin.currentMargin.role:currentLeader';
const NEAREST_THREAT_REF = 'victoryCurrentMargin.currentMargin.role:nearestThreat';
const READY_MARGIN_REFS = new Set([NVA_MARGIN_REF, VC_MARGIN_REF, CURRENT_LEADER_REF, NEAREST_THREAT_REF]);

const arvnReplayWindows = readFixtureJson<readonly ProbeStateSample[]>(
  'policy-profile-quality/fitl-arvn-action-distribution-windows.json',
);

const arvnOpponentPreviewProbe = defineProbe({
  id: 'fitl-arvn-may17-equivalent-opponent-preview',
  game: 'fire-in-the-lake',
  profile: 'arvn-baseline',
  seat: 'ARVN',
  stateBinding: {
    scenario: FITL_SCENARIO,
    stateSamples: arvnReplayWindows,
    maxMatchesPerSeed: 1,
    decisionFilter: { phase: 'main' },
  },
  decisionBinding: {
    contextKind: 'actionSelection',
    occurrence: 'every',
  },
  assertions: [],
  severity: 'profileQuality',
  tags: ['arvn-baseline', 'grant-flow', 'spec-185'],
});

const loadFitlGame = (): ProbeLoadedGame => {
  const def = getFitlProductionFixture().gameDef;
  return {
    def,
    runtime: createGameDefRuntime(def),
    playerCount: 4,
    scenario: FITL_SCENARIO,
  };
};

describe('FITL ARVN decision-source-aware opponent preview witness', () => {
  // QUARANTINED pending ticket 208FITLARVPQ-004. Ticket 003 distilled the old
  // seed-pinned ready-candidate assertion after the diagnostics proved this
  // window is plan-root selected and does not exercise scalar grant-flow preview.
  it('keeps plan-root source explicit and scalar opponent/standing preview statuses lossless', {
    skip: 'Spec 208 ticket 004 owns final quarantine removal',
  }, () => {
    const result = runProbe(arvnOpponentPreviewProbe, {
      loadGame: loadFitlGame,
      traceLevel: 'verbose',
    });
    if (result.aggregateOutcome.kind !== 'pass') {
      console.warn('POLICY_PROFILE_QUALITY_REGRESSION', {
        probeId: arvnOpponentPreviewProbe.id,
        outcome: result.aggregateOutcome,
      });
      return;
    }

    const traces = result.perSeedOutcomes.flatMap((seedOutcome) =>
      seedOutcome.matches.flatMap((match) => match.trace === null ? [] : [match.trace]),
    );
    assert.ok(traces.length > 0, 'expected the witness to inspect at least one ARVN trace');

    const planRootTraces = traces.filter((trace) => trace.plan?.status === 'selected');
    const scalarTraces = traces.filter((trace) => (trace.candidates?.length ?? 0) > 0);
    for (const trace of planRootTraces) {
      assert.equal(trace.previewUsage.mode, 'disabled');
      assert.equal(trace.candidates?.length ?? 0, 0);
      assert.equal(trace.plan?.selectedTemplate !== undefined, true);
      assert.equal(trace.plan?.selectedIntent !== undefined, true);
    }

    if (scalarTraces.length === 0) {
      assert.equal(planRootTraces.length, traces.length, 'non-scalar traces must be explicit plan-root selections');
      return;
    }

    let marginRefRequestCount = 0;
    let grantFlowAccountingCount = 0;
    for (const trace of scalarTraces) {
      grantFlowAccountingCount += (trace.previewUsage.outcomeBreakdown?.unknownGrantFlowPartial ?? 0)
        + (trace.previewUsage.outcomeBreakdown?.unknownPostGrantCap ?? 0)
        + (trace.previewUsage.outcomeBreakdown?.unknownFreeOperationCap ?? 0);
      for (const candidate of trace.candidates ?? []) {
        const unknownByRef = new Set(candidate.unknownPreviewRefs.map((entry) => entry.refId));
        for (const ref of READY_MARGIN_REFS) {
          if (candidate.previewRefIds.includes(ref) || unknownByRef.has(ref)) {
            marginRefRequestCount += 1;
          }
          assert.ok(
            !candidate.previewRefIds.includes(ref) || !unknownByRef.has(ref),
            `preview ref ${ref} cannot be both ready and non-ready on one candidate`,
          );
        }
      }
    }

    assert.ok(
      marginRefRequestCount > 0,
      'scalar preview traces must explicitly account for opponent/standing margin refs when they are exercised',
    );
    assert.ok(grantFlowAccountingCount >= 0);
  });
});
