import type { PlayerId } from './branded.js';
import { resolveZoneRef } from './resolve-zone-ref.js';
import { resolvePlayerSel } from './resolve-selectors.js';
import { effectRuntimeError } from './effect-error.js';
import {
  canonicalTokenFilterKey,
  canonicalizeObserverSelection,
  removeMatchingRevealGrants,
  revealGrantEquals,
} from './hidden-info-grants.js';
import { emitTrace } from './execution-collector.js';
import { resolveTraceProvenance } from './trace-provenance.js';
import type { EffectContext, EffectResult } from './effect-context.js';
import type { EffectAST, GameState, RevealGrant } from './types.js';

const resolveEffectBindings = (ctx: EffectContext): Readonly<Record<string, unknown>> => ({
  ...ctx.moveParams,
  ...ctx.bindings,
});

export const applyConceal = (
  effect: Extract<EffectAST, { readonly conceal: unknown }>,
  ctx: EffectContext,
): EffectResult => {
  const evalCtx = { ...ctx, bindings: resolveEffectBindings(ctx) };
  const zoneId = String(resolveZoneRef(effect.conceal.zone, evalCtx));

  if (ctx.state.zones[zoneId] === undefined) {
    throw effectRuntimeError('concealRuntimeValidationFailed', `Zone state not found for selector result: ${zoneId}`, {
      effectType: 'conceal',
      field: 'zone',
      zoneId,
      availableZoneIds: Object.keys(ctx.state.zones).sort(),
    });
  }

  const existingReveals = ctx.state.reveals ?? {};
  if (existingReveals[zoneId] === undefined || existingReveals[zoneId].length === 0) {
    return { state: ctx.state, rng: ctx.rng, emittedEvents: [] };
  }

  let from: 'all' | readonly PlayerId[] | undefined;
  if (effect.conceal.from !== undefined) {
    if (effect.conceal.from === 'all') {
      from = 'all';
    } else {
      from = canonicalizeObserverSelection(resolvePlayerSel(effect.conceal.from, evalCtx), ctx.state.playerCount);
    }
  }
  const expectedFilterKey = effect.conceal.filter === undefined ? null : canonicalTokenFilterKey(effect.conceal.filter);
  const existingZoneGrants = existingReveals[zoneId] ?? [];
  const removal = removeMatchingRevealGrants(existingZoneGrants, {
    ...(from === undefined ? {} : { from }),
    ...(expectedFilterKey === null ? {} : { filterKey: expectedFilterKey }),
  });
  const remainingZoneGrants = removal.remaining;

  if (removal.removedCount === 0) {
    return { state: ctx.state, rng: ctx.rng, emittedEvents: [] };
  }

  emitTrace(ctx.collector, {
    kind: 'conceal',
    zone: zoneId,
    ...(from === undefined ? {} : { from }),
    ...(effect.conceal.filter === undefined ? {} : { filter: effect.conceal.filter }),
    grantsRemoved: removal.removedCount,
    provenance: resolveTraceProvenance(ctx),
  });

  const remainingReveals = { ...existingReveals } as Record<string, readonly RevealGrant[]>;
  if (remainingZoneGrants.length === 0) {
    delete remainingReveals[zoneId];
  } else {
    remainingReveals[zoneId] = remainingZoneGrants;
  }

  if (Object.keys(remainingReveals).length === 0) {
    const stateWithoutReveals = Object.fromEntries(
      Object.entries(ctx.state).filter(([key]) => key !== 'reveals'),
    ) as GameState;
    return { state: stateWithoutReveals as GameState, rng: ctx.rng, emittedEvents: [] };
  }

  return { state: { ...ctx.state, reveals: remainingReveals }, rng: ctx.rng, emittedEvents: [] };
};

export const applyReveal = (effect: Extract<EffectAST, { readonly reveal: unknown }>, ctx: EffectContext): EffectResult => {
  const evalCtx = { ...ctx, bindings: resolveEffectBindings(ctx) };
  const zoneId = String(resolveZoneRef(effect.reveal.zone, evalCtx));

  if (ctx.state.zones[zoneId] === undefined) {
    throw effectRuntimeError('revealRuntimeValidationFailed', `Zone state not found for selector result: ${zoneId}`, {
      effectType: 'reveal',
      field: 'zone',
      zoneId,
      availableZoneIds: Object.keys(ctx.state.zones).sort(),
    });
  }

  let observers: 'all' | readonly PlayerId[];
  if (effect.reveal.to === 'all') {
    observers = 'all';
  } else {
    observers = canonicalizeObserverSelection(resolvePlayerSel(effect.reveal.to, evalCtx), ctx.state.playerCount);
  }

  const grant: RevealGrant = {
    observers,
    ...(effect.reveal.filter === undefined ? {} : { filter: effect.reveal.filter }),
  };

  const existingReveals = ctx.state.reveals ?? {};
  const existingZoneGrants = existingReveals[zoneId] ?? [];
  if (existingZoneGrants.some((existing) => revealGrantEquals(existing, grant))) {
    return { state: ctx.state, rng: ctx.rng, emittedEvents: [] };
  }

  const nextState = {
    ...ctx.state,
    reveals: {
      ...existingReveals,
      [zoneId]: [...existingZoneGrants, grant],
    },
  };

  emitTrace(ctx.collector, {
    kind: 'reveal',
    zone: zoneId,
    observers,
    ...(effect.reveal.filter === undefined ? {} : { filter: effect.reveal.filter }),
    provenance: resolveTraceProvenance(ctx),
  });

  return { state: nextState, rng: ctx.rng, emittedEvents: [] };
};
