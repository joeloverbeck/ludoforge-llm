import { getLatticeMap } from './def-lookup.js';
import { evalQuery } from './eval-query.js';
import { unwrapEvalQuery } from './eval-result.js';
import { evalCondition, evalConditionRaw } from './eval-condition.js';
import { evalValue } from './eval-value.js';
import { advanceScope, type DecisionKey } from './decision-scope.js';
import { createChooseNTemplate } from './choose-n-session.js';
import {
  CHOICE_VALIDATION_ERROR_CODE,
  choiceValidationFailed,
  choiceValidationSuccess,
  type ChoiceValidationError,
  type ChoiceValidationResult,
} from './choice-validation-result.js';
import { deriveChoiceTargetKinds } from './choice-target-kinds.js';
import { canConfirmChooseNSelection, resolveChooseNCardinality } from './choose-n-cardinality.js';
import { effectRuntimeError } from './effect-error.js';
import { resolveBindingTemplate } from './binding-template.js';
import { createSeatResolutionContext } from './identity.js';
import { nextInt } from './prng.js';
import { resolveSinglePlayerSel } from './resolve-selectors.js';
import { resolveZoneWithNormalization, selectorResolutionFailurePolicyForMode } from './selector-resolution-normalization.js';
import { findSpaceMarkerConstraintViolation, resolveSpaceMarkerShift } from './space-marker-rules.js';
import { resolveTraceProvenance } from './trace-provenance.js';
import { emitDecisionTrace } from './execution-collector.js';
import { computeTierAdmissibility, type PrioritizedTierEntry } from './prioritized-tier-legality.js';
import { validateChooseNSelectedSequence } from './choose-n-selected-validation.js';
import { normalizeChoiceDomain, toChoiceComparableValue, type MembershipScalar } from './value-membership.js';
import { EFFECT_RUNTIME_REASONS } from './runtime-reasons.js';
import { buildRuntimeTableIndex } from './runtime-table-index.js';
import { toTraceProvenanceContext } from './effect-context.js';
import { ensureMarkerCloned, type MutableGameState } from './state-draft.js';
import { addToRunningHash, updateRunningHash } from './zobrist.js';
import type { ZobristFeature } from './types-core.js';
import type { EffectContext, EffectCursor, EffectEnv, MutableReadScope, PartialEffectResult } from './effect-context.js';
import type { ReadContext } from './eval-context.js';
import type {
  ChoicePendingRequest,
  ChoiceStochasticOutcome,
  ChoiceStochasticPendingRequest,
  EffectAST,
  MoveParamScalar,
  OptionsQuery,
  PlayerSel,
  Token,
} from './types.js';
import type { PlayerId } from './branded.js';
import type { EffectBudgetState } from './effects-control.js';
import type { ApplyEffectsWithBudget } from './effect-registry.js';


const choiceOptionKey = (value: unknown): string => JSON.stringify([typeof value, value]);

const isChoiceValidationFailure = <T>(
  value: T | ChoiceValidationResult<never>,
): value is ChoiceValidationResult<never> =>
  typeof value === 'object'
  && value !== null
  && 'outcome' in value
  && value.outcome === 'error';

const choiceValidationFailureResult = (
  cursor: Pick<EffectCursor, 'state' | 'rng'>,
  error: ChoiceValidationError,
): PartialEffectResult => ({
  state: cursor.state,
  rng: cursor.rng,
  choiceValidationError: error,
});

const createChoiceValidationError = (
  message: string,
  context?: Readonly<Record<string, unknown>>,
): ChoiceValidationError => ({
  code: CHOICE_VALIDATION_ERROR_CODE,
  message,
  ...(context !== undefined ? { context } : {}),
});

const choiceValidationFailureResultFromMessage = (
  cursor: Pick<EffectCursor, 'state' | 'rng'>,
  message: string,
  context?: Readonly<Record<string, unknown>>,
): PartialEffectResult => choiceValidationFailureResult(cursor, createChoiceValidationError(message, context));

const isTokenQueryResult = (value: unknown): value is Token =>
  typeof value === 'object'
  && value !== null
  && typeof (value as { id?: unknown }).id === 'string'
  && typeof (value as { type?: unknown }).type === 'string'
  && typeof (value as { props?: unknown }).props === 'object'
  && (value as { props?: unknown }).props !== null;

const resolvePrioritizedTierEntries = (
  query: OptionsQuery,
  evalCtx: ReadContext,
  bind: string,
  decisionKey: string,
): ChoiceValidationResult<readonly (readonly PrioritizedTierEntry[])[] | null> => {
  if (query.query !== 'prioritized') {
    return choiceValidationSuccess(null);
  }

  const tiers: (readonly PrioritizedTierEntry[])[] = [];
  for (let tierIndex = 0; tierIndex < query.tiers.length; tierIndex += 1) {
    const tierQuery = query.tiers[tierIndex]!;
    const tierResults = unwrapEvalQuery(evalQuery(tierQuery, evalCtx));
    const normalizedTier = normalizeChoiceDomain(tierResults, (issue) =>
      choiceValidationFailed(
        `chooseN prioritized tier item is not move-param encodable: ${bind}`,
        {
          effectType: 'chooseN',
          bind,
          decisionKey,
          tierIndex,
          index: issue.index,
          actualType: issue.actualType,
          value: issue.value,
        },
      ));
    if (isChoiceValidationFailure(normalizedTier)) {
      return normalizedTier;
    }

    const tierEntries: PrioritizedTierEntry[] = [];
    for (let itemIndex = 0; itemIndex < normalizedTier.length; itemIndex += 1) {
      const value = normalizedTier[itemIndex]!;
      const tierResult = tierResults[itemIndex];
      if (query.qualifierKey === undefined) {
        tierEntries.push({ value });
        continue;
      }
      if (!isTokenQueryResult(tierResult)) {
        return choiceValidationFailed(
          `chooseN prioritized qualifierKey requires token results: ${bind}`,
          {
            effectType: 'chooseN',
            bind,
            decisionKey,
            tierIndex,
            itemIndex,
            qualifierKey: query.qualifierKey,
            value: tierResult,
          },
        );
      }
      const qualifier = tierResult.props[query.qualifierKey];
      if (
        qualifier !== undefined
        && typeof qualifier !== 'string'
        && typeof qualifier !== 'number'
        && typeof qualifier !== 'boolean'
      ) {
        return choiceValidationFailed(
          `chooseN prioritized qualifier must resolve to a scalar: ${bind}`,
          {
            effectType: 'chooseN',
            bind,
            decisionKey,
            tierIndex,
            itemIndex,
            qualifierKey: query.qualifierKey,
            qualifier,
          },
        );
      }
      tierEntries.push(qualifier === undefined ? { value } : { value, qualifier });
    }
    tiers.push(tierEntries);
  }

  return choiceValidationSuccess(tiers);
};

const buildPrioritizedAdmissibility = (
  tiers: readonly (readonly PrioritizedTierEntry[])[] | null,
  qualifierMode: 'none' | 'byQualifier',
  alreadySelected: readonly MoveParamScalar[],
): { readonly admissibleKeys: ReadonlySet<string> } | null => {
  if (tiers === null) {
    return null;
  }

  const admissibility = computeTierAdmissibility(
    tiers,
    alreadySelected,
    qualifierMode,
  );
  return {
    admissibleKeys: new Set(admissibility.admissibleValues.map((value) => choiceOptionKey(value))),
  };
};

