import { fingerprintPolicyIr } from '../agents/policy-ir-node-loader.js';
import { parseAuthoredPolicySurfaceRef, parseStrategicConditionRef } from '../agents/policy-surface.js';
import {
  analyzePolicyExpr,
  withCompiledLookupRef,
  type AnalyzePolicyExprContext,
  type PolicyExprAnalysis,
  type ResolvedPolicyRef,
} from '../agents/policy-expr.js';
import type { Diagnostic } from '../kernel/diagnostics.js';
import {
  AGENT_POLICY_PROFILE_USE_BUCKETS,
  AGENT_POLICY_PROFILE_USE_TO_LIBRARY_BUCKET,
} from '../contracts/index.js';
import { parsePolicyStandingRoleToken, POLICY_STANDING_ROLE_TOKEN_PREFIX } from '../agents/policy-standing-roles.js';
import { collectChoiceBindingSpecs } from '../kernel/move-runtime-bindings.js';
import { inferQueryRuntimeShapes } from '../kernel/query-shape-inference.js';
import { MAX_SELECTOR_PRODUCT_PAIRS, MAX_SELECTOR_RESULT_ITEMS } from '../kernel/types.js';
import type {
  AgentParameterType,
  AgentParameterValue,
  AgentCandidateParamFallback,
  AgentLookupFallback,
  AgentScheduleFallback,
  AgentPolicyCatalog,
  AgentPolicyCostClass,
  AgentPolicyExpr,
  AgentPreviewFallback,
  SurfaceVisibilityClass,
  AgentPolicyValueType,
  CompiledAgentPolicyRef,
  CompiledAgentAggregate,
  CompiledAgentCandidateFeature,
  CompiledAgentCandidateParamDef,
  CompiledAgentConsideration,
  CompiledAgentDependencyRefs,
  CompiledAgentLibraryIndex,
  CompiledAgentParameterDef,
  CompiledAgentPreviewBudgetConfig,
  CompiledAgentPreviewInnerConfig,
  CompiledAgentPreviewGrantFlowContinuationConfig,
  CompiledPlanTemplate,
  CompiledPolicySelector,
  GuardrailCostClass,
  ModuleCostClass,
  TurnShapeCostClass,
  ContinuedDeepeningConfig,
  QualitySpec,
  SelectorCostClass,
  DeepTrigger,
  AgentPreviewGrantFlowCapClass,
  AgentPreviewPostGrantCapClass,
  CompiledObserverCatalog,
  CompiledSurfaceCatalog,
  CompiledSurfaceVisibility,
  CompiledAgentProfile,
  CompiledAgentStateFeature,
  CompiledAgentTieBreaker,
  CompiledStrategicCondition,
  GameDef,
  PhaseBoundaryDef,
  ScheduleDistanceUnit,
} from '../kernel/types.js';
import type {
  GameSpecAgentLibrary,
  GameSpecAgentParameterDef,
  GameSpecAgentParameterType,
  GameSpecAgentProfileDef,
  GameSpecAgentsSection,
  GameSpecCandidateFeatureDef,
  GameSpecCandidateParamFallbackDef,
  GameSpecLookupFallbackDef,
  GameSpecPolicyExpr,
  GameSpecSelectorDef,
  GameSpecSelectorSource,
  GameSpecPolicySurfaceVisibilityDef,
  GameSpecPreviewFallbackDef,
  GameSpecScheduleFallbackDef,
  GameSpecStateFeatureDef,
  GameSpecTieBreakerDef,
} from './game-spec-doc.js';
import { CNL_COMPILER_DIAGNOSTIC_CODES } from './compiler-diagnostic-codes.js';
import { lowerAgentConsiderations, lowerAgentPolicyExpr, type AgentPolicyLibraryWithExpr } from './lower-agent-considerations.js';
import {
  deriveSelectorCostClass,
  isSelectorCostClass,
  normalizeSelectorResult,
  normalizeSelectorScopes,
  parseSelectorRef,
  selectorCostClassLeq,
  selectorCostToPolicyCostClass,
} from './compile-agent-selectors.js';
import { lowerSelectorSource, type LoweredSelectorSource } from './compile-agent-selector-sources.js';
import {
  compileStrategyModuleDefinition,
  moduleCostToPolicyCostClass,
  parseModuleRef,
  type AgentStrategyModuleWithExpr,
} from './compile-agent-strategy-modules.js';
import {
  compileGuardrailDefinition,
  parseGuardrailRef,
  type AgentGuardrailWithExpr,
} from './compile-agent-guardrails.js';
import {
  compileTurnShapeEvaluatorDefinition,
  parseTurnShapeRef,
  tagUnregisteredTurnShapePreviewRef,
  type AgentTurnShapeEvaluatorWithExpr,
} from './compile-agent-turn-shape.js';
import {
  compilePostureEvaluatorDefinition,
  type AgentPostureEvaluatorWithExpr,
} from './compile-agent-posture-evaluators.js';
import {
  lowerRelationshipDefinition,
  parseRelationshipRefPath,
  type AgentRelationshipWithExpr,
} from './compile-agent-relationships.js';
import { compilePlanTemplateDefinition } from './compile-agent-plan-templates.js';
import { stripAgentLibraryExpressions } from './strip-agent-library-expressions.js';
import { collectPreviewSeatAggRefIds, warnImplicitPreviewSeatAggAvailability } from './preview-seat-agg-refs.js';
import { asBoundaryId } from '../kernel/branded.js';
import {
  buildPhaseBoundaryValidationContext,
  findPhaseBoundaryById,
  isScheduleDistanceUnit,
  scheduleKindSupportsUnit,
  type PhaseBoundaryValidationContext,
} from './compile-phase-boundaries.js';

type ProfileUseKey = typeof AGENT_POLICY_PROFILE_USE_BUCKETS[number];
type AggregateOp = 'max' | 'min' | 'count' | 'any' | 'all' | 'rankDense' | 'rankOrdinal';
type TieBreakerKind = 'higherExpr' | 'lowerExpr' | 'preferredEnumOrder' | 'preferredIdOrder' | 'rng' | 'stableMoveKey';
type ConsiderationScope = 'move' | 'microturn';
type LibraryRefScope = 'stateFeature' | 'candidateFeature' | 'aggregate' | 'selector' | 'strategyModule' | 'guardrail' | 'turnShapeEvaluator' | 'postureEvaluator' | 'relationship' | 'consideration' | 'tieBreaker' | 'strategicCondition';
type LoweredAgentProfile = Omit<CompiledAgentProfile, 'fingerprint'>;
type AgentLibraryWithExpr = AgentPolicyLibraryWithExpr;
type AgentStateFeatureWithExpr = CompiledAgentStateFeature & { readonly expr: AgentPolicyExpr };
type AgentCandidateFeatureWithExpr = CompiledAgentCandidateFeature & { readonly expr: AgentPolicyExpr };
type AgentAggregateWithExpr = CompiledAgentAggregate & {
  readonly of: AgentPolicyExpr;
  readonly where?: AgentPolicyExpr;
};
type AgentSelectorWithExpr = CompiledPolicySelector;
type AgentPlanTemplateWithExpr = CompiledPlanTemplate;
type AgentGuardrailWithExprInternal = AgentGuardrailWithExpr;
type AgentTurnShapeEvaluatorWithExprInternal = AgentTurnShapeEvaluatorWithExpr;
type AgentPostureEvaluatorWithExprInternal = AgentPostureEvaluatorWithExpr;
type AgentConsiderationWithExpr = CompiledAgentConsideration & {
  readonly when?: AgentPolicyExpr;
  readonly weight: AgentPolicyExpr;
  readonly value: AgentPolicyExpr;
  readonly hasPreviewRef: boolean;
  readonly hasLookupRef: boolean;
};
type AgentTieBreakerWithExpr = CompiledAgentTieBreaker & { readonly value?: AgentPolicyExpr };
type StrategicConditionWithExpr = CompiledStrategicCondition & {
  readonly target: AgentPolicyExpr;
  readonly proximity?: {
    readonly current: AgentPolicyExpr;
    readonly threshold: number;
  };
};

const AGENT_PARAMETER_TYPES: readonly AgentParameterType[] = ['number', 'integer', 'boolean', 'enum', 'idOrder'];
export const INNER_PREVIEW_HARD_CAP = 256;
export type CapClass = 'standard256' | 'deep1024';
export const CAP_CLASS_BUDGETS: Record<CapClass, number> = {
  standard256: INNER_PREVIEW_HARD_CAP,
  deep1024: 1024,
};
export const POST_GRANT_CAP_CLASS_BUDGETS: Record<AgentPreviewPostGrantCapClass, number> = {
  postGrant16: 4,
};
export const GRANT_FLOW_CAP_CLASS_BUDGETS: Record<AgentPreviewGrantFlowCapClass, number> = {
  grantFlow16: 16,
  grantFlow32: 32,
};
const PREVIEW_INNER_STRATEGIES = new Set(['singlePass', 'continuedDeepening']);
const PREVIEW_INNER_CAP_CLASSES = new Set(['standard256', 'deep1024']);
const PREVIEW_POST_GRANT_CAP_CLASSES = new Set(['postGrant16']);
const PREVIEW_GRANT_FLOW_CAP_CLASSES = new Set(['grantFlow16', 'grantFlow32']);
const DEEP_TRIGGERS = new Set(['allRequestedRefsDepthCapped', 'allReadyValuesUniform']);
const POLICY_VALUE_TYPES: readonly AgentPolicyValueType[] = ['number', 'boolean', 'id', 'idList'];
const AGGREGATE_OPS = new Set<AggregateOp>(['max', 'min', 'count', 'any', 'all', 'rankDense', 'rankOrdinal']);
const TIE_BREAKER_KINDS = new Set<TieBreakerKind>([
  'higherExpr',
  'lowerExpr',
  'preferredEnumOrder',
  'preferredIdOrder',
  'rng',
  'stableMoveKey',
]);

export interface LowerAgentsOptions {
  readonly referenceSeatIds?: readonly string[];
  readonly playerCountMax?: number;
  readonly globalVarIds?: readonly string[];
  readonly globalMarkerIds?: readonly string[];
  readonly perPlayerVarIds?: readonly string[];
  readonly policyMetricIds?: readonly string[];
  readonly hasVictoryMargins?: boolean;
  readonly actionDefs?: GameDef['actions'];
  readonly actionPipelines?: GameDef['actionPipelines'];
  readonly phaseBoundaries?: readonly PhaseBoundaryDef[];
  readonly turnStructure?: GameDef['turnStructure'];
  readonly observerCatalog?: CompiledObserverCatalog;
}

export function lowerAgents(
  agents: GameSpecAgentsSection | null,
  diagnostics: Diagnostic[],
  options: LowerAgentsOptions = {},
): GameDef['agents'] | undefined {
  if (agents === null) {
    return undefined;
  }

  const surfaceVisibility = resolveSurfaceVisibilityFromObserverCatalog(agents.profiles, options);
  const parameterDefs = lowerParameterDefs(agents.parameters, diagnostics);
  const candidateParamDefs = lowerCandidateParamDefs(options.actionDefs, options.actionPipelines);
  const libraryCompiler = new AgentLibraryCompiler(
    agents.library,
    surfaceVisibility,
    parameterDefs,
    candidateParamDefs,
    diagnostics,
    options,
  );
  const library = libraryCompiler.compile();
  const strippedLibrary = stripAgentLibraryExpressions(library);
  const profiles = addProfileFingerprints(
    lowerProfiles(agents.profiles, agents.library, strippedLibrary, parameterDefs, diagnostics),
  );
  const bindingsBySeat = lowerBindings(agents.bindings, profiles, diagnostics, options);
  const compiled = lowerAgentConsiderations(library);
  const hasSelectors = Object.keys(library.selectors ?? {}).length > 0;
  const catalogWithoutFingerprint = {
    schemaVersion: 3,
    surfaceVisibility,
    parameterDefs,
    candidateParamDefs,
    library: strippedLibrary,
    compiled,
    profiles,
    bindingsBySeat,
    ...(hasSelectors ? { selectorCaps: {
      maxResultItems: MAX_SELECTOR_RESULT_ITEMS,
      maxProductPairs: MAX_SELECTOR_PRODUCT_PAIRS,
    } } : {}),
  } satisfies Omit<AgentPolicyCatalog, 'catalogFingerprint'>;

  return {
    ...catalogWithoutFingerprint,
    catalogFingerprint: fingerprintPolicyIr(catalogWithoutFingerprint),
  } satisfies AgentPolicyCatalog;
}

/**
 * Resolves the catalog-level surfaceVisibility from the observer catalog.
 *
 * Strategy: if all profiles reference the same observer, use that observer's surfaces.
 * Otherwise, use the catalog's default observer. When no observer catalog is provided,
 * falls back to built-in defaults.
 */
function resolveSurfaceVisibilityFromObserverCatalog(
  profiles: GameSpecAgentsSection['profiles'],
  options: LowerAgentsOptions,
): CompiledSurfaceCatalog {
  const catalog = options.observerCatalog;
  if (catalog !== undefined) {
    // Determine which observer to use for the catalog-level surfaceVisibility field.
    // Priority: 1) unanimous profile observer, 2) first user-defined observer, 3) catalog default.
    // The catalog-level field is a shared field used by the library compiler and runtime.
    const profileObserverNames = Object.values(profiles ?? {}).map((p) => p.observer);
    const uniqueObservers = new Set(profileObserverNames.filter((name): name is string => name !== undefined));
    let resolvedName: string;
    if (uniqueObservers.size === 1) {
      resolvedName = [...uniqueObservers][0]!;
    } else {
      // Use the first user-defined observer (not built-in), falling back to catalog default.
      const userDefinedNames = Object.keys(catalog.observers).filter(
        (name) => name !== 'omniscient' && name !== 'default',
      );
      resolvedName = userDefinedNames.length === 1 ? userDefinedNames[0]! : catalog.defaultObserverName;
    }
    const observer = catalog.observers[resolvedName];
    if (observer !== undefined) {
      return observer.surfaces;
    }
  }
  // Fallback: build defaults inline (same as the old lowerSurfaceVisibility).
  // This path is taken when there is no observability section.
  const globalVarDefaults: CompiledSurfaceVisibility = { current: 'public', preview: { visibility: 'public', allowWhenHiddenSampling: true } };
  const globalMarkerDefaults: CompiledSurfaceVisibility = {
    current: 'public',
    preview: { visibility: 'public', allowWhenHiddenSampling: false },
  };
  const perPlayerVarDefaults: CompiledSurfaceVisibility = { current: 'seatVisible', preview: { visibility: 'seatVisible', allowWhenHiddenSampling: true } };
  const hiddenDefaults: CompiledSurfaceVisibility = { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } };
  const globalVars: Record<string, CompiledSurfaceVisibility> = {};
  for (const id of options.globalVarIds ?? []) { globalVars[id] = globalVarDefaults; }
  const globalMarkers: Record<string, CompiledSurfaceVisibility> = {};
  for (const id of options.globalMarkerIds ?? []) { globalMarkers[id] = globalMarkerDefaults; }
  const perPlayerVars: Record<string, CompiledSurfaceVisibility> = {};
  for (const id of options.perPlayerVarIds ?? []) { perPlayerVars[id] = perPlayerVarDefaults; }
  const derivedMetrics: Record<string, CompiledSurfaceVisibility> = {};
  for (const id of options.policyMetricIds ?? []) { derivedMetrics[id] = hiddenDefaults; }
  return {
    globalVars,
    globalMarkers,
    perPlayerVars,
    derivedMetrics,
    victory: { currentMargin: hiddenDefaults, currentRank: hiddenDefaults },
    activeCardIdentity: hiddenDefaults,
    activeCardTag: hiddenDefaults,
    activeCardMetadata: hiddenDefaults,
    activeCardAnnotation: hiddenDefaults,
  };
}

export function lowerSurfaceVisibilityMap(
  knownIds: readonly string[],
  overrides: Readonly<Record<string, GameSpecPolicySurfaceVisibilityDef>> | undefined,
  diagnostics: Diagnostic[],
  path: string,
  defaults: CompiledSurfaceVisibility,
): Readonly<Record<string, CompiledSurfaceVisibility>> {
  const compiled: Record<string, CompiledSurfaceVisibility> = {};
  const knownIdSet = new Set(knownIds);
  for (const id of knownIds) {
    compiled[id] = lowerSurfaceVisibilityEntry(overrides?.[id], diagnostics, `${path}.${id}`, defaults);
  }
  for (const overrideId of Object.keys(overrides ?? {})) {
    if (knownIdSet.has(overrideId)) {
      continue;
    }
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_VISIBILITY_SURFACE_UNKNOWN,
      path: `${path}.${overrideId}`,
      severity: 'error',
      message: `Policy visibility override targets unknown surface "${overrideId}".`,
      suggestion: 'Declare visibility only for authored globalVars, perPlayerVars, or derivedMetrics that exist in the compiled policy surface.',
    });
  }
  return compiled;
}

export function lowerSurfaceVisibilityEntry(
  entry: GameSpecPolicySurfaceVisibilityDef | undefined,
  diagnostics: Diagnostic[],
  path: string,
  defaults: CompiledSurfaceVisibility,
): CompiledSurfaceVisibility {
  const current = normalizeSurfaceVisibilityClass(entry?.current, `${path}.current`, diagnostics) ?? defaults.current;
  const previewVisibility = normalizeSurfaceVisibilityClass(entry?.preview?.visibility, `${path}.preview.visibility`, diagnostics)
    ?? current;
  const allowWhenHiddenSampling = typeof entry?.preview?.allowWhenHiddenSampling === 'boolean'
    ? entry.preview.allowWhenHiddenSampling
    : defaults.preview.allowWhenHiddenSampling;
  return {
    current,
    preview: {
      visibility: previewVisibility,
      allowWhenHiddenSampling,
    },
  };
}

function normalizeSurfaceVisibilityClass(
  value: unknown,
  path: string,
  diagnostics: Diagnostic[],
): SurfaceVisibilityClass | null {
  if (value === undefined) {
    return null;
  }
  if (value === 'public' || value === 'seatVisible' || value === 'hidden') {
    return value;
  }
  diagnostics.push({
    code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_VISIBILITY_VALUE_INVALID,
    path,
    severity: 'error',
    message: `Policy visibility value "${String(value)}" is invalid.`,
    suggestion: 'Use one of: public, seatVisible, hidden.',
  });
  return null;
}

function addProfileFingerprints(
  profiles: Readonly<Record<string, LoweredAgentProfile>>,
): AgentPolicyCatalog['profiles'] {
  const fingerprinted: Record<string, CompiledAgentProfile> = {};

  for (const [profileId, profile] of Object.entries(profiles)) {
    fingerprinted[profileId] = {
      ...profile,
      fingerprint: fingerprintPolicyIr(profile),
    };
  }

  return fingerprinted;
}

function lowerParameterDefs(
  parameterDefs: GameSpecAgentsSection['parameters'],
  diagnostics: Diagnostic[],
): AgentPolicyCatalog['parameterDefs'] {
  const compiled: Record<string, CompiledAgentParameterDef> = {};

  for (const [parameterId, parameterDef] of Object.entries(parameterDefs ?? {})) {
    const compiledDef = lowerParameterDef(parameterId, parameterDef, diagnostics);
    if (compiledDef !== null) {
      compiled[parameterId] = compiledDef;
    }
  }

  return compiled;
}

function lowerCandidateParamDefs(
  actions: GameDef['actions'] | undefined,
  actionPipelines: GameDef['actionPipelines'] | undefined,
): AgentPolicyCatalog['candidateParamDefs'] {
  const compiled: Record<string, CompiledAgentCandidateParamDef> = {};
  if (actions === undefined && actionPipelines === undefined) {
    return compiled;
  }

  const candidateParamDefs = new Map<string, CompiledAgentCandidateParamDef | null>();
  const recordCandidateParamDef = (
    paramName: string,
    candidateParamDef: CompiledAgentCandidateParamDef | null,
  ): void => {
    const existingDef = candidateParamDefs.get(paramName);
    if (existingDef === null || candidateParamDef === null) {
      candidateParamDefs.set(paramName, null);
      return;
    }
    if (existingDef === undefined) {
      candidateParamDefs.set(paramName, candidateParamDef);
      return;
    }
    if (!candidateParamDefsEqual(existingDef, candidateParamDef)) {
      candidateParamDefs.set(paramName, null);
    }
  };

  for (const action of actions ?? []) {
    for (const param of action.params) {
      recordCandidateParamDef(param.name, classifyActionParamCandidateParamDef(param.domain));
    }
    for (const choiceSpec of collectChoiceBindingSpecs([...action.cost, ...action.effects])) {
      if (isDynamicBindingTemplate(choiceSpec.bind)) {
        continue;
      }
      recordCandidateParamDef(choiceSpec.bind, classifyChoiceBindingCandidateParamDef(choiceSpec));
    }
  }

  for (const pipeline of actionPipelines ?? []) {
    for (const choiceSpec of collectChoiceBindingSpecs([
      ...pipeline.costEffects,
      ...pipeline.stages.flatMap((stage) => stage.effects),
    ])) {
      if (isDynamicBindingTemplate(choiceSpec.bind)) {
        continue;
      }
      recordCandidateParamDef(choiceSpec.bind, classifyChoiceBindingCandidateParamDef(choiceSpec));
    }
  }

  for (const [paramName, candidateParamDef] of candidateParamDefs.entries()) {
    if (candidateParamDef !== null) {
      compiled[paramName] = candidateParamDef;
    }
  }

  return compiled;
}

function candidateParamDefsEqual(
  left: CompiledAgentCandidateParamDef,
  right: CompiledAgentCandidateParamDef,
): boolean {
  return left.type === right.type
    && left.cardinality?.kind === right.cardinality?.kind
    && left.cardinality?.n === right.cardinality?.n;
}

function isDynamicBindingTemplate(bind: string): boolean {
  return /\{[^{}]+\}/.test(bind);
}

function classifyActionParamCandidateParamDef(
  domain: GameDef['actions'][number]['params'][number]['domain'],
): CompiledAgentCandidateParamDef | null {
  const runtimeShapes = inferQueryRuntimeShapes(domain);
  if (runtimeShapes.length !== 1) {
    return null;
  }

  switch (runtimeShapes[0]) {
    case 'number':
      return { type: 'number' };
    case 'boolean':
      return { type: 'boolean' };
    case 'string':
    case 'token':
      return { type: 'id' };
    default:
      return null;
  }
}

function classifyChoiceBindingCandidateParamDef(
  choiceSpec: ReturnType<typeof collectChoiceBindingSpecs>[number],
): CompiledAgentCandidateParamDef | null {
  const runtimeShapes = inferQueryRuntimeShapes(choiceSpec.options);
  if (runtimeShapes.length !== 1) {
    return null;
  }

  if (choiceSpec.kind === 'chooseOne') {
    switch (runtimeShapes[0]) {
      case 'number':
        return { type: 'number' };
      case 'boolean':
        return { type: 'boolean' };
      case 'string':
      case 'token':
        return { type: 'id' };
      default:
        return null;
    }
  }

  if (choiceSpec.n === undefined) {
    return null;
  }

  switch (runtimeShapes[0]) {
    case 'string':
    case 'token':
      return {
        type: 'idList',
        cardinality: {
          kind: 'exact',
          n: choiceSpec.n,
        },
      };
    default:
      return null;
  }
}

function collectCandidateParamDefsForName(
  actions: GameDef['actions'] | undefined,
  actionPipelines: GameDef['actionPipelines'] | undefined,
  paramName: string,
): readonly (CompiledAgentCandidateParamDef | null)[] {
  const defs: Array<CompiledAgentCandidateParamDef | null> = [];
  for (const action of actions ?? []) {
    for (const param of action.params) {
      if (param.name === paramName) {
        defs.push(classifyActionParamCandidateParamDef(param.domain));
      }
    }
    for (const choiceSpec of collectChoiceBindingSpecs([...action.cost, ...action.effects])) {
      if (!isDynamicBindingTemplate(choiceSpec.bind) && choiceSpec.bind === paramName) {
        defs.push(classifyChoiceBindingCandidateParamDef(choiceSpec));
      }
    }
  }
  for (const pipeline of actionPipelines ?? []) {
    for (const choiceSpec of collectChoiceBindingSpecs([
      ...pipeline.costEffects,
      ...pipeline.stages.flatMap((stage) => stage.effects),
    ])) {
      if (!isDynamicBindingTemplate(choiceSpec.bind) && choiceSpec.bind === paramName) {
        defs.push(classifyChoiceBindingCandidateParamDef(choiceSpec));
      }
    }
  }
  return defs;
}

function actionDeclaresCandidateParam(action: GameDef['actions'][number], paramName: string): boolean {
  if (action.params.some((param) => param.name === paramName)) {
    return true;
  }
  return collectChoiceBindingSpecs([...action.cost, ...action.effects]).some(
    (choiceSpec) => !isDynamicBindingTemplate(choiceSpec.bind) && choiceSpec.bind === paramName,
  );
}

function lowerParameterDef(
  parameterId: string,
  parameterDef: GameSpecAgentParameterDef,
  diagnostics: Diagnostic[],
): CompiledAgentParameterDef | null {
  const path = `doc.agents.parameters.${parameterId}`;
  if (!isAgentParameterType(parameterDef.type)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PARAMETER_TYPE_INVALID,
      path: `${path}.type`,
      severity: 'error',
      message: `agents parameter "${parameterId}" has unsupported type "${String(parameterDef.type)}".`,
      suggestion: `Use one of: ${AGENT_PARAMETER_TYPES.join(', ')}.`,
    });
    return null;
  }

  if (parameterDef.min !== undefined || parameterDef.max !== undefined) {
    if (!validateNumericBounds(parameterDef.type, parameterDef.min, parameterDef.max, `${path}`, diagnostics)) {
      return null;
    }
  } else if (
    parameterDef.tunable === true
    && (parameterDef.type === 'number' || parameterDef.type === 'integer')
  ) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PARAMETER_BOUNDS_INVALID,
      path,
      severity: 'error',
      message: `Tunable ${parameterDef.type} parameter "${parameterId}" must declare finite min and max bounds.`,
      suggestion: 'Provide finite min and max values for tunable numeric parameters.',
    });
    return null;
  }

  let values: readonly string[] | null | undefined;
  if (parameterDef.type === 'enum') {
    values = normalizeStringList(parameterDef.values, `${path}.values`, 'values', diagnostics);
    if (values === null) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PARAMETER_VALUES_INVALID,
        path: `${path}.values`,
        severity: 'error',
        message: `Enum parameter "${parameterId}" must declare a non-empty unique values list.`,
        suggestion: 'Provide a list of unique non-empty string values.',
      });
      return null;
    }
  }

  let allowedIds: readonly string[] | null | undefined;
  if (parameterDef.type === 'idOrder') {
    allowedIds = normalizeStringList(parameterDef.allowedIds, `${path}.allowedIds`, 'allowed ids', diagnostics);
    if (allowedIds === null) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PARAMETER_ALLOWED_IDS_INVALID,
        path: `${path}.allowedIds`,
        severity: 'error',
        message: `idOrder parameter "${parameterId}" must declare a non-empty unique allowedIds list.`,
        suggestion: 'Provide a list of unique non-empty ids that the parameter may order.',
      });
      return null;
    }
  }

  let normalizedDefault: AgentParameterValue | null | undefined;
  if (parameterDef.default !== undefined) {
    normalizedDefault = normalizeParameterValue(parameterDef, parameterDef.default, `${path}.default`, diagnostics);
    if (normalizedDefault === null) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PARAMETER_DEFAULT_INVALID,
        path: `${path}.default`,
        severity: 'error',
        message: `Default value for agents parameter "${parameterId}" does not match its declared constraints.`,
        suggestion: 'Provide a default value that matches the parameter type and declared bounds or allowed ids.',
      });
      return null;
    }
  }

  return {
    type: parameterDef.type,
    required: parameterDef.default === undefined,
    tunable: parameterDef.tunable === true,
    ...(parameterDef.min === undefined ? {} : { min: parameterDef.min }),
    ...(parameterDef.max === undefined ? {} : { max: parameterDef.max }),
    ...(values == null ? {} : { values }),
    ...(allowedIds == null ? {} : { allowedIds }),
    ...(normalizedDefault == null ? {} : { default: normalizedDefault }),
  };
}

