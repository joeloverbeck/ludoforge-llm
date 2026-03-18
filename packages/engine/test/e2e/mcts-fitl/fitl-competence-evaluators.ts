import type { MctsBudgetProfile, MctsSearchDiagnostics } from '../../../src/agents/index.js';
import {
  isSoloSeatControlled,
  type GameDef,
  type GameState,
  type Move,
  type PlayerId,
  type ValidatedGameDef,
} from '../../../src/kernel/index.js';
import {
  computeArvnVictory,
  computeNvaVictory,
  computeUsVictory,
  computeVcVictory,
  FITL_FACTION_CONFIG,
} from './fitl-mcts-test-helpers.js';

export interface CompetenceEvalContext {
  readonly def: ValidatedGameDef;
  readonly stateBefore: GameState;
  readonly move: Move;
  readonly stateAfter: GameState;
  readonly playerId: PlayerId;
  readonly diagnostics: MctsSearchDiagnostics;
  readonly budget: MctsBudgetProfile;
}

export interface CompetenceEvalResult {
  readonly evaluatorName: string;
  readonly passed: boolean;
  readonly explanation: string;
  readonly score?: number;
}

export interface CompetenceEvaluator {
  readonly name: string;
  readonly minBudget: MctsBudgetProfile;
  readonly evaluate: (ctx: CompetenceEvalContext) => CompetenceEvalResult;
}

type VictoryScoreComputer = (def: GameDef, state: GameState) => number;

interface VictoryDistanceSnapshot {
  readonly scoreBefore: number;
  readonly scoreAfter: number;
  readonly distanceBefore: number;
  readonly distanceAfter: number;
}

const getVictoryDistanceSnapshot = (
  def: GameDef,
  stateBefore: GameState,
  stateAfter: GameState,
  computeVictory: VictoryScoreComputer,
  threshold: number,
): VictoryDistanceSnapshot => {
  const scoreBefore = computeVictory(def, stateBefore);
  const scoreAfter = computeVictory(def, stateAfter);
  return {
    scoreBefore,
    scoreAfter,
    distanceBefore: threshold - scoreBefore,
    distanceAfter: threshold - scoreAfter,
  };
};

export const categoryCompetence = (acceptableActionIds: readonly string[]): CompetenceEvaluator => ({
  name: 'categoryCompetence',
  minBudget: 'interactive',
  evaluate: (ctx): CompetenceEvalResult => {
    const actualActionId = String(ctx.move.actionId);
    const passed = acceptableActionIds.includes(actualActionId);
    return {
      evaluatorName: 'categoryCompetence',
      passed,
      explanation: passed
        ? `actionId '${actualActionId}' is acceptable`
        : `expected actionId in [${acceptableActionIds.join(', ')}], got '${actualActionId}'`,
    };
  },
});

export const budgetRank = (budget: MctsBudgetProfile): number => {
  switch (budget) {
    case 'interactive':
      return 0;
    case 'turn':
      return 1;
    case 'background':
      return 2;
    case 'analysis':
      return 3;
  }
};

export const victoryProgress = (
  computeVictory: VictoryScoreComputer,
  threshold: number,
  tolerance: number,
): CompetenceEvaluator => ({
  name: 'victoryProgress',
  minBudget: 'turn',
  evaluate: (ctx): CompetenceEvalResult => {
    const snapshot = getVictoryDistanceSnapshot(
      ctx.def,
      ctx.stateBefore,
      ctx.stateAfter,
      computeVictory,
      threshold,
    );
    const score = snapshot.distanceBefore - snapshot.distanceAfter;
    const passed = snapshot.distanceAfter <= snapshot.distanceBefore + tolerance;
    return {
      evaluatorName: 'victoryProgress',
      passed,
      score,
      explanation: `${passed ? 'Passed' : 'Failed'} — threshold=${threshold}, before=${snapshot.scoreBefore} (dist=${snapshot.distanceBefore}), after=${snapshot.scoreAfter} (dist=${snapshot.distanceAfter}), delta=${score}, tolerance=${tolerance}`,
    };
  },
});

export const victoryDefense = (
  computeOwnVictory: VictoryScoreComputer,
  computeOpponentVictory: VictoryScoreComputer,
  ownThreshold: number,
  opponentThreshold: number,
  tolerance: number,
): CompetenceEvaluator => ({
  name: 'victoryDefense',
  minBudget: 'turn',
  evaluate: (ctx): CompetenceEvalResult => {
    const own = getVictoryDistanceSnapshot(
      ctx.def,
      ctx.stateBefore,
      ctx.stateAfter,
      computeOwnVictory,
      ownThreshold,
    );
    const opponent = getVictoryDistanceSnapshot(
      ctx.def,
      ctx.stateBefore,
      ctx.stateAfter,
      computeOpponentVictory,
      opponentThreshold,
    );
    const leadBefore = opponent.distanceBefore - own.distanceBefore;
    const leadAfter = opponent.distanceAfter - own.distanceAfter;
    const score = leadAfter - leadBefore;
    const passed = leadAfter >= leadBefore - tolerance;
    return {
      evaluatorName: 'victoryDefense',
      passed,
      score,
      explanation: `${passed ? 'Passed' : 'Failed'} — own dist ${own.distanceBefore}->${own.distanceAfter}, opponent dist ${opponent.distanceBefore}->${opponent.distanceAfter}, lead ${leadBefore}->${leadAfter}, delta=${score}, tolerance=${tolerance}`,
    };
  },
});

const getCardDrivenTurnFlow = (def: ValidatedGameDef) =>
  def.turnOrder?.type === 'cardDriven' ? def.turnOrder.config.turnFlow : null;

const getSeatId = (def: ValidatedGameDef, playerId: PlayerId): string | null => {
  const seat = def.seats?.[Number(playerId)];
  return seat === undefined ? null : String(seat.id);
};

const getPassRewardForPlayer = (
  def: ValidatedGameDef,
  playerId: PlayerId,
): { readonly resource: string; readonly amount: number } | null => {
  const turnFlow = getCardDrivenTurnFlow(def);
  const seatId = getSeatId(def, playerId);
  if (turnFlow === null || seatId === null) {
    return null;
  }
  const reward = turnFlow.passRewards.find((candidate: { readonly seat: string }) => candidate.seat === seatId);
  return reward === undefined ? null : { resource: reward.resource, amount: reward.amount };
};

const getFactionResources = (ctx: CompetenceEvalContext): number | null => {
  const passReward = getPassRewardForPlayer(ctx.def, ctx.playerId);
  if (passReward === null) {
    return null;
  }
  const value = ctx.stateBefore.globalVars[passReward.resource];
  return typeof value === 'number' ? value : null;
};

const isPassMove = (move: Move): boolean => String(move.actionId) === 'pass';

const isPaidActionClass = (move: Move): boolean =>
  move.actionClass === 'operation'
  || move.actionClass === 'operationPlusSpecialActivity'
  || move.actionClass === 'limitedOperation';

const getLookaheadCard = (ctx: CompetenceEvalContext) => {
  const turnFlow = getCardDrivenTurnFlow(ctx.def);
  if (turnFlow === null) {
    return null;
  }
  const lookaheadZoneId = turnFlow.cardLifecycle.lookahead;
  return ctx.stateBefore.zones[lookaheadZoneId]?.[0] ?? null;
};

const isMonsoonWindow = (ctx: CompetenceEvalContext): boolean =>
  getLookaheadCard(ctx)?.props.isCoup === true;

const getMonsoonRestrictedActionIds = (ctx: CompetenceEvalContext): ReadonlySet<string> => {
  const turnFlow = getCardDrivenTurnFlow(ctx.def);
  if (turnFlow === null) {
    return new Set<string>();
  }

  const restricted = new Set<string>(
    turnFlow.monsoon?.restrictedActions.map((entry: { readonly actionId: string }) => entry.actionId) ?? [],
  );
  if (turnFlow.monsoon?.blockPivotal === true || turnFlow.pivotal?.disallowWhenLookaheadIsCoup === true) {
    for (const actionId of turnFlow.pivotal?.actionIds ?? []) {
      restricted.add(actionId);
    }
  }
  return restricted;
};

