// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { asTokenId } from '../../../src/kernel/branded.js';
import type { FreeOperationExecutionOverlay } from '../../../src/kernel/free-operation-overlay.js';
import { resolveTokenView, resolveTokenViewFieldValue } from '../../../src/kernel/token-view.js';
import type { Token } from '../../../src/kernel/types.js';

function makeToken(id: string, props: Token['props']): Token {
  return {
    id: asTokenId(id),
    type: 'piece',
    props,
  };
}

describe('token-view', () => {
  it('returns the canonical token when no overlay interpretation applies', () => {
    const token = makeToken('cube-1', { faction: 'ARVN', type: 'police' });

    assert.equal(resolveTokenView(token), token);
    assert.equal(resolveTokenViewFieldValue(token, 'faction'), 'ARVN');
  });

  it('materializes an overlay-adjusted token view without mutating canonical token state', () => {
    const token = makeToken('cube-2', { faction: 'ARVN', type: 'police' });
    const overlay: FreeOperationExecutionOverlay = {
      tokenInterpretations: [
        {
          when: {
            op: 'and',
            args: [
              { prop: 'faction', op: 'eq', value: 'ARVN' },
              { prop: 'type', op: 'in', value: ['troops', 'police'] },
            ],
          },
          assign: {
            faction: 'US',
            type: 'troops',
          },
        },
      ],
    };

    const viewedToken = resolveTokenView(token, overlay);

    assert.notEqual(viewedToken, token);
    assert.equal(viewedToken.props.faction, 'US');
    assert.equal(viewedToken.props.type, 'troops');
    assert.equal(token.props.faction, 'ARVN');
    assert.equal(token.props.type, 'police');
    assert.equal(resolveTokenViewFieldValue(token, 'faction', overlay), 'US');
    assert.equal(resolveTokenViewFieldValue(token, 'type', overlay), 'troops');
  });

  it('matches interpretation rules against canonical token facts so assignments do not cascade into later rule matching', () => {
    const token = makeToken('cube-3', { faction: 'ARVN', type: 'police' });
    const overlay: FreeOperationExecutionOverlay = {
      tokenInterpretations: [
        {
          when: { prop: 'faction', op: 'eq', value: 'ARVN' },
          assign: { faction: 'US' },
        },
        {
          when: { prop: 'faction', op: 'eq', value: 'US' },
          assign: { type: 'troops' },
        },
      ],
    };

    const viewedToken = resolveTokenView(token, overlay);

    assert.equal(viewedToken.props.faction, 'US');
    assert.equal(viewedToken.props.type, 'police');
  });
});
