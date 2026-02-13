import type { Diagnostic } from '../kernel/diagnostics.js';
import type { GameDef } from '../kernel/types.js';
import { validateGameDef } from '../kernel/validate-gamedef.js';
import { materializeZoneDefs } from './compile-zones.js';
import type { GameSpecDoc } from './game-spec-doc.js';
import type { GameSpecSourceMap } from './source-map.js';
import { capDiagnostics, dedupeDiagnostics, sortDiagnosticsDeterministic } from './compiler-diagnostics.js';
import { expandEffectMacros } from './expand-effect-macros.js';
import {
  lowerActions,
  lowerConstants,
  lowerEndConditions,
  lowerEffectsWithDiagnostics,
  lowerTokenTypes,
  lowerTriggers,
  lowerTurnStructure,
  lowerVarDefs,
} from './compile-lowering.js';
import { lowerTurnFlow } from './compile-turn-flow.js';
import { lowerOperationProfiles } from './compile-operations.js';
import { lowerCoupPlan, lowerVictory } from './compile-victory.js';
import { deriveSectionsFromDataAssets } from './compile-data-assets.js';
import { expandEffectSections, expandZoneMacros } from './compile-macro-expansion.js';

export interface CompileLimits {
  readonly maxExpandedEffects: number;
  readonly maxGeneratedZones: number;
  readonly maxDiagnosticCount: number;
}

export interface CompileOptions {
  readonly sourceMap?: GameSpecSourceMap;
  readonly limits?: Partial<CompileLimits>;
}

export interface CompileSectionResults {
  readonly metadata: GameDef['metadata'] | null;
  readonly constants: GameDef['constants'] | null;
  readonly globalVars: GameDef['globalVars'] | null;
  readonly perPlayerVars: GameDef['perPlayerVars'] | null;
  readonly zones: GameDef['zones'] | null;
  readonly tokenTypes: GameDef['tokenTypes'] | null;
  readonly setup: GameDef['setup'] | null;
  readonly turnStructure: GameDef['turnStructure'] | null;
  readonly turnFlow: Exclude<GameDef['turnFlow'], undefined> | null;
  readonly operationProfiles: Exclude<GameDef['operationProfiles'], undefined> | null;
  readonly coupPlan: Exclude<GameDef['coupPlan'], undefined> | null;
  readonly victory: Exclude<GameDef['victory'], undefined> | null;
  readonly actions: GameDef['actions'] | null;
  readonly triggers: GameDef['triggers'] | null;
  readonly endConditions: GameDef['endConditions'] | null;
  readonly eventCards: Exclude<GameDef['eventCards'], undefined> | null;
}

export interface CompileResult {
  readonly gameDef: GameDef | null;
  readonly sections: CompileSectionResults;
  readonly diagnostics: readonly Diagnostic[];
}

type MutableCompileSectionResults = {
  -readonly [K in keyof CompileSectionResults]: CompileSectionResults[K];
};

export const DEFAULT_COMPILE_LIMITS: CompileLimits = {
  maxExpandedEffects: 20_000,
  maxGeneratedZones: 10_000,
  maxDiagnosticCount: 500,
};

export function resolveCompileLimits(overrides?: Partial<CompileLimits>): CompileLimits {
  const maxExpandedEffects = resolveLimit(
    overrides?.maxExpandedEffects,
    DEFAULT_COMPILE_LIMITS.maxExpandedEffects,
    'maxExpandedEffects',
  );
  const maxGeneratedZones = resolveLimit(
    overrides?.maxGeneratedZones,
    DEFAULT_COMPILE_LIMITS.maxGeneratedZones,
    'maxGeneratedZones',
  );
  const maxDiagnosticCount = resolveLimit(
    overrides?.maxDiagnosticCount,
    DEFAULT_COMPILE_LIMITS.maxDiagnosticCount,
    'maxDiagnosticCount',
  );

  return {
    maxExpandedEffects,
    maxGeneratedZones,
    maxDiagnosticCount,
  };
}

