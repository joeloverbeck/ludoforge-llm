// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { normalizeAgentDescriptor, parseAgentDescriptor, parseAgentSpec } from '../../../src/agents/factory.js';

describe('agent factory descriptors', () => {
  it('normalizes policy descriptors without changing the supported shape', () => {
    assert.deepEqual(normalizeAgentDescriptor({ kind: 'policy' }), { kind: 'policy' });
    assert.deepEqual(normalizeAgentDescriptor({ kind: 'policy', profileId: ' baseline ' }), {
      kind: 'policy',
      profileId: 'baseline',
    });
  });

  it('rejects legacy builtin descriptors during parse and normalization', () => {
    assert.throws(() => parseAgentDescriptor('builtin:random'), /Legacy builtin agent descriptors are no longer supported/);
    assert.throws(
      () => normalizeAgentDescriptor({ kind: 'builtin', builtinId: 'random' } as never),
      /Legacy builtin agent descriptors are no longer supported/,
    );
  });

  it('keeps parseAgentSpec policy-only across multi-seat specs', () => {
    assert.deepEqual(parseAgentSpec('policy, policy:baseline', 2), [
      { kind: 'policy' },
      { kind: 'policy', profileId: 'baseline' },
    ]);
  });

  it('rejects unknown descriptor formats with policy-only guidance', () => {
    assert.throws(
      () => parseAgentDescriptor('greedy'),
      /Unknown agent descriptor: greedy\. Allowed forms: policy, policy:<profileId>/,
    );
  });
});
