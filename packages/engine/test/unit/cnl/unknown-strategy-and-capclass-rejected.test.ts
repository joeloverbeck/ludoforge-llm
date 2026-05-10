// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CNL_COMPILER_DIAGNOSTIC_CODES } from '../../../src/cnl/compiler-diagnostic-codes.js';
import { compilePreviewInner } from './preview-inner-test-helpers.js';

describe('compile preview.inner strategy and cap-class registry', () => {
  it('rejects unknown preview.inner strategy values', () => {
    const result = compilePreviewInner({
      chooseNStep: true,
      maxOptions: 8,
      chooseNBeamWidth: 1,
      depthCap: 4,
      strategy: 'deepest',
      capClass: 'deep1024',
    });

    const diagnostic = result.diagnostics.find((entry) => (
      entry.code === CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_UNKNOWN_STRATEGY
    ));
    assert.equal(diagnostic?.path, 'doc.agents.profiles.baseline.preview.inner.strategy');
    assert.match(diagnostic?.message ?? '', /singlePass or continuedDeepening/u);
    assert.match(diagnostic?.message ?? '', /deepest/u);
    assert.equal(result.gameDef, null);
  });

  it('rejects unknown preview.inner capClass values', () => {
    const result = compilePreviewInner({
      chooseNStep: true,
      maxOptions: 8,
      chooseNBeamWidth: 1,
      depthCap: 4,
      strategy: 'singlePass',
      capClass: 'deep2048',
    });

    const diagnostic = result.diagnostics.find((entry) => (
      entry.code === CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_UNKNOWN_CAP_CLASS
    ));
    assert.equal(diagnostic?.path, 'doc.agents.profiles.baseline.preview.inner.capClass');
    assert.match(diagnostic?.message ?? '', /standard256 or deep1024/u);
    assert.match(diagnostic?.message ?? '', /deep2048/u);
    assert.equal(result.gameDef, null);
  });
});

