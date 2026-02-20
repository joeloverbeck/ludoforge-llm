import type { EffectTraceEntry, GameDef, TriggerEvent, TriggerLogEntry } from '@ludoforge/engine/runtime';

import type { VisualConfigProvider } from '../config/visual-config-provider.js';
import { formatIdAsDisplayName } from '../utils/format-display-name.js';
import { projectEffectTraceEntry, projectTriggerEvent } from './trace-projection.js';

export interface EventLogEntry {
  readonly id: string;
  readonly kind: 'movement' | 'variable' | 'trigger' | 'phase' | 'token' | 'lifecycle';
  readonly message: string;
  readonly playerId?: number;
  readonly zoneIds: readonly string[];
  readonly tokenIds: readonly string[];
  readonly depth: number;
  readonly moveIndex: number;
}

interface PlayerLookup {
  readonly factionByPlayer: ReadonlyMap<number, string>;
  readonly playerByFaction: ReadonlyMap<string, number>;
}

export function translateEffectTrace(
  effectTrace: readonly EffectTraceEntry[],
  triggerLog: readonly TriggerLogEntry[],
  visualConfig: VisualConfigProvider,
  gameDef: GameDef,
  moveIndex: number,
): readonly EventLogEntry[] {
  const lookup = buildPlayerLookup(gameDef);

  const effects = effectTrace.map((entry, entryIndex) =>
    translateEffectEntry(entry, entryIndex, moveIndex, visualConfig, lookup),
  );
  const triggers = triggerLog.map((entry, entryIndex) =>
    translateTriggerEntry(entry, entryIndex, moveIndex, visualConfig, lookup),
  );

  return [...effects, ...triggers];
}

function translateEffectEntry(
  entry: EffectTraceEntry,
  entryIndex: number,
  moveIndex: number,
  visualConfig: VisualConfigProvider,
  lookup: PlayerLookup,
): EventLogEntry {
  const projection = projectEffectTraceEntry(entry);
  const base = {
    id: `move-${moveIndex}-effect-${entryIndex}`,
    depth: 0,
    moveIndex,
    zoneIds: projection.zoneIds,
    tokenIds: projection.tokenIds,
    ...optionalPlayerId(projection.playerId),
  } as const;

  switch (entry.kind) {
    case 'moveToken':
      return {
        ...base,
        kind: 'movement',
        message: `Moved ${formatIdAsDisplayName(entry.tokenId)} from ${resolveZoneName(entry.from, visualConfig)} to ${resolveZoneName(entry.to, visualConfig)}.`,
      };

    case 'varChange': {
      const scopePrefix = projection.playerId === undefined
        ? ''
        : `${resolvePlayerName(projection.playerId, visualConfig, lookup)}: `;
      return {
        ...base,
        kind: 'variable',
        message: `${scopePrefix}${formatIdAsDisplayName(entry.varName)} changed from ${formatValue(entry.oldValue)} to ${formatValue(entry.newValue)}.`,
      };
    }

    case 'resourceTransfer':
      return {
        ...base,
        kind: 'variable',
        message: `Transferred ${entry.actualAmount} ${formatIdAsDisplayName(entry.from.varName)} from ${formatResourceEndpoint(entry.from, visualConfig, lookup)} to ${formatResourceEndpoint(entry.to, visualConfig, lookup)}.`,
      };

    case 'createToken':
      return {
        ...base,
        kind: 'token',
        message: `Created ${formatIdAsDisplayName(entry.type)} ${formatIdAsDisplayName(entry.tokenId)} in ${resolveZoneName(entry.zone, visualConfig)}.`,
      };

    case 'destroyToken':
      return {
        ...base,
        kind: 'token',
        message: `Removed ${formatIdAsDisplayName(entry.type)} ${formatIdAsDisplayName(entry.tokenId)} from ${resolveZoneName(entry.zone, visualConfig)}.`,
      };

    case 'setTokenProp':
      return {
        ...base,
        kind: 'token',
        message: `Set ${formatIdAsDisplayName(entry.prop)} on ${formatIdAsDisplayName(entry.tokenId)} from ${formatValue(entry.oldValue)} to ${formatValue(entry.newValue)}.`,
      };

    case 'lifecycleEvent':
      return {
        ...base,
        kind: 'phase',
        message: formatLifecycleEvent(entry.eventType, entry.phase),
      };

    case 'forEach':
      return {
        ...base,
        kind: 'lifecycle',
        message: `For-each ${formatIdAsDisplayName(entry.bind)} iterated ${entry.iteratedCount}/${entry.matchCount}.`,
      };

    case 'reduce':
      return {
        ...base,
        kind: 'lifecycle',
        message: `Reduce ${formatIdAsDisplayName(entry.resultBind)} iterated ${entry.iteratedCount}/${entry.matchCount}.`,
      };
  }
}