export const resourceDiscipline = (): CompetenceEvaluator => ({
  name: 'resourceDiscipline',
  minBudget: 'turn',
  evaluate: (ctx): CompetenceEvalResult => {
    const passReward = getPassRewardForPlayer(ctx.def, ctx.playerId);
    if (passReward === null) {
      return {
        evaluatorName: 'resourceDiscipline',
        passed: true,
        explanation: 'Skipped — no pass reward/resource mapping for acting faction',
      };
    }

    const resources = getFactionResources(ctx);
    if (resources === null) {
      return {
        evaluatorName: 'resourceDiscipline',
        passed: true,
        explanation: `Skipped — resource '${passReward.resource}' is not numeric in stateBefore`,
      };
    }

    if (resources > 0) {
      return {
        evaluatorName: 'resourceDiscipline',
        passed: true,
        explanation: `Skipped — resources=${resources} > 0`,
      };
    }

    if (isPassMove(ctx.move)) {
      return {
        evaluatorName: 'resourceDiscipline',
        passed: true,
        explanation: `Passed — chose pass at 0 resources and gains ${passReward.amount} ${passReward.resource}`,
      };
    }

    if (ctx.move.freeOperation === true) {
      return {
        evaluatorName: 'resourceDiscipline',
        passed: true,
        explanation: 'Skipped — freeOperation move does not test paid resource discipline',
      };
    }

    if (passReward.amount > 0 && isPaidActionClass(ctx.move)) {
      return {
        evaluatorName: 'resourceDiscipline',
        passed: false,
        explanation: `Failed — chose paid actionClass '${ctx.move.actionClass}' at 0 resources instead of pass (+${passReward.amount} ${passReward.resource})`,
      };
    }

    return {
      evaluatorName: 'resourceDiscipline',
      passed: true,
      explanation: `Skipped — move actionId '${String(ctx.move.actionId)}' is outside paid-action discipline scope`,
    };
  },
});

export const monsoonAwareness = (): CompetenceEvaluator => ({
  name: 'monsoonAwareness',
  minBudget: 'background',
  evaluate: (ctx): CompetenceEvalResult => {
    if (!isMonsoonWindow(ctx)) {
      return {
        evaluatorName: 'monsoonAwareness',
        passed: true,
        explanation: 'Skipped — lookahead card is not a Coup card',
      };
    }

    const restrictedActions = getMonsoonRestrictedActionIds(ctx);
    const actionId = String(ctx.move.actionId);
    const passed = !restrictedActions.has(actionId);
    return {
      evaluatorName: 'monsoonAwareness',
      passed,
      explanation: passed
        ? `Passed — actionId '${actionId}' is allowed during monsoon`
        : `Failed — actionId '${actionId}' is restricted during monsoon by turn-flow config`,
    };
  },
});

export interface PassStrategicValueOptions {
  readonly minAdequateResources: number;
  readonly isUpcomingCardStrong: (ctx: CompetenceEvalContext) => boolean;
}

export const passStrategicValue = (
  options: PassStrategicValueOptions,
): CompetenceEvaluator => ({
  name: 'passStrategicValue',
  minBudget: 'background',
  evaluate: (ctx): CompetenceEvalResult => {
    if (!isPassMove(ctx.move)) {
      return {
        evaluatorName: 'passStrategicValue',
        passed: true,
        explanation: 'Skipped — move is not pass',
      };
    }

    const passReward = getPassRewardForPlayer(ctx.def, ctx.playerId);
    const resources = getFactionResources(ctx);
    if (passReward === null || resources === null) {
      return {
        evaluatorName: 'passStrategicValue',
        passed: true,
        explanation: 'Skipped — pass reward/resource mapping unavailable for acting faction',
      };
    }

    const upcomingStrong = options.isUpcomingCardStrong(ctx);
    const resourceStarved = resources < options.minAdequateResources;
    const passed = resourceStarved || !upcomingStrong;
    return {
      evaluatorName: 'passStrategicValue',
      passed,
      explanation: passed
        ? `Passed — pass is strategic (resources=${resources}, passReward=+${passReward.amount} ${passReward.resource}, upcomingStrong=${upcomingStrong})`
        : `Failed — pass wasted initiative (resources=${resources} >= ${options.minAdequateResources}, passReward=+${passReward.amount} ${passReward.resource}, upcomingStrong=${upcomingStrong})`,
    };
  },
});

const SUPPORT_STATES = new Set(['activeSupport', 'passiveSupport']);
const MAP_ZONE_CATEGORIES = new Set(['city', 'province', 'loc']);
const COIN_FACTIONS = new Set(['US', 'ARVN']);
const INSURGENT_FACTIONS = new Set(['NVA', 'VC']);
const SOUTH_VIETNAM = 'southVietnam';
const NORTH_VIETNAM = 'northVietnam';
const MCNAMARA_LINE_VAR = 'mom_mcnamaraLine';

const getMoveActionId = (move: Move): string => String(move.actionId);
const getActionMove = (move: Move, actionId: string): Move | null => {
  if (getMoveActionId(move) === actionId) {
    return move;
  }
  if (getCompoundSpecialActionId(move) === actionId) {
    return move.compound!.specialActivity;
  }
  return null;
};
const getCompoundSpecialActionId = (move: Move): string | null =>
  move.compound === undefined ? null : String(move.compound.specialActivity.actionId);
const moveIncludesAction = (move: Move, actionId: string): boolean =>
  getMoveActionId(move) === actionId || getCompoundSpecialActionId(move) === actionId;

const getMoveParamString = (move: Move, paramName: string): string | null => {
  const value = (move.params as Record<string, unknown>)[paramName];
  return typeof value === 'string' ? value : null;
};

const getMoveParamStringArray = (move: Move, paramName: string): readonly string[] => {
  const value = (move.params as Record<string, unknown>)[paramName];
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === 'string');
};

const getMoveTargetSpaces = (move: Move): readonly string[] => {
  return getMoveParamStringArray(move, '$targetSpaces');
};

const getActionTargetSpaces = (
  move: Move,
  actionId: string,
): readonly string[] => {
  if (getMoveActionId(move) === actionId) {
    return getMoveTargetSpaces(move);
  }
  if (getCompoundSpecialActionId(move) === actionId) {
    return getMoveTargetSpaces(move.compound!.specialActivity);
  }
  return [];
};

const getMapZoneIds = (def: ValidatedGameDef): readonly string[] =>
  def.zones
    .filter((zone) => zone.zoneKind === 'board' || MAP_ZONE_CATEGORIES.has(String(zone.category ?? '')))
    .map((zone) => zone.id);

const getZoneDef = (def: ValidatedGameDef, zoneId: string) =>
  def.zones.find((zone) => zone.id === zoneId);

const getZoneNumericAttribute = (
  def: ValidatedGameDef,
  zoneId: string,
  attribute: string,
): number => {
  const value = getZoneDef(def, zoneId)?.attributes?.[attribute];
  return typeof value === 'number' ? value : 0;
};

const getZoneStringAttribute = (
  def: ValidatedGameDef,
  zoneId: string,
  attribute: string,
): string | null => {
  const value = getZoneDef(def, zoneId)?.attributes?.[attribute];
  return typeof value === 'string' ? value : null;
};

const isLocZone = (def: ValidatedGameDef, zoneId: string): boolean =>
  getZoneDef(def, zoneId)?.category === 'loc';

const getAdjacentZoneIds = (
  def: ValidatedGameDef,
  zoneId: string,
): readonly string[] => getZoneDef(def, zoneId)?.adjacentTo?.map((edge) => edge.to) ?? [];

const getSupportOppositionState = (state: GameState, zoneId: string): string =>
  String(state.markers[zoneId]?.supportOpposition ?? 'neutral');

const getTerrorCount = (state: GameState, zoneId: string): number => {
  const value = state.zoneVars[zoneId]?.terrorCount;
  return typeof value === 'number' ? value : 0;
};

const countTokens = (
  state: GameState,
  zoneId: string,
  predicate: (token: GameState['zones'][string][number]) => boolean,
): number => (state.zones[zoneId] ?? []).filter(predicate).length;

const getTokenPieceType = (
  token: GameState['zones'][string][number],
): string | null => {
  const pieceType = token.props.type;
  return typeof pieceType === 'string' ? pieceType : null;
};

const countFactionTokens = (
  state: GameState,
  zoneId: string,
  faction: string,
  type?: string,
): number => countTokens(state, zoneId, (token) =>
  token.props.faction === faction
  && (type === undefined || getTokenPieceType(token) === type));

const countFactionSetTokens = (
  state: GameState,
  zoneId: string,
  factions: ReadonlySet<string>,
  type?: string,
): number => countTokens(state, zoneId, (token) =>
  factions.has(String(token.props.faction))
  && (type === undefined || getTokenPieceType(token) === type));

const countVcGuerrillas = (
  state: GameState,
  zoneId: string,
  activity?: 'active' | 'underground',
): number => countTokens(state, zoneId, (token) =>
  token.props.faction === 'VC'
  && getTokenPieceType(token) === 'guerrilla'
  && (activity === undefined || token.props.activity === activity));

const countVcBases = (state: GameState, zoneId: string): number =>
  countTokens(state, zoneId, (token) =>
    token.props.faction === 'VC' && getTokenPieceType(token) === 'base');

const countInsurgentGuerrillas = (
  state: GameState,
  zoneId: string,
  activity?: 'active' | 'underground',
): number => countTokens(state, zoneId, (token) =>
  INSURGENT_FACTIONS.has(String(token.props.faction))
  && getTokenPieceType(token) === 'guerrilla'
  && (activity === undefined || token.props.activity === activity));

