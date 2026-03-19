import { buildAdjacencyGraph } from '../kernel/spatial.js';
import { buildRuntimeTableIndex } from '../kernel/runtime-table-index.js';
import { createEvalContext, createEvalRuntimeResources } from '../kernel/eval-context.js';
import { evalValue } from '../kernel/eval-value.js';
import { computeDerivedMetricValue } from '../kernel/derived-values.js';
import type { PlayerId } from '../kernel/branded.js';
import { buildSeatResolutionIndex, resolvePlayerIndexForSeatValue, type SeatResolutionIndex } from '../kernel/identity.js';
import { resolveTurnFlowActionClass } from '../kernel/turn-flow-action-class.js';
import { toMoveIdentityKey } from '../kernel/move-identity.js';
import type {
  AgentPolicyCatalog,
  AgentPolicyExpr,
  AgentParameterValue,
  CompiledAgentProfile,
  CompiledAgentTieBreaker,
  GameDef,
  GameState,
  Move,
  Rng,
} from '../kernel/types.js';
import type { GameDefRuntime } from '../kernel/gamedef-runtime.js';
import { pickRandom } from './agent-move-selection.js';

type PolicyValue = AgentParameterValue | undefined;

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
}

export interface PolicyEvaluationMetadata {
  readonly seatId: string | null;
  readonly profileId: string | null;
  readonly canonicalOrder: readonly string[];
  readonly candidates: readonly PolicyEvaluationCandidateMetadata[];
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
  readonly rng: Rng;
  readonly runtime?: GameDefRuntime;
  readonly fallbackOnError?: boolean;
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
  score: number;
}

interface VictorySurface {
  readonly marginBySeat: ReadonlyMap<string, number>;
  readonly rankBySeat: ReadonlyMap<string, number>;
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
  private readonly seatId: string;
  private readonly activeSeatId: string | null;
  private readonly parameterValues: Readonly<Record<string, AgentParameterValue>>;
  private readonly seatResolutionIndex: SeatResolutionIndex;
  private currentCandidates: CandidateEntry[];
  private readonly stateFeatureCache = new Map<string, PolicyValue>();
  private readonly candidateFeatureCache = new Map<string, Map<string, PolicyValue>>();
  private readonly aggregateCache = new Map<string, PolicyValue>();
  private readonly metricCache = new Map<string, number>();
  private victorySurface: VictorySurface | null = null;

