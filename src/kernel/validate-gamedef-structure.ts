import type { Diagnostic } from './diagnostics.js';
import type { GameDef, MapSpaceDef, PlayerSel, ScenarioPiecePlacement, StackingConstraint } from './types.js';

const MAX_ALTERNATIVE_DISTANCE = 3;
const PLAYER_ZONE_QUALIFIER_PATTERN = /^[0-9]+$/;

export type ValidationContext = {
  globalVarNames: Set<string>;
  perPlayerVarNames: Set<string>;
  globalVarCandidates: readonly string[];
  perPlayerVarCandidates: readonly string[];
  zoneNames: Set<string>;
  zoneCandidates: readonly string[];
  zoneOwners: ReadonlyMap<string, GameDef['zones'][number]['owner']>;
  tokenTypeNames: Set<string>;
  tokenTypeCandidates: readonly string[];
  playerIdMin: number;
  playerIdMaxInclusive: number;
};

export const checkDuplicateIds = (
  diagnostics: Diagnostic[],
  values: readonly string[],
  code: string,
  label: string,
  pathPrefix: string,
): void => {
  const seen = new Set<string>();

  for (const [index, value] of values.entries()) {
    if (!seen.has(value)) {
      seen.add(value);
      continue;
    }

    diagnostics.push({
      code,
      path: `${pathPrefix}[${index}]`,
      severity: 'error',
      message: `Duplicate ${label} "${value}".`,
    });
  }
};

const levenshteinDistance = (left: string, right: string): number => {
  const cols = right.length + 1;
  let previousRow: number[] = Array.from({ length: cols }, (_unused, index) => index);

  for (let row = 1; row <= left.length; row += 1) {
    const currentRow: number[] = new Array<number>(cols).fill(0);
    currentRow[0] = row;

    for (let col = 1; col <= right.length; col += 1) {
      const substitutionCost = left[row - 1] === right[col - 1] ? 0 : 1;
      const insertCost = (currentRow[col - 1] ?? Number.POSITIVE_INFINITY) + 1;
      const deleteCost = (previousRow[col] ?? Number.POSITIVE_INFINITY) + 1;
      const replaceCost = (previousRow[col - 1] ?? Number.POSITIVE_INFINITY) + substitutionCost;
      currentRow[col] = Math.min(insertCost, deleteCost, replaceCost);
    }

    previousRow = currentRow;
  }

  return previousRow[right.length] ?? 0;
};

const getAlternatives = (value: string, validValues: readonly string[]): readonly string[] => {
  if (validValues.length === 0) {
    return [];
  }

  const scored = validValues
    .map((candidate) => ({ candidate, distance: levenshteinDistance(value, candidate) }))
    .sort((left, right) => {
      if (left.distance !== right.distance) {
        return left.distance - right.distance;
      }

      return left.candidate.localeCompare(right.candidate);
    });

  const bestDistance = scored[0]?.distance;
  if (bestDistance === undefined || bestDistance > MAX_ALTERNATIVE_DISTANCE) {
    return [];
  }

  return scored.filter((item) => item.distance === bestDistance).map((item) => item.candidate);
};

export const pushMissingReferenceDiagnostic = (
  diagnostics: Diagnostic[],
  code: string,
  path: string,
  message: string,
  value: string,
  validValues: readonly string[],
): void => {
  const alternatives = getAlternatives(value, validValues);
  const suggestion =
    alternatives.length > 0 ? `Did you mean "${alternatives[0]}"?` : 'Use one of the declared values.';

  if (alternatives.length > 0) {
    diagnostics.push({
      code,
      path,
      severity: 'error',
      message,
      suggestion,
      alternatives,
    });
    return;
  }

  diagnostics.push({
    code,
    path,
    severity: 'error',
    message,
    suggestion,
  });
};

export const parseZoneSelector = (
  zoneSelector: string,
): {
  base: string;
  qualifier: string | null;
} => {
  const separatorIndex = zoneSelector.lastIndexOf(':');
  if (separatorIndex < 0 || separatorIndex === zoneSelector.length - 1) {
    return {
      base: zoneSelector,
      qualifier: null,
    };
  }

  return {
    base: zoneSelector.slice(0, separatorIndex),
    qualifier: zoneSelector.slice(separatorIndex + 1),
  };
};

