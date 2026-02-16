import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { RandomAgent } from '../../src/agents/index.js';
import {
  applyMove,
  assertValidatedGameDef,
  initialState,
  legalMoves,
  type GameState,
  type GameTrace,
  type ValidatedGameDef,
} from '../../src/kernel/index.js';
import { runGame } from '../../src/sim/index.js';
import { assertNoDiagnostics, assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileTexasProductionSpec } from '../helpers/production-spec-helpers.js';
import { replayScript } from '../helpers/replay-harness.js';

interface ReplaySnapshot {
  readonly state: GameState;
  readonly legal: ReturnType<typeof legalMoves>;
}

const PROPERTY_SEEDS = [11, 17, 23, 29, 31] as const;
const PLAYER_COUNT = 2;
const MAX_TURNS = 20;

const compileTexasDef = (): ValidatedGameDef => {
  const { parsed, compiled } = compileTexasProductionSpec();
  assertNoErrors(parsed);
  assertNoDiagnostics(compiled, parsed.sourceMap);
  if (compiled.gameDef === null) {
    throw new Error('Expected compiled Texas gameDef to be present');
  }
  return assertValidatedGameDef(compiled.gameDef);
};

const totalCardsAcrossZones = (state: GameState): number =>
  Object.values(state.zones).reduce((sum, zone) => sum + zone.length, 0);

const totalChipsInPlay = (state: GameState): number => {
  const stacks = Array.from({ length: state.playerCount }, (_unused, player) => Number(state.perPlayerVars[String(player)]?.chipStack ?? 0));
  return stacks.reduce((sum, value) => sum + value, 0) + Number(state.globalVars.pot ?? 0);
};

const totalNonEliminatedChipsInPlay = (state: GameState): number => {
  const stacks = Array.from({ length: state.playerCount }, (_unused, player) => ({
    player,
    stack: Number(state.perPlayerVars[String(player)]?.chipStack ?? 0),
    eliminated: state.perPlayerVars[String(player)]?.eliminated === true,
  }));

  return stacks
    .filter((entry) => !entry.eliminated)
    .reduce((sum, entry) => sum + entry.stack, 0) + Number(state.globalVars.pot ?? 0);
};

const cardOwnershipHistogram = (state: GameState): ReadonlyMap<string, number> => {
  const histogram = new Map<string, number>();
  for (const zone of Object.values(state.zones)) {
    for (const token of zone) {
      histogram.set(token.id, (histogram.get(token.id) ?? 0) + 1);
    }
  }
  return histogram;
};

const replayTrace = (
  def: ValidatedGameDef,
  trace: GameTrace,
): readonly ReplaySnapshot[] => {
  const replayed = replayScript({
    def,
    initialState: initialState(def, trace.seed, PLAYER_COUNT),
    script: trace.moves.map((entry) => ({
      move: entry.move,
      expectedStateHash: entry.stateHash,
    })),
    keyVars: ['pot', 'blindLevel', 'handsPlayed', 'currentBet'],
  });
  return [
    { state: replayed.initial, legal: legalMoves(def, replayed.initial) },
    ...replayed.steps.map((step) => ({ state: step.after, legal: legalMoves(def, step.after) })),
  ];
};

const runShortTournament = (def: ValidatedGameDef, seed: number): GameTrace =>
  runGame(
    def,
    seed,
    Array.from({ length: PLAYER_COUNT }, () => new RandomAgent()),
    MAX_TURNS,
    PLAYER_COUNT,
  );

describe('texas hold\'em property invariants', () => {
  it('I1: conserves total chips across transitions', () => {
    const def = compileTexasDef();

    for (const seed of PROPERTY_SEEDS) {
      const trace = runShortTournament(def, seed);
      const snapshots = replayTrace(def, trace);
      const expectedTotal = totalChipsInPlay(snapshots[0]!.state);

      for (const { state } of snapshots) {
        assert.equal(totalChipsInPlay(state), expectedTotal, `seed=${seed} total chips must stay constant`);
        assert.equal(totalNonEliminatedChipsInPlay(state), expectedTotal, `seed=${seed} non-eliminated stacks + pot must stay constant`);
      }
    }
  });

  it('I2: conserves 52 cards across all zones at every state', () => {
    const def = compileTexasDef();

    for (const seed of PROPERTY_SEEDS) {
      const trace = runShortTournament(def, seed);
      const snapshots = replayTrace(def, trace);

      for (const { state } of snapshots) {
        assert.equal(totalCardsAcrossZones(state), 52, `seed=${seed} card conservation violated`);
      }
    }
  });

  it('I3: never allows negative chip stacks', () => {
    const def = compileTexasDef();

    for (const seed of PROPERTY_SEEDS) {
      const trace = runShortTournament(def, seed);
      const snapshots = replayTrace(def, trace);

      for (const { state } of snapshots) {
        for (let player = 0; player < state.playerCount; player += 1) {
          const stack = Number(state.perPlayerVars[String(player)]?.chipStack ?? 0);
          assert.equal(stack >= 0, true, `seed=${seed} player=${player} has negative stack`);
        }
      }
    }
  });

  it('I4: yields identical final state hash when replayed with identical seed', () => {
    const def = compileTexasDef();

    for (const seed of PROPERTY_SEEDS) {
      const first = runShortTournament(def, seed);
      const second = runShortTournament(def, seed);

      assert.equal(first.finalState.stateHash, second.finalState.stateHash, `seed=${seed} final state hash mismatch`);
    }
  });

  it('I5: every enumerated legal move applies without failing preconditions', () => {
    const def = compileTexasDef();

    for (const seed of PROPERTY_SEEDS) {
      const trace = runShortTournament(def, seed);
      const snapshots = replayTrace(def, trace);

      for (const snapshot of snapshots) {
        for (const move of snapshot.legal) {
          assert.doesNotThrow(() => {
            applyMove(def, snapshot.state, move);
          }, `seed=${seed} action=${String(move.actionId)} should be applicable`);
        }
      }
    }
  });

  it('I6: each card token belongs to exactly one zone at every state', () => {
    const def = compileTexasDef();

    for (const seed of PROPERTY_SEEDS) {
      const trace = runShortTournament(def, seed);
      const snapshots = replayTrace(def, trace);

      for (const { state } of snapshots) {
        const histogram = cardOwnershipHistogram(state);
        assert.equal(histogram.size, 52, `seed=${seed} expected exactly 52 distinct cards`);
        for (const [tokenId, count] of histogram) {
          assert.equal(count, 1, `seed=${seed} token ${tokenId} appears in ${count} zones`);
        }
      }
    }
  });
});
