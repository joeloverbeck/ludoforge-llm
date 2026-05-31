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
      kind: 'decisionSourceAwareTurnShapeCoverage',
      evaluatorId: 'currentTurnImpact',
      windowMinDecisions: 100,
    },
  ],
  severity: 'profileQuality',
  tags: ['arvn-baseline', 'turn-shape', 'spec-182-phase-4'],
});

// Distilled by Spec 208 after the sampled post-Spec-191 window legitimately
// became plan-root selected. Fallback scalar decisions still must expose
// `currentTurnImpact`; plan-root decisions must expose their decision source
// instead of masquerading as scalar turn-shape evidence.
export const probes = [turnShapeMinimumImpactObserved] as const;
