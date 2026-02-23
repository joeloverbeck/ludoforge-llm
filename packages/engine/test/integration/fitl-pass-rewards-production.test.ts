import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  asActionId,
  initialState,
  legalMoves,
  type GameDef,
  type Move,
} from '../../src/kernel/index.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
import { requireCardDrivenRuntime } from '../helpers/turn-order-helpers.js';

const loadProductionGameDef = (): GameDef => {
  const { compiled } = compileProductionSpec();
  assert.notEqual(compiled.gameDef, null, 'Expected production FITL spec to compile');
  return compiled.gameDef as GameDef;
};

describe('FITL production pass rewards', () => {
  it('applies Rule 2.3.3 rewards across a full pass chain', () => {
    const def = loadProductionGameDef();
    const passMove: Move = { actionId: asActionId('pass'), params: {} };
    const start = initialState(def, 113, 4).state;

    const startArvn = Number(start.globalVars.arvnResources);
    const startNva = Number(start.globalVars.nvaResources);
    const startVc = Number(start.globalVars.vcResources);

    const afterUsPass = applyMove(def, start, passMove).state;
    const afterArvnPass = applyMove(def, afterUsPass, passMove).state;
    const afterNvaPass = applyMove(def, afterArvnPass, passMove).state;
    const afterVcPass = applyMove(def, afterNvaPass, passMove).state;

    assert.equal(Number(afterVcPass.globalVars.arvnResources), startArvn + 6);
    assert.equal(Number(afterVcPass.globalVars.nvaResources), startNva + 1);
    assert.equal(Number(afterVcPass.globalVars.vcResources), startVc + 1);
    assert.equal(requireCardDrivenRuntime(afterVcPass).currentCard.nonPassCount, 0);
    assert.deepEqual(requireCardDrivenRuntime(afterVcPass).currentCard.passedSeats, []);
  });

  it('does not apply pass rewards on non-pass actions', () => {
    const def = loadProductionGameDef();
    const start = initialState(def, 127, 4).state;
    const startArvn = Number(start.globalVars.arvnResources);
    const startNva = Number(start.globalVars.nvaResources);
    const startVc = Number(start.globalVars.vcResources);

    const usOpMove = legalMoves(def, start).find((move) => String(move.actionId) === 'usOp');
    assert.notEqual(usOpMove, undefined, 'Expected US operation move to be legal at card start');
    if (usOpMove === undefined) {
      throw new Error('Expected US operation move to be legal at card start');
    }

    const afterUsOp = applyMove(def, start, usOpMove).state;

    assert.equal(Number(afterUsOp.globalVars.arvnResources), startArvn);
    assert.equal(Number(afterUsOp.globalVars.nvaResources), startNva);
    assert.equal(Number(afterUsOp.globalVars.vcResources), startVc);
  });
});