function lowerProfiles(
  profiles: GameSpecAgentsSection['profiles'],
  authoredLibrary: GameSpecAgentLibrary | undefined,
  library: CompiledAgentLibraryIndex,
  parameterDefs: AgentPolicyCatalog['parameterDefs'],
  diagnostics: Diagnostic[],
): Record<string, LoweredAgentProfile> {
  const compiled: Record<string, LoweredAgentProfile> = {};

  for (const [profileId, profileDef] of Object.entries(profiles ?? {})) {
    const compiledProfile = lowerProfile(profileId, profileDef, authoredLibrary, library, parameterDefs, diagnostics);
    if (compiledProfile !== null) {
      compiled[profileId] = compiledProfile;
    }
  }

  return compiled;
}

function lowerProfile(
  profileId: string,
  profileDef: GameSpecAgentProfileDef,
  authoredLibrary: GameSpecAgentLibrary | undefined,
  library: CompiledAgentLibraryIndex,
  parameterDefs: AgentPolicyCatalog['parameterDefs'],
  diagnostics: Diagnostic[],
): LoweredAgentProfile | null {
  const path = `doc.agents.profiles.${profileId}`;
  const compiledParams: Record<string, AgentParameterValue> = {};
  let hasError = false;

  for (const [parameterId, value] of Object.entries(profileDef.params ?? {})) {
    const parameterDef = parameterDefs[parameterId];
    if (parameterDef === undefined) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PROFILE_PARAM_UNKNOWN,
        path: `${path}.params.${parameterId}`,
        severity: 'error',
        message: `Profile "${profileId}" references unknown parameter "${parameterId}".`,
        suggestion: 'Declare the parameter in doc.agents.parameters before using it in a profile.',
      });
      hasError = true;
      continue;
    }

    const normalizedValue = normalizeCompiledParameterValue(parameterDef, value, `${path}.params.${parameterId}`, diagnostics);
    if (normalizedValue === null) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PROFILE_PARAM_VALUE_INVALID,
        path: `${path}.params.${parameterId}`,
        severity: 'error',
        message: `Profile "${profileId}" sets invalid value for parameter "${parameterId}".`,
        suggestion: 'Use a value that matches the parameter type and declared constraints.',
      });
      hasError = true;
      continue;
    }

    compiledParams[parameterId] = normalizedValue;
  }

  for (const [parameterId, parameterDef] of Object.entries(parameterDefs)) {
    if (compiledParams[parameterId] !== undefined || parameterDef.default !== undefined) {
      continue;
    }

    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PROFILE_PARAM_MISSING,
      path: `${path}.params`,
      severity: 'error',
      message: `Profile "${profileId}" is missing required parameter "${parameterId}".`,
      suggestion: 'Set the parameter in profile.params or define a default in doc.agents.parameters.',
    });
    hasError = true;
  }

  const loweredUse = Object.fromEntries(
    AGENT_POLICY_PROFILE_USE_BUCKETS.map((key) => [
      key,
      lowerProfileUseIds(
        profileId,
        key,
        profileDef.use[key],
        authoredLibrary?.[AGENT_POLICY_PROFILE_USE_TO_LIBRARY_BUCKET[key]],
        diagnostics,
      ),
    ]),
  ) as Pick<CompiledAgentProfile['use'], 'considerations' | 'guardrails' | 'strategyModules' | 'turnShapeEvaluators' | 'tieBreakers'>
    & { readonly planTemplates: readonly string[] };
  const use: CompiledAgentProfile['use'] = {
    considerations: loweredUse.considerations,
    ...(loweredUse.guardrails?.length === 0 ? {} : { guardrails: loweredUse.guardrails }),
    ...(loweredUse.strategyModules?.length === 0 ? {} : { strategyModules: loweredUse.strategyModules }),
    ...(loweredUse.turnShapeEvaluators?.length === 0 ? {} : { turnShapeEvaluators: loweredUse.turnShapeEvaluators }),
    tieBreakers: loweredUse.tieBreakers,
  };
  const authoredPlanTemplateUse = profileDef.use.planTemplates === undefined ? undefined : loweredUse.planTemplates;
  const preview = lowerPreviewConfig(profileId, profileDef, diagnostics);
  const selection = lowerSelectionConfig(profileId, profileDef, diagnostics);
  const selector = lowerSelectorProfileConfig(profileId, profileDef, diagnostics);
  const strategyModules = lowerStrategyModulesProfileConfig(profileId, profileDef, diagnostics);
  const guardrails = lowerGuardrailsProfileConfig(profileId, profileDef, diagnostics);

  const plan = buildProfilePlan(profileId, use, authoredPlanTemplateUse, library, diagnostics);
  if (plan !== null && (plan.selectors?.length ?? 0) > 0) {
    validateProfileSelectorCostClass(profileId, selector?.maxCostClass ?? 'preview', plan.selectors ?? [], library, diagnostics);
  }
  if (plan !== null && (plan.strategyModules?.length ?? 0) > 0) {
    validateProfileModuleCostClass(
      profileId,
      strategyModules?.maxCostClass ?? 'preview',
      plan.strategyModules ?? [],
      library,
      diagnostics,
    );
  }
  if (plan !== null && (plan.guardrails?.length ?? 0) > 0) {
    validateProfileGuardrailCostClass(profileId, guardrails?.maxCostClass ?? 'preview', plan.guardrails ?? [], library, diagnostics);
  }
  if (plan !== null && (plan.turnShapeEvaluators?.length ?? 0) > 0) {
    validateProfileTurnShapeCostClass(profileId, 'preview', plan.turnShapeEvaluators ?? [], library, diagnostics);
  }

  if (hasError || diagnosticsContainProfileUseErrors(profileId, diagnostics) || plan === null) {
    return null;
  }

  // Resolve observer binding: set observerName if profile specifies an observer
  const resolvedObserverName = profileDef.observer !== undefined ? profileDef.observer : undefined;

  return {
    ...(resolvedObserverName !== undefined ? { observerName: resolvedObserverName } : {}),
    params: compiledParams,
    use,
    preview: preview ?? { mode: 'exactWorld' },
    selection: selection ?? { mode: 'argmax' },
    ...(selector === undefined ? {} : { selector }),
    ...(strategyModules === undefined ? {} : { strategyModules }),
    ...(guardrails === undefined ? {} : { guardrails }),
    plan,
  };
}

function lowerProfileUseIds(
  profileId: string,
  key: ProfileUseKey,
  authoredIds: readonly string[] | undefined,
  authoredLibraryBucket: Readonly<Record<string, unknown>> | undefined,
  diagnostics: Diagnostic[],
): readonly string[] {
  const path = `doc.agents.profiles.${profileId}.use.${key}`;
  const seen = new Set<string>();
  const lowered: string[] = [];

  for (const [index, id] of (authoredIds ?? []).entries()) {
    if (seen.has(id)) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PROFILE_USE_DUPLICATE_ID,
        path: `${path}.${index}`,
        severity: 'error',
        message: `Profile "${profileId}" contains duplicate ${key} entry "${id}".`,
        suggestion: `Keep each ${key} library id unique within the profile order.`,
      });
      continue;
    }

    if (authoredLibraryBucket?.[id] === undefined) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PROFILE_USE_UNKNOWN_ID,
        path: `${path}.${index}`,
        severity: 'error',
        message: `Profile "${profileId}" references unknown ${key} id "${id}".`,
        suggestion: `Define "${id}" in doc.agents.library.${key} before referencing it from a profile.`,
      });
      continue;
    }

    seen.add(id);
    lowered.push(id);
  }

  return lowered;
}

function lowerPreviewConfig(
  profileId: string,
  profileDef: GameSpecAgentProfileDef,
  diagnostics: Diagnostic[],
): CompiledAgentProfile['preview'] | undefined {
  const authored = profileDef.preview;
  if (authored === undefined) {
    return { mode: 'exactWorld' };
  }

  const path = `doc.agents.profiles.${profileId}.preview`;
  const {
    mode,
    completion,
    fallbackCompletionPolicy,
    completionDepthCap,
    budget,
    inner,
    grantFlowContinuation,
    phase1,
    phase1CompletionsPerAction,
  } = authored;
  const legacyPreviewTopKey = 'top' + 'K';
  const legacyPreviewTopValue = (authored as Readonly<Record<string, unknown>>)[legacyPreviewTopKey];

  if (mode === undefined) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_MODE_MISSING,
      path: `${path}.mode`,
      severity: 'error',
      message: `Profile "${profileId}" preview.mode is required when preview is present.`,
      suggestion: 'Set preview.mode to exactWorld, tolerateStochastic, or disabled.',
    });
    return undefined;
  }
  if (typeof mode !== 'string') {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_MODE_INVALID,
      path: `${path}.mode`,
      severity: 'error',
      message: `Profile "${profileId}" preview.mode must be a string, got ${typeof mode}.`,
      suggestion: 'Set preview.mode to exactWorld, tolerateStochastic, or disabled.',
    });
    return undefined;
  }
  if (mode === 'infoSetSample' || mode === 'enumeratePublicChance') {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_MODE_RESERVED,
      path: `${path}.mode`,
      severity: 'error',
      message: `Profile "${profileId}" preview.mode "${mode}" is reserved for future implementation and is not supported yet.`,
      suggestion: 'Use preview.mode exactWorld, tolerateStochastic, or disabled.',
    });
    return undefined;
  }
  if (mode !== 'exactWorld' && mode !== 'tolerateStochastic' && mode !== 'disabled') {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_MODE_INVALID,
      path: `${path}.mode`,
      severity: 'error',
      message: `Profile "${profileId}" preview.mode "${mode}" is invalid.`,
      suggestion: 'Use preview.mode exactWorld, tolerateStochastic, or disabled.',
    });
    return undefined;
  }

  if (
    completion !== undefined
    && (typeof completion !== 'string' || (completion !== 'greedy' && completion !== 'policyGuided'))
  ) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_COMPLETION_INVALID,
      path: `${path}.completion`,
      severity: 'error',
      message: `Profile "${profileId}" preview.completion must be greedy or policyGuided, got ${JSON.stringify(completion)}.`,
      suggestion: 'Set preview.completion to greedy or policyGuided.',
    });
    return undefined;
  }

  if (
    fallbackCompletionPolicy !== undefined
    && (
      typeof fallbackCompletionPolicy !== 'string'
      || (fallbackCompletionPolicy !== 'greedy' && fallbackCompletionPolicy !== 'fail')
    )
  ) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_FALLBACK_COMPLETION_INVALID,
      path: `${path}.fallbackCompletionPolicy`,
      severity: 'error',
      message: `Profile "${profileId}" preview.fallbackCompletionPolicy must be greedy or fail, got ${JSON.stringify(fallbackCompletionPolicy)}.`,
      suggestion: 'Set preview.fallbackCompletionPolicy to greedy or fail.',
    });
    return undefined;
  }

  if (fallbackCompletionPolicy !== undefined && completion !== 'policyGuided') {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_FALLBACK_COMPLETION_INVALID,
      path: `${path}.fallbackCompletionPolicy`,
      severity: 'error',
      message: `Profile "${profileId}" preview.fallbackCompletionPolicy only applies when preview.completion is policyGuided.`,
      suggestion: 'Remove preview.fallbackCompletionPolicy or set preview.completion to policyGuided.',
    });
    return undefined;
  }

  if (
    completionDepthCap !== undefined
    && (
      typeof completionDepthCap !== 'number'
      || !Number.isSafeInteger(completionDepthCap)
      || completionDepthCap <= 0
    )
  ) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_COMPLETION_DEPTH_CAP_INVALID,
      path: `${path}.completionDepthCap`,
      severity: 'error',
      message: `Profile "${profileId}" preview.completionDepthCap must be a positive safe integer, got ${String(completionDepthCap)}.`,
      suggestion: 'Set preview.completionDepthCap to a positive integer such as 8.',
    });
    return undefined;
  }

  if (legacyPreviewTopValue !== undefined) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_TOPK_INVALID,
      path: `${path}.${legacyPreviewTopKey}`,
      severity: 'error',
      message: `Profile "${profileId}" preview.${legacyPreviewTopKey} is no longer supported. Use preview.budget (Spec 157).`,
      suggestion: 'Migrate to preview.budget: { strategy: balancedCoverage, fullCandidateCap, minPerGroup }.',
    });
    return undefined;
  }

  const loweredBudget = lowerPreviewBudgetConfig(profileId, path, budget, mode, diagnostics);
  if (loweredBudget === undefined && budget !== undefined) {
    return undefined;
  }
  const loweredInner = lowerPreviewInnerConfig(profileId, path, inner, diagnostics);
  if (loweredInner === undefined && inner !== undefined) {
    return undefined;
  }
  const loweredGrantFlowContinuation = lowerPreviewGrantFlowContinuationConfig(
    profileId,
    path,
    grantFlowContinuation,
    diagnostics,
  );
  if (loweredGrantFlowContinuation === undefined && grantFlowContinuation !== undefined) {
    return undefined;
  }

  if (phase1 !== undefined && typeof phase1 !== 'boolean') {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_PHASE1_INVALID,
      path: `${path}.phase1`,
      severity: 'error',
      message: `Profile "${profileId}" preview.phase1 must be a boolean, got ${typeof phase1}.`,
      suggestion: 'Set preview.phase1 to true or false.',
    });
    return undefined;
  }

  if (
    phase1CompletionsPerAction !== undefined
    && (
      typeof phase1CompletionsPerAction !== 'number'
      || !Number.isSafeInteger(phase1CompletionsPerAction)
      || phase1CompletionsPerAction <= 0
    )
  ) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_PHASE1_COMPLETIONS_INVALID,
      path: `${path}.phase1CompletionsPerAction`,
      severity: 'error',
      message: `Profile "${profileId}" preview.phase1CompletionsPerAction must be a positive safe integer, got ${String(phase1CompletionsPerAction)}.`,
      suggestion: 'Set preview.phase1CompletionsPerAction to a positive integer such as 1 or 3.',
    });
    return undefined;
  }

  const loweredPhase1 = phase1 ?? false;
  const loweredPhase1CompletionsPerAction = phase1CompletionsPerAction ?? 1;
  if (!loweredPhase1 && phase1CompletionsPerAction !== undefined) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_PHASE1_COMPLETIONS_UNUSED,
      path: `${path}.phase1CompletionsPerAction`,
      severity: 'warning',
      message: `Profile "${profileId}" preview.phase1CompletionsPerAction has no effect unless preview.phase1 is true.`,
      suggestion: 'Remove preview.phase1CompletionsPerAction or set preview.phase1 to true.',
    });
  }

  return {
    mode,
    ...(completion === undefined ? {} : { completion }),
    ...(fallbackCompletionPolicy === undefined ? {} : { fallbackCompletionPolicy }),
    ...(completionDepthCap === undefined ? {} : { completionDepthCap }),
    ...(loweredBudget === undefined ? {} : { budget: loweredBudget }),
    ...(loweredInner === undefined ? {} : { inner: loweredInner }),
    ...(loweredGrantFlowContinuation === undefined
      ? {}
      : { grantFlowContinuation: loweredGrantFlowContinuation }),
    phase1: loweredPhase1,
    phase1CompletionsPerAction: loweredPhase1CompletionsPerAction,
  };
}

function lowerPreviewGrantFlowContinuationConfig(
  profileId: string,
  path: string,
  block: NonNullable<GameSpecAgentProfileDef['preview']>['grantFlowContinuation'] | undefined,
  diagnostics: Diagnostic[],
): CompiledAgentPreviewGrantFlowContinuationConfig | undefined {
  if (block === undefined) {
    return undefined;
  }
  if (block === null || typeof block !== 'object' || Array.isArray(block)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_POST_GRANT_INVALID,
      path: `${path}.grantFlowContinuation`,
      severity: 'error',
      message: `Profile "${profileId}" preview.grantFlowContinuation must be an object.`,
      suggestion: 'Use preview.grantFlowContinuation with enabled, postGrantDepthCap, postGrantCapClass, freeOperationDepthCap, and freeOperationCapClass.',
    });
    return undefined;
  }

  const enabled = block.enabled ?? false;
  if (typeof enabled !== 'boolean') {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_POST_GRANT_INVALID,
      path: `${path}.grantFlowContinuation.enabled`,
      severity: 'error',
      message: `Profile "${profileId}" preview.grantFlowContinuation.enabled must be a boolean, got ${typeof enabled}.`,
      suggestion: 'Set preview.grantFlowContinuation.enabled to true or false.',
    });
    return undefined;
  }
  if (!enabled) {
    return {
      enabled: false,
      postGrantDepthCap: POST_GRANT_CAP_CLASS_BUDGETS.postGrant16,
      postGrantCapClass: 'postGrant16',
      freeOperationDepthCap: GRANT_FLOW_CAP_CLASS_BUDGETS.grantFlow16,
      freeOperationCapClass: 'grantFlow16',
    };
  }

  const postGrantDepthCap = block.postGrantDepthCap;
  if (
    typeof postGrantDepthCap !== 'number'
    || !Number.isSafeInteger(postGrantDepthCap)
    || postGrantDepthCap <= 0
  ) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_POST_GRANT_EXTRA_DEPTH_CAP_INVALID,
      path: `${path}.grantFlowContinuation.postGrantDepthCap`,
      severity: 'error',
      message: `Profile "${profileId}" preview.grantFlowContinuation.postGrantDepthCap must be a positive safe integer when grantFlowContinuation is enabled, got ${String(postGrantDepthCap)}.`,
      suggestion: 'Set preview.grantFlowContinuation.postGrantDepthCap to the selected post-grant cap-class budget, such as 4.',
    });
    return undefined;
  }

  const postGrantCapClass = block.postGrantCapClass;
  if (typeof postGrantCapClass !== 'string' || !PREVIEW_POST_GRANT_CAP_CLASSES.has(postGrantCapClass)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_POST_GRANT_CAP_CLASS_UNKNOWN,
      path: `${path}.grantFlowContinuation.postGrantCapClass`,
      severity: 'error',
      message: `Profile "${profileId}" preview.grantFlowContinuation.postGrantCapClass must be postGrant16, got ${String(postGrantCapClass)}.`,
      suggestion: 'Set preview.grantFlowContinuation.postGrantCapClass to postGrant16.',
    });
    return undefined;
  }

  const expectedPostGrantCap = POST_GRANT_CAP_CLASS_BUDGETS[postGrantCapClass as AgentPreviewPostGrantCapClass];
  if (postGrantDepthCap !== expectedPostGrantCap) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_POST_GRANT_EXTRA_DEPTH_CAP_INVALID,
      path: `${path}.grantFlowContinuation.postGrantDepthCap`,
      severity: 'error',
      message: `Profile "${profileId}" preview.grantFlowContinuation.postGrantDepthCap ${postGrantDepthCap} must equal postGrantCapClass ${postGrantCapClass} budget ${expectedPostGrantCap}.`,
      suggestion: `Set preview.grantFlowContinuation.postGrantDepthCap to ${expectedPostGrantCap} for postGrantCapClass ${postGrantCapClass}.`,
    });
    return undefined;
  }

  const freeOperationDepthCap = block.freeOperationDepthCap;
  if (
    typeof freeOperationDepthCap !== 'number'
    || !Number.isSafeInteger(freeOperationDepthCap)
    || freeOperationDepthCap <= 0
  ) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_POST_GRANT_EXTRA_DEPTH_CAP_INVALID,
      path: `${path}.grantFlowContinuation.freeOperationDepthCap`,
      severity: 'error',
      message: `Profile "${profileId}" preview.grantFlowContinuation.freeOperationDepthCap must be a positive safe integer when grantFlowContinuation is enabled, got ${String(freeOperationDepthCap)}.`,
      suggestion: 'Set preview.grantFlowContinuation.freeOperationDepthCap to the selected grant-flow cap-class budget, such as 16.',
    });
    return undefined;
  }

  const freeOperationCapClass = block.freeOperationCapClass;
  if (typeof freeOperationCapClass !== 'string' || !PREVIEW_GRANT_FLOW_CAP_CLASSES.has(freeOperationCapClass)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_POST_GRANT_CAP_CLASS_UNKNOWN,
      path: `${path}.grantFlowContinuation.freeOperationCapClass`,
      severity: 'error',
      message: `Profile "${profileId}" preview.grantFlowContinuation.freeOperationCapClass must be grantFlow16 or grantFlow32, got ${String(freeOperationCapClass)}.`,
      suggestion: 'Set preview.grantFlowContinuation.freeOperationCapClass to grantFlow16 or grantFlow32.',
    });
    return undefined;
  }

  const expectedFreeOperationCap = GRANT_FLOW_CAP_CLASS_BUDGETS[freeOperationCapClass as AgentPreviewGrantFlowCapClass];
  if (freeOperationDepthCap !== expectedFreeOperationCap) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_POST_GRANT_EXTRA_DEPTH_CAP_INVALID,
      path: `${path}.grantFlowContinuation.freeOperationDepthCap`,
      severity: 'error',
      message: `Profile "${profileId}" preview.grantFlowContinuation.freeOperationDepthCap ${freeOperationDepthCap} must equal freeOperationCapClass ${freeOperationCapClass} budget ${expectedFreeOperationCap}.`,
      suggestion: `Set preview.grantFlowContinuation.freeOperationDepthCap to ${expectedFreeOperationCap} for freeOperationCapClass ${freeOperationCapClass}.`,
    });
    return undefined;
  }

  return {
    enabled: true,
    postGrantDepthCap,
    postGrantCapClass: postGrantCapClass as AgentPreviewPostGrantCapClass,
    freeOperationDepthCap,
    freeOperationCapClass: freeOperationCapClass as AgentPreviewGrantFlowCapClass,
  };
}

function lowerPreviewInnerConfig(
  profileId: string,
  path: string,
  inner: NonNullable<GameSpecAgentProfileDef['preview']>['inner'] | undefined,
  diagnostics: Diagnostic[],
): CompiledAgentPreviewInnerConfig | undefined {
  if (inner === undefined) {
    return undefined;
  }
  if (inner === null || typeof inner !== 'object' || Array.isArray(inner)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_INNER_INVALID,
      path: `${path}.inner`,
      severity: 'error',
      message: `Profile "${profileId}" preview.inner must be an object.`,
      suggestion: 'Use preview.inner: { chooseOne, chooseNStep, maxOptions, chooseNBeamWidth, depthCap }.',
    });
    return undefined;
  }

  const { chooseOne, chooseNStep, maxOptions, chooseNBeamWidth, depthCap, strategy, capClass } = inner;
  if (chooseOne !== undefined && typeof chooseOne !== 'boolean') {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_INNER_INVALID,
      path: `${path}.inner.chooseOne`,
      severity: 'error',
      message: `Profile "${profileId}" preview.inner.chooseOne must be a boolean, got ${typeof chooseOne}.`,
      suggestion: 'Set preview.inner.chooseOne to true or false.',
    });
    return undefined;
  }
  if (chooseNStep !== undefined && typeof chooseNStep !== 'boolean') {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_INNER_INVALID,
      path: `${path}.inner.chooseNStep`,
      severity: 'error',
      message: `Profile "${profileId}" preview.inner.chooseNStep must be a boolean, got ${typeof chooseNStep}.`,
      suggestion: 'Set preview.inner.chooseNStep to true or false.',
    });
    return undefined;
  }

  const loweredMaxOptions = lowerPreviewInnerPositiveInteger(profileId, path, 'maxOptions', maxOptions, diagnostics);
  const loweredChooseNBeamWidth = lowerPreviewInnerPositiveInteger(
    profileId,
    path,
    'chooseNBeamWidth',
    chooseNBeamWidth,
    diagnostics,
  );
  const loweredDepthCap = lowerPreviewInnerPositiveInteger(profileId, path, 'depthCap', depthCap, diagnostics);
  if (loweredMaxOptions === undefined || loweredChooseNBeamWidth === undefined || loweredDepthCap === undefined) {
    return undefined;
  }

  const loweredStrategy = lowerPreviewInnerStrategy(profileId, path, strategy, diagnostics);
  const loweredCapClass = lowerPreviewInnerCapClass(profileId, path, capClass, diagnostics);
  if (loweredStrategy === undefined || loweredCapClass === undefined) {
    return undefined;
  }
  const capClassBudget = CAP_CLASS_BUDGETS[loweredCapClass];
  const loweredContinuedDeepening = lowerContinuedDeepeningConfig(
    profileId,
    path,
    inner.continuedDeepening,
    diagnostics,
  );
  if (loweredStrategy === 'continuedDeepening' && loweredContinuedDeepening === undefined) {
    return undefined;
  }
  if (loweredStrategy === 'singlePass' && loweredContinuedDeepening !== undefined) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_INNER_INVALID,
      path: `${path}.inner.continuedDeepening`,
      severity: 'error',
      message: `Profile "${profileId}" preview.inner.continuedDeepening is only valid when strategy is continuedDeepening.`,
      suggestion: 'Remove preview.inner.continuedDeepening or set preview.inner.strategy to continuedDeepening.',
    });
    return undefined;
  }

  const cost = chooseNStep === true
    ? loweredMaxOptions * (1 + loweredChooseNBeamWidth * loweredMaxOptions * Math.max(0, loweredDepthCap - 1))
    : loweredMaxOptions * loweredChooseNBeamWidth * loweredDepthCap;
  if (loweredStrategy === 'continuedDeepening') {
    if (loweredContinuedDeepening === undefined) {
      return undefined;
    }
    const continuedDeepening = loweredContinuedDeepening;
    const broadDepthCap = continuedDeepening.broad.depthCap;
    const deepDepthCap = continuedDeepening.deep.depthCap;
    if (loweredDepthCap !== broadDepthCap) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_DEPTHCAP_MISMATCH,
        path: `${path}.inner.depthCap`,
        severity: 'error',
        message: `Profile "${profileId}" preview.inner.depthCap ${loweredDepthCap} must equal continuedDeepening.broad.depthCap ${broadDepthCap}.`,
        suggestion: 'Set preview.inner.depthCap to the same positive integer as preview.inner.continuedDeepening.broad.depthCap.',
      });
      return undefined;
    }
    const innerOptionCap = loweredMaxOptions;
    const rootsWithinCap = loweredMaxOptions;
    const broadCost = loweredMaxOptions * (
      1 + loweredChooseNBeamWidth * innerOptionCap * Math.max(0, broadDepthCap - 1)
    );
    const incrementalDeepCost = rootsWithinCap * loweredChooseNBeamWidth * innerOptionCap
      * Math.max(0, deepDepthCap - broadDepthCap);
    const totalCost = broadCost + incrementalDeepCost;
    if (!Number.isSafeInteger(totalCost) || totalCost > capClassBudget) {
      const breachAmount = totalCost - capClassBudget;
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_DEEP_COST_EXCEEDS_CAP_CLASS,
        path: `${path}.inner.continuedDeepening`,
        severity: 'error',
        message: `Profile "${profileId}" preview.inner continuedDeepening totalCost ${totalCost} exceeds capClass ${loweredCapClass} budget ${capClassBudget}; M=${loweredMaxOptions}, B=${loweredChooseNBeamWidth}, I=${innerOptionCap}, Db=${broadDepthCap}, Dd=${deepDepthCap}, broadCost=${broadCost}, incrementalDeepCost=${incrementalDeepCost}, breachAmount=${breachAmount}.`,
        suggestion: 'Reduce maxOptions, chooseNBeamWidth, broad.depthCap, or deep.depthCap, or choose a larger supported capClass.',
      });
      return undefined;
    }
  } else if (!Number.isSafeInteger(cost) || cost > capClassBudget) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_INNER_COST_EXCEEDS_HARD_CAP,
      path: `${path}.inner`,
      severity: 'error',
      message: `Profile "${profileId}" preview.inner cost ${cost} exceeds capClass ${loweredCapClass} budget ${capClassBudget}.`,
      suggestion: chooseNStep === true
        ? 'When chooseNStep is enabled, the per-root-option forced continuation beam costs maxOptions * (1 + chooseNBeamWidth * maxOptions * max(0, depthCap - 1)). Reduce maxOptions, chooseNBeamWidth, depthCap, or choose a larger supported capClass.'
        : `Set maxOptions * chooseNBeamWidth * depthCap to ${capClassBudget} or less for the selected capClass.`,
    });
    return undefined;
  }

  return {
    chooseOne: chooseOne ?? false,
    chooseNStep: chooseNStep ?? false,
    maxOptions: loweredMaxOptions,
    chooseNBeamWidth: loweredChooseNBeamWidth,
    depthCap: loweredDepthCap,
    strategy: loweredStrategy,
    capClass: loweredCapClass,
    ...(loweredContinuedDeepening === undefined ? {} : { continuedDeepening: loweredContinuedDeepening }),
  };
}

