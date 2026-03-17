import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { runSearch } from '../../../../src/agents/mcts/search.js';
import { createRootNode } from '../../../../src/agents/mcts/node.js';
import { createNodePool } from '../../../../src/agents/mcts/node-pool.js';
import { validateMctsConfig } from '../../../../src/agents/mcts/config.js';
import type { MctsSearchEvent } from '../../../../src/agents/mcts/visitor.js';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  initialState,
  type GameDef,
} from '../../../../src/kernel/index.js';
import { createRng } from '../../../../src/kernel/prng.js';
import { createGameDefRuntime } from '../../../../src/kernel/gamedef-runtime.js';
import { derivePlayerObservation } from '../../../../src/kernel/observation.js';
import { legalMoves } from '../../../../src/kernel/legal-moves.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * Simple 2-player perfect-info game:
 * - globalVar "ended" 0..1
 * - perPlayerVar "vp" 0..10
 * - action "win": sets ended=1 (triggers terminal: player 0 wins)
 * - action "noop": does nothing
 */
function createTerminalDef(): GameDef {
  return {
    metadata: { id: 'visitor-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [{ name: 'ended', type: 'int', init: 0, min: 0, max: 1 }],
    perPlayerVars: [{ name: 'vp', type: 'int', init: 0, min: 0, max: 10 }],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [
      {
        id: asActionId('win'),
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [{ setVar: { scope: 'global', var: 'ended', value: 1 } }],
        limits: [],
      },
      {
        id: asActionId('noop'),
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
    ],
    triggers: [],
    terminal: {
      conditions: [
        {
          when: { op: '==', left: { ref: 'gvar', var: 'ended' }, right: 1 },
          result: { type: 'win', player: { id: asPlayerId(0) } },
        },
      ],
    },
  } as unknown as GameDef;
}

/** Helper: run search with a visitor that collects all events. */
function runWithVisitor(
  iterations: number,
  opts: { visitor?: { onEvent: (e: MctsSearchEvent) => void } } = {},
): { events: MctsSearchEvent[]; iterations: number } {
  const def = createTerminalDef();
  const playerCount = 2;
  const { state } = initialState(def, 42, playerCount);
  const runtime = createGameDefRuntime(def);
  const root = createRootNode(playerCount);
  const observer = asPlayerId(0);
  const observation = derivePlayerObservation(def, state, observer);
  const moves = legalMoves(def, state, undefined, runtime);

  const events: MctsSearchEvent[] = [];
  const visitor = opts.visitor ?? { onEvent: (e: MctsSearchEvent) => events.push(e) };

  const config = validateMctsConfig({
    iterations,
    minIterations: 0,
    visitor,
  });
  const pool = createNodePool(Math.max(iterations + 1, moves.length * 4), playerCount);
  const searchRng = createRng(42n);

  const result = runSearch(
    root, def, state, observation, observer, config, searchRng, moves, runtime, pool,
  );

  return { events, iterations: result.iterations };
}

// ---------------------------------------------------------------------------
// searchStart
// ---------------------------------------------------------------------------

describe('search visitor: searchStart', () => {
  it('emits exactly 1 searchStart event', () => {
    const { events } = runWithVisitor(10);
    const starts = events.filter(e => e.type === 'searchStart');
    assert.equal(starts.length, 1);
  });

  it('searchStart is the first event emitted', () => {
    const { events } = runWithVisitor(10);
    assert.equal(events[0]!.type, 'searchStart');
  });

  it('searchStart contains correct totalIterations and legalMoveCount', () => {
    const { events } = runWithVisitor(100);
    const start = events.find(e => e.type === 'searchStart')!;
    assert.equal(start.type, 'searchStart');
    if (start.type !== 'searchStart') return;
    assert.equal(start.totalIterations, 100);
    // The terminal def has 2 actions (win, noop).
    assert.equal(start.legalMoveCount, 2);
    // readyCount/pendingCount reflect runtime classification.
    // The terminal def has 2 complete actions (win, noop) and 0 pending.
    assert.equal(start.readyCount, 2);
    assert.equal(start.pendingCount, 0);
  });

  it('searchStart.poolCapacity matches the pool', () => {
    const { events } = runWithVisitor(50);
    const start = events.find(e => e.type === 'searchStart')!;
    assert.equal(start.type, 'searchStart');
    if (start.type !== 'searchStart') return;
    // Pool capacity = max(iterations + 1, legalMoveCount * 4) = max(51, 8) = 51
    assert.equal(start.poolCapacity, 51);
  });
});

// ---------------------------------------------------------------------------
// rootCandidates
// ---------------------------------------------------------------------------

describe('search visitor: rootCandidates', () => {
  it('emits exactly 1 rootCandidates event', () => {
    const { events } = runWithVisitor(10);
    const rc = events.filter(e => e.type === 'rootCandidates');
    assert.equal(rc.length, 1);
  });

  it('rootCandidates is emitted immediately after searchStart', () => {
    const { events } = runWithVisitor(10);
    assert.equal(events[0]!.type, 'searchStart');
    assert.equal(events[1]!.type, 'rootCandidates');
  });

  it('rootCandidates.ready includes actionId and moveKey for each ready move', () => {
    const { events } = runWithVisitor(10);
    const rc = events.find(e => e.type === 'rootCandidates')!;
    assert.equal(rc.type, 'rootCandidates');
    if (rc.type !== 'rootCandidates') return;
    // Terminal def has 2 ready actions: win, noop
    assert.equal(rc.ready.length, 2);
    for (const entry of rc.ready) {
      assert.ok(typeof entry.actionId === 'string', 'actionId should be a string');
      assert.ok(typeof entry.moveKey === 'string', 'moveKey should be a string');
      assert.ok(entry.moveKey.length > 0, 'moveKey should be non-empty');
    }
    const actionIds = rc.ready.map(e => e.actionId).sort();
    assert.deepEqual(actionIds, ['noop', 'win']);
  });

  it('rootCandidates.pending includes actionId for each pending move', () => {
    const { events } = runWithVisitor(10);
    const rc = events.find(e => e.type === 'rootCandidates')!;
    assert.equal(rc.type, 'rootCandidates');
    if (rc.type !== 'rootCandidates') return;
    // Terminal def has no pending actions
    assert.equal(rc.pending.length, 0);
  });

  it('rootCandidates is emitted before iterationBatch processing begins', () => {
    const { events } = runWithVisitor(100);
    const rcIdx = events.findIndex(e => e.type === 'rootCandidates');
    const firstBatchIdx = events.findIndex(e => e.type === 'iterationBatch');
    assert.ok(rcIdx >= 0, 'rootCandidates should be present');
    assert.ok(firstBatchIdx >= 0, 'iterationBatch should be present');
    assert.ok(rcIdx < firstBatchIdx, 'rootCandidates should come before first iterationBatch');
  });
});

// ---------------------------------------------------------------------------
// iterationBatch
// ---------------------------------------------------------------------------

describe('search visitor: iterationBatch', () => {
  it('with 200 iterations emits 4 batch events (every 50)', () => {
    const { events } = runWithVisitor(200);
    const batches = events.filter(e => e.type === 'iterationBatch');
    assert.equal(batches.length, 4);
  });

  it('batches cover all iterations with no gaps', () => {
    const { events } = runWithVisitor(200);
    const batches = events
      .filter(e => e.type === 'iterationBatch')
      .map(e => {
        assert.equal(e.type, 'iterationBatch');
        if (e.type !== 'iterationBatch') throw new Error('unreachable');
        return { from: e.fromIteration, to: e.toIteration };
      });

    // First batch starts at 0.
    assert.equal(batches[0]!.from, 0);
    // Each batch starts where the previous ended.
    for (let i = 1; i < batches.length; i++) {
      assert.equal(batches[i]!.from, batches[i - 1]!.to);
    }
    // Last batch ends at total iterations.
    assert.equal(batches[batches.length - 1]!.to, 200);
  });

  it('topChildren is sorted by visits descending', () => {
    const { events } = runWithVisitor(200);
    const batches = events.filter(e => e.type === 'iterationBatch');

    for (const batch of batches) {
      assert.equal(batch.type, 'iterationBatch');
      if (batch.type !== 'iterationBatch') continue;
      for (let i = 1; i < batch.topChildren.length; i++) {
        assert.ok(
          batch.topChildren[i - 1]!.visits >= batch.topChildren[i]!.visits,
          `topChildren not sorted: ${batch.topChildren[i - 1]!.visits} < ${batch.topChildren[i]!.visits}`,
        );
      }
    }
  });

  it('with fewer than 50 iterations still emits 1 batch (final partial)', () => {
    const { events } = runWithVisitor(30);
    const batches = events.filter(e => e.type === 'iterationBatch');
    assert.equal(batches.length, 1);
    if (batches[0]!.type !== 'iterationBatch') throw new Error('unreachable');
    assert.equal(batches[0]!.fromIteration, 0);
    assert.equal(batches[0]!.toIteration, 30);
  });

  it('elapsedMs is positive', () => {
    const { events } = runWithVisitor(100);
    const batches = events.filter(e => e.type === 'iterationBatch');
    for (const batch of batches) {
      if (batch.type !== 'iterationBatch') continue;
      assert.ok(batch.elapsedMs >= 0, `elapsedMs should be >= 0, got ${batch.elapsedMs}`);
    }
  });
});

// ---------------------------------------------------------------------------
// searchComplete
// ---------------------------------------------------------------------------

describe('search visitor: searchComplete', () => {
  it('emits exactly 1 searchComplete event', () => {
    const { events } = runWithVisitor(50);
    const completes = events.filter(e => e.type === 'searchComplete');
    assert.equal(completes.length, 1);
  });

  it('searchComplete is the last event emitted', () => {
    const { events } = runWithVisitor(50);
    assert.equal(events[events.length - 1]!.type, 'searchComplete');
  });

  it('searchComplete.stopReason is "iterations" for normal completion', () => {
    const { events } = runWithVisitor(50);
    const complete = events.find(e => e.type === 'searchComplete')!;
    assert.equal(complete.type, 'searchComplete');
    if (complete.type !== 'searchComplete') return;
    assert.equal(complete.stopReason, 'iterations');
  });

  it('searchComplete.bestActionId matches the actual selected move', () => {
    const def = createTerminalDef();
    const playerCount = 2;
    const { state } = initialState(def, 42, playerCount);
    const runtime = createGameDefRuntime(def);
    const root = createRootNode(playerCount);
    const observer = asPlayerId(0);
    const observation = derivePlayerObservation(def, state, observer);
    const moves = legalMoves(def, state, undefined, runtime);

    const events: MctsSearchEvent[] = [];
    const config = validateMctsConfig({
      iterations: 100,
      minIterations: 0,
      visitor: { onEvent: (e: MctsSearchEvent) => events.push(e) },
    });
    const pool = createNodePool(200, playerCount);
    const searchRng = createRng(42n);

    runSearch(root, def, state, observation, observer, config, searchRng, moves, runtime, pool);

    const complete = events.find(e => e.type === 'searchComplete')!;
    assert.equal(complete.type, 'searchComplete');
    if (complete.type !== 'searchComplete') return;

    // Find the root child with most visits.
    let maxVisits = 0;
    let expectedActionId = '';
    for (const child of root.children) {
      if (child.visits > maxVisits && child.move !== null) {
        maxVisits = child.visits;
        expectedActionId = child.move.actionId;
      }
    }

    assert.equal(complete.bestActionId, expectedActionId);
    assert.equal(complete.bestVisits, maxVisits);
  });

  it('searchComplete.iterations matches actual iteration count', () => {
    const { events, iterations } = runWithVisitor(75);
    const complete = events.find(e => e.type === 'searchComplete')!;
    assert.equal(complete.type, 'searchComplete');
    if (complete.type !== 'searchComplete') return;
    assert.equal(complete.iterations, iterations);
  });
});

// ---------------------------------------------------------------------------
// No visitor (undefined)
// ---------------------------------------------------------------------------

describe('search visitor: no visitor', () => {
  it('search without visitor runs identically — no errors, no events', () => {
    const def = createTerminalDef();
    const playerCount = 2;
    const { state } = initialState(def, 42, playerCount);
    const runtime = createGameDefRuntime(def);
    const root = createRootNode(playerCount);
    const observer = asPlayerId(0);
    const observation = derivePlayerObservation(def, state, observer);
    const moves = legalMoves(def, state, undefined, runtime);

    // No visitor at all.
    const config = validateMctsConfig({ iterations: 50, minIterations: 0 });
    const pool = createNodePool(200, playerCount);
    const searchRng = createRng(42n);

    // Should not throw.
    const result = runSearch(
      root, def, state, observation, observer, config, searchRng, moves, runtime, pool,
    );

    assert.equal(result.iterations, 50);
    assert.equal(root.visits, 50);
  });
});

// ---------------------------------------------------------------------------
// Event ordering
// ---------------------------------------------------------------------------

describe('search visitor: event ordering', () => {
  it('events follow order: searchStart, rootCandidates, iterationBatch*, searchComplete', () => {
    const { events } = runWithVisitor(100);

    assert.ok(events.length >= 4, 'expected at least 4 events');
    assert.equal(events[0]!.type, 'searchStart');
    assert.equal(events[1]!.type, 'rootCandidates');
    assert.equal(events[events.length - 1]!.type, 'searchComplete');

    // All middle events (after rootCandidates) should be iterationBatch.
    for (let i = 2; i < events.length - 1; i++) {
      assert.equal(events[i]!.type, 'iterationBatch');
    }
  });
});
