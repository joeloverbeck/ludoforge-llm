import { getLatticeMap, getZoneMap } from './def-lookup.js';
import { resolveMapSpaceId, resolveSinglePlayerSel, resolveSingleZoneSel } from './resolve-selectors.js';
import { resolveScopedVarNameExprValue } from './scoped-var-name-resolution.js';
import type { ReadContext } from './eval-context.js';
import { resolveBindingTemplate } from './binding-template.js';
import { missingBindingError, missingVarError, typeMismatchError, zonePropNotFoundError } from './eval-error.js';
import { resolveFreeOperationSequenceKey } from './free-operation-sequence-key.js';
import { buildRuntimeTableIndex } from './runtime-table-index.js';
import { getTokenStateIndexEntry } from './token-state-index.js';
import {
  runtimeTableContractMissingEvalError,
  runtimeTableFieldMissingEvalError,
  runtimeTableFieldTypeEvalError,
  runtimeTableFieldUndeclaredEvalError,
  runtimeTableIssueEvalError,
  runtimeTableRowBindingTypeEvalError,
} from './runtime-table-eval-errors.js';
import { resolveRuntimeTokenBindingValue } from './token-binding.js';
import { resolveTokenViewFieldValue } from './token-view.js';
import type { Reference, ScalarArrayValue, Token } from './types.js';

export type ResolveRefCacheValue = number | boolean | string | ScalarArrayValue;

/**
 * Drive-scoped memoisation cache for `resolveRef`.
 *
 * Allocated fresh per `driveSyntheticCompletion` call (see
 * `packages/engine/src/agents/policy-preview.ts`). Lives entirely inside the
 * drive's synchronous call frame and is garbage-collected at drive exit.
 *
 * F11 (immutability) — scoped internal mutation: the cache never escapes the
 * drive scope and is never visible to callers outside `driveSyntheticCompletion`.
 *
 * F8 (determinism): `resolveRef` is referentially transparent for fixed
 * `(ref, ctx)`. The cache is keyed on every input that affects output:
 * the ref object identity, bindings reference identity, free-operation overlay
 * identity, `state.stateHash`, and `activePlayer` / `actorPlayer`. Same input
 * → same key → same cached output.
 *
 * Bindings-mutation hook: `eval-value.ts:evalAggregate` reuses one mutable
 * `itemBindings` object across aggregate items. The cache must be told to
 * forget entries keyed on that bindings reference whenever its content
 * changes; see `invalidateBindings` and the call site inside `evalAggregate`.
 */
export interface ResolveRefCache {
  get(ref: Reference, ctx: ReadContext): ResolveRefCacheValue | undefined;
  set(ref: Reference, ctx: ReadContext, value: ResolveRefCacheValue): void;
  invalidateBindings(bindings: object): void;
  clear(): void;
}

/**
 * Allocate a fresh resolveRef cache.
 *
 * Cache invariants:
 * - Outer key: the bindings object reference. Each unique `ctx.bindings` gets
 *   its own inner `Map`, so mutation of one bindings object cannot pollute
 *   another (e.g., outer ctx vs aggregate's `itemBindings`).
 * - Inner key: deterministic string composed of `state.stateHash`, free-operation
 *   overlay reference identity, `activePlayer`, and `actorPlayer`. Ref identity
 *   is stored under that context key in a WeakMap; binding identity is implicit
 *   in the outer key.
 * - Mutation safety: `invalidateBindings(obj)` drops the inner map for `obj`,
 *   which is what `evalAggregate` calls after each `itemBindings[bind] = item`.
 */
