import type { Diagnostic } from '../kernel/diagnostics.js';
import type { GameSpecObservabilitySection } from './game-spec-doc.js';
import { isRecord } from './validate-spec-shared.js';

const OBSERVER_SURFACE_FAMILY_KEYS = [
  'globalVars',
  'globalMarkers',
  'perPlayerVars',
  'derivedMetrics',
  'victory',
  'activeCardIdentity',
  'activeCardTag',
  'activeCardMetadata',
  'activeCardAnnotation',
] as const;

const MAP_TYPE_SURFACE_FAMILIES = new Set<string>(['globalVars', 'globalMarkers', 'perPlayerVars', 'derivedMetrics']);

const VISIBILITY_CLASS_VALUES = new Set<string>(['public', 'seatVisible', 'hidden']);

const VISIBILITY_ENTRY_KEYS = new Set<string>(['current', 'preview']);

const VISIBILITY_PREVIEW_KEYS = new Set<string>(['visibility', 'allowWhenHiddenSampling']);

const BUILT_IN_OBSERVER_NAMES = new Set<string>(['omniscient', 'default']);

const OBSERVER_PROFILE_KEYS = new Set<string>(['extends', 'description', 'surfaces', 'zones']);

/**
 * Known surface IDs passed from the game spec for per-variable override validation.
 * Maps surface family name to the set of declared variable/metric names.
 */
export interface KnownSurfaceIds {
  readonly globalVars: ReadonlySet<string>;
  readonly globalMarkers: ReadonlySet<string>;
  readonly perPlayerVars: ReadonlySet<string>;
  readonly derivedMetrics: ReadonlySet<string>;
}

/**
 * Known zone info passed from compiled zone definitions for zone visibility validation.
 */
export interface KnownZoneInfo {
  readonly zoneBaseIds: ReadonlySet<string>;
  readonly zoneOrderingByBase: Readonly<Record<string, string>>; // 'stack' | 'queue' | 'set'
  readonly zoneOwnershipByBase: Readonly<Record<string, string>>; // 'none' | 'player' | 'mixed'
}

/**
 * Validates the `observability` section of a GameSpecDoc.
 *
 * Pure function — no side effects, no mutation of inputs.
 */
export function validateObservers(
  observability: GameSpecObservabilitySection | null,
  knownSurfaceIds: KnownSurfaceIds,
  knownZoneInfo: KnownZoneInfo | undefined,
  diagnostics: Diagnostic[],
): void {
  if (observability === null) {
    return;
  }

  if (!isRecord(observability)) {
    diagnostics.push({
      code: 'CNL_VALIDATOR_OBSERVERS_SECTION_INVALID',
      path: 'doc.observability',
      severity: 'error',
      message: 'observability section must be an object.',
      suggestion: 'Define doc.observability as an object containing an observers map.',
    });
    return;
  }

  const observers = observability.observers;
  if (observers === undefined) {
    return;
  }

  if (!isRecord(observers)) {
    diagnostics.push({
      code: 'CNL_VALIDATOR_OBSERVERS_MAP_REQUIRED',
      path: 'doc.observability.observers',
      severity: 'error',
      message: 'observability.observers must be a map keyed by observer names.',
      suggestion: 'Define observers as an object keyed by observer profile names.',
    });
    return;
  }

  for (const [name, profile] of Object.entries(observers)) {
    validateObserverProfile(name, profile, observers, knownSurfaceIds, knownZoneInfo, diagnostics);
  }
}

