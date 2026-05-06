import type { PlayerId } from '../kernel/branded.js';
import type {
  AgentParameterValue,
  AgentPolicyCatalog,
  ChoicePendingRequest,
  GameDef,
  GameState,
  MoveParamValue,
  TrustedExecutableMove,
} from '../kernel/types.js';
import type { GameDefRuntime } from '../kernel/gamedef-runtime.js';
import { PolicyEvaluationContext } from './policy-evaluation-core.js';

const EMPTY_TRUSTED_MOVE_INDEX: ReadonlyMap<string, TrustedExecutableMove> = new Map();

export interface CompletionScoreContribution {
  readonly termId: string;
  readonly contribution: number;
}

export interface CompletionOptionScore {
  readonly score: number;
  readonly scoreContributions: readonly CompletionScoreContribution[];
}

export function scoreCompletionOption(
  state: GameState,
  def: GameDef,
  catalog: AgentPolicyCatalog,
  playerId: PlayerId,
  seatId: string,
  parameterValues: Readonly<Record<string, AgentParameterValue>>,
  request: ChoicePendingRequest,
  optionValue: MoveParamValue,
  considerationIds: readonly string[],
  runtime?: GameDefRuntime,
): number {
  return scoreCompletionOptionWithContributions(
    state,
    def,
    catalog,
    playerId,
    seatId,
    parameterValues,
    request,
    optionValue,
    considerationIds,
    runtime,
  ).score;
}

export function scoreCompletionOptionWithContributions(
  state: GameState,
  def: GameDef,
  catalog: AgentPolicyCatalog,
  playerId: PlayerId,
  seatId: string,
  parameterValues: Readonly<Record<string, AgentParameterValue>>,
  request: ChoicePendingRequest,
  optionValue: MoveParamValue,
  considerationIds: readonly string[],
  runtime?: GameDefRuntime,
): CompletionOptionScore {
  if (considerationIds.length === 0) {
    return { score: 0, scoreContributions: [] };
  }
  const considerations = catalog.compiled.considerations;
  const scoreContributions: CompletionScoreContribution[] = [];

  const evaluation = new PolicyEvaluationContext({
    def,
    state,
    playerId,
    seatId,
    catalog,
    parameterValues,
    trustedMoveIndex: EMPTY_TRUSTED_MOVE_INDEX,
    completion: {
      request,
      optionValue,
    },
    ...(runtime === undefined ? {} : { runtime }),
  }, []);

  try {
    const score = considerationIds.reduce(
      (total, considerationId) => (
        total + evaluation.evaluateConsideration(
          considerations,
          considerationId,
          undefined,
          (contribution) => {
            scoreContributions.push({ termId: considerationId, contribution });
          },
        )
      ),
      0,
    );
    return { score, scoreContributions };
  } finally {
    evaluation.dispose();
  }
}
