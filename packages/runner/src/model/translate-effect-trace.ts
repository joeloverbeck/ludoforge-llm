import type { EffectTraceEntry, GameDef, TriggerEvent, TriggerLogEntry } from '@ludoforge/engine/runtime';

import type { VisualConfigProvider } from '../config/visual-config-provider.js';
import { formatIdAsDisplayName } from '../utils/format-display-name.js';
import type { EventLogKind } from './event-log-kind.js';
import {
  formatScopeEndpointDisplay,
  formatScopePrefixDisplay,
  normalizeTransferEndpoint,
  optionalPlayerId,
  type NormalizedTransferEndpoint,
  type ScopeEndpointDisplayInput,
  type ScopeKind,
} from './model-utils.js';
import { projectEffectTraceEntry, projectTriggerEvent } from './trace-projection.js';

export interface EventLogEntry {
  readonly id: string;
  readonly kind: EventLogKind;
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
  const scopeFormatter = createScopeFormatter(visualConfig, lookup);

  const effects = effectTrace.map((entry, entryIndex) =>
    translateEffectEntry(entry, entryIndex, moveIndex, visualConfig, lookup, scopeFormatter),
  );
  const triggers = triggerLog.map((entry, entryIndex) =>
    translateTriggerEntry(entry, entryIndex, moveIndex, visualConfig, lookup, scopeFormatter),
  );

  return [...effects, ...triggers];
}

function translateEffectEntry(
  entry: EffectTraceEntry,
  entryIndex: number,
  moveIndex: number,
  visualConfig: VisualConfigProvider,
  lookup: PlayerLookup,
  scopeFormatter: ScopeFormatter,
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
      const message = formatScopedVariableChangeMessage({
        scope: entry.scope,
        variable: formatIdAsDisplayName(entry.varName),
        playerId: projection.playerId,
        zoneId: entry.scope === 'zone' ? entry.zone : undefined,
        oldValue: entry.oldValue,
        newValue: entry.newValue,
        scopeFormatter,
      });
      return {
        ...base,
        kind: 'variable',
        message,
      };
    }

    case 'resourceTransfer':
      {
        const fromEndpoint = normalizeTransferEndpoint(entry.from, 'from');
        const toEndpoint = normalizeTransferEndpoint(entry.to, 'to');
        const fromVarName = fromEndpoint.varName;

        return {
          ...base,
          kind: 'variable',
          message:
            `Transferred ${entry.actualAmount} ${formatIdAsDisplayName(fromVarName)}` +
            ` from ${scopeFormatter.endpoint(toScopeEndpointDisplayInput(fromEndpoint))}` +
            ` to ${scopeFormatter.endpoint(toScopeEndpointDisplayInput(toEndpoint))}.`,
        };
      }

    case 'createToken':
      return {
        ...base,
        kind: 'token',
        message: `Created ${resolveTokenTypeName(entry.type, visualConfig)} ${formatIdAsDisplayName(entry.tokenId)} in ${resolveZoneName(entry.zone, visualConfig)}.`,
      };

    case 'destroyToken':
      return {
        ...base,
        kind: 'token',
        message: `Removed ${resolveTokenTypeName(entry.type, visualConfig)} ${formatIdAsDisplayName(entry.tokenId)} from ${resolveZoneName(entry.zone, visualConfig)}.`,
      };

    case 'setTokenProp':
      return {
        ...base,
        kind: 'token',
        message: `Set ${formatIdAsDisplayName(entry.prop)} on ${formatIdAsDisplayName(entry.tokenId)} from ${formatValue(entry.oldValue)} to ${formatValue(entry.newValue)}.`,
      };

    case 'reveal':
      return {
        ...base,
        kind: 'lifecycle',
        message: `Reveal in ${resolveZoneName(entry.zone, visualConfig)} to ${formatObserverSelection(entry.observers, visualConfig, lookup)}${formatOptionalFilter(entry.filter)}.`,
      };

    case 'conceal':
      return {
        ...base,
        kind: 'lifecycle',
        message:
          `Conceal in ${resolveZoneName(entry.zone, visualConfig)} removed ${entry.grantsRemoved} grant(s)` +
          `${formatConcealScope(entry.from, visualConfig, lookup)}${formatOptionalFilter(entry.filter)}.`,
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
        kind: 'iteration',
        message: `For-each ${summarizeLifecycleBinding(entry.bind, entry.macroOrigin)} iterated ${entry.iteratedCount}/${entry.matchCount}.`,
      };

    case 'reduce':
      return {
        ...base,
        kind: 'iteration',
        message: `Reduce ${summarizeLifecycleBinding(entry.resultBind, entry.macroOrigin)} iterated ${entry.iteratedCount}/${entry.matchCount}.`,
      };
  }
}

