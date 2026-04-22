import {
  runSingletonProbePass,
  runWitnessSearch,
  type ChooseNDiagnosticsAccumulator,
  type WitnessSearchBudget,
  type WitnessSearchTierContext,
} from './choose-n-option-resolution.js';
import type { DecisionSequenceSatisfiability } from './decision-sequence-analysis.js';
import { resolveMoveEnumerationBudgets, type MoveEnumerationBudgets } from './move-enumeration-budgets.js';
import { optionKey } from './legal-choices.js';
import type {
  ChoicePendingChooseNRequest,
  ChoiceRequest,
  Move,
  MoveParamScalar,
} from './types.js';

export type ChooseNPropagationResult =
  | { readonly kind: 'unsat' }
  | { readonly kind: 'determined'; readonly selection: readonly MoveParamScalar[] }
  | { readonly kind: 'branching'; readonly candidateSelections: readonly (readonly MoveParamScalar[])[] };

export interface ChooseNSetVariablePropagationContext {
  readonly evaluateProbeMove: (move: Move) => ChoiceRequest;
  readonly classifyProbeMoveSatisfiability: (move: Move) => DecisionSequenceSatisfiability;
  readonly budgets?: Partial<MoveEnumerationBudgets>;
  readonly diagnostics?: ChooseNDiagnosticsAccumulator;
  readonly tierContext?: WitnessSearchTierContext;
}

type SupportVerdict = 'supported' | 'unsupported' | 'unknown';

const scalarCanonicalKey = (value: MoveParamScalar): string => JSON.stringify([typeof value, value]);

const compareScalarsCanonical = (left: MoveParamScalar, right: MoveParamScalar): number =>
  scalarCanonicalKey(left).localeCompare(scalarCanonicalKey(right));

const sortCanonicalSelection = (
  selection: readonly MoveParamScalar[],
): readonly MoveParamScalar[] => [...selection].sort(compareScalarsCanonical);

const dedupeCanonicalSelection = (
  selection: readonly MoveParamScalar[],
): readonly MoveParamScalar[] => {
  const unique = new Map<string, MoveParamScalar>();
  for (const value of selection) {
    unique.set(optionKey(value), value);
  }
  return [...unique.values()].sort(compareScalarsCanonical);
};

const setDecisionSelection = (
  move: Move,
  request: ChoicePendingChooseNRequest,
  selection: readonly MoveParamScalar[],
): Move => {
  if (request.decisionPath === 'compound.specialActivity') {
    if (move.compound === undefined) {
      throw new Error('setDecisionSelection requires compound move payload for compound.specialActivity requests');
    }
    return {
      ...move,
      compound: {
        ...move.compound,
        specialActivity: {
          ...move.compound.specialActivity,
          params: {
            ...move.compound.specialActivity.params,
            [request.decisionKey]: selection,
          },
        },
      },
    };
  }

  return {
    ...move,
    params: {
      ...move.params,
      [request.decisionKey]: selection,
    },
  };
};

const collectResidualOptions = (
  request: ChoicePendingChooseNRequest,
): readonly MoveParamScalar[] => {
  const selectedKeys = new Set(request.selected.map((value) => optionKey(value)));
  const unique = new Map<string, MoveParamScalar>();
  for (const option of request.options) {
    const value = option.value;
    if (Array.isArray(value)) {
      continue;
    }
    const scalarValue = value as MoveParamScalar;
    const key = optionKey(scalarValue);
    if (selectedKeys.has(key) || unique.has(key)) {
      continue;
    }
    unique.set(key, scalarValue);
  }
  return [...unique.values()].sort(compareScalarsCanonical);
};

