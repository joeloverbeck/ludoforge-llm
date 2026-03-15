/**
 * ChooseN session template extraction, rebuild, and interactive session.
 *
 * A ChooseNTemplate captures selection-invariant data from the initial
 * chooseN pending request construction. Given a template and a new
 * selectedSequence, rebuildPendingFromTemplate rebuilds the
 * ChoicePendingChooseNRequest without rerunning the discovery pipeline.
 *
 * A ChooseNSession holds a template, caches, and current state needed
 * to recompute chooseN pending requests efficiently on each add/remove
 * toggle without rerunning the full pipeline.
 *
 * This module is a pure refactor extraction — it does not change the
 * behavior of buildChooseNPendingChoice in effects-choice.ts.
 */
import { canConfirmChooseNSelection } from './choose-n-cardinality.js';
import { validateChooseNSelectedSequence } from './choose-n-selected-validation.js';
import { optionKey } from './legal-choices.js';
import { computeTierAdmissibility, type PrioritizedTierEntry } from './prioritized-tier-legality.js';
import { kernelRuntimeError } from './runtime-error.js';
import type { SingletonProbeOutcome } from './choose-n-option-resolution.js';
import type { LegalChoicesPreparedContext } from './legal-choices.js';
import type { DecisionKey } from './decision-scope.js';
import type {
  ChoiceOption,
  ChoicePendingChooseNRequest,
  ChoicePendingRequest,
  ChoiceTargetKind,
  MoveParamScalar,
  PlayerSel,
} from './types.js';
import type { ChooseNCommand, AdvanceChooseNResult } from './advance-choose-n.js';
import type { ActionId, PlayerId } from './branded.js';

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

// ── Canonical selection keys ──────────────────────────────────────

/**
 * A canonical set key for probe and legality caches.
 *
 * - For domains up to 64 options: bigint bitset (set bit per option's
 *   domain index). Efficient equality and hashing.
 * - For larger domains: sorted option key string.
 *
 * Internal only — public `selected` order is unchanged by this.
 */
export type SelectionKey = bigint | string;

/** Maximum domain size for the bigint bitset representation. */
const MAX_BITSET_DOMAIN_SIZE = 64;

/**
 * Compute a canonical SelectionKey for a set of selected values.
 *
 * Deterministic: same selected set (regardless of order) → same key.
 */
export const toSelectionKey = (
  domainIndex: ReadonlyMap<string, number>,
  selected: readonly MoveParamScalar[],
): SelectionKey => {
  if (domainIndex.size <= MAX_BITSET_DOMAIN_SIZE) {
    let bits = 0n;
    for (const value of selected) {
      const idx = domainIndex.get(optionKey(value));
      if (idx !== undefined) {
        bits |= 1n << BigInt(idx);
      }
    }
    return bits;
  }

  // Large domain: sorted string key.
  return selected
    .map((v) => optionKey(v))
    .sort()
    .join('|');
};

// ── ChooseNSession ────────────────────────────────────────────────

/**
 * Mutable session holding the template, caches, and current state
 * needed to recompute chooseN pending requests efficiently on each
 * add/remove toggle without rerunning the full pipeline.
 *
 * The session is internal — not serialized across Comlink, not visible
 * to the store/UI. Caches are session-local and cleared when the
 * session is discarded.
 *
 * Note: `currentSelected` and `currentPending` are intentionally
 * mutable — the session is an in-process optimization object.
 */
export interface ChooseNSession {
  readonly revision: number;
  readonly decisionKey: DecisionKey;
  readonly template: ChooseNTemplate;
  readonly probeCache: Map<SelectionKey, SingletonProbeOutcome>;
  readonly legalityCache: Map<SelectionKey, readonly ChoiceOption[]>;
  currentSelected: readonly MoveParamScalar[];
  currentPending: ChoicePendingChooseNRequest;
}

/**
 * Create a new ChooseNSession from a template and initial state.
 *
 * Both caches start empty. The session is valid as long as the
 * revision matches the current worker-local revision counter.
 */
