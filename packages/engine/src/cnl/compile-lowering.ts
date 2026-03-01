import type { Diagnostic } from '../kernel/diagnostics.js';
import { asActionId, asPhaseId, asPlayerId, asTriggerId, asZoneId, type PhaseId } from '../kernel/branded.js';
import type {
  ActionDef,
  ConditionAST,
  EffectAST,
  EndCondition,
  DerivedMetricDef,
  GameDef,
  GlobalMarkerLatticeDef,
  LimitDef,
  ParamDef,
  PhaseDef,
  ScoringDef,
  TokenTypeDef,
  TriggerDef,
  TriggerEvent,
  TurnStructure,
  VariableDef,
} from '../kernel/types.js';
import { lowerConditionNode, lowerNumericValueNode, lowerQueryNode } from './compile-conditions.js';
import { lowerEffectArray, type EffectLoweringContext } from './compile-effects.js';
import { normalizeActionExecutorSelector, normalizePlayerSelector } from './compile-selectors.js';
import type { TypeInferenceContext } from './type-inference.js';
import { evaluateActionSelectorContracts } from '../contracts/index.js';
import { buildActionSelectorContractViolationDiagnostic } from './action-selector-contract-diagnostics.js';
import { CNL_COMPILER_DIAGNOSTIC_CODES, buildCompilerMissingCapabilityDiagnostic } from './compiler-diagnostic-codes.js';
import type { GameSpecDoc } from './game-spec-doc.js';

export type EffectLoweringSharedContext = Omit<EffectLoweringContext, 'bindingScope'>;
export type ConditionLoweringSharedContext = Pick<
  EffectLoweringSharedContext,
  'ownershipByBase' | 'tokenTraitVocabulary' | 'tokenFilterProps' | 'namedSets' | 'typeInference' | 'seatIds'
>;

export function lowerConstants(
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

export function lowerVarDefs(
  variables: GameSpecDoc['globalVars'] | GameSpecDoc['perPlayerVars'] | GameSpecDoc['zoneVars'],
  diagnostics: Diagnostic[],
  pathPrefix: 'doc.globalVars' | 'doc.perPlayerVars' | 'doc.zoneVars',
): readonly VariableDef[] {
  return lowerVarDefsWithSourceIndices(variables, diagnostics, pathPrefix).map((entry) => entry.variable);
}

type LoweredVarWithSourceIndex = {
  readonly sourceIndex: number;
  readonly variable: VariableDef;
};

function lowerVarDefsWithSourceIndices(
  variables: GameSpecDoc['globalVars'] | GameSpecDoc['perPlayerVars'] | GameSpecDoc['zoneVars'],
  diagnostics: Diagnostic[],
  pathPrefix: 'doc.globalVars' | 'doc.perPlayerVars' | 'doc.zoneVars',
): readonly LoweredVarWithSourceIndex[] {
  if (variables === null) {
    return [];
  }

  const lowered: LoweredVarWithSourceIndex[] = [];
  for (const [index, variable] of variables.entries()) {
    const path = `${pathPrefix}.${index}`;
    if (!isRecord(variable)) {
      diagnostics.push(missingCapabilityDiagnostic(path, 'variable definition', variable));
      continue;
    }

    if (typeof variable.name !== 'string' || variable.name.trim() === '') {
      diagnostics.push(missingCapabilityDiagnostic(path, 'variable definition', variable));
      continue;
    }

    if (variable.type === 'int') {
      if (!isFiniteNumber(variable.init) || !isFiniteNumber(variable.min) || !isFiniteNumber(variable.max)) {
        diagnostics.push(missingCapabilityDiagnostic(path, 'int variable definition', variable));
        continue;
      }
      lowered.push({
        sourceIndex: index,
        variable: {
          name: variable.name,
          type: 'int',
          init: variable.init,
          min: variable.min,
          max: variable.max,
        },
      });
      continue;
    }

    if (variable.type === 'boolean') {
      if (typeof variable.init !== 'boolean') {
        diagnostics.push(missingCapabilityDiagnostic(path, 'boolean variable definition', variable, ['boolean init']));
        continue;
      }
      lowered.push({
        sourceIndex: index,
        variable: {
          name: variable.name,
          type: 'boolean',
          init: variable.init,
        },
      });
      continue;
    }

    diagnostics.push(missingCapabilityDiagnostic(path, 'variable definition', variable, ['type: int|boolean']));
  }
  return lowered;
}

export function lowerIntVarDefs(
  variables: GameSpecDoc['zoneVars'],
  diagnostics: Diagnostic[],
  pathPrefix: 'doc.zoneVars',
): readonly Extract<VariableDef, { readonly type: 'int' }>[] {
  if (variables === null) {
    return [];
  }

  const lowered = lowerVarDefsWithSourceIndices(variables, diagnostics, pathPrefix);
  const intOnly: Extract<VariableDef, { readonly type: 'int' }>[] = [];
  for (const { sourceIndex, variable } of lowered) {
    if (variable.type === 'int') {
      intOnly.push(variable);
      continue;
    }
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_ZONE_VAR_TYPE_INVALID,
      path: `${pathPrefix}.${sourceIndex}.type`,
      severity: 'error',
      message: `Cannot lower zoneVars.${sourceIndex}: only int zoneVars are supported.`,
      suggestion: 'Use an int zone variable definition (type, init, min, max).',
    });
  }
  return intOnly;
}

