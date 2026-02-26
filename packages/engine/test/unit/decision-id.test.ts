import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  composeScopedDecisionId,
  extractResolvedBindFromDecisionId,
} from '../../src/kernel/decision-id.js';

describe('decision-id helpers', () => {
  it('composeScopedDecisionId returns internal decision ID for static binds without iteration path', () => {
    assert.equal(
      composeScopedDecisionId('decision:$choice', '$choice', '$choice', undefined),
      'decision:$choice',
    );
  });

  it('composeScopedDecisionId appends resolved bind for templated binds', () => {
    assert.equal(
      composeScopedDecisionId(
        'decision:$choice@{$zone}',
        '$choice@{$zone}',
        '$choice@saigon:none',
        undefined,
      ),
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

  it('composeScopedDecisionId appends iterationPath for static binds', () => {
    assert.equal(
      composeScopedDecisionId('decision:$choice', '$choice', '$choice', '[0]'),
      'decision:$choice[0]',
    );
  });

  it('composeScopedDecisionId does not append iterationPath when bind is template-scoped', () => {
    assert.equal(
      composeScopedDecisionId(
        'decision:$choice@{$zone}',
        '$choice@{$zone}',
        '$choice@saigon:none',
        '[0]',
      ),
      'decision:$choice@{$zone}::$choice@saigon:none',
    );
  });

  it('composeScopedDecisionId appends nested iteration paths for static binds', () => {
    assert.equal(
      composeScopedDecisionId('decision:$choice', '$choice', '$choice', '[0][1]'),
      'decision:$choice[0][1]',
    );
  });
});
