import { asPlayerId, asZoneId, isPlayerId, type PlayerId, type ZoneId } from './branded.js';
import type { EvalContext } from './eval-context.js';
import { EVAL_ERROR_DEFER_CLASS } from './eval-error-defer-class.js';
import {
  missingBindingError,
  missingVarError,
  selectorCardinalityError,
  typeMismatchError,
} from './eval-error.js';
import {
  selectorCardinalityPlayerCountContext,
  selectorCardinalityPlayerResolvedContext,
  selectorCardinalityZoneResolvedContext,
} from './selector-cardinality-context.js';
import type { PlayerSel, ZoneSel } from './types.js';

const OWNER_SPEC_SEPARATOR = ':';

function listPlayers(ctx: Pick<EvalContext, 'state'>): readonly PlayerId[] {
  return Array.from({ length: ctx.state.playerCount }, (_, index) => asPlayerId(index));
}

function sortAndDedupePlayers(players: readonly PlayerId[]): readonly PlayerId[] {
  return [...new Set(players)].sort((left, right) => left - right);
}

function sortAndDedupeZones(zones: readonly ZoneId[]): readonly ZoneId[] {
  return [...new Set(zones)].sort((left, right) => left.localeCompare(right));
}

function assertKnownPlayer(player: PlayerId, ctx: EvalContext, source: PlayerSel): void {
  const players = listPlayers(ctx);
  if (!players.includes(player)) {
    throw missingVarError(`Player selector resolved to unknown player id ${player}`, {
      selector: source,
      playerId: player,
      availablePlayers: players,
    });
  }
}

function parseZoneSel(sel: ZoneSel): { readonly zoneBase: string; readonly ownerSpec: string } {
  const delimiterIndex = sel.indexOf(OWNER_SPEC_SEPARATOR);
  if (delimiterIndex <= 0 || delimiterIndex === sel.length - 1) {
    throw typeMismatchError(`Zone selector must use "zoneBase:ownerSpec" format: ${sel}`, {
      selector: sel,
    });
  }

  return {
    zoneBase: sel.slice(0, delimiterIndex),
    ownerSpec: sel.slice(delimiterIndex + 1),
  };
}

function parseOwnerSpec(ownerSpec: string): PlayerSel | null {
  if (ownerSpec === 'actor' || ownerSpec === 'active' || ownerSpec === 'allOther') {
    return ownerSpec;
  }

  if (ownerSpec === 'left' || ownerSpec === 'right') {
    return { relative: ownerSpec };
  }

  if (/^[0-9]+$/.test(ownerSpec)) {
    return { id: asPlayerId(Number(ownerSpec)) };
  }

  if (ownerSpec.startsWith('$')) {
    return { chosen: ownerSpec };
  }

  return null;
}

function listZoneIds(ctx: Pick<EvalContext, 'def'>): readonly ZoneId[] {
  return sortAndDedupeZones(ctx.def.zones.map((zone) => zone.id));
}

function listZoneCandidatesByBase(zoneBase: string, ctx: Pick<EvalContext, 'def'>): readonly ZoneId[] {
  const prefix = `${zoneBase}${OWNER_SPEC_SEPARATOR}`;
  return listZoneIds(ctx).filter((zoneId) => zoneId.startsWith(prefix));
}

function resolveBoundZoneBinding(zoneBinding: ZoneSel, ctx: Pick<EvalContext, 'bindings'>): unknown {
  const boundValue = ctx.bindings[zoneBinding];
  if (boundValue === undefined) {
    throw missingBindingError(`Zone binding not found: ${zoneBinding}`, {
      selector: zoneBinding,
      binding: zoneBinding,
      availableBindings: Object.keys(ctx.bindings).sort(),
    });
  }

  return boundValue;
}

export function resolvePlayerSel(sel: PlayerSel, ctx: EvalContext): readonly PlayerId[] {
  const players = listPlayers(ctx);

  if (sel === 'actor') {
    return sortAndDedupePlayers([ctx.actorPlayer]);
  }

  if (sel === 'active') {
    return sortAndDedupePlayers([ctx.activePlayer]);
  }

  if (sel === 'all') {
    return players;
  }

  if (sel === 'allOther') {
    return players.filter((playerId) => playerId !== ctx.actorPlayer);
  }

  if (typeof sel === 'object' && sel !== null && 'id' in sel) {
    assertKnownPlayer(sel.id, ctx, sel);
    return [sel.id];
  }

  if (typeof sel === 'object' && sel !== null && 'chosen' in sel) {
    const boundValue = ctx.bindings[sel.chosen];
    if (boundValue === undefined) {
      throw missingBindingError(`Chosen player binding not found: ${sel.chosen}`, {
        selector: sel,
        availableBindings: Object.keys(ctx.bindings).sort(),
      });
    }

    if (!isPlayerId(boundValue)) {
      throw typeMismatchError(`Chosen binding ${sel.chosen} must resolve to PlayerId`, {
        selector: sel,
        binding: sel.chosen,
        actualType: typeof boundValue,
        value: boundValue,
      });
    }

    assertKnownPlayer(boundValue, ctx, sel);
    return [boundValue];
  }

  if (typeof sel !== 'object' || sel === null || !('relative' in sel)) {
    throw typeMismatchError('Invalid player selector value', {
      selector: sel,
      expected: 'actor|active|all|allOther|{id}|{chosen}|{relative}',
    });
  }

  if (players.length === 0) {
    throw selectorCardinalityError(
      'Cannot resolve relative selector with zero players',
      selectorCardinalityPlayerCountContext(sel, ctx.state.playerCount),
    );
  }

  const actorIndex = Number(ctx.actorPlayer);
  const offset = sel.relative === 'left' ? -1 : 1;
  const wrappedIndex = (actorIndex + offset + players.length) % players.length;
  return [asPlayerId(wrappedIndex)];
}