const directSelectionSupport = (
  request: ChoicePendingChooseNRequest,
  move: Move,
  ctx: ChooseNSetVariablePropagationContext,
): SupportVerdict => {
  const probeMove = setDecisionSelection(move, request, sortCanonicalSelection(request.selected));
  const probed = ctx.evaluateProbeMove(probeMove);
  if (probed.kind === 'complete') {
    return 'supported';
  }
  if (probed.kind === 'illegal' || probed.kind === 'pendingStochastic') {
    return 'unsupported';
  }

  const classification = ctx.classifyProbeMoveSatisfiability(probeMove);
  if (classification === 'satisfiable') {
    return 'supported';
  }
  if (classification === 'unsatisfiable') {
    return 'unsupported';
  }
  return 'unknown';
};

const withSelectionChange = (
  request: ChoicePendingChooseNRequest,
  nextSelected: readonly MoveParamScalar[],
  excludedKeys: ReadonlySet<string>,
): ChoicePendingChooseNRequest => ({
  ...request,
  selected: sortCanonicalSelection(nextSelected),
  canConfirm: nextSelected.length >= (request.min ?? 0),
  options: request.options.filter((option) => {
    const value = option.value;
    return !Array.isArray(value) && !excludedKeys.has(optionKey(value));
  }),
});

const buildForcedIncludeRequest = (
  request: ChoicePendingChooseNRequest,
  option: MoveParamScalar,
): ChoicePendingChooseNRequest => {
  const nextSelected = dedupeCanonicalSelection([...request.selected, option]);
  return withSelectionChange(request, nextSelected, new Set([optionKey(option)]));
};

const buildForcedExcludeRequest = (
  request: ChoicePendingChooseNRequest,
  option: MoveParamScalar,
): ChoicePendingChooseNRequest =>
  withSelectionChange(request, request.selected, new Set([optionKey(option)]));

const resolveSupportVerdict = (
  request: ChoicePendingChooseNRequest,
  move: Move,
  ctx: ChooseNSetVariablePropagationContext,
): SupportVerdict => {
  const budgets = resolveMoveEnumerationBudgets(ctx.budgets);
  const min = request.min ?? 0;
  const max = request.max ?? request.options.length;
  const residualOptions = collectResidualOptions(request);

  if (request.selected.length > max || request.selected.length + residualOptions.length < min) {
    return 'unsupported';
  }

  if (request.selected.length >= min) {
    const direct = directSelectionSupport(request, move, ctx);
    if (direct !== 'unsupported') {
      return direct;
    }
  }

  if (request.selected.length >= max || residualOptions.length === 0) {
    return 'unsupported';
  }

  const selectedKeys = new Set(request.selected.map((value) => optionKey(value)));
  const budget: WitnessSearchBudget = { remaining: budgets.maxParamExpansions };
  const singletonResults = runSingletonProbePass(
    ctx.evaluateProbeMove,
    ctx.classifyProbeMoveSatisfiability,
    move,
    request,
    residualOptions,
    selectedKeys,
    budget,
    ctx.diagnostics,
  );

  if (singletonResults.some((option) => option.legality === 'legal')) {
    return 'supported';
  }

  const witnessStats = ctx.diagnostics === undefined ? undefined : { cacheHits: 0, nodesVisited: 0 };
  const witnessResults = runWitnessSearch(
    ctx.evaluateProbeMove,
    ctx.classifyProbeMoveSatisfiability,
    move,
    request,
    singletonResults,
    residualOptions,
    selectedKeys,
    budget,
    witnessStats,
    ctx.tierContext,
    ctx.diagnostics,
  );

  if (witnessResults.some((option) => option.legality === 'legal')) {
    return 'supported';
  }
  if (
    witnessResults.some(
      (option) => option.legality === 'unknown' || option.resolution === 'provisional',
    )
  ) {
    return 'unknown';
  }
  return 'unsupported';
};

