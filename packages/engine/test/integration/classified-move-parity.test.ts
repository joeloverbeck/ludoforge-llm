// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../src/agents/policy-agent.js';
import {
  applyDecision,
  applyMove,
  applyTrustedMove,
  assertValidatedGameDef,
  createGameDefRuntime,
  enumerateLegalMoves,
  initialState,
  legalMoves,
  publishMicroturn,
  probeMoveViability,
  type Move,
  type ValidatedGameDef,
} from '../../src/kernel/index.js';
import { runGame } from '../../src/sim/simulator.js';
import { getFitlProductionFixture, getTexasProductionFixture } from '../helpers/production-spec-helpers.js';

interface ProductionParityCase {
  readonly label: string;
  readonly def: ValidatedGameDef;
  readonly seed: number;
  readonly playerCount: number;
  readonly maxTurns: number;
}

const createPolicyAgents = (count: number): readonly PolicyAgent[] =>
  Array.from({ length: count }, () => new PolicyAgent());

const publicMoveIdentity = (move: Move): string =>
  JSON.stringify({
    actionId: String(move.actionId),
    params: move.params,
    freeOperation: move.freeOperation ?? false,
    actionClass: move.actionClass ?? null,
  });

const includesEquivalentMove = (
  moves: readonly Move[],
  target: Move,
): boolean => moves.some((move) => publicMoveIdentity(move) === publicMoveIdentity(target));

const assertOverlapOrderPreserved = (
  rawMoves: readonly Move[],
  classifiedMoves: readonly Move[],
  message: string,
): void => {
  let classifiedIndex = 0;

  for (const rawMove of rawMoves) {
    while (classifiedIndex < classifiedMoves.length
      && publicMoveIdentity(classifiedMoves[classifiedIndex]!) !== publicMoveIdentity(rawMove)) {
      classifiedIndex++;
    }

    assert.equal(
      classifiedIndex < classifiedMoves.length,
      true,
      `${message}: missing classified equivalent for raw action ${String(rawMove.actionId)}`,
    );
    classifiedIndex++;
  }
};

const FITL_CASE: ProductionParityCase = {
  label: 'FITL',
  def: assertValidatedGameDef(getFitlProductionFixture().gameDef),
  seed: 11,
  playerCount: 4,
  maxTurns: 5,
};

const TEXAS_CASE: ProductionParityCase = {
  label: 'Texas Hold\'em',
  def: assertValidatedGameDef(getTexasProductionFixture().gameDef),
  seed: 31,
  playerCount: 4,
  maxTurns: 8,
};

const assertCompleteMoveTrustedParity = (
  label: string,
  def: ValidatedGameDef,
  state: ReturnType<typeof initialState>['state'],
  stepIndex: number,
  runtime: ReturnType<typeof createGameDefRuntime>,
) => {
  const classified = enumerateLegalMoves(def, state, undefined, runtime).moves;

  for (const entry of classified) {
    if (!entry.viability.viable || !entry.viability.complete) {
      continue;
    }
    if (entry.trustedMove === undefined) {
      throw new Error(`expected trusted move metadata for ${String(entry.move.actionId)}`);
    }
    const completeMove = entry.viability.move;
    if (completeMove === undefined) {
      throw new Error(`expected complete move payload for ${String(entry.move.actionId)}`);
    }

    const baseline = applyMove(def, state, completeMove, undefined, runtime);
    const trusted = applyTrustedMove(def, state, entry.trustedMove, undefined, runtime);

    assert.deepEqual(
      trusted,
      baseline,
      `${label} step=${stepIndex} complete move ${String(entry.move.actionId)} diverged under trusted execution`,
    );
  }
};

