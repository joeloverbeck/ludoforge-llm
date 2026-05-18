import { defineProbe } from '../define-probe.js';

export const everyPublishedCandidateIsConstructible = defineProbe({
  id: 'every-published-candidate-is-constructible',
  game: 'texas-holdem',
  profile: 'default',
  seat: '0',
  stateBinding: {
    scenario: 'default',
    seedRange: { start: 2000, end: 2009 },
  },
  decisionBinding: {
    contextKind: 'actionSelection',
    occurrence: 'every',
  },
  assertions: [
    {
      kind: 'publishedFrontierConstructible',
    },
  ],
  severity: 'architecturalInvariant',
  tags: ['constructibility', 'foundation-18', 'arch-invariant'],
});

export const probes = [everyPublishedCandidateIsConstructible] as const;
