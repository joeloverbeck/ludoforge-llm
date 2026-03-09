import { findActionById } from './action-capabilities.js';
import { resolveActionApplicabilityPreflight } from './action-applicability-preflight.js';
import { toExecutionPipeline } from './apply-move-pipeline.js';
import { asActionId, asPlayerId } from './branded.js';
import { selectChoiceOptionValuesByLegalityPrecedence, selectUniqueChoiceOptionValuesByLegalityPrecedence } from './choice-option-policy.js';
import { isDeclaredActionParamValueInDomain } from './declared-action-param-domain.js';
import { deepEqual } from './deep-equal.js';
import { evalCondition } from './eval-condition.js';
import { createEvalRuntimeResources } from './eval-context.js';
import { createExecutionEffectContext } from './effect-context.js';
import { applyEffects } from './effects.js';
import { resolveMoveDecisionSequence } from './move-decision-sequence.js';
import { resolveMoveEnumerationBudgets } from './move-enumeration-budgets.js';
import { decideApplyMovePipelineViability, evaluatePipelinePredicateStatus } from './pipeline-viability-policy.js';
import { resolvePlayerIndexForTurnFlowSeat, type SeatResolutionContext } from './seat-resolution.js';
import { resolveFreeOperationGrantSeatToken } from './free-operation-seat-resolution.js';
import {
  resolveFreeOperationDiscoveryAnalysis,
  isFreeOperationApplicableForMove,
  isFreeOperationGrantedForMove,
} from './free-operation-discovery-analysis.js';
import { resolveGrantFreeOperationActionDomain } from './free-operation-action-domain.js';
import { buildFreeOperationPreflightOverlay } from './free-operation-preflight-overlay.js';
import { buildMoveRuntimeBindings } from './move-runtime-bindings.js';
import { collectDecisionBindingsFromEffects, deriveDecisionBindingsFromMoveParams } from './move-runtime-bindings.js';
import { buildRuntimeTableIndex } from './runtime-table-index.js';
import { buildAdjacencyGraph } from './spatial.js';
import { materialGameplayStateProjection } from './material-gameplay-state.js';
import type {
  ChoicePendingRequest,
  GameDef,
  GameState,
  Move,
  MoveParamScalar,
  MoveParamValue,
  TurnFlowFreeOperationGrantContract,
  TurnFlowFreeOperationGrantViabilityPolicy,
  TurnFlowPendingFreeOperationGrant,
} from './types.js';

const cardDrivenRuntime = (state: GameState) =>
  state.turnOrderState.type === 'cardDriven' ? state.turnOrderState.runtime : null;

const toPendingFreeOperationGrant = (
  grant: TurnFlowFreeOperationGrantContract,
  grantId: string,
  sequenceBatchId: string | undefined,
): TurnFlowPendingFreeOperationGrant => ({
  grantId,
  seat: grant.seat,
  ...(grant.executeAsSeat === undefined ? {} : { executeAsSeat: grant.executeAsSeat }),
  operationClass: grant.operationClass,
  ...(grant.actionIds === undefined ? {} : { actionIds: [...grant.actionIds] }),
  ...(grant.zoneFilter === undefined ? {} : { zoneFilter: grant.zoneFilter }),
  ...(grant.moveZoneBindings === undefined ? {} : { moveZoneBindings: [...grant.moveZoneBindings] }),
  ...(grant.moveZoneProbeBindings === undefined ? {} : { moveZoneProbeBindings: [...grant.moveZoneProbeBindings] }),
  ...(grant.sequenceContext === undefined ? {} : { sequenceContext: grant.sequenceContext }),
  ...(grant.allowDuringMonsoon === undefined ? {} : { allowDuringMonsoon: grant.allowDuringMonsoon }),
  ...(grant.viabilityPolicy === undefined ? {} : { viabilityPolicy: grant.viabilityPolicy }),
  ...(grant.completionPolicy === undefined ? {} : { completionPolicy: grant.completionPolicy }),
  ...(grant.outcomePolicy === undefined ? {} : { outcomePolicy: grant.outcomePolicy }),
  ...(grant.postResolutionTurnFlow === undefined ? {} : { postResolutionTurnFlow: grant.postResolutionTurnFlow }),
  remainingUses: grant.uses ?? 1,
  ...(sequenceBatchId === undefined ? {} : { sequenceBatchId }),
  ...(grant.sequence?.step === undefined ? {} : { sequenceIndex: grant.sequence.step }),
});

