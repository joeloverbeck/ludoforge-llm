import { asPlayerId } from './branded.js';
import type {
  GameDef,
  GameState,
  Move,
  TriggerLogEntry,
  TurnFlowDuration,
  TurnFlowPendingEligibilityOverride,
  TurnFlowRuntimeCardState,
} from './types.js';

interface TurnFlowTransitionResult {
  readonly state: GameState;
  readonly traceEntries: readonly TriggerLogEntry[];
}

const isPassAction = (move: Move): boolean => String(move.actionId) === 'pass';
const ELIGIBILITY_OVERRIDE_PREFIX = 'eligibilityOverride:';

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

export const resolveTurnFlowActionClass = (move: Move): 'pass' | 'event' | 'operation' | 'limitedOperation' | 'operationPlusSpecialActivity' | null => {
  const actionId = String(move.actionId);
  return isTurnFlowActionClass(actionId) ? actionId : null;
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

const readNumericResource = (vars: Readonly<Record<string, number | boolean>>, name: string): number => {
  const value = vars[name];
  if (value === undefined) {
    return 0;
  }
  if (typeof value !== 'number') {
    throw new Error(`Turn-flow pass reward requires numeric global var: ${name}`);
  }
  return value;
};

const resolveActiveFaction = (state: GameState): string | null => {
  const runtime = cardDrivenRuntime(state);
  if (runtime === null) {
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
  firstActionClass: card.firstActionClass,
});

const indexOverrideWindows = (
  def: GameDef,
): Readonly<Record<string, TurnFlowDuration>> =>
  Object.fromEntries((cardDrivenConfig(def)?.turnFlow.eligibility.overrideWindows ?? []).map((windowDef) => [windowDef.id, windowDef.duration]));

const extractOverrideDirectiveTokens = (value: Move['params'][string]): readonly string[] => {
  if (typeof value === 'string') {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  return [];
};

const resolveDirectiveFaction = (
  token: string,
  activeFaction: string,
  factionOrder: readonly string[],
): string | null => {
  if (token === 'self') {
    return activeFaction;
  }
  return factionOrder.includes(token) ? token : null;
};

const resolveDirectiveEligibility = (token: string): boolean | null => {
  if (token === 'eligible' || token === 'true') {
    return true;
  }
  if (token === 'ineligible' || token === 'false') {
    return false;
  }
  return null;
};

const extractPendingEligibilityOverrides = (
  def: GameDef,
  move: Move,
  activeFaction: string,
  factionOrder: readonly string[],
): readonly TurnFlowPendingEligibilityOverride[] => {
  const windowById = indexOverrideWindows(def);
  const overrides: TurnFlowPendingEligibilityOverride[] = [];
  for (const paramValue of Object.values(move.params)) {
    for (const token of extractOverrideDirectiveTokens(paramValue)) {
      if (!token.startsWith(ELIGIBILITY_OVERRIDE_PREFIX)) {
        continue;
      }
      const [factionToken, eligibilityToken, windowId] = token.slice(ELIGIBILITY_OVERRIDE_PREFIX.length).split(':');
      if (factionToken === undefined || eligibilityToken === undefined || windowId === undefined || windowId.length === 0) {
        continue;
      }
      const faction = resolveDirectiveFaction(factionToken, activeFaction, factionOrder);
      const eligible = resolveDirectiveEligibility(eligibilityToken);
      const duration = windowById[windowId];
      if (faction === null || eligible === null || duration !== 'nextTurn') {
        continue;
      }
      overrides.push({
        faction,
        eligible,
        windowId,
        duration,
      });
    }
  }

  return overrides;
};

const computePostCardEligibility = (
  factionOrder: readonly string[],
  currentCard: TurnFlowRuntimeCardState,
  overrides: readonly TurnFlowPendingEligibilityOverride[],
): Readonly<Record<string, boolean>> => {
  const passed = new Set(currentCard.passedFactions);
  const executed = new Set(currentCard.actedFactions.filter((faction) => !passed.has(faction)));
  const eligibility = Object.fromEntries(factionOrder.map((faction) => [faction, !executed.has(faction)]));
  for (const override of overrides) {
    eligibility[override.faction] = override.eligible;
  }
  return eligibility;
};

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
  const flow = cardDrivenConfig(def)?.turnFlow;
  if (flow === undefined) {
    return state;
  }

  const factions = flow.eligibility.factions;
  const factionOrder = normalizeFactionOrder(factions);
  const eligibility = Object.fromEntries(factionOrder.map((faction) => [faction, true])) as Readonly<Record<string, boolean>>;
  const candidates = computeCandidates(factionOrder, eligibility, new Set());
  const nextState: GameState = {
    ...state,
    turnOrderState: {
      type: 'cardDriven',
      runtime: {
        factionOrder,
        eligibility,
        pendingEligibilityOverrides: [],
        currentCard: {
          firstEligible: candidates.first,
          secondEligible: candidates.second,
          actedFactions: [],
          passedFactions: [],
          nonPassCount: 0,
          firstActionClass: null,
        },
        ...(cardDrivenConfig(def)?.coupPlan?.maxConsecutiveRounds === undefined ? {} : { consecutiveCoupRounds: 0 }),
      },
    },
  };

  return withActiveFromFirstEligible(nextState, candidates.first);
};

export const isActiveFactionEligibleForTurnFlow = (state: GameState): boolean => {
  if (state.turnOrderState.type === 'simultaneous') {
    return state.turnOrderState.submitted[String(state.activePlayer)] !== true;
  }

  const runtime = cardDrivenRuntime(state);
  if (runtime === null) {
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
  const runtime = cardDrivenRuntime(state);
  if (runtime === null) {
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
    for (const reward of cardDrivenConfig(def)?.turnFlow.passRewards ?? []) {
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

  const moveClass = resolveTurnFlowActionClass(move);
  const newOverrides = extractPendingEligibilityOverrides(def, move, activeFaction, runtime.factionOrder);
  const pendingOverrides = [...(runtime.pendingEligibilityOverrides ?? []), ...newOverrides];
  const firstActionClass =
    before.firstActionClass ??
    (before.nonPassCount === 0 && moveClass !== 'pass' ? normalizeFirstActionClass(moveClass) : null);

  const activeCardCandidates = computeCandidates(runtime.factionOrder, runtime.eligibility, acted);
  const currentCard: TurnFlowRuntimeCardState = {
    firstEligible: activeCardCandidates.first,
    secondEligible: activeCardCandidates.second,
    actedFactions: [...acted],
    passedFactions: [...passed],
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
      faction: activeFaction,
      before: cardSnapshot(before),
      after: cardSnapshot(currentCard),
      ...(rewards.length === 0 ? {} : { rewards }),
    },
  ];
  if (newOverrides.length > 0) {
    traceEntries.push({
      kind: 'turnFlowEligibility',
      step: 'overrideCreate',
      faction: activeFaction,
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
  if (endedReason !== undefined) {
    nextEligibility = computePostCardEligibility(runtime.factionOrder, currentCard, pendingOverrides);
    nextPendingOverrides = [];
    const resetCandidates = computeCandidates(runtime.factionOrder, nextEligibility, new Set());
    nextTurn = {
      firstEligible: resetCandidates.first,
      secondEligible: resetCandidates.second,
      actedFactions: [],
      passedFactions: [],
      nonPassCount: 0,
      firstActionClass: null,
    };
    traceEntries.push({
      kind: 'turnFlowEligibility',
      step: 'cardEnd',
      faction: activeFaction,
      before: cardSnapshot(currentCard),
      after: cardSnapshot(nextTurn),
      eligibilityBefore: runtime.eligibility,
      eligibilityAfter: nextEligibility,
      ...(pendingOverrides.length === 0 ? {} : { overrides: pendingOverrides }),
      reason: endedReason,
    });
  }

  const stateWithTurnFlow: GameState = {
    ...rewardState,
    turnOrderState: {
      type: 'cardDriven',
      runtime: {
        ...runtime,
        eligibility: nextEligibility,
        pendingEligibilityOverrides: nextPendingOverrides,
        currentCard: nextTurn,
      },
    },
  };

  return {
    state: withActiveFromFirstEligible(stateWithTurnFlow, nextTurn.firstEligible),
    traceEntries,
  };
};
