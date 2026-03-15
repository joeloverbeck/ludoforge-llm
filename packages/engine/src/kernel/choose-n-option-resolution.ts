/**
 * Singleton probe pass and budgeted witness search for large-domain chooseN
 * option resolution.
 *
 * Singleton pass: iterates each unresolved option individually, probing
 * `[...currentSelected, option]` with the discover-only path.
 *
 * Witness search: for options left unresolved by the singleton pass, performs
 * a bounded depth-first search over subset space to find one confirmable
 * completion witness per option.
 *
 * This module keeps the growing resolver logic out of legal-choices.ts.
 */
import { isEffectRuntimeReason } from './effect-error.js';
import { optionKey, isChoiceDecisionOwnerMismatchDuringProbe } from './legal-choices.js';
import { EFFECT_RUNTIME_REASONS } from './runtime-reasons.js';
import type { DecisionSequenceSatisfiability } from './decision-sequence-satisfiability.js';
import type {
  ChoiceOption,
  ChoicePendingChooseNRequest,
  ChoiceRequest,
  ChooseNOptionResolution,
  Move,
} from './types.js';

// ── Singleton probe outcome types ──────────────────────────────────────

export type SingletonProbeOutcome =
  | { readonly kind: 'illegal'; readonly illegalReason: ChoiceOption['illegalReason'] }
  | { readonly kind: 'confirmable' }
  | { readonly kind: 'unresolved' }
  | { readonly kind: 'stochastic' }
  | { readonly kind: 'ambiguous' };

// ── Budget tracking ────────────────────────────────────────────────────

export interface SingletonProbeBudget {
  remaining: number;
}

// ── Singleton probe classification ─────────────────────────────────────

/**
 * Classify a singleton probe result into a fine-grained outcome.
 *
 * Rules (per spec 4.4):
 * - probe illegal → illegal, exact
 * - probe satisfiable AND confirmable at this size → confirmable (legal, exact)
 * - probe satisfiable but needs further picks → unresolved (witness search candidate)
 * - probe stochastic → stochastic (unknown)
 * - probe ambiguous (owner mismatch) → ambiguous (unknown)
 */
const classifySingletonProbe = (
  probed: ChoiceRequest,
  classification: DecisionSequenceSatisfiability | null,
  originalDecisionKey: string,
): SingletonProbeOutcome => {
  // Illegal: probe failed or future decisions unsatisfiable.
  if (probed.kind === 'illegal' || classification === 'unsatisfiable') {
    return {
      kind: 'illegal',
      illegalReason: probed.kind === 'illegal' ? probed.reason : null,
    };
  }

  // Stochastic: probe hit a stochastic boundary.
  if (probed.kind === 'pendingStochastic') {
    return { kind: 'stochastic' };
  }

  // Complete: the probed selection finishes the entire action.
  if (probed.kind === 'complete') {
    return { kind: 'confirmable' };
  }

  // Pending: check whether the chooseN itself was resolved.
  if (probed.kind === 'pending') {
    // Same chooseN still pending — check canConfirm.
    if (probed.type === 'chooseN' && probed.decisionKey === originalDecisionKey) {
      if (probed.canConfirm) {
        // Selection meets min, can be confirmed — but check future satisfiability.
        if (classification === 'unknown' || classification === null) {
          return { kind: 'unresolved' };
        }
        return { kind: 'confirmable' };
      }
      // Needs more picks.
      return { kind: 'unresolved' };
    }

    // Different decision — the chooseN was resolved.
    // But we need satisfiability of future decisions.
    if (classification === 'unknown' || classification === null) {
      return { kind: 'unresolved' };
    }
    return { kind: 'confirmable' };
  }

  // Fallback: treat as unresolved (conservative).
  return { kind: 'unresolved' };
};

// ── Singleton probe pass ───────────────────────────────────────────────

/**
 * Run a singleton probe pass over all unresolved options in a large-domain chooseN.
 *
 * For each unresolved option, probes `[...currentSelected, option]` using the
 * discover-only path (shouldEvaluateOptionLegality = false). The probe is a
 * satisfiability check, not a request to map nested option legality.
 *
 * Invariants:
 * - Probe count equals number of unresolved options — no combinatorial explosion.
 * - Must NOT mark an option legal unless immediately confirmable at probed size.
 * - Must NOT compute nested option legality.
 * - PreparedContext is shared across all probes (via the callbacks).
 * - Budget is count-based and deterministic.
 */
