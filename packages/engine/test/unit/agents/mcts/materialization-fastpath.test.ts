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
// GameDefRuntime no longer has concreteActionIds
// ---------------------------------------------------------------------------

describe('GameDefRuntime without concreteActionIds', () => {
  it('createGameDefRuntime succeeds without concreteActionIds', () => {
    const def = createAllConcreteDef();
    const runtime = createGameDefRuntime(def);

    assert.ok(runtime.adjacencyGraph !== undefined, 'should have adjacencyGraph');
    assert.ok(runtime.runtimeTableIndex !== undefined, 'should have runtimeTableIndex');
    assert.ok(runtime.zobristTable !== undefined, 'should have zobristTable');
    assert.ok(runtime.ruleCardCache !== undefined, 'should have ruleCardCache');
  });

  it('runtime object has no concreteActionIds property', () => {
    const def = createMixedDef();
    const runtime = createGameDefRuntime(def);

    assert.equal(
      'concreteActionIds' in runtime,
      false,
      'concreteActionIds should not exist on runtime',
    );
  });
});

// ---------------------------------------------------------------------------
// materializeOrFastPath
// ---------------------------------------------------------------------------

describe('materializeOrFastPath', () => {
  it('always uses full materialization (no fast path)', () => {
    const def = createAllConcreteDef();
    const playerCount = 2;
    const { state } = initialState(def, 42, playerCount);
    const runtime = createGameDefRuntime(def);
    const moves = legalMoves(def, state, undefined, runtime);
    const rng = createRng(42n);

    const result = materializeOrFastPath(def, state, moves, rng, 2, runtime);

    assert.equal(result.fastPath, false, 'fast path should never be used');
    assert.ok(result.candidates.length > 0, 'should produce candidates');
  });

  it('produces same candidates as materializeConcreteCandidates', () => {
    const def = createAllConcreteDef();
    const playerCount = 2;
    const { state } = initialState(def, 42, playerCount);
    const runtime = createGameDefRuntime(def);
    const moves = legalMoves(def, state, undefined, runtime);
    const rng = createRng(42n);

    const wrapperResult = materializeOrFastPath(def, state, moves, rng, 2, runtime);
    const directResult = materializeConcreteCandidates(def, state, moves, rng, 2, runtime);

    const wrapperKeys = new Set(wrapperResult.candidates.map(c => c.moveKey));
    const directKeys = new Set(directResult.candidates.map(c => c.moveKey));
    assert.deepEqual(wrapperKeys, directKeys, 'wrapper and direct should produce same candidates');
  });

  it('deduplicates candidates', () => {
    const def = createAllConcreteDef();
    const playerCount = 2;
    const { state } = initialState(def, 42, playerCount);
    const runtime = createGameDefRuntime(def);
    const move: Move = { actionId: asActionId('noop'), params: {} };
    const duplicateMoves: readonly Move[] = [move, move, move];
    const rng = createRng(42n);

    const result = materializeOrFastPath(def, state, duplicateMoves, rng, 2, runtime);

    assert.equal(result.fastPath, false);
    assert.equal(result.candidates.length, 1, 'duplicates should be removed');
  });
});
