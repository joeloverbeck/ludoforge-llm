import { asPlayerId, type PlayerId, type ZoneId } from '../kernel/branded.js';
import type { AgentPolicyZoneScope, AgentPolicyZoneTokenAggOwner } from '../contracts/index.js';
import { createEvalContext, createEvalRuntimeResources, type ReadContext } from '../kernel/eval-context.js';
import { resolveZoneRefWithOwnerFallback } from '../kernel/resolve-zone-ref.js';
import { buildRuntimeTableIndex } from '../kernel/runtime-table-index.js';
import { buildAdjacencyGraph, queryAdjacentZones } from '../kernel/spatial.js';
import type {
  AttributeValue,
  AgentParameterValue,
  AgentPolicyCatalog,
  AgentPolicyExpr,
  AgentPolicyTokenFilter,
  AgentPolicyZoneFilter,
  ChoicePendingRequest,
  CompiledAgentPolicyRef,
  CompiledAgentPolicySurfaceRef,
  CompiledAgentScoreTerm,
  GameDef,
  GameState,
  MoveParamValue,
  Token,
  TrustedExecutableMove,
  ZoneDef,
} from '../kernel/types.js';
import type { GameDefRuntime } from '../kernel/gamedef-runtime.js';
import {
  createPolicyRuntimeProviders,
  type PolicyRuntimeCandidate,
  type PolicyRuntimeProviders,
  type PolicyValue,
} from './policy-runtime.js';
import type { PolicyPreviewTraceOutcome, PolicyPreviewUnavailabilityReason } from './policy-preview.js';

export interface PolicyRuntimeFailure {
  readonly code: string;
  readonly message: string;
  readonly detail?: Readonly<Record<string, unknown>>;
}

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
  previewOutcome?: PolicyPreviewTraceOutcome;
}

export interface CreatePolicyEvaluationContextInput {
  readonly def: GameDef;
  readonly state: GameState;
  readonly playerId: PlayerId;
  readonly seatId: string;
  readonly catalog: AgentPolicyCatalog;
  readonly parameterValues: Readonly<Record<string, AgentParameterValue>>;
  readonly trustedMoveIndex: ReadonlyMap<string, TrustedExecutableMove>;
  readonly runtime?: GameDefRuntime;
  readonly completion?: {
    readonly request: ChoicePendingRequest;
    readonly optionValue: MoveParamValue;
  };
}

