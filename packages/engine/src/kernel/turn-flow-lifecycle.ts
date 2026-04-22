import { cardDrivenConfig, cardDrivenRuntime } from './card-driven-accessors.js';
import { asActionId } from './branded.js';
import { executeEventMove } from './event-execution.js';
import {
  ensureTurnOrderStateCloned,
  ensureZoneCloned,
  type DraftTracker,
  type MutableGameState,
} from './state-draft.js';
import type { GameDef, GameState, Token, TriggerLogEntry, TurnFlowLifecycleStep } from './types.js';
import { resolveTokenViewFieldValue } from './token-view.js';

interface LifecycleSlots {
  readonly played: string;
  readonly lookahead: string;
  readonly leader: string;
}

interface LifecycleResult {
  readonly state: GameState;
  readonly traceEntries: readonly TriggerLogEntry[];
}

const topCardId = (state: GameState, zoneId: string): string | null => state.zones[zoneId]?.[0]?.id ?? null;

const snapshot = (state: GameState, slots: LifecycleSlots): { readonly playedCardId: string | null; readonly lookaheadCardId: string | null; readonly leaderCardId: string | null } => ({
  playedCardId: topCardId(state, slots.played),
  lookaheadCardId: topCardId(state, slots.lookahead),
  leaderCardId: topCardId(state, slots.leader),
});

const pushLifecycleEntry = (
  entries: TriggerLogEntry[],
  step: TurnFlowLifecycleStep,
  slots: LifecycleSlots,
  beforeState: GameState,
  afterState: GameState,
): void => {
  entries.push({
    kind: 'turnFlowLifecycle',
    step,
    slots,
    before: snapshot(beforeState, slots),
    after: snapshot(afterState, slots),
  });
};

const resolveLifecycleSlots = (def: GameDef, state: GameState): LifecycleSlots | null => {
  const cardLifecycle = cardDrivenConfig(def)?.turnFlow.cardLifecycle;
  if (cardLifecycle === undefined) {
    return null;
  }

  const slots: LifecycleSlots = {
    played: cardLifecycle.played,
    lookahead: cardLifecycle.lookahead,
    leader: cardLifecycle.leader,
  };

  if (
    state.zones[slots.played] === undefined ||
    state.zones[slots.lookahead] === undefined ||
    state.zones[slots.leader] === undefined
  ) {
    return null;
  }

  return slots;
};

const resolveDrawPileId = (def: GameDef, slots: LifecycleSlots): string | null => {
  const slotIds = new Set([slots.played, slots.lookahead, slots.leader]);
  const candidates = def.zones
    .filter((zone) => zone.ordering === 'stack' && !slotIds.has(String(zone.id)))
    .map((zone) => String(zone.id))
    .sort((left, right) => left.localeCompare(right));

  if (candidates.length !== 1) {
    return null;
  }

  return candidates[0]!;
};

const moveTopToken = (
  state: GameState,
  fromZoneId: string,
  toZoneId: string,
  tracker?: DraftTracker,
): { readonly state: GameState; readonly moved: Token | null } => {
  const source = state.zones[fromZoneId];
  const destination = state.zones[toZoneId];
  if (source === undefined || destination === undefined || source.length === 0 || fromZoneId === toZoneId) {
    return { state, moved: null };
  }

  const moved = source[0]!;
  if (tracker !== undefined) {
    const mutableState = state as MutableGameState;
    ensureZoneCloned(mutableState, tracker, fromZoneId);
    ensureZoneCloned(mutableState, tracker, toZoneId);
    (mutableState.zones[fromZoneId] as Token[]).shift();
    (mutableState.zones[toZoneId] as Token[]).unshift(moved);
    return { state: mutableState, moved };
  }

  const nextState: GameState = {
    ...state,
    zones: {
      ...state.zones,
      [fromZoneId]: source.slice(1),
      [toZoneId]: [moved, ...destination],
    },
  };

  return { state: nextState, moved };
};

const popTopToken = (
  state: GameState,
  zoneId: string,
  tracker?: DraftTracker,
): { readonly state: GameState; readonly popped: Token | null } => {
  const zoneTokens = state.zones[zoneId];
  if (zoneTokens === undefined || zoneTokens.length === 0) {
    return { state, popped: null };
  }

  const popped = zoneTokens[0]!;
  if (tracker !== undefined) {
    const mutableState = state as MutableGameState;
    ensureZoneCloned(mutableState, tracker, zoneId);
    (mutableState.zones[zoneId] as Token[]).shift();
    return { state: mutableState, popped };
  }

  const nextState: GameState = {
    ...state,
    zones: {
      ...state.zones,
      [zoneId]: zoneTokens.slice(1),
    },
  };

  return { state: nextState, popped };
};

const prependToken = (state: GameState, zoneId: string, token: Token, tracker?: DraftTracker): GameState => {
  const zoneTokens = state.zones[zoneId];
  if (zoneTokens === undefined) {
    return state;
  }

  if (tracker !== undefined) {
    const mutableState = state as MutableGameState;
    ensureZoneCloned(mutableState, tracker, zoneId);
    (mutableState.zones[zoneId] as Token[]).unshift(token);
    return mutableState;
  }

  return {
    ...state,
    zones: {
      ...state.zones,
      [zoneId]: [token, ...zoneTokens],
    },
  };
};

const isCoupCard = (token: Token): boolean => resolveTokenViewFieldValue(token, 'isCoup') === true;

