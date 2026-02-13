import { buildAdjacencyGraph } from './spatial.js';
import { applyEffects } from './effects.js';
import { createCollector } from './execution-collector.js';
import type {
  ActiveLastingEffect,
  EffectAST,
  EventBranchDef,
  EventCardDef,
  GameDef,
  GameState,
  Move,
  Rng,
  Token,
  TriggerEvent,
  TurnFlowDuration,
} from './types.js';

interface LastingEffectApplyResult {
  readonly state: GameState;
  readonly rng: Rng;
  readonly emittedEvents: readonly TriggerEvent[];
}

const withActiveLastingEffects = (
  state: GameState,
  activeLastingEffects: readonly ActiveLastingEffect[],
): GameState => {
  if (activeLastingEffects.length === 0) {
    const rest = { ...state } as GameState & { activeLastingEffects?: readonly ActiveLastingEffect[] };
    delete rest.activeLastingEffects;
    return rest;
  }
  return { ...state, activeLastingEffects };
};

const durationCounters = (
  duration: TurnFlowDuration,
): Pick<ActiveLastingEffect, 'remainingCardBoundaries' | 'remainingCoupBoundaries' | 'remainingCampaignBoundaries'> => {
  if (duration === 'card') {
    return { remainingCardBoundaries: 1 };
  }
  if (duration === 'nextCard') {
    return { remainingCardBoundaries: 2 };
  }
  if (duration === 'coup') {
    return { remainingCoupBoundaries: 1 };
  }
  return { remainingCampaignBoundaries: 1 };
};

const resolveEventCardTokenId = (token: Token): string => {
  const props = token.props as Readonly<Record<string, unknown>>;
  const explicit = props.cardId;
  return typeof explicit === 'string' && explicit.length > 0 ? explicit : String(token.id);
};

const resolveCurrentEventCard = (def: GameDef, state: GameState): EventCardDef | null => {
  const eventDecks = def.eventDecks;
  if (eventDecks === undefined || eventDecks.length === 0) {
    return null;
  }
  const cardLifecycle = def.turnOrder?.type === 'cardDriven' ? def.turnOrder.config.turnFlow.cardLifecycle : null;
  if (cardLifecycle === null) {
    return null;
  }
  const playedZone = state.zones[cardLifecycle.played];
  const topToken = playedZone?.[0];
  if (topToken === undefined) {
    return null;
  }
  const tokenCardId = resolveEventCardTokenId(topToken);
  for (const deck of eventDecks) {
    const card = deck.cards.find((candidate) => candidate.id === tokenCardId);
    if (card !== undefined) {
      return card;
    }
  }
  return null;
};

const resolveSelectedSide = (card: EventCardDef, move: Move): { readonly sideId: 'unshaded' | 'shaded'; readonly side: NonNullable<EventCardDef['unshaded']> } | null => {
  const byParam = move.params.side;
  if (byParam === 'unshaded' && card.unshaded !== undefined) {
    return { sideId: 'unshaded', side: card.unshaded };
  }
  if (byParam === 'shaded' && card.shaded !== undefined) {
    return { sideId: 'shaded', side: card.shaded };
  }
  if (card.unshaded !== undefined) {
    return { sideId: 'unshaded', side: card.unshaded };
  }
  if (card.shaded !== undefined) {
    return { sideId: 'shaded', side: card.shaded };
  }
  return null;
};

const resolveSelectedBranch = (
  side: NonNullable<EventCardDef['unshaded']>,
  move: Move,
): EventBranchDef | null => {
  const branches = side.branches;
  if (branches === undefined || branches.length === 0) {
    return null;
  }
  const branchParam = move.params.branch;
  if (typeof branchParam === 'string') {
    const selected = branches.find((branch) => branch.id === branchParam);
    if (selected !== undefined) {
      return selected;
    }
  }
  return branches.length === 1 ? branches[0]! : null;
};

const applyEffectList = (
  def: GameDef,
  state: GameState,
  rng: Rng,
  effects: readonly EffectAST[],
  activePlayer: GameState['activePlayer'],
  moveParams: Move['params'],
): LastingEffectApplyResult => {
  const result = applyEffects(effects, {
    def,
    adjacencyGraph: buildAdjacencyGraph(def.zones),
    state,
    rng,
    activePlayer,
    actorPlayer: activePlayer,
    bindings: { ...moveParams },
    moveParams,
    collector: createCollector(),
  });
  return {
    state: result.state,
    rng: result.rng,
    emittedEvents: result.emittedEvents ?? [],
  };
};