const buildCandidateSelections = (
  lowerBound: readonly MoveParamScalar[],
  supportedIncludes: readonly MoveParamScalar[],
  min: number,
  max: number,
): readonly (readonly MoveParamScalar[])[] => {
  const candidates = new Map<string, readonly MoveParamScalar[]>();
  if (lowerBound.length >= min && lowerBound.length <= max) {
    const normalized = sortCanonicalSelection(lowerBound);
    candidates.set(JSON.stringify(normalized), normalized);
  }

  const additionsNeeded = lowerBound.length >= min ? 1 : min - lowerBound.length;
  if (additionsNeeded <= 0) {
    return [...candidates.values()];
  }

  const enumerate = (
    start: number,
    current: readonly MoveParamScalar[],
  ): void => {
    if (current.length === additionsNeeded) {
      const normalized = dedupeCanonicalSelection([...lowerBound, ...current]);
      if (normalized.length >= min && normalized.length <= max) {
        candidates.set(JSON.stringify(normalized), normalized);
      }
      return;
    }

    for (let index = start; index < supportedIncludes.length; index += 1) {
      const next = supportedIncludes[index];
      if (next === undefined) {
        continue;
      }
      enumerate(index + 1, [...current, next]);
    }
  };

  if (lowerBound.length + additionsNeeded > max) {
    return [...candidates.values()];
  }

  enumerate(0, []);
  return [...candidates.values()];
};

export const propagateChooseNSetVariable = (
  request: ChoicePendingChooseNRequest,
  move: Move,
  ctx: ChooseNSetVariablePropagationContext,
): ChooseNPropagationResult => {
  const min = request.min ?? 0;
  const max = request.max ?? request.options.length;
  const residualOptions = collectResidualOptions(request);
  const lowerBound = [...dedupeCanonicalSelection(request.selected)];
  const normalizedLowerBound = dedupeCanonicalSelection(lowerBound);
  const immediateUpperBound = dedupeCanonicalSelection([
    ...normalizedLowerBound,
    ...residualOptions,
  ]);

  if (normalizedLowerBound.length > max || normalizedLowerBound.length + residualOptions.length < min) {
    return { kind: 'unsat' };
  }
  if (normalizedLowerBound.length === max) {
    return { kind: 'determined', selection: normalizedLowerBound };
  }
  if (immediateUpperBound.length === min) {
    return { kind: 'determined', selection: immediateUpperBound };
  }

  const supportedIncludes: MoveParamScalar[] = [];
  const upperBoundKeys = new Set(lowerBound.map((value) => optionKey(value)));

  for (const value of residualOptions) {
    const includeVerdict = resolveSupportVerdict(buildForcedIncludeRequest(request, value), move, ctx);
    const excludeVerdict = resolveSupportVerdict(buildForcedExcludeRequest(request, value), move, ctx);

    if (includeVerdict !== 'unsupported') {
      upperBoundKeys.add(optionKey(value));
      supportedIncludes.push(value);
    }
    if (excludeVerdict === 'unsupported') {
      lowerBound.push(value);
      upperBoundKeys.add(optionKey(value));
    }
  }

  const normalizedUpperBound = dedupeCanonicalSelection([
    ...normalizedLowerBound,
    ...residualOptions.filter((value) => upperBoundKeys.has(optionKey(value))),
  ]);

  if (normalizedLowerBound.length > max || normalizedLowerBound.length + residualOptions.length < min) {
    return { kind: 'unsat' };
  }
  if (normalizedLowerBound.length === max) {
    return { kind: 'determined', selection: normalizedLowerBound };
  }
  if (normalizedUpperBound.length === min) {
    return { kind: 'determined', selection: normalizedUpperBound };
  }

  const candidateSelections = buildCandidateSelections(
    normalizedLowerBound,
    [...(supportedIncludes.length === 0 ? residualOptions : supportedIncludes)].sort(compareScalarsCanonical),
    min,
    max,
  );
  if (candidateSelections.length === 0) {
    return { kind: 'unsat' };
  }
  if (candidateSelections.length === 1) {
    return { kind: 'determined', selection: candidateSelections[0]! };
  }
  return { kind: 'branching', candidateSelections };
};
