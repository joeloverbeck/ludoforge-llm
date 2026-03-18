/**
 * FITL MCTS interactive-profile competence tests (200 iterations).
 *
 * Broad acceptable move sets — tests "don't be incompetent".
 * Gated by RUN_MCTS_FITL_E2E=1 environment variable.
 *
 * ## Baseline Observation (62MCTSSEAVIS-006, 2026-03-16)
 *
 * ConsoleVisitor wired in to capture MCTS search diagnostics.
 *
 * ### Scenario Results (10 scenarios)
 * - S1–S7: CRASH — `moveHasIncompleteParams` (template actions have
 *   unresolved decision parameters; MCTS tries to apply them without
 *   completing the decision sequence).
 * - S8: CRASH — `SELECTOR_CARDINALITY` (zone selector resolved to 0 or >1
 *   zones during effect execution, distinct from the decision-param issue).
 * - S9: WRONG CATEGORY — search completes but picks `pass` instead of
 *   expected [attack, march, rally].
 * - S10 (victory-trend): PASS — coup pacification search completes
 *   (200 iterations, 251 s) and picks `coupPacifyUS`.
 *
 * ### Crash Root Cause
 * All S1–S7 crashes share the same pattern: MCTS expands a template move
 * (e.g., `train`, `sweep`, `assault`) without completing its decision
 * sequence. The move reaches `applyMove` with `params={}` and the kernel
 * rejects it as `moveHasIncompleteParams` because the first `chooseN` /
 * `chooseOne` decision is unresolved. This is the exact gap that the
 * decision-node architecture (Spec 62 Phase 2+) is designed to fill.
 *
 * ### applyMoveFailure Breakdown (408 total, all in `expansion` phase)
 * | actionId     | count | blocked decision        |
 * |------------- |------:|-------------------------|
 * | train        |    56 | $targetSpaces           |
 * | patrol       |    56 | $targetLoCs             |
 * | assault      |    51 | $targetSpaces           |
 * | event        |    48 | (various per card)      |
 * | sweep        |    47 | $targetSpaces           |
 * | transport    |    34 | $transportOrigin        |
 * | raid         |    34 | $targetSpaces           |
 * | govern       |    34 | $targetSpaces           |
 * | advise       |    22 | $targetCity             |
 * | airStrike    |    13 | $arcLightNoCoinProvinces|
 * | airLift      |    13 | $spaces                 |
 *
 * ### Move Drop / Pool Exhaustion
 * - `moveDropped` events: 0
 * - `poolExhausted` events: 0
 *
 * ### Search Completion
 * - 10 `searchStart` events fired (one per scenario).
 * - Only 2 `searchComplete` events (S9 and S10). The other 8 searches
 *   crash mid-iteration when a template move with incomplete params is
 *   selected during expansion and fed to `applyMove`.
 *
 * ### Pool Utilization
 * - Pool capacity: 201 across all scenarios.
 * - S9 (the only completed category search): 193 nodes allocated at
 *   iteration 200 (96% utilization).
 * - S10 (victory): 200 nodes allocated (99.5% utilization).
 *
 * ### Implications for Decision-Node Work
 * 1. Template moves are the dominant failure mode — every FITL operation
 *    with `chooseN`/`chooseOne` decisions crashes without decision nodes.
 * 2. `$targetSpaces` is the most common blocked decision (248 of 408).
 * 3. No `moveDropped` events means the search doesn't pre-filter
 *    these — it tries to expand them and crashes. Decision nodes must
 *    intercept *before* `applyMove`.
 * 4. Pool is adequate at 201 for 200 iterations.
 */
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { applyMove } from '../../../src/kernel/index.js';
import { createConsoleVisitor } from '../../helpers/mcts-console-visitor.js';

