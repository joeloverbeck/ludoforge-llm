import { asPlayerId } from './branded.js';
import { createEvalContext, createEvalRuntimeResources } from './eval-context.js';
import {
  resolveBoundaryDurationsAtTurnEnd,
  resolveEventEligibilityOverrides,
  resolveEventFreeOperationGrants,
} from './event-execution.js';
import { resolveFreeOperationExecutionContext } from './free-operation-execution-context.js';
import { kernelRuntimeError } from './runtime-error.js';
import {
  createSeatResolutionContext,
  normalizeSeatOrder,
  resolvePlayerIndexForTurnFlowSeat,
  type SeatResolutionContext,
} from './identity.js';
import { createDeferredLifecycleTraceEntry } from './turn-flow-deferred-lifecycle-trace.js';
import { cardDrivenConfig, cardDrivenRuntime } from './card-driven-accessors.js';
import {
  doesGrantPotentiallyAuthorizeMove,
} from './free-operation-grant-authorization.js';
import {
  appendSkippedSequenceStep,
  ensureFreeOperationSequenceBatchContext,
  resolvePendingFreeOperationGrantSequenceStatus,
  resolveSequenceProgressionPolicy,
} from './free-operation-sequence-progression.js';
import { advanceToReady } from './grant-lifecycle.js';
import { resolveFreeOperationGrantSeatToken } from './free-operation-seat-resolution.js';
import { buildMoveRuntimeBindings } from './move-runtime-bindings.js';
import { buildAdjacencyGraph } from './spatial.js';
import { applyTurnFlowCardBoundary } from './turn-flow-lifecycle.js';
import { resolveTurnFlowActionClass } from './turn-flow-action-class.js';
import { TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS } from './turn-flow-active-seat-invariant-surfaces.js';
import {
  assertCardMetadataSeatOrderRuntimeInvariant,
  requireCardDrivenActiveSeat,
} from './turn-flow-runtime-invariants.js';
import {
  grantRequiresUsableProbe,
  isFreeOperationGrantUsableInCurrentState,
  resolveFreeOperationGrantViabilityPolicy,
} from './free-operation-viability.js';
import type {
  EventFreeOperationGrantDef,
  GameDef,
  GameState,
  Move,
  TurnFlowFreeOperationGrantContract,
  TriggerLogEntry,
  TurnFlowDuration,
  TurnFlowDeferredEventEffectPayload,
  TurnFlowPendingDeferredEventEffect,
  TurnFlowPendingEligibilityOverride,
  TurnFlowPendingFreeOperationGrant,
  TurnFlowReleasedDeferredEventEffect,
  TurnFlowRuntimeCardState,
  TurnFlowRuntimeState,
} from './types.js';

interface TurnFlowTransitionResult {
  readonly state: GameState;
  readonly traceEntries: readonly TriggerLogEntry[];
  readonly boundaryDurations?: readonly TurnFlowDuration[];
  readonly releasedDeferredEventEffects?: readonly TurnFlowReleasedDeferredEventEffect[];
}

const isPassAction = (def: GameDef, move: Move): boolean =>
  String(move.actionId) === 'pass' || resolveTurnFlowActionClass(def, move) === 'pass';

const normalizeFirstActionClass = (
  actionClass: ReturnType<typeof resolveTurnFlowActionClass>,
): 'event' | 'operation' | 'operationPlusSpecialActivity' | null => {
  if (actionClass === 'limitedOperation') {
    return 'operation';
  }
  if (actionClass === 'specialActivity') {
    return 'operationPlusSpecialActivity';
  }
  if (actionClass === 'event' || actionClass === 'operation' || actionClass === 'operationPlusSpecialActivity') {
    return actionClass;
  }
  return null;
};

const readNumericResource = (vars: Readonly<Record<string, number | boolean>>, name: string): number => {
  const value = vars[name];
  if (value === undefined) {
    return 0;
  }
  if (typeof value !== 'number') {
    throw kernelRuntimeError(
      'TURN_FLOW_PASS_REWARD_NON_NUMERIC_RESOURCE',
      `Turn-flow pass reward requires numeric global var: ${name}`,
      { resource: name },
    );
  }
  return value;
};

const computeCandidates = (
  seatOrder: readonly string[],
  eligibility: Readonly<Record<string, boolean>>,
  actedSeats: ReadonlySet<string>,
): { readonly first: string | null; readonly second: string | null } => {
  const candidates = seatOrder.filter((seat) => eligibility[seat] === true && !actedSeats.has(seat));
  return {
    first: candidates[0] ?? null,
    second: candidates[1] ?? null,
  };
};

const isBlockingPendingFreeOperationGrant = (
  grant: TurnFlowPendingFreeOperationGrant,
): boolean =>
  (grant.phase === 'ready' || grant.phase === 'offered')
  && (grant.completionPolicy === 'required' || grant.completionPolicy === 'skipIfNoLegalCompletion');

const resolveReadyPendingFreeOperationGrantSeats = (
  pending: readonly TurnFlowPendingFreeOperationGrant[],
  seatOrder: readonly string[],
): { readonly first: string | null; readonly second: string | null } => {
  const readySeats = new Set(
    pending
      .filter(
        (grant) => grant.phase === 'ready' && isBlockingPendingFreeOperationGrant(grant),
      )
      .map((grant) => grant.seat),
  );
  const ordered = seatOrder.filter((seat) => readySeats.has(seat));
  return {
    first: ordered[0] ?? null,
    second: ordered[1] ?? null,
  };
};

const withReadyGrantCandidates = (
  pending: readonly TurnFlowPendingFreeOperationGrant[],
  seatOrder: readonly string[],
  currentCard: TurnFlowRuntimeCardState,
): TurnFlowRuntimeCardState => {
  const required = resolveReadyPendingFreeOperationGrantSeats(pending, seatOrder);
  if (required.first === null && required.second === null) {
    return currentCard;
  }
  return {
    ...currentCard,
    firstEligible: required.first,
    secondEligible: required.second,
  };
};

