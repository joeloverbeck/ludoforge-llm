import { describe, expect, it } from 'vitest';
import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '@ludoforge/engine/cnl';
import { asActionId, asPlayerId, initialState, type GameDef, type Move } from '@ludoforge/engine/runtime';

import { createAgentSeatController, createHumanSeatController } from '../../src/seat/seat-controller.js';
import { createAgentTurnOrchestrator } from '../../src/store/agent-turn-orchestrator.js';

const MOVE_A: Move = { actionId: asActionId('a'), params: {} };
const MOVE_B: Move = { actionId: asActionId('b'), params: {} };
const MOVE_C: Move = { actionId: asActionId('c'), params: {} };
const RANDOM_MOVES = [MOVE_A, MOVE_B, MOVE_C] as const;

function compileFixture(): GameDef {
  const compiled = compileGameSpecToGameDef({
    ...createEmptyGameSpecDoc(),
    metadata: {
      id: 'runner-agent-turn-orchestrator-test',
      players: { min: 2, max: 2 },
    },
    globalVars: [{ name: 'tick', type: 'int', init: 0, min: 0, max: 10 }],
    turnStructure: { phases: [{ id: 'main' }] },
    zones: [{ id: 'table', owner: 'none', visibility: 'public', ordering: 'set' }],
    actions: [
      { id: 'a', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] },
      { id: 'b', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] },
      { id: 'c', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] },
    ],
    terminal: {
      conditions: [{ when: { op: '>=', left: { ref: 'gvar', var: 'tick' }, right: 99 }, result: { type: 'draw' } }],
    },
  });
  if (compiled.gameDef === null) {
    throw new Error(`fixture failed: ${JSON.stringify(compiled.diagnostics)}`);
  }
  return compiled.gameDef;
}

describe('agent-turn-orchestrator', () => {
  it('returns no-session before initialization', () => {
    const def = compileFixture();
    const state = initialState(def, 7, 2).state;
    const orchestrator = createAgentTurnOrchestrator();

    expect(orchestrator.resolveStep({
      controller: createAgentSeatController({ kind: 'builtin', builtinId: 'random' }),
      def,
      legalMoves: RANDOM_MOVES,
      playerId: state.activePlayer,
      state,
    })).toEqual({ kind: 'no-session' });
  });

  it('resets deterministically and preserves per-player RNG ownership', () => {
    const def = compileFixture();
    const state = initialState(def, 17, 2).state;
    const player0 = asPlayerId(0);
    const player1 = asPlayerId(1);

    const interleaved = createAgentTurnOrchestrator();
    interleaved.initializeSession({ def, seed: 17, playerCount: 2 });
    const p0First = interleaved.resolveStep({
      controller: createAgentSeatController({ kind: 'builtin', builtinId: 'random' }),
      def,
      legalMoves: RANDOM_MOVES,
      playerId: player0,
      state: { ...state, activePlayer: player0 },
    });
    const p1First = interleaved.resolveStep({
      controller: createAgentSeatController({ kind: 'builtin', builtinId: 'random' }),
      def,
      legalMoves: RANDOM_MOVES,
      playerId: player1,
      state: { ...state, activePlayer: player1 },
    });
    const p0Second = interleaved.resolveStep({
      controller: createAgentSeatController({ kind: 'builtin', builtinId: 'random' }),
      def,
      legalMoves: RANDOM_MOVES,
      playerId: player0,
      state: { ...state, activePlayer: player0 },
    });

    const isolated = createAgentTurnOrchestrator();
    isolated.initializeSession({ def, seed: 17, playerCount: 2 });
    const isolatedP0First = isolated.resolveStep({
      controller: createAgentSeatController({ kind: 'builtin', builtinId: 'random' }),
      def,
      legalMoves: RANDOM_MOVES,
      playerId: player0,
      state: { ...state, activePlayer: player0 },
    });
    const isolatedP0Second = isolated.resolveStep({
      controller: createAgentSeatController({ kind: 'builtin', builtinId: 'random' }),
      def,
      legalMoves: RANDOM_MOVES,
      playerId: player0,
      state: { ...state, activePlayer: player0 },
    });

    expect(p0First).toMatchObject({ kind: 'selected-move' });
    expect(p1First).toMatchObject({ kind: 'selected-move' });
    expect(p0Second).toMatchObject({ kind: 'selected-move' });
    expect(isolatedP0First).toMatchObject({ kind: 'selected-move' });
    expect(isolatedP0Second).toMatchObject({ kind: 'selected-move' });
    if (
      p0First.kind !== 'selected-move'
      || p0Second.kind !== 'selected-move'
      || isolatedP0First.kind !== 'selected-move'
      || isolatedP0Second.kind !== 'selected-move'
    ) {
      throw new Error('Expected random agent selections.');
    }

    expect(p0First.move).toEqual(isolatedP0First.move);
    expect(p0Second.move).toEqual(isolatedP0Second.move);

    interleaved.resetSession();
    interleaved.initializeSession({ def, seed: 17, playerCount: 2 });
    const resetP0First = interleaved.resolveStep({
      controller: createAgentSeatController({ kind: 'builtin', builtinId: 'random' }),
      def,
      legalMoves: RANDOM_MOVES,
      playerId: player0,
      state: { ...state, activePlayer: player0 },
    });

    expect(resetP0First).toMatchObject({ kind: 'selected-move' });
    if (resetP0First.kind !== 'selected-move') {
      throw new Error('Expected random agent selection after reset.');
    }
    expect(resetP0First.move).toEqual(p0First.move);
  });

  it('does not execute human-controlled seats through the agent path', () => {
    const def = compileFixture();
    const state = initialState(def, 9, 2).state;
    const orchestrator = createAgentTurnOrchestrator();
    orchestrator.initializeSession({ def, seed: 9, playerCount: 2 });

    expect(orchestrator.resolveStep({
      controller: createHumanSeatController(),
      def,
      legalMoves: RANDOM_MOVES,
      playerId: state.activePlayer,
      state,
    })).toEqual({ kind: 'human-turn' });
  });

  it('uses structured agent descriptors to choose moves and surface decision metadata', () => {
    const def = compileFixture();
    const state = initialState(def, 11, 2).state;
    const orchestrator = createAgentTurnOrchestrator();
    orchestrator.initializeSession({ def, seed: 11, playerCount: 2 });

    const result = orchestrator.resolveStep({
      controller: createAgentSeatController({ kind: 'builtin', builtinId: 'greedy' }),
      def,
      legalMoves: RANDOM_MOVES,
      playerId: state.activePlayer,
      state,
    });

    expect(result).toMatchObject({
      kind: 'selected-move',
      move: MOVE_A,
      agentDecision: {
        kind: 'builtin',
        agent: { kind: 'builtin', builtinId: 'greedy' },
        candidateCount: 3,
      },
    });
  });
});
