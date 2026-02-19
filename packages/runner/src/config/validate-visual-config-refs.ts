import type { GameDef } from '@ludoforge/engine/runtime';

import { VisualConfigProvider } from './visual-config-provider.js';
import { VisualConfigSchema, type VisualConfig } from './visual-config-types.js';

export interface VisualConfigRefValidationContext {
  readonly zoneIds: ReadonlySet<string>;
  readonly tokenTypeIds: ReadonlySet<string>;
  readonly factionIds: ReadonlySet<string>;
  readonly variableNames: ReadonlySet<string>;
  readonly edgeCategories: ReadonlySet<string>;
}

export interface VisualConfigRefError {
  readonly category: 'zone' | 'tokenType' | 'faction' | 'variable' | 'edge';
  readonly configPath: string;
  readonly referencedId: string;
  readonly message: string;
}

export function buildRefValidationContext(gameDef: GameDef): VisualConfigRefValidationContext {
  const edgeCategories = new Set<string>();
  for (const zone of gameDef.zones) {
    if (typeof zone.category === 'string' && zone.category.length > 0) {
      edgeCategories.add(zone.category);
    }
    for (const adjacency of zone.adjacentTo ?? []) {
      if (typeof adjacency.category === 'string' && adjacency.category.length > 0) {
        edgeCategories.add(adjacency.category);
      }
    }
  }

  return {
    zoneIds: new Set(gameDef.zones.map((zone) => String(zone.id))),
    tokenTypeIds: new Set(gameDef.tokenTypes.map((tokenType) => tokenType.id)),
    factionIds: new Set((gameDef.factions ?? []).map((faction) => faction.id)),
    variableNames: new Set([...gameDef.globalVars, ...gameDef.perPlayerVars].map((variable) => variable.name)),
    edgeCategories,
  };
}

export function validateVisualConfigRefs(
  config: VisualConfig,
  context: VisualConfigRefValidationContext,
): readonly VisualConfigRefError[] {
  const errors: VisualConfigRefError[] = [];

  validateObjectKeys(config.zones?.overrides, context.zoneIds, 'zone', 'zones.overrides', errors);
  validateObjectKeys(config.zones?.layoutRoles, context.zoneIds, 'zone', 'zones.layoutRoles', errors);
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
  validateStringList(
    config.cardAnimation?.cardTokenTypes.ids,
    context.tokenTypeIds,
    'tokenType',
    'cardAnimation.cardTokenTypes.ids',
    errors,
  );

  validateObjectKeys(config.factions, context.factionIds, 'faction', 'factions', errors);

  validateStringList(config.variables?.prominent, context.variableNames, 'variable', 'variables.prominent', errors);
  validateNestedArray(
    config.variables?.panels,
    context.variableNames,
    'variable',
    'variables.panels',
    errors,
    (entry) => entry.vars,
  );
  validateObjectKeys(config.variables?.formatting, context.variableNames, 'variable', 'variables.formatting', errors);

  validateObjectKeys(config.edges?.categoryStyles, context.edgeCategories, 'edge', 'edges.categoryStyles', errors);

  return errors;
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
    const referencedId = getValue(values[index]);
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
    const items = getItems(groups[groupIndex]);
    for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
      const referencedId = items[itemIndex];
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
