import type { MctsBudgetProfile } from '../../../src/agents/index.js';
import type { GameState, PlayerId, ValidatedGameDef } from '../../../src/kernel/index.js';

import type { CompetenceEvaluator } from './fitl-competence-evaluators.js';

export interface CompetenceScenario {
  readonly id: string;
  readonly label: string;
  readonly turnIndex: number;
  readonly moveIndex: number;
  readonly playerId: PlayerId;
  readonly budgets: readonly MctsBudgetProfile[];
  readonly evaluators: readonly CompetenceEvaluator[];
  readonly engineeredState?: (def: ValidatedGameDef, baseState: GameState) => GameState;
}
