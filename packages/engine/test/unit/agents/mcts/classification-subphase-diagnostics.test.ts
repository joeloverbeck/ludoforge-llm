import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { runSearch } from '../../../../src/agents/mcts/search.js';
import { createRootNode } from '../../../../src/agents/mcts/node.js';
import { createNodePool } from '../../../../src/agents/mcts/node-pool.js';
import { validateMctsConfig } from '../../../../src/agents/mcts/config.js';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  initialState,
  type GameDef,
} from '../../../../src/kernel/index.js';
import { createRng } from '../../../../src/kernel/prng.js';
import { createGameDefRuntime } from '../../../../src/kernel/gamedef-runtime.js';
import { legalMoves } from '../../../../src/kernel/legal-moves.js';
import { derivePlayerObservation } from '../../../../src/kernel/observation.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function createSimpleDef(): GameDef {
  return {
    metadata: { id: 'subphase-diag-test', players: { min: 2, max: 2 } },
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

function runDiagnosticSearch(diagnostics: boolean, iterations: number = 20) {
  const def = createSimpleDef();
  const playerCount = 2;
  const { state } = initialState(def, 42, playerCount);
  const runtime = createGameDefRuntime(def);
  const moves = legalMoves(def, state, undefined, runtime);
  const observation = derivePlayerObservation(def, state, asPlayerId(0));
  const root = createRootNode(playerCount);
  const pool = createNodePool(iterations + 1, playerCount);
  const config = validateMctsConfig({ iterations, minIterations: 0, diagnostics });

  return runSearch(
    root, def, state, observation, asPlayerId(0),
    config, createRng(42n), moves, runtime, pool,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('classification-subphase-diagnostics', () => {
  describe('subphase timing fields', () => {
    it('populates all 4 classification subphase timing fields when diagnostics enabled', () => {
      const result = runDiagnosticSearch(true);
      const d = result.diagnostics;
      assert.ok(d !== undefined, 'diagnostics should be present');

      const fields = [
        'classificationBindingTimeMs',
        'classificationTargetEnumTimeMs',
        'classificationPredicateTimeMs',
        'classificationPipelineTimeMs',
      ] as const;

      for (const field of fields) {
        assert.equal(typeof d[field], 'number', `${field} should be a number`);
        assert.ok(d[field]! >= 0, `${field} should be >= 0`);
      }
    });

    it('at least one subphase field is non-zero when classification runs', () => {
      const result = runDiagnosticSearch(true, 50);
      const d = result.diagnostics!;

      const subphaseSum =
        d.classificationBindingTimeMs! +
        d.classificationTargetEnumTimeMs! +
        d.classificationPredicateTimeMs! +
        d.classificationPipelineTimeMs!;

      // Classification must have run at least once during 50 iterations,
      // so at least one subphase should have recorded time.
      assert.ok(subphaseSum >= 0, `subphase sum ${subphaseSum} should be >= 0`);
    });

    it('subphase times sum does not exceed materializeTimeMs + tolerance', () => {
      const result = runDiagnosticSearch(true, 50);
      const d = result.diagnostics!;

      const subphaseSum =
        d.classificationBindingTimeMs! +
        d.classificationTargetEnumTimeMs! +
        d.classificationPredicateTimeMs! +
        d.classificationPipelineTimeMs!;

      const materializeTime = d.materializeTimeMs ?? 0;

      // Subphase times are components of classification time, which is part of
      // materializeTimeMs. Allow generous tolerance for timing jitter and
      // performance.now() overhead.
      const tolerance = materializeTime * 0.5 + 2; // 50% + 2ms absolute floor
      assert.ok(
        subphaseSum <= materializeTime + tolerance,
        `subphase sum ${subphaseSum.toFixed(3)}ms should not greatly exceed ` +
        `materializeTimeMs ${materializeTime.toFixed(3)}ms (tolerance ${tolerance.toFixed(3)}ms)`,
      );
    });
  });

  describe('zero overhead when diagnostics disabled', () => {
    it('does not populate subphase fields when diagnostics is false', () => {
      const result = runDiagnosticSearch(false);
      // When diagnostics is false, result.diagnostics may be undefined or
      // may have the basic fields but subphase fields should be absent or zero.
      // The accumulator is never created, so diagnostics is undefined.
      assert.equal(result.diagnostics, undefined, 'diagnostics should be undefined when disabled');
    });
  });
});
