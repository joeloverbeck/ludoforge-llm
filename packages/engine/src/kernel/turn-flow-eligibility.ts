import { asPlayerId, asZoneId } from './branded.js';
import { createCollector } from './execution-collector.js';
import {
  resolveBoundaryDurationsAtTurnEnd,
  resolveEventEligibilityOverrides,
  resolveEventFreeOperationGrants,
} from './event-execution.js';
import { evalCondition } from './eval-condition.js';
import { shouldDeferFreeOperationZoneFilterFailure } from './missing-binding-policy.js';
import {
  collectFreeOperationZoneFilterProbeRebindableAliases,
  evaluateFreeOperationZoneFilterProbe,
} from './free-operation-zone-filter-probe.js';
import { buildMoveRuntimeBindings } from './move-runtime-bindings.js';
import { kernelRuntimeError } from './runtime-error.js';
import { buildSeatResolutionIndex, normalizeSeatOrder, resolvePlayerIndexForTurnFlowSeat } from './seat-resolution.js';
import { buildAdjacencyGraph } from './spatial.js';
import { createDeferredLifecycleTraceEntry } from './turn-flow-deferred-lifecycle-trace.js';
import { freeOperationZoneFilterEvaluationError } from './turn-flow-error.js';
import { applyTurnFlowCardBoundary } from './turn-flow-lifecycle.js';
import { requireCardDrivenActiveSeat } from './turn-flow-runtime-invariants.js';
import { isTurnFlowActionClass } from '../contracts/index.js';
import type { FreeOperationZoneFilterSurface } from './free-operation-zone-filter-contract.js';
import type { FreeOperationBlockExplanation } from './free-operation-denial-contract.js';
import { resolveGrantFreeOperationActionDomain } from './free-operation-action-domain.js';
import type {
  ConditionAST,
  EventFreeOperationGrantDef,
  GameDef,
  GameState,
  Move,
  TurnFlowActionClass,
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

interface FreeOperationGrantConsumptionResult {
  readonly state: GameState;
  readonly traceEntries: readonly TriggerLogEntry[];
  readonly releasedDeferredEventEffects: readonly TurnFlowReleasedDeferredEventEffect[];
}

const isPassAction = (def: GameDef, move: Move): boolean =>
  String(move.actionId) === 'pass' || resolveTurnFlowActionClass(def, move) === 'pass';

const cardDrivenConfig = (def: GameDef) =>
  def.turnOrder?.type === 'cardDriven' ? def.turnOrder.config : null;

const cardDrivenRuntime = (state: GameState) =>
  state.turnOrderState.type === 'cardDriven' ? state.turnOrderState.runtime : null;

export type ResolvedTurnFlowActionClass = TurnFlowActionClass;

const resolveMappedTurnFlowActionClass = (
  def: GameDef,
  move: Move,
): ResolvedTurnFlowActionClass | null => {
  const actionId = String(move.actionId);
  const mapped = cardDrivenConfig(def)?.turnFlow.actionClassByActionId?.[actionId];
  return typeof mapped === 'string' && isTurnFlowActionClass(mapped) ? mapped : null;
};

export const resolveTurnFlowActionClassMismatch = (
  def: GameDef,
  move: Move,
): { readonly mapped: ResolvedTurnFlowActionClass; readonly submitted: string } | null => {
  const mapped = resolveMappedTurnFlowActionClass(def, move);
  if (mapped === null || move.actionClass === undefined || move.actionClass === mapped) {
    return null;
  }
  // Allow compatible class overrides for operation-family and specialActivity actions.
  // An operation can be submitted as limitedOperation or operationPlusSpecialActivity
  // depending on the option matrix constrained slot the player is filling.
  if (
    mapped === 'operation' &&
    (move.actionClass === 'limitedOperation' || move.actionClass === 'operationPlusSpecialActivity')
  ) {
    return null;
  }
  if (mapped === 'specialActivity' && move.actionClass === 'operationPlusSpecialActivity') {
    return null;
  }
  return {
    mapped,
    submitted: move.actionClass,
  };
};

export const resolveTurnFlowActionClass = (
  def: GameDef,
  move: Move,
): ResolvedTurnFlowActionClass | null => {
  const mapped = resolveMappedTurnFlowActionClass(def, move);
  if (mapped !== null) {
    return mapped;
  }
  return typeof move.actionClass === 'string' && isTurnFlowActionClass(move.actionClass) ? move.actionClass : null;
};

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

const cardSnapshot = (card: TurnFlowRuntimeCardState) => ({
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
  Object.fromEntries((cardDrivenConfig(def)?.turnFlow.eligibility.overrideWindows ?? []).map((windowDef) => [windowDef.id, windowDef.duration]));

const resolveSeatId = (
  seat: string,
  seatOrder: readonly string[],
): string | null => {
  return seatOrder.includes(seat) ? seat : null;
};

const resolveGrantSeat = (
  token: string,
  activeSeat: string,
  seatOrder: readonly string[],
): string | null => {
  if (token === 'self') {
    return activeSeat;
  }
  return resolveSeatId(token, seatOrder);
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
    if (seat === null || duration !== 'nextTurn') {
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

const toPendingFreeOperationGrant = (
  grant: EventFreeOperationGrantDef,
  grantId: string,
  sequenceBatchId: string,
): TurnFlowPendingFreeOperationGrant => ({
  grantId,
  seat: grant.seat,
  ...(grant.executeAsSeat === undefined ? {} : { executeAsSeat: grant.executeAsSeat }),
  operationClass: grant.operationClass,
  ...(grant.actionIds === undefined ? {} : { actionIds: [...grant.actionIds] }),
  ...(grant.zoneFilter === undefined ? {} : { zoneFilter: grant.zoneFilter }),
  remainingUses: grant.uses ?? 1,
  sequenceBatchId,
  sequenceIndex: grant.sequence.step,
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
  existingPendingFreeOperationGrants: readonly TurnFlowPendingFreeOperationGrant[],
): readonly TurnFlowPendingFreeOperationGrant[] => {
  const extracted: TurnFlowPendingFreeOperationGrant[] = [];
  const emittedBatchBaseId = pendingFreeOperationGrantBatchBaseId(state, move);
  for (const [grantIndex, grant] of resolveEventFreeOperationGrants(def, state, move).entries()) {
    const seat = resolveGrantSeat(grant.seat, activeSeat, seatOrder);
    if (seat === null) {
      continue;
    }
    let executeAsSeat: string | undefined;
    if (grant.executeAsSeat !== undefined) {
      const resolvedExecuteAs = resolveGrantSeat(grant.executeAsSeat, activeSeat, seatOrder);
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
    const sequenceBatchId = `${emittedBatchBaseId}:${grant.sequence.chain}`;
    extracted.push({
      ...toPendingFreeOperationGrant(grant, grantId, sequenceBatchId),
      seat,
      ...(executeAsSeat === undefined ? {} : { executeAsSeat }),
    });
  }
  return extracted;
};

const grantActionIds = (
  def: GameDef,
  grant: TurnFlowPendingFreeOperationGrant,
): readonly string[] => resolveGrantFreeOperationActionDomain(def, grant);

const moveOperationClass = (
  def: GameDef,
  move: Move,
): TurnFlowPendingFreeOperationGrant['operationClass'] => {
  const resolved = resolveTurnFlowActionClass(def, move);
  if (resolved !== null) {
    // When move.actionClass is a compatible override of the mapped class,
    // use it for grant matching (e.g., operation-mapped action submitted as limitedOperation).
    if (
      move.actionClass !== undefined &&
      move.actionClass !== resolved &&
      isTurnFlowActionClass(move.actionClass)
    ) {
      if (
        resolved === 'operation' &&
        (move.actionClass === 'limitedOperation' || move.actionClass === 'operationPlusSpecialActivity')
      ) {
        return move.actionClass;
      }
      if (resolved === 'specialActivity' && move.actionClass === 'operationPlusSpecialActivity') {
        return move.actionClass;
      }
    }
    return resolved;
  }
  return 'operation';
};

const isPendingFreeOperationGrantSequenceReady = (
  pending: readonly TurnFlowPendingFreeOperationGrant[],
  grant: TurnFlowPendingFreeOperationGrant,
): boolean => {
  const batchId = grant.sequenceBatchId;
  const sequenceIndex = grant.sequenceIndex;
  if (batchId === undefined || sequenceIndex === undefined) {
    return true;
  }
  return !pending.some(
    (candidate) =>
      candidate.grantId !== grant.grantId &&
      candidate.sequenceBatchId === batchId &&
      (candidate.sequenceIndex ?? Number.POSITIVE_INFINITY) < sequenceIndex,
  );
};

const isGrantOperationClassCompatible = (
  grantClass: TurnFlowPendingFreeOperationGrant['operationClass'],
  moveClass: TurnFlowPendingFreeOperationGrant['operationClass'],
): boolean => {
  if (grantClass === moveClass) {
    return true;
  }
  // An 'operation'-class grant can cover specialActivity actions (e.g., free Air Strike
  // grants in COIN games use operationClass: 'operation' but target SA action IDs).
  if (grantClass === 'operation' && moveClass === 'specialActivity') {
    return true;
  }
  return false;
};

const doesGrantApplyToMove = (
  def: GameDef,
  grant: TurnFlowPendingFreeOperationGrant,
  move: Move,
): boolean =>
  isGrantOperationClassCompatible(grant.operationClass, moveOperationClass(def, move)) &&
  grantActionIds(def, grant).includes(String(move.actionId));

const doesGrantAuthorizeMove = (
  def: GameDef,
  state: GameState,
  pending: readonly TurnFlowPendingFreeOperationGrant[],
  grant: TurnFlowPendingFreeOperationGrant,
  move: Move,
): boolean =>
  isPendingFreeOperationGrantSequenceReady(pending, grant) &&
  doesGrantApplyToMove(def, grant, move) &&
  (
    grant.zoneFilter === undefined
    || evaluateZoneFilterForMove(def, state, move, grant.zoneFilter, 'turnFlowEligibility')
  );

const moveZoneCandidates = (def: GameDef, move: Move): readonly string[] => {
  const zoneIdSet = new Set(def.zones.map((zone) => String(zone.id)));
  const candidates = new Set<string>();
  for (const paramValue of Object.values(move.params)) {
    if (typeof paramValue === 'string' && zoneIdSet.has(paramValue)) {
      candidates.add(paramValue);
      continue;
    }
    if (Array.isArray(paramValue)) {
      for (const item of paramValue) {
        if (typeof item === 'string' && zoneIdSet.has(item)) {
          candidates.add(item);
        }
      }
    }
  }
  return [...candidates];
};

const evaluateZoneFilterForMove = (
  def: GameDef,
  state: GameState,
  move: Move,
  zoneFilter: ConditionAST,
  surface: FreeOperationZoneFilterSurface,
): boolean => {
  const shouldDeferZoneFilterFailure = (cause: unknown): boolean =>
    shouldDeferFreeOperationZoneFilterFailure(surface, cause);
  const adjacencyGraph = buildAdjacencyGraph(def.zones);
  const baseBindings: Readonly<Record<string, unknown>> = buildMoveRuntimeBindings(move);
  const rebindableAliases = collectFreeOperationZoneFilterProbeRebindableAliases(zoneFilter);
  const zones = moveZoneCandidates(def, move);
  if (zones.length === 0) {
    try {
      return evalCondition(zoneFilter, {
        def,
        adjacencyGraph,
        state,
        activePlayer: state.activePlayer,
        actorPlayer: state.activePlayer,
        bindings: baseBindings,
        collector: createCollector(),
      });
    } catch (cause) {
      if (shouldDeferZoneFilterFailure(cause)) {
        // During discovery template probing, zone decisions may be unresolved.
        // Defer grant denial until concrete zone bindings exist.
        return true;
      }
      throw freeOperationZoneFilterEvaluationError({
        surface,
        actionId: String(move.actionId),
        moveParams: move.params,
        zoneFilter,
        candidateZones: zones,
        cause,
      });
    }
  }
  for (const zone of zones) {
    try {
      if (evaluateFreeOperationZoneFilterProbe({
        zoneId: asZoneId(zone),
        baseBindings,
        rebindableAliases,
        evaluateWithBindings: (bindings) => evalCondition(zoneFilter, {
          def,
          adjacencyGraph,
          state,
          activePlayer: state.activePlayer,
          actorPlayer: state.activePlayer,
          bindings,
          collector: createCollector(),
        }),
      })) {
        return true;
      }
    } catch (cause) {
      if (shouldDeferZoneFilterFailure(cause)) {
        return true;
      }
      throw freeOperationZoneFilterEvaluationError({
        surface,
        actionId: String(move.actionId),
        moveParams: move.params,
        zoneFilter,
        candidateZones: zones,
        candidateZone: zone,
        cause,
      });
    }
  }
  return false;
};

const toPendingFreeOperationGrants = (
  grants: readonly TurnFlowPendingFreeOperationGrant[],
): readonly TurnFlowPendingFreeOperationGrant[] | undefined =>
  grants.length === 0 ? undefined : grants;

const toPendingDeferredEventEffects = (
  deferred: readonly TurnFlowPendingDeferredEventEffect[],
): readonly TurnFlowPendingDeferredEventEffect[] | undefined =>
  deferred.length === 0 ? undefined : deferred;

const withPendingFreeOperationGrants = (
  runtime: TurnFlowRuntimeState,
  grants: readonly TurnFlowPendingFreeOperationGrant[] | undefined,
) => {
  const nextRuntime = {
    ...runtime,
    ...(grants === undefined ? {} : { pendingFreeOperationGrants: grants }),
  };
  if (grants === undefined) {
    delete (nextRuntime as { pendingFreeOperationGrants?: readonly TurnFlowPendingFreeOperationGrant[] }).pendingFreeOperationGrants;
  }
  return nextRuntime;
};

const withPendingDeferredEventEffects = (
  runtime: TurnFlowRuntimeState,
  deferred: readonly TurnFlowPendingDeferredEventEffect[] | undefined,
) => {
  const nextRuntime = {
    ...runtime,
    ...(deferred === undefined ? {} : { pendingDeferredEventEffects: deferred }),
  };
  if (deferred === undefined) {
    delete (nextRuntime as { pendingDeferredEventEffects?: readonly TurnFlowPendingDeferredEventEffect[] }).pendingDeferredEventEffects;
  }
  return nextRuntime;
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

const splitReadyDeferredEventEffects = (
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

const withActiveFromFirstEligible = (def: GameDef, state: GameState, firstEligible: string | null): GameState => {
  if (firstEligible === null) {
    return state;
  }

  const seatResolutionIndex = buildSeatResolutionIndex(def, state.playerCount);
  const playerId = resolvePlayerIndexForTurnFlowSeat(firstEligible, seatResolutionIndex);
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

const resolveCardSeatOrder = (def: GameDef, state: GameState): readonly string[] | null => {
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
  const seatResolutionIndex = buildSeatResolutionIndex(def, state.playerCount);
  for (const deck of def.eventDecks ?? []) {
    const card = deck.cards.find((c) => c.id === cardId);
    if (card !== undefined) {
      const rawOrder = card.metadata?.[metadataKey];
      if (Array.isArray(rawOrder) && rawOrder.every((s): s is string => typeof s === 'string') && rawOrder.length > 0) {
        const resolved = mapping === undefined
          ? rawOrder
          : rawOrder.map((value) => mapping[value] ?? value);
        for (const seatToken of resolved) {
          if (resolvePlayerIndexForTurnFlowSeat(seatToken, seatResolutionIndex) !== null) {
            continue;
          }
          throw kernelRuntimeError(
            'RUNTIME_CONTRACT_INVALID',
            `Turn-flow runtime invariant failed: card metadata seat order token could not resolve (cardId=${cardId}, metadataKey=${metadataKey}, token=${seatToken}).`,
          );
        }
        return resolved;
      }
    }
  }
  return null;
};

export const initializeTurnFlowEligibilityState = (def: GameDef, state: GameState): GameState => {
  const flow = cardDrivenConfig(def)?.turnFlow;
  if (flow === undefined) {
    return state;
  }

  const seats = flow.eligibility.seats;
  const defaultSeatOrder = normalizeSeatOrder(seats);
  const cardSeatOrder = resolveCardSeatOrder(def, state);
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

  return withActiveFromFirstEligible(def, nextState, candidates.first);
};

export const isActiveSeatEligibleForTurnFlow = (def: GameDef, state: GameState): boolean => {
  if (state.turnOrderState.type === 'simultaneous') {
    return state.turnOrderState.submitted[state.activePlayer] !== true;
  }

  const runtime = cardDrivenRuntime(state);
  if (runtime === null) {
    return true;
  }

  const activeSeat = requireCardDrivenActiveSeat(def, state, 'isActiveSeatEligibleForTurnFlow');

  return (
    activeSeat === runtime.currentCard.firstEligible ||
    activeSeat === runtime.currentCard.secondEligible
  );
};

interface FreeOperationGrantAnalysis {
  readonly activeSeat: string;
  readonly actionClass: ResolvedTurnFlowActionClass;
  readonly actionId: string;
  readonly pending: readonly TurnFlowPendingFreeOperationGrant[];
  readonly activeGrants: readonly TurnFlowPendingFreeOperationGrant[];
  readonly sequenceReadyGrants: readonly TurnFlowPendingFreeOperationGrant[];
  readonly actionClassMatchedGrants: readonly TurnFlowPendingFreeOperationGrant[];
  readonly actionMatchedGrants: readonly TurnFlowPendingFreeOperationGrant[];
  readonly zoneMatchedGrants: readonly TurnFlowPendingFreeOperationGrant[];
}

const analyzeFreeOperationGrantMatch = (
  def: GameDef,
  state: GameState,
  move: Move,
  options?: {
    readonly evaluateZoneFilters?: boolean;
    readonly zoneFilterErrorSurface?: FreeOperationZoneFilterSurface;
  },
): FreeOperationGrantAnalysis | null => {
  if (move.freeOperation !== true || state.turnOrderState.type !== 'cardDriven') {
    return null;
  }
  const activeSeat = requireCardDrivenActiveSeat(def, state, 'analyzeFreeOperationGrantMatch');
  const actionClass = moveOperationClass(def, move);
  const actionId = String(move.actionId);
  const pending = state.turnOrderState.runtime.pendingFreeOperationGrants ?? [];
  const activeGrants = pending.filter((grant) => grant.seat === activeSeat);
  const sequenceReadyGrants = activeGrants.filter((grant) => isPendingFreeOperationGrantSequenceReady(pending, grant));
  const actionClassMatchedGrants = sequenceReadyGrants.filter((grant) => isGrantOperationClassCompatible(grant.operationClass, actionClass));
  const actionMatchedGrants = actionClassMatchedGrants.filter((grant) => grantActionIds(def, grant).includes(actionId));
  const zoneMatchedGrants = options?.evaluateZoneFilters === true
    ? actionMatchedGrants.filter(
        (grant) => grant.zoneFilter === undefined || evaluateZoneFilterForMove(
          def,
          state,
          move,
          grant.zoneFilter,
          options.zoneFilterErrorSurface ?? 'turnFlowEligibility',
        ),
      )
    : actionMatchedGrants;
  return {
    activeSeat,
    actionClass,
    actionId,
    pending,
    activeGrants,
    sequenceReadyGrants,
    actionClassMatchedGrants,
    actionMatchedGrants,
    zoneMatchedGrants,
  };
};

const sequenceBlockingGrantIds = (
  pending: readonly TurnFlowPendingFreeOperationGrant[],
  grant: TurnFlowPendingFreeOperationGrant,
): readonly string[] => {
  const batchId = grant.sequenceBatchId;
  const sequenceIndex = grant.sequenceIndex;
  if (batchId === undefined || sequenceIndex === undefined) {
    return [];
  }
  return pending
    .filter(
      (candidate) =>
        candidate.grantId !== grant.grantId &&
        candidate.sequenceBatchId === batchId &&
        (candidate.sequenceIndex ?? Number.POSITIVE_INFINITY) < sequenceIndex,
    )
    .map((candidate) => candidate.grantId);
};

const explainFreeOperationBlockFromAnalysis = (
  analysis: FreeOperationGrantAnalysis,
): FreeOperationBlockExplanation => {
  const {
    activeSeat,
    actionClass,
    actionId,
    pending,
    activeGrants,
    sequenceReadyGrants,
    actionClassMatchedGrants,
    actionMatchedGrants,
    zoneMatchedGrants,
  } = analysis;

  if (activeGrants.length === 0) {
    return { cause: 'noActiveSeatGrant', activeSeat };
  }

  if (sequenceReadyGrants.length === 0) {
    const blockers = new Set<string>();
    for (const grant of activeGrants) {
      for (const blocker of sequenceBlockingGrantIds(pending, grant)) {
        blockers.add(blocker);
      }
    }
    return {
      cause: 'sequenceLocked',
      activeSeat,
      matchingGrantIds: activeGrants.map((grant) => grant.grantId),
      sequenceLockBlockingGrantIds: [...blockers],
    };
  }

  if (actionClassMatchedGrants.length === 0) {
    return {
      cause: 'actionClassMismatch',
      activeSeat,
      actionClass,
      actionId,
      matchingGrantIds: sequenceReadyGrants.map((grant) => grant.grantId),
    };
  }

  if (actionMatchedGrants.length === 0) {
    return {
      cause: 'actionIdMismatch',
      activeSeat,
      actionClass,
      actionId,
      matchingGrantIds: actionClassMatchedGrants.map((grant) => grant.grantId),
    };
  }

  if (zoneMatchedGrants.length === 0) {
    return {
      cause: 'zoneFilterMismatch',
      activeSeat,
      actionClass,
      actionId,
      matchingGrantIds: actionMatchedGrants.map((grant) => grant.grantId),
    };
  }

  return {
    cause: 'granted',
    activeSeat,
    actionClass,
    actionId,
    matchingGrantIds: zoneMatchedGrants.map((grant) => grant.grantId),
  };
};

export interface FreeOperationDiscoveryAnalysisResult {
  readonly denial: FreeOperationBlockExplanation;
  readonly executionPlayer: ReturnType<typeof asPlayerId>;
  readonly zoneFilter?: ConditionAST;
}

export const resolveFreeOperationDiscoveryAnalysis = (
  def: GameDef,
  state: GameState,
  move: Move,
  options?: {
    readonly zoneFilterErrorSurface?: FreeOperationZoneFilterSurface;
  },
): FreeOperationDiscoveryAnalysisResult => {
  if (move.freeOperation !== true || state.turnOrderState.type !== 'cardDriven') {
    return {
      denial: move.freeOperation === true ? { cause: 'nonCardDrivenTurnOrder' } : { cause: 'notFreeOperationMove' },
      executionPlayer: state.activePlayer,
    };
  }

  const analysis = analyzeFreeOperationGrantMatch(def, state, move, {
    evaluateZoneFilters: true,
    zoneFilterErrorSurface: options?.zoneFilterErrorSurface ?? 'turnFlowEligibility',
  });
  if (analysis === null) {
    return {
      denial: { cause: 'nonCardDrivenTurnOrder' },
      executionPlayer: state.activePlayer,
    };
  }

  const applicable = analysis.actionMatchedGrants;
  const prioritized = applicable.find((grant) => grant.executeAsSeat !== undefined) ?? applicable[0];
  const executionSeat = prioritized?.executeAsSeat ?? prioritized?.seat;
  const executionPlayer = executionSeat === undefined
    ? state.activePlayer
    : parsePlayerId(def, executionSeat, state.playerCount) ?? state.activePlayer;

  const zoneFilters: ConditionAST[] = applicable
    .flatMap((grant) => (grant.zoneFilter === undefined ? [] : [grant.zoneFilter]));
  const zoneFilter: ConditionAST | undefined = zoneFilters.length === 0
    ? undefined
    : zoneFilters.length === 1
      ? zoneFilters[0]
      : { op: 'or', args: zoneFilters };

  return {
    denial: explainFreeOperationBlockFromAnalysis(analysis),
    executionPlayer,
    ...(zoneFilter === undefined ? {} : { zoneFilter }),
  };
};

const parsePlayerId = (
  def: GameDef,
  seat: string,
  playerCount: number,
): ReturnType<typeof asPlayerId> | null => {
  const seatResolutionIndex = buildSeatResolutionIndex(def, playerCount);
  const parsed = resolvePlayerIndexForTurnFlowSeat(seat, seatResolutionIndex);
  return parsed === null ? null : asPlayerId(parsed);
};

export const isFreeOperationApplicableForMove = (
  def: GameDef,
  state: GameState,
  move: Move,
): boolean => {
  if (move.freeOperation !== true) {
    return true;
  }
  return (analyzeFreeOperationGrantMatch(def, state, move)?.actionMatchedGrants.length ?? 0) > 0;
};

export const isFreeOperationGrantedForMove = (
  def: GameDef,
  state: GameState,
  move: Move,
): boolean => {
  if (move.freeOperation !== true) {
    return true;
  }
  const analysis = analyzeFreeOperationGrantMatch(def, state, move, { evaluateZoneFilters: true });
  if (analysis === null) {
    return false;
  }
  return analysis.zoneMatchedGrants.length > 0;
};

export const applyTurnFlowEligibilityAfterMove = (
  def: GameDef,
  state: GameState,
  move: Move,
  deferredEventEffect?: TurnFlowDeferredEventEffectPayload,
): TurnFlowTransitionResult => {
  const runtime = cardDrivenRuntime(state);
  if (runtime === null) {
    return { state, traceEntries: [] };
  }

  const activeSeat = requireCardDrivenActiveSeat(def, state, 'applyTurnFlowEligibilityAfterMove');

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
  const existingPendingFreeOperationGrants = runtime.pendingFreeOperationGrants ?? [];
  const existingPendingDeferredEventEffects = runtime.pendingDeferredEventEffects ?? [];
  const newOverrides = extractPendingEligibilityOverrides(def, state, move, activeSeat, runtime.seatOrder);
  const newFreeOpGrants = extractPendingFreeOperationGrants(
    def,
    state,
    move,
    activeSeat,
    runtime.seatOrder,
    existingPendingFreeOperationGrants,
  );
  const pendingOverrides = [...(runtime.pendingEligibilityOverrides ?? []), ...newOverrides];
  const pendingFreeOperationGrants = [
    ...existingPendingFreeOperationGrants,
    ...newFreeOpGrants,
  ];
  const deferredRequiredBatchIds = uniqueBatchIds(newFreeOpGrants);
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
  const firstActionClass =
    before.firstActionClass ??
    (before.nonPassCount === 0 && moveClass !== 'pass' ? normalizeFirstActionClass(moveClass) : null);

  const activeCardCandidates = computeCandidates(runtime.seatOrder, runtime.eligibility, acted);
  const currentCard: TurnFlowRuntimeCardState = {
    firstEligible: activeCardCandidates.first,
    secondEligible: activeCardCandidates.second,
    actedSeats: [...acted],
    passedSeats: [...passed],
    nonPassCount,
    firstActionClass,
  };

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
  if (inCoupPhase) {
    // In coup phases, the round ends only when ALL seats have passed.
    // (The standard firstEligible/secondEligible tracking is not used in
    // coup phases, so the normal rightmostPass condition would fire prematurely.)
    if (runtime.seatOrder.every((seat) => acted.has(seat))) {
      endedReason = 'rightmostPass';
    }
  } else if (step === 'passChain' && currentCard.firstEligible === null && currentCard.secondEligible === null) {
    endedReason = 'rightmostPass';
  } else if (currentCard.nonPassCount >= 2) {
    endedReason = 'twoNonPass';
  }

  let nextTurn = currentCard;
  let nextEligibility = runtime.eligibility;
  let nextPendingOverrides = pendingOverrides;
  let nextPendingFreeOperationGrants = pendingFreeOperationGrants;
  let nextPendingDeferredEventEffects = deferredEventEffects;
  let nextSeatOrder = runtime.seatOrder;
  let baseState = rewardState;
  let boundaryDurations: readonly TurnFlowDuration[] | undefined;
  if (endedReason !== undefined) {
    nextPendingOverrides = [];

    const coupPhaseIds = def.turnOrder?.type === 'cardDriven'
      ? new Set((def.turnOrder.config.coupPlan?.phases ?? []).map((p) => String(p.id)))
      : new Set<string>();
    const roundEndsInCoupPhase = coupPhaseIds.has(String(rewardState.currentPhase));

    if (roundEndsInCoupPhase) {
      // In coup phases, a round ending means the phase is complete.
      // Make all factions ineligible so advanceToDecisionPoint advances
      // to the next phase instead of starting a new round.
      nextEligibility = Object.fromEntries(
        runtime.seatOrder.map((seat) => [seat, false]),
      ) as Readonly<Record<string, boolean>>;
    } else {
      nextEligibility = computePostCardEligibility(runtime.seatOrder, currentCard, pendingOverrides);
      const lifecycle = applyTurnFlowCardBoundary(def, rewardState);
      baseState = lifecycle.state;
      traceEntries.push(...lifecycle.traceEntries);
      boundaryDurations = resolveBoundaryDurationsAtTurnEnd(lifecycle.traceEntries);
      const cardSeatOrder = resolveCardSeatOrder(def, baseState);
      if (cardSeatOrder !== null) {
        nextSeatOrder = cardSeatOrder;
      }
    }

    const resetCandidates = computeCandidates(nextSeatOrder, nextEligibility, new Set());
    nextTurn = {
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
  }

  const normalizedPendingFreeOperationGrants = toPendingFreeOperationGrants(nextPendingFreeOperationGrants);
  const normalizedPendingDeferredEventEffects = toPendingDeferredEventEffects(nextPendingDeferredEventEffects);
  const stateWithTurnFlow: GameState = {
    ...baseState,
    turnOrderState: {
      type: 'cardDriven',
      runtime: withPendingDeferredEventEffects(
        withPendingFreeOperationGrants({
          ...runtime,
          seatOrder: nextSeatOrder,
          eligibility: nextEligibility,
          pendingEligibilityOverrides: nextPendingOverrides,
          currentCard: nextTurn,
        }, normalizedPendingFreeOperationGrants),
        normalizedPendingDeferredEventEffects,
      ),
    },
  };

  return {
    state: withActiveFromFirstEligible(def, stateWithTurnFlow, nextTurn.firstEligible),
    traceEntries,
    ...(boundaryDurations === undefined ? {} : { boundaryDurations }),
    ...(releasedDeferredEventEffects.length === 0 ? {} : { releasedDeferredEventEffects }),
  };
};

export const consumeTurnFlowFreeOperationGrant = (
  def: GameDef,
  state: GameState,
  move: Move,
): FreeOperationGrantConsumptionResult => {
  if (move.freeOperation !== true || state.turnOrderState.type !== 'cardDriven') {
    return { state, traceEntries: [], releasedDeferredEventEffects: [] };
  }
  const runtime = state.turnOrderState.runtime;
  const activeSeat = requireCardDrivenActiveSeat(def, state, 'consumeTurnFlowFreeOperationGrant');
  const pending = runtime.pendingFreeOperationGrants ?? [];
  const consumedIndex = pending.findIndex(
    (grant) => grant.seat === activeSeat && doesGrantAuthorizeMove(def, state, pending, grant, move),
  );
  if (consumedIndex < 0) {
    return { state, traceEntries: [], releasedDeferredEventEffects: [] };
  }
  const consumed = pending[consumedIndex]!;
  const decremented = consumed.remainingUses - 1;
  const nextPending = decremented <= 0
    ? [...pending.slice(0, consumedIndex), ...pending.slice(consumedIndex + 1)]
    : [
        ...pending.slice(0, consumedIndex),
        {
          ...consumed,
          remainingUses: decremented,
        },
        ...pending.slice(consumedIndex + 1),
      ];
  const splitDeferred = splitReadyDeferredEventEffects(runtime.pendingDeferredEventEffects ?? [], nextPending);
  const normalizedPendingFreeOperationGrants = toPendingFreeOperationGrants(nextPending);
  const normalizedPendingDeferredEventEffects = toPendingDeferredEventEffects(splitDeferred.remaining);
  const traceEntries = splitDeferred.ready.map<TriggerLogEntry>((released) =>
    createDeferredLifecycleTraceEntry('released', released));
  return {
    state: {
      ...state,
      turnOrderState: {
        type: 'cardDriven',
        runtime: withPendingDeferredEventEffects(
          withPendingFreeOperationGrants(runtime, normalizedPendingFreeOperationGrants),
          normalizedPendingDeferredEventEffects,
        ),
      },
    },
    traceEntries,
    releasedDeferredEventEffects: splitDeferred.ready,
  };
};
