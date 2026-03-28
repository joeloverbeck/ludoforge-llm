import type { PlayerId } from '@ludoforge/engine/runtime';

import type {
  RenderAction,
  RenderComponentBreakdown,
  RenderChoiceContext,
  RenderChoiceOption,
  RenderChoiceTarget,
  RenderModel,
  RenderPlayer,
  RenderToken,
  RenderZone,
} from './render-model.js';
import type {
  RunnerActionGroup,
  RunnerComponentBreakdown,
  RunnerChoiceUi,
  RunnerFrame,
  RunnerProjectionBundle,
  RunnerPlayer,
  RunnerToken,
  RunnerZone,
} from './runner-frame.js';
import type { VisualConfigProvider } from '../config/visual-config-provider.js';
import { formatIdAsDisplayName } from '../utils/format-display-name.js';
import { formatChoiceValueFallback, formatChoiceValueResolved } from './choice-value-utils.js';
import { projectShowdownSurface, showdownSurfaceEqual } from './project-showdown-surface.js';

const EMPTY_RENDER_SURFACES: RenderModel['surfaces'] = {
  tableOverlays: [],
  showdown: null,
};

export function projectRenderModel(
  bundle: RunnerProjectionBundle,
  visualConfigProvider: VisualConfigProvider,
  previousModel: RenderModel | null = null,
): RenderModel {
  const { frame } = bundle;
  const hiddenZones = visualConfigProvider.getHiddenZones();
  const zones = projectZones(frame.zones, visualConfigProvider, hiddenZones);
  const visibleZoneIds = new Set(zones.map((zone) => zone.id));
  const players = projectPlayers(frame.players, visualConfigProvider);
  const playersById = new Map(players.map((player) => [player.id, player] as const));
  const tokens = projectTokens(frame.tokens, visibleZoneIds);
  const zonesById = new Map(zones.map((zone) => [zone.id, zone] as const));
  const choiceContext = projectChoiceContext(frame.choiceContext, zonesById, visualConfigProvider);
  const choiceUi = projectChoiceUi(frame.choiceUi, zonesById, tokens, playersById);

  const nextModel: RenderModel = {
    zones,
    adjacencies: frame.adjacencies.filter((adjacency) => visibleZoneIds.has(adjacency.from) && visibleZoneIds.has(adjacency.to)),
    tokens,
    activeEffects: frame.activeEffects.map((effect) => ({
      id: effect.id,
      displayName: effect.sourceCardTitle,
      attributes: effect.attributes.map((attribute) => ({
        key: attribute.key,
        label: formatIdAsDisplayName(attribute.key),
        value: attribute.value,
      })),
    })),
    players,
    activePlayerID: frame.activePlayerID,
    turnOrder: frame.turnOrder,
    turnOrderType: frame.turnOrderType,
    simultaneousSubmitted: frame.simultaneousSubmitted,
    interruptStack: frame.interruptStack,
    isInInterrupt: frame.isInInterrupt,
    phaseName: frame.phaseName,
    phaseDisplayName: formatIdAsDisplayName(frame.phaseName),
    eventDecks: frame.eventDecks.map((deck) => ({
      ...deck,
      displayName: formatIdAsDisplayName(deck.id),
    })),
    ...projectActionGroups(frame.actionGroups, visualConfigProvider),
    choiceBreadcrumb: frame.choiceBreadcrumb.map((step) => ({
      decisionKey: step.decisionKey,
      name: step.name,
      displayName: formatIdAsDisplayName(step.name),
      chosenValueId: step.chosenValueId,
      chosenValue: step.chosenValue,
      chosenDisplayName: formatChoiceValueResolved(step.chosenValue, zonesById),
      iterationGroupId: step.iterationGroupId,
      iterationLabel: step.iterationEntityId === null
        ? null
        : zonesById.get(step.iterationEntityId)?.displayName ?? formatIdAsDisplayName(step.iterationEntityId),
    })),
    choiceContext,
    choiceUi,
    moveEnumerationWarnings: frame.moveEnumerationWarnings,
    runtimeEligible: frame.runtimeEligible.map((entry) => ({
      ...entry,
      displayName: visualConfigProvider.getFactionDisplayName(entry.factionId) ?? formatIdAsDisplayName(entry.seatId),
    })),
    surfaces: {
      tableOverlays: EMPTY_RENDER_SURFACES.tableOverlays,
      showdown: projectShowdownSurface(bundle, players, visualConfigProvider),
    },
    victoryStandings: projectVictoryStandings(frame.victoryStandings, visualConfigProvider),
    terminal: frame.terminal,
  };

  return stabilizeRenderModel(previousModel, nextModel);
}