export function lowerGlobalMarkerLattices(
  lattices: GameSpecDoc['globalMarkerLattices'],
  diagnostics: Diagnostic[],
): readonly GlobalMarkerLatticeDef[] {
  if (lattices === null) {
    return [];
  }

  const lowered: GlobalMarkerLatticeDef[] = [];
  for (const [index, lattice] of lattices.entries()) {
    const path = `doc.globalMarkerLattices.${index}`;
    if (!isRecord(lattice)) {
      diagnostics.push(missingCapabilityDiagnostic(path, 'global marker lattice definition', lattice));
      continue;
    }
    if (typeof lattice.id !== 'string' || lattice.id.trim() === '') {
      diagnostics.push(missingCapabilityDiagnostic(`${path}.id`, 'global marker lattice id', lattice.id, ['string']));
      continue;
    }
    if (!Array.isArray(lattice.states) || lattice.states.some((state) => typeof state !== 'string' || state.trim() === '')) {
      diagnostics.push(missingCapabilityDiagnostic(`${path}.states`, 'global marker lattice states', lattice.states, ['string[]']));
      continue;
    }
    if (typeof lattice.defaultState !== 'string' || lattice.defaultState.trim() === '') {
      diagnostics.push(
        missingCapabilityDiagnostic(`${path}.defaultState`, 'global marker lattice default state', lattice.defaultState, ['string']),
      );
      continue;
    }
    lowered.push({
      id: lattice.id,
      states: lattice.states,
      defaultState: lattice.defaultState,
    });
  }

  return lowered;
}

export function lowerTokenTypes(tokenTypes: GameSpecDoc['tokenTypes'], diagnostics: Diagnostic[]): readonly TokenTypeDef[] {
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
      ...(tokenType.seat === undefined ? {} : { seat: tokenType.seat }),
    });
  }
  return lowered;
}

