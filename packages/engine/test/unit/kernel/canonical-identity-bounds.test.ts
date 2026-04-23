// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { toSelectionKey } from '../../../src/kernel/choose-n-selection-key.js';
import { optionKey } from '../../../src/kernel/legal-choices.js';

const buildDomainIndex = (values: readonly string[]): ReadonlyMap<string, number> => {
  const index = new Map<string, number>();
  for (let i = 0; i < values.length; i++) {
    index.set(optionKey(values[i]), i);
  }
  return index;
};

describe('canonical identity bounds', () => {
  it('keeps chooseN selection keys compact as option payloads grow', () => {
    const smallDomain = Array.from({ length: 64 }, (_, i) =>
      i === 1 || i === 63 ? `oversized_${i}_${'x'.repeat(512)}` : `opt_${i}`,
    );
    const smallDomainIndex = buildDomainIndex(smallDomain);
    const smallKey = toSelectionKey(smallDomainIndex, [smallDomain[1]!, smallDomain[63]!]);

    assert.equal(typeof smallKey, 'bigint');
    assert.equal(smallKey, (1n << 1n) | (1n << 63n));

    const largeDomain = Array.from({ length: 65 }, (_, i) =>
      i === 2 || i === 64 ? `oversized_${i}_${'y'.repeat(512)}` : `opt_${i}`,
    );
    const largeDomainIndex = buildDomainIndex(largeDomain);
    const largeKey = toSelectionKey(largeDomainIndex, [largeDomain[64]!, largeDomain[2]!]);

    assert.equal(largeKey, '2,64');
    assert.ok(largeKey.length < 16, `expected compact fallback key, received ${largeKey.length}`);
    assert.doesNotMatch(largeKey, /y{32}/, 'fallback key must not embed raw oversized option payloads');
  });
});
