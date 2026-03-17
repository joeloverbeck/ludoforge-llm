import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { classifyMovesForSearch } from '../../../../src/agents/mcts/materialization.js';
import type { MoveClassification } from '../../../../src/agents/mcts/materialization.js';
import type { MctsSearchVisitor, MctsSearchEvent, MctsMoveDroppedEvent } from '../../../../src/agents/mcts/visitor.js';
import { asActionId, initialState, type GameDef } from '../../../../src/kernel/index.js';
import type { Move } from '../../../../src/kernel/types-core.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMove(actionId: string, params: Record<string, number> = {}): Move {
  return { actionId: asActionId(actionId), params };
}

/**
 * A minimal GameDef with:
 * - 'noop': concrete action with no params or inline decisions → always 'complete'
 * - 'choose': template action with one chooseOne param → always 'pending'
 */
function createTestDef(): GameDef {
  const phase = ['main'];
  return {
    metadata: { id: 'classify-moves-test', players: { min: 2, max: 2 } },
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
// classifyMovesForSearch tests
// ---------------------------------------------------------------------------

describe('classifyMovesForSearch', () => {
  it('empty-input: empty move list → empty ready and pending', () => {
    const def = createTestDef();
    const { state } = initialState(def, 42, 2);
    const result: MoveClassification = classifyMovesForSearch(def, state, []);
    assert.equal(result.ready.length, 0);
    assert.equal(result.pending.length, 0);
  });

  it('all-complete: all concrete moves go to ready', () => {
    const def = createTestDef();
    const { state } = initialState(def, 42, 2);
    const moves = [makeMove('noop')];
    const result = classifyMovesForSearch(def, state, moves);
    assert.equal(result.ready.length, 1, 'should have one ready move');
    assert.equal(result.pending.length, 0, 'should have no pending moves');
    assert.equal(result.ready[0]!.move.actionId, asActionId('noop'));
    assert.ok(typeof result.ready[0]!.moveKey === 'string', 'should have a string moveKey');
  });

  it('all-pending: all template moves go to pending', () => {
    const def = createTestDef();
    const { state } = initialState(def, 42, 2);
    const moves = [makeMove('choose')];
    const result = classifyMovesForSearch(def, state, moves);
    assert.equal(result.ready.length, 0, 'should have no ready moves');
    assert.equal(result.pending.length, 1, 'should have one pending move');
    assert.equal(result.pending[0]!.actionId, asActionId('choose'));
  });

  it('mixed: complete + pending + error → correct partitioning', () => {
    const def = createTestDef();
    const { state } = initialState(def, 42, 2);
    const { events, visitor } = createCollector();

    const moves = [makeMove('noop'), makeMove('choose'), makeMove('nonexistent')];
    const result = classifyMovesForSearch(def, state, moves, undefined, visitor);

    assert.equal(result.ready.length, 1, 'noop should be ready');
    assert.equal(result.ready[0]!.move.actionId, asActionId('noop'));
    assert.equal(result.pending.length, 1, 'choose should be pending');
    assert.equal(result.pending[0]!.actionId, asActionId('choose'));

    const dropped = events.filter((e) => e.type === 'moveDropped') as MctsMoveDroppedEvent[];
    assert.equal(dropped.length, 1, 'nonexistent should be dropped');
    assert.equal(dropped[0]!.actionId, asActionId('nonexistent'));
    assert.equal(dropped[0]!.reason, 'unsatisfiable');
  });

  it('ready-dedup: duplicate moveKeys in complete set are deduplicated', () => {
    const def = createTestDef();
    const { state } = initialState(def, 42, 2);
    const moves = [makeMove('noop'), makeMove('noop'), makeMove('noop')];
    const result = classifyMovesForSearch(def, state, moves);
    assert.equal(result.ready.length, 1, 'duplicates should be removed');
  });

  it('pending-dedup-by-action: multiple moves from same actionId with empty params → single pending entry', () => {
    const def = createTestDef();
    const { state } = initialState(def, 42, 2);
    // Two identical 'choose' moves with empty params → same actionId → one pending entry
    const moves = [makeMove('choose'), makeMove('choose')];
    const result = classifyMovesForSearch(def, state, moves);
    assert.equal(result.pending.length, 1, 'should deduplicate pending by actionId');
  });

  it('pending-distinct-params: moves from same actionId with different params → separate entries', () => {
    const def = createTestDef();
    const { state } = initialState(def, 42, 2);
    // Two 'choose' moves with different non-empty params → distinct decision roots
    const move1 = { actionId: asActionId('choose'), params: { target: 0 } } as unknown as Move;
    const move2 = { actionId: asActionId('choose'), params: { target: 1 } } as unknown as Move;
    const result = classifyMovesForSearch(def, state, [move1, move2]);
    // Both have non-empty params so dedup is by canonicalMoveKey, not actionId.
    // Since they have different params, they produce different keys → both kept.
    // Note: these may classify as 'complete' (since params are filled) rather
    // than 'pending'. Either way, distinct entries should be preserved.
    const totalEntries = result.ready.length + result.pending.length;
    assert.equal(totalEntries, 2, 'distinct-param moves should produce separate entries');
  });

  it('classification-error: legalChoicesEvaluate throws → move dropped, visitor event emitted', () => {
    const def = createTestDef();
    const { state } = initialState(def, 42, 2);
    const { events, visitor } = createCollector();

    const result = classifyMovesForSearch(def, state, [makeMove('nonexistent')], undefined, visitor);
    assert.equal(result.ready.length, 0);
    assert.equal(result.pending.length, 0);

    const dropped = events.filter((e) => e.type === 'moveDropped') as MctsMoveDroppedEvent[];
    assert.equal(dropped.length, 1);
    assert.equal(dropped[0]!.actionId, asActionId('nonexistent'));
    assert.equal(dropped[0]!.reason, 'unsatisfiable');
  });

  it('classification-error without visitor: move silently dropped, no throw', () => {
    const def = createTestDef();
    const { state } = initialState(def, 42, 2);
    const result = classifyMovesForSearch(def, state, [makeMove('nonexistent')]);
    assert.equal(result.ready.length, 0);
    assert.equal(result.pending.length, 0);
  });

  it('illegal-only: all dropped moves → empty ready and pending', () => {
    const def = createTestDef();
    const { state } = initialState(def, 42, 2);
    // Nonexistent actions throw → dropped (similar effect to illegal)
    const result = classifyMovesForSearch(def, state, [makeMove('x'), makeMove('y')]);
    assert.equal(result.ready.length, 0);
    assert.equal(result.pending.length, 0);
  });

  it('pure function: same inputs produce same outputs', () => {
    const def = createTestDef();
    const { state } = initialState(def, 42, 2);
    const moves = [makeMove('noop'), makeMove('choose')];
    const r1 = classifyMovesForSearch(def, state, moves);
    const r2 = classifyMovesForSearch(def, state, moves);
    assert.deepStrictEqual(
      r1.ready.map((c) => c.moveKey),
      r2.ready.map((c) => c.moveKey),
    );
    assert.deepStrictEqual(
      r1.pending.map((m) => m.actionId),
      r2.pending.map((m) => m.actionId),
    );
  });
});
