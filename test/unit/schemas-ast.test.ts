import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { EffectAST, PlayerSel } from '../../src/kernel/index.js';

import {
  EffectASTSchema,
  OBJECT_STRICTNESS_POLICY,
  PlayerSelSchema,
  asPlayerId,
} from '../../src/kernel/index.js';

const collectIssuePaths = (issue: unknown): string[] => {
  if (!issue || typeof issue !== 'object') {
    return [];
  }

  const value = issue as { path?: unknown; errors?: unknown };
  const paths: string[] = [];

  if (Array.isArray(value.path)) {
    paths.push(value.path.join('.'));
  }

  if (Array.isArray(value.errors)) {
    for (const nested of value.errors) {
      if (Array.isArray(nested)) {
        for (const nestedIssue of nested) {
          paths.push(...collectIssuePaths(nestedIssue));
        }
        continue;
      }
      paths.push(...collectIssuePaths(nested));
    }
  }

  return paths;
};

describe('AST and selector schemas', () => {
  it('parses all PlayerSel variants', () => {
    const valid: PlayerSel[] = [
      'actor',
      'active',
      'all',
      'allOther',
      { id: asPlayerId(1) },
      { chosen: '$target' },
      { relative: 'left' },
    ];

    for (const sel of valid) {
      assert.deepEqual(PlayerSelSchema.parse(sel), sel);
    }
  });

  it('rejects malformed PlayerSel payloads', () => {
    const result = PlayerSelSchema.safeParse({ id: '1' });
    assert.equal(result.success, false);
  });

  it('parses all EffectAST variants', () => {
    const effects: EffectAST[] = [
      { setVar: { scope: 'global', var: 'gold', value: 1 } },
      { addVar: { scope: 'pvar', player: 'actor', var: 'vp', delta: 2 } },
      { moveToken: { token: '$card', from: 'deck:none', to: 'hand:actor', position: 'top' } },
      { moveAll: { from: 'discard:none', to: 'deck:none', filter: { op: 'not', arg: { op: '==', left: 1, right: 2 } } } },
      { moveTokenAdjacent: { token: '$unit', from: 'board:active', direction: 'north' } },
      { draw: { from: 'deck:none', to: 'hand:actor', count: 1 } },
      { shuffle: { zone: 'deck:none' } },
      { createToken: { type: 'card', zone: 'deck:none', props: { cost: 3, rare: false } } },
      { destroyToken: { token: '$dead' } },
      {
        if: {
          when: { op: 'and', args: [{ op: '==', left: 1, right: 1 }] },
          then: [{ addVar: { scope: 'global', var: 'turn', delta: 1 } }],
          else: [{ shuffle: { zone: 'deck:none' } }],
        },
      },
      {
        forEach: {
          bind: '$p',
          over: { query: 'players' },
          effects: [{ setVar: { scope: 'global', var: 'seen', value: { ref: 'binding', name: '$p' } } }],
          limit: 10,
        },
      },
      {
        let: {
          bind: '$n',
          value: { aggregate: { op: 'count', query: { query: 'tokensInZone', zone: 'deck:none' } } },
          in: [{ chooseN: { bind: '$pick', options: { query: 'players' }, n: 1 } }],
        },
      },
      { chooseOne: { bind: '$zone', options: { query: 'zones', filter: { owner: 'active' } } } },
      { chooseN: { bind: '$token', options: { query: 'tokensInAdjacentZones', zone: 'board:actor' }, n: 2 } },
    ];

    for (const effect of effects) {
      assert.deepEqual(EffectASTSchema.parse(effect), effect);
    }
  });

  it('rejects invalid effect discriminants with a nested path', () => {
    const result = EffectASTSchema.safeParse({
      setVar: { scope: 'invalid', var: 'gold', value: 1 },
    });

    assert.equal(result.success, false);
    const paths = result.error.issues.flatMap((issue) => collectIssuePaths(issue));
    assert.ok(paths.includes('setVar.scope'));
  });

  it('enforces strict object policy for selector and AST objects', () => {
    assert.equal(OBJECT_STRICTNESS_POLICY, 'strict');

    const selectorResult = PlayerSelSchema.safeParse({ chosen: '$p', extra: true });
    assert.equal(selectorResult.success, false);

    const effectResult = EffectASTSchema.safeParse({
      setVar: { scope: 'global', var: 'gold', value: 1 },
      extra: true,
    });
    assert.equal(effectResult.success, false);
  });
});