function lowerPreviewInnerStrategy(
  profileId: string,
  path: string,
  value: string | undefined,
  diagnostics: Diagnostic[],
): 'singlePass' | 'continuedDeepening' | undefined {
  if (value === undefined) {
    return 'singlePass';
  }
  if (typeof value !== 'string' || !PREVIEW_INNER_STRATEGIES.has(value)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_UNKNOWN_STRATEGY,
      path: `${path}.inner.strategy`,
      severity: 'error',
      message: `Profile "${profileId}" preview.inner.strategy must be singlePass or continuedDeepening, got ${String(value)}.`,
      suggestion: 'Set preview.inner.strategy to singlePass or continuedDeepening.',
    });
    return undefined;
  }
  return value as 'singlePass' | 'continuedDeepening';
}

function lowerPreviewInnerCapClass(
  profileId: string,
  path: string,
  value: string | undefined,
  diagnostics: Diagnostic[],
): CapClass | undefined {
  if (value === undefined) {
    return 'standard256';
  }
  if (typeof value !== 'string' || !PREVIEW_INNER_CAP_CLASSES.has(value)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_UNKNOWN_CAP_CLASS,
      path: `${path}.inner.capClass`,
      severity: 'error',
      message: `Profile "${profileId}" preview.inner.capClass must be standard256 or deep1024, got ${String(value)}.`,
      suggestion: 'Set preview.inner.capClass to standard256 or deep1024.',
    });
    return undefined;
  }
  return value as CapClass;
}

function lowerContinuedDeepeningConfig(
  profileId: string,
  path: string,
  block: NonNullable<NonNullable<GameSpecAgentProfileDef['preview']>['inner']>['continuedDeepening'],
  diagnostics: Diagnostic[],
): ContinuedDeepeningConfig | undefined {
  if (block === undefined) {
    return undefined;
  }
  if (block === null || typeof block !== 'object' || Array.isArray(block)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_INNER_INVALID,
      path: `${path}.inner.continuedDeepening`,
      severity: 'error',
      message: `Profile "${profileId}" preview.inner.continuedDeepening must be an object.`,
      suggestion: 'Use preview.inner.continuedDeepening with broad.depthCap and deep settings.',
    });
    return undefined;
  }

  const broadDepthCap = lowerPreviewInnerContinuedDepthCap(
    profileId,
    path,
    'continuedDeepening.broad.depthCap',
    block.broad?.depthCap,
    diagnostics,
  );
  const deepDepthCap = lowerPreviewInnerContinuedDepthCap(
    profileId,
    path,
    'continuedDeepening.deep.depthCap',
    block.deep?.depthCap,
    diagnostics,
  );
  if (broadDepthCap === undefined || deepDepthCap === undefined) {
    return undefined;
  }
  if (deepDepthCap < broadDepthCap) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_INNER_INVALID,
      path: `${path}.inner.continuedDeepening.deep.depthCap`,
      severity: 'error',
      message: `Profile "${profileId}" preview.inner.continuedDeepening.deep.depthCap ${deepDepthCap} must be at least broad.depthCap ${broadDepthCap}.`,
      suggestion: 'Set deep.depthCap greater than or equal to broad.depthCap.',
    });
    return undefined;
  }

  const trigger = block.deep?.trigger;
  if (!Array.isArray(trigger) || trigger.length === 0 || !trigger.every((entry) => (
    typeof entry === 'string' && DEEP_TRIGGERS.has(entry)
  ))) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_INNER_INVALID,
      path: `${path}.inner.continuedDeepening.deep.trigger`,
      severity: 'error',
      message: `Profile "${profileId}" preview.inner.continuedDeepening.deep.trigger must be a non-empty array of supported deep trigger ids.`,
      suggestion: 'Use allRequestedRefsDepthCapped, allReadyValuesUniform, or both.',
    });
    return undefined;
  }
  if (block.deep?.rootPolicy !== 'allRootsWithinCap') {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_INNER_INVALID,
      path: `${path}.inner.continuedDeepening.deep.rootPolicy`,
      severity: 'error',
      message: `Profile "${profileId}" preview.inner.continuedDeepening.deep.rootPolicy must be allRootsWithinCap.`,
      suggestion: 'Set preview.inner.continuedDeepening.deep.rootPolicy to allRootsWithinCap.',
    });
    return undefined;
  }

  return {
    broad: { depthCap: broadDepthCap },
    deep: {
      depthCap: deepDepthCap,
      trigger: trigger as readonly DeepTrigger[],
      rootPolicy: block.deep.rootPolicy,
    },
  };
}

function lowerPreviewInnerContinuedDepthCap(
  profileId: string,
  path: string,
  key: string,
  value: number | undefined,
  diagnostics: Diagnostic[],
): number | undefined {
  if (!isPositiveSafeInteger(value)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_INNER_INVALID,
      path: `${path}.inner.${key}`,
      severity: 'error',
      message: `Profile "${profileId}" preview.inner.${key} must be a positive safe integer, got ${String(value)}.`,
      suggestion: `Set preview.inner.${key} to a positive integer.`,
    });
    return undefined;
  }
  return value;
}

function lowerPreviewInnerPositiveInteger(
  profileId: string,
  path: string,
  key: 'maxOptions' | 'chooseNBeamWidth' | 'depthCap',
  value: number | undefined,
  diagnostics: Diagnostic[],
): number | undefined {
  if (value === undefined) {
    return 1;
  }
  if (!isPositiveSafeInteger(value)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_INNER_INVALID,
      path: `${path}.inner.${key}`,
      severity: 'error',
      message: `Profile "${profileId}" preview.inner.${key} must be a positive safe integer, got ${String(value)}.`,
      suggestion: `Set preview.inner.${key} to a positive integer.`,
    });
    return undefined;
  }
  return value;
}

function lowerPreviewBudgetConfig(
  profileId: string,
  path: string,
  budget: NonNullable<GameSpecAgentProfileDef['preview']>['budget'] | undefined,
  mode: string,
  diagnostics: Diagnostic[],
): CompiledAgentPreviewBudgetConfig | undefined {
  if (mode === 'disabled') {
    return undefined;
  }
  if (budget === undefined) {
    return {
      strategy: 'balancedCoverage',
      fullCandidateCap: 4,
      minPerGroup: 1,
    };
  }
  if (budget === null || typeof budget !== 'object' || Array.isArray(budget)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_BUDGET_INVALID,
      path: `${path}.budget`,
      severity: 'error',
      message: `Profile "${profileId}" preview.budget must be an object.`,
      suggestion: 'Use preview.budget: { strategy: balancedCoverage, fullCandidateCap, minPerGroup }.',
    });
    return undefined;
  }

  const { strategy, fullCandidateCap, minPerGroup, widenOnUniformProjection, widenCap, widenStep } = budget;
  if (strategy !== 'balancedCoverage') {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_BUDGET_INVALID,
      path: `${path}.budget.strategy`,
      severity: 'error',
      message: `Profile "${profileId}" preview.budget.strategy must be balancedCoverage.`,
      suggestion: 'Set preview.budget.strategy to balancedCoverage.',
    });
    return undefined;
  }
  if (!isPositiveSafeInteger(fullCandidateCap)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_BUDGET_INVALID,
      path: `${path}.budget.fullCandidateCap`,
      severity: 'error',
      message: `Profile "${profileId}" preview.budget.fullCandidateCap must be a positive safe integer, got ${String(fullCandidateCap)}.`,
      suggestion: 'Set preview.budget.fullCandidateCap to a positive integer such as 4.',
    });
    return undefined;
  }
  if (!isNonnegativeSafeInteger(minPerGroup)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_BUDGET_INVALID,
      path: `${path}.budget.minPerGroup`,
      severity: 'error',
      message: `Profile "${profileId}" preview.budget.minPerGroup must be a nonnegative safe integer, got ${String(minPerGroup)}.`,
      suggestion: 'Set preview.budget.minPerGroup to 1 for balanced coverage.',
    });
    return undefined;
  }
  if (widenOnUniformProjection !== undefined && typeof widenOnUniformProjection !== 'boolean') {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_BUDGET_INVALID,
      path: `${path}.budget.widenOnUniformProjection`,
      severity: 'error',
      message: `Profile "${profileId}" preview.budget.widenOnUniformProjection must be a boolean.`,
      suggestion: 'Set widenOnUniformProjection to true or false.',
    });
    return undefined;
  }
  if (widenCap !== undefined && !isNonnegativeSafeInteger(widenCap)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_BUDGET_INVALID,
      path: `${path}.budget.widenCap`,
      severity: 'error',
      message: `Profile "${profileId}" preview.budget.widenCap must be a nonnegative safe integer, got ${String(widenCap)}.`,
      suggestion: 'Set preview.budget.widenCap to a nonnegative integer.',
    });
    return undefined;
  }
  if (widenStep !== undefined && !isPositiveSafeInteger(widenStep)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_BUDGET_INVALID,
      path: `${path}.budget.widenStep`,
      severity: 'error',
      message: `Profile "${profileId}" preview.budget.widenStep must be a positive safe integer, got ${String(widenStep)}.`,
      suggestion: 'Set preview.budget.widenStep to a positive integer.',
    });
    return undefined;
  }
  if (widenOnUniformProjection === true && (widenCap === undefined || widenStep === undefined)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_BUDGET_INVALID,
      path: `${path}.budget`,
      severity: 'error',
      message: `Profile "${profileId}" preview.budget requires widenCap and widenStep when widenOnUniformProjection is true.`,
      suggestion: 'Set preview.budget.widenCap and preview.budget.widenStep, or disable widenOnUniformProjection.',
    });
    return undefined;
  }

  return {
    strategy,
    fullCandidateCap,
    minPerGroup,
    ...(widenOnUniformProjection === undefined ? {} : { widenOnUniformProjection }),
    ...(widenCap === undefined ? {} : { widenCap }),
    ...(widenStep === undefined ? {} : { widenStep }),
  };
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isNonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function lowerSelectionConfig(
  profileId: string,
  profileDef: GameSpecAgentProfileDef,
  diagnostics: Diagnostic[],
): CompiledAgentProfile['selection'] | undefined {
  const authored = profileDef.selection;
  if (authored === undefined) {
    return { mode: 'argmax' };
  }

  const path = `doc.agents.profiles.${profileId}.selection`;
  const { mode, temperature } = authored;

  if (mode === undefined) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_SELECTION_MODE_MISSING,
      path: `${path}.mode`,
      severity: 'error',
      message: `Profile "${profileId}" selection.mode is required when selection is present.`,
      suggestion: 'Set selection.mode to argmax, softmaxSample, or weightedSample.',
    });
    return undefined;
  }
  if (typeof mode !== 'string') {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_SELECTION_MODE_INVALID,
      path: `${path}.mode`,
      severity: 'error',
      message: `Profile "${profileId}" selection.mode must be a string, got ${typeof mode}.`,
      suggestion: 'Set selection.mode to argmax, softmaxSample, or weightedSample.',
    });
    return undefined;
  }
  if (mode === 'topKSample' || mode === 'epsilonGreedy') {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_SELECTION_MODE_RESERVED,
      path: `${path}.mode`,
      severity: 'error',
      message: `Profile "${profileId}" selection.mode "${mode}" is reserved for future implementation and is not supported yet.`,
      suggestion: 'Use selection.mode argmax, softmaxSample, or weightedSample.',
    });
    return undefined;
  }
  if (mode !== 'argmax' && mode !== 'softmaxSample' && mode !== 'weightedSample') {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_SELECTION_MODE_INVALID,
      path: `${path}.mode`,
      severity: 'error',
      message: `Profile "${profileId}" selection.mode "${mode}" is invalid.`,
      suggestion: 'Use selection.mode argmax, softmaxSample, or weightedSample.',
    });
    return undefined;
  }

  if (mode === 'softmaxSample') {
    if (temperature === undefined) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_SELECTION_TEMPERATURE_REQUIRED,
        path: `${path}.temperature`,
        severity: 'error',
        message: `Profile "${profileId}" selection.temperature is required when selection.mode is "softmaxSample".`,
        suggestion: 'Set selection.temperature to a positive number.',
      });
      return undefined;
    }
    if (typeof temperature !== 'number' || !Number.isFinite(temperature) || temperature <= 0) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_SELECTION_TEMPERATURE_INVALID,
        path: `${path}.temperature`,
        severity: 'error',
        message: `Profile "${profileId}" selection.temperature must be a positive finite number, got ${String(temperature)}.`,
        suggestion: 'Set selection.temperature to a positive number.',
      });
      return undefined;
    }
    return { mode, temperature };
  }

  return { mode };
}

function lowerSelectorProfileConfig(
  profileId: string,
  profileDef: GameSpecAgentProfileDef,
  diagnostics: Diagnostic[],
): NonNullable<CompiledAgentProfile['selector']> | undefined {
  const authored = profileDef.selector;
  if (authored === undefined) {
    return undefined;
  }
  const path = `doc.agents.profiles.${profileId}.selector.maxCostClass`;
  const maxCostClass = authored.maxCostClass ?? 'preview';
  if (!isSelectorCostClass(maxCostClass)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_SELECTOR_COST_CLASS_EXCEEDS_LIMIT,
      path,
      severity: 'error',
      message: `Profile "${profileId}" selector.maxCostClass must be state, candidate, microturn, preview, or auditOnly.`,
      suggestion: 'Set selector.maxCostClass to the highest selector cost class this profile permits.',
    });
    return undefined;
  }
  return { maxCostClass };
}

function validateProfileSelectorCostClass(
  profileId: string,
  maxCostClass: SelectorCostClass,
  selectorIds: readonly string[],
  library: CompiledAgentLibraryIndex,
  diagnostics: Diagnostic[],
): void {
  for (const selectorId of selectorIds) {
    const selector = library.selectors?.[selectorId];
    if (selector === undefined || selectorCostClassLeq(selector.costClass, maxCostClass)) {
      continue;
    }
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_SELECTOR_COST_CLASS_EXCEEDS_LIMIT,
      path: `doc.agents.profiles.${profileId}.selector.maxCostClass`,
      severity: 'error',
      message: `Profile "${profileId}" uses selector "${selectorId}" with costClass "${selector.costClass}", exceeding maxCostClass "${maxCostClass}".`,
      suggestion: 'Raise selector.maxCostClass or remove the higher-cost selector dependency.',
    });
  }
}

function lowerStrategyModulesProfileConfig(
  profileId: string,
  profileDef: GameSpecAgentProfileDef,
  diagnostics: Diagnostic[],
): NonNullable<CompiledAgentProfile['strategyModules']> | undefined {
  const authored = profileDef.strategyModules;
  if (authored === undefined) {
    return undefined;
  }
  const path = `doc.agents.profiles.${profileId}.strategyModules.maxCostClass`;
  const maxCostClass = authored.maxCostClass ?? 'preview';
  if (!isSelectorCostClass(maxCostClass)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_MODULE_COST_CLASS_EXCEEDS_LIMIT,
      path,
      severity: 'error',
      message: `Profile "${profileId}" strategyModules.maxCostClass must be state, candidate, microturn, preview, or auditOnly.`,
      suggestion: 'Set strategyModules.maxCostClass to the highest module cost class this profile permits.',
    });
    return undefined;
  }
  return { maxCostClass };
}

function lowerGuardrailsProfileConfig(
  profileId: string,
  profileDef: GameSpecAgentProfileDef,
  diagnostics: Diagnostic[],
): NonNullable<CompiledAgentProfile['guardrails']> | undefined {
  const authored = profileDef.guardrails;
  if (authored === undefined) {
    return undefined;
  }
  const path = `doc.agents.profiles.${profileId}.guardrails.maxCostClass`;
  const maxCostClass = authored.maxCostClass ?? 'preview';
  if (!isSelectorCostClass(maxCostClass)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_GUARDRAIL_COST_CLASS_EXCEEDS_LIMIT,
      path,
      severity: 'error',
      message: `Profile "${profileId}" guardrails.maxCostClass must be state, candidate, microturn, preview, or auditOnly.`,
      suggestion: 'Set guardrails.maxCostClass to the highest guardrail cost class this profile permits.',
    });
    return undefined;
  }
  return { maxCostClass };
}

function validateProfileModuleCostClass(
  profileId: string,
  maxCostClass: ModuleCostClass,
  moduleIds: readonly string[],
  library: CompiledAgentLibraryIndex,
  diagnostics: Diagnostic[],
): void {
  for (const moduleId of moduleIds) {
    const module = library.strategyModules?.[moduleId];
    if (module === undefined || selectorCostClassLeq(module.costClass, maxCostClass)) {
      continue;
    }
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_MODULE_COST_CLASS_EXCEEDS_LIMIT,
      path: `doc.agents.profiles.${profileId}.strategyModules.maxCostClass`,
      severity: 'error',
      message: `Profile "${profileId}" uses strategy module "${moduleId}" with costClass "${module.costClass}", exceeding maxCostClass "${maxCostClass}".`,
      suggestion: 'Raise strategyModules.maxCostClass or remove the higher-cost module dependency.',
    });
  }
}

function validateProfileGuardrailCostClass(
  profileId: string,
  maxCostClass: GuardrailCostClass,
  guardrailIds: readonly string[],
  library: CompiledAgentLibraryIndex,
  diagnostics: Diagnostic[],
): void {
  for (const guardrailId of guardrailIds) {
    const guardrail = library.guardrails?.[guardrailId];
    if (guardrail === undefined || selectorCostClassLeq(guardrail.costClass, maxCostClass)) {
      continue;
    }
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_GUARDRAIL_COST_CLASS_EXCEEDS_LIMIT,
      path: `doc.agents.profiles.${profileId}.guardrails.maxCostClass`,
      severity: 'error',
      message: `Profile "${profileId}" uses guardrail "${guardrailId}" with costClass "${guardrail.costClass}", exceeding maxCostClass "${maxCostClass}".`,
      suggestion: 'Raise guardrails.maxCostClass or remove the higher-cost guardrail dependency.',
    });
  }
}

function validateProfileTurnShapeCostClass(
  profileId: string,
  maxCostClass: TurnShapeCostClass,
  evaluatorIds: readonly string[],
  library: CompiledAgentLibraryIndex,
  diagnostics: Diagnostic[],
): void {
  for (const evaluatorId of evaluatorIds) {
    const evaluator = library.turnShapeEvaluators?.[evaluatorId];
    if (evaluator === undefined || evaluator.costClass === maxCostClass) {
      continue;
    }
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_TURNSHAPE_REF_UNKNOWN,
      path: `doc.agents.profiles.${profileId}.turnShapeEvaluators.maxCostClass`,
      severity: 'error',
      message: `Profile "${profileId}" uses turn-shape evaluator "${evaluatorId}" with costClass "${evaluator.costClass}", exceeding maxCostClass "${maxCostClass}".`,
      suggestion: 'Remove the higher-cost turn-shape evaluator dependency.',
    });
  }
}

function buildProfilePlan(
  profileId: string,
  use: CompiledAgentProfile['use'],
  planTemplateUse: readonly string[] | undefined,
  library: CompiledAgentLibraryIndex,
  diagnostics: Diagnostic[],
): CompiledAgentProfile['plan'] | null {
  const stateFeatures: string[] = [];
  const candidateFeatures: string[] = [];
  const candidateAggregates: string[] = [];
  const selectors: string[] = [];
  const strategyModules: string[] = [];
  const planTemplates: string[] = [];
  const guardrails: string[] = [];
  const turnShapeEvaluators: string[] = [];
  const stateSeen = new Set<string>();
  const candidateSeen = new Set<string>();
  const aggregateSeen = new Set<string>();
  const selectorSeen = new Set<string>();
  const moduleSeen = new Set<string>();
  const planTemplateSeen = new Set<string>();
  const guardrailSeen = new Set<string>();
  const turnShapeSeen = new Set<string>();
  const considerationSeen = new Set<string>();
  const considerations: string[] = [];
  let hasError = false;

  const visitStateFeature = (featureId: string): void => {
    if (stateSeen.has(featureId)) {
      return;
    }
    const feature = library.stateFeatures[featureId];
    if (feature === undefined) {
      hasError = true;
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PROFILE_USE_UNKNOWN_ID,
        path: `doc.agents.profiles.${profileId}`,
        severity: 'error',
        message: `Profile "${profileId}" depends on invalid state feature "${featureId}".`,
        suggestion: 'Fix the referenced library entry so it compiles successfully.',
      });
      return;
    }
    for (const dependencyId of feature.dependencies.stateFeatures) {
      visitStateFeature(dependencyId);
    }
    stateSeen.add(featureId);
    stateFeatures.push(featureId);
  };

  const visitCandidateFeature = (featureId: string): void => {
    if (candidateSeen.has(featureId)) {
      return;
    }
    const feature = library.candidateFeatures[featureId];
    if (feature === undefined) {
      hasError = true;
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PROFILE_USE_UNKNOWN_ID,
        path: `doc.agents.profiles.${profileId}`,
        severity: 'error',
        message: `Profile "${profileId}" depends on invalid candidate feature "${featureId}".`,
        suggestion: 'Fix the referenced library entry so it compiles successfully.',
      });
      return;
    }
    for (const dependencyId of feature.dependencies.stateFeatures) {
      visitStateFeature(dependencyId);
    }
    for (const dependencyId of feature.dependencies.candidateFeatures) {
      visitCandidateFeature(dependencyId);
    }
    candidateSeen.add(featureId);
    candidateFeatures.push(featureId);
  };

  const visitAggregate = (aggregateId: string): void => {
    if (aggregateSeen.has(aggregateId)) {
      return;
    }
    const aggregate = library.candidateAggregates[aggregateId];
    if (aggregate === undefined) {
      hasError = true;
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PROFILE_USE_UNKNOWN_ID,
        path: `doc.agents.profiles.${profileId}`,
        severity: 'error',
        message: `Profile "${profileId}" depends on invalid candidate aggregate "${aggregateId}".`,
        suggestion: 'Fix the referenced library entry so it compiles successfully.',
      });
      return;
    }
    for (const dependencyId of aggregate.dependencies.stateFeatures) {
      visitStateFeature(dependencyId);
    }
    for (const dependencyId of aggregate.dependencies.candidateFeatures) {
      visitCandidateFeature(dependencyId);
    }
    for (const dependencyId of aggregate.dependencies.aggregates) {
      visitAggregate(dependencyId);
    }
    aggregateSeen.add(aggregateId);
    candidateAggregates.push(aggregateId);
  };

  const visitSelector = (selectorId: string): void => {
    if (selectorSeen.has(selectorId)) {
      return;
    }
    const selector = library.selectors?.[selectorId];
    if (selector === undefined) {
      hasError = true;
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PROFILE_USE_UNKNOWN_ID,
        path: `doc.agents.profiles.${profileId}`,
        severity: 'error',
        message: `Profile "${profileId}" depends on invalid selector "${selectorId}".`,
        suggestion: 'Fix the referenced selector so it compiles successfully.',
      });
      return;
    }
    addDependencies(selector.dependencies);
    selectorSeen.add(selectorId);
    selectors.push(selectorId);
  };

  const visitModule = (moduleId: string): void => {
    if (moduleSeen.has(moduleId)) {
      return;
    }
    const module = library.strategyModules?.[moduleId];
    if (module === undefined) {
      hasError = true;
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PROFILE_USE_UNKNOWN_ID,
        path: `doc.agents.profiles.${profileId}`,
        severity: 'error',
        message: `Profile "${profileId}" depends on invalid strategy module "${moduleId}".`,
        suggestion: 'Fix the referenced strategy module so it compiles successfully.',
      });
      return;
    }
    addDependencies(module.dependencies);
    moduleSeen.add(moduleId);
    strategyModules.push(moduleId);
  };

  const visitPlanTemplate = (templateId: string): void => {
    if (planTemplateSeen.has(templateId)) {
      return;
    }
    const template = library.planTemplates?.[templateId];
    if (template === undefined) {
      hasError = true;
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PROFILE_USE_UNKNOWN_ID,
        path: `doc.agents.profiles.${profileId}`,
        severity: 'error',
        message: `Profile "${profileId}" depends on invalid plan template "${templateId}".`,
        suggestion: 'Fix the referenced plan template so it compiles successfully.',
      });
      return;
    }
    addDependencies(template.dependencies);
    planTemplateSeen.add(templateId);
    planTemplates.push(templateId);
  };

  const visitGuardrail = (guardrailId: string): void => {
    if (guardrailSeen.has(guardrailId)) {
      return;
    }
    const guardrail = library.guardrails?.[guardrailId];
    if (guardrail === undefined) {
      hasError = true;
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PROFILE_USE_UNKNOWN_ID,
        path: `doc.agents.profiles.${profileId}`,
        severity: 'error',
        message: `Profile "${profileId}" depends on invalid guardrail "${guardrailId}".`,
        suggestion: 'Fix the referenced guardrail so it compiles successfully.',
      });
      return;
    }
    addDependencies(guardrail.dependencies);
    guardrailSeen.add(guardrailId);
    guardrails.push(guardrailId);
  };

  const visitTurnShapeEvaluator = (evaluatorId: string): void => {
    if (turnShapeSeen.has(evaluatorId)) {
      return;
    }
    const evaluator = library.turnShapeEvaluators?.[evaluatorId];
    if (evaluator === undefined) {
      hasError = true;
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PROFILE_USE_UNKNOWN_ID,
        path: `doc.agents.profiles.${profileId}`,
        severity: 'error',
        message: `Profile "${profileId}" depends on invalid turn-shape evaluator "${evaluatorId}".`,
        suggestion: 'Fix the referenced turn-shape evaluator so it compiles successfully.',
      });
      return;
    }
    addDependencies(evaluator.dependencies);
    turnShapeSeen.add(evaluatorId);
    turnShapeEvaluators.push(evaluatorId);
  };

  const addDependencies = (dependencies: CompiledAgentDependencyRefs): void => {
    for (const featureId of dependencies.stateFeatures) {
      visitStateFeature(featureId);
    }
    for (const featureId of dependencies.candidateFeatures) {
      visitCandidateFeature(featureId);
    }
    for (const aggregateId of dependencies.aggregates) {
      visitAggregate(aggregateId);
    }
    for (const selectorId of dependencies.selectors ?? []) {
      visitSelector(selectorId);
    }
    for (const moduleId of dependencies.strategyModules ?? []) {
      visitModule(moduleId);
    }
    for (const templateId of dependencies.planTemplates ?? []) {
      visitPlanTemplate(templateId);
    }
    for (const guardrailId of dependencies.guardrails ?? []) {
      visitGuardrail(guardrailId);
    }
    for (const evaluatorId of dependencies.turnShapeEvaluators ?? []) {
      visitTurnShapeEvaluator(evaluatorId);
    }
  };

  for (const guardrailId of use.guardrails ?? []) visitGuardrail(guardrailId);
  for (const evaluatorId of use.turnShapeEvaluators ?? []) visitTurnShapeEvaluator(evaluatorId);
  for (const considerationId of use.considerations ?? []) {
    const consideration = library.considerations?.[considerationId];
    if (consideration === undefined) {
      hasError = true;
      continue;
    }
    addDependencies(consideration.dependencies);
    if (!considerationSeen.has(considerationId)) {
      considerationSeen.add(considerationId);
      considerations.push(considerationId);
    }
  }
  for (const tieBreakerId of use.tieBreakers) {
    const tieBreaker = library.tieBreakers[tieBreakerId];
    if (tieBreaker === undefined) {
      hasError = true;
      continue;
    }
    addDependencies(tieBreaker.dependencies);
  }
  for (const moduleId of Object.keys(library.strategyModules ?? {})) {
    visitModule(moduleId);
  }
  for (const templateId of planTemplateUse ?? Object.keys(library.planTemplates ?? {})) {
    visitPlanTemplate(templateId);
  }

  if (hasError) {
    return null;
  }

  return {
    stateFeatures,
    candidateFeatures,
    candidateAggregates,
    ...(selectors.length === 0 ? {} : { selectors }),
    ...(strategyModules.length === 0 ? {} : { strategyModules }),
    ...(planTemplates.length === 0 ? {} : { planTemplates }),
    ...(guardrails.length === 0 ? {} : { guardrails }),
    ...(turnShapeEvaluators.length === 0 ? {} : { turnShapeEvaluators }),
    considerations,
  };
}

