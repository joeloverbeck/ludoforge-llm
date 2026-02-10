import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '../../src/cnl/index.js';

describe('compile top-level actions/triggers/end conditions', () => {
  it('preserves trigger/end-condition order and generates deterministic trigger ids', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'top-level', players: { min: 2, max: 2 } },
      globalVars: [{ name: 'tick', type: 'int', init: 0, min: 0, max: 10 }],
      zones: [{ id: 'deck', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
      turnStructure: { phases: [{ id: 'main' }], activePlayerOrder: 'roundRobin' },
      actions: [
        { id: 'pass', actor: 'active', phase: 'main', params: [], pre: null, cost: [], effects: [], limits: [] },
      ],
      triggers: [
        { event: { type: 'turnStart' }, effects: [{ addVar: { scope: 'global', var: 'tick', delta: 1 } }] },
        {
          id: 'afterPass',
          event: { type: 'actionResolved', action: 'pass' },
          effects: [{ addVar: { scope: 'global', var: 'tick', delta: 1 } }],
        },
      ],
      endConditions: [
        { when: { op: '>=', left: { ref: 'gvar', var: 'tick' }, right: 3 }, result: { type: 'win', player: 'activePlayer' } },
        { when: { op: '>=', left: { ref: 'gvar', var: 'tick' }, right: 5 }, result: { type: 'draw' } },
      ],
    };

    const result = compileGameSpecToGameDef(doc);

    assert.equal(result.gameDef !== null, true);
    assert.deepEqual(result.diagnostics, []);
    assert.deepEqual(
      result.gameDef?.triggers.map((trigger) => trigger.id),
      ['trigger_0', 'afterPass'],
    );
    assert.deepEqual(
      result.gameDef?.endConditions.map((condition) => condition.result.type),
      ['win', 'draw'],
    );
    assert.equal(result.gameDef?.endConditions[0]?.result.type, 'win');
    if (result.gameDef?.endConditions[0]?.result.type === 'win') {
      assert.equal(result.gameDef.endConditions[0].result.player, 'active');
    }
  });

  it('returns deterministic blocking diagnostics for unknown trigger action references', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'bad-trigger-action', players: { min: 2, max: 2 } },
      zones: [{ id: 'deck', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
      turnStructure: { phases: [{ id: 'main' }], activePlayerOrder: 'roundRobin' },
      actions: [{ id: 'pass', actor: 'active', phase: 'main', params: [], pre: null, cost: [], effects: [], limits: [] }],
      triggers: [{ event: { type: 'actionResolved', action: 'psas' }, effects: [] }],
      endConditions: [{ when: { op: '>=', left: 1, right: 2 }, result: { type: 'draw' } }],
    };

    const first = compileGameSpecToGameDef(doc);
    const second = compileGameSpecToGameDef(doc);

    assert.equal(first.gameDef, null);
    assert.equal(second.gameDef, null);
    assert.deepEqual(first.diagnostics, second.diagnostics);
    assert.equal(
      first.diagnostics.some((diagnostic) => diagnostic.code === 'REF_ACTION_MISSING' && diagnostic.path === 'triggers[0].event.action'),
      true,
    );
  });
});
