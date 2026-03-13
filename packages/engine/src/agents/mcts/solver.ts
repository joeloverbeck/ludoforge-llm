/**
 * Restricted MCTS-Solver support for deterministic, perfect-information,
 * 2-player, win/loss/draw games.
 *
 * The solver proves nodes as won/lost/drawn via minimax back-propagation,
 * enabling exact endgame play.  It is deliberately restricted to avoid
 * unsound application to hidden-info or stochastic games.
 *
 * Mutable `provenResult` on MctsNode is updated in-place — same rationale
 * as the rest of the MCTS module.
 */

import type { GameDef, GameState, EffectAST, TerminalResult } from '../../kernel/types.js';
import type { PlayerId } from '../../kernel/branded.js';
import type { MctsNode, ProvenResult } from './node.js';
import type { MctsConfig } from './config.js';
import { terminalResult } from '../../kernel/terminal.js';
import type { GameDefRuntime } from '../../kernel/gamedef-runtime.js';

// ---------------------------------------------------------------------------
// Activation guard
// ---------------------------------------------------------------------------

/**
 * Check whether the solver can be activated for the given game.
 *
 * Returns `true` only when ALL conditions hold:
 * - `config.solverMode === 'perfectInfoDeterministic2P'`
 * - All zones have `visibility: 'public'`
 * - No `RevealGrant`s in state (no hidden-info mechanics active)
 * - `state.playerCount === 2`
 * - Terminal semantics are `win`/`draw`/`lossAll` only (no `score` ranking)
 * - Game is deterministic (heuristic: no `rollRandom` in action effects)
 */
export function canActivateSolver(
  def: GameDef,
  state: GameState,
  config: MctsConfig,
): boolean {
  if (config.solverMode !== 'perfectInfoDeterministic2P') {
    return false;
  }

  // Must be exactly 2 players.
  if (state.playerCount !== 2) {
    return false;
  }

  // All zones must be public.
  for (const zone of def.zones) {
    if (zone.visibility !== 'public') {
      return false;
    }
  }

  // No reveal grants may be active (hidden-info mechanics).
  if (state.reveals !== undefined) {
    for (const zoneId of Object.keys(state.reveals)) {
      const grants = state.reveals[zoneId];
      if (grants !== undefined && grants.length > 0) {
        return false;
      }
    }
  }

  // Terminal semantics must not include 'score' ranking.
  for (const cond of def.terminal.conditions) {
    if (cond.result.type === 'score') {
      return false;
    }
  }

  // Heuristic: no rollRandom in any action effect tree.
  for (const action of def.actions) {
    if (effectsContainRollRandom(action.effects)) {
      return false;
    }
    if (effectsContainRollRandom(action.cost)) {
      return false;
    }
  }

  return true;
}

// ---------------------------------------------------------------------------
// rollRandom detection helpers
// ---------------------------------------------------------------------------

function effectsContainRollRandom(effects: readonly EffectAST[]): boolean {
  for (const effect of effects) {
    if (effectContainsRollRandom(effect)) {
      return true;
    }
  }
  return false;
}

