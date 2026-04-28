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
  readonly discard: string;
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

const resolveDrawPileFromZones = (def: GameDef, played: string, lookahead: string, leader: string): string | null => {
  const slotIds = new Set([played, lookahead, leader]);
  const candidates = def.zones
    .filter((zone) => zone.ordering === 'stack' && !slotIds.has(String(zone.id)))
    .map((zone) => String(zone.id))
    .sort((left, right) => left.localeCompare(right));

  if (candidates.length !== 1) {
    return null;
  }

  return candidates[0]!;
};

const resolveDiscardZone = (def: GameDef, played: string, lookahead: string, leader: string): string => {
  const drawPileId = resolveDrawPileFromZones(def, played, lookahead, leader);
  const eventDecks = def.eventDecks ?? [];
  if (drawPileId !== null && eventDecks.length > 0) {
    const matching = eventDecks.filter((deck) => deck.drawZone === drawPileId);
    if (matching.length === 1) {
      return matching[0]!.discardZone;
    }
  }
  // Fallback: accumulating semantic — discard pile IS the played slot.
  // This is the only safe fallback when no eventDeck resolution is available,
  // because it preserves token conservation.
  return played;
};

const resolveLifecycleSlots = (def: GameDef, state: GameState): LifecycleSlots | null => {
  const cardLifecycle = cardDrivenConfig(def)?.turnFlow.cardLifecycle;
  if (cardLifecycle === undefined) {
    return null;
  }

  const discard = resolveDiscardZone(def, cardLifecycle.played, cardLifecycle.lookahead, cardLifecycle.leader);

  const slots: LifecycleSlots = {
    played: cardLifecycle.played,
    lookahead: cardLifecycle.lookahead,
    leader: cardLifecycle.leader,
    discard,
  };

  if (
    state.zones[slots.played] === undefined ||
    state.zones[slots.lookahead] === undefined ||
    state.zones[slots.leader] === undefined ||
    state.zones[slots.discard] === undefined
  ) {
    return null;
  }

  return slots;
};

const resolveDrawPileId = (def: GameDef, slots: LifecycleSlots): string | null =>
  resolveDrawPileFromZones(def, slots.played, slots.lookahead, slots.leader);

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

const collectCardTokenIdMultiset = (state: GameState): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const tokens of Object.values(state.zones)) {
    if (tokens === undefined) {
      continue;
    }
    for (const token of tokens) {
      if (token.type !== 'card') {
        continue;
      }
      const id = String(token.id);
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return counts;
};

const assertCardTokenConservation = (before: GameState, after: GameState): void => {
  const beforeCounts = collectCardTokenIdMultiset(before);
  const afterCounts = collectCardTokenIdMultiset(after);
  if (beforeCounts.size !== afterCounts.size) {
    throw new Error(
      `applyTurnFlowCardBoundary violated card-token conservation: ${beforeCounts.size} distinct tokens before, ${afterCounts.size} after`,
    );
  }
  for (const [id, count] of beforeCounts) {
    if (afterCounts.get(id) !== count) {
      throw new Error(
        `applyTurnFlowCardBoundary violated card-token conservation: token "${id}" count ${count} → ${afterCounts.get(id) ?? 0}`,
      );
    }
  }
};

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

  const beforeBoundary = state;
  const traceEntries: TriggerLogEntry[] = [];
  let nextState = state;

  const playedTop = nextState.zones[slots.played]?.[0] ?? null;
  const maxConsecutiveRounds = cardDrivenConfig(def)?.coupPlan?.maxConsecutiveRounds;
  const previousConsecutiveCoupRounds = cardDrivenRuntime(state)?.consecutiveCoupRounds ?? 0;
  const playedTopIsCoup = playedTop !== null && isCoupCard(playedTop);
  const canRunCoupHandoff =
    playedTopIsCoup &&
    (maxConsecutiveRounds === undefined || previousConsecutiveCoupRounds < maxConsecutiveRounds);

  if (canRunCoupHandoff && playedTop !== null) {
    // Coup handoff: pop the played top and move it to leader. Leader-handoff
    // semantics win over discardZone routing.
    const popResult = popTopToken(nextState, slots.played, options?.tracker);
    nextState = popResult.state;
    const beforeLeaderMove = nextState;
    nextState = prependToken(nextState, slots.leader, playedTop, options?.tracker);
    pushLifecycleEntry(traceEntries, 'coupToLeader', slots, beforeLeaderMove, nextState);
    pushLifecycleEntry(traceEntries, 'coupHandoff', slots, nextState, nextState);
  } else if (playedTop !== null && slots.discard !== slots.played) {
    // Non-accumulating semantic: pop the played top and route it to the discard zone.
    const popResult = popTopToken(nextState, slots.played, options?.tracker);
    nextState = popResult.state;
    const beforeDiscard = nextState;
    nextState = prependToken(nextState, slots.discard, playedTop, options?.tracker);
    pushLifecycleEntry(traceEntries, 'discardPlayed', slots, beforeDiscard, nextState);
  }
  // else (slots.discard === slots.played AND not a coup-handoff): leave the
  // popped card on top of played; the new card prepends above it. This is the
  // accumulating case where the played slot IS the discard pile.

  if (maxConsecutiveRounds !== undefined && playedTop !== null) {
    if (playedTopIsCoup) {
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

  assertCardTokenConservation(beforeBoundary, nextState);

  return { state: nextState, traceEntries };
};