function validateObserverProfile(
  name: string,
  profile: unknown,
  allObservers: Record<string, unknown>,
  knownSurfaceIds: KnownSurfaceIds,
  knownZoneInfo: KnownZoneInfo | undefined,
  diagnostics: Diagnostic[],
): void {
  const basePath = `doc.observability.observers.${name}`;

  // Built-in name collision
  if (BUILT_IN_OBSERVER_NAMES.has(name)) {
    diagnostics.push({
      code: 'CNL_VALIDATOR_OBSERVER_BUILTIN_NAME_COLLISION',
      path: basePath,
      severity: 'error',
      message: `Observer "${name}" collides with a built-in observer name.`,
      suggestion: `Choose a different name — "${name}" is reserved for the built-in observer.`,
    });
  }

  if (!isRecord(profile)) {
    diagnostics.push({
      code: 'CNL_VALIDATOR_OBSERVER_PROFILE_INVALID',
      path: basePath,
      severity: 'error',
      message: `Observer "${name}" must be an object.`,
      suggestion: 'Define each observer profile as an object with optional extends, description, and surfaces fields.',
    });
    return;
  }

  // Check for unknown keys
  for (const key of Object.keys(profile)) {
    if (!OBSERVER_PROFILE_KEYS.has(key)) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_OBSERVER_UNKNOWN_KEY',
        path: `${basePath}.${key}`,
        severity: 'warning',
        message: `Unknown key "${key}" in observer "${name}".`,
        suggestion: 'Supported keys are: extends, description, surfaces, zones.',
      });
    }
  }

  // Validate extends
  if (profile.extends !== undefined) {
    validateExtends(name, profile.extends, allObservers, basePath, diagnostics);
  }

  // Validate surfaces
  if (profile.surfaces !== undefined) {
    validateSurfaces(name, profile.surfaces, knownSurfaceIds, `${basePath}.surfaces`, diagnostics);
  }

  // Validate zones
  if (profile.zones !== undefined) {
    validateZones(name, profile.zones, knownZoneInfo, `${basePath}.zones`, diagnostics);
  }
}

function validateExtends(
  name: string,
  extendsValue: unknown,
  allObservers: Record<string, unknown>,
  basePath: string,
  diagnostics: Diagnostic[],
): void {
  const extendsPath = `${basePath}.extends`;

  if (typeof extendsValue !== 'string' || extendsValue.trim() === '') {
    diagnostics.push({
      code: 'CNL_VALIDATOR_OBSERVER_EXTENDS_INVALID',
      path: extendsPath,
      severity: 'error',
      message: `Observer "${name}" extends value must be a non-empty string.`,
      suggestion: 'Set extends to the name of another observer profile.',
    });
    return;
  }

  // Cannot extend built-in names
  if (BUILT_IN_OBSERVER_NAMES.has(extendsValue)) {
    diagnostics.push({
      code: 'CNL_VALIDATOR_OBSERVER_EXTENDS_BUILTIN',
      path: extendsPath,
      severity: 'error',
      message: `Observer "${name}" cannot extend built-in observer "${extendsValue}".`,
      suggestion: 'Only user-defined observers can be extended.',
    });
    return;
  }

  // Target must exist
  const target = allObservers[extendsValue];
  if (target === undefined) {
    diagnostics.push({
      code: 'CNL_VALIDATOR_OBSERVER_EXTENDS_MISSING',
      path: extendsPath,
      severity: 'error',
      message: `Observer "${name}" extends "${extendsValue}", which does not exist.`,
      suggestion: `Define "${extendsValue}" in observability.observers or use an existing observer name.`,
    });
    return;
  }

  // Circular reference check (A extends B, B extends A)
  if (isRecord(target) && target.extends === name) {
    diagnostics.push({
      code: 'CNL_VALIDATOR_OBSERVER_EXTENDS_CIRCULAR',
      path: extendsPath,
      severity: 'error',
      message: `Observer "${name}" and "${extendsValue}" form a circular extends chain.`,
      suggestion: 'Remove one of the extends references to break the cycle.',
    });
    return;
  }

  // Max depth = 1: target must not itself use extends
  if (isRecord(target) && target.extends !== undefined) {
    diagnostics.push({
      code: 'CNL_VALIDATOR_OBSERVER_EXTENDS_DEPTH',
      path: extendsPath,
      severity: 'error',
      message: `Observer "${name}" extends "${extendsValue}", which itself uses extends. Max extends depth is 1.`,
      suggestion: `Remove extends from either "${name}" or "${extendsValue}".`,
    });
  }
}

const ZONE_VISIBILITY_CLASS_VALUES = new Set<string>(['public', 'owner', 'hidden']);

