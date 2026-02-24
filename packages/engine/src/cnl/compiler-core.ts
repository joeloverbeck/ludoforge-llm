import type { Diagnostic } from '../kernel/diagnostics.js';
import type { EffectAST, EventDeckDef, GameDef, NumericTrackDef, RuntimeTableContract, TokenTypeDef, VariableDef, ZoneDef } from '../kernel/types.js';
import type { TypeInferenceContext } from './type-inference.js';
import { asActionId, asZoneId } from '../kernel/branded.js';
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

const SCENARIO_DECK_SYNTHETIC_CARD_TOKEN_TYPE_ID = '__eventCard';
const SCENARIO_DECK_PILE_COUP_MIX_STRATEGY_ID = 'pile-coup-mix-v1';

type ScenarioDeckSelection = {
  readonly path: string;
  readonly entityId: string;
  readonly eventDeckAssetId?: string;
  readonly deckComposition: {
    readonly materializationStrategy: string;
    readonly pileCount: number;
    readonly eventsPerPile: number;
    readonly coupsPerPile: number;
    readonly includedCardIds?: readonly string[];
    readonly excludedCardIds?: readonly string[];
    readonly includedCardTags?: readonly string[];
    readonly excludedCardTags?: readonly string[];
  };
};

type ScenarioDeckMaterializationResult = {
  readonly effects: readonly EffectAST[];
  readonly syntheticZones: readonly ZoneDef[];
};

type ScenarioDeckMaterializationStrategy = (options: {
  readonly scenarioDeck: ScenarioDeckSelection;
  readonly deckBasePath: string;
  readonly eventDeck: EventDeckDef;
  readonly cardTokenTypeId: string;
  readonly existingZoneIds: Set<string>;
  readonly candidateCards: readonly EventDeckDef['cards'][number][];
  readonly diagnostics: Diagnostic[];
}) => ScenarioDeckMaterializationResult;

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

  const scenarioDeckTokenType = compileSection(diagnostics, () =>
    ensureScenarioDeckCardTokenType(tokenTypes.value, derivedFromAssets.selectedScenarioDeckComposition),
  );
  tokenTypes = {
    value: scenarioDeckTokenType.value.tokenTypes,
    failed: tokenTypes.failed || scenarioDeckTokenType.failed,
  };
  if (sections.tokenTypes !== null) {
    sections.tokenTypes = tokenTypes.value;
  }

  const scenarioDeckSetup = compileSection(diagnostics, () =>
    buildScenarioDeckSetupEffects({
      selectedScenarioDeckComposition: derivedFromAssets.selectedScenarioDeckComposition,
      eventDecks: sections.eventDecks,
      existingZones: zones,
      cardTokenTypeId: scenarioDeckTokenType.value.cardTokenTypeId,
      diagnostics,
    }),
  );
  const materializedZones =
    zones === null || scenarioDeckSetup.failed
      ? zones
      : [...zones, ...scenarioDeckSetup.value.syntheticZones];
  if (materializedZones !== null) {
    zones = materializedZones;
  }
  if (sections.zones !== null) {
    sections.zones = materializedZones;
  }
  const mergedSetup = [...derivedFromAssets.scenarioSetupEffects, ...scenarioDeckSetup.value.effects, ...setup.value];
  sections.setup = setup.failed || scenarioDeckSetup.failed ? null : mergedSetup;

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

function ensureScenarioDeckCardTokenType(
  tokenTypes: GameDef['tokenTypes'],
  selectedScenarioDeckComposition: ScenarioDeckSelection | undefined,
): { readonly tokenTypes: GameDef['tokenTypes']; readonly cardTokenTypeId: string } {
  if (selectedScenarioDeckComposition === undefined) {
    return { tokenTypes, cardTokenTypeId: SCENARIO_DECK_SYNTHETIC_CARD_TOKEN_TYPE_ID };
  }

  const existingCardTokenType = tokenTypes.find(
    (tokenType) => tokenType.props.isCoup === 'boolean' && tokenType.props.cardId === 'string',
  );
  if (existingCardTokenType !== undefined) {
    return { tokenTypes, cardTokenTypeId: existingCardTokenType.id };
  }

  const existingTypeIds = new Set(tokenTypes.map((tokenType) => tokenType.id));
  let cardTokenTypeId = SCENARIO_DECK_SYNTHETIC_CARD_TOKEN_TYPE_ID;
  let suffix = 2;
  while (existingTypeIds.has(cardTokenTypeId)) {
    cardTokenTypeId = `${SCENARIO_DECK_SYNTHETIC_CARD_TOKEN_TYPE_ID}_${suffix}`;
    suffix += 1;
  }

  return {
    tokenTypes: [
      ...tokenTypes,
      {
        id: cardTokenTypeId,
        props: {
          cardId: 'string',
          eventDeckId: 'string',
          isCoup: 'boolean',
        },
      },
    ],
    cardTokenTypeId,
  };
}