function translateTriggerEntry(
  entry: TriggerLogEntry,
  entryIndex: number,
  moveIndex: number,
  visualConfig: VisualConfigProvider,
  lookup: PlayerLookup,
  scopeFormatter: ScopeFormatter,
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
        message: `Triggered ${formatIdAsDisplayName(String(entry.triggerId))} on ${formatTriggerEvent(entry.event, visualConfig, lookup, scopeFormatter)}.`,
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
        message: `Trigger processing truncated for ${formatTriggerEvent(entry.event, visualConfig, lookup, scopeFormatter)}.`,
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
        message: `Eligibility ${formatIdAsDisplayName(entry.step)}${entry.seat === null ? '' : ` for ${resolveFactionName(entry.seat, visualConfig)}`}.`,
        depth: 0,
        zoneIds: [],
        tokenIds: [],
        ...optionalPlayerId(entry.seat === null ? undefined : lookup.playerByFaction.get(entry.seat)),
      };

    case 'simultaneousSubmission':
      return {
        ...base,
        kind: 'lifecycle',
        message: `${resolvePlayerName(entry.player, visualConfig, lookup)} submitted ${formatIdAsDisplayName(entry.move.actionId)}.`,
        depth: 0,
        zoneIds: [],
        tokenIds: [],
        ...optionalPlayerId(entry.player),
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

    case 'operationCompoundStagesReplaced':
      return {
        ...base,
        kind: 'lifecycle',
        message:
          `${formatIdAsDisplayName(entry.actionId)} replaced remaining stages in ${formatIdAsDisplayName(entry.profileId)} ` +
          `after stage ${entry.insertAfterStage} (${entry.skippedStageCount}/${entry.totalStages} stage(s) skipped).`,
        depth: 0,
        zoneIds: [],
        tokenIds: [],
      };

    case 'turnFlowDeferredEventLifecycle':
      return {
        ...base,
        kind: 'lifecycle',
        message:
          `Deferred ${formatIdAsDisplayName(entry.actionId)} ${formatIdAsDisplayName(entry.stage)}` +
          ` (${formatIdAsDisplayName(entry.deferredId)}) after ${entry.requiredGrantBatchIds.length} grant batch(es).`,
        depth: 0,
        zoneIds: [],
        tokenIds: [],
      };
  }

  return assertNever(entry);
}

function assertNever(value: never): never {
  throw new Error(`Unhandled trigger log entry: ${JSON.stringify(value)}`);
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
    return gameDef.turnOrder.config.turnFlow.eligibility.seats;
  }
  if (gameDef.turnOrder?.type === 'fixedOrder') {
    return gameDef.turnOrder.order;
  }
  return (gameDef.seats ?? []).map((seat) => seat.id);
}

function resolveZoneName(zoneId: string, visualConfig: VisualConfigProvider): string {
  return visualConfig.getZoneLabel(zoneId) ?? formatIdAsDisplayName(zoneId);
}

function resolveFactionName(factionId: string, visualConfig: VisualConfigProvider): string {
  return visualConfig.getFactionDisplayName(factionId) ?? formatIdAsDisplayName(factionId);
}

