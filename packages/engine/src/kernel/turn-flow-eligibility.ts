import { asPlayerId } from './branded.js';
import { createCollector } from './execution-collector.js';
import {
  resolveBoundaryDurationsAtTurnEnd,
  resolveEventEligibilityOverrides,
  resolveEventFreeOperationGrants,
} from './event-execution.js';
import { evalCondition } from './eval-condition.js';
import { buildMoveRuntimeBindings } from './move-runtime-bindings.js';
import { kernelRuntimeError } from './runtime-error.js';
import { buildAdjacencyGraph } from './spatial.js';
import { freeOperationZoneFilterEvaluationError } from './turn-flow-error.js';
import { applyTurnFlowCardBoundary } from './turn-flow-lifecycle.js';
import type {
  ConditionAST,
  EventFreeOperationGrantDef,
  GameDef,
  GameState,
  Move,
  TriggerLogEntry,
  TurnFlowDuration,
  TurnFlowPendingEligibilityOverride,
  TurnFlowPendingFreeOperationGrant,
  TurnFlowRuntimeCardState,
  TurnFlowRuntimeState,
} from './types.js';

interface TurnFlowTransitionResult {
  readonly state: GameState;
  readonly traceEntries: readonly TriggerLogEntry[];
  readonly boundaryDurations?: readonly TurnFlowDuration[];
}

const isPassAction = (move: Move): boolean => String(move.actionId) === 'pass';

const cardDrivenConfig = (def: GameDef) =>
  def.turnOrder?.type === 'cardDriven' ? def.turnOrder.config : null;

const cardDrivenRuntime = (state: GameState) =>
  state.turnOrderState.type === 'cardDriven' ? state.turnOrderState.runtime : null;

const isTurnFlowActionClass = (
  value: string,
): value is 'pass' | 'event' | 'operation' | 'limitedOperation' | 'operationPlusSpecialActivity' =>
  value === 'pass' ||
  value === 'event' ||
  value === 'operation' ||
  value === 'limitedOperation' ||
  value === 'operationPlusSpecialActivity';

export type ResolvedTurnFlowActionClass =
  | 'pass'
  | 'event'
  | 'operation'
  | 'limitedOperation'
  | 'operationPlusSpecialActivity';

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
  if (actionClass === 'event' || actionClass === 'operation' || actionClass === 'operationPlusSpecialActivity') {
    return actionClass;
  }
  return null;
};

const normalizeSeatOrder = (seats: readonly string[]): readonly string[] => {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const seat of seats) {
    if (seen.has(seat)) {
      continue;
    }
    seen.add(seat);
    ordered.push(seat);
  }
  return ordered;
};

const parseSeatPlayer = (seat: string, playerCount: number): number | null => {
  if (!/^\d+$/.test(seat)) {
    return null;
  }
  const parsed = Number(seat);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed >= playerCount) {
    return null;
  }
  return parsed;
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

const resolveActiveSeat = (state: GameState): string | null => {
  const runtime = cardDrivenRuntime(state);
  if (runtime === null) {
    return null;
  }
  const seat = String(state.activePlayer);
  return runtime.seatOrder.includes(seat) ? seat : null;
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
): readonly string[] => grant.actionIds ?? (cardDrivenConfig(def)?.turnFlow.freeOperationActionIds ?? []);