const ZONE_ENTRY_KEYS = new Set<string>(['tokens', 'order']);

function validateZones(
  observerName: string,
  zones: unknown,
  knownZoneInfo: KnownZoneInfo | undefined,
  basePath: string,
  diagnostics: Diagnostic[],
): void {
  if (!isRecord(zones)) {
    diagnostics.push({
      code: 'CNL_VALIDATOR_OBSERVER_ZONES_INVALID',
      path: basePath,
      severity: 'error',
      message: `Observer "${observerName}" zones must be an object.`,
      suggestion: 'Define zones as an object keyed by zone base IDs.',
    });
    return;
  }

  for (const [key, entry] of Object.entries(zones)) {
    const entryPath = `${basePath}.${key}`;

    // Validate zone base ID (skip _default)
    if (key !== '_default' && knownZoneInfo !== undefined && !knownZoneInfo.zoneBaseIds.has(key)) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_OBSERVER_ZONE_UNKNOWN_BASE',
        path: entryPath,
        severity: 'error',
        message: `Observer "${observerName}" references unknown zone base ID "${key}".`,
        suggestion: `Use a zone base ID from the game spec's zone definitions. Known: ${[...knownZoneInfo.zoneBaseIds].sort().join(', ')}.`,
      });
    }

    if (!isRecord(entry)) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_OBSERVER_ZONE_ENTRY_INVALID',
        path: entryPath,
        severity: 'error',
        message: `Observer "${observerName}" zone entry "${key}" must be an object with tokens and/or order.`,
        suggestion: 'Define each zone entry as { tokens: ..., order: ... }.',
      });
      continue;
    }

    // Check for unknown keys
    for (const entryKey of Object.keys(entry)) {
      if (!ZONE_ENTRY_KEYS.has(entryKey)) {
        diagnostics.push({
          code: 'CNL_VALIDATOR_OBSERVER_ZONE_ENTRY_UNKNOWN_KEY',
          path: `${entryPath}.${entryKey}`,
          severity: 'warning',
          message: `Unknown key "${entryKey}" in observer "${observerName}" zone entry "${key}".`,
          suggestion: 'Supported zone entry keys: tokens, order.',
        });
      }
    }

    // Must have at least one of tokens or order
    if (entry.tokens === undefined && entry.order === undefined) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_OBSERVER_ZONE_ENTRY_EMPTY',
        path: entryPath,
        severity: 'error',
        message: `Observer "${observerName}" zone entry "${key}" must specify at least one of tokens or order.`,
        suggestion: 'Add tokens and/or order with values: public, owner, or hidden.',
      });
      continue;
    }

    // Validate tokens
    if (entry.tokens !== undefined) {
      if (typeof entry.tokens !== 'string' || !ZONE_VISIBILITY_CLASS_VALUES.has(entry.tokens)) {
        diagnostics.push({
          code: 'CNL_VALIDATOR_OBSERVER_ZONE_VISIBILITY_INVALID',
          path: `${entryPath}.tokens`,
          severity: 'error',
          message: `Observer "${observerName}" zone "${key}" tokens has invalid visibility class "${String(entry.tokens)}".`,
          suggestion: 'Use one of: public, owner, hidden.',
        });
      }
    }

    // Validate order
    if (entry.order !== undefined) {
      if (typeof entry.order !== 'string' || !ZONE_VISIBILITY_CLASS_VALUES.has(entry.order)) {
        diagnostics.push({
          code: 'CNL_VALIDATOR_OBSERVER_ZONE_VISIBILITY_INVALID',
          path: `${entryPath}.order`,
          severity: 'error',
          message: `Observer "${observerName}" zone "${key}" order has invalid visibility class "${String(entry.order)}".`,
          suggestion: 'Use one of: public, owner, hidden.',
        });
      }
    }

    // Warning: order differs from tokens on set-type zone
    if (
      key !== '_default' &&
      knownZoneInfo !== undefined &&
      knownZoneInfo.zoneOrderingByBase[key] === 'set' &&
      entry.order !== undefined &&
      entry.tokens !== undefined &&
      typeof entry.order === 'string' &&
      typeof entry.tokens === 'string' &&
      entry.order !== entry.tokens
    ) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_OBSERVER_ZONE_ORDER_SET_WARNING',
        path: `${entryPath}.order`,
        severity: 'warning',
        message: `Observer "${observerName}" zone "${key}" is a set zone — order has no effect. order="${entry.order}" differs from tokens="${entry.tokens}".`,
        suggestion: 'Set zones have no meaningful ordering. Remove order or match it to tokens.',
      });
    }

    // Warning: owner visibility on non-owned zone
    if (
      key !== '_default' &&
      knownZoneInfo !== undefined &&
      knownZoneInfo.zoneOwnershipByBase[key] === 'none'
    ) {
      const tokensIsOwner = typeof entry.tokens === 'string' && entry.tokens === 'owner';
      const orderIsOwner = typeof entry.order === 'string' && entry.order === 'owner';
      if (tokensIsOwner || orderIsOwner) {
        diagnostics.push({
          code: 'CNL_VALIDATOR_OBSERVER_ZONE_OWNER_NONE_WARNING',
          path: entryPath,
          severity: 'warning',
          message: `Observer "${observerName}" zone "${key}" has owner: 'none' — "owner" visibility is equivalent to "hidden".`,
          suggestion: 'Use "hidden" instead of "owner" for zones with no owner.',
        });
      }
    }
  }
}

