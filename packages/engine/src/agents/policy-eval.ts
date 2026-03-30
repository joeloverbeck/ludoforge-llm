import type { PlayerId } from '../kernel/branded.js';
import { toMoveIdentityKey } from '../kernel/move-identity.js';
import type {
  AgentPolicyCatalog,
  AgentPolicyExpr,
  CompiledAgentPolicyRef,
  CompiledAgentPolicySurfaceRef,
  AgentParameterValue,
  CompiledAgentProfile,
  CompiledAgentTieBreaker,
  GameDef,
  GameState,
  Move,
  PolicyCompletionStatistics,
  PolicyPreviewOutcomeBreakdownTrace,
  Rng,
  TrustedExecutableMove,
} from '../kernel/types.js';
import type { GameDefRuntime } from '../kernel/gamedef-runtime.js';
import { pickRandom } from './agent-move-selection.js';
import type { PolicyPreviewTraceOutcome, PolicyPreviewUnavailabilityReason } from './policy-preview.js';
import {
  createPolicyRuntimeProviders,
  type PolicyRuntimeProviders,
  type PolicyValue,
} from './policy-runtime.js';

export interface PolicyPreviewUnknownRef {
  readonly refId: string;
  readonly reason: PolicyPreviewUnavailabilityReason;
}

export interface PolicyEvaluationFailure {
  readonly code:
    | 'EMPTY_LEGAL_MOVES'
    | 'POLICY_CATALOG_MISSING'
    | 'SEAT_UNRESOLVED'
    | 'PROFILE_BINDING_MISSING'
    | 'PROFILE_MISSING'
    | 'UNSUPPORTED_PREVIEW'
    | 'UNSUPPORTED_RUNTIME_REF'
    | 'UNSUPPORTED_AGGREGATE_OP'
    | 'PRUNING_RULE_EMPTIED_CANDIDATES'
    | 'RUNTIME_EVALUATION_ERROR';
  readonly message: string;
  readonly detail?: Readonly<Record<string, unknown>>;
}

export interface PolicyEvaluationCandidateMetadata {
  readonly actionId: string;
  readonly stableMoveKey: string;
  readonly score: number;
  readonly prunedBy: readonly string[];
  readonly scoreContributions: readonly {
    readonly termId: string;
    readonly contribution: number;
  }[];
  readonly previewRefIds: readonly string[];
  readonly unknownPreviewRefs: readonly PolicyPreviewUnknownRef[];
  readonly previewOutcome?: PolicyPreviewTraceOutcome;
}

export interface PolicyEvaluationPruningStep {
  readonly ruleId: string;
  readonly remainingCandidateCount: number;
  readonly skippedBecauseEmpty: boolean;
}

export interface PolicyEvaluationTieBreakStep {
  readonly tieBreakerId: string;
  readonly candidateCountBefore: number;
  readonly candidateCountAfter: number;
}

export interface PolicyEvaluationPreviewUsage {
  readonly evaluatedCandidateCount: number;
  readonly refIds: readonly string[];
  readonly unknownRefs: readonly PolicyPreviewUnknownRef[];
  readonly outcomeBreakdown: PolicyPreviewOutcomeBreakdownTrace;
}

export interface PolicyEvaluationMetadata {
  readonly seatId: string | null;
  readonly requestedProfileId: string | null;
  readonly profileId: string | null;
  readonly profileFingerprint: string | null;
  readonly canonicalOrder: readonly string[];
  readonly candidates: readonly PolicyEvaluationCandidateMetadata[];
  readonly pruningSteps: readonly PolicyEvaluationPruningStep[];
  readonly tieBreakChain: readonly PolicyEvaluationTieBreakStep[];
  readonly previewUsage: PolicyEvaluationPreviewUsage;
  readonly completionStatistics?: PolicyCompletionStatistics;
  readonly selectedStableMoveKey: string | null;
  readonly finalScore: number | null;
  readonly usedFallback: boolean;
  readonly failure: PolicyEvaluationFailure | null;
}

export interface PolicyEvaluationResult {
  readonly move: Move;
  readonly rng: Rng;
  readonly metadata: PolicyEvaluationMetadata;
}