const countInsurgentPieces = (state: GameState, zoneId: string): number =>
  countFactionSetTokens(state, zoneId, INSURGENT_FACTIONS);

const countInsurgentBases = (state: GameState, zoneId: string): number =>
  countFactionSetTokens(state, zoneId, INSURGENT_FACTIONS, 'base');

const countTunneledInsurgentBases = (state: GameState, zoneId: string): number =>
  countTokens(state, zoneId, (token) =>
    INSURGENT_FACTIONS.has(String(token.props.faction))
    && getTokenPieceType(token) === 'base'
    && token.props.tunnel === 'tunneled');

const countUsPieces = (state: GameState, zoneId: string): number =>
  countFactionTokens(state, zoneId, 'US');

const countAllBases = (state: GameState, zoneId: string): number =>
  countTokens(state, zoneId, (token) => getTokenPieceType(token) === 'base');

const countArvnCubes = (state: GameState, zoneId: string): number =>
  countTokens(state, zoneId, (token) =>
    token.props.faction === 'ARVN'
    && (getTokenPieceType(token) === 'troops' || getTokenPieceType(token) === 'police'));

const countArvnRangers = (state: GameState, zoneId: string): number =>
  countTokens(state, zoneId, (token) =>
    token.props.faction === 'ARVN'
    && getTokenPieceType(token) === 'ranger');

const countArvnTrainPieces = (state: GameState, zoneId: string): number =>
  countArvnCubes(state, zoneId) + countArvnRangers(state, zoneId);

const getNumericGlobalVar = (
  state: GameState,
  varName: string,
): number | null => {
  const value = state.globalVars[varName];
  return typeof value === 'number' ? value : null;
};

const hasSabotageMarker = (state: GameState, zoneId: string): boolean =>
  state.markers[zoneId]?.sabotage === 'sabotage';

const getArvnTrainOpportunityScore = (
  def: ValidatedGameDef,
  state: GameState,
  zoneId: string,
): number => {
  const zone = getZoneDef(def, zoneId);
  if (zone === undefined || (zone.category !== 'city' && zone.category !== 'province')) {
    return 0;
  }
  if (getZoneStringAttribute(def, zoneId, 'country') === NORTH_VIETNAM) {
    return 0;
  }

  const population = getZoneNumericAttribute(def, zoneId, 'population');
  const cityBonus = zone.category === 'city' ? 50 : 0;
  const insurgentPressure = countInsurgentPieces(state, zoneId) * 5;
  const currentArvnPresencePenalty = countArvnTrainPieces(state, zoneId);
  return cityBonus + (population * 10) + insurgentPressure - currentArvnPresencePenalty;
};

const getArvnTrainImprovement = (
  stateBefore: GameState,
  stateAfter: GameState,
  zoneId: string,
): number =>
  countArvnTrainPieces(stateAfter, zoneId) - countArvnTrainPieces(stateBefore, zoneId);

const countImprovedUndergroundVc = (
  stateBefore: GameState,
  stateAfter: GameState,
  zoneId: string,
): number => {
  const totalDelta = countVcGuerrillas(stateAfter, zoneId) - countVcGuerrillas(stateBefore, zoneId);
  const undergroundDelta = countVcGuerrillas(stateAfter, zoneId, 'underground')
    - countVcGuerrillas(stateBefore, zoneId, 'underground');
  return totalDelta + undergroundDelta;
};

const getWithBaseRallyOpportunityScore = (
  def: ValidatedGameDef,
  state: GameState,
  zoneId: string,
): number => {
  const baseCount = countVcBases(state, zoneId);
  if (baseCount === 0) {
    return 0;
  }
  const population = getZoneNumericAttribute(def, zoneId, 'population');
  const underground = countVcGuerrillas(state, zoneId, 'underground');
  const active = countVcGuerrillas(state, zoneId, 'active');
  const placementHeadroom = Math.max((population + baseCount) - underground, 0);
  return placementHeadroom + active;
};

const getTaxOpportunityScore = (
  def: ValidatedGameDef,
  state: GameState,
  zoneId: string,
): number => {
  if (countVcGuerrillas(state, zoneId, 'underground') === 0) {
    return 0;
  }
  if (isLocZone(def, zoneId)) {
    return getZoneNumericAttribute(def, zoneId, 'econ') * 100;
  }
  const population = getZoneNumericAttribute(def, zoneId, 'population');
  const supportBonus = population > 0 && getSupportOppositionState(state, zoneId) !== 'activeSupport' ? 1 : 0;
  return (population * 2 * 100) + supportBonus;
};

const getSubvertOpportunityScore = (
  state: GameState,
  zoneId: string,
): number => {
  const undergroundVc = countVcGuerrillas(state, zoneId, 'underground');
  const arvnCubes = countArvnCubes(state, zoneId);
  const availableVc = countVcGuerrillas(state, 'available-VC:none');
  if (undergroundVc === 0 || arvnCubes === 0) {
    return 0;
  }
  if (arvnCubes > 1) {
    return 200 + arvnCubes;
  }
  if (availableVc > 0) {
    return 100 + arvnCubes;
  }
  return 0;
};

const inferTargetedZones = (
  ctx: CompetenceEvalContext,
  predicate: (zoneId: string) => boolean,
): readonly string[] => {
  const fromMove = getMoveTargetSpaces(ctx.move);
  if (fromMove.length > 0) {
    return fromMove;
  }
  return getMapZoneIds(ctx.def).filter(predicate);
};

const inferActionTargetedZones = (
  ctx: CompetenceEvalContext,
  actionId: string,
  predicate: (zoneId: string) => boolean,
): readonly string[] => {
  const fromAction = getActionTargetSpaces(ctx.move, actionId);
  if (fromAction.length > 0) {
    return fromAction;
  }
  return getMapZoneIds(ctx.def).filter(predicate);
};

const getSouthVietnamPopulationTargets = (
  def: ValidatedGameDef,
): readonly { readonly zoneId: string; readonly population: number }[] =>
  getMapZoneIds(def)
    .map((zoneId) => ({
      zoneId,
      population: getZoneNumericAttribute(def, zoneId, 'population'),
      country: getZoneStringAttribute(def, zoneId, 'country'),
    }))
    .filter((entry) => entry.country === SOUTH_VIETNAM && entry.population > 0)
    .map(({ zoneId, population }) => ({ zoneId, population }));

const getZoneDistances = (
  def: ValidatedGameDef,
  startZoneId: string,
): ReadonlyMap<string, number> => {
  const visited = new Map<string, number>([[startZoneId, 0]]);
  const queue = [startZoneId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentDistance = visited.get(current)!;
    for (const adjacent of getAdjacentZoneIds(def, current)) {
      if (visited.has(adjacent)) {
        continue;
      }
      visited.set(adjacent, currentDistance + 1);
      queue.push(adjacent);
    }
  }
  return visited;
};

const getNvaSouthwardScore = (
  def: ValidatedGameDef,
  state: GameState,
): number => {
  const targets = getSouthVietnamPopulationTargets(def);
  if (targets.length === 0) {
    return 0;
  }

  return getMapZoneIds(def).reduce((score, zoneId) => {
    const troopCount = countFactionTokens(state, zoneId, 'NVA', 'troops');
    if (troopCount === 0) {
      return score;
    }

    const distances = getZoneDistances(def, zoneId);
    const bestTargetScore = targets.reduce((best, target) => {
      const distance = distances.get(target.zoneId);
      if (distance === undefined) {
        return best;
      }
      return Math.max(best, (target.population * 10) - distance);
    }, Number.NEGATIVE_INFINITY);
    return score + (troopCount * bestTargetScore);
  }, 0);
};

const countCoinPieces = (state: GameState, zoneId: string): number =>
  countFactionSetTokens(state, zoneId, COIN_FACTIONS);

const countCoinBases = (state: GameState, zoneId: string): number =>
  countFactionSetTokens(state, zoneId, COIN_FACTIONS, 'base');

const hasBombardOpportunity = (
  def: ValidatedGameDef,
  state: GameState,
): boolean => getMapZoneIds(def).some((zoneId) => {
  if (getZoneStringAttribute(def, zoneId, 'country') === NORTH_VIETNAM) {
    return false;
  }
  const hasEnemyPresence = countFactionSetTokens(state, zoneId, COIN_FACTIONS, 'troops') >= 3
    || countCoinBases(state, zoneId) > 0;
  if (!hasEnemyPresence) {
    return false;
  }
  const inSpaceTroops = countFactionTokens(state, zoneId, 'NVA', 'troops');
  const adjacentTroops = getAdjacentZoneIds(def, zoneId)
    .reduce((sum, adjacentZoneId) => sum + countFactionTokens(state, adjacentZoneId, 'NVA', 'troops'), 0);
  return inSpaceTroops >= 3 || adjacentTroops >= 3;
});

