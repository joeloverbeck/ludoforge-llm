import { defineProbe } from '../define-probe.js';
import { readFixtureJson } from '../../../helpers/fixture-reader.js';
import type { ProbeStateSample } from '../probe-types.js';

const arvnReplayWindows = readFixtureJson<readonly ProbeStateSample[]>(
  'policy-profile-quality/fitl-arvn-action-distribution-windows.json',
);

export const arvnModuleActivation = defineProbe({
  id: 'arvn-module-activation',
  game: 'fire-in-the-lake',
  profile: 'arvn-evolved',
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
      kind: 'moduleActiveContributionRateAtLeast',
      module: 'arvnPursueProjectedMargin',
      traceLabel: 'ARVN pursue projected margin',
      minActiveRate: 0.10,
      minNonZeroContributionRate: 0.10,
      windowMinDecisions: 100,
    },
  ],
  severity: 'profileQuality',
  tags: ['arvn-evolved', 'strategy-modules', 'spec-182-phase-2'],
});

// Calibration source:
// - Current 2026-05-18 harness window reuses the Spec 181 ARVN replay samples
//   and only requires measurable activation/non-zero contribution, so the probe
//   guards module-selector integration without pinning an exact action outcome.
export const probes = [arvnModuleActivation] as const;
