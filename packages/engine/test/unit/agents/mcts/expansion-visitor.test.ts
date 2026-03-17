import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  selectExpansionCandidate,
  type ConcreteMoveCandidate,
} from '../../../../src/agents/mcts/expansion.js';
import type { MctsSearchVisitor } from '../../../../src/agents/mcts/visitor.js';
import type { MctsSearchEvent } from '../../../../src/agents/mcts/visitor.js';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  initialState,
  type GameDef,
} from '../../../../src/kernel/index.js';
import { createRng } from '../../../../src/kernel/prng.js';
import { canonicalMoveKey } from '../../../../src/agents/mcts/move-key.js';
import type { Move } from '../../../../src/kernel/types-core.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMove(actionId: string, params: Record<string, number> = {}): Move {
  return { actionId: asActionId(actionId), params };
}

function makeCandidate(actionId: string, params: Record<string, number> = {}): ConcreteMoveCandidate {
  const move = makeMove(actionId, params);
  return { move, moveKey: canonicalMoveKey(move) };
}

/**
 * Valid GameDef with simple actions. The 'noop' and 'gainMid' actions
 * work fine; we'll create candidates with nonexistent actionIds to
 * trigger applyMove failures.
 */
function createValidDef(): GameDef {
  const phase = [asPhaseId('main')];
  return {
    metadata: { id: 'expansion-visitor-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [{ name: 'vp', type: 'int', init: 0, min: 0, max: 10 }],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [
      {
        id: asActionId('noop'),
        actor: 'active',
        executor: 'actor',
        phase,
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
      {
        id: asActionId('gainMid'),
        actor: 'active',
        executor: 'actor',
        phase,
        params: [],
        pre: null,
        cost: [],
        effects: [{ setVar: { scope: 'pvar', player: 'actor', var: 'vp', value: 5 } }],
        limits: [],
      },
    ],
    triggers: [],
    terminal: {
      conditions: [],
      scoring: { method: 'highest', value: { ref: 'pvar', player: 'actor', var: 'vp' } },
    },
  } as unknown as GameDef;
}

function createCollector(): { visitor: MctsSearchVisitor; events: MctsSearchEvent[] } {
  const events: MctsSearchEvent[] = [];
  return {
    events,
    visitor: {
      onEvent(event: MctsSearchEvent) {
        events.push(event);
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('selectExpansionCandidate visitor emissions', () => {
  it('emits applyMoveFailure with phase "expansion" when applyMove throws', () => {
    const def = createValidDef();
    const { state } = initialState(def, 42, 2);
    const rng = createRng(99n);

    // 'bogus' action doesn't exist in def — applyMove will throw
    const bogusCandidate = makeCandidate('bogus');
    const noopCandidate = makeCandidate('noop');

    const { events, visitor } = createCollector();

    selectExpansionCandidate(
      [bogusCandidate, noopCandidate],
      def,
      state,
      asPlayerId(0),
      rng,
      undefined,
      visitor,
    );

    const failures = events.filter((e) => e.type === 'applyMoveFailure');
    assert.equal(failures.length, 1, 'exactly one applyMoveFailure emitted');

    const failure = failures[0]!;
    assert.equal(failure.type, 'applyMoveFailure');
    if (failure.type === 'applyMoveFailure') {
      assert.equal(failure.actionId, 'bogus');
      assert.equal(failure.phase, 'expansion');
      assert.equal(typeof failure.error, 'string');
      assert.ok(failure.error.length > 0, 'error string is non-empty');
    }
  });

  it('applyMoveFailure.error contains a descriptive error string', () => {
    const def = createValidDef();
    const { state } = initialState(def, 42, 2);
    const rng = createRng(1n);

    const { events, visitor } = createCollector();

    selectExpansionCandidate(
      [makeCandidate('bogus'), makeCandidate('noop')],
      def,
      state,
      asPlayerId(0),
      rng,
      undefined,
      visitor,
    );

    const failures = events.filter((e) => e.type === 'applyMoveFailure');
    assert.ok(failures.length >= 1, 'at least one failure emitted');
    if (failures[0]!.type === 'applyMoveFailure') {
      assert.ok(
        failures[0]!.error.length > 5,
        `error string should be descriptive, got: "${failures[0]!.error}"`,
      );
    }
  });

  it('without visitor, expansion failures still work (no crash)', () => {
    const def = createValidDef();
    const { state } = initialState(def, 42, 2);
    const rng = createRng(99n);

    // No visitor — should not throw and should still select the noop candidate
    const result = selectExpansionCandidate(
      [makeCandidate('bogus'), makeCandidate('noop')],
      def,
      state,
      asPlayerId(0),
      rng,
    );

    // noop should be selected since bogus scores -Infinity
    assert.equal(result.candidate.moveKey, canonicalMoveKey(makeMove('noop')));
  });

  it('does not emit when no applyMove failures occur', () => {
    const def = createValidDef();
    const { state } = initialState(def, 42, 2);
    const rng = createRng(1n);

    const { events, visitor } = createCollector();

    // Only noop — no failures expected
    selectExpansionCandidate(
      [makeCandidate('noop')],
      def,
      state,
      asPlayerId(0),
      rng,
      undefined,
      visitor,
    );

    assert.equal(events.length, 0, 'no events emitted when no failures');
  });
});
