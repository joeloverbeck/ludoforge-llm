import { resolveMapSpaceId, resolveSinglePlayerSel, resolveSingleZoneSel } from './resolve-selectors.js';
import type { EvalContext } from './eval-context.js';
import { resolveBindingTemplate } from './binding-template.js';
import { missingBindingError, missingVarError, typeMismatchError, zonePropNotFoundError } from './eval-error.js';
import { buildRuntimeTableIndex } from './runtime-table-index.js';
import {
  runtimeTableContractMissingEvalError,
  runtimeTableFieldMissingEvalError,
  runtimeTableFieldTypeEvalError,
  runtimeTableFieldUndeclaredEvalError,
  runtimeTableIssueEvalError,
  runtimeTableRowBindingTypeEvalError,
} from './runtime-table-eval-errors.js';
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
    const playerVars = ctx.state.perPlayerVars[playerId];
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

  if (ref.ref === 'assetField') {
    const tableIndex = ctx.runtimeTableIndex ?? buildRuntimeTableIndex(ctx.def);
    const entry = tableIndex.tablesById.get(ref.tableId);
    if (entry === undefined) {
      throw runtimeTableContractMissingEvalError({ reference: ref }, ref.tableId, tableIndex.tableIds);
    }
    if (entry.issue !== undefined) {
      throw runtimeTableIssueEvalError(
        { reference: ref },
        ref.tableId,
        entry.contract,
        entry.issue,
        (ctx.def.runtimeDataAssets ?? []).map((candidate) => candidate.id).sort((left, right) => left.localeCompare(right)),
      );
    }

    const resolvedRowBinding = resolveBindingTemplate(ref.row, ctx.bindings);
    const boundRow = ctx.bindings[resolvedRowBinding];
    if (boundRow === undefined) {
      throw missingBindingError(`Row binding not found: ${resolvedRowBinding}`, {
        reference: ref,
        row: resolvedRowBinding,
        rowTemplate: ref.row,
        availableBindings: Object.keys(ctx.bindings).sort(),
      });
    }

    if (typeof boundRow !== 'object' || boundRow === null || Array.isArray(boundRow)) {
      throw runtimeTableRowBindingTypeEvalError({ reference: ref }, resolvedRowBinding, ref.row, boundRow);
    }

    const rowValue = (boundRow as Record<string, unknown>)[ref.field];
    const fieldContract = entry.fieldContractsByName.get(ref.field);
    if (fieldContract === undefined) {
      throw runtimeTableFieldUndeclaredEvalError(
        { reference: ref },
        ref.tableId,
        ref.field,
        entry.contract.fields.map((field) => field.field).sort((left, right) => left.localeCompare(right)),
      );
    }

    if (rowValue === undefined) {
      throw runtimeTableFieldMissingEvalError(
        { reference: ref },
        ref.tableId,
        ref.field,
        resolvedRowBinding,
        ref.row,
        Object.keys(boundRow as Record<string, unknown>).sort(),
      );
    }

    const actualContractType =
      typeof rowValue === 'string'
        ? 'string'
        : typeof rowValue === 'boolean'
          ? 'boolean'
          : typeof rowValue === 'number' && Number.isSafeInteger(rowValue)
            ? 'int'
            : null;
    if (actualContractType === null || actualContractType !== fieldContract.type || !isScalarValue(rowValue)) {
      throw runtimeTableFieldTypeEvalError(
        { reference: ref },
        resolvedRowBinding,
        ref.row,
        ref.tableId,
        ref.field,
        fieldContract.type,
        rowValue,
      );
    }

    return rowValue;
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

    const tokenId = typeof boundToken === 'string'
      ? boundToken
      : isTokenBinding(boundToken)
        ? boundToken.id
        : null;

    if (tokenId === null) {
      throw typeMismatchError(`Token binding ${ref.token} must resolve to a Token`, {
        reference: ref,
        binding: ref.token,
        actualType: typeof boundToken,
        value: boundToken,
      });
    }
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
    const spaceId = resolveMapSpaceId(ref.space, ctx);
    const spaceMarkers = ctx.state.markers[spaceId] ?? {};

    const state = spaceMarkers[ref.marker];
    if (state !== undefined) {
      return state;
    }

    const lattice = ctx.def.markerLattices?.find((candidate) => candidate.id === ref.marker);
    if (lattice !== undefined) {
      return lattice.defaultState;
    }

    throw missingVarError(`Marker lattice not found: ${ref.marker}`, {
      reference: ref,
      markerId: ref.marker,
      availableMarkerLattices: (ctx.def.markerLattices ?? []).map((candidate) => candidate.id).sort(),
    });
  }

  if (ref.ref === 'globalMarkerState') {
    const state = ctx.state.globalMarkers?.[ref.marker];
    if (state !== undefined) {
      return state;
    }

    const lattice = ctx.def.globalMarkerLattices?.find((candidate) => candidate.id === ref.marker);
    if (lattice !== undefined) {
      return lattice.defaultState;
    }

    throw missingVarError(`Global marker lattice not found: ${ref.marker}`, {
      reference: ref,
      markerId: ref.marker,
      availableGlobalMarkerLattices: (ctx.def.globalMarkerLattices ?? []).map((candidate) => candidate.id).sort(),
    });
  }

  if (ref.ref === 'activePlayer') {
    return ctx.activePlayer;
  }

  if (ref.ref === 'zoneProp') {
    const zoneId = resolveMapSpaceId(ref.zone, ctx);
    const zoneDef = ctx.def.zones.find((zone) => zone.id === String(zoneId));
    if (zoneDef === undefined) {
      throw zonePropNotFoundError(`Zone not found: ${String(zoneId)}`, {
        reference: ref,
        zoneId,
        availableZoneIds: ctx.def.zones.map((zone) => zone.id).sort(),
      });
    }

    // Synthetic zone properties: 'id' and 'category' are first-class ZoneDef fields,
    // not stored in attributes.
    if (ref.prop === 'id') {
      return zoneDef.id;
    }
    if (ref.prop === 'category') {
      if (zoneDef.category === undefined) {
        throw zonePropNotFoundError(`Property "${ref.prop}" not found on zone ${String(zoneId)} (zone has no category)`, {
          reference: ref,
          zoneId,
          prop: ref.prop,
          availableProps: ['id', ...(zoneDef.category !== undefined ? ['category'] : []), ...Object.keys(zoneDef.attributes ?? {})].sort(),
        });
      }
      return zoneDef.category;
    }

    const propValue = zoneDef.attributes?.[ref.prop];
    if (propValue === undefined) {
      throw zonePropNotFoundError(`Property "${ref.prop}" not found on zone ${String(zoneId)}`, {
        reference: ref,
        zoneId,
        prop: ref.prop,
        availableProps: ['id', ...(zoneDef.category !== undefined ? ['category'] : []), ...Object.keys(zoneDef.attributes ?? {})].sort(),
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

  const resolvedName = resolveBindingTemplate(ref.name, ctx.bindings);
  const value = ctx.bindings[resolvedName];
  if (value === undefined) {
    throw missingBindingError(`Binding not found: ${resolvedName}`, {
      reference: ref,
      binding: resolvedName,
      bindingTemplate: ref.name,
      availableBindings: Object.keys(ctx.bindings).sort(),
    });
  }

  if (!isScalarValue(value)) {
    throw typeMismatchError(`Binding ${resolvedName} must resolve to number | boolean | string`, {
      reference: ref,
      binding: resolvedName,
      bindingTemplate: ref.name,
      actualType: typeof value,
      value,
    });
  }

  return value;
}
