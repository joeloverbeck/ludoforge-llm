// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  advanceChooseNWithSession,
  createChooseNSession,
  createChooseNTemplate,
  disposeChooseNSession,
  rebuildPendingFromTemplate,
} from '../../../src/kernel/choose-n-session.js';
import { toSelectionKey } from '../../../src/kernel/choose-n-selection-key.js';
import type { DecisionKey } from '../../../src/kernel/decision-scope.js';
import type { LegalChoicesPreparedContext } from '../../../src/kernel/legal-choices.js';
import type { PlayerId } from '../../../src/kernel/branded.js';
import type { ChoicePendingChooseNRequest } from '../../../src/kernel/types.js';

const asDecisionKey = (value: string): DecisionKey => value as DecisionKey;
const asPlayerId = (id: number): PlayerId => id as unknown as PlayerId;

describe('decision-local scope drop', () => {
  it('clears chooseN session caches at session exit without mutating the retained selection witness', () => {
    const template = createChooseNTemplate({
      decisionKey: asDecisionKey('test-choice'),
      name: 'TestChoice',
      normalizedOptions: ['a', 'b', 'c'],
      targetKinds: [],
      minCardinality: 1,
      maxCardinality: 3,
      prioritizedTierEntries: null,
      qualifierMode: 'none',
      preparedContext: {} as LegalChoicesPreparedContext,
      partialMoveIdentity: { actionId: 'test-action', params: {} },
      choiceDecisionPlayer: asPlayerId(0),
      chooser: undefined,
    });
    const pending = rebuildPendingFromTemplate(template, []) as ChoicePendingChooseNRequest;
    const session = createChooseNSession(template, [], pending, 1);

    advanceChooseNWithSession(session, { type: 'add', value: 'a' });
    session.probeCache.set(toSelectionKey(session.template.domainIndex, ['a']), { kind: 'confirmable' });

    assert.equal(session.legalityCache.size, 1);
    assert.equal(session.probeCache.size, 1);

    disposeChooseNSession(session);

    assert.equal(session.legalityCache.size, 0);
    assert.equal(session.probeCache.size, 0);
    assert.deepEqual(session.currentSelected, ['a']);
    assert.deepEqual(session.currentPending.selected, ['a']);
  });
});