export const runSingletonProbePass = (
  evaluateProbeMove: (move: Move) => ChoiceRequest,
  classifyProbeMoveSatisfiability: (move: Move) => DecisionSequenceSatisfiability,
  partialMove: Move,
  request: ChoicePendingChooseNRequest,
  uniqueOptions: readonly Move['params'][string][],
  selectedKeys: ReadonlySet<string>,
  budget: SingletonProbeBudget,
): readonly ChoiceOption[] => {
  // Build per-option result map. Start with static results from effects-choice.
  const resultByKey = new Map<
    string,
    { legality: ChoiceOption['legality']; illegalReason: ChoiceOption['illegalReason']; resolution: ChooseNOptionResolution }
  >();

  // Preserve statically-resolved options (already-selected, tier-blocked, etc.).
  for (const option of request.options) {
    const key = optionKey(option.value);
    if (selectedKeys.has(key) || option.legality === 'illegal') {
      resultByKey.set(key, {
        legality: 'illegal',
        illegalReason: option.legality === 'illegal' ? option.illegalReason : null,
        resolution: 'exact',
      });
    }
  }

  // Probe each unresolved option.
  for (const optionValue of uniqueOptions) {
    const key = optionKey(optionValue);
    if (resultByKey.has(key)) {
      continue; // Already resolved statically.
    }

    if (budget.remaining <= 0) {
      // Budget exhausted — mark remaining as provisional.
      resultByKey.set(key, {
        legality: 'unknown',
        illegalReason: null,
        resolution: 'provisional',
      });
      continue;
    }

    budget.remaining -= 1;

    const probeSelection = [...request.selected, optionValue] as Move['params'][string];
    const probeMove: Move = {
      ...partialMove,
      params: {
        ...partialMove.params,
        [request.decisionKey]: probeSelection,
      },
    };

    let probed: ChoiceRequest;
    try {
      probed = evaluateProbeMove(probeMove);
    } catch (error: unknown) {
      if (isChoiceDecisionOwnerMismatchDuringProbe(error)) {
        resultByKey.set(key, {
          legality: 'unknown',
          illegalReason: null,
          resolution: 'ambiguous',
        });
        continue;
      }
      // Cardinality mismatch: probe selection is below min or above max.
      // This means the option is not confirmable at this singleton size → unresolved.
      if (isEffectRuntimeReason(error, EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED)) {
        resultByKey.set(key, {
          legality: 'unknown',
          illegalReason: null,
          resolution: 'provisional',
        });
        continue;
      }
      throw error;
    }

    // Classify future satisfiability only when the probe returns pending.
    let classification: DecisionSequenceSatisfiability | null = null;
    if (probed.kind === 'pending') {
      try {
        classification = classifyProbeMoveSatisfiability(probeMove);
      } catch (error: unknown) {
        if (!isChoiceDecisionOwnerMismatchDuringProbe(error)) {
          throw error;
        }
        classification = 'unknown';
      }
    }

    const outcome = classifySingletonProbe(probed, classification, request.decisionKey);

    switch (outcome.kind) {
      case 'illegal':
        resultByKey.set(key, {
          legality: 'illegal',
          illegalReason: outcome.illegalReason,
          resolution: 'exact',
        });
        break;
      case 'confirmable':
        resultByKey.set(key, {
          legality: 'legal',
          illegalReason: null,
          resolution: 'exact',
        });
        break;
      case 'stochastic':
        resultByKey.set(key, {
          legality: 'unknown',
          illegalReason: null,
          resolution: 'stochastic',
        });
        break;
      case 'ambiguous':
        resultByKey.set(key, {
          legality: 'unknown',
          illegalReason: null,
          resolution: 'ambiguous',
        });
        break;
      case 'unresolved':
        resultByKey.set(key, {
          legality: 'unknown',
          illegalReason: null,
          resolution: 'provisional',
        });
        break;
    }
  }

  // Build final option array preserving original order.
  return request.options.map((option) => {
    const key = optionKey(option.value);
    const result = resultByKey.get(key);
    if (result === undefined) {
      return {
        value: option.value,
        legality: 'unknown' as const,
        illegalReason: null,
        resolution: 'provisional' as const,
      };
    }
    return {
      value: option.value,
      legality: result.legality,
      illegalReason: result.legality === 'legal' ? null : result.illegalReason,
      resolution: result.resolution,
    };
  });
};

// ── Witness search types ──────────────────────────────────────────────

export interface WitnessSearchBudget {
  remaining: number;
}

/** Accumulator for witness search diagnostics (optional, for testing). */
export interface WitnessSearchStats {
  cacheHits: number;
  nodesVisited: number;
}

/** Canonical selection key: sorted option keys joined by '|'. */
const selectionCacheKey = (selection: readonly unknown[]): string =>
  selection.map((v) => optionKey(v)).sort().join('|');

// ── Witness search probe helper ───────────────────────────────────────

/**
 * Probe a concrete selection and classify the outcome.
 * Uses cache to avoid re-probing the same selection.
 */
