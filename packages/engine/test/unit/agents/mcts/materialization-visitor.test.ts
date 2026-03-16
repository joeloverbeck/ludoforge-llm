import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  materializeConcreteCandidates,
} from '../../../../src/agents/mcts/materialization.js';
import type { MctsSearchVisitor } from '../../../../src/agents/mcts/visitor.js';
import type { MctsSearchEvent } from '../../../../src/agents/mcts/visitor.js';
import {
  asActionId,
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

/**
 * A minimal GameDef with a concrete action (noop) and a template action
 * (choose) that has one chooseOne param over a small domain.
 */
function createTemplateDef(): GameDef {
  const phase = ['main'];
  return {
    metadata: { id: 'materialization-visitor-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [{ name: 'vp', type: 'int', init: 0, min: 0, max: 10 }],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: 'main' }] },
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
        id: asActionId('choose'),
        actor: 'active',
        executor: 'actor',
        phase,
        params: [
          {
            name: 'target',
            domain: { query: 'intsInRange', min: 0, max: 2 },
          },
        ],
        pre: null,
        cost: [],
        effects: [
          { setVar: { scope: 'pvar', player: 'actor', var: 'vp', value: 1 } },
        ],
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

describe('materializeConcreteCandidates visitor emissions', () => {
  it('emits templateDropped with reason "unsatisfiable" for unknown actions', () => {
    const def = createTemplateDef();
    const { state } = initialState(def, 42, 2);
    const rng = createRng(1n);

    const { events, visitor } = createCollector();

    // A move for a nonexistent action — legalChoicesEvaluate will throw
    const unknownMove = makeMove('nonexistent');
    const concreteMove = makeMove('noop');
    const result = materializeConcreteCandidates(
      def, state, [unknownMove, concreteMove], rng, 3, undefined, visitor,
    );

    // Only the concrete move should survive
    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0]!.moveKey, canonicalMoveKey(concreteMove));

    // Visitor should have received a templateDropped event
    const dropped = events.filter((e) => e.type === 'templateDropped');
    assert.equal(dropped.length, 1, 'exactly one templateDropped emitted');
    if (dropped[0]!.type === 'templateDropped') {
      assert.equal(dropped[0]!.actionId, 'nonexistent');
      assert.equal(dropped[0]!.reason, 'unsatisfiable');
    }
  });

  it('without visitor, materialization failures still work (no crash)', () => {
    const def = createTemplateDef();
    const { state } = initialState(def, 42, 2);
    const rng = createRng(1n);

    // No visitor — should not throw
    const unknownMove = makeMove('nonexistent');
    const concreteMove = makeMove('noop');
    const result = materializeConcreteCandidates(
      def, state, [unknownMove, concreteMove], rng, 3,
    );

    // Only the concrete move should survive — existing behavior preserved
    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0]!.moveKey, canonicalMoveKey(concreteMove));
  });

  it('does not emit templateDropped for successful concrete moves', () => {
    const def = createTemplateDef();
    const { state } = initialState(def, 42, 2);
    const rng = createRng(1n);

    const { events, visitor } = createCollector();

    const concreteMove = makeMove('noop');
    materializeConcreteCandidates(
      def, state, [concreteMove], rng, 3, undefined, visitor,
    );

    assert.equal(events.length, 0, 'no events emitted for successful concrete moves');
  });

  it('does not emit templateDropped for successfully completed templates', () => {
    const def = createTemplateDef();
    const { state } = initialState(def, 42, 2);
    const rng = createRng(1n);

    const { events, visitor } = createCollector();

    // "choose" has param target with domain [0,1,2] — should complete successfully
    const templateMove = makeMove('choose');
    const result = materializeConcreteCandidates(
      def, state, [templateMove], rng, 10, undefined, visitor,
    );

    assert.ok(result.candidates.length >= 1, 'at least one completion');
    assert.equal(events.length, 0, 'no templateDropped for successful completions');
  });
});