const normalizeChooseNSelectionValues = (
  selectedValue: readonly unknown[],
  bind: string,
  decisionKey: string,
): ChoiceValidationResult<readonly MoveParamScalar[]> => {
  const normalizedSelected: MoveParamScalar[] = [];

  for (let index = 0; index < selectedValue.length; index += 1) {
    const comparable = toChoiceComparableValue(selectedValue[index]);
    if (comparable === null) {
      return choiceValidationFailed(`chooseN selection is not move-param encodable: ${bind}`, {
        effectType: 'chooseN',
        bind,
        decisionKey,
        selected: selectedValue[index],
        selectedIndex: index,
      });
    }
    normalizedSelected.push(comparable);
  }

  for (let left = 0; left < normalizedSelected.length; left += 1) {
    for (let right = left + 1; right < normalizedSelected.length; right += 1) {
      if (Object.is(normalizedSelected[left], normalizedSelected[right])) {
        return choiceValidationFailed(`chooseN selections must be unique: ${bind}`, {
          effectType: 'chooseN',
          bind,
          duplicateValue: normalizedSelected[left],
        });
      }
    }
  }

  return choiceValidationSuccess(normalizedSelected);
};

const validateChooseNSelectionSequence = (
  selectedSequence: readonly MoveParamScalar[],
  comparableBindingMap: ReadonlyMap<MembershipScalar, unknown>,
  normalizedOptions: readonly MoveParamScalar[],
  prioritizedTierEntries: readonly (readonly PrioritizedTierEntry[])[] | null,
  prioritizedQualifierMode: 'none' | 'byQualifier',
  bind: string,
  decisionKey: string,
): ChoiceValidationResult<void> => {
  const failures = validateChooseNSelectedSequence({
    normalizedDomain: normalizedOptions,
    tiers: prioritizedTierEntries,
    qualifierMode: prioritizedQualifierMode,
    selectedSequence,
  });

  for (const failure of failures) {
    if (failure.reason === 'out-of-domain') {
      return choiceValidationFailed(
        `invalid selection for chooseN "${bind}" (${decisionKey}): outside options domain`,
        {
          effectType: 'chooseN',
          bind,
          selected: failure.value,
          optionsCount: comparableBindingMap.size,
        },
      );
    }
    if (failure.reason === 'duplicate') {
      return choiceValidationFailed(
        `chooseN selections must be unique: ${bind}`,
        {
          effectType: 'chooseN',
          bind,
          duplicateValue: failure.value,
        },
      );
    }
    if (failure.reason === 'tier-blocked') {
      return choiceValidationFailed(
        `chooseN selection violates prioritized tier ordering: ${bind}`,
        {
          effectType: 'chooseN',
          bind,
          decisionKey,
          selected: failure.value,
          selectedIndex: failure.index,
        },
      );
    }
  }

  return choiceValidationSuccess(undefined);
};

interface BuildChooseNPendingChoiceInput {
  readonly choiceDecisionPlayer: PlayerId;
  readonly chooser: PlayerSel | undefined;
  readonly decisionKey: DecisionKey;
  readonly name: string;
  readonly normalizedOptions: readonly MoveParamScalar[];
  readonly targetKinds: ChoicePendingRequest['targetKinds'];
  readonly minCardinality: number;
  readonly maxCardinality: number;
  readonly selectedSequence: readonly MoveParamScalar[];
  readonly prioritizedTierEntries: readonly (readonly PrioritizedTierEntry[])[] | null;
  readonly prioritizedQualifierMode: 'none' | 'byQualifier';
}

const buildChooseNPendingChoice = ({
  choiceDecisionPlayer,
  chooser,
  decisionKey,
  name,
  normalizedOptions,
  targetKinds,
  minCardinality,
  maxCardinality,
  selectedSequence,
  prioritizedTierEntries,
  prioritizedQualifierMode,
}: BuildChooseNPendingChoiceInput): ChoicePendingRequest => {
  const selectedKeys = new Set(selectedSequence.map((value) => choiceOptionKey(value)));
  const prioritizedAdmissibility = buildPrioritizedAdmissibility(
    prioritizedTierEntries,
    prioritizedQualifierMode,
    selectedSequence,
  );
  const hasAddCapacity = selectedSequence.length < maxCardinality;

  return {
    kind: 'pending',
    complete: false,
    ...(chooser === undefined ? {} : { decisionPlayer: choiceDecisionPlayer }),
    decisionKey,
    name,
    type: 'chooseN',
    options: normalizedOptions.map((value) => {
      const isSelected = selectedKeys.has(choiceOptionKey(value));
      const isPrioritizedIllegal = prioritizedAdmissibility !== null
        && !prioritizedAdmissibility.admissibleKeys.has(choiceOptionKey(value));
      const isStaticallyIllegal = isSelected || !hasAddCapacity || isPrioritizedIllegal;
      return {
        value,
        legality: isStaticallyIllegal ? 'illegal' : 'unknown',
        illegalReason: null,
        ...(isStaticallyIllegal ? { resolution: 'exact' as const } : {}),
      };
    }),
    targetKinds,
    min: minCardinality,
    max: maxCardinality,
    selected: [...selectedSequence],
    canConfirm: canConfirmChooseNSelection(selectedSequence.length, minCardinality, maxCardinality),
  };
};

const normalizePendingChoiceRequest = (pendingChoice: ChoicePendingRequest): ChoicePendingRequest => ({
  ...pendingChoice,
  options: pendingChoice.options.map((option) => ({
    value: option.value,
    legality: 'unknown',
    illegalReason: null,
  })),
  targetKinds: [...pendingChoice.targetKinds],
  ...(pendingChoice.type === 'chooseN'
    ? {
        selected: [...pendingChoice.selected],
      }
    : {}),
});

const pendingChoiceStructuralKey = (pendingChoice: ChoicePendingRequest): string => {
  const normalized = normalizePendingChoiceRequest(pendingChoice);
  return JSON.stringify({
    decisionPlayer: normalized.decisionPlayer ?? null,
    decisionKey: normalized.decisionKey,
    name: normalized.name,
    type: normalized.type,
    options: normalized.options.map((option) => choiceOptionKey(option.value)),
    targetKinds: normalized.targetKinds,
    min: normalized.type === 'chooseN' ? normalized.min ?? 0 : null,
    max: normalized.type === 'chooseN' ? normalized.max ?? normalized.options.length : null,
    selected: normalized.type === 'chooseN' ? normalized.selected.map((value) => choiceOptionKey(value)) : null,
    canConfirm: normalized.type === 'chooseN' ? normalized.canConfirm : null,
  });
};

const mergePendingChoiceRequests = (
  pendingChoices: readonly ChoicePendingRequest[],
): ChoiceValidationResult<readonly ChoicePendingRequest[]> => {
  const [first, ...rest] = pendingChoices;
  if (first === undefined) {
    throw new Error('mergePendingChoiceRequests requires at least one pending choice');
  }

  for (const pending of rest) {
    if (pending.type !== first.type) {
      return choiceValidationFailed(
        `rollRandom discovery found incompatible pending decision types for ${first.decisionKey}`,
        {
          effectType: 'rollRandom',
          decisionKey: first.decisionKey,
          expectedType: first.type,
          actualType: pending.type,
        },
      );
    }
    if (pending.name !== first.name) {
      return choiceValidationFailed(
        `rollRandom discovery found incompatible pending decision names for ${first.decisionKey}`,
        {
          effectType: 'rollRandom',
          decisionKey: first.decisionKey,
          expectedName: first.name,
          actualName: pending.name,
        },
      );
    }
    if (!Object.is(pending.decisionPlayer, first.decisionPlayer)) {
      return choiceValidationFailed(
        `rollRandom discovery found incompatible decision owners for ${first.decisionKey}`,
        {
          effectType: 'rollRandom',
          decisionKey: first.decisionKey,
          expectedDecisionPlayer: first.decisionPlayer,
          actualDecisionPlayer: pending.decisionPlayer,
        },
      );
    }
  }

  const normalizedFirst = normalizePendingChoiceRequest(first);
  const firstKey = pendingChoiceStructuralKey(normalizedFirst);
  const distinctAlternatives = new Map<string, ChoicePendingRequest>([[firstKey, normalizedFirst]]);

  for (const pending of rest) {
    const normalized = normalizePendingChoiceRequest(pending);
    const key = pendingChoiceStructuralKey(normalized);
    if (!distinctAlternatives.has(key)) {
      distinctAlternatives.set(key, normalized);
    }
  }

  if (distinctAlternatives.size === 1) {
    return choiceValidationSuccess([normalizedFirst]);
  }

  return choiceValidationSuccess([...distinctAlternatives.values()]);
};