const probeAndClassifySelection = (
  evaluateProbeMove: (move: Move) => ChoiceRequest,
  classifyProbeMoveSatisfiability: (move: Move) => DecisionSequenceSatisfiability,
  partialMove: Move,
  decisionKey: string,
  selection: Move['params'][string],
  probeCache: Map<string, SingletonProbeOutcome>,
  budget: WitnessSearchBudget,
  stats: WitnessSearchStats | undefined,
): { readonly outcome: SingletonProbeOutcome; readonly cached: boolean } | 'budget' => {
  const cacheKey = selectionCacheKey(selection as readonly unknown[]);
  const cached = probeCache.get(cacheKey);
  if (cached !== undefined) {
    if (stats !== undefined) {
      stats.cacheHits += 1;
    }
    return { outcome: cached, cached: true };
  }

  if (budget.remaining <= 0) {
    return 'budget';
  }
  budget.remaining -= 1;
  if (stats !== undefined) {
    stats.nodesVisited += 1;
  }

  const probeMove: Move = {
    ...partialMove,
    params: {
      ...partialMove.params,
      [decisionKey]: selection,
    },
  };

  let probed: ChoiceRequest;
  try {
    probed = evaluateProbeMove(probeMove);
  } catch (error: unknown) {
    if (isChoiceDecisionOwnerMismatchDuringProbe(error)) {
      const outcome: SingletonProbeOutcome = { kind: 'ambiguous' };
      probeCache.set(cacheKey, outcome);
      return { outcome, cached: false };
    }
    if (isEffectRuntimeReason(error, EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED)) {
      const outcome: SingletonProbeOutcome = { kind: 'unresolved' };
      probeCache.set(cacheKey, outcome);
      return { outcome, cached: false };
    }
    throw error;
  }

  let classification: DecisionSequenceSatisfiability | null = null;
  if (probed.kind === 'pending') {
    try {
      classification = classifyProbeMoveSatisfiability(probeMove);
    } catch (error: unknown) {
      if (!isChoiceDecisionOwnerMismatchDuringProbe(error)) {
        throw error;
      }
      classification = 'unknown';
    }
  }

  const outcome = classifySingletonProbe(probed, classification, decisionKey);
  probeCache.set(cacheKey, outcome);
  return { outcome, cached: false };
};

// ── Witness search DFS ────────────────────────────────────────────────

type WitnessOutcome = 'witness' | 'exhausted' | 'budget';

/**
 * DFS witness search for a single option.
 *
 * Enumerates extension subsets deterministically (combination-style:
 * each extension index > previous, avoiding duplicate subsets).
 * Probes each combination whose size falls within [min, max].
 * Stops as soon as one witness is found or the subtree/budget is exhausted.
 */
const witnessSearchForOption = (
  evaluateProbeMove: (move: Move) => ChoiceRequest,
  classifyProbeMoveSatisfiability: (move: Move) => DecisionSequenceSatisfiability,
  partialMove: Move,
  decisionKey: string,
  baseSelection: readonly unknown[],
  extensionCandidates: readonly Move['params'][string][],
  min: number,
  max: number,
  budget: WitnessSearchBudget,
  probeCache: Map<string, SingletonProbeOutcome>,
  stats: WitnessSearchStats | undefined,
): WitnessOutcome => {
  const minExtensions = Math.max(0, min - baseSelection.length);
  const maxExtensions = Math.min(
    max - baseSelection.length,
    extensionCandidates.length,
  );

  if (minExtensions > maxExtensions) {
    return 'exhausted';
  }

  // Recursive DFS: combination enumeration with early termination.
  // startIndex ensures each combination is visited exactly once.
  const walk = (startIndex: number, extensions: readonly unknown[]): WitnessOutcome => {
    // Probe if selection size is within [min, max].
    if (extensions.length >= minExtensions) {
      const selection = [...baseSelection, ...extensions] as Move['params'][string];
      const result = probeAndClassifySelection(
        evaluateProbeMove,
        classifyProbeMoveSatisfiability,
        partialMove,
        decisionKey,
        selection,
        probeCache,
        budget,
        stats,
      );
      if (result === 'budget') return 'budget';

      const { outcome } = result;
      if (outcome.kind === 'confirmable') return 'witness';
      if (outcome.kind === 'illegal') return 'exhausted';
      // Stochastic/ambiguous: cannot prove legality through these boundaries.
      if (outcome.kind === 'stochastic' || outcome.kind === 'ambiguous') {
        return 'exhausted';
      }
      // 'unresolved': continue extending if possible.
    }

    // Try extending further if under max extensions.
    if (extensions.length >= maxExtensions) return 'exhausted';

    for (let i = startIndex; i < extensionCandidates.length; i++) {
      const result = walk(i + 1, [...extensions, extensionCandidates[i]]);
      if (result === 'witness') return 'witness';
      if (result === 'budget') return 'budget';
      // 'exhausted' → continue to next candidate.
    }

    return 'exhausted';
  };

  return walk(0, []);
};

