/**
 * Decision expansion module for incremental MCTS decision trees.
 *
 * Given a decision node and the ancestor game state, calls
 * `legalChoicesDiscover()` and creates child decision nodes for each
 * option.  Handles all `ChoiceRequest` response kinds, forced-sequence
 * compression (single-option bypass), and progressive widening bypass
 * for small option counts.
 *
 * This module is the sole consumer of `legalChoicesDiscover()` during
 * in-tree expansion.  It never calls `applyMove` directly -- completed
 * moves are returned to the caller for state-node creation.
 */

import type { Move, ChoiceRequest, ChoicePendingRequest, ChoiceStochasticPendingRequest, CompoundDecisionPath, CompoundMovePayload } from '../../kernel/types-core.js';
import type { MoveParamValue } from '../../kernel/types-ast.js';
import type { GameDef, GameState } from '../../kernel/types.js';
import type { GameDefRuntime } from '../../kernel/gamedef-runtime.js';
import type { LegalChoicesRuntimeOptions } from '../../kernel/legal-choices.js';
import { legalChoicesDiscover } from '../../kernel/legal-choices.js';
import type { MctsNode } from './node.js';
import type { NodePool } from './node-pool.js';
import type { MoveKey } from './move-key.js';
import { canonicalMoveKey } from './move-key.js';
import type { MctsSearchVisitor } from './visitor.js';
import type { MutableDiagnosticsAccumulator } from './diagnostics.js';
import type { PlayerId } from '../../kernel/branded.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Injectable discovery function for testability.
 * Defaults to `legalChoicesDiscover` from the kernel.
 */
export type DiscoverChoicesFn = (
  def: GameDef,
  state: GameState,
  partialMove: Move,
  options?: LegalChoicesRuntimeOptions,
  runtime?: GameDefRuntime,
) => ChoiceRequest;

/** Context needed beyond the core (node, pool) parameters. */
export interface DecisionExpansionContext {
  readonly def: GameDef;
  readonly state: GameState;
  readonly playerCount: number;
  readonly decisionWideningCap: number;
  readonly visitor?: MctsSearchVisitor;
  readonly accumulator?: MutableDiagnosticsAccumulator;
  readonly runtime?: GameDefRuntime;
  /** Override for testing.  Defaults to kernel `legalChoicesDiscover`. */
  readonly discoverChoices?: DiscoverChoicesFn;
}

/** Discriminated union of expansion outcomes. */
export type DecisionExpansionResult =
  | DecisionExpandedResult
  | DecisionCompleteResult
  | DecisionIllegalResult
  | DecisionStochasticResult
  | DecisionPoolExhaustedResult;

export interface DecisionExpandedResult {
  readonly kind: 'expanded';
  readonly children: readonly MctsNode[];
  readonly decisionName: string;
  readonly decisionDepth: number;
  readonly wideningBypassed: boolean;
}

export interface DecisionCompleteResult {
  readonly kind: 'complete';
  readonly move: Move;
  readonly stepsUsed: number;
}

export interface DecisionIllegalResult {
  readonly kind: 'illegal';
  readonly reason: string;
  readonly decisionName: string;
}

export interface DecisionStochasticResult {
  readonly kind: 'stochastic';
  readonly request: ChoiceStochasticPendingRequest;
}

