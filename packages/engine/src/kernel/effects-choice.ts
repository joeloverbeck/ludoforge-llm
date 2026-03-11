import { evalQuery } from './eval-query.js';
import { evalCondition } from './eval-condition.js';
import { evalValue } from './eval-value.js';
import { composeScopedDecisionId } from './decision-id.js';
import { deriveChoiceTargetKinds } from './choice-target-kinds.js';
import { resolveChooseNCardinality } from './choose-n-cardinality.js';
import { effectRuntimeError } from './effect-error.js';
import { resolveBindingTemplate } from './binding-template.js';
import { nextInt } from './prng.js';
import { resolveSinglePlayerSel } from './resolve-selectors.js';
import { resolveZoneWithNormalization, selectorResolutionFailurePolicyForMode } from './selector-resolution-normalization.js';
import { findSpaceMarkerConstraintViolation } from './space-marker-rules.js';
import { withTracePath } from './trace-provenance.js';
import { normalizeChoiceDomain, toChoiceComparableValue, type MembershipScalar } from './value-membership.js';
import { EFFECT_RUNTIME_REASONS } from './runtime-reasons.js';
import type { EffectContext, EffectResult } from './effect-context.js';
import type {
  ChoicePendingRequest,
  ChoiceStochasticOutcome,
  ChoiceStochasticPendingRequest,
  EffectAST,
  MoveParamScalar,
  PlayerSel,
} from './types.js';
import type { EffectBudgetState } from './effects-control.js';

type ApplyEffectsWithBudget = (effects: readonly EffectAST[], ctx: EffectContext, budget: EffectBudgetState) => EffectResult;

const choiceOptionKey = (value: unknown): string => JSON.stringify([typeof value, value]);

const normalizePendingChoiceRequest = (pendingChoice: ChoicePendingRequest): ChoicePendingRequest => ({
  ...pendingChoice,
  options: pendingChoice.options.map((option) => ({
    value: option.value,
    legality: 'unknown',
    illegalReason: null,
  })),
  targetKinds: [...pendingChoice.targetKinds],
});

