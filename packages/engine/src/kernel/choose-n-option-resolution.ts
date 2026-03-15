/**
 * Singleton probe pass for large-domain chooseN option resolution.
 *
 * Iterates each unresolved option individually, probing `[...currentSelected, option]`
 * with the discover-only path. Classifies each probe outcome into a fine-grained
 * result that maps to the ChoiceOption legality/resolution surface.
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
