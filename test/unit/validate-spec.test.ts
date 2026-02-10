import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createEmptyGameSpecDoc } from '../../src/cnl/game-spec-doc.js';
import { validateGameSpec } from '../../src/cnl/validate-spec.js';

describe('validateGameSpec API shape', () => {
  it('returns diagnostics array and stays total for empty docs', () => {
    const diagnostics = validateGameSpec(createEmptyGameSpecDoc());
    assert.deepEqual(diagnostics, []);
  });

  it('accepts optional sourceMap argument', () => {
    const diagnostics = validateGameSpec(createEmptyGameSpecDoc(), { sourceMap: { byPath: {} } });
    assert.deepEqual(diagnostics, []);
  });

  it('does not throw for malformed pre-compilation content', () => {
    assert.doesNotThrow(() =>
      validateGameSpec({
        ...createEmptyGameSpecDoc(),
        metadata: { id: '', players: { min: Number.NaN, max: Number.NaN } },
      }),
    );
  });
});
