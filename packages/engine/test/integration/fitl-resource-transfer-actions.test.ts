import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { asActionId, asPlayerId, legalMoves, type GameDef } from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { applyMoveWithResolvedDecisionIds } from '../helpers/decision-param-helpers.js';
import { makeIsolatedInitialState } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const transferInitialState = (def: GameDef, seed: number) => makeIsolatedInitialState(def, seed, 4, { turnOrderMode: 'roundRobin' });

describe('FITL NVA/VC resource transfer actions', () => {
  it('compiles production spec with transfer actions and bounded amount params', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assertNoErrors(compiled);
    assert.notEqual(compiled.gameDef, null);

    const def = compiled.gameDef!;
    const nvaTransfer = def.actions.find((action) => String(action.id) === 'nvaTransferResources');
    const vcTransfer = def.actions.find((action) => String(action.id) === 'vcTransferResources');

    assert.ok(nvaTransfer, 'Expected nvaTransferResources action in compiled GameDef');
    assert.ok(vcTransfer, 'Expected vcTransferResources action in compiled GameDef');
    assert.deepEqual(nvaTransfer?.params, [{ name: 'amount', domain: { query: 'intsInVarRange', var: 'nvaResources', min: 1 } }]);
    assert.deepEqual(vcTransfer?.params, [{ name: 'amount', domain: { query: 'intsInVarRange', var: 'vcResources', min: 1 } }]);
  });

  it('transfers resources from NVA to VC and conserves total', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const start = {
      ...transferInitialState(def, 911),
      activePlayer: asPlayerId(2),
      globalVars: {
        ...transferInitialState(def, 911).globalVars,
        nvaResources: 5,
        vcResources: 2,
      },
    };

    const beforeTotal = Number(start.globalVars.nvaResources ?? 0) + Number(start.globalVars.vcResources ?? 0);
    const end = applyMoveWithResolvedDecisionIds(def, start, {
      actionId: asActionId('nvaTransferResources'),
      params: { amount: 3 },
    }).state;

    assert.equal(end.globalVars.nvaResources, 2);
    assert.equal(end.globalVars.vcResources, 5);
    assert.equal(Number(end.globalVars.nvaResources ?? 0) + Number(end.globalVars.vcResources ?? 0), beforeTotal);
  });

  it('transfers resources from VC to NVA and conserves total', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const start = {
      ...transferInitialState(def, 912),
      activePlayer: asPlayerId(3),
      globalVars: {
        ...transferInitialState(def, 912).globalVars,
        nvaResources: 4,
        vcResources: 1,
      },
    };

    const beforeTotal = Number(start.globalVars.nvaResources ?? 0) + Number(start.globalVars.vcResources ?? 0);
    const end = applyMoveWithResolvedDecisionIds(def, start, {
      actionId: asActionId('vcTransferResources'),
      params: { amount: 1 },
    }).state;

    assert.equal(end.globalVars.vcResources, 0);
    assert.equal(end.globalVars.nvaResources, 5);
    assert.equal(Number(end.globalVars.nvaResources ?? 0) + Number(end.globalVars.vcResources ?? 0), beforeTotal);
  });

  it('exposes only donor-affordable transfer amounts as legal moves', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const start = {
      ...transferInitialState(def, 913),
      activePlayer: asPlayerId(2),
      globalVars: {
        ...transferInitialState(def, 913).globalVars,
        nvaResources: 2,
        vcResources: 7,
      },
    };

    const amounts = legalMoves(def, start)
      .filter((move) => String(move.actionId) === 'nvaTransferResources')
      .map((move) => Number(move.params.amount))
      .sort((a, b) => a - b);

    assert.deepEqual(amounts, [1, 2]);

    assert.throws(
      () =>
        applyMoveWithResolvedDecisionIds(def, start, {
          actionId: asActionId('nvaTransferResources'),
          params: { amount: 3 },
        }),
      /Illegal move/,
      'Transfer should reject amounts greater than donor resources',
    );
  });

  it('does not offer transfer moves when donor has zero resources', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const nvaEmpty = {
      ...transferInitialState(def, 914),
      activePlayer: asPlayerId(2),
      globalVars: {
        ...transferInitialState(def, 914).globalVars,
        nvaResources: 0,
        vcResources: 9,
      },
    };
    const vcEmpty = {
      ...transferInitialState(def, 915),
      activePlayer: asPlayerId(3),
      globalVars: {
        ...transferInitialState(def, 915).globalVars,
        nvaResources: 9,
        vcResources: 0,
      },
    };

    assert.equal(
      legalMoves(def, nvaEmpty).filter((move) => String(move.actionId) === 'nvaTransferResources').length,
      0,
      'NVA transfer should not be legal when nvaResources is 0',
    );
    assert.equal(
      legalMoves(def, vcEmpty).filter((move) => String(move.actionId) === 'vcTransferResources').length,
      0,
      'VC transfer should not be legal when vcResources is 0',
    );
  });
});
