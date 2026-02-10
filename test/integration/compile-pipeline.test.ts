import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileGameSpecToGameDef, createEmptyGameSpecDoc, expandMacros } from '../../src/cnl/index.js';

describe('compile pipeline integration', () => {
  it('is deterministic when compiling raw vs pre-expanded docs', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'pipeline-deterministic', players: { min: 2, max: 2 } },
      zones: [
        { id: 'deck', owner: 'none', visibility: 'hidden', ordering: 'stack' },
        { id: 'hand', owner: 'player', visibility: 'owner', ordering: 'set' },
      ],
      turnStructure: { phases: [{ id: 'main' }], activePlayerOrder: 'roundRobin' },
      actions: [
        {
          id: 'drawEach',
          actor: 'active',
          phase: 'main',
          params: [],
          pre: null,
          cost: [],
          effects: [{ draw: { from: 'deck:none', to: 'hand:each', count: 1 } }],
          limits: [],
        },
      ],
      endConditions: [{ when: { op: '==', left: 1, right: 1 }, result: { type: 'draw' } }],
    };

    const raw = compileGameSpecToGameDef(doc);
    const expanded = compileGameSpecToGameDef(expandMacros(doc).doc);

    assert.deepEqual(raw.diagnostics, []);
    assert.deepEqual(expanded.diagnostics, []);
    assert.deepEqual(raw, expanded);
  });

  it('merges adjacency validation diagnostics and nulls gameDef on any error', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'pipeline-adjacency-error', players: { min: 2, max: 2 } },
      zones: [{ id: 'board', owner: 'none', visibility: 'public', ordering: 'set', adjacentTo: ['missing-zone'] }],
      turnStructure: { phases: [{ id: 'main' }], activePlayerOrder: 'roundRobin' },
      actions: [{ id: 'pass', actor: 'active', phase: 'main', params: [], pre: null, cost: [], effects: [], limits: [] }],
      endConditions: [{ when: { op: '==', left: 1, right: 1 }, result: { type: 'draw' } }],
    };

    const first = compileGameSpecToGameDef(doc);
    const second = compileGameSpecToGameDef(doc);

    assert.equal(first.gameDef, null);
    assert.deepEqual(first, second);
    assert.equal(
      first.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'SPATIAL_DANGLING_ZONE_REF' && diagnostic.path === 'zones[0].adjacentTo[0]',
      ),
      true,
    );
  });
});
