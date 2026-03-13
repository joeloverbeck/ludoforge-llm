/**
 * Mandatory fairness and property tests for the MCTS agent.
 *
 * These verify that the agent cannot exploit hidden information, that belief
 * sampling preserves visible state, that input state is never mutated, that
 * returned moves are always legal, and that ISUCT handles variable
 * availability without penalizing unavailable actions.
 */

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MctsAgent } from '../../../../src/agents/mcts/mcts-agent.js';
import { derivePlayerObservation } from '../../../../src/kernel/observation.js';
import { sampleBeliefState } from '../../../../src/agents/mcts/belief.js';
import { createRng } from '../../../../src/kernel/prng.js';
import { createGameDefRuntime } from '../../../../src/kernel/gamedef-runtime.js';
import { legalMoves } from '../../../../src/kernel/legal-moves.js';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asZoneId,
  asTokenId,
} from '../../../../src/kernel/branded.js';
import type {
  GameDef,
  GameState,
  Token,
  ZoneDef,
} from '../../../../src/kernel/types-core.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const pid = asPlayerId;
const zid = asZoneId;
const tid = asTokenId;
const phid = asPhaseId;

const mkToken = (id: string, type: string): Token => ({
  id: tid(id),
  type,
  props: {},
});

const mkZone = (
  id: string,
  visibility: 'public' | 'owner' | 'hidden',
  ownerPlayerIndex?: number,
): ZoneDef => ({
  id: zid(id),
  owner: ownerPlayerIndex !== undefined ? 'player' : 'none',
  visibility,
  ordering: 'set' as const,
  ...(ownerPlayerIndex !== undefined ? { ownerPlayerIndex } : {}),
});

/**
 * Build a minimal GameDef with the given zones and two actions (win + noop).
 * Two actions ensure the agent doesn't short-circuit.
 */
const buildHiddenInfoDef = (zones: readonly ZoneDef[]): GameDef =>
  ({
    metadata: { id: 'fairness-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [{ name: 'ended', type: 'int', init: 0, min: 0, max: 1 }],
    perPlayerVars: [{ name: 'vp', type: 'int', init: 0, min: 0, max: 10 }],
    zones,
    tokenTypes: [{ id: 'card', props: {} }],
    setup: [],
    turnStructure: { phases: [{ id: phid('main') }] },
    actions: [
      {
        id: asActionId('win'),
        actor: 'active',
        executor: 'actor',
        phase: [phid('main')],
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
        phase: [phid('main')],
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
          result: { type: 'win', player: { id: pid(0) } },
        },
      ],
    },
  }) as unknown as GameDef;

/** Minimal GameState with given zones and seed. */
const buildState = (
  zones: Readonly<Record<string, readonly Token[]>>,
  seed: bigint = 42n,
): GameState => ({
  globalVars: { ended: 0 },
  perPlayerVars: { 0: { vp: 0 }, 1: { vp: 0 } },
  zoneVars: {},
  playerCount: 2,
  zones,
  nextTokenOrdinal: 100,
  currentPhase: phid('main'),
  activePlayer: pid(0),
  turnCount: 1,
  rng: createRng(seed).state,
  stateHash: 12345n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
});

function jsonSerialize(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    typeof v === 'bigint' ? `__bigint__${v.toString()}` : v,
  );
}

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

// Two-zone layout: one public board, one hidden deck.
const publicZone = mkZone('board', 'public');
const hiddenZone = mkZone('deck', 'hidden');
const hiddenInfoDef = buildHiddenInfoDef([publicZone, hiddenZone]);

const publicTokens: readonly Token[] = [
  mkToken('pub-1', 'card'),
  mkToken('pub-2', 'card'),
];

// Three distinct hidden configurations — all have the same count but
// different orderings, simulating unknown card positions.
const hiddenConfigs: readonly (readonly Token[])[] = [
  [mkToken('h-A', 'card'), mkToken('h-B', 'card'), mkToken('h-C', 'card')],
  [mkToken('h-B', 'card'), mkToken('h-C', 'card'), mkToken('h-A', 'card')],
  [mkToken('h-C', 'card'), mkToken('h-A', 'card'), mkToken('h-B', 'card')],
];

// Mixed-visibility def: public + owner (p0's hand) + owner (p1's hand).
const mixedDef = buildHiddenInfoDef([
  mkZone('board', 'public'),
  mkZone('hand-0', 'owner', 0),
  mkZone('hand-1', 'owner', 1),
]);