function lowerBindings(
  bindings: GameSpecAgentsSection['bindings'],
  profiles: AgentPolicyCatalog['profiles'],
  diagnostics: Diagnostic[],
  options: LowerAgentsOptions,
): AgentPolicyCatalog['bindingsBySeat'] {
  const compiled: Record<string, string> = {};
  const bindingEntries = Object.entries(bindings ?? {});
  if (bindingEntries.length === 0) {
    return compiled;
  }

  if (options.referenceSeatIds === undefined) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_BINDING_SEAT_CATALOG_UNRESOLVED,
      path: 'doc.agents.bindings',
      severity: 'error',
      message: 'agents bindings require resolved canonical seat ids from the selected scenario seatCatalog.',
      suggestion: 'Add or select a seatCatalog data asset before binding authored policy profiles to seats.',
    });
    return compiled;
  }

  const referenceSeatIds = new Set(options.referenceSeatIds);

  for (const [seatId, profileId] of bindingEntries) {
    if (!referenceSeatIds.has(seatId)) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_BINDING_UNKNOWN_SEAT,
        path: `doc.agents.bindings.${seatId}`,
        severity: 'error',
        message: `agents binding references seat "${seatId}", which is absent from the resolved canonical seat ids.`,
        suggestion: `Use one of the resolved canonical seat ids: ${options.referenceSeatIds.join(', ')}.`,
      });
      continue;
    }

    if (profiles[profileId] === undefined) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_BINDING_UNKNOWN_PROFILE,
        path: `doc.agents.bindings.${seatId}`,
        severity: 'error',
        message: `agents binding for seat "${seatId}" references unknown profile "${profileId}".`,
        suggestion: 'Bind each seat id to a compiled profile id.',
      });
      continue;
    }

    compiled[seatId] = profileId;
  }

  return compiled;
}

class AgentLibraryCompiler {
  private readonly authoredLibrary: GameSpecAgentLibrary;
  private readonly compiled: {
    readonly stateFeatures: Record<string, AgentStateFeatureWithExpr>;
    readonly candidateFeatures: Record<string, AgentCandidateFeatureWithExpr>;
    readonly candidateAggregates: Record<string, AgentAggregateWithExpr>;
    readonly selectors: Record<string, AgentSelectorWithExpr>;
    readonly strategyModules: Record<string, AgentStrategyModuleWithExpr>;
    readonly planTemplates: Record<string, AgentPlanTemplateWithExpr>;
    readonly guardrails: Record<string, AgentGuardrailWithExprInternal>;
    readonly turnShapeEvaluators: Record<string, AgentTurnShapeEvaluatorWithExprInternal>;
    readonly postureEvaluators: Record<string, AgentPostureEvaluatorWithExprInternal>;
    readonly relationships: Record<string, AgentRelationshipWithExpr>;
    readonly considerations: Record<string, AgentConsiderationWithExpr>;
    readonly tieBreakers: Record<string, AgentTieBreakerWithExpr>;
    readonly strategicConditions: Record<string, StrategicConditionWithExpr>;
  };

  private readonly stateFeatureStatus = new Map<string, 'compiling' | 'done' | 'failed'>();
  private readonly candidateFeatureStatus = new Map<string, 'compiling' | 'done' | 'failed'>();
  private readonly aggregateStatus = new Map<string, 'compiling' | 'done' | 'failed'>();
  private readonly selectorStatus = new Map<string, 'compiling' | 'done' | 'failed'>();
  private readonly strategyModuleStatus = new Map<string, 'compiling' | 'done' | 'failed'>();
  private readonly planTemplateStatus = new Map<string, 'compiling' | 'done' | 'failed'>();
  private readonly guardrailStatus = new Map<string, 'compiling' | 'done' | 'failed'>();
  private readonly turnShapeStatus = new Map<string, 'compiling' | 'done' | 'failed'>();
  private readonly postureCompileState = new Map<string, 'compiling' | 'done' | 'failed'>();
  private readonly relationshipStatus = new Map<string, 'compiling' | 'done' | 'failed'>();
  private readonly considerationStatus = new Map<string, 'done' | 'failed'>();
  private readonly tieBreakerStatus = new Map<string, 'done' | 'failed'>();
  private readonly strategicConditionStatus = new Map<string, 'compiling' | 'done' | 'failed'>();

  private readonly stateFeatureStack: string[] = [];
  private readonly candidateFeatureStack: string[] = [];
  private readonly aggregateStack: string[] = [];
  private readonly selectorStack: string[] = [];
  private readonly strategyModuleStack: string[] = [];
  private readonly planTemplateStack: string[] = [];
  private readonly guardrailStack: string[] = [];
  private readonly turnShapeStack: string[] = [];
  private readonly postureStack: string[] = [];
  private readonly relationshipStack: string[] = [];
  private readonly strategicConditionStack: string[] = [];

  constructor(
    authoredLibrary: GameSpecAgentLibrary | undefined,
    private readonly surfaceVisibility: CompiledSurfaceCatalog,
    private readonly parameterDefs: Readonly<Record<string, CompiledAgentParameterDef>>,
    private readonly candidateParamDefs: Readonly<Record<string, CompiledAgentCandidateParamDef>>,
    private readonly diagnostics: Diagnostic[],
    private readonly options: LowerAgentsOptions,
  ) {
    this.authoredLibrary = authoredLibrary ?? {};
    this.compiled = {
      stateFeatures: {},
      candidateFeatures: {},
      candidateAggregates: {},
      selectors: {},
      strategyModules: {},
      planTemplates: {},
      guardrails: {},
      turnShapeEvaluators: {},
      postureEvaluators: {},
      relationships: {},
      considerations: {},
      tieBreakers: {},
      strategicConditions: {},
    };
  }

  compile(): AgentLibraryWithExpr {
    this.validateFeatureNamespaceCollisions();

    for (const featureId of Object.keys(this.authoredLibrary.stateFeatures ?? {})) {
      this.compileStateFeature(featureId);
    }
    for (const featureId of Object.keys(this.authoredLibrary.candidateFeatures ?? {})) {
      this.compileCandidateFeature(featureId);
    }
    for (const aggregateId of Object.keys(this.authoredLibrary.candidateAggregates ?? {})) {
      this.compileAggregate(aggregateId);
    }
    for (const selectorId of Object.keys(this.authoredLibrary.selectors ?? {})) {
      this.compileSelector(selectorId);
    }
    for (const guardrailId of Object.keys(this.authoredLibrary.guardrails ?? {})) {
      this.compileGuardrail(guardrailId);
    }
    this.validateGuardrailTraceLabels();
    for (const moduleId of Object.keys(this.authoredLibrary.strategyModules ?? {})) {
      this.compileStrategyModule(moduleId);
    }
    this.validateModuleTraceLabels();
    for (const templateId of Object.keys(this.authoredLibrary.planTemplates ?? {})) {
      this.compilePlanTemplate(templateId);
    }
    for (const evaluatorId of Object.keys(this.authoredLibrary.turnShapeEvaluators ?? {})) {
      this.compileTurnShapeEvaluator(evaluatorId);
    }
    this.validateTurnShapeTraceLabels();
    for (const evaluatorId of Object.keys(this.authoredLibrary.postureEvaluators ?? {})) {
      this.compilePostureEvaluator(evaluatorId);
    }
    this.validatePostureTraceLabels();
    for (const relationshipId of Object.keys(this.authoredLibrary.relationships ?? {})) {
      this.compileRelationship(relationshipId);
    }
    for (const considerationId of Object.keys(this.authoredLibrary.considerations ?? {})) {
      this.compileConsideration(considerationId);
    }
    for (const tieBreakerId of Object.keys(this.authoredLibrary.tieBreakers ?? {})) {
      this.compileTieBreaker(tieBreakerId);
    }
    for (const conditionId of Object.keys(this.authoredLibrary.strategicConditions ?? {})) {
      this.compileStrategicCondition(conditionId);
    }

    return this.compiled;
  }

