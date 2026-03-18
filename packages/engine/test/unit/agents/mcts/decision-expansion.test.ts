/**
 * Unit tests for decision-expansion module.
 *
 * Tests all ChoiceRequest response kinds, chooseN iterative expansion
 * with legality metadata, progressive widening bypass, forced-sequence
 * compression, and visitor event emission.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Move, ChoiceRequest } from '../../../../src/kernel/types-core.js';
import type { DecisionKey } from '../../../../src/kernel/decision-scope.js';
import type { GameDef, GameState } from '../../../../src/kernel/types.js';
import type { MctsNode } from '../../../../src/agents/mcts/node.js';
import type { MctsSearchEvent } from '../../../../src/agents/mcts/visitor.js';
import { expandDecisionNode } from '../../../../src/agents/mcts/decision-expansion.js';
import type { DecisionExpansionContext, DiscoverChoicesFn } from '../../../../src/agents/mcts/decision-expansion.js';
import { createRootNode } from '../../../../src/agents/mcts/node.js';
import { createNodePool } from '../../../../src/agents/mcts/node-pool.js';
import { createAccumulator } from '../../../../src/agents/mcts/diagnostics.js';
import { asPlayerId } from '../../../../src/kernel/branded.js';

const dk = (s: string): DecisionKey => s as DecisionKey;

// ---------------------------------------------------------------------------
// Minimal stubs
// ---------------------------------------------------------------------------

const PLAYER_COUNT = 2;
const PLAYER_0 = asPlayerId(0);
const ACTION_ID = 'testAction';

function stubDef(): GameDef {
  return { actions: [], zones: [], variables: [], triggers: [], players: [] } as unknown as GameDef;
}

function stubState(): GameState {
  return {
    activePlayer: PLAYER_0,
    playerCount: PLAYER_COUNT,
    variables: {},
    tokens: [],
    zones: [],
    rng: { state: [0n, 0n, 0n, 0n] },
  } as unknown as GameState;
}

function stubPartialMove(params: Record<string, unknown> = {}): Move {
  return {
    actionId: ACTION_ID,
    params: params as Move['params'],
  } as Move;
}

/** Create a decision node (simulates what the tree would produce). */
function makeDecisionNode(partialMove: Move, parent?: MctsNode): MctsNode {
  const root = parent ?? createRootNode(PLAYER_COUNT);
  const node: MctsNode = {
    move: partialMove,
    moveKey: 'test-key',
    parent: root,
    visits: 0,
    availability: 0,
    totalReward: [0, 0],
    heuristicPrior: null,
    children: [],
    provenResult: null,
    nodeKind: 'decision',
    decisionPlayer: PLAYER_0,
    partialMove,
    decisionBinding: 'prevBinding',
    decisionType: 'chooseOne',
  };
  return node;
}