// Low iteration count for fast deterministic tests.
const FAST_CONFIG = { iterations: 20, minIterations: 0 } as const;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MCTS fairness and property tests', () => {
  // ── 1. Observation-equivalent states ─────────────────────────────────

  describe('observation-equivalent states produce identical moves', () => {
    for (let i = 0; i < hiddenConfigs.length; i++) {
      it(`hidden config ${i} vs config 0 yields same move`, () => {
        // State A: hidden config 0.
        const stateA = buildState({
          board: publicTokens,
          deck: hiddenConfigs[0]!,
        });
        // State B: hidden config i (different hidden contents).
        const stateB = buildState({
          board: publicTokens,
          deck: hiddenConfigs[i]!,
        });

        const runtime = createGameDefRuntime(hiddenInfoDef);
        const movesA = legalMoves(hiddenInfoDef, stateA, undefined, runtime);
        const movesB = legalMoves(hiddenInfoDef, stateB, undefined, runtime);

        // Legal moves should be identical (hidden info doesn't affect actions).
        assert.deepStrictEqual(
          movesA.map((m) => m.actionId),
          movesB.map((m) => m.actionId),
        );

        const agent = new MctsAgent(FAST_CONFIG);

        // Same agent RNG seed for both calls.
        const rngA = createRng(777n);
        const rngB = createRng(777n);

        const resultA = agent.chooseMove({
          def: hiddenInfoDef,
          state: stateA,
          playerId: pid(0),
          legalMoves: movesA,
          rng: rngA,
          runtime,
        });

        const resultB = agent.chooseMove({
          def: hiddenInfoDef,
          state: stateB,
          playerId: pid(0),
          legalMoves: movesB,
          rng: rngB,
          runtime,
        });

        assert.deepStrictEqual(
          resultA.move,
          resultB.move,
          `Observation-equivalent states must produce the same move (config 0 vs ${i})`,
        );
      });
    }
  });

  // ── 2. Future-RNG fairness ───────────────────────────────────────────

  describe('future-RNG-different states produce identical moves', () => {
    const rngSeeds = [100n, 200n, 300n] as const;

    for (const seed of rngSeeds) {
      it(`state.rng seeded with ${seed} vs 42 yields same move`, () => {
        // State with default RNG.
        const stateDefault = buildState(
          { board: publicTokens, deck: hiddenConfigs[0]! },
          42n,
        );
        // State with different RNG — observation is identical.
        const stateDifferentRng = buildState(
          { board: publicTokens, deck: hiddenConfigs[0]! },
          seed,
        );

        const runtime = createGameDefRuntime(hiddenInfoDef);
        const moves = legalMoves(hiddenInfoDef, stateDefault, undefined, runtime);

        const agent = new MctsAgent(FAST_CONFIG);

        const resultDefault = agent.chooseMove({
          def: hiddenInfoDef,
          state: stateDefault,
          playerId: pid(0),
          legalMoves: moves,
          rng: createRng(555n),
          runtime,
        });

        const resultDifferent = agent.chooseMove({
          def: hiddenInfoDef,
          state: stateDifferentRng,
          playerId: pid(0),
          legalMoves: moves,
          rng: createRng(555n),
          runtime,
        });

        assert.deepStrictEqual(
          resultDefault.move,
          resultDifferent.move,
          `state.rng must not influence move choice (seed ${seed} vs 42)`,
        );
      });
    }
  });

  // ── 3. Visible-state preservation ────────────────────────────────────

  describe('belief samples preserve observer visible state', () => {
    it('derivePlayerObservation(sampled) equals derivePlayerObservation(original) for ≥10 samples', () => {
      const state = buildState({
        board: publicTokens,
        deck: hiddenConfigs[0]!,
      });
      const observer = pid(0);
      const originalObs = derivePlayerObservation(hiddenInfoDef, state, observer);
      let rng = createRng(42n);

      for (let i = 0; i < 10; i++) {
        const belief = sampleBeliefState(
          hiddenInfoDef,
          state,
          originalObs,
          observer,
          rng,
        );
        rng = belief.rng;

        const sampledObs = derivePlayerObservation(
          hiddenInfoDef,
          belief.state,
          observer,
        );

        assert.deepStrictEqual(
          sampledObs.visibleTokenIdsByZone,
          originalObs.visibleTokenIdsByZone,
          `Belief sample ${i}: visible tokens diverged`,
        );
      }
    });

    it('works with mixed-visibility (owner zones)', () => {
      const state = buildState({
        board: publicTokens,
        'hand-0': [mkToken('m1', 'card'), mkToken('m2', 'card')],
        'hand-1': [mkToken('t1', 'card'), mkToken('t2', 'card'), mkToken('t3', 'card')],
      });
      const observer = pid(0);
      const originalObs = derivePlayerObservation(mixedDef, state, observer);
      let rng = createRng(99n);

      for (let i = 0; i < 10; i++) {
        const belief = sampleBeliefState(mixedDef, state, originalObs, observer, rng);
        rng = belief.rng;

        const sampledObs = derivePlayerObservation(mixedDef, belief.state, observer);
        assert.deepStrictEqual(
          sampledObs.visibleTokenIdsByZone,
          originalObs.visibleTokenIdsByZone,
          `Mixed-visibility sample ${i}: visible tokens diverged`,
        );
      }
    });
  });

  // ── 4. Input immutability ────────────────────────────────────────────

  describe('input state immutability', () => {
    it('chooseMove does not mutate the input GameState', () => {
      const state = buildState({
        board: publicTokens,
        deck: hiddenConfigs[0]!,
      });
      const stateBefore = jsonSerialize(state);

      const runtime = createGameDefRuntime(hiddenInfoDef);
      const moves = legalMoves(hiddenInfoDef, state, undefined, runtime);
      const agent = new MctsAgent(FAST_CONFIG);

      agent.chooseMove({
        def: hiddenInfoDef,
        state,
        playerId: pid(0),
        legalMoves: moves,
        rng: createRng(42n),
        runtime,
      });

      const stateAfter = jsonSerialize(state);
      assert.equal(stateAfter, stateBefore, 'input state was mutated by chooseMove');
    });

    it('immutability holds with varied iteration counts', () => {
      for (const iterations of [5, 50]) {
        const state = buildState({
          board: publicTokens,
          deck: hiddenConfigs[0]!,
        });
        const stateBefore = jsonSerialize(state);

        const runtime = createGameDefRuntime(hiddenInfoDef);
        const moves = legalMoves(hiddenInfoDef, state, undefined, runtime);
        const agent = new MctsAgent({ iterations, minIterations: 0 });

        agent.chooseMove({
          def: hiddenInfoDef,
          state,
          playerId: pid(0),
          legalMoves: moves,
          rng: createRng(42n),
          runtime,
        });

        assert.equal(
          jsonSerialize(state),
          stateBefore,
          `state mutated with iterations=${iterations}`,
        );
      }
    });
  });

  // ── 5. Legality ──────────────────────────────────────────────────────

  describe('returned move is always in legalMoves', () => {
    it('holds for hidden-info game', () => {
      const state = buildState({
        board: publicTokens,
        deck: hiddenConfigs[0]!,
      });
      const runtime = createGameDefRuntime(hiddenInfoDef);
      const moves = legalMoves(hiddenInfoDef, state, undefined, runtime);
      const agent = new MctsAgent(FAST_CONFIG);

      const result = agent.chooseMove({
        def: hiddenInfoDef,
        state,
        playerId: pid(0),
        legalMoves: moves,
        rng: createRng(42n),
        runtime,
      });

      const legalActionIds = moves.map((m) => m.actionId);
      assert.ok(
        legalActionIds.includes(result.move.actionId),
        `returned move ${result.move.actionId} not in legal moves [${legalActionIds.join(', ')}]`,
      );

      // Deep value comparison: the exact move object must match one.
      const moveStrings = moves.map((m) => JSON.stringify(m));
      assert.ok(
        moveStrings.includes(JSON.stringify(result.move)),
        'returned move does not match any legal move by value',
      );
    });

    it('holds for perfect-info game (public zones only)', () => {
      const perfectInfoDef = buildHiddenInfoDef([mkZone('board', 'public')]);
      const state = buildState({ board: publicTokens });
      const runtime = createGameDefRuntime(perfectInfoDef);
      const moves = legalMoves(perfectInfoDef, state, undefined, runtime);
      const agent = new MctsAgent(FAST_CONFIG);

      const result = agent.chooseMove({
        def: perfectInfoDef,
        state,
        playerId: pid(0),
        legalMoves: moves,
        rng: createRng(42n),
        runtime,
      });

      const moveStrings = moves.map((m) => JSON.stringify(m));
      assert.ok(
        moveStrings.includes(JSON.stringify(result.move)),
        'returned move not in legal moves for perfect-info game',
      );
    });

    it('holds across multiple seeds', () => {
      const state = buildState({
        board: publicTokens,
        deck: hiddenConfigs[0]!,
      });
      const runtime = createGameDefRuntime(hiddenInfoDef);
      const moves = legalMoves(hiddenInfoDef, state, undefined, runtime);
      const moveStrings = moves.map((m) => JSON.stringify(m));

      for (const seed of [1n, 42n, 999n, 12345n, 99999n]) {
        const agent = new MctsAgent(FAST_CONFIG);
        const result = agent.chooseMove({
          def: hiddenInfoDef,
          state,
          playerId: pid(0),
          legalMoves: moves,
          rng: createRng(seed),
          runtime,
        });

        assert.ok(
          moveStrings.includes(JSON.stringify(result.move)),
          `move not legal with agent seed ${seed}`,
        );
      }
    });
  });

  // ── 6. Availability accounting ───────────────────────────────────────

  describe('availability accounting (ISUCT handles variable availability)', () => {
    it('does not crash or produce illegal moves when moves vary by belief sample', () => {
      // In our fixture, all actions are always legal regardless of hidden
      // state, but ISUCT's availability counters still track which children
      // are reachable in each sampled world.  The key property is: the
      // agent completes without assertion errors and returns a legal move.
      const state = buildState({
        board: publicTokens,
        deck: hiddenConfigs[0]!,
      });
      const runtime = createGameDefRuntime(hiddenInfoDef);
      const moves = legalMoves(hiddenInfoDef, state, undefined, runtime);

      // Use enough iterations to exercise availability bookkeeping.
      const agent = new MctsAgent({ iterations: 50, minIterations: 0 });

      const result = agent.chooseMove({
        def: hiddenInfoDef,
        state,
        playerId: pid(0),
        legalMoves: moves,
        rng: createRng(42n),
        runtime,
      });

      const moveStrings = moves.map((m) => JSON.stringify(m));
      assert.ok(
        moveStrings.includes(JSON.stringify(result.move)),
        'availability accounting: returned move is not legal',
      );
    });

    it('works with varied MctsConfig (default vs custom)', () => {
      const state = buildState({
        board: publicTokens,
        deck: hiddenConfigs[0]!,
      });
      const runtime = createGameDefRuntime(hiddenInfoDef);
      const moves = legalMoves(hiddenInfoDef, state, undefined, runtime);
      const moveStrings = moves.map((m) => JSON.stringify(m));

      const configs: readonly Partial<import('../../../../src/agents/mcts/config.js').MctsConfig>[] = [
        {}, // All defaults.
        { iterations: 10, minIterations: 0, explorationConstant: 2.0 },
        { iterations: 30, minIterations: 0, rolloutPolicy: 'random' },
      ];

      for (const cfg of configs) {
        const agent = new MctsAgent(cfg.iterations !== undefined ? cfg : { ...cfg, iterations: 20 });
        const result = agent.chooseMove({
          def: hiddenInfoDef,
          state,
          playerId: pid(0),
          legalMoves: moves,
          rng: createRng(42n),
          runtime,
        });

        assert.ok(
          moveStrings.includes(JSON.stringify(result.move)),
          `illegal move with config ${JSON.stringify(cfg)}`,
        );
      }
    });
  });

  // ── Cross-cutting: determinism ───────────────────────────────────────

  describe('all tests use iteration-budget mode (deterministic)', () => {
    it('same inputs produce identical results across runs', () => {
      const state = buildState({
        board: publicTokens,
        deck: hiddenConfigs[0]!,
      });
      const runtime = createGameDefRuntime(hiddenInfoDef);
      const moves = legalMoves(hiddenInfoDef, state, undefined, runtime);

      const agent = new MctsAgent(FAST_CONFIG);

      const resultA = agent.chooseMove({
        def: hiddenInfoDef,
        state,
        playerId: pid(0),
        legalMoves: moves,
        rng: createRng(42n),
        runtime,
      });

      const resultB = agent.chooseMove({
        def: hiddenInfoDef,
        state,
        playerId: pid(0),
        legalMoves: moves,
        rng: createRng(42n),
        runtime,
      });

      assert.deepStrictEqual(resultA.move, resultB.move);
      assert.deepStrictEqual(resultA.rng, resultB.rng);
    });
  });
});