const resolveProbeGrantSeats = (
  grant: TurnFlowFreeOperationGrantContract,
  activeSeat: string,
  seatOrder: readonly string[],
): { readonly seat: string; readonly executeAsSeat?: string } | null => {
  const seat = resolveFreeOperationGrantSeatToken(grant.seat, activeSeat, seatOrder);
  if (seat === null) {
    return null;
  }

  if (grant.executeAsSeat === undefined) {
    return { seat };
  }

  const executeAsSeat = resolveFreeOperationGrantSeatToken(grant.executeAsSeat, activeSeat, seatOrder);
  if (executeAsSeat === null) {
    return null;
  }
  return { seat, executeAsSeat };
};

const toResolvedProbePendingGrant = (
  grant: TurnFlowFreeOperationGrantContract,
  activeSeat: string,
  seatOrder: readonly string[],
  grantId: string,
): TurnFlowPendingFreeOperationGrant | null => {
  const resolvedSeats = resolveProbeGrantSeats(grant, activeSeat, seatOrder);
  if (resolvedSeats === null) {
    return null;
  }
  return {
    ...toPendingFreeOperationGrant(grant, grantId, grant.sequence === undefined ? undefined : '__probeBatch__'),
    seat: resolvedSeats.seat,
    ...(resolvedSeats.executeAsSeat === undefined ? {} : { executeAsSeat: resolvedSeats.executeAsSeat }),
  };
};

const resolveUnusableSequenceProbeBlockers = (
  def: GameDef,
  state: GameState,
  grant: TurnFlowFreeOperationGrantContract,
  activeSeat: string,
  seatOrder: readonly string[],
  seatResolution: SeatResolutionContext,
  baseBlockers: readonly TurnFlowPendingFreeOperationGrant[],
  candidates: readonly TurnFlowFreeOperationGrantContract[],
): readonly TurnFlowPendingFreeOperationGrant[] => {
  const sequence = grant.sequence;
  if (sequence === undefined) {
    return baseBlockers;
  }

  const derivedBlockers = [...baseBlockers];
  const priorCandidates = candidates
    .filter(
      (candidate) =>
        candidate.sequence !== undefined &&
        candidate.sequence.chain === sequence.chain &&
        candidate.sequence.step < sequence.step,
    )
    .sort((left, right) => left.sequence!.step - right.sequence!.step);

  for (const [index, candidate] of priorCandidates.entries()) {
    const candidateUsable = isFreeOperationGrantUsableInCurrentState(
      def,
      state,
      candidate,
      activeSeat,
      seatOrder,
      seatResolution,
      { sequenceProbeBlockers: derivedBlockers },
    );
    if (candidateUsable) {
      continue;
    }
    const blocker = toResolvedProbePendingGrant(
      candidate,
      activeSeat,
      seatOrder,
      `__probe_blocker__:${sequence.chain}:${candidate.sequence!.step}:${index}`,
    );
    if (blocker !== null) {
      derivedBlockers.push(blocker);
    }
  }

  return derivedBlockers;
};

export const DEFAULT_FREE_OPERATION_GRANT_VIABILITY_POLICY: TurnFlowFreeOperationGrantViabilityPolicy = 'emitAlways';

export const resolveFreeOperationGrantViabilityPolicy = (
  grant: Pick<TurnFlowFreeOperationGrantContract, 'viabilityPolicy'>,
): TurnFlowFreeOperationGrantViabilityPolicy =>
  grant.viabilityPolicy ?? DEFAULT_FREE_OPERATION_GRANT_VIABILITY_POLICY;

export const grantRequiresUsableProbe = (grant: Pick<TurnFlowFreeOperationGrantContract, 'viabilityPolicy'>): boolean => {
  const policy = resolveFreeOperationGrantViabilityPolicy(grant);
  return policy === 'requireUsableAtIssue' || policy === 'requireUsableForEventPlay';
};

