import type { MctsBudgetProfile, MctsSearchDiagnostics } from '../../../src/agents/index.js';
import {
  isSoloSeatControlled,
  type GameDef,
  type GameState,
  type Move,
  type PlayerId,
  type ValidatedGameDef,
} from '../../../src/kernel/index.js';
import { computeNvaVictory, computeVcVictory, FITL_FACTION_CONFIG } from './fitl-mcts-test-helpers.js';

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
const SOUTH_VIETNAM = 'southVietnam';
const NORTH_VIETNAM = 'northVietnam';
const MCNAMARA_LINE_VAR = 'mom_mcnamaraLine';

const getMoveActionId = (move: Move): string => String(move.actionId);
const getCompoundSpecialActionId = (move: Move): string | null =>
  move.compound === undefined ? null : String(move.compound.specialActivity.actionId);
const moveIncludesAction = (move: Move, actionId: string): boolean =>
  getMoveActionId(move) === actionId || getCompoundSpecialActionId(move) === actionId;

const getMoveTargetSpaces = (move: Move): readonly string[] => {
  const targetSpaces = (move.params as Record<string, unknown>).$targetSpaces;
  if (!Array.isArray(targetSpaces)) {
    return [];
  }
  return targetSpaces.filter((value): value is string => typeof value === 'string');
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

const countFactionTokens = (
  state: GameState,
  zoneId: string,
  faction: string,
  type?: string,
): number => countTokens(state, zoneId, (token) =>
  token.props.faction === faction
  && (type === undefined || token.type === type));

const countFactionSetTokens = (
  state: GameState,
  zoneId: string,
  factions: ReadonlySet<string>,
  type?: string,
): number => countTokens(state, zoneId, (token) =>
  factions.has(String(token.props.faction))
  && (type === undefined || token.type === type));

const countVcGuerrillas = (
  state: GameState,
  zoneId: string,
  activity?: 'active' | 'underground',
): number => countTokens(state, zoneId, (token) =>
  token.props.faction === 'VC'
  && token.type === 'guerrilla'
  && (activity === undefined || token.props.activity === activity));

const countVcBases = (state: GameState, zoneId: string): number =>
  countTokens(state, zoneId, (token) => token.props.faction === 'VC' && token.type === 'base');

const countAllBases = (state: GameState, zoneId: string): number =>
  countTokens(state, zoneId, (token) => token.type === 'base');

const countArvnCubes = (state: GameState, zoneId: string): number =>
  countTokens(state, zoneId, (token) =>
    token.props.faction === 'ARVN'
    && (token.type === 'troops' || token.type === 'police'));

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
