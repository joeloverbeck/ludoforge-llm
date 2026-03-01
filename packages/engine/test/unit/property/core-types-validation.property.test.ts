import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { type GameDef, GameDefSchema, validateGameDef } from '../../../src/kernel/index.js';
import { readGameDefFixture } from '../../helpers/gamedef-fixtures.js';

const parseRoundTrip = (def: GameDef): unknown => JSON.parse(JSON.stringify(def));

describe('core-types validation property-style checks', () => {
  it('JSON stringify/parse round-trip preserves Zod validity for valid defs', () => {
    const base = readGameDefFixture('minimal-valid.json');

    const validDefs: GameDef[] = [
      base,
      {
        ...base,
        metadata: { ...base.metadata, id: 'fixture-minimal-2' },
      },
      {
        ...base,
        constants: { bonus: 1 },
      },
    ];

    validDefs.forEach((def) => {
      const parsedBefore = GameDefSchema.safeParse(def);
      assert.equal(parsedBefore.success, true);

      const roundTripped = parseRoundTrip(def);
      const parsedAfter = GameDefSchema.safeParse(roundTripped);
      assert.equal(parsedAfter.success, true);
    });
  });

  it('every emitted diagnostic has non-empty code, path, and message', () => {
    const invalidDef = readGameDefFixture('invalid-reference.json');
    const diagnostics = validateGameDef(invalidDef);

    assert.ok(diagnostics.length > 0);

    diagnostics.forEach((diag) => {
      assert.equal(diag.code.trim().length > 0, true);
      assert.equal(diag.path.trim().length > 0, true);
      assert.equal(diag.message.trim().length > 0, true);
    });
  });

  it('validateGameDef output is deterministic for repeated evaluation of same input', () => {
    const invalidDef = readGameDefFixture('invalid-reference.json');
    const first = validateGameDef(invalidDef);

    for (let run = 0; run < 10; run += 1) {
      const next = validateGameDef(invalidDef);
      assert.deepEqual(next, first);
    }
  });
});