export interface EvaluatePolicyMoveInput {
  readonly def: GameDef;
  readonly state: GameState;
  readonly playerId: PlayerId;
  readonly legalMoves: readonly Move[];
  readonly trustedMoveIndex: ReadonlyMap<string, TrustedExecutableMove>;
  readonly rng: Rng;
  readonly runtime?: GameDefRuntime;
  readonly completionStatistics?: PolicyCompletionStatistics;
  readonly fallbackOnError?: boolean;
  readonly profileIdOverride?: string;
}

export type PolicyEvaluationCoreResult =
  | {
      readonly kind: 'success';
      readonly move: Move;
      readonly rng: Rng;
      readonly metadata: PolicyEvaluationMetadata;
    }
  | {
      readonly kind: 'failure';
      readonly failure: PolicyEvaluationFailure;
      readonly metadata: PolicyEvaluationMetadata;
    };

interface CandidateEntry {
  readonly move: Move;
  readonly stableMoveKey: string;
  readonly actionId: string;
  readonly prunedBy: string[];
  readonly scoreContributions: { readonly termId: string; readonly contribution: number }[];
  readonly previewRefIds: Set<string>;
  readonly unknownPreviewRefs: Map<string, PolicyPreviewUnavailabilityReason>;
  previewOutcome?: PolicyPreviewTraceOutcome;
  score: number;
}

class PolicyRuntimeError extends Error {
  readonly failure: PolicyEvaluationFailure;

  constructor(failure: PolicyEvaluationFailure) {
    super(failure.message);
    this.name = 'PolicyRuntimeError';
    this.failure = failure;
  }
}

class EvaluationContext {
  private readonly catalog: AgentPolicyCatalog;
  private readonly parameterValues: Readonly<Record<string, AgentParameterValue>>;
  private currentCandidates: CandidateEntry[];
  private readonly stateFeatureCache = new Map<string, PolicyValue>();
  private readonly candidateFeatureCache = new Map<string, Map<string, PolicyValue>>();
  private readonly aggregateCache = new Map<string, PolicyValue>();
  private readonly runtimeProviders: PolicyRuntimeProviders;
  private readonly seatId: string;

  constructor(
    private readonly input: EvaluatePolicyMoveInput,
    candidates: CandidateEntry[],
    seatId: string,
    profile: CompiledAgentProfile,
  ) {
    this.seatId = seatId;
    const catalog = input.def.agents;
    if (catalog === undefined) {
      throw new PolicyRuntimeError({
        code: 'POLICY_CATALOG_MISSING',
        message: 'GameDef.agents is required to evaluate an authored policy.',
      });
    }
    this.catalog = catalog;
    this.parameterValues = profile.params;
    this.currentCandidates = candidates;
    this.runtimeProviders = createPolicyRuntimeProviders({
      def: input.def,
      state: input.state,
      playerId: input.playerId,
      seatId,
      trustedMoveIndex: input.trustedMoveIndex,
      catalog,
      runtimeError: (code, message, detail) => this.runtimeError(code as PolicyEvaluationFailure['code'], message, detail),
      ...(input.runtime === undefined ? {} : { runtime: input.runtime }),
    });
  }

  invalidateAggregates(): void {
    this.aggregateCache.clear();
  }

  setCurrentCandidates(candidates: CandidateEntry[]): void {
    this.currentCandidates = candidates;
    this.invalidateAggregates();
  }

  evaluateStateFeature(featureId: string): PolicyValue {
    if (this.stateFeatureCache.has(featureId)) {
      return this.stateFeatureCache.get(featureId);
    }
    const feature = this.catalog.library.stateFeatures[featureId];
    if (feature === undefined) {
      throw this.runtimeError('RUNTIME_EVALUATION_ERROR', `Unknown state feature "${featureId}".`, { featureId });
    }
    const value = this.evaluateExpr(feature.expr, undefined);
    this.stateFeatureCache.set(featureId, value);
    return value;
  }

