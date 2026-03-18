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