export const createChooseNSession = (
  template: ChooseNTemplate,
  initialSelected: readonly MoveParamScalar[],
  initialPending: ChoicePendingChooseNRequest,
  revision: number,
): ChooseNSession => ({
  revision,
  decisionKey: template.decisionKey,
  template,
  probeCache: new Map(),
  legalityCache: new Map(),
  currentSelected: initialSelected,
  currentPending: initialPending,
});

// ── Revision-based staleness ──────────────────────────────────────

/**
 * Check whether a session is still valid against the current revision.
 *
 * The session is discarded when the revision mismatches (state mutation,
 * undo, reset, move application).
 */
export const isSessionValid = (
  session: ChooseNSession,
  currentRevision: number,
): boolean => session.revision === currentRevision;

// ── Session-aware toggle types ────────────────────────────────────

/**
 * Optional callback for resolving option legality via probing.
 *
 * When provided, `advanceChooseNWithSession` calls this after template
 * rebuild to determine exact/provisional legality for each option.
 * The session's `probeCache` is passed so that overlapping probes
 * across toggles can reuse cached results.
 *
 * The callback receives the rebuilt pending request (with static
 * legality) and the session's probe cache, and returns a resolved
 * options array.
 */
export type ChooseNSessionResolveOptions = (
  pending: ChoicePendingChooseNRequest,
  probeCache: Map<SelectionKey, SingletonProbeOutcome>,
) => readonly ChoiceOption[];

// ── Session-aware toggle ──────────────────────────────────────────

/**
 * Advance a chooseN decision using the session's template and caches.
 *
 * Per spec 6.5:
 * 1. Validate command against `session.currentPending`
 * 2. Compute `nextSelected`
 * 3. Validate selected sequence (tier ordering via validator from 005)
 * 4. Check legalityCache; if miss, recompute pending from template
 * 5. Optionally run probes via `resolveOptions` callback
 * 6. Update `session.currentSelected` and `session.currentPending`
 *
 * This eliminates the current double full-path reevaluation on
 * add/remove that the stateless `advanceChooseN` performs.
 *
 * Note: only `illegal` options are blocked. `unknown` options remain
 * selectable (spec 3.4).
 */
