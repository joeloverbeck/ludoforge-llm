import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildMoveRuntimeBindings,
  collectDecisionBindingsFromEffects,
  deriveDecisionBindingsFromMoveParams,
  type EffectAST,
  type Move,
} from '../../src/kernel/index.js';

describe('move runtime bindings', () => {
  it('derives decision bindings only from composed decision ids', () => {
    const moveParams = {
      x: 1,
      'decision:$plain': 'a',
      'decision:$template::$choice@north': 'north',
      'decision:$target::$target@zone-1': 'zone-1',
    } as Move['params'];

    const derived = deriveDecisionBindingsFromMoveParams(moveParams);
    assert.deepEqual(derived, {
      '$choice@north': 'north',
      '$target@zone-1': 'zone-1',
    });
  });

  it('materializes bindings in deterministic precedence order', () => {
    const move: Move = {
      actionId: 'op' as Move['actionId'],
      params: {
        '$pick': 1,
        __freeOperation: true,
        __actionClass: 'limitedOperation',
      } as Move['params'],
      freeOperation: false,
      actionClass: 'operationPlusSpecialActivity',
    };

    const bindings = buildMoveRuntimeBindings(move, { '$pick': 2 });
    assert.equal(bindings.$pick, 2, 'explicit decision binding should override raw move param key');
    assert.equal(bindings.__freeOperation, false, 'reserved runtime binding should override move.params value');
    assert.equal(
      bindings.__actionClass,
      'operationPlusSpecialActivity',
      'reserved runtime binding should override move.params value',
    );
  });

  it('collects decision binding declarations across nested effect surfaces', () => {
    const effects: readonly EffectAST[] = [
      {
        chooseOne: {
          internalDecisionId: 'decision:$top',
          bind: '$top',
          options: { query: 'enums', values: ['a'] },
        },
      },
      {
        if: {
          when: true,
          then: [
            {
              chooseN: {
                internalDecisionId: 'decision:$inIf',
                bind: '$inIf',
                options: { query: 'enums', values: ['a', 'b'] },
                n: 1,
              },
            },
          ],
          else: [
            {
              let: {
                bind: '$x',
                value: 1,
                in: [
                  {
                    chooseOne: {
                      internalDecisionId: 'decision:$inLet',
                      bind: '$inLet',
                      options: { query: 'enums', values: ['b'] },
                    },
                  },
                ],
              },
            },
          ],
        },
      },
      {
        forEach: {
          bind: '$zone',
          over: { query: 'enums', values: ['z'] },
          effects: [],
          in: [
            {
              chooseOne: {
                internalDecisionId: 'decision:$inForEachIn',
                bind: '$inForEachIn',
                options: { query: 'enums', values: ['c'] },
              },
            },
          ],
        },
      },
      {
        rollRandom: {
          bind: '$r',
          min: 1,
          max: 1,
          in: [
            {
              chooseOne: {
                internalDecisionId: 'decision:$inRoll',
                bind: '$inRoll',
                options: { query: 'enums', values: ['d'] },
              },
            },
          ],
        },
      },
    ];

    const collected = new Map<string, string>();
    collectDecisionBindingsFromEffects(effects, collected);

    assert.equal(collected.get('decision:$top'), '$top');
    assert.equal(collected.get('decision:$inIf'), '$inIf');
    assert.equal(collected.get('decision:$inLet'), '$inLet');
    assert.equal(collected.get('decision:$inForEachIn'), '$inForEachIn');
    assert.equal(collected.get('decision:$inRoll'), '$inRoll');
  });
});
