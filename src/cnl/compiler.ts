import type { Diagnostic } from '../kernel/diagnostics.js';
import { validateDataAssetEnvelope } from '../kernel/data-assets.js';
import {
  asActionId,
  asPhaseId,
  asTriggerId,
} from '../kernel/branded.js';
import type { GameDef } from '../kernel/types.js';
import type {
  ActionDef,
  ConditionAST,
  EffectAST,
  EndCondition,
  LimitDef,
  ParamDef,
  PhaseDef,
  TokenTypeDef,
  TriggerDef,
  TriggerEvent,
  TurnStructure,
  VariableDef,
  MapPayload,
  PieceCatalogPayload,
} from '../kernel/types.js';
import { validateGameDef } from '../kernel/validate-gamedef.js';
import { lowerConditionNode, lowerQueryNode } from './compile-conditions.js';
import { lowerEffectArray } from './compile-effects.js';
import { normalizePlayerSelector } from './compile-selectors.js';
import { materializeZoneDefs } from './compile-zones.js';
import type { GameSpecDoc } from './game-spec-doc.js';
import type { GameSpecSourceMap } from './source-map.js';
import { capDiagnostics, dedupeDiagnostics, sortDiagnosticsDeterministic } from './compiler-diagnostics.js';
import { expandBoardMacro } from './expand-macros.js';

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
  const expanded = expandMacros(doc, options);
  const diagnostics: Diagnostic[] = [...expanded.diagnostics];
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
    actions,
    triggers,
    endConditions,
  };
}

function deriveSectionsFromDataAssets(
  doc: GameSpecDoc,
  diagnostics: Diagnostic[],
): {
  readonly zones: GameSpecDoc['zones'];
  readonly tokenTypes: GameSpecDoc['tokenTypes'];
} {
  if (doc.dataAssets === null) {
    return { zones: null, tokenTypes: null };
  }

  const mapAssets: Array<{ readonly id: string; readonly payload: MapPayload }> = [];
  const pieceCatalogAssets: Array<{ readonly id: string; readonly payload: PieceCatalogPayload }> = [];
  const scenarioRefs: Array<{
    readonly mapAssetId?: string;
    readonly pieceCatalogAssetId?: string;
    readonly path: string;
    readonly entityId: string;
  }> = [];

  for (const [index, rawAsset] of doc.dataAssets.entries()) {
    if (!isRecord(rawAsset)) {
      continue;
    }
    const pathPrefix = `doc.dataAssets.${index}`;
    const validated = validateDataAssetEnvelope(rawAsset, {
      expectedKinds: ['map', 'scenario', 'pieceCatalog'],
      pathPrefix,
    });
    diagnostics.push(...validated.diagnostics);
    if (validated.asset === null) {
      continue;
    }

    if (validated.asset.kind === 'map') {
      mapAssets.push({
        id: validated.asset.id,
        payload: validated.asset.payload as MapPayload,
      });
      continue;
    }

    if (validated.asset.kind === 'pieceCatalog') {
      pieceCatalogAssets.push({
        id: validated.asset.id,
        payload: validated.asset.payload as PieceCatalogPayload,
      });
      continue;
    }

    if (validated.asset.kind === 'scenario') {
      const payload = validated.asset.payload;
      if (!isRecord(payload)) {
        continue;
      }
      const mapAssetId =
        typeof payload.mapAssetId === 'string' && payload.mapAssetId.trim() !== '' ? payload.mapAssetId.trim() : undefined;
      const pieceCatalogAssetId =
        typeof payload.pieceCatalogAssetId === 'string' && payload.pieceCatalogAssetId.trim() !== ''
          ? payload.pieceCatalogAssetId.trim()
          : undefined;
      scenarioRefs.push({
        ...(mapAssetId === undefined ? {} : { mapAssetId }),
        ...(pieceCatalogAssetId === undefined ? {} : { pieceCatalogAssetId }),
        path: `${pathPrefix}.payload`,
        entityId: validated.asset.id,
      });
    }
  }

  const selectedScenario = scenarioRefs.length > 0 ? scenarioRefs[0] : undefined;
  if (scenarioRefs.length > 1) {
    diagnostics.push({
      code: 'CNL_COMPILER_DATA_ASSET_SCENARIO_AMBIGUOUS',
      path: 'doc.dataAssets',
      severity: 'error',
      message: `Multiple scenario assets found (${scenarioRefs.length}); compiler cannot determine a single canonical scenario.`,
      suggestion: 'Keep one scenario asset in the compiled document.',
    });
  }

  const selectedMap = selectAssetById(
    mapAssets,
    selectedScenario?.mapAssetId,
    diagnostics,
    'map',
    selectedScenario?.path ?? 'doc.dataAssets',
    selectedScenario?.entityId,
  );
  const selectedPieceCatalog = selectAssetById(
    pieceCatalogAssets,
    selectedScenario?.pieceCatalogAssetId,
    diagnostics,
    'pieceCatalog',
    selectedScenario?.path ?? 'doc.dataAssets',
    selectedScenario?.entityId,
  );

  const zones =
    selectedMap === undefined
      ? null
      : selectedMap.payload.spaces.map((space) => ({
          id: space.id,
          owner: 'none',
          visibility: 'public',
          ordering: 'set',
          adjacentTo: [...space.adjacentTo].sort((left, right) => left.localeCompare(right)),
        }));

  const tokenTypes =
    selectedPieceCatalog === undefined
      ? null
      : selectedPieceCatalog.payload.pieceTypes.map((pieceType) => ({
          id: pieceType.id,
          props: Object.fromEntries(
            [...pieceType.statusDimensions]
              .sort((left, right) => left.localeCompare(right))
              .map((dimension) => [dimension, 'string']),
          ),
        }));

  return { zones, tokenTypes };
}