export function expandMacros(
  doc: GameSpecDoc,
  options?: CompileOptions,
): {
  readonly doc: GameSpecDoc;
  readonly diagnostics: readonly Diagnostic[];
} {
  const limits = resolveCompileLimits(options?.limits);
  const diagnostics: Diagnostic[] = [];

  const zonesExpansion = expandZoneMacros(doc.zones, limits.maxGeneratedZones, diagnostics);
  const effectsExpansion = expandEffectSections(
    {
      setup: doc.setup,
      actions: doc.actions,
      triggers: doc.triggers,
      turnStructure: doc.turnStructure,
      operationProfiles: doc.operationProfiles,
    },
    limits.maxExpandedEffects,
    diagnostics,
  );

  const expandedDoc: GameSpecDoc = {
    ...doc,
    zones: zonesExpansion,
    setup: effectsExpansion.setup,
    actions: effectsExpansion.actions,
    triggers: effectsExpansion.triggers,
    turnStructure: effectsExpansion.turnStructure,
    operationProfiles: effectsExpansion.operationProfiles,
  };

  const finalizedDiagnostics = finalizeDiagnostics(diagnostics, options?.sourceMap, limits.maxDiagnosticCount);

  return {
    doc: expandedDoc,
    diagnostics: finalizedDiagnostics,
  };
}

export function compileGameSpecToGameDef(
  doc: GameSpecDoc,
  options?: CompileOptions,
): CompileResult {
  const limits = resolveCompileLimits(options?.limits);
  const macroExpansion = expandEffectMacros(doc);
  const expanded = expandMacros(macroExpansion.doc, options);
  const diagnostics: Diagnostic[] = [...macroExpansion.diagnostics, ...expanded.diagnostics];
  const compiled = compileExpandedDoc(expanded.doc, diagnostics);

  if (compiled.gameDef !== null) {
    diagnostics.push(...validateGameDef(compiled.gameDef));
  }

  const finalizedDiagnostics = finalizeDiagnostics(diagnostics, options?.sourceMap, limits.maxDiagnosticCount);

  return {
    gameDef: hasErrorDiagnostics(finalizedDiagnostics) ? null : compiled.gameDef,
    sections: compiled.sections,
    diagnostics: finalizedDiagnostics,
  };
}

