import { createHash } from 'node:crypto';
import type { Diagnostic } from '../kernel/diagnostics.js';
import type {
  CompiledObserverCatalog,
  CompiledObserverProfile,
  CompiledSurfaceCatalog,
  CompiledSurfaceVisibility,
  CompiledZoneVisibilityCatalog,
  CompiledZoneVisibilityEntry,
} from '../kernel/types.js';
import type {
  GameSpecObservabilitySection,
  GameSpecObserverProfileDef,
  GameSpecObserverSurfaceEntryDef,
  GameSpecObserverSurfacesDef,
  GameSpecObserverSurfaceValue,
  GameSpecObserverZoneEntryDef,
  GameSpecObserverZonesDef,
  GameSpecPolicySurfaceVisibilityClass,
  GameSpecPolicySurfaceVisibilityDef,
} from './game-spec-doc.js';
import { lowerSurfaceVisibilityEntry } from './compile-agents.js';
import { CNL_COMPILER_DIAGNOSTIC_CODES } from './compiler-diagnostic-codes.js';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface LowerObserversOptions {
  readonly knownGlobalVarIds: readonly string[];
  readonly knownPerPlayerVarIds: readonly string[];
  readonly knownDerivedMetricIds: readonly string[];
  readonly knownZoneBaseIds?: readonly string[];
}

// ---------------------------------------------------------------------------
// System defaults (Spec 102 Part A)
// ---------------------------------------------------------------------------

const SURFACE_DEFAULTS: Readonly<Record<string, CompiledSurfaceVisibility>> = {
  globalVars: { current: 'public', preview: { visibility: 'public', allowWhenHiddenSampling: true } },
  perPlayerVars: { current: 'seatVisible', preview: { visibility: 'seatVisible', allowWhenHiddenSampling: true } },
  derivedMetrics: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
  'victory.currentMargin': { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
  'victory.currentRank': { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
  activeCardIdentity: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
  activeCardTag: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
  activeCardMetadata: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
  activeCardAnnotation: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
};

const BUILT_IN_OBSERVER_NAMES = new Set<string>(['omniscient', 'default']);

const VISIBILITY_ENTRY_KEYS = new Set<string>(['current', 'preview']);

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Compiles the `observability` section of a GameSpecDoc into a `CompiledObserverCatalog`.
 *
 * Returns `undefined` if `spec` is null (runtime falls back to built-in defaults).
 * Pure function — no side effects, deterministic output.
 */
export function lowerObservers(
  spec: GameSpecObservabilitySection | null,
  diagnostics: Diagnostic[],
  options: LowerObserversOptions,
): CompiledObserverCatalog | undefined {
  if (spec === null) {
    return undefined;
  }

  const observers: Record<string, CompiledObserverProfile> = {};
  const userProfiles = spec.observers ?? {};

  // Reject built-in name collisions (defense-in-depth; validator also checks)
  for (const name of Object.keys(userProfiles)) {
    if (BUILT_IN_OBSERVER_NAMES.has(name)) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_OBSERVER_BUILTIN_NAME_COLLISION,
        path: `doc.observability.observers.${name}`,
        severity: 'error',
        message: `Observer "${name}" collides with a built-in observer name.`,
        suggestion: `Choose a different name — "${name}" is reserved.`,
      });
    }
  }

  // Resolve user-defined profiles
  for (const [name, profileDef] of Object.entries(userProfiles)) {
    if (BUILT_IN_OBSERVER_NAMES.has(name)) {
      continue; // skip — already diagnosed above
    }

    const baseSurfaces = resolveBaseSurfaces(name, profileDef, userProfiles, options, diagnostics);
    const surfaces = resolveObserverSurfaces(profileDef.surfaces, baseSurfaces, options, diagnostics, `doc.observability.observers.${name}.surfaces`);
    const baseZones = resolveBaseZones(name, profileDef, userProfiles, options, diagnostics);
    const zones = resolveObserverZones(profileDef.zones, baseZones);
    observers[name] = {
      fingerprint: fingerprintObserverIr({ surfaces, zones }),
      surfaces,
      ...(zones !== undefined ? { zones } : {}),
    };
  }

  // Built-in: omniscient
  const omniscientSurfaces = buildOmniscientSurfaces(options);
  const omniscientZones = buildOmniscientZones();
  observers['omniscient'] = {
    fingerprint: fingerprintObserverIr({ surfaces: omniscientSurfaces, zones: omniscientZones }),
    surfaces: omniscientSurfaces,
    zones: omniscientZones,
  };

  // Built-in: default (zones: undefined — defers to ZoneDef.visibility)
  const defaultSurfaces = buildDefaultSurfaces(options);
  observers['default'] = {
    fingerprint: fingerprintObserverIr({ surfaces: defaultSurfaces, zones: undefined }),
    surfaces: defaultSurfaces,
  };

  const catalogWithoutFingerprint = {
    schemaVersion: 1 as const,
    observers,
    defaultObserverName: 'default',
  };

  return {
    ...catalogWithoutFingerprint,
    catalogFingerprint: fingerprintObserverIr(catalogWithoutFingerprint),
  };
}

