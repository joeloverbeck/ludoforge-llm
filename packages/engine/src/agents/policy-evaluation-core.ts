import { asPlayerId, type PlayerId, type ZoneId } from '../kernel/branded.js';
import type { AgentPolicyZoneScope, AgentPolicyZoneTokenAggOp, AgentPolicyZoneTokenAggOwner } from '../contracts/index.js';
import { createEvalContext, createEvalRuntimeResources, type ReadContext } from '../kernel/eval-context.js';
import { resolveZoneRefWithOwnerFallback } from '../kernel/resolve-zone-ref.js';
import { buildRuntimeTableIndex } from '../kernel/runtime-table-index.js';
import { buildAdjacencyGraph, queryAdjacentZones } from '../kernel/spatial.js';
import {
  buildEncodedState,
  type EncodedState,
  type EncodedStateLayout,
} from '../kernel/encoded-state/index.js';
import {
  compilePolicyBytecode,
  type FeatureRef,
  type PolicyBytecode,
} from '../cnl/policy-bytecode/index.js';
import { computeEffectFootprint, unionFootprints } from '../cnl/compile-effect-footprint.js';
import { stablePayloadCode, stableStringCode } from '../cnl/policy-bytecode/feature-table.js';
import type {
  AttributeValue,
  AgentParameterValue,
  AgentPolicyCatalog,
  AgentPolicyTokenFilter,
  AgentPolicyZoneFilter,
  CandidateParamUnavailabilityReason,
  ChoicePendingRequest,
  CompiledAgentPolicyRef,
  CompiledPolicyExpr,
  CompiledPolicyConsideration,
  CompiledPolicyZoneSource,
  CompiledSurfaceRef,
  GameDef,
  GameState,
  LookupUnavailabilityReason,
  MoveParamValue,
  PolicySelectorTraceEntry,
  PolicyPreviewSeatMatrixCellTrace,
  Token,
  TrustedExecutableMove,
  ZoneDef,
} from '../kernel/types.js';
import type { GameDefRuntime } from '../kernel/gamedef-runtime.js';
import {
  createPolicyRuntimeProviders,
  type PreviewOptionProjectedState,
  type PolicyRuntimeCandidate,
  type PolicyRuntimeProviders,
} from './policy-runtime.js';
import type {
  Phase1ActionPreviewEntry,
  PolicyPreviewDependencies,
  PolicyPreviewDriveTrace,
  PolicyPreviewGrantedOperation,
  PolicyPreviewTraceOutcome,
  PolicyPreviewUnavailabilityReason,
} from './policy-preview.js';
import { resolvePolicyStandingRoleSelector, type PolicyValue } from './policy-surface.js';
import type { PreviewOptionRefStatus } from './policy-preview-inner.js';
import { executeBytecode, PolicyBytecodeVmUnsupportedError, type VMContext } from './policy-vm/index.js';
import { getPolicyEncodedStateLayout } from './policy-encoded-state-layout-cache.js';
import { resolvePolicyEncodedState } from './policy-encoded-state-cache.js';
import { evaluateSelector, type SelectedSelectorView } from './policy-selector-eval.js';

const CURRENT_SURFACE_SCOPE = 0;
const PREVIEW_SURFACE_SCOPE = 1;

const tryBuildEncodedState = (state: GameState, layout: EncodedStateLayout): EncodedState | undefined => {
  try {
    return buildEncodedState(state, layout);
  } catch {
    return undefined;
  }
};

export interface PolicyRuntimeFailure {
  readonly code: string;
  readonly message: string;
  readonly detail?: Readonly<Record<string, unknown>>;
}

export interface PolicyPreviewFallbackFired {
  readonly termId: string;
  readonly kind: 'noContribution' | 'constant';
  readonly value?: number;
}

export interface PolicyLookupFallbackFired {
  readonly termId: string;
  readonly kind: 'noContribution' | 'constant';
  readonly value?: number;
}

export type PolicyScheduleFallbackKind =
  | 'useLowerBound'
  | 'noContribution'
  | 'constant'
  | 'dropConsideration';

export interface PolicyScheduleFallbackFired {
  readonly termId: string;
  readonly kind: PolicyScheduleFallbackKind;
  readonly value?: number;
  readonly reason?: 'partial.lowerBound.visiblePrefixExhausted';
}

export type PolicyCandidateParamFallbackFired = ReadonlyMap<string, number>;

export type PolicyScheduleInputRefTrace =
  | {
      readonly status: 'ready';
      readonly value: number | string;
      readonly observerPolicy?: 'topNVisible';
      readonly visiblePrefixLength?: number;
      readonly visibleSequenceSources?: readonly {
        readonly zoneId: string;
        readonly availablePublic: number;
        readonly taken: number;
      }[];
    }
  | {
      readonly status: 'partial';
      readonly partialKind: 'lowerBound';
      readonly lowerBound: number;
      readonly observerPolicy: 'topNVisible';
      readonly visiblePrefixLength: number;
      readonly visibleSequenceSources: readonly {
        readonly zoneId: string;
        readonly availablePublic: number;
        readonly taken: number;
      }[];
      readonly fallbackApplied?: {
        readonly kind: PolicyScheduleFallbackKind;
        readonly numericValue?: number;
      };
    };

export class PolicyRuntimeError extends Error {
  readonly failure: PolicyRuntimeFailure;

  constructor(failure: PolicyRuntimeFailure) {
    super(failure.message);
    this.name = 'PolicyRuntimeError';
    this.failure = failure;
  }
}

export interface PolicyEvaluationCandidate extends PolicyRuntimeCandidate {
  readonly previewRefIds: Set<string>;
  readonly unknownPreviewRefs: Map<string, PolicyPreviewUnavailabilityReason>;
  previewSeatMatrix?: Map<string, Map<string, PolicyPreviewSeatMatrixCellTrace>>;
  readonly unknownLookupRefs: Map<string, LookupUnavailabilityReason>;
  readonly unknownCandidateParamRefs: Map<string, CandidateParamUnavailabilityReason>;
  previewOutcome?: PolicyPreviewTraceOutcome;
  previewFailureReason?: string;
  previewDrive?: PolicyPreviewDriveTrace;
  outcomeGrantContinuationDepth?: number;
  previewFallbackFired?: PolicyPreviewFallbackFired;
  lookupFallbackFired?: PolicyLookupFallbackFired;
  scheduleFallbackFired?: PolicyScheduleFallbackFired;
  scheduleInputRefs?: Map<string, PolicyScheduleInputRefTrace>;
  candidateParamFallbackFired?: Map<string, number>;
  completionPolicyFallbackCount?: number;
  grantedOperation?: PolicyPreviewGrantedOperation;
}

export interface CreatePolicyEvaluationContextInput {
  readonly def: GameDef;
  readonly state: GameState;
  readonly playerId: PlayerId;
  readonly seatId: string;
  readonly catalog: AgentPolicyCatalog;
  readonly parameterValues: Readonly<Record<string, AgentParameterValue>>;
  readonly trustedMoveIndex: ReadonlyMap<string, TrustedExecutableMove>;
  readonly phase1ActionPreviewIndex?: ReadonlyMap<string, Phase1ActionPreviewEntry>;
  readonly previewDependencies?: PolicyPreviewDependencies;
  readonly runtime?: GameDefRuntime;
  readonly encodedStateLayout?: EncodedStateLayout;
  readonly encodedState?: EncodedState;
  readonly traceLevel?: 'none' | 'summary' | 'verbose';
  readonly completion?: {
    readonly request: ChoicePendingRequest;
    readonly optionValue: MoveParamValue;
    readonly optionIndex?: number;
  };
  readonly previewOption?: {
    readonly resolvedRefs: ReadonlyMap<string, PreviewOptionRefStatus>;
    readonly unknownPreviewRefs?: Map<string, PolicyPreviewUnavailabilityReason>;
    readonly previewFallbackFired?: { current?: PolicyPreviewFallbackFired };
    readonly projectedState?: PreviewOptionProjectedState;
  };
  readonly lookupOption?: {
    readonly unknownLookupRefs?: Map<string, LookupUnavailabilityReason>;
    readonly lookupFallbackFired?: { current?: PolicyLookupFallbackFired };
  };
  readonly scheduleOption?: {
    readonly scheduleFallbackFired?: { current?: PolicyScheduleFallbackFired };
    readonly scheduleInputRefs?: { current?: Map<string, PolicyScheduleInputRefTrace> };
  };
  readonly candidateParamOption?: {
    readonly unknownCandidateParamRefs?: Map<string, CandidateParamUnavailabilityReason>;
    readonly candidateParamFallbackFired?: { current?: Map<string, number> };
  };
}

function resolveZoneTokenAggOwner(
  owner: AgentPolicyZoneTokenAggOwner,
  input: CreatePolicyEvaluationContextInput,
  state: GameState,
): 'none' | PlayerId | undefined {
  if (owner === 'self') {
    return input.playerId;
  }
  if (owner === 'active') {
    return state.activePlayer;
  }
  if (owner === 'none') {
    return 'none';
  }
  if (/^[0-9]+$/.test(owner)) {
    return asPlayerId(Number(owner));
  }
  return undefined;
}

export interface ResolvedTokenFilter {
  readonly type?: string;
  readonly props?: Readonly<Record<string, { readonly eq: string | number | boolean }>>;
}

export function resolveTokenFilter(
  filter: AgentPolicyTokenFilter | undefined,
  playerId: PlayerId,
  state: GameState,
  seatIds?: readonly string[],
): ResolvedTokenFilter | undefined {
  if (filter === undefined) {
    return undefined;
  }
  if (filter.props === undefined) {
    return filter;
  }

  const resolvedProps = Object.fromEntries(
    Object.entries(filter.props).map(([key, comparison]) => {
      const value: string | number | boolean = comparison.eq === 'self'
        ? (seatIds !== undefined ? (seatIds[playerId] ?? playerId) : playerId)
        : comparison.eq === 'active'
          ? (seatIds !== undefined ? (seatIds[state.activePlayer] ?? state.activePlayer) : state.activePlayer)
          : comparison.eq;
      return [key, { eq: value }] as const;
    }),
  );

  return {
    ...(filter.type === undefined ? {} : { type: filter.type }),
    props: resolvedProps,
  };
}

function applyComparisonOp(
  actual: string | number | boolean | undefined,
  op: 'eq' | 'gt' | 'gte' | 'lt' | 'lte',
  expected: string | number | boolean,
): boolean {
  if (actual === undefined) {
    return false;
  }
  if (op === 'eq') {
    return actual === expected;
  }
  if (typeof actual !== typeof expected) {
    return false;
  }
  if (typeof actual === 'number' || typeof actual === 'string') {
    if (op === 'gt') return actual > expected;
    if (op === 'gte') return actual >= expected;
    if (op === 'lt') return actual < expected;
    return actual <= expected;
  }
  return false;
}

function previewOutcomeToUnavailabilityReason(
  outcome: Exclude<PolicyPreviewTraceOutcome, 'ready'>,
): PolicyPreviewUnavailabilityReason {
  return outcome === 'stochastic' ? 'random' : outcome;
}

function scheduleDistanceRefId(ref: Extract<CompiledAgentPolicyRef, { readonly kind: 'scheduleDistance' }>): string {
  const target = ref.target.kind === 'boundary'
    ? `toBoundary.${String(ref.target.boundaryId)}`
    : 'toBoundary.next';
  return `schedule.distance.${target}.${ref.unit ?? 'cards'}`;
}