  private validateFeatureNamespaceCollisions(): void {
    const stateIds = new Set(Object.keys(this.authoredLibrary.stateFeatures ?? {}));
    for (const candidateId of Object.keys(this.authoredLibrary.candidateFeatures ?? {})) {
      if (!stateIds.has(candidateId)) {
        continue;
      }
      this.diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_REF_UNKNOWN,
        path: `doc.agents.library.candidateFeatures.${candidateId}`,
        severity: 'error',
        message: `Feature id "${candidateId}" is defined in both stateFeatures and candidateFeatures, which makes feature refs ambiguous.`,
        suggestion: 'Use distinct ids across stateFeatures and candidateFeatures.',
      });
    }
  }

  private validateModuleTraceLabels(): void {
    const seen = new Map<string, string>();
    for (const [moduleId, module] of Object.entries(this.compiled.strategyModules)) {
      const priorId = seen.get(module.traceLabel);
      if (priorId === undefined) {
        seen.set(module.traceLabel, moduleId);
        continue;
      }
      this.diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_MODULE_TRACE_LABEL_DUPLICATE,
        path: `doc.agents.library.strategyModules.${moduleId}.traceLabel`,
        severity: 'error',
        message: `Strategy module traceLabel "${module.traceLabel}" is also used by "${priorId}".`,
        suggestion: 'Use unique strategy module trace labels for deterministic grouped traces.',
      });
      this.strategyModuleStatus.set(moduleId, 'failed');
      delete this.compiled.strategyModules[moduleId];
    }
  }

  private validateGuardrailTraceLabels(): void {
    const seen = new Map<string, string>();
    for (const [guardrailId, guardrail] of Object.entries(this.compiled.guardrails)) {
      const priorId = seen.get(guardrail.traceLabel);
      if (priorId === undefined) {
        seen.set(guardrail.traceLabel, guardrailId);
        continue;
      }
      this.diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_GUARDRAIL_TRACE_LABEL_DUPLICATE,
        path: `doc.agents.library.guardrails.${guardrailId}.traceLabel`,
        severity: 'error',
        message: `Guardrail traceLabel "${guardrail.traceLabel}" is also used by "${priorId}".`,
        suggestion: 'Use unique guardrail trace labels for deterministic grouped traces.',
      });
      this.guardrailStatus.set(guardrailId, 'failed');
      delete this.compiled.guardrails[guardrailId];
    }
  }

  private validateTurnShapeTraceLabels(): void {
    const seen = new Map<string, string>();
    for (const [evaluatorId, evaluator] of Object.entries(this.compiled.turnShapeEvaluators)) {
      const priorId = seen.get(evaluator.traceLabel);
      if (priorId === undefined) {
        seen.set(evaluator.traceLabel, evaluatorId);
        continue;
      }
      this.diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_TURNSHAPE_TRACE_LABEL_DUPLICATE,
        path: `doc.agents.library.turnShapeEvaluators.${evaluatorId}.traceLabel`,
        severity: 'error',
        message: `Turn-shape evaluator traceLabel "${evaluator.traceLabel}" is also used by "${priorId}".`,
        suggestion: 'Use unique turn-shape evaluator trace labels for deterministic grouped traces.',
      });
      this.turnShapeStatus.set(evaluatorId, 'failed');
      delete this.compiled.turnShapeEvaluators[evaluatorId];
    }
  }

  private validatePostureTraceLabels(): void {
    const seen = new Map<string, string>();
    for (const [evaluatorId, evaluator] of Object.entries(this.compiled.postureEvaluators)) {
      const priorId = seen.get(evaluator.traceLabel);
      if (priorId === undefined) {
        seen.set(evaluator.traceLabel, evaluatorId);
        continue;
      }
      this.diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POSTURE_TRACE_LABEL_DUPLICATE,
        path: `doc.agents.library.postureEvaluators.${evaluatorId}.traceLabel`,
        severity: 'error',
        message: `Posture evaluator traceLabel "${evaluator.traceLabel}" is also used by "${priorId}".`,
        suggestion: 'Use unique posture evaluator trace labels for deterministic posture traces.',
      });
      this.postureCompileState.set(evaluatorId, 'failed');
      delete this.compiled.postureEvaluators[evaluatorId];
    }
  }


  private compileStateFeature(featureId: string): AgentStateFeatureWithExpr | null {
    const status = this.stateFeatureStatus.get(featureId);
    if (status === 'done') {
      return this.compiled.stateFeatures[featureId] ?? null;
    }
    if (status === 'failed') {
      return null;
    }
    if (status === 'compiling') {
      this.reportCycle('stateFeatures', featureId, this.stateFeatureStack);
      this.stateFeatureStatus.set(featureId, 'failed');
      return null;
    }

    const def = this.authoredLibrary.stateFeatures?.[featureId];
    if (def === undefined) {
      this.reportUnknownLibraryRef(`feature.${featureId}`, `doc.agents.library.stateFeatures.${featureId}`);
      this.stateFeatureStatus.set(featureId, 'failed');
      return null;
    }

    this.stateFeatureStatus.set(featureId, 'compiling');
    this.stateFeatureStack.push(featureId);
    const result = this.analyzeFeatureDefinition(
      'stateFeature',
      featureId,
      def,
      `doc.agents.library.stateFeatures.${featureId}`,
    );
    this.stateFeatureStack.pop();
    this.stateFeatureStatus.set(featureId, result === null ? 'failed' : 'done');
    if (result !== null) {
      this.compiled.stateFeatures[featureId] = result;
    }
    return result;
  }

  private compileCandidateFeature(featureId: string): AgentCandidateFeatureWithExpr | null {
    const status = this.candidateFeatureStatus.get(featureId);
    if (status === 'done') {
      return this.compiled.candidateFeatures[featureId] ?? null;
    }
    if (status === 'failed') {
      return null;
    }
    if (status === 'compiling') {
      this.reportCycle('candidateFeatures', featureId, this.candidateFeatureStack);
      this.candidateFeatureStatus.set(featureId, 'failed');
      return null;
    }

    const def = this.authoredLibrary.candidateFeatures?.[featureId];
    if (def === undefined) {
      this.reportUnknownLibraryRef(`feature.${featureId}`, `doc.agents.library.candidateFeatures.${featureId}`);
      this.candidateFeatureStatus.set(featureId, 'failed');
      return null;
    }

    this.candidateFeatureStatus.set(featureId, 'compiling');
    this.candidateFeatureStack.push(featureId);
    const result = this.analyzeFeatureDefinition(
      'candidateFeature',
      featureId,
      def,
      `doc.agents.library.candidateFeatures.${featureId}`,
    );
    this.candidateFeatureStack.pop();
    this.candidateFeatureStatus.set(featureId, result === null ? 'failed' : 'done');
    if (result !== null) {
      this.compiled.candidateFeatures[featureId] = result;
    }
    return result;
  }

  private analyzeFeatureDefinition(
    scope: 'stateFeature' | 'candidateFeature',
    featureId: string,
    def: GameSpecStateFeatureDef | GameSpecCandidateFeatureDef,
    path: string,
  ): AgentStateFeatureWithExpr | AgentCandidateFeatureWithExpr | null {
    const context = this.createExprContext(scope);
    const analysis = analyzePolicyExpr(def.expr, context, this.diagnostics, `${path}.expr`);
    if (analysis === null) {
      return null;
    }

    const declaredType = normalizeDeclaredPolicyValueType(def.type, `${path}.type`, this.diagnostics);
    if (declaredType !== null && declaredType !== analysis.valueType) {
      this.diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_TYPE_INVALID,
        path: `${path}.type`,
        severity: 'error',
        message: `Feature "${featureId}" declares type "${declaredType}" but its expression compiles to "${analysis.valueType}".`,
        suggestion: 'Fix the expression or update the declared type so they match.',
      });
      return null;
    }
    if (!isPolicyValueType(analysis.valueType)) {
      this.diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_TYPE_INVALID,
        path: `${path}.expr`,
        severity: 'error',
        message: `Feature "${featureId}" does not resolve to a concrete scalar policy type.`,
        suggestion: 'Coalesce unknown values or return a concrete number, boolean, id, or id list.',
      });
      return null;
    }

    return {
      type: analysis.valueType,
      costClass: analysis.costClass,
      expr: analysis.expr,
      dependencies: analysis.dependencies,
    };
  }

  private compileAggregate(aggregateId: string): AgentAggregateWithExpr | null {
    const status = this.aggregateStatus.get(aggregateId);
    if (status === 'done') {
      return this.compiled.candidateAggregates[aggregateId] ?? null;
    }
    if (status === 'failed') {
      return null;
    }
    if (status === 'compiling') {
      this.reportCycle('candidateAggregates', aggregateId, this.aggregateStack);
      this.aggregateStatus.set(aggregateId, 'failed');
      return null;
    }

    const def = this.authoredLibrary.candidateAggregates?.[aggregateId];
    if (def === undefined) {
      this.reportUnknownLibraryRef(`aggregate.${aggregateId}`, `doc.agents.library.candidateAggregates.${aggregateId}`);
      this.aggregateStatus.set(aggregateId, 'failed');
      return null;
    }

    this.aggregateStatus.set(aggregateId, 'compiling');
    this.aggregateStack.push(aggregateId);
    const context = this.createExprContext('aggregate');
    const ofAnalysis = analyzePolicyExpr(def.of, context, this.diagnostics, `doc.agents.library.candidateAggregates.${aggregateId}.of`);
    const whereAnalysis = def.where === undefined
      ? null
      : analyzePolicyExpr(def.where, context, this.diagnostics, `doc.agents.library.candidateAggregates.${aggregateId}.where`);
    this.aggregateStack.pop();

    if (ofAnalysis === null || (def.where !== undefined && whereAnalysis === null)) {
      this.aggregateStatus.set(aggregateId, 'failed');
      return null;
    }
    if (whereAnalysis !== null && whereAnalysis.valueType !== 'boolean') {
      this.diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_TYPE_INVALID,
        path: `doc.agents.library.candidateAggregates.${aggregateId}.where`,
        severity: 'error',
        message: `Aggregate "${aggregateId}" where clauses must compile to boolean.`,
        suggestion: 'Use a boolean predicate in aggregate.where.',
      });
      this.aggregateStatus.set(aggregateId, 'failed');
      return null;
    }

    const op = normalizeAggregateOp(def.op, `doc.agents.library.candidateAggregates.${aggregateId}.op`, this.diagnostics);
    if (op === null) {
      this.aggregateStatus.set(aggregateId, 'failed');
      return null;
    }
    const resultType = inferAggregateResultType(op, ofAnalysis.valueType, `doc.agents.library.candidateAggregates.${aggregateId}.of`, this.diagnostics);
    if (resultType === null) {
      this.aggregateStatus.set(aggregateId, 'failed');
      return null;
    }

    const dependencies = mergeDependencies([ofAnalysis.dependencies, whereAnalysis?.dependencies ?? emptyDependencies()]);
    const compiled: AgentAggregateWithExpr = {
      type: resultType,
      costClass: maxCostClass(ofAnalysis.costClass, whereAnalysis?.costClass ?? 'state'),
      op,
      of: ofAnalysis.expr,
      ...(def.where === undefined ? {} : { where: whereAnalysis!.expr }),
      dependencies,
    };
    this.compiled.candidateAggregates[aggregateId] = compiled;
    this.aggregateStatus.set(aggregateId, 'done');
    return compiled;
  }

  private compileSelector(selectorId: string): AgentSelectorWithExpr | null {
    const status = this.selectorStatus.get(selectorId);
    if (status === 'done') {
      return this.compiled.selectors[selectorId] ?? null;
    }
    if (status === 'failed') {
      return null;
    }
    if (status === 'compiling') {
      this.reportSelectorCycle(selectorId);
      this.selectorStatus.set(selectorId, 'failed');
      return null;
    }

    const def = this.authoredLibrary.selectors?.[selectorId];
    if (def === undefined) {
      this.reportSelectorRefUnknown(`selector.${selectorId}`, `doc.agents.library.selectors.${selectorId}`);
      this.selectorStatus.set(selectorId, 'failed');
      return null;
    }

    const basePath = `doc.agents.library.selectors.${selectorId}`;
    this.selectorStatus.set(selectorId, 'compiling');
    this.selectorStack.push(selectorId);
    const context = this.createExprContext('selector', true);
    const source = this.lowerSelectorSource(def.source, `${basePath}.source`);
    const scopes = normalizeSelectorScopes(def.scopes, `${basePath}.scopes`, this.diagnostics);
    const result = normalizeSelectorResult(def.result, `${basePath}.result`, this.diagnostics);
    const where = def.where === undefined
      ? null
      : analyzePolicyExpr(def.where, context, this.diagnostics, `${basePath}.where`);
    const minImpact = def.minImpact === undefined
      ? null
      : analyzePolicyExpr(def.minImpact, context, this.diagnostics, `${basePath}.minImpact`);
    const quality = this.lowerSelectorQuality(def.quality, `${basePath}.quality`, context);
    this.selectorStack.pop();

    if (
      source === null
      || scopes === null
      || result === null
      || (def.where !== undefined && where === null)
      || (def.minImpact !== undefined && minImpact === null)
      || quality === null
    ) {
      this.selectorStatus.set(selectorId, 'failed');
      return null;
    }
    if (where !== null && where.valueType !== 'boolean' && where.valueType !== 'unknown') {
      this.diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_TYPE_INVALID,
        path: `${basePath}.where`,
        severity: 'error',
        message: `Selector "${selectorId}" where must compile to boolean.`,
        suggestion: 'Use a boolean policy expression in selector.where.',
      });
      this.selectorStatus.set(selectorId, 'failed');
      return null;
    }
    if (minImpact !== null && minImpact.valueType !== 'boolean' && minImpact.valueType !== 'unknown') {
      this.diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_TYPE_INVALID,
        path: `${basePath}.minImpact`,
        severity: 'error',
        message: `Selector "${selectorId}" minImpact must compile to boolean.`,
        suggestion: 'Use a boolean policy expression in selector.minImpact.',
      });
      this.selectorStatus.set(selectorId, 'failed');
      return null;
    }

    const analyses = [
      where,
      minImpact,
      ...(quality.components.map((component) => component.analysis)),
    ].filter((entry): entry is PolicyExprAnalysis => entry !== null);
    const dependencies = mergeDependencies([source.dependencies, ...analyses.map((entry) => entry.dependencies)]);
    const costClass = maxSelectorCostClass(deriveSelectorCostClass(source.source, analyses), source.costClass);
    const compiled: AgentSelectorWithExpr = {
      id: selectorId as AgentSelectorWithExpr['id'],
      scopes,
      source: source.source,
      ...(where === null ? {} : { where: where.expr }),
      ...(quality.components.length === 0 ? {} : {
        quality: {
          components: quality.components.map((component) => component.component),
          order: quality.order,
        },
      }),
      ...(minImpact === null ? {} : { minImpact: minImpact.expr }),
      result,
      costClass,
      dependencies,
    };
    this.compiled.selectors[selectorId] = compiled;
    this.selectorStatus.set(selectorId, 'done');
    return compiled;
  }

  private compileStrategyModule(moduleId: string): AgentStrategyModuleWithExpr | null {
    const status = this.strategyModuleStatus.get(moduleId);
    if (status === 'done') {
      return this.compiled.strategyModules[moduleId] ?? null;
    }
    if (status === 'failed') {
      return null;
    }
    if (status === 'compiling') {
      this.reportModuleCycle(moduleId);
      this.strategyModuleStatus.set(moduleId, 'failed');
      return null;
    }

    const def = this.authoredLibrary.strategyModules?.[moduleId];
    if (def === undefined) {
      this.reportModuleRefUnknown(`module.${moduleId}`, `doc.agents.library.strategyModules.${moduleId}`);
      this.strategyModuleStatus.set(moduleId, 'failed');
      return null;
    }

    this.strategyModuleStatus.set(moduleId, 'compiling');
    this.strategyModuleStack.push(moduleId);
    const context = this.createExprContext('strategyModule');
    const compiled = compileStrategyModuleDefinition({
      moduleId,
      def,
      context,
      diagnostics: this.diagnostics,
      compileSelector: (selectorId) => this.compileSelector(selectorId),
      compileGuardrail: (guardrailId) => this.compileGuardrail(guardrailId),
      reportModuleRefUnknown: (refPath, path) => this.reportModuleRefUnknown(refPath, path),
    });
    this.strategyModuleStack.pop();

    if (compiled === null) {
      this.strategyModuleStatus.set(moduleId, 'failed');
      return null;
    }
    this.compiled.strategyModules[moduleId] = compiled;
    this.strategyModuleStatus.set(moduleId, 'done');
    return compiled;
  }

  private compilePlanTemplate(templateId: string): AgentPlanTemplateWithExpr | null {
    const status = this.planTemplateStatus.get(templateId);
    if (status === 'done') {
      return this.compiled.planTemplates[templateId] ?? null;
    }
    if (status === 'failed') {
      return null;
    }
    if (status === 'compiling') {
      this.reportCycle('planTemplates', templateId, this.planTemplateStack);
      this.planTemplateStatus.set(templateId, 'failed');
      return null;
    }

    const def = this.authoredLibrary.planTemplates?.[templateId];
    if (def === undefined) {
      this.reportUnknownLibraryRef(`planTemplate.${templateId}`, `doc.agents.library.planTemplates.${templateId}`);
      this.planTemplateStatus.set(templateId, 'failed');
      return null;
    }

    this.planTemplateStatus.set(templateId, 'compiling');
    this.planTemplateStack.push(templateId);
    const compiledBase = compilePlanTemplateDefinition({
      templateId,
      def,
      diagnostics: this.diagnostics,
      compileSelector: (selectorId) => this.compileSelector(selectorId),
    });
    this.planTemplateStack.pop();

    if (compiledBase === null) {
      this.planTemplateStatus.set(templateId, 'failed');
      return null;
    }
    let compiled = compiledBase;
    if (def.postureHook !== undefined) {
      const postureEvaluator = this.compilePostureEvaluator(def.postureHook);
      if (postureEvaluator === null) {
        this.reportPostureRefUnknown(
          `posture.${def.postureHook}`,
          `doc.agents.library.planTemplates.${templateId}.postureHook`,
        );
        this.planTemplateStatus.set(templateId, 'failed');
        return null;
      }
      compiled = {
        ...compiledBase,
        dependencies: mergeDependencies([
          compiledBase.dependencies,
          {
            ...emptyDependencies(),
            postureEvaluators: [def.postureHook],
          },
        ]),
      };
    }
    this.compiled.planTemplates[templateId] = compiled;
    this.planTemplateStatus.set(templateId, 'done');
    return compiled;
  }

  private compileGuardrail(guardrailId: string): AgentGuardrailWithExprInternal | null {
    const status = this.guardrailStatus.get(guardrailId);
    if (status === 'done') {
      return this.compiled.guardrails[guardrailId] ?? null;
    }
    if (status === 'failed') {
      return null;
    }
    if (status === 'compiling') {
      this.reportGuardrailCycle(guardrailId);
      this.guardrailStatus.set(guardrailId, 'failed');
      return null;
    }

    const def = this.authoredLibrary.guardrails?.[guardrailId];
    if (def === undefined) {
      this.reportGuardrailRefUnknown(`guardrail.${guardrailId}`, `doc.agents.library.guardrails.${guardrailId}`);
      this.guardrailStatus.set(guardrailId, 'failed');
      return null;
    }

    this.guardrailStatus.set(guardrailId, 'compiling');
    this.guardrailStack.push(guardrailId);
    const context = this.createExprContext('guardrail');
    const compiled = compileGuardrailDefinition({
      guardrailId,
      def,
      context,
      diagnostics: this.diagnostics,
      ...(this.options.actionDefs === undefined ? {} : { actionDefs: this.options.actionDefs }),
      reportGuardrailRefUnknown: (refPath, path) => this.reportGuardrailRefUnknown(refPath, path),
    });
    this.guardrailStack.pop();

    if (compiled === null) {
      this.guardrailStatus.set(guardrailId, 'failed');
      return null;
    }
    this.compiled.guardrails[guardrailId] = compiled;
    this.guardrailStatus.set(guardrailId, 'done');
    return compiled;
  }

  private compileTurnShapeEvaluator(evaluatorId: string): AgentTurnShapeEvaluatorWithExprInternal | null {
    const status = this.turnShapeStatus.get(evaluatorId);
    if (status === 'done') {
      return this.compiled.turnShapeEvaluators[evaluatorId] ?? null;
    }
    if (status === 'failed') {
      return null;
    }
    if (status === 'compiling') {
      this.reportTurnShapeCycle(evaluatorId);
      this.turnShapeStatus.set(evaluatorId, 'failed');
      return null;
    }

    const def = this.authoredLibrary.turnShapeEvaluators?.[evaluatorId];
    if (def === undefined) {
      this.reportTurnShapeRefUnknown(`turnShape.${evaluatorId}`, `doc.agents.library.turnShapeEvaluators.${evaluatorId}`);
      this.turnShapeStatus.set(evaluatorId, 'failed');
      return null;
    }

    this.turnShapeStatus.set(evaluatorId, 'compiling');
    this.turnShapeStack.push(evaluatorId);
    const context = this.createExprContext('turnShapeEvaluator');
    const compiled = compileTurnShapeEvaluatorDefinition({
      evaluatorId,
      def,
      context,
      diagnostics: this.diagnostics,
      reportTurnShapeRefUnknown: (refPath, path) => this.reportTurnShapeRefUnknown(refPath, path),
      reportTurnShapeUnregisteredPreviewRef: (refPath, path) => this.reportTurnShapeUnregisteredPreviewRef(refPath, path),
    });
    this.turnShapeStack.pop();

    if (compiled === null) {
      this.turnShapeStatus.set(evaluatorId, 'failed');
      return null;
    }
    this.compiled.turnShapeEvaluators[evaluatorId] = compiled;
    this.turnShapeStatus.set(evaluatorId, 'done');
    return compiled;
  }

  private compilePostureEvaluator(evaluatorId: string): AgentPostureEvaluatorWithExprInternal | null {
    const status = this.postureCompileState.get(evaluatorId);
    if (status === 'done') {
      return this.compiled.postureEvaluators[evaluatorId] ?? null;
    }
    if (status === 'failed') {
      return null;
    }
    if (status === 'compiling') {
      this.reportPostureCycle(evaluatorId);
      this.postureCompileState.set(evaluatorId, 'failed');
      return null;
    }

    const def = this.authoredLibrary.postureEvaluators?.[evaluatorId];
    if (def === undefined) {
      this.reportPostureRefUnknown(`posture.${evaluatorId}`, `doc.agents.library.postureEvaluators.${evaluatorId}`);
      this.postureCompileState.set(evaluatorId, 'failed');
      return null;
    }

    this.postureCompileState.set(evaluatorId, 'compiling');
    this.postureStack.push(evaluatorId);
    const context = this.createExprContext('postureEvaluator', true);
    const compiled = compilePostureEvaluatorDefinition({
      evaluatorId,
      def,
      context,
      diagnostics: this.diagnostics,
      reportPostureRefUnknown: (refPath, path) => this.reportPostureRefUnknown(refPath, path),
    });
    this.postureStack.pop();

    if (compiled === null) {
      this.postureCompileState.set(evaluatorId, 'failed');
      return null;
    }
    this.compiled.postureEvaluators[evaluatorId] = compiled;
    this.postureCompileState.set(evaluatorId, 'done');
    return compiled;
  }

  private compileConsideration(considerationId: string): AgentConsiderationWithExpr | null {
    const status = this.considerationStatus.get(considerationId);
    if (status === 'done') {
      return this.compiled.considerations[considerationId] ?? null;
    }
    if (status === 'failed') {
      return null;
    }
    const def = this.authoredLibrary.considerations?.[considerationId];
    if (def === undefined) {
      this.considerationStatus.set(considerationId, 'failed');
      return null;
    }

    const path = `doc.agents.library.considerations.${considerationId}`;
    const scopes = normalizeConsiderationScopes(def.scopes, `${path}.scopes`, this.diagnostics);
    if (scopes === null) {
      this.considerationStatus.set(considerationId, 'failed');
      return null;
    }

    const context = this.createExprContext('consideration');
    const valueContext = this.createExprContext('consideration', true);
    const when = def.when === undefined
      ? null
      : analyzePolicyExpr(def.when, context, this.diagnostics, `${path}.when`);
    const weight = analyzePolicyExpr(def.weight, context, this.diagnostics, `${path}.weight`);
    const value = analyzePolicyExpr(def.value, valueContext, this.diagnostics, `${path}.value`);
    if (weight === null || value === null || (def.when !== undefined && when === null)) {
      this.considerationStatus.set(considerationId, 'failed');
      return null;
    }
    if (when !== null && when.valueType !== 'boolean') {
      this.diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_TYPE_INVALID,
        path: `${path}.when`,
        severity: 'error',
        message: `Consideration "${considerationId}" when clauses must compile to boolean.`,
        suggestion: 'Use a boolean policy expression for consideration.when.',
      });
      this.considerationStatus.set(considerationId, 'failed');
      return null;
    }
    const lookupRefIds = collectLookupRefIds(value.expr);
    const currentStateLookupRefIds = collectLookupRefIds(value.expr, 'policyState');
    const projectedStateLookupRefIds = collectLookupRefIds(value.expr, 'previewOptionState');
    const candidateParamRefIds = collectCandidateParamRefIds(value.expr);
    const scheduleDistanceRefIds = collectScheduleDistanceRefIds(value.expr);
    const phaseBoundaryContext = buildPhaseBoundaryValidationContext(this.options.phaseBoundaries, this.options.turnStructure ?? null);
    const topNVisibleScheduleDistanceRefIds = collectTopNVisibleScheduleDistanceRefIds(value.expr, phaseBoundaryContext);
    if (weight.valueType !== 'number' || (value.valueType !== 'number' && lookupRefIds.length === 0)) {
      this.diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_TYPE_INVALID,
        path,
        severity: 'error',
        message: `Consideration "${considerationId}" weight and value must both compile to number.`,
        suggestion: 'Use numeric policy expressions for consideration.weight and consideration.value.',
      });
      this.considerationStatus.set(considerationId, 'failed');
      return null;
    }
    if (def.clamp !== undefined && def.clamp.min !== undefined && def.clamp.max !== undefined && def.clamp.min > def.clamp.max) {
      this.diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_EXPR_INVALID,
        path: `${path}.clamp`,
        severity: 'error',
        message: `Consideration "${considerationId}" clamp min must be less than or equal to max.`,
        suggestion: 'Swap or correct the clamp bounds so min <= max.',
      });
      this.considerationStatus.set(considerationId, 'failed');
      return null;
    }

    const previewFallback = lowerPreviewFallback(considerationId, `${path}.previewFallback`, def.previewFallback, this.diagnostics);
    if (previewFallback === null) {
      this.considerationStatus.set(considerationId, 'failed');
      return null;
    }
    const lookupFallback = lowerLookupFallback(considerationId, `${path}.lookupFallback`, def.lookupFallback, this.diagnostics);
    if (lookupFallback === null) {
      this.considerationStatus.set(considerationId, 'failed');
      return null;
    }
    const candidateParamFallback = lowerCandidateParamFallback(
      considerationId,
      `${path}.candidateParamFallback`,
      def.candidateParamFallback,
      this.diagnostics,
    );
    if (candidateParamFallback === null) {
      this.considerationStatus.set(considerationId, 'failed');
      return null;
    }
    const scheduleFallback = lowerScheduleFallback(
      considerationId,
      `${path}.scheduleFallback`,
      def.scheduleFallback,
      this.diagnostics,
    );
    if (scheduleFallback === null) {
      this.considerationStatus.set(considerationId, 'failed');
      return null;
    }

    const previewOptionRefIds = collectPreviewOptionRefIds(value.expr), previewSeatAggRefs = collectPreviewSeatAggRefIds(value.expr);
    const previewDerivedRefIds = uniqueSorted([...previewOptionRefIds, ...previewSeatAggRefs.fallbackRequired, ...projectedStateLookupRefIds]);
    if ((previewOptionRefIds.length > 0 || previewSeatAggRefs.fallbackRequired.length > 0) && previewFallback === undefined) {
      this.diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_REF_REQUIRES_EXPLICIT_FALLBACK, path: `${path}.previewFallback`, severity: 'error',
        message: `Consideration "${considerationId}" references ${previewDerivedRefIds.join(', ')} but does not declare previewFallback.onUnavailable.`,
        suggestion: 'Add either previewFallback: { onUnavailable: noContribution } or previewFallback: { onUnavailable: { constant: 0 } }.',
      });
      this.considerationStatus.set(considerationId, 'failed');
      return null;
    }
    warnImplicitPreviewSeatAggAvailability(this.diagnostics, considerationId, path, previewSeatAggRefs.implicitSkipUnavailable);
    if (projectedStateLookupRefIds.length > 0 && previewFallback === undefined) {
      this.diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PROJECTED_LOOKUP_REQUIRES_PREVIEW_FALLBACK,
        path: `${path}.previewFallback`,
        severity: 'error',
        message: `Consideration "${considerationId}" references projected lookup refs ${projectedStateLookupRefIds.join(', ')} but does not declare previewFallback.onUnavailable.`,
        suggestion: 'Add either previewFallback: { onUnavailable: noContribution } or previewFallback: { onUnavailable: { constant: 0 } }.',
      });
      this.considerationStatus.set(considerationId, 'failed');
      return null;
    }
    if (currentStateLookupRefIds.length > 0 && lookupFallback === undefined) {
      this.diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_LOOKUP_REF_REQUIRES_EXPLICIT_FALLBACK,
        path: `${path}.lookupFallback`,
        severity: 'error',
        message: `Consideration "${considerationId}" references current-state lookup refs ${currentStateLookupRefIds.join(', ')} but does not declare lookupFallback.onUnavailable.`,
        suggestion: 'Add either lookupFallback: { onUnavailable: noContribution } or lookupFallback: { onUnavailable: { constant: 0 } }.',
      });
      this.considerationStatus.set(considerationId, 'failed');
      return null;
    }
    if (candidateParamRefIds.length > 0 && candidateParamFallback === undefined) {
      this.diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_CANDIDATE_PARAM_REF_REQUIRES_EXPLICIT_FALLBACK,
        path: `${path}.candidateParamFallback`,
        severity: 'error',
        message: `Consideration "${considerationId}" reads candidate.params.* ref(s) [${candidateParamRefIds.join(', ')}] without declaring candidateParamFallback.onUnavailable. Add candidateParamFallback: { onUnavailable: noContribution } or { onUnavailable: { constant: <number> } }.`,
        suggestion: 'Required for refs whose onMissing is "unavailable" (default). Refs with onMissing: { kind: constant } do not require this fallback.',
      });
      this.considerationStatus.set(considerationId, 'failed');
      return null;
    }
    if (scheduleDistanceRefIds.length > 0 && scheduleFallback === undefined) {
      this.diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.SCHEDULE_REF_MISSING_FALLBACK,
        path: `${path}.scheduleFallback`,
        severity: 'error',
        message: `Consideration "${considerationId}" reads schedule distance ref(s) [${scheduleDistanceRefIds.join(', ')}] without declaring scheduleFallback.onUnavailable.`,
        suggestion: 'Add scheduleFallback: { onUnavailable: noContribution }, dropConsideration, or { onUnavailable: { constant: <number> } }.',
      });
      this.considerationStatus.set(considerationId, 'failed');
      return null;
    }
    if (
      topNVisibleScheduleDistanceRefIds.length > 0
      && scheduleFallback?.onPartial?.visiblePrefixExhausted === undefined
    ) {
      this.diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.SCHEDULE_FALLBACK_PARTIAL_REQUIRED,
        path: `${path}.scheduleFallback.onPartial.visiblePrefixExhausted`,
        severity: 'error',
        message: `Consideration "${considerationId}" reads topNVisible schedule distance ref(s) [${topNVisibleScheduleDistanceRefIds.join(', ')}] without declaring scheduleFallback.onPartial.visiblePrefixExhausted.`,
        suggestion: 'Add scheduleFallback: { onUnavailable: noContribution, onPartial: { visiblePrefixExhausted: useLowerBound } } or another explicit partial fallback.',
      });
      this.considerationStatus.set(considerationId, 'failed');
      return null;
    }

    const compiled: AgentConsiderationWithExpr = {
      scopes,
      costClass: maxCostClass(maxCostClass(weight.costClass, value.costClass), when?.costClass ?? 'state'),
      ...(def.when === undefined ? {} : { when: when!.expr }),
      weight: weight.expr,
      value: value.expr,
      hasPreviewRef: previewDerivedRefIds.length > 0,
      hasLookupRef: lookupRefIds.length > 0,
      ...(def.unknownAs === undefined ? {} : { unknownAs: def.unknownAs }),
      ...(previewFallback === undefined ? {} : { previewFallback }),
      ...(lookupFallback === undefined ? {} : { lookupFallback }),
      ...(candidateParamFallback === undefined ? {} : { candidateParamFallback }),
      ...(scheduleFallback === undefined ? {} : { scheduleFallback }),
      ...(def.clamp === undefined ? {} : { clamp: def.clamp }),
      dependencies: mergeDependencies([when?.dependencies ?? emptyDependencies(), weight.dependencies, value.dependencies]),
    };

    this.validateConsiderationScopeRefs(considerationId, compiled, path);
    this.compiled.considerations[considerationId] = compiled;
    this.considerationStatus.set(considerationId, 'done');
    return compiled;
  }

  private compileTieBreaker(tieBreakerId: string): AgentTieBreakerWithExpr | null {
    const status = this.tieBreakerStatus.get(tieBreakerId);
    if (status === 'done') {
      return this.compiled.tieBreakers[tieBreakerId] ?? null;
    }
    if (status === 'failed') {
      return null;
    }
    const def = this.authoredLibrary.tieBreakers?.[tieBreakerId];
    if (def === undefined) {
      this.tieBreakerStatus.set(tieBreakerId, 'failed');
      return null;
    }
    const kind = normalizeTieBreakerKind(def.kind, `doc.agents.library.tieBreakers.${tieBreakerId}.kind`, this.diagnostics);
    if (kind === null) {
      this.tieBreakerStatus.set(tieBreakerId, 'failed');
      return null;
    }
    const context = this.createExprContext('tieBreaker');
    const value = def.value === undefined
      ? null
      : analyzePolicyExpr(def.value, context, this.diagnostics, `doc.agents.library.tieBreakers.${tieBreakerId}.value`);
    if (def.value !== undefined && value === null) {
      this.tieBreakerStatus.set(tieBreakerId, 'failed');
      return null;
    }
    if (!validateTieBreakerDefinition(kind, value, def, tieBreakerId, this.diagnostics)) {
      this.tieBreakerStatus.set(tieBreakerId, 'failed');
      return null;
    }

    const compiled: AgentTieBreakerWithExpr = {
      kind,
      costClass: value?.costClass ?? 'state',
      ...(def.value === undefined ? {} : { value: value!.expr }),
      ...(def.order === undefined ? {} : { order: [...def.order] }),
      dependencies: value?.dependencies ?? emptyDependencies(),
    };
    this.compiled.tieBreakers[tieBreakerId] = compiled;
    this.tieBreakerStatus.set(tieBreakerId, 'done');
    return compiled;
  }

  private compileStrategicCondition(conditionId: string): StrategicConditionWithExpr | null {
    const status = this.strategicConditionStatus.get(conditionId);
    if (status === 'done') {
      return this.compiled.strategicConditions[conditionId] ?? null;
    }
    if (status === 'failed') {
      return null;
    }
    if (status === 'compiling') {
      this.reportCycle('strategicConditions', conditionId, this.strategicConditionStack);
      this.strategicConditionStatus.set(conditionId, 'failed');
      return null;
    }

    const def = this.authoredLibrary.strategicConditions?.[conditionId];
    if (def === undefined) {
      this.reportUnknownLibraryRef(`condition.${conditionId}`, `doc.agents.library.strategicConditions.${conditionId}`);
      this.strategicConditionStatus.set(conditionId, 'failed');
      return null;
    }

    this.strategicConditionStatus.set(conditionId, 'compiling');
    this.strategicConditionStack.push(conditionId);
    const basePath = `doc.agents.library.strategicConditions.${conditionId}`;
    const context = this.createExprContext('strategicCondition');

    const targetAnalysis = analyzePolicyExpr(def.target, context, this.diagnostics, `${basePath}.target`);
    if (targetAnalysis === null) {
      this.strategicConditionStack.pop();
      this.strategicConditionStatus.set(conditionId, 'failed');
      return null;
    }
    if (targetAnalysis.valueType !== 'boolean' && targetAnalysis.valueType !== 'unknown') {
      this.diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_TYPE_INVALID,
        path: `${basePath}.target`,
        severity: 'error',
        message: `Strategic condition "${conditionId}" target must be a boolean expression, got "${targetAnalysis.valueType}".`,
        suggestion: 'Use a boolean comparison (gte, lte, eq, and, or, etc.) for the target expression.',
      });
      this.strategicConditionStack.pop();
      this.strategicConditionStatus.set(conditionId, 'failed');
      return null;
    }

    let proximityCompiled: StrategicConditionWithExpr['proximity'];
    if (def.proximity !== undefined) {
      const currentAnalysis = analyzePolicyExpr(def.proximity.current, context, this.diagnostics, `${basePath}.proximity.current`);
      if (currentAnalysis === null) {
        this.strategicConditionStack.pop();
        this.strategicConditionStatus.set(conditionId, 'failed');
        return null;
      }
      if (currentAnalysis.valueType !== 'number' && currentAnalysis.valueType !== 'unknown') {
        this.diagnostics.push({
          code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_TYPE_INVALID,
          path: `${basePath}.proximity.current`,
          severity: 'error',
          message: `Strategic condition "${conditionId}" proximity.current must be a numeric expression, got "${currentAnalysis.valueType}".`,
          suggestion: 'Use a numeric expression (add, sub, globalTokenAgg, etc.) for the proximity current value.',
        });
        this.strategicConditionStack.pop();
        this.strategicConditionStatus.set(conditionId, 'failed');
        return null;
      }
      if (def.proximity.threshold <= 0) {
        this.diagnostics.push({
          code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_TYPE_INVALID,
          path: `${basePath}.proximity.threshold`,
          severity: 'error',
          message: `Strategic condition "${conditionId}" proximity.threshold must be > 0, got ${def.proximity.threshold}.`,
          suggestion: 'Set the threshold to a positive number representing the target value.',
        });
        this.strategicConditionStack.pop();
        this.strategicConditionStatus.set(conditionId, 'failed');
        return null;
      }
      proximityCompiled = {
        current: currentAnalysis.expr,
        threshold: def.proximity.threshold,
      };
    }

    const compiled: StrategicConditionWithExpr = {
      target: targetAnalysis.expr,
      ...(proximityCompiled !== undefined ? { proximity: proximityCompiled } : {}),
    };
    this.compiled.strategicConditions[conditionId] = compiled;
    this.strategicConditionStack.pop();
    this.strategicConditionStatus.set(conditionId, 'done');
    return compiled;
  }

  private compileRelationship(relationshipId: string): AgentRelationshipWithExpr | null {
    const status = this.relationshipStatus.get(relationshipId);
    if (status === 'done') {
      return this.compiled.relationships[relationshipId] ?? null;
    }
    if (status === 'failed') {
      return null;
    }
    if (status === 'compiling') {
      this.reportCycle('relationships', relationshipId, this.relationshipStack);
      this.relationshipStatus.set(relationshipId, 'failed');
      return null;
    }

    const def = this.authoredLibrary.relationships?.[relationshipId];
    if (def === undefined) {
      this.reportUnknownLibraryRef(`relationship.${relationshipId}`, `doc.agents.library.relationships.${relationshipId}`);
      this.relationshipStatus.set(relationshipId, 'failed');
      return null;
    }

    this.relationshipStatus.set(relationshipId, 'compiling');
    this.relationshipStack.push(relationshipId);
    const basePath = `doc.agents.library.relationships.${relationshipId}`;
    const compiled = lowerRelationshipDefinition({
      relationshipId,
      def,
      basePath,
      diagnostics: this.diagnostics,
      createExprContext: () => this.createExprContext('relationship'),
      isKnownSeatToken: (seatToken, path, refPath) => this.isKnownSeatToken(seatToken, path, refPath),
      compileStrategicCondition: (conditionId) => this.compileStrategicCondition(conditionId),
      reportUnknownLibraryRef: (refPath, path) => this.reportUnknownLibraryRef(refPath, path),
    });
    this.relationshipStack.pop();
    if (compiled === null) {
      this.relationshipStatus.set(relationshipId, 'failed');
      return null;
    }
    this.compiled.relationships[relationshipId] = compiled;
    this.relationshipStatus.set(relationshipId, 'done');
    return compiled;
  }

  private parseRelationshipRef(scope: LibraryRefScope, refPath: string, path: string): { readonly role: AgentRelationshipWithExpr['role']; readonly field: 'seat' | 'gainValue' } | null {
    const parsed = parseRelationshipRefPath(refPath);
    if (parsed === null) {
      this.reportUnknownLibraryRef(refPath, path);
      return null;
    }
    const hasRole = Object.keys(this.authoredLibrary.relationships ?? {}).some((relationshipId) => {
      const relationship = this.compileRelationship(relationshipId);
      return relationship?.role === parsed.role;
    });
    if (!hasRole) {
      (scope === 'postureEvaluator' ? this.reportPostureRefUnknown : this.reportUnknownLibraryRef).call(this, refPath, path);
      return null;
    }
    return parsed;
  }

  private validateConsiderationScopeRefs(
    considerationId: string,
    consideration: AgentConsiderationWithExpr,
    path: string,
  ): void {
    const scopes = consideration.scopes ?? [];
    const refKinds = collectConsiderationRefKinds(consideration);
    const hasMoveOnlyRefs = refKinds.has('candidate') || refKinds.has('preview');
    const hasCandidateParamRefs = collectCandidateParamRefIds(consideration.value, 'all').length > 0
      || (consideration.when !== undefined && collectCandidateParamRefIds(consideration.when, 'all').length > 0)
      || collectCandidateParamRefIds(consideration.weight, 'all').length > 0;
    const hasMicroturnOnlyRefs = refKinds.has('microturn');

    if (scopes.length === 1) {
      const scope = scopes[0];
      if (scope === 'move' && hasMicroturnOnlyRefs) {
        this.diagnostics.push({
          code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_CONSIDERATION_SCOPE_VIOLATION,
          path,
          severity: 'error',
          message: `Consideration "${considerationId}" is move-scoped but references microturn-only refs.`,
          suggestion: 'Remove microturn.* refs or use the microturn scope.',
        });
      }
      if (scope === 'microturn' && hasMoveOnlyRefs) {
        this.diagnostics.push({
          code: hasCandidateParamRefs
            ? CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_CANDIDATE_PARAMS_SCOPE_INVALID
            : CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_CONSIDERATION_SCOPE_VIOLATION,
          path,
          severity: 'error',
          message: hasCandidateParamRefs
            ? `Consideration "${considerationId}" is microturn-scoped but references candidate.params.* refs.`
            : `Consideration "${considerationId}" is microturn-scoped but references move-only refs.`,
          suggestion: 'move.* refs cannot be used in microturn-scope considerations; remove candidate./preview./move refs or use the move scope.',
        });
      }
      return;
    }

    if (scopes.length > 1) {
      this.diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_CONSIDERATION_SCOPE_WARNING,
        path,
        severity: 'error',
        message: `Consideration "${considerationId}" must use exactly one scope: move or microturn.`,
        suggestion: 'Split mixed-scope scoring into separate move-scoped and microturn-scoped considerations.',
      });
    }
  }

  private lowerSelectorSource(source: GameSpecSelectorSource | undefined, path: string): LoweredSelectorSource | null {
    return lowerSelectorSource({
      source,
      path,
      diagnostics: this.diagnostics,
      candidateParamDefs: this.candidateParamDefs,
      compileSelector: (selectorId) => this.compileSelector(selectorId),
    });
  }

  private lowerSelectorQuality(
    quality: GameSpecSelectorDef['quality'] | undefined,
    path: string,
    context: AnalyzePolicyExprContext,
  ): {
    readonly order: QualitySpec['order'];
    readonly components: readonly {
      readonly component: QualitySpec['components'][number];
      readonly analysis: PolicyExprAnalysis;
    }[];
  } | null {
    if (quality === undefined) {
      return { order: 'qualityDesc', components: [] };
    }
    const order = quality.order ?? 'qualityDesc';
    if (order !== 'qualityDesc' && order !== 'qualityAsc') {
      this.diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_EXPR_INVALID,
        path: `${path}.order`,
        severity: 'error',
        message: 'Selector quality.order must be qualityDesc or qualityAsc.',
        suggestion: 'Set quality.order to qualityDesc or qualityAsc.',
      });
      return null;
    }
    const components = quality.components ?? [];
    const lowered = [];
    for (const [index, component] of components.entries()) {
      const componentPath = `${path}.components.${index}`;
      if (typeof component.id !== 'string' || component.id.length === 0) {
        this.diagnostics.push({
          code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_EXPR_INVALID,
          path: `${componentPath}.id`,
          severity: 'error',
          message: 'Selector quality component id must be a non-empty string.',
          suggestion: 'Set an id such as target-pressure.',
        });
        return null;
      }
      if (!Number.isSafeInteger(component.weight)) {
        this.diagnostics.push({
          code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_EXPR_INVALID,
          path: `${componentPath}.weight`,
          severity: 'error',
          message: 'Selector quality component weight must be a safe integer.',
          suggestion: 'Use exact integer weights for deterministic selector quality.',
        });
        return null;
      }
      const analysis = analyzePolicyExpr(component.value, context, this.diagnostics, `${componentPath}.value`);
      if (analysis === null) {
        return null;
      }
      if (analysis.valueType !== 'number' && analysis.valueType !== 'unknown') {
        this.diagnostics.push({
          code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_TYPE_INVALID,
          path: `${componentPath}.value`,
          severity: 'error',
          message: 'Selector quality component value must compile to number.',
          suggestion: 'Use a numeric policy expression for component.value.',
        });
        return null;
      }
      const previewRefs = collectPreviewOptionRefIds(analysis.expr);
      if (previewRefs.length > 0 && component.previewFallback === undefined) {
        this.diagnostics.push({
          code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_SELECTOR_COMPONENT_REQUIRES_FALLBACK,
          path: `${componentPath}.previewFallback`,
          severity: 'error',
          message: `Selector quality component "${component.id}" references preview-derived refs but has no previewFallback.`,
          suggestion: 'Add previewFallback: { onUnavailable: noContribution } to the component.',
        });
        return null;
      }
      const fallback = lowerPreviewFallback(component.id, `${componentPath}.previewFallback`, component.previewFallback, this.diagnostics);
      if (fallback === null) {
        return null;
      }
      lowered.push({
        component: {
          id: component.id as QualitySpec['components'][number]['id'],
          value: analysis.expr,
          weight: component.weight,
          ...(fallback === undefined ? {} : { previewFallback: fallback }),
        },
        analysis,
      });
    }
    return { order, components: lowered };
  }

  private createExprContext(scope: LibraryRefScope, allowLookup = false): AnalyzePolicyExprContext {
    const context: AnalyzePolicyExprContext = {
      parameterDefs: this.parameterDefs,
      ...(this.options.referenceSeatIds === undefined ? {} : { referenceSeatIds: this.options.referenceSeatIds }),
      resolveRef: (refPath: string, path: string) => this.resolveRef(scope, refPath, path),
      resolveObjectRef: (expr: Readonly<Record<string, GameSpecPolicyExpr>>, path: string) =>
        this.resolveObjectRef(scope, expr, path),
      ...(allowLookup ? {
        resolveLookup: (expr: GameSpecPolicyExpr, path: string) => this.lowerLookupValue(scope, expr, path, context),
      } : {}),
    };
    return context;
  }

  private lowerLookupValue(
    scope: LibraryRefScope,
    expr: GameSpecPolicyExpr,
    path: string,
    context: AnalyzePolicyExprContext,
  ): PolicyExprAnalysis | null {
    if (scope !== 'consideration' && scope !== 'selector') {
      this.diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_EXPR_INVALID,
        path,
        severity: 'error',
        message: 'lookup expressions are only supported in agent consideration values and selector expressions.',
        suggestion: 'Move lookup refs into doc.agents.library.considerations.<id>.value or selector quality/where expressions.',
      });
      return null;
    }
    if (expr === null || typeof expr !== 'object' || Array.isArray(expr)) {
      this.diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_EXPR_INVALID,
        path: `${path}.lookup`,
        severity: 'error',
        message: 'lookup must be an object with surface, collection, keyType, key, path, and onMissing fields.',
        suggestion: 'Use lookup: { surface: policyState, collection, keyType, key, path, onMissing }.',
      });
      return null;
    }

    const obj = expr as Readonly<Record<string, unknown>>;
    const surface = obj['surface'];
    const collection = obj['collection'];
    const keyType = obj['keyType'];
    const keyExpr = obj['key'];
    const pathExpr = obj['path'];
    const onMissing = obj['onMissing'];
    const onHidden = obj['onHidden'];

    if (!isLookupSurface(surface)) {
      this.diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_LOOKUP_UNKNOWN_SURFACE,
        path: `${path}.lookup.surface`,
        severity: 'error',
        message: `lookup.surface must be policyState or previewOptionState, got ${JSON.stringify(surface)}.`,
        suggestion: 'Set lookup.surface to policyState or previewOptionState.',
      });
      return null;
    }
    if (!isLookupCollection(collection)) {
      this.diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_EXPR_INVALID,
        path: `${path}.lookup.collection`,
        severity: 'error',
        message: `lookup.collection must be zones, tokens, players, or globals, got ${JSON.stringify(collection)}.`,
        suggestion: 'Set lookup.collection to one of zones, tokens, players, or globals.',
      });
      return null;
    }
    if (!isLookupKeyType(keyType)) {
      this.diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_EXPR_INVALID,
        path: `${path}.lookup.keyType`,
        severity: 'error',
        message: `lookup.keyType must be ZoneId, TokenId, PlayerId, or string, got ${JSON.stringify(keyType)}.`,
        suggestion: 'Use keyType: ZoneId, TokenId, PlayerId, or string.',
      });
      return null;
    }

    const key = analyzePolicyExpr(keyExpr as GameSpecPolicyExpr, context, this.diagnostics, `${path}.lookup.key`);
    if (key === null) {
      return null;
    }
    const loweredKey = lowerAgentPolicyExpr(key.expr);
    if (loweredKey === null) {
      this.diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_EXPR_INVALID,
        path: `${path}.lookup.key`,
        severity: 'error',
        message: 'lookup.key could not be lowered to a compiled policy expression.',
        suggestion: 'Use a compileable scalar policy expression for lookup.key.',
      });
      return null;
    }
    if (!Array.isArray(pathExpr) || pathExpr.length === 0 || !pathExpr.every((entry) => typeof entry === 'string' && entry.length > 0)) {
      this.diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_EXPR_INVALID,
        path: `${path}.lookup.path`,
        severity: 'error',
        message: 'lookup.path must be a non-empty array of non-empty strings.',
        suggestion: 'Use a path such as [properties, population].',
      });
      return null;
    }

    const loweredOnMissing = lowerLookupMissingDisposition(onMissing, `${path}.lookup.onMissing`, this.diagnostics);
    if (loweredOnMissing === null) {
      return null;
    }
    if (onHidden !== undefined && onHidden !== 'unavailable') {
      this.diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_LOOKUP_HIDDEN_OVERRIDE_REJECTED,
        path: `${path}.lookup.onHidden`,
        severity: 'error',
        message: 'lookup.onHidden must be unavailable; hidden state cannot be overridden by profile authoring.',
        suggestion: 'Remove lookup.onHidden or set it to unavailable.',
      });
      return null;
    }
    if (surface === 'previewOptionState') {
      const previewKeyRefIds = collectPreviewOptionRefIds(loweredKey);
      const projectedKeyLookupRefIds = collectLookupRefIds(loweredKey, 'previewOptionState');
      const previewDerivedKeyRefIds = uniqueSorted([...previewKeyRefIds, ...projectedKeyLookupRefIds]);
      if (previewDerivedKeyRefIds.length > 0) {
        this.diagnostics.push({
          code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PROJECTED_LOOKUP_KEY_NOT_PREVIEW_FREE,
          path: `${path}.lookup.key`,
          severity: 'error',
          message: `lookup.surface previewOptionState key expression references preview-derived refs ${previewDerivedKeyRefIds.join(', ')}.`,
          suggestion: 'Use root candidate or microturn refs such as microturn.option.value for projected lookup keys.',
        });
        return null;
      }
    }

    return withCompiledLookupRef({
      kind: 'lookup',
      surface,
      collection,
      keyType,
      key: loweredKey,
      path: pathExpr,
      onMissing: loweredOnMissing,
      onHidden: 'unavailable',
    }, key);
  }

  private resolveRef(scope: LibraryRefScope, refPath: string, path: string): ResolvedPolicyRef | null {
    if (refPath.startsWith('feature.')) {
      const featureId = refPath.slice('feature.'.length);
      if (featureId.length === 0) {
        this.reportUnknownLibraryRef(refPath, path);
        return null;
      }
      if (scope === 'stateFeature') {
        const feature = this.compileStateFeature(featureId);
        if (feature === null) {
          return null;
        }
        return {
          type: feature.type,
          costClass: feature.costClass,
          ref: { kind: 'library', refKind: 'stateFeature', id: featureId },
          dependency: { kind: 'stateFeatures', id: featureId },
        };
      }
      const stateFeature = this.authoredLibrary.stateFeatures?.[featureId];
      const candidateFeature = this.authoredLibrary.candidateFeatures?.[featureId];
      if (stateFeature !== undefined && candidateFeature !== undefined) {
        this.diagnostics.push({
          code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_REF_UNKNOWN,
          path,
          severity: 'error',
          message: `feature.${featureId} is ambiguous because it exists in both stateFeatures and candidateFeatures.`,
          suggestion: 'Use distinct feature ids across state and candidate scopes.',
        });
        return null;
      }
      if (candidateFeature !== undefined) {
        const compiled = this.compileCandidateFeature(featureId);
        if (compiled === null) {
          return null;
        }
        return {
          type: compiled.type,
          costClass: compiled.costClass,
          ref: { kind: 'library', refKind: 'candidateFeature', id: featureId },
          dependency: { kind: 'candidateFeatures', id: featureId },
        };
      }
      if (stateFeature !== undefined) {
        const compiled = this.compileStateFeature(featureId);
        if (compiled === null) {
          return null;
        }
        return {
          type: compiled.type,
          costClass: compiled.costClass,
          ref: { kind: 'library', refKind: 'stateFeature', id: featureId },
          dependency: { kind: 'stateFeatures', id: featureId },
        };
      }
      this.reportUnknownLibraryRef(refPath, path);
      return null;
    }

    if (refPath.startsWith('aggregate.')) {
      if (scope === 'stateFeature' || scope === 'candidateFeature') {
        this.diagnostics.push({
          code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_REF_UNKNOWN,
          path,
          severity: 'error',
          message: `Feature expressions may not depend on aggregate refs ("${refPath}").`,
          suggestion: 'Reference only runtime refs, parameters, and allowed feature refs inside feature expressions.',
        });
        return null;
      }
      const aggregateId = refPath.slice('aggregate.'.length);
      const aggregate = this.compileAggregate(aggregateId);
      if (aggregate === null) {
        return null;
      }
      return {
        type: aggregate.type,
        costClass: aggregate.costClass,
        ref: { kind: 'library', refKind: 'aggregate', id: aggregateId },
        dependency: { kind: 'aggregates', id: aggregateId },
      };
    }

    if (refPath === 'selector.item.key') {
      if (scope !== 'selector') {
        this.reportUnknownLibraryRef(refPath, path);
        return null;
      }
      return { type: 'id', costClass: 'state', ref: { kind: 'selectorItemIntrinsic', intrinsic: 'key' } };
    }

    if (refPath.startsWith('selector.')) {
      const parsed = parseSelectorRef(refPath);
      if (parsed === null) {
        this.reportSelectorRefUnknown(refPath, path);
        return null;
      }
      const selector = this.compileSelector(parsed.selectorId);
      if (selector === null) {
        return null;
      }
      return {
        type: parsed.type,
        costClass: selectorCostToPolicyCostClass(selector.costClass),
        ref: { kind: 'selector', selectorId: parsed.selectorId, field: parsed.field },
        dependency: { kind: 'selectors', id: parsed.selectorId },
      };
    }

    if (refPath.startsWith('condition.')) {
      // Trigger lazy compilation for the referenced condition before parsing.
      const rest = refPath.slice('condition.'.length);
      const dotIndex = rest.indexOf('.');
      if (dotIndex > 0) {
        this.compileStrategicCondition(rest.slice(0, dotIndex));
      }
      const parsed = parseStrategicConditionRef(refPath, this.compiled.strategicConditions);
      if (parsed === null) {
        this.reportUnknownLibraryRef(refPath, path);
        return null;
      }
      if (!parsed.ok) {
        if (parsed.error.code === 'noProximity') {
          this.diagnostics.push({
            code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_REF_UNKNOWN,
            path,
            severity: 'error',
            message: `Strategic condition "${parsed.error.conditionId}" has no proximity defined, cannot reference "condition.${parsed.error.conditionId}.proximity".`,
            suggestion: `Add a proximity section to strategicConditions.${parsed.error.conditionId} or use condition.${parsed.error.conditionId}.satisfied instead.`,
          });
        } else {
          this.reportUnknownLibraryRef(refPath, path);
        }
        return null;
      }
      return {
        type: parsed.ref.type,
        costClass: 'state',
        ref: { kind: 'strategicCondition', conditionId: parsed.ref.conditionId, field: parsed.ref.field },
        dependency: { kind: 'strategicConditions', id: parsed.ref.conditionId },
      };
    }

    if (refPath.startsWith('relationship.')) {
      const parsed = this.parseRelationshipRef(scope, refPath, path);
      if (parsed === null) {
        return null;
      }
      return {
        type: parsed.field === 'seat' ? 'id' : 'number',
        costClass: 'state',
        ref: { kind: 'relationship', role: parsed.role, field: parsed.field },
      };
    }

    if (refPath.startsWith('module.')) {
      const parsed = parseModuleRef(refPath);
      if (parsed === null) {
        this.reportModuleRefUnknown(refPath, path);
        return null;
      }
      const module = this.compileStrategyModule(parsed.moduleId);
      if (module === null) {
        return null;
      }
      return {
        type: parsed.type,
        costClass: moduleCostToPolicyCostClass(module.costClass),
        ref: { kind: 'strategyModule', moduleId: parsed.moduleId, field: parsed.field },
        dependency: { kind: 'strategyModules', id: parsed.moduleId },
      };
    }

    if (refPath.startsWith('guardrail.')) {
      const parsed = parseGuardrailRef(refPath);
      if (parsed === null) {
        this.reportGuardrailRefUnknown(refPath, path);
        return null;
      }
      const guardrail = this.compileGuardrail(parsed.guardrailId);
      if (guardrail === null) {
        return null;
      }
      return {
        type: parsed.type,
        costClass: selectorCostToPolicyCostClass(guardrail.costClass),
        ref: { kind: 'guardrail', guardrailId: parsed.guardrailId, field: parsed.field },
        dependency: { kind: 'guardrails', id: parsed.guardrailId },
      };
    }

    if (refPath.startsWith('turnShape.')) {
      const parsed = parseTurnShapeRef(refPath);
      if (parsed === null) {
        this.reportTurnShapeRefUnknown(refPath, path);
        return null;
      }
      if (
        scope === 'turnShapeEvaluator'
        && parsed.evaluatorId === this.turnShapeStack.at(-1)
        && path.includes('.minimumImpact')
      ) {
        return {
          type: parsed.type,
          costClass: 'preview',
          ref: { kind: 'turnShape', evaluatorId: parsed.evaluatorId, field: parsed.field },
        };
      }
      const evaluator = this.compileTurnShapeEvaluator(parsed.evaluatorId);
      if (evaluator === null) {
        return null;
      }
      return {
        type: parsed.type,
        costClass: 'preview',
        ref: { kind: 'turnShape', evaluatorId: parsed.evaluatorId, field: parsed.field },
        dependency: { kind: 'turnShapeEvaluators', id: parsed.evaluatorId },
      };
    }

    return this.resolveRuntimeRef(scope, refPath, path);
  }

  private resolveRuntimeRef(scope: LibraryRefScope, refPath: string, path: string): ResolvedPolicyRef | null {
    if (scope === 'consideration') {
      const retiredRefDiagnostic = this.reportRetiredCompletionRuntimeRef(refPath, path);
      if (retiredRefDiagnostic) return null;
      const microturnResolved = this.resolveMicroturnRuntimeRef(refPath);
      if (microturnResolved !== null) return microturnResolved;
    }
    if (refPath === 'seat.self' || refPath === 'seat.active') {
      return {
        type: 'id',
        costClass: 'state',
        ref: { kind: 'seatIntrinsic', intrinsic: refPath === 'seat.self' ? 'self' : 'active' },
      };
    }
    if (refPath === 'turn.phaseId' || refPath === 'turn.stepId') {
      return {
        type: 'id',
        costClass: 'state',
        ref: { kind: 'turnIntrinsic', intrinsic: refPath === 'turn.phaseId' ? 'phaseId' : 'stepId' },
      };
    }
    if (refPath === 'turn.round') {
      return { type: 'number', costClass: 'state', ref: { kind: 'turnIntrinsic', intrinsic: 'round' } };
    }
    const phaseRef = this.resolvePhaseRuntimeRef(scope, refPath, path);
    if (phaseRef !== null) {
      return phaseRef;
    }
    const scheduleRef = this.resolveScheduleRuntimeRef(scope, refPath, path);
    if (scheduleRef !== null) {
      return scheduleRef;
    }
    if (refPath === 'candidate.actionId' || refPath === 'candidate.stableMoveKey') {
      if (scope === 'stateFeature') {
        this.reportUnknownLibraryRef(refPath, path);
        return null;
      }
      return {
        type: 'id',
        costClass: 'candidate',
        ref: {
          kind: 'candidateIntrinsic',
          intrinsic: refPath === 'candidate.actionId' ? 'actionId' : 'stableMoveKey',
        },
      };
    }
    if (refPath === 'candidate.paramCount') {
      if (scope === 'stateFeature') {
        this.reportUnknownLibraryRef(refPath, path);
        return null;
      }
      return { type: 'number', costClass: 'candidate', ref: { kind: 'candidateIntrinsic', intrinsic: 'paramCount' } };
    }
    if (refPath.startsWith('candidate.params.')) {
      return this.resolveCandidateParamRef(scope, refPath, path);
    }
    if (refPath.startsWith('candidate.param.')) {
      this.reportInvalidCandidateParamRef(refPath, path);
      return null;
    }

    if (refPath.startsWith('move.')) {
      const moveRefPath = refPath.slice('move.'.length);
      if (moveRefPath === 'actionId') {
        return { type: 'id', costClass: 'candidate', ref: { kind: 'candidateIntrinsic', intrinsic: 'actionId' } };
      }
      if (moveRefPath === 'stableMoveKey') {
        return { type: 'id', costClass: 'candidate', ref: { kind: 'candidateIntrinsic', intrinsic: 'stableMoveKey' } };
      }
      if (moveRefPath === 'paramCount') {
        return { type: 'number', costClass: 'candidate', ref: { kind: 'candidateIntrinsic', intrinsic: 'paramCount' } };
      }
      this.reportUnknownLibraryRef(refPath, path);
      return null;
    }

    // context.kind — evaluation context discriminator
    if (refPath === 'context.kind') {
      return { type: 'id', costClass: 'state', ref: { kind: 'contextKind' } };
    }

    // candidate.tag.<tagName> — boolean tag membership check
    if (refPath.startsWith('candidate.tag.')) {
      if (scope === 'stateFeature') {
        this.reportUnknownLibraryRef(refPath, path);
        return null;
      }
      const tagName = refPath.slice('candidate.tag.'.length);
      if (tagName.length === 0 || tagName.includes('.')) {
        this.diagnostics.push({
          code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_EXPR_INVALID,
          path,
          severity: 'error',
          message: `Invalid tag ref "${refPath}" — expected candidate.tag.<tagName>.`,
          suggestion: 'Use candidate.tag.<kebab-case-tag-name> to check tag membership.',
        });
        return null;
      }
      return { type: 'boolean', costClass: 'candidate', ref: { kind: 'candidateTag', tagName } };
    }

    // candidate.tags — all tags on the candidate's action
    if (refPath === 'candidate.tags') {
      if (scope === 'stateFeature') {
        this.reportUnknownLibraryRef(refPath, path);
        return null;
      }
      return { type: 'idList', costClass: 'candidate', ref: { kind: 'candidateTags' } };
    }

    const previewOptionResolved = this.resolvePreviewOptionRuntimeRef(scope, refPath, path);
    if (previewOptionResolved !== null) {
      return previewOptionResolved;
    }

    const previewPlanResolved = this.resolvePreviewPlanRuntimeRef(scope, refPath, path);
    if (previewPlanResolved !== null) {
      return previewPlanResolved;
    }

    const previewResolved = this.resolvePreviewRuntimeRef(scope, refPath, path);
    if (previewResolved !== null) {
      return previewResolved;
    }

    const surfaceResolved = this.resolveSurfaceRuntimeRef(refPath, path, false);
    if (surfaceResolved !== null) {
      const ref = surfaceResolved.ref as { readonly family?: string };
      const surfaceType = ref.family === 'globalMarker'
        || ref.family === 'activeCardIdentity'
        ? 'id' as const
        : ref.family === 'activeCardMetadata'
          ? 'unknown' as const
          : 'number' as const;
      return { type: surfaceType, costClass: 'state', ref: surfaceResolved.ref };
    }

    this.reportUnknownLibraryRef(refPath, path);
    return null;
  }

  private reportRetiredCompletionRuntimeRef(refPath: string, path: string): boolean {
    switch (refPath) {
      case 'decision.type':
      case 'decision.name':
      case 'decision.targetKind':
      case 'decision.optionCount':
      case 'option.value':
      case 'preview.phase1':
      case 'preview.phase1CompletionsPerAction': {
        const replacement = refPath === 'option.value'
          ? 'microturn.option.value'
          : refPath === 'decision.type'
            ? 'microturn.kind'
            : refPath === 'decision.name'
              ? 'microturn.decisionKey'
              : refPath === 'decision.targetKind'
                ? 'microturn.option.targetKind'
                : refPath === 'decision.optionCount'
                  ? 'microturn.remainingMaxCount'
                  : 'microturn.*';
        this.diagnostics.push({
          code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_REF_UNKNOWN,
          path,
          severity: 'error',
          message: `${refPath} is removed; use ${replacement}.`,
          suggestion: 'Migrate completion-scope refs to scopes: [microturn] with microturn.* refs.',
        });
        return true;
      }
      default:
        return false;
    }
  }

  private resolveMicroturnRuntimeRef(refPath: string): ResolvedPolicyRef | null {
    switch (refPath) {
      case 'microturn.kind':
        return { type: 'id', costClass: 'state', ref: { kind: 'microturnIntrinsic', intrinsic: 'kind' } };
      case 'microturn.decisionKey':
        return { type: 'id', costClass: 'state', ref: { kind: 'microturnIntrinsic', intrinsic: 'decisionKey' } };
      case 'microturn.actorSeat':
        return { type: 'id', costClass: 'state', ref: { kind: 'microturnIntrinsic', intrinsic: 'actorSeat' } };
      case 'microturn.remainingRequiredCount':
        return { type: 'number', costClass: 'state', ref: { kind: 'microturnIntrinsic', intrinsic: 'remainingRequiredCount' } };
      case 'microturn.remainingMaxCount':
        return { type: 'number', costClass: 'state', ref: { kind: 'microturnIntrinsic', intrinsic: 'remainingMaxCount' } };
      case 'microturn.option.value':
        return { type: 'unknown', costClass: 'state', ref: { kind: 'microturnOptionIntrinsic', intrinsic: 'value' } };
      case 'microturn.option.index':
        return { type: 'number', costClass: 'state', ref: { kind: 'microturnOptionIntrinsic', intrinsic: 'index' } };
      case 'microturn.option.stableKey':
        return { type: 'id', costClass: 'state', ref: { kind: 'microturnOptionIntrinsic', intrinsic: 'stableKey' } };
      case 'microturn.option.tags':
        return { type: 'idList', costClass: 'state', ref: { kind: 'microturnOptionIntrinsic', intrinsic: 'tags' } };
      case 'microturn.option.targetKind':
        return { type: 'id', costClass: 'state', ref: { kind: 'microturnOptionIntrinsic', intrinsic: 'targetKind' } };
      default:
        return null;
    }
  }

  private resolvePhaseRuntimeRef(scope: LibraryRefScope, refPath: string, path: string): ResolvedPolicyRef | null {
    switch (refPath) {
      case 'phase.current.id':
        if (scope === 'stateFeature') {
          this.reportUnknownLibraryRef(refPath, path);
          return null;
        }
        return { type: 'id', costClass: 'state', ref: { kind: 'phaseIntrinsic', name: 'current.id' } };
      case 'phase.next.id':
        if (scope === 'stateFeature') {
          this.reportUnknownLibraryRef(refPath, path);
          return null;
        }
        return { type: 'id', costClass: 'state', ref: { kind: 'phaseIntrinsic', name: 'next.id' } };
      default:
        if (refPath.startsWith('phase.')) {
          this.reportUnknownLibraryRef(refPath, path);
        }
        return null;
    }
  }

  private resolveScheduleRuntimeRef(scope: LibraryRefScope, refPath: string, path: string): ResolvedPolicyRef | null {
    if (refPath === 'schedule.nextBoundary.id') {
      if (scope === 'stateFeature') {
        this.reportUnknownLibraryRef(refPath, path);
        return null;
      }
      return {
        type: 'id',
        costClass: 'state',
        ref: { kind: 'scheduleDistance', target: { kind: 'nextBoundary' } },
      };
    }
    const prefix = 'schedule.distance.';
    if (!refPath.startsWith(prefix)) {
      return null;
    }
    if (scope === 'stateFeature') {
      this.reportUnknownLibraryRef(refPath, path);
      return null;
    }

    const context = buildPhaseBoundaryValidationContext(this.options.phaseBoundaries, this.options.turnStructure ?? null);
    const rest = refPath.slice(prefix.length);
    const boundaryPrefix = 'toBoundary.';
    if (rest.startsWith(boundaryPrefix)) {
      const parsed = parseScheduleTargetAndUnit(rest.slice(boundaryPrefix.length));
      if (parsed === null) {
        this.reportUnknownLibraryRef(refPath, path);
        return null;
      }
      return this.resolveBoundaryScheduleRef(context, parsed.targetId, parsed.unit, refPath, path);
    }

    const phasePrefix = 'toPhase.';
    if (rest.startsWith(phasePrefix)) {
      const parsed = parseScheduleTargetAndUnit(rest.slice(phasePrefix.length));
      if (parsed === null) {
        this.reportUnknownLibraryRef(refPath, path);
        return null;
      }
      return this.resolvePhaseScheduleRef(context, parsed.targetId, parsed.unit, refPath, path);
    }

    this.reportUnknownLibraryRef(refPath, path);
    return null;
  }

  private resolveBoundaryScheduleRef(
    context: PhaseBoundaryValidationContext,
    boundaryId: string,
    unit: ScheduleDistanceUnit,
    refPath: string,
    path: string,
  ): ResolvedPolicyRef | null {
    const boundary = findPhaseBoundaryById(context, boundaryId);
    if (boundary === undefined) {
      this.diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.SCHEDULE_REF_UNKNOWN_BOUNDARY,
        path,
        severity: 'error',
        message: `schedule ref "${refPath}" targets unknown boundary "${boundaryId}".`,
        suggestion: 'Declare the boundary in phaseBoundaries.',
      });
      return null;
    }
    if (!scheduleKindSupportsUnit(boundary.schedule, unit)) {
      this.diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.SCHEDULE_REF_UNSUPPORTED_UNIT,
        path,
        severity: 'error',
        message: `schedule ref "${refPath}" requests unit "${unit}" unsupported by boundary "${boundaryId}".`,
        suggestion: 'Use a unit supported by the boundary schedule kind.',
      });
      return null;
    }
    return {
      type: 'number',
      costClass: 'state',
      ref: { kind: 'scheduleDistance', target: { kind: 'boundary', boundaryId: asBoundaryId(boundaryId) }, unit },
    };
  }

  private resolvePhaseScheduleRef(
    context: PhaseBoundaryValidationContext,
    phaseId: string,
    unit: ScheduleDistanceUnit,
    refPath: string,
    path: string,
  ): ResolvedPolicyRef | null {
    if (!context.phaseIds.has(phaseId)) {
      this.diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.SCHEDULE_REF_UNKNOWN_PHASE,
        path,
        severity: 'error',
        message: `schedule ref "${refPath}" targets unknown phase "${phaseId}".`,
        suggestion: 'Reference a phase declared in turnStructure.phases or turnStructure.interrupts.',
      });
      return null;
    }
    if (!context.phaseEntryBoundaryPhaseIds.has(phaseId)) {
      this.diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.SCHEDULE_REF_NO_PHASE_BOUNDARY,
        path,
        severity: 'error',
        message: `schedule ref "${refPath}" targets phase "${phaseId}", but no phaseEntry boundary declares that phase.`,
        suggestion: 'Declare a phaseEntry boundary for this phase in phaseBoundaries.',
      });
      return null;
    }
    const matchingBoundaries = context.phaseBoundaries.filter(
      (entry) => entry.kind === 'phaseEntry' && String(entry.phaseId) === phaseId,
    );
    const boundary = matchingBoundaries[0];
    if (!scheduleKindSupportsUnit(boundary?.schedule, unit)) {
      this.diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.SCHEDULE_REF_UNSUPPORTED_UNIT,
        path,
        severity: 'error',
        message: `schedule ref "${refPath}" requests unit "${unit}" unsupported by phase "${phaseId}" boundary.`,
        suggestion: 'Use a unit supported by the phase entry boundary schedule kind.',
      });
      return null;
    }
    if (matchingBoundaries.length > 1) {
      this.diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.SCHEDULE_REF_AMBIGUOUS_PHASE_BOUNDARY,
        path,
        severity: 'warning',
        message: `schedule ref "${refPath}" matches ${matchingBoundaries.length} phaseEntry boundaries for phase "${phaseId}"; using first declared boundary "${String(boundary!.id)}".`,
        suggestion: 'Use schedule.distance.toBoundary.<BoundaryId>.cards when a specific boundary is required.',
      });
    }
    return {
      type: 'number',
      costClass: 'state',
      ref: { kind: 'scheduleDistance', target: { kind: 'boundary', boundaryId: boundary!.id }, unit },
    };
  }

  private resolvePreviewOptionRuntimeRef(scope: LibraryRefScope, refPath: string, path: string): ResolvedPolicyRef | null {
    if (!refPath.startsWith('preview.option.')) {
      return null;
    }
    if (scope === 'stateFeature') {
      this.diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_PREVIEW_NESTED,
        path,
        severity: 'error',
        message: `State features may not use preview-option refs ("${refPath}").`,
        suggestion: 'Use preview.option.* refs only from microturn-scope considerations.',
      });
      return null;
    }

    const optionPath = refPath.slice('preview.option.'.length);
    switch (optionPath) {
      case 'victory.currentMargin.self':
        if (this.options.hasVictoryMargins === false) {
          this.reportUnknownLibraryRef(refPath, path);
          return null;
        }
        return { type: 'number', costClass: 'preview', ref: { kind: 'previewOptionRef', refKind: 'victoryCurrentMarginSelf' } };
      case 'victory.currentRank.self':
        if (this.options.hasVictoryMargins === false) {
          this.reportUnknownLibraryRef(refPath, path);
          return null;
        }
        return { type: 'number', costClass: 'preview', ref: { kind: 'previewOptionRef', refKind: 'victoryCurrentRankSelf' } };
      case 'delta.victory.currentMargin.self':
        if (this.options.hasVictoryMargins === false) {
          this.reportUnknownLibraryRef(refPath, path);
          return null;
        }
        return { type: 'number', costClass: 'preview', ref: { kind: 'previewOptionRef', refKind: 'deltaVictoryCurrentMarginSelf' } };
      case 'outcome':
        return { type: 'id', costClass: 'preview', ref: { kind: 'previewOptionRef', refKind: 'outcome' } };
      case 'driveDepth':
        return { type: 'number', costClass: 'preview', ref: { kind: 'previewOptionRef', refKind: 'driveDepth' } };
      default:
        break;
    }

    if (optionPath.startsWith('var.global.')) {
      const id = optionPath.slice('var.global.'.length);
      if (id.length === 0 || this.surfaceVisibility.globalVars[id] === undefined) {
        if (scope === 'turnShapeEvaluator' && id.length > 0) {
          return { type: 'number', costClass: 'preview', ref: { kind: 'previewOptionRef', refKind: 'globalVar', id: tagUnregisteredTurnShapePreviewRef(id) } };
        }
        if (scope === 'selector') {
          this.reportSelectorUnregisteredPreviewRef(refPath, path);
          return null;
        }
        this.reportUnknownLibraryRef(refPath, path);
        return null;
      }
      return { type: 'number', costClass: 'preview', ref: { kind: 'previewOptionRef', refKind: 'globalVar', id } };
    }

    if (optionPath.startsWith('var.player.self.')) {
      const id = optionPath.slice('var.player.self.'.length);
      if (id.length === 0 || this.surfaceVisibility.perPlayerVars[id] === undefined) {
        if (scope === 'turnShapeEvaluator' && id.length > 0) {
          return { type: 'number', costClass: 'preview', ref: { kind: 'previewOptionRef', refKind: 'perPlayerVarSelf', id: tagUnregisteredTurnShapePreviewRef(id) } };
        }
        if (scope === 'selector') {
          this.reportSelectorUnregisteredPreviewRef(refPath, path);
          return null;
        }
        this.reportUnknownLibraryRef(refPath, path);
        return null;
      }
      return { type: 'number', costClass: 'preview', ref: { kind: 'previewOptionRef', refKind: 'perPlayerVarSelf', id } };
    }

    if (optionPath.startsWith('metric.')) {
      const id = optionPath.slice('metric.'.length);
      if (id.length === 0 || this.surfaceVisibility.derivedMetrics[id] === undefined) {
        if (scope === 'turnShapeEvaluator' && id.length > 0) {
          return { type: 'number', costClass: 'preview', ref: { kind: 'previewOptionRef', refKind: 'derivedMetric', id: tagUnregisteredTurnShapePreviewRef(id) } };
        }
        if (scope === 'selector') {
          this.reportSelectorUnregisteredPreviewRef(refPath, path);
          return null;
        }
        this.reportUnknownLibraryRef(refPath, path);
        return null;
      }
      return { type: 'number', costClass: 'preview', ref: { kind: 'previewOptionRef', refKind: 'derivedMetric', id } };
    }

    this.reportUnknownLibraryRef(refPath, path);
    return null;
  }

  private resolvePreviewPlanRuntimeRef(scope: LibraryRefScope, refPath: string, path: string): ResolvedPolicyRef | null {
    if (!refPath.startsWith('preview.plan.')) {
      return null;
    }
    if (scope === 'stateFeature') {
      this.diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_PREVIEW_NESTED,
        path,
        severity: 'error',
        message: `State features may not use preview-plan refs ("${refPath}").`,
        suggestion: 'Use preview.plan.* refs only from plan/posture-scoped policy expressions.',
      });
      return null;
    }

    const planPath = refPath.slice('preview.plan.'.length);
    switch (planPath) {
      case 'delta.victory.currentMargin.self':
        if (this.options.hasVictoryMargins === false) {
          this.reportUnknownLibraryRef(refPath, path);
          return null;
        }
        return { type: 'number', costClass: 'preview', ref: { kind: 'previewPlanRef', refKind: 'deltaVictoryCurrentMarginSelf' } };
      default:
        return null;
    }
  }

  private resolvePreviewRuntimeRef(scope: LibraryRefScope, refPath: string, path: string): ResolvedPolicyRef | null {
    if (!refPath.startsWith('preview.')) {
      return null;
    }
    if (scope === 'stateFeature') {
      this.diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_PREVIEW_NESTED,
        path,
        severity: 'error',
        message: `State features may not use preview refs ("${refPath}").`,
        suggestion: 'Limit preview usage to candidate-level library items and later evaluation stages.',
      });
      return null;
    }
    const nestedPath = refPath.slice('preview.'.length);
    if (nestedPath.startsWith('feature.')) {
      const featureId = nestedPath.slice('feature.'.length);
      if (featureId.length === 0) {
        this.reportUnknownLibraryRef(refPath, path);
        return null;
      }
      if (this.authoredLibrary.stateFeatures?.[featureId] === undefined) {
        this.reportUnknownLibraryRef(refPath, path);
        return null;
      }
      const feature = this.compileStateFeature(featureId);
      if (feature === null) {
        return null;
      }
      return {
        type: feature.type,
        costClass: 'preview',
        ref: { kind: 'library', refKind: 'previewStateFeature', id: featureId },
        dependency: { kind: 'stateFeatures', id: featureId },
      };
    }
    const resolved = this.resolveSurfaceRuntimeRef(nestedPath, path, true);
    if (resolved !== null) {
      const ref = resolved.ref as { readonly family?: string };
      const previewSurfaceType = ref.family === 'globalMarker'
        || ref.family === 'activeCardIdentity'
        ? 'id' as const
        : ref.family === 'activeCardMetadata'
          ? 'unknown' as const
          : 'number' as const;
      return { type: previewSurfaceType, costClass: 'preview', ref: resolved.ref };
    }
    this.reportUnknownLibraryRef(refPath, path);
    return null;
  }

  private resolveSurfaceRuntimeRef(
    refPath: string,
    path: string,
    preview: boolean,
  ): { readonly ref: ResolvedPolicyRef['ref'] } | null {
    const resolved = parseAuthoredPolicySurfaceRef(this.surfaceVisibility, refPath, preview ? 'preview' : 'current');
    if (resolved === null) {
      return null;
    }
    if (!this.validateResolvedSurfaceRef(resolved, path, refPath, preview)) {
      return null;
    }
    return {
      ref: {
        kind: resolved.kind,
        family: resolved.family,
        id: resolved.id,
        ...(resolved.selector === undefined ? {} : { selector: resolved.selector }),
      },
    };
  }

  private validateResolvedSurfaceRef(
    resolved: NonNullable<ReturnType<typeof parseAuthoredPolicySurfaceRef>>,
    path: string,
    refPath: string,
    preview: boolean,
  ): boolean {
    if (
      (resolved.family === 'victoryCurrentMargin' || resolved.family === 'victoryCurrentRank')
      && this.options.hasVictoryMargins === false
    ) {
      this.reportUnknownLibraryRef(refPath, path);
      return false;
    }
    const visibility = preview ? resolved.visibility.preview.visibility : resolved.visibility.current;
    if (visibility === 'hidden') {
      this.reportUnknownLibraryRef(refPath, path);
      return false;
    }
    if (resolved.selector?.kind === 'role' && !this.isKnownSeatToken(resolved.selector.seatToken, path, refPath)) {
      return false;
    }
    if (resolved.selector?.kind === 'role' && resolved.selector.seatToken.startsWith(POLICY_STANDING_ROLE_TOKEN_PREFIX) && this.options.hasVictoryMargins === false) {
      this.reportUnknownLibraryRef(refPath, path);
      return false;
    }
    if (resolved.family === 'perPlayerVar' && resolved.selector?.kind === 'role') {
      if (resolved.selector.seatToken === 'self' || resolved.selector.seatToken === 'active') {
        this.diagnostics.push({
          code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_REF_UNKNOWN,
          path,
          severity: 'error',
          message: `Per-player policy ref "${refPath}" uses seat-scoped "${resolved.selector.seatToken}" where a runtime-player selector is required.`,
          suggestion: `Use ${preview ? 'preview.' : ''}var.player.${resolved.selector.seatToken}.${resolved.id} for acting-player scoped per-player reads.`,
        });
        return false;
      }
      if (this.hasPotentialDuplicateRuntimeRoles()) {
        this.diagnostics.push({
          code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_REF_UNKNOWN,
          path,
          severity: 'error',
          message: `Per-player policy ref "${refPath}" is ambiguous because this spec can instantiate duplicate runtime players for one canonical seat.`,
          suggestion: 'Use var.player.self/active for runtime-player reads, or limit the spec so each canonical seat maps to at most one runtime player.',
        });
        return false;
      }
    }
    return true;
  }
  private isKnownSeatToken(seatToken: string, path: string, refPath: string): boolean {
    if (seatToken === 'self' || seatToken === 'active' || seatToken === '$seat') return true;
    if (seatToken.startsWith(POLICY_STANDING_ROLE_TOKEN_PREFIX)) {
      if (parsePolicyStandingRoleToken(seatToken) !== undefined) return true;
      this.reportUnknownLibraryRef(refPath, path);
      return false;
    }
    if (this.options.referenceSeatIds === undefined) return true;
    if (this.options.referenceSeatIds.includes(seatToken)) return true;
    this.reportUnknownLibraryRef(refPath, path);
    return false;
  }
  private resolveObjectRef(
    scope: LibraryRefScope,
    expr: Readonly<Record<string, GameSpecPolicyExpr>>,
    path: string,
  ): ResolvedPolicyRef | null {
    const entries = Object.entries(expr);
    if (entries.length !== 1) {
      this.diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_EXPR_INVALID,
        path,
        severity: 'error',
        message: 'Structured policy refs must contain exactly one ref path key.',
        suggestion: 'Use { candidate.params.<name>: { onMissing, appliesToActions } }.',
      });
      return null;
    }
    const [refPath, options] = entries[0]!;
    if (refPath.startsWith('candidate.params.')) {
      return this.resolveCandidateParamRef(scope, refPath, path, options);
    }
    this.diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_EXPR_INVALID,
      path,
      severity: 'error',
      message: `Structured policy ref "${refPath}" is not supported.`,
      suggestion: 'Use structured refs only for candidate.params.<name> options.',
    });
    return null;
  }

  private resolveCandidateParamRef(
    scope: LibraryRefScope,
    refPath: string,
    path: string,
    options?: unknown,
  ): ResolvedPolicyRef | null {
    if (scope === 'stateFeature') {
      this.reportUnknownLibraryRef(refPath, path);
      return null;
    }

    const paramName = refPath.slice('candidate.params.'.length);
    const candidateParamDef = this.candidateParamDefs[paramName];
    if (paramName.length === 0 || candidateParamDef === undefined) {
      this.reportUnknownCandidateParamRef(paramName, refPath, path);
      return null;
    }

    const optionRecord = parseCandidateParamRefOptions(options, path, this.diagnostics);
    if (optionRecord === null) {
      return null;
    }

    const onMissing = parseCandidateParamOnMissing(
      optionRecord.onMissing,
      candidateParamDef.type,
      `${path}.onMissing`,
      this.diagnostics,
    );
    if (onMissing === null) {
      return null;
    }

    const appliesToActions = parseCandidateParamAppliesToActions(optionRecord.appliesToActions, path, this.diagnostics);
    if (appliesToActions === null) {
      return null;
    }
    if (appliesToActions !== undefined && !this.validateCandidateParamAppliesToActions(paramName, appliesToActions, path)) {
      return null;
    }

    return {
      type: candidateParamDef.type,
      costClass: 'candidate',
      ref: {
        kind: 'candidateParam',
        id: paramName,
        onMissing,
        ...(appliesToActions === undefined ? {} : { appliesToActions }),
      },
    };
  }

  private reportUnknownCandidateParamRef(paramName: string, refPath: string, path: string): void {
    const inconsistent = this.isInconsistentCandidateParam(paramName);
    this.diagnostics.push({
      code: inconsistent
        ? CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_CANDIDATE_PARAMS_TYPE_INCONSISTENT
        : CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_CANDIDATE_PARAMS_UNKNOWN,
      path,
      severity: 'error',
      message: inconsistent
        ? `Candidate param ref "${refPath}" targets "${paramName}", but declarations for that param have inconsistent types across actions.`
        : `Candidate param ref "${refPath}" targets unknown candidate param "${paramName}".`,
      suggestion: 'Declare the candidate param on at least one action with a consistent action param domain.',
    });
  }

  private isInconsistentCandidateParam(paramName: string): boolean {
    const defs = collectCandidateParamDefsForName(this.options.actionDefs, this.options.actionPipelines, paramName);
    return defs.some((candidateParamDef, index) => {
      if (candidateParamDef === null) {
        return true;
      }
      return defs.slice(index + 1).some(
        (other) => other === null || !candidateParamDefsEqual(candidateParamDef, other),
      );
    });
  }

  private validateCandidateParamAppliesToActions(
    paramName: string,
    appliesToActions: readonly string[],
    path: string,
  ): boolean {
    let valid = true;
    const actions = this.options.actionDefs ?? [];
    const actionsById = new Map(actions.map((action) => [String(action.id), action]));
    for (const [index, actionId] of appliesToActions.entries()) {
      const action = actionsById.get(actionId);
      if (action === undefined) {
        this.diagnostics.push({
          code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_CANDIDATE_PARAMS_UNKNOWN_ACTION,
          path: `${path}.appliesToActions.${index}`,
          severity: 'error',
          message: `candidate.params.${paramName} appliesToActions references unknown action "${actionId}".`,
          suggestion: 'List only action ids declared by the compiled game definition.',
        });
        valid = false;
        continue;
      }
      if (!actionDeclaresCandidateParam(action, paramName)) {
        this.diagnostics.push({
          code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_CANDIDATE_PARAMS_UNKNOWN,
          path: `${path}.appliesToActions.${index}`,
          severity: 'error',
          message: `candidate.params.${paramName} applies to action "${actionId}", but that action does not declare candidate param "${paramName}".`,
          suggestion: 'Declare the param on that action or remove the action id from appliesToActions.',
        });
        valid = false;
      }
    }
    return valid;
  }

  private reportCycle(category: string, entryId: string, stack: readonly string[]): void {
    this.diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_DEPENDENCY_CYCLE,
      path: `doc.agents.library.${category}.${entryId}`,
      severity: 'error',
      message: `Agent policy dependency cycle detected: ${[...stack, entryId].join(' -> ')}.`,
      suggestion: 'Break the cycle so each policy library item depends on an acyclic graph.',
    });
  }

  private reportSelectorCycle(selectorId: string): void {
    this.diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_SELECTOR_DEPENDENCY_CYCLE,
      path: `doc.agents.library.selectors.${selectorId}`,
      severity: 'error',
      message: `Agent policy selector dependency cycle detected: ${[...this.selectorStack, selectorId].join(' -> ')}.`,
      suggestion: 'Break the cycle so each selector depends on an acyclic graph.',
    });
  }

  private reportModuleCycle(moduleId: string): void {
    this.diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_MODULE_DEPENDENCY_CYCLE,
      path: `doc.agents.library.strategyModules.${moduleId}`,
      severity: 'error',
      message: `Agent policy strategy module dependency cycle detected: ${[...this.strategyModuleStack, moduleId].join(' -> ')}.`,
      suggestion: 'Break the cycle so each strategy module depends on an acyclic graph.',
    });
  }

  private reportGuardrailCycle(guardrailId: string): void {
    this.diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_GUARDRAIL_DEPENDENCY_CYCLE,
      path: `doc.agents.library.guardrails.${guardrailId}`,
      severity: 'error',
      message: `Agent policy guardrail dependency cycle detected: ${[...this.guardrailStack, guardrailId].join(' -> ')}.`,
      suggestion: 'Break the cycle so each guardrail depends on an acyclic graph.',
    });
  }

  private reportTurnShapeCycle(evaluatorId: string): void {
    this.diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_TURNSHAPE_DEPENDENCY_CYCLE,
      path: `doc.agents.library.turnShapeEvaluators.${evaluatorId}`,
      severity: 'error',
      message: `Agent policy turn-shape evaluator dependency cycle detected: ${[...this.turnShapeStack, evaluatorId].join(' -> ')}.`,
      suggestion: 'Break the cycle so each turn-shape evaluator depends on an acyclic graph.',
    });
  }

  private reportPostureCycle(evaluatorId: string): void {
    this.diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POSTURE_DEPENDENCY_CYCLE,
      path: `doc.agents.library.postureEvaluators.${evaluatorId}`,
      severity: 'error',
      message: `Agent policy posture evaluator dependency cycle detected: ${[...this.postureStack, evaluatorId].join(' -> ')}.`,
      suggestion: 'Break the cycle so each posture evaluator depends on an acyclic graph.',
    });
  }

  private reportModuleRefUnknown(refPath: string, path: string): void {
    this.diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_MODULE_REF_UNKNOWN,
      path,
      severity: 'error',
      message: `Strategy module references unknown or unsupported ref "${refPath}".`,
      suggestion: 'Use declared selectors, modules, conditions, features, or supported module fields.',
    });
  }

  private reportGuardrailRefUnknown(refPath: string, path: string): void {
    this.diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_GUARDRAIL_REF_UNKNOWN,
      path,
      severity: 'error',
      message: `Guardrail references unknown or unsupported ref "${refPath}".`,
      suggestion: 'Use declared modules, conditions, features, selectors, or supported guardrail fields.',
    });
  }

  private reportTurnShapeRefUnknown(refPath: string, path: string): void {
    this.diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_TURNSHAPE_REF_UNKNOWN,
      path,
      severity: 'error',
      message: `Turn-shape evaluator references unknown or unsupported ref "${refPath}".`,
      suggestion: 'Use declared modules, objectives, preview refs, or supported turnShape fields.',
    });
  }

  private reportPostureRefUnknown(refPath: string, path: string): void {
    this.diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POSTURE_REF_UNKNOWN,
      path,
      severity: 'error',
      message: `Posture evaluator references unknown or unsupported ref "${refPath}".`,
      suggestion: 'Use declared conditions, features, preview refs, or supported posture fields.',
    });
  }

  private reportSelectorRefUnknown(refPath: string, path: string): void {
    this.diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_SELECTOR_REF_UNKNOWN,
      path,
      severity: 'error',
      message: `Selector expression references unknown or unsupported ref "${refPath}".`,
      suggestion: 'Use declared selector ids and supported selector.<id>.selected.* refs.',
    });
  }

  private reportSelectorUnregisteredPreviewRef(refPath: string, path: string): void {
    this.diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_SELECTOR_REQUIRES_UNREGISTERED_PREVIEW_REF,
      path,
      severity: 'error',
      message: `Selector expression references preview ref "${refPath}" that is not registered on a visible policy surface.`,
      suggestion: 'Register the preview-visible surface or remove the preview-derived selector component.',
    });
  }

  private reportTurnShapeUnregisteredPreviewRef(refPath: string, path: string): void {
    this.diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_TURNSHAPE_REQUIRES_UNREGISTERED_PREVIEW_DRIVE,
      path,
      severity: 'error',
      message: `Turn-shape evaluator references preview ref "${refPath}" that is not registered on the current preview drive.`,
      suggestion: 'Register the needed preview drive or restate the objective using already-driven preview evidence.',
    });
  }

  private reportUnknownLibraryRef(refPath: string, path: string): void {
    this.diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_REF_UNKNOWN,
      path,
      severity: 'error',
      message: `Policy expression references unknown or unsupported ref "${refPath}".`,
      suggestion: 'Use declared parameters, named feature/aggregate refs, or the approved policy-visible runtime surface.',
    });
  }

  private reportInvalidCandidateParamRef(refPath: string, path: string): void {
    this.diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_CANDIDATE_PARAM_REF_INVALID,
      path,
      severity: 'error',
      message: `candidate.param.* refs are removed; "${refPath}" is not a valid policy ref.`,
      suggestion: 'Use the plural candidate.params.<paramName> ref family for action-selection candidate params.',
    });
  }

  private hasPotentialDuplicateRuntimeRoles(): boolean {
    if (this.options.playerCountMax === undefined || this.options.referenceSeatIds === undefined) {
      return false;
    }
    return this.options.playerCountMax > this.options.referenceSeatIds.length;
  }

}

