import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildOrderedFrontier,
  selectExpansionCandidateLazy,
  type FrontierEntry,
} from '../../../../src/agents/mcts/expansion.js';
import type { CachedClassificationEntry, CachedLegalMoveInfo } from '../../../../src/agents/mcts/state-cache.js';
import { createAccumulator } from '../../../../src/agents/mcts/diagnostics.js';
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

function makeMoveInfo(
  actionId: string,
  status: CachedLegalMoveInfo['status'] = 'unknown',
  params: Record<string, number> = {},
): CachedLegalMoveInfo {
  const move = makeMove(actionId, params);
  return {
    move,
    moveKey: canonicalMoveKey(move),
    familyKey: move.actionId,
    status,
    oneStepHeuristic: null,
  };
}

function makeClassEntry(
  infos: CachedLegalMoveInfo[],
  cursor: number = 0,
): CachedClassificationEntry {
  return {
    infos,
    nextUnclassifiedCursor: cursor,
    exhaustiveScanComplete: false,
  };
}

/**
 * GameDef for expansion tests:
 * - 2 players, perPlayerVar "vp" 0..100
 * - N actions that set vp to different values (for heuristic differentiation)
 */
function createManyActionDef(actionCount: number): GameDef {
  const phase = [asPhaseId('main')];
  const actions = [];
  for (let i = 0; i < actionCount; i += 1) {
    actions.push({
      id: asActionId(`action${i}`),
      actor: 'active' as const,
      executor: 'actor' as const,
      phase,
      params: [],
      pre: null,
      cost: [],
      effects: [{ setVar: { scope: 'pvar', player: 'actor', var: 'vp', value: i } }],
      limits: [],
    });
  }

  return {
    metadata: { id: 'lazy-expansion-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [{ name: 'vp', type: 'int', init: 0, min: 0, max: 100 }],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions,
    triggers: [],
    terminal: {
      conditions: [],
      scoring: { method: 'highest', value: { ref: 'pvar', player: 'actor', var: 'vp' } },
    },
  } as unknown as GameDef;
}

// ---------------------------------------------------------------------------
// buildOrderedFrontier
// ---------------------------------------------------------------------------

describe('buildOrderedFrontier', () => {
  it('excludes already-expanded candidates', () => {
    const info0 = makeMoveInfo('action0', 'ready');
    const info1 = makeMoveInfo('action1', 'ready');
    const info2 = makeMoveInfo('action2', 'ready');
    const entry = makeClassEntry([info0, info1, info2]);

    const existing = new Set([info1.moveKey]);
    const rng = createRng(42n);
    const { frontier } = buildOrderedFrontier(entry, existing, null, rng);

    assert.equal(frontier.length, 2);
    const keys = frontier.map((f: FrontierEntry) => f.info.moveKey);
    assert.ok(!keys.includes(info1.moveKey), 'should exclude already-expanded');
  });

  it('excludes illegal and pendingStochastic candidates', () => {
    const info0 = makeMoveInfo('action0', 'illegal');
    const info1 = makeMoveInfo('action1', 'pendingStochastic');
    const info2 = makeMoveInfo('action2', 'ready');
    const entry = makeClassEntry([info0, info1, info2]);

    const rng = createRng(42n);
    const { frontier } = buildOrderedFrontier(entry, new Set(), null, rng);

    assert.equal(frontier.length, 1);
    assert.equal(frontier[0]!.info.moveKey, info2.moveKey);
  });

  it('prioritises root-best hint candidate', () => {
    const info0 = makeMoveInfo('action0', 'ready');
    const info1 = makeMoveInfo('action1', 'ready');
    const info2 = makeMoveInfo('action2', 'ready');
    const entry = makeClassEntry([info0, info1, info2]);

    const rng = createRng(42n);
    // Mark action1 as root-best.
    const { frontier } = buildOrderedFrontier(entry, new Set(), info1.moveKey, rng);

    // Root-best candidate should appear first (highest cheapScore).
    assert.equal(frontier[0]!.info.moveKey, info1.moveKey);
  });

  it('produces deterministic order for same PRNG seed', () => {
    const infos = Array.from({ length: 20 }, (_, i) => makeMoveInfo(`action${i}`, 'unknown'));
    const entry1 = makeClassEntry([...infos.map(i => ({ ...i }))]);
    const entry2 = makeClassEntry([...infos.map(i => ({ ...i }))]);

    const rng1 = createRng(99n);
    const rng2 = createRng(99n);

    const { frontier: f1 } = buildOrderedFrontier(entry1, new Set(), null, rng1);
    const { frontier: f2 } = buildOrderedFrontier(entry2, new Set(), null, rng2);

    assert.equal(f1.length, f2.length);
    for (let i = 0; i < f1.length; i += 1) {
      assert.equal(f1[i]!.info.moveKey, f2[i]!.info.moveKey,
        `frontier order mismatch at index ${i}`);
    }
  });

  it('ranks ready > pending > unknown', () => {
    // Create 3 candidates with distinct statuses.
    const readyInfo = makeMoveInfo('readyAction', 'ready');
    const pendingInfo = makeMoveInfo('pendingAction', 'pending');
    const unknownInfo = makeMoveInfo('unknownAction', 'unknown');
    const entry = makeClassEntry([unknownInfo, pendingInfo, readyInfo]);

    // Use a seed where PRNG tiebreak doesn't overwhelm the status bonus.
    const rng = createRng(1n);
    const { frontier } = buildOrderedFrontier(entry, new Set(), null, rng);

    assert.equal(frontier.length, 3);
    // Ready (score += 10) should beat pending (score += 5) should beat unknown (score += 0).
    assert.equal(frontier[0]!.info.moveKey, readyInfo.moveKey);
    assert.equal(frontier[1]!.info.moveKey, pendingInfo.moveKey);
    assert.equal(frontier[2]!.info.moveKey, unknownInfo.moveKey);
  });
});

// ---------------------------------------------------------------------------
// selectExpansionCandidateLazy
// ---------------------------------------------------------------------------

describe('selectExpansionCandidateLazy', () => {
  it('with 50+ candidates, only shortlist-size candidates get applyMove+evaluate', () => {
    const actionCount = 60;
    const def = createManyActionDef(actionCount);
    const { state } = initialState(def, 42, 2);
    const rng = createRng(99n);
    const acc = createAccumulator();

    // Create classification entry with all 'ready' candidates.
    const infos = Array.from({ length: actionCount }, (_, i) =>
      makeMoveInfo(`action${i}`, 'ready'),
    );
    const entry = makeClassEntry(infos, actionCount); // all classified

    const shortlistSize = 4;
    const result = selectExpansionCandidateLazy(
      entry,
      new Set<string>(), // no existing children
      null,              // no root-best hint
      shortlistSize,
      10,                // exhaustiveThreshold
      def,
      state,
      asPlayerId(0),
      rng,
      undefined,
      undefined,
      acc,
    );

    assert.ok(result !== null, 'should return a candidate');
    // The shortlist diagnostic tells us how many candidates were evaluated.
    assert.equal(acc.lazyExpansionShortlistSize, shortlistSize,
      `should evaluate exactly ${shortlistSize} candidates, not all ${actionCount}`);
    assert.equal(acc.lazyExpansionFallbackToExhaustive, 0, 'should not fall back to exhaustive');
  });

  it('with branching < threshold, falls back to exhaustive path', () => {
    const actionCount = 5;
    const def = createManyActionDef(actionCount);
    const { state } = initialState(def, 42, 2);
    const rng = createRng(99n);
    const acc = createAccumulator();

    const infos = Array.from({ length: actionCount }, (_, i) =>
      makeMoveInfo(`action${i}`, 'ready'),
    );
    const entry = makeClassEntry(infos, actionCount);

    const result = selectExpansionCandidateLazy(
      entry,
      new Set<string>(),
      null,
      4,
      10, // threshold = 10, candidates = 5 < 10 → exhaustive fallback
      def,
      state,
      asPlayerId(0),
      rng,
      undefined,
      undefined,
      acc,
    );

    assert.ok(result !== null, 'should return a candidate');
    assert.equal(acc.lazyExpansionFallbackToExhaustive, 1, 'should fall back to exhaustive');
  });

  it('if all frontier candidates are illegal, returns null', () => {
    const infos = [
      makeMoveInfo('action0', 'illegal'),
      makeMoveInfo('action1', 'illegal'),
      makeMoveInfo('action2', 'pendingStochastic'),
    ];
    const entry = makeClassEntry(infos, 3);

    const def = createManyActionDef(3);
    const { state } = initialState(def, 42, 2);
    const rng = createRng(42n);
    const acc = createAccumulator();

    const result = selectExpansionCandidateLazy(
      entry,
      new Set<string>(),
      null,
      4,
      10,
      def,
      state,
      asPlayerId(0),
      rng,
      undefined,
      undefined,
      acc,
    );

    assert.equal(result, null, 'should return null when all candidates are illegal');
    assert.equal(acc.lazyExpansionFrontierExhausted, 1, 'should record frontier exhaustion');
  });

  it('classifies unknown candidates on demand in lazy path', () => {
    // Create 20 candidates — all 'unknown'. The function must classify
    // them on demand until the shortlist is filled.
    const actionCount = 20;
    const def = createManyActionDef(actionCount);
    const { state } = initialState(def, 42, 2);
    const rng = createRng(99n);
    const acc = createAccumulator();

    const infos = Array.from({ length: actionCount }, (_, i) =>
      makeMoveInfo(`action${i}`, 'unknown'),
    );
    const entry = makeClassEntry(infos);

    const shortlistSize = 3;
    const result = selectExpansionCandidateLazy(
      entry,
      new Set<string>(),
      null,
      shortlistSize,
      10, // threshold = 10, candidates = 20 > 10 → lazy path
      def,
      state,
      asPlayerId(0),
      rng,
      undefined,
      undefined,
      acc,
    );

    assert.ok(result !== null, 'should return a candidate');
    // Should have classified some candidates on demand.
    assert.ok(acc.lazyExpansionCandidatesClassified > 0,
      'should classify unknown candidates on demand');
    // Shortlist should be at most shortlistSize.
    assert.ok(acc.lazyExpansionShortlistSize <= shortlistSize,
      `shortlist should be <= ${shortlistSize}`);
  });

  it('skips already-expanded candidates', () => {
    const actionCount = 15;
    const def = createManyActionDef(actionCount);
    const { state } = initialState(def, 42, 2);
    const rng = createRng(42n);
    const acc = createAccumulator();

    const infos = Array.from({ length: actionCount }, (_, i) =>
      makeMoveInfo(`action${i}`, 'ready'),
    );
    const entry = makeClassEntry(infos, actionCount);

    // Mark all but 2 as already expanded.
    const existingKeys = new Set(infos.slice(0, actionCount - 2).map(i => i.moveKey));

    const result = selectExpansionCandidateLazy(
      entry,
      existingKeys,
      null,
      4,
      10, // only 2 unexpanded < 10 → exhaustive fallback
      def,
      state,
      asPlayerId(0),
      rng,
      undefined,
      undefined,
      acc,
    );

    assert.ok(result !== null, 'should return one of the 2 remaining candidates');
    assert.ok(!existingKeys.has(result.candidate.moveKey),
      'should not return an already-expanded candidate');
  });

  it('returns deterministic results for same seed', () => {
    const actionCount = 30;
    const def = createManyActionDef(actionCount);
    const { state } = initialState(def, 42, 2);

    const infos1 = Array.from({ length: actionCount }, (_, i) =>
      makeMoveInfo(`action${i}`, 'ready'),
    );
    const infos2 = Array.from({ length: actionCount }, (_, i) =>
      makeMoveInfo(`action${i}`, 'ready'),
    );
    const entry1 = makeClassEntry(infos1, actionCount);
    const entry2 = makeClassEntry(infos2, actionCount);

    const result1 = selectExpansionCandidateLazy(
      entry1, new Set(), null, 4, 10,
      def, state, asPlayerId(0), createRng(77n),
    );
    const result2 = selectExpansionCandidateLazy(
      entry2, new Set(), null, 4, 10,
      def, state, asPlayerId(0), createRng(77n),
    );

    assert.ok(result1 !== null && result2 !== null);
    assert.equal(result1.candidate.moveKey, result2.candidate.moveKey,
      'same seed should produce same expansion candidate');
  });
});