export function matchesTokenFilter(
  token: Token,
  filter: ResolvedTokenFilter | undefined,
): boolean {
  if (filter === undefined) {
    return true;
  }
  if (filter.type !== undefined && token.type !== filter.type) {
    return false;
  }
  if (filter.props === undefined) {
    return true;
  }
  return Object.entries(filter.props).every(([key, comparison]) => {
    const actual = token.props[key];
    const expected = comparison.eq;
    if (typeof actual === 'string' && typeof expected === 'string') {
      return actual.toLowerCase() === expected.toLowerCase();
    }
    return actual === expected;
  });
}

export function matchesZoneScope(
  zoneDef: ZoneDef,
  scope: AgentPolicyZoneScope,
): boolean {
  if (scope === 'all') {
    return true;
  }
  const zoneKind = zoneDef.zoneKind ?? 'board';
  return zoneKind === scope;
}

export function matchesZoneFilter(
  zoneDef: ZoneDef,
  filter: AgentPolicyZoneFilter | undefined,
  state: GameState,
): boolean {
  if (filter === undefined) {
    return true;
  }
  if (filter.category !== undefined && zoneDef.category !== filter.category) {
    return false;
  }
  if (filter.attribute !== undefined) {
    const actualAttribute = scalarZonePropValue(zoneDef.attributes?.[filter.attribute.prop]);
    if (!applyComparisonOp(actualAttribute, filter.attribute.op, filter.attribute.value)) {
      return false;
    }
  }
  if (filter.variable !== undefined) {
    const actualVariable = state.zoneVars[String(zoneDef.id)]?.[filter.variable.prop];
    if (!applyComparisonOp(actualVariable, filter.variable.op, filter.variable.value)) {
      return false;
    }
  }
  return true;
}

export class PolicyEvaluationContext {
  private readonly rootStateFeatureCache = new Map<string, PolicyValue>();
  private readonly candidateFeatureCache = new Map<string, Map<string, PolicyValue>>();
  private readonly aggregateCache = new Map<string, PolicyValue>();
  private readonly selectorCache = new Map<string, SelectedSelectorView>();
  private readonly strategicConditionCache = new Map<string, PolicyValue>();
  private readonly fallbackPolicyBytecodeCache = new WeakMap<CompiledPolicyExpr, PolicyBytecode>();
  private readonly resolvedPreviewRefValues = new Map<string, Map<string, number>>();
  private readonly runtimeProviders: PolicyRuntimeProviders;
  private readonly encodedStateLayout: EncodedStateLayout;
  private readonly usesCanonicalEncodedStateLayout: boolean;
  private readonly encodedState: EncodedState | undefined;
  private readonly encodedZoneIndexById: ReadonlyMap<string, number> | undefined;
  private transientStateFeatureCache: { readonly stateHash: bigint; readonly cache: Map<string, PolicyValue> } | null = null;
  private transientZoneReadContext: { readonly stateHash: bigint; readonly context: ReadContext } | null = null;
  private currentCandidates: PolicyEvaluationCandidate[];
  private activeState: GameState;
  private currentSeatContext: string | undefined;
  private currentSeatMatrixContext: { readonly seatId: string } | undefined;
  private candidateParamUnavailableDuringValue = false;
  private previewUnavailableEventCount = 0;
  private scheduleUnavailableDuringValue = false;
  private schedulePartialsDuringValue: { readonly refId: string; readonly lowerBound: number }[] = [];

  constructor(
    private readonly input: CreatePolicyEvaluationContextInput,
    candidates: PolicyEvaluationCandidate[],
  ) {
    this.currentCandidates = candidates;
    this.activeState = input.state;
    const canonicalEncodedStateLayout = getPolicyEncodedStateLayout(input.def);
    this.encodedStateLayout = input.encodedStateLayout ?? canonicalEncodedStateLayout;
    this.usesCanonicalEncodedStateLayout = this.encodedStateLayout === canonicalEncodedStateLayout;
    this.encodedState = input.encodedState ?? this.resolveEncodedState(input.state);
    this.encodedZoneIndexById = new Map(this.encodedStateLayout.zoneIds.map((zoneId, index) => [String(zoneId), index]));
    this.runtimeProviders = createPolicyRuntimeProviders({
      def: input.def,
      state: input.state,
      playerId: input.playerId,
      seatId: input.seatId,
      trustedMoveIndex: input.trustedMoveIndex,
      ...(input.phase1ActionPreviewIndex === undefined ? {} : { phase1ActionPreviewIndex: input.phase1ActionPreviewIndex }),
      catalog: input.catalog,
      ...(input.previewDependencies === undefined ? {} : { previewDependencies: input.previewDependencies }),
      runtimeError: (code, message, detail) => this.runtimeError(code, message, detail),
      ...(input.runtime === undefined ? {} : { runtime: input.runtime }),
      ...(input.traceLevel === undefined ? {} : { traceLevel: input.traceLevel }),
      encodedStateLayout: this.encodedStateLayout,
      ...(this.encodedState === undefined ? {} : { encodedState: this.encodedState }),
      ...(input.completion === undefined ? {} : { completion: input.completion }),
    });
  }

  dispose(): void {
    this.rootStateFeatureCache.clear();
    this.candidateFeatureCache.clear();
    this.aggregateCache.clear();
    this.selectorCache.clear();
    this.strategicConditionCache.clear();
    this.resolvedPreviewRefValues.clear();
    this.transientStateFeatureCache?.cache.clear();
    this.transientStateFeatureCache = null;
    this.transientZoneReadContext = null;
    this.currentCandidates = [];
    this.currentSeatContext = undefined;
    this.currentSeatMatrixContext = undefined;
    this.runtimeProviders.dispose();
  }

  invalidateAggregates(): void {
    this.aggregateCache.clear();
    this.selectorCache.clear();
  }

  setCurrentCandidates(candidates: PolicyEvaluationCandidate[]): void {
    this.currentCandidates = candidates;
    this.invalidateAggregates();
  }

  evaluatePlannedSelector(selectorId: string, candidate?: PolicyEvaluationCandidate): void {
    this.evaluateSelectorView(selectorId, candidate);
  }

