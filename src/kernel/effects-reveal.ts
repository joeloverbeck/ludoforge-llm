import type { PlayerId } from './branded.js';
import { resolveZoneRef } from './resolve-zone-ref.js';
import { resolvePlayerSel } from './resolve-selectors.js';
import { EffectRuntimeError } from './effect-error.js';
import type { EffectContext, EffectResult } from './effect-context.js';
import type { EffectAST, RevealGrant } from './types.js';

const resolveEffectBindings = (ctx: EffectContext): Readonly<Record<string, unknown>> => ({
  ...ctx.moveParams,
  ...ctx.bindings,
});

const normalizeObservers = (players: readonly PlayerId[]): readonly PlayerId[] => (
  [...new Set(players)].sort((left, right) => left - right)
);

const filterKey = (grant: RevealGrant): string => JSON.stringify(grant.filter ?? null);

const grantsEqual = (left: RevealGrant, right: RevealGrant): boolean => {
  if (left.observers === 'all' || right.observers === 'all') {
    if (left.observers !== right.observers) {
      return false;
    }
  } else {
    if (left.observers.length !== right.observers.length) {
      return false;
    }
    for (let index = 0; index < left.observers.length; index += 1) {
      if (left.observers[index] !== right.observers[index]) {
        return false;
      }
    }
  }

  return filterKey(left) === filterKey(right);
};

export const applyReveal = (effect: Extract<EffectAST, { readonly reveal: unknown }>, ctx: EffectContext): EffectResult => {
  const evalCtx = { ...ctx, bindings: resolveEffectBindings(ctx) };
  const zoneId = String(resolveZoneRef(effect.reveal.zone, evalCtx));

  if (ctx.state.zones[zoneId] === undefined) {
    throw new EffectRuntimeError('EFFECT_RUNTIME', `Zone state not found for selector result: ${zoneId}`, {
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
    const selected = normalizeObservers(resolvePlayerSel(effect.reveal.to, evalCtx));
    observers = selected.length === ctx.state.playerCount ? 'all' : selected;
  }

  const grant: RevealGrant = {
    observers,
    ...(effect.reveal.filter === undefined ? {} : { filter: effect.reveal.filter }),
  };

  const existingReveals = ctx.state.reveals ?? {};
  const existingZoneGrants = existingReveals[zoneId] ?? [];
  if (existingZoneGrants.some((existing) => grantsEqual(existing, grant))) {
    return { state: ctx.state, rng: ctx.rng, emittedEvents: [] };
  }

  const nextState = {
    ...ctx.state,
    reveals: {
      ...existingReveals,
      [zoneId]: [...existingZoneGrants, grant],
    },
  };

  return { state: nextState, rng: ctx.rng, emittedEvents: [] };
};
