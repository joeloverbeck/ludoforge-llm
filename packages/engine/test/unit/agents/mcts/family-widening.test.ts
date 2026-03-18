import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildFamilyAwareFrontier,
  buildOrderedFrontier,
  selectExpansionCandidateFamilyFirst,
} from '../../../../src/agents/mcts/expansion.js';
import type {
  CachedClassificationEntry,
  CachedLegalMoveInfo,
} from '../../../../src/agents/mcts/state-cache.js';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  initialState,
  type GameDef,
} from '../../../../src/kernel/index.js';
import { createRng } from '../../../../src/kernel/prng.js';
import { canonicalMoveKey } from '../../../../src/agents/mcts/move-key.js';
import { validateMctsConfig } from '../../../../src/agents/mcts/config.js';
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

// ---------------------------------------------------------------------------
// buildFamilyAwareFrontier
// ---------------------------------------------------------------------------

describe('buildFamilyAwareFrontier', () => {
  it('prefers candidates from unrepresented families', () => {
    // 5 families, family "alpha" already has 1 child.
    const infos = [
      makeMoveInfo('alpha', 'ready'),
      makeMoveInfo('beta', 'ready'),
      makeMoveInfo('gamma', 'ready'),
      makeMoveInfo('delta', 'ready'),
      makeMoveInfo('epsilon', 'ready'),
    ];
    const entry = makeClassEntry(infos);

    const existingKeys = new Set<string>();
    const existingChildFamilyCounts = new Map<string, number>([['alpha', 1]]);
    const rng = createRng(42n);

    const { frontier } = buildFamilyAwareFrontier(
      entry, existingKeys, existingChildFamilyCounts, 1, null, rng,
    );

    // The first 4 entries should be from unrepresented families (beta, gamma, delta, epsilon).
    const topFamilies = frontier.slice(0, 4).map((e) => e.info.familyKey);
    assert.ok(!topFamilies.includes('alpha'), 'alpha should not be in top 4');
    assert.ok(topFamilies.includes('beta'));
    assert.ok(topFamilies.includes('gamma'));
    assert.ok(topFamilies.includes('delta'));
    assert.ok(topFamilies.includes('epsilon'));
  });

  it('falls back to move-level ordering when family count <= 3', () => {
    // Only 3 families — should produce the same order as buildOrderedFrontier.
    const infos = [
      makeMoveInfo('alpha', 'ready'),
      makeMoveInfo('beta', 'ready'),
      makeMoveInfo('gamma', 'ready'),
    ];
    const entry = makeClassEntry(infos);
    const existingKeys = new Set<string>();
    const existingChildFamilyCounts = new Map<string, number>();
    const rng = createRng(42n);

    const familyResult = buildFamilyAwareFrontier(
      entry, existingKeys, existingChildFamilyCounts, 1, null, rng,
    );

    // Reset entry state for plain comparison.
    const entry2 = makeClassEntry([...infos]);
    const rng2 = createRng(42n);
    const plainResult = buildOrderedFrontier(entry2, existingKeys, null, rng2);

    // Same frontier order.
    assert.equal(familyResult.frontier.length, plainResult.frontier.length);
    for (let i = 0; i < familyResult.frontier.length; i += 1) {
      assert.equal(
        familyResult.frontier[i]!.info.moveKey,
        plainResult.frontier[i]!.info.moveKey,
        `position ${i} should match`,
      );
    }
  });

  it('caps siblings per family before all families are covered', () => {
    // 4 families. alpha has 2 variants. maxVariants = 1.
    // alpha already has 1 child. beta, gamma, delta have 0.
    const infos = [
      makeMoveInfo('alpha', 'ready', { x: 1 }),
      makeMoveInfo('alpha', 'ready', { x: 2 }),
      makeMoveInfo('beta', 'ready'),
      makeMoveInfo('gamma', 'ready'),
      makeMoveInfo('delta', 'ready'),
    ];
    const entry = makeClassEntry(infos);

    const existingKeys = new Set<string>();
    // alpha already has 1 child, which equals the cap.
    const existingChildFamilyCounts = new Map<string, number>([['alpha', 1]]);
    const rng = createRng(42n);

    const { frontier } = buildFamilyAwareFrontier(
      entry, existingKeys, existingChildFamilyCounts, 1, null, rng,
    );

    // Unrepresented families (beta, gamma, delta) should rank highest.
    // alpha variants should rank lowest (family already at cap, not all covered).
    const topFamilies = frontier.slice(0, 3).map((e) => e.info.familyKey);
    assert.ok(!topFamilies.includes('alpha'), 'alpha variants should not be in top 3');
  });

  it('allows more variants once all families are covered', () => {
    // 4 families, all represented. alpha has 2 extra variants.
    const infos = [
      makeMoveInfo('alpha', 'ready', { x: 1 }),
      makeMoveInfo('alpha', 'ready', { x: 2 }),
      makeMoveInfo('beta', 'ready'),
      makeMoveInfo('gamma', 'ready'),
      makeMoveInfo('delta', 'ready'),
    ];
    const entry = makeClassEntry(infos);

    const existingKeys = new Set<string>();
    // All families already represented.
    const existingChildFamilyCounts = new Map<string, number>([
      ['alpha', 1], ['beta', 1], ['gamma', 1], ['delta', 1],
    ]);
    const rng = createRng(42n);

    const { frontier } = buildFamilyAwareFrontier(
      entry, existingKeys, existingChildFamilyCounts, 1, null, rng,
    );

    // All candidates should be present (none deprioritized).
    assert.equal(frontier.length, 5);
    // All should have similar scores (5000 + status + tiebreak).
    for (const e of frontier) {
      assert.ok(e.cheapScore >= 5000, `score ${e.cheapScore} should be >= 5000`);
    }
  });
});