export function lowerTurnStructure(
  turnStructure: NonNullable<GameSpecDoc['turnStructure']>,
  diagnostics: Diagnostic[],
  context: EffectLoweringSharedContext,
): TurnStructure {
  if ('activePlayerOrder' in turnStructure) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_TURN_STRUCTURE_LEGACY_FIELD_UNSUPPORTED,
      path: 'doc.turnStructure.activePlayerOrder',
      severity: 'error',
      message: 'turnStructure.activePlayerOrder is no longer supported.',
      suggestion: 'Move sequencing configuration to doc.turnOrder.',
    });
  }

  const lowerPhaseDefs = (source: readonly unknown[] | undefined, pathPrefix: string): PhaseDef[] => {
    const entries = Array.isArray(source) ? source : [];
    return entries.map((phase, phaseIndex) => {
      const path = `${pathPrefix}.${phaseIndex}`;
      if (!isRecord(phase) || typeof phase.id !== 'string' || phase.id.trim() === '') {
        diagnostics.push(missingCapabilityDiagnostic(path, 'phase definition', phase));
        return {
          id: asPhaseId(`invalid-phase-${phaseIndex}`),
        };
      }

      const onEnter = Array.isArray(phase.onEnter)
        ? lowerEffectsWithDiagnostics(
          phase.onEnter,
          diagnostics,
          `${path}.onEnter`,
          context,
          [],
        )
        : undefined;
      const onExit = Array.isArray(phase.onExit)
        ? lowerEffectsWithDiagnostics(
          phase.onExit,
          diagnostics,
          `${path}.onExit`,
          context,
          [],
        )
        : undefined;

      return {
        id: asPhaseId(phase.id),
        ...(onEnter === undefined ? {} : { onEnter }),
        ...(onExit === undefined ? {} : { onExit }),
      };
    });
  };

  const phases = lowerPhaseDefs(turnStructure.phases, 'doc.turnStructure.phases');
  const interrupts = lowerPhaseDefs(turnStructure.interrupts, 'doc.turnStructure.interrupts');

  return {
    phases,
    ...(interrupts.length === 0 ? {} : { interrupts }),
  };
}