function resolveZoneTokenAggOwner(
  owner: AgentPolicyZoneTokenAggOwner,
  input: CreatePolicyEvaluationContextInput,
): 'none' | PlayerId | undefined {
  if (owner === 'self') {
    return input.playerId;
  }
  if (owner === 'active') {
    return input.state.activePlayer;
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
): ResolvedTokenFilter | undefined {
  if (filter === undefined) {
    return undefined;
  }
  if (filter.props === undefined) {
    return filter;
  }

  const resolvedProps = Object.fromEntries(
    Object.entries(filter.props).map(([key, comparison]) => {
      const value = comparison.eq === 'self'
        ? playerId
        : comparison.eq === 'active'
          ? state.activePlayer
          : comparison.eq;
      return [key, { eq: value }];
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
  return Object.entries(filter.props).every(([key, comparison]) => token.props[key] === comparison.eq);
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
  private readonly stateFeatureCache = new Map<string, PolicyValue>();
  private readonly candidateFeatureCache = new Map<string, Map<string, PolicyValue>>();
  private readonly aggregateCache = new Map<string, PolicyValue>();
  private readonly runtimeProviders: PolicyRuntimeProviders;
  private zoneReadContext?: ReadContext;
  private currentCandidates: PolicyEvaluationCandidate[];

  constructor(
    private readonly input: CreatePolicyEvaluationContextInput,
    candidates: PolicyEvaluationCandidate[],
  ) {
    this.currentCandidates = candidates;
    this.runtimeProviders = createPolicyRuntimeProviders({
      def: input.def,
      state: input.state,
      playerId: input.playerId,
      seatId: input.seatId,
      trustedMoveIndex: input.trustedMoveIndex,
      catalog: input.catalog,
      runtimeError: (code, message, detail) => this.runtimeError(code, message, detail),
      ...(input.runtime === undefined ? {} : { runtime: input.runtime }),
      ...(input.completion === undefined ? {} : { completion: input.completion }),
    });
  }

  invalidateAggregates(): void {
    this.aggregateCache.clear();
  }

  setCurrentCandidates(candidates: PolicyEvaluationCandidate[]): void {
    this.currentCandidates = candidates;
    this.invalidateAggregates();
  }

  evaluateStateFeature(featureId: string): PolicyValue {
    if (this.stateFeatureCache.has(featureId)) {
      return this.stateFeatureCache.get(featureId);
    }
    const feature = this.input.catalog.library.stateFeatures[featureId];
    if (feature === undefined) {
      throw this.runtimeError('RUNTIME_EVALUATION_ERROR', `Unknown state feature "${featureId}".`, { featureId });
    }
    const value = this.evaluateExpr(feature.expr, undefined);
    this.stateFeatureCache.set(featureId, value);
    return value;
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
    const feature = this.input.catalog.library.candidateFeatures[featureId];
    if (feature === undefined) {
      throw this.runtimeError('RUNTIME_EVALUATION_ERROR', `Unknown candidate feature "${featureId}".`, { featureId });
    }
    const value = this.evaluateExpr(feature.expr, candidate);
    candidateCache.set(featureId, value);
    return value;
  }

  evaluateAggregate(aggregateId: string): PolicyValue {
    if (this.aggregateCache.has(aggregateId)) {
      return this.aggregateCache.get(aggregateId);
    }
    const aggregate = this.input.catalog.library.candidateAggregates[aggregateId];
    if (aggregate === undefined) {
      throw this.runtimeError('RUNTIME_EVALUATION_ERROR', `Unknown candidate aggregate "${aggregateId}".`, { aggregateId });
    }

    const included = this.currentCandidates.filter((candidate) => {
      const where = aggregate.where === undefined ? true : this.evaluateExpr(aggregate.where, candidate);
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
          .map((candidate) => this.evaluateExpr(aggregate.of, candidate))
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
          .map((candidate) => this.evaluateExpr(aggregate.of, candidate))
          .filter((entry): entry is number => typeof entry === 'number');
        value = numericValues.length === 0 ? undefined : numericValues.reduce((sum, entry) => sum + entry, 0);
        break;
      }
      case 'any': {
        const booleanValues = included
          .map((candidate) => this.evaluateExpr(aggregate.of, candidate))
          .filter((entry): entry is boolean => typeof entry === 'boolean');
        value = booleanValues.length === 0 ? undefined : booleanValues.some(Boolean);
        break;
      }
      case 'all': {
        const booleanValues = included
          .map((candidate) => this.evaluateExpr(aggregate.of, candidate))
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

  evaluateScoreTerm(
    scoreTerms: Readonly<Record<string, CompiledAgentScoreTerm>>,
    scoreTermId: string,
    candidate: PolicyEvaluationCandidate | undefined,
    onContribution?: (contribution: number) => void,
  ): number {
    const scoreTerm = scoreTerms[scoreTermId];
    if (scoreTerm === undefined) {
      throw this.runtimeError('RUNTIME_EVALUATION_ERROR', `Unknown score term "${scoreTermId}".`, { scoreTermId });
    }

    if (scoreTerm.when !== undefined) {
      const when = this.evaluateExpr(scoreTerm.when, candidate);
      if (when !== true) {
        return 0;
      }
    }

    const weight = this.evaluateExpr(scoreTerm.weight, candidate);
    const value = this.evaluateExpr(scoreTerm.value, candidate);
    if (typeof weight !== 'number' || typeof value !== 'number') {
      const contribution = scoreTerm.unknownAs ?? 0;
      onContribution?.(contribution);
      return contribution;
    }

    let contribution = weight * value;
    if (scoreTerm.clamp !== undefined) {
      if (scoreTerm.clamp.min !== undefined) {
        contribution = Math.max(scoreTerm.clamp.min, contribution);
      }
      if (scoreTerm.clamp.max !== undefined) {
        contribution = Math.min(scoreTerm.clamp.max, contribution);
      }
    }
    onContribution?.(contribution);
    return contribution;
  }

  evaluateExpr(expr: AgentPolicyExpr, candidate: PolicyEvaluationCandidate | undefined): PolicyValue {
    switch (expr.kind) {
      case 'literal':
        return expr.value === null ? undefined : expr.value;
      case 'param':
        return this.input.parameterValues[expr.id];
      case 'ref':
        return this.resolveRef(expr.ref, candidate);
      case 'op':
        switch (expr.op) {
          case 'add':
            return sumValues(this.evaluateExprList(expr.args, candidate));
          case 'sub':
            return binaryNumeric(this.evaluateExprList(expr.args, candidate), (left, right) => left - right);
          case 'mul':
            return multiplyValues(this.evaluateExprList(expr.args, candidate));
          case 'div':
            return binaryNumeric(this.evaluateExprList(expr.args, candidate), (left, right) => {
              if (right === 0) {
                throw this.runtimeError('RUNTIME_EVALUATION_ERROR', 'Policy expression division evaluated with a zero denominator.');
              }
              return left / right;
            });
          case 'min':
            return reduceNumeric(this.evaluateExprList(expr.args, candidate), (left, right) => Math.min(left, right));
          case 'max':
            return reduceNumeric(this.evaluateExprList(expr.args, candidate), (left, right) => Math.max(left, right));
          case 'abs': {
            const entry = this.evaluateFirstArg(expr, candidate);
            return typeof entry === 'number' ? Math.abs(entry) : undefined;
          }
          case 'neg': {
            const entry = this.evaluateFirstArg(expr, candidate);
            return typeof entry === 'number' ? -entry : undefined;
          }
          case 'eq':
          case 'ne': {
            const entriesToCompare = this.evaluateExprList(expr.args, candidate);
            if (entriesToCompare.length !== 2 || entriesToCompare[0] === undefined || entriesToCompare[1] === undefined) {
              return undefined;
            }
            const equals = deepPolicyEqual(entriesToCompare[0], entriesToCompare[1]);
            return expr.op === 'eq' ? equals : !equals;
          }
          case 'lt':
          case 'lte':
          case 'gt':
          case 'gte': {
            const compared = this.evaluateExprList(expr.args, candidate);
            if (compared.length !== 2 || typeof compared[0] !== 'number' || typeof compared[1] !== 'number') {
              return undefined;
            }
            if (expr.op === 'lt') return compared[0] < compared[1];
            if (expr.op === 'lte') return compared[0] <= compared[1];
            if (expr.op === 'gt') return compared[0] > compared[1];
            return compared[0] >= compared[1];
          }
          case 'and':
            return andValues(this.evaluateExprList(expr.args, candidate));
          case 'or':
            return orValues(this.evaluateExprList(expr.args, candidate));
          case 'not': {
            const entry = this.evaluateFirstArg(expr, candidate);
            return typeof entry === 'boolean' ? !entry : undefined;
          }
          case 'if': {
            const args = this.evaluateExprList(expr.args, candidate);
            if (args.length !== 3 || typeof args[0] !== 'boolean') {
              return undefined;
            }
            return args[0] ? args[1] : args[2];
          }
          case 'in': {
            const args = this.evaluateExprList(expr.args, candidate);
            if (args.length !== 2 || args[0] === undefined || args[1] === undefined) {
              return undefined;
            }
            if (Array.isArray(args[1])) {
              return args[1].includes(String(args[0]));
            }
            return undefined;
          }
          case 'coalesce': {
            for (const entry of this.evaluateExprList(expr.args, candidate)) {
              if (entry !== undefined) {
                return entry;
              }
            }
            return undefined;
          }
          case 'clamp': {
            const args = this.evaluateExprList(expr.args, candidate);
            if (args.length !== 3 || typeof args[0] !== 'number' || typeof args[1] !== 'number' || typeof args[2] !== 'number') {
              return undefined;
            }
            return Math.max(args[1], Math.min(args[2], args[0]));
          }
          case 'boolToNumber': {
            const entry = this.evaluateFirstArg(expr, candidate);
            return typeof entry === 'boolean' ? (entry ? 1 : 0) : undefined;
          }
        }
        return undefined;
      case 'zoneProp':
        return this.evaluateZoneProp(expr, candidate);
      case 'zoneTokenAgg':
        return this.evaluateZoneTokenAggregate(expr, candidate);
      case 'globalTokenAgg':
        return this.evaluateGlobalTokenAggregate(expr);
      case 'globalZoneAgg':
        return this.evaluateGlobalZoneAggregate(expr);
      case 'adjacentTokenAgg':
        return this.evaluateAdjacentTokenAggregate(expr, candidate);
    }
  }

  private evaluateZoneProp(
    expr: Extract<AgentPolicyExpr, { readonly kind: 'zoneProp' }>,
    candidate: PolicyEvaluationCandidate | undefined,
  ): PolicyValue {
    const zoneId = this.resolvePolicyZoneId(expr.zone, 'none', candidate);
    if (zoneId === undefined) {
      return undefined;
    }
    const zoneDef = this.input.def.zones.find((zone) => zone.id === zoneId);
    if (zoneDef === undefined) {
      return undefined;
    }
    if (expr.prop === 'id') {
      return zoneDef.id;
    }
    if (expr.prop === 'category') {
      return zoneDef.category;
    }
    return scalarZonePropValue(zoneDef.attributes?.[expr.prop]);
  }

  private evaluateZoneTokenAggregate(
    expr: Extract<AgentPolicyExpr, { readonly kind: 'zoneTokenAgg' }>,
    candidate: PolicyEvaluationCandidate | undefined,
  ): PolicyValue {
    const resolvedOwner = resolveZoneTokenAggOwner(expr.owner, this.input);
    if (resolvedOwner === undefined) {
      return undefined;
    }
    const zoneId = this.resolvePolicyZoneId(expr.zone, resolvedOwner, candidate);
    if (zoneId === undefined) {
      return undefined;
    }
    const tokens = this.input.state.zones[zoneId];
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

  private evaluateGlobalTokenAggregate(
    expr: Extract<AgentPolicyExpr, { readonly kind: 'globalTokenAgg' }>,
  ): PolicyValue {
    const resolvedFilter = resolveTokenFilter(expr.tokenFilter, this.input.playerId, this.input.state);
    const zoneIds: string[] = [];

    for (const zoneDef of this.input.def.zones) {
      if (!matchesZoneScope(zoneDef, expr.zoneScope)) {
        continue;
      }
      if (!matchesZoneFilter(zoneDef, expr.zoneFilter, this.input.state)) {
        continue;
      }
      zoneIds.push(String(zoneDef.id));
    }

    return this.aggregateTokensAcrossZones(zoneIds, expr, resolvedFilter);
  }

  private evaluateGlobalZoneAggregate(
    expr: Extract<AgentPolicyExpr, { readonly kind: 'globalZoneAgg' }>,
  ): PolicyValue {
    let count = 0;
    let aggregate: number | undefined;

    for (const zoneDef of this.input.def.zones) {
      if (!matchesZoneScope(zoneDef, expr.zoneScope)) {
        continue;
      }
      if (!matchesZoneFilter(zoneDef, expr.zoneFilter, this.input.state)) {
        continue;
      }

      if (expr.aggOp === 'count') {
        count += 1;
        continue;
      }

      const rawValue = expr.source === 'variable'
        ? this.input.state.zoneVars[String(zoneDef.id)]?.[expr.field]
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

  private evaluateAdjacentTokenAggregate(
    expr: Extract<AgentPolicyExpr, { readonly kind: 'adjacentTokenAgg' }>,
    candidate: PolicyEvaluationCandidate | undefined,
  ): PolicyValue {
    const anchorZoneId = this.resolvePolicyZoneId(expr.anchorZone, 'none', candidate);
    if (anchorZoneId === undefined) {
      return undefined;
    }
    const adjacencyGraph = this.input.runtime?.adjacencyGraph ?? buildAdjacencyGraph(this.input.def.zones);
    const adjacentZoneIds = queryAdjacentZones(adjacencyGraph, anchorZoneId);
    const resolvedFilter = resolveTokenFilter(expr.tokenFilter, this.input.playerId, this.input.state);
    return this.aggregateTokensAcrossZones(adjacentZoneIds, expr, resolvedFilter);
  }

  private evaluateExprList(
    expressions: readonly AgentPolicyExpr[],
    candidate: PolicyEvaluationCandidate | undefined,
  ): readonly PolicyValue[] {
    return expressions.map((entry) => this.evaluateExpr(entry, candidate));
  }

  private evaluateFirstArg(
    expr: Extract<AgentPolicyExpr, { readonly kind: 'op' }>,
    candidate: PolicyEvaluationCandidate | undefined,
  ): PolicyValue {
    return expr.args.length === 0 ? undefined : this.evaluateExpr(expr.args[0]!, candidate);
  }

  private resolveRef(ref: CompiledAgentPolicyRef, candidate: PolicyEvaluationCandidate | undefined): PolicyValue {
    switch (ref.kind) {
      case 'library':
        if (ref.refKind === 'aggregate') {
          return this.evaluateAggregate(ref.id);
        }
        if (ref.refKind === 'candidateFeature') {
          return candidate === undefined ? undefined : this.evaluateCandidateFeature(candidate, ref.id);
        }
        return this.evaluateStateFeature(ref.id);
      case 'seatIntrinsic':
        return this.runtimeProviders.intrinsics.resolveSeatIntrinsic(ref.intrinsic);
      case 'turnIntrinsic':
        return this.runtimeProviders.intrinsics.resolveTurnIntrinsic(ref.intrinsic);
      case 'candidateIntrinsic':
        return candidate === undefined ? undefined : this.runtimeProviders.candidates.resolveCandidateIntrinsic(candidate, ref.intrinsic);
      case 'candidateParam':
        return candidate === undefined ? undefined : this.runtimeProviders.candidates.resolveCandidateParam(candidate, ref.id);
      case 'decisionIntrinsic':
        return this.runtimeProviders.completion?.resolveDecisionIntrinsic(ref.intrinsic);
      case 'optionIntrinsic':
        return this.runtimeProviders.completion?.resolveOptionIntrinsic(ref.intrinsic);
      case 'currentSurface':
      case 'previewSurface':
        return this.resolveSurfaceRef(ref, candidate);
      case 'strategicCondition':
        return undefined;
    }
  }

  private resolvePolicyZoneId(
    zoneExpr: string | AgentPolicyExpr,
    owner: 'none' | PlayerId,
    candidate: PolicyEvaluationCandidate | undefined,
  ): ZoneId | undefined {
    const resolvedZone = typeof zoneExpr === 'string'
      ? zoneExpr
      : this.evaluateExpr(zoneExpr, candidate);
    if (typeof resolvedZone !== 'string' || resolvedZone.length === 0) {
      return undefined;
    }
    return resolveZoneRefWithOwnerFallback(resolvedZone, owner, this.getZoneReadContext());
  }

  private aggregateTokensAcrossZones(
    zoneIds: readonly string[],
    expr: Pick<Extract<AgentPolicyExpr, { readonly kind: 'globalTokenAgg' | 'adjacentTokenAgg' }>, 'aggOp' | 'prop'>,
    resolvedFilter: ResolvedTokenFilter | undefined,
  ): PolicyValue {
    let count = 0;
    let aggregate: number | undefined;

    for (const zoneId of zoneIds) {
      const tokens = this.input.state.zones[zoneId] ?? [];
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

  private resolveSurfaceRef(
    ref: CompiledAgentPolicySurfaceRef,
    candidate: PolicyEvaluationCandidate | undefined,
  ): PolicyValue {
    if (ref.kind === 'previewSurface') {
      if (candidate === undefined) {
        return undefined;
      }
      const refId = previewRefKey(ref);
      candidate.previewRefIds.add(refId);
      const resolution = this.runtimeProviders.previewSurface.resolveSurface(candidate, ref);
      if (resolution.kind === 'unknown') {
        candidate.previewOutcome = resolution.reason;
        candidate.unknownPreviewRefs.set(refId, resolution.reason);
        return undefined;
      }
      if (candidate.previewOutcome === undefined) {
        candidate.previewOutcome = this.runtimeProviders.previewSurface.getOutcome(candidate);
      }
      return resolution.kind === 'value' ? resolution.value : undefined;
    }
    return this.runtimeProviders.currentSurface.resolveSurface(ref);
  }

  private getZoneReadContext(): ReadContext {
    if (this.zoneReadContext !== undefined) {
      return this.zoneReadContext;
    }
    const resources = createEvalRuntimeResources();
    this.zoneReadContext = createEvalContext({
      def: this.input.def,
      adjacencyGraph: this.input.runtime?.adjacencyGraph ?? buildAdjacencyGraph(this.input.def.zones),
      state: this.input.state,
      activePlayer: this.input.state.activePlayer,
      actorPlayer: this.input.playerId,
      bindings: {},
      runtimeTableIndex: this.input.runtime?.runtimeTableIndex ?? buildRuntimeTableIndex(this.input.def),
      resources,
    });
    return this.zoneReadContext;
  }

  private runtimeError(
    code: string,
    message: string,
    detail?: Readonly<Record<string, unknown>>,
  ): PolicyRuntimeError {
    return new PolicyRuntimeError({ code, message, ...(detail === undefined ? {} : { detail }) });
  }
}

function scalarZonePropValue(value: AttributeValue | undefined): string | number | boolean | undefined {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? value
    : undefined;
}

function previewRefKey(ref: CompiledAgentPolicySurfaceRef): string {
  if (ref.selector === undefined) {
    return `${ref.family}.${ref.id}`;
  }
  return ref.selector.kind === 'role'
    ? `${ref.family}.${ref.id}.${ref.selector.seatToken}`
    : `${ref.family}.${ref.id}.${ref.selector.player}`;
}

function sumValues(values: readonly PolicyValue[]): PolicyValue {
  const numericValues = values.filter((entry): entry is number => typeof entry === 'number');
  return numericValues.length === values.length
    ? numericValues.reduce((sum, entry) => sum + entry, 0)
    : undefined;
}

function multiplyValues(values: readonly PolicyValue[]): PolicyValue {
  const numericValues = values.filter((entry): entry is number => typeof entry === 'number');
  return numericValues.length === values.length
    ? numericValues.reduce((product, entry) => product * entry, 1)
    : undefined;
}

function binaryNumeric(
  values: readonly PolicyValue[],
  reducer: (left: number, right: number) => number,
): PolicyValue {
  if (values.length !== 2 || typeof values[0] !== 'number' || typeof values[1] !== 'number') {
    return undefined;
  }
  return reducer(values[0], values[1]);
}

function reduceNumeric(
  values: readonly PolicyValue[],
  reducer: (left: number, right: number) => number,
): PolicyValue {
  const numericValues = values.filter((entry): entry is number => typeof entry === 'number');
  if (numericValues.length !== values.length || numericValues.length === 0) {
    return undefined;
  }
  return numericValues.slice(1).reduce((total, entry) => reducer(total, entry), numericValues[0]!);
}

function andValues(values: readonly PolicyValue[]): PolicyValue {
  let sawUnknown = false;
  for (const value of values) {
    if (value === false) {
      return false;
    }
    if (value !== true) {
      sawUnknown = true;
    }
  }
  return sawUnknown ? undefined : true;
}

function orValues(values: readonly PolicyValue[]): PolicyValue {
  let sawUnknown = false;
  for (const value of values) {
    if (value === true) {
      return true;
    }
    if (value !== false) {
      sawUnknown = true;
    }
  }
  return sawUnknown ? undefined : false;
}

function deepPolicyEqual(left: AgentParameterValue, right: AgentParameterValue): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }
    return left.every((entry, index) => entry === right[index]);
  }
  return left === right;
}
