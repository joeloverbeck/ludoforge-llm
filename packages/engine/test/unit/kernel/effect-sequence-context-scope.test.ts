import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getNestedEffectSequenceContextScopes,
  ROOT_EFFECT_SEQUENCE_CONTEXT_SCOPE,
} from '../../../src/kernel/effect-sequence-context-scope.js';
import { collectEffectGrantSequenceContextExecutionPaths } from '../../../src/kernel/effect-grant-sequence-context-paths.js';
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

describe('effect sequence-context scope policy', () => {
  it('marks evaluateSubset.compute as non-persistent while preserving evaluateSubset.in scope', () => {
    const effect: EffectAST = {
      evaluateSubset: {
        source: { query: 'players' },
        subsetSize: 1,
        subsetBind: '$subset',
        compute: [captureGrant('compute-chain', 0)],
        scoreExpr: 1,
        resultBind: '$result',
        in: [requireGrant('in-chain', 1)],
      },
    };

    const nestedScopes = getNestedEffectSequenceContextScopes(effect, ROOT_EFFECT_SEQUENCE_CONTEXT_SCOPE);

    assert.equal(nestedScopes.length, 2);
    assert.deepEqual(
      nestedScopes.map((nestedScope) => ({
        pathSuffix: nestedScope.pathSuffix,
        allowsPersistentSequenceContextGrants: nestedScope.scope.allowsPersistentSequenceContextGrants,
      })),
      [
        {
          pathSuffix: '.evaluateSubset.compute',
          allowsPersistentSequenceContextGrants: false,
        },
        {
          pathSuffix: '.evaluateSubset.in',
          allowsPersistentSequenceContextGrants: true,
        },
      ],
    );
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

  it('retains evaluateSubset.in descendants in sequence-context linkage paths', () => {
    const effects: readonly EffectAST[] = [
      {
        evaluateSubset: {
          source: { query: 'players' },
          subsetSize: 1,
          subsetBind: '$subset',
          compute: [],
          scoreExpr: 1,
          resultBind: '$result',
          in: [
            {
              if: {
                when: { op: '==', left: 1, right: 1 },
                then: [captureGrant('persistent-chain', 0), requireGrant('persistent-chain', 1)],
              },
            },
          ],
        },
      },
    ];

    const executionPaths = collectEffectGrantSequenceContextExecutionPaths(effects, 'effects');

    assert.deepEqual(executionPaths, [
      [
        {
          chain: 'persistent-chain',
          step: 0,
          path: 'effects[0].evaluateSubset.in[0].if.then[0].grantFreeOperation',
          captureKey: 'selected-space',
        },
        {
          chain: 'persistent-chain',
          step: 1,
          path: 'effects[0].evaluateSubset.in[0].if.then[1].grantFreeOperation',
          requireKey: 'selected-space',
        },
      ],
      [],
    ]);
  });
});
