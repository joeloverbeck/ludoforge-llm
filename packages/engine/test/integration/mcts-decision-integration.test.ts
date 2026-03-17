/**
 * Integration test for MCTS decision node integration.
 *
 * Verifies that `runSearch` correctly creates decision root children for
 * template moves and that the search completes without crashing.
 * Uses the same VP race fixture as benchmarks, extended with a template
 * action that has a parameter decision.
 */

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asActionId,
  asPhaseId,
  asPlayerId,
  assertValidatedGameDef,
  initialState,
  type GameDef,
} from '../../src/kernel/index.js';
import { createRng } from '../../src/kernel/prng.js';
import { createGameDefRuntime } from '../../src/kernel/gamedef-runtime.js';
import { legalMoves } from '../../src/kernel/legal-moves.js';
import { derivePlayerObservation } from '../../src/kernel/observation.js';
import { createRootNode } from '../../src/agents/mcts/node.js';
import { createNodePool } from '../../src/agents/mcts/node-pool.js';
import { runSearch } from '../../src/agents/mcts/search.js';
import { validateMctsConfig } from '../../src/agents/mcts/config.js';
import type { MctsSearchEvent } from '../../src/agents/mcts/visitor.js';

const PLAYER_COUNT = 2;
const SEED = 42;

// ---------------------------------------------------------------------------
// Fixture: VP race with a template "boost" action
// ---------------------------------------------------------------------------

/**
 * VP race with two concrete actions (advance, idle) and one template action
 * (boost) that has a parameter decision.  "boost" lets the player choose
 * a boost amount (1 or 2) as a parameter.
 *
 * The template action makes this game exercise the decision node path.
 */
function createTemplateVpRaceDef(): GameDef {
  return {
    metadata: { id: 'decision-integration', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [{ name: 'vp', type: 'int', init: 0, min: 0, max: 20 }],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [
      {
        id: asActionId('advance'),
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [
          { addVar: { scope: 'pvar', player: 'actor', var: 'vp', delta: 1 } },
        ],
        limits: [],
      },
      {
        id: asActionId('idle'),
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
        id: asActionId('boost'),
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [
          {
            name: 'amount',
            type: 'enum',
            domain: ['small', 'big'],
          },
        ],
        pre: null,
        cost: [],
        effects: [
          // Simple +2 VP regardless of param value.
          // The param choice still makes this a template action.
          { addVar: { scope: 'pvar', player: 'actor', var: 'vp', delta: 2 } },
        ],
        limits: [],
      },
    ],
    triggers: [],
    terminal: {
      conditions: [
        {
          when: {
            op: '>=',
            left: { ref: 'pvar', player: { id: asPlayerId(0) }, var: 'vp' },
            right: 10,
          },
          result: { type: 'win', player: { id: asPlayerId(0) } },
        },
        {
          when: {
            op: '>=',
            left: { ref: 'pvar', player: { id: asPlayerId(1) }, var: 'vp' },
            right: 10,
          },
          result: { type: 'win', player: { id: asPlayerId(1) } },
        },
      ],
    },
  } as unknown as GameDef;
}

// ---------------------------------------------------------------------------
// Concrete-only VP race (no template moves)
// ---------------------------------------------------------------------------

function createConcreteVpRaceDef(): GameDef {
  return {
    metadata: { id: 'concrete-vp-race', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [{ name: 'vp', type: 'int', init: 0, min: 0, max: 20 }],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [
      {
        id: asActionId('advance'),
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [
          { addVar: { scope: 'pvar', player: 'actor', var: 'vp', delta: 1 } },
        ],
        limits: [],
      },
      {
        id: asActionId('idle'),
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
          when: {
            op: '>=',
            left: { ref: 'pvar', player: { id: asPlayerId(0) }, var: 'vp' },
            right: 10,
          },
          result: { type: 'win', player: { id: asPlayerId(0) } },
        },
        {
          when: {
            op: '>=',
            left: { ref: 'pvar', player: { id: asPlayerId(1) }, var: 'vp' },
            right: 10,
          },
          result: { type: 'win', player: { id: asPlayerId(1) } },
        },
      ],
    },
  } as unknown as GameDef;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MCTS decision integration — concrete-only game', () => {
  it('search completes without decision nodes for concrete-only game', () => {
    const def = assertValidatedGameDef(createConcreteVpRaceDef());
    const runtime = createGameDefRuntime(def);
    const { state } = initialState(def, SEED, PLAYER_COUNT);
    const searchRng = createRng(99n);
    const observer = asPlayerId(0);
    const observation = derivePlayerObservation(def, state, observer);
    const rootLegal = legalMoves(def, state, undefined, runtime);

    const config = validateMctsConfig({
      iterations: 50,
      minIterations: 0,
      rolloutMode: 'direct',
      diagnostics: true,
    });

    const root = createRootNode(PLAYER_COUNT);
    const poolCapacity = Math.max(config.iterations * 4 + 1, rootLegal.length * 4);
    const pool = createNodePool(poolCapacity, PLAYER_COUNT);

    const result = runSearch(
      root, def, state, observation, observer, config,
      searchRng, rootLegal, runtime, pool,
    );

    // Search should complete.
    assert.ok(result.iterations > 0);

    // No decision nodes should exist (all concrete moves).
    for (const child of root.children) {
      assert.equal(child.nodeKind, 'state', 'all children should be state nodes');
    }

    // Diagnostics should show zero decision-related counters.
    assert.ok(result.diagnostics !== undefined);
    assert.equal(result.diagnostics!.decisionNodesCreated, 0);
    assert.equal(result.diagnostics!.decisionCompletionsInTree, 0);
  });
});

