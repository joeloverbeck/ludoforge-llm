/**
 * Tests for pending-family coverage rules (64MCTSPEROPT-008).
 *
 * Verifies that `selectExpansionCandidateFamilyFirst` properly discovers
 * pending families during its discovery pass and tracks diagnostics.
 */
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  selectExpansionCandidateFamilyFirst,
} from '../../../../src/agents/mcts/expansion.js';
import type {
  CachedClassificationEntry,
  CachedLegalMoveInfo,
} from '../../../../src/agents/mcts/state-cache.js';
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
 * Create a minimal GameDef following the pattern from family-widening tests.
 */
function createMinimalDef(actionIds: string[]): GameDef {
  const phase = [asPhaseId('main')];
  const actions = actionIds.map((id, i) => ({
    id: asActionId(id),
    actor: 'active' as const,
    executor: 'actor' as const,
    phase,
    params: [],
    pre: null,
    cost: [],
    effects: [{ setVar: { scope: 'pvar', player: 'actor', var: 'vp', value: i } }],
    limits: [],
  }));

  return {
    metadata: { id: 'pending-family-test', players: { min: 2, max: 2 } },
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
// Tests
// ---------------------------------------------------------------------------

describe('pending-family coverage (64MCTSPEROPT-008)', () => {
  describe('with 3 ready + 2 pending families', () => {
    it('tracks pending families in diagnostics', () => {
      // 5 families total (>3 so family-first doesn't fall through).
      // 3 families pre-classified as 'ready', 2 as 'pending'.
      // Add extra variants so candidate count exceeds exhaustive threshold.
      const infos = [
        makeMoveInfo('alpha', 'ready'),
        makeMoveInfo('alpha', 'ready', { v: 1 }),
        makeMoveInfo('beta', 'ready'),
        makeMoveInfo('beta', 'ready', { v: 1 }),
        makeMoveInfo('gamma', 'ready'),
        makeMoveInfo('gamma', 'ready', { v: 1 }),
        makeMoveInfo('delta', 'pending'),
        makeMoveInfo('epsilon', 'pending'),
      ];
      const entry = makeClassEntry(infos, infos.length); // cursor past end

      const def = createMinimalDef(['alpha', 'beta', 'gamma', 'delta', 'epsilon']);
      const rng = createRng(42n);
      const { state } = initialState(def, 42, 2);
      const actingPlayer = asPlayerId(0);
      const acc = createAccumulator();

      const result = selectExpansionCandidateFamilyFirst(
        entry,
        new Set<string>(),       // no existing children
        new Map<string, number>(), // no existing family counts
        1,    // maxVariantsBeforeCoverage
        1,    // pendingFamilyQuotaRoot
        null, // rootBestKey
        4,    // shortlistSize
        3,    // exhaustiveThreshold — low so we use the lazy path
        def, state, actingPlayer, rng,
        undefined, undefined, acc,
      );

      // Should return a ready candidate (pending moves are not in shortlist).
      assert.ok(result !== null, 'should find a ready candidate');
      const readyFamilies = ['alpha', 'beta', 'gamma'];
      assert.ok(
        readyFamilies.includes(result.candidate.move.actionId),
        `expanded family ${result.candidate.move.actionId} should be ready`,
      );

      // Diagnostics should track the 2 pending families.
      assert.equal(acc.pendingFamiliesTotal, 2, 'should track 2 pending families');
    });

    it('returns ready candidates when pending families exist but shortlist is for ready only', () => {
      // Pending moves should NOT appear in the expansion result —
      // they create decision root nodes via a separate path in search.ts.
      const infos = [
        makeMoveInfo('alpha', 'ready'),
        makeMoveInfo('beta', 'ready'),
        makeMoveInfo('gamma', 'ready'),
        makeMoveInfo('delta', 'pending'),
        makeMoveInfo('epsilon', 'pending'),
        // Add more to ensure we don't hit exhaustive threshold.
        makeMoveInfo('alpha', 'ready', { v: 1 }),
        makeMoveInfo('beta', 'ready', { v: 1 }),
        makeMoveInfo('gamma', 'ready', { v: 1 }),
        makeMoveInfo('alpha', 'ready', { v: 2 }),
        makeMoveInfo('beta', 'ready', { v: 2 }),
        makeMoveInfo('gamma', 'ready', { v: 2 }),
      ];
      const entry = makeClassEntry(infos, infos.length);

      const def = createMinimalDef(['alpha', 'beta', 'gamma', 'delta', 'epsilon']);
      const rng = createRng(42n);
      const { state } = initialState(def, 42, 2);
      const actingPlayer = asPlayerId(0);

      const expandedKeys = new Set<string>();
      const familyCounts = new Map<string, number>();
      let currentRng = rng;

      // Run multiple expansion rounds.
      const expandedFamilies = new Set<string>();
      for (let round = 0; round < 6; round += 1) {
        const result = selectExpansionCandidateFamilyFirst(
          entry, expandedKeys, familyCounts,
          1, 1, null, 4, 20,
          def, state, actingPlayer, currentRng,
        );
        if (result === null) break;
        expandedKeys.add(result.candidate.moveKey);
        const fk = result.candidate.move.actionId;
        familyCounts.set(fk, (familyCounts.get(fk) ?? 0) + 1);
        expandedFamilies.add(fk);
        currentRng = result.rng;
      }

      // Only ready families should be expanded (delta/epsilon are pending).
      for (const fk of expandedFamilies) {
        assert.ok(
          ['alpha', 'beta', 'gamma'].includes(fk),
          `expanded family ${fk} should be a ready family, not pending`,
        );
      }

      // But pending infos remain in the entry for search.ts to find.
      const pendingInfos = entry.infos.filter((i) => i.status === 'pending');
      assert.equal(pendingInfos.length, 2, 'pending infos should persist in entry');
      const pendingFamilies = new Set(pendingInfos.map((i) => i.familyKey));
      assert.ok(pendingFamilies.has('delta'));
      assert.ok(pendingFamilies.has('epsilon'));
    });
  });

  describe('pendingFamilyQuotaRoot = 0 disables reservation', () => {
    it('does not use quota when set to 0', () => {
      const infos = [
        makeMoveInfo('alpha', 'ready'),
        makeMoveInfo('beta', 'ready'),
        makeMoveInfo('gamma', 'ready'),
        makeMoveInfo('delta', 'ready'),
        makeMoveInfo('epsilon', 'pending'),
      ];
      const entry = makeClassEntry(infos, infos.length);

      const def = createMinimalDef(['alpha', 'beta', 'gamma', 'delta', 'epsilon']);
      const rng = createRng(42n);
      const { state } = initialState(def, 42, 2);
      const actingPlayer = asPlayerId(0);
      const acc = createAccumulator();

      selectExpansionCandidateFamilyFirst(
        entry,
        new Set<string>(),
        new Map<string, number>(),
        1,    // maxVariantsBeforeCoverage
        0,    // pendingFamilyQuotaRoot — DISABLED
        null, // rootBestKey
        4,    // shortlistSize
        10,   // exhaustiveThreshold
        def, state, actingPlayer, rng,
        undefined, undefined, acc,
      );

      // With quota=0, no pending family discovery pass should run.
      assert.equal(acc.pendingFamilyQuotaUsed, 0, 'quota should not be used when set to 0');
    });
  });

  describe('no pending families — slots fall through to ready', () => {
    it('expands ready families normally when no pending families exist', () => {
      // All 5 families are ready.
      const infos = [
        makeMoveInfo('alpha', 'ready'),
        makeMoveInfo('beta', 'ready'),
        makeMoveInfo('gamma', 'ready'),
        makeMoveInfo('delta', 'ready'),
        makeMoveInfo('epsilon', 'ready'),
      ];
      const entry = makeClassEntry(infos, infos.length);

      const def = createMinimalDef(['alpha', 'beta', 'gamma', 'delta', 'epsilon']);
      const rng = createRng(42n);
      const { state } = initialState(def, 42, 2);
      const actingPlayer = asPlayerId(0);
      const acc = createAccumulator();

      const expandedKeys = new Set<string>();
      const familyCounts = new Map<string, number>();
      let currentRng = rng;
      const expandedFamilies = new Set<string>();

      // Expand all 5.
      for (let round = 0; round < 5; round += 1) {
        const result = selectExpansionCandidateFamilyFirst(
          entry, expandedKeys, familyCounts,
          1, 1, null, 4, 10,
          def, state, actingPlayer, currentRng,
          undefined, undefined, acc,
        );
        if (result === null) break;
        expandedKeys.add(result.candidate.moveKey);
        const fk = result.candidate.move.actionId;
        familyCounts.set(fk, (familyCounts.get(fk) ?? 0) + 1);
        expandedFamilies.add(fk);
        currentRng = result.rng;
      }

      // All 5 ready families should be expanded (no pending to reserve for).
      assert.equal(expandedFamilies.size, 5, 'all 5 ready families should be expanded');
      assert.equal(acc.pendingFamiliesTotal, 0, 'no pending families');
      assert.equal(acc.pendingFamilyQuotaUsed, 0, 'no quota used');
    });
  });

  describe('pending-family discovery from unknown candidates', () => {
    it('discovers pending families when quota > already-discovered count', () => {
      // 6 families: 4 ready (with variants to exceed threshold), 1 pending, 1 unknown.
      // With quota=2 and 1 already discovered, quotaRemaining=1.
      // The unknown candidate (from family 'zeta') is from an unrepresented
      // family, so the discovery pass should try to classify it.
      const infos = [
        makeMoveInfo('alpha', 'ready'),
        makeMoveInfo('alpha', 'ready', { v: 1 }),
        makeMoveInfo('beta', 'ready'),
        makeMoveInfo('beta', 'ready', { v: 1 }),
        makeMoveInfo('gamma', 'ready'),
        makeMoveInfo('gamma', 'ready', { v: 1 }),
        makeMoveInfo('delta', 'ready'),
        makeMoveInfo('delta', 'ready', { v: 1 }),
        makeMoveInfo('epsilon', 'pending'), // already discovered
        makeMoveInfo('zeta', 'unknown'),    // target for discovery
      ];
      const entry = makeClassEntry(infos, 9); // cursor at index 9 (zeta)

      const def = createMinimalDef(['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta']);
      const rng = createRng(42n);
      const { state } = initialState(def, 42, 2);
      const actingPlayer = asPlayerId(0);
      const acc = createAccumulator();

      selectExpansionCandidateFamilyFirst(
        entry,
        new Set<string>(),
        new Map<string, number>(),
        1,    // maxVariantsBeforeCoverage
        2,    // pendingFamilyQuotaRoot — looking for 2 pending families
        null, // rootBestKey
        4,    // shortlistSize
        3,    // exhaustiveThreshold — low so we use the lazy path
        def, state, actingPlayer, rng,
        undefined, undefined, acc,
      );

      // The 'zeta' unknown should have been classified by the discovery pass.
      const zetaInfo = entry.infos.find((i) => i.familyKey === 'zeta');
      assert.ok(zetaInfo !== undefined, 'zeta info should exist');
      assert.notEqual(zetaInfo.status, 'unknown', 'zeta should have been classified');

      // At least 1 pending family should be tracked (epsilon was pre-classified).
      assert.ok(acc.pendingFamiliesTotal >= 1, 'should track at least 1 pending family');
    });
  });
});
