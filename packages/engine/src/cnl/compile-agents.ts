import { fingerprintPolicyIr } from '../agents/policy-ir.js';
import { parseAuthoredPolicySurfaceRef, parseStrategicConditionRef } from '../agents/policy-surface.js';
import { analyzePolicyExpr, type AnalyzePolicyExprContext, type ResolvedPolicyRef } from '../agents/policy-expr.js';
import type { Diagnostic } from '../kernel/diagnostics.js';
import {
  AGENT_POLICY_PROFILE_USE_BUCKETS,
  AGENT_POLICY_PROFILE_USE_TO_LIBRARY_BUCKET,
} from '../contracts/index.js';
import { collectChoiceBindingSpecs } from '../kernel/move-runtime-bindings.js';
import { inferQueryRuntimeShapes } from '../kernel/query-shape-inference.js';
import type {
  AgentParameterType,
  AgentParameterValue,
  AgentPolicyCatalog,
  AgentPolicyCostClass,
  AgentPolicyExpr,
  SurfaceVisibilityClass,
  AgentPolicyValueType,
  CompiledAgentAggregate,
  CompiledAgentCandidateParamDef,
  CompiledAgentConsideration,
  CompiledAgentCandidateFeature,
  CompiledAgentDependencyRefs,
  CompiledAgentLibraryIndex,
  CompiledAgentParameterDef,
  CompiledObserverCatalog,
  CompiledSurfaceCatalog,
  CompiledSurfaceVisibility,
  CompiledAgentProfile,
  CompiledAgentPruningRule,
  CompiledAgentStateFeature,
  CompiledAgentTieBreaker,
  CompiledStrategicCondition,
  GameDef,
} from '../kernel/types.js';
import type {
  GameSpecAgentLibrary,
  GameSpecAgentParameterDef,
  GameSpecAgentParameterType,
  GameSpecAgentProfileDef,
  GameSpecAgentsSection,
  GameSpecCandidateFeatureDef,
  GameSpecPolicySurfaceVisibilityDef,
  GameSpecStateFeatureDef,
  GameSpecTieBreakerDef,
} from './game-spec-doc.js';
import { CNL_COMPILER_DIAGNOSTIC_CODES } from './compiler-diagnostic-codes.js';
import { lowerAgentConsiderations, type AgentPolicyLibraryWithExpr } from './lower-agent-considerations.js';

type ProfileUseKey = keyof CompiledAgentProfile['use'];
type AggregateOp = 'max' | 'min' | 'count' | 'any' | 'all' | 'rankDense' | 'rankOrdinal';
type TieBreakerKind = 'higherExpr' | 'lowerExpr' | 'preferredEnumOrder' | 'preferredIdOrder' | 'rng' | 'stableMoveKey';
type ConsiderationScope = 'move' | 'completion';
type LibraryRefScope = 'stateFeature' | 'candidateFeature' | 'aggregate' | 'rule' | 'consideration' | 'tieBreaker' | 'strategicCondition';
type LoweredAgentProfile = Omit<CompiledAgentProfile, 'fingerprint'>;
type AgentLibraryWithExpr = AgentPolicyLibraryWithExpr;
type AgentStateFeatureWithExpr = CompiledAgentStateFeature & { readonly expr: AgentPolicyExpr };
type AgentCandidateFeatureWithExpr = CompiledAgentCandidateFeature & { readonly expr: AgentPolicyExpr };
type AgentAggregateWithExpr = CompiledAgentAggregate & {
  readonly of: AgentPolicyExpr;
  readonly where?: AgentPolicyExpr;
};
type AgentPruningRuleWithExpr = CompiledAgentPruningRule & { readonly when: AgentPolicyExpr };
type AgentConsiderationWithExpr = CompiledAgentConsideration & {
  readonly when?: AgentPolicyExpr;
  readonly weight: AgentPolicyExpr;
  readonly value: AgentPolicyExpr;
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
  const profiles = addProfileFingerprints(
    lowerProfiles(agents.profiles, agents.library, library, parameterDefs, diagnostics),
  );
  const bindingsBySeat = lowerBindings(agents.bindings, profiles, diagnostics, options);
  const compiled = lowerAgentConsiderations(library);
  const catalogWithoutFingerprint = {
    schemaVersion: 2,
    surfaceVisibility,
    parameterDefs,
    candidateParamDefs,
    library: stripAgentLibraryExpressions(library),
    compiled,
    profiles,
    bindingsBySeat,
  } satisfies Omit<AgentPolicyCatalog, 'catalogFingerprint'>;

  return {
    ...catalogWithoutFingerprint,
    catalogFingerprint: fingerprintPolicyIr(catalogWithoutFingerprint),
  } satisfies AgentPolicyCatalog;
}

