import { asPlayerId } from './branded.js';
import type { GameDef, GameState, Move, TriggerLogEntry, TurnFlowRuntimeCardState } from './types.js';

interface TurnFlowTransitionResult {
  readonly state: GameState;
  readonly traceEntries: readonly TriggerLogEntry[];
}

const isPassAction = (move: Move): boolean => String(move.actionId) === 'pass';

const normalizeFactionOrder = (factions: readonly string[]): readonly string[] => {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const faction of factions) {
    if (seen.has(faction)) {
      continue;
    }
    seen.add(faction);
    ordered.push(faction);
  }
  return ordered;
};

const parseFactionPlayer = (faction: string, playerCount: number): number | null => {
  if (!/^\d+$/.test(faction)) {
    return null;
  }
  const parsed = Number(faction);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed >= playerCount) {
    return null;
  }
  return parsed;
};

const resolveActiveFaction = (state: GameState): string | null => {
  const runtime = state.turnFlow;
  if (runtime === undefined) {
    return null;
  }
  const faction = String(state.activePlayer);
  return runtime.factionOrder.includes(faction) ? faction : null;
};

const computeCandidates = (
  factionOrder: readonly string[],
  eligibility: Readonly<Record<string, boolean>>,
  actedFactions: ReadonlySet<string>,
): { readonly first: string | null; readonly second: string | null } => {
  const candidates = factionOrder.filter((faction) => eligibility[faction] === true && !actedFactions.has(faction));
  return {
    first: candidates[0] ?? null,
    second: candidates[1] ?? null,
  };
};

const cardSnapshot = (card: TurnFlowRuntimeCardState) => ({
  firstEligible: card.firstEligible,
  secondEligible: card.secondEligible,
  actedFactions: card.actedFactions,
  passedFactions: card.passedFactions,
  nonPassCount: card.nonPassCount,
});

const withActiveFromFirstEligible = (state: GameState, firstEligible: string | null): GameState => {
  if (firstEligible === null) {
    return state;
  }

  const playerId = parseFactionPlayer(firstEligible, state.playerCount);
  if (playerId === null) {
    return state;
  }

  return {
    ...state,
    activePlayer: asPlayerId(playerId),
  };
};

export const initializeTurnFlowEligibilityState = (def: GameDef, state: GameState): GameState => {
  const factions = def.turnFlow?.eligibility.factions;
  if (factions === undefined || factions.length === 0) {
    return state;
  }

  const factionOrder = normalizeFactionOrder(factions);
  if (factionOrder.length === 0) {
    return state;
  }

  const eligibility = Object.fromEntries(factionOrder.map((faction) => [faction, true]));
  const candidates = computeCandidates(factionOrder, eligibility, new Set());
  const nextState: GameState = {
    ...state,
    turnFlow: {
      factionOrder,
      eligibility,
      currentCard: {
        firstEligible: candidates.first,
        secondEligible: candidates.second,
        actedFactions: [],
        passedFactions: [],
        nonPassCount: 0,
      },
    },
  };

  return withActiveFromFirstEligible(nextState, candidates.first);
};

export const isActiveFactionEligibleForTurnFlow = (state: GameState): boolean => {
  const runtime = state.turnFlow;
  if (runtime === undefined) {
    return true;
  }

  const activeFaction = resolveActiveFaction(state);
  if (activeFaction === null) {
    return true;
  }

  return (
    activeFaction === runtime.currentCard.firstEligible ||
    activeFaction === runtime.currentCard.secondEligible
  );
};

export const applyTurnFlowEligibilityAfterMove = (
  def: GameDef,
  state: GameState,
  move: Move,
): TurnFlowTransitionResult => {
  const runtime = state.turnFlow;
  if (runtime === undefined) {
    return { state, traceEntries: [] };
  }

  const activeFaction = resolveActiveFaction(state);
  if (activeFaction === null) {
    return { state, traceEntries: [] };
  }

  const before = runtime.currentCard;
  const acted = new Set(before.actedFactions);
  acted.add(activeFaction);
  const passed = new Set(before.passedFactions);
  let nonPassCount = before.nonPassCount;
  const rewards: Array<{ resource: string; amount: number }> = [];
  let step: 'candidateScan' | 'passChain' = 'candidateScan';

  if (isPassAction(move)) {
    step = 'passChain';
    passed.add(activeFaction);
    for (const reward of def.turnFlow?.passRewards ?? []) {
      if (reward.factionClass !== activeFaction) {
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

  const activeCardCandidates = computeCandidates(runtime.factionOrder, runtime.eligibility, acted);
  const currentCard: TurnFlowRuntimeCardState = {
    firstEligible: activeCardCandidates.first,
    secondEligible: activeCardCandidates.second,
    actedFactions: [...acted],
    passedFactions: [...passed],
    nonPassCount,
  };

  const rewardState =
    rewards.length === 0
      ? state
      : {
          ...state,
          globalVars: rewards.reduce<Readonly<Record<string, number>>>(
            (vars, reward) => ({
              ...vars,
              [reward.resource]: (vars[reward.resource] ?? 0) + reward.amount,
            }),
            state.globalVars,
          ),
        };

  const traceEntries: TriggerLogEntry[] = [
    {
      kind: 'turnFlowEligibility',
      step,
      faction: activeFaction,
      before: cardSnapshot(before),
      after: cardSnapshot(currentCard),
      ...(rewards.length === 0 ? {} : { rewards }),
    },
  ];

  let endedReason: 'rightmostPass' | 'twoNonPass' | undefined;
  if (step === 'passChain' && currentCard.firstEligible === null && currentCard.secondEligible === null) {
    endedReason = 'rightmostPass';
  } else if (currentCard.nonPassCount >= 2) {
    endedReason = 'twoNonPass';
  }

  let nextCard = currentCard;
  if (endedReason !== undefined) {
    const resetCandidates = computeCandidates(runtime.factionOrder, runtime.eligibility, new Set());
    nextCard = {
      firstEligible: resetCandidates.first,
      secondEligible: resetCandidates.second,
      actedFactions: [],
      passedFactions: [],
      nonPassCount: 0,
    };
    traceEntries.push({
      kind: 'turnFlowEligibility',
      step: 'cardEnd',
      faction: activeFaction,
      before: cardSnapshot(currentCard),
      after: cardSnapshot(nextCard),
      reason: endedReason,
    });
  }

  const stateWithTurnFlow: GameState = {
    ...rewardState,
    turnFlow: {
      ...runtime,
      currentCard: nextCard,
    },
  };

  return {
    state: withActiveFromFirstEligible(stateWithTurnFlow, nextCard.firstEligible),
    traceEntries,
  };
};
