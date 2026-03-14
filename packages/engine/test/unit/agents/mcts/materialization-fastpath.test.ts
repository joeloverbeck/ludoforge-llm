import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { materializeOrFastPath, materializeConcreteCandidates } from '../../../../src/agents/mcts/materialization.js';
import {
  asActionId,
  asPhaseId,
  initialState,
  type GameDef,
} from '../../../../src/kernel/index.js';
import { createRng } from '../../../../src/kernel/prng.js';
import { createGameDefRuntime } from '../../../../src/kernel/gamedef-runtime.js';
import { legalMoves } from '../../../../src/kernel/legal-moves.js';
import type { Move } from '../../../../src/kernel/types-core.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * Game with only concrete actions (empty params).
 */
function createAllConcreteDef(): GameDef {
  return {
    metadata: { id: 'all-concrete', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [{ name: 'vp', type: 'int', init: 0, min: 0, max: 10 }],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [
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
      {
        id: asActionId('gain'),
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [{ setVar: { scope: 'pvar', player: 'actor', var: 'vp', value: 5 } }],
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

/**
 * Game with a mix of concrete and template actions.
 * The template action has a param with domain.
 */
function createMixedDef(): GameDef {
  return {
    metadata: { id: 'mixed-template', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [{ name: 'vp', type: 'int', init: 0, min: 0, max: 10 }],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [
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
      {
        id: asActionId('choose_amount'),
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [
          {
            name: 'amount',
            domain: { query: 'intsInRange', min: 1, max: 3 },
          },
        ],
        pre: null,
        cost: [],
        effects: [{ setVar: { scope: 'pvar', player: 'actor', var: 'vp', value: { ref: 'param', param: 'amount' } } }],
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
// concreteActionIds in GameDefRuntime
// ---------------------------------------------------------------------------

describe('concreteActionIds in GameDefRuntime', () => {
  it('correctly identifies actions with no template parameters', () => {
    const def = createAllConcreteDef();
    const runtime = createGameDefRuntime(def);

    assert.ok(runtime.concreteActionIds.has('noop'), '"noop" should be concrete');
    assert.ok(runtime.concreteActionIds.has('gain'), '"gain" should be concrete');
    assert.equal(runtime.concreteActionIds.size, 2, 'all actions should be concrete');
  });

  it('excludes actions with template parameters', () => {
    const def = createMixedDef();
    const runtime = createGameDefRuntime(def);

    assert.ok(runtime.concreteActionIds.has('noop'), '"noop" should be concrete');
    assert.ok(!runtime.concreteActionIds.has('choose_amount'), '"choose_amount" should NOT be concrete');
    assert.equal(runtime.concreteActionIds.size, 1, 'only one concrete action');
  });
});

// ---------------------------------------------------------------------------
// materializeOrFastPath
// ---------------------------------------------------------------------------

describe('materializeOrFastPath', () => {
  it('uses fast path when all moves come from fully-concrete actions', () => {
    const def = createAllConcreteDef();
    const playerCount = 2;
    const { state } = initialState(def, 42, playerCount);
    const runtime = createGameDefRuntime(def);
    const moves = legalMoves(def, state, undefined, runtime);
    const rng = createRng(42n);

    const result = materializeOrFastPath(def, state, moves, rng, 2, runtime);

    assert.equal(result.fastPath, true, 'should use fast path');
    assert.ok(result.candidates.length > 0, 'should produce candidates');
    // RNG should be unchanged on fast path (no materialization randomness needed)
    assert.deepEqual(result.rng, rng, 'RNG should not be consumed on fast path');
  });

  it('falls back to full materialization when any move has template params', () => {
    const def = createMixedDef();
    const playerCount = 2;
    const { state } = initialState(def, 42, playerCount);
    const runtime = createGameDefRuntime(def);
    const moves = legalMoves(def, state, undefined, runtime);
    const rng = createRng(42n);

    const result = materializeOrFastPath(def, state, moves, rng, 2, runtime);

    assert.equal(result.fastPath, false, 'should use full materialization');
    assert.ok(result.candidates.length > 0, 'should produce candidates');
  });

  it('produces same candidates as full materialization for concrete actions', () => {
    const def = createAllConcreteDef();
    const playerCount = 2;
    const { state } = initialState(def, 42, playerCount);
    const runtime = createGameDefRuntime(def);
    const moves = legalMoves(def, state, undefined, runtime);
    const rng = createRng(42n);

    const fastResult = materializeOrFastPath(def, state, moves, rng, 2, runtime);
    const fullResult = materializeConcreteCandidates(def, state, moves, rng, 2, runtime);

    // Both should produce the same set of move keys.
    const fastKeys = new Set(fastResult.candidates.map(c => c.moveKey));
    const fullKeys = new Set(fullResult.candidates.map(c => c.moveKey));
    assert.deepEqual(fastKeys, fullKeys, 'fast path and full materialization should produce same candidates');
  });

  it('deduplicates candidates on fast path', () => {
    const def = createAllConcreteDef();
    const playerCount = 2;
    const { state } = initialState(def, 42, playerCount);
    const runtime = createGameDefRuntime(def);
    // Create duplicate moves manually
    const move: Move = { actionId: asActionId('noop'), params: {} };
    const duplicateMoves: readonly Move[] = [move, move, move];
    const rng = createRng(42n);

    const result = materializeOrFastPath(def, state, duplicateMoves, rng, 2, runtime);

    assert.equal(result.fastPath, true);
    assert.equal(result.candidates.length, 1, 'duplicates should be removed');
  });
});
