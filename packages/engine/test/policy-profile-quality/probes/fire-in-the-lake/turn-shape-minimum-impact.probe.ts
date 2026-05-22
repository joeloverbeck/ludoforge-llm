import { defineProbe } from '../define-probe.js';
import { readFixtureJson } from '../../../helpers/fixture-reader.js';
import type { ProbeStateSample } from '../probe-types.js';

const arvnReplayWindows = readFixtureJson<readonly ProbeStateSample[]>(
  'policy-profile-quality/fitl-arvn-action-distribution-windows.json',
);

export const turnShapeMinimumImpactObserved = defineProbe({
  id: 'turn-shape-minimum-impact-observed',
  game: 'fire-in-the-lake',
  profile: 'arvn-baseline',
  seat: 'ARVN',
  stateBinding: {
    scenario: 'fitl-default',
    stateSamples: arvnReplayWindows,
    maxMatchesPerSeed: 1,
    decisionFilter: { phase: 'main' },
  },
  decisionBinding: {
    contextKind: 'actionSelection',
    occurrence: 'every',
  },
  assertions: [
    {
      kind: 'turnShapeMinimumImpactObservedBoth',
      evaluatorId: 'currentTurnImpact',
      windowMinDecisions: 100,
    },
  ],
  severity: 'profileQuality',
  tags: ['arvn-baseline', 'turn-shape', 'spec-182-phase-4'],
});

// Calibration source:
// - Reuses the existing Spec 181 ARVN 15-seed replay-window fixture so the
//   assertion proves selective true/false evaluator behavior without pinning
//   exact actions or a single seed trajectory.
export const probes = [turnShapeMinimumImpactObserved] as const;