const STRICT_FREE_OPERATION_PROBE_BUDGETS = {
  maxParamExpansions: 500_000,
  maxDecisionProbeSteps: 4_096,
} as const;

const collectProbeMoveZoneCandidates = (
  def: GameDef,
  move: Move,
  probeGrant: Pick<TurnFlowPendingFreeOperationGrant, 'moveZoneBindings' | 'moveZoneProbeBindings'>,
): readonly string[] => {
  const configuredBindings = probeGrant.moveZoneProbeBindings ?? probeGrant.moveZoneBindings;
  const zoneIdSet = new Set(def.zones.map((zone) => String(zone.id)));
  const bindings = buildMoveRuntimeBindings(move);
  const candidates = new Set<string>();
  const collectFromValue = (value: unknown): void => {
    if (typeof value === 'string' && zoneIdSet.has(value)) {
      candidates.add(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string' && zoneIdSet.has(item)) {
          candidates.add(item);
        }
      }
    }
  };

  if (configuredBindings === undefined || configuredBindings.length === 0) {
    for (const value of Object.values(move.params)) {
      collectFromValue(value);
    }
    return [...candidates];
  }

  for (const bindingName of configuredBindings) {
    for (const [candidateBindingName, value] of Object.entries(bindings)) {
      if (candidateBindingName === bindingName || candidateBindingName.startsWith(`${bindingName}@`)) {
        collectFromValue(value);
      }
    }
  }
  return [...candidates];
};

const rankProbeOptionValue = (
  state: GameState,
  value: MoveParamValue,
): number => {
  if (typeof value === 'string') {
    return state.zones[value]?.length ?? 0;
  }
  if (Array.isArray(value)) {
    return value.reduce((score, item) => (
      typeof item === 'string'
        ? score + (state.zones[item]?.length ?? 0)
        : score
    ), 0);
  }
  return 0;
};

const selectableDecisionValues = (
  def: GameDef,
  state: GameState,
  probeGrant: TurnFlowPendingFreeOperationGrant,
  currentMove: Move,
  request: ChoicePendingRequest,
): readonly MoveParamValue[] => {
  const probeValue = (value: MoveParamValue): number => {
    const fauxMove: Move = {
      actionId: currentMove.actionId,
      params: {
        ...currentMove.params,
        [request.decisionId]: value,
      },
      freeOperation: true,
    };
    const probeZones = collectProbeMoveZoneCandidates(def, fauxMove, probeGrant);
    if (probeZones.length > 0) {
      return probeZones.reduce((score, zoneId) => score + (state.zones[zoneId]?.length ?? 0), 0);
    }
    return rankProbeOptionValue(state, value);
  };
  if (request.type === 'chooseOne') {
    return [...selectChoiceOptionValuesByLegalityPrecedence(request)]
      .sort((left, right) => probeValue(right) - probeValue(left));
  }

  const selectableValues = [...selectUniqueChoiceOptionValuesByLegalityPrecedence(request)]
    .sort((left, right) => probeValue(right) - probeValue(left));
  const min = request.min ?? 0;
  const max = Math.min(request.max ?? selectableValues.length, selectableValues.length);
  const preferredSize = Math.max(min, Math.min(max, 2));
  const sizeOrder = [...new Set([
    preferredSize,
    ...Array.from({ length: max - min + 1 }, (_, index) => min + index),
    ...Array.from({ length: max - min + 1 }, (_, index) => max - index),
  ])].filter((size) => size >= min && size <= max);
  const selections: MoveParamValue[] = [];
  const current: MoveParamScalar[] = [];

  const enumerate = (start: number, remaining: number): void => {
    if (remaining === 0) {
      selections.push([...current]);
      return;
    }
    const upper = selectableValues.length - remaining;
    for (let index = start; index <= upper; index += 1) {
      current.push(selectableValues[index] as MoveParamScalar);
      enumerate(index + 1, remaining - 1);
      current.pop();
    }
  };

  for (const size of sizeOrder) {
    if (size === 0) {
      selections.push([]);
      continue;
    }
    enumerate(0, size);
  }

  return selections;
};

