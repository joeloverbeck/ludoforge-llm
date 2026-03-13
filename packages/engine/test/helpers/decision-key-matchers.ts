import {
  parseDecisionKey,
  type ChoicePendingRequest,
  type DecisionKey,
  type MoveParamValue,
  type ParsedDecisionKey,
} from '../../src/kernel/index.js';

export interface DecisionKeyMatch {
  readonly baseId?: string;
  readonly baseIdPattern?: RegExp;
  readonly resolvedBind?: string;
  readonly resolvedBindPattern?: RegExp;
  readonly iterationPath?: string;
  readonly occurrence?: number;
}

export interface DecisionRequestMatch extends DecisionKeyMatch {
  readonly name?: string;
  readonly namePattern?: RegExp;
  readonly type?: ChoicePendingRequest['type'];
}

const matchesPattern = (value: string, pattern?: RegExp): boolean => pattern === undefined || pattern.test(value);

const matchesParsedDecisionKey = (parsed: ParsedDecisionKey, match: DecisionKeyMatch): boolean => {
  if (match.baseId !== undefined && parsed.baseId !== match.baseId) {
    return false;
  }
  if (!matchesPattern(parsed.baseId, match.baseIdPattern)) {
    return false;
  }
  if (match.resolvedBind !== undefined && parsed.resolvedBind !== match.resolvedBind) {
    return false;
  }
  if (!matchesPattern(parsed.resolvedBind, match.resolvedBindPattern)) {
    return false;
  }
  if (match.iterationPath !== undefined && parsed.iterationPath !== match.iterationPath) {
    return false;
  }
  if (match.occurrence !== undefined && parsed.occurrence !== match.occurrence) {
    return false;
  }
  return true;
};

export const matchesDecisionKey = (decisionKey: string, match: DecisionKeyMatch): boolean => {
  const parsed = parseDecisionKey(decisionKey as DecisionKey);
  return parsed !== null && matchesParsedDecisionKey(parsed, match);
};

export const matchesDecisionRequest = (match: DecisionRequestMatch) => (request: ChoicePendingRequest): boolean => {
  if (match.type !== undefined && request.type !== match.type) {
    return false;
  }
  if (match.name !== undefined && request.name !== match.name) {
    return false;
  }
  if (!matchesPattern(request.name, match.namePattern)) {
    return false;
  }
  return matchesDecisionKey(request.decisionKey, match);
};

export const decisionParamEntriesMatching = (
  params: Readonly<Record<string, MoveParamValue>>,
  match: DecisionKeyMatch,
): ReadonlyArray<readonly [string, MoveParamValue]> =>
  Object.entries(params).filter(
    (entry) => matchesDecisionKey(entry[0], match),
  );

export const decisionParamKeysMatching = (
  params: Readonly<Record<string, MoveParamValue>>,
  match: DecisionKeyMatch,
): readonly string[] => decisionParamEntriesMatching(params, match).map(([decisionKey]) => decisionKey);
