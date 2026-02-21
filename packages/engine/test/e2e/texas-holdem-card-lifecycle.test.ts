import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { RandomAgent } from '../../src/agents/index.js';
import {
  applyMove,
  assertValidatedGameDef,
  initialState,
  type Agent,
  type GameState,
  type ValidatedGameDef,
} from '../../src/kernel/index.js';
import { advanceToDecisionPoint } from '../../src/kernel/phase-advance.js';
import { runGame } from '../../src/sim/index.js';
import { assertNoDiagnostics, assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileTexasProductionSpec } from '../helpers/production-spec-helpers.js';

const compileTexasDef = (): ValidatedGameDef => {
  const { parsed, compiled } = compileTexasProductionSpec();
  assertNoErrors(parsed);
  assertNoDiagnostics(compiled, parsed.sourceMap);
  if (compiled.gameDef === null) {
    throw new Error('Expected compiled Texas gameDef to be present');
  }
  return assertValidatedGameDef(compiled.gameDef);
};

const createRandomAgents = (count: number): readonly Agent[] =>
  Array.from({ length: count }, () => new RandomAgent());

/** Count tokens in a specific zone. */
const zoneSize = (state: GameState, zoneName: string): number =>
  (state.zones[zoneName] ?? []).length;

/** Count total tokens across all zones. */
const totalTokenCount = (state: GameState): number =>
  Object.values(state.zones).reduce((sum, tokens) => sum + tokens.length, 0);

/** Check whether a player is folded (handActive=false and not eliminated). */
const isPlayerFolded = (state: GameState, player: number): boolean =>
  state.perPlayerVars[player]?.handActive === false
  && state.perPlayerVars[player]?.eliminated !== true;

/** Check whether a player is eliminated. */
const isPlayerEliminated = (state: GameState, player: number): boolean =>
  state.perPlayerVars[player]?.eliminated === true;

