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

    const candidateSelections = (() => {
      if (request.type === 'chooseOne') {
        return options?.orderSelections?.(request, collectSelectableOptionValues(request)) ?? collectSelectableOptionValues(request);
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

    const knownNogoods = nogoods.get(memoKey) ?? new Set<string>();
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
