import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import * as kernel from '../../../src/kernel/index.js';

describe('free-operation analysis API contract', () => {
  it('exports only canonical free-operation discovery analysis API', () => {
    const api = kernel as unknown as Record<string, unknown>;

    assert.equal(typeof api.resolveFreeOperationDiscoveryAnalysis, 'function');
    assert.equal('explainFreeOperationBlockForMove' in api, false);
    assert.equal('resolveFreeOperationExecutionPlayer' in api, false);
    assert.equal('resolveFreeOperationZoneFilter' in api, false);
  });
});
