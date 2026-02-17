import type { Diagnostic } from '../kernel/diagnostics.js';
import { asZoneId, type ZoneId } from '../kernel/branded.js';
import type { ZoneDef } from '../kernel/types.js';
import type { GameSpecZoneDef } from './game-spec-doc.js';
import { normalizeZoneOwnerQualifier } from './compile-selectors.js';

type ZoneOwnershipKind = 'none' | 'player' | 'mixed';

export interface ZoneCompileResult<TValue> {
  readonly value: TValue;
  readonly diagnostics: readonly Diagnostic[];
}

export interface MaterializedZones {
  readonly zones: readonly ZoneDef[];
  readonly ownershipByBase: Readonly<Record<string, ZoneOwnershipKind>>;
}

export function materializeZoneDefs(
  sourceZones: readonly GameSpecZoneDef[],
  playersMax: number,
  pathPrefix = 'doc.zones',
): ZoneCompileResult<MaterializedZones> {
  const diagnostics: Diagnostic[] = [];
  const outputZones: ZoneDef[] = [];
  const ownershipMap = new Map<string, ZoneOwnershipKind>();

  for (const [index, zone] of sourceZones.entries()) {
    const zonePath = `${pathPrefix}.${index}`;
    const base = extractZoneBase(zone.id);
    if (base === null) {
      diagnostics.push({
        code: 'CNL_COMPILER_ZONE_ID_INVALID',
        path: `${zonePath}.id`,
        severity: 'error',
        message: `Zone id "${zone.id}" must be a non-empty string.`,
        suggestion: 'Use a non-empty zone base id such as "deck" or "hand".',
      });
      continue;
    }

    const owner = zone.owner;
    if (owner !== 'none' && owner !== 'player') {
      diagnostics.push({
        code: 'CNL_COMPILER_ZONE_OWNER_INVALID',
        path: `${zonePath}.owner`,
        severity: 'error',
        message: `Zone owner "${zone.owner}" is invalid.`,
        suggestion: 'Use owner "none" or "player".',
      });
      continue;
    }

    const visibility = normalizeZoneVisibility(zone.visibility);
    if (visibility === null) {
      diagnostics.push({
        code: 'CNL_COMPILER_ZONE_VISIBILITY_INVALID',
        path: `${zonePath}.visibility`,
        severity: 'error',
        message: `Zone visibility "${zone.visibility}" is invalid.`,
        suggestion: 'Use visibility "public", "owner", or "hidden".',
      });
      continue;
    }

    const ordering = normalizeZoneOrdering(zone.ordering);
    if (ordering === null) {
      diagnostics.push({
        code: 'CNL_COMPILER_ZONE_ORDERING_INVALID',
        path: `${zonePath}.ordering`,
        severity: 'error',
        message: `Zone ordering "${zone.ordering}" is invalid.`,
        suggestion: 'Use ordering "stack", "queue", or "set".',
      });
      continue;
    }

    mergeZoneOwnership(ownershipMap, base, owner);
    if (owner === 'none') {
      outputZones.push(createZoneDef(`${base}:none`, 'none', visibility, ordering, zone.adjacentTo));
      continue;
    }

    for (let playerId = 0; playerId < playersMax; playerId += 1) {
      outputZones.push(createZoneDef(`${base}:${playerId}`, 'player', visibility, ordering, zone.adjacentTo));
    }
  }

  return {
    value: {
      zones: outputZones,
      ownershipByBase: Object.freeze(Object.fromEntries([...ownershipMap.entries()].sort(([left], [right]) => left.localeCompare(right)))),
    },
    diagnostics,
  };
}

