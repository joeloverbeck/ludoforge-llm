import type { Diagnostic } from '../kernel/diagnostics.js';
import { asZoneId } from '../kernel/branded.js';
import type { ZoneBehavior, ZoneDef } from '../kernel/types.js';
import type { GameSpecZoneDef } from './game-spec-doc.js';
import { normalizeZoneOwnerQualifier } from './compile-selectors.js';
import { CNL_COMPILER_DIAGNOSTIC_CODES } from './compiler-diagnostic-codes.js';

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
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_ZONE_ID_INVALID,
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
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_ZONE_OWNER_INVALID,
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
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_ZONE_VISIBILITY_INVALID,
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
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_ZONE_ORDERING_INVALID,
        path: `${zonePath}.ordering`,
        severity: 'error',
        message: `Zone ordering "${zone.ordering}" is invalid.`,
        suggestion: 'Use ordering "stack", "queue", or "set".',
      });
      continue;
    }

    const zoneKind = normalizeZoneKind(zone.zoneKind);
    if (zoneKind === null) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_ZONE_KIND_INVALID,
        path: `${zonePath}.zoneKind`,
        severity: 'error',
        message: `Zone kind "${String(zone.zoneKind)}" is invalid.`,
        suggestion: 'Use zoneKind "board" or "aux".',
      });
      continue;
    }

    const behavior = compileBehavior(zone, ordering, zonePath, diagnostics);

    mergeZoneOwnership(ownershipMap, base, owner);
    if (owner === 'none') {
      outputZones.push(
        createZoneDef({
          id: `${base}:none`,
          owner: 'none',
          isInternal: zone.isInternal,
          visibility,
          ordering,
          adjacentTo: normalizeAdjacentTo(zone.adjacentTo, `${zonePath}.adjacentTo`, diagnostics),
          zoneKind,
          category: zone.category,
          attributes: zone.attributes,
          ...(behavior === undefined ? {} : { behavior }),
        }),
      );
      continue;
    }

    for (let playerId = 0; playerId < playersMax; playerId += 1) {
      outputZones.push(
        createZoneDef({
          id: `${base}:${playerId}`,
          owner: 'player',
          ownerPlayerIndex: playerId,
          isInternal: zone.isInternal,
          visibility,
          ordering,
          adjacentTo: normalizeAdjacentTo(zone.adjacentTo, `${zonePath}.adjacentTo`, diagnostics),
          zoneKind,
          category: zone.category,
          attributes: zone.attributes,
          ...(behavior === undefined ? {} : { behavior }),
        }),
      );
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
  seatIds?: readonly string[],
  zoneIdSet?: ReadonlySet<string>,
): ZoneCompileResult<string | null> {
  let normalizedSelector = selector;
  // Static concat resolution: { concat: ['available:', 'US'] } → "available:US"
  const resolved = tryStaticConcatResolution(normalizedSelector, path);
  if (resolved !== undefined) {
    if (resolved.value === null) {
      return resolved;
    }
    normalizedSelector = resolved.value;
  }

  if (typeof normalizedSelector !== 'string' || normalizedSelector.trim() === '') {
    return {
      value: null,
      diagnostics: [
        {
          code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_ZONE_SELECTOR_INVALID,
          path,
          severity: 'error',
          message: 'Zone selector must be a non-empty string.',
          suggestion: 'Use "zoneBase:qualifier" or a bare unowned zone base.',
        },
      ],
    };
  }

  // Binding references (e.g. "$space") resolve at runtime — pass through.
  if (normalizedSelector.startsWith('$')) {
    return { value: normalizedSelector, diagnostics: [] };
  }

  const splitIndex = normalizedSelector.indexOf(':');
  if (splitIndex < 0) {
    const ownership = ownershipByBase[normalizedSelector];
    if (ownership === 'none') {
      const autoId = `${normalizedSelector}:none`;
      if (zoneIdSet !== undefined && !zoneIdSet.has(autoId)) {
        return {
          value: null,
          diagnostics: [{
            code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_ZONE_ID_UNKNOWN,
            path,
            severity: 'error',
            message: `Zone "${autoId}" does not exist.`,
            suggestion: 'Check zone definitions for the correct zone ID.',
            alternatives: [...zoneIdSet].filter(id => id.startsWith(normalizedSelector + ':')).sort(),
          }],
        };
      }
      return { value: autoId, diagnostics: [] };
    }
    if (ownership === 'player' || ownership === 'mixed') {
      return {
        value: null,
        diagnostics: [
          {
            code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_ZONE_SELECTOR_AMBIGUOUS,
            path,
            severity: 'error',
            message: `Bare zone selector "${normalizedSelector}" is ambiguous.`,
            suggestion: 'Use an explicit owner qualifier such as :active, :actor, :all, :0, or :$binding.',
          },
        ],
      };
    }
    return {
      value: null,
      diagnostics: [
        {
          code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_ZONE_SELECTOR_UNKNOWN_BASE,
          path,
          severity: 'error',
          message: `Unknown zone base "${normalizedSelector}".`,
          suggestion: 'Use a zone base declared in doc.zones.',
          alternatives: Object.keys(ownershipByBase).sort(),
        },
      ],
    };
  }

  const zoneBase = normalizedSelector.slice(0, splitIndex);
  const qualifierRaw = normalizedSelector.slice(splitIndex + 1);
  if (zoneBase.length === 0 || qualifierRaw.length === 0) {
    return {
      value: null,
      diagnostics: [
        {
          code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_ZONE_SELECTOR_INVALID,
          path,
          severity: 'error',
          message: `Zone selector "${normalizedSelector}" must use "zoneBase:qualifier" format.`,
          suggestion: 'Use a non-empty base and qualifier, for example "deck:none".',
        },
      ],
    };
  }

  const normalizedQualifier = normalizeZoneOwnerQualifier(qualifierRaw, path, seatIds);
  if (normalizedQualifier.value === null) {
    return {
      value: null,
      diagnostics: normalizedQualifier.diagnostics,
    };
  }

  const canonicalId = `${zoneBase}:${normalizedQualifier.value}`;
  if (zoneIdSet !== undefined && !canonicalId.includes('$') && !zoneIdSet.has(canonicalId)) {
    return {
      value: null,
      diagnostics: [{
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_ZONE_ID_UNKNOWN,
        path,
        severity: 'error',
        message: `Zone "${canonicalId}" does not exist.`,
        suggestion: 'Check zone definitions for the correct zone ID.',
        alternatives: [...zoneIdSet].filter(id => id.startsWith(zoneBase + ':')).sort(),
      }],
    };
  }
  return {
    value: canonicalId,
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

function normalizeZoneKind(value: GameSpecZoneDef['zoneKind']): 'board' | 'aux' | null {
  if (value === undefined) {
    return 'aux';
  }
  if (value === 'board' || value === 'aux') {
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

function normalizeAdjacentTo(
  value: GameSpecZoneDef['adjacentTo'],
  path: string,
  diagnostics: Diagnostic[],
): readonly NonNullable<ZoneDef['adjacentTo']>[number][] | undefined {
  if (value === undefined) {
    return undefined;
  }
  const normalized: NonNullable<ZoneDef['adjacentTo']>[number][] = [];
  for (const [index, adjacency] of value.entries()) {
    if (typeof adjacency.to !== 'string' || adjacency.to.trim() === '') {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_ZONE_ADJACENCY_INVALID,
        path: `${path}.${index}.to`,
        severity: 'error',
        message: 'Zone adjacency entries must define a non-empty "to" string.',
        suggestion: 'Set adjacency entries as objects: { to: \"zone-id\" }.',
      });
      continue;
    }

    if (
      adjacency.direction !== undefined
      && adjacency.direction !== 'bidirectional'
      && adjacency.direction !== 'unidirectional'
    ) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_ZONE_ADJACENCY_DIRECTION_INVALID,
        path: `${path}.${index}.direction`,
        severity: 'error',
        message: 'Zone adjacency direction must be "bidirectional" or "unidirectional".',
        suggestion: 'Omit direction for default bidirectional edges, or set direction: "unidirectional".',
      });
      continue;
    }

    normalized.push({
      to: asZoneId(adjacency.to),
      direction: adjacency.direction ?? 'bidirectional',
      ...(adjacency.category === undefined ? {} : { category: adjacency.category }),
      ...(adjacency.attributes === undefined ? {} : { attributes: adjacency.attributes }),
    });
  }
  return normalized;
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

