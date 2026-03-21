import type { GameDef } from '@ludoforge/engine/runtime';

import { VisualConfigProvider } from './visual-config-provider.js';
import { VisualConfigSchema, type VisualConfig } from './visual-config-types.js';

export interface VisualConfigRefValidationContext {
  readonly zoneIds: ReadonlySet<string>;
  readonly zoneCategories: ReadonlySet<string>;
  readonly tokenTypeIds: ReadonlySet<string>;
  readonly factionIds: ReadonlySet<string>;
  readonly edgeCategories: ReadonlySet<string>;
  readonly phaseIds: ReadonlySet<string>;
  readonly globalVarNames: ReadonlySet<string>;
  readonly perPlayerVarNames: ReadonlySet<string>;
}

export interface VisualConfigRefError {
  readonly category: 'zone' | 'zoneCategory' | 'tokenType' | 'faction' | 'edge' | 'phase' | 'globalVar' | 'perPlayerVar';
  readonly configPath: string;
  readonly referencedId: string;
  readonly message: string;
}

export function buildRefValidationContext(gameDef: GameDef): VisualConfigRefValidationContext {
  const edgeCategories = new Set<string>();
  const presentationZones = gameDef.zones.filter((zone) => zone.isInternal !== true);
  const zoneCategories = new Set<string>();
  for (const zone of presentationZones) {
    if (typeof zone.category === 'string' && zone.category.length > 0) {
      zoneCategories.add(zone.category);
      edgeCategories.add(zone.category);
    }
    for (const adjacency of zone.adjacentTo ?? []) {
      if (typeof adjacency.category === 'string' && adjacency.category.length > 0) {
        edgeCategories.add(adjacency.category);
      }
    }
  }

  return {
    zoneIds: new Set(presentationZones.map((zone) => String(zone.id))),
    zoneCategories,
    tokenTypeIds: new Set(gameDef.tokenTypes.map((tokenType) => tokenType.id)),
    factionIds: new Set((gameDef.seats ?? []).map((seat) => seat.id)),
    edgeCategories,
    phaseIds: new Set((gameDef.turnStructure?.phases ?? []).map((phase) => String(phase.id))),
    globalVarNames: new Set((gameDef.globalVars ?? []).map((variable) => variable.name)),
    perPlayerVarNames: new Set((gameDef.perPlayerVars ?? []).map((variable) => variable.name)),
  };
}

export function validateVisualConfigRefs(
  config: VisualConfig,
  context: VisualConfigRefValidationContext,
): readonly VisualConfigRefError[] {
  const errors: VisualConfigRefError[] = [];

  validateObjectKeys(config.zones?.overrides, context.zoneIds, 'zone', 'zones.overrides', errors);
  validateObjectKeys(config.zones?.connectionEndpoints, context.zoneIds, 'zone', 'zones.connectionEndpoints', errors);
  validateRecordTupleValues(
    config.zones?.connectionEndpoints,
    context.zoneIds,
    'zone',
    'zones.connectionEndpoints',
    errors,
  );
  validateObjectKeys(config.zones?.layoutRoles, context.zoneIds, 'zone', 'zones.layoutRoles', errors);
  validateStringList(config.zones?.hiddenZones, context.zoneIds, 'zone', 'zones.hiddenZones', errors);
  validateStringList(
    config.tableOverlays?.playerSeatAnchorZones,
    context.zoneIds,
    'zone',
    'tableOverlays.playerSeatAnchorZones',
    errors,
  );
  validateShowdownSurface(config, context, errors);
  validateArray(config.layout?.hints?.fixed, context.zoneIds, 'zone', 'layout.hints.fixed', errors, (entry) => entry.zone);
  validateNestedArray(
    config.layout?.hints?.regions,
    context.zoneIds,
    'zone',
    'layout.hints.regions',
    errors,
    (entry) => entry.zones,
  );

  const cardZoneRoles = config.cardAnimation?.zoneRoles;
  if (cardZoneRoles !== undefined) {
    validateStringList(cardZoneRoles.draw, context.zoneIds, 'zone', 'cardAnimation.zoneRoles.draw', errors);
    validateStringList(cardZoneRoles.hand, context.zoneIds, 'zone', 'cardAnimation.zoneRoles.hand', errors);
    validateStringList(cardZoneRoles.shared, context.zoneIds, 'zone', 'cardAnimation.zoneRoles.shared', errors);
    validateStringList(cardZoneRoles.burn, context.zoneIds, 'zone', 'cardAnimation.zoneRoles.burn', errors);
    validateStringList(cardZoneRoles.discard, context.zoneIds, 'zone', 'cardAnimation.zoneRoles.discard', errors);
  }

  validateObjectKeys(config.tokenTypes, context.tokenTypeIds, 'tokenType', 'tokenTypes', errors);
  validateObjectKeys(
    config.zones?.tokenLayouts?.assignments?.byCategory,
    context.zoneCategories,
    'zoneCategory',
    'zones.tokenLayouts.assignments.byCategory',
    errors,
  );
  validatePresentationLaneAssignments(config, errors);
  validateStringList(
    config.cardAnimation?.cardTokenTypes.ids,
    context.tokenTypeIds,
    'tokenType',
    'cardAnimation.cardTokenTypes.ids',
    errors,
  );

  validateObjectKeys(config.factions, context.factionIds, 'faction', 'factions', errors);

  validateObjectKeys(config.edges?.categoryStyles, context.edgeCategories, 'edge', 'edges.categoryStyles', errors);

  return errors;
}