function normalizeParameterValue(
  parameterDef: GameSpecAgentParameterDef,
  value: unknown,
  path: string,
  diagnostics: Diagnostic[],
): AgentParameterValue | null {
  const compiledDef: CompiledAgentParameterDef = {
    type: parameterDef.type as AgentParameterType,
    required: parameterDef.default === undefined,
    tunable: parameterDef.tunable === true,
    ...(parameterDef.min === undefined ? {} : { min: parameterDef.min }),
    ...(parameterDef.max === undefined ? {} : { max: parameterDef.max }),
    ...(parameterDef.values === undefined ? {} : { values: parameterDef.values }),
    ...(parameterDef.allowedIds === undefined ? {} : { allowedIds: parameterDef.allowedIds }),
  };
  return normalizeCompiledParameterValue(compiledDef, value, path, diagnostics);
}

function normalizeCompiledParameterValue(
  parameterDef: CompiledAgentParameterDef,
  value: unknown,
  path: string,
  diagnostics: Diagnostic[],
): AgentParameterValue | null {
  switch (parameterDef.type) {
    case 'number':
      return normalizeNumberValue(value, path, parameterDef, false, diagnostics);
    case 'integer':
      return normalizeNumberValue(value, path, parameterDef, true, diagnostics);
    case 'boolean':
      return typeof value === 'boolean' ? value : null;
    case 'enum':
      return typeof value === 'string' && parameterDef.values?.includes(value) ? value : null;
    case 'idOrder':
      return normalizeIdOrderValue(value, path, parameterDef.allowedIds, diagnostics);
  }
}