// ---------------------------------------------------------------------------
// Base surface resolution (handles extends)
// ---------------------------------------------------------------------------

function resolveBaseSurfaces(
  name: string,
  profileDef: GameSpecObserverProfileDef,
  allProfiles: Readonly<Record<string, GameSpecObserverProfileDef>>,
  options: LowerObserversOptions,
  diagnostics: Diagnostic[],
): CompiledSurfaceCatalog {
  const systemDefaults = buildDefaultSurfaces(options);

  if (profileDef.extends === undefined) {
    return systemDefaults;
  }

  const parentName = profileDef.extends;
  const parentDef = allProfiles[parentName];
  if (parentDef === undefined) {
    // Validator should have caught this; emit diagnostic and use defaults
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_OBSERVER_EXTENDS_MISSING,
      path: `doc.observability.observers.${name}.extends`,
      severity: 'error',
      message: `Observer "${name}" extends "${parentName}", which does not exist.`,
      suggestion: `Define "${parentName}" in observability.observers.`,
    });
    return systemDefaults;
  }

  // Resolve parent (parent cannot itself extend — validated by ticket 003)
  return resolveObserverSurfaces(
    parentDef.surfaces,
    systemDefaults,
    options,
    diagnostics,
    `doc.observability.observers.${parentName}.surfaces`,
  );
}

// ---------------------------------------------------------------------------
// Surface resolution: applies overrides on top of base
// ---------------------------------------------------------------------------

function resolveObserverSurfaces(
  surfaces: GameSpecObserverSurfacesDef | undefined,
  base: CompiledSurfaceCatalog,
  options: LowerObserversOptions,
  diagnostics: Diagnostic[],
  path: string,
): CompiledSurfaceCatalog {
  if (surfaces === undefined) {
    return base;
  }

  return {
    globalVars: lowerObserverMapTypeSurface(
      options.knownGlobalVarIds,
      surfaces.globalVars,
      base.globalVars,
      SURFACE_DEFAULTS['globalVars']!,
      diagnostics,
      `${path}.globalVars`,
    ),
    globalMarkers: base.globalMarkers,
    perPlayerVars: lowerObserverMapTypeSurface(
      options.knownPerPlayerVarIds,
      surfaces.perPlayerVars,
      base.perPlayerVars,
      SURFACE_DEFAULTS['perPlayerVars']!,
      diagnostics,
      `${path}.perPlayerVars`,
    ),
    derivedMetrics: lowerObserverMapTypeSurface(
      options.knownDerivedMetricIds,
      surfaces.derivedMetrics,
      base.derivedMetrics,
      SURFACE_DEFAULTS['derivedMetrics']!,
      diagnostics,
      `${path}.derivedMetrics`,
    ),
    victory: {
      currentMargin: lowerObserverScalarSurface(
        surfaces.victory?.currentMargin,
        base.victory.currentMargin,
        SURFACE_DEFAULTS['victory.currentMargin']!,
        diagnostics,
        `${path}.victory.currentMargin`,
      ),
      currentRank: lowerObserverScalarSurface(
        surfaces.victory?.currentRank,
        base.victory.currentRank,
        SURFACE_DEFAULTS['victory.currentRank']!,
        diagnostics,
        `${path}.victory.currentRank`,
      ),
    },
    activeCardIdentity: lowerObserverScalarSurface(
      surfaces.activeCardIdentity,
      base.activeCardIdentity,
      SURFACE_DEFAULTS['activeCardIdentity']!,
      diagnostics,
      `${path}.activeCardIdentity`,
    ),
    activeCardTag: lowerObserverScalarSurface(
      surfaces.activeCardTag,
      base.activeCardTag,
      SURFACE_DEFAULTS['activeCardTag']!,
      diagnostics,
      `${path}.activeCardTag`,
    ),
    activeCardMetadata: lowerObserverScalarSurface(
      surfaces.activeCardMetadata,
      base.activeCardMetadata,
      SURFACE_DEFAULTS['activeCardMetadata']!,
      diagnostics,
      `${path}.activeCardMetadata`,
    ),
    activeCardAnnotation: lowerObserverScalarSurface(
      surfaces.activeCardAnnotation,
      base.activeCardAnnotation,
      SURFACE_DEFAULTS['activeCardAnnotation']!,
      diagnostics,
      `${path}.activeCardAnnotation`,
    ),
  };
}

