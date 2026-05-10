// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CNL_COMPILER_DIAGNOSTIC_CODES } from '../../../src/cnl/compiler-diagnostic-codes.js';
import { compilePreviewInner } from './preview-inner-test-helpers.js';

const MISMATCH_CODE = CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_DEPTHCAP_MISMATCH;

describe('compile continued-deepening preview.inner depth cap consistency', () => {
  it('rejects top-level depthCap that does not match broad.depthCap', () => {
    const result = compilePreviewInner({
      chooseNStep: true,
      maxOptions: 8,
      chooseNBeamWidth: 1,
      depthCap: 5,
      strategy: 'continuedDeepening',
      capClass: 'deep1024',
      continuedDeepening: {
        broad: { depthCap: 4 },
        deep: {
          depthCap: 16,
          trigger: ['allRequestedRefsDepthCapped'],
          rootPolicy: 'allRootsWithinCap',
        },
      },
    });

    const diagnostic = result.diagnostics.find((entry) => entry.code === MISMATCH_CODE);
    assert.equal(diagnostic?.path, 'doc.agents.profiles.baseline.preview.inner.depthCap');
    assert.match(diagnostic?.message ?? '', /depthCap 5/u);
    assert.match(diagnostic?.message ?? '', /broad\.depthCap 4/u);
    assert.equal(result.gameDef, null);
  });
});

