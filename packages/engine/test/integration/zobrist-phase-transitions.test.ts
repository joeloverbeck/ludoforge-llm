import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asPhaseId,
  asPlayerId,
  computeFullHash,
  createGameDefRuntime,
  createZobristTable,
  legalMoves,
  type GameDef,
  type GameState,
  type Move,
} from '../../src/kernel/index.js';
import { applyMove } from '../../src/kernel/apply-move.js';
import { asTaggedGameDef } from '../helpers/gamedef-fixtures.js';

// ---------------------------------------------------------------------------
// Multi-phase game definition: 3 phases, round-robin, one action per phase
// ---------------------------------------------------------------------------

const makeDef = (): GameDef =>
  asTaggedGameDef({
    metadata: { id: 'zobrist-phase-transitions', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [
      { name: 'counter', type: 'int', init: 0, min: 0, max: 999 },
    ],
    perPlayerVars: [
      { name: 'points', type: 'int', init: 0, min: 0, max: 999 },
    ],
    globalMarkerLattices: [],
    zones: [{ id: 'deck:none', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
    tokenTypes: [{ id: 'card', props: {} }],
    turnStructure: {
      phases: [
        { id: 'dawn' },
        { id: 'day' },
        { id: 'dusk' },
      ],
    },
    actions: [
      {
        id: 'bump',
        actor: 'active',
        executor: 'actor',
        phase: ['dawn', 'day', 'dusk'],
        params: [],
        pre: null,
        cost: [],
        effects: [{ addVar: { scope: 'global', var: 'counter', delta: 1 } }],
        limits: [{ id: 'bump::phase::0', scope: 'phase', max: 1 }],
      },
    ],
    triggers: [],
    setup: [],
    terminal: { conditions: [] },
  });

const makeState = (def: GameDef, table: ReturnType<typeof createZobristTable>): GameState => {
  const base: GameState = {
    globalVars: { counter: 0 },
    perPlayerVars: { 0: { points: 0 }, 1: { points: 0 } },
    zoneVars: {},
    playerCount: 2,
    zones: { 'deck:none': [] },
    nextTokenOrdinal: 0,
    currentPhase: asPhaseId('dawn'),
    activePlayer: asPlayerId(0),
    turnCount: 0,
    rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
    stateHash: 0n,
    _runningHash: 0n,
    actionUsage: {
      bump: { turnCount: 0, phaseCount: 0, gameCount: 0 },
    },
    turnOrderState: { type: 'roundRobin' },
    markers: {},
  };
  const fullHash = computeFullHash(table, base);
  return { ...base, stateHash: fullHash, _runningHash: fullHash };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('zobrist incremental hash — multi-phase transitions integration', () => {
  const def = makeDef();
  const table = createZobristTable(def);
  const runtime = createGameDefRuntime(def);

  it('_runningHash matches computeFullHash after every move across phases and turns', () => {
    let state = makeState(def, table);

    // Verify initial state hash
    const initFull = computeFullHash(table, state);
    assert.equal(state._runningHash, initFull, 'initial _runningHash must match full recompute');

    // Play through multiple turns: get legal moves, apply first, check hash parity
    const maxMoves = 30;
    let moveCount = 0;
    while (moveCount < maxMoves) {
      const moves = legalMoves(def, state, undefined, runtime);
      if (moves.length === 0) {
        break;
      }
      const move = moves[0]!;
      const result = applyMove(def, state, move, undefined, runtime);
      state = result.state;
      moveCount += 1;

      const fullHash = computeFullHash(table, state);
      assert.equal(
        state._runningHash,
        fullHash,
        `_runningHash must match full recompute after move ${moveCount} (phase=${String(state.currentPhase)}, turn=${state.turnCount})`,
      );
    }

    assert.ok(moveCount > 0, 'at least one move should have been played');
    // With 3 phases and max 1 per phase, we should see multiple phase transitions and turns
    assert.ok(state.turnCount >= 1, 'should have completed at least one full turn cycle');
  });

  it('_runningHash matches after gotoPhaseExact effect via action', () => {
    const gotoDef = asTaggedGameDef({
      ...def,
      metadata: { ...def.metadata, id: 'zobrist-goto-integration' },
      actions: [
        ...def.actions,
        {
          id: 'skip',
          actor: 'active',
          executor: 'actor',
          phase: ['dawn'],
          params: [],
          pre: null,
          cost: [],
          effects: [{ gotoPhaseExact: { phase: 'dusk' } }],
          limits: [{ id: 'skip::phase::0', scope: 'phase', max: 1 }],
        },
      ],
    });

    const gotoTable = createZobristTable(gotoDef);
    const gotoRuntime = createGameDefRuntime(gotoDef);
    const gotoBase = makeState(gotoDef, gotoTable);
    // Rebuild actionUsage to include both actions
    let state: GameState = {
      ...gotoBase,
      actionUsage: {
        bump: { turnCount: 0, phaseCount: 0, gameCount: 0 },
        skip: { turnCount: 0, phaseCount: 0, gameCount: 0 },
      },
    };
    const fullHashInit = computeFullHash(gotoTable, state);
    state = { ...state, stateHash: fullHashInit, _runningHash: fullHashInit };

    // Find the 'skip' action
    const moves = legalMoves(gotoDef, state, undefined, gotoRuntime);
    const skipMove = moves.find((m: Move) => m.actionId === 'skip');
    assert.ok(skipMove, 'skip action should be available in dawn phase');

    const result = applyMove(gotoDef, state, skipMove!, undefined, gotoRuntime);
    state = result.state;
    const fullHash = computeFullHash(gotoTable, state);
    assert.equal(
      state._runningHash,
      fullHash,
      '_runningHash must match full recompute after gotoPhaseExact action',
    );
  });
});