function translateTriggerEntry(
  entry: TriggerLogEntry,
  entryIndex: number,
  moveIndex: number,
  visualConfig: VisualConfigProvider,
  lookup: PlayerLookup,
): EventLogEntry {
  const base = {
    id: `move-${moveIndex}-trigger-${entryIndex}`,
    moveIndex,
  } as const;

  switch (entry.kind) {
    case 'fired': {
      const projection = projectTriggerEvent(entry.event);
      return {
        ...base,
        kind: 'trigger',
        message: `Triggered ${formatIdAsDisplayName(String(entry.triggerId))} on ${formatTriggerEvent(entry.event, visualConfig, lookup)}.`,
        depth: entry.depth,
        zoneIds: projection.zoneIds,
        tokenIds: [],
        ...optionalPlayerId(projection.playerId),
      };
    }

    case 'truncated': {
      const projection = projectTriggerEvent(entry.event);
      return {
        ...base,
        kind: 'trigger',
        message: `Trigger processing truncated for ${formatTriggerEvent(entry.event, visualConfig, lookup)}.`,
        depth: entry.depth,
        zoneIds: projection.zoneIds,
        tokenIds: [],
        ...optionalPlayerId(projection.playerId),
      };
    }

    case 'turnFlowLifecycle':
      return {
        ...base,
        kind: 'phase',
        message: `Turn flow ${formatIdAsDisplayName(entry.step)}.`,
        depth: 0,
        zoneIds: [],
        tokenIds: [],
      };

    case 'turnFlowEligibility':
      return {
        ...base,
        kind: 'phase',
        message: `Eligibility ${formatIdAsDisplayName(entry.step)}${entry.faction === null ? '' : ` for ${resolveFactionName(entry.faction, visualConfig)}`}.`,
        depth: 0,
        zoneIds: [],
        tokenIds: [],
        ...optionalPlayerId(entry.faction === null ? undefined : lookup.playerByFaction.get(entry.faction)),
      };

    case 'simultaneousSubmission':
      return {
        ...base,
        kind: 'lifecycle',
        message: `${resolveFactionName(entry.player, visualConfig)} submitted ${formatIdAsDisplayName(entry.move.actionId)}.`,
        depth: 0,
        zoneIds: [],
        tokenIds: [],
        ...optionalPlayerId(lookup.playerByFaction.get(entry.player)),
      };

    case 'simultaneousCommit':
      return {
        ...base,
        kind: 'lifecycle',
        message: `Simultaneous commit for ${entry.playersInOrder.length} players.`,
        depth: 0,
        zoneIds: [],
        tokenIds: [],
      };

    case 'operationPartial':
      return {
        ...base,
        kind: 'lifecycle',
        message: `${formatIdAsDisplayName(entry.actionId)} partially resolved: ${formatIdAsDisplayName(entry.reason)}.`,
        depth: 0,
        zoneIds: [],
        tokenIds: [],
      };

    case 'operationFree':
      return {
        ...base,
        kind: 'lifecycle',
        message: `${formatIdAsDisplayName(entry.actionId)} executed as free operation.`,
        depth: 0,
        zoneIds: [],
        tokenIds: [],
      };
  }
}

