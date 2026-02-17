import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { asZoneId, buildRuntimeTableIndex, type GameDef } from '../../src/kernel/index.js';

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
    assert.equal(entry.fieldContractsByName.get('smallBlind')?.type, 'int');
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

  it('builds deterministic runtime table index for the same GameDef', () => {
    const def = makeDef();
    const first = buildRuntimeTableIndex(def);
    const second = buildRuntimeTableIndex(def);
    assert.deepEqual(first.tableIds, second.tableIds);
    assert.deepEqual([...first.tablesById.keys()], [...second.tablesById.keys()]);
  });

  it('uses first runtime asset when ids collide after NFC normalization', () => {
    const decomposedCafe = 'cafe\u0301';
    const composedCafe = 'caf\u00E9';
    assert.equal(decomposedCafe.normalize('NFC'), composedCafe.normalize('NFC'));

    const def: GameDef = {
      ...makeDef(),
      runtimeDataAssets: [
        {
          id: decomposedCafe,
          kind: 'scenario',
          payload: { table: [{ level: 1 }] },
        },
        {
          id: composedCafe,
          kind: 'scenario',
          payload: { table: [{ level: 99 }] },
        },
      ],
      tableContracts: [
        {
          id: 'blind-levels',
          assetId: composedCafe,
          tablePath: 'table',
          fields: [{ field: 'level', type: 'int' }],
        },
      ],
    };

    const index = buildRuntimeTableIndex(def);
    const rows = index.tablesById.get('blind-levels')?.rows;
    assert.deepEqual(rows, [{ level: 1 }]);
  });

  it('builds uniqueBy tuple indexes with deterministic composite-key candidates', () => {
    const def: GameDef = {
      ...makeDef(),
      runtimeDataAssets: [
        {
          id: 'tournament-standard',
          kind: 'scenario',
          payload: {
            blindSchedule: {
              levels: [
                { level: 1, phase: 'early', smallBlind: 10 },
                { level: 1, phase: 'early', smallBlind: 10 },
                { level: 2, phase: 'mid', smallBlind: 20 },
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
          uniqueBy: [['level']],
        },
      ],
    };

    const index = buildRuntimeTableIndex(def);
    const entry = index.tablesById.get('tournament-standard::blindSchedule.levels');
    assert.ok(entry);
    const keyIndex = entry.keyIndexesByTuple.get('level');
    assert.ok(keyIndex);

    const duplicateRows = keyIndex.rowsByCompositeKey.get('n:1');
    assert.ok(duplicateRows);
    assert.equal(duplicateRows.length, 2);
    assert.deepEqual(
      duplicateRows.map((row) => row.smallBlind),
      [10, 10],
    );

    const levelTwoRows = keyIndex.rowsByCompositeKey.get('n:2');
    assert.equal(levelTwoRows?.length, 1);
  });
});