  evaluateCandidateFeature(candidate: CandidateEntry, featureId: string): PolicyValue {
    let candidateCache = this.candidateFeatureCache.get(candidate.stableMoveKey);
    if (candidateCache === undefined) {
      candidateCache = new Map<string, PolicyValue>();
      this.candidateFeatureCache.set(candidate.stableMoveKey, candidateCache);
    }
    if (candidateCache.has(featureId)) {
      return candidateCache.get(featureId);
    }
    const feature = this.catalog.library.candidateFeatures[featureId];
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
    const aggregate = this.catalog.library.candidateAggregates[aggregateId];
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

  evaluateScoreTerm(candidate: CandidateEntry, scoreTermId: string): number {
    const scoreTerm = this.catalog.library.scoreTerms[scoreTermId];
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
      candidate.scoreContributions.push({ termId: scoreTermId, contribution });
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
    candidate.scoreContributions.push({ termId: scoreTermId, contribution });
    return contribution;
  }

  applyTieBreaker(
    candidates: readonly CandidateEntry[],
    tieBreakerId: string,
    rng: Rng,
  ): { readonly candidates: readonly CandidateEntry[]; readonly rng: Rng } {
    const tieBreaker = this.catalog.library.tieBreakers[tieBreakerId];
    if (tieBreaker === undefined) {
      throw this.runtimeError('RUNTIME_EVALUATION_ERROR', `Unknown tie-breaker "${tieBreakerId}".`, { tieBreakerId });
    }

    switch (tieBreaker.kind) {
      case 'stableMoveKey': {
        const bestKey = candidates.reduce<string | null>((best, candidate) => (
          best === null || candidate.stableMoveKey < best ? candidate.stableMoveKey : best
        ), null);
        return {
          candidates: bestKey === null ? candidates : candidates.filter((candidate) => candidate.stableMoveKey === bestKey),
          rng,
        };
      }
      case 'higherExpr':
      case 'lowerExpr':
        return {
          candidates: selectByScalarExpr(
            candidates,
            (left, right) => (tieBreaker.kind === 'higherExpr' ? left > right : left < right),
            (candidate) => this.evaluateExpr(tieBreaker.value!, candidate),
          ),
          rng,
        };
      case 'preferredEnumOrder':
      case 'preferredIdOrder':
        return {
          candidates: selectByPreferredOrder(candidates, tieBreaker, (candidate) => this.evaluateExpr(tieBreaker.value!, candidate)),
          rng,
        };
      case 'rng': {
        const { item, rng: nextRng } = pickRandom(candidates, rng);
        return { candidates: [item], rng: nextRng };
      }
      default:
        throw this.runtimeError(
          'RUNTIME_EVALUATION_ERROR',
          `Unsupported tie-breaker kind "${tieBreaker.kind}".`,
          { tieBreakerId, kind: tieBreaker.kind },
        );
    }
  }

  evaluateExpr(expr: AgentPolicyExpr, candidate: CandidateEntry | undefined): PolicyValue {
    switch (expr.kind) {
      case 'literal':
        return expr.value === null ? undefined : expr.value;
      case 'param':
        return this.parameterValues[expr.id];
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
      case 'zoneTokenAgg':
        return this.evaluateZoneTokenAggregate(expr);
    }
  }

  private evaluateZoneTokenAggregate(
    expr: Extract<AgentPolicyExpr, { readonly kind: 'zoneTokenAgg' }>,
  ): PolicyValue {
    const ownerSuffix =
      expr.owner === 'self'
        ? String(this.input.playerId)
        : expr.owner === 'active'
          ? String(this.input.state.activePlayer)
          : expr.owner;
    const zoneId = `${expr.zone}:${ownerSuffix}`;
    const tokens = this.input.state.zones[zoneId];
    if (tokens === undefined || tokens.length === 0) {
      return expr.aggOp === 'count' ? 0 : expr.aggOp === 'sum' ? 0 : undefined;
    }
    const values: number[] = [];
    for (const token of tokens) {
      const val = token.props[expr.prop];
      if (typeof val === 'number') {
        values.push(val);
      }
    }
    if (values.length === 0) {
      return expr.aggOp === 'count' || expr.aggOp === 'sum' ? 0 : undefined;
    }
    switch (expr.aggOp) {
      case 'sum':
        return values.reduce((acc, v) => acc + v, 0);
      case 'count':
        return values.length;
      case 'min':
        return Math.min(...values);
      case 'max':
        return Math.max(...values);
    }
  }

  private evaluateExprList(expressions: readonly AgentPolicyExpr[], candidate: CandidateEntry | undefined): readonly PolicyValue[] {
    return expressions.map((entry) => this.evaluateExpr(entry, candidate));
  }

  private evaluateFirstArg(expr: Extract<AgentPolicyExpr, { readonly kind: 'op' }>, candidate: CandidateEntry | undefined): PolicyValue {
    return expr.args.length === 0 ? undefined : this.evaluateExpr(expr.args[0]!, candidate);
  }

  private resolveRef(ref: CompiledAgentPolicyRef, candidate: CandidateEntry | undefined): PolicyValue {
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
      case 'optionIntrinsic':
        return undefined;
      case 'currentSurface':
      case 'previewSurface':
        return this.resolveSurfaceRef(ref, candidate);
    }
  }

