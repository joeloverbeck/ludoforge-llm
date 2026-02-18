import { buildAdjacencyGraph } from './spatial.js';
import { applyEffects } from './effects.js';
import { evalCondition } from './eval-condition.js';
import { createCollector } from './execution-collector.js';
import { isCardEventMove } from './action-capabilities.js';
import { buildRuntimeTableIndex } from './runtime-table-index.js';
import type { MoveExecutionPolicy } from './execution-policy.js';
import type {
  ActiveLastingEffect,
  EffectAST,
  EventBranchDef,
  EventCardDef,
  EventEligibilityOverrideDef,
  EventFreeOperationGrantDef,
  ExecutionCollector,
  GameDef,
  GameState,
  Move,
  Rng,
  Token,
  TriggerLogEntry,
  TriggerEvent,
  TurnFlowDuration,
} from './types.js';

interface LastingEffectApplyResult {
  readonly state: GameState;
  readonly rng: Rng;
  readonly emittedEvents: readonly TriggerEvent[];
}

interface EventExecutionContext {
  readonly card: EventCardDef;
  readonly deckId?: string;
  readonly sideId: 'unshaded' | 'shaded';
  readonly side: NonNullable<EventCardDef['unshaded']>;
  readonly branch: EventBranchDef | null;
}

const collectFreeOperationGrants = (context: EventExecutionContext): readonly EventFreeOperationGrantDef[] => {
  const grants: EventFreeOperationGrantDef[] = [];
  for (const grant of context.side.freeOperationGrants ?? []) {
    grants.push(grant);
  }
  for (const grant of context.branch?.freeOperationGrants ?? []) {
    grants.push(grant);
  }
  return grants;
};

const collectEligibilityOverrides = (context: EventExecutionContext): readonly EventEligibilityOverrideDef[] => {
  const overrides: EventEligibilityOverrideDef[] = [];
  for (const override of context.side.eligibilityOverrides ?? []) {
    overrides.push(override);
  }
  for (const override of context.branch?.eligibilityOverrides ?? []) {
    overrides.push(override);
  }
  return overrides;
};

const isTurnFlowLifecycleEntry = (
  entry: TriggerLogEntry,
): entry is Extract<TriggerLogEntry, { readonly kind: 'turnFlowLifecycle' }> =>
  entry.kind === 'turnFlowLifecycle';

export const resolveBoundaryDurationsAtTurnEnd = (
  traceEntries: readonly TriggerLogEntry[],
): readonly TurnFlowDuration[] => {
  const boundaries: TurnFlowDuration[] = ['turn'];
  const hasCoupHandoff = traceEntries.some(
    (entry) => isTurnFlowLifecycleEntry(entry) && entry.step === 'coupHandoff',
  );
  if (hasCoupHandoff) {
    boundaries.push('round', 'cycle');
  }
  return boundaries;
};

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
): Pick<ActiveLastingEffect, 'remainingTurnBoundaries' | 'remainingRoundBoundaries' | 'remainingCycleBoundaries'> => {
  if (duration === 'turn') {
    return { remainingTurnBoundaries: 1 };
  }
  if (duration === 'nextTurn') {
    return { remainingTurnBoundaries: 2 };
  }
  if (duration === 'round') {
    return { remainingRoundBoundaries: 1 };
  }
  return { remainingCycleBoundaries: 1 };
};

const resolveEventCardTokenId = (token: Token): string => {
  const props = token.props as Readonly<Record<string, unknown>>;
  const explicit = props.cardId;
  return typeof explicit === 'string' && explicit.length > 0 ? explicit : String(token.id);
};

export const resolveCurrentEventCardState = (
  def: GameDef,
  state: GameState,
): { readonly deckId: string; readonly card: EventCardDef } | null => {
  const eventDecks = def.eventDecks;
  if (eventDecks === undefined || eventDecks.length === 0) {
    return null;
  }
  for (const deck of eventDecks) {
    const topToken = state.zones[deck.discardZone]?.[0];
    if (topToken === undefined) {
      continue;
    }
    const tokenCardId = resolveEventCardTokenId(topToken);
    const card = deck.cards.find((candidate) => candidate.id === tokenCardId);
    if (card !== undefined) {
      return { deckId: deck.id, card };
    }
  }
  return null;
};