function normalizeNumberValue(
  value: unknown,
  path: string,
  parameterDef: Pick<CompiledAgentParameterDef, 'min' | 'max'>,
  requireInteger: boolean,
  diagnostics: Diagnostic[],
): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  if (requireInteger && !Number.isInteger(value)) {
    return null;
  }
  if (parameterDef.min !== undefined && value < parameterDef.min) {
    return null;
  }
  if (parameterDef.max !== undefined && value > parameterDef.max) {
    return null;
  }
  if (requireInteger && !Number.isInteger(parameterDef.min) && parameterDef.min !== undefined) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PARAMETER_BOUNDS_INVALID,
      path,
      severity: 'error',
      message: 'Integer parameters must use integer min bounds.',
      suggestion: 'Set integer parameter min to an integer value.',
    });
    return null;
  }
  if (requireInteger && !Number.isInteger(parameterDef.max) && parameterDef.max !== undefined) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PARAMETER_BOUNDS_INVALID,
      path,
      severity: 'error',
      message: 'Integer parameters must use integer max bounds.',
      suggestion: 'Set integer parameter max to an integer value.',
    });
    return null;
  }
  return value;
}

function normalizeIdOrderValue(
  value: unknown,
  path: string,
  allowedIds: readonly string[] | undefined,
  diagnostics: Diagnostic[],
): readonly string[] | null {
  const normalizedAllowedIds = normalizeStringList(allowedIds, `${path}.allowedIds`, 'allowed ids', diagnostics);
  if (normalizedAllowedIds === null || !Array.isArray(value)) {
    return null;
  }

  if (value.length !== normalizedAllowedIds.length) {
    return null;
  }

  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string' || !normalizedAllowedIds.includes(item) || seen.has(item)) {
      return null;
    }
    seen.add(item);
  }

  return [...value];
}

function validateNumericBounds(
  type: GameSpecAgentParameterType,
  min: number | undefined,
  max: number | undefined,
  path: string,
  diagnostics: Diagnostic[],
): boolean {
  if (min !== undefined && (!Number.isFinite(min) || (type === 'integer' && !Number.isInteger(min)))) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PARAMETER_BOUNDS_INVALID,
      path: `${path}.min`,
      severity: 'error',
      message: `agents parameter ${type} min must be a finite${type === 'integer' ? ' integer' : ''} value.`,
      suggestion: 'Set min to a valid finite bound.',
    });
    return false;
  }
  if (max !== undefined && (!Number.isFinite(max) || (type === 'integer' && !Number.isInteger(max)))) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PARAMETER_BOUNDS_INVALID,
      path: `${path}.max`,
      severity: 'error',
      message: `agents parameter ${type} max must be a finite${type === 'integer' ? ' integer' : ''} value.`,
      suggestion: 'Set max to a valid finite bound.',
    });
    return false;
  }
  if (min !== undefined && max !== undefined && min > max) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PARAMETER_BOUNDS_INVALID,
      path,
      severity: 'error',
      message: 'agents parameter min must be less than or equal to max.',
      suggestion: 'Swap or correct the bounds so min <= max.',
    });
    return false;
  }
  return true;
}

function normalizeStringList(
  value: readonly string[] | undefined,
  path: string,
  label: string,
  diagnostics: Diagnostic[],
): readonly string[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of value.entries()) {
    if (typeof entry !== 'string' || entry.trim() !== entry || entry.length === 0 || seen.has(entry)) {
      diagnostics.push({
        code: label === 'allowed ids'
          ? CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PARAMETER_ALLOWED_IDS_INVALID
          : CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PARAMETER_VALUES_INVALID,
        path: `${path}.${index}`,
        severity: 'error',
        message: `agents parameter ${label} entries must be unique non-empty strings.`,
        suggestion: 'Use trimmed unique string ids only.',
      });
      return null;
    }
    seen.add(entry);
    normalized.push(entry);
  }

  return normalized;
}

function normalizeDeclaredPolicyValueType(
  value: unknown,
  path: string,
  diagnostics: Diagnostic[],
): AgentPolicyValueType | null {
  if (value === undefined) {
    return null;
  }
  if (typeof value === 'string' && isPolicyValueType(value)) {
    return value;
  }
  diagnostics.push({
    code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_TYPE_INVALID,
    path,
    severity: 'error',
    message: `Unsupported declared policy type "${String(value)}".`,
    suggestion: `Use one of: ${POLICY_VALUE_TYPES.join(', ')}.`,
  });
  return null;
}

function normalizeAggregateOp(
  value: unknown,
  path: string,
  diagnostics: Diagnostic[],
): AggregateOp | null {
  if (typeof value === 'string' && AGGREGATE_OPS.has(value as AggregateOp)) {
    return value as AggregateOp;
  }
  diagnostics.push({
    code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_AGGREGATE_INPUT_INVALID,
    path,
    severity: 'error',
    message: `Unsupported candidate aggregate op "${String(value)}".`,
    suggestion: 'Use one of: max, min, count, any, all, rankDense, or rankOrdinal.',
  });
  return null;
}

function inferAggregateResultType(
  op: AggregateOp,
  inputType: string,
  path: string,
  diagnostics: Diagnostic[],
): AgentPolicyValueType | null {
  switch (op) {
    case 'max':
    case 'min':
      if (inputType === 'number') {
        return 'number';
      }
      break;
    case 'count':
      return 'number';
    case 'any':
    case 'all':
      if (inputType === 'boolean') {
        return 'boolean';
      }
      break;
    case 'rankDense':
    case 'rankOrdinal':
      if (inputType === 'number' || inputType === 'id') {
        return 'number';
      }
      break;
  }
  diagnostics.push({
    code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_AGGREGATE_INPUT_INVALID,
    path,
    severity: 'error',
    message: `Aggregate op "${op}" does not accept "${inputType}" inputs.`,
    suggestion: 'Use a supported aggregate op for the input expression type.',
  });
  return null;
}

function normalizeTieBreakerKind(
  value: unknown,
  path: string,
  diagnostics: Diagnostic[],
): TieBreakerKind | null {
  if (typeof value === 'string' && TIE_BREAKER_KINDS.has(value as TieBreakerKind)) {
    return value as TieBreakerKind;
  }
  diagnostics.push({
    code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_TIE_BREAKER_INVALID,
    path,
    severity: 'error',
    message: `Unsupported tie-breaker kind "${String(value)}".`,
    suggestion: 'Use one of: higherExpr, lowerExpr, preferredEnumOrder, preferredIdOrder, rng, stableMoveKey.',
  });
  return null;
}

