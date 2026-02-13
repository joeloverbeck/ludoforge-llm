import { evalQuery } from './eval-query.js';
import { evalValue } from './eval-value.js';
import { EffectRuntimeError } from './effect-error.js';
import { nextInt } from './prng.js';
import { resolveZoneRef } from './resolve-zone-ref.js';
import type { EffectContext, EffectResult } from './effect-context.js';
import type { EffectAST } from './types.js';
import type { EffectBudgetState } from './effects-control.js';

type ApplyEffectsWithBudget = (effects: readonly EffectAST[], ctx: EffectContext, budget: EffectBudgetState) => EffectResult;

const resolveEffectBindings = (ctx: EffectContext): Readonly<Record<string, unknown>> => ({
  ...ctx.moveParams,
  ...ctx.bindings,
});

const valuesMatch = (candidate: unknown, selected: unknown): boolean => {
  if (Object.is(candidate, selected)) {
    return true;
  }

  if (
    typeof selected === 'string' &&
    typeof candidate === 'object' &&
    candidate !== null &&
    'id' in candidate &&
    typeof candidate.id === 'string'
  ) {
    return candidate.id === selected;
  }

  return false;
};

const isInDomain = (selected: unknown, domain: readonly unknown[]): boolean =>
  domain.some((candidate) => valuesMatch(candidate, selected));

const resolveMarkerLattice = (ctx: EffectContext, markerId: string, effectType: string) => {
  const lattice = ctx.def.markerLattices?.find((l) => l.id === markerId);
  if (lattice === undefined) {
    throw new EffectRuntimeError('EFFECT_RUNTIME', `Unknown marker lattice: ${markerId}`, {
      effectType,
      markerId,
      availableLattices: (ctx.def.markerLattices ?? []).map((l) => l.id).sort(),
    });
  }

  return lattice;
};

export const applyChooseOne = (effect: Extract<EffectAST, { readonly chooseOne: unknown }>, ctx: EffectContext): EffectResult => {
  if (!Object.prototype.hasOwnProperty.call(ctx.moveParams, effect.chooseOne.bind)) {
    throw new EffectRuntimeError('EFFECT_RUNTIME', `chooseOne missing move param binding: ${effect.chooseOne.bind}`, {
      effectType: 'chooseOne',
      bind: effect.chooseOne.bind,
      availableMoveParams: Object.keys(ctx.moveParams).sort(),
    });
  }

  const selected = ctx.moveParams[effect.chooseOne.bind];
  const evalCtx = { ...ctx, bindings: resolveEffectBindings(ctx) };
  const options = evalQuery(effect.chooseOne.options, evalCtx);
  if (!isInDomain(selected, options)) {
    throw new EffectRuntimeError('EFFECT_RUNTIME', `chooseOne selection is outside options domain: ${effect.chooseOne.bind}`, {
      effectType: 'chooseOne',
      bind: effect.chooseOne.bind,
      selected,
      optionsCount: options.length,
    });
  }

  return { state: ctx.state, rng: ctx.rng };
};

