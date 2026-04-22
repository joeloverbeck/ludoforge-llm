import { describe, expect, it } from 'vitest';
import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '@ludoforge/engine/cnl';
import {
  asPlayerId,
  createGameDefRuntime,
  initialState,
  type GameDef,
} from '@ludoforge/engine/runtime';
import { publishMicroturn } from '../../../engine/src/kernel/microturn/publish.js';

import { createAgentSeatController, createHumanSeatController } from '../../src/seat/seat-controller.js';
import { createAgentTurnOrchestrator } from '../../src/store/agent-turn-orchestrator.js';

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
    const runtime = createGameDefRuntime(def);
    const orchestrator = createAgentTurnOrchestrator();

    expect(orchestrator.resolveStep({
      controller: createAgentSeatController(),
      def,
      microturn: publishMicroturn(def, state, runtime),
      state,
    })).toEqual({ kind: 'no-session' });
  });

  it('resets deterministically and preserves per-player RNG ownership', () => {
    const def = compileFixture();
    const runtime = createGameDefRuntime(def);
    const baseState = initialState(def, 17, 2).state;
    const player0 = asPlayerId(0);
    const player1 = asPlayerId(1);

    const interleaved = createAgentTurnOrchestrator();
    interleaved.initializeSession({ def, seed: 17, playerCount: 2 });
    const p0First = interleaved.resolveStep({
      controller: createAgentSeatController(),
      def,
      microturn: publishMicroturn(def, { ...baseState, activePlayer: player0 }, runtime),
      state: { ...baseState, activePlayer: player0 },
    });
    const p1First = interleaved.resolveStep({
      controller: createAgentSeatController(),
      def,
      microturn: publishMicroturn(def, { ...baseState, activePlayer: player1 }, runtime),
      state: { ...baseState, activePlayer: player1 },
    });
    const p0Second = interleaved.resolveStep({
      controller: createAgentSeatController(),
      def,
      microturn: publishMicroturn(def, { ...baseState, activePlayer: player0 }, runtime),
      state: { ...baseState, activePlayer: player0 },
    });

    const isolated = createAgentTurnOrchestrator();
    isolated.initializeSession({ def, seed: 17, playerCount: 2 });
    const isolatedP0First = isolated.resolveStep({
      controller: createAgentSeatController(),
      def,
      microturn: publishMicroturn(def, { ...baseState, activePlayer: player0 }, runtime),
      state: { ...baseState, activePlayer: player0 },
    });
    const isolatedP0Second = isolated.resolveStep({
      controller: createAgentSeatController(),
      def,
      microturn: publishMicroturn(def, { ...baseState, activePlayer: player0 }, runtime),
      state: { ...baseState, activePlayer: player0 },
    });

    expect(p0First).toMatchObject({ kind: 'selected-decision' });
    expect(p1First).toMatchObject({ kind: 'selected-decision' });
    expect(p0Second).toMatchObject({ kind: 'selected-decision' });
    expect(isolatedP0First).toMatchObject({ kind: 'selected-decision' });
    expect(isolatedP0Second).toMatchObject({ kind: 'selected-decision' });
    if (
      p0First.kind !== 'selected-decision'
      || p0Second.kind !== 'selected-decision'
      || isolatedP0First.kind !== 'selected-decision'
      || isolatedP0Second.kind !== 'selected-decision'
    ) {
      throw new Error('Expected policy agent selections.');
    }

    expect(p0First.decision).toEqual(isolatedP0First.decision);
    expect(p0Second.decision).toEqual(isolatedP0Second.decision);

    interleaved.resetSession();
    interleaved.initializeSession({ def, seed: 17, playerCount: 2 });
    const resetP0First = interleaved.resolveStep({
      controller: createAgentSeatController(),
      def,
      microturn: publishMicroturn(def, { ...baseState, activePlayer: player0 }, runtime),
      state: { ...baseState, activePlayer: player0 },
    });

    expect(resetP0First).toMatchObject({ kind: 'selected-decision' });
    if (resetP0First.kind !== 'selected-decision') {
      throw new Error('Expected policy agent selection after reset.');
    }
    expect(resetP0First.decision).toEqual(p0First.decision);
  });

  it('does not execute human-controlled seats through the agent path', () => {
    const def = compileFixture();
    const state = initialState(def, 9, 2).state;
    const runtime = createGameDefRuntime(def);
    const orchestrator = createAgentTurnOrchestrator();
    orchestrator.initializeSession({ def, seed: 9, playerCount: 2 });

    expect(orchestrator.resolveStep({
      controller: createHumanSeatController(),
      def,
      microturn: publishMicroturn(def, state, runtime),
      state,
    })).toEqual({ kind: 'human-turn' });
  });

  it('uses policy descriptors to choose decisions and surface decision metadata', () => {
    const def = compileFixture();
    const state = initialState(def, 11, 2).state;
    const runtime = createGameDefRuntime(def);
    const microturn = publishMicroturn(def, state, runtime);
    const orchestrator = createAgentTurnOrchestrator();
    orchestrator.initializeSession({ def, seed: 11, playerCount: 2 });

    const result = orchestrator.resolveStep({
      controller: createAgentSeatController(),
      def,
      microturn,
      state,
    });

    expect(result).toMatchObject({
      kind: 'selected-decision',
      agentDecision: {
        kind: 'policy',
        agent: { kind: 'policy' },
        initialCandidateCount: 3,
      },
    });
    if (result.kind !== 'selected-decision') {
      throw new Error('Expected selected decision.');
    }
    expect(microturn.legalActions).toContainEqual(result.decision);
  });
});