export const validatePlayerSelector = (
  diagnostics: Diagnostic[],
  playerSelector: PlayerSel,
  path: string,
  context: ValidationContext,
): void => {
  if (typeof playerSelector !== 'object' || !('id' in playerSelector)) {
    return;
  }

  const id = playerSelector.id;
  if (!Number.isInteger(id) || id < context.playerIdMin || id > context.playerIdMaxInclusive) {
    diagnostics.push({
      code: 'PLAYER_SELECTOR_ID_OUT_OF_BOUNDS',
      path,
      severity: 'error',
      message: `PlayerSel.id must be an integer in [${context.playerIdMin}, ${context.playerIdMaxInclusive}] based on metadata.players.max.`,
      suggestion: `Use a value between ${context.playerIdMin} and ${context.playerIdMaxInclusive}, or a dynamic selector such as "active".`,
    });
  }
};

export const validateZoneSelector = (
  diagnostics: Diagnostic[],
  zoneSelector: string,
  path: string,
  context: ValidationContext,
): void => {
  if (context.zoneNames.has(zoneSelector)) {
    const owner = context.zoneOwners.get(zoneSelector);
    const qualifier = parseZoneSelector(zoneSelector).qualifier;

    if (owner !== undefined && qualifier !== null) {
      if (qualifier === 'none' && owner !== 'none') {
        diagnostics.push({
          code: 'ZONE_SELECTOR_OWNERSHIP_INVALID',
          path,
          severity: 'error',
          message: `Selector "${zoneSelector}" uses :none, but zone "${zoneSelector}" is owner "${owner}".`,
          suggestion: `Use a selector that targets a player-owned zone, or change "${zoneSelector}" owner to "none".`,
        });
      } else if (qualifier !== 'none' && owner !== 'player') {
        diagnostics.push({
          code: 'ZONE_SELECTOR_OWNERSHIP_INVALID',
          path,
          severity: 'error',
          message: `Selector "${zoneSelector}" is owner-qualified, but zone "${zoneSelector}" is owner "${owner}".`,
          suggestion: `Use :none for unowned zones, or change "${zoneSelector}" owner to "player".`,
        });
      }
    }

    return;
  }

  const { base, qualifier } = parseZoneSelector(zoneSelector);
  const baseMatches = context.zoneCandidates.filter((candidate) => candidate.startsWith(`${base}:`));

  if (baseMatches.length === 0) {
    pushMissingReferenceDiagnostic(
      diagnostics,
      'REF_ZONE_MISSING',
      path,
      `Unknown zone "${zoneSelector}".`,
      zoneSelector,
      context.zoneCandidates,
    );
    return;
  }

  if (qualifier === null) {
    return;
  }

  const hasUnownedVariant = baseMatches.some((candidate) => context.zoneOwners.get(candidate) === 'none');
  const hasPlayerOwnedVariant = baseMatches.some((candidate) => context.zoneOwners.get(candidate) === 'player');

  if (qualifier === 'none') {
    if (!hasUnownedVariant) {
      diagnostics.push({
        code: 'ZONE_SELECTOR_OWNERSHIP_INVALID',
        path,
        severity: 'error',
        message: `Selector "${zoneSelector}" uses :none, but zone base "${base}" is player-owned.`,
        suggestion: `Use a selector that targets a player-owned zone, or change "${base}" owner to "none".`,
      });
    }
    return;
  }

  if (!hasPlayerOwnedVariant) {
    diagnostics.push({
      code: 'ZONE_SELECTOR_OWNERSHIP_INVALID',
      path,
      severity: 'error',
      message: `Selector "${zoneSelector}" is owner-qualified, but zone base "${base}" is unowned.`,
      suggestion: `Use :none for unowned zones, or change "${base}" owner to "player".`,
    });
  }
};

