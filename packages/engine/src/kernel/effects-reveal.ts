import type { PlayerId } from './branded.js';
import { effectRuntimeError } from './effect-error.js';
import {
  canonicalTokenFilterKey,
  canonicalizeObserverSelection,
  removeMatchingRevealGrants,
  revealGrantEquals,
} from './hidden-info-grants.js';
import { mapTokenFilterTraversalToTypeMismatch } from './token-filter-runtime-boundary.js';
import {
  resolvePlayersWithNormalization,
  resolveZoneWithNormalization,
  selectorResolutionFailurePolicyForMode,
} from './selector-resolution-normalization.js';
import { emitTrace } from './execution-collector.js';
import { resolveTraceProvenance } from './trace-provenance.js';
import { omitOptionalStateKey } from './state-shape.js';
import { EFFECT_RUNTIME_REASONS } from './runtime-reasons.js';
import { toTraceProvenanceContext } from './effect-context.js';
import type { EffectCursor, EffectEnv, MutableReadScope, PartialEffectResult } from './effect-context.js';
import type { EffectBudgetState } from './effects-control.js';
import type { ApplyEffectsWithBudget } from './effect-registry.js';
import { ensureRevealsCloned, type MutableGameState } from './state-draft.js';
import type { EffectAST, RevealGrant, TokenFilterExpr } from './types.js';

const canonicalTokenFilterKeyForRuntime = (filter: TokenFilterExpr): string => {
  try {
    return canonicalTokenFilterKey(filter);
  } catch (error: unknown) {
    return mapTokenFilterTraversalToTypeMismatch(error);
  }
};

const revealTraceProvenance = (env: EffectEnv, cursor: EffectCursor): ReturnType<typeof resolveTraceProvenance> =>
  resolveTraceProvenance(toTraceProvenanceContext(env, cursor));

export const applyConceal = (
  effect: Extract<EffectAST, { readonly conceal: unknown }>,
  env: EffectEnv,
  cursor: EffectCursor,
  scope: MutableReadScope,
  _budget: EffectBudgetState,
  _applyBatch: ApplyEffectsWithBudget,
): PartialEffectResult => {
  const onResolutionFailure = selectorResolutionFailurePolicyForMode(env.mode);
  const zoneId = String(
    resolveZoneWithNormalization(effect.conceal.zone, scope, {
      code: EFFECT_RUNTIME_REASONS.CONCEAL_RUNTIME_VALIDATION_FAILED,
      effectType: 'conceal',
      scope: 'zone',
      resolutionFailureMessage: 'conceal.zone resolution failed',
      onResolutionFailure,
    }),
  );

  if (cursor.state.zones[zoneId] === undefined) {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.CONCEAL_RUNTIME_VALIDATION_FAILED, `Zone state not found for selector result: ${zoneId}`, {
      effectType: 'conceal',
      field: 'zone',
      zoneId,
      availableZoneIds: Object.keys(cursor.state.zones).sort(),
    });
  }

  const expectedFilterKey = effect.conceal.filter === undefined ? null : canonicalTokenFilterKeyForRuntime(effect.conceal.filter);
  const existingReveals = cursor.state.reveals ?? {};
  if (existingReveals[zoneId] === undefined || existingReveals[zoneId].length === 0) {
    return { state: cursor.state, rng: cursor.rng, emittedEvents: [] };
  }

  let from: 'all' | readonly PlayerId[] | undefined;
  if (effect.conceal.from !== undefined) {
    if (effect.conceal.from === 'all') {
      from = 'all';
    } else {
      from = canonicalizeObserverSelection(
        resolvePlayersWithNormalization(effect.conceal.from, scope, {
          code: EFFECT_RUNTIME_REASONS.CONCEAL_RUNTIME_VALIDATION_FAILED,
          effectType: 'conceal',
          scope: 'from',
          resolutionFailureMessage: 'conceal.from selector resolution failed',
          onResolutionFailure,
        }),
        cursor.state.playerCount,
      );
    }
  }
  const existingZoneGrants = existingReveals[zoneId] ?? [];
  const removal = removeMatchingRevealGrants(existingZoneGrants, {
    ...(from === undefined ? {} : { from }),
    ...(expectedFilterKey === null ? {} : { filterKey: expectedFilterKey }),
  });
  const remainingZoneGrants = removal.remaining;

  if (removal.removedCount === 0) {
    return { state: cursor.state, rng: cursor.rng, emittedEvents: [] };
  }

  emitTrace(env.collector, {
    kind: 'conceal',
    zone: zoneId,
    ...(from === undefined ? {} : { from }),
    ...(effect.conceal.filter === undefined ? {} : { filter: effect.conceal.filter }),
    grantsRemoved: removal.removedCount,
    provenance: revealTraceProvenance(env, cursor),
  });

  if (cursor.tracker) {
    const mutableState = cursor.state as MutableGameState;
    ensureRevealsCloned(mutableState, cursor.tracker);
    const mutableReveals = mutableState.reveals as Record<string, unknown>;
    if (remainingZoneGrants.length === 0) {
      delete mutableReveals[zoneId];
    } else {
      mutableReveals[zoneId] = remainingZoneGrants;
    }
    if (Object.keys(mutableReveals).length === 0) {
      mutableState.reveals = undefined;
      return { state: mutableState, rng: cursor.rng, emittedEvents: [] };
    }
    return { state: cursor.state, rng: cursor.rng, emittedEvents: [] };
  }

  const nextReveals = { ...existingReveals };
  if (remainingZoneGrants.length === 0) {
    delete nextReveals[zoneId];
  } else {
    nextReveals[zoneId] = remainingZoneGrants;
  }

  if (Object.keys(nextReveals).length === 0) {
    return { state: omitOptionalStateKey(cursor.state, 'reveals'), rng: cursor.rng, emittedEvents: [] };
  }

  return { state: { ...cursor.state, reveals: nextReveals }, rng: cursor.rng, emittedEvents: [] };
};

