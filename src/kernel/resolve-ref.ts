import { resolveMapSpaceId, resolveSinglePlayerSel, resolveSingleZoneSel } from './resolve-selectors.js';
import type { EvalContext } from './eval-context.js';
import { missingBindingError, missingVarError, typeMismatchError, zonePropNotFoundError } from './eval-error.js';
import type { Reference, Token } from './types.js';

function isScalarValue(value: unknown): value is number | boolean | string {
  return typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string';
}

function isTokenBinding(value: unknown): value is Token {
  return typeof value === 'object' && value !== null && 'props' in value;
}

export function resolveRef(ref: Reference, ctx: EvalContext): number | boolean | string {
  if (ref.ref === 'gvar') {
    const value = ctx.state.globalVars[ref.var];
    if (value === undefined) {
      throw missingVarError(`Global variable not found: ${ref.var}`, {
        reference: ref,
        availableGlobalVars: Object.keys(ctx.state.globalVars).sort(),
      });
    }
    return value;
  }

  if (ref.ref === 'pvar') {
    const playerId = resolveSinglePlayerSel(ref.player, ctx);
    const playerVars = ctx.state.perPlayerVars[String(playerId)];
    if (playerVars === undefined) {
      throw missingVarError(`Per-player vars missing for player ${playerId}`, {
        reference: ref,
        playerId,
        availablePlayers: Object.keys(ctx.state.perPlayerVars).sort(),
      });
    }

    const value = playerVars[ref.var];
    if (value === undefined) {
      throw missingVarError(`Per-player variable not found: ${ref.var}`, {
        reference: ref,
        playerId,
        availablePlayerVars: Object.keys(playerVars).sort(),
      });
    }

    return value;
  }

  if (ref.ref === 'zoneCount') {
    const zoneId = resolveSingleZoneSel(ref.zone, ctx);
    const zoneTokens = ctx.state.zones[String(zoneId)];
    if (zoneTokens === undefined) {
      throw missingVarError(`Zone state not found for selector result: ${zoneId}`, {
        reference: ref,
        zoneId,
        availableZoneIds: Object.keys(ctx.state.zones).sort(),
      });
    }

    return zoneTokens.length;
  }

  if (ref.ref === 'tokenProp') {
    const boundToken = ctx.bindings[ref.token];
    if (boundToken === undefined) {
      throw missingBindingError(`Token binding not found: ${ref.token}`, {
        reference: ref,
        binding: ref.token,
        availableBindings: Object.keys(ctx.bindings).sort(),
      });
    }

    if (!isTokenBinding(boundToken)) {
      throw typeMismatchError(`Token binding ${ref.token} must resolve to a Token`, {
        reference: ref,
        binding: ref.token,
        actualType: typeof boundToken,
        value: boundToken,
      });
    }

    const propValue = boundToken.props[ref.prop];
    if (propValue === undefined) {
      throw missingVarError(`Token property not found: ${ref.prop}`, {
        reference: ref,
        binding: ref.token,
        availableBindings: Object.keys(ctx.bindings).sort(),
        availableTokenProps: Object.keys(boundToken.props).sort(),
      });
    }

    if (!isScalarValue(propValue)) {
      throw typeMismatchError(`Token property ${ref.prop} must be a scalar`, {
        reference: ref,
        binding: ref.token,
        prop: ref.prop,
        actualType: typeof propValue,
        value: propValue,
      });
    }

    return propValue;
  }

  if (ref.ref === 'tokenZone') {
    const boundToken = ctx.bindings[ref.token];
    if (boundToken === undefined) {
      throw missingBindingError(`Token binding not found: ${ref.token}`, {
        reference: ref,
        binding: ref.token,
        availableBindings: Object.keys(ctx.bindings).sort(),
      });
    }

    if (!isTokenBinding(boundToken)) {
      throw typeMismatchError(`Token binding ${ref.token} must resolve to a Token`, {
        reference: ref,
        binding: ref.token,
        actualType: typeof boundToken,
        value: boundToken,
      });
    }

    const tokenId = boundToken.id;
    for (const [zoneId, tokens] of Object.entries(ctx.state.zones)) {
      if (tokens.some((token) => token.id === tokenId)) {
        return zoneId;
      }
    }

    throw missingVarError(`Token ${String(tokenId)} not found in any zone`, {
      reference: ref,
      binding: ref.token,
      tokenId: String(tokenId),
      availableZoneIds: Object.keys(ctx.state.zones).sort(),
    });
  }

  if (ref.ref === 'markerState') {
    const spaceMarkers = ctx.state.markers[ref.space];
    if (spaceMarkers === undefined) {
      throw missingVarError(`No markers found for space: ${ref.space}`, {
        reference: ref,
        space: ref.space,
        availableSpaces: Object.keys(ctx.state.markers).sort(),
      });
    }

    const state = spaceMarkers[ref.marker];
    if (state === undefined) {
      throw missingVarError(`Marker not found on space: ${ref.marker}`, {
        reference: ref,
        space: ref.space,
        marker: ref.marker,
        availableMarkers: Object.keys(spaceMarkers).sort(),
      });
    }

    return state;
  }

  if (ref.ref === 'activePlayer') {
    return String(ctx.activePlayer);
  }

  if (ref.ref === 'zoneProp') {
    const zoneId = resolveMapSpaceId(ref.zone, ctx);
    const mapSpaces = ctx.mapSpaces;
    if (mapSpaces === undefined) {
      throw zonePropNotFoundError(`No mapSpaces available to look up zone properties`, {
        reference: ref,
        zoneId,
      });
    }

    const spaceDef = mapSpaces.find((space) => space.id === String(zoneId));
    if (spaceDef === undefined) {
      throw zonePropNotFoundError(`Zone not found in mapSpaces: ${String(zoneId)}`, {
        reference: ref,
        zoneId,
        availableSpaceIds: mapSpaces.map((space) => space.id).sort(),
      });
    }

    const propValue = (spaceDef as unknown as Record<string, unknown>)[ref.prop];
    if (propValue === undefined) {
      throw zonePropNotFoundError(`Property "${ref.prop}" not found on zone ${String(zoneId)}`, {
        reference: ref,
        zoneId,
        prop: ref.prop,
        availableProps: Object.keys(spaceDef).sort(),
      });
    }

    if (Array.isArray(propValue)) {
      throw typeMismatchError(
        `Property "${ref.prop}" on zone ${String(zoneId)} is an array, not a scalar. Use zonePropIncludes to check array membership.`,
        {
          reference: ref,
          zoneId,
          prop: ref.prop,
          actualType: 'array',
        },
      );
    }

    if (!isScalarValue(propValue)) {
      throw typeMismatchError(`Property "${ref.prop}" on zone ${String(zoneId)} must be a scalar`, {
        reference: ref,
        zoneId,
        prop: ref.prop,
        actualType: typeof propValue,
        value: propValue,
      });
    }

    return propValue;
  }

  const value = ctx.bindings[ref.name];
  if (value === undefined) {
    throw missingBindingError(`Binding not found: ${ref.name}`, {
      reference: ref,
      binding: ref.name,
      availableBindings: Object.keys(ctx.bindings).sort(),
    });
  }

  if (!isScalarValue(value)) {
    throw typeMismatchError(`Binding ${ref.name} must resolve to number | boolean | string`, {
      reference: ref,
      binding: ref.name,
      actualType: typeof value,
      value,
    });
  }

  return value;
}
