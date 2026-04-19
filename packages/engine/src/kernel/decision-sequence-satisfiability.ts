import {
  deriveCompletionCertificateFingerprint,
  type CompletionCertificate,
  type CompletionCertificateAssignment,
} from './completion-certificate.js';
import { resolveMoveEnumerationBudgets, type MoveEnumerationBudgets } from './move-enumeration-budgets.js';
import { perfCount, type PerfProfiler } from './perf-profiler.js';
import {
  selectChoiceOptionValuesByLegalityPrecedence,
  selectUniqueChoiceOptionValuesByLegalityPrecedence,
} from './choice-option-policy.js';
import {
  propagateChooseNSetVariable,
} from './choose-n-set-variable-propagation.js';
import {
  canonicalizeFingerprintValue,
  stableFingerprintHex,
} from './stable-fingerprint.js';
import type {
  ChoicePendingChooseNRequest,
  ChoicePendingRequest,
  ChoiceRequest,
  GameState,
  Move,
  MoveParamScalar,
  MoveParamValue,
  RuntimeWarning,
} from './types.js';

export type DecisionSequenceSatisfiability =
  | 'satisfiable'
  | 'unsatisfiable'
  | 'unknown'
  | 'explicitStochastic';

export interface DecisionSequenceSatisfiabilityResult {
  readonly classification: DecisionSequenceSatisfiability;
  readonly warnings: readonly RuntimeWarning[];
  readonly certificate?: CompletionCertificate;
}

export interface DecisionSequenceSatisfiabilityOptions {
  readonly budgets?: Partial<MoveEnumerationBudgets>;
  readonly onWarning?: (warning: RuntimeWarning) => void;
  readonly orderSelections?: (request: ChoicePendingRequest, selectableValues: readonly MoveParamValue[]) => readonly MoveParamValue[];
  readonly emitCompletionCertificate?: boolean;
  readonly certificateFingerprintStateHash?: GameState['stateHash'];
  readonly validateSatisfiedMove?: (move: Move) => boolean;
  readonly profiler?: PerfProfiler;
}

export type DecisionSequenceChoiceDiscoverer = (
  move: Move,
  options?: {
    readonly onDeferredPredicatesEvaluated?: (count: number) => void;
  },
) => ChoiceRequest;

interface SearchOutcome {
  readonly classification: DecisionSequenceSatisfiability;
  readonly assignments: readonly CompletionCertificateAssignment[];
}

const EMPTY_ASSIGNMENTS: readonly CompletionCertificateAssignment[] = [];

const collectSelectableOptionValues = (request: ChoicePendingRequest): readonly MoveParamValue[] => {
  if (request.type === 'chooseOne') {
    return selectChoiceOptionValuesByLegalityPrecedence(request);
  }
  return selectUniqueChoiceOptionValuesByLegalityPrecedence(request);
};

const hashCanonical = (value: unknown): string =>
  stableFingerprintHex('decision-sequence-satisfiability-v1', value);

const normalizeMoveBinding = (move: Move): string => canonicalizeFingerprintValue({
  params: Object.fromEntries(
    Object.entries(move.params).sort(([left], [right]) => left.localeCompare(right)),
  ),
  compoundSpecialActivityParams: move.compound?.specialActivity?.params === undefined
    ? undefined
    : Object.fromEntries(
      Object.entries(move.compound.specialActivity.params).sort(([left], [right]) => left.localeCompare(right)),
    ),
});

const createPendingRequestFingerprint = (request: ChoicePendingRequest): string =>
  hashCanonical({
    type: request.type,
    decisionKey: String(request.decisionKey),
    decisionPath: request.decisionPath ?? 'main',
    min: request.type === 'chooseN' ? request.min ?? 0 : undefined,
    max: request.type === 'chooseN' ? request.max ?? request.options.length : undefined,
    selected: request.type === 'chooseN' ? request.selected : undefined,
    options: request.options.map((option) => ({
      value: option.value,
      legality: option.legality,
      resolution: option.resolution,
      illegalReason: option.illegalReason,
    })),
  });

