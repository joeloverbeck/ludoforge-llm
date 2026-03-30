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

export function scoreCompletionOption(
  state: GameState,
  def: GameDef,
  catalog: AgentPolicyCatalog,
  playerId: PlayerId,
  seatId: string,
  parameterValues: Readonly<Record<string, AgentParameterValue>>,
  request: ChoicePendingRequest,
  optionValue: MoveParamValue,
  scoreTermIds: readonly string[],
  runtime?: GameDefRuntime,
): number {
  if (scoreTermIds.length === 0) {
    return 0;
  }

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

  return scoreTermIds.reduce(
    (total, scoreTermId) => total + evaluation.evaluateScoreTerm(catalog.library.completionScoreTerms, scoreTermId, undefined),
    0,
  );
}
