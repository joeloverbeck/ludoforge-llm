import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asZoneId,
  buildRuntimeTableIndex,
  planAssetRowsLookup,
  type GameDef,
} from '../../src/kernel/index.js';

const makeDef = (): GameDef => ({
  metadata: { id: 'runtime-table-lookup-plan-test', players: { min: 1, max: 2 } },
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

function makeKeyIndexesByTuple() {
  const def: GameDef = {
    ...makeDef(),
    runtimeDataAssets: [
      {
        id: 'asset',
        kind: 'scenario',
        payload: {
          rows: [
            { level: 1, phase: 'early', smallBlind: 10 },
            { level: 1, phase: 'early', smallBlind: 15 },
            { level: 2, phase: 'mid', smallBlind: 20 },
          ],
        },
      },
    ],
    tableContracts: [
      {
        id: 'asset::rows',
        assetId: 'asset',
        tablePath: 'rows',
        fields: [
          { field: 'level', type: 'int' },
          { field: 'phase', type: 'string' },
          { field: 'smallBlind', type: 'int' },
        ],
        uniqueBy: [['level'], ['level', 'phase']],
      },
    ],
  };
  const entry = buildRuntimeTableIndex(def).tablesById.get('asset::rows');
  assert.ok(entry);
  assert.ok(entry.rows);
  return {
    rows: entry.rows,
    keyIndexesByTuple: entry.keyIndexesByTuple,
  };
}

describe('runtime table lookup plan', () => {
  it('uses indexed strategy when predicates constrain a declared uniqueBy tuple with eq scalars', () => {
    const { rows, keyIndexesByTuple } = makeKeyIndexesByTuple();
    const predicates = [{ field: 'level', op: 'eq', value: 2 }] as const;

    const result = planAssetRowsLookup(predicates, keyIndexesByTuple, rows);
    assert.equal(result.plan.strategy, 'indexed');
    assert.equal(result.plan.reason, 'tupleEqMatch');
    assert.deepEqual(result.plan.tuple, ['level']);
    assert.equal(result.plan.candidateCount, 1);
    assert.deepEqual(result.candidates.map((row) => row.level), [2]);
  });

  it('falls back to scan strategy when no tuple is fully constrained by eq predicates', () => {
    const { rows, keyIndexesByTuple } = makeKeyIndexesByTuple();
    const predicates = [{ field: 'level', op: 'in', value: [1] }] as const;

    const result = planAssetRowsLookup(predicates, keyIndexesByTuple, rows);
    assert.equal(result.plan.strategy, 'scan');
    assert.equal(result.plan.reason, 'noTupleEqMatch');
    assert.equal(result.plan.candidateCount, rows.length);
    assert.deepEqual(result.candidates, rows);
  });

  it('uses indexed empty-candidate strategy for conflicting eq constraints on the same field', () => {
    const { rows, keyIndexesByTuple } = makeKeyIndexesByTuple();
    const predicates = [
      { field: 'level', op: 'eq', value: 1 },
      { field: 'level', op: 'eq', value: 2 },
    ] as const;

    const result = planAssetRowsLookup(predicates, keyIndexesByTuple, rows);
    assert.equal(result.plan.strategy, 'indexed');
    assert.equal(result.plan.reason, 'conflictingEqConstraints');
    assert.equal(result.plan.candidateCount, 0);
    assert.deepEqual(result.candidates, []);
  });
});