const decrementCount = (value: number | undefined): number | undefined =>
  value === undefined ? undefined : Math.max(0, value - 1);

export const activateEventLastingEffects = (
  def: GameDef,
  state: GameState,
  rng: Rng,
  move: Move,
): LastingEffectApplyResult => {
  const eventClass = move.actionClass ?? String(move.actionId);
  if (eventClass !== 'event') {
    return { state, rng, emittedEvents: [] };
  }

  const card = resolveCurrentEventCard(def, state);
  if (card === null) {
    return { state, rng, emittedEvents: [] };
  }

  const selectedSide = resolveSelectedSide(card, move);
  if (selectedSide === null) {
    return { state, rng, emittedEvents: [] };
  }

  const selectedBranch = resolveSelectedBranch(selectedSide.side, move);
  const lastingEffects = [
    ...(selectedSide.side.lastingEffects ?? []),
    ...(selectedBranch?.lastingEffects ?? []),
  ];

  if (lastingEffects.length === 0) {
    return { state, rng, emittedEvents: [] };
  }

  let nextState = state;
  let nextRng = rng;
  const emittedEvents: TriggerEvent[] = [];
  const activeEffects = [...(state.activeLastingEffects ?? [])];
  for (const lastingEffect of lastingEffects) {
    const setupResult = applyEffectList(
      def,
      nextState,
      nextRng,
      lastingEffect.setupEffects,
      state.activePlayer,
      move.params,
    );
    nextState = setupResult.state;
    nextRng = setupResult.rng;
    emittedEvents.push(...setupResult.emittedEvents);
    activeEffects.push({
      id: lastingEffect.id,
      sourceCardId: card.id,
      side: selectedSide.sideId,
      ...(selectedBranch === null ? {} : { branchId: selectedBranch.id }),
      duration: lastingEffect.duration,
      setupEffects: lastingEffect.setupEffects,
      ...(lastingEffect.teardownEffects === undefined ? {} : { teardownEffects: lastingEffect.teardownEffects }),
      ...durationCounters(lastingEffect.duration),
    });
  }

  return {
    state: withActiveLastingEffects(nextState, activeEffects),
    rng: nextRng,
    emittedEvents,
  };
};

export const expireLastingEffectsAtBoundaries = (
  def: GameDef,
  state: GameState,
  rng: Rng,
  boundaries: readonly TurnFlowDuration[],
): LastingEffectApplyResult => {
  const activeEffects = state.activeLastingEffects;
  if (activeEffects === undefined || activeEffects.length === 0 || boundaries.length === 0) {
    return { state, rng, emittedEvents: [] };
  }

  const boundarySet = new Set(boundaries);
  let nextState = state;
  let nextRng = rng;
  const retained: ActiveLastingEffect[] = [];
  const emittedEvents: TriggerEvent[] = [];

  for (const active of activeEffects) {
    const nextCardCount = boundarySet.has('card')
      ? decrementCount(active.remainingCardBoundaries)
      : active.remainingCardBoundaries;
    const nextCoupCount = boundarySet.has('coup')
      ? decrementCount(active.remainingCoupBoundaries)
      : active.remainingCoupBoundaries;
    const nextCampaignCount = boundarySet.has('campaign')
      ? decrementCount(active.remainingCampaignBoundaries)
      : active.remainingCampaignBoundaries;

    const expired =
      (active.remainingCardBoundaries !== undefined && nextCardCount === 0) ||
      (active.remainingCoupBoundaries !== undefined && nextCoupCount === 0) ||
      (active.remainingCampaignBoundaries !== undefined && nextCampaignCount === 0);

    if (!expired) {
      retained.push({
        ...active,
        ...(nextCardCount === undefined ? {} : { remainingCardBoundaries: nextCardCount }),
        ...(nextCoupCount === undefined ? {} : { remainingCoupBoundaries: nextCoupCount }),
        ...(nextCampaignCount === undefined ? {} : { remainingCampaignBoundaries: nextCampaignCount }),
      });
      continue;
    }

    const teardown = active.teardownEffects;
    if (teardown === undefined || teardown.length === 0) {
      continue;
    }
    const teardownResult = applyEffectList(
      def,
      nextState,
      nextRng,
      teardown,
      state.activePlayer,
      {},
    );
    nextState = teardownResult.state;
    nextRng = teardownResult.rng;
    emittedEvents.push(...teardownResult.emittedEvents);
  }

  return {
    state: withActiveLastingEffects(nextState, retained),
    rng: nextRng,
    emittedEvents,
  };
};
