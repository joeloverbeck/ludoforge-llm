import type { MctsBudgetProfile, MctsSearchDiagnostics } from '../../../src/agents/index.js';
import type { GameState, Move, PlayerId, ValidatedGameDef } from '../../../src/kernel/index.js';

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