const assertProductionParity = (testCase: ProductionParityCase): void => {
  const { label, def, seed, playerCount, maxTurns } = testCase;
  const runtime = createGameDefRuntime(def);

  const firstTrace = runGame(def, seed, createPolicyAgents(playerCount), maxTurns, playerCount, undefined, runtime);
  const secondTrace = runGame(def, seed, createPolicyAgents(playerCount), maxTurns, playerCount, undefined, runtime);

  assert.deepEqual(secondTrace, firstTrace, `${label} should produce an identical trace for the same seed`);
  assert.equal(firstTrace.decisions.length > 0, true, `${label} should emit at least one move`);

  let replayState = initialState(def, seed, playerCount, undefined, runtime).state;

  for (const [stepIndex, moveLog] of firstTrace.decisions.entries()) {
    const microturn = publishMicroturn(def, replayState, runtime);
    assert.equal(
      moveLog.legalActionCount,
      microturn.legalActions.length,
      `${label} step=${stepIndex} trace legalActionCount should match the published frontier`,
    );

    if (moveLog.decision.kind === 'actionSelection') {
      const rawMoves = legalMoves(def, replayState, undefined, runtime);
      const classifiedResult = enumerateLegalMoves(def, replayState, undefined, runtime);
      const classifiedMoves = classifiedResult.moves.map(({ move }) => move);
      const classifiedMovesWithRawEquivalent = classifiedMoves.filter((classifiedMove) =>
        includesEquivalentMove(rawMoves, classifiedMove),
      );
      const omittedRawMoves = rawMoves.filter((rawMove) =>
        !includesEquivalentMove(classifiedMoves, rawMove),
      );

      assertOverlapOrderPreserved(
        rawMoves.filter((rawMove) => includesEquivalentMove(classifiedMoves, rawMove)),
        classifiedMovesWithRawEquivalent,
        `${label} step=${stepIndex} classified moves should preserve raw move order where the surfaces overlap`,
      );
      assert.equal(
        classifiedResult.moves.every(({ viability }) => viability.viable),
        true,
        `${label} step=${stepIndex} classified moves must all remain viable`,
      );
      for (const omittedMove of omittedRawMoves) {
        const viability = probeMoveViability(def, replayState, omittedMove, runtime);
        const completedVariantExists = classifiedResult.moves.some(({ move }) =>
          String(move.actionId) === String(omittedMove.actionId),
        );
        if (!viability.viable) {
          assert.equal(
            classifiedResult.warnings.some((warning) =>
              warning.code === 'MOVE_ENUM_PROBE_REJECTED'
              && warning.context['actionId'] === String(omittedMove.actionId)
              && warning.context['reason'] === viability.code,
            ),
            true,
            `${label} step=${stepIndex} omitted raw move ${String(omittedMove.actionId)} must emit a probe-rejection warning`,
          );
          continue;
        }
        assert.equal(
          completedVariantExists,
          true,
          `${label} step=${stepIndex} viable omitted raw move ${String(omittedMove.actionId)} must be represented by a completed classified variant`,
        );
      }

      assertCompleteMoveTrustedParity(label, def, replayState, stepIndex, runtime);

      const selectedDecision = moveLog.decision;
      assert.equal(
        microturn.legalActions.some((candidate) =>
          candidate.kind === 'actionSelection' && String(candidate.actionId) === String(selectedDecision.actionId),
        ),
        true,
        `${label} step=${stepIndex} selected action must remain present in the published frontier`,
      );
      assert.equal(
        classifiedResult.moves.some(({ move }) => String(move.actionId) === String(selectedDecision.actionId)),
        true,
        `${label} step=${stepIndex} selected action must remain present in classified enumeration`,
      );
      if (selectedDecision.move !== undefined) {
        assert.equal(
          String(selectedDecision.move.actionId),
          String(selectedDecision.actionId),
          `${label} step=${stepIndex} published move payload must match the selected action id`,
        );
      }
    }
    const appliedDecision = applyDecision(def, replayState, moveLog.decision, undefined, runtime);
    assert.deepEqual(
      appliedDecision.triggerFirings,
      moveLog.triggerFirings,
      `${label} step=${stepIndex} replay trigger firings should match trace`,
    );
    assert.deepEqual(
      appliedDecision.warnings,
      moveLog.warnings,
      `${label} step=${stepIndex} replay warnings should match trace`,
    );
    assert.equal(
      appliedDecision.state.stateHash,
      moveLog.stateHash,
      `${label} step=${stepIndex} replay state hash should match trace`,
    );

    replayState = appliedDecision.state;
  }

  assert.deepEqual(replayState, firstTrace.finalState, `${label} replay should reconstruct final state exactly`);
};

describe('classified move production parity', () => {
  it('preserves legality-surface and trusted-execution parity for FITL and Texas production traces', () => {
    assertProductionParity(FITL_CASE);
    assertProductionParity(TEXAS_CASE);
  });
});