function buildPlayerLookup(gameDef: GameDef): PlayerLookup {
  const factionByPlayer = new Map<number, string>();
  const playerByFaction = new Map<string, number>();

  const orderedFactions = resolveOrderedFactions(gameDef);
  orderedFactions.forEach((factionId, index) => {
    factionByPlayer.set(index, factionId);
    playerByFaction.set(factionId, index);
  });

  return {
    factionByPlayer,
    playerByFaction,
  };
}

function resolveOrderedFactions(gameDef: GameDef): readonly string[] {
  if (gameDef.turnOrder?.type === 'cardDriven') {
    return gameDef.turnOrder.config.turnFlow.eligibility.factions;
  }
  if (gameDef.turnOrder?.type === 'fixedOrder') {
    return gameDef.turnOrder.order;
  }
  return (gameDef.factions ?? []).map((faction) => faction.id);
}

function resolveZoneName(zoneId: string, visualConfig: VisualConfigProvider): string {
  return visualConfig.getZoneLabel(zoneId) ?? formatIdAsDisplayName(zoneId);
}

function resolveFactionName(factionId: string, visualConfig: VisualConfigProvider): string {
  return visualConfig.getFactionDisplayName(factionId) ?? formatIdAsDisplayName(factionId);
}

function resolvePlayerName(
  playerId: number,
  visualConfig: VisualConfigProvider,
  lookup: PlayerLookup,
): string {
  const factionId = lookup.factionByPlayer.get(playerId);
  if (factionId === undefined) {
    return `Player ${playerId}`;
  }

  return resolveFactionName(factionId, visualConfig);
}

function formatResourceEndpoint(
  endpoint: { readonly scope: 'global' | 'perPlayer'; readonly varName: string; readonly player?: number },
  visualConfig: VisualConfigProvider,
  lookup: PlayerLookup,
): string {
  if (endpoint.scope === 'global') {
    return 'Global';
  }

  const playerId = endpoint.player;
  if (playerId === undefined) {
    return 'Per Player';
  }

  return resolvePlayerName(playerId, visualConfig, lookup);
}

function formatLifecycleEvent(eventType: string, phase: string | undefined): string {
  if (eventType === 'phaseEnter') {
    return `Entered ${formatIdAsDisplayName(phase ?? 'phase')}.`;
  }
  if (eventType === 'phaseExit') {
    return `Exited ${formatIdAsDisplayName(phase ?? 'phase')}.`;
  }
  if (eventType === 'turnStart') {
    return 'Turn started.';
  }
  return 'Turn ended.';
}

function formatTriggerEvent(
  event: TriggerEvent,
  visualConfig: VisualConfigProvider,
  lookup: PlayerLookup,
): string {
  switch (event.type) {
    case 'phaseEnter':
      return `phase enter ${formatIdAsDisplayName(String(event.phase))}`;
    case 'phaseExit':
      return `phase exit ${formatIdAsDisplayName(String(event.phase))}`;
    case 'turnStart':
      return 'turn start';
    case 'turnEnd':
      return 'turn end';
    case 'actionResolved':
      return event.action === undefined
        ? 'action resolved'
        : `action ${formatIdAsDisplayName(String(event.action))} resolved`;
    case 'tokenEntered':
      return event.zone === undefined
        ? 'token entered zone'
        : `token entered ${resolveZoneName(String(event.zone), visualConfig)}`;
    case 'varChanged': {
      const variable = event.var === undefined ? 'variable' : formatIdAsDisplayName(event.var);
      if (event.scope !== 'perPlayer') {
        return `${variable} changed`;
      }
      const playerId = projectTriggerEvent(event).playerId;
      const owner = playerId === undefined ? 'player' : resolvePlayerName(playerId, visualConfig, lookup);
      return `${variable} changed for ${owner}`;
    }
  }
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function optionalPlayerId(playerId: number | undefined): { readonly playerId?: number } {
  if (playerId === undefined) {
    return {};
  }
  return { playerId };
}