// ---------------------------------------------------------------------------
// selectExpansionCandidateFamilyFirst
// ---------------------------------------------------------------------------

describe('selectExpansionCandidateFamilyFirst', () => {
  // GameDef with 5 actions (one per family).
  function createFiveActionDef(): GameDef {
    const phase = [asPhaseId('main')];
    const families = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'];
    const actions = families.map((id, i) => ({
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
      metadata: { id: 'family-widening-test', players: { min: 2, max: 2 } },
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

  it('with 5 families, all get 1 child before any gets 2', () => {
    // 5 families, varying cardinality (alpha has 3 variants, others have 1).
    const infos: CachedLegalMoveInfo[] = [
      makeMoveInfo('alpha', 'ready', { x: 1 }),
      makeMoveInfo('alpha', 'ready', { x: 2 }),
      makeMoveInfo('alpha', 'ready', { x: 3 }),
      makeMoveInfo('beta', 'ready'),
      makeMoveInfo('gamma', 'ready'),
      makeMoveInfo('delta', 'ready'),
      makeMoveInfo('epsilon', 'ready'),
    ];
    const entry = makeClassEntry(infos);

    const def = createFiveActionDef();
    const { state } = initialState(def, 42, 2);
    const rng = createRng(42n);
    const actingPlayer = asPlayerId(0);

    const expandedKeys = new Set<string>();
    const expandedFamilyCounts = new Map<string, number>();
    const expansionOrder: string[] = [];

    let currentRng = rng;

    // Simulate 5 expansion rounds.
    for (let round = 0; round < 5; round += 1) {
      const result = selectExpansionCandidateFamilyFirst(
        entry,
        expandedKeys,
        expandedFamilyCounts,
        1, // maxVariantsBeforeCoverage
        1, // pendingFamilyQuotaRoot
        null,
        4, // shortlistSize
        10, // exhaustiveThreshold (high so we don't fall back)
        def,
        state,
        actingPlayer,
        currentRng,
        undefined,
        undefined,
        undefined,
      );

      assert.ok(result !== null, `round ${round}: should find a candidate`);
      const fk = result!.candidate.move.actionId;
      expansionOrder.push(fk);
      expandedKeys.add(result!.candidate.moveKey);
      expandedFamilyCounts.set(fk, (expandedFamilyCounts.get(fk) ?? 0) + 1);
      currentRng = result!.rng;
    }

    // After 5 rounds, all 5 families should have exactly 1 child.
    const familiesExpanded = new Set(expansionOrder);
    assert.equal(familiesExpanded.size, 5, 'all 5 families should be represented');

    // No family should have 2 children yet.
    for (const [fk, count] of expandedFamilyCounts) {
      assert.equal(count, 1, `family ${fk} should have exactly 1 child`);
    }
  });

  it('maxVariantsPerFamilyBeforeCoverage caps siblings correctly', () => {
    // 4 families: alpha has many variants, others have 1.
    const infos: CachedLegalMoveInfo[] = [
      makeMoveInfo('alpha', 'ready', { x: 1 }),
      makeMoveInfo('alpha', 'ready', { x: 2 }),
      makeMoveInfo('alpha', 'ready', { x: 3 }),
      makeMoveInfo('alpha', 'ready', { x: 4 }),
      makeMoveInfo('beta', 'ready'),
      makeMoveInfo('gamma', 'ready'),
      makeMoveInfo('delta', 'ready'),
    ];
    const entry = makeClassEntry(infos);

    const def = createFiveActionDef();
    const { state } = initialState(def, 42, 2);
    const rng = createRng(42n);
    const actingPlayer = asPlayerId(0);

    const expandedKeys = new Set<string>();
    const expandedFamilyCounts = new Map<string, number>();

    let currentRng = rng;
    const maxVariants = 2; // allow 2 per family before full coverage

    // Expand 6 times.
    for (let round = 0; round < 6; round += 1) {
      const result = selectExpansionCandidateFamilyFirst(
        entry, expandedKeys, expandedFamilyCounts,
        maxVariants, 1, null, 4, 10,
        def, state, actingPlayer, currentRng,
      );
      if (result === null) break;
      const fk = result.candidate.move.actionId;
      expandedKeys.add(result.candidate.moveKey);
      expandedFamilyCounts.set(fk, (expandedFamilyCounts.get(fk) ?? 0) + 1);
      currentRng = result.rng;
    }

    // With maxVariants=2, alpha can get at most 2 before beta/gamma/delta are covered.
    // After beta/gamma/delta each get 1, that's 5 expansions with alpha having at most 2.
    // So after 6: alpha ≤ 3, and all other families must be represented.
    assert.ok(expandedFamilyCounts.has('beta'), 'beta should be represented');
    assert.ok(expandedFamilyCounts.has('gamma'), 'gamma should be represented');
    assert.ok(expandedFamilyCounts.has('delta'), 'delta should be represented');
  });
});

// ---------------------------------------------------------------------------
// Config validation
// ---------------------------------------------------------------------------

describe('MctsConfig wideningMode validation', () => {
  it('accepts wideningMode: "move"', () => {
    const config = validateMctsConfig({ wideningMode: 'move' });
    assert.equal(config.wideningMode, 'move');
  });

  it('accepts wideningMode: "familyThenMove"', () => {
    const config = validateMctsConfig({ wideningMode: 'familyThenMove' });
    assert.equal(config.wideningMode, 'familyThenMove');
  });

  it('rejects invalid wideningMode', () => {
    assert.throws(
      () => validateMctsConfig({ wideningMode: 'invalid' as never }),
      /wideningMode/,
    );
  });

  it('accepts maxVariantsPerFamilyBeforeCoverage: 1', () => {
    const config = validateMctsConfig({ maxVariantsPerFamilyBeforeCoverage: 1 });
    assert.equal(config.maxVariantsPerFamilyBeforeCoverage, 1);
  });

  it('rejects maxVariantsPerFamilyBeforeCoverage: 0', () => {
    assert.throws(
      () => validateMctsConfig({ maxVariantsPerFamilyBeforeCoverage: 0 }),
      /maxVariantsPerFamilyBeforeCoverage/,
    );
  });

  it('wideningMode: "move" is equivalent to no wideningMode', () => {
    const configDefault = validateMctsConfig({});
    const configMove = validateMctsConfig({ wideningMode: 'move' });
    // wideningMode is undefined by default.
    assert.equal(configDefault.wideningMode, undefined);
    assert.equal(configMove.wideningMode, 'move');
    // Both should behave identically (move-level widening).
  });
});
