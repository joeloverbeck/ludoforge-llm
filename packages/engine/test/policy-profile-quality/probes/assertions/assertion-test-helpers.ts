import type { Decision, PolicyAgentDecisionTrace } from '../../../../src/kernel/index.js';
import type { Probe, ProbeMatch, ProbeAssertion } from '../probe-types.js';

export const testProbe = (
  assertion: ProbeAssertion,
  occurrence: Probe['decisionBinding']['occurrence'] = 'first',
): Probe => ({
  id: 'assertion-test-probe',
  game: 'fixture',
  profile: 'default',
  seat: '0',
  stateBinding: {
    scenario: 'default',
    seed: 1,
  },
  decisionBinding: {
    contextKind: 'actionSelection',
    occurrence,
  },
  assertions: [assertion],
  severity: 'profileQuality',
  tags: ['test'],
});

export const actionDecision = (actionId = 'move', params: Readonly<Record<string, unknown>> = {}): Decision => ({
  kind: 'actionSelection',
  actionId: actionId as never,
  move: {
    actionId: actionId as never,
    params: params as never,
  },
});

export const policyTrace = (
  overrides: Partial<PolicyAgentDecisionTrace> = {},
): PolicyAgentDecisionTrace => ({
  kind: 'policy',
  agent: { kind: 'policy', profileId: 'default' },
  seatId: '0',
  requestedProfileId: 'default',
  resolvedProfileId: 'default',
  profileFingerprint: null,
  initialCandidateCount: 1,
  selectedStableMoveKey: 'move:a',
  finalScore: 10,
  pruningSteps: [],
  tieBreakChain: [],
  previewUsage: {
    mode: 'disabled',
    evaluatedCandidateCount: 1,
    completionPolicyFallbackCount: 0,
    refIds: [],
    unknownRefs: [],
    readyRefStats: {},
    utility: 'none',
    widenedBecauseUniform: false,
    coverage: {
      requestedRefCount: 0,
      evaluatedRootOptionCount: 0,
      readyRootOptionCount: 0,
      unavailableRootOptionCount: 0,
      allRootsUnavailable: false,
      selectedByTieBreakerBecausePreviewUnavailable: false,
      strategy: 'singlePass',
      capClass: 'standard256',
    },
  },
  emergencyFallback: false,
  failure: null,
  candidates: [
    {
      actionId: 'move',
      stableMoveKey: 'move:a',
      score: 10,
      prunedBy: [],
      scoreContributions: [],
      previewRefIds: [],
      unknownPreviewRefs: [],
      unknownLookupRefs: [],
      unknownCandidateParamRefs: [],
      selectionReason: 'scored',
    },
  ],
  ...overrides,
});

export const match = (overrides: Partial<ProbeMatch> = {}): ProbeMatch => ({
  seed: 1,
  stateHash: '0x1',
  selectedDecision: actionDecision(),
  selectedActionTags: ['move'],
  trace: policyTrace(),
  contextKind: 'actionSelection',
  decisionKey: null,
  phase: 'main',
  ...overrides,
});