export const validateStructureSections = (diagnostics: Diagnostic[], def: GameDef): void => {
  if (def.metadata.players.min < 1) {
    diagnostics.push({
      code: 'META_PLAYERS_MIN_INVALID',
      path: 'metadata.players.min',
      severity: 'error',
      message: `metadata.players.min must be >= 1; received ${def.metadata.players.min}.`,
    });
  }
  if (def.metadata.players.min > def.metadata.players.max) {
    diagnostics.push({
      code: 'META_PLAYERS_RANGE_INVALID',
      path: 'metadata.players',
      severity: 'error',
      message: `metadata.players.min (${def.metadata.players.min}) must be <= metadata.players.max (${def.metadata.players.max}).`,
    });
  }
  if (
    def.metadata.maxTriggerDepth !== undefined &&
    (!Number.isInteger(def.metadata.maxTriggerDepth) || def.metadata.maxTriggerDepth < 1)
  ) {
    diagnostics.push({
      code: 'META_MAX_TRIGGER_DEPTH_INVALID',
      path: 'metadata.maxTriggerDepth',
      severity: 'error',
      message: `metadata.maxTriggerDepth must be an integer >= 1; received ${def.metadata.maxTriggerDepth}.`,
    });
  }

  def.globalVars.forEach((variable, index) => {
    if (variable.min > variable.init || variable.init > variable.max) {
      diagnostics.push({
        code: 'VAR_BOUNDS_INVALID',
        path: `globalVars[${index}]`,
        severity: 'error',
        message: `Variable "${variable.name}" must satisfy min <= init <= max; received ${variable.min} <= ${variable.init} <= ${variable.max}.`,
      });
    }
  });
  def.perPlayerVars.forEach((variable, index) => {
    if (variable.min > variable.init || variable.init > variable.max) {
      diagnostics.push({
        code: 'VAR_BOUNDS_INVALID',
        path: `perPlayerVars[${index}]`,
        severity: 'error',
        message: `Variable "${variable.name}" must satisfy min <= init <= max; received ${variable.min} <= ${variable.init} <= ${variable.max}.`,
      });
    }
  });

  checkDuplicateIds(diagnostics, def.zones.map((zone) => zone.id), 'DUPLICATE_ZONE_ID', 'zone id', 'zones');
  checkDuplicateIds(
    diagnostics,
    def.tokenTypes.map((tokenType) => tokenType.id),
    'DUPLICATE_TOKEN_TYPE_ID',
    'token type id',
    'tokenTypes',
  );
  checkDuplicateIds(
    diagnostics,
    def.turnStructure.phases.map((phase) => phase.id),
    'DUPLICATE_PHASE_ID',
    'phase id',
    'turnStructure.phases',
  );
  checkDuplicateIds(
    diagnostics,
    def.actions.map((action) => action.id),
    'DUPLICATE_ACTION_ID',
    'action id',
    'actions',
  );
  checkDuplicateIds(
    diagnostics,
    def.triggers.map((trigger) => trigger.id),
    'DUPLICATE_TRIGGER_ID',
    'trigger id',
    'triggers',
  );
  checkDuplicateIds(
    diagnostics,
    def.globalVars.map((variable) => variable.name),
    'DUPLICATE_GLOBAL_VAR_NAME',
    'global var name',
    'globalVars',
  );
  checkDuplicateIds(
    diagnostics,
    def.perPlayerVars.map((variable) => variable.name),
    'DUPLICATE_PER_PLAYER_VAR_NAME',
    'per-player var name',
    'perPlayerVars',
  );
  checkDuplicateIds(
    diagnostics,
    (def.actionPipelines ?? []).map((operationProfile) => operationProfile.id),
    'DUPLICATE_OPERATION_PROFILE_ID',
    'operation profile id',
    'actionPipelines',
  );

  def.zones.forEach((zone, index) => {
    const qualifier = parseZoneSelector(zone.id).qualifier;

    if (zone.owner === 'none') {
      if (qualifier !== 'none') {
        diagnostics.push({
          code: 'ZONE_ID_OWNERSHIP_INVALID',
          path: `zones[${index}].id`,
          severity: 'error',
          message: `Unowned zone "${zone.id}" must use the :none qualifier to match owner "none".`,
          suggestion: 'Rename zone id to use :none, or change owner to "player".',
        });
      }
      return;
    }

    if (qualifier === null || !PLAYER_ZONE_QUALIFIER_PATTERN.test(qualifier)) {
      diagnostics.push({
        code: 'ZONE_ID_PLAYER_QUALIFIER_INVALID',
        path: `zones[${index}].id`,
        severity: 'error',
        message: `Player-owned zone "${zone.id}" must use a numeric owner qualifier (for example :0).`,
        suggestion: 'Rename zone id to include a numeric player qualifier, or change owner to "none".',
      });
      return;
    }

    const playerId = Number(qualifier);
    if (playerId > def.metadata.players.max - 1) {
      diagnostics.push({
        code: 'ZONE_ID_PLAYER_INDEX_OUT_OF_BOUNDS',
        path: `zones[${index}].id`,
        severity: 'error',
        message: `Player-owned zone "${zone.id}" targets player ${playerId}, which exceeds metadata.players.max (${def.metadata.players.max}).`,
        suggestion: `Use a qualifier in [0, ${def.metadata.players.max - 1}] or increase metadata.players.max.`,
      });
    }
  });
};

