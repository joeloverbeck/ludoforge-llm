import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../src/agents/policy-agent.js';
import {
  applyTrustedMove,
  applyMove,
  areMovesEquivalent,
  assertValidatedGameDef,
  createGameDefRuntime,
  enumerateLegalMoves,
  initialState,
  legalMoves,
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

const includesEquivalentMove = (
  moves: readonly Move[],
  target: Move,
): boolean => moves.some((move) => areMovesEquivalent(move, target));

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

    const baseline = applyMove(def, state, entry.move, undefined, runtime);
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
  assert.equal(firstTrace.moves.length > 0, true, `${label} should emit at least one move`);

  let replayState = initialState(def, seed, playerCount, undefined, runtime).state;

  for (const [stepIndex, moveLog] of firstTrace.moves.entries()) {
    const rawMoves = legalMoves(def, replayState, undefined, runtime);
    const classifiedResult = enumerateLegalMoves(def, replayState, undefined, runtime);
    const classifiedMoves = classifiedResult.moves.map(({ move }) => move);
    const omittedRawMoves = rawMoves.filter((rawMove) =>
      !includesEquivalentMove(classifiedMoves, rawMove),
    );

    assert.deepEqual(
      rawMoves.filter((rawMove) => includesEquivalentMove(classifiedMoves, rawMove)),
      classifiedMoves,
      `${label} step=${stepIndex} classified moves should preserve raw move order`,
    );
    assert.equal(
      classifiedResult.moves.every(({ viability }) => viability.viable),
      true,
      `${label} step=${stepIndex} classified moves must all remain viable`,
    );
    for (const omittedMove of omittedRawMoves) {
      const viability = probeMoveViability(def, replayState, omittedMove, runtime);
      assert.equal(
        viability.viable,
        false,
        `${label} step=${stepIndex} omitted raw move ${String(omittedMove.actionId)} must be probe-non-viable`,
      );
      assert.equal(
        classifiedResult.warnings.some((warning) =>
          warning.code === 'MOVE_ENUM_PROBE_REJECTED'
          && warning.context['actionId'] === String(omittedMove.actionId)
          && warning.context['reason'] === viability.code,
        ),
        true,
        `${label} step=${stepIndex} omitted raw move ${String(omittedMove.actionId)} must emit a probe-rejection warning`,
      );
    }
    assert.equal(
      moveLog.legalMoveCount,
      classifiedResult.moves.length,
      `${label} step=${stepIndex} trace legalMoveCount should match classified enumeration`,
    );

    assertCompleteMoveTrustedParity(label, def, replayState, stepIndex, runtime);

    const baseline = applyMove(def, replayState, moveLog.move, undefined, runtime);
    const trusted = applyTrustedMove(
      def,
      replayState,
      {
        ...moveLog.move,
        move: moveLog.move,
        sourceStateHash: replayState.stateHash,
        provenance: 'enumerateLegalMoves',
      },
      undefined,
      runtime,
    );

    assert.deepEqual(
      trusted,
      baseline,
      `${label} step=${stepIndex} selected move diverged under trusted execution`,
    );
    assert.deepEqual(
      baseline.triggerFirings,
      moveLog.triggerFirings,
      `${label} step=${stepIndex} replay trigger firings should match trace`,
    );
    assert.deepEqual(
      baseline.warnings,
      moveLog.warnings,
      `${label} step=${stepIndex} replay warnings should match trace`,
    );
    assert.equal(
      baseline.state.stateHash,
      moveLog.stateHash,
      `${label} step=${stepIndex} replay state hash should match trace`,
    );

    replayState = baseline.state;
  }

  assert.deepEqual(replayState, firstTrace.finalState, `${label} replay should reconstruct final state exactly`);
};

describe('classified move production parity', () => {
  it('preserves legality-surface and trusted-execution parity for FITL and Texas production traces', () => {
    assertProductionParity(FITL_CASE);
    assertProductionParity(TEXAS_CASE);
  });
});