function selectAssetById<TPayload>(
  assets: ReadonlyArray<{ readonly id: string; readonly payload: TPayload }>,
  selectedId: string | undefined,
  diagnostics: Diagnostic[],
  kind: 'map' | 'pieceCatalog',
  selectedPath: string,
  entityId?: string,
): { readonly id: string; readonly payload: TPayload } | undefined {
  if (selectedId !== undefined) {
    const normalizedSelectedId = normalizeIdentifier(selectedId);
    const matched = assets.find((asset) => normalizeIdentifier(asset.id) === normalizedSelectedId);
    if (matched !== undefined) {
      return matched;
    }

    diagnostics.push({
      code: 'CNL_COMPILER_DATA_ASSET_REF_MISSING',
      path: `${selectedPath}.${kind}AssetId`,
      severity: 'error',
      message: `Scenario references unknown ${kind} asset "${selectedId}".`,
      suggestion: `Use an existing ${kind} asset id from doc.dataAssets.`,
      alternatives: assets.map((asset) => asset.id).sort((left, right) => left.localeCompare(right)),
      ...(entityId === undefined ? {} : { entityId }),
    });
    return undefined;
  }

  if (assets.length === 1) {
    return assets[0];
  }

  if (assets.length > 1) {
    diagnostics.push({
      code: 'CNL_COMPILER_DATA_ASSET_AMBIGUOUS',
      path: 'doc.dataAssets',
      severity: 'error',
      message: `Multiple ${kind} assets found (${assets.length}); compiler cannot infer which one to use.`,
      suggestion: `Provide a scenario asset referencing exactly one ${kind} asset id.`,
      alternatives: assets.map((asset) => asset.id).sort((left, right) => left.localeCompare(right)),
    });
  }

  return undefined;
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

function lowerConstants(
  constants: GameSpecDoc['constants'],
  diagnostics: Diagnostic[],
): Readonly<Record<string, number>> {
  if (constants === null) {
    return {};
  }

  const output: Record<string, number> = {};
  for (const [name, value] of Object.entries(constants)) {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      diagnostics.push(missingCapabilityDiagnostic(`doc.constants.${name}`, 'constant value', value, ['number']));
      continue;
    }
    output[name] = value;
  }
  return output;
}

function lowerVarDefs(
  variables: GameSpecDoc['globalVars'] | GameSpecDoc['perPlayerVars'],
  diagnostics: Diagnostic[],
  pathPrefix: 'doc.globalVars' | 'doc.perPlayerVars',
): readonly VariableDef[] {
  if (variables === null) {
    return [];
  }

  const lowered: VariableDef[] = [];
  for (const [index, variable] of variables.entries()) {
    const path = `${pathPrefix}.${index}`;
    if (!isRecord(variable)) {
      diagnostics.push(missingCapabilityDiagnostic(path, 'variable definition', variable));
      continue;
    }

    if (
      typeof variable.name !== 'string' ||
      variable.name.trim() === '' ||
      variable.type !== 'int' ||
      !isFiniteNumber(variable.init) ||
      !isFiniteNumber(variable.min) ||
      !isFiniteNumber(variable.max)
    ) {
      diagnostics.push(missingCapabilityDiagnostic(path, 'variable definition', variable));
      continue;
    }

    lowered.push({
      name: variable.name,
      type: 'int',
      init: variable.init,
      min: variable.min,
      max: variable.max,
    });
  }
  return lowered;
}

