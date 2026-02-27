import { buildAdjacencyGraph } from './spatial.js';
import { applyEffects } from './effects.js';
import { evalCondition } from './eval-condition.js';
import { createCollector } from './execution-collector.js';
import { isCardEventMove } from './action-capabilities.js';
import { buildRuntimeTableIndex } from './runtime-table-index.js';
import { omitOptionalStateKey } from './state-shape.js';
import type { MoveExecutionPolicy } from './execution-policy.js';
import type {
  ActiveLastingEffect,
  EffectAST,
  EventBranchDef,
  EventCardDef,
  EventEffectTiming,
  EventEligibilityOverrideDef,
  EventFreeOperationGrantDef,
  EventTargetDef,
  ExecutionCollector,
  GameDef,
  GameState,
  Move,
  Rng,
  Token,
  TriggerLogEntry,
  TriggerEvent,
  TurnFlowDeferredEventEffectPayload,
  TurnFlowDuration,
} from './types.js';

interface LastingEffectApplyResult {
  readonly state: GameState;
  readonly rng: Rng;
  readonly emittedEvents: readonly TriggerEvent[];
  readonly deferredEventEffect?: TurnFlowDeferredEventEffectPayload;
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

export const resolveEventTargetDefs = (
  side: NonNullable<EventCardDef['unshaded']>,
  branch: EventBranchDef | null,
): readonly EventTargetDef[] => {
  const targets: EventTargetDef[] = [];
  for (const target of side.targets ?? []) {
    targets.push(target);
  }
  for (const target of branch?.targets ?? []) {
    targets.push(target);
  }
  return targets;
};

const synthesizeEventTargetDecisionId = (target: EventTargetDef, index: number): string =>
  `decision:eventTarget:${index}:${target.id}`;

export const synthesizeEventTargetEffects = (targets: readonly EventTargetDef[]): readonly EffectAST[] =>
  targets.map((target, index) => {
    const internalDecisionId = synthesizeEventTargetDecisionId(target, index);
    const cardinality = target.cardinality;
    const shouldUseChooseOne = ('n' in cardinality && cardinality.n === 1)
      || (!('n' in cardinality) && cardinality.max === 1);
    if (shouldUseChooseOne) {
      return {
        chooseOne: {
          internalDecisionId,
          bind: target.id,
          options: target.selector,
        },
      };
    }
    if ('n' in cardinality) {
      return {
        chooseN: {
          internalDecisionId,
          bind: target.id,
          options: target.selector,
          n: cardinality.n,
        },
      };
    }
    return {
      chooseN: {
        internalDecisionId,
        bind: target.id,
        options: target.selector,
        ...(cardinality.min === undefined ? {} : { min: cardinality.min }),
        max: cardinality.max,
      },
    };
  });

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
    return omitOptionalStateKey(state, 'activeLastingEffects');
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

const isPlayableEventContext = (
  def: GameDef,
  state: GameState,
  move: Move,
  context: EventExecutionContext,
): boolean => {
  if (context.card.playCondition === undefined) {
    return true;
  }
  const adjacencyGraph = buildAdjacencyGraph(def.zones);
  const runtimeTableIndex = buildRuntimeTableIndex(def);
  return evalCondition(context.card.playCondition, {
    def,
    adjacencyGraph,
    runtimeTableIndex,
    state,
    activePlayer: state.activePlayer,
    actorPlayer: state.activePlayer,
    bindings: { ...move.params },
    collector: createCollector(),
  });
};

const resolvePlayableEventExecutionContext = (
  def: GameDef,
  state: GameState,
  move: Move,
): EventExecutionContext | null => {
  if (!isCardEventMove(def, move)) {
    return null;
  }
  const context = resolveEventExecutionContext(def, state, move);
  if (context === null) {
    return null;
  }
  return isPlayableEventContext(def, state, move, context) ? context : null;
};

const resolveEventEffectTiming = (context: EventExecutionContext): EventEffectTiming =>
  context.branch?.effectTiming ?? context.side.effectTiming ?? 'beforeGrants';

const collectEventEffects = (context: EventExecutionContext): readonly EffectAST[] => {
  const targetEffects = synthesizeEventTargetEffects(resolveEventTargetDefs(context.side, context.branch));
  return [
    ...targetEffects,
    ...(context.side.effects ?? []),
    ...(context.branch?.effects ?? []),
  ];
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
  return collectEventEffects(context);
};

export const resolveEventEffectTimingForMove = (
  def: GameDef,
  state: GameState,
  move: Move,
): EventEffectTiming | null => {
  const context = resolveEventExecutionContext(def, state, move);
  if (context === null) {
    return null;
  }
  return resolveEventEffectTiming(context);
};

export const shouldDeferIncompleteDecisionValidationForMove = (
  def: GameDef,
  state: GameState,
  move: Move,
): boolean => {
  if (state.turnOrderState.type !== 'cardDriven') {
    return false;
  }
  const context = resolvePlayableEventExecutionContext(def, state, move);
  if (context === null) {
    return false;
  }
  if (resolveEventEffectTiming(context) !== 'afterGrants') {
    return false;
  }
  if (collectEventEffects(context).length === 0) {
    return false;
  }
  return collectFreeOperationGrants(context).length > 0;
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
    decisionAuthority: { source: 'engineRuntime', player: activePlayer, ownershipEnforcement: 'strict' },
    bindings: { ...moveParams },
    moveParams,
    collector: collector ?? createCollector(),
    mode: 'execution',
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
  const context = resolvePlayableEventExecutionContext(def, state, move);
  if (context === null) {
    return { state, rng, emittedEvents: [] };
  }

  const eventEffects = collectEventEffects(context);
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
  const effectTiming = resolveEventEffectTiming(context);
  const deferredEventEffect = effectTiming === 'afterGrants' && eventEffects.length > 0
    ? {
      effects: eventEffects,
      moveParams: { ...move.params },
      actorPlayer: state.activePlayer,
      actionId,
    }
    : undefined;
  if (deferredEventEffect === undefined && eventEffects.length > 0) {
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
    ...(deferredEventEffect === undefined ? {} : { deferredEventEffect }),
  };
};

export const resolveEventFreeOperationGrants = (
  def: GameDef,
  state: GameState,
  move: Move,
): readonly EventFreeOperationGrantDef[] => {
  const context = resolvePlayableEventExecutionContext(def, state, move);
  if (context === null) {
    return [];
  }
  return collectFreeOperationGrants(context);
};

export const resolveEventEligibilityOverrides = (
  def: GameDef,
  state: GameState,
  move: Move,
): readonly EventEligibilityOverrideDef[] => {
  const context = resolvePlayableEventExecutionContext(def, state, move);
  if (context === null) {
    return [];
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
