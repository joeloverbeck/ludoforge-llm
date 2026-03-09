import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { collectSequenceContextLinkageGrantReference } from '../../../src/kernel/sequence-context-linkage-grant-reference.js';

describe('sequence-context linkage grant reference extraction', () => {
  it('returns null when sequence metadata is missing or invalid', () => {
    assert.equal(
      collectSequenceContextLinkageGrantReference(
        {
          sequenceContext: { captureMoveZoneCandidatesAs: 'selected-space' },
        },
        'grants[0]',
      ),
      null,
    );
    assert.equal(
      collectSequenceContextLinkageGrantReference(
        {
          sequence: { chain: 'ctx-chain', step: -1 },
          sequenceContext: { captureMoveZoneCandidatesAs: 'selected-space' },
        },
        'grants[1]',
      ),
      null,
    );
  });

  it('returns null when sequenceContext is missing or declares no capture/require keys', () => {
    assert.equal(
      collectSequenceContextLinkageGrantReference(
        {
          sequence: { chain: 'ctx-chain', step: 0 },
        },
        'grants[0]',
      ),
      null,
    );
    assert.equal(
      collectSequenceContextLinkageGrantReference(
        {
          sequence: { chain: 'ctx-chain', step: 0 },
          sequenceContext: {},
        },
        'grants[1]',
      ),
      null,
    );
  });

  it('extracts capture and require references without changing their path metadata', () => {
    assert.deepEqual(
      collectSequenceContextLinkageGrantReference(
        {
          sequence: { chain: 'ctx-chain', step: 0 },
          sequenceContext: { captureMoveZoneCandidatesAs: 'selected-space' },
        },
        'grants[0]',
      ),
      {
        chain: 'ctx-chain',
        step: 0,
        path: 'grants[0]',
        captureKey: 'selected-space',
      },
    );
    assert.deepEqual(
      collectSequenceContextLinkageGrantReference(
        {
          sequence: { chain: 'ctx-chain', step: 1 },
          sequenceContext: { requireMoveZoneCandidatesFrom: 'selected-space' },
        },
        'grants[1]',
      ),
      {
        chain: 'ctx-chain',
        step: 1,
        path: 'grants[1]',
        requireKey: 'selected-space',
      },
    );
  });
});
