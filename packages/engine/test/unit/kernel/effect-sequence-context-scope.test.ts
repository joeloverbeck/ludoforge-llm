import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getNestedEffectSequenceContextScopes,
  ROOT_EFFECT_SEQUENCE_CONTEXT_SCOPE,
} from '../../../src/kernel/effect-sequence-context-scope.js';
import {
  collectEffectGrantExecutionPaths as collectGenericEffectGrantExecutionPaths,
  collectEffectGrantSequenceContextExecutionPaths,
} from '../../../src/kernel/effect-grant-execution-paths.js';
import type { EffectAST } from '../../../src/kernel/types.js';

const captureGrant = (chain: string, step: number): EffectAST => ({
  grantFreeOperation: {
    seat: '0',
    sequence: { chain, step },
    operationClass: 'operation',
    actionIds: ['playCard'],
    sequenceContext: { captureMoveZoneCandidatesAs: 'selected-space' },
  },
});

const requireGrant = (chain: string, step: number): EffectAST => ({
  grantFreeOperation: {
    seat: '0',
    sequence: { chain, step },
    operationClass: 'operation',
    actionIds: ['playCard'],
    sequenceContext: { requireMoveZoneCandidatesFrom: 'selected-space' },
  },
});

const summarizeNestedScopes = (effect: EffectAST) =>
  getNestedEffectSequenceContextScopes(effect, ROOT_EFFECT_SEQUENCE_CONTEXT_SCOPE).map((nestedScope) => ({
    pathSuffix: nestedScope.pathSuffix,
    allowsPersistentSequenceContextGrants: nestedScope.scope.allowsPersistentSequenceContextGrants,
    traversal: nestedScope.traversal,
  }));

const captureReference = (chain: string, step: number, path: string) => ({
  chain,
  step,
  path,
  captureKey: 'selected-space',
});

const requireReference = (chain: string, step: number, path: string) => ({
  chain,
  step,
  path,
  requireKey: 'selected-space',
});