export function lowerDerivedMetrics(
  derivedMetrics: GameSpecDoc['derivedMetrics'],
  diagnostics: Diagnostic[],
): readonly DerivedMetricDef[] {
  if (derivedMetrics === null) {
    return [];
  }

  const lowered: DerivedMetricDef[] = [];
  for (const [index, metric] of derivedMetrics.entries()) {
    const path = `doc.derivedMetrics.${index}`;
    if (!isRecord(metric)) {
      diagnostics.push(missingCapabilityDiagnostic(path, 'derived metric definition', metric));
      continue;
    }
    if (typeof metric.id !== 'string' || metric.id.trim() === '') {
      diagnostics.push(missingCapabilityDiagnostic(`${path}.id`, 'derived metric id', metric.id, ['string']));
      continue;
    }
    if (
      metric.computation !== 'markerTotal'
      && metric.computation !== 'controlledPopulation'
      && metric.computation !== 'totalEcon'
    ) {
      diagnostics.push(
        missingCapabilityDiagnostic(`${path}.computation`, 'derived metric computation', metric.computation, [
          'markerTotal',
          'controlledPopulation',
          'totalEcon',
        ]),
      );
      continue;
    }
    if (!Array.isArray(metric.requirements) || metric.requirements.length === 0) {
      diagnostics.push(
        missingCapabilityDiagnostic(`${path}.requirements`, 'derived metric requirements', metric.requirements, [
          'non-empty array',
        ]),
      );
      continue;
    }

    const requirements: Array<{ key: string; expectedType: 'number' }> = [];
    let requirementsValid = true;
    for (const [requirementIndex, requirement] of metric.requirements.entries()) {
      const requirementPath = `${path}.requirements.${requirementIndex}`;
      if (!isRecord(requirement)) {
        diagnostics.push(missingCapabilityDiagnostic(requirementPath, 'derived metric requirement', requirement));
        requirementsValid = false;
        continue;
      }
      if (typeof requirement.key !== 'string' || requirement.key.trim() === '') {
        diagnostics.push(missingCapabilityDiagnostic(`${requirementPath}.key`, 'derived metric requirement key', requirement.key, ['string']));
        requirementsValid = false;
        continue;
      }
      if (requirement.expectedType !== 'number') {
        diagnostics.push(
          missingCapabilityDiagnostic(
            `${requirementPath}.expectedType`,
            'derived metric requirement expectedType',
            requirement.expectedType,
            ['number'],
          ),
        );
        requirementsValid = false;
        continue;
      }
      requirements.push({ key: requirement.key, expectedType: 'number' });
    }
    if (!requirementsValid) {
      continue;
    }

    let zoneFilter: DerivedMetricDef['zoneFilter'] | undefined;
    if (metric.zoneFilter !== undefined) {
      if (!isRecord(metric.zoneFilter)) {
        diagnostics.push(missingCapabilityDiagnostic(`${path}.zoneFilter`, 'derived metric zoneFilter', metric.zoneFilter));
        continue;
      }

      const zoneIds =
        Array.isArray(metric.zoneFilter.zoneIds) && metric.zoneFilter.zoneIds.every((entry) => typeof entry === 'string')
          ? metric.zoneFilter.zoneIds.map((zoneId) => asZoneId(zoneId))
          : undefined;
      if (metric.zoneFilter.zoneIds !== undefined && zoneIds === undefined) {
        diagnostics.push(missingCapabilityDiagnostic(`${path}.zoneFilter.zoneIds`, 'derived metric zone ids', metric.zoneFilter.zoneIds, ['string[]']));
        continue;
      }

      const zoneKinds =
        Array.isArray(metric.zoneFilter.zoneKinds)
          && metric.zoneFilter.zoneKinds.every((entry) => entry === 'board' || entry === 'aux')
          ? metric.zoneFilter.zoneKinds
          : undefined;
      if (metric.zoneFilter.zoneKinds !== undefined && zoneKinds === undefined) {
        diagnostics.push(
          missingCapabilityDiagnostic(`${path}.zoneFilter.zoneKinds`, 'derived metric zone kinds', metric.zoneFilter.zoneKinds, ['board|aux[]']),
        );
        continue;
      }

      const category =
        Array.isArray(metric.zoneFilter.category) && metric.zoneFilter.category.every((entry) => typeof entry === 'string')
          ? metric.zoneFilter.category
          : undefined;
      if (metric.zoneFilter.category !== undefined && category === undefined) {
        diagnostics.push(
          missingCapabilityDiagnostic(`${path}.zoneFilter.category`, 'derived metric zone categories', metric.zoneFilter.category, ['string[]']),
        );
        continue;
      }

      const attributeEquals = isRecord(metric.zoneFilter.attributeEquals)
        ? metric.zoneFilter.attributeEquals as Record<string, unknown>
        : undefined;
      if (metric.zoneFilter.attributeEquals !== undefined && attributeEquals === undefined) {
        diagnostics.push(
          missingCapabilityDiagnostic(`${path}.zoneFilter.attributeEquals`, 'derived metric attributeEquals', metric.zoneFilter.attributeEquals, ['record']),
        );
        continue;
      }

      const normalizedAttributeEquals: Record<string, string | number | boolean | readonly string[]> = {};
      let attributesValid = true;
      for (const [key, value] of Object.entries(attributeEquals ?? {})) {
        if (
          typeof value === 'string'
          || typeof value === 'number'
          || typeof value === 'boolean'
          || (Array.isArray(value) && value.every((entry) => typeof entry === 'string'))
        ) {
          normalizedAttributeEquals[key] = value as string | number | boolean | readonly string[];
          continue;
        }
        diagnostics.push(
          missingCapabilityDiagnostic(`${path}.zoneFilter.attributeEquals.${key}`, 'derived metric attribute value', value),
        );
        attributesValid = false;
      }
      if (!attributesValid) {
        continue;
      }

      zoneFilter = {
        ...(zoneIds === undefined ? {} : { zoneIds }),
        ...(zoneKinds === undefined ? {} : { zoneKinds }),
        ...(category === undefined ? {} : { category }),
        ...(Object.keys(normalizedAttributeEquals).length === 0 ? {} : { attributeEquals: normalizedAttributeEquals }),
      };
    }

    lowered.push({
      id: metric.id,
      computation: metric.computation,
      ...(zoneFilter === undefined ? {} : { zoneFilter }),
      requirements,
    });
  }

  return lowered;
}