function validateSurfaces(
  observerName: string,
  surfaces: unknown,
  knownSurfaceIds: KnownSurfaceIds,
  basePath: string,
  diagnostics: Diagnostic[],
): void {
  if (!isRecord(surfaces)) {
    diagnostics.push({
      code: 'CNL_VALIDATOR_OBSERVER_SURFACES_INVALID',
      path: basePath,
      severity: 'error',
      message: `Observer "${observerName}" surfaces must be an object.`,
      suggestion: 'Define surfaces as an object keyed by surface family names.',
    });
    return;
  }

  for (const key of Object.keys(surfaces)) {
    if (!(OBSERVER_SURFACE_FAMILY_KEYS as readonly string[]).includes(key)) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_OBSERVER_UNKNOWN_SURFACE_FAMILY',
        path: `${basePath}.${key}`,
        severity: 'error',
        message: `Observer "${observerName}" has unknown surface family "${key}".`,
        suggestion: `Supported surface families: ${OBSERVER_SURFACE_FAMILY_KEYS.join(', ')}.`,
      });
    }
  }

  // Validate each known surface family
  for (const key of OBSERVER_SURFACE_FAMILY_KEYS) {
    const value = surfaces[key];
    if (value === undefined) {
      continue;
    }

    if (key === 'victory') {
      validateVictorySurface(observerName, value, `${basePath}.victory`, diagnostics);
    } else if (MAP_TYPE_SURFACE_FAMILIES.has(key)) {
      validateMapTypeSurface(observerName, key, value, knownSurfaceIds, `${basePath}.${key}`, diagnostics);
    } else {
      // Scalar surface: activeCardIdentity, activeCardTag, activeCardMetadata, activeCardAnnotation
      validateScalarSurfaceValue(observerName, key, value, `${basePath}.${key}`, diagnostics);
    }
  }
}

function validateVictorySurface(
  observerName: string,
  value: unknown,
  path: string,
  diagnostics: Diagnostic[],
): void {
  if (!isRecord(value)) {
    diagnostics.push({
      code: 'CNL_VALIDATOR_OBSERVER_VICTORY_INVALID',
      path,
      severity: 'error',
      message: `Observer "${observerName}" victory surface must be an object with currentMargin/currentRank.`,
      suggestion: 'Define victory as { currentMargin: ..., currentRank: ... }.',
    });
    return;
  }

  const allowedKeys = new Set(['currentMargin', 'currentRank']);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_OBSERVER_VICTORY_UNKNOWN_KEY',
        path: `${path}.${key}`,
        severity: 'warning',
        message: `Unknown key "${key}" in observer "${observerName}" victory surface.`,
        suggestion: 'Supported victory keys: currentMargin, currentRank.',
      });
    }
  }

  if (value.currentMargin !== undefined) {
    validateScalarSurfaceValue(observerName, 'victory.currentMargin', value.currentMargin, `${path}.currentMargin`, diagnostics);
  }
  if (value.currentRank !== undefined) {
    validateScalarSurfaceValue(observerName, 'victory.currentRank', value.currentRank, `${path}.currentRank`, diagnostics);
  }
}