export const applyReveal = (
  effect: Extract<EffectAST, { readonly reveal: unknown }>,
  env: EffectEnv,
  cursor: EffectCursor,
  scope: MutableReadScope,
  _budget: EffectBudgetState,
  _applyBatch: ApplyEffectsWithBudget,
): PartialEffectResult => {
  const onResolutionFailure = selectorResolutionFailurePolicyForMode(env.mode);
  const zoneId = String(
    resolveZoneWithNormalization(effect.reveal.zone, scope, {
      code: EFFECT_RUNTIME_REASONS.REVEAL_RUNTIME_VALIDATION_FAILED,
      effectType: 'reveal',
      scope: 'zone',
      resolutionFailureMessage: 'reveal.zone resolution failed',
      onResolutionFailure,
    }),
  );

  if (cursor.state.zones[zoneId] === undefined) {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.REVEAL_RUNTIME_VALIDATION_FAILED, `Zone state not found for selector result: ${zoneId}`, {
      effectType: 'reveal',
      field: 'zone',
      zoneId,
      availableZoneIds: Object.keys(cursor.state.zones).sort(),
    });
  }

  let observers: 'all' | readonly PlayerId[];
  if (effect.reveal.to === 'all') {
    observers = 'all';
  } else {
    observers = canonicalizeObserverSelection(
      resolvePlayersWithNormalization(effect.reveal.to, scope, {
        code: EFFECT_RUNTIME_REASONS.REVEAL_RUNTIME_VALIDATION_FAILED,
        effectType: 'reveal',
        scope: 'to',
        resolutionFailureMessage: 'reveal.to selector resolution failed',
        onResolutionFailure,
      }),
      cursor.state.playerCount,
    );
  }

  if (effect.reveal.filter !== undefined) {
    // Validate filter shape eagerly so runtime behavior does not depend on dedupe-state branches.
    canonicalTokenFilterKeyForRuntime(effect.reveal.filter);
  }

  const grant: RevealGrant = {
    observers,
    ...(effect.reveal.filter === undefined ? {} : { filter: effect.reveal.filter }),
  };

  const existingReveals = cursor.state.reveals ?? {};
  const existingZoneGrants = existingReveals[zoneId] ?? [];
  if (existingZoneGrants.some((existing) => revealGrantEquals(existing, grant))) {
    return { state: cursor.state, rng: cursor.rng, emittedEvents: [] };
  }

  emitTrace(env.collector, {
    kind: 'reveal',
    zone: zoneId,
    observers,
    ...(effect.reveal.filter === undefined ? {} : { filter: effect.reveal.filter }),
    provenance: revealTraceProvenance(env, cursor),
  });

  if (cursor.tracker) {
    const mutableState = cursor.state as MutableGameState;
    if (mutableState.reveals === undefined) {
      mutableState.reveals = { [zoneId]: [grant] };
      cursor.tracker.reveals = true;
    } else {
      ensureRevealsCloned(mutableState, cursor.tracker);
      (mutableState.reveals as Record<string, readonly RevealGrant[]>)[zoneId] = [...existingZoneGrants, grant];
    }
    return { state: cursor.state, rng: cursor.rng, emittedEvents: [] };
  }

  const nextState = {
    ...cursor.state,
    reveals: {
      ...existingReveals,
      [zoneId]: [...existingZoneGrants, grant],
    },
  };

  return { state: nextState, rng: cursor.rng, emittedEvents: [] };
};
