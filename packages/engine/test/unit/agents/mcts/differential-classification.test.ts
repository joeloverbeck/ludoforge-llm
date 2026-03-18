/**
 * Differential tests: exhaustive vs lazy classification must produce
 * identical per-move statuses on the same state corpus.
 *
 * Created for 64MCTSPEROPT-005.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  applyMove,
  initialState,
  legalMoves,
  createGameDefRuntime,
  type GameDef,
  type GameState,
  type Move,
  type ValidatedGameDef,
} from '../../../../src/kernel/index.js';
import {
  classifyMovesForSearch,
  type MoveClassification,
} from '../../../../src/agents/mcts/materialization.js';
import {
  initClassificationEntry,
  exhaustClassificationToLegacy,
  type CachedClassificationEntry,
} from '../../../../src/agents/mcts/state-cache.js';
import { canonicalMoveKey } from '../../../../src/agents/mcts/move-key.js';
import { createSimpleMctsGameDef } from '../../../helpers/simple-mcts-game.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Run exhaustive classification (the legacy path) on a set of moves.
 */
function classifyExhaustive(
  def: GameDef,
  state: GameState,
  moves: readonly Move[],
): MoveClassification {
  return classifyMovesForSearch(def, state, moves);
}

/**
 * Run lazy classification by creating an incremental entry and exhausting it.
 * This exercises the same per-move `classifySingleMove` codepath but through
 * the incremental cache infrastructure.
 */
function classifyLazy(
  def: GameDef,
  state: GameState,
  moves: readonly Move[],
): MoveClassification {
  const entry: CachedClassificationEntry = initClassificationEntry(moves);
  return exhaustClassificationToLegacy(entry, def, state);
}

/**
 * Assert that two MoveClassification results are equivalent:
 * same ready moveKeys and same pending actionIds (order-independent).
 */
function assertClassificationsEqual(
  exhaustive: MoveClassification,
  lazy: MoveClassification,
  label: string,
): void {
  const exhaustiveReadyKeys = new Set(exhaustive.ready.map((c) => c.moveKey));
  const lazyReadyKeys = new Set(lazy.ready.map((c) => c.moveKey));

  assert.deepStrictEqual(
    [...exhaustiveReadyKeys].sort(),
    [...lazyReadyKeys].sort(),
    `${label}: ready moveKey sets differ`,
  );

  const exhaustivePendingIds = new Set(exhaustive.pending.map((m) => `${m.actionId}:${canonicalMoveKey(m)}`));
  const lazyPendingIds = new Set(lazy.pending.map((m) => `${m.actionId}:${canonicalMoveKey(m)}`));

  assert.deepStrictEqual(
    [...exhaustivePendingIds].sort(),
    [...lazyPendingIds].sort(),
    `${label}: pending move sets differ`,
  );
}

// ---------------------------------------------------------------------------
// Simple game differential tests
// ---------------------------------------------------------------------------

describe('differential classification — simple game', () => {
  it('exhaustive and lazy produce identical statuses at initial state', () => {
    const def = createSimpleMctsGameDef();
    const { state } = initialState(def, 42, 2);
    const runtime = createGameDefRuntime(def);
    const moves = legalMoves(def, state, undefined, runtime);

    assert.ok(moves.length >= 2, `expected ≥2 legal moves, got ${moves.length}`);

    const exhaustive = classifyExhaustive(def, state, moves);
    const lazy = classifyLazy(def, state, moves);

    assertClassificationsEqual(exhaustive, lazy, 'initial state');
  });

  it('exhaustive and lazy produce identical statuses after one move', () => {
    const def = createSimpleMctsGameDef();
    const runtime = createGameDefRuntime(def);
    let { state } = initialState(def, 42, 2);

    // Apply a ready move to get a different state.
    const moves0 = legalMoves(def, state, undefined, runtime);
    const exhaustive0 = classifyExhaustive(def, state, moves0);
    assert.ok(exhaustive0.ready.length > 0, 'need at least one ready move');

    state = applyMove(def, state, exhaustive0.ready[0]!.move).state;

    const moves1 = legalMoves(def, state, undefined, runtime);
    const exhaustive1 = classifyExhaustive(def, state, moves1);
    const lazy1 = classifyLazy(def, state, moves1);

    assertClassificationsEqual(exhaustive1, lazy1, 'after one move');
  });

  it('both paths agree on ready and pending counts', () => {
    const def = createSimpleMctsGameDef();
    const { state } = initialState(def, 42, 2);
    const runtime = createGameDefRuntime(def);
    const moves = legalMoves(def, state, undefined, runtime);

    const exhaustive = classifyExhaustive(def, state, moves);
    const lazy = classifyLazy(def, state, moves);

    assert.equal(
      exhaustive.ready.length,
      lazy.ready.length,
      'ready counts should match',
    );
    assert.equal(
      exhaustive.pending.length,
      lazy.pending.length,
      'pending counts should match',
    );
  });
});

// ---------------------------------------------------------------------------
// FITL scenario differential tests (gated)
// ---------------------------------------------------------------------------

const RUN_MCTS_FITL_E2E = process.env.RUN_MCTS_FITL_E2E === '1';

describe('differential classification — FITL scenarios', { skip: !RUN_MCTS_FITL_E2E }, () => {
  // Lazy-loaded FITL infrastructure to avoid compilation cost when skipped.
  let fitlDef: ValidatedGameDef;
  let replayToDecisionPoint: typeof import('../../../e2e/mcts-fitl/fitl-mcts-test-helpers.js').replayToDecisionPoint;
  let createPlaybookBaseState: typeof import('../../../e2e/mcts-fitl/fitl-mcts-test-helpers.js').createPlaybookBaseState;
  let baseState: GameState;

  // Load FITL test infrastructure once.
  const loadFitl = async (): Promise<void> => {
    const helpers = await import('../../../e2e/mcts-fitl/fitl-mcts-test-helpers.js');
    fitlDef = helpers.compileFitlDef();
    replayToDecisionPoint = helpers.replayToDecisionPoint;
    createPlaybookBaseState = helpers.createPlaybookBaseState;
    baseState = createPlaybookBaseState(fitlDef);
  };

  it('S1 (T1 VC Burning Bonze): exhaustive vs lazy produce identical statuses', async () => {
    await loadFitl();
    const runtime = createGameDefRuntime(fitlDef);
    const state = replayToDecisionPoint(fitlDef, baseState, 0, 0);
    const moves = legalMoves(fitlDef, state, undefined, runtime);

    assert.ok(moves.length >= 2, `S1: expected ≥2 legal moves, got ${moves.length}`);

    const exhaustive = classifyExhaustive(fitlDef, state, moves);
    const lazy = classifyLazy(fitlDef, state, moves);

    assertClassificationsEqual(exhaustive, lazy, 'S1');
  });

  it('S3 (T2 NVA Trucks): exhaustive vs lazy produce identical statuses', async () => {
    await loadFitl();
    const runtime = createGameDefRuntime(fitlDef);
    const state = replayToDecisionPoint(fitlDef, baseState, 1, 0);
    const moves = legalMoves(fitlDef, state, undefined, runtime);

    assert.ok(moves.length >= 2, `S3: expected ≥2 legal moves, got ${moves.length}`);

    const exhaustive = classifyExhaustive(fitlDef, state, moves);
    const lazy = classifyLazy(fitlDef, state, moves);

    assertClassificationsEqual(exhaustive, lazy, 'S3');
  });
});