describe('effect sequence-context scope policy', () => {
  it('returns the expected nested-scope descriptors for every helper-owned effect form', () => {
    const cases: ReadonlyArray<{
      readonly name: string;
      readonly effect: EffectAST;
      readonly expected: ReadonlyArray<{
        readonly pathSuffix: string;
        readonly allowsPersistentSequenceContextGrants: boolean;
        readonly traversal:
          | { readonly kind: 'sequential'; readonly slot: string }
          | { readonly kind: 'alternative'; readonly branch: 'then' | 'else' }
          | { readonly kind: 'loop-body' }
          | { readonly kind: 'loop-continuation' };
      }>;
    }> = [
      {
        name: 'if',
        effect: {
          if: {
            when: { op: '==', left: 1, right: 1 },
            then: [captureGrant('if-chain', 0)],
            else: [requireGrant('if-chain', 1)],
          },
        },
        expected: [
          {
            pathSuffix: '.if.then',
            allowsPersistentSequenceContextGrants: true,
            traversal: { kind: 'alternative', branch: 'then' },
          },
          {
            pathSuffix: '.if.else',
            allowsPersistentSequenceContextGrants: true,
            traversal: { kind: 'alternative', branch: 'else' },
          },
        ],
      },
      {
        name: 'let',
        effect: {
          let: {
            bind: '$value',
            value: 1,
            in: [captureGrant('let-chain', 0)],
          },
        },
        expected: [
          {
            pathSuffix: '.let.in',
            allowsPersistentSequenceContextGrants: true,
            traversal: { kind: 'sequential', slot: 'let.in' },
          },
        ],
      },
      {
        name: 'forEach',
        effect: {
          forEach: {
            bind: '$item',
            countBind: '$count',
            over: { query: 'players' },
            effects: [captureGrant('for-each-chain', 0)],
            in: [requireGrant('for-each-chain', 1)],
          },
        },
        expected: [
          {
            pathSuffix: '.forEach.effects',
            allowsPersistentSequenceContextGrants: true,
            traversal: { kind: 'loop-body' },
          },
          {
            pathSuffix: '.forEach.in',
            allowsPersistentSequenceContextGrants: true,
            traversal: { kind: 'loop-continuation' },
          },
        ],
      },
      {
        name: 'reduce',
        effect: {
          reduce: {
            itemBind: '$item',
            accBind: '$acc',
            over: { query: 'intsInRange', min: 1, max: 2 },
            initial: 0,
            next: 1,
            resultBind: '$result',
            in: [captureGrant('reduce-chain', 0)],
          },
        },
        expected: [
          {
            pathSuffix: '.reduce.in',
            allowsPersistentSequenceContextGrants: true,
            traversal: { kind: 'sequential', slot: 'reduce.in' },
          },
        ],
      },
      {
        name: 'removeByPriority',
        effect: {
          removeByPriority: {
            budget: 1,
            groups: [
              {
                bind: '$target',
                over: { query: 'tokensInZone', zone: 'board:none' },
                to: 'discard:none',
              },
            ],
            in: [captureGrant('remove-chain', 0)],
          },
        },
        expected: [
          {
            pathSuffix: '.removeByPriority.in',
            allowsPersistentSequenceContextGrants: true,
            traversal: { kind: 'sequential', slot: 'removeByPriority.in' },
          },
        ],
      },
      {
        name: 'evaluateSubset',
        effect: {
          evaluateSubset: {
            source: { query: 'players' },
            subsetSize: 1,
            subsetBind: '$subset',
            compute: [captureGrant('compute-chain', 0)],
            scoreExpr: 1,
            resultBind: '$result',
            in: [requireGrant('in-chain', 1)],
          },
        },
        expected: [
          {
            pathSuffix: '.evaluateSubset.compute',
            allowsPersistentSequenceContextGrants: false,
            traversal: { kind: 'sequential', slot: 'evaluateSubset.compute' },
          },
          {
            pathSuffix: '.evaluateSubset.in',
            allowsPersistentSequenceContextGrants: true,
            traversal: { kind: 'sequential', slot: 'evaluateSubset.in' },
          },
        ],
      },
      {
        name: 'rollRandom',
        effect: {
          rollRandom: {
            bind: '$roll',
            min: 1,
            max: 6,
            in: [captureGrant('roll-chain', 0)],
          },
        },
        expected: [
          {
            pathSuffix: '.rollRandom.in',
            allowsPersistentSequenceContextGrants: true,
            traversal: { kind: 'sequential', slot: 'rollRandom.in' },
          },
        ],
      },
    ];

    cases.forEach(({ name, effect, expected }) => {
      assert.deepEqual(summarizeNestedScopes(effect), expected, name);
    });
  });

  it('omits optional nested descriptors when the effect form does not define them', () => {
    assert.deepEqual(
      summarizeNestedScopes({
        removeByPriority: {
          budget: 1,
          groups: [
            {
              bind: '$target',
              over: { query: 'tokensInZone', zone: 'board:none' },
              to: 'discard:none',
            },
          ],
        },
      }),
      [],
    );
    assert.deepEqual(
      summarizeNestedScopes({
        forEach: {
          bind: '$item',
          over: { query: 'players' },
          effects: [],
        },
      }),
      [
        {
          pathSuffix: '.forEach.effects',
          allowsPersistentSequenceContextGrants: true,
          traversal: { kind: 'loop-body' },
        },
      ],
    );
  });

  it('preserves traversal visibility for every persistent nested effect form', () => {
    const cases: ReadonlyArray<{
      readonly name: string;
      readonly effects: readonly EffectAST[];
      readonly expected: readonly (readonly Record<string, string | number>[])[];
    }> = [
      {
        name: 'if',
        effects: [
          {
            if: {
              when: { op: '==', left: 1, right: 1 },
              then: [captureGrant('if-chain', 0)],
              else: [requireGrant('if-chain', 1)],
            },
          },
        ],
        expected: [
          [captureReference('if-chain', 0, 'effects[0].if.then[0].grantFreeOperation')],
          [requireReference('if-chain', 1, 'effects[0].if.else[0].grantFreeOperation')],
        ],
      },
      {
        name: 'let',
        effects: [
          {
            let: {
              bind: '$value',
              value: 1,
              in: [captureGrant('let-chain', 0), requireGrant('let-chain', 1)],
            },
          },
        ],
        expected: [
          [
            captureReference('let-chain', 0, 'effects[0].let.in[0].grantFreeOperation'),
            requireReference('let-chain', 1, 'effects[0].let.in[1].grantFreeOperation'),
          ],
        ],
      },
      {
        name: 'forEach',
        effects: [
          {
            forEach: {
              bind: '$item',
              countBind: '$count',
              over: { query: 'players' },
              effects: [captureGrant('for-each-chain', 0)],
              in: [requireGrant('for-each-chain', 1)],
            },
          },
        ],
        expected: [
          [requireReference('for-each-chain', 1, 'effects[0].forEach.in[0].grantFreeOperation')],
          [
            captureReference('for-each-chain', 0, 'effects[0].forEach.effects[0].grantFreeOperation'),
            requireReference('for-each-chain', 1, 'effects[0].forEach.in[0].grantFreeOperation'),
          ],
        ],
      },
      {
        name: 'reduce',
        effects: [
          {
            reduce: {
              itemBind: '$item',
              accBind: '$acc',
              over: { query: 'intsInRange', min: 1, max: 2 },
              initial: 0,
              next: 1,
              resultBind: '$result',
              in: [captureGrant('reduce-chain', 0), requireGrant('reduce-chain', 1)],
            },
          },
        ],
        expected: [
          [
            captureReference('reduce-chain', 0, 'effects[0].reduce.in[0].grantFreeOperation'),
            requireReference('reduce-chain', 1, 'effects[0].reduce.in[1].grantFreeOperation'),
          ],
        ],
      },
      {
        name: 'removeByPriority',
        effects: [
          {
            removeByPriority: {
              budget: 1,
              groups: [
                {
                  bind: '$target',
                  over: { query: 'tokensInZone', zone: 'board:none' },
                  to: 'discard:none',
                },
              ],
              in: [captureGrant('remove-chain', 0), requireGrant('remove-chain', 1)],
            },
          },
        ],
        expected: [
          [
            captureReference('remove-chain', 0, 'effects[0].removeByPriority.in[0].grantFreeOperation'),
            requireReference('remove-chain', 1, 'effects[0].removeByPriority.in[1].grantFreeOperation'),
          ],
        ],
      },
      {
        name: 'rollRandom',
        effects: [
          {
            rollRandom: {
              bind: '$roll',
              min: 1,
              max: 6,
              in: [captureGrant('roll-chain', 0), requireGrant('roll-chain', 1)],
            },
          },
        ],
        expected: [
          [
            captureReference('roll-chain', 0, 'effects[0].rollRandom.in[0].grantFreeOperation'),
            requireReference('roll-chain', 1, 'effects[0].rollRandom.in[1].grantFreeOperation'),
          ],
        ],
      },
      {
        name: 'evaluateSubset.in',
        effects: [
          {
            evaluateSubset: {
              source: { query: 'players' },
              subsetSize: 1,
              subsetBind: '$subset',
              compute: [],
              scoreExpr: 1,
              resultBind: '$result',
              in: [captureGrant('persistent-chain', 0), requireGrant('persistent-chain', 1)],
            },
          },
        ],
        expected: [
          [
            captureReference('persistent-chain', 0, 'effects[0].evaluateSubset.in[0].grantFreeOperation'),
            requireReference('persistent-chain', 1, 'effects[0].evaluateSubset.in[1].grantFreeOperation'),
          ],
        ],
      },
    ];

    cases.forEach(({ name, effects, expected }) => {
      assert.deepEqual(collectEffectGrantSequenceContextExecutionPaths(effects, 'effects'), expected, name);
    });
  });

  it('excludes evaluateSubset.compute descendants from sequence-context linkage paths', () => {
    const effects: readonly EffectAST[] = [
      {
        evaluateSubset: {
          source: { query: 'players' },
          subsetSize: 1,
          subsetBind: '$subset',
          compute: [
            {
              if: {
                when: { op: '==', left: 1, right: 1 },
                then: [captureGrant('compute-only-chain', 0)],
              },
            },
          ],
          scoreExpr: 1,
          resultBind: '$result',
          in: [],
        },
      },
    ];

    const executionPaths = collectEffectGrantSequenceContextExecutionPaths(effects, 'effects');

    assert.deepEqual(executionPaths, [[]]);
  });

  it('exposes grant execution paths through the generic collector without rewalking control flow differently', () => {
    const effects: readonly EffectAST[] = [
      {
        if: {
          when: { op: '==', left: 1, right: 1 },
          then: [captureGrant('generic-then-chain', 0)],
          else: [requireGrant('generic-else-chain', 1)],
        },
      },
    ];

    const executionPaths = collectGenericEffectGrantExecutionPaths(
      effects,
      'effects',
      (grant, path) => ({
        chain: grant.sequence?.chain,
        step: grant.sequence?.step,
        path,
      }),
    );

    assert.deepEqual(executionPaths, [
      [{ chain: 'generic-then-chain', step: 0, path: 'effects[0].if.then[0].grantFreeOperation' }],
      [{ chain: 'generic-else-chain', step: 1, path: 'effects[0].if.else[0].grantFreeOperation' }],
    ]);
  });
});
