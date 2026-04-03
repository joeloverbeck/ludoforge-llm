import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asRuntimeZoneId,
  asZoneId,
  buildZoneRuntimeIndex,
  externRuntimeZoneId,
  internRuntimeZoneId,
  type GameDef,
} from '../../../src/kernel/index.js';

const makeDef = (): GameDef => ({
  metadata: { id: 'runtime-zone-index-test', players: { min: 1, max: 2 } },
  internTable: {
    zones: ['b:none', 'a:none', 'draw:none'],
    actions: [],
    tokenTypes: [],
    seats: [],
    players: ['0', '1'],
    phases: [],
    globalVars: [],
    perPlayerVars: [],
    zoneVars: [],
  },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [
    {
      id: asZoneId('a:none'),
      owner: 'none',
      visibility: 'public',
      ordering: 'set',
      adjacentTo: [{ to: asZoneId('b:none') }],
    },
    {
      id: asZoneId('b:none'),
      owner: 'none',
      visibility: 'public',
      ordering: 'set',
      adjacentTo: [{ to: asZoneId('a:none') }],
      behavior: {
        type: 'deck',
        drawFrom: 'top',
        reshuffleFrom: asZoneId('draw:none'),
      },
    },
    {
      id: asZoneId('draw:none'),
      owner: 'none',
      visibility: 'hidden',
      ordering: 'stack',
    },
  ],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [] },
  actions: [],
  triggers: [],
  terminal: { conditions: [] },
});

describe('runtime zone index', () => {
  it('uses internTable zone order for runtime ids and roundtrips canonical ids', () => {
    const def = makeDef();

    const index = buildZoneRuntimeIndex(def);

    assert.deepEqual(index.canonicalIds, [
      asZoneId('b:none'),
      asZoneId('a:none'),
      asZoneId('draw:none'),
    ]);
    assert.equal(internRuntimeZoneId(asZoneId('b:none'), index), 0);
    assert.equal(internRuntimeZoneId(asZoneId('a:none'), index), 1);
    assert.equal(externRuntimeZoneId(asRuntimeZoneId(2), index), asZoneId('draw:none'));
  });

  it('normalizes adjacency and deck refs to runtime ids', () => {
    const index = buildZoneRuntimeIndex(makeDef());
    const zoneA = index.zones[1];
    const zoneB = index.zones[0];

    assert.deepEqual(zoneA?.adjacentTo?.map((entry) => entry.to), [0]);
    assert.equal(zoneB?.behavior?.type, 'deck');
    assert.equal(zoneB?.behavior?.reshuffleFrom, 2);
  });
});