export function lowerActions(
  actions: readonly unknown[],
  diagnostics: Diagnostic[],
  context: EffectLoweringSharedContext,
): readonly ActionDef[] {
  const lowered: ActionDef[] = [];
  for (const [index, action] of actions.entries()) {
    const path = `doc.actions.${index}`;
    if (!isRecord(action)) {
      diagnostics.push(missingCapabilityDiagnostic(path, 'action definition', action));
      continue;
    }

    if (typeof action.id !== 'string' || action.id.trim() === '') {
      diagnostics.push(missingCapabilityDiagnostic(path, 'action definition', action));
      continue;
    }
    const phases = lowerActionPhases(action.phase, `${path}.phase`);
    diagnostics.push(...phases.diagnostics);
    if (phases.value === null) {
      continue;
    }

    const actor = normalizePlayerSelector(action.actor, `${path}.actor`, context.seatIds);
    diagnostics.push(...actor.diagnostics);
    const executor = normalizeActionExecutorSelector(action.executor, `${path}.executor`, context.seatIds);
    diagnostics.push(...executor.diagnostics);
    const capabilities = lowerActionCapabilities(action.capabilities, diagnostics, `${path}.capabilities`);

    const params = lowerActionParams(
      action.params,
      context.ownershipByBase,
      diagnostics,
      `${path}.params`,
      context.tokenTraitVocabulary,
      context.tokenFilterProps,
      context.namedSets,
      context.typeInference,
    );
    const bindingScope = params.bindingScope;
    const selectorContractViolations = evaluateActionSelectorContracts({
      selectors: {
        actor: actor.value,
        executor: executor.value,
      },
      declaredBindings: bindingScope,
      hasPipeline: false,
      enforcePipelineBindingCompatibility: false,
    });
    diagnostics.push(
      ...selectorContractViolations
        .map((violation) =>
          buildActionSelectorContractViolationDiagnostic({
            violation,
            path: `${path}.${violation.role}`,
            actionId: String(action.id),
            surface: 'compileLowering',
          }),
        ),
    );
    const pre = lowerOptionalCondition(
      action.pre,
      diagnostics,
      `${path}.pre`,
      context,
      bindingScope,
    );
    const cost = lowerEffectsWithDiagnostics(
      action.cost,
      diagnostics,
      `${path}.cost`,
      context,
      bindingScope,
    );
    const effects = lowerEffectsWithDiagnostics(
      action.effects,
      diagnostics,
      `${path}.effects`,
      context,
      bindingScope,
    );
    const limits = lowerActionLimits(action.limits, diagnostics, `${path}.limits`);

    if (actor.value === null || executor.value === null || (action.pre !== null && pre === null)) {
      continue;
    }

    lowered.push({
      id: asActionId(action.id),
      actor: actor.value,
      executor: executor.value,
      phase: phases.value,
      ...(capabilities.length === 0 ? {} : { capabilities }),
      params: params.value,
      pre: pre ?? null,
      cost,
      effects,
      limits,
    });
  }

  return lowered;
}

function lowerActionPhases(
  source: unknown,
  path: string,
): {
  readonly value: ActionDef['phase'] | null;
  readonly diagnostics: readonly Diagnostic[];
} {
  if (!Array.isArray(source) || source.length === 0) {
    return {
      value: null,
      diagnostics: [missingCapabilityDiagnostic(path, 'action phase selector(s)', source, ['string[]'])],
    };
  }

  const diagnostics: Diagnostic[] = [];
  const normalized: PhaseId[] = [];
  const seen = new Set<string>();
  for (const [phaseIndex, phase] of source.entries()) {
    if (typeof phase !== 'string' || phase.trim() === '') {
      return {
        value: null,
        diagnostics: [missingCapabilityDiagnostic(path, 'action phase selector(s)', source, ['string[]'])],
      };
    }
    const phaseId = asPhaseId(phase);
    if (seen.has(phaseId)) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_ACTION_PHASE_DUPLICATE,
        path: `${path}.${phaseIndex}`,
        severity: 'error',
        message: `Duplicate action phase "${phaseId}" after normalization.`,
        suggestion: 'Keep each phase id unique within action.phase.',
      });
      continue;
    }
    seen.add(phaseId);
    normalized.push(phaseId);
  }

  if (diagnostics.length > 0) {
    return { value: null, diagnostics };
  }
  return { value: normalized, diagnostics: [] };
}