import {
  RUN_MCTS_FITL_E2E,
  compileFitlDef,
  createPlaybookBaseState,
  replayToDecisionPoint,
  runFitlMctsSearch,
  assertMoveCategory,
  assertVictoryNonDegrading,
  computeUsVictory,
  CATEGORY_SCENARIOS,
  VICTORY_SCENARIO,
} from './fitl-mcts-test-helpers.js';

// ---------------------------------------------------------------------------
// Interactive profile: broad acceptable categories
// ---------------------------------------------------------------------------

const INTERACTIVE_ACCEPTABLE: readonly (readonly string[])[] = [
  /* S1: T1 VC  */ ['event', 'terror', 'rally'],
  /* S2: T1 ARVN */ ['train', 'patrol', 'sweep', 'assault'],
  /* S3: T2 NVA  */ ['rally', 'march', 'attack'],
  /* S4: T3 VC   */ ['rally', 'terror', 'event', 'march'],
  /* S5: T4 US   */ ['event', 'sweep', 'assault'],
  /* S6: T4 NVA  */ ['march', 'rally', 'attack'],
  /* S7: T5 VC   */ ['event', 'terror', 'rally'],
  /* S8: T6 ARVN */ ['sweep', 'assault', 'patrol', 'train'],
  /* S9: T7 NVA  */ ['attack', 'march', 'rally'],
];

describe('FITL MCTS interactive-profile competence', { skip: !RUN_MCTS_FITL_E2E }, () => {
  const def = compileFitlDef();
  const baseState = createPlaybookBaseState(def);
  const visitor = createConsoleVisitor('[MCTS-INTERACTIVE]');

  describe('move-category competence', () => {
    for (const [i, scenario] of CATEGORY_SCENARIOS.entries()) {
      it(scenario.label, () => {
        const state = replayToDecisionPoint(def, baseState, scenario.turnIndex, scenario.moveIndex);
        const result = runFitlMctsSearch(def, state, scenario.playerId, 'interactive', visitor);
        assertMoveCategory(result.move, INTERACTIVE_ACCEPTABLE[i]!, scenario.label);
      });
    }
  });

  describe('pending-family coverage', () => {
    // Pending FITL operations (rally, march, attack, train) must not be starved.
    const PENDING_FAMILIES = ['rally', 'march', 'attack', 'train'];

    for (const scenario of CATEGORY_SCENARIOS) {
      it(`${scenario.label} — pending families receive visits`, () => {
        const state = replayToDecisionPoint(def, baseState, scenario.turnIndex, scenario.moveIndex);
        const result = runFitlMctsSearch(def, state, scenario.playerId, 'interactive', visitor);
        const d = result.diagnostics;

        // At least one pending family must have received visits
        assert.ok(
          (d.pendingFamiliesWithVisits ?? 0) > 0,
          `${scenario.label}: pendingFamiliesWithVisits should be >0, got ${d.pendingFamiliesWithVisits ?? 0}`,
        );

        // At least one pending operation family has >0 root-level visits
        const visits = d.rootChildVisits;
        const pendingWithVisits = PENDING_FAMILIES.filter((family) =>
          Object.keys(visits).some((key) => key.startsWith(family) && visits[key]! > 0),
        );
        assert.ok(
          pendingWithVisits.length > 0,
          `${scenario.label}: expected at least one of [${PENDING_FAMILIES.join(', ')}] to have root visits, got none. Visits: ${JSON.stringify(visits)}`,
        );
      });
    }
  });

  describe('victory-trend competence', () => {
    it(VICTORY_SCENARIO.label, () => {
      const stateBefore = replayToDecisionPoint(
        def, baseState, VICTORY_SCENARIO.turnIndex, VICTORY_SCENARIO.moveIndex,
      );
      const result = runFitlMctsSearch(def, stateBefore, VICTORY_SCENARIO.playerId, 'interactive', visitor);
      const stateAfter = applyMove(def, stateBefore, result.move).state;
      assertVictoryNonDegrading(def, stateBefore, stateAfter, computeUsVictory, 3, VICTORY_SCENARIO.label);
    });
  });
});