const SCENARIO_DECK_MATERIALIZATION_STRATEGIES: Readonly<Record<string, ScenarioDeckMaterializationStrategy>> = {
  [SCENARIO_DECK_PILE_COUP_MIX_STRATEGY_ID]: materializePileCoupMixDeck,
};

function buildScenarioDeckSetupEffects(options: {
  readonly selectedScenarioDeckComposition: ScenarioDeckSelection | undefined;
  readonly eventDecks: Exclude<GameDef['eventDecks'], undefined> | null;
  readonly existingZones: GameDef['zones'] | null;
  readonly cardTokenTypeId: string;
  readonly diagnostics: Diagnostic[];
}): {
  readonly effects: readonly EffectAST[];
  readonly syntheticZones: readonly ZoneDef[];
} {
  const scenarioDeck = options.selectedScenarioDeckComposition;
  if (scenarioDeck === undefined) {
    return { effects: [], syntheticZones: [] };
  }

  const { deckComposition } = scenarioDeck;
  const deckBasePath = `${scenarioDeck.path}.deckComposition`;
  const eventDeck = resolveScenarioEventDeck({
    eventDeckAssetId: scenarioDeck.eventDeckAssetId,
    eventDecks: options.eventDecks,
    diagnostics: options.diagnostics,
    path: `${scenarioDeck.path}.eventDeckAssetId`,
    deckBasePath,
  });
  if (eventDeck === null) {
    return { effects: [], syntheticZones: [] };
  }

  const includedCardIds = deckComposition.includedCardIds ?? [];
  const excludedCardIds = deckComposition.excludedCardIds ?? [];
  const includedCardTags = deckComposition.includedCardTags ?? [];
  const excludedCardTags = deckComposition.excludedCardTags ?? [];

  const duplicateIncluded = findDuplicateEntries(includedCardIds);
  for (const duplicateId of duplicateIncluded) {
    options.diagnostics.push({
      code: 'CNL_COMPILER_SCENARIO_DECK_COMPOSITION_DUPLICATE_ID',
      path: `${deckBasePath}.includedCardIds`,
      severity: 'error',
      message: `Scenario deckComposition.includedCardIds contains duplicate id "${duplicateId}".`,
      suggestion: 'List each card id at most once.',
    });
  }
  const duplicateExcluded = findDuplicateEntries(excludedCardIds);
  for (const duplicateId of duplicateExcluded) {
    options.diagnostics.push({
      code: 'CNL_COMPILER_SCENARIO_DECK_COMPOSITION_DUPLICATE_ID',
      path: `${deckBasePath}.excludedCardIds`,
      severity: 'error',
      message: `Scenario deckComposition.excludedCardIds contains duplicate id "${duplicateId}".`,
      suggestion: 'List each card id at most once.',
    });
  }
  const duplicateIncludedTags = findDuplicateEntries(includedCardTags);
  for (const duplicateTag of duplicateIncludedTags) {
    options.diagnostics.push({
      code: 'CNL_COMPILER_SCENARIO_DECK_COMPOSITION_DUPLICATE_TAG',
      path: `${deckBasePath}.includedCardTags`,
      severity: 'error',
      message: `Scenario deckComposition.includedCardTags contains duplicate tag "${duplicateTag}".`,
      suggestion: 'List each card tag at most once.',
    });
  }
  const duplicateExcludedTags = findDuplicateEntries(excludedCardTags);
  for (const duplicateTag of duplicateExcludedTags) {
    options.diagnostics.push({
      code: 'CNL_COMPILER_SCENARIO_DECK_COMPOSITION_DUPLICATE_TAG',
      path: `${deckBasePath}.excludedCardTags`,
      severity: 'error',
      message: `Scenario deckComposition.excludedCardTags contains duplicate tag "${duplicateTag}".`,
      suggestion: 'List each card tag at most once.',
    });
  }

  const cardsById = new Map(eventDeck.cards.map((card) => [card.id, card] as const));
  const knownTags = new Set(eventDeck.cards.flatMap((card) => card.tags ?? []));
  for (const [index, cardId] of includedCardIds.entries()) {
    if (cardsById.has(cardId)) {
      continue;
    }
    options.diagnostics.push({
      code: 'CNL_COMPILER_SCENARIO_DECK_COMPOSITION_UNKNOWN_CARD',
      path: `${deckBasePath}.includedCardIds.${index}`,
      severity: 'error',
      message: `Scenario includedCardIds references unknown event card "${cardId}" in deck "${eventDeck.id}".`,
      suggestion: 'Use a card id declared in the selected eventDeck.',
    });
  }
  for (const [index, cardId] of excludedCardIds.entries()) {
    if (cardsById.has(cardId)) {
      continue;
    }
    options.diagnostics.push({
      code: 'CNL_COMPILER_SCENARIO_DECK_COMPOSITION_UNKNOWN_CARD',
      path: `${deckBasePath}.excludedCardIds.${index}`,
      severity: 'error',
      message: `Scenario excludedCardIds references unknown event card "${cardId}" in deck "${eventDeck.id}".`,
      suggestion: 'Use a card id declared in the selected eventDeck.',
    });
  }
  for (const [index, tag] of includedCardTags.entries()) {
    if (knownTags.has(tag)) {
      continue;
    }
    options.diagnostics.push({
      code: 'CNL_COMPILER_SCENARIO_DECK_COMPOSITION_UNKNOWN_TAG',
      path: `${deckBasePath}.includedCardTags.${index}`,
      severity: 'error',
      message: `Scenario includedCardTags references unknown event card tag "${tag}" in deck "${eventDeck.id}".`,
      suggestion: 'Use a card tag declared by at least one card in the selected eventDeck.',
    });
  }
  for (const [index, tag] of excludedCardTags.entries()) {
    if (knownTags.has(tag)) {
      continue;
    }
    options.diagnostics.push({
      code: 'CNL_COMPILER_SCENARIO_DECK_COMPOSITION_UNKNOWN_TAG',
      path: `${deckBasePath}.excludedCardTags.${index}`,
      severity: 'error',
      message: `Scenario excludedCardTags references unknown event card tag "${tag}" in deck "${eventDeck.id}".`,
      suggestion: 'Use a card tag declared by at least one card in the selected eventDeck.',
    });
  }

  const excludedIdSet = new Set(excludedCardIds);
  for (const [index, cardId] of includedCardIds.entries()) {
    if (!excludedIdSet.has(cardId)) {
      continue;
    }
    options.diagnostics.push({
      code: 'CNL_COMPILER_SCENARIO_DECK_COMPOSITION_CONFLICTING_FILTERS',
      path: `${deckBasePath}.includedCardIds.${index}`,
      severity: 'error',
      message: `Scenario deckComposition includes and excludes card "${cardId}".`,
      suggestion: 'A card id may appear in only one of includedCardIds or excludedCardIds.',
    });
  }
  const excludedTagSet = new Set(excludedCardTags);
  for (const [index, tag] of includedCardTags.entries()) {
    if (!excludedTagSet.has(tag)) {
      continue;
    }
    options.diagnostics.push({
      code: 'CNL_COMPILER_SCENARIO_DECK_COMPOSITION_CONFLICTING_FILTERS',
      path: `${deckBasePath}.includedCardTags.${index}`,
      severity: 'error',
      message: `Scenario deckComposition includes and excludes tag "${tag}".`,
      suggestion: 'A tag may appear in only one of includedCardTags or excludedCardTags.',
    });
  }

  const includeSelectorsDeclared = includedCardIds.length > 0 || includedCardTags.length > 0;
  const includeSelectedIds = new Set<string>();
  for (const cardId of includedCardIds) {
    if (cardsById.has(cardId)) {
      includeSelectedIds.add(cardId);
    }
  }
  for (const card of eventDeck.cards) {
    if ((card.tags ?? []).some((tag) => includedCardTags.includes(tag))) {
      includeSelectedIds.add(card.id);
    }
  }

  const excludeSelectedIds = new Set<string>();
  for (const cardId of excludedCardIds) {
    if (cardsById.has(cardId)) {
      excludeSelectedIds.add(cardId);
    }
  }
  for (const card of eventDeck.cards) {
    if ((card.tags ?? []).some((tag) => excludedCardTags.includes(tag))) {
      excludeSelectedIds.add(card.id);
    }
  }

  for (const cardId of includeSelectedIds) {
    if (!excludeSelectedIds.has(cardId)) {
      continue;
    }
    options.diagnostics.push({
      code: 'CNL_COMPILER_SCENARIO_DECK_COMPOSITION_CONFLICTING_FILTERS',
      path: deckBasePath,
      severity: 'error',
      message: `Scenario deckComposition includes and excludes card "${cardId}".`,
      suggestion: 'Make include selectors and exclude selectors disjoint for each card.',
    });
  }

  const includeSet = includeSelectorsDeclared ? includeSelectedIds : new Set(eventDeck.cards.map((card) => card.id));
  const candidateCards = eventDeck.cards.filter((card) => includeSet.has(card.id) && !excludeSelectedIds.has(card.id));
  const strategyId = deckComposition.materializationStrategy;
  const strategy = SCENARIO_DECK_MATERIALIZATION_STRATEGIES[strategyId];
  if (strategy === undefined) {
    options.diagnostics.push({
      code: 'CNL_COMPILER_SCENARIO_DECK_COMPOSITION_STRATEGY_UNKNOWN',
      path: `${deckBasePath}.materializationStrategy`,
      severity: 'error',
      message: `Unknown scenario deckComposition.materializationStrategy "${strategyId}".`,
      suggestion: 'Use a registered scenario deck materialization strategy.',
      alternatives: Object.keys(SCENARIO_DECK_MATERIALIZATION_STRATEGIES),
    });
    return { effects: [], syntheticZones: [] };
  }

  const existingZoneIds = new Set((options.existingZones ?? []).map((zone) => String(zone.id)));
  return strategy({
    scenarioDeck,
    deckBasePath,
    eventDeck,
    cardTokenTypeId: options.cardTokenTypeId,
    existingZoneIds,
    candidateCards,
    diagnostics: options.diagnostics,
  });
}

