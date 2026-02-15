import type { MapSpaceDef, StackingConstraint, Token } from './types.js';

export interface StackingViolation {
  readonly constraintId: string;
  readonly description: string;
  readonly rule: 'maxCount' | 'prohibit';
  readonly zoneId: string;
  readonly matchingCount: number;
  readonly maxCount?: number;
}

const spaceMatchesFilter = (
  space: MapSpaceDef,
  filter: StackingConstraint['spaceFilter'],
): boolean => {
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

const tokenMatchesPieceFilter = (
  token: Token,
  filter: StackingConstraint['pieceFilter'],
  tokenTypeFactionById: ReadonlyMap<string, string> | undefined,
): boolean => {
  if (filter.pieceTypeIds !== undefined && filter.pieceTypeIds.length > 0 && !filter.pieceTypeIds.includes(token.type)) {
    return false;
  }
  if (filter.factions !== undefined && filter.factions.length > 0) {
    const canonicalFaction = tokenTypeFactionById?.get(token.type);
    if (typeof canonicalFaction !== 'string' || !filter.factions.includes(canonicalFaction)) {
      return false;
    }
  }
  return true;
};

/**
 * Check stacking constraints for a destination zone after placement.
 * Returns an array of violations (empty if none).
 *
 * This is a pure function — no mutation of state.
 *
 * @param constraints - Stacking constraints from GameDef
 * @param mapSpaces - Map space definitions for space filter resolution
 * @param zoneId - Destination zone ID
 * @param zoneContentsAfter - All tokens in the zone after the placement
 */
export function checkStackingConstraints(
  constraints: readonly StackingConstraint[],
  mapSpaces: readonly MapSpaceDef[],
  zoneId: string,
  zoneContentsAfter: readonly Token[],
  tokenTypeFactionById?: ReadonlyMap<string, string>,
): readonly StackingViolation[] {
  if (constraints.length === 0) {
    return [];
  }

  const space = mapSpaces.find((s) => s.id === zoneId);
  if (space === undefined) {
    return [];
  }

  const violations: StackingViolation[] = [];

  for (const constraint of constraints) {
    if (!spaceMatchesFilter(space, constraint.spaceFilter)) {
      continue;
    }

    const matchingCount = zoneContentsAfter.filter((token) =>
      tokenMatchesPieceFilter(token, constraint.pieceFilter, tokenTypeFactionById),
    ).length;

    if (constraint.rule === 'prohibit' && matchingCount > 0) {
      violations.push({
        constraintId: constraint.id,
        description: constraint.description,
        rule: 'prohibit',
        zoneId,
        matchingCount,
      });
    }

    if (constraint.rule === 'maxCount' && constraint.maxCount !== undefined && matchingCount > constraint.maxCount) {
      violations.push({
        constraintId: constraint.id,
        description: constraint.description,
        rule: 'maxCount',
        zoneId,
        matchingCount,
        maxCount: constraint.maxCount,
      });
    }
  }

  return violations;
}