const toStochasticPendingChoice = (
  outcomes: readonly ChoiceStochasticOutcome[],
): ChoiceValidationResult<ChoiceStochasticPendingRequest> => {
  const pendingByDecisionKey = new Map<string, ChoicePendingRequest[]>();
  for (const outcome of outcomes) {
    if (outcome.nextDecision === undefined) {
      continue;
    }
    const decisionKey = outcome.nextDecision.decisionKey as string;
    const existing = pendingByDecisionKey.get(decisionKey);
    if (existing === undefined) {
      pendingByDecisionKey.set(decisionKey, [outcome.nextDecision]);
    } else {
      existing.push(outcome.nextDecision);
    }
  }
  const alternatives: ChoicePendingRequest[] = [];
  for (const [, requests] of [...pendingByDecisionKey.entries()].sort(([leftId], [rightId]) => leftId.localeCompare(rightId))) {
    const mergedRequests = mergePendingChoiceRequests(requests);
    if (mergedRequests.outcome === 'error') {
      return mergedRequests;
    }
    alternatives.push(...mergedRequests.value);
  }
  return choiceValidationSuccess({
    kind: 'pendingStochastic',
    complete: false,
    source: 'rollRandom',
    alternatives,
    outcomes,
  });
};

const resolveFixedRandomBinding = (
  bind: string,
  value: unknown,
  minValue: number,
  maxValue: number,
): ChoiceValidationResult<number> => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    return choiceValidationFailed(
      `rollRandom binding ${bind} must resolve to a safe integer`,
      {
        effectType: 'rollRandom',
        bind,
        actualType: typeof value,
        value,
      },
    );
  }
  if (value < minValue || value > maxValue) {
    return choiceValidationFailed(
      `rollRandom binding ${bind} must stay within [${minValue}, ${maxValue}]`,
      {
        effectType: 'rollRandom',
        bind,
        value,
        min: minValue,
        max: maxValue,
      },
    );
  }
  return choiceValidationSuccess(value);
};

const collectNestedOutcomes = (
  bind: string,
  rolledValue: MoveParamScalar,
  pendingChoice: ChoicePendingRequest | ChoiceStochasticPendingRequest | undefined,
): readonly ChoiceStochasticOutcome[] => {
  if (pendingChoice === undefined) {
    return [{ bindings: { [bind]: rolledValue } }];
  }
  if (pendingChoice.kind === 'pendingStochastic') {
    return pendingChoice.outcomes.map((outcome) => ({
      bindings: {
        [bind]: rolledValue,
        ...outcome.bindings,
      },
      ...(outcome.nextDecision === undefined ? {} : { nextDecision: outcome.nextDecision }),
    }));
  }
  return [{
    bindings: { [bind]: rolledValue },
    nextDecision: pendingChoice,
  }];
};


const resolveChoiceBindings = (env: EffectEnv, cursor: EffectCursor): Readonly<Record<string, unknown>> => {
  const merged: Record<string, unknown> = {
    ...env.moveParams,
    ...cursor.bindings,
  };

  for (const [bindingKey, value] of Object.entries(merged)) {
    const resolvedKey = resolveBindingTemplate(bindingKey, cursor.bindings);
    if (resolvedKey !== bindingKey && !Object.prototype.hasOwnProperty.call(merged, resolvedKey)) {
      merged[resolvedKey] = value;
    }
  }

  return merged;
};

const updateChoiceScope = (
  scope: MutableReadScope,
  env: EffectEnv,
  cursor: EffectCursor,
): ReadContext => {
  scope.state = cursor.state;
  scope.bindings = resolveChoiceBindings(env, cursor);
  return scope;
};

const resolveChoiceTraceProvenance = (env: EffectEnv, cursor: EffectCursor): ReturnType<typeof resolveTraceProvenance> =>
  resolveTraceProvenance(toTraceProvenanceContext(env, cursor));

const resolveMarkerLattice = (
  def: EffectContext['def'],
  markerId: string,
  effectType: string,
): ChoiceValidationResult<NonNullable<EffectContext['def']['markerLattices']>[number]> => {
  const lattice = getLatticeMap(def)?.get(markerId);
  if (lattice === undefined) {
    return choiceValidationFailed(`Unknown marker lattice: ${markerId}`, {
      effectType,
      markerId,
      availableLattices: (def.markerLattices ?? []).map((l) => l.id).sort(),
    });
  }

  return choiceValidationSuccess(lattice);
};

const resolveGlobalMarkerLattice = (def: EffectContext['def'], markerId: string, effectType: string): ChoiceValidationResult<NonNullable<EffectContext['def']['globalMarkerLattices']>[number]> => {
  const lattice = def.globalMarkerLattices?.find((l) => l.id === markerId);
  if (lattice === undefined) {
    return choiceValidationFailed(`Unknown global marker lattice: ${markerId}`, {
      effectType,
      markerId,
      availableLattices: (def.globalMarkerLattices ?? []).map((l) => l.id).sort(),
    });
  }

  return choiceValidationSuccess(lattice);
};

const resolveChoiceDecisionPlayer = (
  effectType: 'chooseOne' | 'chooseN',
  chooser: PlayerSel,
  evalCtx: ReadContext,
  bind: string,
  decisionId: string,
): ChoiceValidationResult<ReturnType<typeof resolveSinglePlayerSel>> => {
  try {
    return choiceValidationSuccess(resolveSinglePlayerSel(chooser, evalCtx));
  } catch (error) {
    return choiceValidationFailed(`${effectType}.chooser must resolve to exactly one player`, {
      effectType,
      chooser,
      bind,
      decisionId,
      cause: error,
    });
  }
};

const buildComparableDomainBindingMap = (
  effectType: 'chooseOne' | 'chooseN',
  bind: string,
  decisionId: string,
  options: readonly unknown[],
  normalizedOptions: readonly MembershipScalar[],
): ChoiceValidationResult<ReadonlyMap<MembershipScalar, unknown>> => {
  const bindingMap = new Map<MembershipScalar, unknown>();
  const firstIndexByComparable = new Map<MembershipScalar, number>();
  for (let index = 0; index < normalizedOptions.length; index += 1) {
    const comparable = normalizedOptions[index];
    if (comparable === undefined) {
      return choiceValidationFailed(
        `${effectType} options domain normalization failed: ${bind}`,
        { effectType, bind, decisionId, index },
      );
    }
    const value = options[index];
    if (!bindingMap.has(comparable)) {
      bindingMap.set(comparable, value);
      firstIndexByComparable.set(comparable, index);
      continue;
    }
    const existing = bindingMap.get(comparable);
    if (!Object.is(existing, value)) {
      const firstIndex = firstIndexByComparable.get(comparable);
      return choiceValidationFailed(
        `${effectType} options domain has ambiguous comparable values: ${bind}`,
        {
          effectType,
          bind,
          decisionId,
          comparable,
          firstIndex,
          secondIndex: index,
        },
      );
    }
  }
  return choiceValidationSuccess(bindingMap);
};