function effectContainsRollRandom(effect: EffectAST): boolean {
  if ('rollRandom' in effect) {
    return true;
  }
  // Recurse into compound effects that contain sub-effect lists.
  if ('forEach' in effect) {
    const fe = (effect as { readonly forEach: { readonly effects: readonly EffectAST[]; readonly in?: readonly EffectAST[] } }).forEach;
    if (effectsContainRollRandom(fe.effects)) return true;
    if (fe.in !== undefined && effectsContainRollRandom(fe.in)) return true;
    return false;
  }
  if ('if' in effect) {
    const cond = (effect as { readonly if: { readonly then: readonly EffectAST[]; readonly else?: readonly EffectAST[] } }).if;
    if (effectsContainRollRandom(cond.then)) return true;
    if (cond.else !== undefined && effectsContainRollRandom(cond.else)) return true;
    return false;
  }
  if ('let' in effect) {
    const letEff = (effect as { readonly let: { readonly in: readonly EffectAST[] } }).let;
    return effectsContainRollRandom(letEff.in);
  }
  if ('reduce' in effect) {
    const red = (effect as { readonly reduce: { readonly in: readonly EffectAST[] } }).reduce;
    return effectsContainRollRandom(red.in);
  }
  if ('removeByPriority' in effect) {
    const rbp = (effect as { readonly removeByPriority: { readonly in?: readonly EffectAST[] } }).removeByPriority;
    return rbp.in !== undefined && effectsContainRollRandom(rbp.in);
  }
  if ('evaluateSubset' in effect) {
    const es = (effect as { readonly evaluateSubset: { readonly compute: readonly EffectAST[]; readonly in: readonly EffectAST[] } }).evaluateSubset;
    if (effectsContainRollRandom(es.compute)) return true;
    return effectsContainRollRandom(es.in);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Proven result propagation
// ---------------------------------------------------------------------------

/**
 * Convert a kernel `TerminalResult` to a solver `ProvenResult`.
 * Returns `null` for `score`-type results (solver doesn't handle those).
 */
function terminalToProven(result: TerminalResult): ProvenResult | null {
  switch (result.type) {
    case 'win':
      return { kind: 'win', forPlayer: result.player };
    case 'lossAll':
      // In a 2P game, lossAll means both lose — treat as draw.
      return { kind: 'draw' };
    case 'draw':
      return { kind: 'draw' };
    case 'score':
      return null;
  }
}

/**
 * After backpropagation, check if `node` can be proven:
 *
 * 1. If node's state is terminal: set `provenResult` from terminal result.
 * 2. If all children are proven: propagate minimax.
 *    - All children losses for acting player → node is win for acting player.
 *    - Any child is win for acting player → node is win for acting player.
 *    - All children proven and none is a win → draw.
 *
 * The `actingPlayer` is the player whose turn it is at `node`.
 */
export function updateSolverResult(
  node: MctsNode,
  def: GameDef,
  state: GameState,
  runtime?: GameDefRuntime,
): void {
  // Already proven — nothing to do.
  if (node.provenResult !== null) {
    return;
  }

  // Check if this is a terminal state.
  const terminal = terminalResult(def, state, runtime);
  if (terminal !== null) {
    const proven = terminalToProven(terminal);
    if (proven !== null) {
      node.provenResult = proven;
    }
    return;
  }

  // Non-terminal: check if all children are proven (minimax propagation).
  if (node.children.length === 0) {
    return;
  }

  const actingPlayer = state.activePlayer;
  let allChildrenProven = true;
  let anyChildWinForActor = false;
  let allChildrenLossForActor = true;

  for (const child of node.children) {
    if (child.provenResult === null) {
      allChildrenProven = false;
      allChildrenLossForActor = false;
      break;
    }

    if (isWinFor(child.provenResult, actingPlayer)) {
      anyChildWinForActor = true;
    }
    if (!isLossFor(child.provenResult, actingPlayer)) {
      allChildrenLossForActor = false;
    }
  }

  // If any child is a proven win for the acting player, this node is a win.
  if (anyChildWinForActor) {
    node.provenResult = { kind: 'win', forPlayer: actingPlayer };
    return;
  }

  // If all children are proven and all are losses for acting player,
  // this node is a win for the opponent.
  if (allChildrenProven && allChildrenLossForActor) {
    const opponent = (actingPlayer === 0 ? 1 : 0) as PlayerId;
    node.provenResult = { kind: 'win', forPlayer: opponent };
    return;
  }

  // If all children are proven but not all losses, it's a draw.
  if (allChildrenProven) {
    node.provenResult = { kind: 'draw' };
  }
}

// ---------------------------------------------------------------------------
// Solver-aware selection shortcut
// ---------------------------------------------------------------------------

/**
 * If a child is proven won for `exploringPlayer`, return it immediately.
 * If all children are proven lost for `exploringPlayer`, return `null`
 * (signal loss — no good move).
 * Otherwise return `null` (no solver shortcut available).
 */
export function selectSolverAwareChild(
  node: MctsNode,
  exploringPlayer: PlayerId,
): MctsNode | null {
  let allLoss = true;

  for (const child of node.children) {
    if (child.provenResult === null) {
      // Unproven child → no shortcut.
      return null;
    }

    if (isWinFor(child.provenResult, exploringPlayer)) {
      return child;
    }

    if (!isLossFor(child.provenResult, exploringPlayer)) {
      allLoss = false;
    }
  }

  // All children proven lost → signal loss (return null but node will be
  // proven by updateSolverResult).
  if (allLoss && node.children.length > 0) {
    return null;
  }

  return null;
}

// ---------------------------------------------------------------------------
// ProvenResult helpers
// ---------------------------------------------------------------------------

function isWinFor(result: ProvenResult, player: PlayerId): boolean {
  return result.kind === 'win' && result.forPlayer === player;
}

function isLossFor(result: ProvenResult, player: PlayerId): boolean {
  if (result.kind === 'win' && result.forPlayer !== player) {
    return true;
  }
  if (result.kind === 'loss' && result.forPlayer === player) {
    return true;
  }
  return false;
}
