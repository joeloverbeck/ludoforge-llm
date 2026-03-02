import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { selectDataAssetById } from '../../src/cnl/data-asset-selection.js';

describe('selectDataAssetById', () => {
  it('selects explicit id using normalized matching', () => {
    const result = selectDataAssetById([{ id: 'seat-a' }, { id: 'seat-b' }], ' seat-b ');
    assert.equal(result.selected?.id, 'seat-b');
    assert.equal(result.failureReason, undefined);
  });

  it('returns missing-reference for unknown explicit id', () => {
    const result = selectDataAssetById([{ id: 'seat-a' }, { id: 'seat-b' }], 'seat-c');
    assert.equal(result.selected, undefined);
    assert.equal(result.failureReason, 'missing-reference');
    assert.deepEqual(result.alternatives, ['seat-a', 'seat-b']);
  });

  it('infers singleton when selector is omitted', () => {
    const result = selectDataAssetById([{ id: 'seat-a' }], undefined);
    assert.equal(result.selected?.id, 'seat-a');
    assert.equal(result.failureReason, undefined);
  });

  it('returns ambiguous-selection when selector is omitted and multiple assets exist', () => {
    const result = selectDataAssetById([{ id: 'seat-a' }, { id: 'seat-b' }], undefined);
    assert.equal(result.selected, undefined);
    assert.equal(result.failureReason, 'ambiguous-selection');
    assert.deepEqual(result.alternatives, ['seat-a', 'seat-b']);
  });

  it('supports custom id getter', () => {
    const result = selectDataAssetById(
      [{ entityId: 'scenario-a' }, { entityId: 'scenario-b' }],
      'scenario-a',
      { getId: (asset) => asset.entityId },
    );
    assert.equal(result.selected?.entityId, 'scenario-a');
    assert.equal(result.failureReason, undefined);
  });
});