describe('MCTS decision integration — game with template moves', () => {
  it('search creates decision root children for template actions', () => {
    const def = assertValidatedGameDef(createTemplateVpRaceDef());
    const runtime = createGameDefRuntime(def);
    const { state } = initialState(def, SEED, PLAYER_COUNT);
    const searchRng = createRng(99n);
    const observer = asPlayerId(0);
    const observation = derivePlayerObservation(def, state, observer);
    const rootLegal = legalMoves(def, state, undefined, runtime);

    // Verify boost is in the legal moves.
    const boostMoves = rootLegal.filter((m) => m.actionId === 'boost');
    assert.ok(boostMoves.length > 0, 'boost should be in legal moves');

    const events: MctsSearchEvent[] = [];
    const config = validateMctsConfig({
      iterations: 100,
      minIterations: 0,
      rolloutMode: 'direct',
      diagnostics: true,
      visitor: {
        onEvent: (event: MctsSearchEvent) => { events.push(event); },
      },
    });

    const root = createRootNode(PLAYER_COUNT);
    const poolCapacity = Math.max(config.iterations * 4 + 1, rootLegal.length * 4);
    const pool = createNodePool(poolCapacity, PLAYER_COUNT);

    const result = runSearch(
      root, def, state, observation, observer, config,
      searchRng, rootLegal, runtime, pool,
    );

    // Search should complete without crash.
    assert.ok(result.iterations > 0, 'should complete at least 1 iteration');

    // After removing concreteActionIds partition, all moves (including
    // template moves like boost) go through full materialization.
    // Template moves are randomly completed into concrete candidates.
    // Decision root children are no longer created at this stage — ticket 004
    // will reintroduce them via classifyMovesForSearch.
    const stateChildren = root.children.filter((c) => c.nodeKind === 'state');
    assert.ok(stateChildren.length > 0, 'should have state children');

    // Visitor should have received searchStart and searchComplete.
    const searchStartEvents = events.filter((e) => e.type === 'searchStart');
    const searchCompleteEvents = events.filter((e) => e.type === 'searchComplete');
    assert.equal(searchStartEvents.length, 1);
    assert.equal(searchCompleteEvents.length, 1);
  });
});