function lowerTokenTypes(tokenTypes: GameSpecDoc['tokenTypes'], diagnostics: Diagnostic[]): readonly TokenTypeDef[] {
  if (tokenTypes === null) {
    return [];
  }

  const lowered: TokenTypeDef[] = [];
  for (const [index, tokenType] of tokenTypes.entries()) {
    const path = `doc.tokenTypes.${index}`;
    if (!isRecord(tokenType) || typeof tokenType.id !== 'string' || tokenType.id.trim() === '' || !isRecord(tokenType.props)) {
      diagnostics.push(missingCapabilityDiagnostic(path, 'token type definition', tokenType));
      continue;
    }

    const props: Record<string, 'int' | 'string' | 'boolean'> = {};
    let validProps = true;
    for (const [propName, propType] of Object.entries(tokenType.props)) {
      if (propType !== 'int' && propType !== 'string' && propType !== 'boolean') {
        diagnostics.push(
          missingCapabilityDiagnostic(`${path}.props.${propName}`, 'token prop type', propType, ['int', 'string', 'boolean']),
        );
        validProps = false;
      } else {
        props[propName] = propType;
      }
    }
    if (!validProps) {
      continue;
    }
    lowered.push({
      id: tokenType.id,
      props,
    });
  }
  return lowered;
}

function lowerTurnStructure(
  turnStructure: NonNullable<GameSpecDoc['turnStructure']>,
  ownershipByBase: Readonly<Record<string, 'none' | 'player' | 'mixed'>>,
  diagnostics: Diagnostic[],
): TurnStructure {
  const phasesSource = Array.isArray(turnStructure.phases) ? turnStructure.phases : [];
  const phases: PhaseDef[] = phasesSource.map((phase, phaseIndex) => {
    const path = `doc.turnStructure.phases.${phaseIndex}`;
    if (!isRecord(phase) || typeof phase.id !== 'string' || phase.id.trim() === '') {
      diagnostics.push(missingCapabilityDiagnostic(path, 'phase definition', phase));
      return {
        id: asPhaseId(`invalid-phase-${phaseIndex}`),
      };
    }

    const onEnter = Array.isArray(phase.onEnter)
      ? lowerEffectsWithDiagnostics(phase.onEnter, ownershipByBase, diagnostics, `${path}.onEnter`)
      : undefined;
    const onExit = Array.isArray(phase.onExit)
      ? lowerEffectsWithDiagnostics(phase.onExit, ownershipByBase, diagnostics, `${path}.onExit`)
      : undefined;

    return {
      id: asPhaseId(phase.id),
      ...(onEnter === undefined ? {} : { onEnter }),
      ...(onExit === undefined ? {} : { onExit }),
    };
  });

  const activePlayerOrder =
    turnStructure.activePlayerOrder === 'roundRobin' || turnStructure.activePlayerOrder === 'fixed'
      ? turnStructure.activePlayerOrder
      : 'roundRobin';

  if (activePlayerOrder !== turnStructure.activePlayerOrder) {
    diagnostics.push(
      missingCapabilityDiagnostic('doc.turnStructure.activePlayerOrder', 'turnStructure.activePlayerOrder', turnStructure.activePlayerOrder, [
        'roundRobin',
        'fixed',
      ]),
    );
  }

  return {
    phases,
    activePlayerOrder,
  };
}

function lowerActions(
  actions: readonly unknown[],
  ownershipByBase: Readonly<Record<string, 'none' | 'player' | 'mixed'>>,
  diagnostics: Diagnostic[],
): readonly ActionDef[] {
  const lowered: ActionDef[] = [];
  for (const [index, action] of actions.entries()) {
    const path = `doc.actions.${index}`;
    if (!isRecord(action)) {
      diagnostics.push(missingCapabilityDiagnostic(path, 'action definition', action));
      continue;
    }

    if (typeof action.id !== 'string' || action.id.trim() === '' || typeof action.phase !== 'string' || action.phase.trim() === '') {
      diagnostics.push(missingCapabilityDiagnostic(path, 'action definition', action));
      continue;
    }

    const actor = normalizePlayerSelector(action.actor, `${path}.actor`);
    diagnostics.push(...actor.diagnostics);

    const params = lowerActionParams(action.params, ownershipByBase, diagnostics, `${path}.params`);
    const bindingScope = params.bindingScope;
    const pre = lowerOptionalCondition(action.pre, ownershipByBase, bindingScope, diagnostics, `${path}.pre`);
    const cost = lowerEffectsWithDiagnostics(action.cost, ownershipByBase, diagnostics, `${path}.cost`, bindingScope);
    const effects = lowerEffectsWithDiagnostics(action.effects, ownershipByBase, diagnostics, `${path}.effects`, bindingScope);
    const limits = lowerActionLimits(action.limits, diagnostics, `${path}.limits`);

    if (actor.value === null || (action.pre !== null && pre === null)) {
      continue;
    }

    lowered.push({
      id: asActionId(action.id),
      actor: actor.value,
      phase: asPhaseId(action.phase),
      params: params.value,
      pre: pre ?? null,
      cost,
      effects,
      limits,
    });
  }

  return lowered;
}