const decisionBindingsForMove = (
  executionProfile: ReturnType<typeof toExecutionPipeline> | undefined,
  moveParams: Move['params'],
): Readonly<Record<string, MoveParamValue>> => {
  const bindings: Record<string, MoveParamValue> = {
    ...deriveDecisionBindingsFromMoveParams(moveParams),
  };
  if (executionProfile === undefined) {
    return bindings;
  }
  const decisionBindings = new Map<string, string>();
  collectDecisionBindingsFromEffects(executionProfile.costSpend, decisionBindings);
  for (const stage of executionProfile.resolutionStages) {
    collectDecisionBindingsFromEffects(stage, decisionBindings);
  }
  for (const [decisionId, bind] of decisionBindings.entries()) {
    if (Object.prototype.hasOwnProperty.call(moveParams, decisionId)) {
      bindings[bind] = moveParams[decisionId] as MoveParamValue;
    }
  }
  return bindings;
};

const isCompletedProbeMoveCurrentlyLegal = (
  def: GameDef,
  state: GameState,
  move: Move,
  seatResolution: SeatResolutionContext,
): boolean => {
  const action = findActionById(def, move.actionId);
  if (action === undefined) {
    return false;
  }

  const adjacencyGraph = buildAdjacencyGraph(def.zones);
  const runtimeTableIndex = buildRuntimeTableIndex(def);
  const evalRuntimeResources = createEvalRuntimeResources();
  const freeOperationAnalysis = move.freeOperation === true
    ? resolveFreeOperationDiscoveryAnalysis(def, state, move, seatResolution, { zoneFilterErrorSurface: 'turnFlowEligibility' })
    : null;
  if (move.freeOperation === true && freeOperationAnalysis?.denial.cause !== 'granted') {
    return false;
  }

  const preflight = resolveActionApplicabilityPreflight({
    def,
    state,
    action,
    adjacencyGraph,
    decisionPlayer: state.activePlayer,
    bindings: buildMoveRuntimeBindings(move),
    runtimeTableIndex,
    evalRuntimeResources,
    ...buildFreeOperationPreflightOverlay(freeOperationAnalysis, move, 'turnFlowEligibility'),
  });
  if (preflight.kind !== 'applicable') {
    return false;
  }

  if (action.pre !== null && !evalCondition(action.pre, preflight.evalCtx)) {
    return false;
  }

  if (preflight.pipelineDispatch.kind === 'matched') {
    const status = evaluatePipelinePredicateStatus(action, preflight.pipelineDispatch.profile, preflight.evalCtx);
    return decideApplyMovePipelineViability(status, { isFreeOperation: move.freeOperation === true }).kind !== 'illegalMove';
  }

  for (const param of action.params) {
    if (!isDeclaredActionParamValueInDomain(param, move.params[param.name], preflight.evalCtx)) {
      return false;
    }
  }
  return true;
};