function projectVictoryStandings(
  victoryStandings: RunnerFrame['victoryStandings'],
  visualConfigProvider: VisualConfigProvider,
): RenderModel['victoryStandings'] {
  return victoryStandings?.map((entry) => ({
    ...entry,
    components: entry.components.map((component) => projectVictoryComponentBreakdown(component, visualConfigProvider)),
  })) ?? null;
}

function projectVictoryComponentBreakdown(
  component: RunnerComponentBreakdown,
  visualConfigProvider: VisualConfigProvider,
): RenderComponentBreakdown {
  return {
    aggregate: component.aggregate,
    spaces: component.spaces.map((space) => ({
      ...space,
      displayName: visualConfigProvider.getZoneLabel(space.spaceId) ?? formatIdAsDisplayName(space.spaceId),
    })),
  };
}

function projectZones(
  zones: readonly RunnerZone[],
  visualConfigProvider: VisualConfigProvider,
  hiddenZones: ReadonlySet<string>,
): readonly RenderZone[] {
  return zones
    .filter((zone) => !hiddenZones.has(zone.id))
    .map((zone) => ({
      ...zone,
      displayName: visualConfigProvider.getZoneLabel(zone.id) ?? formatIdAsDisplayName(zone.id),
      markers: zone.markers.map((marker) => ({
        ...marker,
        displayName: formatIdAsDisplayName(marker.id),
      })),
      visual: visualConfigProvider.resolveZoneVisual(zone.id, zone.category, zone.attributes),
    }));
}

function projectTokens(tokens: readonly RunnerToken[], visibleZoneIds: ReadonlySet<string>): readonly RenderToken[] {
  return tokens.filter((token) => visibleZoneIds.has(token.zoneID));
}

function projectPlayers(
  players: readonly RunnerPlayer[],
  visualConfigProvider: VisualConfigProvider,
): readonly RenderPlayer[] {
  return players.map((player) => ({
    ...player,
    displayName: player.factionId === null
      ? formatIdAsDisplayName(String(player.id))
      : visualConfigProvider.getFactionDisplayName(player.factionId) ?? formatIdAsDisplayName(player.factionId),
  }));
}

function projectActionGroups(
  actionGroups: readonly RunnerActionGroup[],
  visualConfigProvider: VisualConfigProvider,
): Pick<RenderModel, 'actionGroups' | 'hiddenActionsByClass'> {
  const policy = visualConfigProvider.getActionGroupPolicy();
  const hiddenClasses = new Set(policy?.hide ?? []);
  const synthesizeByClass = new Map<string, readonly string[]>();
  for (const rule of policy?.synthesize ?? []) {
    const existing = synthesizeByClass.get(rule.fromClass);
    synthesizeByClass.set(rule.fromClass, existing === undefined ? [rule.intoGroup] : [...existing, rule.intoGroup]);
  }

  const groups = new Map<string, Map<string, RenderAction>>();
  const hiddenActionsByClass = new Map<string, RenderAction[]>();
  const ensureGroup = (key: string): Map<string, RenderAction> => {
    if (!groups.has(key)) {
      groups.set(key, new Map());
    }
    return groups.get(key)!;
  };

  for (const group of actionGroups) {
    for (const action of group.actions) {
      const actionClass = action.actionClass ?? (group.groupKey === 'Actions' ? undefined : group.groupKey);
      if (actionClass !== undefined && hiddenClasses.has(actionClass)) {
        const hiddenActions = hiddenActionsByClass.get(actionClass) ?? [];
        hiddenActionsByClass.set(actionClass, [
          ...hiddenActions,
          {
            ...action,
            displayName: visualConfigProvider.getActionDisplayName(action.actionId) ?? formatIdAsDisplayName(action.actionId),
          },
        ]);
        continue;
      }

      const targetGroup = ensureGroup(group.groupKey);
      if (!targetGroup.has(action.actionId)) {
        targetGroup.set(action.actionId, {
          ...action,
          displayName: visualConfigProvider.getActionDisplayName(action.actionId) ?? formatIdAsDisplayName(action.actionId),
        });
      }

      if (actionClass !== undefined) {
        for (const syntheticGroup of synthesizeByClass.get(actionClass) ?? []) {
          const targetSyntheticGroup = ensureGroup(syntheticGroup);
          if (!targetSyntheticGroup.has(action.actionId)) {
            targetSyntheticGroup.set(action.actionId, {
              ...action,
              actionClass: syntheticGroup,
              displayName: visualConfigProvider.getActionDisplayName(action.actionId) ?? formatIdAsDisplayName(action.actionId),
            });
          }
        }
      }
    }
  }

  return {
    actionGroups: Array.from(groups.entries()).map(([groupKey, actions]) => ({
      groupKey,
      groupName: groupKey === 'Actions' ? 'Actions' : formatIdAsDisplayName(groupKey),
      actions: Array.from(actions.values()),
    })),
    hiddenActionsByClass: new Map(
      Array.from(hiddenActionsByClass.entries()).map(([actionClass, actions]) => [actionClass, actions] as const),
    ),
  };
}