export function canonicalizeZoneSelector(
  selector: unknown,
  ownershipByBase: Readonly<Record<string, ZoneOwnershipKind>>,
  path: string,
): ZoneCompileResult<string | null> {
  // Static concat resolution: { concat: ['available:', 'US'] } → "available:US"
  const resolved = tryStaticConcatResolution(selector, path);
  if (resolved !== undefined) {
    if (resolved.value === null) {
      return resolved;
    }
    selector = resolved.value;
  }

  if (typeof selector !== 'string' || selector.trim() === '') {
    return {
      value: null,
      diagnostics: [
        {
          code: 'CNL_COMPILER_ZONE_SELECTOR_INVALID',
          path,
          severity: 'error',
          message: 'Zone selector must be a non-empty string.',
          suggestion: 'Use "zoneBase:qualifier" or a bare unowned zone base.',
        },
      ],
    };
  }

  // Binding references (e.g. "$space") resolve at runtime — pass through.
  if (selector.startsWith('$')) {
    return { value: selector, diagnostics: [] };
  }

  const splitIndex = selector.indexOf(':');
  if (splitIndex < 0) {
    const ownership = ownershipByBase[selector];
    if (ownership === 'none') {
      return { value: `${selector}:none`, diagnostics: [] };
    }
    if (ownership === 'player' || ownership === 'mixed') {
      return {
        value: null,
        diagnostics: [
          {
            code: 'CNL_COMPILER_ZONE_SELECTOR_AMBIGUOUS',
            path,
            severity: 'error',
            message: `Bare zone selector "${selector}" is ambiguous.`,
            suggestion: 'Use an explicit owner qualifier such as :active, :actor, :all, :0, or :$binding.',
          },
        ],
      };
    }
    return {
      value: null,
      diagnostics: [
        {
          code: 'CNL_COMPILER_ZONE_SELECTOR_UNKNOWN_BASE',
          path,
          severity: 'error',
          message: `Unknown zone base "${selector}".`,
          suggestion: 'Use a zone base declared in doc.zones.',
          alternatives: Object.keys(ownershipByBase).sort(),
        },
      ],
    };
  }

  const zoneBase = selector.slice(0, splitIndex);
  const qualifierRaw = selector.slice(splitIndex + 1);
  if (zoneBase.length === 0 || qualifierRaw.length === 0) {
    return {
      value: null,
      diagnostics: [
        {
          code: 'CNL_COMPILER_ZONE_SELECTOR_INVALID',
          path,
          severity: 'error',
          message: `Zone selector "${selector}" must use "zoneBase:qualifier" format.`,
          suggestion: 'Use a non-empty base and qualifier, for example "deck:none".',
        },
      ],
    };
  }

  const normalizedQualifier = normalizeZoneOwnerQualifier(qualifierRaw, path);
  if (normalizedQualifier.value === null) {
    return {
      value: null,
      diagnostics: normalizedQualifier.diagnostics,
    };
  }

  return {
    value: `${zoneBase}:${normalizedQualifier.value}`,
    diagnostics: [],
  };
}

function extractZoneBase(zoneId: string): string | null {
  if (zoneId.trim() === '') {
    return null;
  }

  const delimiter = zoneId.indexOf(':');
  const base = delimiter < 0 ? zoneId : zoneId.slice(0, delimiter);
  return base.trim() === '' ? null : base;
}

function normalizeZoneVisibility(value: string): ZoneDef['visibility'] | null {
  if (value === 'public' || value === 'owner' || value === 'hidden') {
    return value;
  }
  return null;
}

function normalizeZoneOrdering(value: string): ZoneDef['ordering'] | null {
  if (value === 'stack' || value === 'queue' || value === 'set') {
    return value;
  }
  return null;
}

function mergeZoneOwnership(map: Map<string, ZoneOwnershipKind>, base: string, owner: 'none' | 'player'): void {
  const existing = map.get(base);
  if (existing === undefined) {
    map.set(base, owner);
    return;
  }
  if (existing !== owner) {
    map.set(base, 'mixed');
  }
}

function normalizeAdjacentTo(value: GameSpecZoneDef['adjacentTo']): readonly ZoneId[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  return value.map((zoneId) => asZoneId(zoneId));
}

/**
 * If `source` is a `{ concat: [...] }` ValueExpr whose parts are all string
 * or number literals, resolve it to a single string at compile time.
 * Returns `undefined` if source is not a concat expression.
 */
function tryStaticConcatResolution(
  source: unknown,
  _path: string,
): ZoneCompileResult<string | null> | undefined {
  if (typeof source !== 'object' || source === null || !('concat' in source)) {
    return undefined;
  }

  const concatArray = (source as Record<string, unknown>).concat;
  if (!Array.isArray(concatArray)) {
    return undefined;
  }

  const parts: string[] = [];
  for (const part of concatArray) {
    if (typeof part === 'string') {
      parts.push(part);
    } else if (typeof part === 'number') {
      parts.push(String(part));
    } else {
      // Dynamic part — cannot resolve at compile time.
      // Signal to caller (undefined = not fully static).
      return undefined;
    }
  }

  return { value: parts.join(''), diagnostics: [] };
}

function createZoneDef(
  id: string,
  owner: ZoneDef['owner'],
  visibility: ZoneDef['visibility'],
  ordering: ZoneDef['ordering'],
  adjacentTo: GameSpecZoneDef['adjacentTo'],
): ZoneDef {
  const normalizedAdjacentTo = normalizeAdjacentTo(adjacentTo);
  if (normalizedAdjacentTo === undefined) {
    return {
      id: asZoneId(id),
      owner,
      visibility,
      ordering,
    };
  }

  return {
    id: asZoneId(id),
    owner,
    visibility,
    ordering,
    adjacentTo: normalizedAdjacentTo as readonly ZoneId[],
  };
}
