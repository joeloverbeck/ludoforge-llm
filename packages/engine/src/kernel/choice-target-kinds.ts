import type { ChoiceTargetKind, OptionsQuery } from './types.js';
import { inferQueryDomainKinds } from './query-domain-kinds.js';

const ORDERED_TARGET_KINDS: readonly ChoiceTargetKind[] = ['zone', 'token'];

export const deriveChoiceTargetKinds = (query: OptionsQuery): readonly ChoiceTargetKind[] => {
  const queryDomains = inferQueryDomainKinds(query);
  const targetKinds = new Set<ChoiceTargetKind>();
  if (queryDomains.has('zone')) {
    targetKinds.add('zone');
  }
  if (queryDomains.has('token')) {
    targetKinds.add('token');
  }
  return ORDERED_TARGET_KINDS.filter((kind) => targetKinds.has(kind));
};
