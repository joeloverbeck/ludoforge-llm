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

import type { Move, ChoiceRequest, ChoicePendingRequest, ChoicePendingChooseNRequest, ChoiceStochasticPendingRequest, CompoundDecisionPath, CompoundMovePayload } from '../../kernel/types-core.js';
import type { MoveParamScalar, MoveParamValue } from '../../kernel/types-ast.js';
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
import { recordDecisionDiscoverOptions } from './diagnostics.js';
import type { DiscoveryCache } from './state-cache.js';
import { getDiscoveryCacheEntry, setDiscoveryCacheEntry } from './state-cache.js';
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
  /** Per-search discovery cache. When provided, discovery results are cached by stateHash + moveKey. */
  readonly discoveryCache?: DiscoveryCache;
  /** Max entries for the discovery cache (defaults to 1024). */
  readonly discoveryCacheMax?: number;
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
  decisionType?: 'chooseOne' | 'chooseN',
): Move {
  if (decisionType === 'chooseN') {
    const existing = partialMove.params[decisionKey];
    const currentArray: MoveParamScalar[] = Array.isArray(existing)
      ? [...existing as readonly MoveParamScalar[]]
      : [];
    currentArray.push(value as MoveParamScalar);
    return {
      ...partialMove,
      params: {
        ...partialMove.params,
        [decisionKey]: currentArray as unknown as MoveParamValue,
      },
    };
  }
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
  decisionType?: 'chooseOne' | 'chooseN',
): Move {
  const compound = partialMove.compound;
  if (compound === undefined) {
    throw new Error('advanceCompoundSAParams: move has no compound payload');
  }
  let paramValue: MoveParamValue;
  if (decisionType === 'chooseN') {
    const existing = compound.specialActivity.params[decisionKey];
    const currentArray: MoveParamScalar[] = Array.isArray(existing)
      ? [...existing as readonly MoveParamScalar[]]
      : [];
    currentArray.push(value as MoveParamScalar);
    paramValue = currentArray as unknown as MoveParamValue;
  } else {
    paramValue = value;
  }
  const updatedSA: Move = {
    ...compound.specialActivity,
    params: {
      ...compound.specialActivity.params,
      [decisionKey]: paramValue,
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
  decisionType?: 'chooseOne' | 'chooseN',
): Move {
  if (decisionPath === 'compound.specialActivity') {
    return advanceCompoundSAParams(partialMove, decisionKey, value, decisionType);
  }
  return advanceMainParams(partialMove, decisionKey, value, decisionType);
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
// chooseN incremental tree helpers
// ---------------------------------------------------------------------------

/** Canonical key for value-based ordering comparison. */
function optionValueKey(value: MoveParamValue): string {
  return JSON.stringify([typeof value, value]);
}

/**
 * Extract the accumulated chooseN selections from the partial move params.
 * Returns an empty array if the binding is not yet set.
 */
function getAccumulatedChooseN(
  partialMove: Move,
  decisionKey: string,
  decisionPath?: CompoundDecisionPath,
): readonly MoveParamScalar[] {
  if (decisionPath === 'compound.specialActivity') {
    const saParam = partialMove.compound?.specialActivity.params[decisionKey];
    return Array.isArray(saParam) ? saParam as readonly MoveParamScalar[] : [];
  }
  const mainParam = partialMove.params[decisionKey];
  return Array.isArray(mainParam) ? mainParam as readonly MoveParamScalar[] : [];
}

/**
 * Create a move with the chooseN binding set to the finalized array.
 * Used for confirm nodes where the accumulated array IS the final selection.
 */
function setChooseNParam(
  partialMove: Move,
  decisionKey: string,
  accumulated: readonly MoveParamScalar[],
  decisionPath?: CompoundDecisionPath,
): Move {
  if (decisionPath === 'compound.specialActivity') {
    const compound = partialMove.compound!;
    const updatedSA: Move = {
      ...compound.specialActivity,
      params: {
        ...compound.specialActivity.params,
        [decisionKey]: [...accumulated] as unknown as MoveParamValue,
      },
    };
    const updatedCompound: CompoundMovePayload = {
      ...compound,
      specialActivity: updatedSA,
    };
    return { ...partialMove, compound: updatedCompound };
  }
  return {
    ...partialMove,
    params: {
      ...partialMove.params,
      [decisionKey]: [...accumulated] as unknown as MoveParamValue,
    },
  };
}

/**
 * Filter options by lexicographic ordering relative to accumulated selections.
 * Excludes already-accumulated values and options that precede the last
 * accumulated value in canonical order (prevents duplicate permutations).
 */
function filterByLexicographicOrder(
  options: readonly ExpandableOption[],
  accumulated: readonly MoveParamScalar[],
): readonly ExpandableOption[] {
  if (accumulated.length === 0) return options;

  const accumulatedKeys = new Set(accumulated.map((v) => optionValueKey(v as MoveParamValue)));
  const lastAccumKey = optionValueKey(accumulated[accumulated.length - 1] as MoveParamValue);

  return options.filter((opt) => {
    const key = optionValueKey(opt.value);
    if (accumulatedKeys.has(key)) return false;
    if (key <= lastAccumKey) return false;
    return true;
  });
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
  decisionType: 'chooseOne' | 'chooseN',
): void {
  (child as { move: Move | null }).move = childMove;
  (child as { moveKey: MoveKey | null }).moveKey = moveKey;
  (child as { parent: MctsNode | null }).parent = parent;
  child.nodeKind = 'decision';
  child.decisionPlayer = decisionPlayer;
  child.partialMove = childMove;
  child.decisionBinding = decisionKey;
  child.decisionType = decisionType;
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

  const acc = ctx.accumulator;
  const partialMoveKey = canonicalMoveKey(partialMove);
  const { discoveryCache, discoveryCacheMax = 1024 } = ctx;

  // Check discovery cache first.
  let response: ChoiceRequest;
  if (discoveryCache !== undefined) {
    const cached = getDiscoveryCacheEntry(discoveryCache, state.stateHash, partialMoveKey);
    if (cached !== undefined) {
      if (acc !== undefined) {
        acc.decisionDiscoverCacheHits += 1;
      }
      response = cached;
    } else {
      const tStart = acc !== undefined ? performance.now() : 0;
      response = discover(def, state, partialMove, { chainCompoundSA: true }, runtime);
      if (acc !== undefined) {
        acc.decisionDiscoverCallCount += 1;
        acc.decisionDiscoverTimeMs += performance.now() - tStart;
      }
      setDiscoveryCacheEntry(discoveryCache, state.stateHash, partialMoveKey, response, discoveryCacheMax);
    }
  } else {
    const tStart = acc !== undefined ? performance.now() : 0;
    response = discover(def, state, partialMove, { chainCompoundSA: true }, runtime);
    if (acc !== undefined) {
      acc.decisionDiscoverCallCount += 1;
      acc.decisionDiscoverTimeMs += performance.now() - tStart;
    }
  }

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
  // Route chooseN to the incremental selection tree expansion.
  if (request.type === 'chooseN') {
    return expandChooseNDecision(
      request, parentNode, pool, partialMove, decisionPlayer, ctx,
    );
  }

  return expandChooseOneDecision(
    request, parentNode, pool, partialMove, decisionPlayer, ctx,
  );
}

// ---------------------------------------------------------------------------
// chooseOne expansion (unchanged from original)
// ---------------------------------------------------------------------------

function expandChooseOneDecision(
  request: ChoicePendingRequest,
  parentNode: MctsNode,
  pool: NodePool,
  partialMove: Move,
  decisionPlayer: PlayerId,
  ctx: DecisionExpansionContext,
): DecisionExpansionResult {
  const { state, decisionWideningCap, visitor, accumulator } = ctx;
  const decisionKey = request.decisionKey;
  const decisionName = request.name;

  const optionsToExpand: readonly ExpandableOption[] = request.options.map((opt, i) => ({
    value: opt.value as MoveParamValue,
    index: i,
  }));

  // ----- Forced-sequence compression -----
  if (optionsToExpand.length === 1) {
    const singleOption = optionsToExpand[0]!;
    const advancedMove = advancePartialMove(partialMove, decisionKey, singleOption.value, request.decisionPath, request.type);

    const nextResponse = discoverWithCache(ctx, state, advancedMove);

    // Update the parent node's partialMove in place (mutable -- MCTS exception).
    parentNode.partialMove = advancedMove;

    return handleChoiceResponse(
      nextResponse, parentNode, pool, advancedMove, decisionPlayer, ctx,
    );
  }

  // ----- Progressive widening bypass -----
  const wideningBypassed = optionsToExpand.length <= decisionWideningCap;
  const decisionDepth = computeDecisionDepth(parentNode) + 1;

  if (accumulator) {
    if (decisionDepth > accumulator.decisionDepthMax) {
      accumulator.decisionDepthMax = decisionDepth;
    }
    recordDecisionDiscoverOptions(accumulator, decisionDepth, optionsToExpand.length);
  }

  // Allocate child nodes for each option.
  const children: MctsNode[] = [];

  for (const option of optionsToExpand) {
    const childMove = advancePartialMove(partialMove, decisionKey, option.value, request.decisionPath, request.type);
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

    wireDecisionChild(child, parentNode, childMove, moveKey, decisionPlayer, decisionKey, request.type);
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

// ---------------------------------------------------------------------------
// chooseN incremental selection tree expansion
// ---------------------------------------------------------------------------

/**
 * Expand a chooseN decision as an incremental selection tree.
 *
 * Each child represents adding one more option to the growing selection array.
 * A "confirm" child is added when `canConfirm === true`, representing the
 * decision to finalize the current selection without adding more items.
 *
 * Lexicographic ordering prevents duplicate permutations: children at each
 * level only include options whose canonical value key > the last selected
 * option's key.
 *
 * Forced-sequence compression:
 * - 1 eligible option + canConfirm false → compress (must pick that option)
 * - 0 eligible options + canConfirm true → compress (must confirm)
 * - 1 eligible option + canConfirm true → 2 choices, do NOT compress
 */
function expandChooseNDecision(
  request: ChoicePendingChooseNRequest,
  parentNode: MctsNode,
  pool: NodePool,
  partialMove: Move,
  decisionPlayer: PlayerId,
  ctx: DecisionExpansionContext,
): DecisionExpansionResult {
  const { decisionWideningCap, visitor, accumulator } = ctx;
  const decisionKey = request.decisionKey;
  const decisionName = request.name;

  // Get accumulated selections from the partial move params.
  const accumulated = getAccumulatedChooseN(partialMove, decisionKey, request.decisionPath);

  // Filter options: remove illegal, separate legal from widening candidates.
  const filtered = filterChooseNOptions(request);
  const allExpandable = [...filtered.expandable, ...filtered.wideningCandidates];

  // Apply lexicographic ordering: exclude accumulated items and options
  // that precede the last accumulated value (prevents duplicate permutations).
  const eligible = filterByLexicographicOrder(allExpandable, accumulated);

  // Use the request's canConfirm (reflects kernel assessment).
  const canConfirm = request.canConfirm;

  // Effective choice count: eligible options + confirm (if applicable).
  const effectiveCount = eligible.length + (canConfirm ? 1 : 0);

  // ----- Dead end: no valid choices -----
  if (effectiveCount === 0) {
    emitDecisionIllegal(visitor, partialMove.actionId, decisionName, 'chooseNDeadEnd');
    if (accumulator) {
      accumulator.decisionIllegalPruned += 1;
    }
    return { kind: 'illegal', reason: 'chooseNDeadEnd', decisionName };
  }

  // ----- Forced-sequence compression -----
  if (effectiveCount === 1) {
    if (canConfirm && eligible.length === 0) {
      // Only choice is to confirm with the current accumulated array.
      const confirmMove = setChooseNParam(partialMove, decisionKey, accumulated, request.decisionPath);
      parentNode.partialMove = confirmMove;

      const nextResponse = discoverWithCache(ctx, ctx.state, confirmMove);
      return handleChoiceResponse(
        nextResponse, parentNode, pool, confirmMove, decisionPlayer, ctx,
      );
    }

    if (!canConfirm && eligible.length === 1) {
      // Only choice is to add the single remaining option.
      const singleOption = eligible[0]!;
      const advancedMove = advancePartialMove(
        partialMove, decisionKey, singleOption.value, request.decisionPath, 'chooseN',
      );
      parentNode.partialMove = advancedMove;

      const nextResponse = discoverWithCache(ctx, ctx.state, advancedMove);
      return handleChoiceResponse(
        nextResponse, parentNode, pool, advancedMove, decisionPlayer, ctx,
      );
    }
  }

  // ----- Progressive widening bypass -----
  const wideningBypassed = effectiveCount <= decisionWideningCap;
  const decisionDepth = computeDecisionDepth(parentNode) + 1;

  if (accumulator) {
    if (decisionDepth > accumulator.decisionDepthMax) {
      accumulator.decisionDepthMax = decisionDepth;
    }
    recordDecisionDiscoverOptions(accumulator, decisionDepth, effectiveCount);
  }

  // ----- Allocate child nodes -----
  const children: MctsNode[] = [];

  // Confirm child: finalized array, advances to next decision when expanded.
  if (canConfirm) {
    const confirmMove = setChooseNParam(partialMove, decisionKey, accumulated, request.decisionPath);
    const confirmMoveKey = canonicalMoveKey(confirmMove);
    const confirmBinding = '$confirm:' + decisionKey;

    let child: MctsNode;
    try {
      child = pool.allocate();
    } catch {
      return emitPoolExhausted(visitor, pool);
    }

    wireDecisionChild(child, parentNode, confirmMove, confirmMoveKey, decisionPlayer, confirmBinding, 'chooseN');
    parentNode.children.push(child);
    children.push(child);

    if (accumulator) {
      accumulator.decisionNodesCreated += 1;
    }

    emitDecisionNodeCreated(
      visitor, partialMove.actionId, decisionName, effectiveCount, decisionDepth,
    );
  }

  // Non-confirm children: each adds one option to the accumulated array.
  for (const option of eligible) {
    const childMove = advancePartialMove(
      partialMove, decisionKey, option.value, request.decisionPath, 'chooseN',
    );
    const moveKey = canonicalMoveKey(childMove);

    let child: MctsNode;
    try {
      child = pool.allocate();
    } catch {
      return emitPoolExhausted(visitor, pool);
    }

    wireDecisionChild(child, parentNode, childMove, moveKey, decisionPlayer, decisionKey, 'chooseN');
    parentNode.children.push(child);
    children.push(child);

    if (accumulator) {
      accumulator.decisionNodesCreated += 1;
    }

    emitDecisionNodeCreated(
      visitor, partialMove.actionId, decisionName, effectiveCount, decisionDepth,
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

// ---------------------------------------------------------------------------
// Shared helpers for forced-sequence compression discovery
// ---------------------------------------------------------------------------

/** Run discover with cache support (extracted to reduce duplication). */
function discoverWithCache(
  ctx: DecisionExpansionContext,
  state: GameState,
  move: Move,
): ChoiceRequest {
  const discover = ctx.discoverChoices ?? legalChoicesDiscover;
  const acc = ctx.accumulator;
  const moveKey = canonicalMoveKey(move);
  const { discoveryCache, discoveryCacheMax = 1024 } = ctx;

  if (discoveryCache !== undefined) {
    const cached = getDiscoveryCacheEntry(discoveryCache, state.stateHash, moveKey);
    if (cached !== undefined) {
      if (acc !== undefined) {
        acc.decisionDiscoverCacheHits += 1;
      }
      return cached;
    }

    const tStart = acc !== undefined ? performance.now() : 0;
    const response = discover(ctx.def, state, move, { chainCompoundSA: true }, ctx.runtime);
    if (acc !== undefined) {
      acc.decisionDiscoverCallCount += 1;
      acc.decisionDiscoverTimeMs += performance.now() - tStart;
    }
    setDiscoveryCacheEntry(discoveryCache, state.stateHash, moveKey, response, discoveryCacheMax);
    return response;
  }

  const tStart = acc !== undefined ? performance.now() : 0;
  const response = discover(ctx.def, state, move, { chainCompoundSA: true }, ctx.runtime);
  if (acc !== undefined) {
    acc.decisionDiscoverCallCount += 1;
    acc.decisionDiscoverTimeMs += performance.now() - tStart;
  }
  return response;
}

/** Emit poolExhausted event and return result. */
function emitPoolExhausted(
  visitor: MctsSearchVisitor | undefined,
  pool: NodePool,
): DecisionPoolExhaustedResult {
  if (visitor?.onEvent) {
    visitor.onEvent({
      type: 'poolExhausted',
      capacity: pool.capacity,
      iteration: -1,
    });
  }
  return { kind: 'poolExhausted' };
}
