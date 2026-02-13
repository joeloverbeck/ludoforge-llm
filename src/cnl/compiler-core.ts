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
): {
  readonly gameDef: GameDef | null;
  readonly diagnostics: readonly Diagnostic[];
} {
  const limits = resolveCompileLimits(options?.limits);
  const macroExpansion = expandEffectMacros(doc);
  const expanded = expandMacros(macroExpansion.doc, options);
  const diagnostics: Diagnostic[] = [...macroExpansion.diagnostics, ...expanded.diagnostics];
  const gameDef = compileExpandedDoc(expanded.doc, diagnostics);

  if (gameDef !== null) {
    diagnostics.push(...validateGameDef(gameDef));
  }

  const finalizedDiagnostics = finalizeDiagnostics(diagnostics, options?.sourceMap, limits.maxDiagnosticCount);

  return {
    gameDef: hasErrorDiagnostics(finalizedDiagnostics) ? null : gameDef,
    diagnostics: finalizedDiagnostics,
  };
}

function compileExpandedDoc(doc: GameSpecDoc, diagnostics: Diagnostic[]): GameDef | null {
  const derivedFromAssets = deriveSectionsFromDataAssets(doc, diagnostics);
  const effectiveZones = doc.zones ?? derivedFromAssets.zones;
  const effectiveTokenTypes = doc.tokenTypes ?? derivedFromAssets.tokenTypes;

  if (doc.metadata === null) {
    diagnostics.push(requiredSectionDiagnostic('doc.metadata', 'metadata'));
    return null;
  }
  if (effectiveZones === null) {
    diagnostics.push(requiredSectionDiagnostic('doc.zones', 'zones'));
    return null;
  }
  if (doc.turnStructure === null) {
    diagnostics.push(requiredSectionDiagnostic('doc.turnStructure', 'turnStructure'));
    return null;
  }
  if (doc.actions === null) {
    diagnostics.push(requiredSectionDiagnostic('doc.actions', 'actions'));
    return null;
  }
  if (doc.endConditions === null) {
    diagnostics.push(requiredSectionDiagnostic('doc.endConditions', 'endConditions'));
    return null;
  }

  const zoneCompilation = materializeZoneDefs(effectiveZones, doc.metadata.players.max);
  diagnostics.push(...zoneCompilation.diagnostics);
  const ownershipByBase = zoneCompilation.value.ownershipByBase;

  const setup = lowerEffectsWithDiagnostics(doc.setup ?? [], ownershipByBase, diagnostics, 'doc.setup');
  const turnStructure = lowerTurnStructure(doc.turnStructure, ownershipByBase, diagnostics);
  const turnFlow = lowerTurnFlow(doc.turnFlow, diagnostics);
  const operationProfiles = lowerOperationProfiles(doc.operationProfiles, doc.actions, ownershipByBase, diagnostics);
  const coupPlan = lowerCoupPlan(doc.coupPlan, diagnostics);
  const victory = lowerVictory(doc.victory, diagnostics);
  const actions = lowerActions(doc.actions, ownershipByBase, diagnostics);
  const triggers = lowerTriggers(doc.triggers ?? [], ownershipByBase, diagnostics);
  const endConditions = lowerEndConditions(doc.endConditions, ownershipByBase, diagnostics);

  return {
    metadata: doc.metadata,
    constants: lowerConstants(doc.constants, diagnostics),
    globalVars: lowerVarDefs(doc.globalVars, diagnostics, 'doc.globalVars'),
    perPlayerVars: lowerVarDefs(doc.perPlayerVars, diagnostics, 'doc.perPlayerVars'),
    zones: zoneCompilation.value.zones,
    tokenTypes: lowerTokenTypes(effectiveTokenTypes, diagnostics),
    setup,
    turnStructure,
    ...(turnFlow === undefined ? {} : { turnFlow }),
    ...(operationProfiles === undefined ? {} : { operationProfiles }),
    ...(coupPlan === undefined ? {} : { coupPlan }),
    ...(victory === undefined ? {} : { victory }),
    actions,
    triggers,
    endConditions,
    ...(derivedFromAssets.eventCards === undefined ? {} : { eventCards: derivedFromAssets.eventCards }),
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

function hasErrorDiagnostics(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === 'error');
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
