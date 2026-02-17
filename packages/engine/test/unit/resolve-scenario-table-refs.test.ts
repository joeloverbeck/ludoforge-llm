import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Diagnostic } from '../../src/kernel/diagnostics.js';
import type { RuntimeTableContract } from '../../src/kernel/types.js';
import { createEmptyGameSpecDoc } from '../../src/cnl/game-spec-doc.js';
import { resolveScenarioTableRefsInDoc } from '../../src/cnl/resolve-scenario-table-refs.js';

function baseDoc(tableId = 'blindSchedule.levels') {
  return {
    ...createEmptyGameSpecDoc(),
    metadata: {
      id: 'table-ref-resolution',
      players: { min: 2, max: 2 },
    },
    zones: [{ id: 'table:none', owner: 'none', visibility: 'public', ordering: 'set' }],
    turnStructure: { phases: [{ id: 'main' }] },
    actions: [
      {
        id: 'syncBlind',
        actor: 'active',
        executor: 'actor',
        phase: ['main'],
        params: [],
        pre: null,
        cost: [],
        effects: [
          {
            forEach: {
              bind: '$row',
              over: { query: 'assetRows', tableId },
              effects: [
                {
                  setVar: {
                    scope: 'global',
                    var: 'currentSmallBlind',
                    value: { ref: 'assetField', row: '$row', tableId, field: 'smallBlind' },
                  },
                },
              ],
            },
          },
        ],
        limits: [],
      },
    ],
    terminal: {
      conditions: [{ when: { op: '==', left: 1, right: 0 }, result: { type: 'draw' } }],
    },
  };
}

describe('resolveScenarioTableRefsInDoc', () => {
  it('resolves scenario-relative table paths to selected scenario runtime table ids', () => {
    const diagnostics: Diagnostic[] = [];
    const tableContracts: RuntimeTableContract[] = [
      {
        id: 'scenario-late-war::blindSchedule.levels',
        assetId: 'scenario-late-war',
        tablePath: 'blindSchedule.levels',
        fields: [{ field: 'smallBlind', type: 'int' }],
      },
    ];

    const resolved = resolveScenarioTableRefsInDoc(baseDoc(), {
      selectedScenarioAssetId: 'scenario-late-war',
      tableContracts,
      diagnostics,
    });

    assert.deepEqual(diagnostics, []);
    const serialized = JSON.stringify(resolved.actions);
    assert.equal(serialized.includes('scenario-late-war::blindSchedule.levels'), true);
    assert.equal(serialized.includes('"tableId":"blindSchedule.levels"'), false);
  });

  it('emits deterministic diagnostics for legacy scenario-id literals', () => {
    const diagnostics: Diagnostic[] = [];
    const withLegacyLiteral = baseDoc('scenario-late-war::blindSchedule.levels');

    const resolved = resolveScenarioTableRefsInDoc(withLegacyLiteral, {
      selectedScenarioAssetId: 'scenario-late-war',
      tableContracts: [],
      diagnostics,
    });

    const serialized = JSON.stringify(resolved.actions);
    assert.equal(serialized.includes('scenario-late-war::blindSchedule.levels'), true);
    assert.equal(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_TABLE_REF_LEGACY_LITERAL' &&
          diagnostic.path === 'doc.actions.0.effects.0.forEach.over.tableId',
      ),
      true,
    );
  });

  it('emits deterministic diagnostics when a scenario-relative table path is unknown', () => {
    const diagnostics: Diagnostic[] = [];
    const tableContracts: RuntimeTableContract[] = [
      {
        id: 'scenario-late-war::settings.blindSchedule',
        assetId: 'scenario-late-war',
        tablePath: 'settings.blindSchedule',
        fields: [{ field: 'smallBlind', type: 'int' }],
      },
    ];

    resolveScenarioTableRefsInDoc(baseDoc(), {
      selectedScenarioAssetId: 'scenario-late-war',
      tableContracts,
      diagnostics,
    });

    assert.equal(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_TABLE_REF_PATH_UNKNOWN' &&
          diagnostic.path === 'doc.actions.0.effects.0.forEach.over.tableId',
      ),
      true,
    );
  });
});
