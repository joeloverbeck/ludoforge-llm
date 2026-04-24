// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createChooseNTemplate,
  createChooseNSession,
  disposeChooseNSession,
  advanceChooseNWithSession,
  isSessionValid,
  rebuildPendingFromTemplate,
  type ChooseNSession,
  type ChooseNTemplate,
} from '../../../src/kernel/choose-n-session.js';
import { toSelectionKey, type SelectionKey } from '../../../src/kernel/choose-n-selection-key.js';
import type { SingletonProbeOutcome } from '../../../src/kernel/choose-n-option-resolution.js';
import type { DecisionKey } from '../../../src/kernel/decision-scope.js';
import type {
  ChoiceOption,
  ChoicePendingChooseNRequest,
  MoveParamScalar,
} from '../../../src/kernel/types.js';
import type { PlayerId } from '../../../src/kernel/branded.js';
import type { LegalChoicesPreparedContext } from '../../../src/kernel/legal-choices.js';

// ── Helpers ──────────────────────────────────────────────────────────

const asDecisionKey = (value: string): DecisionKey => value as DecisionKey;
const asPlayerId = (id: number): PlayerId => id as unknown as PlayerId;

const makePreparedContext = (): LegalChoicesPreparedContext =>
  ({} as LegalChoicesPreparedContext);

const makeTemplate = (
  domain: readonly string[],
  overrides?: Partial<Parameters<typeof createChooseNTemplate>[0]>,
): ChooseNTemplate =>
  createChooseNTemplate({
    decisionKey: asDecisionKey('test-choice'),
    name: 'TestChoice',
    normalizedOptions: domain,
    targetKinds: [],
    minCardinality: 1,
    maxCardinality: domain.length,
    prioritizedTierEntries: null,
    qualifierMode: 'none',
    preparedContext: makePreparedContext(),
    partialMoveIdentity: { actionId: 'test-action', params: {} },
    choiceDecisionPlayer: asPlayerId(0),
    chooser: undefined,
    ...overrides,
  });

const makeInitialPending = (
  template: ChooseNTemplate,
  selected: readonly MoveParamScalar[] = [],
): ChoicePendingChooseNRequest =>
  rebuildPendingFromTemplate(template, selected) as ChoicePendingChooseNRequest;

const makeSession = (
  domain: readonly string[],
  revision = 1,
  selected: readonly MoveParamScalar[] = [],
  templateOverrides?: Partial<Parameters<typeof createChooseNTemplate>[0]>,
): ChooseNSession => {
  const template = makeTemplate(domain, templateOverrides);
  const pending = makeInitialPending(template, selected);
  return createChooseNSession(template, selected, pending, revision);
};

// ── Tests ────────────────────────────────────────────────────────────

describe('createChooseNSession', () => {
  it('creates a valid session from template and initial state', () => {
    const session = makeSession(['a', 'b', 'c']);

    assert.equal(session.revision, 1);
    assert.equal(session.decisionKey, asDecisionKey('test-choice'));
    assert.deepEqual(session.currentSelected, []);
    assert.equal(session.currentPending.type, 'chooseN');
    assert.equal(session.currentPending.options.length, 3);
    assert.equal(session.probeCache.size, 0);
    assert.equal(session.legalityCache.size, 0);
  });

  it('preserves template reference', () => {
    const template = makeTemplate(['x', 'y']);
    const pending = makeInitialPending(template);
    const session = createChooseNSession(template, [], pending, 5);
    assert.equal(session.template, template);
  });

  it('stores initial selected sequence', () => {
    const session = makeSession(['a', 'b', 'c'], 1, ['a']);
    assert.deepEqual(session.currentSelected, ['a']);
    assert.equal(session.currentPending.selected.length, 1);
  });
});

describe('isSessionValid', () => {
  it('returns true when revision matches', () => {
    const session = makeSession(['a', 'b'], 42);
    assert.equal(isSessionValid(session, 42), true);
  });

  it('returns false when revision mismatches', () => {
    const session = makeSession(['a', 'b'], 42);
    assert.equal(isSessionValid(session, 43), false);
  });

  it('returns false for any different revision', () => {
    const session = makeSession(['a', 'b'], 1);
    assert.equal(isSessionValid(session, 0), false);
    assert.equal(isSessionValid(session, 2), false);
    assert.equal(isSessionValid(session, 100), false);
  });
});

describe('disposeChooseNSession', () => {
  it('clears session-local caches at scope exit', () => {
    const session = makeSession(['a', 'b', 'c']);
    advanceChooseNWithSession(session, { type: 'add', value: 'a' });
    session.probeCache.set(toSelectionKey(session.template.domainIndex, ['a']), { kind: 'confirmable' });

    assert.equal(session.legalityCache.size > 0, true);
    assert.equal(session.probeCache.size > 0, true);

    disposeChooseNSession(session);

    assert.equal(session.legalityCache.size, 0);
    assert.equal(session.probeCache.size, 0);
    assert.deepEqual(session.currentSelected, ['a']);
  });
});

