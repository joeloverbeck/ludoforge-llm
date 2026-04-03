import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '../../../src/cnl/index.js';
import { compileProductionSpec, compileTexasProductionSpec } from '../../helpers/production-spec-helpers.js';

const createCompileReadyDoc = () => ({
  ...createEmptyGameSpecDoc(),
  metadata: { id: 'intern-table-demo', players: { min: 2, max: 2 } },
  globalVars: [{ name: 'zeta', type: 'int', init: 0, min: 0, max: 5 }, { name: 'alpha', type: 'int', init: 0, min: 0, max: 5 }],
  perPlayerVars: [{ name: 'score', type: 'int', init: 0, min: 0, max: 10 }],
  zoneVars: [{ name: 'control', type: 'int', min: 0, max: 1, init: 0 }],
  zones: [
    { id: 'beta', owner: 'none', visibility: 'public', ordering: 'set' },
    { id: 'alpha', owner: 'none', visibility: 'public', ordering: 'set' },
  ],
  tokenTypes: [{ id: 'unit', props: {} }, { id: 'base', props: {} }],
  turnStructure: { phases: [{ id: 'cleanup' }, { id: 'main' }] },
  actions: [
    {
      id: 'pass',
      actor: 'active',
      executor: 'actor',
      phase: ['main'],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    },
  ],
  terminal: { conditions: [{ when: { op: '==', left: 0, right: 1 }, result: { type: 'draw' } }] },
});

describe('compiler intern table generation', () => {
  it('builds deterministic tables with sorted domains and runtime-order players', () => {
    const first = compileGameSpecToGameDef(createCompileReadyDoc());
    const second = compileGameSpecToGameDef(createCompileReadyDoc());

    assert.ok(first.gameDef);
    assert.ok(second.gameDef);
    assert.ok(first.gameDef.internTable);
    assert.ok(second.gameDef.internTable);
    assert.deepEqual(first.gameDef.internTable, second.gameDef.internTable);
    assert.deepEqual(first.gameDef.internTable, {
      zones: ['alpha:none', 'beta:none'],
      actions: ['pass'],
      tokenTypes: ['base', 'unit'],
      seats: [],
      players: ['0', '1'],
      phases: ['cleanup', 'main'],
      globalVars: ['alpha', 'zeta'],
      perPlayerVars: ['score'],
      zoneVars: ['control'],
    });
  });

  it('populates intern tables for FITL and Texas production specs', () => {
    const fitl = compileProductionSpec().compiled.gameDef.internTable;
    const texas = compileTexasProductionSpec().compiled.gameDef.internTable;

    assert.ok(fitl);
    assert.ok(texas);
    assert.ok(fitl.zones.length > 0);
    assert.ok(fitl.actions.length > 0);
    assert.ok(fitl.players.length > 0);
    assert.ok(texas.zones.length > 0);
    assert.ok(texas.actions.length > 0);
    assert.ok(texas.players.length > 0);
  });
});