function projectChoiceContext(
  choiceContext: RunnerFrame['choiceContext'],
  zonesById: ReadonlyMap<string, RenderZone>,
  visualConfigProvider: VisualConfigProvider,
): RenderChoiceContext | null {
  if (choiceContext === null) {
    return null;
  }

  const min = choiceContext.minSelections;
  const max = choiceContext.maxSelections;
  const boundsText = min === null && max === null
    ? null
    : `${min ?? 0}${max === null || max === min ? '' : `-${max}`}`;

  return {
    actionDisplayName: visualConfigProvider.getActionDisplayName(choiceContext.selectedActionId)
      ?? formatIdAsDisplayName(choiceContext.selectedActionId),
    decisionPrompt: visualConfigProvider.getChoicePrompt(choiceContext.selectedActionId, choiceContext.decisionParamName)
      ?? formatIdAsDisplayName(choiceContext.decisionParamName),
    decisionParamName: choiceContext.decisionParamName,
    boundsText,
    iterationLabel: choiceContext.iterationEntityId === null
      ? null
      : zonesById.get(choiceContext.iterationEntityId)?.displayName ?? formatIdAsDisplayName(choiceContext.iterationEntityId),
    iterationProgress: choiceContext.iterationIndex === null || choiceContext.iterationTotal === null
      ? null
      : `${choiceContext.iterationIndex + 1} of ${choiceContext.iterationTotal}`,
  };
}

function projectChoiceUi(
  choiceUi: RunnerChoiceUi,
  zonesById: ReadonlyMap<string, RenderZone>,
  tokens: readonly RenderToken[],
  playersById: ReadonlyMap<PlayerId, RenderPlayer>,
): RenderModel['choiceUi'] {
  if (choiceUi.kind !== 'discreteOne' && choiceUi.kind !== 'discreteMany') {
    return choiceUi;
  }

  const options = choiceUi.options.map((option) => ({
    ...option,
    displayName: resolveChoiceOptionDisplayName(option, zonesById, tokens, playersById),
    target: {
      ...option.target,
      displaySource: option.target.kind === 'scalar' ? 'fallback' : option.target.kind,
    } satisfies RenderChoiceTarget,
  })) satisfies readonly RenderChoiceOption[];

  if (choiceUi.kind === 'discreteOne') {
    return { ...choiceUi, options };
  }

  return { ...choiceUi, options };
}

function resolveChoiceOptionDisplayName(
  option: RunnerChoiceUi['kind'] extends never ? never : Extract<RunnerChoiceUi, { readonly kind: 'discreteOne' | 'discreteMany' }>['options'][number],
  zonesById: ReadonlyMap<string, RenderZone>,
  tokens: readonly RenderToken[],
  playersById: ReadonlyMap<PlayerId, RenderPlayer>,
): string {
  if (option.target.kind === 'zone' && option.target.entityId !== null) {
    return zonesById.get(option.target.entityId)?.displayName ?? formatIdAsDisplayName(option.target.entityId);
  }

  if (option.target.kind === 'token' && option.target.entityId !== null) {
    const token = tokens.find((candidate) => candidate.id === option.target.entityId);
    if (token !== undefined) {
      const tokenType = formatIdAsDisplayName(token.type);
      const tokenId = formatIdAsDisplayName(token.id);
      const ownerDisplayName = token.ownerID === null
        ? null
        : playersById.get(token.ownerID)?.displayName ?? `Player ${token.ownerID}`;
      return ownerDisplayName === null ? `${tokenType} (${tokenId})` : `${tokenType} (${tokenId}, ${ownerDisplayName})`;
    }
  }

  return formatChoiceValueFallback(option.value);
}

function stabilizeRenderModel(previous: RenderModel | null, next: RenderModel): RenderModel {
  if (previous === null) {
    return next;
  }

  const stabilizedZones = stabilizeZoneArray(previous.zones, next.zones);
  const stabilizedTokens = stabilizeTokenArray(previous.tokens, next.tokens);
  const stabilizedSurfaces = stabilizeSurfaceModel(previous.surfaces, next.surfaces);

  if (
    stabilizedZones === next.zones
    && stabilizedTokens === next.tokens
    && stabilizedSurfaces === next.surfaces
  ) {
    return next;
  }

  return {
    ...next,
    zones: stabilizedZones,
    tokens: stabilizedTokens,
    surfaces: stabilizedSurfaces,
  };
}