function validateShowdownSurface(
  config: VisualConfig,
  context: VisualConfigRefValidationContext,
  errors: VisualConfigRefError[],
): void {
  const showdown = config.runnerSurfaces?.showdown;
  if (showdown === undefined) {
    return;
  }

  validateScalar(
    showdown.when.phase,
    context.phaseIds,
    'phase',
    'runnerSurfaces.showdown.when.phase',
    errors,
    'Unknown phase id',
  );
  validateScalar(
    showdown.ranking.source.name,
    context.perPlayerVarNames,
    'perPlayerVar',
    'runnerSurfaces.showdown.ranking.source.name',
    errors,
    'Unknown per-player variable name',
  );
  validateStringList(
    showdown.communityCards.zones,
    context.zoneIds,
    'zone',
    'runnerSurfaces.showdown.communityCards.zones',
    errors,
  );
  validateStringList(
    showdown.playerCards.zones,
    context.zoneIds,
    'zone',
    'runnerSurfaces.showdown.playerCards.zones',
    errors,
  );
}

export function validateAndCreateProvider(
  rawYaml: unknown,
  context: VisualConfigRefValidationContext,
): VisualConfigProvider {
  const parsedConfig = parseVisualConfigStrict(rawYaml);
  const errors = parsedConfig === null ? [] : validateVisualConfigRefs(parsedConfig, context);
  if (errors.length > 0) {
    const message = errors
      .map((error) => `${error.configPath} -> "${error.referencedId}" (${error.message})`)
      .join('\n');
    throw new Error(`Invalid visual config references:\n${message}`);
  }

  return new VisualConfigProvider(parsedConfig);
}

export function parseVisualConfigStrict(rawYaml: unknown): VisualConfig | null {
  if (rawYaml === null || rawYaml === undefined) {
    return null;
  }

  const parsed = VisualConfigSchema.safeParse(rawYaml);
  if (!parsed.success) {
    throw new Error(`Invalid visual config schema:\n${parsed.error.issues.map((issue) => issue.path.join('.')).join('\n')}`);
  }

  return parsed.data;
}

function validateObjectKeys(
  record: Readonly<Record<string, unknown>> | undefined,
  knownIds: ReadonlySet<string>,
  category: VisualConfigRefError['category'],
  path: string,
  errors: VisualConfigRefError[],
): void {
  for (const key of Object.keys(record ?? {})) {
    if (!knownIds.has(key)) {
      errors.push({
        category,
        configPath: `${path}.${key}`,
        referencedId: key,
        message: `Unknown ${category} id`,
      });
    }
  }
}

function validateStringList(
  values: readonly string[] | undefined,
  knownIds: ReadonlySet<string>,
  category: VisualConfigRefError['category'],
  path: string,
  errors: VisualConfigRefError[],
): void {
  if (values === undefined) {
    return;
  }

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === undefined) {
      continue;
    }
    if (!knownIds.has(value)) {
      errors.push({
        category,
        configPath: `${path}[${index}]`,
        referencedId: value,
        message: `Unknown ${category} id`,
      });
    }
  }
}

