import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asPhaseId,
  asPlayerId,
  initialState,
  legalMoves,
  type GameDef,
  type GameState,
} from '../../src/kernel/index.js';
import { applyMoveWithResolvedDecisionIds } from '../helpers/decision-param-helpers.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { clearAllZones } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const compileDef = (): GameDef => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assert.notEqual(compiled.gameDef, null);
  return compiled.gameDef!;
};

describe('FITL commitment executor semantics', () => {
  it('declares resolveCommitment with explicit US executor', () => {
    const def = compileDef();
    const resolveCommitment = def.actions.find((action) => String(action.id) === 'resolveCommitment');
    assert.notEqual(resolveCommitment, undefined);
    assert.equal(typeof resolveCommitment?.executor, 'object');
    assert.equal(String((resolveCommitment?.executor as { id: unknown }).id), '0');
    assert.deepEqual(resolveCommitment?.pre, {
      op: '==',
      left: { ref: 'activePlayer' },
      right: 0,
    });
  });

  it('resolves commitment even when the active faction is not US', () => {
    const def = compileDef();
    const baseState = clearAllZones(initialState(def, 7303, 4).state);
    const setup: GameState = {
      ...baseState,
      activePlayer: asPlayerId(1),
      currentPhase: asPhaseId('commitment'),
      interruptPhaseStack: [{ phase: asPhaseId('commitment'), resumePhase: asPhaseId('main') }],
    };

    const move = legalMoves(def, setup).find((candidate) => String(candidate.actionId) === 'resolveCommitment');
    assert.notEqual(move, undefined, 'Expected resolveCommitment move for non-US active faction');

    const result = applyMoveWithResolvedDecisionIds(def, setup, move!).state;
    assert.equal(result.currentPhase, 'main');
  });
});
