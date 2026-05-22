import { defineProbe } from '../define-probe.js';
import { readFixtureJson } from '../../../helpers/fixture-reader.js';
import type { ProbeStateSample } from '../probe-types.js';

const arvnReplayWindows = readFixtureJson<readonly ProbeStateSample[]>(
  'policy-profile-quality/fitl-arvn-action-distribution-windows.json',
);

export const arvnActionDistributionNotDominated = defineProbe({
  id: 'arvn-action-distribution-not-dominated',
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
      kind: 'actionFamilyDistributionBelow',
      family: 'any',
      threshold: 0.60,
      windowMinDecisions: 100,
    },
    {
      kind: 'selectedNotByReason',
      reason: 'tiebreakAfterPreviewNoSignal',
      maxRate: 0.10,
    },
  ],
  severity: 'profileQuality',
  tags: ['arvn-baseline', 'action-distribution', 'spec-181-phase-0'],
});

// Calibration sources:
// - reports/fitl-arvn-preview-opponent-margin-uniform-2026-05-17.md recorded
//   Govern at 75% across 159 main-phase ARVN decisions for seeds 1000..1014.
// - Current 2026-05-18 harness run over the first 100 aggregate matches passed:
//   Train 28, Event 24, Govern 15, tiebreakAfterPreviewNoSignal 0%.
export const probes = [arvnActionDistributionNotDominated] as const;