export const advanceChooseNWithSession = (
  session: ChooseNSession,
  command: ChooseNCommand,
  resolveOptions?: ChooseNSessionResolveOptions,
): AdvanceChooseNResult => {
  const pending = session.currentPending;

  // ── Confirm ──────────────────────────────────────────────────────
  if (command.type === 'confirm') {
    if (!pending.canConfirm) {
      throw kernelRuntimeError(
        'LEGAL_CHOICES_VALIDATION_FAILED',
        `advanceChooseNWithSession: current selection cannot be confirmed for ${session.decisionKey}`,
        {
          actionId: session.template.partialMoveIdentity.actionId as ActionId,
          param: String(session.decisionKey),
          value: {
            currentSelected: pending.selected,
            min: pending.min ?? 0,
            max: pending.max ?? pending.options.length,
          },
        },
      );
    }
    return { done: true, value: [...session.currentSelected] };
  }

  // ── Compute nextSelected ─────────────────────────────────────────
  const selectedKeys = new Set(pending.selected.map((v) => optionKey(v)));
  let nextSelected: readonly MoveParamScalar[];

  if (command.type === 'add') {
    const commandKey = optionKey(command.value);

    if (selectedKeys.has(commandKey)) {
      throw kernelRuntimeError(
        'LEGAL_CHOICES_VALIDATION_FAILED',
        `advanceChooseNWithSession: cannot add duplicate selection for ${session.decisionKey}`,
        {
          actionId: session.template.partialMoveIdentity.actionId as ActionId,
          param: String(session.decisionKey),
          value: { attempted: command.value, currentSelected: pending.selected },
        },
      );
    }

    const option = pending.options.find(
      (entry) => optionKey(entry.value as MoveParamScalar) === commandKey,
    );
    if (option === undefined) {
      throw kernelRuntimeError(
        'LEGAL_CHOICES_VALIDATION_FAILED',
        `advanceChooseNWithSession: value is outside the current chooseN domain for ${session.decisionKey}`,
        {
          actionId: session.template.partialMoveIdentity.actionId as ActionId,
          param: String(session.decisionKey),
          value: { attempted: command.value, currentSelected: pending.selected },
        },
      );
    }

    // Session path: only illegal options are blocked (spec 3.4).
    // Unknown options remain selectable.
    if (option.legality === 'illegal') {
      throw kernelRuntimeError(
        'LEGAL_CHOICES_VALIDATION_FAILED',
        `advanceChooseNWithSession: value is illegal for ${session.decisionKey}`,
        {
          actionId: session.template.partialMoveIdentity.actionId as ActionId,
          param: String(session.decisionKey),
          value: {
            attempted: command.value,
            legality: option.legality,
            illegalReason: option.illegalReason,
            currentSelected: pending.selected,
          },
        },
      );
    }

    nextSelected = [...session.currentSelected, command.value];
  } else {
    // remove
    const commandKey = optionKey(command.value);

    if (!selectedKeys.has(commandKey)) {
      throw kernelRuntimeError(
        'LEGAL_CHOICES_VALIDATION_FAILED',
        `advanceChooseNWithSession: value is not selected for ${session.decisionKey}`,
        {
          actionId: session.template.partialMoveIdentity.actionId as ActionId,
          param: String(session.decisionKey),
          value: { attempted: command.value, currentSelected: pending.selected },
        },
      );
    }

    nextSelected = session.currentSelected.filter(
      (v) => optionKey(v) !== commandKey,
    );
  }

  // ── Validate selected sequence (tier ordering) ───────────────────
  if (session.template.prioritizedTierEntries !== null) {
    const failures = validateChooseNSelectedSequence({
      normalizedDomain: session.template.normalizedDomain,
      tiers: session.template.prioritizedTierEntries,
      qualifierMode: session.template.qualifierMode,
      selectedSequence: nextSelected,
    });
    if (failures.length > 0) {
      throw kernelRuntimeError(
        'LEGAL_CHOICES_VALIDATION_FAILED',
        `advanceChooseNWithSession: selected sequence validation failed for ${session.decisionKey}`,
        {
          actionId: session.template.partialMoveIdentity.actionId as ActionId,
          param: String(session.decisionKey),
          value: { nextSelected, failures },
        },
      );
    }
  }

  // ── Check legalityCache ──────────────────────────────────────────
  const selKey = toSelectionKey(session.template.domainIndex, nextSelected);
  const cachedOptions = session.legalityCache.get(selKey);

  let nextPending: ChoicePendingChooseNRequest;

  if (cachedOptions !== undefined) {
    // Cache hit: reconstruct pending with cached options.
    const basePending = rebuildPendingFromTemplate(
      session.template,
      nextSelected,
    ) as ChoicePendingChooseNRequest;
    nextPending = { ...basePending, options: cachedOptions };
  } else {
    // Cache miss: rebuild from template (one recompute, not two).
    const basePending = rebuildPendingFromTemplate(
      session.template,
      nextSelected,
    ) as ChoicePendingChooseNRequest;

    // Optionally resolve option legality via probing.
    const resolvedOptions = resolveOptions !== undefined
      ? resolveOptions(basePending, session.probeCache)
      : basePending.options;

    nextPending = resolvedOptions === basePending.options
      ? basePending
      : { ...basePending, options: resolvedOptions };

    // Cache the resolved options.
    session.legalityCache.set(selKey, nextPending.options);
  }

  // ── Update session (intentional mutation) ────────────────────────
  session.currentSelected = nextSelected;
  session.currentPending = nextPending;

  return { done: false, pending: nextPending };
};
