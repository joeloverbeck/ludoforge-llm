import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { lowerVictory } from '../../src/cnl/compile-victory.js';
import type { ConditionLoweringContext } from '../../src/cnl/compile-conditions.js';
import { canonicalizeNamedSets } from '../../src/cnl/named-set-utils.js';

const baseContext = (): ConditionLoweringContext => ({
  ownershipByBase: {
    board: 'none',
  },
  tokenFilterProps: ['faction'],
  namedSets: canonicalizeNamedSets({
    coin: ['us', 'arvn'],
  }),
  seatIds: ['us', 'arvn', 'nva', 'vc'],
});

describe('compile victory lowering', () => {
  it('lowers terminal checkpoint/margin expressions with named sets and seat-aware query filters', () => {
    const diagnostics: Parameters<typeof lowerVictory>[1] = [];
    const lowered = lowerVictory(
      {
        checkpoints: [
          {
            id: 'coin-threshold',
            seat: 'us',
            timing: 'duringCoup',
            when: {
              op: '>',
              left: {
                aggregate: {
                  op: 'count',
                  query: {
                    query: 'tokensInMapSpaces',
                    spaceFilter: {
                      owner: 'US',
                      condition: {
                        op: '==',
                        left: { ref: 'zoneProp', zone: 'board', prop: 'category' },
                        right: 'province',
                      },
                    },
                    filter: { prop: 'faction', op: 'in', value: { ref: 'namedSet', name: ' coin ' } },
                  },
                },
              },
              right: 0,
            },
          },
        ],
        margins: [
          {
            seat: 'us',
            value: {
              op: '-',
              left: {
                aggregate: {
                  op: 'count',
                  query: {
                    query: 'tokensInZone',
                    zone: 'board',
                    filter: { prop: 'faction', op: 'in', value: { ref: 'namedSet', name: 'coin' } },
                  },
                },
              },
              right: 1,
            },
          },
        ],
        ranking: { order: 'desc' },
      } as unknown as Parameters<typeof lowerVictory>[0],
      diagnostics,
      baseContext(),
    );

    assert.deepEqual(diagnostics, []);
    assert.deepEqual(lowered, {
      checkpoints: [
        {
          id: 'coin-threshold',
          seat: 'us',
          timing: 'duringCoup',
          when: {
            op: '>',
            left: {
              _t: 5,
              aggregate: {
                op: 'count',
                query: {
                  query: 'tokensInMapSpaces',
                  spaceFilter: {
                    owner: { id: 0 },
                    condition: {
                      op: '==',
                      left: { _t: 2, ref: 'zoneProp', zone: 'board:none', prop: 'category' },
                      right: 'province',
                    },
                  },
                  filter: { prop: 'faction', op: 'in', value: ['us', 'arvn'] },
                },
              },
            },
            right: 0,
          },
        },
      ],
      margins: [
        {
          seat: 'us',
          value: {
            _t: 6,
            op: '-',
            left: {
              _t: 5,
              aggregate: {
                op: 'count',
                query: {
                  query: 'tokensInZone',
                  zone: 'board:none',
                  filter: { prop: 'faction', op: 'in', value: ['us', 'arvn'] },
                },
              },
            },
            right: 1,
          },
        },
      ],
      ranking: { order: 'desc' },
    });
  });

  it('returns deterministic nested diagnostics for invalid checkpoint/margin lowering internals', () => {
    const diagnostics: Parameters<typeof lowerVictory>[1] = [];
    const lowered = lowerVictory(
      {
        checkpoints: [
          {
            id: 'bad-checkpoint',
            seat: 'us',
            timing: 'duringCoup',
            when: {
              op: '>',
              left: {
                aggregate: {
                  op: 'count',
                  query: {
                    query: 'tokensInZone',
                    zone: 'board',
                    filter: { prop: 'unknownProp', op: 'eq', value: 'us' },
                  },
                },
              },
              right: 0,
            },
          },
        ],
        margins: [
          {
            seat: 'us',
            value: {
              aggregate: {
                op: 'count',
                query: {
                  query: 'tokensInZone',
                  zone: 'board',
                  filter: { prop: 'faction', op: 'between', value: 'us' },
                },
              },
            },
          },
        ],
        ranking: { order: 'desc' },
      } as unknown as Parameters<typeof lowerVictory>[0],
      diagnostics,
      baseContext(),
    );

    assert.deepEqual(lowered, {
      checkpoints: [],
      margins: [],
      ranking: { order: 'desc' },
    });
    assert.equal(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_TOKEN_FILTER_PROP_UNKNOWN'
          && diagnostic.path === 'doc.terminal.checkpoints.0.when.left.aggregate.query.filter.prop',
      ),
      true,
    );
    assert.equal(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_MISSING_CAPABILITY'
          && diagnostic.path === 'doc.terminal.margins.0.value.aggregate.query.filter',
      ),
      true,
    );
  });

  it('lowers margins and ranking even when checkpoints are absent', () => {
    const diagnostics: Parameters<typeof lowerVictory>[1] = [];
    const lowered = lowerVictory(
      {
        margins: [
          {
            seat: 'us',
            value: 3,
          },
        ],
        ranking: { order: 'desc' },
      } as unknown as Parameters<typeof lowerVictory>[0],
      diagnostics,
      baseContext(),
    );

    assert.deepEqual(diagnostics, []);
    assert.deepEqual(lowered, {
      margins: [
        {
          seat: 'us',
          value: 3,
        },
      ],
      ranking: { order: 'desc' },
    });
  });
});
