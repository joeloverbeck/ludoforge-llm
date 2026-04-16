import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../src/agents/policy-agent.js';
import { selectUniqueChoiceOptionValuesByLegalityPrecedence } from '../../src/kernel/choice-option-policy.js';
import { isEffectRuntimeReason } from '../../src/kernel/effect-error.js';
import { completeMoveDecisionSequence } from '../../src/kernel/move-decision-completion.js';
import {
  assertValidatedGameDef,
  createGameDefRuntime,
  EFFECT_RUNTIME_REASONS,
  type ChoicePendingRequest,
  type GameState,
  type Move,
  type MoveParamValue,
} from '../../src/kernel/index.js';
import { runGame } from '../../src/sim/simulator.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

type HistoricalOutcome =
  | 'completed'
  | 'stochasticUnresolved'
  | 'illegal'
  | 'CHOICE_RUNTIME_VALIDATION_FAILED'
  | 'exceeded';

interface CapturedSeed1000Witness {
  readonly state: GameState;
  readonly stateHash: bigint;
  readonly move: Move;
  readonly legalMoveCount: number;
  readonly movesBeforeFailure: number;
}

class CapturingPolicyAgent {
  readonly inner: PolicyAgent;
  captured: CapturedSeed1000Witness | undefined;
  private moveCount = 0;

  constructor(profileId: string) {
    this.inner = new PolicyAgent({ profileId, traceLevel: 'summary' });
  }

  chooseMove(input: Parameters<PolicyAgent['chooseMove']>[0]): ReturnType<PolicyAgent['chooseMove']> {
    this.moveCount += 1;
    try {
      return this.inner.chooseMove(input);
    } catch (error) {
      const isHistoricalFailure = error instanceof Error && error.message.includes('could not derive a playable move');
      if (isHistoricalFailure && input.playerId === 2 && this.captured === undefined) {
        const firstMove = input.legalMoves[0]?.move;
        if (firstMove === undefined) {
          throw new Error('expected at least one legal move at the historical witness');
        }
        this.captured = {
          state: input.state,
          stateHash: input.state.stateHash,
          move: firstMove,
          legalMoveCount: input.legalMoves.length,
          movesBeforeFailure: this.moveCount,
        };
      }
      throw error;
    }
  }
}

const branchChoices = (request: ChoicePendingRequest): readonly MoveParamValue[] => {
  const options = selectUniqueChoiceOptionValuesByLegalityPrecedence(request);
  if (request.type === 'chooseN') {
    if (options.length === 0 && (request.min ?? 0) === 0) {
      return [[] as MoveParamValue];
    }
    return options.map((option) => [option] as MoveParamValue);
  }
  return options;
};

const classifyPathOutcome = (
  def: ReturnType<typeof assertValidatedGameDef>,
  state: Parameters<typeof completeMoveDecisionSequence>[1],
  move: Move,
  guidedSelections: readonly MoveParamValue[],
  runtime: ReturnType<typeof createGameDefRuntime>,
): readonly HistoricalOutcome[] => {
  const queue = [...guidedSelections];
  try {
    const result = completeMoveDecisionSequence(def, state, move, {
      choose: () => queue.shift(),
      chooseStochastic: () => undefined,
    }, runtime);

    if (result.complete) {
      return ['completed'];
    }
    if (result.stochasticDecision !== undefined) {
      return ['stochasticUnresolved'];
    }
    if (result.illegal !== undefined) {
      return ['illegal'];
    }
    if (result.nextDecision === undefined) {
      return ['illegal'];
    }

    const branches = branchChoices(result.nextDecision);
    if (branches.length === 0) {
      return ['exceeded'];
    }

    return branches.flatMap((branch) => classifyPathOutcome(
      def,
      state,
      move,
      [...guidedSelections, branch],
      runtime,
    ));
  } catch (error) {
    if (isEffectRuntimeReason(error, EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED)) {
      return ['CHOICE_RUNTIME_VALIDATION_FAILED'];
    }
    throw error;
  }
};