export const applyChooseOne = (
  effect: Extract<EffectAST, { readonly chooseOne: unknown }>,
  env: EffectEnv,
  cursor: EffectCursor,
  scope: MutableReadScope,
  _budget: EffectBudgetState,
  _applyBatch: ApplyEffectsWithBudget,
): PartialEffectResult => {
  const resolvedBind = resolveBindingTemplate(effect.chooseOne.bind, cursor.bindings);
  const resolvedDecisionIdentity = resolveBindingTemplate(
    effect.chooseOne.decisionIdentity ?? effect.chooseOne.bind,
    cursor.bindings,
  );
  const scopeAdvance = advanceScope(cursor.decisionScope, effect.chooseOne.internalDecisionId, resolvedDecisionIdentity);
  const decisionKey = scopeAdvance.key;
  const evalCtx = updateChoiceScope(scope, env, cursor);
  const chooser = effect.chooseOne.chooser ?? 'active';
  const choiceDecisionPlayerResult = resolveChoiceDecisionPlayer('chooseOne', chooser, evalCtx, resolvedBind, decisionKey);
  if (choiceDecisionPlayerResult.outcome === 'error') {
    return choiceValidationFailureResult(cursor, choiceDecisionPlayerResult.error);
  }
  const choiceDecisionPlayer = choiceDecisionPlayerResult.value;
  const providedDecisionPlayer = env.decisionAuthority.player;
  const options = unwrapEvalQuery(evalQuery(effect.chooseOne.options, evalCtx));
  const normalizedOptionsResult = normalizeChoiceDomain(options, (issue) =>
    choiceValidationFailed(`chooseOne options domain item is not move-param encodable: ${resolvedBind}`, {
      effectType: 'chooseOne',
      bind: resolvedBind,
      bindTemplate: effect.chooseOne.bind,
      decisionKey,
      index: issue.index,
      actualType: issue.actualType,
      value: issue.value,
    }));
  if (isChoiceValidationFailure(normalizedOptionsResult)) {
    return choiceValidationFailureResult(
      cursor,
      (normalizedOptionsResult as Extract<ChoiceValidationResult<never>, { readonly outcome: 'error' }>).error,
    );
  }
  const normalizedOptions = normalizedOptionsResult;
  const comparableBindingMapResult = buildComparableDomainBindingMap('chooseOne', resolvedBind, decisionKey, options, normalizedOptions);
  if (comparableBindingMapResult.outcome === 'error') {
    return choiceValidationFailureResult(cursor, comparableBindingMapResult.error);
  }
  const comparableBindingMap = comparableBindingMapResult.value;
  const selected = env.moveParams[decisionKey];
  if (selected === undefined) {
    if (env.mode === 'discovery') {
      const targetKinds = deriveChoiceTargetKinds(effect.chooseOne.options);
      return {
        state: cursor.state,
        rng: cursor.rng,
        bindings: cursor.bindings,
        decisionScope: scopeAdvance.scope,
        pendingChoice: {
          kind: 'pending',
          complete: false,
          ...(effect.chooseOne.chooser === undefined ? {} : { decisionPlayer: choiceDecisionPlayer }),
          decisionKey,
          name: resolvedBind,
          type: 'chooseOne',
          options: normalizedOptions.map((value) => ({
            value,
            legality: 'unknown',
            illegalReason: null,
          })),
          targetKinds,
        },
      };
    }
    return choiceValidationFailureResultFromMessage(cursor, `chooseOne missing move param binding: ${resolvedBind} (${decisionKey})`, {
      effectType: 'chooseOne',
      bind: resolvedBind,
      decisionKey,
      bindTemplate: effect.chooseOne.bind,
      availableMoveParams: Object.keys(env.moveParams).sort(),
    });
  }
  if (effect.chooseOne.chooser === undefined && providedDecisionPlayer !== choiceDecisionPlayer) {
    const runtimeReason = env.decisionAuthority.ownershipEnforcement === 'probe'
      ? EFFECT_RUNTIME_REASONS.CHOICE_PROBE_AUTHORITY_MISMATCH
      : EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED;
    throw effectRuntimeError(
      runtimeReason,
      `chooseOne decision owner mismatch for "${resolvedBind}" (${decisionKey})`,
      {
        effectType: 'chooseOne',
        bind: resolvedBind,
        decisionKey,
        chooser,
        expectedDecisionPlayer: choiceDecisionPlayer,
        providedDecisionPlayer,
      },
    );
  }

  const selectedComparable = toChoiceComparableValue(selected);
  if (selectedComparable === null || !comparableBindingMap.has(selectedComparable)) {
    return choiceValidationFailureResultFromMessage(cursor,
      `invalid selection for chooseOne "${resolvedBind}" (${decisionKey}): outside options domain`,
      {
        effectType: 'chooseOne',
        bind: resolvedBind,
        bindTemplate: effect.chooseOne.bind,
        selected,
        optionsCount: normalizedOptions.length,
      },
    );
  }
  const selectedBinding = comparableBindingMap.get(selectedComparable);

  emitDecisionTrace(env.collector, {
    kind: 'decision',
    decisionKey,
    type: 'chooseOne',
    player: choiceDecisionPlayer,
    options: normalizedOptions,
    selected: [selected as MoveParamScalar],
    provenance: resolveChoiceTraceProvenance(env, cursor),
  });

  return {
    state: cursor.state,
    rng: cursor.rng,
    decisionScope: scopeAdvance.scope,
    bindings: {
      ...cursor.bindings,
      [resolvedBind]: selectedBinding,
    },
  };
};