export const buildValidationContext = (
  def: GameDef,
): {
  context: ValidationContext;
  phaseCandidates: readonly string[];
  actionCandidates: readonly string[];
} => {
  const zoneCandidates = [...new Set(def.zones.map((zone) => zone.id))].sort((left, right) => left.localeCompare(right));
  const globalVarCandidates = [...new Set(def.globalVars.map((variable) => variable.name))].sort((left, right) =>
    left.localeCompare(right),
  );
  const perPlayerVarCandidates = [...new Set(def.perPlayerVars.map((variable) => variable.name))].sort((left, right) =>
    left.localeCompare(right),
  );
  const tokenTypeCandidates = [...new Set(def.tokenTypes.map((tokenType) => tokenType.id))].sort((left, right) =>
    left.localeCompare(right),
  );
  const phaseCandidates = [...new Set(def.turnStructure.phases.map((phase) => phase.id))].sort((left, right) =>
    left.localeCompare(right),
  );
  const actionCandidates = [...new Set(def.actions.map((action) => action.id))].sort((left, right) =>
    left.localeCompare(right),
  );

  const context: ValidationContext = {
    zoneNames: new Set(zoneCandidates),
    zoneCandidates,
    zoneOwners: new Map(def.zones.map((zone) => [zone.id, zone.owner])),
    globalVarNames: new Set(globalVarCandidates),
    globalVarCandidates,
    perPlayerVarNames: new Set(perPlayerVarCandidates),
    perPlayerVarCandidates,
    tokenTypeNames: new Set(tokenTypeCandidates),
    tokenTypeCandidates,
    playerIdMin: 0,
    playerIdMaxInclusive: def.metadata.players.max - 1,
  };

  return { context, phaseCandidates, actionCandidates };
};

const spaceMatchesFilter = (space: MapSpaceDef, filter: StackingConstraint['spaceFilter']): boolean => {
  if (filter.spaceIds !== undefined && filter.spaceIds.length > 0 && !filter.spaceIds.includes(space.id)) {
    return false;
  }
  if (filter.spaceTypes !== undefined && filter.spaceTypes.length > 0 && !filter.spaceTypes.includes(space.spaceType)) {
    return false;
  }
  if (filter.country !== undefined && filter.country.length > 0 && !filter.country.includes(space.country)) {
    return false;
  }
  if (filter.populationEquals !== undefined && space.population !== filter.populationEquals) {
    return false;
  }
  return true;
};

const placementMatchesPieceFilter = (
  placement: ScenarioPiecePlacement,
  filter: StackingConstraint['pieceFilter'],
): boolean => {
  if (
    filter.pieceTypeIds !== undefined &&
    filter.pieceTypeIds.length > 0 &&
    !filter.pieceTypeIds.includes(placement.pieceTypeId)
  ) {
    return false;
  }
  if (filter.factions !== undefined && filter.factions.length > 0 && !filter.factions.includes(placement.faction)) {
    return false;
  }
  return true;
};

export const validateInitialPlacementsAgainstStackingConstraints = (
  constraints: readonly StackingConstraint[],
  placements: readonly ScenarioPiecePlacement[],
  spaces: readonly MapSpaceDef[],
): Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];
  const spaceMap = new Map(spaces.map((space) => [space.id, space]));

  for (const constraint of constraints) {
    const matchingSpaceIds = spaces
      .filter((space) => spaceMatchesFilter(space, constraint.spaceFilter))
      .map((space) => space.id);

    const matchingSpaceSet = new Set(matchingSpaceIds);

    const countBySpace = new Map<string, number>();
    for (const placement of placements) {
      if (!matchingSpaceSet.has(placement.spaceId)) {
        continue;
      }
      if (!placementMatchesPieceFilter(placement, constraint.pieceFilter)) {
        continue;
      }
      const current = countBySpace.get(placement.spaceId) ?? 0;
      countBySpace.set(placement.spaceId, current + placement.count);
    }

    for (const [spaceId, count] of countBySpace) {
      const space = spaceMap.get(spaceId);
      const spaceLabel = space ? `${spaceId} (${space.spaceType})` : spaceId;

      if (constraint.rule === 'prohibit' && count > 0) {
        diagnostics.push({
          code: 'STACKING_CONSTRAINT_VIOLATION',
          path: `stackingConstraints[${constraint.id}]`,
          severity: 'error',
          message: `Stacking violation: ${count} piece(s) in ${spaceLabel} violate constraint "${constraint.id}" (${constraint.description}).`,
          suggestion: `Remove the prohibited pieces from ${spaceId} or adjust the constraint.`,
        });
      }

      if (constraint.rule === 'maxCount' && constraint.maxCount !== undefined && count > constraint.maxCount) {
        diagnostics.push({
          code: 'STACKING_CONSTRAINT_VIOLATION',
          path: `stackingConstraints[${constraint.id}]`,
          severity: 'error',
          message: `Stacking violation: ${count} piece(s) in ${spaceLabel} exceed max ${constraint.maxCount} for constraint "${constraint.id}" (${constraint.description}).`,
          suggestion: `Reduce pieces in ${spaceId} to at most ${constraint.maxCount} or adjust the constraint.`,
        });
      }
    }
  }

  return diagnostics;
};