export function createResolveRefCache(): ResolveRefCache {
  const entriesByBindings = new WeakMap<object, Map<string, WeakMap<Reference, ResolveRefCacheValue>>>();
  const bindingsVersions = new WeakMap<object, number>();
  const contextKeyCache = new WeakMap<ReadContext, {
    readonly stateHash: bigint;
    readonly overlay: object | undefined;
    readonly activePlayer: unknown;
    readonly actorPlayer: unknown;
    readonly key: string;
  }>();
  const contextEntriesCache = new WeakMap<ReadContext, {
    readonly bindings: object;
    readonly bindingsVersion: number;
    readonly stateHash: bigint;
    readonly overlay: object | undefined;
    readonly activePlayer: unknown;
    readonly actorPlayer: unknown;
    readonly entriesByRef: WeakMap<Reference, ResolveRefCacheValue>;
  }>();
  let nextOverlayId = 1;
  const overlayIdMap = new WeakMap<object, number>();

  const overlayIdFor = (overlay: object | undefined): number => {
    if (overlay === undefined) {
      return 0;
    }
    let id = overlayIdMap.get(overlay);
    if (id === undefined) {
      id = nextOverlayId++;
      overlayIdMap.set(overlay, id);
    }
    return id;
  };

  const buildContextKey = (ctx: ReadContext): string => {
    const cached = contextKeyCache.get(ctx);
    if (
      cached !== undefined
      && cached.stateHash === ctx.state.stateHash
      && cached.overlay === ctx.freeOperationOverlay
      && cached.activePlayer === ctx.activePlayer
      && cached.actorPlayer === ctx.actorPlayer
    ) {
      return cached.key;
    }
    const overlayId = overlayIdFor(ctx.freeOperationOverlay);
    const stateHashHex = ctx.state.stateHash.toString(16);
    const key = `${stateHashHex}|${overlayId}|${String(ctx.activePlayer)}|${String(ctx.actorPlayer)}`;
    contextKeyCache.set(ctx, {
      stateHash: ctx.state.stateHash,
      overlay: ctx.freeOperationOverlay,
      activePlayer: ctx.activePlayer,
      actorPlayer: ctx.actorPlayer,
      key,
    });
    return key;
  };

  const bindingsVersionFor = (bindings: object): number => bindingsVersions.get(bindings) ?? 0;

  const getCachedContextEntries = (ctx: ReadContext): WeakMap<Reference, ResolveRefCacheValue> | undefined => {
    const cached = contextEntriesCache.get(ctx);
    if (
      cached !== undefined
      && cached.bindings === ctx.bindings
      && cached.bindingsVersion === bindingsVersionFor(ctx.bindings)
      && cached.stateHash === ctx.state.stateHash
      && cached.overlay === ctx.freeOperationOverlay
      && cached.activePlayer === ctx.activePlayer
      && cached.actorPlayer === ctx.actorPlayer
    ) {
      return cached.entriesByRef;
    }
    return undefined;
  };

  const setCachedContextEntries = (
    ctx: ReadContext,
    entriesByRef: WeakMap<Reference, ResolveRefCacheValue>,
  ): void => {
    contextEntriesCache.set(ctx, {
      bindings: ctx.bindings,
      bindingsVersion: bindingsVersionFor(ctx.bindings),
      stateHash: ctx.state.stateHash,
      overlay: ctx.freeOperationOverlay,
      activePlayer: ctx.activePlayer,
      actorPlayer: ctx.actorPlayer,
      entriesByRef,
    });
  };

  // The set of bindings objects the cache has populated entries for. WeakMap
  // alone is not iterable; we track keys explicitly so `clear()` can drop all
  // entries deterministically. Bindings references are short-lived (per
  // drive iteration), so this set is bounded.
  const knownBindings = new Set<object>();

  return {
    get(ref, ctx) {
      const cachedEntries = getCachedContextEntries(ctx);
      if (cachedEntries !== undefined) {
        return cachedEntries.get(ref);
      }
      const innerMap = entriesByBindings.get(ctx.bindings);
      if (innerMap === undefined) {
        return undefined;
      }
      const entriesByRef = innerMap.get(buildContextKey(ctx));
      if (entriesByRef === undefined) {
        return undefined;
      }
      setCachedContextEntries(ctx, entriesByRef);
      return entriesByRef.get(ref);
    },
    set(ref, ctx, value) {
      let innerMap = entriesByBindings.get(ctx.bindings);
      if (innerMap === undefined) {
        innerMap = new Map();
        entriesByBindings.set(ctx.bindings, innerMap);
        knownBindings.add(ctx.bindings);
      }
      const contextKey = buildContextKey(ctx);
      let entriesByRef = innerMap.get(contextKey);
      if (entriesByRef === undefined) {
        entriesByRef = new WeakMap();
        innerMap.set(contextKey, entriesByRef);
      }
      setCachedContextEntries(ctx, entriesByRef);
      entriesByRef.set(ref, value);
    },
    invalidateBindings(bindings) {
      bindingsVersions.set(bindings, bindingsVersionFor(bindings) + 1);
      entriesByBindings.delete(bindings);
      knownBindings.delete(bindings);
    },
    clear() {
      for (const bindings of knownBindings) {
        bindingsVersions.set(bindings, bindingsVersionFor(bindings) + 1);
        entriesByBindings.delete(bindings);
      }
      knownBindings.clear();
    },
  };
}