const moveOperationClass = (
  def: GameDef,
  move: Move,
): TurnFlowPendingFreeOperationGrant['operationClass'] => {
  const resolved = resolveTurnFlowActionClass(def, move);
  if (resolved !== null) {
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

const doesGrantApplyToMove = (
  def: GameDef,
  grant: TurnFlowPendingFreeOperationGrant,
  move: Move,
): boolean =>
  grant.operationClass === moveOperationClass(def, move) &&
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
  (grant.zoneFilter === undefined || evaluateZoneFilterForMove(def, state, move, grant.zoneFilter));

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
): boolean => {
  const adjacencyGraph = buildAdjacencyGraph(def.zones);
  const baseBindings: Readonly<Record<string, unknown>> = buildMoveRuntimeBindings(move);
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
      throw freeOperationZoneFilterEvaluationError({
        surface: 'turnFlowEligibility',
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
      if (evalCondition(zoneFilter, {
        def,
        adjacencyGraph,
        state,
        activePlayer: state.activePlayer,
        actorPlayer: state.activePlayer,
        bindings: {
          ...baseBindings,
          $zone: zone,
        },
        collector: createCollector(),
      })) {
        return true;
      }
    } catch (cause) {
      throw freeOperationZoneFilterEvaluationError({
        surface: 'turnFlowEligibility',
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

const withActiveFromFirstEligible = (state: GameState, firstEligible: string | null): GameState => {
  if (firstEligible === null) {
    return state;
  }

  const playerId = parseSeatPlayer(firstEligible, state.playerCount);
  if (playerId === null) {
    return state;
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
  for (const deck of def.eventDecks ?? []) {
    const card = deck.cards.find((c) => c.id === cardId);
    if (card !== undefined) {
      const rawOrder = card.metadata?.[metadataKey];
      if (Array.isArray(rawOrder) && rawOrder.every((s): s is string => typeof s === 'string') && rawOrder.length > 0) {
        const resolved = mapping === undefined
          ? rawOrder
          : rawOrder.map((value) => mapping[value] ?? value);
        const filtered = resolved.filter((seatId) => parseSeatPlayer(seatId, state.playerCount) !== null);
        return filtered.length > 0 ? filtered : null;
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

  return withActiveFromFirstEligible(nextState, candidates.first);
};

export const isActiveSeatEligibleForTurnFlow = (state: GameState): boolean => {
  if (state.turnOrderState.type === 'simultaneous') {
    return state.turnOrderState.submitted[state.activePlayer] !== true;
  }

  const runtime = cardDrivenRuntime(state);
  if (runtime === null) {
    return true;
  }

  const activeSeat = resolveActiveSeat(state);
  if (activeSeat === null) {
    return true;
  }

  return (
    activeSeat === runtime.currentCard.firstEligible ||
    activeSeat === runtime.currentCard.secondEligible
  );
};

const activePendingFreeOperationGrants = (
  state: GameState,
): readonly TurnFlowPendingFreeOperationGrant[] => {
  if (state.turnOrderState.type !== 'cardDriven') {
    return [];
  }
  const activeSeat = String(state.activePlayer);
  const pending = state.turnOrderState.runtime.pendingFreeOperationGrants ?? [];
  return pending.filter((grant) => grant.seat === activeSeat);
};

const applicableActivePendingFreeOperationGrants = (
  def: GameDef,
  state: GameState,
  move: Move,
): readonly TurnFlowPendingFreeOperationGrant[] => {
  const pending = state.turnOrderState.type === 'cardDriven'
    ? (state.turnOrderState.runtime.pendingFreeOperationGrants ?? [])
    : [];
  return activePendingFreeOperationGrants(state).filter(
    (grant) => isPendingFreeOperationGrantSequenceReady(pending, grant) && doesGrantApplyToMove(def, grant, move),
  );
};

const parsePlayerId = (
  seat: string,
  playerCount: number,
): ReturnType<typeof asPlayerId> | null => {
  const parsed = parseSeatPlayer(seat, playerCount);
  return parsed === null ? null : asPlayerId(parsed);
};

export const resolveFreeOperationExecutionPlayer = (
  def: GameDef,
  state: GameState,
  move: Move,
): ReturnType<typeof asPlayerId> => {
  if (move.freeOperation !== true || state.turnOrderState.type !== 'cardDriven') {
    return state.activePlayer;
  }
  const applicable = applicableActivePendingFreeOperationGrants(def, state, move);
  if (applicable.length === 0) {
    return state.activePlayer;
  }
  const prioritized = applicable.find((grant) => grant.executeAsSeat !== undefined) ?? applicable[0]!;
  const executionSeat = prioritized.executeAsSeat ?? prioritized.seat;
  return parsePlayerId(executionSeat, state.playerCount) ?? state.activePlayer;
};

export const isFreeOperationApplicableForMove = (
  def: GameDef,
  state: GameState,
  move: Move,
): boolean => {
  if (move.freeOperation !== true) {
    return true;
  }
  return applicableActivePendingFreeOperationGrants(def, state, move).length > 0;
};

export const resolveFreeOperationZoneFilter = (
  def: GameDef,
  state: GameState,
  move: Move,
): ConditionAST | undefined => {
  if (move.freeOperation !== true) {
    return undefined;
  }
  const applicable = applicableActivePendingFreeOperationGrants(def, state, move)
    .flatMap((grant) => (grant.zoneFilter === undefined ? [] : [grant.zoneFilter]));
  if (applicable.length === 0) {
    return undefined;
  }
  if (applicable.length === 1) {
    return applicable[0];
  }
  return { op: 'or', args: applicable };
};

export const isFreeOperationGrantedForMove = (
  def: GameDef,
  state: GameState,
  move: Move,
): boolean => {
  if (!isFreeOperationApplicableForMove(def, state, move)) {
    return false;
  }
  if (move.freeOperation !== true) {
    return true;
  }
  const applicable = applicableActivePendingFreeOperationGrants(def, state, move);
  return applicable.some((grant) =>
    grant.zoneFilter === undefined || evaluateZoneFilterForMove(def, state, move, grant.zoneFilter));
};

export const applyTurnFlowEligibilityAfterMove = (
  def: GameDef,
  state: GameState,
  move: Move,
): TurnFlowTransitionResult => {
  const runtime = cardDrivenRuntime(state);
  if (runtime === null) {
    return { state, traceEntries: [] };
  }

  const activeSeat = resolveActiveSeat(state);
  if (activeSeat === null) {
    return { state, traceEntries: [] };
  }

  const before = runtime.currentCard;
  const acted = new Set(before.actedSeats);
  acted.add(activeSeat);
  const passed = new Set(before.passedSeats);
  let nonPassCount = before.nonPassCount;
  const rewards: Array<{ resource: string; amount: number }> = [];
  let step: 'candidateScan' | 'passChain' = 'candidateScan';

  if (isPassAction(move)) {
    step = 'passChain';
    passed.add(activeSeat);
    for (const reward of cardDrivenConfig(def)?.turnFlow.passRewards ?? []) {
      if (reward.seat !== activeSeat) {
        continue;
      }
      if (state.globalVars[reward.resource] === undefined) {
        continue;
      }
      rewards.push({ resource: reward.resource, amount: reward.amount });
    }
  } else {
    nonPassCount += 1;
  }

  const moveClass = resolveTurnFlowActionClass(def, move);
  const existingPendingFreeOperationGrants = runtime.pendingFreeOperationGrants ?? [];
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

  let endedReason: 'rightmostPass' | 'twoNonPass' | undefined;
  if (step === 'passChain' && currentCard.firstEligible === null && currentCard.secondEligible === null) {
    endedReason = 'rightmostPass';
  } else if (currentCard.nonPassCount >= 2) {
    endedReason = 'twoNonPass';
  }

  let nextTurn = currentCard;
  let nextEligibility = runtime.eligibility;
  let nextPendingOverrides = pendingOverrides;
  let nextPendingFreeOperationGrants = pendingFreeOperationGrants;
  let nextSeatOrder = runtime.seatOrder;
  let baseState = rewardState;
  let boundaryDurations: readonly TurnFlowDuration[] | undefined;
  if (endedReason !== undefined) {
    nextEligibility = computePostCardEligibility(runtime.seatOrder, currentCard, pendingOverrides);
    nextPendingOverrides = [];

    const coupPhaseIds = def.turnOrder?.type === 'cardDriven'
      ? new Set((def.turnOrder.config.coupPlan?.phases ?? []).map((p) => String(p.id)))
      : new Set<string>();
    const inCoupPhase = coupPhaseIds.has(String(rewardState.currentPhase));
    if (!inCoupPhase) {
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
  const stateWithTurnFlow: GameState = {
    ...baseState,
    turnOrderState: {
      type: 'cardDriven',
      runtime: withPendingFreeOperationGrants({
        ...runtime,
        seatOrder: nextSeatOrder,
        eligibility: nextEligibility,
        pendingEligibilityOverrides: nextPendingOverrides,
        currentCard: nextTurn,
      }, normalizedPendingFreeOperationGrants),
    },
  };

  return {
    state: withActiveFromFirstEligible(stateWithTurnFlow, nextTurn.firstEligible),
    traceEntries,
    ...(boundaryDurations === undefined ? {} : { boundaryDurations }),
  };
};

export const consumeTurnFlowFreeOperationGrant = (
  def: GameDef,
  state: GameState,
  move: Move,
): GameState => {
  if (move.freeOperation !== true || state.turnOrderState.type !== 'cardDriven') {
    return state;
  }
  const runtime = state.turnOrderState.runtime;
  const activeSeat = String(state.activePlayer);
  const pending = runtime.pendingFreeOperationGrants ?? [];
  const consumedIndex = pending.findIndex(
    (grant) => grant.seat === activeSeat && doesGrantAuthorizeMove(def, state, pending, grant, move),
  );
  if (consumedIndex < 0) {
    return state;
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
  const normalizedPendingFreeOperationGrants = toPendingFreeOperationGrants(nextPending);
  return {
    ...state,
    turnOrderState: {
      type: 'cardDriven',
      runtime: withPendingFreeOperationGrants(runtime, normalizedPendingFreeOperationGrants),
    },
  };
};
