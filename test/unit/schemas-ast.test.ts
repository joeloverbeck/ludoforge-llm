import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ConditionAST, EffectAST, OptionsQuery, PlayerSel } from '../../src/kernel/index.js';

import {
  ConditionASTSchema,
  EffectASTSchema,
  OBJECT_STRICTNESS_POLICY,
  OptionsQuerySchema,
  PlayerSelSchema,
  ValueExprSchema,
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

  it('parses arithmetic ValueExpr operators including integer division variants', () => {
    const expressions = [
      { op: '/', left: 7, right: 2 },
      { op: 'floorDiv', left: 7, right: 2 },
      { op: 'ceilDiv', left: 7, right: 2 },
    ] as const;

    for (const expression of expressions) {
      assert.deepEqual(ValueExprSchema.parse(expression), expression);
    }
  });

  it('parses reference ValueExpr variants used by dynamic zone/property logic', () => {
    const references = [
      { ref: 'tokenZone', token: '$piece' },
      { ref: 'zoneProp', zone: 'quang-tri:none', prop: 'spaceType' },
    ] as const;

    for (const reference of references) {
      assert.deepEqual(ValueExprSchema.parse(reference), reference);
    }
  });

  it('parses value-level conditional ValueExpr', () => {
    const expression = {
      if: {
        when: { op: '==', left: 1, right: 1 },
        then: 10,
        else: 0,
      },
    } as const;

    assert.deepEqual(ValueExprSchema.parse(expression), expression);
  });

  it('parses all EffectAST variants', () => {
    const effects: EffectAST[] = [
      { setVar: { scope: 'global', var: 'gold', value: 1 } },
      { addVar: { scope: 'pvar', player: 'actor', var: 'vp', delta: 2 } },
      {
        commitResource: {
          from: { scope: 'pvar', player: 'actor', var: 'coins' },
          to: { scope: 'global', var: 'pot' },
          amount: 5,
          min: 1,
          max: 10,
          actualBind: '$actual',
        },
      },
      { moveToken: { token: '$card', from: 'deck:none', to: 'hand:actor', position: 'top' } },
      {
        moveToken: {
          token: '$card',
          from: { zoneExpr: { ref: 'tokenZone', token: '$card' } },
          to: { zoneExpr: { concat: ['discard:', { ref: 'activePlayer' }] } },
        },
      },
      { moveAll: { from: 'discard:none', to: 'deck:none', filter: { op: 'not', arg: { op: '==', left: 1, right: 2 } } } },
      { moveAll: { from: { zoneExpr: 'discard:none' }, to: { zoneExpr: 'deck:none' } } },
      { moveTokenAdjacent: { token: '$unit', from: 'board:active', direction: 'north' } },
      { moveTokenAdjacent: { token: '$unit', from: { zoneExpr: 'board:active' }, direction: 'north' } },
      { draw: { from: 'deck:none', to: 'hand:actor', count: 1 } },
      { draw: { from: { zoneExpr: 'deck:none' }, to: { zoneExpr: 'hand:actor' }, count: 1 } },
      { reveal: { zone: 'hand:actor', to: 'all' } },
      {
        reveal: {
          zone: { zoneExpr: 'hand:actor' },
          to: { chosen: '$targetPlayer' },
          filter: [{ prop: 'faction', op: 'eq', value: 'US' }],
        },
      },
      { shuffle: { zone: 'deck:none' } },
      { shuffle: { zone: { zoneExpr: 'deck:none' } } },
      { createToken: { type: 'card', zone: 'deck:none', props: { cost: 3, rare: false } } },
      { createToken: { type: 'card', zone: { zoneExpr: 'deck:none' }, props: { cost: 3, rare: false } } },
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
          in: [{ chooseN: { internalDecisionId: 'decision:$pick', bind: '$pick', options: { query: 'players' }, n: 1 } }],
        },
      },
      {
        evaluateSubset: {
          source: { query: 'tokensInZone', zone: 'deck:none' },
          subsetSize: 2,
          subsetBind: '$subset',
          compute: [],
          scoreExpr: {
            aggregate: {
              op: 'sum',
              query: { query: 'binding', name: '$subset' },
              prop: 'cost',
            },
          },
          resultBind: '$score',
          bestSubsetBind: '$best',
          in: [{ setVar: { scope: 'global', var: 'bestScore', value: { ref: 'binding', name: '$score' } } }],
        },
      },
      {
        chooseOne: {
          internalDecisionId: 'decision:$zone',
          bind: '$zone',
          options: { query: 'zones', filter: { owner: 'active' } },
        },
      },
      {
        chooseN: {
          internalDecisionId: 'decision:$token',
          bind: '$token',
          options: { query: 'tokensInAdjacentZones', zone: 'board:actor' },
          n: 2,
        },
      },
      { chooseN: { internalDecisionId: 'decision:$opt', bind: '$opt', options: { query: 'players' }, max: 2 } },
      {
        chooseN: {
          internalDecisionId: 'decision:$range',
          bind: '$range',
          options: { query: 'players' },
          min: 1,
          max: 3,
        },
      },
      {
        chooseN: {
          internalDecisionId: 'decision:$dynamicRange',
          bind: '$dynamicRange',
          options: { query: 'players' },
          min: { if: { when: true, then: 0, else: 1 } },
          max: { ref: 'gvar', var: 'maxTargets' },
        },
      },
      {
        grantFreeOperation: {
          id: 'grant-vc-op',
          faction: '3',
          executeAsFaction: 'self',
          operationClass: 'limitedOperation',
          actionIds: ['operation'],
          zoneFilter: { op: '==', left: { ref: 'zoneProp', zone: '$zone', prop: 'country' }, right: 'southVietnam' },
          uses: 2,
          sequence: { chain: 'vc-ops', step: 1 },
        },
      },
      {
        gotoPhase: {
          phase: 'commitment',
        },
      },
      {
        pushInterruptPhase: {
          phase: 'commitment',
          resumePhase: 'main',
        },
      },
      {
        popInterruptPhase: {},
      },
      { setMarker: { space: 'saigon:none', marker: 'support', state: 'activeSupport' } },
      { setMarker: { space: { zoneExpr: 'saigon:none' }, marker: 'support', state: 'activeSupport' } },
      { shiftMarker: { space: 'saigon:none', marker: 'support', delta: 1 } },
      { shiftMarker: { space: { zoneExpr: 'saigon:none' }, marker: 'support', delta: 1 } },
      { setGlobalMarker: { marker: 'cap_topGun', state: 'unshaded' } },
      { flipGlobalMarker: { marker: { ref: 'binding', name: '$marker' }, stateA: 'unshaded', stateB: 'shaded' } },
      { shiftGlobalMarker: { marker: 'cap_topGun', delta: 1 } },
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
      { op: 'zonePropIncludes', zone: 'board:a', prop: 'terrainTags', value: 'jungle' },
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

  it('parses tokensInMapSpaces query with optional spaceFilter and token filter', () => {
    const queries: OptionsQuery[] = [
      { query: 'tokensInMapSpaces' },
      {
        query: 'tokensInMapSpaces',
        filter: [{ prop: 'faction', op: 'eq', value: 'VC' }],
      },
      {
        query: 'tokensInMapSpaces',
        spaceFilter: {
          condition: {
            op: '==',
            left: { ref: 'zoneProp', zone: '$zone', prop: 'country' },
            right: 'southVietnam',
          },
        },
      },
      {
        query: 'tokensInMapSpaces',
        spaceFilter: { owner: 'actor' },
        filter: [{ prop: 'type', op: 'eq', value: 'troops' }],
      },
    ];

    for (const query of queries) {
      assert.deepEqual(OptionsQuerySchema.parse(query), query);
    }
  });

  it('parses binding query', () => {
    const query: OptionsQuery = { query: 'binding', name: 'targetSpaces' };
    assert.deepEqual(OptionsQuerySchema.parse(query), query);
  });

  it('parses intsInRange query with dynamic ValueExpr bounds', () => {
    const query: OptionsQuery = {
      query: 'intsInRange',
      min: { ref: 'binding', name: '$min' },
      max: { op: '+', left: { ref: 'binding', name: '$min' }, right: 2 },
    };
    assert.deepEqual(OptionsQuerySchema.parse(query), query);
  });

  it('parses globalMarkers query with optional marker and state filters', () => {
    const queries: OptionsQuery[] = [
      { query: 'globalMarkers' },
      { query: 'globalMarkers', markers: ['cap_topGun', 'cap_migs'] },
      { query: 'globalMarkers', states: ['unshaded', 'shaded'] },
      { query: 'globalMarkers', markers: ['cap_topGun'], states: ['inactive'] },
    ];

    for (const query of queries) {
      assert.deepEqual(OptionsQuerySchema.parse(query), query);
    }
  });

  it('parses mapSpaces query with filter condition', () => {
    const query: OptionsQuery = {
      query: 'mapSpaces',
      filter: {
        condition: {
          op: '==',
          left: 'city',
          right: 'city',
        },
      },
    };
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

    const badTokensInMapSpacesFilter = OptionsQuerySchema.safeParse({
      query: 'tokensInMapSpaces',
      filter: { prop: 'faction', op: 'eq', value: 'US' },
    });
    assert.equal(badTokensInMapSpacesFilter.success, false);
  });

  it('rejects non-integer numeric literals in intsInRange bounds', () => {
    const badMin = OptionsQuerySchema.safeParse({
      query: 'intsInRange',
      min: 0.5,
      max: 3,
    });
    assert.equal(badMin.success, false);
  });

  it('rejects non-numeric expressions in numeric-only contexts', () => {
    const badIntRange = OptionsQuerySchema.safeParse({
      query: 'intsInRange',
      min: { concat: ['1'] },
      max: 3,
    });
    assert.equal(badIntRange.success, false);

    const badChooseN = EffectASTSchema.safeParse({
      chooseN: {
        internalDecisionId: 'decision:$pick',
        bind: '$pick',
        options: { query: 'enums', values: ['a', 'b'] },
        max: { concat: ['2'] },
      },
    });
    assert.equal(badChooseN.success, false);
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
        internalDecisionId: 'decision:$pick',
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
