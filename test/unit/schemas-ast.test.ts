import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ConditionAST, EffectAST, OptionsQuery, PlayerSel } from '../../src/kernel/index.js';

import {
  ConditionASTSchema,
  EffectASTSchema,
  OBJECT_STRICTNESS_POLICY,
  OptionsQuerySchema,
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
      { setTokenProp: { token: '$unit', prop: 'activity', value: 'active' } },
      {
        rollRandom: {
          bind: '$die',
          min: 1,
          max: 6,
          in: [{ setVar: { scope: 'global', var: 'roll', value: { ref: 'binding', name: '$die' } } }],
        },
      },
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
        removeByPriority: {
          budget: 3,
          groups: [
            {
              bind: '$tok',
              over: { query: 'tokensInZone', zone: 'board:none' },
              to: { zoneExpr: { concat: ['available-', { ref: 'tokenProp', token: '$tok', prop: 'faction' }, ':none'] } },
              countBind: '$removed',
            },
          ],
          remainingBind: '$remaining',
          in: [{ setVar: { scope: 'global', var: 'seen', value: { ref: 'binding', name: '$removed' } } }],
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
      { chooseN: { bind: '$opt', options: { query: 'players' }, max: 2 } },
      { chooseN: { bind: '$range', options: { query: 'players' }, min: 1, max: 3 } },
      { setMarker: { space: 'saigon:none', marker: 'support', state: 'activeSupport' } },
      { shiftMarker: { space: 'saigon:none', marker: 'support', delta: 1 } },
    ];

    for (const effect of effects) {
      assert.deepEqual(EffectASTSchema.parse(effect), effect);
    }
  });

  it('parses spatial ConditionAST variants', () => {
    const conditions: ConditionAST[] = [
      { op: 'adjacent', left: 'board:a', right: 'board:b' },
      {
        op: 'connected',
        from: 'board:a',
        to: 'board:c',
        via: { op: 'not', arg: { op: '==', left: 1, right: 2 } },
        maxDepth: 3,
      },
      { op: 'connected', from: 'board:a', to: 'board:c' },
    ];

    for (const condition of conditions) {
      assert.deepEqual(ConditionASTSchema.parse(condition), condition);
    }
  });

  it('parses connectedZones query with traversal options', () => {
    const queries: OptionsQuery[] = [
      { query: 'connectedZones', zone: 'board:a' },
      { query: 'connectedZones', zone: 'board:a', includeStart: true },
      { query: 'connectedZones', zone: 'board:a', maxDepth: 2 },
      {
        query: 'connectedZones',
        zone: 'board:a',
        via: { op: 'adjacent', left: 'board:a', right: 'board:b' },
        includeStart: false,
        maxDepth: 4,
      },
    ];

    for (const query of queries) {
      assert.deepEqual(OptionsQuerySchema.parse(query), query);
    }
  });

  it('parses tokensInZone query with and without filter', () => {
    const queries: OptionsQuery[] = [
      { query: 'tokensInZone', zone: 'board:a' },
      { query: 'tokensInZone', zone: 'board:a', filter: [{ prop: 'faction', op: 'eq', value: 'US' }] },
      { query: 'tokensInZone', zone: 'board:a', filter: [{ prop: 'faction', op: 'neq', value: 'NVA' }] },
      { query: 'tokensInZone', zone: 'board:a', filter: [{ prop: 'faction', op: 'in', value: ['US', 'ARVN'] }] },
      { query: 'tokensInZone', zone: 'board:a', filter: [{ prop: 'faction', op: 'notIn', value: ['NVA', 'VC'] }] },
    ];

    for (const query of queries) {
      assert.deepEqual(OptionsQuerySchema.parse(query), query);
    }
  });

  it('parses tokensInZone query with compound filter (multiple predicates)', () => {
    const query: OptionsQuery = {
      query: 'tokensInZone',
      zone: 'board:a',
      filter: [
        { prop: 'faction', op: 'eq', value: 'NVA' },
        { prop: 'type', op: 'eq', value: 'troops' },
      ],
    };
    assert.deepEqual(OptionsQuerySchema.parse(query), query);
  });

  it('parses binding query', () => {
    const query: OptionsQuery = { query: 'binding', name: 'targetSpaces' };
    assert.deepEqual(OptionsQuerySchema.parse(query), query);
  });

  it('rejects malformed tokensInZone filter payloads', () => {
    const badOp = OptionsQuerySchema.safeParse({
      query: 'tokensInZone',
      zone: 'board:a',
      filter: [{ prop: 'faction', op: 'contains', value: 'US' }],
    });
    assert.equal(badOp.success, false);

    const missingProp = OptionsQuerySchema.safeParse({
      query: 'tokensInZone',
      zone: 'board:a',
      filter: [{ op: 'eq', value: 'US' }],
    });
    assert.equal(missingProp.success, false);

    const extraField = OptionsQuerySchema.safeParse({
      query: 'tokensInZone',
      zone: 'board:a',
      filter: [{ prop: 'faction', op: 'eq', value: 'US', extra: true }],
    });
    assert.equal(extraField.success, false);

    const notArray = OptionsQuerySchema.safeParse({
      query: 'tokensInZone',
      zone: 'board:a',
      filter: { prop: 'faction', op: 'eq', value: 'US' },
    });
    assert.equal(notArray.success, false);
  });

  it('rejects invalid effect discriminants with a nested path', () => {
    const result = EffectASTSchema.safeParse({
      setVar: { scope: 'invalid', var: 'gold', value: 1 },
    });

    assert.equal(result.success, false);
    const paths = result.error.issues.flatMap((issue) => collectIssuePaths(issue));
    assert.ok(paths.includes('setVar.scope'));
  });

  it('rejects chooseN payloads that mix exact and range cardinality', () => {
    const result = EffectASTSchema.safeParse({
      chooseN: {
        bind: '$pick',
        options: { query: 'players' },
        n: 1,
        max: 2,
      },
    });

    assert.equal(result.success, false);
  });

  it('rejects malformed spatial ConditionAST payloads', () => {
    const badAdjacent = ConditionASTSchema.safeParse({ op: 'adjacent', left: 'board:a', to: 'board:b' });
    assert.equal(badAdjacent.success, false);

    const badConnected = ConditionASTSchema.safeParse({ op: 'connected', from: 'board:a', right: 'board:b' });
    assert.equal(badConnected.success, false);
  });

  it('rejects malformed connectedZones traversal option payloads', () => {
    const wrongType = OptionsQuerySchema.safeParse({
      query: 'connectedZones',
      zone: 'board:a',
      includeStart: 'yes',
      maxDepth: '2',
    });
    assert.equal(wrongType.success, false);

    const wrongField = OptionsQuerySchema.safeParse({
      query: 'connectedZones',
      zone: 'board:a',
      includeStartAtDepth: 1,
    });
    assert.equal(wrongField.success, false);
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
