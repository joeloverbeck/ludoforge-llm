// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CNL_COMPILER_DIAGNOSTIC_CODES } from '../../../src/cnl/compiler-diagnostic-codes.js';
import { compilePreviewInner } from './preview-inner-test-helpers.js';

const DEEP_COST_CODE = CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_DEEP_COST_EXCEEDS_CAP_CLASS;

describe('compile continued-deepening preview.inner cost', () => {
  it('rejects a continued-deepening config over the selected cap class', () => {
    const result = compilePreviewInner({
      chooseNStep: true,
      maxOptions: 8,
      chooseNBeamWidth: 2,
      depthCap: 4,
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

    const diagnostic = result.diagnostics.find((entry) => entry.code === DEEP_COST_CODE);
    assert.equal(diagnostic?.path, 'doc.agents.profiles.baseline.preview.inner.continuedDeepening');
    assert.match(diagnostic?.message ?? '', /totalCost 1928/u);
    assert.match(diagnostic?.message ?? '', /M=8/u);
    assert.match(diagnostic?.message ?? '', /B=2/u);
    assert.match(diagnostic?.message ?? '', /I=8/u);
    assert.match(diagnostic?.message ?? '', /Db=4/u);
    assert.match(diagnostic?.message ?? '', /Dd=16/u);
    assert.match(diagnostic?.message ?? '', /broadCost=392/u);
    assert.match(diagnostic?.message ?? '', /incrementalDeepCost=1536/u);
    assert.match(diagnostic?.message ?? '', /capClass deep1024/u);
    assert.match(diagnostic?.message ?? '', /breachAmount=904/u);
    assert.equal(result.gameDef, null);
  });

  it('lowers the ARVN-like deep1024 config inside the cap-class budget', () => {
    const result = compilePreviewInner({
      chooseNStep: true,
      maxOptions: 8,
      chooseNBeamWidth: 1,
      depthCap: 4,
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

    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
    assert.deepEqual(result.gameDef?.agents?.profiles.baseline?.preview.inner, {
      chooseOne: false,
      chooseNStep: true,
      maxOptions: 8,
      chooseNBeamWidth: 1,
      depthCap: 4,
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
  });
});