function validateMapTypeSurface(
  observerName: string,
  familyKey: string,
  value: unknown,
  knownSurfaceIds: KnownSurfaceIds,
  path: string,
  diagnostics: Diagnostic[],
): void {
  // Shorthand: 'public' | 'seatVisible' | 'hidden' — applies to entire family
  if (typeof value === 'string') {
    if (!VISIBILITY_CLASS_VALUES.has(value)) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_OBSERVER_VISIBILITY_CLASS_INVALID',
        path,
        severity: 'error',
        message: `Observer "${observerName}" surface "${familyKey}" has invalid visibility class "${value}".`,
        suggestion: 'Use one of: public, seatVisible, hidden.',
      });
    }
    return;
  }

  // Full syntax: object with current/preview or per-variable overrides
  if (!isRecord(value)) {
    diagnostics.push({
      code: 'CNL_VALIDATOR_OBSERVER_SURFACE_ENTRY_INVALID',
      path,
      severity: 'error',
      message: `Observer "${observerName}" surface "${familyKey}" must be a visibility class string or an object.`,
      suggestion: 'Use a shorthand string (public/seatVisible/hidden) or an object with per-variable overrides.',
    });
    return;
  }

  // Check if this is a full-syntax entry { current, preview } or a per-variable map
  const keys = Object.keys(value);
  const isFullSyntax = keys.every((k) => VISIBILITY_ENTRY_KEYS.has(k));

  if (isFullSyntax && keys.length > 0) {
    validateFullSyntaxEntry(observerName, familyKey, value, path, diagnostics);
    return;
  }

  // Per-variable override map
  const knownIds = knownSurfaceIds[familyKey as keyof KnownSurfaceIds];

  for (const [varKey, varValue] of Object.entries(value)) {
    if (varKey === '_default') {
      // _default is valid in map-type surfaces
      validateScalarSurfaceValue(observerName, `${familyKey}._default`, varValue, `${path}._default`, diagnostics);
      continue;
    }

    // Validate variable exists in game spec
    if (!knownIds.has(varKey)) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_OBSERVER_UNKNOWN_VARIABLE',
        path: `${path}.${varKey}`,
        severity: 'error',
        message: `Observer "${observerName}" surface "${familyKey}" references unknown variable "${varKey}".`,
        suggestion: `Ensure "${varKey}" is declared in the game spec's ${familyKey}.`,
      });
    }

    validateScalarSurfaceValue(observerName, `${familyKey}.${varKey}`, varValue, `${path}.${varKey}`, diagnostics);
  }
}

function validateScalarSurfaceValue(
  observerName: string,
  surfaceLabel: string,
  value: unknown,
  path: string,
  diagnostics: Diagnostic[],
): void {
  // Shorthand: string visibility class
  if (typeof value === 'string') {
    if (!VISIBILITY_CLASS_VALUES.has(value)) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_OBSERVER_VISIBILITY_CLASS_INVALID',
        path,
        severity: 'error',
        message: `Observer "${observerName}" surface "${surfaceLabel}" has invalid visibility class "${value}".`,
        suggestion: 'Use one of: public, seatVisible, hidden.',
      });
    }
    return;
  }

  // Full syntax: { current, preview }
  if (!isRecord(value)) {
    diagnostics.push({
      code: 'CNL_VALIDATOR_OBSERVER_SURFACE_ENTRY_INVALID',
      path,
      severity: 'error',
      message: `Observer "${observerName}" surface "${surfaceLabel}" must be a visibility class string or an object.`,
      suggestion: 'Use a shorthand string (public/seatVisible/hidden) or { current, preview }.',
    });
    return;
  }

  // Check for _default in non-map surface
  const topFamily = surfaceLabel.split('.')[0] ?? '';
  if ('_default' in value && !MAP_TYPE_SURFACE_FAMILIES.has(topFamily)) {
    diagnostics.push({
        code: 'CNL_VALIDATOR_OBSERVER_DEFAULT_IN_SCALAR',
        path: `${path}._default`,
        severity: 'error',
        message: `Observer "${observerName}" surface "${surfaceLabel}" uses "_default" which is only valid in map-type surfaces.`,
        suggestion: '_default is only valid in globalVars, globalMarkers, perPlayerVars, and derivedMetrics.',
      });
  }

  validateFullSyntaxEntry(observerName, surfaceLabel, value, path, diagnostics);
}

