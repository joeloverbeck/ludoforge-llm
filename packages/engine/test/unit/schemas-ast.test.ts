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
import { buildDiscriminatedEndpointMatrix } from '../helpers/transfer-endpoint-matrix.js';

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

  it('parses arithmetic ValueExpr operators including integer division and bounds variants', () => {
    const expressions = [
      { op: '/', left: 7, right: 2 },
      { op: 'floorDiv', left: 7, right: 2 },
      { op: 'ceilDiv', left: 7, right: 2 },
      { op: 'min', left: 7, right: 2 },
      { op: 'max', left: 7, right: 2 },
    ] as const;

    for (const expression of expressions) {
      assert.deepEqual(ValueExprSchema.parse(expression), expression);
    }
  });

  it('parses reference ValueExpr variants used by dynamic zone/property logic', () => {
    const references = [
      { ref: 'tokenZone', token: '$piece' },
      { ref: 'zoneProp', zone: 'quang-tri:none', prop: 'category' },
      { ref: 'assetField', row: '$blindLevel', tableId: 'tournament-standard::blindSchedule.levels', field: 'smallBlind' },
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

  describe('EffectAST schema contracts', () => {
    const cases: ReadonlyArray<{ name: string; effects: readonly EffectAST[] }> = [
      {
        name: 'variable and player state operations',
        effects: [
          { setVar: { scope: 'global', var: 'gold', value: 1 } },
          { setActivePlayer: { player: { chosen: '$targetPlayer' } } },
          { addVar: { scope: 'pvar', player: 'actor', var: 'vp', delta: 2 } },
          {
            transferVar: {
              from: { scope: 'pvar', player: 'actor', var: 'coins' },
              to: { scope: 'global', var: 'pot' },
              amount: 5,
              min: 1,
              max: 10,
              actualBind: '$actual',
            },
          },
          {
            transferVar: {
              from: { scope: 'zoneVar', zone: 'board:none', var: 'supply' },
              to: { scope: 'zoneVar', zone: 'hand:actor', var: 'supply' },
              amount: 2,
            },
          },
        ],
      },
      {
        name: 'token and zone movement operations',
        effects: [
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
          { shuffle: { zone: 'deck:none' } },
          { shuffle: { zone: { zoneExpr: 'deck:none' } } },
        ],
      },
      {
        name: 'hidden-information visibility operations',
        effects: [
          { reveal: { zone: 'hand:actor', to: 'all' } },
          {
            reveal: {
              zone: { zoneExpr: 'hand:actor' },
              to: { chosen: '$targetPlayer' },
              filter: [{ prop: 'faction', op: 'eq', value: 'US' }],
            },
          },
          { conceal: { zone: 'hand:actor' } },
          { conceal: { zone: 'hand:actor', from: 'all' } },
          { conceal: { zone: 'hand:actor', from: { id: asPlayerId(2) } } },
          { conceal: { zone: 'hand:actor', from: { chosen: '$targetPlayer' } } },
          { conceal: { zone: 'hand:actor', filter: [{ prop: 'faction', op: 'neq', value: 'US' }] } },
        ],
      },
      {
        name: 'token lifecycle and property operations',
        effects: [
          { createToken: { type: 'card', zone: 'deck:none', props: { cost: 3, rare: false } } },
          { createToken: { type: 'card', zone: { zoneExpr: 'deck:none' }, props: { cost: 3, rare: false } } },
          { destroyToken: { token: '$dead' } },
          { setTokenProp: { token: '$unit', prop: 'activity', value: 'active' } },
        ],
      },
      {
        name: 'control flow and binding operations',
        effects: [
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
            reduce: {
              itemBind: '$n',
              accBind: '$acc',
              over: { query: 'intsInRange', min: 1, max: 3 },
              initial: 0,
              next: { op: '+', left: { ref: 'binding', name: '$acc' }, right: { ref: 'binding', name: '$n' } },
              resultBind: '$sum',
              in: [{ setVar: { scope: 'global', var: 'seen', value: { ref: 'binding', name: '$sum' } } }],
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
            bindValue: {
              bind: '$score',
              value: { op: '+', left: 1, right: 2 },
            },
          },
        ],
      },
      {
        name: 'choice and search operations',
        effects: [
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
                  bind: '$token',
                  valueExpr: { ref: 'tokenProp', token: '$token', prop: 'cost' },
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
        ],
      },
      {
        name: 'priority removal and phase operations',
        effects: [
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
            grantFreeOperation: {
              id: 'grant-vc-op',
              seat: '3',
              executeAsSeat: 'self',
              operationClass: 'limitedOperation',
              actionIds: ['operation'],
              zoneFilter: { op: '==', left: { ref: 'zoneProp', zone: '$zone', prop: 'country' }, right: 'southVietnam' },
              uses: 2,
              sequence: { chain: 'vc-ops', step: 1 },
            },
          },
          {
            gotoPhaseExact: {
              phase: 'commitment',
            },
          },
          {
            advancePhase: {},
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
        ],
      },
      {
        name: 'spatial marker operations',
        effects: [
          { setMarker: { space: 'saigon:none', marker: 'support', state: 'activeSupport' } },
          { setMarker: { space: { zoneExpr: 'saigon:none' }, marker: 'support', state: 'activeSupport' } },
          { shiftMarker: { space: 'saigon:none', marker: 'support', delta: 1 } },
          { shiftMarker: { space: { zoneExpr: 'saigon:none' }, marker: 'support', delta: 1 } },
          { setGlobalMarker: { marker: 'cap_topGun', state: 'unshaded' } },
          { flipGlobalMarker: { marker: { ref: 'binding', name: '$marker' }, stateA: 'unshaded', stateB: 'shaded' } },
          { shiftGlobalMarker: { marker: 'cap_topGun', delta: 1 } },
        ],
      },
    ];

    for (const effectCase of cases) {
      it(`parses ${effectCase.name}`, () => {
        for (const effect of effectCase.effects) {
          assert.deepEqual(EffectASTSchema.parse(effect), effect);
        }
      });
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
      { query: 'connectedZones', zone: { zoneExpr: { ref: 'binding', name: '$zone' } } },
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

  it('parses adjacent spatial queries with ZoneRef selectors', () => {
    const adjacent: OptionsQuery = {
      query: 'adjacentZones',
      zone: { zoneExpr: { ref: 'binding', name: '$zone' } },
    };
    const tokensInAdjacent: OptionsQuery = {
      query: 'tokensInAdjacentZones',
      zone: { zoneExpr: { ref: 'binding', name: '$zone' } },
      filter: [{ prop: 'faction', op: 'eq', value: 'NVA' }],
    };

    assert.deepEqual(OptionsQuerySchema.parse(adjacent), adjacent);
    assert.deepEqual(OptionsQuerySchema.parse(tokensInAdjacent), tokensInAdjacent);
  });

  it('parses tokensInZone query with and without filter', () => {
    const queries: OptionsQuery[] = [
      { query: 'tokensInZone', zone: 'board:a' },
      { query: 'tokensInZone', zone: { zoneExpr: { ref: 'binding', name: '$zone' } } },
      { query: 'tokensInZone', zone: 'board:a', filter: [{ prop: 'faction', op: 'eq', value: 'US' }] },
      { query: 'tokensInZone', zone: 'board:a', filter: [{ prop: 'faction', op: 'neq', value: 'NVA' }] },
      { query: 'tokensInZone', zone: 'board:a', filter: [{ prop: 'faction', op: 'in', value: ['US', 'ARVN'] }] },
      { query: 'tokensInZone', zone: 'board:a', filter: [{ prop: 'cost', op: 'in', value: [1, 2, 3] }] },
      { query: 'tokensInZone', zone: 'board:a', filter: [{ prop: 'faction', op: 'notIn', value: ['NVA', 'VC'] }] },
      { query: 'tokensInZone', zone: 'board:a', filter: [{ prop: 'isElite', op: 'notIn', value: [true] }] },
    ];

    for (const query of queries) {
      assert.deepEqual(OptionsQuerySchema.parse(query), query);
    }
  });

  it('parses assetRows query with and without where predicates', () => {
    const queries: OptionsQuery[] = [
      { query: 'assetRows', tableId: 'tournament-standard::blindSchedule.levels' },
      { query: 'assetRows', tableId: 'tournament-standard::blindSchedule.levels', cardinality: 'exactlyOne' },
      {
        query: 'assetRows',
        tableId: 'tournament-standard::blindSchedule.levels',
        where: [
          { field: 'level', op: 'eq', value: 3 },
          { field: 'phase', op: 'in', value: ['early', 'mid'] },
          { field: 'isBreak', op: 'notIn', value: [true] },
        ],
      },
    ];

    for (const query of queries) {
      assert.deepEqual(OptionsQuerySchema.parse(query), query);
    }
  });

  it('rejects malformed assetRows where predicate shapes', () => {
    const missingField = OptionsQuerySchema.safeParse({
      query: 'assetRows',
      tableId: 'tournament-standard::blindSchedule.levels',
      where: [{ op: 'eq', value: 1 }],
    });
    assert.equal(missingField.success, false);

    const invalidSetElement = OptionsQuerySchema.safeParse({
      query: 'assetRows',
      tableId: 'tournament-standard::blindSchedule.levels',
      where: [{ field: 'phase', op: 'in', value: ['early', { bad: true }] }],
    });
    assert.equal(invalidSetElement.success, false);

    const invalidCardinality = OptionsQuerySchema.safeParse({
      query: 'assetRows',
      tableId: 'tournament-standard::blindSchedule.levels',
      cardinality: 'single',
    });
    assert.equal(invalidCardinality.success, false);
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

  it('enforces canonical bind for nextInOrderByCondition query', () => {
    const valid: OptionsQuery = {
      query: 'nextInOrderByCondition',
                source: { query: 'players' },
                from: 1,
      bind: '$seatCandidate',
      where: { op: '==', left: { ref: 'binding', name: '$seatCandidate' }, right: 1 },
    };
    assert.deepEqual(OptionsQuerySchema.parse(valid), valid);

    const nonCanonical = OptionsQuerySchema.safeParse({
      query: 'nextInOrderByCondition',
                source: { query: 'players' },
                from: 1,
      bind: 'seatCandidate',
      where: { op: '==', left: { ref: 'binding', name: '$seatCandidate' }, right: 1 },
    });
    assert.equal(nonCanonical.success, false);

    const whitespaceOnly = OptionsQuerySchema.safeParse({
      query: 'nextInOrderByCondition',
                source: { query: 'players' },
                from: 1,
      bind: '   ',
      where: { op: '==', left: { ref: 'binding', name: '$seatCandidate' }, right: 1 },
    });
    assert.equal(whitespaceOnly.success, false);

    const missingSource = OptionsQuerySchema.safeParse({
      query: 'nextInOrderByCondition',
                from: 1,
      bind: '$seatCandidate',
      where: { op: '==', left: { ref: 'binding', name: '$seatCandidate' }, right: 1 },
    });
    assert.equal(missingSource.success, false);
  });

  it('parses binding query', () => {
    const query: OptionsQuery = { query: 'binding', name: 'targetSpaces' };
    assert.deepEqual(OptionsQuerySchema.parse(query), query);
  });

  it('parses concat query with non-empty nested sources', () => {
    const query: OptionsQuery = {
      query: 'concat',
      sources: [
        { query: 'tokensInZone', zone: 'board:a' },
        { query: 'enums', values: ['wild', 'joker'] },
      ],
    };
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

    const malformedZoneRef = OptionsQuerySchema.safeParse({
      query: 'tokensInZone',
      zone: { zoneExpr: 'board:a', extra: true },
    });
    assert.equal(malformedZoneRef.success, false);

    const badTokensInMapSpacesFilter = OptionsQuerySchema.safeParse({
      query: 'tokensInMapSpaces',
      filter: { prop: 'faction', op: 'eq', value: 'US' },
    });
    assert.equal(badTokensInMapSpacesFilter.success, false);

    const emptyConcat = OptionsQuerySchema.safeParse({
      query: 'concat',
      sources: [],
    });
    assert.equal(emptyConcat.success, false);
  });

  it('rejects non-integer numeric literals in intsInRange bounds', () => {
    const badMin = OptionsQuerySchema.safeParse({
      query: 'intsInRange',
      min: 0.5,
      max: 3,
    });
    assert.equal(badMin.success, false);
  });

  it('accepts intsInRange optional cardinality controls', () => {
    const parsed = OptionsQuerySchema.safeParse({
      query: 'intsInRange',
      min: 1,
      max: 20,
      step: 3,
      alwaysInclude: [2, { ref: 'binding', name: '$n' }],
      maxResults: 7,
    });
    assert.equal(parsed.success, true);
  });

  it('rejects non-integer numeric literals in intsInRange step/maxResults/alwaysInclude', () => {
    const badStep = OptionsQuerySchema.safeParse({
      query: 'intsInRange',
      min: 1,
      max: 20,
      step: 1.5,
    });
    assert.equal(badStep.success, false);

    const badMaxResults = OptionsQuerySchema.safeParse({
      query: 'intsInRange',
      min: 1,
      max: 20,
      maxResults: 3.25,
    });
    assert.equal(badMaxResults.success, false);

    const badAlwaysInclude = OptionsQuerySchema.safeParse({
      query: 'intsInRange',
      min: 1,
      max: 20,
      alwaysInclude: [2, 4.2],
    });
    assert.equal(badAlwaysInclude.success, false);
  });

  it('accepts intsInVarRange optional cardinality controls', () => {
    const parsed = OptionsQuerySchema.safeParse({
      query: 'intsInVarRange',
      var: 'resources',
      scope: 'global',
      min: 0,
      max: 20,
      step: 2,
      alwaysInclude: [1, { ref: 'binding', name: '$n' }],
      maxResults: 8,
    });
    assert.equal(parsed.success, true);
  });

  it('rejects non-integer numeric literals in intsInVarRange step/maxResults/alwaysInclude', () => {
    const badStep = OptionsQuerySchema.safeParse({
      query: 'intsInVarRange',
      var: 'resources',
      step: 1.5,
    });
    assert.equal(badStep.success, false);

    const badMaxResults = OptionsQuerySchema.safeParse({
      query: 'intsInVarRange',
      var: 'resources',
      maxResults: 3.25,
    });
    assert.equal(badMaxResults.success, false);

    const badAlwaysInclude = OptionsQuerySchema.safeParse({
      query: 'intsInVarRange',
      var: 'resources',
      alwaysInclude: [2, 4.2],
    });
    assert.equal(badAlwaysInclude.success, false);
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

  it('rejects malformed conceal payloads', () => {
    const invalidFromShape = EffectASTSchema.safeParse({
      conceal: { zone: 'hand:actor', from: { playerId: 1 } },
    });
    assert.equal(invalidFromShape.success, false);

    const invalidFilterOp = EffectASTSchema.safeParse({
      conceal: { zone: 'hand:actor', filter: [{ prop: 'faction', op: 'contains', value: 'US' }] },
    });
    assert.equal(invalidFilterOp.success, false);

    const invalidFilterValueShape = EffectASTSchema.safeParse({
      conceal: { zone: 'hand:actor', filter: [{ prop: 'faction', op: 'in', value: ['US', { bad: true }] }] },
    });
    assert.equal(invalidFilterValueShape.success, false);

    const unknownConcealKey = EffectASTSchema.safeParse({
      conceal: { zone: 'hand:actor', from: 'all', extra: true },
    });
    assert.equal(unknownConcealKey.success, false);
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

  it('enforces full transferVar endpoint required/forbidden field matrix by scope', () => {
    const cases = buildDiscriminatedEndpointMatrix({
      scopeField: 'scope',
      varField: 'var',
      playerField: 'player',
      zoneField: 'zone',
      scopes: {
        global: 'global',
        player: 'pvar',
        zone: 'zoneVar',
      },
      values: {
        globalVar: 'bank',
        playerVar: 'vp',
        zoneVar: 'supply',
        player: 'actor',
        zone: 'board:none',
      },
    });

    for (const testCase of cases) {
      const result = EffectASTSchema.safeParse({
        transferVar: {
          from: testCase.from,
          to: testCase.to,
          amount: 1,
        },
      });
      if (testCase.violation === undefined) {
        assert.equal(result.success, true, testCase.name);
        continue;
      }
      assert.equal(result.success, false, testCase.name);
    }
  });

  it('enforces setVar scope endpoint matrix', () => {
    const cases: ReadonlyArray<{ name: string; payload: unknown; valid: boolean }> = [
      { name: 'global requires only var/value', payload: { scope: 'global', var: 'gold', value: 1 }, valid: true },
      { name: 'pvar requires player', payload: { scope: 'pvar', player: 'actor', var: 'gold', value: 1 }, valid: true },
      { name: 'zoneVar requires zone', payload: { scope: 'zoneVar', zone: 'board:none', var: 'gold', value: 1 }, valid: true },
      { name: 'global forbids player', payload: { scope: 'global', player: 'actor', var: 'gold', value: 1 }, valid: false },
      { name: 'global forbids zone', payload: { scope: 'global', zone: 'board:none', var: 'gold', value: 1 }, valid: false },
      { name: 'pvar requires player presence', payload: { scope: 'pvar', var: 'gold', value: 1 }, valid: false },
      { name: 'pvar forbids zone', payload: { scope: 'pvar', player: 'actor', zone: 'board:none', var: 'gold', value: 1 }, valid: false },
      { name: 'zoneVar requires zone presence', payload: { scope: 'zoneVar', var: 'gold', value: 1 }, valid: false },
      { name: 'zoneVar forbids player', payload: { scope: 'zoneVar', player: 'actor', zone: 'board:none', var: 'gold', value: 1 }, valid: false },
    ];

    for (const testCase of cases) {
      const result = EffectASTSchema.safeParse({ setVar: testCase.payload });
      assert.equal(result.success, testCase.valid, testCase.name);
    }
  });

  it('enforces addVar scope endpoint matrix', () => {
    const cases: ReadonlyArray<{ name: string; payload: unknown; valid: boolean }> = [
      { name: 'global requires only var/delta', payload: { scope: 'global', var: 'gold', delta: 1 }, valid: true },
      { name: 'pvar requires player', payload: { scope: 'pvar', player: 'actor', var: 'gold', delta: 1 }, valid: true },
      { name: 'zoneVar requires zone', payload: { scope: 'zoneVar', zone: 'board:none', var: 'gold', delta: 1 }, valid: true },
      { name: 'global forbids player', payload: { scope: 'global', player: 'actor', var: 'gold', delta: 1 }, valid: false },
      { name: 'global forbids zone', payload: { scope: 'global', zone: 'board:none', var: 'gold', delta: 1 }, valid: false },
      { name: 'pvar requires player presence', payload: { scope: 'pvar', var: 'gold', delta: 1 }, valid: false },
      { name: 'pvar forbids zone', payload: { scope: 'pvar', player: 'actor', zone: 'board:none', var: 'gold', delta: 1 }, valid: false },
      { name: 'zoneVar requires zone presence', payload: { scope: 'zoneVar', var: 'gold', delta: 1 }, valid: false },
      { name: 'zoneVar forbids player', payload: { scope: 'zoneVar', player: 'actor', zone: 'board:none', var: 'gold', delta: 1 }, valid: false },
    ];

    for (const testCase of cases) {
      const result = EffectASTSchema.safeParse({ addVar: testCase.payload });
      assert.equal(result.success, testCase.valid, testCase.name);
    }
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