function resolveTokenTypeName(tokenTypeId: string, visualConfig: VisualConfigProvider): string {
  return visualConfig.getTokenTypeDisplayName(tokenTypeId) ?? formatIdAsDisplayName(tokenTypeId);
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

function formatObserverSelection(
  observers: 'all' | readonly number[],
  visualConfig: VisualConfigProvider,
  lookup: PlayerLookup,
): string {
  if (observers === 'all') {
    return 'all players';
  }
  if (observers.length === 0) {
    return 'no players';
  }
  return observers.map((playerId) => resolvePlayerName(playerId, visualConfig, lookup)).join(', ');
}

function formatConcealScope(
  from: 'all' | readonly number[] | undefined,
  visualConfig: VisualConfigProvider,
  lookup: PlayerLookup,
): string {
  if (from === undefined) {
    return '';
  }
  if (from === 'all') {
    return ' from public grants';
  }
  if (from.length === 0) {
    return ' from no players';
  }
  return ` from ${from.map((playerId) => resolvePlayerName(playerId, visualConfig, lookup)).join(', ')}`;
}

function formatOptionalFilter(
  filter:
    | readonly {
      readonly prop: string;
      readonly op: 'eq' | 'neq' | 'in' | 'notIn';
      readonly value: unknown;
    }[]
    | undefined,
): string {
  if (filter === undefined || filter.length === 0) {
    return '';
  }
  return ` (filter: ${filter.map(formatFilterPredicate).join(' and ')})`;
}

function formatFilterPredicate(predicate: {
  readonly prop: string;
  readonly op: 'eq' | 'neq' | 'in' | 'notIn';
  readonly value: unknown;
}): string {
  return `${formatIdAsDisplayName(predicate.prop)} ${formatFilterOp(predicate.op)} ${formatValue(predicate.value)}`;
}

function formatFilterOp(op: 'eq' | 'neq' | 'in' | 'notIn'): string {
  switch (op) {
    case 'eq':
      return '==';
    case 'neq':
      return '!=';
    case 'in':
      return 'in';
    case 'notIn':
      return 'not in';
  }
}

function formatScopedVariableChangeMessage(input: {
  readonly scope: ScopeKind;
  readonly variable: string;
  readonly playerId: number | undefined;
  readonly zoneId: string | undefined;
  readonly oldValue?: unknown;
  readonly newValue?: unknown;
  readonly scopeFormatter: ScopeFormatter;
}): string {
  return `${formatScopedVariableChangeClause(input)}.`;
}

function formatScopedVariableChangeClause(input: {
  readonly scope: ScopeKind;
  readonly variable: string;
  readonly playerId: number | undefined;
  readonly zoneId: string | undefined;
  readonly oldValue?: unknown;
  readonly newValue?: unknown;
  readonly scopeFormatter: ScopeFormatter;
}): string {
  const scopePrefix = input.scopeFormatter.prefix({
    scope: input.scope,
    playerId: input.playerId,
    zoneId: input.zoneId === undefined ? undefined : String(input.zoneId),
  });
  const headline = `${scopePrefix}${input.variable} changed`;
  if (input.oldValue === undefined && input.newValue === undefined) {
    return headline;
  }
  return `${headline} from ${formatValue(input.oldValue)} to ${formatValue(input.newValue)}`;
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
  scopeFormatter: ScopeFormatter,
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
      return formatScopedVariableChangeClause({
        scope: event.scope,
        variable: event.var === undefined ? 'variable' : formatIdAsDisplayName(event.var),
        playerId: projectTriggerEvent(event).playerId,
        zoneId: event.scope === 'zone' ? event.zone : undefined,
        oldValue: event.oldValue,
        newValue: event.newValue,
        scopeFormatter,
      });
    }
  }
}

interface ScopeFormatter {
  readonly prefix: (input: {
    readonly scope: ScopeKind;
    readonly playerId: number | undefined;
    readonly zoneId: string | undefined;
  }) => string;
  readonly endpoint: (input: ScopeEndpointDisplayInput) => string;
}

function createScopeFormatter(visualConfig: VisualConfigProvider, lookup: PlayerLookup): ScopeFormatter {
  return {
    prefix: ({ scope, playerId, zoneId }) =>
      formatScopePrefixDisplay({
        scope,
        playerId,
        zoneId,
        resolvePlayerName: (resolvedPlayerId) => resolvePlayerName(resolvedPlayerId, visualConfig, lookup),
        resolveZoneName: (resolvedZoneId) => resolveZoneName(resolvedZoneId, visualConfig),
      }),
    endpoint: (input) =>
      formatScopeEndpointDisplay({
        ...input,
        resolvePlayerName: (resolvedPlayerId) => resolvePlayerName(resolvedPlayerId, visualConfig, lookup),
        resolveZoneName: (resolvedZoneId) => resolveZoneName(resolvedZoneId, visualConfig),
      }),
  };
}

function toScopeEndpointDisplayInput(endpoint: NormalizedTransferEndpoint): ScopeEndpointDisplayInput {
  switch (endpoint.scope) {
    case 'global':
      return {
        scope: 'global',
        playerId: undefined,
        zoneId: undefined,
      };
    case 'perPlayer':
      return {
        scope: 'perPlayer',
        playerId: endpoint.playerId,
        zoneId: undefined,
      };
    case 'zone':
      return {
        scope: 'zone',
        playerId: undefined,
        zoneId: endpoint.zoneId,
      };
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

function summarizeLifecycleBinding(
  bind: string,
  macroOrigin?: { readonly macroId: string; readonly stem: string },
): string {
  if (macroOrigin === undefined) {
    return formatIdAsDisplayName(bind.replace(/^\$/, ''));
  }
  return `${formatIdAsDisplayName(macroOrigin.stem)} in ${formatIdAsDisplayName(macroOrigin.macroId)}`;
}
