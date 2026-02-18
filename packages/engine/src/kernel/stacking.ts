import type { StackingConstraint, Token, ZoneDef } from './types.js';
import { attributeValueEquals } from './attribute-value-equals.js';

export interface StackingViolation {
  readonly constraintId: string;
  readonly description: string;
  readonly rule: 'maxCount' | 'prohibit';
  readonly zoneId: string;
  readonly matchingCount: number;
  readonly maxCount?: number;
}

const zoneMatchesFilter = (
  zone: ZoneDef,
  filter: StackingConstraint['spaceFilter'],
): boolean => {
  if (filter.spaceIds !== undefined && filter.spaceIds.length > 0 && !filter.spaceIds.includes(zone.id)) {
    return false;
  }
  if (filter.category !== undefined && filter.category.length > 0) {
    if (zone.category === undefined || !filter.category.includes(zone.category)) {
      return false;
    }
  }
  if (filter.attributeEquals !== undefined) {
    for (const [key, expected] of Object.entries(filter.attributeEquals)) {
      const actual = zone.attributes?.[key];
      if (!attributeValueEquals(actual, expected)) {
        return false;
      }
    }
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
 * @param zones - Zone definitions for space filter resolution
 * @param zoneId - Destination zone ID
 * @param zoneContentsAfter - All tokens in the zone after the placement
 */
export function checkStackingConstraints(
  constraints: readonly StackingConstraint[],
  zones: readonly ZoneDef[],
  zoneId: string,
  zoneContentsAfter: readonly Token[],
  tokenTypeFactionById?: ReadonlyMap<string, string>,
): readonly StackingViolation[] {
  if (constraints.length === 0) {
    return [];
  }

  const zone = zones.find((z) => z.id === zoneId);
  if (zone === undefined) {
    return [];
  }

  const violations: StackingViolation[] = [];

  for (const constraint of constraints) {
    if (!zoneMatchesFilter(zone, constraint.spaceFilter)) {
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