function lowerActionParams(
  paramsSource: unknown,
  ownershipByBase: Readonly<Record<string, 'none' | 'player' | 'mixed'>>,
  diagnostics: Diagnostic[],
  path: string,
): {
  readonly value: readonly ParamDef[];
  readonly bindingScope: readonly string[];
} {
  if (!Array.isArray(paramsSource)) {
    diagnostics.push(missingCapabilityDiagnostic(path, 'action params', paramsSource, ['array']));
    return { value: [], bindingScope: [] };
  }

  const value: ParamDef[] = [];
  const bindingScope: string[] = [];
  paramsSource.forEach((param, paramIndex) => {
    const paramPath = `${path}.${paramIndex}`;
    if (!isRecord(param) || typeof param.name !== 'string' || param.name.trim() === '') {
      diagnostics.push(missingCapabilityDiagnostic(paramPath, 'action param', param));
      return;
    }

    const domain = lowerQueryNode(param.domain, { ownershipByBase }, `${paramPath}.domain`);
    diagnostics.push(...domain.diagnostics);
    if (domain.value === null) {
      return;
    }

    value.push({
      name: param.name,
      domain: domain.value,
    });
    bindingScope.push(toBindingToken(param.name));
  });

  return {
    value,
    bindingScope,
  };
}

function lowerActionLimits(limitsSource: unknown, diagnostics: Diagnostic[], path: string): readonly LimitDef[] {
  if (!Array.isArray(limitsSource)) {
    diagnostics.push(missingCapabilityDiagnostic(path, 'action limits', limitsSource, ['array']));
    return [];
  }

  const limits: LimitDef[] = [];
  for (const [index, limit] of limitsSource.entries()) {
    const limitPath = `${path}.${index}`;
    const maxValue = isRecord(limit) && typeof limit.max === 'number' ? limit.max : null;
    if (
      !isRecord(limit) ||
      (limit.scope !== 'turn' && limit.scope !== 'phase' && limit.scope !== 'game') ||
      maxValue === null ||
      !Number.isInteger(maxValue) ||
      maxValue < 0
    ) {
      diagnostics.push(missingCapabilityDiagnostic(limitPath, 'action limit', limit, ['{ scope: turn|phase|game, max: int>=0 }']));
      continue;
    }
    limits.push({
      scope: limit.scope,
      max: maxValue,
    });
  }
  return limits;
}

function lowerTriggers(
  triggers: readonly unknown[],
  ownershipByBase: Readonly<Record<string, 'none' | 'player' | 'mixed'>>,
  diagnostics: Diagnostic[],
): readonly TriggerDef[] {
  const lowered: TriggerDef[] = [];
  for (const [index, trigger] of triggers.entries()) {
    const path = `doc.triggers.${index}`;
    if (!isRecord(trigger)) {
      diagnostics.push(missingCapabilityDiagnostic(path, 'trigger definition', trigger));
      continue;
    }

    const event = lowerTriggerEvent(trigger.event, ownershipByBase, diagnostics, `${path}.event`);
    const match = lowerOptionalCondition(trigger.match, ownershipByBase, [], diagnostics, `${path}.match`);
    const when = lowerOptionalCondition(trigger.when, ownershipByBase, [], diagnostics, `${path}.when`);
    const effects = lowerEffectsWithDiagnostics(trigger.effects, ownershipByBase, diagnostics, `${path}.effects`);

    if (event === null || match === null || when === null) {
      continue;
    }

    const triggerId = typeof trigger.id === 'string' && trigger.id.trim() !== '' ? trigger.id : `trigger_${index}`;
    lowered.push({
      id: asTriggerId(triggerId),
      event,
      ...(match === undefined ? {} : { match }),
      ...(when === undefined ? {} : { when }),
      effects,
    });
  }
  return lowered;
}

