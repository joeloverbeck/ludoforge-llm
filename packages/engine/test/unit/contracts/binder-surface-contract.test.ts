import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  collectBinderPathCandidates,
  collectDeclaredBinderCandidatesFromEffectNode,
} from '../../../src/contracts/index.js';

describe('binder surface contract collector', () => {
  it('collects declared binder candidates with effect-kind-prefixed patterns', () => {
    const effectNode = {
      forEach: {
        bind: '$item',
        countBind: '$count',
        over: { query: 'players' },
        in: [],
      },
    } as const;

    const candidates = collectDeclaredBinderCandidatesFromEffectNode(effectNode);
    assert.deepEqual(
      candidates.map((candidate) => ({ path: candidate.path, pattern: candidate.pattern, value: candidate.value })),
      [
        { path: 'forEach.bind', pattern: 'forEach.bind', value: '$item' },
        { path: 'forEach.countBind', pattern: 'forEach.countBind', value: '$count' },
      ],
    );
  });

  it('preserves wildcard contract patterns while resolving concrete array indices in candidate paths', () => {
    const effectNode = {
      removeByPriority: {
        groups: [{ bind: '$target', countBind: '$removed' }],
        remainingBind: '$remaining',
      },
    } as const;

    const candidates = collectDeclaredBinderCandidatesFromEffectNode(effectNode);
    assert.deepEqual(
      candidates.map((candidate) => ({ path: candidate.path, pattern: candidate.pattern, value: candidate.value })),
      [
        {
          path: 'removeByPriority.groups.0.bind',
          pattern: 'removeByPriority.groups.*.bind',
          value: '$target',
        },
        {
          path: 'removeByPriority.groups.0.countBind',
          pattern: 'removeByPriority.groups.*.countBind',
          value: '$removed',
        },
        {
          path: 'removeByPriority.remainingBind',
          pattern: 'removeByPriority.remainingBind',
          value: '$remaining',
        },
      ],
    );
  });

  it('supports custom base pattern prefixes for shared path traversal', () => {
    const candidates = collectBinderPathCandidates(
      { groups: [{ bind: '$x' }] },
      ['groups', '*', 'bind'],
      'removeByPriority',
      'effect.removeByPriority',
    );

    assert.deepEqual(candidates, [
      {
        path: 'removeByPriority.groups.0.bind',
        pattern: 'effect.removeByPriority.groups.*.bind',
        value: '$x',
      },
    ]);
  });
});