const getAirStrikeTargetSpaces = (move: Move): readonly string[] => {
  const airStrikeMove = getActionMove(move, 'airStrike');
  if (airStrikeMove === null) {
    return [];
  }
  return [
    ...getMoveParamStringArray(airStrikeMove, '$spaces'),
    ...getMoveParamStringArray(airStrikeMove, '$arcLightNoCoinProvinces'),
  ];
};

const getSupportShiftHeadroom = (state: GameState, zoneId: string): number => {
  switch (getSupportOppositionState(state, zoneId)) {
    case 'activeSupport':
      return 0;
    case 'passiveSupport':
      return 1;
    case 'neutral':
      return 2;
    case 'passiveOpposition':
      return 3;
    case 'activeOpposition':
      return 4;
    default:
      return 0;
  }
};

const getUsPacificationOpportunityScore = (
  def: ValidatedGameDef,
  state: GameState,
  zoneId: string,
): number => {
  const population = getZoneNumericAttribute(def, zoneId, 'population');
  const headroom = getSupportShiftHeadroom(state, zoneId);
  if (population <= 0 || headroom <= 0) {
    return 0;
  }
  const noTerrorBonus = getTerrorCount(state, zoneId) === 0 ? 1 : 0;
  return (population * headroom * 10) + noTerrorBonus;
};

export const vcRallyQuality = (): CompetenceEvaluator => ({
  name: 'vcRallyQuality',
  minBudget: 'background',
  evaluate: (ctx): CompetenceEvalResult => {
    if (getMoveActionId(ctx.move) !== 'rally') {
      return {
        evaluatorName: 'vcRallyQuality',
        passed: true,
        explanation: 'Skipped — move is not rally',
      };
    }

    const candidateScores = getMapZoneIds(ctx.def)
      .map((zoneId) => ({
        zoneId,
        score: getWithBaseRallyOpportunityScore(ctx.def, ctx.stateBefore, zoneId),
      }))
      .filter((candidate) => candidate.score > 0);
    if (candidateScores.length === 0) {
      return {
        evaluatorName: 'vcRallyQuality',
        passed: true,
        explanation: 'Skipped — no meaningful with-base VC rally opportunities were present',
      };
    }

    const improvedZones = getMapZoneIds(ctx.def)
      .map((zoneId) => ({
        zoneId,
        score: getWithBaseRallyOpportunityScore(ctx.def, ctx.stateBefore, zoneId),
        improvement: countImprovedUndergroundVc(ctx.stateBefore, ctx.stateAfter, zoneId),
      }))
      .filter((zone) => zone.improvement > 0);
    const improvedWithBase = improvedZones.find((zone) => zone.score > 0);
    const bestCandidate = candidateScores.reduce((best, candidate) =>
      candidate.score > best.score ? candidate : best);

    if (improvedWithBase !== undefined) {
      return {
        evaluatorName: 'vcRallyQuality',
        passed: true,
        explanation: `Passed — rally improved VC presence in with-base space '${improvedWithBase.zoneId}' (best with-base score=${bestCandidate.score})`,
        score: improvedWithBase.improvement,
      };
    }

    return {
      evaluatorName: 'vcRallyQuality',
      passed: false,
      explanation: `Failed — rally did not improve any with-base VC space despite opportunity at '${bestCandidate.zoneId}'`,
      score: 0,
    };
  },
});

export const vcTerrorTarget = (): CompetenceEvaluator => ({
  name: 'vcTerrorTarget',
  minBudget: 'background',
  evaluate: (ctx): CompetenceEvalResult => {
    if (getMoveActionId(ctx.move) !== 'terror') {
      return {
        evaluatorName: 'vcTerrorTarget',
        passed: true,
        explanation: 'Skipped — move is not terror',
      };
    }

    const candidateScores = getMapZoneIds(ctx.def)
      .map((zoneId) => {
        const population = getZoneNumericAttribute(ctx.def, zoneId, 'population');
        const supportState = getSupportOppositionState(ctx.stateBefore, zoneId);
        const supportBonus = SUPPORT_STATES.has(supportState) ? 10 : 0;
        return {
          zoneId,
          score: (population * 100) + supportBonus,
        };
      })
      .filter((candidate) => candidate.score > 0);
    const targetedZones = inferTargetedZones(ctx, (zoneId) =>
      getTerrorCount(ctx.stateAfter, zoneId) > getTerrorCount(ctx.stateBefore, zoneId)
      || getSupportOppositionState(ctx.stateAfter, zoneId) !== getSupportOppositionState(ctx.stateBefore, zoneId));

    if (targetedZones.length === 0) {
      return {
        evaluatorName: 'vcTerrorTarget',
        passed: false,
        explanation: 'Failed — terror move produced no identifiable targeted space',
      };
    }

    const bestScore = candidateScores.reduce((best, candidate) => Math.max(best, candidate.score), 0);
    const targetedScore = targetedZones.reduce((best, zoneId) => {
      const population = getZoneNumericAttribute(ctx.def, zoneId, 'population');
      const supportState = getSupportOppositionState(ctx.stateBefore, zoneId);
      const supportBonus = SUPPORT_STATES.has(supportState) ? 10 : 0;
      return Math.max(best, (population * 100) + supportBonus);
    }, 0);
    const passed = targetedScore >= bestScore;
    return {
      evaluatorName: 'vcTerrorTarget',
      passed,
      explanation: passed
        ? `Passed — terror targeted a top-value populated support space (score=${targetedScore})`
        : `Failed — terror targeted score=${targetedScore} while a better space scored ${bestScore}`,
      score: targetedScore,
    };
  },
});

export const vcBaseExpansion = (): CompetenceEvaluator => ({
  name: 'vcBaseExpansion',
  minBudget: 'background',
  evaluate: (ctx): CompetenceEvalResult => {
    if (getMoveActionId(ctx.move) !== 'rally') {
      return {
        evaluatorName: 'vcBaseExpansion',
        passed: true,
        explanation: 'Skipped — move is not rally',
      };
    }

    const eligibleZones = getMapZoneIds(ctx.def).filter((zoneId) =>
      countVcBases(ctx.stateBefore, zoneId) === 0
      && countVcGuerrillas(ctx.stateBefore, zoneId) >= 2
      && countAllBases(ctx.stateBefore, zoneId) < 2);
    if (eligibleZones.length === 0) {
      return {
        evaluatorName: 'vcBaseExpansion',
        passed: true,
        explanation: 'Skipped — no authored VC base-expansion opportunities were present',
      };
    }

    const expandedZone = eligibleZones.find((zoneId) => countVcBases(ctx.stateAfter, zoneId) > countVcBases(ctx.stateBefore, zoneId));
    const passed = expandedZone !== undefined;
    return {
      evaluatorName: 'vcBaseExpansion',
      passed,
      explanation: passed
        ? `Passed — rally expanded a VC base into '${expandedZone}'`
        : `Failed — rally ignored eligible VC base expansion in [${eligibleZones.join(', ')}]`,
    };
  },
});

export const vcOppositionGrowth = (): CompetenceEvaluator => ({
  name: 'vcOppositionGrowth',
  minBudget: 'background',
  evaluate: (ctx): CompetenceEvalResult => {
    const before = computeVcVictory(ctx.def, ctx.stateBefore);
    const after = computeVcVictory(ctx.def, ctx.stateAfter);
    const score = after - before;
    const passed = score >= 0;
    return {
      evaluatorName: 'vcOppositionGrowth',
      passed,
      score,
      explanation: passed
        ? `Passed — VC victory marker improved or held (${before} -> ${after})`
        : `Failed — VC victory marker regressed (${before} -> ${after})`,
    };
  },
});

export const vcResourceManagement = (): CompetenceEvaluator => ({
  name: 'vcResourceManagement',
  minBudget: 'background',
  evaluate: (ctx): CompetenceEvalResult => {
    const resourcesBefore = typeof ctx.stateBefore.globalVars.vcResources === 'number'
      ? ctx.stateBefore.globalVars.vcResources
      : null;
    if (resourcesBefore === null) {
      return {
        evaluatorName: 'vcResourceManagement',
        passed: true,
        explanation: 'Skipped — vcResources is not numeric in stateBefore',
      };
    }

    const bestTaxScore = getMapZoneIds(ctx.def).reduce((best, zoneId) =>
      Math.max(best, getTaxOpportunityScore(ctx.def, ctx.stateBefore, zoneId)), 0);
    const actionId = getMoveActionId(ctx.move);

    if (resourcesBefore <= 1 && bestTaxScore > 0) {
      const passed = actionId === 'tax';
      return {
        evaluatorName: 'vcResourceManagement',
        passed,
        explanation: passed
          ? `Passed — VC taxed while resource-starved (vcResources=${resourcesBefore}, bestTaxScore=${bestTaxScore})`
          : `Failed — VC ignored an available tax line while resource-starved (vcResources=${resourcesBefore}, bestTaxScore=${bestTaxScore}, actionId='${actionId}')`,
        score: bestTaxScore,
      };
    }

    if (actionId === 'tax' && resourcesBefore >= 10) {
      const targetedZones = inferTargetedZones(ctx, (zoneId) =>
        countVcGuerrillas(ctx.stateAfter, zoneId, 'active') > countVcGuerrillas(ctx.stateBefore, zoneId, 'active'));
      const targetedScore = targetedZones.reduce((best, zoneId) =>
        Math.max(best, getTaxOpportunityScore(ctx.def, ctx.stateBefore, zoneId)), 0);
      const passed = targetedScore >= 200;
      return {
        evaluatorName: 'vcResourceManagement',
        passed,
        explanation: passed
          ? `Passed — comfortable-resource tax still targeted a meaningfully valuable space (score=${targetedScore})`
          : `Failed — VC taxed a low-value space despite comfortable resources (vcResources=${resourcesBefore}, score=${targetedScore})`,
        score: targetedScore,
      };
    }

    return {
      evaluatorName: 'vcResourceManagement',
      passed: true,
      explanation: `Skipped — vcResources=${resourcesBefore} does not force a distinct VC-specific tax decision`,
    };
  },
});

