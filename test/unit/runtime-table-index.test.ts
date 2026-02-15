import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { asZoneId, buildRuntimeTableIndex, getRuntimeTableIndex, type GameDef } from '../../src/kernel/index.js';

const makeDef = (): GameDef => ({
  metadata: { id: 'runtime-table-index-test', players: { min: 1, max: 2 } },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [{ id: asZoneId('table:none'), owner: 'none', visibility: 'public', ordering: 'set' }],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [] },
  actions: [],
  triggers: [],
  terminal: { conditions: [] },
});

describe('runtime table index', () => {
  it('builds indexed table rows and fields from contracts', () => {
    const def: GameDef = {
      ...makeDef(),
      runtimeDataAssets: [
        {
          id: 'tournament-standard',
          kind: 'scenario',
          payload: {
            blindSchedule: {
              levels: [
                { level: 1, smallBlind: 10, phase: 'early' },
                { level: 2, smallBlind: 20, phase: 'mid' },
              ],
            },
          },
        },
      ],
      tableContracts: [
        {
          id: 'tournament-standard::blindSchedule.levels',
          assetId: 'tournament-standard',
          tablePath: 'blindSchedule.levels',
          fields: [
            { field: 'level', type: 'int' },
            { field: 'phase', type: 'string' },
            { field: 'smallBlind', type: 'int' },
          ],
        },
      ],
    };

    const index = buildRuntimeTableIndex(def);
    const entry = index.tablesById.get('tournament-standard::blindSchedule.levels');
    assert.ok(entry);
    assert.equal(entry.issue, undefined);
    assert.equal(entry.rows?.length, 2);
    assert.ok(entry.fieldNames.has('smallBlind'));
    assert.deepEqual(index.tableIds, ['tournament-standard::blindSchedule.levels']);
  });

  it('captures deterministic indexed issues for unresolved contracts', () => {
    const def: GameDef = {
      ...makeDef(),
      runtimeDataAssets: [
        {
          id: 'tournament-standard',
          kind: 'scenario',
          payload: {
            blindSchedule: {
              levels: [{ level: 1, smallBlind: 10 }],
            },
          },
        },
      ],
      tableContracts: [
        {
          id: 'missing-asset::blindSchedule.levels',
          assetId: 'missing',
          tablePath: 'blindSchedule.levels',
          fields: [],
        },
        {
          id: 'tournament-standard::blindSchedule.missing',
          assetId: 'tournament-standard',
          tablePath: 'blindSchedule.missing',
          fields: [],
        },
      ],
    };

    const index = buildRuntimeTableIndex(def);
    assert.equal(index.tablesById.get('missing-asset::blindSchedule.levels')?.issue?.kind, 'assetMissing');
    assert.equal(index.tablesById.get('tournament-standard::blindSchedule.missing')?.issue?.kind, 'tablePathMissing');
  });

  it('caches runtime table index per GameDef instance', () => {
    const def = makeDef();
    const first = getRuntimeTableIndex(def);
    const second = getRuntimeTableIndex(def);
    assert.equal(first, second);
  });
});
