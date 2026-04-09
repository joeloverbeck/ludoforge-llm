import { getLatticeMap } from './def-lookup.js';
import type { EffectContext, EffectCursor, EffectEnv, MutableReadScope, PartialEffectResult } from './effect-context.js';
import { effectRuntimeError } from './effect-error.js';
import { evalCondition } from './eval-condition.js';
import { evalValue } from './eval-value.js';
import { updateChoiceScope } from './effects-choice.js';
import type { EffectBudgetState } from './effects-control.js';
import type { ApplyEffectsWithBudget } from './effect-registry.js';
import { EFFECT_RUNTIME_REASONS } from './runtime-reasons.js';
import { resolveZoneWithNormalization, selectorResolutionFailurePolicyForMode } from './selector-resolution-normalization.js';
import { findSpaceMarkerConstraintViolation, resolveSpaceMarkerShift } from './space-marker-rules.js';
import { ensureMarkerCloned, type MutableGameState } from './state-draft.js';
import type { ZobristFeature } from './types-core.js';
import type { EffectAST } from './types.js';
import { addToRunningHash, updateRunningHash } from './zobrist.js';

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
  scope: MutableReadScope,
  _budget: EffectBudgetState,
  _applyBatch: ApplyEffectsWithBudget,
): PartialEffectResult => {
  const { marker, delta: deltaExpr } = effect.shiftGlobalMarker;
  const evalCtx = updateChoiceScope(scope, env, cursor);
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