interface CreateZoneDefOptions {
  readonly id: string;
  readonly owner: ZoneDef['owner'];
  readonly ownerPlayerIndex?: ZoneDef['ownerPlayerIndex'];
  readonly isInternal?: ZoneDef['isInternal'];
  readonly visibility: ZoneDef['visibility'];
  readonly ordering: ZoneDef['ordering'];
  readonly adjacentTo?: ZoneDef['adjacentTo'];
  readonly zoneKind: 'board' | 'aux';
  readonly category?: GameSpecZoneDef['category'];
  readonly attributes?: GameSpecZoneDef['attributes'];
  readonly behavior?: ZoneBehavior;
}

function createZoneDef(options: CreateZoneDefOptions): ZoneDef {
  return {
    id: asZoneId(options.id),
    zoneKind: options.zoneKind,
    owner: options.owner,
    ...(options.ownerPlayerIndex === undefined ? {} : { ownerPlayerIndex: options.ownerPlayerIndex }),
    ...(options.isInternal === undefined ? {} : { isInternal: options.isInternal }),
    visibility: options.visibility,
    ordering: options.ordering,
    ...(options.adjacentTo === undefined ? {} : { adjacentTo: options.adjacentTo }),
    ...(options.category === undefined ? {} : { category: options.category }),
    ...(options.attributes === undefined ? {} : { attributes: options.attributes }),
    ...(options.behavior === undefined ? {} : { behavior: options.behavior }),
  };
}

