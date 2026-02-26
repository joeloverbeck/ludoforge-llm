import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { composeDecisionId, extractResolvedBindFromDecisionId, scopeDecisionIdForIteration } from '../../src/kernel/decision-id.js';

describe('decision-id helpers', () => {
  it('returns internal decision ID for static binds', () => {
    assert.equal(
      composeDecisionId('decision:$choice', '$choice', '$choice'),
      'decision:$choice',
    );
  });

  it('appends resolved bind for templated binds', () => {
    assert.equal(
      composeDecisionId('decision:$choice@{$zone}', '$choice@{$zone}', '$choice@saigon:none'),
      'decision:$choice@{$zone}::$choice@saigon:none',
    );
  });

  it('returns null when extractResolvedBindFromDecisionId receives non-decision IDs', () => {
    assert.equal(extractResolvedBindFromDecisionId('not-a-decision-id'), null);
  });

  it('extracts resolved bind when separator is present', () => {
    assert.equal(
      extractResolvedBindFromDecisionId('decision:$choice@{$zone}::$choice@saigon:none'),
      '$choice@saigon:none',
    );
  });

  it('does not append iterationPath when iteration path is undefined', () => {
    assert.equal(
      scopeDecisionIdForIteration('decision:$choice', 'decision:$choice', undefined),
      'decision:$choice',
    );
  });

  it('does not append iterationPath when decision ID is already template-scoped', () => {
    assert.equal(
      scopeDecisionIdForIteration(
        'decision:$choice@{$zone}::$choice@saigon:none',
        'decision:$choice@{$zone}',
        '[0]',
      ),
      'decision:$choice@{$zone}::$choice@saigon:none',
    );
  });

  it('appends iterationPath when decision ID is static and iteration path is defined', () => {
    assert.equal(
      scopeDecisionIdForIteration('decision:$choice', 'decision:$choice', '[0]'),
      'decision:$choice[0]',
    );
  });

  it('appends nested iteration paths for nested loops', () => {
    assert.equal(
      scopeDecisionIdForIteration('decision:$choice', 'decision:$choice', '[0][1]'),
      'decision:$choice[0][1]',
    );
  });
});
