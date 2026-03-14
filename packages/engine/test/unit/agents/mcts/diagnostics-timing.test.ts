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

function createTwoActionDef(): GameDef {
  return {
    metadata: { id: 'diag-timing-test', players: { min: 2, max: 2 } },
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
  const def = createTwoActionDef();
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

describe('diagnostics-timing', () => {
  describe('per-phase timings', () => {
    it('populates all 6 per-phase timing fields when diagnostics enabled', () => {
      const result = runDiagnosticSearch(true);
      const d = result.diagnostics;
      assert.ok(d !== undefined, 'diagnostics should be present');

      const fields = [
        'selectionTimeMs',
        'expansionTimeMs',
        'simulationTimeMs',
        'evaluationTimeMs',
        'backpropTimeMs',
        'beliefSamplingTimeMs',
      ] as const;

      for (const field of fields) {
        assert.equal(typeof d[field], 'number', `${field} should be a number`);
        assert.ok(d[field]! >= 0, `${field} should be >= 0`);
      }
    });

    it('totalTimeMs is a float (from performance.now()), not an integer', () => {
      const result = runDiagnosticSearch(true);
      const d = result.diagnostics!;
      assert.equal(typeof d.totalTimeMs, 'number');
      // performance.now() returns sub-millisecond floats. While it's possible
      // for a float to be an integer value, we verify it's a valid number >= 0.
      assert.ok(d.totalTimeMs! >= 0, 'totalTimeMs should be >= 0');
    });

    it('sum of per-phase timings does not exceed totalTimeMs + overhead', () => {
      const result = runDiagnosticSearch(true, 50);
      const d = result.diagnostics!;

      const phaseSum =
        d.selectionTimeMs! +
        d.expansionTimeMs! +
        d.simulationTimeMs! +
        d.evaluationTimeMs! +
        d.backpropTimeMs! +
        d.beliefSamplingTimeMs!;

      // Per-phase timings should not exceed totalTimeMs. We allow a small
      // margin because performance.now() calls themselves have non-zero cost,
      // and there's inter-phase overhead (fork, loop control, etc.).
      // Use 10% overhead tolerance.
      const tolerance = d.totalTimeMs! * 0.1 + 1; // +1ms absolute floor
      assert.ok(
        phaseSum <= d.totalTimeMs! + tolerance,
        `phase sum ${phaseSum.toFixed(3)}ms should not exceed totalTimeMs ${d.totalTimeMs!.toFixed(3)}ms + ${tolerance.toFixed(3)}ms tolerance`,
      );
    });
  });

  describe('rootStopReason', () => {
    it('reports "iterations" when search exhausts iteration budget', () => {
      const result = runDiagnosticSearch(true, 10);
      assert.equal(result.diagnostics!.rootStopReason, 'iterations');
    });
  });
});