function validateFullSyntaxEntry(
  observerName: string,
  surfaceLabel: string,
  value: Record<string, unknown>,
  path: string,
  diagnostics: Diagnostic[],
): void {
  for (const key of Object.keys(value)) {
    if (!VISIBILITY_ENTRY_KEYS.has(key)) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_OBSERVER_ENTRY_UNKNOWN_KEY',
        path: `${path}.${key}`,
        severity: 'warning',
        message: `Unknown key "${key}" in observer "${observerName}" surface "${surfaceLabel}".`,
        suggestion: 'Supported keys: current, preview.',
      });
    }
  }

  if (value.current !== undefined) {
    if (typeof value.current !== 'string' || !VISIBILITY_CLASS_VALUES.has(value.current)) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_OBSERVER_VISIBILITY_CLASS_INVALID',
        path: `${path}.current`,
        severity: 'error',
        message: `Observer "${observerName}" surface "${surfaceLabel}" current has invalid visibility class.`,
        suggestion: 'Use one of: public, seatVisible, hidden.',
      });
    }
  }

  if (value.preview !== undefined) {
    validatePreviewEntry(observerName, surfaceLabel, value.preview, `${path}.preview`, diagnostics);
  }
}

function validatePreviewEntry(
  observerName: string,
  surfaceLabel: string,
  preview: unknown,
  path: string,
  diagnostics: Diagnostic[],
): void {
  if (!isRecord(preview)) {
    diagnostics.push({
      code: 'CNL_VALIDATOR_OBSERVER_PREVIEW_INVALID',
      path,
      severity: 'error',
      message: `Observer "${observerName}" surface "${surfaceLabel}" preview must be an object.`,
      suggestion: 'Define preview as { visibility: ..., allowWhenHiddenSampling: ... }.',
    });
    return;
  }

  for (const key of Object.keys(preview)) {
    if (!VISIBILITY_PREVIEW_KEYS.has(key)) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_OBSERVER_PREVIEW_UNKNOWN_KEY',
        path: `${path}.${key}`,
        severity: 'warning',
        message: `Unknown key "${key}" in observer "${observerName}" surface "${surfaceLabel}" preview.`,
        suggestion: 'Supported preview keys: visibility, allowWhenHiddenSampling.',
      });
    }
  }

  if (preview.visibility !== undefined) {
    if (typeof preview.visibility !== 'string' || !VISIBILITY_CLASS_VALUES.has(preview.visibility)) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_OBSERVER_VISIBILITY_CLASS_INVALID',
        path: `${path}.visibility`,
        severity: 'error',
        message: `Observer "${observerName}" surface "${surfaceLabel}" preview.visibility has invalid visibility class.`,
        suggestion: 'Use one of: public, seatVisible, hidden.',
      });
    }
  }

  if (preview.allowWhenHiddenSampling !== undefined && typeof preview.allowWhenHiddenSampling !== 'boolean') {
    diagnostics.push({
      code: 'CNL_VALIDATOR_OBSERVER_PREVIEW_SAMPLING_INVALID',
      path: `${path}.allowWhenHiddenSampling`,
      severity: 'error',
      message: `Observer "${observerName}" surface "${surfaceLabel}" preview.allowWhenHiddenSampling must be a boolean.`,
      suggestion: 'Set allowWhenHiddenSampling to true or false.',
    });
  }
}