// ---------------------------------------------------------------------------
// Base zone resolution (handles extends)
// ---------------------------------------------------------------------------

function resolveBaseZones(
  _name: string,
  profileDef: GameSpecObserverProfileDef,
  allProfiles: Readonly<Record<string, GameSpecObserverProfileDef>>,
  _options: LowerObserversOptions,
  _diagnostics: Diagnostic[],
): CompiledZoneVisibilityCatalog | undefined {
  if (profileDef.extends === undefined) {
    return undefined;
  }

  const parentDef = allProfiles[profileDef.extends];
  if (parentDef === undefined) {
    return undefined; // extends target missing — already diagnosed
  }

  // Resolve parent zones (parent cannot itself extend)
  return resolveObserverZones(parentDef.zones, undefined);
}

// ---------------------------------------------------------------------------
// Zone resolution: applies overrides on top of base
// ---------------------------------------------------------------------------

function resolveObserverZones(
  zones: GameSpecObserverZonesDef | undefined,
  base: CompiledZoneVisibilityCatalog | undefined,
): CompiledZoneVisibilityCatalog | undefined {
  if (zones === undefined) {
    return base;
  }

  const entries: Record<string, CompiledZoneVisibilityEntry> = {
    ...(base?.entries ?? {}),
  };
  let defaultEntry: CompiledZoneVisibilityEntry | undefined = base?.defaultEntry;

  for (const [key, entryDef] of Object.entries(zones)) {
    const compiled = lowerZoneEntry(entryDef);
    if (compiled === undefined) {
      continue; // invalid entry — validation catches this
    }
    if (key === '_default') {
      defaultEntry = compiled;
    } else {
      entries[key] = compiled;
    }
  }

  // If nothing was set and no base, return undefined (no zone overrides)
  if (Object.keys(entries).length === 0 && defaultEntry === undefined) {
    return undefined;
  }

  return {
    entries,
    ...(defaultEntry !== undefined ? { defaultEntry } : {}),
  };
}

function lowerZoneEntry(
  entryDef: GameSpecObserverZoneEntryDef,
): CompiledZoneVisibilityEntry | undefined {
  const tokens = entryDef.tokens;
  const order = entryDef.order;

  if (tokens === undefined && order === undefined) {
    return undefined;
  }

  return {
    tokens: (tokens ?? order ?? 'public') as CompiledZoneVisibilityEntry['tokens'],
    order: (order ?? tokens ?? 'public') as CompiledZoneVisibilityEntry['order'],
  };
}

// ---------------------------------------------------------------------------
// Map-type surface compilation (globalVars, perPlayerVars, derivedMetrics)
// ---------------------------------------------------------------------------

