export type BooleanArityOperator = 'and' | 'or';

export type BooleanArityDomain = 'condition' | 'tokenFilter';

const BOOLEAN_ARITY_NOUN: Readonly<Record<BooleanArityDomain, string>> = {
  condition: 'condition argument',
  tokenFilter: 'expression argument',
};

const BOOLEAN_ARITY_SUGGESTION: Readonly<Record<BooleanArityDomain, string>> = {
  condition: 'Provide at least one condition in args.',
  tokenFilter: 'Provide one or more token filter expression arguments.',
};

export const isNonEmptyArray = <T>(value: readonly T[]): value is readonly [T, ...T[]] => value.length > 0;

export const booleanArityMessage = (domain: BooleanArityDomain, op: BooleanArityOperator): string =>
  `${domain === 'condition' ? 'Condition' : 'Token filter'} operator "${op}" requires at least one ${BOOLEAN_ARITY_NOUN[domain]}.`;

export const booleanAritySuggestion = (domain: BooleanArityDomain): string => BOOLEAN_ARITY_SUGGESTION[domain];
