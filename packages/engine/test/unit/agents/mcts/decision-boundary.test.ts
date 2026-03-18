/**
 * Unit tests for the decision-boundary module.
 *
 * Validates that resolveDecisionBoundary is importable from its dedicated
 * module and functions correctly: success path, failure path, diagnostics.
 *
 * Ticket: 64MCTSPEROPT-013
 */

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Move } from '../../../../src/kernel/types-core.js';
import { resolveDecisionBoundary } from '../../../../src/agents/mcts/decision-boundary.js';
import type { DecisionBoundaryResult } from '../../../../src/agents/mcts/decision-boundary.js';
import { createAccumulator } from '../../../../src/agents/mcts/diagnostics.js';
import {
  asActionId,
  asPhaseId,
  initialState,
  type GameDef,
} from '../../../../src/kernel/index.js';
import { createRng } from '../../../../src/kernel/prng.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const aid = asActionId;

/** VP race with a template "boost" action that has an int-range param. */
function createTemplateDef(): GameDef {
  const phase = [asPhaseId('main')];
  return {
    metadata: { id: 'decision-boundary-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [{ name: 'vp', type: 'int', init: 0, min: 0, max: 20 }],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [
      {
        id: aid('boost'),
        actor: 'active' as const,
        executor: 'actor' as const,
        phase,
        params: [
          { name: 'amount', domain: { query: 'intsInRange', min: 1, max: 3 } },
        ],
        pre: null,
        cost: [],
        effects: [
          { addVar: { scope: 'pvar', player: 'actor', var: 'vp', delta: 2 } },
        ],
        limits: [],
      },
    ],
    triggers: [],
    terminal: {
      conditions: [],
      scoring: { method: 'highest', value: { ref: 'pvar', player: 'actor', var: 'vp' } },
    },
  } as unknown as GameDef;
}

// ---------------------------------------------------------------------------
// AC 1: resolveDecisionBoundary importable from decision-boundary module
// ---------------------------------------------------------------------------

describe('decision-boundary: module extraction', () => {
  it('resolveDecisionBoundary is a function', () => {
    assert.equal(typeof resolveDecisionBoundary, 'function');
  });

  it('DecisionBoundaryResult type is usable', () => {
    // Type-level check — if this compiles, the type is correctly exported.
    const _check: DecisionBoundaryResult | null = null;
    assert.equal(_check, null);
  });
});

// ---------------------------------------------------------------------------
// AC 2: success path — completes partial move and returns result
// ---------------------------------------------------------------------------

describe('decision-boundary: success path', () => {
  it('resolves a partial move with amount filled in range [1,3]', () => {
    const def = createTemplateDef();
    const { state } = initialState(def, 42, 2);
    const partialMove: Move = { actionId: aid('boost'), params: {} };
    const rng = createRng(123n);

    const result = resolveDecisionBoundary(def, state, partialMove, rng);

    assert.notEqual(result, null);
    assert.ok('amount' in result!.move.params);
    const amount = result!.move.params.amount as number;
    assert.ok(amount >= 1 && amount <= 3, `amount ${amount} out of range`);
  });

  it('returns a different game state than the input', () => {
    const def = createTemplateDef();
    const { state } = initialState(def, 42, 2);
    const partialMove: Move = { actionId: aid('boost'), params: {} };
    const rng = createRng(456n);

    const result = resolveDecisionBoundary(def, state, partialMove, rng);

    assert.notEqual(result, null);
    assert.notDeepStrictEqual(result!.state, state);
  });
});

// ---------------------------------------------------------------------------
// AC 3: failure path — returns null on bad moves
// ---------------------------------------------------------------------------

describe('decision-boundary: failure path', () => {
  it('returns null for a nonexistent action', () => {
    const def = createTemplateDef();
    const { state } = initialState(def, 42, 2);
    const badMove: Move = { actionId: aid('nonexistent'), params: {} };
    const rng = createRng(789n);

    const result = resolveDecisionBoundary(def, state, badMove, rng);

    assert.equal(result, null);
  });
});

// ---------------------------------------------------------------------------
// AC 4: diagnostics accumulation
// ---------------------------------------------------------------------------

describe('decision-boundary: diagnostics', () => {
  it('increments applyMoveCalls and decisionCompletionsInRollout on success', () => {
    const def = createTemplateDef();
    const { state } = initialState(def, 42, 2);
    const partialMove: Move = { actionId: aid('boost'), params: {} };
    const rng = createRng(101n);
    const acc = createAccumulator();

    resolveDecisionBoundary(def, state, partialMove, rng, undefined, acc);

    assert.equal(acc.applyMoveCalls, 1);
    assert.equal(acc.decisionCompletionsInRollout, 1);
  });

  it('increments decisionBoundaryFailures on failure', () => {
    const def = createTemplateDef();
    const { state } = initialState(def, 42, 2);
    const badMove: Move = { actionId: aid('nonexistent'), params: {} };
    const rng = createRng(202n);
    const acc = createAccumulator();

    resolveDecisionBoundary(def, state, badMove, rng, undefined, acc);

    assert.equal(acc.decisionBoundaryFailures, 1);
    assert.equal(acc.applyMoveCalls, 0);
    assert.equal(acc.decisionCompletionsInRollout, 0);
  });

  it('does not increment simulation counters (hybridRolloutPlies, forcedMovePlies)', () => {
    const def = createTemplateDef();
    const { state } = initialState(def, 42, 2);
    const partialMove: Move = { actionId: aid('boost'), params: {} };
    const rng = createRng(303n);
    const acc = createAccumulator();

    resolveDecisionBoundary(def, state, partialMove, rng, undefined, acc);

    assert.equal(acc.hybridRolloutPlies, 0);
    assert.equal(acc.forcedMovePlies, 0);
  });
});