function validateRecordTupleValues(
  record: Readonly<Record<string, readonly string[]>> | undefined,
  knownIds: ReadonlySet<string>,
  category: VisualConfigRefError['category'],
  path: string,
  errors: VisualConfigRefError[],
): void {
  for (const [key, values] of Object.entries(record ?? {})) {
    for (let index = 0; index < values.length; index += 1) {
      const value = values[index];
      if (value === undefined || knownIds.has(value)) {
        continue;
      }
      errors.push({
        category,
        configPath: `${path}.${key}[${index}]`,
        referencedId: value,
        message: `Unknown ${category} id`,
      });
    }
  }
}

function validateScalar(
  value: string | undefined,
  knownIds: ReadonlySet<string>,
  category: VisualConfigRefError['category'],
  path: string,
  errors: VisualConfigRefError[],
  message: string,
): void {
  if (value === undefined || knownIds.has(value)) {
    return;
  }

  errors.push({
    category,
    configPath: path,
    referencedId: value,
    message,
  });
}

function validateArray<T>(
  values: readonly T[] | undefined,
  knownIds: ReadonlySet<string>,
  category: VisualConfigRefError['category'],
  path: string,
  errors: VisualConfigRefError[],
  getValue: (entry: T) => string,
): void {
  if (values === undefined) {
    return;
  }

  for (let index = 0; index < values.length; index += 1) {
    const entry = values[index];
    if (entry === undefined) {
      continue;
    }
    const referencedId = getValue(entry);
    if (!knownIds.has(referencedId)) {
      errors.push({
        category,
        configPath: `${path}[${index}]`,
        referencedId,
        message: `Unknown ${category} id`,
      });
    }
  }
}

function validateNestedArray<T>(
  groups: readonly T[] | undefined,
  knownIds: ReadonlySet<string>,
  category: VisualConfigRefError['category'],
  path: string,
  errors: VisualConfigRefError[],
  getItems: (group: T) => readonly string[],
): void {
  if (groups === undefined) {
    return;
  }

  for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
    const group = groups[groupIndex];
    if (group === undefined) {
      continue;
    }
    const items = getItems(group);
    for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
      const referencedId = items[itemIndex];
      if (referencedId === undefined) {
        continue;
      }
      if (!knownIds.has(referencedId)) {
        errors.push({
          category,
          configPath: `${path}[${groupIndex}][${itemIndex}]`,
          referencedId,
          message: `Unknown ${category} id`,
        });
      }
    }
  }
}

function validatePresentationLaneAssignments(
  config: VisualConfig,
  errors: VisualConfigRefError[],
): void {
  const satisfiableLanes = collectSatisfiablePresentationLanes(config);

  for (const [tokenTypeId, style] of Object.entries(config.tokenTypes ?? {})) {
    const lane = style.presentation?.lane;
    if (lane === undefined || satisfiableLanes.has(lane)) {
      continue;
    }
    errors.push({
      category: 'tokenType',
      configPath: `tokenTypes.${tokenTypeId}.presentation.lane`,
      referencedId: lane,
      message: 'Presentation lane is not satisfiable by any assigned lane layout',
    });
  }

  const defaults = config.tokenTypeDefaults ?? [];
  for (let index = 0; index < defaults.length; index += 1) {
    const lane = defaults[index]?.style.presentation?.lane;
    if (lane === undefined || satisfiableLanes.has(lane)) {
      continue;
    }
    errors.push({
      category: 'tokenType',
      configPath: `tokenTypeDefaults[${index}].style.presentation.lane`,
      referencedId: lane,
      message: 'Presentation lane is not satisfiable by any assigned lane layout',
    });
  }
}

function collectSatisfiablePresentationLanes(config: VisualConfig): ReadonlySet<string> {
  const laneIds = new Set<string>();
  const assignments = config.zones?.tokenLayouts?.assignments?.byCategory;
  if (assignments === undefined) {
    return laneIds;
  }

  const presets = config.zones?.tokenLayouts?.presets ?? {};
  for (const presetId of Object.values(assignments)) {
    const preset = presets[presetId];
    if (preset?.mode !== 'lanes') {
      continue;
    }
    for (const laneId of Object.keys(preset.lanes)) {
      laneIds.add(laneId);
    }
  }

  return laneIds;
}