const VALID_DRAW_FROM = new Set(['top', 'bottom', 'random']);

function compileBehavior(
  zone: GameSpecZoneDef,
  ordering: ZoneDef['ordering'],
  zonePath: string,
  diagnostics: Diagnostic[],
): ZoneBehavior | undefined {
  if (zone.behavior === undefined) {
    return undefined;
  }

  if (zone.behavior.type !== 'deck') {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_ZONE_BEHAVIOR_TYPE_INVALID,
      path: `${zonePath}.behavior.type`,
      severity: 'error',
      message: `Zone behavior type "${String(zone.behavior.type)}" is invalid.`,
      suggestion: 'Use behavior type "deck".',
    });
    return undefined;
  }

  const drawFrom = zone.behavior.drawFrom ?? 'top';
  if (!VALID_DRAW_FROM.has(drawFrom)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_ZONE_BEHAVIOR_DRAW_FROM_INVALID,
      path: `${zonePath}.behavior.drawFrom`,
      severity: 'error',
      message: `Zone behavior drawFrom "${drawFrom}" is invalid.`,
      suggestion: 'Use drawFrom "top", "bottom", or "random".',
    });
    return undefined;
  }

  if (ordering !== 'stack') {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_ZONE_BEHAVIOR_ORDERING_MISMATCH,
      path: `${zonePath}.behavior`,
      severity: 'warning',
      message: `Zone has deck behavior but ordering is "${ordering}" instead of "stack".`,
      suggestion: 'Set ordering to "stack" for zones with deck behavior.',
    });
  }

  return {
    type: 'deck',
    drawFrom: drawFrom as 'top' | 'bottom' | 'random',
    ...(zone.behavior.reshuffleFrom === undefined ? {} : { reshuffleFrom: asZoneId(zone.behavior.reshuffleFrom) }),
  };
}