/**
 * Memoised wrapper around `resolveRef`. Same return shape; same throw
 * behaviour on miss (errors propagate from the underlying call). Cache
 * stores only successful resolutions, so error paths run unchanged.
 */
export function resolveRefMemoised(
  ref: Reference,
  ctx: ReadContext,
  cache: ResolveRefCache,
): ResolveRefCacheValue {
  const cached = cache.get(ref, ctx);
  if (cached !== undefined) {
    return cached;
  }
  const value = resolveRef(ref, ctx);
  cache.set(ref, ctx, value);
  return value;
}

function isScalarValue(value: unknown): value is number | boolean | string {
  return typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string';
}

function isScalarArrayValue(value: unknown): value is ScalarArrayValue {
  return Array.isArray(value) && value.every((entry) => isScalarValue(entry));
}

function resolveTokenBinding(bindingName: string, value: unknown, reference: Reference): {
  readonly tokenId: string;
  readonly tokenFromBinding: Token | null;
} {
  const resolved = resolveRuntimeTokenBindingValue(value);
  if (resolved !== null) {
    return resolved;
  }
  throw typeMismatchError(`Token binding ${bindingName} must resolve to a Token or token-id string`, {
    reference,
    binding: bindingName,
    actualType: typeof value,
    value,
  });
}

function resolveTokenIdFromBinding(bindingName: string, value: unknown, reference: Reference): string {
  return resolveTokenBinding(bindingName, value, reference).tokenId;
}

function findTokenByIdInZones(ctx: ReadContext, tokenId: string): Token | null {
  return getTokenStateIndexEntry(ctx.state, tokenId)?.token ?? null;
}

function resolveActiveSeatId(ctx: ReadContext): string | null {
  const runtimeSeatOrder = ctx.state.turnOrderState.type === 'cardDriven'
    && 'runtime' in ctx.state.turnOrderState
    && Array.isArray(ctx.state.turnOrderState.runtime?.seatOrder)
    ? ctx.state.turnOrderState.runtime.seatOrder
    : undefined;
  const configuredSeatOrder = ctx.def.turnOrder?.type === 'cardDriven'
    ? ctx.def.turnOrder.config.turnFlow.eligibility.seats
    : undefined;
  const seatId = runtimeSeatOrder?.[ctx.activePlayer]
    ?? configuredSeatOrder?.[ctx.activePlayer]
    ?? ctx.def.seats?.[ctx.activePlayer]?.id;
  if (typeof seatId === 'string' && seatId.length > 0) {
    return seatId;
  }
  return String(ctx.activePlayer);
}

function resolveScopedVarNameForReference(ref: Extract<Reference, { ref: 'gvar' | 'pvar' | 'zoneVar' }>, ctx: ReadContext): string {
  const resolved = resolveScopedVarNameExprValue(ref.var, ctx);
  if (typeof resolved === 'string') {
    return resolved;
  }
  if (typeof ref.var === 'string') {
    return ref.var;
  }
  if (ref.var.ref === 'binding') {
    if (resolved === undefined) {
      throw missingBindingError(`Scoped variable name binding not found: ${ref.var.name}`, {
        reference: ref,
        binding: ref.var.name,
        availableBindings: Object.keys(ctx.bindings),
      });
    }
    throw typeMismatchError(`Scoped variable name binding must resolve to string: ${ref.var.name}`, {
      reference: ref,
      binding: ref.var.name,
      actualType: typeof resolved,
      value: resolved,
    });
  }
  if (resolved === undefined) {
    throw missingVarError(`Scoped variable name grantContext not found: ${ref.var.key}`, {
      reference: ref,
      key: ref.var.key,
      availableGrantContextKeys: Object.keys(ctx.freeOperationOverlay?.grantContext ?? {}),
    });
  }
  throw typeMismatchError(`Scoped variable name grantContext must resolve to string: ${ref.var.key}`, {
    reference: ref,
    key: ref.var.key,
    actualType: typeof resolved,
    value: resolved,
  });
}

