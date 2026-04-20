import { describe, expect, it } from 'vitest';
import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '@ludoforge/engine/cnl';
import {
  createGameDefRuntime,
  createRng,
  initialState,
  type GameDef,
} from '@ludoforge/engine/runtime';
import { publishMicroturn } from '../../../engine/src/kernel/microturn/publish.js';

import { createAgentSeatController, createHumanSeatController } from '../../src/seat/seat-controller.js';
import {
  resolveAgentDescriptor,
  resolveAiPlaybackDelayMs,
  selectAgentDecision,
  selectRandomIndex,
} from '../../src/store/ai-move-policy.js';

function compileFixture(): GameDef {
  const compiled = compileGameSpecToGameDef({
    ...createEmptyGameSpecDoc(),
    metadata: {
      id: 'runner-ai-microturn-policy-test',
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

  it('selectAgentDecision returns null when there are no legal actions', () => {
    const def = compileFixture();
    const state = initialState(def, 7, 2).state;
    const runtime = createGameDefRuntime(def);
    const microturn = { ...publishMicroturn(def, state, runtime), legalActions: [] };

    expect(selectAgentDecision({
      controller: createAgentSeatController({ kind: 'builtin', builtinId: 'random' }),
      def,
      state,
      microturn,
      rng: createRng(7n),
      runtime,
    })).toBeNull();
  });

  it('selectAgentDecision with builtin greedy emits builtin greedy decision metadata', () => {
    const def = compileFixture();
    const state = initialState(def, 7, 2).state;
    const runtime = createGameDefRuntime(def);
    const microturn = publishMicroturn(def, state, runtime);

    const result = selectAgentDecision({
      controller: createAgentSeatController({ kind: 'builtin', builtinId: 'greedy' }),
      def,
      state,
      microturn,
      rng: createRng(7n),
      runtime,
    });

    expect(result).not.toBeNull();
    expect(microturn.legalActions).toContainEqual(result?.decision);
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