export const vcSubvertTargeting = (): CompetenceEvaluator => ({
  name: 'vcSubvertTargeting',
  minBudget: 'background',
  evaluate: (ctx): CompetenceEvalResult => {
    if (getMoveActionId(ctx.move) !== 'subvert') {
      return {
        evaluatorName: 'vcSubvertTargeting',
        passed: true,
        explanation: 'Skipped — move is not subvert',
      };
    }

    const bestScore = getMapZoneIds(ctx.def).reduce((best, zoneId) =>
      Math.max(best, getSubvertOpportunityScore(ctx.stateBefore, zoneId)), 0);
    const targetedZones = inferTargetedZones(ctx, (zoneId) =>
      countArvnCubes(ctx.stateAfter, zoneId) < countArvnCubes(ctx.stateBefore, zoneId)
      || countVcGuerrillas(ctx.stateAfter, zoneId) > countVcGuerrillas(ctx.stateBefore, zoneId));
    if (targetedZones.length === 0) {
      return {
        evaluatorName: 'vcSubvertTargeting',
        passed: false,
        explanation: 'Failed — subvert move produced no identifiable target zone',
      };
    }

    const activatedVc = targetedZones.reduce((sum, zoneId) =>
      sum + Math.max(countVcGuerrillas(ctx.stateAfter, zoneId, 'active') - countVcGuerrillas(ctx.stateBefore, zoneId, 'active'), 0), 0);
    if (activatedVc > 0) {
      return {
        evaluatorName: 'vcSubvertTargeting',
        passed: false,
        explanation: `Failed — subvert activated ${activatedVc} VC guerrilla(s), which authored Subvert should not do`,
      };
    }

    const targetedScore = targetedZones.reduce((best, zoneId) =>
      Math.max(best, getSubvertOpportunityScore(ctx.stateBefore, zoneId)), 0);
    const arvnRemoved = targetedZones.reduce((sum, zoneId) =>
      sum + Math.max(countArvnCubes(ctx.stateBefore, zoneId) - countArvnCubes(ctx.stateAfter, zoneId), 0), 0);
    const passed = targetedScore >= bestScore && arvnRemoved > 0;
    return {
      evaluatorName: 'vcSubvertTargeting',
      passed,
      explanation: passed
        ? `Passed — subvert hit a top-value legal target (score=${targetedScore}, arvnRemoved=${arvnRemoved})`
        : `Failed — subvert targeted score=${targetedScore}, best available=${bestScore}, arvnRemoved=${arvnRemoved}`,
      score: targetedScore,
    };
  },
});

export const vcTaxEfficiency = (): CompetenceEvaluator => ({
  name: 'vcTaxEfficiency',
  minBudget: 'background',
  evaluate: (ctx): CompetenceEvalResult => {
    if (getMoveActionId(ctx.move) !== 'tax') {
      return {
        evaluatorName: 'vcTaxEfficiency',
        passed: true,
        explanation: 'Skipped — move is not tax',
      };
    }

    const bestScore = getMapZoneIds(ctx.def).reduce((best, zoneId) =>
      Math.max(best, getTaxOpportunityScore(ctx.def, ctx.stateBefore, zoneId)), 0);
    const targetedZones = inferTargetedZones(ctx, (zoneId) =>
      countVcGuerrillas(ctx.stateAfter, zoneId, 'active') > countVcGuerrillas(ctx.stateBefore, zoneId, 'active'));
    if (targetedZones.length === 0) {
      return {
        evaluatorName: 'vcTaxEfficiency',
        passed: false,
        explanation: 'Failed — tax move produced no identifiable target zone',
      };
    }

    const targetedScore = targetedZones.reduce((best, zoneId) =>
      Math.max(best, getTaxOpportunityScore(ctx.def, ctx.stateBefore, zoneId)), 0);
    const passed = targetedScore >= bestScore;
    return {
      evaluatorName: 'vcTaxEfficiency',
      passed,
      explanation: passed
        ? `Passed — tax included a top-value authored payoff target (score=${targetedScore})`
        : `Failed — tax targeted score=${targetedScore}, but a better tax line scored ${bestScore}`,
      score: targetedScore,
    };
  },
});

export const nvaAttackConditions = (): CompetenceEvaluator => ({
  name: 'nvaAttackConditions',
  minBudget: 'background',
  evaluate: (ctx): CompetenceEvalResult => {
    if (getMoveActionId(ctx.move) !== 'attack') {
      return {
        evaluatorName: 'nvaAttackConditions',
        passed: true,
        explanation: 'Skipped — move is not attack',
      };
    }

    const targetedZones = inferActionTargetedZones(ctx, 'attack', (zoneId) =>
      isSoloSeatControlled(ctx.stateAfter, zoneId, FITL_FACTION_CONFIG)
      !== isSoloSeatControlled(ctx.stateBefore, zoneId, FITL_FACTION_CONFIG)
      || countCoinBases(ctx.stateAfter, zoneId) < countCoinBases(ctx.stateBefore, zoneId)
      || countCoinPieces(ctx.stateBefore, zoneId) - countCoinPieces(ctx.stateAfter, zoneId) > 0);
    if (targetedZones.length === 0) {
      return {
        evaluatorName: 'nvaAttackConditions',
        passed: false,
        explanation: 'Failed — attack move produced no identifiable target space',
      };
    }

    const worthwhileZone = targetedZones.find((zoneId) => {
      const controlGain = isSoloSeatControlled(ctx.stateAfter, zoneId, FITL_FACTION_CONFIG)
        && !isSoloSeatControlled(ctx.stateBefore, zoneId, FITL_FACTION_CONFIG);
      const baseRemoval = countCoinBases(ctx.stateAfter, zoneId) < countCoinBases(ctx.stateBefore, zoneId);
      const enemyRemoval = countCoinPieces(ctx.stateBefore, zoneId) - countCoinPieces(ctx.stateAfter, zoneId);
      return controlGain || baseRemoval || enemyRemoval >= 4;
    });

    if (worthwhileZone !== undefined) {
      return {
        evaluatorName: 'nvaAttackConditions',
        passed: true,
        explanation: `Passed — attack produced a worthwhile outcome in '${worthwhileZone}'`,
      };
    }

    return {
      evaluatorName: 'nvaAttackConditions',
      passed: false,
      explanation: `Failed — attack in [${targetedZones.join(', ')}] gained no control, removed no enemy base, and removed fewer than 4 enemy pieces`,
    };
  },
});

export const nvaMarchSouthward = (): CompetenceEvaluator => ({
  name: 'nvaMarchSouthward',
  minBudget: 'background',
  evaluate: (ctx): CompetenceEvalResult => {
    if (getMoveActionId(ctx.move) !== 'march') {
      return {
        evaluatorName: 'nvaMarchSouthward',
        passed: true,
        explanation: 'Skipped — move is not march',
      };
    }

    const scoreBefore = getNvaSouthwardScore(ctx.def, ctx.stateBefore);
    const scoreAfter = getNvaSouthwardScore(ctx.def, ctx.stateAfter);
    const passed = scoreAfter >= scoreBefore;
    return {
      evaluatorName: 'nvaMarchSouthward',
      passed,
      score: scoreAfter - scoreBefore,
      explanation: passed
        ? `Passed — NVA troop proximity to populated South Vietnam improved or held (${scoreBefore} -> ${scoreAfter})`
        : `Failed — NVA troop proximity to populated South Vietnam regressed (${scoreBefore} -> ${scoreAfter})`,
    };
  },
});