  getEvaluatedStateFeatures(): Readonly<Record<string, number | string | boolean>> {
    const result: Record<string, number | string | boolean> = {};
    for (const [id, value] of this.rootStateFeatureCache) {
      if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
        result[id] = value;
      }
    }
    return result;
  }

  getEvaluatedSelectorCacheSize(): number {
    return this.selectorCache.size;
  }

  getEvaluatedSelectorTraces(traceLevel: 'summary' | 'verbose' = 'summary'): readonly PolicySelectorTraceEntry[] {
    const seen = new Set<string>();
    const entries: PolicySelectorTraceEntry[] = [];
    for (const [, view] of [...this.selectorCache.entries()].sort(([left], [right]) => left.localeCompare(right))) {
      if (seen.has(view.selectorId)) {
        continue;
      }
      seen.add(view.selectorId);
      entries.push(selectorTraceEntry(view, traceLevel));
    }
    return entries.sort((left, right) => left.selectorId.localeCompare(right.selectorId));
  }

  evaluateStateFeature(featureId: string): PolicyValue {
    return this.evaluateStateFeatureAgainstState(featureId, this.activeState);
  }

  evaluateCandidateFeature(candidate: PolicyEvaluationCandidate, featureId: string): PolicyValue {
    let candidateCache = this.candidateFeatureCache.get(candidate.stableMoveKey);
    if (candidateCache === undefined) {
      candidateCache = new Map<string, PolicyValue>();
      this.candidateFeatureCache.set(candidate.stableMoveKey, candidateCache);
    }
    if (candidateCache.has(featureId)) {
      return candidateCache.get(featureId);
    }
    const feature = this.input.catalog.compiled.candidateFeatures[featureId];
    if (feature === undefined) {
      throw this.runtimeError('RUNTIME_EVALUATION_ERROR', `Unknown candidate feature "${featureId}".`, { featureId });
    }
    const value = this.evaluateCompiledExpr(feature.expr, candidate);
    candidateCache.set(featureId, value);
    return value;
  }

  setCandidateFeatureValue(candidate: PolicyEvaluationCandidate, featureId: string, value: PolicyValue): void {
    let candidateCache = this.candidateFeatureCache.get(candidate.stableMoveKey);
    if (candidateCache === undefined) {
      candidateCache = new Map<string, PolicyValue>();
      this.candidateFeatureCache.set(candidate.stableMoveKey, candidateCache);
    }
    candidateCache.set(featureId, value);
    this.aggregateCache.clear();
  }

  evaluatePreviewSurfaceRef(candidate: PolicyEvaluationCandidate, ref: CompiledSurfaceRef): PolicyValue {
    return this.resolveSurfaceRef(ref, candidate);
  }

  evaluatePreviewStateFeatureRef(candidate: PolicyEvaluationCandidate, featureId: string): PolicyValue {
    return this.resolvePreviewStateFeatureRef(featureId, candidate);
  }

  recordResolvedPreviewRefValue(candidate: PolicyEvaluationCandidate, refId: string, value: PolicyValue): void {
    if (typeof value !== 'number') {
      return;
    }
    let candidateValues = this.resolvedPreviewRefValues.get(candidate.stableMoveKey);
    if (candidateValues === undefined) {
      candidateValues = new Map<string, number>();
      this.resolvedPreviewRefValues.set(candidate.stableMoveKey, candidateValues);
    }
    candidateValues.set(refId, value);
    this.recordSeatMatrixCell(candidate, refId, { status: 'ready', value });
  }

  getResolvedPreviewRefValue(candidate: PolicyEvaluationCandidate, refId: string): number | undefined {
    return this.resolvedPreviewRefValues.get(candidate.stableMoveKey)?.get(refId);
  }

  hasPreviewData(candidate: PolicyEvaluationCandidate): boolean {
    return this.runtimeProviders.previewSurface.hasPreviewData(candidate);
  }

  markPreviewGated(candidate: PolicyEvaluationCandidate): void {
    this.runtimeProviders.previewSurface.markGated(candidate);
    candidate.previewOutcome = 'gated';
    candidate.previewFailureReason = 'gated';
    delete candidate.previewDrive;
  }

  hasMaterializedPreview(candidate: PolicyEvaluationCandidate): boolean {
    return this.runtimeProviders.previewSurface.hasMaterializedOutcome(candidate);
  }

  /** Ensure the candidate's previewOutcome is set from the preview surface.
   *  Call after all feature evaluation to finalize outcome before trace generation.
   *  Only syncs metadata for candidates that actually attempted preview ref resolution. */
  finalizePreviewOutcome(candidate: PolicyEvaluationCandidate): void {
    if (candidate.previewRefIds.size > 0) {
      this.syncPreviewMetadata(candidate);
    }
  }

  evaluateAggregate(aggregateId: string): PolicyValue {
    if (this.aggregateCache.has(aggregateId)) {
      return this.aggregateCache.get(aggregateId);
    }
    const aggregate = this.input.catalog.compiled.candidateAggregates[aggregateId];
    if (aggregate === undefined) {
      throw this.runtimeError('RUNTIME_EVALUATION_ERROR', `Unknown candidate aggregate "${aggregateId}".`, { aggregateId });
    }

    const included = this.currentCandidates.filter((candidate) => {
      const where = aggregate.where === undefined ? true : this.evaluateCompiledExpr(aggregate.where, candidate);
      return where === true;
    });

    let value: PolicyValue;
    switch (aggregate.op) {
      case 'count':
        value = included.length;
        break;
      case 'max':
      case 'min': {
        const numericValues = included
          .map((candidate) => this.evaluateCompiledExpr(aggregate.of, candidate))
          .filter((entry): entry is number => typeof entry === 'number');
        if (numericValues.length === 0) {
          value = undefined;
          break;
        }
        value = aggregate.op === 'max'
          ? numericValues.reduce((best, entry) => Math.max(best, entry), Number.NEGATIVE_INFINITY)
          : numericValues.reduce((best, entry) => Math.min(best, entry), Number.POSITIVE_INFINITY);
        break;
      }
      case 'sum': {
        const numericValues = included
          .map((candidate) => this.evaluateCompiledExpr(aggregate.of, candidate))
          .filter((entry): entry is number => typeof entry === 'number');
        value = numericValues.length === 0 ? undefined : numericValues.reduce((sum, entry) => sum + entry, 0);
        break;
      }
      case 'any': {
        const booleanValues = included
          .map((candidate) => this.evaluateCompiledExpr(aggregate.of, candidate))
          .filter((entry): entry is boolean => typeof entry === 'boolean');
        value = booleanValues.length === 0 ? undefined : booleanValues.some(Boolean);
        break;
      }
      case 'all': {
        const booleanValues = included
          .map((candidate) => this.evaluateCompiledExpr(aggregate.of, candidate))
          .filter((entry): entry is boolean => typeof entry === 'boolean');
        value = booleanValues.length === 0 ? undefined : booleanValues.every(Boolean);
        break;
      }
      case 'rankDense':
      case 'rankOrdinal':
        throw this.runtimeError(
          'UNSUPPORTED_AGGREGATE_OP',
          `Aggregate op "${aggregate.op}" is not implemented by the non-preview policy evaluator runtime.`,
          { aggregateId, op: aggregate.op },
        );
      default:
        throw this.runtimeError(
          'UNSUPPORTED_AGGREGATE_OP',
          `Aggregate op "${String((aggregate as { readonly op?: unknown }).op)}" is unsupported.`,
          { aggregateId, op: (aggregate as { readonly op?: unknown }).op },
        );
    }

    this.aggregateCache.set(aggregateId, value);
    return value;
  }

  evaluateConsideration(
    considerations: Readonly<Record<string, CompiledPolicyConsideration>>,
    considerationId: string,
    candidate: PolicyEvaluationCandidate | undefined,
    onContribution?: (contribution: number) => void,
  ): number {
    const consideration = considerations[considerationId];
    if (consideration === undefined) {
      throw this.runtimeError('RUNTIME_EVALUATION_ERROR', `Unknown consideration "${considerationId}".`, { considerationId });
    }

    if (consideration.when !== undefined) {
      const when = this.evaluateCompiledExpr(consideration.when, candidate);
      this.scheduleUnavailableDuringValue = false;
      this.schedulePartialsDuringValue = [];
      if (when !== true) {
        return 0;
      }
    }

    const weight = this.evaluateCompiledExpr(consideration.weight, candidate);
    const unknownCandidateParamRefsBefore = this.unknownCandidateParamRefCount(candidate);
    const previewUnavailableEventsBefore = this.previewUnavailableEventCount;
    const unknownLookupRefsBefore = this.unknownLookupRefCount(candidate);
    this.candidateParamUnavailableDuringValue = false;
    const value = this.evaluateCompiledExpr(consideration.value, candidate);
    const candidateParamUnavailable = this.candidateParamUnavailableDuringValue
      || this.unknownCandidateParamRefCount(candidate) > unknownCandidateParamRefsBefore;
    const previewUnavailable = this.previewUnavailableEventCount > previewUnavailableEventsBefore;
    const lookupUnavailable = this.unknownLookupRefCount(candidate) > unknownLookupRefsBefore;
    this.candidateParamUnavailableDuringValue = false;
    const scheduleUnavailable = this.scheduleUnavailableDuringValue;
    this.scheduleUnavailableDuringValue = false;
    const schedulePartials = this.schedulePartialsDuringValue;
    this.schedulePartialsDuringValue = [];
    if (typeof weight !== 'number' || typeof value !== 'number') {
      let contribution: number | undefined;
      let shouldRecordContribution = false;
      let dropConsideration = false;
      if (candidateParamUnavailable) {
        const fallback = consideration.candidateParamFallback?.onUnavailable;
        if (fallback === undefined) {
          throw this.runtimeError(
            'RUNTIME_EVALUATION_ERROR',
            `Candidate-param consideration "${considerationId}" did not declare candidateParamFallback.onUnavailable.`,
            { considerationId },
          );
        }
        if (fallback === 'noContribution') {
          this.recordCandidateParamFallbackFired(candidate, considerationId);
          contribution ??= 0;
        } else {
          this.recordCandidateParamFallbackFired(candidate, considerationId);
          contribution ??= fallback.value;
          shouldRecordContribution = true;
        }
      }
      if (previewUnavailable && consideration.previewFallback?.onUnavailable !== undefined) {
        const fallback = consideration.previewFallback?.onUnavailable;
        if (fallback === undefined) {
          throw this.runtimeError(
            'RUNTIME_EVALUATION_ERROR',
            `Preview consideration "${considerationId}" did not declare previewFallback.onUnavailable.`,
            { considerationId },
          );
        }
        if (fallback === 'noContribution') {
          this.recordPreviewFallbackFired(candidate, {
            termId: considerationId,
            kind: 'noContribution',
          });
          contribution ??= 0;
        } else {
          this.recordPreviewFallbackFired(candidate, {
            termId: considerationId,
            kind: 'constant',
            value: fallback.value,
          });
          contribution ??= fallback.value;
          shouldRecordContribution = true;
        }
      }
      if (lookupUnavailable && consideration.lookupFallback?.onUnavailable !== undefined) {
        const fallback = consideration.lookupFallback?.onUnavailable;
        if (fallback === undefined) {
          throw this.runtimeError(
            'RUNTIME_EVALUATION_ERROR',
            `Lookup consideration "${considerationId}" did not declare lookupFallback.onUnavailable.`,
            { considerationId },
          );
        }
        if (fallback === 'noContribution') {
          this.recordLookupFallbackFired(candidate, {
            termId: considerationId,
            kind: 'noContribution',
          });
          contribution ??= 0;
        } else {
          this.recordLookupFallbackFired(candidate, {
            termId: considerationId,
            kind: 'constant',
            value: fallback.value,
          });
          contribution ??= fallback.value;
          shouldRecordContribution = true;
        }
      }
      if (scheduleUnavailable) {
        const fallback = consideration.scheduleFallback?.onUnavailable;
        if (fallback === undefined) {
          throw this.runtimeError(
            'RUNTIME_EVALUATION_ERROR',
            `Schedule consideration "${considerationId}" did not declare scheduleFallback.onUnavailable.`,
            { considerationId },
          );
        }
        if (fallback === 'dropConsideration') {
          this.recordScheduleFallbackFired(candidate, {
            termId: considerationId,
            kind: 'dropConsideration',
          });
          dropConsideration = true;
        } else if (fallback === 'noContribution') {
          this.recordScheduleFallbackFired(candidate, {
            termId: considerationId,
            kind: 'noContribution',
          });
          contribution ??= 0;
          shouldRecordContribution = true;
        } else {
          this.recordScheduleFallbackFired(candidate, {
            termId: considerationId,
            kind: 'constant',
            value: fallback.value,
          });
          contribution ??= fallback.value;
          shouldRecordContribution = true;
        }
      }
      if (schedulePartials.length > 0) {
        const fallback = consideration.scheduleFallback?.onPartial?.visiblePrefixExhausted;
        if (fallback === undefined) {
          throw this.runtimeError(
            'RUNTIME_EVALUATION_ERROR',
            `Schedule consideration "${considerationId}" did not declare scheduleFallback.onPartial.visiblePrefixExhausted.`,
            { considerationId },
          );
        }
        const lowerBound = schedulePartials[0]!.lowerBound;
        if (fallback === 'dropConsideration') {
          this.recordScheduleFallbackFired(candidate, {
            termId: considerationId,
            kind: 'dropConsideration',
            reason: 'partial.lowerBound.visiblePrefixExhausted',
          });
          this.recordSchedulePartialFallbackApplied(candidate, schedulePartials, 'dropConsideration');
          dropConsideration = true;
        } else if (fallback === 'noContribution') {
          this.recordScheduleFallbackFired(candidate, {
            termId: considerationId,
            kind: 'noContribution',
            reason: 'partial.lowerBound.visiblePrefixExhausted',
          });
          this.recordSchedulePartialFallbackApplied(candidate, schedulePartials, 'noContribution', 0);
          contribution ??= 0;
          shouldRecordContribution = true;
        } else if (fallback === 'useLowerBound') {
          this.recordScheduleFallbackFired(candidate, {
            termId: considerationId,
            kind: 'useLowerBound',
            value: lowerBound,
            reason: 'partial.lowerBound.visiblePrefixExhausted',
          });
          this.recordSchedulePartialFallbackApplied(candidate, schedulePartials, 'useLowerBound', lowerBound);
          contribution ??= typeof weight === 'number' ? weight * lowerBound : lowerBound;
          shouldRecordContribution = true;
        } else {
          this.recordScheduleFallbackFired(candidate, {
            termId: considerationId,
            kind: 'constant',
            value: fallback.value,
            reason: 'partial.lowerBound.visiblePrefixExhausted',
          });
          this.recordSchedulePartialFallbackApplied(candidate, schedulePartials, 'constant', fallback.value);
          contribution ??= typeof weight === 'number' ? weight * fallback.value : fallback.value;
          shouldRecordContribution = true;
        }
      }
      if (dropConsideration) {
        return 0;
      }
      if (contribution === undefined) {
        contribution = consideration.unknownAs ?? 0;
        shouldRecordContribution = true;
      }
      if (shouldRecordContribution) {
        onContribution?.(contribution);
      }
      return contribution;
    }

    let contribution = weight * value;
    if (consideration.clamp !== undefined) {
      if (consideration.clamp.min !== undefined) {
        contribution = Math.max(consideration.clamp.min, contribution);
      }
      if (consideration.clamp.max !== undefined) {
        contribution = Math.min(consideration.clamp.max, contribution);
      }
    }
    onContribution?.(contribution);
    return contribution;
  }

  private unknownCandidateParamRefCount(candidate: PolicyEvaluationCandidate | undefined): number {
    return candidate?.unknownCandidateParamRefs.size
      ?? this.input.candidateParamOption?.unknownCandidateParamRefs?.size
      ?? 0;
  }

  private recordUnknownPreviewRef(
    candidate: PolicyEvaluationCandidate | undefined,
    refId: string,
    reason: PolicyPreviewUnavailabilityReason,
  ): void {
    candidate?.unknownPreviewRefs.set(refId, reason);
    this.input.previewOption?.unknownPreviewRefs?.set(refId, reason);
    if (candidate !== undefined) {
      this.recordSeatMatrixCell(candidate, refId, { status: reason });
    }
    this.previewUnavailableEventCount += 1;
  }

  private recordSeatMatrixCell(
    candidate: PolicyEvaluationCandidate,
    refId: string,
    cell: PolicyPreviewSeatMatrixCellTrace,
  ): void {
    const context = this.currentSeatMatrixContext;
    if (context === undefined || candidate.previewSeatMatrix === undefined) {
      return;
    }
    let refCells = candidate.previewSeatMatrix.get(refId);
    if (refCells === undefined) {
      refCells = new Map<string, PolicyPreviewSeatMatrixCellTrace>();
      candidate.previewSeatMatrix.set(refId, refCells);
    }
    refCells.set(context.seatId, cell);
  }

  private unknownLookupRefCount(candidate: PolicyEvaluationCandidate | undefined): number {
    return candidate?.unknownLookupRefs.size
      ?? this.input.lookupOption?.unknownLookupRefs?.size
      ?? 0;
  }

  private recordPreviewFallbackFired(
    candidate: PolicyEvaluationCandidate | undefined,
    fired: PolicyPreviewFallbackFired,
  ): void {
    if (candidate !== undefined) {
      candidate.previewFallbackFired = fired;
    }
    if (this.input.previewOption?.previewFallbackFired !== undefined) {
      this.input.previewOption.previewFallbackFired.current = fired;
    }
  }

  private recordLookupFallbackFired(
    candidate: PolicyEvaluationCandidate | undefined,
    fired: PolicyLookupFallbackFired,
  ): void {
    if (candidate !== undefined) {
      candidate.lookupFallbackFired = fired;
    }
    if (this.input.lookupOption?.lookupFallbackFired !== undefined) {
      this.input.lookupOption.lookupFallbackFired.current = fired;
    }
  }

  private recordScheduleFallbackFired(
    candidate: PolicyEvaluationCandidate | undefined,
    fired: PolicyScheduleFallbackFired,
  ): void {
    if (candidate !== undefined) {
      candidate.scheduleFallbackFired = fired;
    }
    if (this.input.scheduleOption?.scheduleFallbackFired !== undefined) {
      this.input.scheduleOption.scheduleFallbackFired.current = fired;
    }
  }

  private recordScheduleInputRef(
    candidate: PolicyEvaluationCandidate | undefined,
    refId: string,
    trace: PolicyScheduleInputRefTrace,
  ): void {
    if (candidate !== undefined) {
      const refs = candidate.scheduleInputRefs ?? new Map<string, PolicyScheduleInputRefTrace>();
      refs.set(refId, trace);
      candidate.scheduleInputRefs = refs;
    }
    if (this.input.scheduleOption?.scheduleInputRefs !== undefined) {
      const refs = this.input.scheduleOption.scheduleInputRefs.current ?? new Map<string, PolicyScheduleInputRefTrace>();
      refs.set(refId, trace);
      this.input.scheduleOption.scheduleInputRefs.current = refs;
    }
  }

  private recordSchedulePartialFallbackApplied(
    candidate: PolicyEvaluationCandidate | undefined,
    partials: readonly { readonly refId: string }[],
    kind: PolicyScheduleFallbackKind,
    numericValue?: number,
  ): void {
    const applyTo = (refs: Map<string, PolicyScheduleInputRefTrace>): void => {
      for (const partial of partials) {
        const existing = refs.get(partial.refId);
        if (existing?.status !== 'partial') {
          continue;
        }
        refs.set(partial.refId, {
          ...existing,
          fallbackApplied: {
            kind,
            ...(numericValue === undefined ? {} : { numericValue }),
          },
        });
      }
    };
    if (candidate?.scheduleInputRefs !== undefined) {
      applyTo(candidate.scheduleInputRefs);
    }
    const inputRefs = this.input.scheduleOption?.scheduleInputRefs?.current;
    if (inputRefs !== undefined) {
      applyTo(inputRefs);
    }
  }

  private recordCandidateParamFallbackFired(
    candidate: PolicyEvaluationCandidate | undefined,
    considerationId: string,
  ): void {
    if (candidate !== undefined) {
      const fired = candidate.candidateParamFallbackFired ?? new Map<string, number>();
      fired.set(considerationId, (fired.get(considerationId) ?? 0) + 1);
      candidate.candidateParamFallbackFired = fired;
    }
    if (this.input.candidateParamOption?.candidateParamFallbackFired !== undefined) {
      const fired = this.input.candidateParamOption.candidateParamFallbackFired.current ?? new Map<string, number>();
      fired.set(considerationId, (fired.get(considerationId) ?? 0) + 1);
      this.input.candidateParamOption.candidateParamFallbackFired.current = fired;
    }
  }

  getActionEffectFootprint(actionId: string): import('../kernel/types.js').EffectFootprint | undefined {
    const action = this.input.def.actions.find((entry) => String(entry.id) === actionId);
    if (action === undefined) {
      return undefined;
    }
    return unionFootprints([
      ...action.cost.map((effect) => effect.footprint ?? computeEffectFootprint(effect)),
      ...action.effects.map((effect) => effect.footprint ?? computeEffectFootprint(effect)),
    ]);
  }

  evaluateCompiledExpr(expr: CompiledPolicyExpr, candidate: PolicyEvaluationCandidate | undefined): PolicyValue {
    return this.evaluateCompiledExprWithVm(expr, candidate);
  }

  private evaluateCompiledExprWithVm(expr: CompiledPolicyExpr, candidate: PolicyEvaluationCandidate | undefined): PolicyValue {
    if (this.encodedState === undefined || this.requiresDirectLiteralSemantics(expr)) {
      return this.evaluateCompiledExprDirect(expr, candidate);
    }
    const bytecodeCache = this.resolvePolicyBytecodeCache();
    let bytecode = bytecodeCache.get(expr);
    if (bytecode === undefined) {
      bytecode = compilePolicyBytecode(expr, this.input.def, this.encodedStateLayout);
      bytecodeCache.set(expr, bytecode);
    }
    const candidateIndex = candidate === undefined ? undefined : this.currentCandidates.indexOf(candidate);
    const vmContext: VMContext = {
      def: this.input.def,
      layout: this.encodedStateLayout,
      state: this.input.state,
      ...(candidate === undefined ? {} : { candidateIndex: candidateIndex === undefined || candidateIndex < 0 ? 0 : candidateIndex }),
      legalMoves: candidate === undefined || candidateIndex === undefined || candidateIndex >= 0
        ? this.currentCandidates.map((entry) => entry.move)
        : [candidate.move],
      playerId: Number(this.input.playerId),
      seatId: this.input.seatId,
      resolveFeature: (ref) => this.resolveVmFallbackFeature(ref, expr, candidate),
      resolveRef: (refId) => this.resolveVmRef(refId),
      resolveDynamic: () => {
        return this.evaluateCompiledExprDirect(expr, candidate);
      },
    };
    try {
      const result = executeBytecode(bytecode, this.encodedState, vmContext);
      return result.value;
    } catch (error) {
      if (error instanceof PolicyBytecodeVmUnsupportedError) {
        return this.evaluateCompiledExprDirect(expr, candidate);
      }
      throw error;
    }
  }

  private resolvePolicyBytecodeCache(): WeakMap<CompiledPolicyExpr, PolicyBytecode> {
    if (this.input.runtime !== undefined && this.usesCanonicalEncodedStateLayout) {
      return this.input.runtime.policyBytecodeCache;
    }
    return this.fallbackPolicyBytecodeCache;
  }

  private resolveEncodedState(state: GameState): EncodedState | undefined {
    if (this.input.runtime !== undefined && this.usesCanonicalEncodedStateLayout) {
      return resolvePolicyEncodedState(this.input.runtime, state, this.encodedStateLayout, tryBuildEncodedState);
    }
    return tryBuildEncodedState(state, this.encodedStateLayout);
  }

  private evaluateCompiledExprDirect(expr: CompiledPolicyExpr, candidate: PolicyEvaluationCandidate | undefined): PolicyValue {
    switch (expr.kind) {
      case 'literal':
        return expr.value === null ? undefined : expr.value;
      case 'param':
        return this.resolveCompiledPolicyParam(expr.id);
      case 'ref':
        return this.resolveCompiledPolicyRef(expr.ref, candidate);
      case 'op':
        return this.evaluateCompiledOpDirect(expr, candidate);
      case 'zoneProp':
        return this.evaluateCompiledZoneProp(expr.zone, expr.prop, candidate);
      case 'zoneTokenAgg':
        return this.evaluateCompiledZoneTokenAggregate(expr, candidate);
      case 'globalTokenAgg':
        return this.evaluateCompiledGlobalTokenAggregate(expr);
      case 'globalZoneAgg':
        return this.evaluateCompiledGlobalZoneAggregate(expr);
      case 'adjacentTokenAgg':
        return this.evaluateCompiledAdjacentTokenAggregate(expr, candidate);
      case 'seatAgg':
        return this.evaluateCompiledSeatAggregate(
          expr.over,
          expr.aggOp,
          expr.availability ?? 'skipUnavailable',
          (seatCandidate) => this.evaluateCompiledExprDirect(expr.expr, seatCandidate),
          candidate,
        );
    }
  }

  private requiresDirectLiteralSemantics(expr: CompiledPolicyExpr): boolean {
    const visit = (current: CompiledPolicyExpr | CompiledPolicyZoneSource | undefined): boolean => {
      if (current === undefined || typeof current === 'string') {
        return false;
      }
      switch (current.kind) {
        case 'literal':
          return typeof current.value !== 'number';
        case 'op':
          return current.args.some(visit);
        case 'zoneTokenAgg':
          return visit(current.zone);
        case 'adjacentTokenAgg':
          return true;
        case 'seatAgg':
          return true;
        case 'zoneProp':
          return true;
        case 'ref':
          return current.ref.kind === 'previewSurface'
            || current.ref.kind === 'candidateTag'
            || current.ref.kind === 'selector'
            || this.isTopNVisibleScheduleDistanceRef(current.ref);
        case 'globalTokenAgg':
          return current.tokenFilter !== undefined || current.zoneFilter !== undefined;
        case 'globalZoneAgg':
          return current.zoneFilter !== undefined;
        case 'param':
          return false;
      }
    };
    return visit(expr);
  }

  private evaluateCompiledOpDirect(
    expr: Extract<CompiledPolicyExpr, { readonly kind: 'op' }>,
    candidate: PolicyEvaluationCandidate | undefined,
  ): PolicyValue {
    const values = expr.args.map((arg) => this.evaluateCompiledExprDirect(arg, candidate));
    const first = values[0];
    switch (expr.op) {
      case 'add':
        return values.every((value): value is number => typeof value === 'number')
          ? values.reduce((sum, value) => sum + value, 0)
          : undefined;
      case 'mul':
        return values.every((value): value is number => typeof value === 'number')
          ? values.reduce((product, value) => product * value, 1)
          : undefined;
      case 'sub':
      case 'div': {
        if (values.length !== 2 || typeof values[0] !== 'number' || typeof values[1] !== 'number') {
          return undefined;
        }
        if (expr.op === 'sub') return values[0] - values[1];
        if (values[1] === 0) {
          throw this.runtimeError('RUNTIME_EVALUATION_ERROR', 'Policy expression division evaluated with a zero denominator.');
        }
        return Math.trunc(values[0] / values[1]);
      }
      case 'min':
      case 'max': {
        const numericValues = values.filter((value): value is number => typeof value === 'number');
        if (numericValues.length !== values.length || numericValues.length === 0) return undefined;
        return expr.op === 'min' ? Math.min(...numericValues) : Math.max(...numericValues);
      }
      case 'abs':
        return typeof first === 'number' ? Math.abs(first) : undefined;
      case 'neg':
        return typeof first === 'number' ? -first : undefined;
      case 'eq':
        return values.length === 2 && values[0] !== undefined && values[1] !== undefined ? values[0] === values[1] : undefined;
      case 'ne':
        return values.length === 2 && values[0] !== undefined && values[1] !== undefined ? values[0] !== values[1] : undefined;
      case 'lt':
      case 'lte':
      case 'gt':
      case 'gte':
        if (values.length !== 2 || typeof values[0] !== 'number' || typeof values[1] !== 'number') return undefined;
        if (expr.op === 'lt') return values[0] < values[1];
        if (expr.op === 'lte') return values[0] <= values[1];
        if (expr.op === 'gt') return values[0] > values[1];
        return values[0] >= values[1];
      case 'and':
        return values.includes(false) ? false : values.every((value) => value === true) ? true : undefined;
      case 'or':
        return values.includes(true) ? true : values.every((value) => value === false) ? false : undefined;
      case 'not':
        return typeof first === 'boolean' ? !first : undefined;
      case 'if':
        return values.length === 3 && typeof values[0] === 'boolean' ? (values[0] ? values[1] : values[2]) : undefined;
      case 'in':
        return values.length === 2 && values[0] !== undefined && Array.isArray(values[1])
          ? values[1].includes(String(values[0]))
          : undefined;
      case 'coalesce':
        return values.find((value) => value !== undefined);
      case 'clamp':
        if (values.length !== 3 || typeof values[0] !== 'number') return undefined;
        return Math.min(Math.max(values[0], typeof values[1] === 'number' ? values[1] : values[0]), typeof values[2] === 'number' ? values[2] : values[0]);
      case 'boolToNumber':
        return typeof first === 'boolean' ? (first ? 1 : 0) : undefined;
    }
  }

  private resolveVmRef(refId: number): PolicyValue {
    for (const [id, value] of Object.entries(this.input.parameterValues)) {
      if (stablePayloadCode({ kind: 'param', id }) === refId) {
        return value;
      }
    }
    return undefined;
  }

  private resolveVmFallbackFeature(
    ref: FeatureRef,
    expr: CompiledPolicyExpr,
    candidate: PolicyEvaluationCandidate | undefined,
  ): PolicyValue {
    switch (ref.kind) {
      case 'dynamicSurface': {
        const surfaceRef = this.findDynamicSurfaceRef(expr, ref);
        if (surfaceRef !== undefined) {
          return this.resolveSurfaceRef(surfaceRef, candidate);
        }
        break;
      }
      case 'dynamicRef': {
        const agentRef = this.findDynamicAgentRef(expr, ref.aux[0]);
        if (agentRef !== undefined) {
          return this.toVmStackValue(this.resolveAgentPolicyRef(agentRef, candidate));
        }
        break;
      }
      case 'dynamicExpr': {
        const dynamicExpr = this.findDynamicExpr(expr, ref.aux[0]);
        if (dynamicExpr !== undefined) {
          return this.evaluateCompiledExprDirect(dynamicExpr, candidate);
        }
        break;
      }
      case 'candidateTags':
        return candidate === undefined ? undefined : this.input.def.actionTagIndex?.byAction[candidate.actionId] ?? [];
      case 'phaseIntrinsic':
      case 'scheduleDistance': {
        const agentRef = this.findPhaseScheduleAgentRef(expr, ref);
        if (agentRef !== undefined) {
          return this.toVmStackValue(this.resolveAgentPolicyRef(agentRef, candidate));
        }
        break;
      }
      case 'adjacentTokenAgg':
      case 'seatAgg':
        throw new PolicyBytecodeVmUnsupportedError(`Policy bytecode feature "${ref.kind}" is not supported by the default bytecode evaluator.`);
      default:
        throw new PolicyBytecodeVmUnsupportedError(
          `Policy bytecode feature kind "${(ref as { kind: string }).kind}" has no handler in resolveVmFallbackFeature; falling back to direct evaluator.`,
        );
    }
    throw new PolicyBytecodeVmUnsupportedError(`Policy bytecode feature "${ref.kind}" could not be resolved by the default bytecode evaluator.`);
  }

  private findPhaseScheduleAgentRef(expr: CompiledPolicyExpr, ref: FeatureRef): CompiledAgentPolicyRef | undefined {
    return this.collectAgentPolicyRefs(expr).find((candidateRef) => {
      if (ref.kind === 'phaseIntrinsic' && candidateRef.kind === 'phaseIntrinsic') {
        return (candidateRef.name === 'current.id' ? 0 : candidateRef.name === 'next.id' ? 1 : stableStringCode(candidateRef.name)) === ref.aux[0];
      }
      if (ref.kind !== 'scheduleDistance' || candidateRef.kind !== 'scheduleDistance') {
        return false;
      }
      const targetCode = candidateRef.target.kind === 'nextBoundary' ? 0 : 1;
      const boundaryCode = candidateRef.target.kind === 'boundary' ? stableStringCode(candidateRef.target.boundaryId) : 0;
      const unitCode = candidateRef.unit === undefined
        ? -1
        : candidateRef.unit === 'cards'
          ? 0
          : candidateRef.unit === 'microturns'
            ? 1
            : candidateRef.unit === 'actions'
              ? 2
              : candidateRef.unit === 'turns'
                ? 3
                : 4;
      return targetCode === ref.aux[0] && boundaryCode === ref.aux[1] && unitCode === ref.aux[2];
    });
  }

  private isTopNVisibleScheduleDistanceRef(ref: CompiledAgentPolicyRef): boolean {
    if (ref.kind !== 'scheduleDistance' || ref.target.kind !== 'boundary') {
      return false;
    }
    const boundaryId = ref.target.boundaryId;
    const boundary = this.input.def.phaseBoundaries?.find((entry) => String(entry.id) === String(boundaryId));
    return boundary?.schedule?.kind === 'cardDraw' && boundary.schedule.observerPolicy?.kind === 'topNVisible';
  }

  private toVmStackValue(value: PolicyValue): PolicyValue {
    if (typeof value === 'string') {
      return stablePayloadCode({ literal: value });
    }
    return value;
  }

  private findDynamicSurfaceRef(expr: CompiledPolicyExpr, ref: FeatureRef): CompiledSurfaceRef | undefined {
    const scope = ref.aux[0];
    const payloadCode = ref.aux[1];
    if (payloadCode === undefined) {
      return undefined;
    }
    const expectedKind = scope === CURRENT_SURFACE_SCOPE
      ? 'currentSurface'
      : scope === PREVIEW_SURFACE_SCOPE
        ? 'previewSurface'
        : undefined;
    if (expectedKind === undefined) {
      return undefined;
    }
    for (const candidateRef of this.collectAgentPolicyRefs(expr)) {
      if (candidateRef.kind !== expectedKind) {
        continue;
      }
      if (stablePayloadCode({
        family: candidateRef.family,
        id: candidateRef.id,
        selector: candidateRef.selector,
      }) === payloadCode) {
        return candidateRef;
      }
    }
    return undefined;
  }

  private findDynamicAgentRef(expr: CompiledPolicyExpr, payloadCode: number | undefined): CompiledAgentPolicyRef | undefined {
    if (payloadCode === undefined) {
      return undefined;
    }
    return this.collectAgentPolicyRefs(expr).find((ref) => stablePayloadCode(ref) === payloadCode);
  }

  private findDynamicExpr(expr: CompiledPolicyExpr, payloadCode: number | undefined): CompiledPolicyExpr | undefined {
    if (payloadCode === undefined) {
      return undefined;
    }
    return this.collectCompiledPolicyExprs(expr).find((candidate) => stablePayloadCode(candidate) === payloadCode);
  }

  private collectCompiledPolicyExprs(expr: CompiledPolicyExpr): readonly CompiledPolicyExpr[] {
    const exprs: CompiledPolicyExpr[] = [];
    const visit = (current: CompiledPolicyExpr | CompiledPolicyZoneSource | undefined): void => {
      if (current === undefined || typeof current === 'string') {
        return;
      }
      exprs.push(current);
      switch (current.kind) {
        case 'op':
          current.args.forEach(visit);
          return;
        case 'zoneTokenAgg':
          visit(current.zone);
          return;
        case 'adjacentTokenAgg':
          visit(current.anchorZone);
          return;
        case 'seatAgg':
          visit(current.expr);
          return;
        case 'zoneProp':
          visit(current.zone);
          return;
        case 'literal':
        case 'param':
        case 'ref':
        case 'globalTokenAgg':
        case 'globalZoneAgg':
          return;
      }
    };
    visit(expr);
    return exprs;
  }

  private collectAgentPolicyRefs(expr: CompiledPolicyExpr): readonly CompiledAgentPolicyRef[] {
    const refs: CompiledAgentPolicyRef[] = [];
    const visit = (current: CompiledPolicyExpr | CompiledPolicyZoneSource | undefined): void => {
      if (current === undefined || typeof current === 'string') {
        return;
      }
      switch (current.kind) {
        case 'ref':
          refs.push(current.ref);
          return;
        case 'op':
          current.args.forEach(visit);
          return;
        case 'zoneTokenAgg':
          visit(current.zone);
          return;
        case 'adjacentTokenAgg':
          visit(current.anchorZone);
          return;
        case 'seatAgg':
          visit(current.expr);
          return;
        case 'zoneProp':
          visit(current.zone);
          return;
        case 'literal':
        case 'param':
        case 'globalTokenAgg':
        case 'globalZoneAgg':
          return;
      }
    };
    visit(expr);
    return refs;
  }

  resolveCompiledPolicyParam(id: string): PolicyValue {
    return this.input.parameterValues[id];
  }

  resolveCompiledPolicyRef(ref: CompiledAgentPolicyRef, candidate: PolicyEvaluationCandidate | undefined): PolicyValue {
    return this.resolveAgentPolicyRef(ref, candidate);
  }

  evaluateCompiledZoneProp(
    zone: CompiledPolicyZoneSource,
    prop: string,
    candidate: PolicyEvaluationCandidate | undefined,
  ): PolicyValue {
    const zoneId = this.resolveCompiledPolicyZoneId(zone, 'none', candidate);
    if (zoneId === undefined) {
      return undefined;
    }
    const zoneDef = this.input.def.zones.find((entry) => entry.id === zoneId);
    if (zoneDef === undefined) {
      return undefined;
    }
    if (prop === 'id') {
      return zoneDef.id;
    }
    if (prop === 'category') {
      return zoneDef.category;
    }
    return scalarZonePropValue(zoneDef.attributes?.[prop]);
  }

  evaluateCompiledZoneTokenAggregate(
    expr: Extract<CompiledPolicyExpr, { readonly kind: 'zoneTokenAgg' }>,
    candidate: PolicyEvaluationCandidate | undefined,
  ): PolicyValue {
    const currentState = this.activeState;
    const resolvedOwner = resolveZoneTokenAggOwner(expr.owner, this.input, currentState);
    if (resolvedOwner === undefined) {
      return undefined;
    }
    const zoneId = this.resolveCompiledPolicyZoneId(expr.zone, resolvedOwner, candidate);
    if (zoneId === undefined) {
      return undefined;
    }
    const encodedResult = this.evaluateEncodedZoneTokenAggregate([String(zoneId)], expr, undefined, true);
    if (encodedResult !== undefined) {
      return encodedResult.value;
    }
    const tokens = currentState.zones[zoneId];
    if (tokens === undefined || tokens.length === 0) {
      return expr.aggOp === 'count' ? 0 : expr.aggOp === 'sum' ? 0 : undefined;
    }
    const values: number[] = [];
    for (const token of tokens) {
      const value = token.props[expr.prop];
      if (typeof value === 'number') {
        values.push(value);
      }
    }
    if (values.length === 0) {
      return expr.aggOp === 'count' || expr.aggOp === 'sum' ? 0 : undefined;
    }
    switch (expr.aggOp) {
      case 'sum':
        return values.reduce((acc, value) => acc + value, 0);
      case 'count':
        return values.length;
      case 'min':
        return Math.min(...values);
      case 'max':
        return Math.max(...values);
    }
  }

  evaluateCompiledGlobalTokenAggregate(
    expr: Extract<CompiledPolicyExpr, { readonly kind: 'globalTokenAgg' }>,
  ): PolicyValue {
    const currentState = this.activeState;
    const seatIds = this.input.def.seats?.map((seat) => seat.id);
    const resolvedFilter = resolveTokenFilter(expr.tokenFilter, this.input.playerId, currentState, seatIds);
    const zoneIds: string[] = [];

    for (const zoneDef of this.input.def.zones) {
      if (!matchesZoneScope(zoneDef, expr.zoneScope)) {
        continue;
      }
      if (!matchesZoneFilter(zoneDef, expr.zoneFilter, currentState)) {
        continue;
      }
      zoneIds.push(String(zoneDef.id));
    }

    return this.aggregateTokensAcrossZones(zoneIds, expr, resolvedFilter);
  }

  evaluateCompiledGlobalZoneAggregate(
    expr: Extract<CompiledPolicyExpr, { readonly kind: 'globalZoneAgg' }>,
  ): PolicyValue {
    return this.evaluateGlobalZoneAggregate(expr);
  }

  evaluateCompiledAdjacentTokenAggregate(
    expr: Extract<CompiledPolicyExpr, { readonly kind: 'adjacentTokenAgg' }>,
    candidate: PolicyEvaluationCandidate | undefined,
  ): PolicyValue {
    const currentState = this.activeState;
    const anchorZoneId = this.resolveCompiledPolicyZoneId(expr.anchorZone, 'none', candidate);
    if (anchorZoneId === undefined) {
      return undefined;
    }
    const adjacencyGraph = this.input.runtime?.adjacencyGraph ?? buildAdjacencyGraph(this.input.def.zones);
    const adjacentZoneIds = queryAdjacentZones(adjacencyGraph, anchorZoneId);
    const seatIds = this.input.def.seats?.map((seat) => seat.id);
    const resolvedFilter = resolveTokenFilter(expr.tokenFilter, this.input.playerId, currentState, seatIds);
    return this.aggregateTokensAcrossZones(adjacentZoneIds, expr, resolvedFilter);
  }

  evaluateCompiledSeatAggregate(
    over: Extract<CompiledPolicyExpr, { readonly kind: 'seatAgg' }>['over'],
    aggOp: AgentPolicyZoneTokenAggOp, availability: NonNullable<Extract<CompiledPolicyExpr, { readonly kind: 'seatAgg' }>['availability']>,
    inner: (candidate: PolicyEvaluationCandidate | undefined) => PolicyValue,
    candidate: PolicyEvaluationCandidate | undefined,
  ): PolicyValue {
    const seatIds = this.resolveSeatAggregateSeatIds(over);
    if (seatIds === undefined || seatIds.length === 0) return seatIds === undefined ? undefined : aggOp === 'count' || aggOp === 'sum' ? 0 : undefined;

    const previewUnavailableEventsBefore = this.previewUnavailableEventCount;
    const values: number[] = []; let anySeatUnavailable = false;
    const evaluateForSeat = (seatId: string, collectValue: boolean): void => {
      const previousSeatContext = this.currentSeatContext;
      const previousSeatMatrixContext = this.currentSeatMatrixContext;
      const seatPreviewUnavailableEventsBefore = this.previewUnavailableEventCount;
      this.currentSeatContext = seatId;
      if (candidate !== undefined) {
        candidate.previewSeatMatrix ??= new Map();
        this.currentSeatMatrixContext = { seatId };
      }
      try {
        const value = inner(candidate);
        anySeatUnavailable ||= this.previewUnavailableEventCount > seatPreviewUnavailableEventsBefore;
        if (collectValue && typeof value === 'number') values.push(value);
      } finally {
        this.currentSeatContext = previousSeatContext;
        this.currentSeatMatrixContext = previousSeatMatrixContext;
      }
    };

    if (availability === 'selfAndTargetReady' && !seatIds.includes(this.input.seatId)) evaluateForSeat(this.input.seatId, false);
    for (const seatId of seatIds) evaluateForSeat(seatId, true);
    if ((availability === 'requireAllReady' || availability === 'selfAndTargetReady') && anySeatUnavailable) return undefined;
    if (aggOp === 'count') {
      return values.length;
    }
    if (values.length === 0) {
      return aggOp === 'sum' && this.previewUnavailableEventCount === previewUnavailableEventsBefore ? 0 : undefined;
    }
    switch (aggOp) {
      case 'sum':
        return values.reduce((acc, value) => acc + value, 0);
      case 'min':
        return Math.min(...values);
      case 'max':
        return Math.max(...values);
    }
  }

  createCompiledPolicyRuntimeError(
    code: string,
    message: string,
    detail?: Readonly<Record<string, unknown>>,
  ): PolicyRuntimeError {
    return this.runtimeError(code, message, detail);
  }

  private evaluateGlobalZoneAggregate(
    expr: Extract<CompiledPolicyExpr, { readonly kind: 'globalZoneAgg' }>,
  ): PolicyValue {
    const currentState = this.activeState;
    let count = 0;
    let aggregate: number | undefined;

    for (const zoneDef of this.input.def.zones) {
      if (!matchesZoneScope(zoneDef, expr.zoneScope)) {
        continue;
      }
      if (!matchesZoneFilter(zoneDef, expr.zoneFilter, currentState)) {
        continue;
      }

      if (expr.aggOp === 'count') {
        count += 1;
        continue;
      }

      const rawValue = expr.source === 'variable'
        ? this.resolveEncodedZoneVariable(String(zoneDef.id), expr.field) ?? currentState.zoneVars[String(zoneDef.id)]?.[expr.field]
        : scalarZonePropValue(zoneDef.attributes?.[expr.field]);
      if (typeof rawValue !== 'number') {
        continue;
      }

      if (aggregate === undefined) {
        aggregate = rawValue;
        continue;
      }

      if (expr.aggOp === 'sum') {
        aggregate += rawValue;
      } else if (expr.aggOp === 'min') {
        aggregate = Math.min(aggregate, rawValue);
      } else {
        aggregate = Math.max(aggregate, rawValue);
      }
    }

    if (expr.aggOp === 'count') {
      return count;
    }
    if (expr.aggOp === 'sum') {
      return aggregate ?? 0;
    }
    return aggregate;
  }
  private resolveSeatAggregateSeatIds(
    over: Extract<CompiledPolicyExpr, { readonly kind: 'seatAgg' }>['over'],
  ): readonly string[] | undefined {
    const seatIds = this.input.def.seats?.map((seat) => seat.id);
    if (seatIds === undefined) {
      return undefined;
    }
    if (over === 'all') {
      return seatIds;
    }
    if (over === 'opponents') {
      return seatIds.filter((seatId) => seatId !== this.input.seatId);
    }
    if ('role' in over) {
      if (this.input.catalog.surfaceVisibility.victory.currentMargin.current !== 'public') {
        return undefined;
      }
      const resolved = resolvePolicyStandingRoleSelector(this.input.def, this.activeState, over.role, this.input.seatId);
      return resolved === undefined ? undefined : [resolved];
    }
    return over;
  }
  private resolveAgentPolicyRef(ref: CompiledAgentPolicyRef, candidate: PolicyEvaluationCandidate | undefined): PolicyValue {
    switch (ref.kind) {
      case 'library':
        if (ref.refKind === 'aggregate') {
          return this.evaluateAggregate(ref.id);
        }
        if (ref.refKind === 'candidateFeature') {
          return candidate === undefined ? undefined : this.evaluateCandidateFeature(candidate, ref.id);
        }
        if (ref.refKind === 'previewStateFeature') {
          return this.resolvePreviewStateFeatureRef(ref.id, candidate);
        }
        return this.evaluateStateFeature(ref.id);
      case 'seatIntrinsic':
        return this.runtimeProviders.intrinsics.resolveSeatIntrinsic(ref.intrinsic, this.activeState);
      case 'turnIntrinsic':
        return this.runtimeProviders.intrinsics.resolveTurnIntrinsic(ref.intrinsic, this.activeState);
      case 'phaseIntrinsic': {
        const resolution = this.runtimeProviders.phaseSchedule.resolvePhaseIntrinsic(ref, this.activeState);
        return resolution.kind === 'ready' ? resolution.value : undefined;
      }
      case 'scheduleDistance': {
        const resolution = this.runtimeProviders.phaseSchedule.resolveScheduleDistance(ref, this.activeState);
        if (resolution.kind === 'ready') {
          if (resolution.observerPolicy?.kind === 'topNVisible') {
            this.recordScheduleInputRef(candidate, scheduleDistanceRefId(ref), {
              status: 'ready',
              value: resolution.value,
              observerPolicy: 'topNVisible',
              ...(resolution.visiblePrefixLength === undefined ? {} : { visiblePrefixLength: resolution.visiblePrefixLength }),
              ...(resolution.visibleSequenceSources === undefined
                ? {}
                : { visibleSequenceSources: resolution.visibleSequenceSources }),
            });
          }
          return resolution.value;
        }
        if (resolution.kind === 'partial') {
          const refId = scheduleDistanceRefId(ref);
          this.recordScheduleInputRef(candidate, refId, {
            status: 'partial',
            partialKind: resolution.partialKind,
            lowerBound: resolution.lowerBound,
            observerPolicy: 'topNVisible',
            visiblePrefixLength: resolution.visiblePrefixLength,
            visibleSequenceSources: resolution.visibleSequenceSources,
          });
          this.schedulePartialsDuringValue.push({ refId, lowerBound: resolution.lowerBound });
          return undefined;
        }
        this.scheduleUnavailableDuringValue = true;
        return undefined;
      }
      case 'candidateIntrinsic':
        return candidate === undefined ? undefined : this.runtimeProviders.candidates.resolveCandidateIntrinsic(candidate, ref.intrinsic);
      case 'candidateParam':
        return this.resolveCandidateParamRef(ref, candidate);
      case 'microturnIntrinsic':
        return this.runtimeProviders.completion?.resolveMicroturnIntrinsic(ref.intrinsic);
      case 'microturnOptionIntrinsic':
        return this.runtimeProviders.completion?.resolveMicroturnOptionIntrinsic(ref.intrinsic);
      case 'previewOptionRef':
        return this.resolvePreviewOptionRef(ref, candidate);
      case 'lookup':
        return this.resolveLookupRef(ref, candidate);
      case 'currentSurface':
      case 'previewSurface':
        return this.resolveSurfaceRef(ref, candidate);
      case 'strategicCondition':
        return this.resolveStrategicConditionRef(ref.conditionId, ref.field);
      case 'selector':
        return this.resolveSelectorRef(ref, candidate);
      case 'candidateTag': {
        if (candidate === undefined) return undefined;
        const tags = this.input.def.actionTagIndex?.byAction[candidate.actionId];
        return tags !== undefined && tags.includes(ref.tagName);
      }
      case 'candidateTags': {
        if (candidate === undefined) return undefined;
        return this.input.def.actionTagIndex?.byAction[candidate.actionId] ?? [];
      }
      case 'contextKind':
        return this.input.completion !== undefined ? 'microturn' : 'move';
    }
  }

  private resolveSelectorRef(
    ref: Extract<CompiledAgentPolicyRef, { readonly kind: 'selector' }>,
    candidate: PolicyEvaluationCandidate | undefined,
  ): PolicyValue {
    const view = this.evaluateSelectorView(ref.selectorId, candidate);
    const first = view.selected[0];
    const { field } = ref;
    if (field === 'selected.matches') return view.selected.length > 0;
    if (field === 'selected.key') return first?.key;
    if (field === 'selected.quality') return first?.quality ?? view.emptyPenalty;
    if (field === 'selected.rank') return first?.rank;
    if (field === 'impactSatisfied') return view.impactSatisfied;
    if (field === 'size') return view.selected.length;
    if (typeof field === 'object' && field.kind === 'selected.component') {
      return first?.components.get(field.componentId);
    }
    if (typeof field === 'object' && field.kind === 'candidate.quality') {
      return view.selected.find((item) => item.key === field.key)?.quality ?? view.emptyPenalty;
    }
    return undefined;
  }

  private evaluateSelectorView(
    selectorId: string,
    candidate: PolicyEvaluationCandidate | undefined,
  ): SelectedSelectorView {
    const selector = this.input.catalog.compiled.selectors?.[selectorId];
    if (selector === undefined) {
      throw this.runtimeError('RUNTIME_EVALUATION_ERROR', `Unknown selector "${selectorId}".`, { selectorId });
    }
    const cacheKey = `${selectorId}:${candidate?.stableMoveKey ?? '__state__'}:${this.input.previewOption === undefined ? 'current' : 'preview'}`;
    const cached = this.selectorCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }
    const view = evaluateSelector(selector, {
      def: this.input.def,
      state: this.activeState,
      candidates: this.currentCandidates,
      ...(candidate === undefined ? {} : { candidate }),
      evaluateExpr: (expr, itemCandidate) => this.evaluateCompiledExpr(expr, itemCandidate as PolicyEvaluationCandidate | undefined),
    });
    this.selectorCache.set(cacheKey, view);
    return view;
  }

  private resolveCandidateParamRef(
    ref: Extract<CompiledAgentPolicyRef, { readonly kind: 'candidateParam' }>,
    candidate: PolicyEvaluationCandidate | undefined,
  ): PolicyValue {
    if (candidate === undefined) {
      return undefined;
    }
    const resolution = this.runtimeProviders.candidates.resolveCandidateParam(candidate, ref);
    if (resolution.kind === 'ready' || resolution.kind === 'missingConstant') {
      return resolution.value;
    }
    const refId = candidateParamTraceRefId(ref.id);
    candidate.unknownCandidateParamRefs.set(refId, resolution.reason);
    this.input.candidateParamOption?.unknownCandidateParamRefs?.set(refId, resolution.reason);
    this.candidateParamUnavailableDuringValue = true;
    return undefined;
  }

  private resolveStrategicConditionRef(
    conditionId: string,
    field: 'satisfied' | 'proximity',
  ): PolicyValue {
    const cacheKey = `${conditionId}.${field}`;
    if (this.strategicConditionCache.has(cacheKey)) {
      return this.strategicConditionCache.get(cacheKey);
    }

    const condition = this.input.catalog.compiled.strategicConditions[conditionId];
    if (condition === undefined) {
      throw this.runtimeError(
        'RUNTIME_EVALUATION_ERROR',
        `Unknown strategic condition "${conditionId}".`,
        { conditionId },
      );
    }

    let value: PolicyValue;
    if (field === 'satisfied') {
      value = this.evaluateCompiledExpr(condition.target, undefined);
    } else {
      if (condition.proximity === undefined) {
        value = undefined;
      } else {
        const current = this.evaluateCompiledExpr(condition.proximity.current, undefined);
        if (typeof current !== 'number') {
          value = undefined;
        } else {
          value = Math.min(Math.max(current / condition.proximity.threshold, 0), 1);
        }
      }
    }

    this.strategicConditionCache.set(cacheKey, value);
    return value;
  }

  private resolvePreviewOptionRef(
    ref: Extract<CompiledAgentPolicyRef, { readonly kind: 'previewOptionRef' }>,
    candidate: PolicyEvaluationCandidate | undefined,
  ): PolicyValue {
    const resolvedRefs = this.input.previewOption?.resolvedRefs;
    if (resolvedRefs === undefined) {
      return undefined;
    }
    const key = previewOptionRefKey(ref);
    const status = resolvedRefs.get(key);
    if (status === undefined) {
      this.recordUnknownPreviewRef(candidate, key, 'noPreviewDecision');
      return undefined;
    }
    if (status.kind === 'unavailable') {
      this.recordUnknownPreviewRef(candidate, key, status.reason);
      return undefined;
    }
    return status.value;
  }

  private resolveLookupRef(
    ref: Extract<CompiledAgentPolicyRef, { readonly kind: 'lookup' }>,
    candidate: PolicyEvaluationCandidate | undefined,
  ): PolicyValue {
    const keyValue = this.evaluateCompiledExpr(ref.key, candidate);
    const refId = lookupRefKey(ref);
    if (ref.surface === 'previewOptionState') {
      return this.resolveProjectedLookupRef(ref, keyValue, refId, candidate);
    }
    const resolution = this.runtimeProviders.lookupSurface.resolveLookup(ref, keyValue, this.currentSeatContext);
    if (resolution.kind === 'unavailable') {
      candidate?.unknownLookupRefs.set(refId, resolution.reason);
      this.input.lookupOption?.unknownLookupRefs?.set(refId, resolution.reason);
      return undefined;
    }
    return resolution.value;
  }

  private resolveProjectedLookupRef(
    ref: Extract<CompiledAgentPolicyRef, { readonly kind: 'lookup' }>,
    keyValue: PolicyValue,
    refId: string,
    candidate: PolicyEvaluationCandidate | undefined,
  ): PolicyValue {
    const projected = this.input.previewOption?.projectedState;
    if (projected === undefined) {
      this.recordUnknownPreviewRef(candidate, refId, 'gated');
      return undefined;
    }
    if (projected.outcome !== 'ready') {
      const reason = previewOutcomeToUnavailabilityReason(projected.outcome);
      this.recordUnknownPreviewRef(candidate, refId, reason);
      return undefined;
    }
    if (projected.state === undefined) {
      this.recordUnknownPreviewRef(candidate, refId, 'failed');
      return undefined;
    }
    const resolution = this.runtimeProviders.lookupSurface.resolveLookupAgainstState({
      state: projected.state,
      provenance: {
        kind: 'previewOptionState',
        depth: projected.driveDepth,
        capClass: projected.capClass,
        completionPolicy: projected.completionPolicy,
      },
    }, ref, keyValue, this.currentSeatContext);
    if (resolution.kind === 'unavailable') {
      candidate?.unknownLookupRefs.set(refId, resolution.reason);
      this.input.lookupOption?.unknownLookupRefs?.set(refId, resolution.reason);
      return undefined;
    }
    return resolution.value;
  }

  private resolveCompiledPolicyZoneId(
    zoneExpr: CompiledPolicyZoneSource,
    owner: 'none' | PlayerId,
    candidate: PolicyEvaluationCandidate | undefined,
  ): ZoneId | undefined {
    const resolvedZone = typeof zoneExpr === 'string'
      ? zoneExpr
      : this.evaluateCompiledExprDirect(zoneExpr, candidate);
    if (typeof resolvedZone !== 'string' || resolvedZone.length === 0) {
      return undefined;
    }
    return resolveZoneRefWithOwnerFallback(resolvedZone, owner, this.getZoneReadContext());
  }

  private aggregateTokensAcrossZones(
    zoneIds: readonly string[],
    expr: { readonly aggOp: AgentPolicyZoneTokenAggOp; readonly prop?: string },
    resolvedFilter: ResolvedTokenFilter | undefined,
  ): PolicyValue {
    const encodedResult = this.evaluateEncodedZoneTokenAggregate(zoneIds, expr, resolvedFilter);
    if (encodedResult !== undefined) {
      return encodedResult.value;
    }
    const currentState = this.activeState;
    let count = 0;
    let aggregate: number | undefined;

    for (const zoneId of zoneIds) {
      const tokens = currentState.zones[zoneId] ?? [];
      for (const token of tokens) {
        if (!matchesTokenFilter(token, resolvedFilter)) {
          continue;
        }
        if (expr.aggOp === 'count') {
          count += 1;
          continue;
        }
        if (expr.prop === undefined) {
          return undefined;
        }
        const value = token.props[expr.prop];
        if (typeof value !== 'number') {
          continue;
        }
        if (aggregate === undefined) {
          aggregate = value;
          continue;
        }
        if (expr.aggOp === 'sum') {
          aggregate += value;
        } else if (expr.aggOp === 'min') {
          aggregate = Math.min(aggregate, value);
        } else {
          aggregate = Math.max(aggregate, value);
        }
      }
    }

    if (expr.aggOp === 'count') {
      return count;
    }
    if (expr.aggOp === 'sum') {
      return aggregate ?? 0;
    }
    return aggregate;
  }

  private getRootEncodedView(): { readonly layout: EncodedStateLayout; readonly encoded: EncodedState } | undefined {
    if (this.activeState !== this.input.state || this.encodedState === undefined) {
      return undefined;
    }
    return { layout: this.encodedStateLayout, encoded: this.encodedState };
  }

  private resolveEncodedZoneVariable(zoneId: string, variableId: string): number | undefined {
    const view = this.getRootEncodedView();
    if (view === undefined || this.encodedZoneIndexById === undefined) {
      return undefined;
    }
    const zoneIndex = this.encodedZoneIndexById.get(zoneId);
    const variableIndex = view.layout.varLayout.zoneVariableIds.indexOf(variableId);
    if (zoneIndex === undefined || variableIndex < 0) {
      return undefined;
    }
    return view.encoded.zoneInts[zoneIndex * view.layout.varLayout.zoneVariableIds.length + variableIndex];
  }

  private evaluateEncodedZoneTokenAggregate(
    zoneIds: readonly string[],
    expr: { readonly aggOp: AgentPolicyZoneTokenAggOp; readonly prop?: string },
    resolvedFilter: ResolvedTokenFilter | undefined,
    countRequiresNumericProp = false,
  ): { readonly value: PolicyValue } | undefined {
    const view = this.getRootEncodedView();
    if (view === undefined || this.encodedZoneIndexById === undefined) {
      return undefined;
    }
    const selectedZoneIndexes = new Set<number>();
    for (const zoneId of zoneIds) {
      const zoneIndex = this.encodedZoneIndexById.get(zoneId);
      if (zoneIndex !== undefined) {
        selectedZoneIndexes.add(zoneIndex);
      }
    }
    if (selectedZoneIndexes.size === 0) {
      return { value: expr.aggOp === 'count' || expr.aggOp === 'sum' ? 0 : undefined };
    }

    let count = 0;
    let aggregate: number | undefined;
    for (let tokenIndex = 0; tokenIndex < view.encoded.tokenIds.length; tokenIndex += 1) {
      const occurrenceCount = view.encoded.tokenOccurrenceCount[tokenIndex] ?? 0;
      if (occurrenceCount <= 0 || !this.encodedTokenMatchesFilter(view, tokenIndex, resolvedFilter)) {
        continue;
      }
      const matchingOccurrences = this.countEncodedTokenOccurrencesInZones(view.encoded, tokenIndex, selectedZoneIndexes);
      if (matchingOccurrences === 0) {
        continue;
      }
      if (expr.aggOp === 'count') {
        if (countRequiresNumericProp) {
          const value = expr.prop === undefined
            ? undefined
            : this.resolveEncodedTokenNumericProp(view, tokenIndex, expr.prop);
          if (value === undefined) {
            continue;
          }
        }
        count += matchingOccurrences;
        continue;
      }
      if (expr.prop === undefined) {
        return { value: undefined };
      }
      const value = this.resolveEncodedTokenNumericProp(view, tokenIndex, expr.prop);
      if (value === undefined) {
        continue;
      }
      for (let occurrence = 0; occurrence < matchingOccurrences; occurrence += 1) {
        if (aggregate === undefined) {
          aggregate = value;
        } else if (expr.aggOp === 'sum') {
          aggregate += value;
        } else if (expr.aggOp === 'min') {
          aggregate = Math.min(aggregate, value);
        } else {
          aggregate = Math.max(aggregate, value);
        }
      }
    }

    if (expr.aggOp === 'count') {
      return { value: count };
    }
    if (expr.aggOp === 'sum') {
      return { value: aggregate ?? 0 };
    }
    return { value: aggregate };
  }

  private countEncodedTokenOccurrencesInZones(
    encoded: EncodedState,
    tokenIndex: number,
    selectedZoneIndexes: ReadonlySet<number>,
  ): number {
    const occurrenceCount = encoded.tokenOccurrenceCount[tokenIndex] ?? 0;
    if (occurrenceCount <= 1) {
      const zoneIndex = encoded.tokenZone[tokenIndex];
      return zoneIndex !== undefined && selectedZoneIndexes.has(zoneIndex) ? 1 : 0;
    }
    const offset = encoded.tokenOccurrenceOffset[tokenIndex];
    if (offset === undefined || offset < 0) {
      return 0;
    }
    let count = 0;
    for (let index = 0; index < occurrenceCount; index += 1) {
      const zoneIndex = encoded.tokenOccurrenceZones[offset + index];
      if (zoneIndex !== undefined && selectedZoneIndexes.has(zoneIndex)) {
        count += 1;
      }
    }
    return count;
  }

  private encodedTokenMatchesFilter(
    view: { readonly layout: EncodedStateLayout; readonly encoded: EncodedState },
    tokenIndex: number,
    filter: ResolvedTokenFilter | undefined,
  ): boolean {
    if (filter === undefined) {
      return true;
    }
    const tokenType = view.encoded.tokenTypeByIndex[tokenIndex];
    if (filter.type !== undefined && tokenType !== filter.type) {
      return false;
    }
    if (filter.props === undefined) {
      return true;
    }
    return Object.entries(filter.props).every(([propId, comparison]) =>
      this.encodedTokenPropEquals(view, tokenIndex, propId, comparison.eq),
    );
  }

  private encodedTokenPropEquals(
    view: { readonly layout: EncodedStateLayout; readonly encoded: EncodedState },
    tokenIndex: number,
    propId: string,
    expected: string | number | boolean,
  ): boolean {
    const propIndex = view.layout.tokenLayout.scalarPropIndexById[propId];
    if (propIndex === undefined) {
      return false;
    }
    const offset = tokenIndex * view.layout.tokenLayout.scalarPropIds.length + propIndex;
    if (view.encoded.tokenScalarPropPresent[offset] !== 1) {
      return false;
    }
    const encodedValue = view.encoded.tokenScalarPropValues[offset];
    if (typeof expected === 'number') {
      return encodedValue === expected;
    }
    if (typeof expected === 'boolean') {
      return encodedValue === (expected ? 1 : 0);
    }
    const expectedIndex = view.encoded.tokenScalarStringValuesByProp[propId]?.indexOf(expected);
    return expectedIndex !== undefined && expectedIndex >= 0 && encodedValue === expectedIndex;
  }

  private resolveEncodedTokenNumericProp(
    view: { readonly layout: EncodedStateLayout; readonly encoded: EncodedState },
    tokenIndex: number,
    propId: string,
  ): number | undefined {
    const propIndex = view.layout.tokenLayout.scalarPropIndexById[propId];
    if (propIndex === undefined) {
      return undefined;
    }
    const offset = tokenIndex * view.layout.tokenLayout.scalarPropIds.length + propIndex;
    if (view.encoded.tokenScalarPropPresent[offset] !== 1) {
      return undefined;
    }
    const propType = view.layout.tokenLayout.scalarPropTypesById[propId];
    return propType === 'int' || propType === 'mixed'
      ? view.encoded.tokenScalarPropValues[offset]
      : undefined;
  }

  private resolveSurfaceRef(
    ref: CompiledSurfaceRef,
    candidate: PolicyEvaluationCandidate | undefined,
  ): PolicyValue {
    if (ref.kind === 'previewSurface') {
      if (candidate === undefined) {
        return undefined;
      }
      const refId = previewRefKey(ref);
      candidate.previewRefIds.add(refId);
      const resolution = this.runtimeProviders.previewSurface.resolveSurface(candidate, ref, this.currentSeatContext);
      if (resolution.kind === 'unknown') {
        // Track the individual ref failure but do NOT stamp previewOutcome here.
        // Eagerly stamping the outcome on a per-ref failure contaminates the
        // candidate's outcome when a coalesce wrapper successfully falls through
        // to a non-preview branch — the outcome would be 'unresolved' even though
        // the preview surface itself is 'ready'. syncPreviewMetadata (called by
        // resolvePreviewStateFeatureRef or finalizePreviewOutcome) determines the
        // canonical outcome from the preview surface.
        this.recordUnknownPreviewRef(candidate, refId, resolution.reason);
        return undefined;
      }
      if (candidate.previewOutcome === undefined) {
        this.syncPreviewMetadata(candidate);
      }
      if (resolution.kind === 'value') {
        this.recordResolvedPreviewRefValue(candidate, refId, resolution.value);
        return resolution.value;
      }
      return undefined;
    }
    return this.runtimeProviders.currentSurface.resolveSurface(ref, this.activeState, this.currentSeatContext);
  }

  private getZoneReadContext(): ReadContext {
    const currentState = this.activeState;
    if (currentState.stateHash === this.input.state.stateHash) {
      const cached = this.transientZoneReadContext;
      if (cached?.stateHash === currentState.stateHash) {
        return cached.context;
      }
    } else if (this.transientZoneReadContext?.stateHash === currentState.stateHash) {
      return this.transientZoneReadContext.context;
    }
    const resources = createEvalRuntimeResources(
      this.input.runtime === undefined ? undefined : {
        tokenStateIndexCache: this.input.runtime.tokenStateIndexCache,
        compiledQueryPlanCache: this.input.runtime.compiledQueryPlanCache,
      },
    );
    const context = createEvalContext({
      def: this.input.def,
      adjacencyGraph: this.input.runtime?.adjacencyGraph ?? buildAdjacencyGraph(this.input.def.zones),
      state: currentState,
      activePlayer: currentState.activePlayer,
      actorPlayer: this.input.playerId,
      bindings: {},
      runtimeTableIndex: this.input.runtime?.runtimeTableIndex ?? buildRuntimeTableIndex(this.input.def),
      resources,
    });
    this.transientZoneReadContext = { stateHash: currentState.stateHash, context };
    return context;
  }

  private resolvePreviewStateFeatureRef(
    featureId: string,
    candidate: PolicyEvaluationCandidate | undefined,
  ): PolicyValue {
    if (candidate === undefined) {
      return undefined;
    }
    const refId = `feature.${featureId}`;
    candidate.previewRefIds.add(refId);
    this.syncPreviewMetadata(candidate);
    const previewOutcome = candidate.previewOutcome;
    if (previewOutcome !== 'ready' && previewOutcome !== 'stochastic') {
      if (previewOutcome !== undefined) {
        this.recordUnknownPreviewRef(candidate, refId, previewOutcome);
      }
      return undefined;
    }
    const previewState = this.runtimeProviders.previewSurface.getPreviewState(candidate);
    if (previewState === undefined) {
      this.recordUnknownPreviewRef(candidate, refId, 'failed');
      if (candidate.previewOutcome === undefined) {
        candidate.previewOutcome = 'failed';
      }
      return undefined;
    }
    const value = this.evaluateStateFeatureAgainstState(featureId, previewState);
    this.recordResolvedPreviewRefValue(candidate, refId, value);
    return value;
  }

  private syncPreviewMetadata(candidate: PolicyEvaluationCandidate): void {
    if (candidate.previewOutcome === undefined) {
      candidate.previewOutcome = this.runtimeProviders.previewSurface.getOutcome(candidate);
    }
    if (candidate.previewFailureReason === undefined) {
      const previewFailureReason = this.runtimeProviders.previewSurface.getFailureReason(candidate);
      if (previewFailureReason !== undefined) {
        candidate.previewFailureReason = previewFailureReason;
      }
    }
    if (candidate.previewDrive === undefined) {
      const previewDrive = this.runtimeProviders.previewSurface.getPreviewDrive(candidate);
      if (previewDrive !== undefined) {
        candidate.previewDrive = previewDrive;
      }
    }
    if (candidate.completionPolicyFallbackCount === undefined) {
      candidate.completionPolicyFallbackCount =
        this.runtimeProviders.previewSurface.getCompletionPolicyFallbackCount(candidate);
    }
    if (candidate.outcomeGrantContinuationDepth === undefined) {
      candidate.outcomeGrantContinuationDepth =
        this.runtimeProviders.previewSurface.getOutcomeGrantContinuationDepth(candidate);
    }
  }

  private evaluateStateFeatureAgainstState(featureId: string, state: GameState): PolicyValue {
    const cache = this.getStateFeatureCache(state);
    if (cache.has(featureId)) {
      return cache.get(featureId);
    }
    const feature = this.input.catalog.compiled.stateFeatures[featureId];
    if (feature === undefined) {
      throw this.runtimeError('RUNTIME_EVALUATION_ERROR', `Unknown state feature "${featureId}".`, { featureId });
    }
    const value = this.withEvaluationState(state, () => this.evaluateCompiledExpr(feature.expr, undefined));
    cache.set(featureId, value);
    return value;
  }

  private getStateFeatureCache(state: GameState): Map<string, PolicyValue> {
    if (state.stateHash === this.input.state.stateHash) {
      return this.rootStateFeatureCache;
    }
    if (this.transientStateFeatureCache?.stateHash === state.stateHash) {
      return this.transientStateFeatureCache.cache;
    }
    const cache = new Map<string, PolicyValue>();
    this.transientStateFeatureCache = { stateHash: state.stateHash, cache };
    return cache;
  }

  private withEvaluationState<T>(state: GameState, evaluate: () => T): T {
    const previousState = this.activeState;
    this.activeState = state;
    try {
      return evaluate();
    } finally {
      this.activeState = previousState;
    }
  }

  private runtimeError(
    code: string,
    message: string,
    detail?: Readonly<Record<string, unknown>>,
  ): PolicyRuntimeError {
    return new PolicyRuntimeError({ code, message, ...(detail === undefined ? {} : { detail }) });
  }
}

