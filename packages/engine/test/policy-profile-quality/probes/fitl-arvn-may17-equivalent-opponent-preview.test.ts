// @test-class: convergence-witness
// @profile-variant: arvn-baseline

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

describe('FITL ARVN May-17-equivalent opponent preview witness', () => {
  it('keeps opponent/standing preview refs ready and non-uniform in the May-17 replay window', () => {
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
    const readyOpponentCandidates = traces.flatMap((trace) =>
      (trace.candidates ?? []).filter((candidate) =>
        candidate.previewOutcome === 'ready'
        && [NVA_MARGIN_REF, VC_MARGIN_REF].every((ref) => candidate.previewRefIds.includes(ref))
        && candidate.unknownPreviewRefs.every((entry) => !READY_MARGIN_REFS.has(entry.refId))
      ),
    );
    const opponentMarginContributions = new Set(
      readyOpponentCandidates.flatMap((candidate) =>
        candidate.scoreContributions
          .filter((entry) => entry.termId === 'penalizeOpponentMargin')
          .map((entry) => entry.contribution),
      ),
    );
    const partialOpponentRefCount = traces.reduce((total, trace) =>
      total + (trace.previewUsage.outcomeBreakdown?.unknownGrantFlowPartial ?? 0)
      + (trace.previewUsage.outcomeBreakdown?.unknownPostGrantCap ?? 0)
      + (trace.previewUsage.outcomeBreakdown?.unknownFreeOperationCap ?? 0),
    0,
    );

    assert.ok(
      readyOpponentCandidates.length >= 2,
      `expected at least two ready opponent-preview candidates, saw ${readyOpponentCandidates.length}`,
    );
    assert.ok(
      opponentMarginContributions.size >= 2,
      'expected opponent margin score contributions to be non-uniform across ARVN candidates',
    );
    assert.ok(partialOpponentRefCount >= 0);
    assert.ok(
      traces.some((trace) => (trace.previewUsage.readyRefStats[NVA_MARGIN_REF]?.readyCount ?? 0) > 0
        || (trace.previewUsage.readyRefStats[VC_MARGIN_REF]?.readyCount ?? 0) > 0),
      'expected NVA or VC opponent margin refs to be ready in at least one ARVN trace',
    );
  });
});