function lowerTriggerEvent(
  event: unknown,
  ownershipByBase: Readonly<Record<string, 'none' | 'player' | 'mixed'>>,
  diagnostics: Diagnostic[],
  path: string,
): TriggerEvent | null {
  if (!isRecord(event) || typeof event.type !== 'string') {
    diagnostics.push(missingCapabilityDiagnostic(path, 'trigger event', event));
    return null;
  }

  switch (event.type) {
    case 'phaseEnter':
    case 'phaseExit':
      if (typeof event.phase !== 'string' || event.phase.trim() === '') {
        diagnostics.push(missingCapabilityDiagnostic(`${path}.phase`, `${event.type} phase`, event.phase, ['phase id']));
        return null;
      }
      return { type: event.type, phase: asPhaseId(event.phase) };
    case 'turnStart':
    case 'turnEnd':
      return { type: event.type };
    case 'actionResolved':
      if (event.action === undefined) {
        return { type: 'actionResolved' };
      }
      if (typeof event.action !== 'string' || event.action.trim() === '') {
        diagnostics.push(missingCapabilityDiagnostic(`${path}.action`, 'actionResolved action', event.action, ['action id']));
        return null;
      }
      return { type: 'actionResolved', action: asActionId(event.action) };
    case 'tokenEntered':
      if (event.zone === undefined) {
        return { type: 'tokenEntered' };
      }
      if (typeof event.zone !== 'string') {
        diagnostics.push(missingCapabilityDiagnostic(`${path}.zone`, 'tokenEntered zone', event.zone, ['zone selector string']));
        return null;
      }
      return { type: 'tokenEntered', zone: event.zone as GameDef['zones'][number]['id'] };
    default:
      diagnostics.push(
        missingCapabilityDiagnostic(`${path}.type`, 'trigger event type', event.type, [
          'phaseEnter',
          'phaseExit',
          'turnStart',
          'turnEnd',
          'actionResolved',
          'tokenEntered',
        ]),
      );
      return null;
  }
}

function lowerEndConditions(
  endConditions: readonly unknown[],
  ownershipByBase: Readonly<Record<string, 'none' | 'player' | 'mixed'>>,
  diagnostics: Diagnostic[],
): readonly EndCondition[] {
  const lowered: EndCondition[] = [];
  for (const [index, endCondition] of endConditions.entries()) {
    const path = `doc.endConditions.${index}`;
    if (!isRecord(endCondition)) {
      diagnostics.push(missingCapabilityDiagnostic(path, 'end condition', endCondition));
      continue;
    }

    const when = lowerConditionNode(endCondition.when, { ownershipByBase }, `${path}.when`);
    diagnostics.push(...when.diagnostics);
    const result = lowerTerminalResult(endCondition.result, diagnostics, `${path}.result`);

    if (when.value === null || result === null) {
      continue;
    }

    lowered.push({
      when: when.value,
      result,
    });
  }
  return lowered;
}

function lowerTerminalResult(
  result: unknown,
  diagnostics: Diagnostic[],
  path: string,
): EndCondition['result'] | null {
  if (!isRecord(result) || typeof result.type !== 'string') {
    diagnostics.push(missingCapabilityDiagnostic(path, 'end condition result', result));
    return null;
  }

  switch (result.type) {
    case 'draw':
      return { type: 'draw' };
    case 'lossAll':
      return { type: 'lossAll' };
    case 'score':
      return { type: 'score' };
    case 'win': {
      const player = normalizePlayerSelector(result.player, `${path}.player`);
      diagnostics.push(...player.diagnostics);
      if (player.value === null) {
        return null;
      }
      return {
        type: 'win',
        player: player.value,
      };
    }
    default:
      diagnostics.push(missingCapabilityDiagnostic(`${path}.type`, 'end condition result type', result.type, ['win', 'lossAll', 'draw', 'score']));
      return null;
  }
}

function lowerOptionalCondition(
  source: unknown,
  ownershipByBase: Readonly<Record<string, 'none' | 'player' | 'mixed'>>,
  bindingScope: readonly string[],
  diagnostics: Diagnostic[],
  path: string,
): ConditionAST | null | undefined {
  if (source === null) {
    return null;
  }
  if (source === undefined) {
    return undefined;
  }
  const lowered = lowerConditionNode(source, { ownershipByBase, bindingScope }, path);
  diagnostics.push(...lowered.diagnostics);
  return lowered.value;
}