function selectorTraceEntry(
  view: SelectedSelectorView,
  traceLevel: 'summary' | 'verbose',
): PolicySelectorTraceEntry {
  const first = view.selected[0];
  const topK = traceLevel === 'verbose' ? view.selected.slice(0, 5) : [];
  return {
    selectorId: view.selectorId as PolicySelectorTraceEntry['selectorId'],
    ...(first === undefined
      ? {}
      : {
          selectedKey: first.key,
          selectedQuality: first.quality,
          selectedRank: first.rank,
          components: Object.fromEntries([...first.components.entries()].sort(([left], [right]) => left.localeCompare(right))),
        }),
    impactSatisfied: view.impactSatisfied,
    ...(view.emptyReason === undefined ? {} : { emptyReason: view.emptyReason }),
    ...(traceLevel === 'verbose' && topK.length > 0
      ? {
          topK: topK.map((item) => ({
            key: item.key,
            quality: item.quality,
            rank: item.rank,
            components: Object.fromEntries([...item.components.entries()].sort(([left], [right]) => left.localeCompare(right))),
          })),
        }
      : {}),
    ...(traceLevel === 'verbose'
      ? view.selected.length > topK.length ? { truncated: true } : {}
      : view.selected.length > 1 ? { truncated: true } : {}),
  };
}

function scalarZonePropValue(value: AttributeValue | undefined): string | number | boolean | undefined {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? value
    : undefined;
}

function previewRefKey(ref: CompiledSurfaceRef): string {
  if (ref.selector === undefined) {
    return `${ref.family}.${ref.id}`;
  }
  return ref.selector.kind === 'role'
    ? `${ref.family}.${ref.id}.${ref.selector.seatToken}`
    : `${ref.family}.${ref.id}.${ref.selector.player}`;
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

function candidateParamTraceRefId(paramId: string): string {
  return `candidate.params.${paramId}`;
}

export function lookupRefKey(ref: Extract<CompiledAgentPolicyRef, { readonly kind: 'lookup' }>): string {
  return [
    'lookup',
    ref.surface,
    ref.collection,
    ref.keyType,
    stablePayloadCode(ref.key),
    ref.path.join('.'),
  ].join('.');
}