function materializePileCoupMixDeck(options: {
  readonly scenarioDeck: ScenarioDeckSelection;
  readonly deckBasePath: string;
  readonly eventDeck: EventDeckDef;
  readonly cardTokenTypeId: string;
  readonly existingZoneIds: Set<string>;
  readonly candidateCards: readonly EventDeckDef['cards'][number][];
  readonly diagnostics: Diagnostic[];
}): ScenarioDeckMaterializationResult {
  const { deckComposition } = options.scenarioDeck;
  const [coupCards, eventCards] = partitionByCoup(options.candidateCards);

  const neededEvents = deckComposition.pileCount * deckComposition.eventsPerPile;
  const neededCoups = deckComposition.pileCount * deckComposition.coupsPerPile;
  if (eventCards.length < neededEvents) {
    options.diagnostics.push({
      code: 'CNL_COMPILER_SCENARIO_DECK_COMPOSITION_INSUFFICIENT_EVENTS',
      path: `${options.deckBasePath}.eventsPerPile`,
      severity: 'error',
      message: `Scenario deckComposition requires ${neededEvents} non-coup cards, but ${eventCards.length} are available after filters.`,
      suggestion: 'Adjust included/excluded filters or pile/event counts.',
    });
  }
  if (coupCards.length < neededCoups) {
    options.diagnostics.push({
      code: 'CNL_COMPILER_SCENARIO_DECK_COMPOSITION_INSUFFICIENT_COUPS',
      path: `${options.deckBasePath}.coupsPerPile`,
      severity: 'error',
      message: `Scenario deckComposition requires ${neededCoups} coup cards, but ${coupCards.length} are available after filters.`,
      suggestion: 'Adjust included/excluded filters or pile/coup counts.',
    });
  }
  if (eventCards.length < neededEvents || coupCards.length < neededCoups) {
    return { effects: [], syntheticZones: [] };
  }

  const baseStem = sanitizeScenarioDeckStem(`${options.scenarioDeck.entityId}_${options.eventDeck.id}`);
  const eventsPoolZoneId = createUniqueSyntheticZoneId(options.existingZoneIds, `${baseStem}_events_pool`);
  const coupsPoolZoneId = createUniqueSyntheticZoneId(options.existingZoneIds, `${baseStem}_coups_pool`);
  const pileWorkZoneId = createUniqueSyntheticZoneId(options.existingZoneIds, `${baseStem}_pile_work`);

  const syntheticZones = [
    createScenarioDeckSyntheticZone(eventsPoolZoneId),
    createScenarioDeckSyntheticZone(coupsPoolZoneId),
    createScenarioDeckSyntheticZone(pileWorkZoneId),
  ];
  const effects: EffectAST[] = [];

  for (const eventCard of eventCards) {
    effects.push({
      createToken: {
        type: options.cardTokenTypeId,
        zone: eventsPoolZoneId,
        props: {
          cardId: eventCard.id,
          eventDeckId: options.eventDeck.id,
          isCoup: false,
        },
      },
    });
  }
  for (const coupCard of coupCards) {
    effects.push({
      createToken: {
        type: options.cardTokenTypeId,
        zone: coupsPoolZoneId,
        props: {
          cardId: coupCard.id,
          eventDeckId: options.eventDeck.id,
          isCoup: true,
        },
      },
    });
  }

  effects.push({ shuffle: { zone: eventsPoolZoneId } });
  effects.push({ shuffle: { zone: coupsPoolZoneId } });

  for (let pileIndex = deckComposition.pileCount - 1; pileIndex >= 0; pileIndex -= 1) {
    if (deckComposition.eventsPerPile > 0) {
      effects.push({
        draw: {
          from: eventsPoolZoneId,
          to: pileWorkZoneId,
          count: deckComposition.eventsPerPile,
        },
      });
    }
    if (deckComposition.coupsPerPile > 0) {
      effects.push({
        draw: {
          from: coupsPoolZoneId,
          to: pileWorkZoneId,
          count: deckComposition.coupsPerPile,
        },
      });
    }
    effects.push({ shuffle: { zone: pileWorkZoneId } });
    effects.push({
      moveAll: {
        from: pileWorkZoneId,
        to: options.eventDeck.drawZone,
      },
    });
  }

  return {
    effects,
    syntheticZones,
  };
}