  constructor(
    private readonly input: EvaluatePolicyMoveInput,
    candidates: CandidateEntry[],
    seatId: string,
    profile: CompiledAgentProfile,
  ) {
    const catalog = input.def.agents;
    if (catalog === undefined) {
      throw new PolicyRuntimeError({
        code: 'POLICY_CATALOG_MISSING',
        message: 'GameDef.agents is required to evaluate an authored policy.',
      });
    }
    this.catalog = catalog;
    this.seatId = seatId;
    this.activeSeatId = input.def.seats?.[input.state.activePlayer]?.id ?? null;
    this.parameterValues = profile.params;
    this.currentCandidates = candidates;
    this.seatResolutionIndex = buildSeatResolutionIndex(input.def, input.state.playerCount);
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
    this.ensureNonPreview(feature.costClass, `state feature "${featureId}"`);
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
    this.ensureNonPreview(feature.costClass, `candidate feature "${featureId}"`);
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
    this.ensureNonPreview(aggregate.costClass, `candidate aggregate "${aggregateId}"`);

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
    this.ensureNonPreview(scoreTerm.costClass, `score term "${scoreTermId}"`);

    if (scoreTerm.when !== undefined) {
      const when = this.evaluateExpr(scoreTerm.when, candidate);
      if (when !== true) {
        return 0;
      }
    }

    const weight = this.evaluateExpr(scoreTerm.weight, candidate);
    const value = this.evaluateExpr(scoreTerm.value, candidate);
    if (typeof weight !== 'number' || typeof value !== 'number') {
      return scoreTerm.unknownAs ?? 0;
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
    this.ensureNonPreview(tieBreaker.costClass, `tie-breaker "${tieBreakerId}"`);

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
    if (expr === null || expr === undefined) {
      return undefined;
    }
    if (typeof expr === 'number' || typeof expr === 'boolean' || typeof expr === 'string') {
      return expr;
    }
    if (Array.isArray(expr)) {
      return expr;
    }

    const entries = Object.entries(expr);
    if (entries.length !== 1) {
      throw this.runtimeError('RUNTIME_EVALUATION_ERROR', 'Policy expression objects must contain exactly one operator key.');
    }
    const [operator, value] = entries[0] as [string, AgentPolicyExpr];

    switch (operator) {
      case 'const':
        return this.evaluateExpr(value, candidate);
      case 'param':
        return typeof value === 'string' ? this.parameterValues[value] : undefined;
      case 'ref':
        return typeof value === 'string' ? this.resolveRef(value, candidate) : undefined;
      case 'add':
        return sumValues(this.evaluateExprList(value, candidate));
      case 'sub':
        return binaryNumeric(this.evaluateExprList(value, candidate), (left, right) => left - right);
      case 'mul':
        return multiplyValues(this.evaluateExprList(value, candidate));
      case 'div':
        return binaryNumeric(this.evaluateExprList(value, candidate), (left, right) => {
          if (right === 0) {
            throw this.runtimeError('RUNTIME_EVALUATION_ERROR', 'Policy expression division evaluated with a zero denominator.');
          }
          return left / right;
        });
      case 'min':
        return reduceNumeric(this.evaluateExprList(value, candidate), (left, right) => Math.min(left, right));
      case 'max':
        return reduceNumeric(this.evaluateExprList(value, candidate), (left, right) => Math.max(left, right));
      case 'abs': {
        const entry = this.evaluateExpr(value, candidate);
        return typeof entry === 'number' ? Math.abs(entry) : undefined;
      }
      case 'neg': {
        const entry = this.evaluateExpr(value, candidate);
        return typeof entry === 'number' ? -entry : undefined;
      }
      case 'eq':
      case 'ne': {
        const entriesToCompare = this.evaluateExprList(value, candidate);
        if (entriesToCompare.length !== 2 || entriesToCompare[0] === undefined || entriesToCompare[1] === undefined) {
          return undefined;
        }
        const equals = deepPolicyEqual(entriesToCompare[0], entriesToCompare[1]);
        return operator === 'eq' ? equals : !equals;
      }
      case 'lt':
      case 'lte':
      case 'gt':
      case 'gte': {
        const compared = this.evaluateExprList(value, candidate);
        if (compared.length !== 2 || typeof compared[0] !== 'number' || typeof compared[1] !== 'number') {
          return undefined;
        }
        if (operator === 'lt') return compared[0] < compared[1];
        if (operator === 'lte') return compared[0] <= compared[1];
        if (operator === 'gt') return compared[0] > compared[1];
        return compared[0] >= compared[1];
      }
      case 'and':
        return andValues(this.evaluateExprList(value, candidate));
      case 'or':
        return orValues(this.evaluateExprList(value, candidate));
      case 'not': {
        const entry = this.evaluateExpr(value, candidate);
        return typeof entry === 'boolean' ? !entry : undefined;
      }
      case 'if': {
        const args = this.evaluateExprList(value, candidate);
        if (args.length !== 3 || typeof args[0] !== 'boolean') {
          return undefined;
        }
        return args[0] ? args[1] : args[2];
      }
      case 'in': {
        const args = this.evaluateExprList(value, candidate);
        if (args.length !== 2 || args[0] === undefined || args[1] === undefined) {
          return undefined;
        }
        if (Array.isArray(args[1])) {
          return args[1].includes(String(args[0]));
        }
        return undefined;
      }
      case 'coalesce': {
        for (const entry of this.evaluateExprList(value, candidate)) {
          if (entry !== undefined) {
            return entry;
          }
        }
        return undefined;
      }
      case 'clamp': {
        const args = this.evaluateExprList(value, candidate);
        if (args.length !== 3 || typeof args[0] !== 'number' || typeof args[1] !== 'number' || typeof args[2] !== 'number') {
          return undefined;
        }
        return Math.max(args[1], Math.min(args[2], args[0]));
      }
      case 'boolToNumber': {
        const entry = this.evaluateExpr(value, candidate);
        return typeof entry === 'boolean' ? (entry ? 1 : 0) : undefined;
      }
      default:
        throw this.runtimeError(
          'RUNTIME_EVALUATION_ERROR',
          `Unsupported policy expression operator "${operator}".`,
          { operator },
        );
    }
  }

  private evaluateExprList(expr: AgentPolicyExpr, candidate: CandidateEntry | undefined): readonly PolicyValue[] {
    if (!Array.isArray(expr)) {
      return [];
    }
    return expr.map((entry) => this.evaluateExpr(entry, candidate));
  }

  private resolveRef(refPath: string, candidate: CandidateEntry | undefined): PolicyValue {
    if (refPath.startsWith('feature.')) {
      const featureId = refPath.slice('feature.'.length);
      if (candidate !== undefined && this.catalog.library.candidateFeatures[featureId] !== undefined) {
        return this.evaluateCandidateFeature(candidate, featureId);
      }
      return this.evaluateStateFeature(featureId);
    }
    if (refPath.startsWith('aggregate.')) {
      return this.evaluateAggregate(refPath.slice('aggregate.'.length));
    }
    if (refPath === 'seat.self') {
      return this.seatId;
    }
    if (refPath === 'seat.active') {
      return this.activeSeatId ?? undefined;
    }
    if (refPath === 'turn.phaseId') {
      return String(this.input.state.currentPhase);
    }
    if (refPath === 'turn.stepId') {
      return undefined;
    }
    if (refPath === 'turn.round') {
      return this.input.state.turnCount;
    }
    if (candidate !== undefined) {
      if (refPath === 'candidate.actionId') {
        return candidate.actionId;
      }
      if (refPath === 'candidate.stableMoveKey') {
        return candidate.stableMoveKey;
      }
      if (refPath === 'candidate.isPass') {
        return candidate.actionId === 'pass' || resolveTurnFlowActionClass(this.input.def, candidate.move) === 'pass';
      }
      if (refPath.startsWith('candidate.param.')) {
        const paramId = refPath.slice('candidate.param.'.length);
        const candidateParamDef = this.catalog.candidateParamDefs[paramId];
        if (candidateParamDef === undefined) {
          return undefined;
        }
        const paramValue = candidate.move.params[paramId];
        switch (candidateParamDef.type) {
          case 'number':
            return typeof paramValue === 'number' ? paramValue : undefined;
          case 'boolean':
            return typeof paramValue === 'boolean' ? paramValue : undefined;
          case 'id':
            return typeof paramValue === 'string' ? paramValue : undefined;
          case 'idList':
            return Array.isArray(paramValue) && paramValue.every((entry) => typeof entry === 'string')
              ? paramValue as AgentParameterValue
              : undefined;
        }
      }
    }
    if (refPath.startsWith('preview.')) {
      throw this.runtimeError(
        'UNSUPPORTED_PREVIEW',
        `Preview refs are not supported by the non-preview policy evaluator runtime ("${refPath}").`,
        { refPath },
      );
    }
    if (refPath.startsWith('metric.')) {
      const metricId = refPath.slice('metric.'.length);
      if (this.metricCache.has(metricId)) {
        return this.metricCache.get(metricId);
      }
      const value = computeDerivedMetricValue(this.input.def, this.input.state, metricId);
      this.metricCache.set(metricId, value);
      return value;
    }
    if (refPath.startsWith('var.global.')) {
      const variableId = refPath.slice('var.global.'.length);
      const value = this.input.state.globalVars[variableId];
      return typeof value === 'number' ? value : undefined;
    }
    if (refPath.startsWith('var.seat.')) {
      return this.resolveSeatVarRef(refPath);
    }
    if (refPath.startsWith('victory.currentMargin.')) {
      const seatToken = refPath.slice('victory.currentMargin.'.length);
      return this.getVictorySurface().marginBySeat.get(this.resolveSeatToken(seatToken));
    }
    if (refPath.startsWith('victory.currentRank.')) {
      const seatToken = refPath.slice('victory.currentRank.'.length);
      return this.getVictorySurface().rankBySeat.get(this.resolveSeatToken(seatToken));
    }

    throw this.runtimeError(
      'UNSUPPORTED_RUNTIME_REF',
      `Policy runtime ref "${refPath}" is unsupported by the non-preview evaluator runtime.`,
      { refPath },
    );
  }

  private resolveSeatVarRef(refPath: string): PolicyValue {
    const parts = refPath.split('.');
    if (parts.length !== 4) {
      return undefined;
    }
    const seatToken = parts[2];
    const variableId = parts[3];
    if (seatToken === undefined || variableId === undefined) {
      return undefined;
    }
    const playerIndex = resolvePlayerIndexForSeatValue(this.resolveSeatToken(seatToken), this.seatResolutionIndex);
    if (playerIndex === null) {
      return undefined;
    }
    const value = this.input.state.perPlayerVars[playerIndex]?.[variableId];
    return typeof value === 'number' ? value : undefined;
  }

  private resolveSeatToken(seatToken: string): string {
    if (seatToken === 'self') {
      return this.seatId;
    }
    if (seatToken === 'active') {
      if (this.activeSeatId === null) {
        throw this.runtimeError('SEAT_UNRESOLVED', 'Active seat id is unavailable for policy evaluation.');
      }
      return this.activeSeatId;
    }
    return seatToken;
  }

  private getVictorySurface(): VictorySurface {
    if (this.victorySurface !== null) {
      return this.victorySurface;
    }

    const margins = this.input.def.terminal.margins ?? [];
    if (margins.length === 0) {
      throw this.runtimeError(
        'UNSUPPORTED_RUNTIME_REF',
        'victory.currentMargin/currentRank refs require def.terminal.margins to be defined.',
      );
    }

    const adjacencyGraph = this.input.runtime?.adjacencyGraph ?? buildAdjacencyGraph(this.input.def.zones);
    const runtimeTableIndex = this.input.runtime?.runtimeTableIndex ?? buildRuntimeTableIndex(this.input.def);
    const resources = createEvalRuntimeResources();
    const evalContext = createEvalContext({
      def: this.input.def,
      adjacencyGraph,
      state: this.input.state,
      activePlayer: this.input.state.activePlayer,
      actorPlayer: this.input.state.activePlayer,
      bindings: {},
      runtimeTableIndex,
      resources,
    });

    const rows = margins.map((marginDef) => {
      const margin = evalValue(marginDef.value, evalContext);
      if (typeof margin !== 'number') {
        throw this.runtimeError(
          'RUNTIME_EVALUATION_ERROR',
          `Victory margin "${marginDef.seat}" did not evaluate to a number.`,
          { seat: marginDef.seat },
        );
      }
      return { seat: marginDef.seat, margin };
    });

    const order = this.input.def.terminal.ranking?.order ?? 'desc';
    const tieBreakOrder = this.input.def.terminal.ranking?.tieBreakOrder ?? [];
    const tieBreakIndex = new Map(tieBreakOrder.map((seat, index): readonly [string, number] => [seat, index]));
    rows.sort((left, right) => {
      if (left.margin !== right.margin) {
        return order === 'desc' ? right.margin - left.margin : left.margin - right.margin;
      }
      const leftOrder = tieBreakIndex.get(left.seat) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = tieBreakIndex.get(right.seat) ?? Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
      return left.seat.localeCompare(right.seat);
    });

    const marginBySeat = new Map<string, number>();
    const rankBySeat = new Map<string, number>();
    rows.forEach((row, index) => {
      marginBySeat.set(row.seat, row.margin);
      rankBySeat.set(row.seat, index + 1);
    });
    this.victorySurface = { marginBySeat, rankBySeat };
    return this.victorySurface;
  }

  ensureNonPreview(costClass: string, label: string): void {
    if (costClass === 'preview') {
      throw this.runtimeError(
        'UNSUPPORTED_PREVIEW',
        `The non-preview policy evaluator cannot execute ${label} because it depends on preview data.`,
        { label },
      );
    }
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

  if (candidates.length === 0) {
    return {
      kind: 'failure',
      failure: {
        code: 'EMPTY_LEGAL_MOVES',
        message: 'Policy evaluation requires at least one legal move.',
      },
      metadata: {
        seatId: null,
        profileId: null,
        canonicalOrder,
        candidates: [],
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
    return failureWithMetadata(candidates, null, null, {
      code: 'POLICY_CATALOG_MISSING',
      message: 'GameDef.agents is required to evaluate an authored policy.',
    });
  }

  const seatId = input.def.seats?.[input.playerId]?.id ?? null;
  if (seatId === null) {
    return failureWithMetadata(candidates, null, null, {
      code: 'SEAT_UNRESOLVED',
      message: `Player ${input.playerId} does not resolve to a canonical seat id for policy binding.`,
      detail: { playerId: input.playerId },
    });
  }

  const profileId = catalog.bindingsBySeat[seatId];
  if (profileId === undefined) {
    return failureWithMetadata(candidates, seatId, null, {
      code: 'PROFILE_BINDING_MISSING',
      message: `Seat "${seatId}" is not bound to an authored policy profile.`,
      detail: { seatId },
    });
  }

  const profile = catalog.profiles[profileId];
  if (profile === undefined) {
    return failureWithMetadata(candidates, seatId, profileId, {
      code: 'PROFILE_MISSING',
      message: `Compiled policy profile "${profileId}" is missing from GameDef.agents.profiles.`,
      detail: { seatId, profileId },
    });
  }

  try {
    const evaluation = new EvaluationContext(input, candidates, seatId, profile);
    let activeCandidates = [...candidates];

    for (const featureId of profile.plan.stateFeatures) {
      evaluation.evaluateStateFeature(featureId);
    }
    for (const candidate of activeCandidates) {
      for (const featureId of profile.plan.candidateFeatures) {
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
      evaluation.ensureNonPreview(pruningRule.costClass, `pruning rule "${pruningRuleId}"`);
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
      const tieBreakResult = evaluation.applyTieBreaker(bestCandidates, tieBreakerId, rng);
      bestCandidates = [...tieBreakResult.candidates];
      rng = tieBreakResult.rng;
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
        profileId,
        canonicalOrder,
        candidates: candidates.map(candidateMetadata),
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
    return failureWithMetadata(candidates, seatId, profileId, failure);
  }
}

export function evaluatePolicyMove(input: EvaluatePolicyMoveInput): PolicyEvaluationResult {
  const core = evaluatePolicyMoveCore(input);
  if (core.kind === 'success') {
    return core;
  }

  const candidates = canonicalizeCandidates(input.def, input.legalMoves);
  const fallbackMove = candidates[0]?.move;
  if (fallbackMove === undefined || input.fallbackOnError === false) {
    throw new PolicyRuntimeError(core.failure);
  }

  return {
    move: fallbackMove,
    rng: input.rng,
    metadata: {
      ...core.metadata,
      usedFallback: true,
    },
  };
}

function failureWithMetadata(
  candidates: readonly CandidateEntry[],
  seatId: string | null,
  profileId: string | null,
  failure: PolicyEvaluationFailure,
): PolicyEvaluationCoreResult {
  return {
    kind: 'failure',
    failure,
    metadata: {
      seatId,
      profileId,
      canonicalOrder: candidates.map((candidate) => candidate.stableMoveKey),
      candidates: candidates.map(candidateMetadata),
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
  };
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