// ── Witness search orchestrator ───────────────────────────────────────

/**
 * Run a budgeted witness search for unresolved chooseN options.
 *
 * For each option marked `unknown`/`provisional` by the singleton probe pass,
 * searches for one confirmable completion witness via bounded DFS.
 *
 * Invariants:
 * - Every `legal` option has a concrete witness (existential proof).
 * - Every `illegal` option has an exhausted subtree (universal proof).
 * - Budget is count-based (nodes visited), not time-based.
 * - Search is deterministic: same state + same options = same resolution.
 * - Probe cache is local to a single mapChooseNOptions invocation.
 * - enumerateCombinations() and countCombinationsCapped() are NOT deleted — kept as oracle.
 */
export const runWitnessSearch = (
  evaluateProbeMove: (move: Move) => ChoiceRequest,
  classifyProbeMoveSatisfiability: (move: Move) => DecisionSequenceSatisfiability,
  partialMove: Move,
  request: ChoicePendingChooseNRequest,
  singletonResults: readonly ChoiceOption[],
  uniqueOptions: readonly Move['params'][string][],
  selectedKeys: ReadonlySet<string>,
  budget: WitnessSearchBudget,
  stats?: WitnessSearchStats,
): readonly ChoiceOption[] => {
  // Collect unresolved option keys from singleton pass.
  const unresolvedKeys = new Set<string>();
  for (const opt of singletonResults) {
    if (opt.legality === 'unknown' && opt.resolution === 'provisional') {
      unresolvedKeys.add(optionKey(opt.value));
    }
  }

  if (unresolvedKeys.size === 0) {
    return singletonResults;
  }

  // Build result map from singleton results.
  const resultByKey = new Map<
    string,
    { legality: ChoiceOption['legality']; illegalReason: ChoiceOption['illegalReason']; resolution: ChooseNOptionResolution }
  >();
  for (const opt of singletonResults) {
    resultByKey.set(optionKey(opt.value), {
      legality: opt.legality,
      illegalReason: opt.illegalReason,
      resolution: opt.resolution ?? 'provisional',
    });
  }

  // Probe cache shared across all options within this invocation.
  const probeCache = new Map<string, SingletonProbeOutcome>();

  const min = request.min ?? 0;
  const max = request.max ?? uniqueOptions.length;

  // Build statically-illegal key set for filtering extension candidates.
  const illegalKeys = new Set<string>();
  for (const opt of singletonResults) {
    if (opt.legality === 'illegal') {
      illegalKeys.add(optionKey(opt.value));
    }
  }

  // For each unresolved option, run witness DFS.
  // Iteration order: uniqueOptions preserves the original request order
  // (which reflects tier ordering from buildChooseNPendingChoice).
  for (const targetValue of uniqueOptions) {
    const targetKey = optionKey(targetValue);
    if (!unresolvedKeys.has(targetKey)) continue;
    if (budget.remaining <= 0) break;

    const baseSelection = [...request.selected, targetValue];

    // Extension candidates: all unique options except target and statically
    // illegal, in their original order (preserving tier ordering).
    // Normalized domain order as final tiebreaker is implicit in uniqueOptions
    // construction (which preserves request.options order).
    const extensionCandidates = uniqueOptions.filter((v) => {
      const key = optionKey(v);
      return key !== targetKey && !selectedKeys.has(key) && !illegalKeys.has(key);
    });

    const outcome = witnessSearchForOption(
      evaluateProbeMove,
      classifyProbeMoveSatisfiability,
      partialMove,
      request.decisionKey,
      baseSelection,
      extensionCandidates,
      min,
      max,
      budget,
      probeCache,
      stats,
    );

    if (outcome === 'witness') {
      resultByKey.set(targetKey, { legality: 'legal', illegalReason: null, resolution: 'exact' });
    } else if (outcome === 'exhausted') {
      resultByKey.set(targetKey, { legality: 'illegal', illegalReason: null, resolution: 'exact' });
    }
    // 'budget' → stays provisional.
  }

  // Build final option array preserving original order.
  return request.options.map((option) => {
    const key = optionKey(option.value);
    const result = resultByKey.get(key);
    if (result === undefined) {
      return {
        value: option.value,
        legality: 'unknown' as const,
        illegalReason: null,
        resolution: 'provisional' as const,
      };
    }
    return {
      value: option.value,
      legality: result.legality,
      illegalReason: result.legality === 'legal' ? null : result.illegalReason,
      resolution: result.resolution,
    };
  });
};
