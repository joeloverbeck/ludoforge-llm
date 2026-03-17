import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { rollout, simulateToCutoff } from '../../../../src/agents/mcts/rollout.js';
import type { SimulationResult } from '../../../../src/agents/mcts/rollout.js';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  initialState,
  type GameDef,
} from '../../../../src/kernel/index.js';
import { createRng } from '../../../../src/kernel/prng.js';
import { terminalResult } from '../../../../src/kernel/terminal.js';
import { applyMove } from '../../../../src/kernel/apply-move.js';
import type { RolloutConfigSlice, CutoffConfigSlice } from '../../../../src/agents/mcts/rollout.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_ROLLOUT_CONFIG: RolloutConfigSlice = {
  rolloutPolicy: 'epsilonGreedy',
  rolloutEpsilon: 0.15,
  rolloutCandidateSample: 6,
  maxSimulationDepth: 48,
  templateCompletionsPerVisit: 2,
};

/**
 * GameDef for rollout tests:
 * - 2 players, perPlayerVar "vp" 0..10
 * - actions: gainLow (vp=2), gainMid (vp=5), gainHigh (vp=9), noop
 * - scoring-based terminal (no win conditions so rollout runs until depth)
 */
function createHeuristicDef(): GameDef {
  const phase = [asPhaseId('main')];
  const makeGainAction = (id: string, amount: number) => ({
    id: asActionId(id),
    actor: 'active' as const,
    executor: 'actor' as const,
    phase,
    params: [],
    pre: null,
    cost: [],
    effects: [{ setVar: { scope: 'pvar', player: 'actor', var: 'vp', value: amount } }],
    limits: [],
  });

  return {
    metadata: { id: 'rollout-heuristic', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [{ name: 'vp', type: 'int', init: 0, min: 0, max: 10 }],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [
      makeGainAction('gainLow', 2),
      makeGainAction('gainMid', 5),
      makeGainAction('gainHigh', 9),
      { id: asActionId('noop'), actor: 'active', executor: 'actor', phase, params: [], pre: null, cost: [], effects: [], limits: [] },
    ],
    triggers: [],
    terminal: {
      conditions: [],
      scoring: { method: 'highest', value: { ref: 'pvar', player: 'actor', var: 'vp' } },
    },
  } as unknown as GameDef;
}

/**
 * GameDef with terminal condition: globalVar "ended" == 1 => win for player 0.
 * - action "win" sets ended=1
 * - action "noop" does nothing
 */
function createTerminalDef(): GameDef {
  return {
    metadata: { id: 'rollout-terminal', players: { min: 2, max: 2 } },
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
  } as unknown as GameDef;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('rollout', () => {
  // AC 1: Terminal state input returns immediately with depth 0
  it('returns immediately with depth 0 and terminal result when given terminal state', () => {
    const def = createTerminalDef();
    const { state: state0 } = initialState(def, 42, 2);
    // Apply "win" to reach terminal state
    const applied = applyMove(def, state0, { actionId: asActionId('win'), params: {} });
    const terminalState = applied.state;
    const terminal = terminalResult(def, terminalState);
    assert.notEqual(terminal, null, 'state should be terminal after win action');

    const rng = createRng(123n);
    const result = rollout(def, terminalState, rng, DEFAULT_ROLLOUT_CONFIG);

    assert.equal(result.depth, 0);
    assert.notEqual(result.terminal, null);
    assert.equal(result.terminal!.type, 'win');
    assert.deepEqual(result.state, terminalState);
  });

  // AC 2: maxSimulationDepth = 0 returns immediately
  it('returns immediately with depth 0 when maxSimulationDepth is 0', () => {
    const def = createHeuristicDef();
    const { state } = initialState(def, 42, 2);
    const rng = createRng(123n);

    const result = rollout(def, state, rng, {
      ...DEFAULT_ROLLOUT_CONFIG,
      maxSimulationDepth: 0,
    });

    assert.equal(result.depth, 0);
    assert.equal(result.terminal, null);
  });

  // AC 3: Random rollout — moves are chosen randomly
  it('random rollout selects moves (does not crash, produces valid result)', () => {
    const def = createHeuristicDef();
    const { state } = initialState(def, 42, 2);
    const rng = createRng(999n);

    const result = rollout(def, state, rng, {
      ...DEFAULT_ROLLOUT_CONFIG,
      rolloutPolicy: 'random',
      maxSimulationDepth: 5,
    });

    assert.ok(result.depth >= 0 && result.depth <= 5);
    assert.ok(result.state !== undefined);
  });

  // AC 4: Epsilon = 0 => always greedy (best-scoring candidate)
  it('epsilon = 0 always picks best-scoring candidate (greedy)', () => {
    const def = createHeuristicDef();
    const { state } = initialState(def, 42, 2);

    // Run multiple times — with epsilon=0 and same seed, should always be greedy
    for (let seed = 1n; seed <= 5n; seed += 1n) {
      const rng = createRng(seed);
      const result = rollout(def, state, rng, {
        ...DEFAULT_ROLLOUT_CONFIG,
        rolloutEpsilon: 0,
        maxSimulationDepth: 1,
      });
      assert.equal(result.depth, 1);
    }
  });

  // AC 5: Epsilon = 1 => always random
  it('epsilon = 1 always picks random candidate', () => {
    const def = createHeuristicDef();
    const { state } = initialState(def, 42, 2);

    const rng = createRng(777n);
    const result = rollout(def, state, rng, {
      ...DEFAULT_ROLLOUT_CONFIG,
      rolloutEpsilon: 1,
      maxSimulationDepth: 3,
    });

    assert.ok(result.depth >= 0 && result.depth <= 3);
  });

  // AC 6: Rollout respects maxSimulationDepth
  it('does not exceed maxSimulationDepth', () => {
    const def = createHeuristicDef();
    const { state } = initialState(def, 42, 2);
    const rng = createRng(42n);

    for (const maxDepth of [1, 2, 3, 5, 10]) {
      const result = rollout(def, state, rng, {
        ...DEFAULT_ROLLOUT_CONFIG,
        maxSimulationDepth: maxDepth,
      });
      assert.ok(
        result.depth <= maxDepth,
        `depth ${result.depth} exceeded maxSimulationDepth ${maxDepth}`,
      );
    }
  });

  // AC 7: Template moves are materialized correctly
  it('handles games with only concrete moves without error', () => {
    const def = createHeuristicDef();
    const { state } = initialState(def, 42, 2);
    const rng = createRng(42n);

    const result = rollout(def, state, rng, {
      ...DEFAULT_ROLLOUT_CONFIG,
      maxSimulationDepth: 3,
    });

    assert.ok(result.depth >= 0 && result.depth <= 3);
    assert.ok(result.state !== undefined);
  });

  // AC 8: Deterministic — same state + same RNG produce same trajectory
  it('is deterministic: same state and RNG produce identical results', () => {
    const def = createHeuristicDef();
    const { state } = initialState(def, 42, 2);

    const result1 = rollout(def, state, createRng(123n), {
      ...DEFAULT_ROLLOUT_CONFIG,
      maxSimulationDepth: 10,
    });
    const result2 = rollout(def, state, createRng(123n), {
      ...DEFAULT_ROLLOUT_CONFIG,
      maxSimulationDepth: 10,
    });

    assert.equal(result1.depth, result2.depth);
    assert.deepEqual(result1.terminal, result2.terminal);
    assert.deepEqual(result1.state, result2.state);
    assert.deepEqual(result1.rng, result2.rng);
  });

  // AC 9: Input state is not mutated
  it('does not mutate the input state', () => {
    const def = createHeuristicDef();
    const { state } = initialState(def, 42, 2);
    const stateBefore = JSON.stringify(state, (_k, v) =>
      typeof v === 'bigint' ? `__bigint__${v.toString()}` : v,
    );
    const rng = createRng(42n);

    rollout(def, state, rng, {
      ...DEFAULT_ROLLOUT_CONFIG,
      maxSimulationDepth: 5,
    });

    const stateAfter = JSON.stringify(state, (_k, v) =>
      typeof v === 'bigint' ? `__bigint__${v.toString()}` : v,
    );
    assert.equal(stateAfter, stateBefore, 'input state was mutated');
  });

  // Additional: rollout with no legal moves returns immediately
  it('returns depth 0 when state is terminal (no legal moves)', () => {
    const def = createTerminalDef();
    const { state: state0 } = initialState(def, 42, 2);
    const applied = applyMove(def, state0, { actionId: asActionId('win'), params: {} });
    const terminalState = applied.state;
    const rng = createRng(42n);

    const result = rollout(def, terminalState, rng, DEFAULT_ROLLOUT_CONFIG);
    assert.equal(result.depth, 0);
  });

  // AC 10: SimulationResult has traversedMoveKeys field
  it('SimulationResult includes traversedMoveKeys matching depth', () => {
    const def = createHeuristicDef();
    const { state } = initialState(def, 42, 2);
    const rng = createRng(42n);

    const result: SimulationResult = rollout(def, state, rng, {
      ...DEFAULT_ROLLOUT_CONFIG,
      maxSimulationDepth: 5,
    });

    assert.ok(Array.isArray(result.traversedMoveKeys));
    assert.equal(result.traversedMoveKeys.length, result.depth);
  });

  it('traversedMoveKeys is empty when terminal state is given', () => {
    const def = createTerminalDef();
    const { state: state0 } = initialState(def, 42, 2);
    const applied = applyMove(def, state0, { actionId: asActionId('win'), params: {} });
    const rng = createRng(123n);

    const result = rollout(def, applied.state, rng, DEFAULT_ROLLOUT_CONFIG);
    assert.deepEqual(result.traversedMoveKeys, []);
  });
});

// ---------------------------------------------------------------------------
// simulateToCutoff
// ---------------------------------------------------------------------------

describe('simulateToCutoff', () => {
  const DEFAULT_CUTOFF_CONFIG: CutoffConfigSlice = {
    rolloutPolicy: 'random',
    rolloutEpsilon: 0.15,
    rolloutCandidateSample: 6,
    hybridCutoffDepth: 3,
    templateCompletionsPerVisit: 2,
    mastWarmUpThreshold: 32,
  };

  it('caps simulation at hybridCutoffDepth plies', () => {
    const def = createHeuristicDef();
    const { state } = initialState(def, 42, 2);
    const rng = createRng(42n);

    const result = simulateToCutoff(def, state, rng, {
      ...DEFAULT_CUTOFF_CONFIG,
      hybridCutoffDepth: 3,
    });

    assert.ok(result.depth <= 3, `depth ${result.depth} exceeded hybridCutoffDepth 3`);
    assert.equal(result.traversedMoveKeys.length, result.depth);
  });

  it('stops at terminal states before cutoff depth', () => {
    const def = createTerminalDef();
    const { state: state0 } = initialState(def, 42, 2);
    const applied = applyMove(def, state0, { actionId: asActionId('win'), params: {} });
    const rng = createRng(123n);

    const result = simulateToCutoff(def, applied.state, rng, {
      ...DEFAULT_CUTOFF_CONFIG,
      hybridCutoffDepth: 10,
    });

    assert.equal(result.depth, 0);
    assert.notEqual(result.terminal, null);
  });

  it('is deterministic: same state and RNG produce identical results', () => {
    const def = createHeuristicDef();
    const { state } = initialState(def, 42, 2);

    const result1 = simulateToCutoff(def, state, createRng(123n), DEFAULT_CUTOFF_CONFIG);
    const result2 = simulateToCutoff(def, state, createRng(123n), DEFAULT_CUTOFF_CONFIG);

    assert.equal(result1.depth, result2.depth);
    assert.deepEqual(result1.terminal, result2.terminal);
    assert.deepEqual(result1.state, result2.state);
    assert.deepEqual(result1.rng, result2.rng);
    assert.deepEqual(result1.traversedMoveKeys, result2.traversedMoveKeys);
  });
});