const applyPromotedCoupImmediateEffects = (
  def: GameDef,
  state: GameState,
  slots: LifecycleSlots,
  tracker?: DraftTracker,
): GameState => {
  const promoted = state.zones[slots.played]?.[0];
  const cardId = promoted?.props.cardId;
  if (promoted === undefined || promoted.props.isCoup !== true || typeof cardId !== 'string' || cardId.length === 0) {
    return state;
  }

  const eventDeckId = typeof promoted.props.eventDeckId === 'string' && promoted.props.eventDeckId.length > 0
    ? promoted.props.eventDeckId
    : undefined;
  const execution = executeEventMove(
    def,
    state,
    { state: state.rng },
    {
      actionId: asActionId('event'),
      params: {
        eventCardId: cardId,
        side: 'unshaded',
        ...(eventDeckId === undefined ? {} : { eventDeckId }),
      },
    },
    undefined,
    undefined,
    'turnFlow:coupImmediate',
    tracker,
  );

  if (execution.rng.state === state.rng) {
    return execution.state;
  }

  if (tracker !== undefined) {
    (execution.state as MutableGameState).rng = execution.rng.state;
    return execution.state;
  }

  return {
    ...execution.state,
    rng: execution.rng.state,
  };
};

const withConsecutiveCoupRounds = (state: GameState, rounds: number, tracker?: DraftTracker): GameState => {
  const runtime = cardDrivenRuntime(state);
  if (runtime === null || runtime.consecutiveCoupRounds === rounds) {
    return state;
  }

  if (tracker !== undefined) {
    const mutableState = state as MutableGameState;
    ensureTurnOrderStateCloned(mutableState, tracker);
    mutableState.turnOrderState = {
      type: 'cardDriven',
      runtime: {
        ...runtime,
        consecutiveCoupRounds: rounds,
      },
    };
    return mutableState;
  }

  return {
    ...state,
    turnOrderState: {
      type: 'cardDriven',
      runtime: {
        ...runtime,
        consecutiveCoupRounds: rounds,
      },
    },
  };
};

export const applyTurnFlowInitialReveal = (
  def: GameDef,
  state: GameState,
  options?: { readonly tracker?: DraftTracker },
): LifecycleResult => {
  const slots = resolveLifecycleSlots(def, state);
  if (slots === null) {
    return { state, traceEntries: [] };
  }

  const drawPileId = resolveDrawPileId(def, slots);
  if (drawPileId === null) {
    return { state, traceEntries: [] };
  }

  const traceEntries: TriggerLogEntry[] = [];
  let nextState = state;

  if ((nextState.zones[slots.played]?.length ?? 0) === 0) {
    const before = nextState;
    const moved = moveTopToken(nextState, drawPileId, slots.played, options?.tracker);
    nextState = moved.state;
    if (moved.moved !== null) {
      pushLifecycleEntry(traceEntries, 'initialRevealPlayed', slots, before, nextState);
    }
  }

  if ((nextState.zones[slots.lookahead]?.length ?? 0) === 0) {
    const before = nextState;
    const moved = moveTopToken(nextState, drawPileId, slots.lookahead, options?.tracker);
    nextState = moved.state;
    if (moved.moved !== null) {
      pushLifecycleEntry(traceEntries, 'initialRevealLookahead', slots, before, nextState);
    }
  }

  return { state: nextState, traceEntries };
};

export const applyTurnFlowCardBoundary = (
  def: GameDef,
  state: GameState,
  options?: { readonly tracker?: DraftTracker },
): LifecycleResult => {
  const slots = resolveLifecycleSlots(def, state);
  if (slots === null) {
    return { state, traceEntries: [] };
  }

  const traceEntries: TriggerLogEntry[] = [];
  let nextState = state;
  const removed = popTopToken(nextState, slots.played, options?.tracker);
  nextState = removed.state;
  const maxConsecutiveRounds = cardDrivenConfig(def)?.coupPlan?.maxConsecutiveRounds;
  const previousConsecutiveCoupRounds = cardDrivenRuntime(state)?.consecutiveCoupRounds ?? 0;
  const canRunCoupHandoff =
    removed.popped !== null &&
    isCoupCard(removed.popped) &&
    (maxConsecutiveRounds === undefined || previousConsecutiveCoupRounds < maxConsecutiveRounds);

  if (canRunCoupHandoff && removed.popped !== null) {
    const beforeLeaderMove = nextState;
    nextState = prependToken(nextState, slots.leader, removed.popped, options?.tracker);
    pushLifecycleEntry(traceEntries, 'coupToLeader', slots, beforeLeaderMove, nextState);
    pushLifecycleEntry(traceEntries, 'coupHandoff', slots, nextState, nextState);
  }

  if (maxConsecutiveRounds !== undefined && removed.popped !== null) {
    if (isCoupCard(removed.popped)) {
      const nextConsecutiveCoupRounds = canRunCoupHandoff
        ? previousConsecutiveCoupRounds + 1
        : previousConsecutiveCoupRounds;
      nextState = withConsecutiveCoupRounds(nextState, nextConsecutiveCoupRounds, options?.tracker);
    } else {
      nextState = withConsecutiveCoupRounds(nextState, 0, options?.tracker);
    }
  }

  const beforePromotion = nextState;
  const promoted = moveTopToken(nextState, slots.lookahead, slots.played, options?.tracker);
  nextState = promoted.state;
  if (promoted.moved !== null) {
    pushLifecycleEntry(traceEntries, 'promoteLookaheadToPlayed', slots, beforePromotion, nextState);
    nextState = applyPromotedCoupImmediateEffects(def, nextState, slots, options?.tracker);
  }

  const drawPileId = resolveDrawPileId(def, slots);
  if (drawPileId !== null) {
    const beforeReveal = nextState;
    const revealed = moveTopToken(nextState, drawPileId, slots.lookahead, options?.tracker);
    nextState = revealed.state;
    if (revealed.moved !== null) {
      pushLifecycleEntry(traceEntries, 'revealLookahead', slots, beforeReveal, nextState);
    }
  }

  return { state: nextState, traceEntries };
};