function stripAgentLibraryExpressions(library: AgentLibraryWithExpr): CompiledAgentLibraryIndex {
  const stateFeatures: Record<string, CompiledAgentStateFeature> = {};
  const candidateFeatures: Record<string, CompiledAgentCandidateFeature> = {};
  const candidateAggregates: Record<string, CompiledAgentAggregate> = {};
  const pruningRules: Record<string, CompiledAgentPruningRule> = {};
  const considerations: Record<string, CompiledAgentConsideration> = {};
  const tieBreakers: Record<string, CompiledAgentTieBreaker> = {};
  const strategicConditions: Record<string, CompiledStrategicCondition> = {};

  for (const [id, feature] of Object.entries(library.stateFeatures)) {
    stateFeatures[id] = {
      type: feature.type,
      costClass: feature.costClass,
      dependencies: feature.dependencies,
    };
  }
  for (const [id, feature] of Object.entries(library.candidateFeatures)) {
    candidateFeatures[id] = {
      type: feature.type,
      costClass: feature.costClass,
      dependencies: feature.dependencies,
    };
  }
  for (const [id, aggregate] of Object.entries(library.candidateAggregates)) {
    candidateAggregates[id] = {
      type: aggregate.type,
      costClass: aggregate.costClass,
      op: aggregate.op,
      dependencies: aggregate.dependencies,
    };
  }
  for (const [id, rule] of Object.entries(library.pruningRules)) {
    pruningRules[id] = {
      costClass: rule.costClass,
      dependencies: rule.dependencies,
      onEmpty: rule.onEmpty,
    };
  }
  for (const [id, consideration] of Object.entries(library.considerations)) {
    considerations[id] = {
      ...(consideration.scopes === undefined ? {} : { scopes: consideration.scopes }),
      costClass: consideration.costClass,
      ...(consideration.unknownAs === undefined ? {} : { unknownAs: consideration.unknownAs }),
      ...(consideration.clamp === undefined ? {} : { clamp: consideration.clamp }),
      dependencies: consideration.dependencies,
    };
  }
  for (const [id, tieBreaker] of Object.entries(library.tieBreakers)) {
    tieBreakers[id] = {
      kind: tieBreaker.kind,
      costClass: tieBreaker.costClass,
      ...(tieBreaker.order === undefined ? {} : { order: tieBreaker.order }),
      dependencies: tieBreaker.dependencies,
    };
  }
  for (const [id, condition] of Object.entries(library.strategicConditions)) {
    strategicConditions[id] = {
      ...(condition.proximity === undefined
        ? {}
        : { proximity: { threshold: condition.proximity.threshold } }),
    };
  }

  return {
    stateFeatures,
    candidateFeatures,
    candidateAggregates,
    pruningRules,
    considerations,
    tieBreakers,
    strategicConditions,
  };
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
  ) as Pick<CompiledAgentProfile['use'], 'considerations' | 'pruningRules' | 'tieBreakers'>;
  const use: CompiledAgentProfile['use'] = {
    ...loweredUse,
  };
  const preview = lowerPreviewConfig(profileId, profileDef, diagnostics);
  const selection = lowerSelectionConfig(profileId, profileDef, diagnostics);

  const plan = buildProfilePlan(profileId, use, library, diagnostics);

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
    return {
      mode: 'exactWorld',
      completion: 'greedy',
      completionDepthCap: 8,
      topK: 4,
    };
  }

  const path = `doc.agents.profiles.${profileId}.preview`;
  const { mode, completion, completionDepthCap, topK, phase1, phase1CompletionsPerAction } = authored;

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
    && (typeof completion !== 'string' || (completion !== 'greedy' && completion !== 'agentGuided'))
  ) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_COMPLETION_INVALID,
      path: `${path}.completion`,
      severity: 'error',
      message: `Profile "${profileId}" preview.completion must be greedy or agentGuided, got ${JSON.stringify(completion)}.`,
      suggestion: 'Set preview.completion to greedy or agentGuided.',
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

  if (
    topK !== undefined
    && (
      typeof topK !== 'number'
      || !Number.isSafeInteger(topK)
      || topK <= 0
    )
  ) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_TOPK_INVALID,
      path: `${path}.topK`,
      severity: 'error',
      message: `Profile "${profileId}" preview.topK must be a positive safe integer, got ${String(topK)}.`,
      suggestion: 'Set preview.topK to a positive integer such as 4.',
    });
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
    completion: completion ?? 'greedy',
    completionDepthCap: completionDepthCap ?? 8,
    topK: topK ?? 4,
    phase1: loweredPhase1,
    phase1CompletionsPerAction: loweredPhase1CompletionsPerAction,
  };
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

