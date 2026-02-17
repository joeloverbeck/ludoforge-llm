import type { ChoiceTargetKind, OptionsQuery } from './types.js';

const ORDERED_TARGET_KINDS: readonly ChoiceTargetKind[] = ['zone', 'token'];

const appendKindsFromQuery = (query: OptionsQuery, output: Set<ChoiceTargetKind>): void => {
  switch (query.query) {
    case 'concat':
      query.sources.forEach((source) => appendKindsFromQuery(source, output));
      return;
    case 'nextInOrderByCondition':
      appendKindsFromQuery(query.source, output);
      return;
    case 'zones':
    case 'adjacentZones':
    case 'connectedZones':
      output.add('zone');
      return;
    case 'tokensInZone':
    case 'tokensInAdjacentZones':
    case 'tokensInMapSpaces':
      output.add('token');
      return;
    default:
      return;
  }
};

export const deriveChoiceTargetKinds = (query: OptionsQuery): readonly ChoiceTargetKind[] => {
  const targetKinds = new Set<ChoiceTargetKind>();
  appendKindsFromQuery(query, targetKinds);
  return ORDERED_TARGET_KINDS.filter((kind) => targetKinds.has(kind));
};