const resolveEventCardFromMove = (def: GameDef, move: Move): EventCardDef | null => {
  const explicitCardId = move.params.eventCardId;
  if (typeof explicitCardId !== 'string' || explicitCardId.length === 0) {
    return null;
  }
  const eventDecks = def.eventDecks;
  if (eventDecks === undefined || eventDecks.length === 0) {
    return null;
  }
  const explicitDeckId = move.params.eventDeckId;
  const decks = typeof explicitDeckId === 'string' && explicitDeckId.length > 0
    ? eventDecks.filter((deck) => deck.id === explicitDeckId)
    : eventDecks;
  for (const deck of decks) {
    const card = deck.cards.find((candidate) => candidate.id === explicitCardId);
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

const resolveEventExecutionContext = (
  def: GameDef,
  state: GameState,
  move: Move,
): EventExecutionContext | null => {
  const explicitCard = resolveEventCardFromMove(def, move);
  const currentCard = explicitCard === null ? resolveCurrentEventCardState(def, state) : null;
  const card = explicitCard ?? currentCard?.card ?? null;
  if (card === null) {
    return null;
  }
  const selectedSide = resolveSelectedSide(card, move);
  if (selectedSide === null) {
    return null;
  }
  const selectedBranch = resolveSelectedBranch(selectedSide.side, move);
  return {
    card,
    ...(currentCard === null ? {} : { deckId: currentCard.deckId }),
    sideId: selectedSide.sideId,
    side: selectedSide.side,
    branch: selectedBranch,
  };
};

export const resolveEventEffectList = (
  def: GameDef,
  state: GameState,
  move: Move,
): readonly EffectAST[] => {
  const context = resolveEventExecutionContext(def, state, move);
  if (context === null) {
    return [];
  }
  return [
    ...(context.side.effects ?? []),
    ...(context.branch?.effects ?? []),
  ];
};

const applyEffectList = (
  def: GameDef,
  state: GameState,
  rng: Rng,
  effects: readonly EffectAST[],
  activePlayer: GameState['activePlayer'],
  moveParams: Move['params'],
  collector: ExecutionCollector | undefined,
  actionId: string,
  effectPathRoot: string,
  policy?: MoveExecutionPolicy,
): LastingEffectApplyResult => {
  const runtimeTableIndex = buildRuntimeTableIndex(def);
  const result = applyEffects(effects, {
    def,
    adjacencyGraph: buildAdjacencyGraph(def.zones),
    runtimeTableIndex,
    state,
    rng,
    activePlayer,
    actorPlayer: activePlayer,
    bindings: { ...moveParams },
    moveParams,
    collector: collector ?? createCollector(),
    traceContext: {
      eventContext: 'actionEffect',
      actionId,
      effectPathRoot,
    },
    effectPath: '',
    ...(policy?.phaseTransitionBudget === undefined ? {} : { phaseTransitionBudget: policy.phaseTransitionBudget }),
  });
  return {
    state: result.state,
    rng: result.rng,
    emittedEvents: result.emittedEvents ?? [],
  };
};

const decrementCount = (value: number | undefined): number | undefined =>
  value === undefined ? undefined : Math.max(0, value - 1);

export const executeEventMove = (
  def: GameDef,
  state: GameState,
  rng: Rng,
  move: Move,
  policy?: MoveExecutionPolicy,
  collector?: ExecutionCollector,
  actionId = String(move.actionId),
): LastingEffectApplyResult => {
  if (!isCardEventMove(def, move)) {
    return { state, rng, emittedEvents: [] };
  }

  const context = resolveEventExecutionContext(def, state, move);
  if (context === null) {
    return { state, rng, emittedEvents: [] };
  }

  if (context.card.playCondition !== undefined) {
    const adjacencyGraph = buildAdjacencyGraph(def.zones);
    const runtimeTableIndex = buildRuntimeTableIndex(def);
    const conditionMet = evalCondition(context.card.playCondition, {
      def,
      adjacencyGraph,
      runtimeTableIndex,
      state,
      activePlayer: state.activePlayer,
      actorPlayer: state.activePlayer,
      bindings: { ...move.params },
      collector: createCollector(),
    });
    if (!conditionMet) {
      return { state, rng, emittedEvents: [] };
    }
  }

  const eventEffects = [
    ...(context.side.effects ?? []),
    ...(context.branch?.effects ?? []),
  ];
  const lastingEffects = [
    ...(context.side.lastingEffects ?? []),
    ...(context.branch?.lastingEffects ?? []),
  ];

  if (eventEffects.length === 0 && lastingEffects.length === 0) {
    return { state, rng, emittedEvents: [] };
  }

  let nextState = state;
  let nextRng = rng;
  const emittedEvents: TriggerEvent[] = [];
  if (eventEffects.length > 0) {
    const sideAndBranchResult = applyEffectList(
      def,
      nextState,
      nextRng,
      eventEffects,
      state.activePlayer,
      move.params,
      collector,
      actionId,
      `action:${actionId}.eventEffects`,
      policy,
    );
    nextState = sideAndBranchResult.state;
    nextRng = sideAndBranchResult.rng;
    emittedEvents.push(...sideAndBranchResult.emittedEvents);
  }
  const activeEffects = [...(state.activeLastingEffects ?? [])];
  for (const lastingEffect of lastingEffects) {
    const setupResult = applyEffectList(
      def,
      nextState,
      nextRng,
      lastingEffect.setupEffects,
      state.activePlayer,
      move.params,
      collector,
      actionId,
      `action:${actionId}.lasting:${lastingEffect.id}.setup`,
      policy,
    );
    nextState = setupResult.state;
    nextRng = setupResult.rng;
    emittedEvents.push(...setupResult.emittedEvents);
    activeEffects.push({
      id: lastingEffect.id,
      sourceCardId: context.card.id,
      side: context.sideId,
      ...(context.branch === null ? {} : { branchId: context.branch.id }),
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

export const resolveEventFreeOperationGrants = (
  def: GameDef,
  state: GameState,
  move: Move,
): readonly EventFreeOperationGrantDef[] => {
  if (!isCardEventMove(def, move)) {
    return [];
  }
  const context = resolveEventExecutionContext(def, state, move);
  if (context === null) {
    return [];
  }
  if (context.card.playCondition !== undefined) {
    const adjacencyGraph = buildAdjacencyGraph(def.zones);
    const runtimeTableIndex = buildRuntimeTableIndex(def);
    const conditionMet = evalCondition(context.card.playCondition, {
      def,
      adjacencyGraph,
      runtimeTableIndex,
      state,
      activePlayer: state.activePlayer,
      actorPlayer: state.activePlayer,
      bindings: { ...move.params },
      collector: createCollector(),
    });
    if (!conditionMet) {
      return [];
    }
  }
  return collectFreeOperationGrants(context);
};

export const resolveEventEligibilityOverrides = (
  def: GameDef,
  state: GameState,
  move: Move,
): readonly EventEligibilityOverrideDef[] => {
  if (!isCardEventMove(def, move)) {
    return [];
  }
  const context = resolveEventExecutionContext(def, state, move);
  if (context === null) {
    return [];
  }
  if (context.card.playCondition !== undefined) {
    const adjacencyGraph = buildAdjacencyGraph(def.zones);
    const runtimeTableIndex = buildRuntimeTableIndex(def);
    const conditionMet = evalCondition(context.card.playCondition, {
      def,
      adjacencyGraph,
      runtimeTableIndex,
      state,
      activePlayer: state.activePlayer,
      actorPlayer: state.activePlayer,
      bindings: { ...move.params },
      collector: createCollector(),
    });
    if (!conditionMet) {
      return [];
    }
  }
  return collectEligibilityOverrides(context);
};

export const expireLastingEffectsAtBoundaries = (
  def: GameDef,
  state: GameState,
  rng: Rng,
  boundaries: readonly TurnFlowDuration[],
  policy?: MoveExecutionPolicy,
  collector?: ExecutionCollector,
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
    const nextTurnCount = boundarySet.has('turn')
      ? decrementCount(active.remainingTurnBoundaries)
      : active.remainingTurnBoundaries;
    const nextRoundCount = boundarySet.has('round')
      ? decrementCount(active.remainingRoundBoundaries)
      : active.remainingRoundBoundaries;
    const nextCycleCount = boundarySet.has('cycle')
      ? decrementCount(active.remainingCycleBoundaries)
      : active.remainingCycleBoundaries;

    const expired =
      (active.remainingTurnBoundaries !== undefined && nextTurnCount === 0) ||
      (active.remainingRoundBoundaries !== undefined && nextRoundCount === 0) ||
      (active.remainingCycleBoundaries !== undefined && nextCycleCount === 0);

    if (!expired) {
      retained.push({
        ...active,
        ...(nextTurnCount === undefined ? {} : { remainingTurnBoundaries: nextTurnCount }),
        ...(nextRoundCount === undefined ? {} : { remainingRoundBoundaries: nextRoundCount }),
        ...(nextCycleCount === undefined ? {} : { remainingCycleBoundaries: nextCycleCount }),
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
      collector,
      'system:lastingExpiry',
      `autoAdvance.lasting:${active.id}.teardown`,
      policy,
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