describe('advanceChooseNWithSession', () => {
  describe('add command', () => {
    it('adds value to selected and updates pending', () => {
      const session = makeSession(['a', 'b', 'c']);
      const result = advanceChooseNWithSession(session, { type: 'add', value: 'a' });

      assert.equal(result.done, false);
      if (!result.done) {
        assert.deepEqual(result.pending.selected, ['a']);
      }
      assert.deepEqual(session.currentSelected, ['a']);
    });

    it('produces correct pending with one recompute (not two full pipeline walks)', () => {
      const session = makeSession(['a', 'b', 'c']);

      // Add 'a' — should rebuild from template exactly once.
      const result = advanceChooseNWithSession(session, { type: 'add', value: 'a' });
      assert.equal(result.done, false);
      if (!result.done) {
        // 'a' is now selected -> should be illegal in options (already selected).
        const optionA = result.pending.options.find((o) => o.value === 'a');
        assert.equal(optionA?.legality, 'illegal');
        // 'b' and 'c' should still be selectable.
        const optionB = result.pending.options.find((o) => o.value === 'b');
        assert.equal(optionB?.legality, 'unknown');
      }
    });

    it('rejects duplicate selection', () => {
      const session = makeSession(['a', 'b', 'c'], 1, ['a']);
      assert.throws(
        () => advanceChooseNWithSession(session, { type: 'add', value: 'a' }),
        /duplicate/,
      );
    });

    it('rejects value outside domain', () => {
      const session = makeSession(['a', 'b', 'c']);
      assert.throws(
        () => advanceChooseNWithSession(session, { type: 'add', value: 'z' }),
        /outside the current chooseN domain/,
      );
    });

    it('rejects illegal options', () => {
      // max=1, so after selecting one, others are illegal (at capacity).
      const session = makeSession(['a', 'b', 'c'], 1, [], { maxCardinality: 1 });
      advanceChooseNWithSession(session, { type: 'add', value: 'a' });
      // Now all remaining are illegal (at capacity).
      assert.throws(
        () => advanceChooseNWithSession(session, { type: 'add', value: 'b' }),
        /illegal/,
      );
    });

    it('allows unknown options (spec 3.4)', () => {
      const session = makeSession(['a', 'b', 'c']);
      // All options start as 'unknown' (from rebuildPendingFromTemplate).
      const optionA = session.currentPending.options.find((o) => o.value === 'a');
      assert.equal(optionA?.legality, 'unknown');
      // Should succeed -- unknown options are selectable.
      assert.doesNotThrow(
        () => advanceChooseNWithSession(session, { type: 'add', value: 'a' }),
      );
    });
  });

  describe('remove command', () => {
    it('removes value from selected and updates pending', () => {
      const session = makeSession(['a', 'b', 'c'], 1, ['a', 'b']);
      const result = advanceChooseNWithSession(session, { type: 'remove', value: 'a' });

      assert.equal(result.done, false);
      if (!result.done) {
        assert.deepEqual(result.pending.selected, ['b']);
      }
      assert.deepEqual(session.currentSelected, ['b']);
    });

    it('rejects removing a value not in selection', () => {
      const session = makeSession(['a', 'b', 'c'], 1, ['a']);
      assert.throws(
        () => advanceChooseNWithSession(session, { type: 'remove', value: 'b' }),
        /not selected/,
      );
    });
  });

  describe('confirm command', () => {
    it('returns done with value when canConfirm is true', () => {
      // min=1, max=3, domain=['a','b','c'], selected=['a'] -> canConfirm=true.
      const session = makeSession(['a', 'b', 'c'], 1, ['a']);
      const result = advanceChooseNWithSession(session, { type: 'confirm' });

      assert.equal(result.done, true);
      if (result.done) {
        assert.deepEqual(result.value, ['a']);
      }
    });

    it('rejects confirm when canConfirm is false', () => {
      // min=2, selected=[] -> canConfirm=false.
      const session = makeSession(['a', 'b', 'c'], 1, [], { minCardinality: 2 });
      assert.throws(
        () => advanceChooseNWithSession(session, { type: 'confirm' }),
        /cannot be confirmed/,
      );
    });
  });

  describe('legality cache', () => {
    it('caches option results on first computation', () => {
      const session = makeSession(['a', 'b', 'c']);
      advanceChooseNWithSession(session, { type: 'add', value: 'a' });

      // The legalityCache should have an entry for selection {a}.
      assert.equal(session.legalityCache.size, 1);
    });

    it('hits cache on second visit to same selection', () => {
      const session = makeSession(['a', 'b', 'c']);

      // Add a, then b, then remove b -> back to {a}.
      advanceChooseNWithSession(session, { type: 'add', value: 'a' });
      advanceChooseNWithSession(session, { type: 'add', value: 'b' });
      advanceChooseNWithSession(session, { type: 'remove', value: 'b' });

      // The selection {a} should have been cached from the first add.
      // The legality cache should have entries for {a} and {a,b}.
      assert.equal(session.legalityCache.size, 2);
    });
  });

  describe('probe cache integration', () => {
    it('probe cache persists across toggles (test acceptance criterion 4)', () => {
      const session = makeSession(['a', 'b', 'c', 'd']);
      let resolveCalls = 0;

      const resolveOptions = (
        pending: ChoicePendingChooseNRequest,
        probeCache: Map<SelectionKey, SingletonProbeOutcome>,
      ): readonly ChoiceOption[] => {
        resolveCalls += 1;
        // Simulate probing: store a result in the probe cache.
        const selKey = toSelectionKey(session.template.domainIndex, pending.selected);
        probeCache.set(selKey, { kind: 'confirmable' });
        return pending.options;
      };

      // Add option A -- resolveOptions is called, populates probeCache.
      advanceChooseNWithSession(session, { type: 'add', value: 'a' }, resolveOptions);
      assert.equal(resolveCalls, 1);
      assert.equal(session.probeCache.size, 1);

      // Add option B -- resolveOptions is called again with the SAME probeCache.
      advanceChooseNWithSession(session, { type: 'add', value: 'b' }, resolveOptions);
      assert.equal(resolveCalls, 2);
      // Probe cache now has entries from both toggles.
      assert.equal(session.probeCache.size, 2);

      // Verify the first probe cache entry is still present.
      const firstKey = toSelectionKey(session.template.domainIndex, ['a']);
      assert.equal(session.probeCache.has(firstKey), true);
    });

    it('legality cache prevents redundant resolveOptions calls', () => {
      const session = makeSession(['a', 'b', 'c']);
      let resolveCalls = 0;

      const resolveOptions = (
        pending: ChoicePendingChooseNRequest,
        _probeCache: Map<SelectionKey, SingletonProbeOutcome>,
      ): readonly ChoiceOption[] => {
        resolveCalls += 1;
        return pending.options;
      };

      // Add a -> resolveOptions called.
      advanceChooseNWithSession(session, { type: 'add', value: 'a' }, resolveOptions);
      assert.equal(resolveCalls, 1);

      // Add b -> resolveOptions called.
      advanceChooseNWithSession(session, { type: 'add', value: 'b' }, resolveOptions);
      assert.equal(resolveCalls, 2);

      // Remove b -> back to {a} -- legality cache HIT, resolveOptions NOT called.
      advanceChooseNWithSession(session, { type: 'remove', value: 'b' }, resolveOptions);
      assert.equal(resolveCalls, 2); // Still 2, not 3.
    });
  });

  describe('session equivalence with stateless path (acceptance criterion 7)', () => {
    it('session recomputation matches stateless rebuildPendingFromTemplate', () => {
      const domain = ['alpha', 'beta', 'gamma', 'delta'];
      const template = makeTemplate(domain);
      const session = createChooseNSession(
        template,
        [],
        makeInitialPending(template),
        1,
      );

      // Add alpha via session.
      advanceChooseNWithSession(session, { type: 'add', value: 'alpha' });

      // Rebuild via stateless path with the same selected.
      const statelessPending = rebuildPendingFromTemplate(
        template,
        ['alpha'],
      ) as ChoicePendingChooseNRequest;

      // The session's pending should match the stateless result.
      assert.equal(
        session.currentPending.options.length,
        statelessPending.options.length,
      );
      assert.deepEqual(session.currentPending.selected, statelessPending.selected);
      assert.equal(session.currentPending.canConfirm, statelessPending.canConfirm);
      assert.equal(session.currentPending.min, statelessPending.min);
      assert.equal(session.currentPending.max, statelessPending.max);

      for (let i = 0; i < session.currentPending.options.length; i++) {
        const sessionOpt = session.currentPending.options[i]!;
        const statelessOpt = statelessPending.options[i]!;
        assert.equal(sessionOpt.value, statelessOpt.value);
        assert.equal(sessionOpt.legality, statelessOpt.legality);
      }
    });

    it('equivalence holds after multiple toggles', () => {
      const domain = ['a', 'b', 'c', 'd', 'e'];
      const template = makeTemplate(domain);
      const session = createChooseNSession(
        template,
        [],
        makeInitialPending(template),
        1,
      );

      // Sequence: add a, add c, remove a, add b -> final selected: [c, b].
      advanceChooseNWithSession(session, { type: 'add', value: 'a' });
      advanceChooseNWithSession(session, { type: 'add', value: 'c' });
      advanceChooseNWithSession(session, { type: 'remove', value: 'a' });
      advanceChooseNWithSession(session, { type: 'add', value: 'b' });

      const statelessPending = rebuildPendingFromTemplate(
        template,
        ['c', 'b'],
      ) as ChoicePendingChooseNRequest;

      assert.deepEqual(session.currentPending.selected, statelessPending.selected);
      assert.equal(session.currentPending.canConfirm, statelessPending.canConfirm);

      for (let i = 0; i < session.currentPending.options.length; i++) {
        const sessionOpt = session.currentPending.options[i]!;
        const statelessOpt = statelessPending.options[i]!;
        assert.equal(sessionOpt.value, statelessOpt.value);
        assert.equal(sessionOpt.legality, statelessOpt.legality);
      }
    });
  });
});