  private resolveSurfaceRef(
    ref: CompiledAgentPolicySurfaceRef,
    candidate: CandidateEntry | undefined,
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

  private runtimeError(
    code: PolicyEvaluationFailure['code'],
    message: string,
    detail?: Readonly<Record<string, unknown>>,
  ): PolicyRuntimeError {
    return new PolicyRuntimeError({ code, message, ...(detail === undefined ? {} : { detail }) });
  }
}

export function evaluatePolicyMoveCore(input: EvaluatePolicyMoveInput): PolicyEvaluationCoreResult {
  const candidates = canonicalizeCandidates(input.def, input.legalMoves);
  const canonicalOrder = candidates.map((candidate) => candidate.stableMoveKey);
  const requestedProfileId = input.profileIdOverride ?? null;

  if (candidates.length === 0) {
    return {
      kind: 'failure',
      failure: {
        code: 'EMPTY_LEGAL_MOVES',
        message: 'Policy evaluation requires at least one legal move.',
      },
      metadata: {
        seatId: null,
        requestedProfileId,
        profileId: null,
        profileFingerprint: null,
        canonicalOrder,
        candidates: [],
        pruningSteps: [],
        tieBreakChain: [],
        previewUsage: emptyPreviewUsage(),
        ...(input.completionStatistics === undefined ? {} : { completionStatistics: input.completionStatistics }),
        selectedStableMoveKey: null,
        finalScore: null,
        usedFallback: false,
        failure: {
          code: 'EMPTY_LEGAL_MOVES',
          message: 'Policy evaluation requires at least one legal move.',
        },
      },
    };
  }

  const catalog = input.def.agents;
  if (catalog === undefined) {
    return failureWithMetadata(candidates, null, requestedProfileId, null, {
      code: 'POLICY_CATALOG_MISSING',
      message: 'GameDef.agents is required to evaluate an authored policy.',
    }, null, input.completionStatistics);
  }

  const seatId = resolvePolicyBindingSeatId(input.def, input.playerId);
  if (seatId === null) {
    return failureWithMetadata(candidates, null, requestedProfileId, null, {
      code: 'SEAT_UNRESOLVED',
      message: `Player ${input.playerId} does not resolve to a canonical seat id for policy binding.`,
      detail: { playerId: input.playerId },
    });
  }

  const profileId = input.profileIdOverride ?? catalog.bindingsBySeat[seatId];
  if (profileId === undefined) {
    return failureWithMetadata(candidates, seatId, requestedProfileId, null, {
      code: 'PROFILE_BINDING_MISSING',
      message: `Seat "${seatId}" is not bound to an authored policy profile.`,
      detail: { seatId },
    }, null, input.completionStatistics);
  }

  const profile = catalog.profiles[profileId];
  if (profile === undefined) {
    return failureWithMetadata(candidates, seatId, requestedProfileId, profileId, {
      code: 'PROFILE_MISSING',
      message: `Compiled policy profile "${profileId}" is missing from GameDef.agents.profiles.`,
      detail: { seatId, profileId },
    }, null, input.completionStatistics);
  }

  try {
    const evaluation = new EvaluationContext(input, candidates, seatId, profile);
    let activeCandidates = [...candidates];
    const pruningSteps: PolicyEvaluationPruningStep[] = [];
    const tieBreakChain: PolicyEvaluationTieBreakStep[] = [];

    for (const featureId of profile.plan.stateFeatures) {
      evaluation.evaluateStateFeature(featureId);
    }
    for (const candidate of activeCandidates) {
      for (const featureId of profile.plan.candidateFeatures) {
        const feature = catalog.library.candidateFeatures[featureId];
        if (feature?.costClass === 'preview') {
          continue;
        }
        evaluation.evaluateCandidateFeature(candidate, featureId);
      }
    }

    for (const pruningRuleId of profile.use.pruningRules) {
      const pruningRule = catalog.library.pruningRules[pruningRuleId];
      if (pruningRule === undefined) {
        throw new PolicyRuntimeError({
          code: 'RUNTIME_EVALUATION_ERROR',
          message: `Unknown pruning rule "${pruningRuleId}".`,
          detail: { pruningRuleId },
        });
      }
      const survivors = activeCandidates.filter((candidate) => {
        const shouldPrune = evaluation.evaluateExpr(pruningRule.when, candidate);
        if (shouldPrune === true) {
          candidate.prunedBy.push(pruningRuleId);
          return false;
        }
        return true;
      });

      if (survivors.length === 0) {
        if (pruningRule.onEmpty === 'skipRule') {
          activeCandidates.forEach((candidate) => {
            if (candidate.prunedBy.at(-1) === pruningRuleId) {
              candidate.prunedBy.pop();
            }
          });
          pruningSteps.push({
            ruleId: pruningRuleId,
            remainingCandidateCount: activeCandidates.length,
            skippedBecauseEmpty: true,
          });
          continue;
        }
        throw new PolicyRuntimeError({
          code: 'PRUNING_RULE_EMPTIED_CANDIDATES',
          message: `Pruning rule "${pruningRuleId}" removed every candidate.`,
          detail: { pruningRuleId },
        });
      }

      if (survivors.length !== activeCandidates.length) {
        activeCandidates = survivors;
        evaluation.setCurrentCandidates(activeCandidates);
      }
      pruningSteps.push({
        ruleId: pruningRuleId,
        remainingCandidateCount: activeCandidates.length,
        skippedBecauseEmpty: false,
      });
    }

    for (const candidate of activeCandidates) {
      candidate.score = profile.use.scoreTerms.reduce((total, scoreTermId) => total + evaluation.evaluateScoreTerm(candidate, scoreTermId), 0);
    }
    const bestScore = activeCandidates.reduce((best, candidate) => Math.max(best, candidate.score), Number.NEGATIVE_INFINITY);
    let bestCandidates = activeCandidates.filter((candidate) => candidate.score === bestScore);

    let rng = input.rng;
    for (const tieBreakerId of profile.use.tieBreakers) {
      if (bestCandidates.length <= 1) {
        break;
      }
      const candidateCountBefore = bestCandidates.length;
      const tieBreakResult = evaluation.applyTieBreaker(bestCandidates, tieBreakerId, rng);
      bestCandidates = [...tieBreakResult.candidates];
      rng = tieBreakResult.rng;
      tieBreakChain.push({
        tieBreakerId,
        candidateCountBefore,
        candidateCountAfter: bestCandidates.length,
      });
    }

    const selected = bestCandidates[0] ?? activeCandidates[0];
    if (selected === undefined) {
      throw new PolicyRuntimeError({
        code: 'RUNTIME_EVALUATION_ERROR',
        message: 'Policy evaluation did not produce a selectable candidate.',
      });
    }

    return {
      kind: 'success',
      move: selected.move,
      rng,
      metadata: {
        seatId,
        requestedProfileId,
        profileId,
        profileFingerprint: profile.fingerprint,
        canonicalOrder,
        candidates: candidates.map(candidateMetadata),
        pruningSteps,
        tieBreakChain,
        previewUsage: summarizePreviewUsage(candidates),
        ...(input.completionStatistics === undefined ? {} : { completionStatistics: input.completionStatistics }),
        selectedStableMoveKey: selected.stableMoveKey,
        finalScore: Number.isFinite(selected.score) ? selected.score : null,
        usedFallback: false,
        failure: null,
      },
    };
  } catch (error) {
    const failure = error instanceof PolicyRuntimeError
      ? error.failure
      : {
          code: 'RUNTIME_EVALUATION_ERROR' as const,
          message: error instanceof Error ? error.message : 'Unknown policy evaluation failure.',
        };
    return failureWithMetadata(candidates, seatId, requestedProfileId, profileId, failure, profile.fingerprint, input.completionStatistics);
  }
}

export function evaluatePolicyMove(input: EvaluatePolicyMoveInput): PolicyEvaluationResult {
  const core = evaluatePolicyMoveCore(input);
  if (core.kind === 'success') {
    return core;
  }

  const candidates = canonicalizeCandidates(input.def, input.legalMoves);
  const fallbackCandidate = candidates[0];
  const fallbackMove = fallbackCandidate?.move;
  if (fallbackMove === undefined || input.fallbackOnError === false) {
    throw new PolicyRuntimeError(core.failure);
  }

  return {
    move: fallbackMove,
    rng: input.rng,
    metadata: {
      ...core.metadata,
      selectedStableMoveKey: fallbackCandidate?.stableMoveKey ?? null,
      finalScore: fallbackCandidate === undefined || !Number.isFinite(fallbackCandidate.score) ? null : fallbackCandidate.score,
      usedFallback: true,
    },
  };
}

function failureWithMetadata(
  candidates: readonly CandidateEntry[],
  seatId: string | null,
  requestedProfileId: string | null,
  profileId: string | null,
  failure: PolicyEvaluationFailure,
  profileFingerprint: string | null = null,
  completionStatistics?: PolicyCompletionStatistics,
): PolicyEvaluationCoreResult {
  return {
    kind: 'failure',
    failure,
    metadata: {
      seatId,
      requestedProfileId,
      profileId,
      profileFingerprint,
      canonicalOrder: candidates.map((candidate) => candidate.stableMoveKey),
      candidates: candidates.map(candidateMetadata),
      pruningSteps: [],
      tieBreakChain: [],
      previewUsage: summarizePreviewUsage(candidates),
      ...(completionStatistics === undefined ? {} : { completionStatistics }),
      selectedStableMoveKey: null,
      finalScore: null,
      usedFallback: false,
      failure,
    },
  };
}

function canonicalizeCandidates(def: GameDef, legalMoves: readonly Move[]): CandidateEntry[] {
  return legalMoves
    .map((move) => ({
      move,
      stableMoveKey: toMoveIdentityKey(def, move),
      actionId: String(move.actionId),
      prunedBy: [],
      scoreContributions: [],
      previewRefIds: new Set<string>(),
      unknownPreviewRefs: new Map<string, PolicyPreviewUnavailabilityReason>(),
      score: Number.NEGATIVE_INFINITY,
    }))
    .sort((left, right) => left.stableMoveKey.localeCompare(right.stableMoveKey));
}

function candidateMetadata(candidate: CandidateEntry): PolicyEvaluationCandidateMetadata {
  return {
    actionId: candidate.actionId,
    stableMoveKey: candidate.stableMoveKey,
    score: Number.isFinite(candidate.score) ? candidate.score : 0,
    prunedBy: [...candidate.prunedBy],
    scoreContributions: [...candidate.scoreContributions],
    previewRefIds: [...candidate.previewRefIds].sort(),
    unknownPreviewRefs: [...candidate.unknownPreviewRefs.entries()]
      .sort(([leftId], [rightId]) => leftId.localeCompare(rightId))
      .map(([refId, reason]) => ({ refId, reason })),
    ...(candidate.previewOutcome === undefined ? {} : { previewOutcome: candidate.previewOutcome }),
  };
}

function summarizePreviewUsage(candidates: readonly CandidateEntry[]): PolicyEvaluationPreviewUsage {
  const refIds = new Set<string>();
  const unknownRefs = new Map<string, PolicyPreviewUnavailabilityReason>();
  const evaluatedCandidates = candidates.filter((candidate) => candidate.previewRefIds.size > 0);
  for (const candidate of evaluatedCandidates) {
    candidate.previewRefIds.forEach((refId) => refIds.add(refId));
    candidate.unknownPreviewRefs.forEach((reason, refId) => unknownRefs.set(refId, reason));
  }
  return {
    evaluatedCandidateCount: evaluatedCandidates.length,
    refIds: [...refIds].sort(),
    unknownRefs: [...unknownRefs.entries()]
      .sort(([leftId], [rightId]) => leftId.localeCompare(rightId))
      .map(([refId, reason]) => ({ refId, reason })),
    outcomeBreakdown: summarizePreviewOutcomes(evaluatedCandidates),
  };
}

function emptyPreviewUsage(): PolicyEvaluationPreviewUsage {
  return {
    evaluatedCandidateCount: 0,
    refIds: [],
    unknownRefs: [],
    outcomeBreakdown: {
      ready: 0,
      unknownRandom: 0,
      unknownHidden: 0,
      unknownUnresolved: 0,
      unknownFailed: 0,
    },
  };
}

function summarizePreviewOutcomes(evaluatedCandidates: readonly CandidateEntry[]): PolicyPreviewOutcomeBreakdownTrace {
  if (evaluatedCandidates.length === 0) {
    return {
      ready: 0,
      unknownRandom: 0,
      unknownHidden: 0,
      unknownUnresolved: 0,
      unknownFailed: 0,
    };
  }

  let ready = 0;
  let random = 0;
  let hidden = 0;
  let unresolved = 0;
  let failed = 0;

  for (const candidate of evaluatedCandidates) {
    const outcome = candidate.previewOutcome;
    if (outcome === 'ready') {
      ready += 1;
      continue;
    }
    if (outcome === 'random') {
      random += 1;
      continue;
    }
    if (outcome === 'hidden') {
      hidden += 1;
      continue;
    }
    if (outcome === 'unresolved') {
      unresolved += 1;
      continue;
    }
    failed += 1;
  }

  return {
    ready,
    unknownRandom: random,
    unknownHidden: hidden,
    unknownUnresolved: unresolved,
    unknownFailed: failed,
  };
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

function selectByScalarExpr(
  candidates: readonly CandidateEntry[],
  isBetter: (left: number, right: number) => boolean,
  evaluate: (candidate: CandidateEntry) => PolicyValue,
): readonly CandidateEntry[] {
  const knownValues = candidates
    .map((candidate) => ({ candidate, value: evaluate(candidate) }))
    .filter((entry): entry is { readonly candidate: CandidateEntry; readonly value: number } => typeof entry.value === 'number');
  if (knownValues.length === 0) {
    return candidates;
  }
  let best = knownValues[0]!.value;
  for (const entry of knownValues.slice(1)) {
    if (isBetter(entry.value, best)) {
      best = entry.value;
    }
  }
  return knownValues
    .filter((entry) => entry.value === best)
    .map((entry) => entry.candidate);
}

function selectByPreferredOrder(
  candidates: readonly CandidateEntry[],
  tieBreaker: CompiledAgentTieBreaker,
  evaluate: (candidate: CandidateEntry) => PolicyValue,
): readonly CandidateEntry[] {
  const orderIndex = new Map((tieBreaker.order ?? []).map((entry, index): readonly [string, number] => [entry, index]));
  let bestRank = Number.POSITIVE_INFINITY;
  const ranked = candidates.map((candidate) => {
    const value = evaluate(candidate);
    const rank = typeof value === 'string' ? (orderIndex.get(value) ?? Number.POSITIVE_INFINITY) : Number.POSITIVE_INFINITY;
    if (rank < bestRank) {
      bestRank = rank;
    }
    return { candidate, rank };
  });
  if (!Number.isFinite(bestRank)) {
    return candidates;
  }
  return ranked.filter((entry) => entry.rank === bestRank).map((entry) => entry.candidate);
}

function resolvePolicyBindingSeatId(def: GameDef, playerId: PlayerId): string | null {
  const directSeatId = def.seats?.[playerId]?.id;
  if (typeof directSeatId === 'string' && directSeatId.length > 0) {
    return directSeatId;
  }

  if (def.seats?.length === 1) {
    const sharedSeatId = def.seats[0]?.id;
    return typeof sharedSeatId === 'string' && sharedSeatId.length > 0 ? sharedSeatId : null;
  }

  return null;
}
