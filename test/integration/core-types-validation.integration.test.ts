import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  deserializeTrace,
  type GameDef,
  GameDefSchema,
  serializeTrace,
  type SerializedGameTrace,
  validateGameDef,
} from '../../src/kernel/index.js';

const readGameDefFixture = (name: string): GameDef => {
  const raw = readFileSync(join(process.cwd(), 'test', 'fixtures', 'gamedef', name), 'utf8');
  return JSON.parse(raw) as GameDef;
};

const readSerializedTraceFixture = (name: string): SerializedGameTrace => {
  const raw = readFileSync(join(process.cwd(), 'test', 'fixtures', 'trace', name), 'utf8');
  return JSON.parse(raw) as SerializedGameTrace;
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

  it('round-trips serialized traces deterministically through serde codecs', () => {
    const serializedTrace = readSerializedTraceFixture('valid-serialized-trace.json');
    const roundTripped = serializeTrace(deserializeTrace(serializedTrace));
    assert.deepEqual(roundTripped, serializedTrace);
  });
});