export interface DecisionPoolExhaustedResult {
  readonly kind: 'poolExhausted';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Count decision depth by walking up the parent chain. */
function computeDecisionDepth(node: MctsNode): number {
  let depth = 0;
  let current: MctsNode | null = node;
  while (current !== null && current.nodeKind === 'decision') {
    depth += 1;
    current = current.parent;
  }
  return depth;
}

/** Build a child partial move by setting the decision key value on the main action params. */
function advanceMainParams(
  partialMove: Move,
  decisionKey: string,
  value: MoveParamValue,
): Move {
  return {
    ...partialMove,
    params: {
      ...partialMove.params,
      [decisionKey]: value,
    },
  };
}

/** Build a child partial move by setting the decision key value on the compound SA params. */
function advanceCompoundSAParams(
  partialMove: Move,
  decisionKey: string,
  value: MoveParamValue,
): Move {
  const compound = partialMove.compound;
  if (compound === undefined) {
    throw new Error('advanceCompoundSAParams: move has no compound payload');
  }
  const updatedSA: Move = {
    ...compound.specialActivity,
    params: {
      ...compound.specialActivity.params,
      [decisionKey]: value,
    },
  };
  const updatedCompound: CompoundMovePayload = {
    ...compound,
    specialActivity: updatedSA,
  };
  return {
    ...partialMove,
    compound: updatedCompound,
  };
}

/** Route decision value to the correct location based on `decisionPath`. */
function advancePartialMove(
  partialMove: Move,
  decisionKey: string,
  value: MoveParamValue,
  decisionPath?: CompoundDecisionPath,
): Move {
  if (decisionPath === 'compound.specialActivity') {
    return advanceCompoundSAParams(partialMove, decisionKey, value);
  }
  return advanceMainParams(partialMove, decisionKey, value);
}

function emitDecisionNodeCreated(
  visitor: MctsSearchVisitor | undefined,
  actionId: string,
  decisionName: string,
  optionCount: number,
  decisionDepth: number,
): void {
  if (visitor?.onEvent) {
    visitor.onEvent({
      type: 'decisionNodeCreated',
      actionId,
      decisionName,
      optionCount,
      decisionDepth,
    });
  }
}

function emitDecisionCompleted(
  visitor: MctsSearchVisitor | undefined,
  actionId: string,
  stepsUsed: number,
  moveKey: MoveKey,
): void {
  if (visitor?.onEvent) {
    visitor.onEvent({
      type: 'decisionCompleted',
      actionId,
      stepsUsed,
      moveKey,
    });
  }
}

function emitDecisionIllegal(
  visitor: MctsSearchVisitor | undefined,
  actionId: string,
  decisionName: string,
  reason: string,
): void {
  if (visitor?.onEvent) {
    visitor.onEvent({
      type: 'decisionIllegal',
      actionId,
      decisionName,
      reason,
    });
  }
}

// ---------------------------------------------------------------------------
// Option filtering for chooseN
// ---------------------------------------------------------------------------

interface ExpandableOption {
  readonly value: MoveParamValue;
  readonly index: number;
}

interface FilteredOptions {
  readonly expandable: readonly ExpandableOption[];
  readonly wideningCandidates: readonly ExpandableOption[];
}

function filterChooseNOptions(request: ChoicePendingRequest): FilteredOptions {
  const expandable: ExpandableOption[] = [];
  const wideningCandidates: ExpandableOption[] = [];

  for (let i = 0; i < request.options.length; i++) {
    const option = request.options[i]!;
    if (option.legality === 'illegal') {
      continue;
    }
    const entry: ExpandableOption = { value: option.value as MoveParamValue, index: i };
    if (option.legality === 'legal') {
      expandable.push(entry);
    } else {
      wideningCandidates.push(entry);
    }
  }

  return { expandable, wideningCandidates };
}

// ---------------------------------------------------------------------------
// Pool node wiring (mutable casts — same pattern as search.ts)
// ---------------------------------------------------------------------------

/**
 * Wire a pool-allocated node as a decision child.
 * Uses mutable casts for readonly fields — intentional MCTS perf exception.
 */
function wireDecisionChild(
  child: MctsNode,
  parent: MctsNode,
  childMove: Move,
  moveKey: MoveKey,
  decisionPlayer: PlayerId,
  decisionKey: string,
): void {
  (child as { move: Move | null }).move = childMove;
  (child as { moveKey: MoveKey | null }).moveKey = moveKey;
  (child as { parent: MctsNode | null }).parent = parent;
  child.nodeKind = 'decision';
  child.decisionPlayer = decisionPlayer;
  child.partialMove = childMove;
  child.decisionBinding = decisionKey;
  child.heuristicPrior = null;
}

// ---------------------------------------------------------------------------
// Core expansion
// ---------------------------------------------------------------------------

/**
 * Expand a decision node by discovering the next choice and creating
 * child decision nodes for each legal option.
 *
 * @param node - The decision node to expand (must have `nodeKind === 'decision'`
 *               and a non-null `partialMove`).
 * @param pool - Node pool for child allocation.
 * @param ctx  - Expansion context (game def, state, config, visitor, etc.).
 *
 * @returns A discriminated result indicating what happened.
 *
 * **Invariants**:
 * 1. `legalChoicesDiscover()` is the sole API for decision expansion.
 * 2. Decision nodes do NOT compute game state.
 * 3. Forced-sequence compression produces identical results to single-option expansion.
 * 4. Progressive widening only activates when `optionCount > decisionWideningCap`.
 */
export function expandDecisionNode(
  node: MctsNode,
  pool: NodePool,
  ctx: DecisionExpansionContext,
): DecisionExpansionResult {
  const { def, state, runtime } = ctx;
  const discover = ctx.discoverChoices ?? legalChoicesDiscover;

  const partialMove = node.partialMove;
  if (partialMove === null) {
    throw new Error('expandDecisionNode: node.partialMove must not be null');
  }

  const decisionPlayer = node.decisionPlayer;
  if (decisionPlayer === null) {
    throw new Error('expandDecisionNode: node.decisionPlayer must not be null');
  }

  const response = discover(def, state, partialMove, { chainCompoundSA: true }, runtime);

  return handleChoiceResponse(
    response, node, pool, partialMove, decisionPlayer, ctx,
  );
}

function handleChoiceResponse(
  response: ChoiceRequest,
  parentNode: MctsNode,
  pool: NodePool,
  partialMove: Move,
  decisionPlayer: PlayerId,
  ctx: DecisionExpansionContext,
): DecisionExpansionResult {
  const { visitor, accumulator } = ctx;

  switch (response.kind) {
    case 'complete': {
      const depth = computeDecisionDepth(parentNode);
      const moveKey = canonicalMoveKey(partialMove);
      emitDecisionCompleted(visitor, partialMove.actionId, depth, moveKey);
      if (accumulator) {
        accumulator.decisionCompletionsInTree += 1;
      }
      return { kind: 'complete', move: partialMove, stepsUsed: depth };
    }

    case 'illegal': {
      const name = response.name ?? 'unknown';
      const reason = response.reason ?? 'illegal';
      emitDecisionIllegal(visitor, partialMove.actionId, name, reason);
      if (accumulator) {
        accumulator.decisionIllegalPruned += 1;
      }
      return { kind: 'illegal', reason, decisionName: name };
    }

    case 'pendingStochastic': {
      return { kind: 'stochastic', request: response };
    }

    case 'pending': {
      return expandPendingDecision(
        response, parentNode, pool, partialMove, decisionPlayer, ctx,
      );
    }
  }
}

function expandPendingDecision(
  request: ChoicePendingRequest,
  parentNode: MctsNode,
  pool: NodePool,
  partialMove: Move,
  decisionPlayer: PlayerId,
  ctx: DecisionExpansionContext,
): DecisionExpansionResult {
  const { def, state, decisionWideningCap, visitor, accumulator } = ctx;
  const decisionKey = request.decisionKey;
  const decisionName = request.name;

  // Determine which options to expand based on type and legality.
  let optionsToExpand: readonly ExpandableOption[];

  if (request.type === 'chooseN') {
    const filtered = filterChooseNOptions(request);
    optionsToExpand = [...filtered.expandable, ...filtered.wideningCandidates];
  } else {
    optionsToExpand = request.options.map((opt, i) => ({
      value: opt.value as MoveParamValue,
      index: i,
    }));
  }

  // ----- Forced-sequence compression -----
  // If exactly 1 legal option, skip node allocation and recurse.
  if (optionsToExpand.length === 1) {
    const singleOption = optionsToExpand[0]!;
    const advancedMove = advancePartialMove(partialMove, decisionKey, singleOption.value, request.decisionPath);

    const discover = ctx.discoverChoices ?? legalChoicesDiscover;
    const nextResponse = discover(def, state, advancedMove, { chainCompoundSA: true }, ctx.runtime);

    // Update the parent node's partialMove in place (mutable -- MCTS exception).
    parentNode.partialMove = advancedMove;

    return handleChoiceResponse(
      nextResponse, parentNode, pool, advancedMove, decisionPlayer, ctx,
    );
  }

  // ----- Progressive widening bypass -----
  const wideningBypassed = optionsToExpand.length <= decisionWideningCap;
  const decisionDepth = computeDecisionDepth(parentNode) + 1;

  if (accumulator && decisionDepth > accumulator.decisionDepthMax) {
    accumulator.decisionDepthMax = decisionDepth;
  }

  // Allocate child nodes for each option.
  const children: MctsNode[] = [];

  for (const option of optionsToExpand) {
    const childMove = advancePartialMove(partialMove, decisionKey, option.value, request.decisionPath);
    const moveKey = canonicalMoveKey(childMove);

    let child: MctsNode;
    try {
      child = pool.allocate();
    } catch {
      if (visitor?.onEvent) {
        visitor.onEvent({
          type: 'poolExhausted',
          capacity: pool.capacity,
          iteration: -1,
        });
      }
      return { kind: 'poolExhausted' };
    }

    wireDecisionChild(child, parentNode, childMove, moveKey, decisionPlayer, decisionKey);
    parentNode.children.push(child);
    children.push(child);

    if (accumulator) {
      accumulator.decisionNodesCreated += 1;
    }

    emitDecisionNodeCreated(
      visitor, partialMove.actionId, decisionName, optionsToExpand.length, decisionDepth,
    );
  }

  return {
    kind: 'expanded',
    children,
    decisionName,
    decisionDepth,
    wideningBypassed,
  };
}
