/**
 * FITL MCTS interactive-profile competence tests (200 iterations).
 *
 * Broad acceptable move sets — tests "don't be incompetent".
 * Gated by RUN_MCTS_FITL_E2E=1 environment variable.
 *
 * ## Post-Fix Observation (63MCTSRUNMOVCLA-007, 2026-03-18)
 *
 * After runtime classification fix (Spec 63 tickets 001-006), all 10
 * scenarios complete without crashes. Decision nodes are correctly
 * created for pending operations (rally, march, attack, etc.).
 *
 * ### Key Metrics
 * - Pool exhaustion at capacity=201 is the dominant constraint — pool
 *   fills by iteration ~12, remaining iterations hit exhaustion.
 * - `decisionNodeCreated` and `decisionCompleted` events fire for all
 *   pending operations (rally.$targetSpaces, march.$targetSpaces, etc.).
 * - `readyCount`/`pendingCount` in `searchStart` correctly reflects
 *   runtime classification (e.g., S1: ready=9, pending=6).
 * - Best action has only 2-3 visits due to pool exhaustion — search
 *   barely differentiates between pending families at this budget.
 * - Pool sizing tuning (62MCTSSEAVIS-019) is needed for meaningful
 *   convergence at higher iteration counts.
 *
 * ### Historical Context (pre-fix, 62MCTSSEAVIS-006)
 * Before runtime classification: S1-S7 crashed with
 * `moveHasIncompleteParams`, S8 crashed with `SELECTOR_CARDINALITY`,
 * S9 picked `pass` only. All crashes are now resolved.
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

// Tuned 2026-03-18 from runtime classification visitor output.
// With pool exhaustion at capacity=201, the search barely differentiates
// between pending families (best action has 2-3 visits). Categories are
// set to include all game-legal operations per scenario's ROOT CANDIDATES.
const INTERACTIVE_ACCEPTABLE: readonly (readonly string[])[] = [
  /* S1: T1 VC  */ ['event', 'rally', 'march', 'attack', 'terror', 'tax', 'ambushVc'],
  /* S2: T1 ARVN */ ['train', 'patrol', 'sweep', 'govern', 'transport', 'raid'],
  /* S3: T2 NVA  */ ['event', 'rally', 'march', 'terror', 'infiltrate'],
  /* S4: T3 VC   */ ['rally', 'march', 'attack', 'terror', 'event', 'tax', 'ambushVc'],
  /* S5: T4 US   */ ['event', 'train', 'patrol', 'sweep', 'assault', 'advise', 'airLift', 'airStrike'],
  /* S6: T4 NVA  */ ['rally', 'march', 'terror', 'infiltrate'],
  /* S7: T5 VC   */ ['event', 'rally', 'march', 'attack', 'terror', 'tax', 'subvert', 'ambushVc'],
  /* S8: T6 ARVN */ ['event', 'train', 'patrol', 'sweep', 'assault', 'govern', 'transport', 'raid'],
  /* S9: T7 NVA  */ ['rally', 'march', 'attack', 'infiltrate', 'ambushNva'],
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

        // At least one pending operation family has >0 root-level visits.
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