export function resolveSinglePlayerSel(sel: PlayerSel, ctx: EvalContext): PlayerId {
  const resolved = resolvePlayerSel(sel, ctx);
  if (resolved.length !== 1) {
    throw selectorCardinalityError(
      'Expected exactly one player from selector',
      selectorCardinalityPlayerResolvedContext(sel, resolved),
    );
  }

  return resolved[0]!;
}

export function resolveZoneSel(sel: ZoneSel, ctx: EvalContext): readonly ZoneId[] {
  if (sel.startsWith('$')) {
    const boundValue = resolveBoundZoneBinding(sel, ctx);

    const allZoneIds = listZoneIds(ctx);
    const validateKnownZone = (zoneId: ZoneId): void => {
      if (!allZoneIds.includes(zoneId)) {
        throw missingVarError(`Unknown zone in bound selector ${sel}: ${zoneId}`, {
          selector: sel,
          zoneId,
          availableZoneIds: allZoneIds,
        });
      }
    };

    if (typeof boundValue === 'string') {
      const zoneId = asZoneId(boundValue);
      validateKnownZone(zoneId);
      return [zoneId];
    }

    if (Array.isArray(boundValue)) {
      const resolved: ZoneId[] = [];
      for (const entry of boundValue) {
        if (typeof entry !== 'string') {
          throw typeMismatchError(`Zone binding ${sel} array entries must be strings`, {
            selector: sel,
            binding: sel,
            actualType: typeof entry,
            value: entry,
          });
        }
        const zoneId = asZoneId(entry);
        validateKnownZone(zoneId);
        resolved.push(zoneId);
      }
      return sortAndDedupeZones(resolved);
    }

    throw typeMismatchError(`Zone binding ${sel} must resolve to a zone id string or array of zone ids`, {
      selector: sel,
      binding: sel,
      actualType: typeof boundValue,
      value: boundValue,
    });
  }

  const { zoneBase, ownerSpec } = parseZoneSel(sel);
  const candidatesForBase = listZoneCandidatesByBase(zoneBase, ctx);

  if (candidatesForBase.length === 0) {
    throw missingVarError(`Unknown zone base in selector: ${zoneBase}`, {
      selector: sel,
      zoneBase,
      availableZoneIds: listZoneIds(ctx),
    });
  }

  if (ownerSpec === 'none') {
    const zoneId = asZoneId(`${zoneBase}:none`);
    if (!candidatesForBase.includes(zoneId)) {
      throw missingVarError(`Unknown unowned zone variant: ${zoneId}`, {
        selector: sel,
        candidates: candidatesForBase,
      });
    }
    return [zoneId];
  }

  if (ownerSpec === 'all') {
    const resolvedPlayers = resolvePlayerSel('all', ctx);
    if (resolvedPlayers.length === 0) {
      return [];
    }

    const resolved = resolvedPlayers
      .map((playerId) => asZoneId(`${zoneBase}:${playerId}`))
      .filter((zoneId) => candidatesForBase.includes(zoneId));

    if (resolved.length === 0) {
      throw missingVarError(`Zone selector did not match any player-owned zones: ${sel}`, {
        selector: sel,
        candidates: candidatesForBase,
      });
    }

    return sortAndDedupeZones(resolved);
  }

  const parsedOwner = parseOwnerSpec(ownerSpec);
  if (parsedOwner === null) {
    throw typeMismatchError(`Unsupported zone owner selector: ${ownerSpec}`, {
      selector: sel,
      ownerSpec,
      candidates: candidatesForBase,
    });
  }

  const resolvedPlayers = resolvePlayerSel(parsedOwner, ctx);
  if (resolvedPlayers.length === 0) {
    return [];
  }

  const resolved = resolvedPlayers
    .map((playerId) => asZoneId(`${zoneBase}:${playerId}`))
    .filter((zoneId) => candidatesForBase.includes(zoneId));

  if (resolved.length === 0) {
    throw missingVarError(`Zone selector did not match any concrete zones: ${sel}`, {
      selector: sel,
      ownerSpec,
      candidates: candidatesForBase,
    });
  }

  return sortAndDedupeZones(resolved);
}

export function resolveSingleZoneSel(sel: ZoneSel, ctx: EvalContext): ZoneId {
  const resolved = resolveZoneSel(sel, ctx);
  if (resolved.length !== 1) {
    throw selectorCardinalityError(
      'Expected exactly one zone from selector',
      selectorCardinalityZoneResolvedContext(
        sel,
        resolved,
        sel.startsWith('$') && resolved.length === 0
          ? EVAL_ERROR_DEFER_CLASS.UNRESOLVED_BINDING_SELECTOR_CARDINALITY
          : undefined,
      ),
    );
  }

  return resolved[0]!;
}

export function resolveMapSpaceId(zone: ZoneSel, ctx: Pick<EvalContext, 'bindings'>): ZoneId {
  if (zone.startsWith('$')) {
    const bound = resolveBoundZoneBinding(zone, ctx);
    if (typeof bound !== 'string') {
      throw typeMismatchError(`Zone binding ${zone} must resolve to a string`, {
        selector: zone,
        binding: zone,
        actualType: typeof bound,
        value: bound,
      });
    }
    return asZoneId(bound);
  }
  return asZoneId(zone);
}
