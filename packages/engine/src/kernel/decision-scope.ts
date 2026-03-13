export type DecisionKey = string & { readonly __brand: 'DecisionKey' };

export interface DecisionScope {
  readonly iterationPath: string;
  readonly counters: Readonly<Record<string, number>>;
}

export interface ScopeAdvanceResult {
  readonly scope: DecisionScope;
  readonly key: DecisionKey;
  readonly occurrence: number;
}

export interface ParsedDecisionKey {
  readonly baseId: string;
  readonly resolvedBind: string;
  readonly iterationPath: string;
  readonly occurrence: number;
}

const OCCURRENCE_PATTERN = /#([1-9]\d*)$/u;
const ITERATION_PATH_PATTERN = /(?:\[\d+\])*$/u;

const toDecisionKey = (value: string): DecisionKey => value as DecisionKey;

const splitDecisionBase = (base: string): { readonly baseId: string; readonly resolvedBind: string } => {
  const separatorIndex = base.indexOf('::');
  if (separatorIndex < 0) {
    return {
      baseId: base,
      resolvedBind: base,
    };
  }

  return {
    baseId: base.slice(0, separatorIndex),
    resolvedBind: base.slice(separatorIndex + 2),
  };
};

export const emptyScope = (): DecisionScope => ({
  iterationPath: '',
  counters: {},
});

export const withIterationSegment = (scope: DecisionScope, index: number): DecisionScope => ({
  iterationPath: `${scope.iterationPath}[${index}]`,
  counters: scope.counters,
});

export const rebaseIterationPath = (scope: DecisionScope, iterationPath: string): DecisionScope => ({
  iterationPath,
  counters: scope.counters,
});

export const formatDecisionKey = (
  internalDecisionId: string,
  resolvedBind: string,
  iterationPath: string,
  occurrence: number,
): DecisionKey => {
  const base = (() => {
    if (internalDecisionId === resolvedBind) {
      return `${resolvedBind}${iterationPath}`;
    }
    if (internalDecisionId === `decision:${resolvedBind}`) {
      return `${resolvedBind}${iterationPath}`;
    }
    if (internalDecisionId.endsWith(`::${resolvedBind}`)) {
      return `${internalDecisionId}${iterationPath}`;
    }
    return `${internalDecisionId}::${resolvedBind}${iterationPath}`;
  })();
  const occurrenceSuffix = occurrence > 1 ? `#${occurrence}` : '';
  return toDecisionKey(`${base}${occurrenceSuffix}`);
};

export const parseDecisionKey = (key: DecisionKey): ParsedDecisionKey | null => {
  const rawKey = key as string;
  const occurrenceMatch = rawKey.match(OCCURRENCE_PATTERN);
  const occurrenceSuffix = occurrenceMatch?.[1];
  const occurrence = occurrenceSuffix === undefined ? 1 : Number.parseInt(occurrenceSuffix, 10);
  const withoutOccurrence = occurrenceMatch === null
    ? rawKey
    : rawKey.slice(0, rawKey.length - occurrenceMatch[0].length);
  const iterationPathMatch = withoutOccurrence.match(ITERATION_PATH_PATTERN);
  const iterationPath = iterationPathMatch?.[0] ?? '';
  const base = withoutOccurrence.slice(0, withoutOccurrence.length - iterationPath.length);
  if (base.length === 0) {
    return null;
  }

  const { baseId, resolvedBind } = splitDecisionBase(base);
  if (baseId.length === 0 || resolvedBind.length === 0) {
    return null;
  }

  return {
    baseId,
    resolvedBind,
    iterationPath,
    occurrence,
  };
};

export const advanceScope = (
  scope: DecisionScope,
  internalDecisionId: string,
  resolvedBind: string,
): ScopeAdvanceResult => {
  const baseKey = formatDecisionKey(internalDecisionId, resolvedBind, scope.iterationPath, 1) as string;
  const occurrence = (scope.counters[baseKey] ?? 0) + 1;

  return {
    scope: {
      iterationPath: scope.iterationPath,
      counters: {
        ...scope.counters,
        [baseKey]: occurrence,
      },
    },
    key: formatDecisionKey(internalDecisionId, resolvedBind, scope.iterationPath, occurrence),
    occurrence,
  };
};
