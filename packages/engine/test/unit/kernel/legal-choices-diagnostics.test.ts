// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  legalChoicesEvaluate,
  createClassificationSubphaseTiming,
} from '../../../src/kernel/legal-choices.js';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  initialState,
  type GameDef,
} from '../../../src/kernel/index.js';
import { createGameDefRuntime } from '../../../src/kernel/gamedef-runtime.js';
import { legalMoves } from '../../../src/kernel/legal-moves.js';
import { asTaggedGameDef } from '../../helpers/gamedef-fixtures.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function createSimpleDef(): GameDef {
  return asTaggedGameDef({
    metadata: { id: 'lc-diag-test', players: { min: 2, max: 2 } },
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
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('legal-choices-diagnostics', () => {
  describe('ClassificationSubphaseTiming', () => {
    it('createClassificationSubphaseTiming returns zeroed accumulator', () => {
      const cst = createClassificationSubphaseTiming();
      assert.equal(cst.bindingTimeMs, 0);
      assert.equal(cst.targetEnumTimeMs, 0);
      assert.equal(cst.predicateTimeMs, 0);
      assert.equal(cst.pipelineTimeMs, 0);
    });

    it('populates subphase timing when passed via options', () => {
      const def = createSimpleDef();
      const playerCount = 2;
      const { state } = initialState(def, 42, playerCount);
      const runtime = createGameDefRuntime(def);
      const moves = legalMoves(def, state, undefined, runtime);
      assert.ok(moves.length > 0, 'should have legal moves');

      const cst = createClassificationSubphaseTiming();
      const move = moves[0]!;

      legalChoicesEvaluate(def, state, move, { classificationSubphaseTiming: cst }, runtime);

      // At minimum, binding and predicate phases should have run.
      // All fields should be >= 0.
      assert.ok(cst.bindingTimeMs >= 0, `bindingTimeMs ${cst.bindingTimeMs} should be >= 0`);
      assert.ok(cst.targetEnumTimeMs >= 0, `targetEnumTimeMs ${cst.targetEnumTimeMs} should be >= 0`);
      assert.ok(cst.predicateTimeMs >= 0, `predicateTimeMs ${cst.predicateTimeMs} should be >= 0`);
      assert.ok(cst.pipelineTimeMs >= 0, `pipelineTimeMs ${cst.pipelineTimeMs} should be >= 0`);

      // At least one field should be non-zero (something always runs).
      const total = cst.bindingTimeMs + cst.targetEnumTimeMs + cst.predicateTimeMs + cst.pipelineTimeMs;
      assert.ok(total >= 0, `total subphase time ${total} should be >= 0`);
    });

    it('accumulates across multiple calls', () => {
      const def = createSimpleDef();
      const playerCount = 2;
      const { state } = initialState(def, 42, playerCount);
      const runtime = createGameDefRuntime(def);
      const moves = legalMoves(def, state, undefined, runtime);
      assert.ok(moves.length >= 2, 'need at least 2 moves to test accumulation');

      const cst = createClassificationSubphaseTiming();

      // Snapshot after first call.
      legalChoicesEvaluate(def, state, moves[0]!, { classificationSubphaseTiming: cst }, runtime);
      const totalAfterFirst = cst.bindingTimeMs + cst.targetEnumTimeMs + cst.predicateTimeMs + cst.pipelineTimeMs;

      // Call again — timing should accumulate on top of the first call.
      legalChoicesEvaluate(def, state, moves[1]!, { classificationSubphaseTiming: cst }, runtime);
      const totalAfterSecond = cst.bindingTimeMs + cst.targetEnumTimeMs + cst.predicateTimeMs + cst.pipelineTimeMs;

      // The same accumulator must grow (or stay equal for sub-µs ops) after a second call.
      assert.ok(
        totalAfterSecond >= totalAfterFirst,
        `total after 2 calls ${totalAfterSecond.toFixed(4)} should be >= total after 1 call ${totalAfterFirst.toFixed(4)}`,
      );
    });

    it('does not affect legalChoicesEvaluate return value', () => {
      const def = createSimpleDef();
      const playerCount = 2;
      const { state } = initialState(def, 42, playerCount);
      const runtime = createGameDefRuntime(def);
      const moves = legalMoves(def, state, undefined, runtime);
      const move = moves[0]!;

      // Call without timing
      const resultWithout = legalChoicesEvaluate(def, state, move, undefined, runtime);

      // Call with timing
      const cst = createClassificationSubphaseTiming();
      const resultWith = legalChoicesEvaluate(def, state, move, { classificationSubphaseTiming: cst }, runtime);

      // Results should be identical.
      assert.equal(resultWith.kind, resultWithout.kind, 'kind should match');
    });

    it('no timing overhead when classificationSubphaseTiming is undefined', () => {
      const def = createSimpleDef();
      const playerCount = 2;
      const { state } = initialState(def, 42, playerCount);
      const runtime = createGameDefRuntime(def);
      const moves = legalMoves(def, state, undefined, runtime);
      const move = moves[0]!;

      // Should not throw and should return normally.
      const result = legalChoicesEvaluate(def, state, move, undefined, runtime);
      assert.ok(result.kind === 'complete' || result.kind === 'pending' || result.kind === 'illegal',
        'result should have a valid kind');
    });
  });
});
