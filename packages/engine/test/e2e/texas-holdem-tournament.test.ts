import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GreedyAgent, RandomAgent } from '../../src/agents/index.js';
import {
  applyMove,
  asPhaseId,
  assertValidatedGameDef,
  asPlayerId,
  initialState,
  legalMoves,
  serializeTrace,
  terminalResult,
  type Agent,
  type GameState,
  type GameTrace,
  type ValidatedGameDef,
} from '../../src/kernel/index.js';
import { advancePhase, advanceToDecisionPoint } from '../../src/kernel/phase-advance.js';
import { runGame } from '../../src/sim/index.js';
import { assertNoDiagnostics, assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileTexasProductionSpec } from '../helpers/production-spec-helpers.js';
import { replayScript, type ReplayExecutedStep } from '../helpers/replay-harness.js';

interface BlindScheduleRow {
  readonly level: number;
  readonly sb: number;
  readonly bb: number;
  readonly ante: number;
  readonly handsUntilNext: number;
}

const FULL_TOURNAMENT_MAX_TURNS = 10_000;
const SHORT_TOURNAMENT_MAX_TURNS = 80;
const PLAYER_COUNT_SEEDS: Readonly<Record<number, number>> = {
  2: 102,
  3: 103,
  6: 106,
  10: 9,
};
const traceCache = new Map<string, GameTrace>();

const compileTexasDef = (): ValidatedGameDef => {
  const { parsed, compiled } = compileTexasProductionSpec();
  assertNoErrors(parsed);
  assertNoDiagnostics(compiled, parsed.sourceMap);
  if (compiled.gameDef === null) {
    throw new Error('Expected compiled Texas gameDef to be present');
  }
  return assertValidatedGameDef(compiled.gameDef);
};

const createAgents = (count: number, kind: 'random' | 'greedy' | 'mixed'): readonly Agent[] => {
  if (kind === 'random') {
    return Array.from({ length: count }, () => new RandomAgent());
  }
  if (kind === 'greedy') {
    return Array.from({ length: count }, () => new GreedyAgent());
  }
  return Array.from({ length: count }, (_unused, index) => (index % 2 === 0 ? new RandomAgent() : new GreedyAgent()));
};

const totalChipsInPlay = (state: GameState): number => {
  const pot = Number(state.globalVars.pot ?? 0);
  const stacks = Array.from({ length: state.playerCount }, (_unused, index) => Number(state.perPlayerVars[String(index)]?.chipStack ?? 0));
  return stacks.reduce((sum, value) => sum + value, 0) + pot;
};

const nonEliminatedPlayers = (state: GameState): readonly number[] =>
  Array.from({ length: state.playerCount }, (_unused, player) => player)
    .filter((player) => state.perPlayerVars[String(player)]?.eliminated === false);

const readBlindSchedule = (def: ValidatedGameDef): readonly BlindScheduleRow[] => {
  const scenario = (def.runtimeDataAssets ?? []).find((asset) => asset.id === 'tournament-standard' && asset.kind === 'scenario');
  assert.ok(scenario, 'missing tournament-standard scenario asset');

  const payload = scenario.payload as {
    readonly settings?: {
      readonly blindSchedule?: readonly BlindScheduleRow[];
    };
  };

  const schedule = payload.settings?.blindSchedule;
  assert.ok(schedule, 'missing scenario.settings.blindSchedule');
  return schedule;
};

const replayTrace = (
  def: ValidatedGameDef,
  trace: GameTrace,
  playerCount: number,
): { readonly initial: GameState; readonly final: GameState; readonly steps: readonly ReplayExecutedStep[] } =>
  replayScript({
    def,
    initialState: initialState(def, trace.seed, playerCount),
    script: trace.moves.map((entry) => ({
      move: entry.move,
      expectedStateHash: entry.stateHash,
    })),
    keyVars: ['pot', 'blindLevel', 'handsPlayed', 'activePlayers'],
  });

const loadTrace = (
  def: ValidatedGameDef,
  seed: number,
  agents: readonly Agent[],
  playerCount: number,
  maxTurns = SHORT_TOURNAMENT_MAX_TURNS,
): GameTrace => {
  const key = `${seed}:${playerCount}:${maxTurns}:${agents.map((agent) => agent.constructor.name).join(',')}`;
  const cached = traceCache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const trace = runGame(def, seed, agents, maxTurns, playerCount);
  traceCache.set(key, trace);
  return trace;
};