export const nvaRallyTrailImprove = (): CompetenceEvaluator => ({
  name: 'nvaRallyTrailImprove',
  minBudget: 'background',
  evaluate: (ctx): CompetenceEvalResult => {
    if (getMoveActionId(ctx.move) !== 'rally') {
      return {
        evaluatorName: 'nvaRallyTrailImprove',
        passed: true,
        explanation: 'Skipped — move is not rally',
      };
    }

    const trailBefore = ctx.stateBefore.globalVars.trail;
    const trailAfter = ctx.stateAfter.globalVars.trail;
    const resourcesBefore = ctx.stateBefore.globalVars.nvaResources;
    if (typeof trailBefore !== 'number' || typeof trailAfter !== 'number' || typeof resourcesBefore !== 'number') {
      return {
        evaluatorName: 'nvaRallyTrailImprove',
        passed: true,
        explanation: 'Skipped — trail or nvaResources was not numeric',
      };
    }

    const mcNamaraLineActive = ctx.stateBefore.globalVars[MCNAMARA_LINE_VAR] === true;
    const availableTroops = countFactionTokens(ctx.stateBefore, 'available-NVA:none', 'NVA', 'troops');
    const strategicallyWarranted = trailBefore < 3 || availableTroops > 20;
    const legallyAvailable = trailBefore < 4 && resourcesBefore >= 2 && !mcNamaraLineActive;
    if (!strategicallyWarranted) {
      return {
        evaluatorName: 'nvaRallyTrailImprove',
        passed: true,
        explanation: `Skipped — trail=${trailBefore} and available NVA troops=${availableTroops} do not force trail improvement`,
      };
    }
    if (!legallyAvailable) {
      return {
        evaluatorName: 'nvaRallyTrailImprove',
        passed: true,
        explanation: `Skipped — trail improvement was not legal (trail=${trailBefore}, nvaResources=${resourcesBefore}, ${MCNAMARA_LINE_VAR}=${mcNamaraLineActive})`,
      };
    }

    const passed = trailAfter > trailBefore;
    return {
      evaluatorName: 'nvaRallyTrailImprove',
      passed,
      score: trailAfter - trailBefore,
      explanation: passed
        ? `Passed — rally improved trail (${trailBefore} -> ${trailAfter}) when strategic conditions were met`
        : `Failed — rally skipped trail improvement despite trail=${trailBefore}, nvaResources=${resourcesBefore}, available NVA troops=${availableTroops}`,
    };
  },
});

export const nvaControlGrowth = (): CompetenceEvaluator => ({
  name: 'nvaControlGrowth',
  minBudget: 'background',
  evaluate: (ctx): CompetenceEvalResult => {
    const before = computeNvaVictory(ctx.def, ctx.stateBefore);
    const after = computeNvaVictory(ctx.def, ctx.stateAfter);
    const score = after - before;
    const passed = score >= 0;
    return {
      evaluatorName: 'nvaControlGrowth',
      passed,
      score,
      explanation: passed
        ? `Passed — NVA victory marker improved or held (${before} -> ${after})`
        : `Failed — NVA victory marker regressed (${before} -> ${after})`,
    };
  },
});

export const nvaInfiltrateValue = (): CompetenceEvaluator => ({
  name: 'nvaInfiltrateValue',
  minBudget: 'background',
  evaluate: (ctx): CompetenceEvalResult => {
    if (!moveIncludesAction(ctx.move, 'infiltrate')) {
      return {
        evaluatorName: 'nvaInfiltrateValue',
        passed: true,
        explanation: 'Skipped — move does not include infiltrate',
      };
    }

    const targetedZones = inferActionTargetedZones(ctx, 'infiltrate', (zoneId) =>
      countFactionTokens(ctx.stateAfter, zoneId, 'NVA', 'base') > countFactionTokens(ctx.stateBefore, zoneId, 'NVA', 'base')
      || countFactionTokens(ctx.stateAfter, zoneId, 'NVA', 'troops') > countFactionTokens(ctx.stateBefore, zoneId, 'NVA', 'troops'));
    if (targetedZones.length === 0) {
      return {
        evaluatorName: 'nvaInfiltrateValue',
        passed: false,
        explanation: 'Failed — infiltrate move produced no identifiable target space',
      };
    }

    const baseGain = targetedZones.reduce((sum, zoneId) =>
      sum
      + Math.max(
        countFactionTokens(ctx.stateAfter, zoneId, 'NVA', 'base')
          - countFactionTokens(ctx.stateBefore, zoneId, 'NVA', 'base'),
        0,
      ), 0);
    const troopGain = targetedZones.reduce((sum, zoneId) =>
      sum
      + Math.max(
        countFactionTokens(ctx.stateAfter, zoneId, 'NVA', 'troops')
          - countFactionTokens(ctx.stateBefore, zoneId, 'NVA', 'troops'),
        0,
      ), 0);
    const passed = baseGain > 0 || troopGain >= 4;
    return {
      evaluatorName: 'nvaInfiltrateValue',
      passed,
      score: Math.max(baseGain, troopGain),
      explanation: passed
        ? `Passed — infiltrate produced meaningful value (baseGain=${baseGain}, troopGain=${troopGain})`
        : `Failed — infiltrate was strategically trivial (baseGain=${baseGain}, troopGain=${troopGain})`,
    };
  },
});

export const nvaBombardUsage = (): CompetenceEvaluator => ({
  name: 'nvaBombardUsage',
  minBudget: 'background',
  evaluate: (ctx): CompetenceEvalResult => {
    const bombardChosen = moveIncludesAction(ctx.move, 'bombard');
    const opportunityExists = hasBombardOpportunity(ctx.def, ctx.stateBefore);
    if (!opportunityExists) {
      return {
        evaluatorName: 'nvaBombardUsage',
        passed: true,
        explanation: 'Skipped — no authored Bombard opportunity existed',
      };
    }

    return {
      evaluatorName: 'nvaBombardUsage',
      passed: bombardChosen,
      explanation: bombardChosen
        ? 'Passed — move included Bombard when an authored Bombard opportunity existed'
        : 'Failed — move omitted Bombard despite an authored Bombard opportunity',
    };
  },
});

export const usSweepActivation = (): CompetenceEvaluator => ({
  name: 'usSweepActivation',
  minBudget: 'background',
  evaluate: (ctx): CompetenceEvalResult => {
    if (getMoveActionId(ctx.move) !== 'sweep') {
      return {
        evaluatorName: 'usSweepActivation',
        passed: true,
        explanation: 'Skipped — move is not sweep',
      };
    }

    const targetedZones = inferActionTargetedZones(ctx, 'sweep', (zoneId) =>
      countInsurgentGuerrillas(ctx.stateBefore, zoneId, 'underground')
        > countInsurgentGuerrillas(ctx.stateAfter, zoneId, 'underground')
      || countInsurgentGuerrillas(ctx.stateAfter, zoneId, 'active')
        > countInsurgentGuerrillas(ctx.stateBefore, zoneId, 'active'));
    if (targetedZones.length === 0) {
      return {
        evaluatorName: 'usSweepActivation',
        passed: false,
        explanation: 'Failed — sweep move produced no identifiable target space',
      };
    }

    const activatedZone = targetedZones.find((zoneId) =>
      countInsurgentGuerrillas(ctx.stateBefore, zoneId, 'underground')
        > countInsurgentGuerrillas(ctx.stateAfter, zoneId, 'underground')
      && countInsurgentGuerrillas(ctx.stateAfter, zoneId, 'active')
        > countInsurgentGuerrillas(ctx.stateBefore, zoneId, 'active'));
    const passed = activatedZone !== undefined;
    return {
      evaluatorName: 'usSweepActivation',
      passed,
      explanation: passed
        ? `Passed — sweep activated underground insurgents in '${activatedZone}'`
        : `Failed — sweep in [${targetedZones.join(', ')}] activated no underground insurgents`,
    };
  },
});

export const usAssaultRemoval = (): CompetenceEvaluator => ({
  name: 'usAssaultRemoval',
  minBudget: 'background',
  evaluate: (ctx): CompetenceEvalResult => {
    if (getMoveActionId(ctx.move) !== 'assault') {
      return {
        evaluatorName: 'usAssaultRemoval',
        passed: true,
        explanation: 'Skipped — move is not assault',
      };
    }

    const targetedZones = inferActionTargetedZones(ctx, 'assault', (zoneId) =>
      isSoloSeatControlled(ctx.stateAfter, zoneId, FITL_FACTION_CONFIG)
        !== isSoloSeatControlled(ctx.stateBefore, zoneId, FITL_FACTION_CONFIG)
      || countInsurgentBases(ctx.stateAfter, zoneId) < countInsurgentBases(ctx.stateBefore, zoneId)
      || countTunneledInsurgentBases(ctx.stateAfter, zoneId) < countTunneledInsurgentBases(ctx.stateBefore, zoneId)
      || countInsurgentPieces(ctx.stateAfter, zoneId) < countInsurgentPieces(ctx.stateBefore, zoneId));
    if (targetedZones.length === 0) {
      return {
        evaluatorName: 'usAssaultRemoval',
        passed: false,
        explanation: 'Failed — assault move produced no identifiable target space',
      };
    }

    const worthwhileZone = targetedZones.find((zoneId) => {
      const removedNvaControl = isSoloSeatControlled(ctx.stateBefore, zoneId, FITL_FACTION_CONFIG)
        && !isSoloSeatControlled(ctx.stateAfter, zoneId, FITL_FACTION_CONFIG);
      const baseRemoval = countInsurgentBases(ctx.stateAfter, zoneId) < countInsurgentBases(ctx.stateBefore, zoneId);
      const tunnelExposure = countTunneledInsurgentBases(ctx.stateAfter, zoneId)
        < countTunneledInsurgentBases(ctx.stateBefore, zoneId);
      const enemyRemoval = countInsurgentPieces(ctx.stateBefore, zoneId) - countInsurgentPieces(ctx.stateAfter, zoneId);
      return removedNvaControl || baseRemoval || tunnelExposure || enemyRemoval >= 6;
    });

    return {
      evaluatorName: 'usAssaultRemoval',
      passed: worthwhileZone !== undefined,
      explanation: worthwhileZone !== undefined
        ? `Passed — assault produced a worthwhile outcome in '${worthwhileZone}'`
        : `Failed — assault in [${targetedZones.join(', ')}] removed no NVA control, enemy base/tunnel, or 6+ enemy pieces`,
    };
  },
});

