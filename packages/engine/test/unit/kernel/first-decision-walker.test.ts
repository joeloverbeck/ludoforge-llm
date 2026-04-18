// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  EFFECT_KIND_TAG,
  countDecisionNodes,
  findFirstDecisionNode,
  type ConditionAST,
  type EffectAST,
  type OptionsQuery,
} from '../../../src/kernel/index.js';
import {
  bindValue,
  chooseN,
  chooseOne,
  evaluateSubset,
  forEach,
  ifEffect,
  letEffect,
  reduce,
  removeByPriority,
  rollRandom,
} from '../../../src/kernel/ast-builders.js';

const playersQuery = { query: 'players' } as const satisfies OptionsQuery;
const zonesQuery = { query: 'zones' } as const satisfies OptionsQuery;

const makeChooseOne = (id: string): Extract<EffectAST, { readonly _k: 15 }> => chooseOne({
  internalDecisionId: id,
  bind: `$${id}`,
  options: playersQuery,
});

const makeChooseN = (id: string): Extract<EffectAST, { readonly _k: 16 }> => chooseN({
  internalDecisionId: id,
  bind: `$${id}`,
  options: playersQuery,
  n: 1,
});

const noopEffect = bindValue({
  bind: '$noop',
  value: 1,
});

describe('first decision walker', () => {
  it('returns null for an empty effect list', () => {
    assert.equal(findFirstDecisionNode([]), null);
  });

  it('returns the first flat choose node', () => {
    const first = makeChooseOne('first');
    const second = makeChooseOne('second');

    const result = findFirstDecisionNode([noopEffect, noopEffect, first, second]);

    assert.equal(result?.node, first);
    assert.equal(result?.kind, 'chooseOne');
    assert.deepEqual(result?.path, []);
    assert.deepEqual(result?.guardConditions, []);
    assert.equal(result?.insideForEach, false);
  });

  it('records positive guards for then branches and negated guards for else branches', () => {
    const thenDecision = makeChooseOne('then');
    const elseDecision = makeChooseN('else');
    const guard: ConditionAST = {
      op: '==',
      left: 1,
      right: 1,
    };

    const thenResult = findFirstDecisionNode([ifEffect({
      when: guard,
      then: [thenDecision],
      else: [elseDecision],
    })]);

    assert.equal(thenResult?.node, thenDecision);
    assert.deepEqual(thenResult?.path, [EFFECT_KIND_TAG.if]);
    assert.deepEqual(thenResult?.guardConditions, [guard]);

    const elseResult = findFirstDecisionNode([ifEffect({
      when: guard,
      then: [noopEffect],
      else: [elseDecision],
    })]);

    assert.equal(elseResult?.node, elseDecision);
    assert.deepEqual(elseResult?.path, [EFFECT_KIND_TAG.if]);
    assert.deepEqual(elseResult?.guardConditions, [{ op: 'not', arg: guard }]);
  });

  it('searches forEach.effects before forEach.in and only marks loop-body decisions as insideForEach', () => {
    const loopDecision = makeChooseOne('loop');
    const continuationDecision = makeChooseOne('continuation');

    const loopResult = findFirstDecisionNode([forEach({
      bind: '$zone',
      over: zonesQuery,
      effects: [loopDecision],
      in: [continuationDecision],
    })]);

    assert.equal(loopResult?.node, loopDecision);
    assert.equal(loopResult?.insideForEach, true);
    assert.deepEqual(loopResult?.path, [EFFECT_KIND_TAG.forEach]);
    assert.deepEqual(loopResult?.forEachQuery, zonesQuery);

    const continuationResult = findFirstDecisionNode([forEach({
      bind: '$zone',
      over: zonesQuery,
      effects: [noopEffect],
      in: [continuationDecision],
    })]);

    assert.equal(continuationResult?.node, continuationDecision);
    assert.equal(continuationResult?.insideForEach, false);
    assert.deepEqual(continuationResult?.path, [EFFECT_KIND_TAG.forEach]);
    assert.equal(continuationResult?.forEachQuery, undefined);
  });

  it('tracks nested let -> forEach paths and nearest forEach query', () => {
    const decision = makeChooseOne('nested');

    const result = findFirstDecisionNode([letEffect({
      bind: '$value',
      value: 1,
      in: [forEach({
        bind: '$zone',
        over: zonesQuery,
        effects: [decision],
      })],
    })]);

    assert.equal(result?.node, decision);
    assert.deepEqual(result?.path, [EFFECT_KIND_TAG.let, EFFECT_KIND_TAG.forEach]);
    assert.equal(result?.insideForEach, true);
    assert.deepEqual(result?.forEachQuery, zonesQuery);
  });

  it('descends through rollRandom, removeByPriority, reduce, and evaluateSubset carriers', () => {
    const rollDecision = makeChooseOne('roll');
    const removeDecision = makeChooseOne('remove');
    const reduceDecision = makeChooseOne('reduce');
    const subsetComputeDecision = makeChooseOne('subset-compute');
    const subsetInDecision = makeChooseOne('subset-in');

    assert.equal(
      findFirstDecisionNode([rollRandom({
        bind: '$roll',
        min: 1,
        max: 6,
        in: [rollDecision],
      })])?.node,
      rollDecision,
    );

    assert.equal(
      findFirstDecisionNode([removeByPriority({
        budget: 1,
        groups: [{ bind: '$group', over: playersQuery, to: 'discard:none' }],
        in: [removeDecision],
      })])?.node,
      removeDecision,
    );

    assert.equal(
      findFirstDecisionNode([reduce({
        itemBind: '$item',
        accBind: '$acc',
        over: playersQuery,
        initial: 0,
        next: 0,
        resultBind: '$result',
        in: [reduceDecision],
      })])?.node,
      reduceDecision,
    );

    const subsetComputeResult = findFirstDecisionNode([evaluateSubset({
      source: playersQuery,
      subsetSize: 1,
      subsetBind: '$subset',
      compute: [subsetComputeDecision],
      scoreExpr: 1,
      resultBind: '$result',
      in: [subsetInDecision],
    })]);

    assert.equal(subsetComputeResult?.node, subsetComputeDecision);

    const subsetInResult = findFirstDecisionNode([evaluateSubset({
      source: playersQuery,
      subsetSize: 1,
      subsetBind: '$subset',
      compute: [noopEffect],
      scoreExpr: 1,
      resultBind: '$result',
      in: [subsetInDecision],
    })]);

    assert.equal(subsetInResult?.node, subsetInDecision);
  });

  it('counts decisions across all supported nested carriers', () => {
    const effects: readonly EffectAST[] = [
      makeChooseOne('flat'),
      ifEffect({
        when: true,
        then: [makeChooseOne('then')],
        else: [makeChooseN('else')],
      }),
      forEach({
        bind: '$zone',
        over: zonesQuery,
        effects: [makeChooseOne('loop')],
        in: [makeChooseOne('continuation')],
      }),
      rollRandom({
        bind: '$roll',
        min: 1,
        max: 6,
        in: [makeChooseOne('roll')],
      }),
      removeByPriority({
        budget: 1,
        groups: [{ bind: '$group', over: playersQuery, to: 'discard:none' }],
        in: [makeChooseOne('remove')],
      }),
      reduce({
        itemBind: '$item',
        accBind: '$acc',
        over: playersQuery,
        initial: 0,
        next: 0,
        resultBind: '$result',
        in: [makeChooseOne('reduce')],
      }),
      evaluateSubset({
        source: playersQuery,
        subsetSize: 1,
        subsetBind: '$subset',
        compute: [makeChooseOne('compute')],
        scoreExpr: 1,
        resultBind: '$result',
        in: [makeChooseOne('subset-in')],
      }),
    ];

    assert.equal(countDecisionNodes([]), 0);
    assert.equal(countDecisionNodes([makeChooseOne('single')]), 1);
    assert.equal(countDecisionNodes(effects), 10);
  });
});