const hasReadyPendingFreeOperationGrantForSeat = (
  pending: readonly TurnFlowPendingFreeOperationGrant[],
  seat: string,
): boolean =>
  pending.some((grant) =>
    grant.seat === seat
    && grant.phase === 'ready'
    && isBlockingPendingFreeOperationGrant(grant));

export const advanceSequenceReadyPendingFreeOperationGrants = (
  pending: readonly TurnFlowPendingFreeOperationGrant[],
  sequenceContexts: TurnFlowRuntimeState['freeOperationSequenceContexts'] | undefined,
): {
  readonly grants: readonly TurnFlowPendingFreeOperationGrant[];
  readonly traceEntries: readonly TriggerLogEntry[];
} => {
  const traceEntries: TriggerLogEntry[] = [];
  let changed = false;
  const grants = pending.map((grant) => {
    if (grant.phase !== 'sequenceWaiting') {
      return grant;
    }
    if (!resolvePendingFreeOperationGrantSequenceStatus(pending, grant, sequenceContexts).ready) {
      return grant;
    }
    changed = true;
    const transitioned = advanceToReady(grant);
    traceEntries.push(transitioned.traceEntry);
    return transitioned.grant;
  });
  return changed ? { grants, traceEntries } : { grants: pending, traceEntries };
};

const cardSnapshot = (card: TurnFlowRuntimeCardState): Pick<TurnFlowRuntimeCardState, 'firstEligible' | 'secondEligible' | 'actedSeats' | 'passedSeats' | 'nonPassCount' | 'firstActionClass'> => ({
  firstEligible: card.firstEligible,
  secondEligible: card.secondEligible,
  actedSeats: card.actedSeats,
  passedSeats: card.passedSeats,
  nonPassCount: card.nonPassCount,
  firstActionClass: card.firstActionClass,
});

const indexOverrideWindows = (
  def: GameDef,
): Readonly<Record<string, TurnFlowDuration>> =>
  Object.fromEntries((cardDrivenConfig(def)?.turnFlow.windows ?? []).map((windowDef) => [windowDef.id, windowDef.duration]));

const resolveSeatId = (
  seat: string,
  seatOrder: readonly string[],
): string | null => {
  return seatOrder.includes(seat) ? seat : null;
};

const isEventMoveBlockedByGrantViabilityPolicy = (
  def: GameDef,
  state: GameState,
  move: Move,
  activeSeat: string,
  seatOrder: readonly string[],
  seatResolution: SeatResolutionContext,
): boolean => {
  const grantEvalContext = createEvalContext({
    def,
    adjacencyGraph: buildAdjacencyGraph(def.zones),
    state,
    activePlayer: state.activePlayer,
    actorPlayer: state.activePlayer,
    bindings: buildMoveRuntimeBindings(move),
    resources: createEvalRuntimeResources(),
  });
  for (const grant of resolveEventFreeOperationGrants(def, state, move)) {
    if (resolveFreeOperationGrantViabilityPolicy(grant) !== 'requireUsableForEventPlay') {
      continue;
    }
    if (!isFreeOperationGrantUsableInCurrentState(def, state, grant, activeSeat, seatOrder, seatResolution, { evalContext: grantEvalContext })) {
      return true;
    }
  }
  return false;
};

export const isEventMovePlayableUnderGrantViabilityPolicy = (
  def: GameDef,
  state: GameState,
  move: Move,
  seatResolution: SeatResolutionContext,
): boolean => {
  const runtime = cardDrivenRuntime(state);
  if (runtime === null) {
    return true;
  }
  const activeSeat = requireCardDrivenActiveSeat(
    def,
    state,
    TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS.WINDOW_FILTER_APPLICATION,
    seatResolution,
  );
  return !isEventMoveBlockedByGrantViabilityPolicy(def, state, move, activeSeat, runtime.seatOrder, seatResolution);
};

const extractPendingEligibilityOverrides = (
  def: GameDef,
  state: GameState,
  move: Move,
  activeSeat: string,
  seatOrder: readonly string[],
): readonly TurnFlowPendingEligibilityOverride[] => {
  const windowById = indexOverrideWindows(def);
  const overrides: TurnFlowPendingEligibilityOverride[] = [];
  for (const declaration of resolveEventEligibilityOverrides(def, state, move)) {
    const seat =
      declaration.target.kind === 'active'
        ? activeSeat
        : resolveSeatId(declaration.target.seat, seatOrder);
    const duration = windowById[declaration.windowId];
    if (seat === null || (duration !== 'nextTurn' && duration !== 'turn')) {
      continue;
    }
    overrides.push({
      seat,
      eligible: declaration.eligible,
      windowId: declaration.windowId,
      duration,
    });
  }

  return overrides;
};

const applyEligibilityOverrides = (
  eligibility: Readonly<Record<string, boolean>>,
  overrides: readonly TurnFlowPendingEligibilityOverride[],
): Readonly<Record<string, boolean>> => {
  if (overrides.length === 0) {
    return eligibility;
  }
  const nextEligibility = { ...eligibility };
  for (const override of overrides) {
    nextEligibility[override.seat] = override.eligible;
  }
  return nextEligibility;
};