export const usSupportGrowth = (): CompetenceEvaluator => ({
  name: 'usSupportGrowth',
  minBudget: 'background',
  evaluate: (ctx): CompetenceEvalResult => {
    const before = computeUsVictory(ctx.def, ctx.stateBefore);
    const after = computeUsVictory(ctx.def, ctx.stateAfter);
    const score = after - before;
    const passed = score >= 0;
    return {
      evaluatorName: 'usSupportGrowth',
      passed,
      score,
      explanation: passed
        ? `Passed — US victory marker improved or held (${before} -> ${after})`
        : `Failed — US victory marker regressed (${before} -> ${after})`,
    };
  },
});

export const usTrailDegradation = (): CompetenceEvaluator => ({
  name: 'usTrailDegradation',
  minBudget: 'background',
  evaluate: (ctx): CompetenceEvalResult => {
    const airStrikeMove = getActionMove(ctx.move, 'airStrike');
    if (airStrikeMove === null) {
      return {
        evaluatorName: 'usTrailDegradation',
        passed: true,
        explanation: 'Skipped — move does not include airStrike',
      };
    }

    const trailBefore = ctx.stateBefore.globalVars.trail;
    const airStrikeWindowMode = ctx.stateBefore.globalVars.fitl_airStrikeWindowMode;
    const oriskanyActive = ctx.stateBefore.globalVars.mom_oriskany === true;
    const wildWeaselsActive = ctx.stateBefore.globalVars.mom_wildWeasels === true;
    if (typeof trailBefore !== 'number' || typeof airStrikeWindowMode !== 'number') {
      return {
        evaluatorName: 'usTrailDegradation',
        passed: true,
        explanation: 'Skipped — trail or fitl_airStrikeWindowMode was not numeric',
      };
    }

    if (trailBefore < 3) {
      return {
        evaluatorName: 'usTrailDegradation',
        passed: true,
        explanation: `Skipped — trail=${trailBefore} is below the high-trail threshold`,
      };
    }

    const targetedSpaceCount = getAirStrikeTargetSpaces(ctx.move).length;
    const degradeLegal = trailBefore > 0
      && airStrikeWindowMode === 0
      && !oriskanyActive
      && (!wildWeaselsActive || targetedSpaceCount === 0);
    if (!degradeLegal) {
      return {
        evaluatorName: 'usTrailDegradation',
        passed: true,
        explanation: `Skipped — trail degradation was not legal (trail=${trailBefore}, fitl_airStrikeWindowMode=${airStrikeWindowMode}, mom_oriskany=${oriskanyActive}, mom_wildWeasels=${wildWeaselsActive}, targetedSpaces=${targetedSpaceCount})`,
      };
    }

    const passed = getMoveParamString(airStrikeMove, '$degradeTrail') === 'yes';
    return {
      evaluatorName: 'usTrailDegradation',
      passed,
      explanation: passed
        ? `Passed — airStrike included trail degradation at trail=${trailBefore}`
        : `Failed — airStrike omitted trail degradation at trail=${trailBefore} when degradation was legal`,
    };
  },
});

export const usPacification = (): CompetenceEvaluator => ({
  name: 'usPacification',
  minBudget: 'background',
  evaluate: (ctx): CompetenceEvalResult => {
    if (getMoveActionId(ctx.move) !== 'coupPacifyUS') {
      return {
        evaluatorName: 'usPacification',
        passed: true,
        explanation: 'Skipped — move is not coupPacifyUS',
      };
    }

    const targetSpace = getMoveParamString(ctx.move, 'targetSpace');
    const action = getMoveParamString(ctx.move, 'action');
    if (targetSpace === null || action === null) {
      return {
        evaluatorName: 'usPacification',
        passed: false,
        explanation: 'Failed — coupPacifyUS move was missing targetSpace or action',
      };
    }

    const candidateScores = getMapZoneIds(ctx.def)
      .map((zoneId) => ({ zoneId, score: getUsPacificationOpportunityScore(ctx.def, ctx.stateBefore, zoneId) }))
      .filter((entry) => entry.score > 0);
    if (candidateScores.length === 0) {
      return {
        evaluatorName: 'usPacification',
        passed: true,
        explanation: 'Skipped — no meaningful US pacification opportunities were present',
      };
    }

    const bestScore = candidateScores.reduce((best, entry) => Math.max(best, entry.score), 0);
    const targetedScore = getUsPacificationOpportunityScore(ctx.def, ctx.stateBefore, targetSpace);

    if (action === 'removeTerror') {
      const supportsLaterShift = getTerrorCount(ctx.stateBefore, targetSpace) > 0
        && getSupportShiftHeadroom(ctx.stateBefore, targetSpace) > 0;
      return {
        evaluatorName: 'usPacification',
        passed: supportsLaterShift && targetedScore >= bestScore,
        explanation: supportsLaterShift && targetedScore >= bestScore
          ? `Passed — coupPacifyUS removed terror in a top-value future-shift space '${targetSpace}'`
          : `Failed — coupPacifyUS removed terror in '${targetSpace}' without supporting the strongest available shift line`,
        score: targetedScore,
      };
    }

    const passed = action === 'shiftSupport' && targetedScore >= bestScore;
    return {
      evaluatorName: 'usPacification',
      passed,
      explanation: passed
        ? `Passed — coupPacifyUS shifted support in a top-value space '${targetSpace}'`
        : `Failed — coupPacifyUS targeted score=${targetedScore} in '${targetSpace}', but a better pacification line scored ${bestScore}`,
      score: targetedScore,
    };
  },
});

export const usForcePreservation = (): CompetenceEvaluator => ({
  name: 'usForcePreservation',
  minBudget: 'background',
  evaluate: (ctx): CompetenceEvalResult => {
    if (!isPaidActionClass(ctx.move) && ctx.move.actionClass !== 'specialActivity') {
      return {
        evaluatorName: 'usForcePreservation',
        passed: true,
        explanation: `Skipped — move actionClass '${String(ctx.move.actionClass ?? 'none')}' is outside voluntary-operation scope`,
      };
    }

    const casualtiesDelta = countUsPieces(ctx.stateAfter, 'casualties-US:none') - countUsPieces(ctx.stateBefore, 'casualties-US:none');
    const availableDelta = countUsPieces(ctx.stateAfter, 'available-US:none') - countUsPieces(ctx.stateBefore, 'available-US:none');
    const losses = Math.max(casualtiesDelta, 0) + Math.max(availableDelta, 0);
    const passed = losses <= 2;
    return {
      evaluatorName: 'usForcePreservation',
      passed,
      score: -losses,
      explanation: passed
        ? `Passed — voluntary move kept US losses within limit (losses=${losses})`
        : `Failed — voluntary move lost too many US pieces (losses=${losses})`,
    };
  },
});