describe('FITL seed 1000 historical draw-space artifact', () => {
  it('reconstructs the seed-1000 first-choice surface for the NVA march template', { timeout: 15_000 }, () => {
    const { compiled } = compileProductionSpec();
    const def = assertValidatedGameDef(compiled.gameDef);
    const runtime = createGameDefRuntime(def);

    const agents = (def.seats ?? []).map((seat) => {
      const profileId = seat.id.toLowerCase() === 'arvn'
        ? `${seat.id.toLowerCase()}-evolved`
        : `${seat.id.toLowerCase()}-baseline`;
      return new CapturingPolicyAgent(profileId);
    });

    const trace = runGame(def, 1000, agents, 200, 4, undefined, runtime);
    assert.equal(trace.stopReason, 'agentStuck');
    assert.equal(trace.moves.length, 140);

    const witness = agents[2]?.captured;
    if (witness === undefined) {
      throw new Error('expected to capture the historical NVA stuck witness');
    }
    assert.equal(witness.stateHash, 6539610714732013105n);
    assert.equal(String(witness.move.actionId), 'march');
    assert.equal(witness.move.freeOperation, true);
    assert.deepEqual(witness.move.params, {});
    assert.equal(witness.legalMoveCount, 2);
    assert.equal(witness.movesBeforeFailure, 34);

    const firstDecision = completeMoveDecisionSequence(def, witness.state, witness.move, {
      choose: () => undefined,
      chooseStochastic: () => undefined,
    }, runtime);
    const initialRequest = firstDecision.nextDecision;
    if (initialRequest === undefined || initialRequest.type !== 'chooseN') {
      throw new Error('expected the historical witness to expose a first chooseN request');
    }
    assert.equal(initialRequest.min, 1);
    assert.equal(initialRequest.max, 1);

    const firstChoiceOptions = selectUniqueChoiceOptionValuesByLegalityPrecedence(initialRequest)
      .filter((option): option is string => typeof option === 'string');
    assert.equal(firstChoiceOptions.length, 29);

    const firstChoiceOutcomeCounts: Record<HistoricalOutcome, number> = {
      completed: 0,
      stochasticUnresolved: 0,
      illegal: 0,
      CHOICE_RUNTIME_VALIDATION_FAILED: 0,
      exceeded: 0,
    };
    const completingFirstChoices: string[] = [];

    for (const option of firstChoiceOptions) {
      const outcomes = classifyPathOutcome(def, witness.state, witness.move, [[option] as MoveParamValue], runtime);
      const uniqueOutcomes = [...new Set(outcomes)];
      assert.equal(
        uniqueOutcomes.length,
        1,
        `expected first choice ${String(option)} to classify unambiguously, got ${uniqueOutcomes.join(', ')}`,
      );

      const classification = uniqueOutcomes[0]!;
      firstChoiceOutcomeCounts[classification] += 1;
      if (classification === 'completed') {
        completingFirstChoices.push(option);
      }
    }

    /**
     * Historical seed-1000 first-choice draw-space artifact for Spec 132 I2.
     *
     * Exact counts found from the repo-owned seed-1000 witness (`stateHash=6539610714732013105`,
     * NVA free-operation `march`, first `chooseN{min:1,max:1}` request with 29 options):
     * - `completed`: 3 first choices
     * - `stochasticUnresolved`: 0
     * - downstream `illegal`: 26
     * - `CHOICE_RUNTIME_VALIDATION_FAILED`: 0
     * - budget `exceeded`: 0
     *
     * The three completing first choices are `an-loc:none`, `da-nang:none`, and `sihanoukville:none`.
     * Each of those branches still fans out to additional bounded `chooseN` decisions, but every
     * downstream branch under each of the three first choices completes successfully.
     */
    assert.deepEqual(firstChoiceOutcomeCounts, {
      completed: 3,
      stochasticUnresolved: 0,
      illegal: 26,
      CHOICE_RUNTIME_VALIDATION_FAILED: 0,
      exceeded: 0,
    });
    assert.deepEqual(completingFirstChoices, [
      'an-loc:none',
      'da-nang:none',
      'sihanoukville:none',
    ]);
  });
});
