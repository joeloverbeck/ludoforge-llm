import type { GameDef, GameState, Token, TriggerLogEntry, TurnFlowLifecycleStep } from './types.js';

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

const snapshot = (state: GameState, slots: LifecycleSlots) => ({
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
  const cardLifecycle = def.turnFlow?.cardLifecycle;
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
): { readonly state: GameState; readonly moved: Token | null } => {
  const source = state.zones[fromZoneId];
  const destination = state.zones[toZoneId];
  if (source === undefined || destination === undefined || source.length === 0 || fromZoneId === toZoneId) {
    return { state, moved: null };
  }

  const moved = source[0]!;
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

const popTopToken = (state: GameState, zoneId: string): { readonly state: GameState; readonly popped: Token | null } => {
  const zoneTokens = state.zones[zoneId];
  if (zoneTokens === undefined || zoneTokens.length === 0) {
    return { state, popped: null };
  }

  const popped = zoneTokens[0]!;
  const nextState: GameState = {
    ...state,
    zones: {
      ...state.zones,
      [zoneId]: zoneTokens.slice(1),
    },
  };

  return { state: nextState, popped };
};

const prependToken = (state: GameState, zoneId: string, token: Token): GameState => {
  const zoneTokens = state.zones[zoneId];
  if (zoneTokens === undefined) {
    return state;
  }

  return {
    ...state,
    zones: {
      ...state.zones,
      [zoneId]: [token, ...zoneTokens],
    },
  };
};

const isCoupCard = (token: Token): boolean => token.props.isCoup === true;

const withConsecutiveCoupRounds = (state: GameState, rounds: number): GameState => {
  const runtime = state.turnFlow;
  if (runtime === undefined || runtime.consecutiveCoupRounds === rounds) {
    return state;
  }

  return {
    ...state,
    turnFlow: {
      ...runtime,
      consecutiveCoupRounds: rounds,
    },
  };
};

export const applyTurnFlowInitialReveal = (def: GameDef, state: GameState): LifecycleResult => {
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
    const moved = moveTopToken(nextState, drawPileId, slots.played);
    nextState = moved.state;
    if (moved.moved !== null) {
      pushLifecycleEntry(traceEntries, 'initialRevealPlayed', slots, before, nextState);
    }
  }

  if ((nextState.zones[slots.lookahead]?.length ?? 0) === 0) {
    const before = nextState;
    const moved = moveTopToken(nextState, drawPileId, slots.lookahead);
    nextState = moved.state;
    if (moved.moved !== null) {
      pushLifecycleEntry(traceEntries, 'initialRevealLookahead', slots, before, nextState);
    }
  }

  return { state: nextState, traceEntries };
};

export const applyTurnFlowCardBoundary = (def: GameDef, state: GameState): LifecycleResult => {
  const slots = resolveLifecycleSlots(def, state);
  if (slots === null) {
    return { state, traceEntries: [] };
  }

  const traceEntries: TriggerLogEntry[] = [];
  let nextState = state;
  const removed = popTopToken(nextState, slots.played);
  nextState = removed.state;
  const maxConsecutiveRounds = def.coupPlan?.maxConsecutiveRounds;
  const previousConsecutiveCoupRounds = state.turnFlow?.consecutiveCoupRounds ?? 0;
  const canRunCoupHandoff =
    removed.popped !== null &&
    isCoupCard(removed.popped) &&
    (maxConsecutiveRounds === undefined || previousConsecutiveCoupRounds < maxConsecutiveRounds);

  if (canRunCoupHandoff && removed.popped !== null) {
    const beforeLeaderMove = nextState;
    nextState = prependToken(nextState, slots.leader, removed.popped);
    pushLifecycleEntry(traceEntries, 'coupToLeader', slots, beforeLeaderMove, nextState);
    pushLifecycleEntry(traceEntries, 'coupHandoff', slots, nextState, nextState);
  }

  if (maxConsecutiveRounds !== undefined && removed.popped !== null) {
    if (isCoupCard(removed.popped)) {
      const nextConsecutiveCoupRounds = canRunCoupHandoff
        ? previousConsecutiveCoupRounds + 1
        : previousConsecutiveCoupRounds;
      nextState = withConsecutiveCoupRounds(nextState, nextConsecutiveCoupRounds);
    } else {
      nextState = withConsecutiveCoupRounds(nextState, 0);
    }
  }

  const beforePromotion = nextState;
  const promoted = moveTopToken(nextState, slots.lookahead, slots.played);
  nextState = promoted.state;
  if (promoted.moved !== null) {
    pushLifecycleEntry(traceEntries, 'promoteLookaheadToPlayed', slots, beforePromotion, nextState);
  }

  const drawPileId = resolveDrawPileId(def, slots);
  if (drawPileId !== null) {
    const beforeReveal = nextState;
    const revealed = moveTopToken(nextState, drawPileId, slots.lookahead);
    nextState = revealed.state;
    if (revealed.moved !== null) {
      pushLifecycleEntry(traceEntries, 'revealLookahead', slots, beforeReveal, nextState);
    }
  }

  return { state: nextState, traceEntries };
};
