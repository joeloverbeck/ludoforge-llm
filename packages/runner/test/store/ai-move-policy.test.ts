import { describe, expect, it } from 'vitest';
import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '@ludoforge/engine/cnl';
import { asActionId, createGameDefRuntime, createRng, createTrustedExecutableMove, initialState, type ClassifiedMove, type GameDef, type Move } from '@ludoforge/engine/runtime';

import { createAgentSeatController, createHumanSeatController } from '../../src/seat/seat-controller.js';
import {
  resolveAgentDescriptor,
  resolveAiPlaybackDelayMs,
  selectAgentMove,
  selectRandomIndex,
} from '../../src/store/ai-move-policy.js';

const MOVE_A: Move = { actionId: asActionId('a'), params: {} };
const MOVE_B: Move = { actionId: asActionId('b'), params: {} };
const MOVE_C: Move = { actionId: asActionId('c'), params: {} };

function toClassifiedMove(move: Move, sourceStateHash = 0n): ClassifiedMove {
  return {
    move,
    viability: {
      viable: true,
      complete: true,
      move,
      warnings: [],
      code: undefined,
      context: undefined,
      error: undefined,
      nextDecision: undefined,
      nextDecisionSet: undefined,
      stochasticDecision: undefined,
    },
    trustedMove: createTrustedExecutableMove(move, sourceStateHash, 'enumerateLegalMoves'),
  };
}

function compileFixture(): GameDef {
  const compiled = compileGameSpecToGameDef({
    ...createEmptyGameSpecDoc(),
    metadata: {
      id: 'runner-ai-move-policy-test',
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

describe('ai-move-policy', () => {
  it('resolveAgentDescriptor defaults missing controllers to authored policy', () => {
    expect(resolveAgentDescriptor(undefined)).toEqual({ kind: 'policy' });
  });

  it('resolveAgentDescriptor rejects human controllers', () => {
    expect(() => resolveAgentDescriptor(createHumanSeatController())).toThrow(/human-controlled seat/u);
  });

  it('selectAgentMove returns null when there are no legal moves', () => {
    const def = compileFixture();
    const state = initialState(def, 7, 2).state;

    expect(selectAgentMove({
      controller: createAgentSeatController({ kind: 'builtin', builtinId: 'random' }),
      def,
      state,
      playerId: state.activePlayer,
      legalMoves: [],
      rng: createRng(7n),
      runtime: createGameDefRuntime(def),
    })).toBeNull();
  });

  it('selectAgentMove with builtin greedy emits builtin greedy decision metadata', () => {
    const def = compileFixture();
    const state = initialState(def, 7, 2).state;

    const result = selectAgentMove({
      controller: createAgentSeatController({ kind: 'builtin', builtinId: 'greedy' }),
      def,
      state,
      playerId: state.activePlayer,
      legalMoves: [MOVE_A, MOVE_B, MOVE_C].map((move) => toClassifiedMove(move, state.stateHash)),
      rng: createRng(7n),
      runtime: createGameDefRuntime(def),
    });

    expect(result).not.toBeNull();
    expect([MOVE_A, MOVE_B, MOVE_C]).toContainEqual(result?.move.move);
    expect(result?.agentDecision).toMatchObject({
      kind: 'builtin',
      agent: { kind: 'builtin', builtinId: 'greedy' },
      candidateCount: 3,
    });
  });

  it('selectRandomIndex clamps invalid random values', () => {
    expect(selectRandomIndex(2, () => Number.NaN)).toBe(0);
    expect(selectRandomIndex(2, () => Number.POSITIVE_INFINITY)).toBe(0);
    expect(selectRandomIndex(2, () => 2)).toBe(1);
  });

  it('resolveAiPlaybackDelayMs maps speed tiers to deterministic step delays', () => {
    expect(resolveAiPlaybackDelayMs('1x')).toBe(500);
    expect(resolveAiPlaybackDelayMs('2x')).toBe(250);
    expect(resolveAiPlaybackDelayMs('4x')).toBe(125);
    expect(resolveAiPlaybackDelayMs('4x', 400)).toBe(100);
  });

  it('resolveAiPlaybackDelayMs rejects invalid base delays', () => {
    expect(() => resolveAiPlaybackDelayMs('1x', Number.NaN)).toThrow(/base delay/u);
    expect(() => resolveAiPlaybackDelayMs('1x', -1)).toThrow(/base delay/u);
  });
});