function makeCtx(
  discoverChoices: DiscoverChoicesFn,
  overrides: Partial<DecisionExpansionContext> = {},
): DecisionExpansionContext {
  return {
    def: stubDef(),
    state: stubState(),
    playerCount: PLAYER_COUNT,
    decisionWideningCap: 12,
    discoverChoices,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. chooseOne — creates child candidates for each option
// ---------------------------------------------------------------------------

describe('expandDecisionNode — chooseOne', () => {
  it('creates child decision nodes for each option', () => {
    const pending: ChoiceRequest = {
      kind: 'pending',
      complete: false,
      decisionPlayer: PLAYER_0,
      decisionKey: dk('province'),
      name: 'chooseProvince',
      type: 'chooseOne',
      options: [
        { value: 'quangTri', legality: 'unknown', illegalReason: null },
        { value: 'binhDinh', legality: 'unknown', illegalReason: null },
        { value: 'phuBon', legality: 'unknown', illegalReason: null },
      ],
      targetKinds: [],
    };

    const discover: DiscoverChoicesFn = () => pending;
    const pool = createNodePool(20, PLAYER_COUNT);
    // Consume first node for the parent's allocation slot (pool index 0).
    pool.allocate();

    const node = makeDecisionNode(stubPartialMove());
    const result = expandDecisionNode(node, pool, makeCtx(discover));

    assert.equal(result.kind, 'expanded');
    if (result.kind !== 'expanded') return;
    assert.equal(result.children.length, 3);
    assert.equal(result.wideningBypassed, true);
    assert.equal(node.children.length, 3);

    // Each child should have the correct partial move with the option value.
    const childParams = result.children.map((c: MctsNode) => c.partialMove?.params?.province);
    assert.deepEqual(childParams, ['quangTri', 'binhDinh', 'phuBon']);

    // All children should be decision nodes with correct decisionType.
    for (const child of result.children) {
      assert.equal(child.nodeKind, 'decision');
      assert.equal(child.decisionPlayer, PLAYER_0);
      assert.equal(child.decisionBinding, 'province');
      assert.equal(child.heuristicPrior, null);
      assert.equal(child.decisionType, 'chooseOne');
    }
  });
});

// ---------------------------------------------------------------------------
// 2. chooseN — creates per-pick child nodes using resolution metadata
// ---------------------------------------------------------------------------

describe('expandDecisionNode — chooseN', () => {
  it('creates per-pick child nodes for legal and unknown options', () => {
    const pending: ChoiceRequest = {
      kind: 'pending',
      complete: false,
      decisionPlayer: PLAYER_0,
      decisionKey: dk('provinces'),
      name: 'chooseProvinces',
      type: 'chooseN',
      min: 1,
      max: 3,
      selected: [],
      canConfirm: false,
      options: [
        { value: 'quangTri', legality: 'legal', illegalReason: null, resolution: 'exact' },
        { value: 'binhDinh', legality: 'legal', illegalReason: null, resolution: 'exact' },
        { value: 'phuBon', legality: 'unknown', illegalReason: null, resolution: 'provisional' },
        { value: 'kontum', legality: 'illegal', illegalReason: 'pipelineLegalityFailed', resolution: 'exact' },
      ],
      targetKinds: [],
    };

    const discover: DiscoverChoicesFn = () => pending;
    const pool = createNodePool(20, PLAYER_COUNT);
    pool.allocate();

    const node = makeDecisionNode(stubPartialMove());
    const result = expandDecisionNode(node, pool, makeCtx(discover));

    assert.equal(result.kind, 'expanded');
    if (result.kind !== 'expanded') return;
    // 2 legal + 1 unknown = 3 children.  1 illegal pruned.
    assert.equal(result.children.length, 3);

    // All chooseN children should have decisionType 'chooseN'.
    for (const child of result.children) {
      assert.equal(child.decisionType, 'chooseN');
    }
  });

  // ---------------------------------------------------------------------------
  // 3. chooseN — illegal options are never expanded
  // ---------------------------------------------------------------------------

  it('never expands illegal options (multi-option case)', () => {
    const pending: ChoiceRequest = {
      kind: 'pending',
      complete: false,
      decisionPlayer: PLAYER_0,
      decisionKey: dk('provinces'),
      name: 'chooseProvinces',
      type: 'chooseN',
      min: 1,
      max: 3,
      selected: [],
      canConfirm: false,
      options: [
        { value: 'a', legality: 'illegal', illegalReason: 'pipelineLegalityFailed', resolution: 'exact' },
        { value: 'b', legality: 'legal', illegalReason: null, resolution: 'exact' },
        { value: 'c', legality: 'legal', illegalReason: null, resolution: 'exact' },
      ],
      targetKinds: [],
    };

    const discover: DiscoverChoicesFn = () => pending;
    const pool = createNodePool(20, PLAYER_COUNT);
    pool.allocate();

    const node = makeDecisionNode(stubPartialMove());
    const result = expandDecisionNode(node, pool, makeCtx(discover));

    assert.equal(result.kind, 'expanded');
    if (result.kind !== 'expanded') return;
    assert.equal(result.children.length, 2);
    const values = result.children.map((c: MctsNode) => c.partialMove?.params?.provinces);
    assert.ok(!values.includes('a'));
  });

  // ---------------------------------------------------------------------------
  // 4. chooseN — unknown options are treated as widening candidates
  // ---------------------------------------------------------------------------

  it('treats unknown options as widening candidates', () => {
    const pending: ChoiceRequest = {
      kind: 'pending',
      complete: false,
      decisionPlayer: PLAYER_0,
      decisionKey: dk('provinces'),
      name: 'chooseProvinces',
      type: 'chooseN',
      min: 1,
      max: 3,
      selected: [],
      canConfirm: false,
      options: [
        { value: 'a', legality: 'legal', illegalReason: null, resolution: 'exact' },
        { value: 'b', legality: 'unknown', illegalReason: null, resolution: 'provisional' },
        { value: 'c', legality: 'unknown', illegalReason: null, resolution: 'provisional' },
      ],
      targetKinds: [],
    };

    const discover: DiscoverChoicesFn = () => pending;
    const pool = createNodePool(20, PLAYER_COUNT);
    pool.allocate();

    const node = makeDecisionNode(stubPartialMove());
    const result = expandDecisionNode(node, pool, makeCtx(discover));

    assert.equal(result.kind, 'expanded');
    if (result.kind !== 'expanded') return;
    // 1 legal + 2 unknown = 3 children.
    assert.equal(result.children.length, 3);
  });
});

// ---------------------------------------------------------------------------
// 5. complete response — returns the completed move
// ---------------------------------------------------------------------------

describe('expandDecisionNode — complete', () => {
  it('returns completed move', () => {
    const complete: ChoiceRequest = { kind: 'complete', complete: true };

    const discover: DiscoverChoicesFn = () => complete;
    const pool = createNodePool(10, PLAYER_COUNT);

    const move = stubPartialMove({ province: 'quangTri' });
    const node = makeDecisionNode(move);
    const result = expandDecisionNode(node, pool, makeCtx(discover));

    assert.equal(result.kind, 'complete');
    if (result.kind !== 'complete') return;
    assert.deepEqual(result.move, move);
    assert.equal(typeof result.stepsUsed, 'number');
  });
});

// ---------------------------------------------------------------------------
// 6. illegal response — signals prune
// ---------------------------------------------------------------------------

describe('expandDecisionNode — illegal', () => {
  it('signals prune with reason', () => {
    const illegal: ChoiceRequest = {
      kind: 'illegal',
      complete: false,
      reason: 'pipelineLegalityFailed',
      name: 'chooseProvince',
    };

    const discover: DiscoverChoicesFn = () => illegal;
    const pool = createNodePool(10, PLAYER_COUNT);

    const node = makeDecisionNode(stubPartialMove());
    const result = expandDecisionNode(node, pool, makeCtx(discover));

    assert.equal(result.kind, 'illegal');
    if (result.kind !== 'illegal') return;
    assert.equal(result.reason, 'pipelineLegalityFailed');
    assert.equal(result.decisionName, 'chooseProvince');
  });
});

// ---------------------------------------------------------------------------
// 7. progressive widening bypass — all options expanded when <= cap
// ---------------------------------------------------------------------------

describe('expandDecisionNode — progressive widening bypass', () => {
  it('bypasses widening when optionCount <= decisionWideningCap', () => {
    const options = Array.from({ length: 5 }, (_, i) => ({
      value: `opt${i}`,
      legality: 'unknown' as const,
      illegalReason: null,
    }));

    const pending: ChoiceRequest = {
      kind: 'pending',
      complete: false,
      decisionPlayer: PLAYER_0,
      decisionKey: dk('choice'),
      name: 'testChoice',
      type: 'chooseOne',
      options,
      targetKinds: [],
    };

    const discover: DiscoverChoicesFn = () => pending;
    const pool = createNodePool(20, PLAYER_COUNT);
    pool.allocate();

    const node = makeDecisionNode(stubPartialMove());
    const result = expandDecisionNode(node, pool, makeCtx(discover, { decisionWideningCap: 12 }));

    assert.equal(result.kind, 'expanded');
    if (result.kind !== 'expanded') return;
    assert.equal(result.children.length, 5);
    assert.equal(result.wideningBypassed, true);
  });

  it('does not bypass widening when optionCount > decisionWideningCap', () => {
    const options = Array.from({ length: 15 }, (_, i) => ({
      value: `opt${i}`,
      legality: 'unknown' as const,
      illegalReason: null,
    }));

    const pending: ChoiceRequest = {
      kind: 'pending',
      complete: false,
      decisionPlayer: PLAYER_0,
      decisionKey: dk('choice'),
      name: 'testChoice',
      type: 'chooseOne',
      options,
      targetKinds: [],
    };

    const discover: DiscoverChoicesFn = () => pending;
    const pool = createNodePool(30, PLAYER_COUNT);
    pool.allocate();

    const node = makeDecisionNode(stubPartialMove());
    const result = expandDecisionNode(node, pool, makeCtx(discover, { decisionWideningCap: 12 }));

    assert.equal(result.kind, 'expanded');
    if (result.kind !== 'expanded') return;
    assert.equal(result.children.length, 15);
    assert.equal(result.wideningBypassed, false);
  });
});

// ---------------------------------------------------------------------------
// 8. forced-sequence compression — single option skips node allocation
// ---------------------------------------------------------------------------

describe('expandDecisionNode — forced-sequence compression', () => {
  it('skips node allocation for single-option step and recurses', () => {
    let callCount = 0;

    const discover: DiscoverChoicesFn = (
      _def: GameDef, _state: GameState, _move: Move,
    ): ChoiceRequest => {
      callCount += 1;
      if (callCount === 1) {
        // First call: single option — triggers compression.
        return {
          kind: 'pending',
          complete: false,
          decisionPlayer: PLAYER_0,
          decisionKey: dk('step1'),
          name: 'singleStep',
          type: 'chooseOne',
          options: [{ value: 'onlyOption', legality: 'unknown', illegalReason: null }],
          targetKinds: [],
        };
      }
      // Second call (after compression): complete.
      return { kind: 'complete', complete: true };
    };

    const pool = createNodePool(10, PLAYER_COUNT);

    const node = makeDecisionNode(stubPartialMove());
    const initialChildCount = node.children.length;
    const result = expandDecisionNode(node, pool, makeCtx(discover));

    // Should have compressed (no new children allocated) and returned complete.
    assert.equal(result.kind, 'complete');
    assert.equal(node.children.length, initialChildCount);
    assert.equal(callCount, 2);

    // The node's partialMove should have been advanced with the single option.
    assert.equal(node.partialMove?.params?.step1, 'onlyOption');
  });
});

// ---------------------------------------------------------------------------
// 9. visitor receives decisionNodeCreated events
// ---------------------------------------------------------------------------

describe('expandDecisionNode — visitor events', () => {
  it('emits decisionNodeCreated for each allocated decision node', () => {
    const events: MctsSearchEvent[] = [];
    const visitor = {
      onEvent: (event: MctsSearchEvent) => { events.push(event); },
    };

    const pending: ChoiceRequest = {
      kind: 'pending',
      complete: false,
      decisionPlayer: PLAYER_0,
      decisionKey: dk('province'),
      name: 'chooseProvince',
      type: 'chooseOne',
      options: [
        { value: 'a', legality: 'unknown', illegalReason: null },
        { value: 'b', legality: 'unknown', illegalReason: null },
      ],
      targetKinds: [],
    };

    const discover: DiscoverChoicesFn = () => pending;
    const pool = createNodePool(20, PLAYER_COUNT);
    pool.allocate();

    const node = makeDecisionNode(stubPartialMove());
    expandDecisionNode(node, pool, makeCtx(discover, { visitor }));

    const created = events.filter((e) => e.type === 'decisionNodeCreated');
    assert.equal(created.length, 2);

    for (const event of created) {
      assert.equal(event.type, 'decisionNodeCreated');
      if (event.type !== 'decisionNodeCreated') continue;
      assert.equal(event.actionId, ACTION_ID);
      assert.equal(event.decisionName, 'chooseProvince');
      assert.equal(event.optionCount, 2);
      // Parent is at decision depth 1, children are at depth 2.
      assert.equal(event.decisionDepth, 2);
    }
  });

  it('emits decisionCompleted when sequence resolves', () => {
    const events: MctsSearchEvent[] = [];
    const visitor = {
      onEvent: (event: MctsSearchEvent) => { events.push(event); },
    };

    const complete: ChoiceRequest = { kind: 'complete', complete: true };
    const discover: DiscoverChoicesFn = () => complete;
    const pool = createNodePool(10, PLAYER_COUNT);

    const node = makeDecisionNode(stubPartialMove());
    expandDecisionNode(node, pool, makeCtx(discover, { visitor }));

    const completed = events.filter((e) => e.type === 'decisionCompleted');
    assert.equal(completed.length, 1);
    assert.equal(completed[0]!.type, 'decisionCompleted');
  });

  it('emits decisionIllegal when path is pruned', () => {
    const events: MctsSearchEvent[] = [];
    const visitor = {
      onEvent: (event: MctsSearchEvent) => { events.push(event); },
    };

    const illegal: ChoiceRequest = {
      kind: 'illegal',
      complete: false,
      reason: 'pipelineLegalityFailed',
      name: 'testDecision',
    };
    const discover: DiscoverChoicesFn = () => illegal;
    const pool = createNodePool(10, PLAYER_COUNT);

    const node = makeDecisionNode(stubPartialMove());
    expandDecisionNode(node, pool, makeCtx(discover, { visitor }));

    const illegals = events.filter((e) => e.type === 'decisionIllegal');
    assert.equal(illegals.length, 1);
  });
});

// ---------------------------------------------------------------------------
// Diagnostics accumulator integration
// ---------------------------------------------------------------------------

describe('expandDecisionNode — diagnostics accumulator', () => {
  it('increments decisionNodesCreated for each child', () => {
    const accumulator = createAccumulator();

    const pending: ChoiceRequest = {
      kind: 'pending',
      complete: false,
      decisionPlayer: PLAYER_0,
      decisionKey: dk('province'),
      name: 'chooseProvince',
      type: 'chooseOne',
      options: [
        { value: 'a', legality: 'unknown', illegalReason: null },
        { value: 'b', legality: 'unknown', illegalReason: null },
        { value: 'c', legality: 'unknown', illegalReason: null },
      ],
      targetKinds: [],
    };

    const discover: DiscoverChoicesFn = () => pending;
    const pool = createNodePool(20, PLAYER_COUNT);
    pool.allocate();

    const node = makeDecisionNode(stubPartialMove());
    expandDecisionNode(node, pool, makeCtx(discover, { accumulator }));

    assert.equal(accumulator.decisionNodesCreated, 3);
  });

  it('increments decisionCompletionsInTree on complete', () => {
    const accumulator = createAccumulator();
    const complete: ChoiceRequest = { kind: 'complete', complete: true };
    const discover: DiscoverChoicesFn = () => complete;
    const pool = createNodePool(10, PLAYER_COUNT);

    const node = makeDecisionNode(stubPartialMove());
    expandDecisionNode(node, pool, makeCtx(discover, { accumulator }));

    assert.equal(accumulator.decisionCompletionsInTree, 1);
  });

  it('increments decisionIllegalPruned on illegal', () => {
    const accumulator = createAccumulator();
    const illegal: ChoiceRequest = {
      kind: 'illegal',
      complete: false,
      reason: 'pipelineLegalityFailed',
    };
    const discover: DiscoverChoicesFn = () => illegal;
    const pool = createNodePool(10, PLAYER_COUNT);

    const node = makeDecisionNode(stubPartialMove());
    expandDecisionNode(node, pool, makeCtx(discover, { accumulator }));

    assert.equal(accumulator.decisionIllegalPruned, 1);
  });
});

// ---------------------------------------------------------------------------
// 8. Compound SA — decisionPath routing
// ---------------------------------------------------------------------------

describe('expandDecisionNode — compound SA decisionPath', () => {
  const SA_ACTION_ID = 'governSA';

  function stubCompoundMove(
    mainParams: Record<string, unknown> = {},
    saParams: Record<string, unknown> = {},
  ): Move {
    return {
      actionId: ACTION_ID,
      params: mainParams as Move['params'],
      compound: {
        specialActivity: {
          actionId: SA_ACTION_ID,
          params: saParams as Move['params'],
        },
        timing: 'after' as const,
      },
    } as Move;
  }

  it('routes SA decisions to compound.specialActivity.params', () => {
    // First call: main action pending for province
    // Second call (after province filled): SA pending for city with decisionPath
    let callCount = 0;
    const discover: DiscoverChoicesFn = (_def, _state, _move) => {
      callCount += 1;
      if (callCount === 1) {
        // First call — main action choice
        return {
          kind: 'pending',
          complete: false,
          decisionPlayer: PLAYER_0,
          decisionKey: dk('province'),
          name: 'chooseProvince',
          type: 'chooseOne',
          options: [
            { value: 'A', legality: 'unknown', illegalReason: null },
          ],
          targetKinds: [],
        } as ChoiceRequest;
      }
      // Second call — SA choice with decisionPath
      return {
        kind: 'pending',
        complete: false,
        decisionPlayer: PLAYER_0,
        decisionKey: dk('city'),
        name: 'chooseCity',
        type: 'chooseOne',
        decisionPath: 'compound.specialActivity',
        options: [
          { value: 'X', legality: 'unknown', illegalReason: null },
          { value: 'Y', legality: 'unknown', illegalReason: null },
        ],
        targetKinds: [],
      } as ChoiceRequest;
    };

    const pool = createNodePool(20, PLAYER_COUNT);
    pool.allocate();

    const node = makeDecisionNode(stubCompoundMove());
    // First expansion: main action choice with 1 option → forced-sequence compression
    // → recurses into second call which returns SA pending with 2 options
    const result = expandDecisionNode(node, pool, makeCtx(discover));

    assert.equal(result.kind, 'expanded');
    if (result.kind !== 'expanded') return;

    // The forced-sequence compression for the single main option should have
    // advanced the main params, then expanded the SA choice (2 options).
    assert.equal(result.children.length, 2);

    // Verify SA params were routed to compound.specialActivity.params, not main params
    for (const child of result.children) {
      const childMove = child.partialMove!;
      // Main params should have province filled (from forced-sequence compression)
      assert.equal(childMove.params.province, 'A');
      // SA params should have the city value
      assert.ok(childMove.compound !== undefined, 'compound payload should exist');
      const saCity = childMove.compound!.specialActivity.params.city;
      assert.ok(saCity === 'X' || saCity === 'Y', `SA city should be X or Y, got ${String(saCity)}`);
    }
  });

  it('non-compound moves are unaffected — params go to top-level', () => {
    const pending: ChoiceRequest = {
      kind: 'pending',
      complete: false,
      decisionPlayer: PLAYER_0,
      decisionKey: dk('province'),
      name: 'chooseProvince',
      type: 'chooseOne',
      options: [
        { value: 'A', legality: 'unknown', illegalReason: null },
        { value: 'B', legality: 'unknown', illegalReason: null },
      ],
      targetKinds: [],
      // no decisionPath — defaults to main
    };

    const discover: DiscoverChoicesFn = () => pending;
    const pool = createNodePool(20, PLAYER_COUNT);
    pool.allocate();

    const node = makeDecisionNode(stubPartialMove());
    const result = expandDecisionNode(node, pool, makeCtx(discover));

    assert.equal(result.kind, 'expanded');
    if (result.kind !== 'expanded') return;
    assert.equal(result.children.length, 2);

    // Params go to top-level move.params
    for (const child of result.children) {
      assert.ok(child.partialMove!.params.province !== undefined);
      assert.equal(child.partialMove!.compound, undefined);
    }
  });

  it('complete result includes full compound move with SA params filled', () => {
    // SA is complete after forced-sequence compression fills both main and SA
    const discover: DiscoverChoicesFn = (_def, _state, probeMove) => {
      // If SA params are filled, return complete
      if (probeMove.compound?.specialActivity.params.city !== undefined) {
        return { kind: 'complete', complete: true };
      }
      // If main params are filled, return SA choice
      if (probeMove.params.province !== undefined) {
        return {
          kind: 'pending',
          complete: false,
          decisionPlayer: PLAYER_0,
          decisionKey: dk('city'),
          name: 'chooseCity',
          type: 'chooseOne',
          decisionPath: 'compound.specialActivity',
          options: [
            { value: 'X', legality: 'unknown', illegalReason: null },
          ],
          targetKinds: [],
        } as ChoiceRequest;
      }
      // Main not yet filled
      return {
        kind: 'pending',
        complete: false,
        decisionPlayer: PLAYER_0,
        decisionKey: dk('province'),
        name: 'chooseProvince',
        type: 'chooseOne',
        options: [
          { value: 'A', legality: 'unknown', illegalReason: null },
        ],
        targetKinds: [],
      } as ChoiceRequest;
    };

    const pool = createNodePool(20, PLAYER_COUNT);
    pool.allocate();

    const node = makeDecisionNode(stubCompoundMove());
    // Both main and SA have single option → forced-sequence to complete
    const result = expandDecisionNode(node, pool, makeCtx(discover));

    assert.equal(result.kind, 'complete');
    if (result.kind !== 'complete') return;

    // The completed move should have both main and SA params
    assert.equal(result.move.params.province, 'A');
    assert.equal(result.move.compound?.specialActivity.params.city, 'X');
  });
});
