import type { Move, MoveParamValue } from './types.js';

export interface DecisionOccurrenceContext {
  readonly byDecisionId: Map<string, number>;
  readonly byName: Map<string, number>;
}

export interface DecisionOccurrence {
  readonly decisionId: string;
  readonly name: string;
  readonly decisionIndex: number;
  readonly decisionOccurrenceKey: string;
  readonly nameIndex: number;
  readonly nameOccurrenceKey: string;
  readonly canonicalAlias: string | null;
  readonly canonicalAliasIndex: number | null;
  readonly canonicalAliasOccurrenceKey: string | null;
}

const nextOccurrence = (map: Map<string, number>, key: string): number => {
  const next = (map.get(key) ?? 0) + 1;
  map.set(key, next);
  return next;
};

export const deriveCanonicalBindingAlias = (name: string): string | null => {
  if (!name.startsWith('$__')) {
    return null;
  }
  const lastSeparator = name.lastIndexOf('__');
  if (lastSeparator < 0 || lastSeparator + 2 >= name.length) {
    return null;
  }
  const tail = name.slice(lastSeparator + 2);
  const sanitized = tail.startsWith('$') ? tail.slice(1) : tail;
  return sanitized.length > 0 ? `$${sanitized}` : null;
};

export const createDecisionOccurrenceContext = (): DecisionOccurrenceContext => ({
  byDecisionId: new Map<string, number>(),
  byName: new Map<string, number>(),
});

export const cloneDecisionOccurrenceContext = (
  context: DecisionOccurrenceContext,
): DecisionOccurrenceContext => ({
  byDecisionId: new Map<string, number>(context.byDecisionId),
  byName: new Map<string, number>(context.byName),
});

export const decisionOccurrenceKey = (decisionId: string, occurrenceIndex: number): string =>
  `${decisionId}#${occurrenceIndex}`;

export const consumeDecisionOccurrence = (
  context: DecisionOccurrenceContext,
  decisionId: string,
  name: string,
): DecisionOccurrence => {
  const decisionIndex = nextOccurrence(context.byDecisionId, decisionId);
  const nameIndex = nextOccurrence(context.byName, name);
  const canonicalAlias = deriveCanonicalBindingAlias(name);
  const canonicalAliasIndex = canonicalAlias === null ? null : nextOccurrence(context.byName, canonicalAlias);

  return {
    decisionId,
    name,
    decisionIndex,
    decisionOccurrenceKey: decisionOccurrenceKey(decisionId, decisionIndex),
    nameIndex,
    nameOccurrenceKey: decisionOccurrenceKey(name, nameIndex),
    canonicalAlias,
    canonicalAliasIndex,
    canonicalAliasOccurrenceKey: canonicalAlias === null || canonicalAliasIndex === null
      ? null
      : decisionOccurrenceKey(canonicalAlias, canonicalAliasIndex),
  };
};

export const resolveMoveParamForDecisionOccurrence = (
  moveParams: Move['params'],
  occurrence: DecisionOccurrence,
): MoveParamValue | undefined => {
  if (Object.prototype.hasOwnProperty.call(moveParams, occurrence.decisionOccurrenceKey)) {
    return moveParams[occurrence.decisionOccurrenceKey];
  }
  if (Object.prototype.hasOwnProperty.call(moveParams, occurrence.nameOccurrenceKey)) {
    return moveParams[occurrence.nameOccurrenceKey];
  }
  if (
    occurrence.canonicalAliasOccurrenceKey !== null
    && Object.prototype.hasOwnProperty.call(moveParams, occurrence.canonicalAliasOccurrenceKey)
  ) {
    return moveParams[occurrence.canonicalAliasOccurrenceKey];
  }
  if (occurrence.decisionIndex !== 1) {
    return undefined;
  }
  if (Object.prototype.hasOwnProperty.call(moveParams, occurrence.decisionId)) {
    return moveParams[occurrence.decisionId];
  }
  if (Object.prototype.hasOwnProperty.call(moveParams, occurrence.name)) {
    return moveParams[occurrence.name];
  }
  if (
    occurrence.canonicalAlias !== null
    && occurrence.canonicalAliasIndex === 1
    && Object.prototype.hasOwnProperty.call(moveParams, occurrence.canonicalAlias)
  ) {
    return moveParams[occurrence.canonicalAlias];
  }
  return undefined;
};

export const writeMoveParamForDecisionOccurrence = (
  moveParams: Move['params'],
  occurrence: DecisionOccurrence,
  value: MoveParamValue,
): Move['params'] => ({
  ...moveParams,
  ...(occurrence.decisionIndex === 1 ? { [occurrence.decisionId]: value } : {}),
  ...(occurrence.decisionIndex === 1 ? {} : { [occurrence.decisionOccurrenceKey]: value }),
});