function compileExpandedDoc(
  doc: GameSpecDoc,
  diagnostics: Diagnostic[],
): {
  readonly gameDef: GameDef | null;
  readonly sections: CompileSectionResults;
} {
  const derivedFromAssets = deriveSectionsFromDataAssets(doc, diagnostics);
  const effectiveZones = doc.zones ?? derivedFromAssets.zones;
  const effectiveTokenTypes = doc.tokenTypes ?? derivedFromAssets.tokenTypes;
  const sections: MutableCompileSectionResults = {
    metadata: null,
    constants: null,
    globalVars: null,
    perPlayerVars: null,
    zones: null,
    tokenTypes: null,
    setup: null,
    turnStructure: null,
    turnFlow: null,
    operationProfiles: null,
    coupPlan: null,
    victory: null,
    actions: null,
    triggers: null,
    endConditions: null,
    eventCards: null,
  };

  const metadata = doc.metadata;
  if (metadata === null) {
    diagnostics.push(requiredSectionDiagnostic('doc.metadata', 'metadata'));
  } else {
    sections.metadata = metadata;
  }

  const constants = compileSection(diagnostics, () => lowerConstants(doc.constants, diagnostics));
  sections.constants = constants.failed ? null : constants.value;

  const globalVars = compileSection(diagnostics, () => lowerVarDefs(doc.globalVars, diagnostics, 'doc.globalVars'));
  sections.globalVars = globalVars.failed ? null : globalVars.value;

  const perPlayerVars = compileSection(diagnostics, () => lowerVarDefs(doc.perPlayerVars, diagnostics, 'doc.perPlayerVars'));
  sections.perPlayerVars = perPlayerVars.failed ? null : perPlayerVars.value;

  let ownershipByBase: Readonly<Record<string, 'none' | 'player' | 'mixed'>> = {};
  let zones: GameDef['zones'] | null = null;
  if (effectiveZones === null) {
    if (doc.zones === null && derivedFromAssets.derivationFailures.map) {
      diagnostics.push(dataAssetCascadeZonesDiagnostic());
    } else {
      diagnostics.push(requiredSectionDiagnostic('doc.zones', 'zones'));
    }
  } else {
    const zoneCompilation = compileSection(diagnostics, () => {
      const materialized = materializeZoneDefs(effectiveZones, metadata?.players.max ?? 0);
      diagnostics.push(...materialized.diagnostics);
      ownershipByBase = materialized.value.ownershipByBase;
      return materialized.value.zones;
    });
    zones = zoneCompilation.value;
    sections.zones = zoneCompilation.failed ? null : zoneCompilation.value;
  }

  let tokenTypes: {
    readonly value: GameDef['tokenTypes'];
    readonly failed: boolean;
  };
  if (effectiveTokenTypes === null && doc.tokenTypes === null && derivedFromAssets.derivationFailures.pieceCatalog) {
    diagnostics.push(dataAssetCascadeTokenTypesDiagnostic());
    tokenTypes = {
      value: [],
      failed: true,
    };
    sections.tokenTypes = null;
  } else {
    tokenTypes = compileSection(diagnostics, () => lowerTokenTypes(effectiveTokenTypes, diagnostics));
    sections.tokenTypes = tokenTypes.failed ? null : tokenTypes.value;
  }

  const setup = compileSection(diagnostics, () =>
    lowerEffectsWithDiagnostics(doc.setup ?? [], ownershipByBase, diagnostics, 'doc.setup'),
  );
  sections.setup = setup.failed ? null : setup.value;

  let turnStructure: GameDef['turnStructure'] | null = null;
  const rawTurnStructure = doc.turnStructure;
  if (rawTurnStructure === null) {
    diagnostics.push(requiredSectionDiagnostic('doc.turnStructure', 'turnStructure'));
  } else {
    const turnStructureSection = compileSection(diagnostics, () =>
      lowerTurnStructure(rawTurnStructure, ownershipByBase, diagnostics),
    );
    turnStructure = turnStructureSection.value;
    sections.turnStructure = turnStructureSection.failed ? null : turnStructureSection.value;
  }

  if (doc.turnFlow !== null) {
    const turnFlow = compileSection(diagnostics, () => lowerTurnFlow(doc.turnFlow, diagnostics));
    sections.turnFlow = turnFlow.failed || turnFlow.value === undefined ? null : turnFlow.value;
  }

  if (doc.operationProfiles !== null) {
    const operationProfiles = compileSection(diagnostics, () =>
      lowerOperationProfiles(doc.operationProfiles, doc.actions, ownershipByBase, diagnostics),
    );
    sections.operationProfiles =
      operationProfiles.failed || operationProfiles.value === undefined ? null : operationProfiles.value;
  }

  if (doc.coupPlan !== null) {
    const coupPlan = compileSection(diagnostics, () => lowerCoupPlan(doc.coupPlan, diagnostics));
    sections.coupPlan = coupPlan.failed || coupPlan.value === undefined ? null : coupPlan.value;
  }

  if (doc.victory !== null) {
    const victory = compileSection(diagnostics, () => lowerVictory(doc.victory, diagnostics));
    sections.victory = victory.failed || victory.value === undefined ? null : victory.value;
  }

  let actions: GameDef['actions'] | null = null;
  const rawActions = doc.actions;
  if (rawActions === null) {
    diagnostics.push(requiredSectionDiagnostic('doc.actions', 'actions'));
  } else {
    const actionsSection = compileSection(diagnostics, () => lowerActions(rawActions, ownershipByBase, diagnostics));
    actions = actionsSection.value;
    sections.actions = actionsSection.failed ? null : actionsSection.value;
  }

  const triggers = compileSection(diagnostics, () => lowerTriggers(doc.triggers ?? [], ownershipByBase, diagnostics));
  sections.triggers = triggers.failed ? null : triggers.value;

  let endConditions: GameDef['endConditions'] | null = null;
  const rawEndConditions = doc.endConditions;
  if (rawEndConditions === null) {
    diagnostics.push(requiredSectionDiagnostic('doc.endConditions', 'endConditions'));
  } else {
    const endConditionsSection = compileSection(diagnostics, () =>
      lowerEndConditions(rawEndConditions, ownershipByBase, diagnostics),
    );
    endConditions = endConditionsSection.value;
    sections.endConditions = endConditionsSection.failed ? null : endConditionsSection.value;
  }

  sections.eventCards = derivedFromAssets.eventCards ?? null;

  if (metadata === null || zones === null || turnStructure === null || actions === null || endConditions === null) {
    return { gameDef: null, sections };
  }

  const gameDef: GameDef = {
    metadata,
    constants: constants.value,
    globalVars: globalVars.value,
    perPlayerVars: perPlayerVars.value,
    zones,
    tokenTypes: tokenTypes.value,
    setup: setup.value,
    turnStructure,
    ...(sections.turnFlow === null ? {} : { turnFlow: sections.turnFlow }),
    ...(sections.operationProfiles === null ? {} : { operationProfiles: sections.operationProfiles }),
    ...(sections.coupPlan === null ? {} : { coupPlan: sections.coupPlan }),
    ...(sections.victory === null ? {} : { victory: sections.victory }),
    actions,
    triggers: triggers.value,
    endConditions,
    ...(sections.eventCards === null ? {} : { eventCards: sections.eventCards }),
  };

  return { gameDef, sections };
}