function lowerObserverMapTypeSurface(
  knownIds: readonly string[],
  surfaceValue: GameSpecObserverSurfaceValue | undefined,
  baseSurfaces: Readonly<Record<string, CompiledSurfaceVisibility>>,
  familyDefaults: CompiledSurfaceVisibility,
  diagnostics: Diagnostic[],
  path: string,
): Readonly<Record<string, CompiledSurfaceVisibility>> {
  if (surfaceValue === undefined) {
    return baseSurfaces;
  }

  // String shorthand: apply same visibility to all known IDs
  if (typeof surfaceValue === 'string') {
    const entry: GameSpecPolicySurfaceVisibilityDef = { current: surfaceValue };
    const result: Record<string, CompiledSurfaceVisibility> = {};
    for (const id of knownIds) {
      result[id] = lowerSurfaceVisibilityEntry(entry, diagnostics, `${path}.${id}`, familyDefaults);
    }
    return result;
  }

  // Object: determine if full syntax ({ current, preview }) or per-variable map
  const keys = Object.keys(surfaceValue);
  const isFullSyntax = keys.length > 0 && keys.every((k) => VISIBILITY_ENTRY_KEYS.has(k));

  if (isFullSyntax) {
    const entry = surfaceValue as GameSpecPolicySurfaceVisibilityDef;
    const result: Record<string, CompiledSurfaceVisibility> = {};
    for (const id of knownIds) {
      result[id] = lowerSurfaceVisibilityEntry(entry, diagnostics, `${path}.${id}`, familyDefaults);
    }
    return result;
  }

  // Per-variable override map (may include _default)
  const varMap = surfaceValue as Readonly<Record<string, GameSpecPolicySurfaceVisibilityClass | GameSpecObserverSurfaceEntryDef>>;
  const defaultOverride = normalizeToSurfaceVisibilityDef(
    varMap['_default'] as GameSpecPolicySurfaceVisibilityClass | GameSpecObserverSurfaceEntryDef | undefined,
  );
  const result: Record<string, CompiledSurfaceVisibility> = {};

  for (const id of knownIds) {
    const varOverride = varMap[id] as GameSpecPolicySurfaceVisibilityClass | GameSpecObserverSurfaceEntryDef | undefined;
    if (varOverride !== undefined) {
      const normalized = normalizeToSurfaceVisibilityDef(varOverride);
      result[id] = lowerSurfaceVisibilityEntry(normalized, diagnostics, `${path}.${id}`, familyDefaults);
    } else if (defaultOverride !== undefined) {
      result[id] = lowerSurfaceVisibilityEntry(defaultOverride, diagnostics, `${path}._default`, familyDefaults);
    } else {
      // Fall back to base (parent or system defaults)
      result[id] = baseSurfaces[id] ?? lowerSurfaceVisibilityEntry(undefined, diagnostics, `${path}.${id}`, familyDefaults);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Scalar surface compilation
// ---------------------------------------------------------------------------

function lowerObserverScalarSurface(
  surfaceValue: GameSpecPolicySurfaceVisibilityClass | GameSpecObserverSurfaceEntryDef | undefined,
  baseValue: CompiledSurfaceVisibility,
  familyDefaults: CompiledSurfaceVisibility,
  diagnostics: Diagnostic[],
  path: string,
): CompiledSurfaceVisibility {
  if (surfaceValue === undefined) {
    return baseValue;
  }
  const normalized = normalizeToSurfaceVisibilityDef(surfaceValue);
  return lowerSurfaceVisibilityEntry(normalized, diagnostics, path, familyDefaults);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeToSurfaceVisibilityDef(
  value: GameSpecPolicySurfaceVisibilityClass | GameSpecObserverSurfaceEntryDef | undefined,
): GameSpecPolicySurfaceVisibilityDef | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === 'string') {
    return { current: value };
  }
  return value;
}

// ---------------------------------------------------------------------------
// Built-in profiles
// ---------------------------------------------------------------------------

function buildDefaultSurfaces(options: LowerObserversOptions): CompiledSurfaceCatalog {
  return {
    globalVars: expandMapDefaults(options.knownGlobalVarIds, SURFACE_DEFAULTS['globalVars']!),
    globalMarkers: {},
    perPlayerVars: expandMapDefaults(options.knownPerPlayerVarIds, SURFACE_DEFAULTS['perPlayerVars']!),
    derivedMetrics: expandMapDefaults(options.knownDerivedMetricIds, SURFACE_DEFAULTS['derivedMetrics']!),
    victory: {
      currentMargin: SURFACE_DEFAULTS['victory.currentMargin']!,
      currentRank: SURFACE_DEFAULTS['victory.currentRank']!,
    },
    activeCardIdentity: SURFACE_DEFAULTS['activeCardIdentity']!,
    activeCardTag: SURFACE_DEFAULTS['activeCardTag']!,
    activeCardMetadata: SURFACE_DEFAULTS['activeCardMetadata']!,
    activeCardAnnotation: SURFACE_DEFAULTS['activeCardAnnotation']!,
  };
}

function buildOmniscientZones(): CompiledZoneVisibilityCatalog {
  return {
    entries: {},
    defaultEntry: { tokens: 'public', order: 'public' },
  };
}

function buildOmniscientSurfaces(options: LowerObserversOptions): CompiledSurfaceCatalog {
  const allPublic: CompiledSurfaceVisibility = {
    current: 'public',
    preview: { visibility: 'public', allowWhenHiddenSampling: false },
  };
  return {
    globalVars: expandMapDefaults(options.knownGlobalVarIds, allPublic),
    globalMarkers: {},
    perPlayerVars: expandMapDefaults(options.knownPerPlayerVarIds, allPublic),
    derivedMetrics: expandMapDefaults(options.knownDerivedMetricIds, allPublic),
    victory: {
      currentMargin: allPublic,
      currentRank: allPublic,
    },
    activeCardIdentity: allPublic,
    activeCardTag: allPublic,
    activeCardMetadata: allPublic,
    activeCardAnnotation: allPublic,
  };
}

function expandMapDefaults(
  knownIds: readonly string[],
  defaults: CompiledSurfaceVisibility,
): Readonly<Record<string, CompiledSurfaceVisibility>> {
  const result: Record<string, CompiledSurfaceVisibility> = {};
  for (const id of knownIds) {
    result[id] = defaults;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Fingerprinting
// ---------------------------------------------------------------------------

function fingerprintObserverIr(value: unknown): string {
  return createHash('sha256')
    .update('observer-ir-v1')
    .update('\0')
    .update(canonicalizeObserverIr(value))
    .digest('hex');
}

function canonicalizeObserverIr(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (value === undefined) {
    return 'undefined';
  }
  if (typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalizeObserverIr(entry)).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalizeObserverIr(v)}`);
  return `{${entries.join(',')}}`;
}