export const arvnTrainCubes = (): CompetenceEvaluator => ({
  name: 'arvnTrainCubes',
  minBudget: 'background',
  evaluate: (ctx): CompetenceEvalResult => {
    if (getMoveActionId(ctx.move) !== 'train') {
      return {
        evaluatorName: 'arvnTrainCubes',
        passed: true,
        explanation: 'Skipped — move is not train',
      };
    }

    const candidateScores = getMapZoneIds(ctx.def)
      .map((zoneId) => ({
        zoneId,
        score: getArvnTrainOpportunityScore(ctx.def, ctx.stateBefore, zoneId),
      }))
      .filter((entry) => entry.score > 0);
    if (candidateScores.length === 0) {
      return {
        evaluatorName: 'arvnTrainCubes',
        passed: true,
        explanation: 'Skipped — no meaningful ARVN training priorities were present',
      };
    }

    const improvedZones = getMapZoneIds(ctx.def)
      .map((zoneId) => ({
        zoneId,
        score: getArvnTrainOpportunityScore(ctx.def, ctx.stateBefore, zoneId),
        improvement: getArvnTrainImprovement(ctx.stateBefore, ctx.stateAfter, zoneId),
      }))
      .filter((entry) => entry.improvement > 0);
    if (improvedZones.length === 0) {
      return {
        evaluatorName: 'arvnTrainCubes',
        passed: false,
        explanation: 'Failed — train produced no identifiable ARVN piece growth',
        score: 0,
      };
    }

    const bestCandidate = candidateScores.reduce((best, candidate) =>
      candidate.score > best.score ? candidate : best);
    const bestImproved = improvedZones.reduce((best, candidate) =>
      candidate.score > best.score ? candidate : best);
    const passed = bestImproved.score >= bestCandidate.score;

    return {
      evaluatorName: 'arvnTrainCubes',
      passed,
      score: bestImproved.improvement,
      explanation: passed
        ? `Passed — train improved top-priority ARVN space '${bestImproved.zoneId}'`
        : `Failed — train improved '${bestImproved.zoneId}' (score=${bestImproved.score}) while '${bestCandidate.zoneId}' scored ${bestCandidate.score}`,
    };
  },
});

export const arvnGovern = (): CompetenceEvaluator => ({
  name: 'arvnGovern',
  minBudget: 'background',
  evaluate: (ctx): CompetenceEvalResult => {
    const governMove = getActionMove(ctx.move, 'govern');
    if (governMove === null) {
      return {
        evaluatorName: 'arvnGovern',
        passed: true,
        explanation: 'Skipped — move does not include govern',
      };
    }

    const aidBefore = getNumericGlobalVar(ctx.stateBefore, 'aid');
    const aidAfter = getNumericGlobalVar(ctx.stateAfter, 'aid');
    const patronageBefore = getNumericGlobalVar(ctx.stateBefore, 'patronage');
    const patronageAfter = getNumericGlobalVar(ctx.stateAfter, 'patronage');
    if (aidBefore === null || aidAfter === null || patronageBefore === null || patronageAfter === null) {
      return {
        evaluatorName: 'arvnGovern',
        passed: true,
        explanation: 'Skipped — aid or patronage was not numeric',
      };
    }

    const aidDelta = aidAfter - aidBefore;
    const patronageDelta = patronageAfter - patronageBefore;
    const passed = aidDelta > 0 || patronageDelta > 0;
    return {
      evaluatorName: 'arvnGovern',
      passed,
      score: aidDelta + patronageDelta,
      explanation: passed
        ? `Passed — govern produced strategic payoff (aidDelta=${aidDelta}, patronageDelta=${patronageDelta})`
        : `Failed — govern produced no aid or patronage gain (aidDelta=${aidDelta}, patronageDelta=${patronageDelta})`,
    };
  },
});

export const arvnControlMaintain = (): CompetenceEvaluator => ({
  name: 'arvnControlMaintain',
  minBudget: 'background',
  evaluate: (ctx): CompetenceEvalResult => {
    const before = computeArvnVictory(ctx.def, ctx.stateBefore);
    const after = computeArvnVictory(ctx.def, ctx.stateAfter);
    const score = after - before;
    const passed = score >= 0;
    return {
      evaluatorName: 'arvnControlMaintain',
      passed,
      score,
      explanation: passed
        ? `Passed — ARVN victory marker improved or held (${before} -> ${after})`
        : `Failed — ARVN victory marker regressed (${before} -> ${after})`,
    };
  },
});

export const arvnSweepRaid = (): CompetenceEvaluator => ({
  name: 'arvnSweepRaid',
  minBudget: 'background',
  evaluate: (ctx): CompetenceEvalResult => {
    const actionId = getMoveActionId(ctx.move);
    if (actionId !== 'sweep' && actionId !== 'raid' && !moveIncludesAction(ctx.move, 'raid')) {
      return {
        evaluatorName: 'arvnSweepRaid',
        passed: true,
        explanation: 'Skipped — move is not ARVN sweep/raid pressure',
      };
    }

    const sweepTargets = inferActionTargetedZones(ctx, 'sweep', (zoneId) =>
      countInsurgentGuerrillas(ctx.stateAfter, zoneId) < countInsurgentGuerrillas(ctx.stateBefore, zoneId));
    const raidTargets = inferActionTargetedZones(ctx, 'raid', (zoneId) =>
      countInsurgentGuerrillas(ctx.stateAfter, zoneId) < countInsurgentGuerrillas(ctx.stateBefore, zoneId));
    const targetedZones = [...new Set([...sweepTargets, ...raidTargets])];
    const guerrillaRemoval = targetedZones.reduce((sum, zoneId) =>
      sum + Math.max(countInsurgentGuerrillas(ctx.stateBefore, zoneId) - countInsurgentGuerrillas(ctx.stateAfter, zoneId), 0), 0);

    const resourcesBefore = getNumericGlobalVar(ctx.stateBefore, 'arvnResources');
    const resourcesAfter = getNumericGlobalVar(ctx.stateAfter, 'arvnResources');
    const resourceDelta = resourcesBefore === null || resourcesAfter === null ? 0 : resourcesAfter - resourcesBefore;
    const passed = guerrillaRemoval > 0 || resourceDelta > 0;

    return {
      evaluatorName: 'arvnSweepRaid',
      passed,
      score: guerrillaRemoval + resourceDelta,
      explanation: passed
        ? `Passed — ARVN pressure produced payoff (guerrillaRemoval=${guerrillaRemoval}, resourceDelta=${resourceDelta})`
        : `Failed — ARVN sweep/raid line produced no guerrilla removal or resource gain`,
    };
  },
});

export const arvnLocControl = (): CompetenceEvaluator => ({
  name: 'arvnLocControl',
  minBudget: 'background',
  evaluate: (ctx): CompetenceEvalResult => {
    const sabotagedLocs = getMapZoneIds(ctx.def).filter((zoneId) =>
      isLocZone(ctx.def, zoneId) && hasSabotageMarker(ctx.stateBefore, zoneId));
    if (sabotagedLocs.length === 0) {
      return {
        evaluatorName: 'arvnLocControl',
        passed: true,
        explanation: 'Skipped — no sabotaged LoCs were present',
      };
    }

    const arvnResources = getNumericGlobalVar(ctx.stateBefore, 'arvnResources');
    if (arvnResources === null || arvnResources < 3) {
      return {
        evaluatorName: 'arvnLocControl',
        passed: true,
        explanation: `Skipped — ARVN resources below patrol threshold (${arvnResources ?? 'n/a'})`,
      };
    }

    if (getMoveActionId(ctx.move) !== 'patrol') {
      return {
        evaluatorName: 'arvnLocControl',
        passed: false,
        explanation: `Failed — sabotaged LoCs [${sabotagedLocs.join(', ')}] were present, but move actionId was '${getMoveActionId(ctx.move)}' instead of patrol`,
      };
    }

    const targetedLocs = getMoveParamStringArray(ctx.move, '$targetLoCs');
    const targetedSabotaged = targetedLocs.filter((zoneId) => sabotagedLocs.includes(zoneId));
    const passed = targetedSabotaged.length > 0;
    return {
      evaluatorName: 'arvnLocControl',
      passed,
      score: targetedSabotaged.length,
      explanation: passed
        ? `Passed — patrol targeted sabotaged LoC(s) [${targetedSabotaged.join(', ')}]`
        : `Failed — patrol ignored sabotaged LoCs [${sabotagedLocs.join(', ')}]`,
    };
  },
});

export const arvnAidPreservation = (): CompetenceEvaluator => ({
  name: 'arvnAidPreservation',
  minBudget: 'background',
  evaluate: (ctx): CompetenceEvalResult => {
    if (getActionMove(ctx.move, 'govern') === null) {
      return {
        evaluatorName: 'arvnAidPreservation',
        passed: true,
        explanation: 'Skipped — move does not include govern',
      };
    }

    const aidAfter = getNumericGlobalVar(ctx.stateAfter, 'aid');
    const totalEconAfter = getNumericGlobalVar(ctx.stateAfter, 'totalEcon');
    if (aidAfter === null || totalEconAfter === null) {
      return {
        evaluatorName: 'arvnAidPreservation',
        passed: true,
        explanation: 'Skipped — aid or totalEcon was not numeric',
      };
    }

    const passed = aidAfter >= totalEconAfter;
    return {
      evaluatorName: 'arvnAidPreservation',
      passed,
      score: aidAfter - totalEconAfter,
      explanation: passed
        ? `Passed — govern preserved Aid above Total Econ (aid=${aidAfter}, totalEcon=${totalEconAfter})`
        : `Failed — govern left Aid below Total Econ (aid=${aidAfter}, totalEcon=${totalEconAfter})`,
    };
  },
});
