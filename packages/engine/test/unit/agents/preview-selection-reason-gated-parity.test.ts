// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { evaluatePolicyMoveCore } from '../../../src/agents/policy-eval.js';
import {
  createGameDefRuntime,
  legalMoves,
} from '../../../src/kernel/index.js';
import { toMoveIdentityKey } from '../../../src/kernel/move-identity.js';
import { createTrustedExecutableMove } from '../../../src/kernel/trusted-move.js';
import {
  buildDeterministicFitlStateCorpus,
  compileFitlValidatedGameDef,
} from '../../helpers/compiled-condition-production-helpers.js';

describe('preview selectionReason gated parity', () => {
  it('matches previewGatedCount and keeps FITL selection reasons deterministic', () => {
    const def = compileFitlValidatedGameDef();
    const runtime = createGameDefRuntime(def);
    const states = buildDeterministicFitlStateCorpus(def, { seeds: [11, 23], maxPly: 2 });
    let checkedDecisions = 0;
    let checkedGatedDecisions = 0;
    let checkedCoverageDecisions = 0;

    for (const state of states) {
      const moves = legalMoves(def, state, undefined, runtime);
      if (moves.length === 0) {
        continue;
      }
      const trustedMoveIndex = new Map(
        moves.map((move) => [
          toMoveIdentityKey(def, move),
          createTrustedExecutableMove(move, state.stateHash, 'enumerateLegalMoves'),
        ]),
      );
      const first = evaluatePolicyMoveCore({
        def,
        state,
        playerId: state.activePlayer,
        legalMoves: moves,
        trustedMoveIndex,
        rng: { state: state.rng },
        runtime,
      });
      const second = evaluatePolicyMoveCore({
        def,
        state,
        playerId: state.activePlayer,
        legalMoves: moves,
        trustedMoveIndex,
        rng: { state: state.rng },
        runtime,
      });

      assert.equal(first.kind, 'success');
      assert.equal(second.kind, 'success');

      const gatedCount = first.metadata.candidates.filter((candidate) => candidate.selectionReason === 'gated').length;
      const nonGatedReasons = first.metadata.candidates
        .filter((candidate) => candidate.selectionReason !== 'gated')
        .map((candidate) => candidate.selectionReason);

      assert.equal(gatedCount, first.metadata.previewGatedCount);
      assert.equal(
        first.metadata.previewUsage.outcomeBreakdown.unknownGated,
        first.metadata.previewGatedCount,
      );
      assert.ok(
        nonGatedReasons.every((reason) => reason === 'coverage' || reason === 'prior'),
        'expected non-gated candidates to be selected by coverage or prior fill',
      );
      assert.deepEqual(
        first.metadata.candidates.map((candidate) => candidate.selectionReason),
        second.metadata.candidates.map((candidate) => candidate.selectionReason),
      );

      checkedDecisions += 1;
      if (gatedCount > 0) {
        checkedGatedDecisions += 1;
      }
      if (nonGatedReasons.includes('coverage')) {
        checkedCoverageDecisions += 1;
      }
    }

    assert.ok(checkedDecisions > 0, 'expected the FITL fixture to expose action-selection decisions');
    assert.ok(checkedGatedDecisions > 0, 'expected the FITL fixture to exercise preview-gated candidates');
    assert.ok(checkedCoverageDecisions > 0, 'expected the FITL fixture to exercise coverage-selected candidates');
  });
});
