// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { type ChoicePendingRequest, type DecisionKey, type MoveParamValue } from '../../src/kernel/index.js';
import { decisionParamKeysMatching, matchesDecisionKey, matchesDecisionRequest } from '../helpers/decision-key-matchers.js';

const makeRequest = (overrides?: Partial<ChoicePendingRequest>): ChoicePendingRequest => ({
  kind: 'pending',
  complete: false,
  decisionKey: 'decision:macro.distribute.select::${selected}[1]#2' as DecisionKey,
  name: '$selected',
  type: 'chooseN',
  options: [],
  targetKinds: [],
  min: 0,
  max: 2,
  selected: [],
  canConfirm: true,
  ...overrides,
});

describe('decision key matchers', () => {
  it('matches parsed decision fields without relying on raw key substrings', () => {
    assert.equal(
      matchesDecisionKey('decision:event.target::$targetProvince[0]', {
        baseId: 'decision:event.target',
        resolvedBind: '$targetProvince',
        iterationPath: '[0]',
        occurrence: 1,
      }),
      true,
    );
    assert.equal(matchesDecisionKey('decision:event.target::$targetProvince[0]', { resolvedBind: '$otherBind' }), false);
  });

  it('matches requests by name and parsed base-id pattern', () => {
    const request = makeRequest();

    assert.equal(
      matchesDecisionRequest({
        type: 'chooseN',
        name: '$selected',
        baseIdPattern: /\.distribute\.select$/u,
        resolvedBind: '${selected}',
        iterationPath: '[1]',
        occurrence: 2,
      })(request),
      true,
    );
  });

  it('filters only canonical decision params and ignores non-decision keys', () => {
    const params: Readonly<Record<string, MoveParamValue>> = {
      '$selected': ['a'],
      'decision:event.target::$targetProvince[0]': 'quang-nam:none',
      'decision:event.target::$targetProvince[1]': 'quang-tri-thua-thien:none',
    };

    assert.deepEqual(decisionParamKeysMatching(params, { resolvedBind: '$targetProvince' }), [
      'decision:event.target::$targetProvince[0]',
      'decision:event.target::$targetProvince[1]',
    ]);
  });
});