export const applyChooseN = (effect: Extract<EffectAST, { readonly chooseN: unknown }>, ctx: EffectContext): EffectResult => {
  const chooseN = effect.chooseN;
  const bind = chooseN.bind;
  const hasN = 'n' in chooseN && chooseN.n !== undefined;
  const hasMax = 'max' in chooseN && chooseN.max !== undefined;
  const hasMin = 'min' in chooseN && chooseN.min !== undefined;
  let minCardinality: number;
  let maxCardinality: number;

  if (hasN && hasMax) {
    throw new EffectRuntimeError('EFFECT_RUNTIME', 'chooseN must use either exact n or range max/min cardinality', {
      effectType: 'chooseN',
      bind,
      chooseN,
    });
  }

  if (hasN) {
    minCardinality = chooseN.n;
    maxCardinality = chooseN.n;
  } else if (hasMax) {
    minCardinality = hasMin ? chooseN.min : 0;
    maxCardinality = chooseN.max;
  } else {
    throw new EffectRuntimeError('EFFECT_RUNTIME', 'chooseN must use either exact n or range max/min cardinality', {
      effectType: 'chooseN',
      bind,
      chooseN,
    });
  }

  if (!Number.isSafeInteger(minCardinality) || minCardinality < 0) {
    throw new EffectRuntimeError('EFFECT_RUNTIME', 'chooseN minimum cardinality must be a non-negative integer', {
      effectType: 'chooseN',
      bind: chooseN.bind,
      min: hasN ? chooseN.n : chooseN.min,
    });
  }

  if (!Number.isSafeInteger(maxCardinality) || maxCardinality < 0) {
    throw new EffectRuntimeError('EFFECT_RUNTIME', 'chooseN maximum cardinality must be a non-negative integer', {
      effectType: 'chooseN',
      bind: chooseN.bind,
      max: hasN ? chooseN.n : chooseN.max,
    });
  }

  if (minCardinality > maxCardinality) {
    throw new EffectRuntimeError('EFFECT_RUNTIME', 'chooseN min cannot exceed max', {
      effectType: 'chooseN',
      bind: chooseN.bind,
      min: minCardinality,
      max: maxCardinality,
    });
  }

  if (!Object.prototype.hasOwnProperty.call(ctx.moveParams, bind)) {
    throw new EffectRuntimeError('EFFECT_RUNTIME', `chooseN missing move param binding: ${bind}`, {
      effectType: 'chooseN',
      bind,
      availableMoveParams: Object.keys(ctx.moveParams).sort(),
    });
  }

  const selectedValue = ctx.moveParams[bind];
  if (!Array.isArray(selectedValue)) {
    throw new EffectRuntimeError('EFFECT_RUNTIME', `chooseN move param must be an array: ${bind}`, {
      effectType: 'chooseN',
      bind,
      actualType: typeof selectedValue,
      value: selectedValue,
    });
  }

  if (selectedValue.length < minCardinality || selectedValue.length > maxCardinality) {
    throw new EffectRuntimeError('EFFECT_RUNTIME', `chooseN selection cardinality mismatch for: ${bind}`, {
      effectType: 'chooseN',
      bind,
      min: minCardinality,
      max: maxCardinality,
      actual: selectedValue.length,
    });
  }

  for (let left = 0; left < selectedValue.length; left += 1) {
    for (let right = left + 1; right < selectedValue.length; right += 1) {
      if (valuesMatch(selectedValue[left], selectedValue[right])) {
        throw new EffectRuntimeError('EFFECT_RUNTIME', `chooseN selections must be unique: ${bind}`, {
          effectType: 'chooseN',
          bind,
          duplicateValue: selectedValue[left],
        });
      }
    }
  }

  const evalCtx = { ...ctx, bindings: resolveEffectBindings(ctx) };
  const options = evalQuery(chooseN.options, evalCtx);
  for (const selected of selectedValue) {
    if (!isInDomain(selected, options)) {
      throw new EffectRuntimeError('EFFECT_RUNTIME', `chooseN selection is outside options domain: ${bind}`, {
        effectType: 'chooseN',
        bind,
        selected,
        optionsCount: options.length,
      });
    }
  }

  return { state: ctx.state, rng: ctx.rng };
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
    throw new EffectRuntimeError('EFFECT_RUNTIME', 'rollRandom.min must evaluate to a safe integer', {
      effectType: 'rollRandom',
      actualType: typeof minValue,
      value: minValue,
    });
  }

  if (typeof maxValue !== 'number' || !Number.isSafeInteger(maxValue)) {
    throw new EffectRuntimeError('EFFECT_RUNTIME', 'rollRandom.max must evaluate to a safe integer', {
      effectType: 'rollRandom',
      actualType: typeof maxValue,
      value: maxValue,
    });
  }

  if (minValue > maxValue) {
    throw new EffectRuntimeError('EFFECT_RUNTIME', `rollRandom requires min <= max, received min=${minValue}, max=${maxValue}`, {
      effectType: 'rollRandom',
      min: minValue,
      max: maxValue,
    });
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

  return applyEffectsWithBudget(effect.rollRandom.in, nestedCtx, budget);
};

export const applySetMarker = (effect: Extract<EffectAST, { readonly setMarker: unknown }>, ctx: EffectContext): EffectResult => {
  const { space, marker, state: stateExpr } = effect.setMarker;
  const evalCtx = { ...ctx, bindings: resolveEffectBindings(ctx) };
  const spaceId = resolveZoneRef(space, evalCtx);
  const evaluatedState = evalValue(stateExpr, evalCtx);

  if (typeof evaluatedState !== 'string') {
    throw new EffectRuntimeError('EFFECT_RUNTIME', 'setMarker.state must evaluate to a string', {
      effectType: 'setMarker',
      actualType: typeof evaluatedState,
      value: evaluatedState,
    });
  }

  const lattice = resolveMarkerLattice(ctx, marker, 'setMarker');
  if (!lattice.states.includes(evaluatedState)) {
    throw new EffectRuntimeError('EFFECT_RUNTIME', `Invalid marker state "${evaluatedState}" for lattice "${marker}"`, {
      effectType: 'setMarker',
      marker,
      state: evaluatedState,
      validStates: lattice.states,
    });
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
  const spaceId = resolveZoneRef(space, evalCtx);
  const evaluatedDelta = evalValue(deltaExpr, evalCtx);

  if (typeof evaluatedDelta !== 'number' || !Number.isSafeInteger(evaluatedDelta)) {
    throw new EffectRuntimeError('EFFECT_RUNTIME', 'shiftMarker.delta must evaluate to a safe integer', {
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
    throw new EffectRuntimeError('EFFECT_RUNTIME', `Current marker state "${currentState}" not found in lattice "${marker}"`, {
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