function sanitizeScenarioDeckStem(raw: string): string {
  const normalized = raw.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const stem = normalized.length === 0 ? 'scenario_deck' : normalized;
  return `__scenario_deck_${stem}`;
}

function createUniqueSyntheticZoneId(existingZoneIds: Set<string>, preferredBase: string): string {
  let suffix = 1;
  let candidateBase = preferredBase;
  let candidateZoneId = `${candidateBase}:none`;
  while (existingZoneIds.has(candidateZoneId)) {
    suffix += 1;
    candidateBase = `${preferredBase}_${suffix}`;
    candidateZoneId = `${candidateBase}:none`;
  }
  existingZoneIds.add(candidateZoneId);
  return candidateZoneId;
}

function createScenarioDeckSyntheticZone(zoneId: string): ZoneDef {
  return {
    id: asZoneId(zoneId),
    zoneKind: 'aux',
    owner: 'none',
    visibility: 'hidden',
    ordering: 'set',
  };
}

function resolveScenarioEventDeck(options: {
  readonly eventDeckAssetId: string | undefined;
  readonly eventDecks: Exclude<GameDef['eventDecks'], undefined> | null;
  readonly diagnostics: Diagnostic[];
  readonly path: string;
  readonly deckBasePath: string;
}): EventDeckDef | null {
  const decks = options.eventDecks ?? [];
  if (decks.length === 0) {
    options.diagnostics.push({
      code: 'CNL_COMPILER_SCENARIO_DECK_COMPOSITION_EVENT_DECK_MISSING',
      path: options.deckBasePath,
      severity: 'error',
      message: 'Scenario deckComposition is declared, but no eventDecks are available.',
      suggestion: 'Declare at least one eventDeck or remove deckComposition.',
    });
    return null;
  }

  if (options.eventDeckAssetId !== undefined) {
    const matched = decks.find((deck) => deck.id === options.eventDeckAssetId);
    if (matched !== undefined) {
      return matched;
    }
    options.diagnostics.push({
      code: 'CNL_COMPILER_SCENARIO_DECK_COMPOSITION_EVENT_DECK_UNKNOWN',
      path: options.path,
      severity: 'error',
      message: `Scenario eventDeckAssetId "${options.eventDeckAssetId}" does not match any compiled eventDeck id.`,
      suggestion: 'Set eventDeckAssetId to an existing eventDeck id.',
      alternatives: decks.map((deck) => deck.id),
    });
    return null;
  }

  if (decks.length === 1) {
    return decks[0]!;
  }

  options.diagnostics.push({
    code: 'CNL_COMPILER_SCENARIO_DECK_COMPOSITION_EVENT_DECK_AMBIGUOUS',
    path: options.deckBasePath,
    severity: 'error',
    message: `Scenario deckComposition is ambiguous across ${decks.length} eventDecks.`,
    suggestion: 'Set scenario eventDeckAssetId to select one eventDeck.',
    alternatives: decks.map((deck) => deck.id),
  });
  return null;
}

function isCoupCard(card: EventDeckDef['cards'][number]): boolean {
  return card.tags?.includes('coup') === true;
}

function partitionByCoup(cards: readonly EventDeckDef['cards'][number][]): readonly [
  readonly EventDeckDef['cards'][number][],
  readonly EventDeckDef['cards'][number][],
] {
  const coups: EventDeckDef['cards'][number][] = [];
  const events: EventDeckDef['cards'][number][] = [];
  for (const card of cards) {
    if (isCoupCard(card)) {
      coups.push(card);
    } else {
      events.push(card);
    }
  }
  return [coups, events];
}

function findDuplicateEntries(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
      continue;
    }
    seen.add(value);
  }
  return [...duplicates];
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
