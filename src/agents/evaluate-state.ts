import { buildAdjacencyGraph } from '../kernel/spatial.js';
import { evalValue } from '../kernel/eval-value.js';
import { terminalResult } from '../kernel/terminal.js';
import type { PlayerId } from '../kernel/branded.js';
import type { EvalContext } from '../kernel/eval-context.js';
import { createCollector } from '../kernel/execution-collector.js';
import type { GameDef, GameState } from '../kernel/types.js';

const TERMINAL_WIN_SCORE = 1_000_000_000;
const TERMINAL_LOSS_SCORE = -1_000_000_000;
const OWN_VAR_WEIGHT = 10_000;
const OPPONENT_VAR_WEIGHT = 2_500;
const SCORING_WEIGHT = 100;

const playerVarValue = (state: GameState, playerId: PlayerId, varName: string): number =>
  typeof state.perPlayerVars[String(playerId)]?.[varName] === 'number' ? (state.perPlayerVars[String(playerId)]?.[varName] as number) : 0;

const evalScoringValue = (def: GameDef, state: GameState, playerId: PlayerId): number => {
  if (!def.terminal.scoring) {
    return 0;
  }

  const ctx: EvalContext = {
    def,
    adjacencyGraph: buildAdjacencyGraph(def.zones),
    state,
    activePlayer: state.activePlayer,
    actorPlayer: playerId,
    bindings: {},
    collector: createCollector(),
  };
  const score = evalValue(def.terminal.scoring.value, ctx);
  if (typeof score !== 'number') {
    throw new Error('Greedy evaluator scoring expression must evaluate to a number');
  }

  return score * SCORING_WEIGHT;
};

const scoreTerminalResult = (def: GameDef, state: GameState, playerId: PlayerId): number | null => {
  const terminal = terminalResult(def, state);
  if (terminal === null) {
    return null;
  }

  if (terminal.type === 'draw') {
    return 0;
  }

  if (terminal.type === 'win') {
    return terminal.player === playerId ? TERMINAL_WIN_SCORE : TERMINAL_LOSS_SCORE;
  }

  if (terminal.type === 'lossAll') {
    return TERMINAL_LOSS_SCORE;
  }

  const playerScore = terminal.ranking.find((entry) => entry.player === playerId)?.score;
  const topScore = terminal.ranking[0]?.score;
  if (playerScore !== undefined && topScore !== undefined && playerScore === topScore) {
    return TERMINAL_WIN_SCORE;
  }

  return TERMINAL_LOSS_SCORE;
};

export const evaluateState = (def: GameDef, state: GameState, playerId: PlayerId): number => {
  const terminalScore = scoreTerminalResult(def, state, playerId);
  if (terminalScore !== null) {
    return terminalScore;
  }

  let score = evalScoringValue(def, state, playerId);

  for (const variable of def.perPlayerVars) {
    if (variable.type !== 'int') {
      continue;
    }
    const range = Math.max(1, variable.max - variable.min);
    const ownValue = playerVarValue(state, playerId, variable.name) - variable.min;
    score += Math.trunc((ownValue * OWN_VAR_WEIGHT) / range);

    for (let player = 0; player < state.playerCount; player += 1) {
      if (player === playerId) {
        continue;
      }
      const opponentValue = playerVarValue(state, player as PlayerId, variable.name) - variable.min;
      score -= Math.trunc((opponentValue * OPPONENT_VAR_WEIGHT) / range);
    }
  }

  return score;
};