export const applyChooseN = (
  effect: Extract<EffectAST, { readonly chooseN: unknown }>,
  env: EffectEnv,
  cursor: EffectCursor,
  scope: MutableReadScope,
  _budget: EffectBudgetState,
  _applyBatch: ApplyEffectsWithBudget,
): PartialEffectResult => {
  const chooseN = effect.chooseN;
  const bindTemplate = chooseN.bind;
  const bind = resolveBindingTemplate(bindTemplate, cursor.bindings);
  const resolvedDecisionIdentity = resolveBindingTemplate(chooseN.decisionIdentity ?? chooseN.bind, cursor.bindings);
  const scopeAdvance = advanceScope(cursor.decisionScope, chooseN.internalDecisionId, resolvedDecisionIdentity);
  const decisionKey = scopeAdvance.key;
  const evalCtx = updateChoiceScope(scope, env, cursor);
  const chooser = chooseN.chooser ?? 'active';
  const choiceDecisionPlayerResult = resolveChoiceDecisionPlayer('chooseN', chooser, evalCtx, bind, decisionKey);
  if (choiceDecisionPlayerResult.outcome === 'error') {
    return choiceValidationFailureResult(cursor, choiceDecisionPlayerResult.error);
  }
  const choiceDecisionPlayer = choiceDecisionPlayerResult.value;
  const providedDecisionPlayer = env.decisionAuthority.player;
  const cardinalityResult = resolveChooseNCardinality(chooseN, evalCtx, (issue) => {
    if (issue.code === 'CHOOSE_N_MODE_INVALID') {
      return choiceValidationFailed('chooseN must use either exact n or range max/min cardinality', {
        effectType: 'chooseN',
        bind,
        bindTemplate,
        chooseN,
      });
    }
    if (issue.code === 'CHOOSE_N_MIN_EVAL_INVALID') {
      return choiceValidationFailed('chooseN minimum cardinality must evaluate to a non-negative integer', {
        effectType: 'chooseN',
        bind,
        bindTemplate,
        min: chooseN.min ?? 0,
        evaluatedMin: issue.value,
      });
    }
    if (issue.code === 'CHOOSE_N_MAX_EVAL_INVALID') {
      return choiceValidationFailed('chooseN maximum cardinality must evaluate to a non-negative integer', {
        effectType: 'chooseN',
        bind,
        bindTemplate,
        max: chooseN.max,
        evaluatedMax: issue.value,
      });
    }
    if (issue.code === 'CHOOSE_N_MIN_INVALID') {
      return choiceValidationFailed('chooseN minimum cardinality must be a non-negative integer', {
        effectType: 'chooseN',
        bind,
        bindTemplate,
        min: issue.value,
      });
    }
    if (issue.code === 'CHOOSE_N_MAX_INVALID') {
      return choiceValidationFailed('chooseN maximum cardinality must be a non-negative integer', {
        effectType: 'chooseN',
        bind,
        bindTemplate,
        max: issue.value,
      });
    }
    return choiceValidationFailed('chooseN min cannot exceed max', {
      effectType: 'chooseN',
      bind,
      bindTemplate,
      min: issue.min,
      max: issue.max,
    });
  });
  if (isChoiceValidationFailure(cardinalityResult)) {
    return choiceValidationFailureResult(
      cursor,
      (cardinalityResult as Extract<ChoiceValidationResult<never>, { readonly outcome: 'error' }>).error,
    );
  }
  const { minCardinality, maxCardinality } = cardinalityResult;

  const options = unwrapEvalQuery(evalQuery(chooseN.options, evalCtx));
  const normalizedOptionsResult = normalizeChoiceDomain(options, (issue) =>
    choiceValidationFailed(`chooseN options domain item is not move-param encodable: ${bind}`, {
      effectType: 'chooseN',
      bind,
      decisionKey,
      index: issue.index,
      actualType: issue.actualType,
      value: issue.value,
    }));
  if (isChoiceValidationFailure(normalizedOptionsResult)) {
    return choiceValidationFailureResult(
      cursor,
      (normalizedOptionsResult as Extract<ChoiceValidationResult<never>, { readonly outcome: 'error' }>).error,
    );
  }
  const normalizedOptions = normalizedOptionsResult;
  const comparableBindingMapResult = buildComparableDomainBindingMap('chooseN', bind, decisionKey, options, normalizedOptions);
  if (comparableBindingMapResult.outcome === 'error') {
    return choiceValidationFailureResult(cursor, comparableBindingMapResult.error);
  }
  const comparableBindingMap = comparableBindingMapResult.value;
  const clampedMax = Math.min(maxCardinality, normalizedOptions.length);
  const prioritizedTierEntriesResult = resolvePrioritizedTierEntries(chooseN.options, evalCtx, bind, decisionKey);
  if (prioritizedTierEntriesResult.outcome === 'error') {
    return choiceValidationFailureResult(cursor, prioritizedTierEntriesResult.error);
  }
  const prioritizedTierEntries = prioritizedTierEntriesResult.value;
  const prioritizedQualifierMode = chooseN.options.query === 'prioritized' && chooseN.options.qualifierKey !== undefined
    ? 'byQualifier'
    : 'none';
  const selectedValue = env.moveParams[decisionKey];
  if (selectedValue === undefined) {
    if (env.mode === 'discovery') {
      const transientSelected = env.transientDecisionSelections?.[decisionKey] ?? [];
      if (transientSelected.length > clampedMax) {
        return choiceValidationFailureResultFromMessage(cursor, `chooseN selection cardinality mismatch for: ${bind}`, {
          effectType: 'chooseN',
          bind,
          min: minCardinality,
          max: clampedMax,
          actual: transientSelected.length,
        });
      }

      const selectedSequenceResult = normalizeChooseNSelectionValues(transientSelected, bind, decisionKey);
      if (selectedSequenceResult.outcome === 'error') {
        return choiceValidationFailureResult(cursor, selectedSequenceResult.error);
      }
      const selectedSequence = selectedSequenceResult.value;
      const sequenceValidationResult = validateChooseNSelectionSequence(
        selectedSequence,
        comparableBindingMap,
        normalizedOptions,
        prioritizedTierEntries,
        prioritizedQualifierMode,
        bind,
        decisionKey,
      );
      if (sequenceValidationResult.outcome === 'error') {
        return choiceValidationFailureResult(cursor, sequenceValidationResult.error);
      }
      const targetKinds = deriveChoiceTargetKinds(chooseN.options);
      const pendingChoice = buildChooseNPendingChoice({
        choiceDecisionPlayer,
        chooser: chooseN.chooser,
        decisionKey,
        name: bind,
        normalizedOptions,
        targetKinds,
        minCardinality,
        maxCardinality: clampedMax,
        selectedSequence,
        prioritizedTierEntries,
        prioritizedQualifierMode,
      });

      if (env.chooseNTemplateCallback !== undefined) {
        const action = env.def.actions.find((a: { readonly id: unknown }) => String(a.id) === env.traceContext?.actionId);
        const template = createChooseNTemplate({
          decisionKey,
          name: bind,
          normalizedOptions,
          targetKinds,
          minCardinality,
          maxCardinality: clampedMax,
          prioritizedTierEntries,
          qualifierMode: prioritizedQualifierMode,
          preparedContext: {
            def: env.def,
            state: cursor.state,
            action: action!,
            adjacencyGraph: env.adjacencyGraph,
            runtimeTableIndex: env.runtimeTableIndex ?? buildRuntimeTableIndex(env.def),
            seatResolution: createSeatResolutionContext(env.def, cursor.state.playerCount),
          },
          partialMoveIdentity: {
            actionId: env.traceContext?.actionId ?? '',
            params: env.moveParams as Readonly<Record<string, unknown>>,
          },
          choiceDecisionPlayer,
          chooser: chooseN.chooser,
        });
        env.chooseNTemplateCallback(template);
      }

      return {
        state: cursor.state,
        rng: cursor.rng,
        bindings: cursor.bindings,
        decisionScope: scopeAdvance.scope,
        pendingChoice,
      };
    }
    return choiceValidationFailureResultFromMessage(cursor, `chooseN missing move param binding: ${bind} (${decisionKey})`, {
      effectType: 'chooseN',
      bind,
      decisionKey,
      availableMoveParams: Object.keys(env.moveParams).sort(),
    });
  }
  if (chooseN.chooser === undefined && providedDecisionPlayer !== choiceDecisionPlayer) {
    const runtimeReason = env.decisionAuthority.ownershipEnforcement === 'probe'
      ? EFFECT_RUNTIME_REASONS.CHOICE_PROBE_AUTHORITY_MISMATCH
      : EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED;
    throw effectRuntimeError(
      runtimeReason,
      `chooseN decision owner mismatch for "${bind}" (${decisionKey})`,
      {
        effectType: 'chooseN',
        bind,
        decisionKey,
        chooser,
        expectedDecisionPlayer: choiceDecisionPlayer,
        providedDecisionPlayer,
      },
    );
  }
  if (!Array.isArray(selectedValue)) {
    return choiceValidationFailureResultFromMessage(cursor, `chooseN move param must be an array: ${bind}`, {
      effectType: 'chooseN',
      bind,
      actualType: typeof selectedValue,
      value: selectedValue,
    });
  }

  if (selectedValue.length < minCardinality || selectedValue.length > clampedMax) {
    return choiceValidationFailureResultFromMessage(cursor, `chooseN selection cardinality mismatch for: ${bind}`, {
      effectType: 'chooseN',
      bind,
      min: minCardinality,
      max: clampedMax,
      actual: selectedValue.length,
    });
  }

  const selectedSequenceResult = normalizeChooseNSelectionValues(selectedValue, bind, decisionKey);
  if (selectedSequenceResult.outcome === 'error') {
    return choiceValidationFailureResult(cursor, selectedSequenceResult.error);
  }
  const selectedSequence = selectedSequenceResult.value;
  const sequenceValidationResult = validateChooseNSelectionSequence(
    selectedSequence,
    comparableBindingMap,
    normalizedOptions,
    prioritizedTierEntries,
    prioritizedQualifierMode,
    bind,
    decisionKey,
  );
  if (sequenceValidationResult.outcome === 'error') {
    return choiceValidationFailureResult(cursor, sequenceValidationResult.error);
  }
  const selectedBindings: unknown[] = [];
  for (const selected of selectedSequence) {
    selectedBindings.push(comparableBindingMap.get(selected));
  }

  emitDecisionTrace(env.collector, {
    kind: 'decision',
    decisionKey,
    type: 'chooseN',
    player: choiceDecisionPlayer,
    options: normalizedOptions,
    selected: selectedSequence,
    min: minCardinality,
    max: clampedMax,
    provenance: resolveChoiceTraceProvenance(env, cursor),
  });

  return {
    state: cursor.state,
    rng: cursor.rng,
    decisionScope: scopeAdvance.scope,
    bindings: {
      ...cursor.bindings,
      [bind]: selectedBindings,
    },
  };
};

