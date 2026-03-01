import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  TOKEN_FILTER_INTRINSIC_PROPS,
  isAllowedTokenFilterProp,
  isIntrinsicTokenFilterProp,
  tokenFilterPropAlternatives,
} from '../../src/contracts/token-filter-prop-contract.js';

describe('token-filter prop contract', () => {
  it('treats id as an intrinsic token-filter prop', () => {
    assert.deepEqual(TOKEN_FILTER_INTRINSIC_PROPS, ['id']);
    assert.equal(isIntrinsicTokenFilterProp('id'), true);
    assert.equal(isIntrinsicTokenFilterProp('faction'), false);
  });

  it('allows intrinsic and declared props while rejecting undeclared props', () => {
    const declaredProps = ['faction', 'type'];

    assert.equal(isAllowedTokenFilterProp('id', declaredProps), true);
    assert.equal(isAllowedTokenFilterProp('faction', declaredProps), true);
    assert.equal(isAllowedTokenFilterProp('unknown', declaredProps), false);
    assert.equal(isAllowedTokenFilterProp('faction'), false);
  });

  it('returns deterministic sorted alternatives without duplicates', () => {
    assert.deepEqual(tokenFilterPropAlternatives(['type', 'id', 'faction', 'type']), ['faction', 'id', 'type']);
    assert.deepEqual(tokenFilterPropAlternatives(), ['id']);
  });
});