const toPendingFreeOperationGrant = (
  grant: TurnFlowFreeOperationGrantContract,
  grantId: string,
  sequenceBatchId: string | undefined,
  executionContext?: TurnFlowPendingFreeOperationGrant['executionContext'],
): TurnFlowPendingFreeOperationGrant => ({
  grantId,
  phase: grant.sequence?.step === undefined || grant.sequence.step === 0 ? 'ready' : 'sequenceWaiting',
  seat: grant.seat,
  ...(grant.executeAsSeat === undefined ? {} : { executeAsSeat: grant.executeAsSeat }),
  operationClass: grant.operationClass,
  ...(grant.actionIds === undefined ? {} : { actionIds: [...grant.actionIds] }),
  ...(grant.zoneFilter === undefined ? {} : { zoneFilter: grant.zoneFilter }),
  ...(grant.tokenInterpretations === undefined ? {} : { tokenInterpretations: grant.tokenInterpretations }),
  ...(grant.moveZoneBindings === undefined ? {} : { moveZoneBindings: [...grant.moveZoneBindings] }),
  ...(grant.moveZoneProbeBindings === undefined ? {} : { moveZoneProbeBindings: [...grant.moveZoneProbeBindings] }),
  ...(grant.allowDuringMonsoon === undefined ? {} : { allowDuringMonsoon: grant.allowDuringMonsoon }),
  ...(grant.sequenceContext === undefined ? {} : { sequenceContext: grant.sequenceContext }),
  ...(executionContext === undefined ? {} : { executionContext }),
  ...(grant.viabilityPolicy === undefined ? {} : { viabilityPolicy: grant.viabilityPolicy }),
  ...(grant.completionPolicy === undefined ? {} : { completionPolicy: grant.completionPolicy }),
  ...(grant.outcomePolicy === undefined ? {} : { outcomePolicy: grant.outcomePolicy }),
  ...(grant.postResolutionTurnFlow === undefined ? {} : { postResolutionTurnFlow: grant.postResolutionTurnFlow }),
  remainingUses: grant.uses ?? 1,
  ...(sequenceBatchId === undefined ? {} : { sequenceBatchId }),
  ...(grant.sequence === undefined ? {} : { sequenceIndex: grant.sequence.step }),
});

const pendingFreeOperationGrantBaseId = (
  state: GameState,
  move: Move,
  grant: EventFreeOperationGrantDef,
  grantIndex: number,
): string =>
  grant.id ?? `freeOp:${state.turnCount}:${String(state.activePlayer)}:${String(move.actionId)}:${grantIndex}`;

const pendingFreeOperationGrantBatchBaseId = (
  state: GameState,
  move: Move,
): string =>
  `freeOpBatch:${state.turnCount}:${String(state.activePlayer)}:${String(move.actionId)}`;

const makeUniquePendingFreeOperationGrantId = (
  grants: readonly TurnFlowPendingFreeOperationGrant[],
  baseId: string,
): string => {
  const existing = new Set(grants.map((grant) => grant.grantId));
  if (!existing.has(baseId)) {
    return baseId;
  }
  let suffix = 2;
  let candidate = `${baseId}#${suffix}`;
  while (existing.has(candidate)) {
    suffix += 1;
    candidate = `${baseId}#${suffix}`;
  }
  return candidate;
};

const extractPendingFreeOperationGrants = (
  def: GameDef,
  state: GameState,
  move: Move,
  activeSeat: string,
  seatOrder: readonly string[],
  seatResolution: SeatResolutionContext,
  existingPendingFreeOperationGrants: readonly TurnFlowPendingFreeOperationGrant[],
  existingSequenceContexts: TurnFlowRuntimeState['freeOperationSequenceContexts'] | undefined,
): {
  readonly grants: readonly TurnFlowPendingFreeOperationGrant[];
  readonly sequenceContexts: TurnFlowRuntimeState['freeOperationSequenceContexts'] | undefined;
} => {
  const extracted: TurnFlowPendingFreeOperationGrant[] = [];
  let sequenceContexts = existingSequenceContexts;
  const blockedStrictSequenceBatchIds = new Set<string>();
  const emittedBatchBaseId = pendingFreeOperationGrantBatchBaseId(state, move);
  const declaredGrants = resolveEventFreeOperationGrants(def, state, move);
  const adjacencyGraph = buildAdjacencyGraph(def.zones);
  const grantEvalContext = createEvalContext({
    def,
    adjacencyGraph,
    state,
    activePlayer: state.activePlayer,
    actorPlayer: state.activePlayer,
    bindings: buildMoveRuntimeBindings(move),
    resources: createEvalRuntimeResources(),
  });
  for (const [grantIndex, grant] of declaredGrants.entries()) {
    const sequenceBatchId = grant.sequence === undefined
      ? undefined
      : `${emittedBatchBaseId}:${grant.sequence.batch}`;
    const sequenceIndex = grant.sequence?.step;
    const sequenceProgressionPolicy = resolveSequenceProgressionPolicy(grant);
    if (
      sequenceBatchId !== undefined
      && sequenceProgressionPolicy === 'strictInOrder'
      && blockedStrictSequenceBatchIds.has(sequenceBatchId)
    ) {
      continue;
    }
    const sequenceProbeCandidates = grant.sequence === undefined
      ? []
      : declaredGrants
        .filter(
          (candidate) =>
            candidate.sequence !== undefined
            && candidate.sequence.batch === grant.sequence.batch
            && candidate.sequence.step < grant.sequence.step,
        );
    if (
      grantRequiresUsableProbe(grant) &&
      !isFreeOperationGrantUsableInCurrentState(def, state, grant, activeSeat, seatOrder, seatResolution, {
        sequenceProbeCandidates,
        evalContext: grantEvalContext,
      })
    ) {
      if (
        sequenceBatchId !== undefined
        && sequenceIndex !== undefined
        && sequenceProgressionPolicy === 'strictInOrder'
      ) {
        blockedStrictSequenceBatchIds.add(sequenceBatchId);
      }
      if (
        sequenceBatchId !== undefined
        && sequenceIndex !== undefined
        && sequenceProgressionPolicy === 'implementWhatCanInOrder'
      ) {
        sequenceContexts = appendSkippedSequenceStep(
          sequenceContexts,
          sequenceBatchId,
          sequenceProgressionPolicy,
          sequenceIndex,
        );
      }
      continue;
    }
    const seat = resolveFreeOperationGrantSeatToken(grant.seat, activeSeat, seatOrder);
    if (seat === null) {
      continue;
    }
    let executeAsSeat: string | undefined;
    if (grant.executeAsSeat !== undefined) {
      const resolvedExecuteAs = resolveFreeOperationGrantSeatToken(grant.executeAsSeat, activeSeat, seatOrder);
      if (resolvedExecuteAs === null) {
        continue;
      }
      executeAsSeat = resolvedExecuteAs;
    }
    const baseId = pendingFreeOperationGrantBaseId(state, move, grant, grantIndex);
    const grantId = makeUniquePendingFreeOperationGrantId(
      [...existingPendingFreeOperationGrants, ...extracted],
      baseId,
    );
    extracted.push({
      ...toPendingFreeOperationGrant(
        grant,
        grantId,
        sequenceBatchId,
        resolveFreeOperationExecutionContext(grant.executionContext, grantEvalContext),
      ),
      seat,
      ...(executeAsSeat === undefined ? {} : { executeAsSeat }),
    });
    if (sequenceBatchId !== undefined) {
      sequenceContexts = ensureFreeOperationSequenceBatchContext(
        sequenceContexts,
        sequenceBatchId,
        resolveSequenceProgressionPolicy(grant),
      );
    }
  }
  return {
    grants: extracted,
    sequenceContexts,
  };
};

