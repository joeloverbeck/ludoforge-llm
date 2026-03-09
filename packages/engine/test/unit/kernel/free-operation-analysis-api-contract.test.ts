import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import * as kernel from '../../../src/kernel/index.js';

describe('free-operation analysis API contract', () => {
  it('keeps internal free-operation authorizer helpers out of kernel public API', () => {
    const api = kernel as unknown as Record<string, unknown>;

    assert.equal(typeof api.resolveFreeOperationDiscoveryAnalysis, 'function');
    assert.equal(typeof api.isFreeOperationApplicableForMove, 'function');
    assert.equal(typeof api.isFreeOperationAllowedDuringMonsoonForMove, 'function');
    assert.equal(typeof api.isFreeOperationGrantedForMove, 'function');
    assert.equal('doesGrantAuthorizeMove' in api, false);
    assert.equal('explainFreeOperationBlockForMove' in api, false);
    assert.equal('resolveFreeOperationExecutionPlayer' in api, false);
    assert.equal('resolveFreeOperationZoneFilter' in api, false);
  });
});
