import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  collectBinderPathCandidates,
  collectDeclaredBinderCandidatesFromEffectNode,
  collectStringSitesAtBinderPath,
  rewriteStringLeavesAtBinderPath,
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

  it('collects string sites at wildcard and nested array paths', () => {
    const sites: Array<{ path: string; value: string }> = [];
    collectStringSitesAtBinderPath(
      {
        groups: [
          { bind: '$first', nested: [{ bind: '$firstNested' }] },
          { bind: '$second', nested: [{ bind: '$secondNested' }, { bind: 1 }] },
        ],
      },
      ['groups', '*', 'nested', '*', 'bind'],
      'removeByPriority',
      sites,
    );

    assert.deepEqual(sites, [
      { path: 'removeByPriority.groups.0.nested.0.bind', value: '$firstNested' },
      { path: 'removeByPriority.groups.1.nested.0.bind', value: '$secondNested' },
    ]);
  });

  it('rewrites string leaves at wildcard paths and reports change status', () => {
    const input = {
      groups: [
        { bind: '$first' },
        { bind: '$second' },
        { bind: 7 },
      ],
    };

    const changed = rewriteStringLeavesAtBinderPath(input, ['groups', '*', 'bind'], (value) => `${value}_renamed`);

    assert.equal(changed, true);
    assert.deepEqual(input, {
      groups: [
        { bind: '$first_renamed' },
        { bind: '$second_renamed' },
        { bind: 7 },
      ],
    });
  });

  it('does not mutate nodes when a rewrite is a no-op', () => {
    const input = {
      groups: [{ bind: '$first' }],
    };
    const snapshot = structuredClone(input);

    const changed = rewriteStringLeavesAtBinderPath(input, ['groups', '*', 'bind'], (value) => value);

    assert.equal(changed, false);
    assert.deepEqual(input, snapshot);
  });
});