function compileSection<T>(
  diagnostics: Diagnostic[],
  compile: () => T,
): {
  readonly value: T;
  readonly failed: boolean;
} {
  const beforeErrorCount = countErrorDiagnostics(diagnostics);
  const value = compile();
  return {
    value,
    failed: countErrorDiagnostics(diagnostics) > beforeErrorCount,
  };
}

function finalizeDiagnostics(
  diagnostics: readonly Diagnostic[],
  sourceMap: GameSpecSourceMap | undefined,
  maxDiagnosticCount: number,
): readonly Diagnostic[] {
  const sorted = sortDiagnosticsDeterministic(diagnostics, sourceMap);
  const deduped = dedupeDiagnostics(sorted);
  return capDiagnostics(deduped, maxDiagnosticCount);
}

function requiredSectionDiagnostic(path: string, section: string): Diagnostic {
  return {
    code: 'CNL_COMPILER_REQUIRED_SECTION_MISSING',
    path,
    severity: 'error',
    message: `Required section "${section}" is missing.`,
    suggestion: `Provide doc.${section} before compilation.`,
  };
}

function dataAssetCascadeZonesDiagnostic(): Diagnostic {
  return {
    code: 'CNL_DATA_ASSET_CASCADE_ZONES_MISSING',
    path: 'doc.dataAssets',
    severity: 'warning',
    message: 'Map data asset derivation failed and no explicit zones were provided; zones section is unavailable.',
    suggestion: 'Fix the map data asset diagnostics or provide doc.zones explicitly in YAML.',
  };
}

function dataAssetCascadeTokenTypesDiagnostic(): Diagnostic {
  return {
    code: 'CNL_DATA_ASSET_CASCADE_TOKEN_TYPES_MISSING',
    path: 'doc.dataAssets',
    severity: 'warning',
    message: 'Piece catalog data asset derivation failed and no explicit tokenTypes were provided; tokenTypes section is unavailable.',
    suggestion: 'Fix the pieceCatalog data asset diagnostics or provide doc.tokenTypes explicitly in YAML.',
  };
}

function hasErrorDiagnostics(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === 'error');
}

function countErrorDiagnostics(diagnostics: readonly Diagnostic[]): number {
  return diagnostics.reduce((count, diagnostic) => count + (diagnostic.severity === 'error' ? 1 : 0), 0);
}

function resolveLimit(candidate: number | undefined, fallback: number, name: keyof CompileLimits): number {
  if (candidate === undefined) {
    return fallback;
  }
  if (!Number.isInteger(candidate) || candidate < 0) {
    throw new Error(`${name} must be an integer >= 0.`);
  }
  return candidate;
}