export function resolveRef(ref: Reference, ctx: ReadContext): number | boolean | string | ScalarArrayValue {
  // Fast path: 'binding' refs are the most common type in effect chains
  // (let-bound values). Check first to avoid falling through 14 if-else checks.
  if (ref.ref === 'binding') {
    const resolvedName = ref.name.indexOf('{') === -1 ? ref.name : resolveBindingTemplate(ref.name, ctx.bindings);
    const value = ctx.bindings[resolvedName];
    if (value === undefined) {
      throw missingBindingError(`Binding not found: ${resolvedName}`, {
        reference: ref,
        binding: resolvedName,
        bindingTemplate: ref.name,
        availableBindings: Object.keys(ctx.bindings).sort(),
      });
    }

    if (!isScalarValue(value) && !isScalarArrayValue(value)) {
      throw typeMismatchError(`Binding ${resolvedName} must resolve to number | boolean | string | scalar-array`, {
        reference: ref,
        binding: resolvedName,
        actualType: typeof value,
        value,
      });
    }

    return value;
  }

  if (ref.ref === 'gvar') {
    const variableName = resolveScopedVarNameForReference(ref, ctx);
    const value = ctx.state.globalVars[variableName];
    if (value === undefined) {
      throw missingVarError(`Global variable not found: ${variableName}`, {
        reference: ref,
        var: variableName,
        availableGlobalVars: Object.keys(ctx.state.globalVars).sort(),
      });
    }
    return value;
  }

  if (ref.ref === 'pvar') {
    const playerId = resolveSinglePlayerSel(ref.player, ctx);
    const variableName = resolveScopedVarNameForReference(ref, ctx);
    const playerVars = ctx.state.perPlayerVars[playerId];
    if (playerVars === undefined) {
      throw missingVarError(`Per-player vars missing for player ${playerId}`, {
        reference: ref,
        playerId,
        availablePlayers: Object.keys(ctx.state.perPlayerVars).sort(),
      });
    }

    const value = playerVars[variableName];
    if (value === undefined) {
      throw missingVarError(`Per-player variable not found: ${variableName}`, {
        reference: ref,
        playerId,
        var: variableName,
        availablePlayerVars: Object.keys(playerVars).sort(),
      });
    }

    return value;
  }

  if (ref.ref === 'zoneVar') {
    const zoneId = resolveSingleZoneSel(ref.zone, ctx);
    const variableName = resolveScopedVarNameForReference(ref, ctx);
    const zoneVarMap = ctx.state.zoneVars[String(zoneId)];
    if (zoneVarMap === undefined) {
      throw missingVarError(`Zone variable state not found for zone: ${String(zoneId)}`, {
        reference: ref,
        zoneId: String(zoneId),
        availableZones: Object.keys(ctx.state.zoneVars).sort(),
      });
    }

    const value = zoneVarMap[variableName];
    if (value === undefined) {
      throw missingVarError(`Zone variable not found: ${variableName} in zone ${String(zoneId)}`, {
        reference: ref,
        zoneId: String(zoneId),
        var: variableName,
        availableZoneVars: Object.keys(zoneVarMap).sort(),
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

    const resolvedBinding = resolveTokenBinding(ref.token, boundToken, ref);
    const tokenId = resolvedBinding.tokenId;
    const token = resolvedBinding.tokenFromBinding ?? findTokenByIdInZones(ctx, tokenId);
    if (token === null) {
      throw missingVarError(`Token ${String(tokenId)} not found in any zone`, {
        reference: ref,
        binding: ref.token,
        tokenId: String(tokenId),
        availableZoneIds: Object.keys(ctx.state.zones).sort(),
      });
    }

    const propValue = resolveTokenViewFieldValue(token, ref.prop, ctx.freeOperationOverlay);
    if (propValue === undefined) {
      throw missingVarError(`Token property not found: ${ref.prop}`, {
        reference: ref,
        binding: ref.token,
        availableBindings: Object.keys(ctx.bindings).sort(),
        availableTokenProps: Object.keys(token.props).sort(),
      });
    }

    return propValue;
  }

  if (ref.ref === 'activeSeat') {
    const seatId = resolveActiveSeatId(ctx);
    if (seatId === null) {
      throw missingVarError(`Seat not found for active player ${ctx.activePlayer}`, {
        reference: ref,
        activePlayer: ctx.activePlayer,
        availableSeatIds: [
          ...(ctx.def.seats ?? []).map((seat) => seat.id),
          ...((ctx.state.turnOrderState.type === 'cardDriven' ? ctx.state.turnOrderState.runtime.seatOrder : []) ?? []),
          ...((ctx.def.turnOrder?.type === 'cardDriven' ? ctx.def.turnOrder.config.turnFlow.eligibility.seats : []) ?? []),
        ].sort(),
      });
    }
    return seatId;
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

  if (ref.ref === 'grantContext') {
    const value = ctx.freeOperationOverlay?.grantContext?.[ref.key];
    if (value === undefined) {
      throw missingVarError(`Free-operation grant context key not found: ${ref.key}`, {
        reference: ref,
        availableGrantContextKeys: Object.keys(ctx.freeOperationOverlay?.grantContext ?? {}).sort(),
      });
    }
    if (!isScalarValue(value) && !isScalarArrayValue(value)) {
      throw typeMismatchError(`Free-operation grant context ${ref.key} must resolve to a scalar or scalar array in this position`, {
        reference: ref,
        key: ref.key,
        actualType: Array.isArray(value) ? 'array' : typeof value,
        value,
      });
    }
    return value;
  }

  if (ref.ref === 'capturedSequenceZones') {
    const resolvedKey = resolveFreeOperationSequenceKey(ref.key, ctx);
    const value = resolvedKey === undefined
      ? undefined
      : ctx.freeOperationOverlay?.capturedSequenceZonesByKey?.[resolvedKey];
    if (value === undefined) {
      throw missingVarError('Captured free-operation sequence zones not found', {
        reference: ref,
        key: resolvedKey,
        availableCapturedSequenceZoneKeys: Object.keys(ctx.freeOperationOverlay?.capturedSequenceZonesByKey ?? {}).sort(),
      });
    }
    return value;
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

    const tokenId = resolveTokenIdFromBinding(ref.token, boundToken, ref);
    const tokenStateEntry = getTokenStateIndexEntry(ctx.state, tokenId);
    if (tokenStateEntry !== undefined) {
      return tokenStateEntry.zoneId;
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
    const availableMapSpaceIds = ctx.def.zones.map((zone) => String(zone.id));
    if (!availableMapSpaceIds.includes(String(spaceId))) {
      throw missingVarError(`Unknown map-space id for markerState: ${String(spaceId)}`, {
        reference: ref,
        spaceId: String(spaceId),
        availableMapSpaceIds,
      });
    }
    const spaceMarkers = ctx.state.markers[spaceId] ?? {};

    const state = spaceMarkers[ref.marker];
    if (state !== undefined) {
      return state;
    }

    const lattice = getLatticeMap(ctx.def)?.get(ref.marker);
    if (lattice !== undefined) {
      return lattice.defaultState;
    }

    throw missingVarError(`Marker lattice not found: ${ref.marker}`, {
      reference: ref,
      markerId: ref.marker,
      availableMarkerLattices: (ctx.def.markerLattices ?? []).map((candidate) => candidate.id),
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
      availableGlobalMarkerLattices: (ctx.def.globalMarkerLattices ?? []).map((candidate) => candidate.id),
    });
  }

  if (ref.ref === 'activePlayer') {
    return ctx.activePlayer;
  }

  if (ref.ref === 'zoneProp') {
    const zoneId = resolveMapSpaceId(ref.zone, ctx);
    const zoneDef = getZoneMap(ctx.def).get(String(zoneId));
    if (zoneDef === undefined) {
      throw zonePropNotFoundError(`Zone not found: ${String(zoneId)}`, {
        reference: ref,
        zoneId,
        availableZoneIds: ctx.def.zones.map((zone) => zone.id),
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
          availableProps: ['id', ...(zoneDef.category !== undefined ? ['category'] : []), ...Object.keys(zoneDef.attributes ?? {})],
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
        availableProps: ['id', ...(zoneDef.category !== undefined ? ['category'] : []), ...Object.keys(zoneDef.attributes ?? {})],
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

  // Exhaustive — 'binding' is handled at the top of the function.
  throw new Error(`Unknown Reference type: ${(ref as { ref: string }).ref}`);
}
