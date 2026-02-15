const formatListWithOr = (values: readonly string[]): string => {
  if (values.length === 0) {
    return '';
  }
  if (values.length === 1) {
    return values[0] ?? '';
  }
  if (values.length === 2) {
    return `${values[0] ?? ''} or ${values[1] ?? ''}`;
  }
  return `${values.slice(0, -1).join(', ')}, or ${values[values.length - 1] ?? ''}`;
};

const buildSuggestion = (prefix: string, tokens: readonly string[]): string => `${prefix}${formatListWithOr(tokens)}.`;

export const CANONICAL_PLAYER_SELECTOR_TOKENS = Object.freeze([
  'actor',
  'active',
  'all',
  'allOther',
  'left',
  'right',
  '<playerId>',
  '$binding',
] as const);

export const CANONICAL_ACTION_EXECUTOR_SELECTOR_TOKENS = Object.freeze([
  'actor',
  'active',
  'left',
  'right',
  '<playerId>',
  '$binding',
] as const);

export const CANONICAL_ZONE_OWNER_QUALIFIER_TOKENS = Object.freeze([
  'none',
  'all',
  'actor',
  'active',
  'allOther',
  'left',
  'right',
  '<playerId>',
  '$binding',
] as const);

export const PLAYER_SELECTOR_SUGGESTION = buildSuggestion('Use one of: ', CANONICAL_PLAYER_SELECTOR_TOKENS);
export const ACTION_EXECUTOR_SELECTOR_SUGGESTION = buildSuggestion('Use one of: ', CANONICAL_ACTION_EXECUTOR_SELECTOR_TOKENS);
export const ZONE_OWNER_QUALIFIER_SUGGESTION = buildSuggestion('Use ', CANONICAL_ZONE_OWNER_QUALIFIER_TOKENS);