function lowerActionCapabilities(
  source: unknown,
  diagnostics: Diagnostic[],
  path: string,
): readonly string[] {
  if (source === undefined || source === null) {
    return [];
  }
  if (!Array.isArray(source)) {
    diagnostics.push(missingCapabilityDiagnostic(path, 'action capabilities', source, ['string[]']));
    return [];
  }

  const capabilities: string[] = [];
  const normalized = new Set<string>();
  for (const [index, capability] of source.entries()) {
    if (typeof capability !== 'string' || capability.trim() === '') {
      diagnostics.push(missingCapabilityDiagnostic(`${path}.${index}`, 'action capability id', capability, ['non-empty string']));
      continue;
    }
    const normalizedCapability = capability.normalize('NFC');
    if (normalized.has(normalizedCapability)) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_ACTION_CAPABILITY_DUPLICATE,
        path: `${path}.${index}`,
        severity: 'error',
        message: `Duplicate action capability "${normalizedCapability}" after NFC normalization.`,
        suggestion: 'Keep each capability id unique within the action.',
      });
      continue;
    }
    normalized.add(normalizedCapability);
    capabilities.push(normalizedCapability);
  }
  return capabilities;
}

function lowerActionParams(
  paramsSource: unknown,
  ownershipByBase: Readonly<Record<string, 'none' | 'player' | 'mixed'>>,
  diagnostics: Diagnostic[],
  path: string,
  tokenTraitVocabulary?: Readonly<Record<string, readonly string[]>>,
  tokenFilterProps?: readonly string[],
  namedSets?: Readonly<Record<string, readonly string[]>>,
  typeInference?: TypeInferenceContext,
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

    const domain = lowerQueryNode(
      param.domain,
      {
        ownershipByBase,
        ...(tokenTraitVocabulary === undefined ? {} : { tokenTraitVocabulary }),
        ...(tokenFilterProps === undefined ? {} : { tokenFilterProps }),
        ...(namedSets === undefined ? {} : { namedSets }),
        ...(typeInference === undefined ? {} : { typeInference }),
      },
      `${paramPath}.domain`,
    );
    diagnostics.push(...domain.diagnostics);
    if (domain.value === null) {
      return;
    }

    value.push({
      name: param.name,
      domain: domain.value,
    });
    bindingScope.push(param.name);
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

export function lowerTriggers(
  triggers: readonly unknown[],
  diagnostics: Diagnostic[],
  context: EffectLoweringSharedContext,
): readonly TriggerDef[] {
  const lowered: TriggerDef[] = [];
  for (const [index, trigger] of triggers.entries()) {
    const path = `doc.triggers.${index}`;
    if (!isRecord(trigger)) {
      diagnostics.push(missingCapabilityDiagnostic(path, 'trigger definition', trigger));
      continue;
    }

    const event = lowerTriggerEvent(trigger.event, context.ownershipByBase, diagnostics, `${path}.event`);
    const bindingScope = event === null ? [] : triggerBindingScope(event);
    const match = lowerOptionalCondition(
      trigger.match,
      diagnostics,
      `${path}.match`,
      context,
      bindingScope,
    );
    const when = lowerOptionalCondition(
      trigger.when,
      diagnostics,
      `${path}.when`,
      context,
      bindingScope,
    );
    const effects = lowerEffectsWithDiagnostics(
      trigger.effects,
      diagnostics,
      `${path}.effects`,
      context,
      bindingScope,
    );

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
    case 'varChanged': {
      if (event.scope !== undefined && event.scope !== 'global' && event.scope !== 'perPlayer') {
        diagnostics.push(missingCapabilityDiagnostic(`${path}.scope`, 'varChanged scope', event.scope, ['global', 'perPlayer']));
        return null;
      }
      if (event.var !== undefined && (typeof event.var !== 'string' || event.var.trim() === '')) {
        diagnostics.push(missingCapabilityDiagnostic(`${path}.var`, 'varChanged var', event.var, ['variable name']));
        return null;
      }
      if (
        event.player !== undefined &&
        (typeof event.player !== 'number' || !Number.isSafeInteger(event.player) || event.player < 0)
      ) {
        diagnostics.push(missingCapabilityDiagnostic(`${path}.player`, 'varChanged player', event.player, ['integer player id >= 0']));
        return null;
      }

      return {
        type: 'varChanged',
        ...(event.scope === undefined ? {} : { scope: event.scope }),
        ...(event.var === undefined ? {} : { var: event.var }),
        ...(event.player === undefined ? {} : { player: asPlayerId(event.player) }),
      };
    }
    default:
      diagnostics.push(
        missingCapabilityDiagnostic(`${path}.type`, 'trigger event type', event.type, [
          'phaseEnter',
          'phaseExit',
          'turnStart',
          'turnEnd',
          'actionResolved',
          'tokenEntered',
          'varChanged',
        ]),
      );
      return null;
  }
}

function triggerBindingScope(event: TriggerEvent): readonly string[] {
  switch (event.type) {
    case 'phaseEnter':
    case 'phaseExit':
      return ['$event', '$phase'];
    case 'actionResolved':
      return ['$event', '$action'];
    case 'tokenEntered':
      return ['$event', '$zone'];
    case 'varChanged':
      return ['$event', '$scope', '$var', '$player', '$oldValue', '$newValue'];
    case 'turnStart':
    case 'turnEnd':
      return ['$event'];
  }
}

export function lowerEndConditions(
  endConditions: readonly unknown[],
  ownershipByBase: Readonly<Record<string, 'none' | 'player' | 'mixed'>>,
  diagnostics: Diagnostic[],
  tokenTraitVocabulary?: Readonly<Record<string, readonly string[]>>,
  tokenFilterProps?: readonly string[],
  namedSets?: Readonly<Record<string, readonly string[]>>,
  typeInference?: TypeInferenceContext,
  seatIds?: readonly string[],
): readonly EndCondition[] {
  const lowered: EndCondition[] = [];
  for (const [index, endCondition] of endConditions.entries()) {
    const path = `doc.terminal.conditions.${index}`;
    if (!isRecord(endCondition)) {
      diagnostics.push(missingCapabilityDiagnostic(path, 'end condition', endCondition));
      continue;
    }

    const when = lowerConditionNode(
      endCondition.when,
      {
        ownershipByBase,
        ...(tokenTraitVocabulary === undefined ? {} : { tokenTraitVocabulary }),
        ...(tokenFilterProps === undefined ? {} : { tokenFilterProps }),
        ...(namedSets === undefined ? {} : { namedSets }),
        ...(typeInference === undefined ? {} : { typeInference }),
        ...(seatIds === undefined ? {} : { seatIds }),
      },
      `${path}.when`,
    );
    diagnostics.push(...when.diagnostics);
    const result = lowerTerminalResult(
      endCondition.result,
      diagnostics,
      `${path}.result`,
      {
        ownershipByBase,
        ...(tokenTraitVocabulary === undefined ? {} : { tokenTraitVocabulary }),
        ...(tokenFilterProps === undefined ? {} : { tokenFilterProps }),
        ...(namedSets === undefined ? {} : { namedSets }),
        ...(typeInference === undefined ? {} : { typeInference }),
        ...(seatIds === undefined ? {} : { seatIds }),
      },
    );

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

export function lowerScoring(
  scoring: unknown,
  diagnostics: Diagnostic[],
): ScoringDef | undefined {
  if (scoring === null) {
    return undefined;
  }
  if (!isRecord(scoring)) {
    diagnostics.push(missingCapabilityDiagnostic('doc.terminal.scoring', 'scoring definition', scoring, ['object']));
    return undefined;
  }

  const method = scoring.method;
  if (method !== 'highest' && method !== 'lowest') {
    diagnostics.push(
      missingCapabilityDiagnostic('doc.terminal.scoring.method', 'scoring method', method, ['highest', 'lowest']),
    );
    return undefined;
  }

  const loweredValue = lowerNumericValueNode(scoring.value, { ownershipByBase: {} }, 'doc.terminal.scoring.value');
  diagnostics.push(...loweredValue.diagnostics);
  if (loweredValue.value === null) {
    return undefined;
  }

  return {
    method,
    value: loweredValue.value,
  };
}

function lowerTerminalResult(
  result: unknown,
  diagnostics: Diagnostic[],
  path: string,
  context: ConditionLoweringSharedContext,
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
      const player = normalizePlayerSelector(result.player, `${path}.player`, context.seatIds);
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

export function lowerOptionalCondition(
  source: unknown,
  diagnostics: Diagnostic[],
  path: string,
  context: ConditionLoweringSharedContext,
  bindingScope: readonly string[] = [],
): ConditionAST | null | undefined {
  if (source === null) {
    return null;
  }
  if (source === undefined) {
    return undefined;
  }
  const lowered = lowerConditionNode(
    source,
    buildConditionLoweringContext(context, bindingScope),
    path,
  );
  diagnostics.push(...lowered.diagnostics);
  return lowered.value;
}

export function buildConditionLoweringContext(
  context: ConditionLoweringSharedContext,
  bindingScope: readonly string[] = [],
): {
  readonly ownershipByBase: Readonly<Record<string, 'none' | 'player' | 'mixed'>>;
  readonly bindingScope: readonly string[];
  readonly tokenTraitVocabulary?: Readonly<Record<string, readonly string[]>>;
  readonly tokenFilterProps?: readonly string[];
  readonly namedSets?: Readonly<Record<string, readonly string[]>>;
  readonly typeInference?: TypeInferenceContext;
  readonly seatIds?: readonly string[];
} {
  return {
    ownershipByBase: context.ownershipByBase,
    bindingScope,
    ...(context.tokenTraitVocabulary === undefined ? {} : { tokenTraitVocabulary: context.tokenTraitVocabulary }),
    ...(context.tokenFilterProps === undefined ? {} : { tokenFilterProps: context.tokenFilterProps }),
    ...(context.namedSets === undefined ? {} : { namedSets: context.namedSets }),
    ...(context.typeInference === undefined ? {} : { typeInference: context.typeInference }),
    ...(context.seatIds === undefined ? {} : { seatIds: context.seatIds }),
  };
}

export function lowerEffectsWithDiagnostics(
  source: unknown,
  diagnostics: Diagnostic[],
  path: string,
  context: EffectLoweringSharedContext,
  bindingScope: readonly string[] = [],
): readonly EffectAST[] {
  if (!Array.isArray(source)) {
    diagnostics.push(missingCapabilityDiagnostic(path, 'effects array', source, ['array']));
    return [];
  }

  const lowered = lowerEffectArray(
    source,
    buildEffectLoweringContext(context, bindingScope),
    path,
  );
  diagnostics.push(...lowered.diagnostics);
  return lowered.value ?? [];
}

export function buildEffectLoweringContext(
  context: EffectLoweringSharedContext,
  bindingScope: readonly string[] = [],
): EffectLoweringContext {
  return {
    ownershipByBase: context.ownershipByBase,
    bindingScope,
    ...(context.freeOperationActionIds === undefined ? {} : { freeOperationActionIds: context.freeOperationActionIds }),
    ...(context.tokenTraitVocabulary === undefined ? {} : { tokenTraitVocabulary: context.tokenTraitVocabulary }),
    ...(context.tokenFilterProps === undefined ? {} : { tokenFilterProps: context.tokenFilterProps }),
    ...(context.namedSets === undefined ? {} : { namedSets: context.namedSets }),
    ...(context.typeInference === undefined ? {} : { typeInference: context.typeInference }),
    ...(context.seatIds === undefined ? {} : { seatIds: context.seatIds }),
  };
}

export function missingCapabilityDiagnostic(
  path: string,
  label: string,
  actual: unknown,
  alternatives: readonly string[] = [],
): Diagnostic {
  return buildCompilerMissingCapabilityDiagnostic({ path, label, actual, alternatives });
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function normalizeIdentifier(value: string): string {
  return value.trim().normalize('NFC');
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
