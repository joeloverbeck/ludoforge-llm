import type { Diagnostic } from '../kernel/diagnostics.js';
import type { GameDef, NumericTrackDef, RuntimeTableContract, TokenTypeDef, VariableDef } from '../kernel/types.js';
import type { TypeInferenceContext } from './type-inference.js';
import { asActionId } from '../kernel/branded.js';
import { ACTION_CAPABILITY_CARD_EVENT, isCardEventAction } from '../kernel/action-capabilities.js';
import { validateGameDefBoundary, type ValidatedGameDef } from '../kernel/validate-gamedef.js';
import { materializeZoneDefs } from './compile-zones.js';
import type { GameSpecDoc } from './game-spec-doc.js';
import type { GameSpecSourceMap } from './source-map.js';
import { annotateDiagnosticWithSourceSpans, capDiagnostics, dedupeDiagnostics, sortDiagnosticsDeterministic } from './compiler-diagnostics.js';
import { expandEffectMacros } from './expand-effect-macros.js';
import { expandConditionMacros } from './expand-condition-macros.js';
import {
  lowerActions,
  lowerConstants,
  lowerDerivedMetrics,
  lowerEndConditions,
  lowerEffectsWithDiagnostics,
  lowerGlobalMarkerLattices,
  lowerScoring,
  lowerTokenTypes,
  lowerTriggers,
  lowerTurnStructure,
  lowerVarDefs,
} from './compile-lowering.js';
import { lowerTurnOrder } from './compile-turn-flow.js';
import { lowerActionPipelines } from './compile-operations.js';
import { lowerVictory } from './compile-victory.js';
import { deriveSectionsFromDataAssets } from './compile-data-assets.js';
import { expandEffectSections, expandZoneMacros } from './compile-macro-expansion.js';
import { crossValidateSpec } from './cross-validate.js';
import { lowerEventDecks } from './compile-event-cards.js';
import { resolveScenarioTableRefsInDoc } from './resolve-scenario-table-refs.js';

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
  readonly globalMarkerLattices: Exclude<GameDef['globalMarkerLattices'], undefined> | null;
  readonly perPlayerVars: GameDef['perPlayerVars'] | null;
  readonly zones: GameDef['zones'] | null;
  readonly tokenTypes: GameDef['tokenTypes'] | null;
  readonly setup: GameDef['setup'] | null;
  readonly turnStructure: GameDef['turnStructure'] | null;
  readonly turnOrder: Exclude<GameDef['turnOrder'], undefined> | null;
  readonly actionPipelines: Exclude<GameDef['actionPipelines'], undefined> | null;
  readonly derivedMetrics: Exclude<GameDef['derivedMetrics'], undefined> | null;
  readonly terminal: GameDef['terminal'] | null;
  readonly actions: GameDef['actions'] | null;
  readonly triggers: GameDef['triggers'] | null;
  readonly eventDecks: Exclude<GameDef['eventDecks'], undefined> | null;
}

export interface CompileResult {
  readonly gameDef: ValidatedGameDef | null;
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
      actionPipelines: doc.actionPipelines,
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
    actionPipelines: effectsExpansion.actionPipelines,
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
  const conditionExpansion = expandConditionMacros(doc);
  const macroExpansion = expandEffectMacros(conditionExpansion.doc);
  const expanded = expandMacros(macroExpansion.doc, options);
  const diagnostics: Diagnostic[] = [...conditionExpansion.diagnostics, ...macroExpansion.diagnostics, ...expanded.diagnostics];
  const compiled = compileExpandedDoc(expanded.doc, diagnostics);
  let validatedGameDef: ValidatedGameDef | null = null;

  if (compiled.gameDef !== null) {
    const validated = validateGameDefBoundary(compiled.gameDef);
    diagnostics.push(...validated.diagnostics);
    validatedGameDef = validated.gameDef;
  }
  const normalizedDiagnostics = canonicalizeCompilerReferenceDiagnostics(diagnostics);

