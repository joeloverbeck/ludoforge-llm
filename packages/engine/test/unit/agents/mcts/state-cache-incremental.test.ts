import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  initClassificationEntry,
  classifyNextCandidate,
  classifySpecificMove,
  getClassifiedMovesByStatus,
  exhaustClassificationToLegacy,
  createStateInfoCache,
  getOrComputeClassification,
} from '../../../../src/agents/mcts/state-cache.js';
import { asActionId, initialState, type GameDef } from '../../../../src/kernel/index.js';
import type { Move } from '../../../../src/kernel/types-core.js';
import { canonicalMoveKey } from '../../../../src/agents/mcts/move-key.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMove(actionId: string, params: Record<string, number> = {}): Move {
  return { actionId: asActionId(actionId), params };
}

/**
 * Minimal GameDef:
 * - 'noop': concrete action → always 'complete' (→ 'ready')
 * - 'choose': template action with one chooseOne param → always 'pending'
 */
function createTestDef(): GameDef {
  const phase = ['main'];
  return {
    metadata: { id: 'cache-incremental-test', players: { min: 2, max: 2 } },
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

// ---------------------------------------------------------------------------
// initClassificationEntry
// ---------------------------------------------------------------------------

describe('initClassificationEntry', () => {
  it('creates entries with all unknown statuses', () => {
    const moves = [makeMove('noop'), makeMove('choose')];
    const entry = initClassificationEntry(moves);

    assert.equal(entry.infos.length, 2);
    assert.equal(entry.nextUnclassifiedCursor, 0);
    assert.equal(entry.exhaustiveScanComplete, false);

    for (const info of entry.infos) {
      assert.equal(info.status, 'unknown');
    }
  });

  it('deduplicates by moveKey — same moveKey produces one entry', () => {
    const moves = [makeMove('noop'), makeMove('noop'), makeMove('noop')];
    const entry = initClassificationEntry(moves);

    assert.equal(entry.infos.length, 1, 'duplicate moveKeys should be deduplicated');
    assert.equal(entry.infos[0]!.moveKey, canonicalMoveKey(makeMove('noop')));
  });

  it('preserves distinct moveKeys for different moves', () => {
    const moves = [makeMove('noop'), makeMove('choose')];
    const entry = initClassificationEntry(moves);

    assert.equal(entry.infos.length, 2);
    const keys = new Set(entry.infos.map((i) => i.moveKey));
    assert.equal(keys.size, 2, 'different moves should have different keys');
  });

  it('first raw move wins for duplicates', () => {
    const move1 = makeMove('noop');
    const move2 = makeMove('noop');
    const entry = initClassificationEntry([move1, move2]);

    assert.equal(entry.infos.length, 1);
    assert.strictEqual(entry.infos[0]!.move, move1, 'first move should be kept');
  });

  it('empty input → empty infos', () => {
    const entry = initClassificationEntry([]);
    assert.equal(entry.infos.length, 0);
    assert.equal(entry.nextUnclassifiedCursor, 0);
    assert.equal(entry.exhaustiveScanComplete, false);
  });
});

// ---------------------------------------------------------------------------
// classifyNextCandidate
// ---------------------------------------------------------------------------

describe('classifyNextCandidate', () => {
  it('advances cursor and sets correct status for ready move', () => {
    const def = createTestDef();
    const { state } = initialState(def, 42, 2);
    const entry = initClassificationEntry([makeMove('noop')]);

    assert.equal(entry.nextUnclassifiedCursor, 0);

    const info = classifyNextCandidate(entry, def, state);
    assert.ok(info !== null);
    assert.equal(info.status, 'ready');
    assert.equal(entry.nextUnclassifiedCursor, 1);
    assert.equal(entry.exhaustiveScanComplete, true);
  });

  it('advances cursor and sets correct status for pending move', () => {
    const def = createTestDef();
    const { state } = initialState(def, 42, 2);
    const entry = initClassificationEntry([makeMove('choose')]);

    const info = classifyNextCandidate(entry, def, state);
    assert.ok(info !== null);
    assert.equal(info.status, 'pending');
    assert.equal(entry.nextUnclassifiedCursor, 1);
    assert.equal(entry.exhaustiveScanComplete, true);
  });

  it('classifies error moves as illegal', () => {
    const def = createTestDef();
    const { state } = initialState(def, 42, 2);
    const entry = initClassificationEntry([makeMove('nonexistent')]);

    const info = classifyNextCandidate(entry, def, state);
    assert.ok(info !== null);
    assert.equal(info.status, 'illegal');
  });

  it('returns null when cursor is at end', () => {
    const def = createTestDef();
    const { state } = initialState(def, 42, 2);
    const entry = initClassificationEntry([makeMove('noop')]);

    classifyNextCandidate(entry, def, state); // consume the one move
    const info = classifyNextCandidate(entry, def, state);
    assert.equal(info, null);
    assert.equal(entry.exhaustiveScanComplete, true);
  });

  it('processes moves sequentially across multiple calls', () => {
    const def = createTestDef();
    const { state } = initialState(def, 42, 2);
    const entry = initClassificationEntry([makeMove('noop'), makeMove('choose')]);

    const info1 = classifyNextCandidate(entry, def, state);
    assert.ok(info1 !== null);
    assert.equal(info1.status, 'ready');
    assert.equal(entry.nextUnclassifiedCursor, 1);
    assert.equal(entry.exhaustiveScanComplete, false);

    const info2 = classifyNextCandidate(entry, def, state);
    assert.ok(info2 !== null);
    assert.equal(info2.status, 'pending');
    assert.equal(entry.nextUnclassifiedCursor, 2);
    assert.equal(entry.exhaustiveScanComplete, true);
  });

  it('returns null for empty entry', () => {
    const def = createTestDef();
    const { state } = initialState(def, 42, 2);
    const entry = initClassificationEntry([]);

    const info = classifyNextCandidate(entry, def, state);
    assert.equal(info, null);
    assert.equal(entry.exhaustiveScanComplete, true);
  });
});

// ---------------------------------------------------------------------------
// classifySpecificMove
// ---------------------------------------------------------------------------

describe('classifySpecificMove', () => {
  it('classifies by index without advancing cursor', () => {
    const def = createTestDef();
    const { state } = initialState(def, 42, 2);
    const entry = initClassificationEntry([makeMove('noop'), makeMove('choose')]);

    // Classify index 1 (choose) without touching cursor
    const info = classifySpecificMove(entry, 1, def, state);
    assert.ok(info !== null);
    assert.equal(info.status, 'pending');
    assert.equal(entry.nextUnclassifiedCursor, 0, 'cursor should not advance');
  });

  it('returns existing classification without re-classifying', () => {
    const def = createTestDef();
    const { state } = initialState(def, 42, 2);
    const entry = initClassificationEntry([makeMove('noop')]);

    // Classify once via cursor
    classifyNextCandidate(entry, def, state);
    assert.equal(entry.infos[0]!.status, 'ready');

    // classifySpecificMove should return the same without re-classifying
    const info = classifySpecificMove(entry, 0, def, state);
    assert.ok(info !== null);
    assert.equal(info.status, 'ready');
  });

  it('returns null for out-of-bounds index', () => {
    const def = createTestDef();
    const { state } = initialState(def, 42, 2);
    const entry = initClassificationEntry([makeMove('noop')]);

    assert.equal(classifySpecificMove(entry, -1, def, state), null);
    assert.equal(classifySpecificMove(entry, 5, def, state), null);
  });
});

// ---------------------------------------------------------------------------
// getClassifiedMovesByStatus
// ---------------------------------------------------------------------------

describe('getClassifiedMovesByStatus', () => {
  it('returns only ready-classified moves', () => {
    const def = createTestDef();
    const { state } = initialState(def, 42, 2);
    const entry = initClassificationEntry([makeMove('noop'), makeMove('choose')]);

    // Exhaust all classifications
    classifyNextCandidate(entry, def, state);
    classifyNextCandidate(entry, def, state);

    const ready = getClassifiedMovesByStatus(entry, 'ready');
    assert.equal(ready.length, 1);
    assert.equal(ready[0]!.move.actionId, asActionId('noop'));
  });

  it('returns only pending-classified moves', () => {
    const def = createTestDef();
    const { state } = initialState(def, 42, 2);
    const entry = initClassificationEntry([makeMove('noop'), makeMove('choose')]);

    classifyNextCandidate(entry, def, state);
    classifyNextCandidate(entry, def, state);

    const pending = getClassifiedMovesByStatus(entry, 'pending');
    assert.equal(pending.length, 1);
    assert.equal(pending[0]!.move.actionId, asActionId('choose'));
  });

  it('returns unknown moves before classification', () => {
    const entry = initClassificationEntry([makeMove('noop'), makeMove('choose')]);
    const unknown = getClassifiedMovesByStatus(entry, 'unknown');
    assert.equal(unknown.length, 2);
  });

  it('returns empty array when no moves match status', () => {
    const entry = initClassificationEntry([makeMove('noop')]);
    const pending = getClassifiedMovesByStatus(entry, 'pending');
    assert.equal(pending.length, 0);
  });
});

// ---------------------------------------------------------------------------
// exhaustClassificationToLegacy (backward compatibility)
// ---------------------------------------------------------------------------

describe('exhaustClassificationToLegacy', () => {
  it('returns correct MoveClassification shape', () => {
    const def = createTestDef();
    const { state } = initialState(def, 42, 2);
    const entry = initClassificationEntry([makeMove('noop'), makeMove('choose')]);

    const legacy = exhaustClassificationToLegacy(entry, def, state);

    assert.equal(legacy.ready.length, 1);
    assert.equal(legacy.ready[0]!.move.actionId, asActionId('noop'));
    assert.ok(typeof legacy.ready[0]!.moveKey === 'string');

    assert.equal(legacy.pending.length, 1);
    assert.equal(legacy.pending[0]!.actionId, asActionId('choose'));

    assert.equal(entry.exhaustiveScanComplete, true);
  });

  it('deduplicates pending by actionId for paramless moves', () => {
    const def = createTestDef();
    const { state } = initialState(def, 42, 2);
    // Two 'choose' moves → same moveKey → deduplicated at init, but even if
    // raw moves differ, pending dedup by actionId should apply.
    const entry = initClassificationEntry([makeMove('choose')]);
    const legacy = exhaustClassificationToLegacy(entry, def, state);
    assert.equal(legacy.pending.length, 1);
  });

  it('is idempotent — calling twice returns same result', () => {
    const def = createTestDef();
    const { state } = initialState(def, 42, 2);
    const entry = initClassificationEntry([makeMove('noop'), makeMove('choose')]);

    const r1 = exhaustClassificationToLegacy(entry, def, state);
    const r2 = exhaustClassificationToLegacy(entry, def, state);

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

// ---------------------------------------------------------------------------
// getOrComputeClassification (backward compat integration)
// ---------------------------------------------------------------------------

describe('getOrComputeClassification backward compat', () => {
  it('returns correct MoveClassification via state cache', () => {
    const def = createTestDef();
    const { state } = initialState(def, 42, 2);
    const cache = createStateInfoCache();
    const moves = [makeMove('noop'), makeMove('choose')];

    const result = getOrComputeClassification(
      cache, def, state, moves, undefined, 100,
    );

    assert.equal(result.ready.length, 1);
    assert.equal(result.ready[0]!.move.actionId, asActionId('noop'));
    assert.equal(result.pending.length, 1);
    assert.equal(result.pending[0]!.actionId, asActionId('choose'));
  });

  it('caches classification — second call returns same result', () => {
    const def = createTestDef();
    const { state } = initialState(def, 42, 2);
    const cache = createStateInfoCache();
    const moves = [makeMove('noop'), makeMove('choose')];

    const r1 = getOrComputeClassification(cache, def, state, moves, undefined, 100);
    const r2 = getOrComputeClassification(cache, def, state, moves, undefined, 100);

    assert.deepStrictEqual(
      r1.ready.map((c) => c.moveKey),
      r2.ready.map((c) => c.moveKey),
    );
  });

  it('skips cache for stateHash === 0n', () => {
    const def = createTestDef();
    const { state } = initialState(def, 42, 2);
    // Force hash to 0n
    const zeroHashState = { ...state, stateHash: 0n };
    const cache = createStateInfoCache();
    const moves = [makeMove('noop')];

    const result = getOrComputeClassification(
      cache, def, zeroHashState, moves, undefined, 100,
    );

    assert.equal(result.ready.length, 1);
    assert.equal(cache.size, 0, 'should not cache when stateHash === 0n');
  });
});