export const toPendingFreeOperationGrants = (
  grants: readonly TurnFlowPendingFreeOperationGrant[],
): readonly TurnFlowPendingFreeOperationGrant[] | undefined =>
  grants.length === 0 ? undefined : grants;

export const toPendingDeferredEventEffects = (
  deferred: readonly TurnFlowPendingDeferredEventEffect[],
): readonly TurnFlowPendingDeferredEventEffect[] | undefined =>
  deferred.length === 0 ? undefined : deferred;

export const withPendingFreeOperationGrants = (
  runtime: TurnFlowRuntimeState,
  grants: readonly TurnFlowPendingFreeOperationGrant[] | undefined,
): TurnFlowRuntimeState => {
  const nextRuntime = {
    ...runtime,
    ...(grants === undefined ? {} : { pendingFreeOperationGrants: grants }),
  };
  if (grants === undefined) {
    delete (nextRuntime as { pendingFreeOperationGrants?: readonly TurnFlowPendingFreeOperationGrant[] }).pendingFreeOperationGrants;
  }
  return nextRuntime;
};

export const withPendingDeferredEventEffects = (
  runtime: TurnFlowRuntimeState,
  deferred: readonly TurnFlowPendingDeferredEventEffect[] | undefined,
): TurnFlowRuntimeState => {
  const nextRuntime = {
    ...runtime,
    ...(deferred === undefined ? {} : { pendingDeferredEventEffects: deferred }),
  };
  if (deferred === undefined) {
    delete (nextRuntime as { pendingDeferredEventEffects?: readonly TurnFlowPendingDeferredEventEffect[] }).pendingDeferredEventEffects;
  }
  return nextRuntime;
};

export const withSuspendedCardEnd = (
  runtime: TurnFlowRuntimeState,
  suspendedCardEnd: TurnFlowRuntimeState['suspendedCardEnd'] | undefined,
): TurnFlowRuntimeState => {
  const nextRuntime = {
    ...runtime,
    ...(suspendedCardEnd === undefined ? {} : { suspendedCardEnd }),
  };
  if (suspendedCardEnd === undefined) {
    delete (nextRuntime as { suspendedCardEnd?: TurnFlowRuntimeState['suspendedCardEnd'] }).suspendedCardEnd;
  }
  return nextRuntime;
};

export const withFreeOperationSequenceContexts = (
  runtime: TurnFlowRuntimeState,
  contexts: TurnFlowRuntimeState['freeOperationSequenceContexts'] | undefined,
): TurnFlowRuntimeState => {
  const nextRuntime = {
    ...runtime,
    ...(contexts === undefined ? {} : { freeOperationSequenceContexts: contexts }),
  };
  if (contexts === undefined) {
    delete (nextRuntime as { freeOperationSequenceContexts?: TurnFlowRuntimeState['freeOperationSequenceContexts'] }).freeOperationSequenceContexts;
  }
  return nextRuntime;
};

export const trimFreeOperationSequenceContextsToPendingBatches = (
  contexts: TurnFlowRuntimeState['freeOperationSequenceContexts'] | undefined,
  pending: readonly TurnFlowPendingFreeOperationGrant[],
): TurnFlowRuntimeState['freeOperationSequenceContexts'] | undefined => {
  if (contexts === undefined) {
    return undefined;
  }
  const pendingBatchIds = new Set(
    pending
      .map((grant) => grant.sequenceBatchId)
      .filter((batchId): batchId is string => typeof batchId === 'string' && batchId.length > 0),
  );
  const kept = Object.entries(contexts).filter(([batchId]) => pendingBatchIds.has(batchId));
  return kept.length === 0 ? undefined : Object.fromEntries(kept);
};

const uniqueBatchIds = (
  grants: readonly TurnFlowPendingFreeOperationGrant[],
): readonly string[] => {
  const ids = new Set<string>();
  for (const grant of grants) {
    if (typeof grant.sequenceBatchId === 'string' && grant.sequenceBatchId.length > 0) {
      ids.add(grant.sequenceBatchId);
    }
  }
  return [...ids];
};

const makeUniqueDeferredEventEffectId = (
  deferred: readonly TurnFlowPendingDeferredEventEffect[],
  baseId: string,
): string => {
  const existing = new Set(deferred.map((entry) => entry.deferredId));
  if (!existing.has(baseId)) {
    return baseId;
  }
  let suffix = 2;
  let candidate = `${baseId}#${suffix}`;
  while (existing.has(candidate)) {
    suffix += 1;
    candidate = `${baseId}#${suffix}`;
  }
  return candidate;
};

export const splitReadyDeferredEventEffects = (
  deferred: readonly TurnFlowPendingDeferredEventEffect[],
  pendingGrants: readonly TurnFlowPendingFreeOperationGrant[],
): {
  readonly remaining: readonly TurnFlowPendingDeferredEventEffect[];
  readonly ready: readonly TurnFlowReleasedDeferredEventEffect[];
} => {
  const pendingBatchIds = new Set(
    pendingGrants
      .map((grant) => grant.sequenceBatchId)
      .filter((value): value is string => typeof value === 'string' && value.length > 0),
  );
  const remaining: TurnFlowPendingDeferredEventEffect[] = [];
  const ready: TurnFlowReleasedDeferredEventEffect[] = [];
  for (const candidate of deferred) {
    const isReady = candidate.requiredGrantBatchIds.every((batchId) => !pendingBatchIds.has(batchId));
    if (isReady) {
      ready.push({
        deferredId: candidate.deferredId,
        requiredGrantBatchIds: candidate.requiredGrantBatchIds,
        effects: candidate.effects,
        moveParams: candidate.moveParams,
        actorPlayer: candidate.actorPlayer,
        actionId: candidate.actionId,
      });
      continue;
    }
    remaining.push(candidate);
  }
  return { remaining, ready };
};

