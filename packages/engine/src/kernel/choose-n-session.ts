/**
 * ChooseN session template extraction and rebuild.
 *
 * A ChooseNTemplate captures selection-invariant data from the initial
 * chooseN pending request construction. Given a template and a new
 * selectedSequence, rebuildPendingFromTemplate rebuilds the
 * ChoicePendingChooseNRequest without rerunning the discovery pipeline.
 *
 * This module is a pure refactor extraction — it does not change the
 * behavior of buildChooseNPendingChoice in effects-choice.ts.
 */
import { canConfirmChooseNSelection } from './choose-n-cardinality.js';
import { optionKey } from './legal-choices.js';
import { computeTierAdmissibility, type PrioritizedTierEntry } from './prioritized-tier-legality.js';
import type { LegalChoicesPreparedContext } from './legal-choices.js';
import type { DecisionKey } from './decision-scope.js';
import type {
  ChoicePendingRequest,
  ChoiceTargetKind,
  MoveParamScalar,
  PlayerSel,
} from './types.js';
import type { PlayerId } from './branded.js';

// ── ChooseNTemplate ─────────────────────────────────────────────────

/**
 * Read-only data structure capturing everything needed to rebuild a
 * pending chooseN request given a new selection, without rerunning
 * the full discovery pipeline.
 *
 * All fields are selection-invariant — only selectedSequence,
 * tier admissibility, confirmability, and per-option legality are
 * selection-dependent and computed at rebuild time.
 */
export interface ChooseNTemplate {
  readonly decisionKey: DecisionKey;
  readonly name: string;
  readonly normalizedDomain: readonly MoveParamScalar[];
  readonly domainIndex: ReadonlyMap<string, number>;
  readonly cardinalityBounds: { readonly min: number; readonly max: number };
  readonly targetKinds: readonly ChoiceTargetKind[];
  readonly prioritizedTierEntries: readonly (readonly PrioritizedTierEntry[])[] | null;
  readonly qualifierMode: 'none' | 'byQualifier';
  readonly preparedContext: LegalChoicesPreparedContext;
  readonly partialMoveIdentity: {
    readonly actionId: string;
    readonly params: Readonly<Record<string, unknown>>;
  };
  readonly choiceDecisionPlayer: PlayerId;
  readonly chooser: PlayerSel | undefined;
}

// ── Template creation ───────────────────────────────────────────────

export interface CreateChooseNTemplateInput {
  readonly decisionKey: DecisionKey;
  readonly name: string;
  readonly normalizedOptions: readonly MoveParamScalar[];
  readonly targetKinds: readonly ChoiceTargetKind[];
  readonly minCardinality: number;
  readonly maxCardinality: number;
  readonly prioritizedTierEntries: readonly (readonly PrioritizedTierEntry[])[] | null;
  readonly qualifierMode: 'none' | 'byQualifier';
  readonly preparedContext: LegalChoicesPreparedContext;
  readonly partialMoveIdentity: {
    readonly actionId: string;
    readonly params: Readonly<Record<string, unknown>>;
  };
  readonly choiceDecisionPlayer: PlayerId;
  readonly chooser: PlayerSel | undefined;
}

/**
 * Capture the selection-invariant data from a chooseN pending request
 * construction. Runs once per chooseN decision, not per toggle.
 */
export const createChooseNTemplate = (input: CreateChooseNTemplateInput): ChooseNTemplate => {
  const domainIndex: Map<string, number> = new Map();
  for (let i = 0; i < input.normalizedOptions.length; i++) {
    domainIndex.set(optionKey(input.normalizedOptions[i]), i);
  }

  return {
    decisionKey: input.decisionKey,
    name: input.name,
    normalizedDomain: input.normalizedOptions,
    domainIndex,
    cardinalityBounds: {
      min: input.minCardinality,
      max: input.maxCardinality,
    },
    targetKinds: input.targetKinds,
    prioritizedTierEntries: input.prioritizedTierEntries,
    qualifierMode: input.qualifierMode,
    preparedContext: input.preparedContext,
    partialMoveIdentity: input.partialMoveIdentity,
    choiceDecisionPlayer: input.choiceDecisionPlayer,
    chooser: input.chooser,
  };
};