  const finalizedDiagnostics = finalizeDiagnostics(normalizedDiagnostics, options?.sourceMap, limits.maxDiagnosticCount);

  return {
    gameDef: hasErrorDiagnostics(finalizedDiagnostics) ? null : validatedGameDef,
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
  const derivedFromAssets = deriveSectionsFromDataAssets(doc, diagnostics, {
    ...(doc.metadata?.defaultScenarioAssetId === undefined
      ? {}
      : { defaultScenarioAssetId: doc.metadata.defaultScenarioAssetId }),
  });
  const resolvedTableRefDoc = resolveScenarioTableRefsInDoc(doc, {
    ...(derivedFromAssets.selectedScenarioAssetId === undefined
      ? {}
      : { selectedScenarioAssetId: derivedFromAssets.selectedScenarioAssetId }),
    tableContracts: derivedFromAssets.tableContracts,
    diagnostics,
  });
  const effectiveZones = mergeZoneSections(resolvedTableRefDoc.zones, derivedFromAssets.zones);
  const effectiveTokenTypes = resolvedTableRefDoc.tokenTypes ?? derivedFromAssets.tokenTypes;
  const sections: MutableCompileSectionResults = {
    metadata: null,
    constants: null,
    globalVars: null,
    globalMarkerLattices: null,
    perPlayerVars: null,
    zones: null,
    tokenTypes: null,
    setup: null,
    turnStructure: null,
    turnOrder: null,
    actionPipelines: null,
    derivedMetrics: null,
    terminal: null,
    actions: null,
    triggers: null,
    eventDecks: null,
  };

  const metadata = resolvedTableRefDoc.metadata;
  const runtimeMetadata =
    metadata === null
      ? null
      : {
          id: metadata.id,
          players: metadata.players,
          ...(metadata.maxTriggerDepth === undefined ? {} : { maxTriggerDepth: metadata.maxTriggerDepth }),
          ...(metadata.name === undefined ? {} : { name: metadata.name }),
          ...(metadata.description === undefined ? {} : { description: metadata.description }),
        };
  if (metadata === null) {
    diagnostics.push(requiredSectionDiagnostic('doc.metadata', 'metadata'));
  } else {
    sections.metadata = runtimeMetadata;
  }
  const namedSets = metadata?.namedSets;

  const constants = compileSection(diagnostics, () => lowerConstants(resolvedTableRefDoc.constants, diagnostics));
  sections.constants = constants.failed ? null : constants.value;

  const globalVars = compileSection(diagnostics, () => lowerVarDefs(resolvedTableRefDoc.globalVars, diagnostics, 'doc.globalVars'));
  const mergedGlobalVars = mergeTrackGlobalVars(
    globalVars.value,
    derivedFromAssets.tracks,
    derivedFromAssets.scenarioInitialTrackValues,
    diagnostics,
  );
  sections.globalVars = globalVars.failed ? null : mergedGlobalVars;
  const globalMarkerLattices = compileSection(diagnostics, () =>
    lowerGlobalMarkerLattices(resolvedTableRefDoc.globalMarkerLattices, diagnostics),
  );
  sections.globalMarkerLattices = globalMarkerLattices.failed ? null : globalMarkerLattices.value;

  const perPlayerVars = compileSection(diagnostics, () =>
    lowerVarDefs(resolvedTableRefDoc.perPlayerVars, diagnostics, 'doc.perPlayerVars'),
  );
  sections.perPlayerVars = perPlayerVars.failed ? null : perPlayerVars.value;

  let ownershipByBase: Readonly<Record<string, 'none' | 'player' | 'mixed'>> = {};
  let zones: GameDef['zones'] | null = null;
  if (effectiveZones === null) {
    if (resolvedTableRefDoc.zones === null && derivedFromAssets.derivationFailures.map) {
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
  if (effectiveTokenTypes === null && resolvedTableRefDoc.tokenTypes === null && derivedFromAssets.derivationFailures.pieceCatalog) {
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

  const typeInference = buildTypeInferenceContext(
    globalVars.value,
    perPlayerVars.value,
    tokenTypes.value,
    derivedFromAssets.tableContracts,
  );

  const setup = compileSection(diagnostics, () =>
    lowerEffectsWithDiagnostics(
      resolvedTableRefDoc.setup ?? [],
      ownershipByBase,
      diagnostics,
      'doc.setup',
      [],
      derivedFromAssets.tokenTraitVocabulary ?? undefined,
      namedSets,
      typeInference,
    ),
  );
  const mergedSetup = [...derivedFromAssets.scenarioSetupEffects, ...setup.value];
  sections.setup = setup.failed ? null : mergedSetup;

  let turnStructure: GameDef['turnStructure'] | null = null;
  const rawTurnStructure = resolvedTableRefDoc.turnStructure;
  if (rawTurnStructure === null) {
    diagnostics.push(requiredSectionDiagnostic('doc.turnStructure', 'turnStructure'));
  } else {
    const turnStructureSection = compileSection(diagnostics, () =>
      lowerTurnStructure(
        rawTurnStructure,
        ownershipByBase,
        diagnostics,
        derivedFromAssets.tokenTraitVocabulary ?? undefined,
        namedSets,
        typeInference,
      ),
    );
    turnStructure = turnStructureSection.value;
    sections.turnStructure = turnStructureSection.failed ? null : turnStructureSection.value;
  }

  if (resolvedTableRefDoc.turnOrder !== null) {
    const turnOrder = compileSection(diagnostics, () => lowerTurnOrder(resolvedTableRefDoc.turnOrder, diagnostics));
    sections.turnOrder = turnOrder.failed || turnOrder.value === undefined ? null : turnOrder.value;
  }

  if (resolvedTableRefDoc.actionPipelines !== null) {
    const actionPipelines = compileSection(diagnostics, () =>
      lowerActionPipelines(
        resolvedTableRefDoc.actionPipelines,
        resolvedTableRefDoc.actions,
        ownershipByBase,
        diagnostics,
        derivedFromAssets.tokenTraitVocabulary ?? undefined,
        namedSets,
        typeInference,
      ),
    );
    sections.actionPipelines =
      actionPipelines.failed || actionPipelines.value === undefined ? null : actionPipelines.value;
  }

  if (resolvedTableRefDoc.derivedMetrics !== null) {
    const derivedMetrics = compileSection(diagnostics, () =>
      lowerDerivedMetrics(resolvedTableRefDoc.derivedMetrics, diagnostics),
    );
    sections.derivedMetrics = derivedMetrics.failed ? null : derivedMetrics.value;
  }

  let actions: GameDef['actions'] | null = null;
  const rawActions = resolvedTableRefDoc.actions;
  if (rawActions === null) {
    diagnostics.push(requiredSectionDiagnostic('doc.actions', 'actions'));
  } else {
    const actionsSection = compileSection(diagnostics, () =>
      lowerActions(
        rawActions,
        ownershipByBase,
        diagnostics,
        derivedFromAssets.tokenTraitVocabulary ?? undefined,
        namedSets,
        typeInference,
      ),
    );
    actions = actionsSection.value;
    sections.actions = actionsSection.failed ? null : actionsSection.value;
  }

  const triggers = compileSection(diagnostics, () =>
    lowerTriggers(
      resolvedTableRefDoc.triggers ?? [],
      ownershipByBase,
      diagnostics,
      derivedFromAssets.tokenTraitVocabulary ?? undefined,
      namedSets,
      typeInference,
    ),
  );
  sections.triggers = triggers.failed ? null : triggers.value;

  let terminal: GameDef['terminal'] | null = null;
  const rawTerminal = resolvedTableRefDoc.terminal;
  if (rawTerminal === null) {
    diagnostics.push(requiredSectionDiagnostic('doc.terminal', 'terminal'));
  } else {
    const endConditionsSection = compileSection(diagnostics, () =>
      lowerEndConditions(
        rawTerminal.conditions,
        ownershipByBase,
        diagnostics,
        derivedFromAssets.tokenTraitVocabulary ?? undefined,
        namedSets,
        typeInference,
      ),
    );
    const victorySection = compileSection(diagnostics, () => lowerVictory(rawTerminal, diagnostics));
    const scoringSection = compileSection(diagnostics, () => lowerScoring(rawTerminal.scoring ?? null, diagnostics));

    terminal = {
      conditions: endConditionsSection.value,
      ...(victorySection.value === undefined ? {} : victorySection.value),
      ...(scoringSection.value === undefined ? {} : { scoring: scoringSection.value }),
    };
    sections.terminal = endConditionsSection.failed || victorySection.failed || scoringSection.failed ? null : terminal;
  }

  const rawEventDecks = resolvedTableRefDoc.eventDecks;
  if (rawEventDecks !== null) {
    const eventDecks = compileSection(diagnostics, () =>
      lowerEventDecks(
        rawEventDecks,
        ownershipByBase,
        diagnostics,
        'doc.eventDecks',
        derivedFromAssets.tokenTraitVocabulary ?? undefined,
        namedSets,
      ),
    );
    sections.eventDecks = eventDecks.failed ? null : eventDecks.value;
  }

  if (actions !== null) {
    const withEventAction = synthesizeCardDrivenEventAction(
      actions,
      turnStructure,
      sections.eventDecks,
      diagnostics,
    );
    actions = withEventAction;
    sections.actions = sections.actions === null ? null : withEventAction;
  }
  // Policy contract: partial-compile is dependency-aware best-effort.
  // Cross-validation always executes, but each rule gates on prerequisite
  // section availability (null sections suppress dependent xref diagnostics).
  diagnostics.push(...crossValidateSpec(sections));

  if (runtimeMetadata === null || zones === null || turnStructure === null || actions === null || terminal === null) {
    return { gameDef: null, sections };
  }

  const gameDef: GameDef = {
    metadata: runtimeMetadata,
    constants: constants.value,
    globalVars: mergedGlobalVars,
    perPlayerVars: perPlayerVars.value,
    zones,
    ...(derivedFromAssets.seats === null ? {} : { seats: derivedFromAssets.seats }),
    ...(derivedFromAssets.tracks === null ? {} : { tracks: derivedFromAssets.tracks }),
    ...(derivedFromAssets.markerLattices === null ? {} : { markerLattices: derivedFromAssets.markerLattices }),
    ...(derivedFromAssets.spaceMarkers === null ? {} : { spaceMarkers: derivedFromAssets.spaceMarkers }),
    ...(derivedFromAssets.stackingConstraints === null
      ? {}
      : { stackingConstraints: derivedFromAssets.stackingConstraints }),
    ...(sections.globalMarkerLattices === null ? {} : { globalMarkerLattices: sections.globalMarkerLattices }),
    ...(derivedFromAssets.runtimeDataAssets.length === 0 ? {} : { runtimeDataAssets: derivedFromAssets.runtimeDataAssets }),
    ...(derivedFromAssets.tableContracts.length === 0 ? {} : { tableContracts: derivedFromAssets.tableContracts }),
    tokenTypes: tokenTypes.value,
    setup: mergedSetup,
    turnStructure,
    ...(sections.turnOrder === null ? {} : { turnOrder: sections.turnOrder }),
    ...(sections.actionPipelines === null ? {} : { actionPipelines: sections.actionPipelines }),
    ...(sections.derivedMetrics === null ? {} : { derivedMetrics: sections.derivedMetrics }),
    actions,
    triggers: triggers.value,
    terminal,
    ...(sections.eventDecks === null ? {} : { eventDecks: sections.eventDecks }),
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
  const sourceAnnotated = sourceMap === undefined
    ? diagnostics
    : diagnostics.map((diagnostic) => annotateDiagnosticWithSourceSpans(diagnostic, sourceMap));
  const sorted = sortDiagnosticsDeterministic(sourceAnnotated, sourceMap);
  const deduped = dedupeDiagnostics(sorted);
  return capDiagnostics(deduped, maxDiagnosticCount);
}

function canonicalizeCompilerReferenceDiagnostics(diagnostics: readonly Diagnostic[]): readonly Diagnostic[] {
  const crossRefPaths = new Set(
    diagnostics
      .filter((diagnostic) => diagnostic.code.startsWith('CNL_XREF_'))
      .map((diagnostic) => normalizeDiagnosticPath(diagnostic.path)),
  );

  const canonicalized: Diagnostic[] = [];
  for (const diagnostic of diagnostics) {
    if (!diagnostic.code.startsWith('REF_')) {
      canonicalized.push(diagnostic);
      continue;
    }

    const normalizedPath = normalizeDiagnosticPath(diagnostic.path);
    if (crossRefPaths.has(normalizedPath)) {
      continue;
    }

    canonicalized.push({
      ...diagnostic,
      code: `CNL_XREF_${diagnostic.code.slice('REF_'.length)}`,
      path: normalizedPath,
    });
  }
  return canonicalized;
}

function normalizeDiagnosticPath(path: string): string {
  const withDots = path.replace(/\[(\d+)\]/g, '.$1');
  return withDots.startsWith('doc.') ? withDots : `doc.${withDots}`;
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

function mergeZoneSections(
  explicitZones: GameSpecDoc['zones'],
  derivedZones: GameSpecDoc['zones'],
): GameSpecDoc['zones'] {
  if (explicitZones === null) {
    return derivedZones;
  }
  if (derivedZones === null) {
    return explicitZones;
  }
  return [...derivedZones, ...explicitZones];
}

function mergeTrackGlobalVars(
  explicitGlobalVars: GameDef['globalVars'],
  tracks: readonly NumericTrackDef[] | null,
  scenarioInitialTrackValues: ReadonlyArray<{ readonly trackId: string; readonly value: number }> | null,
  diagnostics: Diagnostic[],
): GameDef['globalVars'] {
  if (tracks === null || tracks.length === 0) {
    return explicitGlobalVars;
  }

  const explicitByName = new Map(explicitGlobalVars.map((globalVar) => [globalVar.name, globalVar]));
  const trackById = new Map(tracks.map((track) => [track.id, track]));
  const trackNames = new Set(tracks.map((track) => track.id));
  const nonTrackGlobalVars = explicitGlobalVars.filter((globalVar) => !trackNames.has(globalVar.name));
  const trackInitOverrides = new Map<string, number>();

  if (scenarioInitialTrackValues !== null) {
    for (const [index, entry] of scenarioInitialTrackValues.entries()) {
      const track = trackById.get(entry.trackId);
      if (track === undefined) {
        diagnostics.push({
          code: 'CNL_TRACK_SCENARIO_INIT_UNKNOWN',
          path: `doc.dataAssets.scenario.initialTrackValues.${index}.trackId`,
          severity: 'error',
          message: `Scenario initialTrackValues references unknown track "${entry.trackId}".`,
          suggestion: 'Declare the track in the selected map payload.tracks array.',
        });
        continue;
      }
      if (entry.value < track.min || entry.value > track.max) {
        diagnostics.push({
          code: 'CNL_TRACK_SCENARIO_INIT_OUT_OF_BOUNDS',
          path: `doc.dataAssets.scenario.initialTrackValues.${index}.value`,
          severity: 'error',
          message: `Scenario initial value ${entry.value} for track "${entry.trackId}" is outside [${track.min}, ${track.max}].`,
          suggestion: 'Use a scenario initial value within declared track bounds.',
        });
        continue;
      }
      trackInitOverrides.set(entry.trackId, entry.value);
    }
  }

  const projectedTrackGlobalVars: GameDef['globalVars'] = tracks.map((track) => {
    const existing = explicitByName.get(track.id);
    if (existing !== undefined) {
      diagnostics.push({
        code: 'CNL_TRACK_GLOBAL_VAR_DUPLICATE',
        path: 'doc.globalVars',
        severity: 'error',
        message: `Global var "${track.id}" duplicates map track "${track.id}".`,
        suggestion: 'Remove track declarations from doc.globalVars and keep map payload.tracks as the only source.',
      });
    }

    return {
      name: track.id,
      type: 'int' as const,
      init: trackInitOverrides.get(track.id) ?? track.initial,
      min: track.min,
      max: track.max,
    };
  });

  return [...nonTrackGlobalVars, ...projectedTrackGlobalVars];
}

function synthesizeCardDrivenEventAction(
  actions: GameDef['actions'],
  turnStructure: GameDef['turnStructure'] | null,
  eventDecks: Exclude<GameDef['eventDecks'], undefined> | null,
  diagnostics: Diagnostic[],
): GameDef['actions'] {
  if (
    eventDecks === null ||
    eventDecks.length === 0 ||
    turnStructure === null ||
    turnStructure.phases.length === 0
  ) {
    return actions;
  }

  const eventCapableActions = actions.filter((action) => isCardEventAction(action));
  if (eventCapableActions.length > 1) {
    diagnostics.push({
      code: 'CNL_COMPILER_EVENT_ACTION_CAPABILITY_AMBIGUOUS',
      path: 'doc.actions',
      severity: 'error',
      message: `Multiple actions declare "${ACTION_CAPABILITY_CARD_EVENT}" capability.`,
      suggestion: 'Declare exactly one event-capable action when eventDecks are present.',
    });
    return actions;
  }
  if (eventCapableActions.length === 1) {
    return actions;
  }

  const existingActionIds = new Set(actions.map((action) => String(action.id)));
  const eventActionId = chooseSyntheticActionId(existingActionIds, 'event');

  return [
    ...actions,
    {
      id: asActionId(eventActionId),
      actor: 'active',
      executor: 'actor',
      phase: [turnStructure.phases[0]!.id],
      capabilities: [ACTION_CAPABILITY_CARD_EVENT],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    },
  ];
}

function chooseSyntheticActionId(existingActionIds: ReadonlySet<string>, baseId: string): string {
  if (!existingActionIds.has(baseId)) {
    return baseId;
  }

  let suffix = 2;
  let candidate = `${baseId}_${suffix}`;
  while (existingActionIds.has(candidate)) {
    suffix += 1;
    candidate = `${baseId}_${suffix}`;
  }
  return candidate;
}

function buildTypeInferenceContext(
  globalVars: readonly VariableDef[],
  perPlayerVars: readonly VariableDef[],
  tokenTypeDefs: readonly TokenTypeDef[],
  tableContracts: readonly RuntimeTableContract[],
): TypeInferenceContext {
  const globalVarTypes: Record<string, 'int' | 'boolean'> = {};
  for (const v of globalVars) {
    globalVarTypes[v.name] = v.type;
  }
  const perPlayerVarTypes: Record<string, 'int' | 'boolean'> = {};
  for (const v of perPlayerVars) {
    perPlayerVarTypes[v.name] = v.type;
  }
  const tokenPropTypes: Record<string, Record<string, 'int' | 'string' | 'boolean'>> = {};
  for (const tt of tokenTypeDefs) {
    tokenPropTypes[tt.id] = { ...tt.props };
  }
  const tableFieldTypes: Record<string, Record<string, 'string' | 'int' | 'boolean'>> = {};
  for (const tc of tableContracts) {
    const fields: Record<string, 'string' | 'int' | 'boolean'> = {};
    for (const f of tc.fields) {
      fields[f.field] = f.type;
    }
    tableFieldTypes[tc.id] = fields;
  }
  return { globalVarTypes, perPlayerVarTypes, tokenPropTypes, tableFieldTypes };
}
