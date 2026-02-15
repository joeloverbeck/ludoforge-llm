import { evalQuery } from './eval-query.js';
import { evalValue } from './eval-value.js';
import { composeDecisionId } from './decision-id.js';
import { resolveChooseNCardinality } from './choose-n-cardinality.js';
import { effectRuntimeError } from './effect-error.js';
import { resolveBindingTemplate } from './binding-template.js';
import { nextInt } from './prng.js';
import { resolveZoneRef } from './resolve-zone-ref.js';
import type { EffectContext, EffectResult } from './effect-context.js';
import type { EffectAST } from './types.js';
import type { EffectBudgetState } from './effects-control.js';

type ApplyEffectsWithBudget = (effects: readonly EffectAST[], ctx: EffectContext, budget: EffectBudgetState) => EffectResult;

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
    throw effectRuntimeError('choiceRuntimeValidationFailed', `Unknown marker lattice: ${markerId}`, {
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
    throw effectRuntimeError('choiceRuntimeValidationFailed', `Unknown global marker lattice: ${markerId}`, {
      effectType,
      markerId,
      availableLattices: (ctx.def.globalMarkerLattices ?? []).map((l) => l.id).sort(),
    });
  }

  return lattice;
};

export const applyChooseOne = (effect: Extract<EffectAST, { readonly chooseOne: unknown }>, ctx: EffectContext): EffectResult => {
  const resolvedBind = resolveBindingTemplate(effect.chooseOne.bind, ctx.bindings);
  const decisionId = composeDecisionId(effect.chooseOne.internalDecisionId, effect.chooseOne.bind, resolvedBind);
  if (!Object.prototype.hasOwnProperty.call(ctx.moveParams, decisionId)) {
    throw effectRuntimeError('choiceRuntimeValidationFailed', `chooseOne missing move param binding: ${resolvedBind} (${decisionId})`, {
      effectType: 'chooseOne',
      bind: resolvedBind,
      decisionId,
      bindTemplate: effect.chooseOne.bind,
      availableMoveParams: Object.keys(ctx.moveParams).sort(),
    });
  }

  const selected = ctx.moveParams[decisionId];
  const evalCtx = { ...ctx, bindings: resolveEffectBindings(ctx) };
  const options = evalQuery(effect.chooseOne.options, evalCtx);
  if (!isInDomain(selected, options)) {
    throw effectRuntimeError('choiceRuntimeValidationFailed', `chooseOne selection is outside options domain: ${resolvedBind}`, {
      effectType: 'chooseOne',
      bind: resolvedBind,
      bindTemplate: effect.chooseOne.bind,
      selected,
      optionsCount: options.length,
    });
  }

  return {
    state: ctx.state,
    rng: ctx.rng,
    bindings: {
      ...ctx.bindings,
      [resolvedBind]: selected,
    },
  };
};