const computePostCardEligibility = (
  seatOrder: readonly string[],
  currentCard: TurnFlowRuntimeCardState,
  overrides: readonly TurnFlowPendingEligibilityOverride[],
): Readonly<Record<string, boolean>> => {
  const passed = new Set(currentCard.passedSeats);
  const executed = new Set(currentCard.actedSeats.filter((seat) => !passed.has(seat)));
  const eligibility = Object.fromEntries(seatOrder.map((seat) => [seat, !executed.has(seat)]));
  for (const override of overrides) {
    eligibility[override.seat] = override.eligible;
  }
  return eligibility;
};

const finalizeSuspendedOrEndedCard = (
  def: GameDef,
  rewardState: GameState,
  runtime: TurnFlowRuntimeState,
  seatResolution: SeatResolutionContext,
  currentCard: TurnFlowRuntimeCardState,
  pendingOverrides: readonly TurnFlowPendingEligibilityOverride[],
  pendingFreeOperationGrants: readonly TurnFlowPendingFreeOperationGrant[],
  pendingDeferredEventEffects: readonly TurnFlowPendingDeferredEventEffect[],
  activeSeat: string,
  endedReason: 'rightmostPass' | 'twoNonPass',
): TurnFlowTransitionResult => {
  let nextEligibility: Readonly<Record<string, boolean>>;
  let nextSeatOrder = runtime.seatOrder;
  let baseState = rewardState;
  let boundaryDurations: readonly TurnFlowDuration[] | undefined;
  const traceEntries: TriggerLogEntry[] = [];

  const coupPhaseIds = def.turnOrder?.type === 'cardDriven'
    ? new Set((def.turnOrder.config.coupPlan?.phases ?? []).map((p) => String(p.id)))
    : new Set<string>();
  const roundEndsInCoupPhase = coupPhaseIds.has(String(rewardState.currentPhase));

  if (roundEndsInCoupPhase) {
    nextEligibility = Object.fromEntries(
      runtime.seatOrder.map((seat) => [seat, false]),
    ) as Readonly<Record<string, boolean>>;
  } else {
    nextEligibility = computePostCardEligibility(runtime.seatOrder, currentCard, pendingOverrides);
    const lifecycle = applyTurnFlowCardBoundary(def, rewardState);
    baseState = lifecycle.state;
    traceEntries.push(...lifecycle.traceEntries);
    boundaryDurations = resolveBoundaryDurationsAtTurnEnd(lifecycle.traceEntries);
    const cardSeatOrder = resolveCardSeatOrder(def, baseState, seatResolution);
    if (cardSeatOrder !== null) {
      nextSeatOrder = cardSeatOrder;
    }
  }

  const resetCandidates = computeCandidates(nextSeatOrder, nextEligibility, new Set());
  const nextTurn: TurnFlowRuntimeCardState = {
    firstEligible: resetCandidates.first,
    secondEligible: resetCandidates.second,
    actedSeats: [],
    passedSeats: [],
    nonPassCount: 0,
    firstActionClass: null,
  };
  traceEntries.push({
    kind: 'turnFlowEligibility',
    step: 'cardEnd',
    seat: activeSeat,
    before: cardSnapshot(currentCard),
    after: cardSnapshot(nextTurn),
    eligibilityBefore: runtime.eligibility,
    eligibilityAfter: nextEligibility,
    ...(pendingOverrides.length === 0 ? {} : { overrides: pendingOverrides }),
    reason: endedReason,
  });

  const normalizedPendingFreeOperationGrants = toPendingFreeOperationGrants(pendingFreeOperationGrants);
  const normalizedPendingDeferredEventEffects = toPendingDeferredEventEffects(pendingDeferredEventEffects);
  const nextRuntimeBase: TurnFlowRuntimeState = {
    ...runtime,
    seatOrder: nextSeatOrder,
    eligibility: nextEligibility,
    currentCard: nextTurn,
    pendingEligibilityOverrides: [],
  };
  return {
    state: withActiveFromFirstEligible({
      ...baseState,
      turnOrderState: {
        type: 'cardDriven',
        runtime: withPendingDeferredEventEffects(
          withPendingFreeOperationGrants(
            withSuspendedCardEnd(nextRuntimeBase, undefined),
            normalizedPendingFreeOperationGrants,
          ),
          normalizedPendingDeferredEventEffects,
        ),
      },
    }, nextTurn.firstEligible, seatResolution),
    traceEntries,
    ...(boundaryDurations === undefined ? {} : { boundaryDurations }),
  };
};

const withActiveFromFirstEligible = (
  state: GameState,
  firstEligible: string | null,
  seatResolution: SeatResolutionContext,
): GameState => {
  if (firstEligible === null) {
    return state;
  }

  const playerId = resolvePlayerIndexForTurnFlowSeat(firstEligible, seatResolution.index);
  if (playerId === null) {
    throw kernelRuntimeError(
      'RUNTIME_CONTRACT_INVALID',
      `Turn-flow runtime invariant failed: initializeTurnFlowEligibilityState could not resolve firstEligible=${firstEligible} from card/default seat order.`,
    );
  }

  return {
    ...state,
    activePlayer: asPlayerId(playerId),
  };
};

const isInterruptPhaseId = (
  def: GameDef,
  phaseId: GameState['currentPhase'],
): boolean =>
  (def.turnStructure.interrupts ?? []).some((phase) => phase.id === phaseId);

