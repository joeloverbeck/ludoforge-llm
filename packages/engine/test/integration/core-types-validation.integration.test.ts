import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  deserializeTrace,
  type GameDef,
  GameDefSchema,
  serializeTrace,
  type SerializedGameTrace,
  validateGameDef,
} from '../../src/kernel/index.js';
import { readFixtureJson } from '../helpers/fixture-reader.js';
import { createValidGameDef, readGameDefFixture } from '../helpers/gamedef-fixtures.js';

const readSerializedTraceFixture = (name: string): SerializedGameTrace => {
  return readFixtureJson<SerializedGameTrace>(`trace/${name}`);
};

describe('core-types validation integration', () => {
  it('accepts a realistic valid game def through Zod + semantic validation', () => {
    const def = readGameDefFixture('minimal-valid.json');

    const parsed = GameDefSchema.safeParse(def);
    assert.equal(parsed.success, true);

    const diagnostics = validateGameDef(def);
    assert.deepEqual(diagnostics, []);
  });

  it('accumulates multiple semantic diagnostics for one invalid game def', () => {
    const def = readGameDefFixture('invalid-reference.json');

    const parsed = GameDefSchema.safeParse(def);
    assert.equal(parsed.success, true);

    const diagnostics = validateGameDef(def);
    assert.ok(diagnostics.length >= 2);
    assert.ok(diagnostics.some((diag) => diag.code === 'REF_PHASE_MISSING'));
    assert.ok(diagnostics.some((diag) => diag.code === 'REF_GVAR_MISSING'));
    assert.ok(diagnostics.some((diag) => diag.code === 'REF_ZONE_MISSING'));
    assert.ok(diagnostics.some((diag) => diag.code === 'REF_ACTION_MISSING'));
  });

  it('suppresses secondary choose-options runtime-shape diagnostics when options query validation already fails', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          effects: [
            {
              chooseOne: {
                bind: '$row',
                options: { query: 'assetRows', tableId: 'missing-table' },
              },
            },
            {
              chooseN: {
                bind: '$rows',
                options: { query: 'assetRows', tableId: 'missing-table' },
                max: 1,
              },
            },
          ],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some(
        (diag) =>
          diag.code === 'REF_RUNTIME_TABLE_MISSING'
          && diag.path === 'actions[0].effects[0].chooseOne.options.tableId'
          && diag.severity === 'error',
      ),
      true,
    );
    assert.equal(
      diagnostics.some(
        (diag) =>
          diag.code === 'REF_RUNTIME_TABLE_MISSING'
          && diag.path === 'actions[0].effects[1].chooseN.options.tableId'
          && diag.severity === 'error',
      ),
      true,
    );
    assert.equal(
      diagnostics.some(
        (diag) =>
          diag.code === 'EFFECT_CHOICE_OPTIONS_RUNTIME_SHAPE_INVALID'
          && diag.path === 'actions[0].effects[0].chooseOne.options',
      ),
      false,
    );
    assert.equal(
      diagnostics.some(
        (diag) =>
          diag.code === 'EFFECT_CHOICE_OPTIONS_RUNTIME_SHAPE_INVALID'
          && diag.path === 'actions[0].effects[1].chooseN.options',
      ),
      false,
    );
  });

  it('round-trips serialized traces deterministically through serde codecs', () => {
    const serializedTrace = readSerializedTraceFixture('valid-serialized-trace.json');
    const roundTripped = serializeTrace(deserializeTrace(serializedTrace));
    assert.deepEqual(roundTripped, serializedTrace);
  });
});
