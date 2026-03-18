/**
 * FITL MCTS pending-starvation regression test.
 *
 * Validates that pending FITL operations (rally, march, attack, train) are
 * not starved when high-cardinality ready families dominate the move list.
 *
 * Uses `wideningMode: 'familyThenMove'` with `pendingFamilyQuotaRoot: 1`
 * and asserts that at least one pending family gets visits within 100
 * iterations.
 *
 * Gated by RUN_MCTS_FITL_E2E=1 environment variable.
 */
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createGameDefRuntime,
  createRng,
  derivePlayerObservation,
  fork,
  legalMoves,
} from '../../../src/kernel/index.js';

import {
  resolveBudgetProfile,
  runSearch,
  createRootNode,
  createNodePool,
} from '../../../src/agents/index.js';

import {
  RUN_MCTS_FITL_E2E,
  compileFitlDef,
  createPlaybookBaseState,
  replayToDecisionPoint,
  CATEGORY_SCENARIOS,
} from './fitl-mcts-test-helpers.js';

// ---------------------------------------------------------------------------
// Pending-starvation regression
// ---------------------------------------------------------------------------

const PENDING_FAMILIES = ['rally', 'march', 'attack', 'train'];

describe('FITL MCTS pending-starvation regression', { skip: !RUN_MCTS_FITL_E2E }, () => {
  const def = compileFitlDef();
  const baseState = createPlaybookBaseState(def);

  // Use S1 (T1 VC — Burning Bonze) and S3 (T2 NVA — Trucks) as stress
  // scenarios: both have high-cardinality ready families alongside pending
  // operations.
  const stressScenarios = [CATEGORY_SCENARIOS[0]!, CATEGORY_SCENARIOS[2]!];

  for (const scenario of stressScenarios) {
    it(`${scenario.label} — pending family visits with familyThenMove widening (100 iters)`, () => {
      const state = replayToDecisionPoint(def, baseState, scenario.turnIndex, scenario.moveIndex);

      // Build config with familyThenMove widening and explicit pending quota.
      const baseConfig = resolveBudgetProfile('interactive');
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { timeLimitMs: _, ...configWithoutTime } = baseConfig;
      const config = {
        ...configWithoutTime,
        iterations: 100,
        minIterations: 0,
        wideningMode: 'familyThenMove' as const,
        pendingFamilyQuotaRoot: 1,
        diagnostics: true as const,
      };

      const runtime = createGameDefRuntime(def);
      const rng = createRng(BigInt(42 + 7777));
      const moves = legalMoves(def, state, undefined, runtime);
      assert.ok(moves.length >= 2, `Expected ≥2 legal moves, got ${moves.length}`);

      const observation = derivePlayerObservation(def, state, scenario.playerId);
      const root = createRootNode(state.playerCount);
      const poolCapacity = Math.max(config.iterations + 1, moves.length * 4);
      const pool = createNodePool(poolCapacity, state.playerCount);
      const [searchRng] = fork(rng);

      const result = runSearch(
        root, def, state, observation, scenario.playerId,
        config, searchRng, moves, runtime, pool,
      );

      assert.ok(result.diagnostics !== undefined, 'Expected diagnostics to be present');
      const d = result.diagnostics;

      // Core assertion: pending families must not be starved.
      assert.ok(
        (d.pendingFamiliesWithVisits ?? 0) > 0,
        `${scenario.label}: pendingFamiliesWithVisits should be >0, got ${d.pendingFamiliesWithVisits ?? 0}`,
      );

      // Verify at least one pending operation family has root-level visits.
      // Root child keys may use regular format (e.g., 'rally{...}') or
      // decision root format (e.g., 'D:rally').
      const visits = d.rootChildVisits;
      const pendingWithVisits = PENDING_FAMILIES.filter((family) =>
        Object.keys(visits).some((key) =>
          (key.startsWith(family) || key === `D:${family}`) && visits[key]! > 0,
        ),
      );
      assert.ok(
        pendingWithVisits.length > 0,
        `${scenario.label}: expected at least one of [${PENDING_FAMILIES.join(', ')}] with root visits, got none. Visits: ${JSON.stringify(visits)}`,
      );

      // Verify pendingFamiliesStarved is less than total pending families.
      // With decision root expansion, pending families are discovered
      // structurally rather than via the classification quota pass.
      const starved = d.pendingFamiliesStarved ?? 0;
      const total = d.pendingFamiliesTotal ?? 0;
      assert.ok(
        total > 0,
        `${scenario.label}: pendingFamiliesTotal should be >0, got ${total}`,
      );
      assert.ok(
        starved < total,
        `${scenario.label}: pendingFamiliesStarved (${starved}) should be < pendingFamiliesTotal (${total})`,
      );
    });
  }
});