const resolveCardSeatOrder = (
  def: GameDef,
  state: GameState,
  seatResolution: SeatResolutionContext,
): readonly string[] | null => {
  const config = cardDrivenConfig(def);
  if (config === null) {
    return null;
  }
  const metadataKey = config.turnFlow.cardSeatOrderMetadataKey;
  if (metadataKey === undefined) {
    return null;
  }
  const playedZone = config.turnFlow.cardLifecycle.played;
  const currentCardToken = state.zones[playedZone]?.[0];
  if (currentCardToken === undefined) {
    return null;
  }
  const cardId = currentCardToken.props.cardId;
  if (typeof cardId !== 'string') {
    return null;
  }
  const mapping = config.turnFlow.cardSeatOrderMapping;
  let resolvedCard = false;
  for (const deck of def.eventDecks ?? []) {
    const card = deck.cards.find((c) => c.id === cardId);
    if (card !== undefined) {
      resolvedCard = true;
      const rawOrder = card.metadata?.[metadataKey];
      if (Array.isArray(rawOrder) && rawOrder.every((s): s is string => typeof s === 'string') && rawOrder.length > 0) {
        const resolved = mapping === undefined
          ? rawOrder
          : rawOrder.map((value) => mapping[value] ?? value);
        for (const seatToken of resolved) {
          if (resolvePlayerIndexForTurnFlowSeat(seatToken, seatResolution.index) !== null) {
            continue;
          }
          throw kernelRuntimeError(
            'RUNTIME_CONTRACT_INVALID',
            `Turn-flow runtime invariant failed: card metadata seat order token could not resolve (cardId=${cardId}, metadataKey=${metadataKey}, token=${seatToken}).`,
          );
        }
        assertCardMetadataSeatOrderRuntimeInvariant(resolved, { cardId, metadataKey });
        return resolved;
      }
    }
  }
  if (!resolvedCard) {
    throw kernelRuntimeError(
      'RUNTIME_CONTRACT_INVALID',
      `Turn-flow runtime invariant failed: resolveCardSeatOrder could not resolve played cardId=${cardId} for metadataKey=${metadataKey}.`,
    );
  }
  return null;
};

export const initializeTurnFlowEligibilityState = (def: GameDef, state: GameState): GameState => {
  const flow = cardDrivenConfig(def)?.turnFlow;
  if (flow === undefined) {
    return state;
  }

  const seatResolution = createSeatResolutionContext(def, state.playerCount);
  const seats = flow.eligibility.seats;
  const defaultSeatOrder = normalizeSeatOrder(seats);
  const cardSeatOrder = resolveCardSeatOrder(def, state, seatResolution);
  const seatOrder = cardSeatOrder ?? defaultSeatOrder;
  const eligibility = Object.fromEntries(seatOrder.map((seat) => [seat, true])) as Readonly<Record<string, boolean>>;
  const candidates = computeCandidates(seatOrder, eligibility, new Set());
  const nextState: GameState = {
    ...state,
    turnOrderState: {
      type: 'cardDriven',
      runtime: {
        seatOrder,
        eligibility,
        pendingEligibilityOverrides: [],
        currentCard: {
          firstEligible: candidates.first,
          secondEligible: candidates.second,
          actedSeats: [],
          passedSeats: [],
          nonPassCount: 0,
          firstActionClass: null,
        },
        ...(cardDrivenConfig(def)?.coupPlan?.maxConsecutiveRounds === undefined ? {} : { consecutiveCoupRounds: 0 }),
      },
    },
  };

  return withActiveFromFirstEligible(nextState, candidates.first, seatResolution);
};

export const isActiveSeatEligibleForTurnFlow = (
  def: GameDef,
  state: GameState,
  seatResolution: SeatResolutionContext,
): boolean => {
  if (isInterruptPhaseId(def, state.currentPhase)) {
    return true;
  }

  if (state.turnOrderState.type === 'simultaneous') {
    return state.turnOrderState.submitted[state.activePlayer] !== true;
  }

  const runtime = cardDrivenRuntime(state);
  if (runtime === null) {
    return true;
  }

  const activeSeat = requireCardDrivenActiveSeat(
    def,
    state,
    TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS.ELIGIBILITY_CHECK,
    seatResolution,
  );

  return (
    activeSeat === runtime.currentCard.firstEligible ||
    activeSeat === runtime.currentCard.secondEligible ||
    hasReadyPendingFreeOperationGrantForSeat(
      runtime.pendingFreeOperationGrants ?? [],
      activeSeat,
    )
  );
};

export const hasActiveSeatRequiredPendingFreeOperationGrant = (
  def: GameDef,
  state: GameState,
  seatResolution: SeatResolutionContext,
): boolean => {
  const runtime = cardDrivenRuntime(state);
  if (runtime === null) {
    return false;
  }
  const activeSeat = requireCardDrivenActiveSeat(
    def,
    state,
    TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS.ELIGIBILITY_CHECK,
    seatResolution,
  );
  return hasReadyPendingFreeOperationGrantForSeat(
    runtime.pendingFreeOperationGrants ?? [],
    activeSeat,
  );
};

export const isMoveAllowedByRequiredPendingFreeOperationGrant = (
  def: GameDef,
  state: GameState,
  move: Move,
  seatResolution: SeatResolutionContext,
): boolean => {
  const runtime = cardDrivenRuntime(state);
  if (runtime === null) {
    return true;
  }
  const activeSeat = requireCardDrivenActiveSeat(
    def,
    state,
    TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS.WINDOW_FILTER_APPLICATION,
    seatResolution,
  );
  const pending = runtime.pendingFreeOperationGrants ?? [];
  if (!hasReadyPendingFreeOperationGrantForSeat(pending, activeSeat)) {
    return true;
  }
  if (move.freeOperation !== true) {
    return false;
  }
  return pending.some((grant) =>
    grant.seat === activeSeat
    && isBlockingPendingFreeOperationGrant(grant)
    && doesGrantPotentiallyAuthorizeMove(def, state, pending, grant, move));
};

