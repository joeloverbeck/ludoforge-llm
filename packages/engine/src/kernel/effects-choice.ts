import { getLatticeMap } from './def-lookup.js';
import { evalQuery } from './eval-query.js';
import { evalCondition } from './eval-condition.js';
import { evalValue } from './eval-value.js';
import { advanceScope, type DecisionKey } from './decision-scope.js';
import { createChooseNTemplate } from './choose-n-session.js';
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
import { mergeToReadContext } from './effect-context.js';
import { ensureMarkerCloned, type MutableGameState } from './state-draft.js';
import { addToRunningHash, updateRunningHash } from './zobrist.js';
import type { ZobristFeature } from './types-core.js';
import type { EffectContext, EffectCursor, EffectEnv, PartialEffectResult } from './effect-context.js';
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
): readonly (readonly PrioritizedTierEntry[])[] | null => {
  if (query.query !== 'prioritized') {
    return null;
  }

  return query.tiers.map((tierQuery, tierIndex) => {
    const tierResults = evalQuery(tierQuery, evalCtx);
    const normalizedTier = normalizeChoiceDomain(tierResults, (issue) => {
      throw effectRuntimeError(
        EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED,
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
      );
    });

    return normalizedTier.map((value, itemIndex) => {
      const tierResult = tierResults[itemIndex];
      if (query.qualifierKey === undefined) {
        return { value };
      }
      if (!isTokenQueryResult(tierResult)) {
        throw effectRuntimeError(
          EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED,
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
        throw effectRuntimeError(
          EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED,
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
      return qualifier === undefined ? { value } : { value, qualifier };
    });
  });
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
): readonly MoveParamScalar[] => {
  const normalizedSelected: MoveParamScalar[] = [];

  for (let index = 0; index < selectedValue.length; index += 1) {
    const comparable = toChoiceComparableValue(selectedValue[index]);
    if (comparable === null) {
      throw effectRuntimeError(EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED, `chooseN selection is not move-param encodable: ${bind}`, {
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
        throw effectRuntimeError(EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED, `chooseN selections must be unique: ${bind}`, {
          effectType: 'chooseN',
          bind,
          duplicateValue: normalizedSelected[left],
        });
      }
    }
  }

  return normalizedSelected;
};

const validateChooseNSelectionSequence = (
  selectedSequence: readonly MoveParamScalar[],
  comparableBindingMap: ReadonlyMap<MembershipScalar, unknown>,
  normalizedOptions: readonly MoveParamScalar[],
  prioritizedTierEntries: readonly (readonly PrioritizedTierEntry[])[] | null,
  prioritizedQualifierMode: 'none' | 'byQualifier',
  bind: string,
  decisionKey: string,
): void => {
  const failures = validateChooseNSelectedSequence({
    normalizedDomain: normalizedOptions,
    tiers: prioritizedTierEntries,
    qualifierMode: prioritizedQualifierMode,
    selectedSequence,
  });

  for (const failure of failures) {
    if (failure.reason === 'out-of-domain') {
      throw effectRuntimeError(
        EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED,
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
      throw effectRuntimeError(
        EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED,
        `chooseN selections must be unique: ${bind}`,
        {
          effectType: 'chooseN',
          bind,
          duplicateValue: failure.value,
        },
      );
    }
    if (failure.reason === 'tier-blocked') {
      throw effectRuntimeError(
        EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED,
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
): readonly ChoicePendingRequest[] => {
  const [first, ...rest] = pendingChoices;
  if (first === undefined) {
    throw new Error('mergePendingChoiceRequests requires at least one pending choice');
  }

  for (const pending of rest) {
    if (pending.type !== first.type) {
      throw effectRuntimeError(
        EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED,
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
      throw effectRuntimeError(
        EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED,
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
      throw effectRuntimeError(
        EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED,
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
    return [normalizedFirst];
  }

  return [...distinctAlternatives.values()];
};

const toStochasticPendingChoice = (
  outcomes: readonly ChoiceStochasticOutcome[],
): ChoiceStochasticPendingRequest => {
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
  const alternatives = [...pendingByDecisionKey.entries()]
    .sort(([leftId], [rightId]) => leftId.localeCompare(rightId))
    .flatMap(([, requests]) => mergePendingChoiceRequests(requests));
  return {
    kind: 'pendingStochastic',
    complete: false,
    source: 'rollRandom',
    alternatives,
    outcomes,
  };
};

const resolveFixedRandomBinding = (
  bind: string,
  value: unknown,
  minValue: number,
  maxValue: number,
): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw effectRuntimeError(
      EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED,
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
    throw effectRuntimeError(
      EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED,
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
  return value;
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

const mergeChoiceToReadContext = (env: EffectEnv, cursor: EffectCursor): ReadContext =>
  mergeToReadContext(env, {
    ...cursor,
    bindings: resolveChoiceBindings(env, cursor),
  });

const resolveChoiceTraceProvenance = (env: EffectEnv, cursor: EffectCursor): ReturnType<typeof resolveTraceProvenance> =>
  resolveTraceProvenance({
    state: cursor.state,
    ...(env.traceContext === undefined ? {} : { traceContext: env.traceContext }),
    ...(cursor.effectPath === undefined ? {} : { effectPath: cursor.effectPath }),
  });

const resolveMarkerLattice = (def: EffectContext['def'], markerId: string, effectType: string): NonNullable<EffectContext['def']['markerLattices']>[number] => {
  const lattice = getLatticeMap(def)?.get(markerId);
  if (lattice === undefined) {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED, `Unknown marker lattice: ${markerId}`, {
      effectType,
      markerId,
      availableLattices: (def.markerLattices ?? []).map((l) => l.id).sort(),
    });
  }

  return lattice;
};

const resolveGlobalMarkerLattice = (def: EffectContext['def'], markerId: string, effectType: string): NonNullable<EffectContext['def']['globalMarkerLattices']>[number] => {
  const lattice = def.globalMarkerLattices?.find((l) => l.id === markerId);
  if (lattice === undefined) {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED, `Unknown global marker lattice: ${markerId}`, {
      effectType,
      markerId,
      availableLattices: (def.globalMarkerLattices ?? []).map((l) => l.id).sort(),
    });
  }

  return lattice;
};

const resolveChoiceDecisionPlayer = (
  effectType: 'chooseOne' | 'chooseN',
  chooser: PlayerSel,
  evalCtx: ReadContext,
  bind: string,
  decisionId: string,
): ReturnType<typeof resolveSinglePlayerSel> => {
  try {
    return resolveSinglePlayerSel(chooser, evalCtx);
  } catch (error) {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED, `${effectType}.chooser must resolve to exactly one player`, {
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
): ReadonlyMap<MembershipScalar, unknown> => {
  const bindingMap = new Map<MembershipScalar, unknown>();
  const firstIndexByComparable = new Map<MembershipScalar, number>();
  for (let index = 0; index < normalizedOptions.length; index += 1) {
    const comparable = normalizedOptions[index];
    if (comparable === undefined) {
      throw effectRuntimeError(
        EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED,
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
      throw effectRuntimeError(
        EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED,
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
  return bindingMap;
};

export const applyChooseOne = (
  effect: Extract<EffectAST, { readonly chooseOne: unknown }>,
  env: EffectEnv,
  cursor: EffectCursor,
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
  const evalCtx = mergeChoiceToReadContext(env, cursor);
  const chooser = effect.chooseOne.chooser ?? 'active';
  const choiceDecisionPlayer = resolveChoiceDecisionPlayer('chooseOne', chooser, evalCtx, resolvedBind, decisionKey);
  const providedDecisionPlayer = env.decisionAuthority.player;
  const options = evalQuery(effect.chooseOne.options, evalCtx);
  const normalizedOptions = normalizeChoiceDomain(options, (issue) => {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED, `chooseOne options domain item is not move-param encodable: ${resolvedBind}`, {
      effectType: 'chooseOne',
      bind: resolvedBind,
      bindTemplate: effect.chooseOne.bind,
      decisionKey,
      index: issue.index,
      actualType: issue.actualType,
      value: issue.value,
    });
  });
  const comparableBindingMap = buildComparableDomainBindingMap('chooseOne', resolvedBind, decisionKey, options, normalizedOptions);
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
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED, `chooseOne missing move param binding: ${resolvedBind} (${decisionKey})`, {
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
    throw effectRuntimeError(
      EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED,
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
  _budget: EffectBudgetState,
  _applyBatch: ApplyEffectsWithBudget,
): PartialEffectResult => {
  const chooseN = effect.chooseN;
  const bindTemplate = chooseN.bind;
  const bind = resolveBindingTemplate(bindTemplate, cursor.bindings);
  const resolvedDecisionIdentity = resolveBindingTemplate(chooseN.decisionIdentity ?? chooseN.bind, cursor.bindings);
  const scopeAdvance = advanceScope(cursor.decisionScope, chooseN.internalDecisionId, resolvedDecisionIdentity);
  const decisionKey = scopeAdvance.key;
  const evalCtx = mergeChoiceToReadContext(env, cursor);
  const chooser = chooseN.chooser ?? 'active';
  const choiceDecisionPlayer = resolveChoiceDecisionPlayer('chooseN', chooser, evalCtx, bind, decisionKey);
  const providedDecisionPlayer = env.decisionAuthority.player;
  const { minCardinality, maxCardinality } = resolveChooseNCardinality(chooseN, evalCtx, (issue) => {
    if (issue.code === 'CHOOSE_N_MODE_INVALID') {
      throw effectRuntimeError(EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED, 'chooseN must use either exact n or range max/min cardinality', {
        effectType: 'chooseN',
        bind,
        bindTemplate,
        chooseN,
      });
    }
    if (issue.code === 'CHOOSE_N_MIN_EVAL_INVALID') {
      throw effectRuntimeError(EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED, 'chooseN minimum cardinality must evaluate to a non-negative integer', {
        effectType: 'chooseN',
        bind,
        bindTemplate,
        min: chooseN.min ?? 0,
        evaluatedMin: issue.value,
      });
    }
    if (issue.code === 'CHOOSE_N_MAX_EVAL_INVALID') {
      throw effectRuntimeError(EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED, 'chooseN maximum cardinality must evaluate to a non-negative integer', {
        effectType: 'chooseN',
        bind,
        bindTemplate,
        max: chooseN.max,
        evaluatedMax: issue.value,
      });
    }
    if (issue.code === 'CHOOSE_N_MIN_INVALID') {
      throw effectRuntimeError(EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED, 'chooseN minimum cardinality must be a non-negative integer', {
        effectType: 'chooseN',
        bind,
        bindTemplate,
        min: issue.value,
      });
    }
    if (issue.code === 'CHOOSE_N_MAX_INVALID') {
      throw effectRuntimeError(EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED, 'chooseN maximum cardinality must be a non-negative integer', {
        effectType: 'chooseN',
        bind,
        bindTemplate,
        max: issue.value,
      });
    }
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED, 'chooseN min cannot exceed max', {
      effectType: 'chooseN',
      bind,
      bindTemplate,
      min: issue.min,
      max: issue.max,
    });
  });

  const options = evalQuery(chooseN.options, evalCtx);
  const normalizedOptions = normalizeChoiceDomain(options, (issue) => {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED, `chooseN options domain item is not move-param encodable: ${bind}`, {
      effectType: 'chooseN',
      bind,
      decisionKey,
      index: issue.index,
      actualType: issue.actualType,
      value: issue.value,
    });
  });
  const comparableBindingMap = buildComparableDomainBindingMap('chooseN', bind, decisionKey, options, normalizedOptions);
  const clampedMax = Math.min(maxCardinality, normalizedOptions.length);
  const prioritizedTierEntries = resolvePrioritizedTierEntries(chooseN.options, evalCtx, bind, decisionKey);
  const prioritizedQualifierMode = chooseN.options.query === 'prioritized' && chooseN.options.qualifierKey !== undefined
    ? 'byQualifier'
    : 'none';
  const selectedValue = env.moveParams[decisionKey];
  if (selectedValue === undefined) {
    if (env.mode === 'discovery') {
      const transientSelected = env.transientDecisionSelections?.[decisionKey] ?? [];
      if (transientSelected.length > clampedMax) {
        throw effectRuntimeError(EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED, `chooseN selection cardinality mismatch for: ${bind}`, {
          effectType: 'chooseN',
          bind,
          min: minCardinality,
          max: clampedMax,
          actual: transientSelected.length,
        });
      }

      const selectedSequence = normalizeChooseNSelectionValues(transientSelected, bind, decisionKey);
      validateChooseNSelectionSequence(
        selectedSequence,
        comparableBindingMap,
        normalizedOptions,
        prioritizedTierEntries,
        prioritizedQualifierMode,
        bind,
        decisionKey,
      );
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
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED, `chooseN missing move param binding: ${bind} (${decisionKey})`, {
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
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED, `chooseN move param must be an array: ${bind}`, {
      effectType: 'chooseN',
      bind,
      actualType: typeof selectedValue,
      value: selectedValue,
    });
  }

  if (selectedValue.length < minCardinality || selectedValue.length > clampedMax) {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED, `chooseN selection cardinality mismatch for: ${bind}`, {
      effectType: 'chooseN',
      bind,
      min: minCardinality,
      max: clampedMax,
      actual: selectedValue.length,
    });
  }

  const selectedSequence = normalizeChooseNSelectionValues(selectedValue, bind, decisionKey);
  validateChooseNSelectionSequence(
    selectedSequence,
    comparableBindingMap,
    normalizedOptions,
    prioritizedTierEntries,
    prioritizedQualifierMode,
    bind,
    decisionKey,
  );
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
  budget: EffectBudgetState,
  applyBatch: ApplyEffectsWithBudget,
): PartialEffectResult => {
  const evalCtx = mergeChoiceToReadContext(env, cursor);
  const resolvedBindings = evalCtx.bindings;
  const minValue = evalValue(effect.rollRandom.min, evalCtx);
  const maxValue = evalValue(effect.rollRandom.max, evalCtx);

  if (typeof minValue !== 'number' || !Number.isSafeInteger(minValue)) {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED, 'rollRandom.min must evaluate to a safe integer', {
      effectType: 'rollRandom',
      actualType: typeof minValue,
      value: minValue,
    });
  }

  if (typeof maxValue !== 'number' || !Number.isSafeInteger(maxValue)) {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED, 'rollRandom.max must evaluate to a safe integer', {
      effectType: 'rollRandom',
      actualType: typeof maxValue,
      value: maxValue,
    });
  }

  if (minValue > maxValue) {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED, `rollRandom requires min <= max, received min=${minValue}, max=${maxValue}`, {
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
    const rolledValue = resolveFixedRandomBinding(effect.rollRandom.bind, fixedBinding, minValue, maxValue);
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
      return {
        state: cursor.state,
        rng: cursor.rng,
        bindings: cursor.bindings,
        pendingChoice: toStochasticPendingChoice(outcomes),
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

    const pendingChoice: ChoicePendingRequest | ChoiceStochasticPendingRequest =
      pendingByDecisionKey.size === 1 && outcomes.every((outcome) => outcome.nextDecision !== undefined)
        ? (() => {
          const selectedDecisionKey = pendingByDecisionKey.keys().next().value as string;
          const mergedPendingChoices = mergePendingChoiceRequests(pendingByDecisionKey.get(selectedDecisionKey)!);
          return mergedPendingChoices.length === 1
            ? mergedPendingChoices[0]!
            : {
              kind: 'pendingStochastic',
              complete: false,
              source: 'rollRandom',
              alternatives: mergedPendingChoices,
              outcomes,
            };
        })()
        : toStochasticPendingChoice(outcomes);
    return {
      state: cursor.state,
      rng: cursor.rng,
      bindings: cursor.bindings,
      pendingChoice,
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
  _budget: EffectBudgetState,
  _applyBatch: ApplyEffectsWithBudget,
): PartialEffectResult => {
  const { space, marker, state: stateExpr } = effect.setMarker;
  const evalCtx = mergeChoiceToReadContext(env, cursor);
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
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED, 'setMarker.state must evaluate to a string', {
      effectType: 'setMarker',
      actualType: typeof evaluatedState,
      value: evaluatedState,
    });
  }

  const lattice = resolveMarkerLattice(env.def, marker, 'setMarker');
  if (!lattice.states.includes(evaluatedState)) {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED, `Invalid marker state "${evaluatedState}" for lattice "${marker}"`, {
      effectType: 'setMarker',
      marker,
      state: evaluatedState,
      validStates: lattice.states,
    });
  }

  const setViolation = findSpaceMarkerConstraintViolation(lattice, String(spaceId), evaluatedState, evalCtx, evalCondition);
  if (setViolation !== null) {
    throw effectRuntimeError(
      EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED,
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
  _budget: EffectBudgetState,
  _applyBatch: ApplyEffectsWithBudget,
): PartialEffectResult => {
  const { space, marker, delta: deltaExpr } = effect.shiftMarker;
  const evalCtx = mergeChoiceToReadContext(env, cursor);
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
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED, 'shiftMarker.delta must evaluate to a safe integer', {
      effectType: 'shiftMarker',
      actualType: typeof evaluatedDelta,
      value: evaluatedDelta,
    });
  }

  const lattice = resolveMarkerLattice(env.def, marker, 'shiftMarker');
  const spaceMarkers = cursor.state.markers[String(spaceId)] ?? {};
  let resolution;
  try {
    resolution = resolveSpaceMarkerShift(lattice, String(spaceId), evaluatedDelta, evalCtx, evalCondition);
  } catch (error) {
    throw effectRuntimeError(
      EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED,
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
  _budget: EffectBudgetState,
  _applyBatch: ApplyEffectsWithBudget,
): PartialEffectResult => {
  const { marker, state: stateExpr } = effect.setGlobalMarker;
  const evalCtx = mergeChoiceToReadContext(env, cursor);
  const evaluatedState = evalValue(stateExpr, evalCtx);

  if (typeof evaluatedState !== 'string') {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED, 'setGlobalMarker.state must evaluate to a string', {
      effectType: 'setGlobalMarker',
      actualType: typeof evaluatedState,
      value: evaluatedState,
    });
  }

  const lattice = resolveGlobalMarkerLattice(env.def, marker, 'setGlobalMarker');
  if (!lattice.states.includes(evaluatedState)) {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED, `Invalid marker state "${evaluatedState}" for lattice "${marker}"`, {
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
  _budget: EffectBudgetState,
  _applyBatch: ApplyEffectsWithBudget,
): PartialEffectResult => {
  const { marker, delta: deltaExpr } = effect.shiftGlobalMarker;
  const evalCtx = mergeChoiceToReadContext(env, cursor);
  const evaluatedDelta = evalValue(deltaExpr, evalCtx);

  if (typeof evaluatedDelta !== 'number' || !Number.isSafeInteger(evaluatedDelta)) {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED, 'shiftGlobalMarker.delta must evaluate to a safe integer', {
      effectType: 'shiftGlobalMarker',
      actualType: typeof evaluatedDelta,
      value: evaluatedDelta,
    });
  }

  const lattice = resolveGlobalMarkerLattice(env.def, marker, 'shiftGlobalMarker');
  const currentState = cursor.state.globalMarkers?.[marker] ?? lattice.defaultState;
  const currentIndex = lattice.states.indexOf(currentState);

  if (currentIndex < 0) {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED, `Current marker state "${currentState}" not found in lattice "${marker}"`, {
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
  _budget: EffectBudgetState,
  _applyBatch: ApplyEffectsWithBudget,
): PartialEffectResult => {
  const { marker: markerExpr, stateA: stateAExpr, stateB: stateBExpr } = effect.flipGlobalMarker;
  const evalCtx = mergeChoiceToReadContext(env, cursor);
  const evaluatedMarker = evalValue(markerExpr, evalCtx);
  const evaluatedStateA = evalValue(stateAExpr, evalCtx);
  const evaluatedStateB = evalValue(stateBExpr, evalCtx);

  if (typeof evaluatedMarker !== 'string') {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED, 'flipGlobalMarker.marker must evaluate to a string', {
      effectType: 'flipGlobalMarker',
      actualType: typeof evaluatedMarker,
      value: evaluatedMarker,
    });
  }
  if (typeof evaluatedStateA !== 'string') {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED, 'flipGlobalMarker.stateA must evaluate to a string', {
      effectType: 'flipGlobalMarker',
      actualType: typeof evaluatedStateA,
      value: evaluatedStateA,
    });
  }
  if (typeof evaluatedStateB !== 'string') {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED, 'flipGlobalMarker.stateB must evaluate to a string', {
      effectType: 'flipGlobalMarker',
      actualType: typeof evaluatedStateB,
      value: evaluatedStateB,
    });
  }
  if (evaluatedStateA === evaluatedStateB) {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED, 'flipGlobalMarker requires two distinct states', {
      effectType: 'flipGlobalMarker',
      marker: evaluatedMarker,
      stateA: evaluatedStateA,
      stateB: evaluatedStateB,
    });
  }

  const lattice = resolveGlobalMarkerLattice(env.def, evaluatedMarker, 'flipGlobalMarker');
  if (!lattice.states.includes(evaluatedStateA)) {
    throw effectRuntimeError(
      EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED,
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
    throw effectRuntimeError(
      EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED,
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
    throw effectRuntimeError(
      EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED,
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