function buildProfilePlan(
  profileId: string,
  use: CompiledAgentProfile['use'],
  library: CompiledAgentLibraryIndex,
  diagnostics: Diagnostic[],
): CompiledAgentProfile['plan'] | null {
  const stateFeatures: string[] = [];
  const candidateFeatures: string[] = [];
  const candidateAggregates: string[] = [];
  const stateSeen = new Set<string>();
  const candidateSeen = new Set<string>();
  const aggregateSeen = new Set<string>();
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
  };

  for (const ruleId of use.pruningRules) {
    const rule = library.pruningRules[ruleId];
    if (rule === undefined) {
      hasError = true;
      continue;
    }
    addDependencies(rule.dependencies);
  }
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

  if (hasError) {
    return null;
  }

  return {
    stateFeatures,
    candidateFeatures,
    candidateAggregates,
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
    readonly pruningRules: Record<string, AgentPruningRuleWithExpr>;
    readonly considerations: Record<string, AgentConsiderationWithExpr>;
    readonly tieBreakers: Record<string, AgentTieBreakerWithExpr>;
    readonly strategicConditions: Record<string, StrategicConditionWithExpr>;
  };

  private readonly stateFeatureStatus = new Map<string, 'compiling' | 'done' | 'failed'>();
  private readonly candidateFeatureStatus = new Map<string, 'compiling' | 'done' | 'failed'>();
  private readonly aggregateStatus = new Map<string, 'compiling' | 'done' | 'failed'>();
  private readonly pruningRuleStatus = new Map<string, 'done' | 'failed'>();
  private readonly considerationStatus = new Map<string, 'done' | 'failed'>();
  private readonly tieBreakerStatus = new Map<string, 'done' | 'failed'>();
  private readonly strategicConditionStatus = new Map<string, 'compiling' | 'done' | 'failed'>();

  private readonly stateFeatureStack: string[] = [];
  private readonly candidateFeatureStack: string[] = [];
  private readonly aggregateStack: string[] = [];
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
      pruningRules: {},
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
    for (const ruleId of Object.keys(this.authoredLibrary.pruningRules ?? {})) {
      this.compilePruningRule(ruleId);
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

  private compilePruningRule(ruleId: string): AgentPruningRuleWithExpr | null {
    const status = this.pruningRuleStatus.get(ruleId);
    if (status === 'done') {
      return this.compiled.pruningRules[ruleId] ?? null;
    }
    if (status === 'failed') {
      return null;
    }
    const def = this.authoredLibrary.pruningRules?.[ruleId];
    if (def === undefined) {
      this.pruningRuleStatus.set(ruleId, 'failed');
      return null;
    }
    const context = this.createExprContext('rule');
    const when = analyzePolicyExpr(def.when, context, this.diagnostics, `doc.agents.library.pruningRules.${ruleId}.when`);
    if (when === null || when.valueType !== 'boolean') {
      if (when !== null) {
        this.diagnostics.push({
          code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_TYPE_INVALID,
          path: `doc.agents.library.pruningRules.${ruleId}.when`,
          severity: 'error',
          message: `Pruning rule "${ruleId}" when clauses must compile to boolean.`,
          suggestion: 'Use a boolean policy expression for pruningRule.when.',
        });
      }
      this.pruningRuleStatus.set(ruleId, 'failed');
      return null;
    }
    const compiled: AgentPruningRuleWithExpr = {
      costClass: when.costClass,
      when: when.expr,
      dependencies: when.dependencies,
      onEmpty: def.onEmpty ?? 'skipRule',
    };
    this.compiled.pruningRules[ruleId] = compiled;
    this.pruningRuleStatus.set(ruleId, 'done');
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
    const when = def.when === undefined
      ? null
      : analyzePolicyExpr(def.when, context, this.diagnostics, `${path}.when`);
    const weight = analyzePolicyExpr(def.weight, context, this.diagnostics, `${path}.weight`);
    const value = analyzePolicyExpr(def.value, context, this.diagnostics, `${path}.value`);
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
    if (weight.valueType !== 'number' || value.valueType !== 'number') {
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

    const compiled: AgentConsiderationWithExpr = {
      scopes,
      costClass: maxCostClass(maxCostClass(weight.costClass, value.costClass), when?.costClass ?? 'state'),
      ...(def.when === undefined ? {} : { when: when!.expr }),
      weight: weight.expr,
      value: value.expr,
      ...(def.unknownAs === undefined ? {} : { unknownAs: def.unknownAs }),
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

  private validateConsiderationScopeRefs(
    considerationId: string,
    consideration: AgentConsiderationWithExpr,
    path: string,
  ): void {
    const scopes = consideration.scopes ?? [];
    const refKinds = collectConsiderationRefKinds(consideration);
    const hasMoveOnlyRefs = refKinds.has('candidate') || refKinds.has('preview');
    const hasCompletionOnlyRefs = refKinds.has('decision');

    if (scopes.length === 1) {
      const scope = scopes[0];
      if (scope === 'move' && hasCompletionOnlyRefs) {
        this.diagnostics.push({
          code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_CONSIDERATION_SCOPE_VIOLATION,
          path,
          severity: 'error',
          message: `Consideration "${considerationId}" is move-scoped but references completion-only refs.`,
          suggestion: 'Remove decision./option. refs or add the completion scope.',
        });
      }
      if (scope === 'completion' && hasMoveOnlyRefs) {
        this.diagnostics.push({
          code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_CONSIDERATION_SCOPE_VIOLATION,
          path,
          severity: 'error',
          message: `Consideration "${considerationId}" is completion-scoped but references move-only refs.`,
          suggestion: 'Remove candidate./preview. refs or add the move scope.',
        });
      }
      return;
    }

    if (scopes.length > 1 && (hasMoveOnlyRefs || hasCompletionOnlyRefs) && !refKinds.has('contextKind')) {
      this.diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_CONSIDERATION_SCOPE_WARNING,
        path,
        severity: 'warning',
        message: `Consideration "${considerationId}" spans move and completion scopes but does not visibly guard context-specific refs with context.kind.`,
        suggestion: 'Guard move-only and completion-only refs with context.kind in when/value/weight logic.',
      });
    }
  }

  private createExprContext(scope: LibraryRefScope): AnalyzePolicyExprContext {
    return {
      parameterDefs: this.parameterDefs,
      ...(this.options.referenceSeatIds === undefined ? {} : { referenceSeatIds: this.options.referenceSeatIds }),
      resolveRef: (refPath: string, path: string) => this.resolveRef(scope, refPath, path),
    };
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

    return this.resolveRuntimeRef(scope, refPath, path);
  }

  private resolveRuntimeRef(scope: LibraryRefScope, refPath: string, path: string): ResolvedPolicyRef | null {
    if (scope === 'consideration') {
      const completionResolved = this.resolveCompletionRuntimeRef(refPath);
      if (completionResolved !== null) {
        return completionResolved;
      }
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
    if (refPath.startsWith('candidate.param.')) {
      if (scope === 'stateFeature') {
        this.reportInvalidCandidateParamRef(refPath, path);
        return null;
      }
      const candidateParamPath = refPath.slice('candidate.param.'.length);
      if (candidateParamPath.length === 0 || candidateParamPath.includes('.')) {
        this.reportInvalidCandidateParamRef(refPath, path);
        return null;
      }
      const candidateParamDef = this.candidateParamDefs[candidateParamPath];
      if (candidateParamDef === undefined) {
        this.reportInvalidCandidateParamRef(refPath, path);
        return null;
      }
      return {
        type: candidateParamDef.type,
        costClass: 'candidate',
        ref: { kind: 'candidateParam', id: candidateParamPath },
      };
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

  private resolveCompletionRuntimeRef(refPath: string): ResolvedPolicyRef | null {
    switch (refPath) {
      case 'decision.type':
        return { type: 'id', costClass: 'state', ref: { kind: 'decisionIntrinsic', intrinsic: 'type' } };
      case 'decision.name':
        return { type: 'id', costClass: 'state', ref: { kind: 'decisionIntrinsic', intrinsic: 'name' } };
      case 'decision.targetKind':
        return { type: 'id', costClass: 'state', ref: { kind: 'decisionIntrinsic', intrinsic: 'targetKind' } };
      case 'decision.optionCount':
        return { type: 'number', costClass: 'state', ref: { kind: 'decisionIntrinsic', intrinsic: 'optionCount' } };
      case 'option.value':
        return { type: 'unknown', costClass: 'state', ref: { kind: 'optionIntrinsic', intrinsic: 'value' } };
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
    if (seatToken === 'self' || seatToken === 'active' || seatToken === '$seat') {
      return true;
    }
    if (this.options.referenceSeatIds === undefined) {
      return true;
    }
    if (this.options.referenceSeatIds.includes(seatToken)) {
      return true;
    }
    this.reportUnknownLibraryRef(refPath, path);
    return false;
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
      message: `Invalid candidate param ref "${refPath}".`,
      suggestion: 'Use exactly candidate.param.<paramName> for a concrete move param with a policy-visible compiled candidate-param contract.',
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
      suggestion: 'Use scopes: ["move"], scopes: ["completion"], or both.',
    });
    return null;
  }

  const normalized: ConsiderationScope[] = [];
  const seen = new Set<ConsiderationScope>();
  for (const [index, entry] of value.entries()) {
    if (entry !== 'move' && entry !== 'completion') {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_CONSIDERATION_SCOPE_INVALID,
        path: `${path}.${index}`,
        severity: 'error',
        message: `Unsupported consideration scope "${String(entry)}".`,
        suggestion: 'Use only "move" and "completion" scopes.',
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

function collectConsiderationRefKinds(
  consideration: AgentConsiderationWithExpr,
): ReadonlySet<'candidate' | 'preview' | 'decision' | 'contextKind'> {
  const kinds = new Set<'candidate' | 'preview' | 'decision' | 'contextKind'>();
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
      case 'decisionIntrinsic':
      case 'optionIntrinsic':
        kinds.add('decision');
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
  return {
    parameters: uniqueSorted(dependencies.flatMap((entry) => entry.parameters)),
    stateFeatures: uniqueSorted(dependencies.flatMap((entry) => entry.stateFeatures)),
    candidateFeatures: uniqueSorted(dependencies.flatMap((entry) => entry.candidateFeatures)),
    aggregates: uniqueSorted(dependencies.flatMap((entry) => entry.aggregates)),
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

function maxCostClass(left: AgentPolicyCostClass, right: AgentPolicyCostClass): AgentPolicyCostClass {
  if (left === 'preview' || right === 'preview') {
    return 'preview';
  }
  if (left === 'candidate' || right === 'candidate') {
    return 'candidate';
  }
  return 'state';
}
