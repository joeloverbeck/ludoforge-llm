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
      kind: 'planRootSelectionExplained',
      windowMinDecisions: 100,
      minPlanSelectedRate: 0.90,
      minAlternativeTemplateCount: 3,
      requiredReadyRoles: ['patrolSpace', 'governSpace'],
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

// Distilled by Spec 208 after the post-Spec-191 trajectory legitimately shifted
// to plan-root Patrol/Govern across this window. The invariant now guards against
// silent plan-template collapse by requiring explicit selected-plan traces,
// multiple viable alternatives, and ready role bindings instead of pinning a
// pre-plan-root action-family distribution.
export const probes = [arvnActionDistributionNotDominated] as const;