export const applyRollRandom = (
  effect: Extract<EffectAST, { readonly rollRandom: unknown }>,
  env: EffectEnv,
  cursor: EffectCursor,
  scope: MutableReadScope,
  budget: EffectBudgetState,
  applyBatch: ApplyEffectsWithBudget,
): PartialEffectResult => {
  const evalCtx = updateChoiceScope(scope, env, cursor);
  const resolvedBindings = evalCtx.bindings;
  const minValue = evalValue(effect.rollRandom.min, evalCtx);
  const maxValue = evalValue(effect.rollRandom.max, evalCtx);

  if (typeof minValue !== 'number' || !Number.isSafeInteger(minValue)) {
    return choiceValidationFailureResultFromMessage(cursor, 'rollRandom.min must evaluate to a safe integer', {
      effectType: 'rollRandom',
      actualType: typeof minValue,
      value: minValue,
    });
  }

  if (typeof maxValue !== 'number' || !Number.isSafeInteger(maxValue)) {
    return choiceValidationFailureResultFromMessage(cursor, 'rollRandom.max must evaluate to a safe integer', {
      effectType: 'rollRandom',
      actualType: typeof maxValue,
      value: maxValue,
    });
  }

  if (minValue > maxValue) {
    return choiceValidationFailureResultFromMessage(cursor, `rollRandom requires min <= max, received min=${minValue}, max=${maxValue}`, {
      effectType: 'rollRandom',
      min: minValue,
      max: maxValue,
    });
  }

  const traceSuffix = '.rollRandom.in';
  const tracedEffectPath = (env.collector.trace !== null || env.collector.conditionTrace !== null)
    ? `${cursor.effectPath ?? ''}${traceSuffix}`
    : cursor.effectPath;

  const fixedBinding = resolvedBindings[effect.rollRandom.bind];
  if (fixedBinding !== undefined) {
    const rolledValueResult = resolveFixedRandomBinding(effect.rollRandom.bind, fixedBinding, minValue, maxValue);
    if (rolledValueResult.outcome === 'error') {
      return choiceValidationFailureResult(cursor, rolledValueResult.error);
    }
    const rolledValue = rolledValueResult.value;
    const nestedCursor: EffectCursor = {
      ...cursor,
      bindings: {
        ...cursor.bindings,
        [effect.rollRandom.bind]: rolledValue,
      },
      ...(tracedEffectPath === cursor.effectPath ? {} : { effectPath: tracedEffectPath }),
    };
    const nestedResult = applyBatch(effect.rollRandom.in, env, nestedCursor, budget);
    return {
      state: nestedResult.state,
      rng: nestedResult.rng,
      ...(nestedResult.emittedEvents === undefined ? {} : { emittedEvents: nestedResult.emittedEvents }),
      ...(nestedResult.pendingChoice === undefined ? {} : { pendingChoice: nestedResult.pendingChoice }),
      bindings: cursor.bindings,
    };
  }

  if (env.mode === 'discovery') {
    const outcomes: ChoiceStochasticOutcome[] = [];
    for (let rolledValue = minValue; rolledValue <= maxValue; rolledValue += 1) {
      const nestedCursor: EffectCursor = {
        ...cursor,
        bindings: {
          ...cursor.bindings,
          [effect.rollRandom.bind]: rolledValue,
        },
        ...(tracedEffectPath === cursor.effectPath ? {} : { effectPath: tracedEffectPath }),
      };
      const nestedResult = applyBatch(effect.rollRandom.in, env, nestedCursor, budget);
      outcomes.push(...collectNestedOutcomes(effect.rollRandom.bind, rolledValue, nestedResult.pendingChoice));
    }

    if (outcomes.length === 0) {
      return { state: cursor.state, rng: cursor.rng, bindings: cursor.bindings };
    }
    if (outcomes.every((outcome) => outcome.nextDecision === undefined)) {
      const pendingChoiceResult = toStochasticPendingChoice(outcomes);
      if (pendingChoiceResult.outcome === 'error') {
        return choiceValidationFailureResult(cursor, pendingChoiceResult.error);
      }
      return {
        state: cursor.state,
        rng: cursor.rng,
        bindings: cursor.bindings,
        pendingChoice: pendingChoiceResult.value,
      };
    }

    const pendingByDecisionKey = new Map<string, ChoicePendingRequest[]>();
    for (const outcome of outcomes) {
      if (outcome.nextDecision === undefined) {
        continue;
      }
      const decisionKey = outcome.nextDecision.decisionKey as string;
      const existing = pendingByDecisionKey.get(decisionKey);
      if (existing === undefined) {
        pendingByDecisionKey.set(decisionKey, [outcome.nextDecision]);
      } else {
        existing.push(outcome.nextDecision);
      }
    }

    const pendingChoice: ChoiceValidationResult<ChoicePendingRequest | ChoiceStochasticPendingRequest> =
      pendingByDecisionKey.size === 1 && outcomes.every((outcome) => outcome.nextDecision !== undefined)
        ? (() => {
          const selectedDecisionKey = pendingByDecisionKey.keys().next().value as string;
          const mergedPendingChoicesResult = mergePendingChoiceRequests(pendingByDecisionKey.get(selectedDecisionKey)!);
          if (mergedPendingChoicesResult.outcome === 'error') {
            return mergedPendingChoicesResult;
          }
          const mergedPendingChoices = mergedPendingChoicesResult.value;
          return choiceValidationSuccess(mergedPendingChoices.length === 1
            ? mergedPendingChoices[0]!
            : {
              kind: 'pendingStochastic',
              complete: false,
              source: 'rollRandom',
              alternatives: mergedPendingChoices,
              outcomes,
            });
        })()
        : toStochasticPendingChoice(outcomes);
    if (pendingChoice.outcome === 'error') {
      return choiceValidationFailureResult(cursor, pendingChoice.error);
    }
    return {
      state: cursor.state,
      rng: cursor.rng,
      bindings: cursor.bindings,
      pendingChoice: pendingChoice.value,
    };
  }

  const [rolledValue, nextRng] = nextInt(cursor.rng, minValue, maxValue);
  const nestedCursor: EffectCursor = {
    ...cursor,
    rng: nextRng,
    bindings: {
      ...cursor.bindings,
      [effect.rollRandom.bind]: rolledValue,
    },
    ...(tracedEffectPath === cursor.effectPath ? {} : { effectPath: tracedEffectPath }),
  };

  const nestedResult = applyBatch(effect.rollRandom.in, env, nestedCursor, budget);
  return {
    state: nestedResult.state,
    rng: nestedResult.rng,
    ...(nestedResult.emittedEvents === undefined ? {} : { emittedEvents: nestedResult.emittedEvents }),
    bindings: cursor.bindings,
  };
};