export const applyChooseN = (effect: Extract<EffectAST, { readonly chooseN: unknown }>, ctx: EffectContext): EffectResult => {
  const chooseN = effect.chooseN;
  const bindTemplate = chooseN.bind;
  const bind = resolveBindingTemplate(bindTemplate, ctx.bindings);
  const decisionId = composeDecisionId(chooseN.internalDecisionId, bindTemplate, bind);
  const evalCtx = { ...ctx, bindings: resolveEffectBindings(ctx) };
  const { minCardinality, maxCardinality } = resolveChooseNCardinality(chooseN, evalCtx, (issue) => {
    if (issue.code === 'CHOOSE_N_MODE_INVALID') {
      throw effectRuntimeError('choiceRuntimeValidationFailed', 'chooseN must use either exact n or range max/min cardinality', {
        effectType: 'chooseN',
        bind,
        bindTemplate,
        chooseN,
      });
    }
    if (issue.code === 'CHOOSE_N_MIN_EVAL_INVALID') {
      throw effectRuntimeError('choiceRuntimeValidationFailed', 'chooseN minimum cardinality must evaluate to a non-negative integer', {
        effectType: 'chooseN',
        bind,
        bindTemplate,
        min: chooseN.min ?? 0,
        evaluatedMin: issue.value,
      });
    }
    if (issue.code === 'CHOOSE_N_MAX_EVAL_INVALID') {
      throw effectRuntimeError('choiceRuntimeValidationFailed', 'chooseN maximum cardinality must evaluate to a non-negative integer', {
        effectType: 'chooseN',
        bind,
        bindTemplate,
        max: chooseN.max,
        evaluatedMax: issue.value,
      });
    }
    if (issue.code === 'CHOOSE_N_MIN_INVALID') {
      throw effectRuntimeError('choiceRuntimeValidationFailed', 'chooseN minimum cardinality must be a non-negative integer', {
        effectType: 'chooseN',
        bind,
        bindTemplate,
        min: issue.value,
      });
    }
    if (issue.code === 'CHOOSE_N_MAX_INVALID') {
      throw effectRuntimeError('choiceRuntimeValidationFailed', 'chooseN maximum cardinality must be a non-negative integer', {
        effectType: 'chooseN',
        bind,
        bindTemplate,
        max: issue.value,
      });
    }
    throw effectRuntimeError('choiceRuntimeValidationFailed', 'chooseN min cannot exceed max', {
      effectType: 'chooseN',
      bind,
      bindTemplate,
      min: issue.min,
      max: issue.max,
    });
  });

  if (!Object.prototype.hasOwnProperty.call(ctx.moveParams, decisionId)) {
    throw effectRuntimeError('choiceRuntimeValidationFailed', `chooseN missing move param binding: ${bind} (${decisionId})`, {
      effectType: 'chooseN',
      bind,
      decisionId,
      availableMoveParams: Object.keys(ctx.moveParams).sort(),
    });
  }

  const selectedValue = ctx.moveParams[decisionId];
  if (!Array.isArray(selectedValue)) {
    throw effectRuntimeError('choiceRuntimeValidationFailed', `chooseN move param must be an array: ${bind}`, {
      effectType: 'chooseN',
      bind,
      actualType: typeof selectedValue,
      value: selectedValue,
    });
  }

  if (selectedValue.length < minCardinality || selectedValue.length > maxCardinality) {
    throw effectRuntimeError('choiceRuntimeValidationFailed', `chooseN selection cardinality mismatch for: ${bind}`, {
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
        throw effectRuntimeError('choiceRuntimeValidationFailed', `chooseN selections must be unique: ${bind}`, {
          effectType: 'chooseN',
          bind,
          duplicateValue: selectedValue[left],
        });
      }
    }
  }

  const options = evalQuery(chooseN.options, evalCtx);
  for (const selected of selectedValue) {
    if (!isInDomain(selected, options)) {
      throw effectRuntimeError('choiceRuntimeValidationFailed', `chooseN selection is outside options domain: ${bind}`, {
        effectType: 'chooseN',
        bind,
        selected,
        optionsCount: options.length,
      });
    }
  }

  return {
    state: ctx.state,
    rng: ctx.rng,
    bindings: {
      ...ctx.bindings,
      [bind]: selectedValue,
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
    throw effectRuntimeError('choiceRuntimeValidationFailed', 'rollRandom.min must evaluate to a safe integer', {
      effectType: 'rollRandom',
      actualType: typeof minValue,
      value: minValue,
    });
  }

  if (typeof maxValue !== 'number' || !Number.isSafeInteger(maxValue)) {
    throw effectRuntimeError('choiceRuntimeValidationFailed', 'rollRandom.max must evaluate to a safe integer', {
      effectType: 'rollRandom',
      actualType: typeof maxValue,
      value: maxValue,
    });
  }

  if (minValue > maxValue) {
    throw effectRuntimeError('choiceRuntimeValidationFailed', `rollRandom requires min <= max, received min=${minValue}, max=${maxValue}`, {
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

  const nestedResult = applyEffectsWithBudget(effect.rollRandom.in, nestedCtx, budget);
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
  const spaceId = resolveZoneRef(space, evalCtx);
  const evaluatedState = evalValue(stateExpr, evalCtx);

  if (typeof evaluatedState !== 'string') {
    throw effectRuntimeError('choiceRuntimeValidationFailed', 'setMarker.state must evaluate to a string', {
      effectType: 'setMarker',
      actualType: typeof evaluatedState,
      value: evaluatedState,
    });
  }

  const lattice = resolveMarkerLattice(ctx, marker, 'setMarker');
  if (!lattice.states.includes(evaluatedState)) {
    throw effectRuntimeError('choiceRuntimeValidationFailed', `Invalid marker state "${evaluatedState}" for lattice "${marker}"`, {
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
    throw effectRuntimeError('choiceRuntimeValidationFailed', 'shiftMarker.delta must evaluate to a safe integer', {
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
    throw effectRuntimeError('choiceRuntimeValidationFailed', `Current marker state "${currentState}" not found in lattice "${marker}"`, {
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

export const applySetGlobalMarker = (
  effect: Extract<EffectAST, { readonly setGlobalMarker: unknown }>,
  ctx: EffectContext,
): EffectResult => {
  const { marker, state: stateExpr } = effect.setGlobalMarker;
  const evalCtx = { ...ctx, bindings: resolveEffectBindings(ctx) };
  const evaluatedState = evalValue(stateExpr, evalCtx);

  if (typeof evaluatedState !== 'string') {
    throw effectRuntimeError('choiceRuntimeValidationFailed', 'setGlobalMarker.state must evaluate to a string', {
      effectType: 'setGlobalMarker',
      actualType: typeof evaluatedState,
      value: evaluatedState,
    });
  }

  const lattice = resolveGlobalMarkerLattice(ctx, marker, 'setGlobalMarker');
  if (!lattice.states.includes(evaluatedState)) {
    throw effectRuntimeError('choiceRuntimeValidationFailed', `Invalid marker state "${evaluatedState}" for lattice "${marker}"`, {
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
    throw effectRuntimeError('choiceRuntimeValidationFailed', 'shiftGlobalMarker.delta must evaluate to a safe integer', {
      effectType: 'shiftGlobalMarker',
      actualType: typeof evaluatedDelta,
      value: evaluatedDelta,
    });
  }

  const lattice = resolveGlobalMarkerLattice(ctx, marker, 'shiftGlobalMarker');
  const currentState = ctx.state.globalMarkers?.[marker] ?? lattice.defaultState;
  const currentIndex = lattice.states.indexOf(currentState);

  if (currentIndex < 0) {
    throw effectRuntimeError('choiceRuntimeValidationFailed', `Current marker state "${currentState}" not found in lattice "${marker}"`, {
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
    throw effectRuntimeError('choiceRuntimeValidationFailed', 'flipGlobalMarker.marker must evaluate to a string', {
      effectType: 'flipGlobalMarker',
      actualType: typeof evaluatedMarker,
      value: evaluatedMarker,
    });
  }
  if (typeof evaluatedStateA !== 'string') {
    throw effectRuntimeError('choiceRuntimeValidationFailed', 'flipGlobalMarker.stateA must evaluate to a string', {
      effectType: 'flipGlobalMarker',
      actualType: typeof evaluatedStateA,
      value: evaluatedStateA,
    });
  }
  if (typeof evaluatedStateB !== 'string') {
    throw effectRuntimeError('choiceRuntimeValidationFailed', 'flipGlobalMarker.stateB must evaluate to a string', {
      effectType: 'flipGlobalMarker',
      actualType: typeof evaluatedStateB,
      value: evaluatedStateB,
    });
  }
  if (evaluatedStateA === evaluatedStateB) {
    throw effectRuntimeError('choiceRuntimeValidationFailed', 'flipGlobalMarker requires two distinct states', {
      effectType: 'flipGlobalMarker',
      marker: evaluatedMarker,
      stateA: evaluatedStateA,
      stateB: evaluatedStateB,
    });
  }

  const lattice = resolveGlobalMarkerLattice(ctx, evaluatedMarker, 'flipGlobalMarker');
  if (!lattice.states.includes(evaluatedStateA)) {
    throw effectRuntimeError(
      'choiceRuntimeValidationFailed',
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
      'choiceRuntimeValidationFailed',
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
  let nextState: string | null = null;
  if (currentState === evaluatedStateA) {
    nextState = evaluatedStateB;
  } else if (currentState === evaluatedStateB) {
    nextState = evaluatedStateA;
  } else {
    throw effectRuntimeError(
      'choiceRuntimeValidationFailed',
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
