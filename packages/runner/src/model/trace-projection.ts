import type { EffectTraceEntry, TriggerEvent } from '@ludoforge/engine/runtime';
import { normalizeTransferEndpoint, optionalPlayerId } from './model-utils.js';

export interface EffectTraceProjection {
  readonly kind: EffectTraceEntry['kind'];
  readonly isTriggered: boolean;
  readonly zoneIds: readonly string[];
  readonly tokenIds: readonly string[];
  readonly playerId?: number;
}

export interface TriggerEventProjection {
  readonly zoneIds: readonly string[];
  readonly playerId?: number;
}

export function projectEffectTraceEntry(entry: EffectTraceEntry): EffectTraceProjection {
  switch (entry.kind) {
    case 'moveToken':
      return {
        kind: entry.kind,
        isTriggered: isTriggeredEffectTraceEntry(entry),
        zoneIds: [entry.from, entry.to],
        tokenIds: [entry.tokenId],
      };

    case 'varChange':
      return {
        kind: entry.kind,
        isTriggered: isTriggeredEffectTraceEntry(entry),
        zoneIds: entry.scope === 'zone' && entry.zone !== undefined ? [entry.zone] : [],
        tokenIds: [],
        ...optionalPlayerId(entry.scope === 'perPlayer' ? toNumberOrUndefined(entry.player) : undefined),
      };

    case 'resourceTransfer': {
      const fromEndpoint = normalizeTransferEndpoint(entry.from, 'from');
      const toEndpoint = normalizeTransferEndpoint(entry.to, 'to');
      const fromPlayer = fromEndpoint.scope === 'perPlayer' ? fromEndpoint.playerId : undefined;
      const toPlayer = toEndpoint.scope === 'perPlayer' ? toEndpoint.playerId : undefined;
      const zoneIds = [
        ...(fromEndpoint.scope === 'zone' ? [fromEndpoint.zoneId] : []),
        ...(toEndpoint.scope === 'zone' ? [toEndpoint.zoneId] : []),
      ];
      return {
        kind: entry.kind,
        isTriggered: isTriggeredEffectTraceEntry(entry),
        zoneIds,
        tokenIds: [],
        ...optionalPlayerId(fromPlayer ?? toPlayer),
      };
    }

    case 'createToken':
    case 'destroyToken':
      return {
        kind: entry.kind,
        isTriggered: isTriggeredEffectTraceEntry(entry),
        zoneIds: [entry.zone],
        tokenIds: [entry.tokenId],
      };

    case 'setTokenProp':
      return {
        kind: entry.kind,
        isTriggered: isTriggeredEffectTraceEntry(entry),
        zoneIds: [],
        tokenIds: [entry.tokenId],
      };

    case 'forEach':
    case 'reduce':
    case 'lifecycleEvent':
      return {
        kind: entry.kind,
        isTriggered: isTriggeredEffectTraceEntry(entry),
        zoneIds: [],
        tokenIds: [],
      };

    case 'reveal': {
      const playerId = resolveOptionalSinglePlayer(entry.observers);
      return {
        kind: entry.kind,
        isTriggered: isTriggeredEffectTraceEntry(entry),
        zoneIds: [entry.zone],
        tokenIds: [],
        ...optionalPlayerId(playerId),
      };
    }

    case 'conceal': {
      const playerId = resolveOptionalSinglePlayer(entry.from);
      return {
        kind: entry.kind,
        isTriggered: isTriggeredEffectTraceEntry(entry),
        zoneIds: [entry.zone],
        tokenIds: [],
        ...optionalPlayerId(playerId),
      };
    }
  }
}

export function projectTriggerEvent(event: TriggerEvent): TriggerEventProjection {
  if (event.type === 'tokenEntered' && event.zone !== undefined) {
    return { zoneIds: [String(event.zone)] };
  }
  if (event.type === 'varChanged' && event.scope === 'perPlayer') {
    return {
      zoneIds: [],
      ...optionalPlayerId(toNumberOrUndefined(event.player)),
    };
  }
  if (event.type === 'varChanged' && event.scope === 'zone' && event.zone !== undefined) {
    return { zoneIds: [String(event.zone)] };
  }

  return { zoneIds: [] };
}

export function isTriggeredEffectTraceEntry(entry: EffectTraceEntry): boolean {
  return entry.provenance.eventContext === 'triggerEffect';
}

function toNumberOrUndefined(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  return value;
}

function resolveOptionalSinglePlayer(players: 'all' | readonly number[] | undefined): number | undefined {
  if (players === undefined || players === 'all' || players.length !== 1) {
    return undefined;
  }
  return toNumberOrUndefined(players[0]);
}