const doesCompletedProbeMoveChangeGameplayState = (
  def: GameDef,
  state: GameState,
  move: Move,
  seatResolution: SeatResolutionContext,
): boolean => {
  const action = findActionById(def, move.actionId);
  if (action === undefined) {
    return false;
  }

  const adjacencyGraph = buildAdjacencyGraph(def.zones);
  const runtimeTableIndex = buildRuntimeTableIndex(def);
  const resources = createEvalRuntimeResources();
  const freeOperationAnalysis = move.freeOperation === true
    ? resolveFreeOperationDiscoveryAnalysis(def, state, move, seatResolution, { zoneFilterErrorSurface: 'turnFlowEligibility' })
    : null;
  if (move.freeOperation === true && freeOperationAnalysis?.denial.cause !== 'granted') {
    return false;
  }
  const preflight = resolveActionApplicabilityPreflight({
    def,
    state,
    action,
    adjacencyGraph,
    decisionPlayer: state.activePlayer,
    bindings: buildMoveRuntimeBindings(move),
    runtimeTableIndex,
    evalRuntimeResources: resources,
    ...buildFreeOperationPreflightOverlay(freeOperationAnalysis, move, 'turnFlowEligibility'),
  });
  if (preflight.kind !== 'applicable') {
    return false;
  }

  const executionProfile = preflight.pipelineDispatch.kind === 'matched'
    ? toExecutionPipeline(action, preflight.pipelineDispatch.profile)
    : undefined;
  const resolvedDecisionBindings = decisionBindingsForMove(executionProfile, move.params);
  const runtimeMoveParams = {
    ...move.params,
    ...resolvedDecisionBindings,
  };
  const effectCtxBase = {
    def,
    adjacencyGraph,
    runtimeTableIndex,
    activePlayer: preflight.executionPlayer,
    actorPlayer: preflight.executionPlayer,
    bindings: buildMoveRuntimeBindings(move, resolvedDecisionBindings),
    moveParams: runtimeMoveParams,
    resources,
    state,
    rng: { state: state.rng },
  } as const;

  const afterActionState = executionProfile === undefined
    ? applyEffects(action.effects, createExecutionEffectContext({
      ...effectCtxBase,
      traceContext: {
        eventContext: 'actionEffect',
        actionId: String(action.id),
        effectPathRoot: `action:${String(action.id)}.effects`,
      },
      effectPath: '',
    })).state
    : executionProfile.resolutionStages.reduce(
      (currentState, stageEffects, stageIdx) =>
        applyEffects(stageEffects, createExecutionEffectContext({
          ...effectCtxBase,
          state: currentState,
          rng: { state: currentState.rng },
          traceContext: {
            eventContext: 'actionEffect',
            actionId: String(action.id),
            effectPathRoot: `action:${String(action.id)}.stages[${stageIdx}]`,
          },
          effectPath: '',
        })).state,
      state,
    );

  return !deepEqual(
    materialGameplayStateProjection(def, state),
    materialGameplayStateProjection(def, afterActionState),
  );
};

const hasLegalCompletedProbeMove = (
  def: GameDef,
  explorationState: GameState,
  authorizationState: GameState,
  baseMove: Move,
  seatResolution: SeatResolutionContext,
): boolean => {
  const budgets = resolveMoveEnumerationBudgets(STRICT_FREE_OPERATION_PROBE_BUDGETS);
  let decisionProbeSteps = 0;
  let paramExpansions = 0;

  const visit = (move: Move): boolean => {
    if (decisionProbeSteps >= budgets.maxDecisionProbeSteps || paramExpansions > budgets.maxParamExpansions) {
      return false;
    }
    decisionProbeSteps += 1;

    const request = resolveMoveDecisionSequence(def, explorationState, move, {
      choose: () => undefined,
      budgets,
      onWarning: () => undefined,
    });

    if (request.complete) {
      if (
        !isFreeOperationGrantedForMove(def, authorizationState, request.move, seatResolution)
        || !isCompletedProbeMoveCurrentlyLegal(def, authorizationState, request.move, seatResolution)
      ) {
        return false;
      }
      const freeOperationAnalysis = resolveFreeOperationDiscoveryAnalysis(
        def,
        authorizationState,
        request.move,
        seatResolution,
        { zoneFilterErrorSurface: 'turnFlowEligibility' },
      );
      const matchingGrantIds = freeOperationAnalysis.denial.cause === 'granted'
        ? new Set(freeOperationAnalysis.denial.matchingGrantIds ?? [])
        : new Set<string>();
      const matchingOutcomeGrantRequiresStateChange = authorizationState.turnOrderState.type === 'cardDriven'
        && (authorizationState.turnOrderState.runtime.pendingFreeOperationGrants ?? []).some((grant) =>
          matchingGrantIds.has(grant.grantId) && grant.outcomePolicy === 'mustChangeGameplayState');
      if (matchingOutcomeGrantRequiresStateChange) {
        return doesCompletedProbeMoveChangeGameplayState(def, authorizationState, request.move, seatResolution);
      }
      return true;
    }
    if (request.illegal !== undefined || request.stochasticDecision !== undefined) {
      return false;
    }

    const nextDecision = request.nextDecision;
    if (nextDecision === undefined) {
      return false;
    }

    const probeGrant = authorizationState.turnOrderState.type === 'cardDriven'
      ? authorizationState.turnOrderState.runtime.pendingFreeOperationGrants?.find((grant) => grant.grantId === '__probe__') ?? null
      : null;
    if (probeGrant === null) {
      return false;
    }
    for (const selection of selectableDecisionValues(def, authorizationState, probeGrant, request.move, nextDecision)) {
      paramExpansions += 1;
      if (paramExpansions > budgets.maxParamExpansions) {
        return false;
      }
      if (visit({
        ...request.move,
        params: {
          ...request.move.params,
          [nextDecision.decisionId]: selection,
        },
      })) {
        return true;
      }
    }
    return false;
  };

  return visit(baseMove);
};