export const applySetMarker = (
  effect: Extract<EffectAST, { readonly setMarker: unknown }>,
  env: EffectEnv,
  cursor: EffectCursor,
  scope: MutableReadScope,
  _budget: EffectBudgetState,
  _applyBatch: ApplyEffectsWithBudget,
): PartialEffectResult => {
  const { space, marker, state: stateExpr } = effect.setMarker;
  const evalCtx = updateChoiceScope(scope, env, cursor);
  const onResolutionFailure = selectorResolutionFailurePolicyForMode(env.mode);
  const spaceId = resolveZoneWithNormalization(space, evalCtx, {
    code: EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED,
    effectType: 'setMarker',
    scope: 'space',
    resolutionFailureMessage: 'setMarker.space zone resolution failed',
    onResolutionFailure,
  });
  const evaluatedState = evalValue(stateExpr, evalCtx);

  if (typeof evaluatedState !== 'string') {
    return choiceValidationFailureResultFromMessage(cursor, 'setMarker.state must evaluate to a string', {
      effectType: 'setMarker',
      actualType: typeof evaluatedState,
      value: evaluatedState,
    });
  }

  const latticeResult = resolveMarkerLattice(env.def, marker, 'setMarker');
  if (latticeResult.outcome === 'error') {
    return choiceValidationFailureResult(cursor, latticeResult.error);
  }
  const lattice = latticeResult.value;
  if (!lattice.states.includes(evaluatedState)) {
    return choiceValidationFailureResultFromMessage(cursor, `Invalid marker state "${evaluatedState}" for lattice "${marker}"`, {
      effectType: 'setMarker',
      marker,
      state: evaluatedState,
      validStates: lattice.states,
    });
  }

  const setViolation = findSpaceMarkerConstraintViolation(lattice, String(spaceId), evaluatedState, evalCtx, evalConditionRaw);
  if (setViolation !== null) {
    return choiceValidationFailureResultFromMessage(cursor,
      `Marker state "${evaluatedState}" is illegal for lattice "${marker}" in space "${String(spaceId)}"`,
      {
        effectType: 'setMarker',
        marker,
        state: evaluatedState,
        spaceId: String(spaceId),
        constraintIndex: setViolation.constraintIndex,
        allowedStates: setViolation.constraint.allowedStates,
      },
    );
  }

  if (cursor.tracker) {
    const sid = String(spaceId);
    const oldExplicit = cursor.state.markers[sid]?.[marker];
    ensureMarkerCloned(cursor.state as MutableGameState, cursor.tracker, sid);
    (cursor.state.markers[sid] as Record<string, string>)[marker] = evaluatedState;
    const table = env.cachedRuntime?.zobristTable;
    if (table) {
      const ms = cursor.state as MutableGameState;
      const newF: ZobristFeature = { kind: 'markerState', spaceId: sid, markerId: marker, state: evaluatedState };
      if (oldExplicit !== undefined) {
        const oldF: ZobristFeature = { kind: 'markerState', spaceId: sid, markerId: marker, state: oldExplicit };
        updateRunningHash(ms, table, oldF, newF);
      } else {
        addToRunningHash(ms, table, newF);
      }
    }
    return { state: cursor.state, rng: cursor.rng };
  }

  const spaceMarkers = cursor.state.markers[String(spaceId)] ?? {};
  return {
    state: {
      ...cursor.state,
      markers: {
        ...cursor.state.markers,
        [String(spaceId)]: {
          ...spaceMarkers,
          [marker]: evaluatedState,
        },
      },
    },
    rng: cursor.rng,
  };
};

export const applyShiftMarker = (
  effect: Extract<EffectAST, { readonly shiftMarker: unknown }>,
  env: EffectEnv,
  cursor: EffectCursor,
  scope: MutableReadScope,
  _budget: EffectBudgetState,
  _applyBatch: ApplyEffectsWithBudget,
): PartialEffectResult => {
  const { space, marker, delta: deltaExpr } = effect.shiftMarker;
  const evalCtx = updateChoiceScope(scope, env, cursor);
  const onResolutionFailure = selectorResolutionFailurePolicyForMode(env.mode);
  const spaceId = resolveZoneWithNormalization(space, evalCtx, {
    code: EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED,
    effectType: 'shiftMarker',
    scope: 'space',
    resolutionFailureMessage: 'shiftMarker.space zone resolution failed',
    onResolutionFailure,
  });
  const evaluatedDelta = evalValue(deltaExpr, evalCtx);

  if (typeof evaluatedDelta !== 'number' || !Number.isSafeInteger(evaluatedDelta)) {
    return choiceValidationFailureResultFromMessage(cursor, 'shiftMarker.delta must evaluate to a safe integer', {
      effectType: 'shiftMarker',
      actualType: typeof evaluatedDelta,
      value: evaluatedDelta,
    });
  }

  const latticeResult = resolveMarkerLattice(env.def, marker, 'shiftMarker');
  if (latticeResult.outcome === 'error') {
    return choiceValidationFailureResult(cursor, latticeResult.error);
  }
  const lattice = latticeResult.value;
  const spaceMarkers = cursor.state.markers[String(spaceId)] ?? {};
  let resolution;
  try {
    resolution = resolveSpaceMarkerShift(lattice, String(spaceId), evaluatedDelta, evalCtx, evalConditionRaw);
  } catch (error) {
    return choiceValidationFailureResultFromMessage(cursor,
      error instanceof Error ? error.message : `Failed to resolve marker shift for lattice "${marker}"`,
      {
        effectType: 'shiftMarker',
        marker,
        cause: error,
        validStates: lattice.states,
      },
    );
  }
  const newState = resolution.destinationState;

  if (!resolution.changed) {
    return { state: cursor.state, rng: cursor.rng };
  }

  // If the destination state violates a space marker constraint, treat the
  // shift as a no-op (same as boundary clamping).  A game may define
  // constraints that lock certain spaces to specific marker states — a
  // shift attempt there is structurally valid but has no effect.
  if (resolution.violation !== null) {
    return { state: cursor.state, rng: cursor.rng };
  }

  if (cursor.tracker) {
    const sid = String(spaceId);
    const oldExplicit = spaceMarkers[marker];
    ensureMarkerCloned(cursor.state as MutableGameState, cursor.tracker, sid);
    (cursor.state.markers[sid] as Record<string, string>)[marker] = newState;
    const table = env.cachedRuntime?.zobristTable;
    if (table) {
      const ms = cursor.state as MutableGameState;
      const newF: ZobristFeature = { kind: 'markerState', spaceId: sid, markerId: marker, state: newState };
      if (oldExplicit !== undefined) {
        const oldF: ZobristFeature = { kind: 'markerState', spaceId: sid, markerId: marker, state: oldExplicit };
        updateRunningHash(ms, table, oldF, newF);
      } else {
        addToRunningHash(ms, table, newF);
      }
    }
    return { state: cursor.state, rng: cursor.rng };
  }

  return {
    state: {
      ...cursor.state,
      markers: {
        ...cursor.state.markers,
        [String(spaceId)]: {
          ...spaceMarkers,
          [marker]: newState,
        },
      },
    },
    rng: cursor.rng,
  };
};

export const applySetGlobalMarker = (
  effect: Extract<EffectAST, { readonly setGlobalMarker: unknown }>,
  env: EffectEnv,
  cursor: EffectCursor,
  scope: MutableReadScope,
  _budget: EffectBudgetState,
  _applyBatch: ApplyEffectsWithBudget,
): PartialEffectResult => {
  const { marker, state: stateExpr } = effect.setGlobalMarker;
  const evalCtx = updateChoiceScope(scope, env, cursor);
  const evaluatedState = evalValue(stateExpr, evalCtx);

  if (typeof evaluatedState !== 'string') {
    return choiceValidationFailureResultFromMessage(cursor, 'setGlobalMarker.state must evaluate to a string', {
      effectType: 'setGlobalMarker',
      actualType: typeof evaluatedState,
      value: evaluatedState,
    });
  }

  const latticeResult = resolveGlobalMarkerLattice(env.def, marker, 'setGlobalMarker');
  if (latticeResult.outcome === 'error') {
    return choiceValidationFailureResult(cursor, latticeResult.error);
  }
  const lattice = latticeResult.value;
  if (!lattice.states.includes(evaluatedState)) {
    return choiceValidationFailureResultFromMessage(cursor, `Invalid marker state "${evaluatedState}" for lattice "${marker}"`, {
      effectType: 'setGlobalMarker',
      marker,
      state: evaluatedState,
      validStates: lattice.states,
    });
  }

  if (cursor.tracker) {
    const oldExplicit = cursor.state.globalMarkers?.[marker];
    ((cursor.state as { globalMarkers: Record<string, string> }).globalMarkers ??= {})[marker] = evaluatedState;
    const table = env.cachedRuntime?.zobristTable;
    if (table) {
      const ms = cursor.state as MutableGameState;
      const newF: ZobristFeature = { kind: 'globalMarkerState', markerId: marker, state: evaluatedState };
      if (oldExplicit !== undefined) {
        const oldF: ZobristFeature = { kind: 'globalMarkerState', markerId: marker, state: oldExplicit };
        updateRunningHash(ms, table, oldF, newF);
      } else {
        addToRunningHash(ms, table, newF);
      }
    }
    return { state: cursor.state, rng: cursor.rng };
  }

  return {
    state: {
      ...cursor.state,
      globalMarkers: {
        ...(cursor.state.globalMarkers ?? {}),
        [marker]: evaluatedState,
      },
    },
    rng: cursor.rng,
  };
};