const pendingChoiceStructuralKey = (pendingChoice: ChoicePendingRequest): string => {
  const normalized = normalizePendingChoiceRequest(pendingChoice);
  return JSON.stringify({
    decisionPlayer: normalized.decisionPlayer ?? null,
    decisionId: normalized.decisionId,
    name: normalized.name,
    type: normalized.type,
    options: normalized.options.map((option) => choiceOptionKey(option.value)),
    targetKinds: normalized.targetKinds,
    min: normalized.type === 'chooseN' ? normalized.min ?? 0 : null,
    max: normalized.type === 'chooseN' ? normalized.max ?? normalized.options.length : null,
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
        `rollRandom discovery found incompatible pending decision types for ${first.decisionId}`,
        {
          effectType: 'rollRandom',
          decisionId: first.decisionId,
          expectedType: first.type,
          actualType: pending.type,
        },
      );
    }
    if (pending.name !== first.name) {
      throw effectRuntimeError(
        EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED,
        `rollRandom discovery found incompatible pending decision names for ${first.decisionId}`,
        {
          effectType: 'rollRandom',
          decisionId: first.decisionId,
          expectedName: first.name,
          actualName: pending.name,
        },
      );
    }
    if (!Object.is(pending.decisionPlayer, first.decisionPlayer)) {
      throw effectRuntimeError(
        EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED,
        `rollRandom discovery found incompatible decision owners for ${first.decisionId}`,
        {
          effectType: 'rollRandom',
          decisionId: first.decisionId,
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
  const pendingByDecisionId = new Map<string, ChoicePendingRequest[]>();
  for (const outcome of outcomes) {
    if (outcome.nextDecision === undefined) {
      continue;
    }
    const existing = pendingByDecisionId.get(outcome.nextDecision.decisionId);
    if (existing === undefined) {
      pendingByDecisionId.set(outcome.nextDecision.decisionId, [outcome.nextDecision]);
    } else {
      existing.push(outcome.nextDecision);
    }
  }
  const alternatives = [...pendingByDecisionId.entries()]
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

const resolveEffectBindings = (ctx: EffectContext): Readonly<Record<string, unknown>> => {
  const merged: Record<string, unknown> = {
    ...ctx.moveParams,
    ...ctx.bindings,
  };

  for (const [bindingKey, value] of Object.entries(merged)) {
    const resolvedKey = resolveBindingTemplate(bindingKey, ctx.bindings);
    if (resolvedKey !== bindingKey && !Object.prototype.hasOwnProperty.call(merged, resolvedKey)) {
      merged[resolvedKey] = value;
    }
  }

  return merged;
};

const resolveMarkerLattice = (ctx: EffectContext, markerId: string, effectType: string) => {
  const lattice = ctx.def.markerLattices?.find((l) => l.id === markerId);
  if (lattice === undefined) {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED, `Unknown marker lattice: ${markerId}`, {
      effectType,
      markerId,
      availableLattices: (ctx.def.markerLattices ?? []).map((l) => l.id).sort(),
    });
  }

  return lattice;
};

const resolveGlobalMarkerLattice = (ctx: EffectContext, markerId: string, effectType: string) => {
  const lattice = ctx.def.globalMarkerLattices?.find((l) => l.id === markerId);
  if (lattice === undefined) {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED, `Unknown global marker lattice: ${markerId}`, {
      effectType,
      markerId,
      availableLattices: (ctx.def.globalMarkerLattices ?? []).map((l) => l.id).sort(),
    });
  }

  return lattice;
};

const resolveChoiceDecisionPlayer = (
  effectType: 'chooseOne' | 'chooseN',
  chooser: PlayerSel,
  evalCtx: EffectContext,
  bind: string,
  decisionId: string,
) => {
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

export const applyChooseOne = (effect: Extract<EffectAST, { readonly chooseOne: unknown }>, ctx: EffectContext): EffectResult => {
  const resolvedBind = resolveBindingTemplate(effect.chooseOne.bind, ctx.bindings);
  const decisionId = composeScopedDecisionId(
    effect.chooseOne.internalDecisionId,
    effect.chooseOne.bind,
    resolvedBind,
    ctx.iterationPath,
  );
  const evalCtx = { ...ctx, bindings: resolveEffectBindings(ctx) };
  const chooser = effect.chooseOne.chooser ?? 'active';
  const choiceDecisionPlayer = resolveChoiceDecisionPlayer('chooseOne', chooser, evalCtx, resolvedBind, decisionId);
  const providedDecisionPlayer = ctx.decisionAuthority.player;
  const options = evalQuery(effect.chooseOne.options, evalCtx);
  const normalizedOptions = normalizeChoiceDomain(options, (issue) => {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED, `chooseOne options domain item is not move-param encodable: ${resolvedBind}`, {
      effectType: 'chooseOne',
      bind: resolvedBind,
      bindTemplate: effect.chooseOne.bind,
      decisionId,
      index: issue.index,
      actualType: issue.actualType,
      value: issue.value,
    });
  });
  const comparableBindingMap = buildComparableDomainBindingMap('chooseOne', resolvedBind, decisionId, options, normalizedOptions);
  if (!Object.prototype.hasOwnProperty.call(ctx.moveParams, decisionId)) {
    if (ctx.mode === 'discovery') {
      const targetKinds = deriveChoiceTargetKinds(effect.chooseOne.options);
      return {
        state: ctx.state,
        rng: ctx.rng,
        bindings: ctx.bindings,
        pendingChoice: {
          kind: 'pending',
          complete: false,
          ...(effect.chooseOne.chooser === undefined ? {} : { decisionPlayer: choiceDecisionPlayer }),
          decisionId,
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
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED, `chooseOne missing move param binding: ${resolvedBind} (${decisionId})`, {
      effectType: 'chooseOne',
      bind: resolvedBind,
      decisionId,
      bindTemplate: effect.chooseOne.bind,
      availableMoveParams: Object.keys(ctx.moveParams).sort(),
    });
  }

  const selected = ctx.moveParams[decisionId];
  if (effect.chooseOne.chooser === undefined && providedDecisionPlayer !== choiceDecisionPlayer) {
    const runtimeReason = ctx.decisionAuthority.ownershipEnforcement === 'probe'
      ? EFFECT_RUNTIME_REASONS.CHOICE_PROBE_AUTHORITY_MISMATCH
      : EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED;
    throw effectRuntimeError(
      runtimeReason,
      `chooseOne decision owner mismatch for "${resolvedBind}" (${decisionId})`,
      {
        effectType: 'chooseOne',
        bind: resolvedBind,
        decisionId,
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
      `invalid selection for chooseOne "${resolvedBind}" (${decisionId}): outside options domain`,
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

  return {
    state: ctx.state,
    rng: ctx.rng,
    bindings: {
      ...ctx.bindings,
      [resolvedBind]: selectedBinding,
    },
  };
};

export const applyChooseN = (effect: Extract<EffectAST, { readonly chooseN: unknown }>, ctx: EffectContext): EffectResult => {
  const chooseN = effect.chooseN;
  const bindTemplate = chooseN.bind;
  const bind = resolveBindingTemplate(bindTemplate, ctx.bindings);
  const decisionId = composeScopedDecisionId(chooseN.internalDecisionId, bindTemplate, bind, ctx.iterationPath);
  const evalCtx = { ...ctx, bindings: resolveEffectBindings(ctx) };
  const chooser = chooseN.chooser ?? 'active';
  const choiceDecisionPlayer = resolveChoiceDecisionPlayer('chooseN', chooser, evalCtx, bind, decisionId);
  const providedDecisionPlayer = ctx.decisionAuthority.player;
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
      decisionId,
      index: issue.index,
      actualType: issue.actualType,
      value: issue.value,
    });
  });
  const comparableBindingMap = buildComparableDomainBindingMap('chooseN', bind, decisionId, options, normalizedOptions);
  const clampedMax = Math.min(maxCardinality, normalizedOptions.length);
  if (!Object.prototype.hasOwnProperty.call(ctx.moveParams, decisionId)) {
    if (ctx.mode === 'discovery') {
      const targetKinds = deriveChoiceTargetKinds(chooseN.options);
      return {
        state: ctx.state,
        rng: ctx.rng,
        bindings: ctx.bindings,
        pendingChoice: {
          kind: 'pending',
          complete: false,
          ...(chooseN.chooser === undefined ? {} : { decisionPlayer: choiceDecisionPlayer }),
          decisionId,
          name: bind,
          type: 'chooseN',
          options: normalizedOptions.map((value) => ({
            value,
            legality: 'unknown',
            illegalReason: null,
          })),
          targetKinds,
          min: minCardinality,
          max: clampedMax,
        },
      };
    }
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED, `chooseN missing move param binding: ${bind} (${decisionId})`, {
      effectType: 'chooseN',
      bind,
      decisionId,
      availableMoveParams: Object.keys(ctx.moveParams).sort(),
    });
  }

  const selectedValue = ctx.moveParams[decisionId];
  if (chooseN.chooser === undefined && providedDecisionPlayer !== choiceDecisionPlayer) {
    const runtimeReason = ctx.decisionAuthority.ownershipEnforcement === 'probe'
      ? EFFECT_RUNTIME_REASONS.CHOICE_PROBE_AUTHORITY_MISMATCH
      : EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED;
    throw effectRuntimeError(
      runtimeReason,
      `chooseN decision owner mismatch for "${bind}" (${decisionId})`,
      {
        effectType: 'chooseN',
        bind,
        decisionId,
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

  const normalizedSelected: Array<string | number | boolean> = [];
  for (let index = 0; index < selectedValue.length; index += 1) {
    const comparable = toChoiceComparableValue(selectedValue[index]);
    if (comparable === null) {
      throw effectRuntimeError(EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED, `chooseN selection is not move-param encodable: ${bind}`, {
        effectType: 'chooseN',
        bind,
        decisionId,
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
  const selectedBindings: unknown[] = [];
  for (const selected of normalizedSelected) {
    if (!comparableBindingMap.has(selected)) {
      throw effectRuntimeError(
        EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED,
        `invalid selection for chooseN "${bind}" (${decisionId}): outside options domain`,
        {
          effectType: 'chooseN',
          bind,
          selected,
          optionsCount: normalizedOptions.length,
        },
      );
    }
    selectedBindings.push(comparableBindingMap.get(selected));
  }

  return {
    state: ctx.state,
    rng: ctx.rng,
    bindings: {
      ...ctx.bindings,
      [bind]: selectedBindings,
    },
  };
};

export const applyRollRandom = (
  effect: Extract<EffectAST, { readonly rollRandom: unknown }>,
  ctx: EffectContext,
  budget: EffectBudgetState,
  applyEffectsWithBudget: ApplyEffectsWithBudget,
): EffectResult => {
  const evalCtx = { ...ctx, bindings: resolveEffectBindings(ctx) };
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

  const fixedBinding = evalCtx.bindings[effect.rollRandom.bind];
  if (fixedBinding !== undefined) {
    const rolledValue = resolveFixedRandomBinding(effect.rollRandom.bind, fixedBinding, minValue, maxValue);
    const nestedCtx: EffectContext = {
      ...ctx,
      bindings: {
        ...ctx.bindings,
        [effect.rollRandom.bind]: rolledValue,
      },
    };
    const nestedResult = applyEffectsWithBudget(effect.rollRandom.in, withTracePath(nestedCtx, '.rollRandom.in'), budget);
    return {
      state: nestedResult.state,
      rng: nestedResult.rng,
      ...(nestedResult.emittedEvents === undefined ? {} : { emittedEvents: nestedResult.emittedEvents }),
      ...(nestedResult.pendingChoice === undefined ? {} : { pendingChoice: nestedResult.pendingChoice }),
      bindings: ctx.bindings,
    };
  }

  if (ctx.mode === 'discovery') {
    const outcomes: ChoiceStochasticOutcome[] = [];
    for (let rolledValue = minValue; rolledValue <= maxValue; rolledValue += 1) {
      const nestedCtx: EffectContext = {
        ...ctx,
        bindings: {
          ...ctx.bindings,
          [effect.rollRandom.bind]: rolledValue,
        },
      };
      const nestedResult = applyEffectsWithBudget(effect.rollRandom.in, withTracePath(nestedCtx, '.rollRandom.in'), budget);
      outcomes.push(...collectNestedOutcomes(effect.rollRandom.bind, rolledValue, nestedResult.pendingChoice));
    }

    if (outcomes.length === 0) {
      return { state: ctx.state, rng: ctx.rng, bindings: ctx.bindings };
    }
    if (outcomes.every((outcome) => outcome.nextDecision === undefined)) {
      return {
        state: ctx.state,
        rng: ctx.rng,
        bindings: ctx.bindings,
        pendingChoice: toStochasticPendingChoice(outcomes),
      };
    }

    const pendingByDecisionId = new Map<string, ChoicePendingRequest[]>();
    for (const outcome of outcomes) {
      if (outcome.nextDecision === undefined) {
        continue;
      }
      const existing = pendingByDecisionId.get(outcome.nextDecision.decisionId);
      if (existing === undefined) {
        pendingByDecisionId.set(outcome.nextDecision.decisionId, [outcome.nextDecision]);
      } else {
        existing.push(outcome.nextDecision);
      }
    }

    const pendingChoice: ChoicePendingRequest | ChoiceStochasticPendingRequest =
      pendingByDecisionId.size === 1 && outcomes.every((outcome) => outcome.nextDecision !== undefined)
        ? (() => {
          const selectedDecisionId = pendingByDecisionId.keys().next().value as string;
          const mergedPendingChoices = mergePendingChoiceRequests(pendingByDecisionId.get(selectedDecisionId)!);
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
      state: ctx.state,
      rng: ctx.rng,
      bindings: ctx.bindings,
      pendingChoice,
    };
  }

  const [rolledValue, nextRng] = nextInt(ctx.rng, minValue, maxValue);
  const nestedCtx: EffectContext = {
    ...ctx,
    rng: nextRng,
    bindings: {
      ...ctx.bindings,
      [effect.rollRandom.bind]: rolledValue,
    },
  };

  const nestedResult = applyEffectsWithBudget(effect.rollRandom.in, withTracePath(nestedCtx, '.rollRandom.in'), budget);
  return {
    state: nestedResult.state,
    rng: nestedResult.rng,
    ...(nestedResult.emittedEvents === undefined ? {} : { emittedEvents: nestedResult.emittedEvents }),
    bindings: ctx.bindings,
  };
};

export const applySetMarker = (effect: Extract<EffectAST, { readonly setMarker: unknown }>, ctx: EffectContext): EffectResult => {
  const { space, marker, state: stateExpr } = effect.setMarker;
  const evalCtx = { ...ctx, bindings: resolveEffectBindings(ctx) };
  const onResolutionFailure = selectorResolutionFailurePolicyForMode(evalCtx.mode);
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

  const lattice = resolveMarkerLattice(ctx, marker, 'setMarker');
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

  const spaceMarkers = ctx.state.markers[String(spaceId)] ?? {};
  return {
    state: {
      ...ctx.state,
      markers: {
        ...ctx.state.markers,
        [String(spaceId)]: {
          ...spaceMarkers,
          [marker]: evaluatedState,
        },
      },
    },
    rng: ctx.rng,
  };
};

export const applyShiftMarker = (effect: Extract<EffectAST, { readonly shiftMarker: unknown }>, ctx: EffectContext): EffectResult => {
  const { space, marker, delta: deltaExpr } = effect.shiftMarker;
  const evalCtx = { ...ctx, bindings: resolveEffectBindings(ctx) };
  const onResolutionFailure = selectorResolutionFailurePolicyForMode(evalCtx.mode);
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

  const lattice = resolveMarkerLattice(ctx, marker, 'shiftMarker');
  const spaceMarkers = ctx.state.markers[String(spaceId)] ?? {};
  const currentState = spaceMarkers[marker] ?? lattice.defaultState;
  const currentIndex = lattice.states.indexOf(currentState);

  if (currentIndex < 0) {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED, `Current marker state "${currentState}" not found in lattice "${marker}"`, {
      effectType: 'shiftMarker',
      marker,
      currentState,
      validStates: lattice.states,
    });
  }

  const newIndex = Math.max(0, Math.min(lattice.states.length - 1, currentIndex + evaluatedDelta));
  const newState = lattice.states[newIndex]!;

  if (newState === currentState) {
    return { state: ctx.state, rng: ctx.rng };
  }

  const shiftViolation = findSpaceMarkerConstraintViolation(lattice, String(spaceId), newState, evalCtx, evalCondition);
  if (shiftViolation !== null) {
    throw effectRuntimeError(
      EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED,
      `Marker state "${newState}" is illegal for lattice "${marker}" in space "${String(spaceId)}"`,
      {
        effectType: 'shiftMarker',
        marker,
        state: newState,
        spaceId: String(spaceId),
        constraintIndex: shiftViolation.constraintIndex,
        allowedStates: shiftViolation.constraint.allowedStates,
      },
    );
  }

  return {
    state: {
      ...ctx.state,
      markers: {
        ...ctx.state.markers,
        [String(spaceId)]: {
          ...spaceMarkers,
          [marker]: newState,
        },
      },
    },
    rng: ctx.rng,
  };
};

export const applySetGlobalMarker = (
  effect: Extract<EffectAST, { readonly setGlobalMarker: unknown }>,
  ctx: EffectContext,
): EffectResult => {
  const { marker, state: stateExpr } = effect.setGlobalMarker;
  const evalCtx = { ...ctx, bindings: resolveEffectBindings(ctx) };
  const evaluatedState = evalValue(stateExpr, evalCtx);

  if (typeof evaluatedState !== 'string') {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED, 'setGlobalMarker.state must evaluate to a string', {
      effectType: 'setGlobalMarker',
      actualType: typeof evaluatedState,
      value: evaluatedState,
    });
  }

  const lattice = resolveGlobalMarkerLattice(ctx, marker, 'setGlobalMarker');
  if (!lattice.states.includes(evaluatedState)) {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED, `Invalid marker state "${evaluatedState}" for lattice "${marker}"`, {
      effectType: 'setGlobalMarker',
      marker,
      state: evaluatedState,
      validStates: lattice.states,
    });
  }

  return {
    state: {
      ...ctx.state,
      globalMarkers: {
        ...(ctx.state.globalMarkers ?? {}),
        [marker]: evaluatedState,
      },
    },
    rng: ctx.rng,
  };
};

export const applyShiftGlobalMarker = (
  effect: Extract<EffectAST, { readonly shiftGlobalMarker: unknown }>,
  ctx: EffectContext,
): EffectResult => {
  const { marker, delta: deltaExpr } = effect.shiftGlobalMarker;
  const evalCtx = { ...ctx, bindings: resolveEffectBindings(ctx) };
  const evaluatedDelta = evalValue(deltaExpr, evalCtx);

  if (typeof evaluatedDelta !== 'number' || !Number.isSafeInteger(evaluatedDelta)) {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED, 'shiftGlobalMarker.delta must evaluate to a safe integer', {
      effectType: 'shiftGlobalMarker',
      actualType: typeof evaluatedDelta,
      value: evaluatedDelta,
    });
  }

  const lattice = resolveGlobalMarkerLattice(ctx, marker, 'shiftGlobalMarker');
  const currentState = ctx.state.globalMarkers?.[marker] ?? lattice.defaultState;
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
    return { state: ctx.state, rng: ctx.rng };
  }

  return {
    state: {
      ...ctx.state,
      globalMarkers: {
        ...(ctx.state.globalMarkers ?? {}),
        [marker]: newState,
      },
    },
    rng: ctx.rng,
  };
};

export const applyFlipGlobalMarker = (
  effect: Extract<EffectAST, { readonly flipGlobalMarker: unknown }>,
  ctx: EffectContext,
): EffectResult => {
  const { marker: markerExpr, stateA: stateAExpr, stateB: stateBExpr } = effect.flipGlobalMarker;
  const evalCtx = { ...ctx, bindings: resolveEffectBindings(ctx) };
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

  const lattice = resolveGlobalMarkerLattice(ctx, evaluatedMarker, 'flipGlobalMarker');
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

  const currentState = ctx.state.globalMarkers?.[evaluatedMarker] ?? lattice.defaultState;
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

  return {
    state: {
      ...ctx.state,
      globalMarkers: {
        ...(ctx.state.globalMarkers ?? {}),
        [evaluatedMarker]: nextState,
      },
    },
    rng: ctx.rng,
  };
};