function validateTieBreakerDefinition(
  kind: TieBreakerKind,
  valueAnalysis: { readonly valueType: string } | null,
  def: GameSpecTieBreakerDef,
  tieBreakerId: string,
  diagnostics: Diagnostic[],
): boolean {
  const path = `doc.agents.library.tieBreakers.${tieBreakerId}`;
  const requiresValue = kind === 'higherExpr' || kind === 'lowerExpr' || kind === 'preferredEnumOrder' || kind === 'preferredIdOrder';
  if (requiresValue && valueAnalysis === null) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_TIE_BREAKER_INVALID,
      path: `${path}.value`,
      severity: 'error',
      message: `Tie-breaker "${tieBreakerId}" kind "${kind}" requires a value expression.`,
      suggestion: 'Provide tieBreaker.value for expression-based or order-based tie-breakers.',
    });
    return false;
  }
  if (!requiresValue && def.value !== undefined) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_TIE_BREAKER_INVALID,
      path: `${path}.value`,
      severity: 'error',
      message: `Tie-breaker "${tieBreakerId}" kind "${kind}" does not accept a value expression.`,
      suggestion: 'Remove tieBreaker.value for this kind.',
    });
    return false;
  }
  if ((kind === 'preferredEnumOrder' || kind === 'preferredIdOrder') && valueAnalysis?.valueType !== 'id') {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_TIE_BREAKER_INVALID,
      path: `${path}.value`,
      severity: 'error',
      message: `Tie-breaker "${tieBreakerId}" kind "${kind}" requires an id-valued expression.`,
      suggestion: 'Use an id or enum-like expression for the tie-breaker value.',
    });
    return false;
  }
  if ((kind === 'higherExpr' || kind === 'lowerExpr') && valueAnalysis !== null && valueAnalysis.valueType === 'idList') {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_TIE_BREAKER_INVALID,
      path: `${path}.value`,
      severity: 'error',
      message: `Tie-breaker "${tieBreakerId}" kind "${kind}" may not compare id lists.`,
      suggestion: 'Use a scalar number, boolean, or id expression.',
    });
    return false;
  }
  if (kind === 'preferredEnumOrder' || kind === 'preferredIdOrder') {
    const order = normalizeStringList(def.order, `${path}.order`, 'values', diagnostics);
    if (order === null) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_TIE_BREAKER_INVALID,
        path: `${path}.order`,
        severity: 'error',
        message: `Tie-breaker "${tieBreakerId}" kind "${kind}" requires a non-empty unique order list.`,
        suggestion: 'Provide a unique ordered list of ids for the tie-breaker order.',
      });
      return false;
    }
  } else if (def.order !== undefined) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_TIE_BREAKER_INVALID,
      path: `${path}.order`,
      severity: 'error',
      message: `Tie-breaker "${tieBreakerId}" kind "${kind}" does not accept an order list.`,
      suggestion: 'Remove tieBreaker.order for this kind.',
    });
    return false;
  }
  return true;
}

function isAgentParameterType(value: unknown): value is AgentParameterType {
  return typeof value === 'string' && AGENT_PARAMETER_TYPES.includes(value as AgentParameterType);
}

function isPolicyValueType(value: unknown): value is AgentPolicyValueType {
  return typeof value === 'string' && POLICY_VALUE_TYPES.includes(value as AgentPolicyValueType);
}

function normalizeConsiderationScopes(
  value: readonly string[] | undefined,
  path: string,
  diagnostics: Diagnostic[],
): readonly ConsiderationScope[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_CONSIDERATION_SCOPE_EMPTY,
      path,
      severity: 'error',
      message: 'Consideration scopes must be a non-empty array.',
      suggestion: 'Use scopes: ["move"] or scopes: ["microturn"].',
    });
    return null;
  }

  const normalized: ConsiderationScope[] = [];
  const seen = new Set<ConsiderationScope>();
  for (const [index, entry] of value.entries()) {
    if (entry === 'completion') {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_CONSIDERATION_SCOPE_INVALID,
        path: `${path}.${index}`,
        severity: 'error',
        message: 'scopes: [completion] is removed; use scopes: [microturn] with microturn.* refs.',
        suggestion: 'Replace completion with microturn and migrate retired refs to microturn.*.',
      });
      continue;
    }
    if (entry !== 'move' && entry !== 'microturn') {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_CONSIDERATION_SCOPE_INVALID,
        path: `${path}.${index}`,
        severity: 'error',
        message: `Unsupported consideration scope "${String(entry)}".`,
        suggestion: 'Use only "move" and "microturn" scopes.',
      });
      continue;
    }
    if (seen.has(entry)) {
      continue;
    }
    seen.add(entry);
    normalized.push(entry);
  }

  return normalized.length === 0 ? null : normalized;
}

function lowerPreviewFallback(
  considerationId: string,
  path: string,
  value: GameSpecPreviewFallbackDef | undefined,
  diagnostics: Diagnostic[],
): AgentPreviewFallback | undefined | null {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_FALLBACK_INVALID,
      path,
      severity: 'error',
      message: `Consideration "${considerationId}" previewFallback must be an object.`,
      suggestion: 'Use previewFallback: { onUnavailable: noContribution } or previewFallback: { onUnavailable: { constant: 0 } }.',
    });
    return null;
  }

  const { onUnavailable } = value;
  if (onUnavailable === 'noContribution') {
    return { onUnavailable: 'noContribution' };
  }
  if (onUnavailable !== null && typeof onUnavailable === 'object' && !Array.isArray(onUnavailable)) {
    const { constant } = onUnavailable;
    if (Number.isSafeInteger(constant)) {
      return { onUnavailable: { kind: 'constant', value: constant } };
    }
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_FALLBACK_INVALID,
      path: `${path}.onUnavailable.constant`,
      severity: 'error',
      message: `Consideration "${considerationId}" previewFallback.onUnavailable.constant must be a safe integer, got ${String(constant)}.`,
      suggestion: 'Use an exact integer constant such as 0, 1, or -100.',
    });
    return null;
  }

  diagnostics.push({
    code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_FALLBACK_INVALID,
    path: `${path}.onUnavailable`,
    severity: 'error',
    message: `Consideration "${considerationId}" previewFallback.onUnavailable must be noContribution or { constant: <integer> }.`,
    suggestion: 'Use previewFallback: { onUnavailable: noContribution } or previewFallback: { onUnavailable: { constant: 0 } }.',
  });
  return null;
}

function lowerLookupFallback(
  considerationId: string,
  path: string,
  value: GameSpecLookupFallbackDef | undefined,
  diagnostics: Diagnostic[],
): AgentLookupFallback | undefined | null {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_EXPR_INVALID,
      path,
      severity: 'error',
      message: `Consideration "${considerationId}" lookupFallback must be an object.`,
      suggestion: 'Use lookupFallback: { onUnavailable: noContribution } or lookupFallback: { onUnavailable: { constant: 0 } }.',
    });
    return null;
  }

  const { onUnavailable } = value;
  if (onUnavailable === 'noContribution') {
    return { onUnavailable: 'noContribution' };
  }
  if (onUnavailable !== null && typeof onUnavailable === 'object' && !Array.isArray(onUnavailable)) {
    const { constant } = onUnavailable;
    if (Number.isSafeInteger(constant)) {
      return { onUnavailable: { kind: 'constant', value: constant } };
    }
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_EXPR_INVALID,
      path: `${path}.onUnavailable.constant`,
      severity: 'error',
      message: `Consideration "${considerationId}" lookupFallback.onUnavailable.constant must be a safe integer, got ${String(constant)}.`,
      suggestion: 'Use an exact integer constant such as 0, 1, or -100.',
    });
    return null;
  }

  diagnostics.push({
    code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_EXPR_INVALID,
    path: `${path}.onUnavailable`,
    severity: 'error',
    message: `Consideration "${considerationId}" lookupFallback.onUnavailable must be noContribution or { constant: <integer> }.`,
    suggestion: 'Use lookupFallback: { onUnavailable: noContribution } or lookupFallback: { onUnavailable: { constant: 0 } }.',
  });
  return null;
}

function lowerCandidateParamFallback(
  considerationId: string,
  path: string,
  value: GameSpecCandidateParamFallbackDef | undefined,
  diagnostics: Diagnostic[],
): AgentCandidateParamFallback | undefined | null {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_EXPR_INVALID,
      path,
      severity: 'error',
      message: `Consideration "${considerationId}" candidateParamFallback must be an object.`,
      suggestion: 'Use candidateParamFallback: { onUnavailable: noContribution } or candidateParamFallback: { onUnavailable: { constant: 0 } }.',
    });
    return null;
  }

  const { onUnavailable } = value;
  if (onUnavailable === 'noContribution') {
    return { onUnavailable: 'noContribution' };
  }
  if (onUnavailable !== null && typeof onUnavailable === 'object' && !Array.isArray(onUnavailable)) {
    const { constant } = onUnavailable;
    if (Number.isSafeInteger(constant)) {
      return { onUnavailable: { kind: 'constant', value: constant } };
    }
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_EXPR_INVALID,
      path: `${path}.onUnavailable.constant`,
      severity: 'error',
      message: `Consideration "${considerationId}" candidateParamFallback.onUnavailable.constant must be a safe integer, got ${String(constant)}.`,
      suggestion: 'Use an exact integer constant such as 0, 1, or -100.',
    });
    return null;
  }

  diagnostics.push({
    code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_EXPR_INVALID,
    path: `${path}.onUnavailable`,
    severity: 'error',
    message: `Consideration "${considerationId}" candidateParamFallback.onUnavailable must be noContribution or { constant: <integer> }.`,
    suggestion: 'Use candidateParamFallback: { onUnavailable: noContribution } or candidateParamFallback: { onUnavailable: { constant: 0 } }.',
  });
  return null;
}

function lowerScheduleFallback(
  considerationId: string,
  path: string,
  value: GameSpecScheduleFallbackDef | undefined,
  diagnostics: Diagnostic[],
): AgentScheduleFallback | undefined | null {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_EXPR_INVALID,
      path,
      severity: 'error',
      message: `Consideration "${considerationId}" scheduleFallback must be an object.`,
      suggestion: 'Use scheduleFallback: { onUnavailable: noContribution }, dropConsideration, or { constant: 0 }.',
    });
    return null;
  }

  const { onUnavailable } = value;
  const onPartial = lowerSchedulePartialFallback(considerationId, path, value.onPartial, diagnostics);
  if (onPartial === null) {
    return null;
  }
  if (onUnavailable === 'noContribution' || onUnavailable === 'dropConsideration') {
    return {
      onUnavailable,
      ...(onPartial === undefined ? {} : { onPartial }),
    };
  }
  if (onUnavailable !== null && typeof onUnavailable === 'object' && !Array.isArray(onUnavailable)) {
    const { constant } = onUnavailable;
    if (Number.isSafeInteger(constant)) {
      return {
        onUnavailable: { kind: 'constant', value: constant },
        ...(onPartial === undefined ? {} : { onPartial }),
      };
    }
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_EXPR_INVALID,
      path: `${path}.onUnavailable.constant`,
      severity: 'error',
      message: `Consideration "${considerationId}" scheduleFallback.onUnavailable.constant must be a safe integer, got ${String(constant)}.`,
      suggestion: 'Use an exact integer constant such as 0, 1, or -100.',
    });
    return null;
  }

  diagnostics.push({
    code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_EXPR_INVALID,
    path: `${path}.onUnavailable`,
    severity: 'error',
    message: `Consideration "${considerationId}" scheduleFallback.onUnavailable must be noContribution, dropConsideration, or { constant: <integer> }.`,
    suggestion: 'Use scheduleFallback: { onUnavailable: noContribution }, dropConsideration, or { constant: 0 }.',
  });
  return null;
}

function lowerSchedulePartialFallback(
  considerationId: string,
  path: string,
  value: GameSpecScheduleFallbackDef['onPartial'] | undefined,
  diagnostics: Diagnostic[],
): AgentScheduleFallback['onPartial'] | undefined | null {
  if (value === undefined) {
    return undefined;
  }
  const visiblePrefixExhausted = value.visiblePrefixExhausted;
  if (
    visiblePrefixExhausted === 'useLowerBound'
    || visiblePrefixExhausted === 'noContribution'
    || visiblePrefixExhausted === 'dropConsideration'
  ) {
    return { visiblePrefixExhausted };
  }
  if (visiblePrefixExhausted !== null && typeof visiblePrefixExhausted === 'object' && !Array.isArray(visiblePrefixExhausted)) {
    const { constant } = visiblePrefixExhausted;
    if (Number.isSafeInteger(constant)) {
      return { visiblePrefixExhausted: { kind: 'constant', value: constant } };
    }
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_EXPR_INVALID,
      path: `${path}.onPartial.visiblePrefixExhausted.constant`,
      severity: 'error',
      message: `Consideration "${considerationId}" scheduleFallback.onPartial.visiblePrefixExhausted.constant must be a safe integer, got ${String(constant)}.`,
      suggestion: 'Use an exact integer constant such as 0, 1, or -100.',
    });
    return null;
  }

  diagnostics.push({
    code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_EXPR_INVALID,
    path: `${path}.onPartial.visiblePrefixExhausted`,
    severity: 'error',
    message: `Consideration "${considerationId}" scheduleFallback.onPartial.visiblePrefixExhausted must be useLowerBound, noContribution, dropConsideration, or { constant: <integer> }.`,
    suggestion: 'Use scheduleFallback.onPartial: { visiblePrefixExhausted: useLowerBound } or another supported partial fallback.',
  });
  return null;
}

function lowerLookupMissingDisposition(
  value: unknown,
  path: string,
  diagnostics: Diagnostic[],
): Extract<CompiledAgentPolicyRef, { readonly kind: 'lookup' }>['onMissing'] | null {
  if (value === 'unavailable') {
    return 'unavailable';
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Readonly<Record<string, unknown>>;
    if (obj['kind'] === 'constant' && isLookupConstant(obj['value'])) {
      return { kind: 'constant', value: obj['value'] };
    }
  }
  diagnostics.push({
    code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_EXPR_INVALID,
    path,
    severity: 'error',
    message: 'lookup.onMissing must be unavailable or { kind: constant, value: <integer|string|boolean> }.',
    suggestion: 'Use onMissing: unavailable or onMissing: { kind: constant, value: 0 }.',
  });
  return null;
}

function parseCandidateParamRefOptions(
  value: unknown,
  path: string,
  diagnostics: Diagnostic[],
): { readonly onMissing?: unknown; readonly appliesToActions?: unknown } | null {
  if (value === undefined || value === null) {
    return {};
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_EXPR_INVALID,
      path,
      severity: 'error',
      message: 'candidate.params structured ref options must be an object.',
      suggestion: 'Use { candidate.params.<name>: { onMissing, appliesToActions } }.',
    });
    return null;
  }
  return value as { readonly onMissing?: unknown; readonly appliesToActions?: unknown };
}

function parseCandidateParamOnMissing(
  value: unknown,
  paramType: CompiledAgentCandidateParamDef['type'],
  path: string,
  diagnostics: Diagnostic[],
): Extract<CompiledAgentPolicyRef, { readonly kind: 'candidateParam' }>['onMissing'] | null {
  if (value === undefined || value === 'unavailable') {
    return 'unavailable';
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Readonly<Record<string, unknown>>;
    if (obj['kind'] === 'constant' && isCandidateParamOnMissingConstant(obj['value'], paramType)) {
      return { kind: 'constant', value: obj['value'] as number | string | boolean };
    }
  }
  diagnostics.push({
    code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_CANDIDATE_PARAMS_ONMISSING_TYPE_MISMATCH,
    path,
    severity: 'error',
    message: `candidate.params onMissing constant does not match declared param type "${paramType}".`,
    suggestion: 'Use onMissing: unavailable or { kind: constant, value: <number|string|boolean> } with a value matching the declared param type.',
  });
  return null;
}

function isCandidateParamOnMissingConstant(
  value: unknown,
  paramType: CompiledAgentCandidateParamDef['type'],
): boolean {
  switch (paramType) {
    case 'number':
      return typeof value === 'number';
    case 'boolean':
      return typeof value === 'boolean';
    case 'id':
      return typeof value === 'string';
    case 'idList':
      return false;
  }
}

function parseCandidateParamAppliesToActions(
  value: unknown,
  path: string,
  diagnostics: Diagnostic[],
): readonly string[] | undefined | null {
  if (value === undefined) {
    return undefined;
  }
  if (Array.isArray(value) && value.every((entry) => typeof entry === 'string' && entry.length > 0)) {
    return value;
  }
  diagnostics.push({
    code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_EXPR_INVALID,
    path: `${path}.appliesToActions`,
    severity: 'error',
    message: 'candidate.params appliesToActions must be an array of non-empty action ids.',
    suggestion: 'Use appliesToActions: [actionId, ...].',
  });
  return null;
}

function collectPreviewOptionRefIds(expr: AgentPolicyExpr): readonly string[] {
  const ids = new Set<string>();
  const visit = (current: AgentPolicyExpr): void => {
    switch (current.kind) {
      case 'ref':
        if (current.ref.kind === 'previewOptionRef') {
          ids.add(previewOptionRefKey(current.ref));
        }
        return;
      case 'op':
        for (const arg of current.args) {
          visit(arg);
        }
        return;
      case 'zoneTokenAgg':
        if (typeof current.zone !== 'string') {
          visit(current.zone);
        }
        return;
      case 'adjacentTokenAgg':
        if (typeof current.anchorZone !== 'string') {
          visit(current.anchorZone);
        }
        return;
      case 'seatAgg':
        visit(current.expr);
        return;
      case 'zoneProp':
        if (typeof current.zone !== 'string') {
          visit(current.zone);
        }
        return;
      default:
        return;
    }
  };
  visit(expr);
  return [...ids].sort();
}

function collectLookupRefIds(
  expr: AgentPolicyExpr,
  surfaceFilter?: Extract<CompiledAgentPolicyRef, { readonly kind: 'lookup' }>['surface'],
): readonly string[] {
  const ids = new Set<string>();
  const visit = (current: AgentPolicyExpr): void => {
    switch (current.kind) {
      case 'ref':
        if (current.ref.kind === 'lookup' && (surfaceFilter === undefined || current.ref.surface === surfaceFilter)) {
          ids.add(`lookup.${current.ref.surface}.${current.ref.collection}.${current.ref.path.join('.')}`);
        }
        return;
      case 'op':
        for (const arg of current.args) {
          visit(arg);
        }
        return;
      case 'zoneTokenAgg':
        if (typeof current.zone !== 'string') {
          visit(current.zone);
        }
        return;
      case 'adjacentTokenAgg':
        if (typeof current.anchorZone !== 'string') {
          visit(current.anchorZone);
        }
        return;
      case 'seatAgg':
        visit(current.expr);
        return;
      case 'zoneProp':
        if (typeof current.zone !== 'string') {
          visit(current.zone);
        }
        return;
      default:
        return;
    }
  };
  visit(expr);
  return [...ids].sort();
}

function collectCandidateParamRefIds(
  expr: AgentPolicyExpr,
  onMissingPolicyFilter: 'unavailable' | 'all' = 'unavailable',
): readonly string[] {
  const ids = new Set<string>();
  const visit = (current: AgentPolicyExpr): void => {
    switch (current.kind) {
      case 'ref':
        if (
          current.ref.kind === 'candidateParam'
          && (onMissingPolicyFilter === 'all' || current.ref.onMissing === 'unavailable')
        ) {
          ids.add(`candidate.params.${current.ref.id}`);
        }
        return;
      case 'op':
        for (const arg of current.args) {
          visit(arg);
        }
        return;
      case 'zoneTokenAgg':
        if (typeof current.zone !== 'string') {
          visit(current.zone);
        }
        return;
      case 'adjacentTokenAgg':
        if (typeof current.anchorZone !== 'string') {
          visit(current.anchorZone);
        }
        return;
      case 'seatAgg':
        visit(current.expr);
        return;
      case 'zoneProp':
        if (typeof current.zone !== 'string') {
          visit(current.zone);
        }
        return;
      default:
        return;
    }
  };
  visit(expr);
  return [...ids].sort();
}

function collectScheduleDistanceRefIds(expr: AgentPolicyExpr): readonly string[] {
  const ids = new Set<string>();
  const visit = (current: AgentPolicyExpr): void => {
    switch (current.kind) {
      case 'ref':
        if (current.ref.kind === 'scheduleDistance' && current.ref.unit !== undefined) {
          ids.add(scheduleDistanceRefKey(current.ref));
        }
        return;
      case 'op':
        for (const arg of current.args) {
          visit(arg);
        }
        return;
      case 'zoneTokenAgg':
        if (typeof current.zone !== 'string') {
          visit(current.zone);
        }
        return;
      case 'adjacentTokenAgg':
        if (typeof current.anchorZone !== 'string') {
          visit(current.anchorZone);
        }
        return;
      case 'seatAgg':
        visit(current.expr);
        return;
      case 'zoneProp':
        if (typeof current.zone !== 'string') {
          visit(current.zone);
        }
        return;
      default:
        return;
    }
  };
  visit(expr);
  return [...ids].sort();
}

function collectTopNVisibleScheduleDistanceRefIds(
  expr: AgentPolicyExpr,
  context: PhaseBoundaryValidationContext,
): readonly string[] {
  const ids = new Set<string>();
  const visit = (current: AgentPolicyExpr): void => {
    switch (current.kind) {
      case 'ref': {
        if (
          current.ref.kind === 'scheduleDistance'
          && current.ref.unit === 'cards'
          && current.ref.target.kind === 'boundary'
        ) {
          const boundary = findPhaseBoundaryById(context, String(current.ref.target.boundaryId));
          if (boundary?.schedule?.kind === 'cardDraw' && boundary.schedule.observerPolicy?.kind === 'topNVisible') {
            ids.add(scheduleDistanceRefKey(current.ref));
          }
        }
        return;
      }
      case 'op':
        for (const arg of current.args) {
          visit(arg);
        }
        return;
      case 'zoneTokenAgg':
        if (typeof current.zone !== 'string') {
          visit(current.zone);
        }
        return;
      case 'adjacentTokenAgg':
        if (typeof current.anchorZone !== 'string') {
          visit(current.anchorZone);
        }
        return;
      case 'seatAgg':
        visit(current.expr);
        return;
      case 'zoneProp':
        if (typeof current.zone !== 'string') {
          visit(current.zone);
        }
        return;
      default:
        return;
    }
  };
  visit(expr);
  return [...ids].sort();
}

function scheduleDistanceRefKey(ref: Extract<CompiledAgentPolicyRef, { readonly kind: 'scheduleDistance' }>): string {
  if (ref.target.kind === 'nextBoundary') {
    return 'schedule.nextBoundary.id';
  }
  const unit = ref.unit ?? 'id';
  if (ref.target.kind === 'boundary') {
    return `schedule.distance.toBoundary.${String(ref.target.boundaryId)}.${unit}`;
  }
  return `schedule.nextBoundary.id`;
}

function isLookupCollection(value: unknown): value is Extract<CompiledAgentPolicyRef, { readonly kind: 'lookup' }>['collection'] {
  return value === 'zones' || value === 'tokens' || value === 'players' || value === 'globals';
}

function isLookupKeyType(value: unknown): value is Extract<CompiledAgentPolicyRef, { readonly kind: 'lookup' }>['keyType'] {
  return value === 'ZoneId' || value === 'TokenId' || value === 'PlayerId' || value === 'string';
}

function isLookupSurface(value: unknown): value is Extract<CompiledAgentPolicyRef, { readonly kind: 'lookup' }>['surface'] {
  return value === 'policyState' || value === 'previewOptionState';
}

function parseScheduleTargetAndUnit(value: string): { readonly targetId: string; readonly unit: ScheduleDistanceUnit } | null {
  const lastDot = value.lastIndexOf('.');
  if (lastDot <= 0 || lastDot === value.length - 1) {
    return null;
  }
  const targetId = value.slice(0, lastDot);
  const unit = value.slice(lastDot + 1);
  if (targetId.length === 0 || !isScheduleDistanceUnit(unit)) {
    return null;
  }
  return { targetId, unit: unit as ScheduleDistanceUnit };
}

function isLookupConstant(value: unknown): value is number | string | boolean {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value);
  }
  return typeof value === 'string' || typeof value === 'boolean';
}

function previewOptionRefKey(ref: Extract<CompiledAgentPolicyRef, { readonly kind: 'previewOptionRef' }>): string {
  switch (ref.refKind) {
    case 'victoryCurrentMarginSelf':
      return 'preview.option.victory.currentMargin.self';
    case 'victoryCurrentRankSelf':
      return 'preview.option.victory.currentRank.self';
    case 'deltaVictoryCurrentMarginSelf':
      return 'preview.option.delta.victory.currentMargin.self';
    case 'globalVar':
      return `preview.option.var.global.${ref.id ?? ''}`;
    case 'perPlayerVarSelf':
      return `preview.option.var.player.self.${ref.id ?? ''}`;
    case 'derivedMetric':
      return `preview.option.metric.${ref.id ?? ''}`;
    case 'outcome':
      return 'preview.option.outcome';
    case 'driveDepth':
      return 'preview.option.driveDepth';
  }
}

function collectConsiderationRefKinds(
  consideration: AgentConsiderationWithExpr,
): ReadonlySet<'candidate' | 'preview' | 'microturn' | 'contextKind'> {
  const kinds = new Set<'candidate' | 'preview' | 'microturn' | 'contextKind'>();
  const visitRef = (ref: import('../kernel/types.js').CompiledAgentPolicyRef): void => {
    switch (ref.kind) {
      case 'candidateIntrinsic':
      case 'candidateParam':
      case 'candidateTag':
      case 'candidateTags':
        kinds.add('candidate');
        return;
      case 'previewSurface':
        kinds.add('preview');
        return;
      case 'previewPlanRef':
        kinds.add('preview');
        return;
      case 'microturnIntrinsic':
      case 'microturnOptionIntrinsic':
      case 'previewOptionRef':
        kinds.add('microturn');
        return;
      case 'contextKind':
        kinds.add('contextKind');
        return;
      default:
        return;
    }
  };

  const visitExpr = (expr: import('../kernel/types.js').AgentPolicyExpr): void => {
    if (expr.kind === 'ref') {
      visitRef(expr.ref);
      return;
    }
    if (expr.kind === 'op') {
      for (const arg of expr.args) {
        visitExpr(arg);
      }
      return;
    }
    if ((expr.kind === 'zoneProp' || expr.kind === 'zoneTokenAgg') && typeof expr.zone !== 'string') {
      visitExpr(expr.zone);
    }
  };

  if (consideration.when !== undefined) {
    visitExpr(consideration.when);
  }
  visitExpr(consideration.weight);
  visitExpr(consideration.value);
  return kinds;
}

function diagnosticsContainProfileUseErrors(profileId: string, diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some(
    (diagnostic) =>
      diagnostic.path.startsWith(`doc.agents.profiles.${profileId}.use.`)
      && diagnostic.severity === 'error',
  );
}

function mergeDependencies(dependencies: readonly CompiledAgentDependencyRefs[]): CompiledAgentDependencyRefs {
  const selectors = uniqueSorted(dependencies.flatMap((entry) => entry.selectors ?? []));
  const strategyModules = uniqueSorted(dependencies.flatMap((entry) => entry.strategyModules ?? []));
  const planTemplates = uniqueSorted(dependencies.flatMap((entry) => entry.planTemplates ?? []));
  const guardrails = uniqueSorted(dependencies.flatMap((entry) => entry.guardrails ?? []));
  const turnShapeEvaluators = uniqueSorted(dependencies.flatMap((entry) => entry.turnShapeEvaluators ?? []));
  const postureEvaluators = uniqueSorted(dependencies.flatMap((entry) => entry.postureEvaluators ?? []));
  return {
    parameters: uniqueSorted(dependencies.flatMap((entry) => entry.parameters)),
    stateFeatures: uniqueSorted(dependencies.flatMap((entry) => entry.stateFeatures)),
    candidateFeatures: uniqueSorted(dependencies.flatMap((entry) => entry.candidateFeatures)),
    aggregates: uniqueSorted(dependencies.flatMap((entry) => entry.aggregates)),
    ...(selectors.length === 0 ? {} : { selectors }),
    ...(strategyModules.length === 0 ? {} : { strategyModules }),
    ...(planTemplates.length === 0 ? {} : { planTemplates }),
    ...(guardrails.length === 0 ? {} : { guardrails }),
    ...(turnShapeEvaluators.length === 0 ? {} : { turnShapeEvaluators }),
    ...(postureEvaluators.length === 0 ? {} : { postureEvaluators }),
    strategicConditions: uniqueSorted(dependencies.flatMap((entry) => entry.strategicConditions)),
  };
}

function emptyDependencies(): CompiledAgentDependencyRefs {
  return {
    parameters: [],
    stateFeatures: [],
    candidateFeatures: [],
    aggregates: [],
    strategicConditions: [],
  };
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort();
}

function maxSelectorCostClass(left: SelectorCostClass, right: SelectorCostClass): SelectorCostClass {
  return selectorCostClassLeq(left, right) ? right : left;
}

function maxCostClass(left: AgentPolicyCostClass, right: AgentPolicyCostClass): AgentPolicyCostClass {
  if (left === 'preview' || right === 'preview') {
    return 'preview';
  }
  if (left === 'candidate' || right === 'candidate') {
    return 'candidate';
  }
  return 'state';
}