function lowerEffectsWithDiagnostics(
  source: unknown,
  ownershipByBase: Readonly<Record<string, 'none' | 'player' | 'mixed'>>,
  diagnostics: Diagnostic[],
  path: string,
  bindingScope: readonly string[] = [],
): readonly EffectAST[] {
  if (!Array.isArray(source)) {
    diagnostics.push(missingCapabilityDiagnostic(path, 'effects array', source, ['array']));
    return [];
  }

  const lowered = lowerEffectArray(source, { ownershipByBase, bindingScope }, path);
  diagnostics.push(...lowered.diagnostics);
  return lowered.value ?? [];
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

function missingCapabilityDiagnostic(
  path: string,
  label: string,
  actual: unknown,
  alternatives: readonly string[] = [],
): Diagnostic {
  return {
    code: 'CNL_COMPILER_MISSING_CAPABILITY',
    path,
    severity: 'error',
    message: `Cannot lower ${label}: ${formatValue(actual)}.`,
    suggestion: alternatives.length > 0 ? `Use one of the supported forms.` : 'Use a supported compiler shape.',
    ...(alternatives.length === 0 ? {} : { alternatives: [...alternatives] }),
  };
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') {
    return `"${value}"`;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function toBindingToken(name: string): string {
  return name.startsWith('$') ? name : `$${name}`;
}

function hasErrorDiagnostics(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === 'error');
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizeIdentifier(value: string): string {
  return value.trim().normalize('NFC');
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

function expandZoneMacros(
  zones: GameSpecDoc['zones'],
  maxGeneratedZones: number,
  diagnostics: Diagnostic[],
): GameSpecDoc['zones'] {
  if (zones === null) {
    return null;
  }

  const expandedZones: unknown[] = [];
  let generatedZones = 0;

  for (const [index, zone] of zones.entries()) {
    if (!isBoardMacroZone(zone)) {
      expandedZones.push(zone);
      continue;
    }

    const macroPath = `doc.zones.${index}`;
    const args = zone.args.map((value) => (typeof value === 'number' ? value : Number.NaN));
    const expansion = expandBoardMacro(zone.macro, args, macroPath);
    diagnostics.push(...expansion.diagnostics);
    if (expansion.diagnostics.length > 0) {
      continue;
    }

    const nextGeneratedZones = generatedZones + expansion.zones.length;
    if (nextGeneratedZones > maxGeneratedZones) {
      diagnostics.push({
        code: 'CNL_COMPILER_LIMIT_EXCEEDED',
        path: macroPath,
        severity: 'error',
        message: `Macro expansion exceeded maxGeneratedZones (${nextGeneratedZones} > ${maxGeneratedZones}).`,
        suggestion: 'Reduce board macro output size or increase compile limit maxGeneratedZones.',
      });
      continue;
    }

    generatedZones = nextGeneratedZones;
    expandedZones.push(...expansion.zones.map(zoneDefToSpecZone));
  }

  return expandedZones as GameSpecDoc['zones'];
}

function expandEffectSections(
  sections: Pick<GameSpecDoc, 'setup' | 'actions' | 'triggers' | 'turnStructure'>,
  maxExpandedEffects: number,
  diagnostics: Diagnostic[],
): Pick<GameSpecDoc, 'setup' | 'actions' | 'triggers' | 'turnStructure'> {
  const state: ExpansionState = {
    maxExpandedEffects,
    expandedEffects: 0,
    diagnostics,
  };

  return {
    setup:
      sections.setup === null
        ? null
        : (expandEffectArray(sections.setup, 'doc.setup', state) as GameSpecDoc['setup']),
    actions:
      sections.actions === null
        ? null
        : (sections.actions.map((action, actionIndex) =>
            expandActionEffects(action, actionIndex, state),
          ) as GameSpecDoc['actions']),
    triggers:
      sections.triggers === null
        ? null
        : (sections.triggers.map((trigger, triggerIndex) =>
            expandTriggerEffects(trigger, triggerIndex, state),
          ) as GameSpecDoc['triggers']),
    turnStructure: expandTurnStructureEffects(sections.turnStructure, state),
  };
}

function expandTurnStructureEffects(
  turnStructure: GameSpecDoc['turnStructure'],
  state: ExpansionState,
): GameSpecDoc['turnStructure'] {
  if (!isRecord(turnStructure) || !Array.isArray(turnStructure.phases)) {
    return turnStructure;
  }

  const phases = turnStructure.phases.map((phase, phaseIndex) => {
    if (!isRecord(phase)) {
      return phase;
    }
    const onEnter = Array.isArray(phase.onEnter)
      ? expandEffectArray(phase.onEnter, `doc.turnStructure.phases.${phaseIndex}.onEnter`, state)
      : phase.onEnter;
    const onExit = Array.isArray(phase.onExit)
      ? expandEffectArray(phase.onExit, `doc.turnStructure.phases.${phaseIndex}.onExit`, state)
      : phase.onExit;
    return {
      ...phase,
      ...(onEnter !== phase.onEnter ? { onEnter } : {}),
      ...(onExit !== phase.onExit ? { onExit } : {}),
    };
  });

  return {
    ...turnStructure,
    phases,
  } as GameSpecDoc['turnStructure'];
}

function expandActionEffects(action: unknown, actionIndex: number, state: ExpansionState): unknown {
  if (!isRecord(action)) {
    return action;
  }

  const cost = Array.isArray(action.cost)
    ? expandEffectArray(action.cost, `doc.actions.${actionIndex}.cost`, state)
    : action.cost;
  const effects = Array.isArray(action.effects)
    ? expandEffectArray(action.effects, `doc.actions.${actionIndex}.effects`, state)
    : action.effects;

  return {
    ...action,
    ...(cost !== action.cost ? { cost } : {}),
    ...(effects !== action.effects ? { effects } : {}),
  };
}

function expandTriggerEffects(trigger: unknown, triggerIndex: number, state: ExpansionState): unknown {
  if (!isRecord(trigger) || !Array.isArray(trigger.effects)) {
    return trigger;
  }

  return {
    ...trigger,
    effects: expandEffectArray(trigger.effects, `doc.triggers.${triggerIndex}.effects`, state),
  };
}

function expandEffectArray(effects: readonly unknown[], path: string, state: ExpansionState): readonly unknown[] {
  const expanded: unknown[] = [];
  for (const [index, effect] of effects.entries()) {
    expanded.push(...expandSingleEffect(effect, `${path}.${index}`, state));
  }
  return expanded;
}

function expandSingleEffect(effect: unknown, path: string, state: ExpansionState): readonly unknown[] {
  if (!isRecord(effect)) {
    return [effect];
  }

  const refillToSize = expandRefillToSize(effect, path, state);
  if (refillToSize !== undefined) {
    return refillToSize;
  }

  const discardDownTo = expandDiscardDownTo(effect, path, state);
  if (discardDownTo !== undefined) {
    return [discardDownTo];
  }

  const drawEach = expandDrawEach(effect, path, state);
  if (drawEach !== undefined) {
    return [drawEach];
  }

  if (isRecord(effect.if)) {
    const thenEffects = Array.isArray(effect.if.then)
      ? expandEffectArray(effect.if.then, `${path}.if.then`, state)
      : effect.if.then;
    const elseEffects = Array.isArray(effect.if.else)
      ? expandEffectArray(effect.if.else, `${path}.if.else`, state)
      : effect.if.else;

    return [
      {
        ...effect,
        if: {
          ...effect.if,
          ...(thenEffects !== effect.if.then ? { then: thenEffects } : {}),
          ...(elseEffects !== effect.if.else ? { else: elseEffects } : {}),
        },
      },
    ];
  }

  if (isRecord(effect.forEach) && Array.isArray(effect.forEach.effects)) {
    return [
      {
        ...effect,
        forEach: {
          ...effect.forEach,
          effects: expandEffectArray(effect.forEach.effects, `${path}.forEach.effects`, state),
        },
      },
    ];
  }

  if (isRecord(effect.let) && Array.isArray(effect.let.in)) {
    return [
      {
        ...effect,
        let: {
          ...effect.let,
          in: expandEffectArray(effect.let.in, `${path}.let.in`, state),
        },
      },
    ];
  }

  return [effect];
}

function expandRefillToSize(
  effect: Record<string, unknown>,
  path: string,
  state: ExpansionState,
): readonly unknown[] | undefined {
  const refillNode = effect.refillToSize;
  if (!isRecord(refillNode)) {
    return undefined;
  }

  if (!isValidMacroSize(refillNode.size)) {
    state.diagnostics.push({
      code: 'CNL_COMPILER_MISSING_CAPABILITY',
      path: `${path}.refillToSize.size`,
      severity: 'error',
      message: 'refillToSize requires compile-time integer literal size >= 0.',
      suggestion:
        'Use a non-negative integer literal size, or rewrite as explicit if + draw effects with count: 1.',
    });
    return [effect];
  }

  if (typeof refillNode.zone !== 'string' || typeof refillNode.fromZone !== 'string') {
    return [effect];
  }

  const size = refillNode.size;
  if (!consumeExpandedEffects(path, state, size, 'refillToSize')) {
    return [effect];
  }

  const expanded: unknown[] = [];
  for (let index = 0; index < size; index += 1) {
    expanded.push({
      if: {
        when: {
          op: '<',
          left: { ref: 'zoneCount', zone: refillNode.zone },
          right: size,
        },
        then: [{ draw: { from: refillNode.fromZone, to: refillNode.zone, count: 1 } }],
        else: [],
      },
    });
  }

  return expanded;
}

function expandDiscardDownTo(
  effect: Record<string, unknown>,
  path: string,
  state: ExpansionState,
): unknown | undefined {
  const discardNode = effect.discardDownTo;
  if (!isRecord(discardNode)) {
    return undefined;
  }

  if (!isValidMacroSize(discardNode.size)) {
    state.diagnostics.push({
      code: 'CNL_COMPILER_MISSING_CAPABILITY',
      path: `${path}.discardDownTo.size`,
      severity: 'error',
      message: 'discardDownTo requires compile-time integer literal size >= 0.',
      suggestion:
        'Use a non-negative integer literal size, or rewrite as explicit token loop gated by zoneCount(zone) > size.',
    });
    return effect;
  }

  if (typeof discardNode.zone !== 'string') {
    return effect;
  }

  if (!consumeExpandedEffects(path, state, 1, 'discardDownTo')) {
    return effect;
  }

  const surplusGuard = {
    op: '>',
    left: { ref: 'zoneCount', zone: discardNode.zone },
    right: discardNode.size,
  };

  const thenEffects =
    typeof discardNode.to === 'string'
      ? [{ moveToken: { token: '$tok', from: discardNode.zone, to: discardNode.to } }]
      : [{ destroyToken: { token: '$tok' } }];

  return {
    forEach: {
      bind: '$tok',
      over: { query: 'tokensInZone', zone: discardNode.zone },
      effects: [
        {
          if: {
            when: surplusGuard,
            then: thenEffects,
            else: [],
          },
        },
      ],
    },
  };
}

function expandDrawEach(effect: Record<string, unknown>, path: string, state: ExpansionState): unknown | undefined {
  const drawNode = effect.draw;
  if (!isRecord(drawNode) || drawNode.to !== 'hand:each') {
    return undefined;
  }

  if (!consumeExpandedEffects(path, state, 1, 'draw:each', `${path}.draw.to`)) {
    return effect;
  }

  return {
    forEach: {
      bind: '$p',
      over: { query: 'players' },
      effects: [
        {
          draw: {
            ...drawNode,
            to: 'hand:$p',
          },
        },
      ],
    },
  };
}

function zoneDefToSpecZone(zone: {
  readonly id: unknown;
  readonly owner: unknown;
  readonly visibility: unknown;
  readonly ordering: unknown;
  readonly adjacentTo?: readonly unknown[];
}): unknown {
  const adjacentTo = zone.adjacentTo?.map((entry) => String(entry));
  if (adjacentTo === undefined) {
    return {
      id: String(zone.id),
      owner: zone.owner,
      visibility: zone.visibility,
      ordering: zone.ordering,
    };
  }

  return {
    id: String(zone.id),
    owner: zone.owner,
    visibility: zone.visibility,
    ordering: zone.ordering,
    adjacentTo,
  };
}

function isBoardMacroZone(value: unknown): value is { readonly macro: string; readonly args: readonly unknown[] } {
  return isRecord(value) && typeof value.macro === 'string' && Array.isArray(value.args);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidMacroSize(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function consumeExpandedEffects(
  path: string,
  state: ExpansionState,
  count: number,
  macroName: string,
  diagnosticPath = path,
): boolean {
  const nextExpandedEffects = state.expandedEffects + count;
  if (nextExpandedEffects > state.maxExpandedEffects) {
    state.diagnostics.push({
      code: 'CNL_COMPILER_LIMIT_EXCEEDED',
      path: diagnosticPath,
      severity: 'error',
      message: `Macro expansion exceeded maxExpandedEffects (${nextExpandedEffects} > ${state.maxExpandedEffects}).`,
      suggestion: `Reduce ${macroName} expansion count or increase compile limit maxExpandedEffects.`,
    });
    return false;
  }

  state.expandedEffects = nextExpandedEffects;
  return true;
}

interface ExpansionState {
  readonly maxExpandedEffects: number;
  expandedEffects: number;
  readonly diagnostics: Diagnostic[];
}