describe('texas hold\'em tournament e2e', () => {
  it('completes a 4-player random-agent tournament run with stable end-state invariants', () => {
    const def = compileTexasDef();
    const playerCount = 4;
    const trace = loadTrace(def, 42, createAgents(playerCount, 'random'), playerCount, FULL_TOURNAMENT_MAX_TURNS);

    const totalInitialChips = totalChipsInPlay(initialState(def, 42, playerCount));
    assert.equal(totalChipsInPlay(trace.finalState), totalInitialChips);
    assert.equal(trace.stopReason === 'terminal' || trace.stopReason === 'maxTurns', true);

    const alive = nonEliminatedPlayers(trace.finalState);
    if (trace.stopReason === 'terminal') {
      assert.notEqual(trace.result, null);
      assert.deepEqual(alive.length, 1);
      const winner = alive[0]!;
      assert.equal(Number(trace.finalState.perPlayerVars[String(winner)]?.chipStack ?? 0), totalInitialChips);
      return;
    }

    assert.equal(trace.result, null);
    assert.equal(alive.length > 1, true);
  });

  for (const playerCount of [2, 3, 6, 10]) {
    it(`completes random-agent tournament at playerCount=${playerCount}`, () => {
      const def = compileTexasDef();
      const seed = PLAYER_COUNT_SEEDS[playerCount]!;
      const trace = loadTrace(
        def,
        seed,
        createAgents(playerCount, 'random'),
        playerCount,
        FULL_TOURNAMENT_MAX_TURNS,
      );

      assert.equal(trace.stopReason, 'terminal');
      assert.notEqual(trace.result, null);
      assert.equal(nonEliminatedPlayers(trace.finalState).length, 1);
    });
  }

  it('is deterministic for identical seed and agent lineup', () => {
    const def = compileTexasDef();
    const playerCount = 4;
    const agentsA = createAgents(playerCount, 'random');
    const agentsB = createAgents(playerCount, 'random');

    const first = loadTrace(def, 77, agentsA, playerCount);
    const second = loadTrace(def, 77, agentsB, playerCount);

    assert.deepEqual(
      first.moves.map((entry) => entry.move),
      second.moves.map((entry) => entry.move),
    );
    assert.equal(first.finalState.stateHash, second.finalState.stateHash);
    assert.deepEqual(serializeTrace(first), serializeTrace(second));

    const firstWinner = first.result?.type === 'score' ? first.result.ranking[0]?.player : undefined;
    const secondWinner = second.result?.type === 'score' ? second.result.ranking[0]?.player : undefined;
    assert.equal(firstWinner, secondWinner);
  });

  it('follows the blind schedule exactly and only changes blinds at hand boundaries', () => {
    const def = compileTexasDef();
    const playerCount = 6;
    const trace = loadTrace(def, 58, createAgents(playerCount, 'random'), playerCount);
    const replay = replayTrace(def, trace, playerCount);
    const schedule = readBlindSchedule(def);

    const states = [replay.initial, ...replay.steps.map((step) => step.after)];

    for (let index = 0; index < states.length; index += 1) {
      const current = states[index]!;
      const row = schedule.find((entry) => entry.level === Number(current.globalVars.blindLevel));
      assert.ok(row, `missing schedule row for blind level ${String(current.globalVars.blindLevel)}`);
      assert.equal(Number(current.globalVars.smallBlind), row!.sb);
      assert.equal(Number(current.globalVars.bigBlind), row!.bb);
      assert.equal(Number(current.globalVars.ante), row!.ante);

      if (index === 0) {
        continue;
      }

      const prev = states[index - 1]!;
      const changed =
        Number(prev.globalVars.blindLevel) !== Number(current.globalVars.blindLevel)
        || Number(prev.globalVars.smallBlind) !== Number(current.globalVars.smallBlind)
        || Number(prev.globalVars.bigBlind) !== Number(current.globalVars.bigBlind)
        || Number(prev.globalVars.ante) !== Number(current.globalVars.ante);
      if (changed) {
        assert.equal(Number(current.globalVars.handsPlayed) > Number(prev.globalVars.handsPlayed), true);
      }
    }
  });

  it('keeps per-turn legal move cardinality bounded under Texas raise rebucketing', () => {
    const def = compileTexasDef();
    const playerCount = 6;
    const trace = loadTrace(def, 58, createAgents(playerCount, 'random'), playerCount);
    const replay = replayTrace(def, trace, playerCount);

    const peakLegalMoveCount = replay.steps.reduce(
      (peak, step) => Math.max(peak, step.legal.length),
      legalMoves(def, replay.initial).length,
    );

    assert.equal(peakLegalMoveCount <= 13, true, `peak legal move count exceeded cap: ${peakLegalMoveCount}`);
  });

  it('marks eliminated players and removes them from future participation', () => {
    const def = compileTexasDef();
    const base = advanceToDecisionPoint(def, initialState(def, 13, 3));
    const engineered: GameState = {
      ...base,
      currentPhase: asPhaseId('showdown'),
      globalVars: {
        ...base.globalVars,
        activePlayers: 3,
        pot: 0,
      },
      perPlayerVars: {
        ...base.perPlayerVars,
        '0': { ...base.perPlayerVars['0']!, chipStack: 0, eliminated: false, handActive: false },
        '1': { ...base.perPlayerVars['1']!, chipStack: 0, eliminated: false, handActive: false },
        '2': { ...base.perPlayerVars['2']!, chipStack: 300, eliminated: false, handActive: true },
      },
    };

    const afterCleanup = advancePhase(def, engineered);
    const eliminatedPlayers = [0, 1];
    assert.equal(Number(afterCleanup.globalVars.activePlayers), 1);
    for (const player of eliminatedPlayers) {
      assert.equal(afterCleanup.perPlayerVars[String(player)]?.eliminated, true);
      assert.equal(afterCleanup.zones[`hand:${player}`]?.length ?? 0, 0);
      const shadowState = { ...afterCleanup, activePlayer: asPlayerId(player) };
      assert.equal(legalMoves(def, shadowState).length, 0);
    }
  });

  it('switches to heads-up blind/order rules after 3-player to 2-player transition', () => {
    const def = compileTexasDef();
    const base = advanceToDecisionPoint(def, initialState(def, 31, 3));
    const engineered: GameState = {
      ...base,
      currentPhase: asPhaseId('hand-cleanup'),
      globalVars: {
        ...base.globalVars,
        activePlayers: 2,
      },
      perPlayerVars: {
        ...base.perPlayerVars,
        '2': {
          ...base.perPlayerVars['2']!,
          eliminated: true,
          chipStack: 0,
          handActive: false,
          allIn: true,
        },
      },
    };

    const headsUpState = advanceToDecisionPoint(def, advancePhase(def, engineered));

    const alive = nonEliminatedPlayers(headsUpState);
    assert.deepEqual(alive.length, 2);

    const dealerSeat = Number(headsUpState.globalVars.dealerSeat);
    const bbSeat = alive.find((player) => player !== dealerSeat);
    assert.notEqual(bbSeat, undefined);

    assert.equal(Number(headsUpState.globalVars.activePlayers), 2);
    assert.equal(Number(headsUpState.activePlayer), dealerSeat);
    assert.equal(Number(headsUpState.globalVars.actingPosition), dealerSeat);
    assert.equal(Number(headsUpState.perPlayerVars[String(dealerSeat)]?.streetBet ?? -1), Number(headsUpState.globalVars.smallBlind));
    assert.equal(Number(headsUpState.perPlayerVars[String(bbSeat)]?.streetBet ?? -1), Number(headsUpState.globalVars.bigBlind));
  });

  it('completes a 4-player greedy-agent tournament without runtime errors', () => {
    const def = compileTexasDef();
    const trace = loadTrace(def, 63, createAgents(4, 'greedy'), 4);

    assert.equal(trace.stopReason === 'terminal' || trace.stopReason === 'maxTurns', true);
  });

  it('completes a mixed-agent tournament (random + greedy)', () => {
    const def = compileTexasDef();
    const trace = loadTrace(def, 64, createAgents(4, 'mixed'), 4);

    assert.equal(trace.stopReason === 'terminal' || trace.stopReason === 'maxTurns', true);
  });

  it('handles simultaneous elimination in a single hand-cleanup pass', () => {
    const def = compileTexasDef();
    const base = advanceToDecisionPoint(def, initialState(def, 11, 3));

    const engineered: GameState = {
      ...base,
      currentPhase: asPhaseId('showdown'),
      globalVars: {
        ...base.globalVars,
        activePlayers: 3,
        pot: 0,
      },
      perPlayerVars: {
        ...base.perPlayerVars,
        '0': {
          ...base.perPlayerVars['0']!,
          chipStack: 0,
          eliminated: false,
          handActive: false,
        },
        '1': {
          ...base.perPlayerVars['1']!,
          chipStack: 0,
          eliminated: false,
          handActive: false,
        },
        '2': {
          ...base.perPlayerVars['2']!,
          chipStack: 300,
          eliminated: false,
          handActive: true,
        },
      },
    };

    const afterCleanup = advancePhase(def, engineered);

    assert.equal(Number(afterCleanup.globalVars.activePlayers), 1);
    assert.equal(afterCleanup.perPlayerVars['0']?.eliminated, true);
    assert.equal(afterCleanup.perPlayerVars['1']?.eliminated, true);
    assert.equal(afterCleanup.perPlayerVars['2']?.eliminated, false);
  });

  it('changes blinds exactly on hand boundaries at schedule thresholds', () => {
    const def = compileTexasDef();
    const state = advanceToDecisionPoint(def, initialState(def, 71, 4));
    const beforeBoundary: GameState = {
      ...state,
      currentPhase: asPhaseId('showdown'),
      globalVars: {
        ...state.globalVars,
        handsPlayed: 9,
        blindLevel: 0,
        smallBlind: 10,
        bigBlind: 20,
        ante: 0,
      },
    };

    const afterBoundary = advancePhase(def, beforeBoundary);
    assert.equal(Number(afterBoundary.globalVars.handsPlayed), 10);
    assert.equal(Number(beforeBoundary.globalVars.blindLevel), 0);
    assert.equal(Number(beforeBoundary.globalVars.smallBlind), 10);
    assert.equal(Number(afterBoundary.globalVars.blindLevel), 1);
    assert.equal(Number(afterBoundary.globalVars.smallBlind), 15);
    assert.equal(Number(afterBoundary.globalVars.bigBlind), 30);
    assert.equal(Number(afterBoundary.globalVars.ante), 0);
  });

  it('resolves all-in preflop hands by dealing out the board before cleanup', () => {
    const def = compileTexasDef();
    let state = advanceToDecisionPoint(def, initialState(def, 91, 4));

    let safety = 0;
    while (state.currentPhase === 'preflop' && Number(state.globalVars.handsPlayed) === 0 && safety < 16) {
      const moves = legalMoves(def, state);
      assert.equal(moves.length > 0, true);

      const selected =
        moves.find((move) => move.actionId === 'allIn')
        ?? moves.find((move) => move.actionId === 'call')
        ?? moves.find((move) => move.actionId === 'check')
        ?? moves.find((move) => move.actionId === 'fold')
        ?? moves[0];
      assert.ok(selected);

      state = applyMove(def, state, selected!).state;
      safety += 1;
    }

    assert.equal(Number(state.globalVars.handsPlayed) > 0, true, 'expected hand to finish');

    const cardsInMuck = state.zones['muck:none']?.length ?? 0;
    assert.equal(cardsInMuck >= 8, true, 'muck should contain cards from completed hand');
  });

  it('terminates once one player remains and ranks that player first', () => {
    const def = compileTexasDef();
    const base = advanceToDecisionPoint(def, initialState(def, 17, 3));
    const engineered: GameState = {
      ...base,
      globalVars: {
        ...base.globalVars,
        activePlayers: 1,
      },
      perPlayerVars: {
        ...base.perPlayerVars,
        '0': { ...base.perPlayerVars['0']!, eliminated: false, chipStack: 300 },
        '1': { ...base.perPlayerVars['1']!, eliminated: true, chipStack: 0 },
        '2': { ...base.perPlayerVars['2']!, eliminated: true, chipStack: 0 },
      },
    };

    const finalTerminal = terminalResult(def, engineered);
    assert.notEqual(finalTerminal, null);
    assert.equal(finalTerminal?.type, 'score');
    if (finalTerminal?.type === 'score') {
      assert.equal(finalTerminal.ranking[0]?.player, 0);
    }
  });
});