const createMemoKey = (
  move: Move,
  request: ChoicePendingRequest,
): string => `${String(move.actionId)}:${normalizeMoveBinding(move)}:${createPendingRequestFingerprint(request)}`;

const assignDecisionSelection = (
  move: Move,
  request: ChoicePendingRequest,
  selection: MoveParamValue,
): Move => {
  if (request.decisionPath === 'compound.specialActivity') {
    if (move.compound === undefined) {
      throw new Error('assignDecisionSelection requires compound move payload for compound.specialActivity requests');
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

const selectionAssignment = (
  request: ChoicePendingRequest,
  selection: MoveParamValue,
): CompletionCertificateAssignment => ({
  decisionKey: request.decisionKey,
  requestType: request.type,
  value: selection,
});

const MAX_SMALL_EXACT_CHOOSEN_COMBINATIONS = 64;

const collectDeterministicSingletonSelections = (
  request: ChoicePendingChooseNRequest,
  orderSelections: DecisionSequenceSatisfiabilityOptions['orderSelections'],
): readonly (readonly MoveParamScalar[])[] => {
  const ordered = orderSelections?.(request, collectSelectableOptionValues(request)) ?? collectSelectableOptionValues(request);
  const singletons: Array<readonly MoveParamScalar[]> = [];
  const seen = new Set<string>();
  for (const value of ordered) {
    if (Array.isArray(value)) {
      continue;
    }
    const scalarValue = value as MoveParamScalar;
    const selection = [scalarValue] as const;
    const key = canonicalizeFingerprintValue(selection);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    singletons.push(selection);
  }
  return singletons;
};

const collectOrderedChooseNResidualOptions = (
  request: ChoicePendingChooseNRequest,
  orderSelections: DecisionSequenceSatisfiabilityOptions['orderSelections'],
): readonly MoveParamScalar[] => {
  const ordered = orderSelections?.(request, collectSelectableOptionValues(request)) ?? collectSelectableOptionValues(request);
  const selectedKeys = new Set(request.selected.map((value) => canonicalizeFingerprintValue(value)));
  const residual: MoveParamScalar[] = [];
  const seen = new Set<string>();
  for (const value of ordered) {
    if (Array.isArray(value)) {
      continue;
    }
    const scalarValue = value as MoveParamScalar;
    const key = canonicalizeFingerprintValue(scalarValue);
    if (selectedKeys.has(key) || seen.has(key)) {
      continue;
    }
    seen.add(key);
    residual.push(scalarValue);
  }
  return residual;
};

const countCombinationsWithinLimit = (
  n: number,
  k: number,
  limit: number,
): number => {
  if (k < 0 || k > n) {
    return 0;
  }
  if (k === 0 || k === n) {
    return 1;
  }
  const reducedK = Math.min(k, n - k);
  let count = 1;
  for (let i = 1; i <= reducedK; i += 1) {
    count = (count * (n - reducedK + i)) / i;
    if (!Number.isSafeInteger(count) || count > limit) {
      return limit + 1;
    }
  }
  return count;
};

const collectSmallExactChooseNSelections = (
  request: ChoicePendingChooseNRequest,
  orderSelections: DecisionSequenceSatisfiabilityOptions['orderSelections'],
): readonly (readonly MoveParamScalar[])[] | null => {
  const min = request.min ?? 0;
  const max = request.max ?? request.options.length;
  if (min !== max) {
    return null;
  }
  const additionsNeeded = min - request.selected.length;
  if (additionsNeeded < 0) {
    return [];
  }

  const residual = collectOrderedChooseNResidualOptions(request, orderSelections);
  if (request.selected.length > max || request.selected.length + residual.length < min) {
    return [];
  }
  if (additionsNeeded === 0) {
    return [request.selected];
  }

  const combinationCount = countCombinationsWithinLimit(
    residual.length,
    additionsNeeded,
    MAX_SMALL_EXACT_CHOOSEN_COMBINATIONS,
  );
  if (combinationCount === 0) {
    return [];
  }
  if (combinationCount > MAX_SMALL_EXACT_CHOOSEN_COMBINATIONS) {
    return null;
  }

  const selections: Array<readonly MoveParamScalar[]> = [];
  const walk = (
    startIndex: number,
    chosen: readonly MoveParamScalar[],
  ): void => {
    if (chosen.length === additionsNeeded) {
      selections.push([...request.selected, ...chosen]);
      return;
    }
    for (let index = startIndex; index < residual.length; index += 1) {
      const next = residual[index];
      if (next === undefined) {
        continue;
      }
      walk(index + 1, [...chosen, next]);
    }
  };
  walk(0, []);
  return selections;
};

const collectDeterministicChooseNWitnessSelections = (
  request: ChoicePendingChooseNRequest,
  orderSelections: DecisionSequenceSatisfiabilityOptions['orderSelections'],
): readonly (readonly MoveParamScalar[])[] => {
  const min = request.min ?? 0;
  const max = request.max ?? request.options.length;
  const additionsNeeded = min - request.selected.length;
  if (additionsNeeded <= 0) {
    return [];
  }

  const residual = collectOrderedChooseNResidualOptions(request, orderSelections);
  if (
    request.selected.length > max
    || request.selected.length + residual.length < min
    || residual.length < additionsNeeded
  ) {
    return [];
  }

  return [[...request.selected, ...residual.slice(0, additionsNeeded)]];
};

export const classifyDecisionSequenceSatisfiability = (
  baseMove: Move,
  discoverChoices: DecisionSequenceChoiceDiscoverer,
  options?: DecisionSequenceSatisfiabilityOptions,
): DecisionSequenceSatisfiabilityResult => {
  const budgets = resolveMoveEnumerationBudgets(options?.budgets);
  const profiler = options?.profiler;
  const warnings: RuntimeWarning[] = [];
  const memo = new Map<string, SearchOutcome>();
  const nogoods = new Map<string, Set<string>>();
  const requestCache = new Map<string, ChoiceRequest>();
  let decisionProbeSteps = 0;
  let deferredPredicatesEvaluated = 0;
  let paramExpansions = 0;
  let memoHits = 0;
  let nogoodsRecorded = 0;
  let warnedParamBudget = false;
  let warnedStepBudget = false;
  let warnedDeferredBudget = false;

  const emitWarning = (warning: RuntimeWarning): void => {
    warnings.push(warning);
    options?.onWarning?.(warning);
  };

  const unknownFromParamBudget = (): SearchOutcome => {
    if (!warnedParamBudget) {
      warnedParamBudget = true;
      emitWarning({
        code: 'MOVE_ENUM_PARAM_EXPANSION_BUDGET_EXCEEDED',
        message: 'Move decision probing exceeded maxParamExpansions budget; satisfiability classified as unknown.',
        context: {
          actionId: String(baseMove.actionId),
          maxParamExpansions: budgets.maxParamExpansions,
          paramExpansions,
        },
      });
    }
    return { classification: 'unknown', assignments: EMPTY_ASSIGNMENTS };
  };

  const unknownFromDecisionBudget = (): SearchOutcome => {
    if (!warnedStepBudget) {
      warnedStepBudget = true;
      emitWarning({
        code: 'MOVE_ENUM_DECISION_PROBE_STEP_BUDGET_EXCEEDED',
        message: 'Move decision probing exceeded maxDecisionProbeSteps budget; satisfiability classified as unknown.',
        context: {
          actionId: String(baseMove.actionId),
          maxDecisionProbeSteps: budgets.maxDecisionProbeSteps,
        },
      });
    }
    return { classification: 'unknown', assignments: EMPTY_ASSIGNMENTS };
  };

  const unknownFromDeferredBudget = (): SearchOutcome => {
    if (!warnedDeferredBudget) {
      warnedDeferredBudget = true;
      emitWarning({
        code: 'MOVE_ENUM_DEFERRED_PREDICATE_BUDGET_EXCEEDED',
        message: 'Move decision probing exceeded maxDeferredPredicates budget; satisfiability classified as unknown.',
        context: {
          actionId: String(baseMove.actionId),
          maxDeferredPredicates: budgets.maxDeferredPredicates,
          deferredPredicatesEvaluated,
        },
      });
    }
    return { classification: 'unknown', assignments: EMPTY_ASSIGNMENTS };
  };

  const discoverRequest = (move: Move): ChoiceRequest | SearchOutcome => {
    const bindingKey = normalizeMoveBinding(move);
    const cached = requestCache.get(bindingKey);
    if (cached !== undefined) {
      return cached;
    }
    if (decisionProbeSteps >= budgets.maxDecisionProbeSteps) {
      return unknownFromDecisionBudget();
    }

    decisionProbeSteps += 1;
    perfCount(profiler, 'decisionSequenceSatisfiability:probeStep');
    const request = discoverChoices(move, {
      onDeferredPredicatesEvaluated: (count) => {
        deferredPredicatesEvaluated += count;
      },
    });
    if (deferredPredicatesEvaluated > budgets.maxDeferredPredicates) {
      return unknownFromDeferredBudget();
    }
    requestCache.set(bindingKey, request);
    return request;
  };

  const search = (move: Move): SearchOutcome => {
    const discovered = discoverRequest(move);
    if ('classification' in discovered) {
      return discovered;
    }
    const request = discovered;
    if (request.kind === 'complete') {
      if (options?.validateSatisfiedMove !== undefined && !options.validateSatisfiedMove(move)) {
        return { classification: 'unsatisfiable', assignments: EMPTY_ASSIGNMENTS };
      }
      return { classification: 'satisfiable', assignments: EMPTY_ASSIGNMENTS };
    }
    if (request.kind === 'illegal') {
      return { classification: 'unsatisfiable', assignments: EMPTY_ASSIGNMENTS };
    }
    if (request.kind === 'pendingStochastic') {
      return { classification: 'explicitStochastic', assignments: EMPTY_ASSIGNMENTS };
    }

    const memoKey = createMemoKey(move, request);
    const cached = memo.get(memoKey);
    if (cached !== undefined) {
      memoHits += 1;
      return cached;
    }

    const knownNogoods = nogoods.get(memoKey) ?? new Set<string>();
    if (request.type === 'chooseN' && request.selected.length === 0 && (request.min ?? 0) <= 1) {
      for (const selection of collectDeterministicSingletonSelections(request, options?.orderSelections)) {
        const selectionKey = canonicalizeFingerprintValue(selection);
        if (knownNogoods.has(selectionKey)) {
          continue;
        }
        paramExpansions += 1;
        if (paramExpansions > budgets.maxParamExpansions) {
          const outcome = unknownFromParamBudget();
          memo.set(memoKey, outcome);
          return outcome;
        }
        const branchMove = assignDecisionSelection(move, request, selection);
        const branch = search(branchMove);
        if (branch.classification === 'satisfiable' || branch.classification === 'explicitStochastic') {
          const outcome: SearchOutcome = {
            classification: branch.classification,
            assignments: [
              selectionAssignment(request, selection),
              ...branch.assignments,
            ],
          };
          memo.set(memoKey, outcome);
          return outcome;
        }
        if (branch.classification === 'unsatisfiable' && !knownNogoods.has(selectionKey)) {
          knownNogoods.add(selectionKey);
          nogoods.set(memoKey, knownNogoods);
          nogoodsRecorded += 1;
        }
      }
    }
    if (request.type === 'chooseN') {
      for (const selection of collectDeterministicChooseNWitnessSelections(request, options?.orderSelections)) {
        const selectionKey = canonicalizeFingerprintValue(selection);
        if (knownNogoods.has(selectionKey)) {
          continue;
        }
        paramExpansions += 1;
        if (paramExpansions > budgets.maxParamExpansions) {
          const outcome = unknownFromParamBudget();
          memo.set(memoKey, outcome);
          return outcome;
        }
        const branchMove = assignDecisionSelection(move, request, selection);
        const branch = search(branchMove);
        if (branch.classification === 'satisfiable' || branch.classification === 'explicitStochastic') {
          const outcome: SearchOutcome = {
            classification: branch.classification,
            assignments: [
              selectionAssignment(request, selection),
              ...branch.assignments,
            ],
          };
          memo.set(memoKey, outcome);
          return outcome;
        }
        if (branch.classification === 'unsatisfiable' && !knownNogoods.has(selectionKey)) {
          knownNogoods.add(selectionKey);
          nogoods.set(memoKey, knownNogoods);
          nogoodsRecorded += 1;
        }
      }
    }

    const candidateSelections = (() => {
      if (request.type === 'chooseOne') {
        return options?.orderSelections?.(request, collectSelectableOptionValues(request)) ?? collectSelectableOptionValues(request);
      }
      const exactSelections = collectSmallExactChooseNSelections(
        request as ChoicePendingChooseNRequest,
        options?.orderSelections,
      );
      if (exactSelections !== null) {
        return exactSelections;
      }
      const propagation = propagateChooseNSetVariable(
        request as ChoicePendingChooseNRequest,
        move,
        {
          budgets,
          evaluateProbeMove: (probeMove) => {
            const bindingKey = normalizeMoveBinding(probeMove);
            const cachedRequest = requestCache.get(bindingKey);
            if (cachedRequest !== undefined) {
              return cachedRequest;
            }
            const probed = discoverChoices(probeMove, {
              onDeferredPredicatesEvaluated: (count) => {
                deferredPredicatesEvaluated += count;
              },
            });
            requestCache.set(bindingKey, probed);
            return probed;
          },
          classifyProbeMoveSatisfiability: (probeMove) => search(probeMove).classification,
        },
      );
      if (propagation.kind === 'unsat') {
        return propagation;
      }
      if (propagation.kind === 'determined') {
        return [propagation.selection] as const;
      }
      return propagation.candidateSelections;
    })();

    if (!Array.isArray(candidateSelections)) {
      const outcome: SearchOutcome = { classification: 'unsatisfiable', assignments: EMPTY_ASSIGNMENTS };
      memo.set(memoKey, outcome);
      return outcome;
    }

    let branchUnknown = false;
    for (const selection of candidateSelections) {
      const selectionKey = canonicalizeFingerprintValue(selection);
      if (knownNogoods.has(selectionKey)) {
        continue;
      }
      paramExpansions += 1;
      if (paramExpansions > budgets.maxParamExpansions) {
        const outcome = unknownFromParamBudget();
        memo.set(memoKey, outcome);
        return outcome;
      }
      const branchMove = assignDecisionSelection(move, request, selection);
      const branch = search(branchMove);
      if (branch.classification === 'satisfiable' || branch.classification === 'explicitStochastic') {
        const outcome: SearchOutcome = {
          classification: branch.classification,
          assignments: [
            selectionAssignment(request, selection),
            ...branch.assignments,
          ],
        };
        memo.set(memoKey, outcome);
        return outcome;
      }
      if (branch.classification === 'unknown') {
        branchUnknown = true;
        continue;
      }

      if (!knownNogoods.has(selectionKey)) {
        knownNogoods.add(selectionKey);
        nogoods.set(memoKey, knownNogoods);
        nogoodsRecorded += 1;
      }
    }

    const outcome: SearchOutcome = {
      classification: branchUnknown ? 'unknown' : 'unsatisfiable',
      assignments: EMPTY_ASSIGNMENTS,
    };
    memo.set(memoKey, outcome);
    return outcome;
  };

  const outcome = search(baseMove);
  let result: DecisionSequenceSatisfiabilityResult = {
    classification: outcome.classification,
    warnings,
  };

  if (
    options?.emitCompletionCertificate === true
    && options.certificateFingerprintStateHash !== undefined
    && outcome.assignments.length > 0
    && (outcome.classification === 'satisfiable' || outcome.classification === 'explicitStochastic')
  ) {
    result = {
      ...result,
      certificate: {
        assignments: outcome.assignments,
        fingerprint: deriveCompletionCertificateFingerprint({
          stateHash: options.certificateFingerprintStateHash,
          actionId: baseMove.actionId,
          baseParams: baseMove.params,
          assignments: outcome.assignments,
        }),
        diagnostics: {
          probeStepsConsumed: decisionProbeSteps,
          paramExpansionsConsumed: paramExpansions,
          memoHits,
          nogoodsRecorded,
        },
      },
    };
  }

  return result;
};