export const applyShiftGlobalMarker = (
  effect: Extract<EffectAST, { readonly shiftGlobalMarker: unknown }>,
  env: EffectEnv,
  cursor: EffectCursor,
  scope: MutableReadScope,
  _budget: EffectBudgetState,
  _applyBatch: ApplyEffectsWithBudget,
): PartialEffectResult => {
  const { marker, delta: deltaExpr } = effect.shiftGlobalMarker;
  const evalCtx = updateChoiceScope(scope, env, cursor);
  const evaluatedDelta = evalValue(deltaExpr, evalCtx);

  if (typeof evaluatedDelta !== 'number' || !Number.isSafeInteger(evaluatedDelta)) {
    return choiceValidationFailureResultFromMessage(cursor, 'shiftGlobalMarker.delta must evaluate to a safe integer', {
      effectType: 'shiftGlobalMarker',
      actualType: typeof evaluatedDelta,
      value: evaluatedDelta,
    });
  }

  const latticeResult = resolveGlobalMarkerLattice(env.def, marker, 'shiftGlobalMarker');
  if (latticeResult.outcome === 'error') {
    return choiceValidationFailureResult(cursor, latticeResult.error);
  }
  const lattice = latticeResult.value;
  const currentState = cursor.state.globalMarkers?.[marker] ?? lattice.defaultState;
  const currentIndex = lattice.states.indexOf(currentState);

  if (currentIndex < 0) {
    return choiceValidationFailureResultFromMessage(cursor, `Current marker state "${currentState}" not found in lattice "${marker}"`, {
      effectType: 'shiftGlobalMarker',
      marker,
      currentState,
      validStates: lattice.states,
    });
  }

  const newIndex = Math.max(0, Math.min(lattice.states.length - 1, currentIndex + evaluatedDelta));
  const newState = lattice.states[newIndex]!;

  if (newState === currentState) {
    return { state: cursor.state, rng: cursor.rng };
  }

  if (cursor.tracker) {
    const oldExplicit = cursor.state.globalMarkers?.[marker];
    ((cursor.state as { globalMarkers: Record<string, string> }).globalMarkers ??= {})[marker] = newState;
    const table = env.cachedRuntime?.zobristTable;
    if (table) {
      const ms = cursor.state as MutableGameState;
      const newF: ZobristFeature = { kind: 'globalMarkerState', markerId: marker, state: newState };
      if (oldExplicit !== undefined) {
        const oldF: ZobristFeature = { kind: 'globalMarkerState', markerId: marker, state: oldExplicit };
        updateRunningHash(ms, table, oldF, newF);
      } else {
        addToRunningHash(ms, table, newF);
      }
    }
    return { state: cursor.state, rng: cursor.rng };
  }

  return {
    state: {
      ...cursor.state,
      globalMarkers: {
        ...(cursor.state.globalMarkers ?? {}),
        [marker]: newState,
      },
    },
    rng: cursor.rng,
  };
};

export const applyFlipGlobalMarker = (
  effect: Extract<EffectAST, { readonly flipGlobalMarker: unknown }>,
  env: EffectEnv,
  cursor: EffectCursor,
  scope: MutableReadScope,
  _budget: EffectBudgetState,
  _applyBatch: ApplyEffectsWithBudget,
): PartialEffectResult => {
  const { marker: markerExpr, stateA: stateAExpr, stateB: stateBExpr } = effect.flipGlobalMarker;
  const evalCtx = updateChoiceScope(scope, env, cursor);
  const evaluatedMarker = evalValue(markerExpr, evalCtx);
  const evaluatedStateA = evalValue(stateAExpr, evalCtx);
  const evaluatedStateB = evalValue(stateBExpr, evalCtx);

  if (typeof evaluatedMarker !== 'string') {
    return choiceValidationFailureResultFromMessage(cursor, 'flipGlobalMarker.marker must evaluate to a string', {
      effectType: 'flipGlobalMarker',
      actualType: typeof evaluatedMarker,
      value: evaluatedMarker,
    });
  }
  if (typeof evaluatedStateA !== 'string') {
    return choiceValidationFailureResultFromMessage(cursor, 'flipGlobalMarker.stateA must evaluate to a string', {
      effectType: 'flipGlobalMarker',
      actualType: typeof evaluatedStateA,
      value: evaluatedStateA,
    });
  }
  if (typeof evaluatedStateB !== 'string') {
    return choiceValidationFailureResultFromMessage(cursor, 'flipGlobalMarker.stateB must evaluate to a string', {
      effectType: 'flipGlobalMarker',
      actualType: typeof evaluatedStateB,
      value: evaluatedStateB,
    });
  }
  if (evaluatedStateA === evaluatedStateB) {
    return choiceValidationFailureResultFromMessage(cursor, 'flipGlobalMarker requires two distinct states', {
      effectType: 'flipGlobalMarker',
      marker: evaluatedMarker,
      stateA: evaluatedStateA,
      stateB: evaluatedStateB,
    });
  }

  const latticeResult = resolveGlobalMarkerLattice(env.def, evaluatedMarker, 'flipGlobalMarker');
  if (latticeResult.outcome === 'error') {
    return choiceValidationFailureResult(cursor, latticeResult.error);
  }
  const lattice = latticeResult.value;
  if (!lattice.states.includes(evaluatedStateA)) {
    return choiceValidationFailureResultFromMessage(cursor,
      `Invalid stateA "${evaluatedStateA}" for lattice "${evaluatedMarker}" in flipGlobalMarker`,
      {
        effectType: 'flipGlobalMarker',
        marker: evaluatedMarker,
        stateA: evaluatedStateA,
        validStates: lattice.states,
      },
    );
  }
  if (!lattice.states.includes(evaluatedStateB)) {
    return choiceValidationFailureResultFromMessage(cursor,
      `Invalid stateB "${evaluatedStateB}" for lattice "${evaluatedMarker}" in flipGlobalMarker`,
      {
        effectType: 'flipGlobalMarker',
        marker: evaluatedMarker,
        stateB: evaluatedStateB,
        validStates: lattice.states,
      },
    );
  }

  const currentState = cursor.state.globalMarkers?.[evaluatedMarker] ?? lattice.defaultState;
  let nextState: string | null;
  if (currentState === evaluatedStateA) {
    nextState = evaluatedStateB;
  } else if (currentState === evaluatedStateB) {
    nextState = evaluatedStateA;
  } else {
    return choiceValidationFailureResultFromMessage(cursor,
      `flipGlobalMarker current state "${currentState}" is not flippable between "${evaluatedStateA}" and "${evaluatedStateB}"`,
      {
        effectType: 'flipGlobalMarker',
        marker: evaluatedMarker,
        currentState,
        stateA: evaluatedStateA,
        stateB: evaluatedStateB,
      },
    );
  }

  if (cursor.tracker) {
    const oldExplicit = cursor.state.globalMarkers?.[evaluatedMarker];
    ((cursor.state as { globalMarkers: Record<string, string> }).globalMarkers ??= {})[evaluatedMarker] = nextState;
    const table = env.cachedRuntime?.zobristTable;
    if (table) {
      const ms = cursor.state as MutableGameState;
      const newF: ZobristFeature = { kind: 'globalMarkerState', markerId: evaluatedMarker, state: nextState };
      if (oldExplicit !== undefined) {
        const oldF: ZobristFeature = { kind: 'globalMarkerState', markerId: evaluatedMarker, state: oldExplicit };
        updateRunningHash(ms, table, oldF, newF);
      } else {
        addToRunningHash(ms, table, newF);
      }
    }
    return { state: cursor.state, rng: cursor.rng };
  }

  return {
    state: {
      ...cursor.state,
      globalMarkers: {
        ...(cursor.state.globalMarkers ?? {}),
        [evaluatedMarker]: nextState,
      },
    },
    rng: cursor.rng,
  };
};
