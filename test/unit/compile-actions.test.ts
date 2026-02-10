import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '../../src/cnl/index.js';

describe('compile actions', () => {
  it('lowers action actor/params/pre/cost/effects/limits into GameDef', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'action-compile', players: { min: 2, max: 2 } },
      globalVars: [{ name: 'energy', type: 'int', init: 2, min: -10, max: 10 }],
      zones: [
        { id: 'deck', owner: 'none', visibility: 'hidden', ordering: 'stack' },
        { id: 'hand', owner: 'player', visibility: 'hidden', ordering: 'stack' },
      ],
      turnStructure: { phases: [{ id: 'main' }], activePlayerOrder: 'roundRobin' },
      actions: [
        {
          id: 'play',
          actor: 'activePlayer',
          phase: 'main',
          params: [{ name: 'count', domain: { query: 'intsInRange', min: 1, max: 2 } }],
          pre: {
            op: '>=',
            left: { ref: 'zoneCount', zone: 'hand:0' },
            right: 1,
          },
          cost: [{ addVar: { scope: 'global', var: 'energy', delta: -1 } }],
          effects: [{ draw: { from: 'deck', to: 'hand:0', count: 1 } }],
          limits: [{ scope: 'turn', max: 1 }],
        },
      ],
      triggers: [],
      endConditions: [{ when: { op: '>=', left: 1, right: 999 }, result: { type: 'draw' } }],
    };

    const result = compileGameSpecToGameDef(doc);

    assert.equal(result.gameDef !== null, true);
    assert.deepEqual(result.diagnostics, []);

    const action = result.gameDef?.actions[0];
    assert.equal(action?.id, 'play');
    assert.equal(action?.actor, 'active');
    assert.equal(action?.phase, 'main');
    assert.equal(action?.params[0]?.name, 'count');
    assert.deepEqual(action?.params[0]?.domain, { query: 'intsInRange', min: 1, max: 2 });
    assert.deepEqual(action?.limits, [{ scope: 'turn', max: 1 }]);
    assert.deepEqual(action?.effects, [{ draw: { from: 'deck:none', to: 'hand:0', count: 1 } }]);
  });
});