function stabilizeSurfaceModel(
  previous: RenderModel['surfaces'],
  next: RenderModel['surfaces'],
): RenderModel['surfaces'] {
  if (
    previous.tableOverlays === next.tableOverlays
    && showdownSurfaceEqual(previous.showdown, next.showdown)
  ) {
    return previous;
  }

  if (showdownSurfaceEqual(previous.showdown, next.showdown)) {
    return {
      ...next,
      showdown: previous.showdown,
    };
  }

  return next;
}

function stabilizeZoneArray(previous: readonly RenderZone[], next: readonly RenderZone[]): readonly RenderZone[] {
  if (previous.length === 0 || next.length === 0) {
    return next;
  }

  const previousById = new Map(previous.map((zone) => [zone.id, zone] as const));
  let hasChange = false;
  const stabilized = next.map((zone) => {
    const prior = previousById.get(zone.id);
    if (prior === undefined || !isZoneEquivalent(prior, zone)) {
      hasChange = true;
      return zone;
    }
    return prior;
  });

  if (!hasChange && stabilized.length === previous.length && stabilized.every((zone, index) => zone === previous[index])) {
    return previous;
  }

  return hasChange ? stabilized : next;
}

function stabilizeTokenArray(previous: readonly RenderToken[], next: readonly RenderToken[]): readonly RenderToken[] {
  if (previous.length === 0 || next.length === 0) {
    return next;
  }

  const previousById = new Map(previous.map((token) => [token.id, token] as const));
  let hasChange = false;
  const stabilized = next.map((token) => {
    const prior = previousById.get(token.id);
    if (prior === undefined || !isTokenEquivalent(prior, token)) {
      hasChange = true;
      return token;
    }
    return prior;
  });

  if (!hasChange && stabilized.length === previous.length && stabilized.every((token, index) => token === previous[index])) {
    return previous;
  }

  return hasChange ? stabilized : next;
}

function isZoneEquivalent(left: RenderZone, right: RenderZone): boolean {
  return left.id === right.id
    && left.displayName === right.displayName
    && left.ordering === right.ordering
    && left.hiddenTokenCount === right.hiddenTokenCount
    && left.visibility === right.visibility
    && left.isSelectable === right.isSelectable
    && left.isHighlighted === right.isHighlighted
    && left.ownerID === right.ownerID
    && left.category === right.category
    && isAttributeRecordEqual(left.attributes, right.attributes)
    && left.visual.shape === right.visual.shape
    && left.visual.width === right.visual.width
    && left.visual.height === right.visual.height
    && left.visual.color === right.visual.color
    && left.visual.connectionStyleKey === right.visual.connectionStyleKey
    && isStringArrayEqual(left.tokenIDs, right.tokenIDs)
    && isMarkerArrayEqual(left.markers, right.markers)
    && isShallowRecordEqual(left.metadata, right.metadata);
}

function isTokenEquivalent(left: RenderToken, right: RenderToken): boolean {
  return left.id === right.id
    && left.type === right.type
    && left.zoneID === right.zoneID
    && left.ownerID === right.ownerID
    && left.factionId === right.factionId
    && left.faceUp === right.faceUp
    && left.isSelectable === right.isSelectable
    && left.isSelected === right.isSelected
    && isShallowRecordEqual(left.properties, right.properties);
}

function isMarkerArrayEqual(left: RenderZone['markers'], right: RenderZone['markers']): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((leftMarker, index) => {
    const rightMarker = right[index];
    return rightMarker !== undefined
      && leftMarker.id === rightMarker.id
      && leftMarker.displayName === rightMarker.displayName
      && leftMarker.state === rightMarker.state
      && isStringArrayEqual(leftMarker.possibleStates, rightMarker.possibleStates);
  });
}

function isStringArrayEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isShallowRecordEqual(left: Readonly<Record<string, unknown>>, right: Readonly<Record<string, unknown>>): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length && leftKeys.every((key) => Object.is(left[key], right[key]));
}

function isAttributeRecordEqual(
  left: Readonly<Record<string, unknown>>,
  right: Readonly<Record<string, unknown>>,
): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every((key) => {
    const leftValue = left[key];
    const rightValue = right[key];
    if (leftValue === undefined || rightValue === undefined) {
      return false;
    }
    if (Array.isArray(leftValue) || Array.isArray(rightValue)) {
      return Array.isArray(leftValue) && Array.isArray(rightValue) && isStringArrayEqual(leftValue, rightValue);
    }
    return Object.is(leftValue, rightValue);
  });
}