export const applyTurnFlowEligibilityAfterMove = (
  def: GameDef,
  state: GameState,
  move: Move,
  deferredEventEffect?: TurnFlowDeferredEventEffectPayload,
  options?: {
    readonly originatingPhase?: GameState['currentPhase'];
  },
): TurnFlowTransitionResult => {
  const runtime = cardDrivenRuntime(state);
  if (runtime === null) {
    return { state, traceEntries: [] };
  }
  const originatingPhase = options?.originatingPhase ?? state.currentPhase;
  const seatResolution = createSeatResolutionContext(def, state.playerCount);
  const activeSeat = requireCardDrivenActiveSeat(
    def,
    state,
    TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS.POST_MOVE_ELIGIBILITY_APPLICATION,
    seatResolution,
  );
  const existingPendingFreeOperationGrants = runtime.pendingFreeOperationGrants ?? [];
  const existingPendingDeferredEventEffects = runtime.pendingDeferredEventEffects ?? [];
  const newOverrides = extractPendingEligibilityOverrides(def, state, move, activeSeat, runtime.seatOrder);
  const immediateOverrides = newOverrides.filter((override) => override.duration === 'turn');
  const deferredOverrides = newOverrides.filter((override) => override.duration === 'nextTurn');
  const newFreeOpGrants = extractPendingFreeOperationGrants(
    def,
    state,
    move,
    activeSeat,
    runtime.seatOrder,
    seatResolution,
    existingPendingFreeOperationGrants,
    runtime.freeOperationSequenceContexts,
  );
  const effectiveEligibility = applyEligibilityOverrides(runtime.eligibility, immediateOverrides);
  const pendingOverrides = [...(runtime.pendingEligibilityOverrides ?? []), ...deferredOverrides];
  const combinedPendingFreeOperationGrants = [
    ...existingPendingFreeOperationGrants,
    ...newFreeOpGrants.grants,
  ];
  const nextSequenceContexts = trimFreeOperationSequenceContextsToPendingBatches(
    newFreeOpGrants.sequenceContexts,
    combinedPendingFreeOperationGrants,
  );
  const sequenceAdvanced = advanceSequenceReadyPendingFreeOperationGrants(
    combinedPendingFreeOperationGrants,
    nextSequenceContexts,
  );
  const pendingFreeOperationGrants = sequenceAdvanced.grants;
  const deferredRequiredBatchIds = uniqueBatchIds(newFreeOpGrants.grants);
  const deferredCandidate = deferredEventEffect === undefined
    ? undefined
    : {
      ...deferredEventEffect,
      deferredId: makeUniqueDeferredEventEffectId(
        existingPendingDeferredEventEffects,
        `deferred:${state.turnCount}:${activeSeat}:${String(move.actionId)}`,
      ),
      requiredGrantBatchIds: deferredRequiredBatchIds,
    };
  const deferredEventEffects = deferredCandidate === undefined || deferredCandidate.requiredGrantBatchIds.length === 0
    ? existingPendingDeferredEventEffects
    : [
      ...existingPendingDeferredEventEffects,
      deferredCandidate,
    ];
  const releasedDeferredEventEffects = deferredCandidate !== undefined && deferredCandidate.requiredGrantBatchIds.length === 0
    ? [deferredCandidate]
    : [];

  if (isInterruptPhaseId(def, originatingPhase)) {
    const traceEntries: TriggerLogEntry[] = [];
    if (newOverrides.length > 0) {
      traceEntries.push({
        kind: 'turnFlowEligibility',
        step: 'overrideCreate',
        seat: activeSeat,
        before: cardSnapshot(runtime.currentCard),
        after: cardSnapshot(runtime.currentCard),
        ...(immediateOverrides.length === 0 ? {} : {
          eligibilityBefore: runtime.eligibility,
          eligibilityAfter: effectiveEligibility,
        }),
        overrides: newOverrides,
      });
    }
    if (deferredCandidate !== undefined && deferredCandidate.requiredGrantBatchIds.length > 0) {
      traceEntries.push(createDeferredLifecycleTraceEntry('queued', deferredCandidate));
    }
    if (releasedDeferredEventEffects.length > 0) {
      for (const released of releasedDeferredEventEffects) {
        traceEntries.push(createDeferredLifecycleTraceEntry('released', released));
      }
    }

    const nextRuntime = withPendingDeferredEventEffects(
      withFreeOperationSequenceContexts(
        withPendingFreeOperationGrants({
          ...runtime,
          eligibility: effectiveEligibility,
          pendingEligibilityOverrides: pendingOverrides,
          currentCard: withReadyGrantCandidates(
            pendingFreeOperationGrants,
            runtime.seatOrder,
            runtime.currentCard,
          ),
        }, toPendingFreeOperationGrants(pendingFreeOperationGrants)),
        nextSequenceContexts,
      ),
      toPendingDeferredEventEffects(deferredEventEffects),
    );
    const stateWithTurnFlow: GameState = {
      ...state,
      turnOrderState: {
        type: 'cardDriven',
        runtime: nextRuntime,
      },
    };
    return {
      state: isInterruptPhaseId(def, stateWithTurnFlow.currentPhase)
        ? stateWithTurnFlow
        : withActiveFromFirstEligible(stateWithTurnFlow, nextRuntime.currentCard.firstEligible, seatResolution),
      traceEntries,
      ...(releasedDeferredEventEffects.length === 0 ? {} : { releasedDeferredEventEffects }),
    };
  }

  const coupPhaseIds = def.turnOrder?.type === 'cardDriven'
    ? new Set((def.turnOrder.config.coupPlan?.phases ?? []).map((p) => p.id))
    : new Set<string>();
  const inCoupPhase = coupPhaseIds.has(String(state.currentPhase));

  const before = runtime.currentCard;
  const acted = new Set(before.actedSeats);
  if (!inCoupPhase || isPassAction(def, move)) {
    acted.add(activeSeat);
  }
  const passed = new Set(before.passedSeats);
  let nonPassCount = before.nonPassCount;
  const rewards: Array<{ resource: string; amount: number }> = [];
  let step: 'candidateScan' | 'passChain' = 'candidateScan';

  if (isPassAction(def, move)) {
    step = 'passChain';
    passed.add(activeSeat);
    if (!inCoupPhase) {
      for (const reward of cardDrivenConfig(def)?.turnFlow.passRewards ?? []) {
        if (reward.seat !== activeSeat) {
          continue;
        }
        if (state.globalVars[reward.resource] === undefined) {
          continue;
        }
        rewards.push({ resource: reward.resource, amount: reward.amount });
      }
    }
  } else if (!inCoupPhase) {
    nonPassCount += 1;
  }

  const moveClass = resolveTurnFlowActionClass(def, move);
  const firstActionClass =
    before.firstActionClass ??
    (before.nonPassCount === 0 && moveClass !== 'pass' ? normalizeFirstActionClass(moveClass) : null);

  const activeCardCandidates = computeCandidates(runtime.seatOrder, effectiveEligibility, acted);
  const currentCard = withReadyGrantCandidates(pendingFreeOperationGrants, runtime.seatOrder, {
    firstEligible: activeCardCandidates.first,
    secondEligible: activeCardCandidates.second,
    actedSeats: [...acted],
    passedSeats: [...passed],
    nonPassCount,
    firstActionClass,
  });

  const rewardState =
    rewards.length === 0
      ? state
      : {
          ...state,
          globalVars: rewards.reduce<Readonly<Record<string, number | boolean>>>(
            (vars, reward) => ({
              ...vars,
              [reward.resource]: readNumericResource(vars, reward.resource) + reward.amount,
            }),
            state.globalVars,
          ),
        };

  const traceEntries: TriggerLogEntry[] = [
    ...sequenceAdvanced.traceEntries,
    {
      kind: 'turnFlowEligibility',
      step,
      seat: activeSeat,
      before: cardSnapshot(before),
      after: cardSnapshot(currentCard),
      ...(rewards.length === 0 ? {} : { rewards }),
    },
  ];
  if (newOverrides.length > 0) {
    traceEntries.push({
      kind: 'turnFlowEligibility',
      step: 'overrideCreate',
      seat: activeSeat,
      before: cardSnapshot(currentCard),
      after: cardSnapshot(currentCard),
      ...(immediateOverrides.length === 0 ? {} : {
        eligibilityBefore: runtime.eligibility,
        eligibilityAfter: effectiveEligibility,
      }),
      overrides: newOverrides,
    });
  }
  if (deferredCandidate !== undefined && deferredCandidate.requiredGrantBatchIds.length > 0) {
    traceEntries.push(createDeferredLifecycleTraceEntry('queued', deferredCandidate));
  }
  if (releasedDeferredEventEffects.length > 0) {
    for (const released of releasedDeferredEventEffects) {
      traceEntries.push(createDeferredLifecycleTraceEntry('released', released));
    }
  }

  let endedReason: 'rightmostPass' | 'twoNonPass' | undefined;
  const requiredGrantCandidates = resolveReadyPendingFreeOperationGrantSeats(
    pendingFreeOperationGrants,
    runtime.seatOrder,
  );
  const hasRequiredGrantWindow = requiredGrantCandidates.first !== null || requiredGrantCandidates.second !== null;
  if (inCoupPhase) {
    // In coup phases, the round ends only when ALL seats have passed.
    // (The standard firstEligible/secondEligible tracking is not used in
    // coup phases, so the normal rightmostPass condition would fire prematurely.)
    if (!hasRequiredGrantWindow && runtime.seatOrder.every((seat) => acted.has(seat))) {
      endedReason = 'rightmostPass';
    }
  } else if (!hasRequiredGrantWindow && step === 'passChain' && currentCard.firstEligible === null && currentCard.secondEligible === null) {
    endedReason = 'rightmostPass';
  } else if (!hasRequiredGrantWindow && currentCard.nonPassCount >= 2) {
    endedReason = 'twoNonPass';
  }
  if (endedReason !== undefined) {
    const finalized = finalizeSuspendedOrEndedCard(
      def,
      rewardState,
      {
        ...runtime,
        eligibility: effectiveEligibility,
        ...(nextSequenceContexts === undefined ? {} : { freeOperationSequenceContexts: nextSequenceContexts }),
      },
      seatResolution,
      currentCard,
      pendingOverrides,
      pendingFreeOperationGrants,
      deferredEventEffects,
      activeSeat,
      endedReason,
    );
    return {
      state: finalized.state,
      traceEntries: [...traceEntries, ...finalized.traceEntries],
      ...(finalized.boundaryDurations === undefined ? {} : { boundaryDurations: finalized.boundaryDurations }),
      ...(releasedDeferredEventEffects.length === 0 ? {} : { releasedDeferredEventEffects }),
    };
  }

  const normalizedPendingFreeOperationGrants = toPendingFreeOperationGrants(pendingFreeOperationGrants);
  const normalizedPendingDeferredEventEffects = toPendingDeferredEventEffects(deferredEventEffects);
  const nextRuntime = withPendingDeferredEventEffects(
    withFreeOperationSequenceContexts(
      withPendingFreeOperationGrants(
        withSuspendedCardEnd({
          ...runtime,
          eligibility: effectiveEligibility,
          pendingEligibilityOverrides: pendingOverrides,
          currentCard,
        }, hasRequiredGrantWindow
          && (before.nonPassCount >= 1 || step === 'passChain')
          && ((step === 'passChain' && activeCardCandidates.first === null && activeCardCandidates.second === null) || currentCard.nonPassCount >= 2)
          ? { reason: step === 'passChain' && activeCardCandidates.first === null && activeCardCandidates.second === null ? 'rightmostPass' : 'twoNonPass' }
          : runtime.suspendedCardEnd),
        normalizedPendingFreeOperationGrants,
      ),
      nextSequenceContexts,
    ),
    normalizedPendingDeferredEventEffects,
  );
  const stateWithTurnFlow: GameState = {
    ...rewardState,
    turnOrderState: {
      type: 'cardDriven',
      runtime: nextRuntime,
    },
  };

  return {
    state: isInterruptPhaseId(def, stateWithTurnFlow.currentPhase)
      ? stateWithTurnFlow
      : withActiveFromFirstEligible(stateWithTurnFlow, currentCard.firstEligible, seatResolution),
    traceEntries,
    ...(releasedDeferredEventEffects.length === 0 ? {} : { releasedDeferredEventEffects }),
  };
};