export const isFreeOperationGrantUsableInCurrentState = (
  def: GameDef,
  state: GameState,
  grant: TurnFlowFreeOperationGrantContract,
  activeSeat: string,
  seatOrder: readonly string[],
  seatResolution: SeatResolutionContext,
  options?: {
    readonly sequenceProbeBlockers?: readonly TurnFlowPendingFreeOperationGrant[];
    readonly sequenceProbeCandidates?: readonly TurnFlowFreeOperationGrantContract[];
  },
): boolean => {
  const runtime = cardDrivenRuntime(state);
  if (runtime === null) {
    return false;
  }

  const resolvedSeats = resolveProbeGrantSeats(grant, activeSeat, seatOrder);
  if (resolvedSeats === null) {
    return false;
  }
  const { seat, executeAsSeat } = resolvedSeats;

  const probeGrant: TurnFlowPendingFreeOperationGrant = {
    ...toPendingFreeOperationGrant(grant, '__probe__', grant.sequence === undefined ? undefined : '__probeBatch__'),
    seat,
    ...(executeAsSeat === undefined ? {} : { executeAsSeat }),
  };
  const probeBlockers = resolveUnusableSequenceProbeBlockers(
    def,
    state,
    grant,
    activeSeat,
    seatOrder,
    seatResolution,
    options?.sequenceProbeBlockers ?? [],
    options?.sequenceProbeCandidates ?? [],
  );
  const pendingProbeGrants = [...probeBlockers, probeGrant];
  const probeActivePlayerIndex = resolvePlayerIndexForTurnFlowSeat(seat, seatResolution.index);
  const authorizationState: GameState = {
    ...state,
    ...(probeActivePlayerIndex === null ? {} : { activePlayer: asPlayerId(probeActivePlayerIndex) }),
    turnOrderState: {
      type: 'cardDriven',
      runtime: {
        ...runtime,
        currentCard: {
          ...runtime.currentCard,
          firstEligible: seat,
          secondEligible: null,
          actedSeats: [],
          passedSeats: [],
          nonPassCount: 0,
          firstActionClass: null,
        },
        pendingFreeOperationGrants: pendingProbeGrants,
      },
    },
  };
  const authorizationRuntime = authorizationState.turnOrderState.type === 'cardDriven'
    ? authorizationState.turnOrderState.runtime
    : null;
  if (authorizationRuntime === null) {
    return false;
  }
  const explorationState: GameState = {
    ...authorizationState,
    turnOrderState: {
      type: 'cardDriven',
      runtime: {
        ...authorizationRuntime,
        ...(authorizationRuntime.pendingFreeOperationGrants === undefined
          ? {}
          : {
            pendingFreeOperationGrants: authorizationRuntime.pendingFreeOperationGrants.map((pendingGrant: TurnFlowPendingFreeOperationGrant) => {
              if (pendingGrant.grantId !== '__probe__') {
                return pendingGrant;
              }
              const probeGrantWithoutZoneFilter = { ...pendingGrant };
              delete probeGrantWithoutZoneFilter.zoneFilter;
              return probeGrantWithoutZoneFilter;
            }),
          }),
      },
    },
  };
  const actionIds = resolveGrantFreeOperationActionDomain(def, probeGrant);
  for (const actionId of actionIds) {
    const probeMove: Move = {
      actionId: asActionId(actionId),
      params: {},
      freeOperation: true,
    };
    if (!isFreeOperationApplicableForMove(def, explorationState, probeMove, seatResolution)) {
      continue;
    }
    if (hasLegalCompletedProbeMove(def, explorationState, authorizationState, probeMove, seatResolution)) {
      return true;
    }
  }

  return false;
};