describe('texas hold\'em card lifecycle e2e', () => {
  /**
   * T1: Deck recycling — run a multi-hand game and verify the deck
   * does not become permanently depleted. Without muck-to-deck recycling,
   * a 2-player game exhausts the 52-card deck after ~4-5 hands.
   */
  it('recycles cards from muck to deck between hands (deck never depletes)', () => {
    const def = compileTexasDef();
    const playerCount = 2;
    const seed = 42;
    const maxTurns = 300;
    const agents = createRandomAgents(playerCount);
    const trace = runGame(def, seed, agents, maxTurns, playerCount);

    const handsPlayed = Number(trace.finalState.globalVars.handsPlayed ?? 0);
    assert.ok(handsPlayed >= 5, `expected at least 5 hands but got ${handsPlayed}`);

    assert.equal(totalTokenCount(trace.finalState), 52, 'total card count must be 52');

    const muckSize = zoneSize(trace.finalState, 'muck:none');
    const deckSize = zoneSize(trace.finalState, 'deck:none');
    assert.ok(
      muckSize < 52,
      `all 52 cards ended up in muck — deck recycling is broken (muck=${muckSize}, deck=${deckSize})`,
    );
  });

  /**
   * T5: Run longer games across multiple seeds and verify the deck never
   * runs empty during a phase that needs drawing.
   */
  it('deck never runs empty across a multi-hand game (stress test)', () => {
    const def = compileTexasDef();

    for (const { playerCount, seed, maxTurns } of [
      { playerCount: 2, seed: 200, maxTurns: 500 },
      { playerCount: 2, seed: 201, maxTurns: 500 },
      { playerCount: 2, seed: 202, maxTurns: 500 },
      { playerCount: 4, seed: 300, maxTurns: 500 },
      { playerCount: 6, seed: 400, maxTurns: 500 },
    ]) {
      const agents = createRandomAgents(playerCount);
      const trace = runGame(def, seed, agents, maxTurns, playerCount);

      const handsPlayed = Number(trace.finalState.globalVars.handsPlayed ?? 0);
      const totalCards = totalTokenCount(trace.finalState);

      assert.equal(
        totalCards,
        52,
        `[seed=${seed}, players=${playerCount}] total cards is ${totalCards}, expected 52`,
      );

      if (handsPlayed >= 5) {
        const deckSize = zoneSize(trace.finalState, 'deck:none');
        const muckSize = zoneSize(trace.finalState, 'muck:none');

        assert.ok(
          deckSize > 0 || trace.stopReason === 'terminal',
          `[seed=${seed}, players=${playerCount}] deck is empty after ${handsPlayed} hands — recycling broken (muck=${muckSize})`,
        );
      }
    }
  });

  /**
   * T6: Zone-specific conservation — total cards across all zones = 52.
   */
  it('card conservation holds across all zones in final state', () => {
    const def = compileTexasDef();

    for (const seed of [100, 150, 200, 250, 300]) {
      for (const playerCount of [2, 3, 4, 6]) {
        const agents = createRandomAgents(playerCount);
        const trace = runGame(def, seed, agents, 200, playerCount);

        const deckSize = zoneSize(trace.finalState, 'deck:none');
        const muckSize = zoneSize(trace.finalState, 'muck:none');
        const communitySize = zoneSize(trace.finalState, 'community:none');
        const burnSize = zoneSize(trace.finalState, 'burn:none');

        let handTotal = 0;
        for (let player = 0; player < playerCount; player += 1) {
          handTotal += zoneSize(trace.finalState, `hand:${player}`);
        }

        const total = deckSize + muckSize + communitySize + burnSize + handTotal;

        assert.equal(
          total,
          52,
          `[seed=${seed}, players=${playerCount}] card conservation violated: deck=${deckSize} muck=${muckSize} community=${communitySize} burn=${burnSize} hands=${handTotal} total=${total}`,
        );
      }
    }
  });

  /**
   * T7: Long tournament multi-hand stress test.
   * Verifies card lifecycle invariants hold across extended play.
   */
  it('survives long tournament runs without card lifecycle violations', () => {
    const def = compileTexasDef();

    const configs = [
      { playerCount: 2, seed: 500, maxTurns: 600 },
      { playerCount: 4, seed: 501, maxTurns: 600 },
      { playerCount: 6, seed: 502, maxTurns: 600 },
    ];

    for (const { playerCount, seed, maxTurns } of configs) {
      const agents = createRandomAgents(playerCount);
      const trace = runGame(def, seed, agents, maxTurns, playerCount);

      const handsPlayed = Number(trace.finalState.globalVars.handsPlayed ?? 0);
      const totalCards = totalTokenCount(trace.finalState);

      assert.equal(
        totalCards,
        52,
        `[seed=${seed}, players=${playerCount}] total cards ${totalCards} != 52 after ${handsPlayed} hands`,
      );

      if (playerCount === 2) {
        assert.ok(
          handsPlayed >= 8 || trace.stopReason === 'terminal',
          `[seed=${seed}] expected >= 8 hands with 2 players over ${maxTurns} turns, got ${handsPlayed} (stop=${trace.stopReason})`,
        );
      }

      const muckSize = zoneSize(trace.finalState, 'muck:none');
      if (handsPlayed >= 2) {
        assert.ok(
          muckSize < 52,
          `[seed=${seed}, players=${playerCount}] all cards in muck after ${handsPlayed} hands — recycling broken`,
        );
      }
    }
  });

  /**
   * T2: Active players hold exactly 2 cards at decision points during betting phases.
   * Replays a game step by step to verify card counts at every decision point.
   */
  it('active players hold exactly 2 cards at decision points during betting phases', () => {
    const def = compileTexasDef();
    const playerCount = 2;
    const seed = 42;
    const agents = createRandomAgents(playerCount);
    const trace = runGame(def, seed, agents, 300, playerCount);

    let current = advanceToDecisionPoint(def, initialState(def, seed, playerCount).state);

    for (const entry of trace.moves) {
      const phase = current.currentPhase;

      if (['preflop', 'flop', 'turn', 'river'].includes(phase)) {
        for (let player = 0; player < playerCount; player += 1) {
          if (!isPlayerEliminated(current, player) && !isPlayerFolded(current, player)) {
            const handSize = zoneSize(current, `hand:${player}`);
            assert.equal(
              handSize,
              2,
              `player ${player} has ${handSize} cards in hand during ${phase} (expected 2) [handsPlayed=${String(current.globalVars.handsPlayed)}]`,
            );
          }
        }
      }

      current = applyMove(def, current, entry.move).state;
    }
  });

  /**
   * T3 + T4: Community and burn card counts match phase expectations.
   * Replays a game step by step to verify zone sizes at every decision point.
   */
  it('community and burn card counts match phase during betting rounds', () => {
    const def = compileTexasDef();
    const playerCount = 3;
    const seed = 55;
    const agents = createRandomAgents(playerCount);
    const trace = runGame(def, seed, agents, 200, playerCount);

    let current = advanceToDecisionPoint(def, initialState(def, seed, playerCount).state);

    const expectedCommunity: Record<string, number> = {
      preflop: 0,
      flop: 3,
      turn: 4,
      river: 5,
    };

    const expectedBurn: Record<string, number> = {
      preflop: 0,
      flop: 1,
      turn: 2,
      river: 3,
    };

    for (const entry of trace.moves) {
      const phase = current.currentPhase;

      if (phase in expectedCommunity) {
        const communitySize = zoneSize(current, 'community:none');
        assert.equal(
          communitySize,
          expectedCommunity[phase],
          `community has ${communitySize} cards during ${phase} (expected ${expectedCommunity[phase]}) [handsPlayed=${String(current.globalVars.handsPlayed)}]`,
        );
      }

      if (phase in expectedBurn) {
        const burnSize = zoneSize(current, 'burn:none');
        assert.equal(
          burnSize,
          expectedBurn[phase],
          `burn has ${burnSize} cards during ${phase} (expected ${expectedBurn[phase]}) [handsPlayed=${String(current.globalVars.handsPlayed)}]`,
        );
      }

      current = applyMove(def, current, entry.move).state;
    }
  });
});