// ── Rebuild from template ───────────────────────────────────────────

/**
 * Rebuild a ChoicePendingChooseNRequest from a template and a new
 * selectedSequence. Produces identical results to
 * buildChooseNPendingChoice for the same inputs.
 *
 * Selection-dependent computations performed here:
 * - Tier admissibility from template tier entries + new selection
 * - canConfirm from template cardinality bounds + new selection size
 * - Per-option static legality (selected, capacity, tier-blocked)
 */
export const rebuildPendingFromTemplate = (
  template: ChooseNTemplate,
  selectedSequence: readonly MoveParamScalar[],
): ChoicePendingRequest => {
  const selectedKeys = new Set(selectedSequence.map((value) => optionKey(value)));

  const prioritizedAdmissibility = template.prioritizedTierEntries !== null
    ? buildAdmissibilityKeys(
        template.prioritizedTierEntries,
        template.qualifierMode,
        selectedSequence,
      )
    : null;

  const hasAddCapacity = selectedSequence.length < template.cardinalityBounds.max;

  return {
    kind: 'pending',
    complete: false,
    ...(template.chooser === undefined ? {} : { decisionPlayer: template.choiceDecisionPlayer }),
    decisionKey: template.decisionKey,
    name: template.name,
    type: 'chooseN',
    options: template.normalizedDomain.map((value) => {
      const isSelected = selectedKeys.has(optionKey(value));
      const isPrioritizedIllegal = prioritizedAdmissibility !== null
        && !prioritizedAdmissibility.has(optionKey(value));
      const isStaticallyIllegal = isSelected || !hasAddCapacity || isPrioritizedIllegal;
      return {
        value,
        legality: isStaticallyIllegal ? 'illegal' as const : 'unknown' as const,
        illegalReason: null,
        ...(isStaticallyIllegal ? { resolution: 'exact' as const } : {}),
      };
    }),
    targetKinds: template.targetKinds,
    min: template.cardinalityBounds.min,
    max: template.cardinalityBounds.max,
    selected: [...selectedSequence],
    canConfirm: canConfirmChooseNSelection(
      selectedSequence.length,
      template.cardinalityBounds.min,
      template.cardinalityBounds.max,
    ),
  };
};

// ── Admissibility helper ────────────────────────────────────────────

/**
 * Compute the set of admissible option keys from tier entries and
 * the current selection. Mirrors the logic in
 * buildPrioritizedAdmissibility in effects-choice.ts.
 */
const buildAdmissibilityKeys = (
  tiers: readonly (readonly PrioritizedTierEntry[])[],
  qualifierMode: 'none' | 'byQualifier',
  alreadySelected: readonly MoveParamScalar[],
): ReadonlySet<string> => {
  const admissibility = computeTierAdmissibility(tiers, alreadySelected, qualifierMode);
  return new Set(admissibility.admissibleValues.map((value) => optionKey(value)));
};

// ── Template eligibility ────────────────────────────────────────────

/**
 * Check whether a chooseN decision is eligible for session-based
 * optimization.
 *
 * A chooseN is session-eligible when:
 * - Its base domain is selection-invariant (always true for standard
 *   chooseN — the domain comes from evalQuery which depends on game
 *   state, not the current selection)
 * - Only selected membership, tier admissibility, confirmability,
 *   and legality resolution are selection-dependent
 *
 * Conservative: returns false for any non-standard case.
 * False negatives are safe; false positives are bugs.
 */
export const isChooseNSessionEligible = (
  template: ChooseNTemplate,
): boolean => {
  // Domain must be non-empty.
  if (template.normalizedDomain.length === 0) {
    return false;
  }

  // Cardinality bounds must be well-formed.
  if (template.cardinalityBounds.min < 0) {
    return false;
  }
  if (template.cardinalityBounds.max < template.cardinalityBounds.min) {
    return false;
  }
  if (template.cardinalityBounds.max > template.normalizedDomain.length) {
    return false;
  }

  // Domain index must cover all domain values (integrity check).
  if (template.domainIndex.size !== template.normalizedDomain.length) {
    return false;
  }

  return true;
};
