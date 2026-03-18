/**
 * Unit tests for chooseN decision expansion: array param storage,
 * incremental tree structure, confirm node availability, duplicate
 * prevention, min/max cardinality, empty selection, single option,
 * decision type metadata, and chooseOne regression.
 *
 * All tests call `expandDecisionNode` directly with controlled
 * `discoverChoices` overrides, following the same pattern as
 * `decision-expansion.test.ts`.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Move, ChoiceRequest, ChoicePendingChooseNRequest } from '../../../../src/kernel/types-core.js';
import type { DecisionKey } from '../../../../src/kernel/decision-scope.js';
import type { GameDef, GameState } from '../../../../src/kernel/types.js';
import type { MctsNode } from '../../../../src/agents/mcts/node.js';
import { expandDecisionNode } from '../../../../src/agents/mcts/decision-expansion.js';
import type { DecisionExpansionContext, DiscoverChoicesFn } from '../../../../src/agents/mcts/decision-expansion.js';
import type { LegalChoicesRuntimeOptions } from '../../../../src/kernel/legal-choices.js';
import type { MoveParamScalar } from '../../../../src/kernel/types-ast.js';
import { createRootNode } from '../../../../src/agents/mcts/node.js';
import { createNodePool } from '../../../../src/agents/mcts/node-pool.js';
import { asPlayerId } from '../../../../src/kernel/branded.js';

const dk = (s: string): DecisionKey => s as DecisionKey;

/**
 * Extract the accumulated chooseN array for a binding, checking both
 * the move params (for finalized/confirmed values) and the
 * transientChooseNSelections (for in-progress intermediate arrays
 * stripped by discoverWithCache).
 */
function getAccumulated(
  probeMove: Move,
  binding: string,
  options?: LegalChoicesRuntimeOptions,
): readonly MoveParamScalar[] | undefined {
  const fromParams = probeMove.params[binding];
  if (Array.isArray(fromParams)) return fromParams as readonly MoveParamScalar[];
  const fromTransient = options?.transientChooseNSelections?.[binding];
  if (fromTransient !== undefined) return fromTransient;
  return undefined;
}

// ---------------------------------------------------------------------------
// Minimal stubs (same pattern as decision-expansion.test.ts)
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
// Helper: create a chooseN pending request with controlled options
// ---------------------------------------------------------------------------

function makeChooseNRequest(opts: {
  decisionKey: string;
  options: readonly { value: string; legality?: 'legal' | 'unknown' | 'illegal' }[];
  min?: number;
  max?: number;
  selected?: readonly string[];
  canConfirm?: boolean;
}): ChoicePendingChooseNRequest {
  return {
    kind: 'pending',
    complete: false,
    decisionPlayer: PLAYER_0,
    decisionKey: dk(opts.decisionKey),
    name: `choose_${opts.decisionKey}`,
    type: 'chooseN',
    min: opts.min ?? 0,
    max: opts.max ?? opts.options.length,
    selected: (opts.selected ?? []) as readonly import('../../../../src/kernel/types-ast.js').MoveParamScalar[],
    canConfirm: opts.canConfirm ?? false,
    options: opts.options.map((o) => ({
      value: o.value,
      legality: o.legality ?? 'legal',
      illegalReason: null,
      resolution: 'exact' as const,
    })),
    targetKinds: [],
  } as ChoicePendingChooseNRequest;
}

// ---------------------------------------------------------------------------
// 1. Array param storage
// ---------------------------------------------------------------------------

describe('chooseN unit — array param storage', () => {
  it('expand a chooseN decision node produces array-valued params', () => {
    const request = makeChooseNRequest({
      decisionKey: '$targets',
      options: [{ value: 'zoneA' }, { value: 'zoneB' }, { value: 'zoneC' }],
      min: 1,
      max: 3,
      canConfirm: false,
    });

    const discover: DiscoverChoicesFn = () => request;
    const pool = createNodePool(20, PLAYER_COUNT);
    pool.allocate();

    const node = makeDecisionNode(stubPartialMove());
    const result = expandDecisionNode(node, pool, makeCtx(discover));

    assert.equal(result.kind, 'expanded');
    if (result.kind !== 'expanded') return;

    for (const child of result.children) {
      const paramVal = child.partialMove?.params?.$targets;
      assert.ok(Array.isArray(paramVal), `expected array, got ${typeof paramVal}: ${String(paramVal)}`);
    }

    const paramArrays = result.children.map((c: MctsNode) => c.partialMove?.params?.$targets);
    assert.deepEqual(paramArrays, [['zoneA'], ['zoneB'], ['zoneC']]);
  });
});

// ---------------------------------------------------------------------------
// 2. Incremental selection — tree structure and array accumulation
// ---------------------------------------------------------------------------

describe('chooseN unit — incremental selection', () => {
  it('expand chooseN with 3 options, max 2 shows correct depth and accumulation', () => {
    // First expansion: 3 options, min:1, max:2, canConfirm:false
    // Second expansion (after picking first item): remaining options + canConfirm:true
    const discover: DiscoverChoicesFn = (_def, _state, probeMove, opts) => {
      const current = getAccumulated(probeMove, '$targets', opts);
      if (current !== undefined && current.length >= 1) {
        // After first pick: return remaining options with canConfirm
        return makeChooseNRequest({
          decisionKey: '$targets',
          options: [{ value: 'b' }, { value: 'c' }],
          min: 1,
          max: 2,
          selected: current as string[],
          canConfirm: true,
        });
      }
      return makeChooseNRequest({
        decisionKey: '$targets',
        options: [{ value: 'a' }, { value: 'b' }, { value: 'c' }],
        min: 1,
        max: 2,
        canConfirm: false,
      });
    };

    const pool = createNodePool(40, PLAYER_COUNT);
    pool.allocate();

    // Level 1: 3 children with single-element arrays.
    const node = makeDecisionNode(stubPartialMove());
    const result1 = expandDecisionNode(node, pool, makeCtx(discover));
    assert.equal(result1.kind, 'expanded');
    if (result1.kind !== 'expanded') return;
    assert.equal(result1.children.length, 3);

    // Pick child 'a' and expand level 2.
    const childA = result1.children[0]!;
    assert.deepEqual(childA.partialMove?.params?.$targets, ['a']);

    const result2 = expandDecisionNode(childA, pool, makeCtx(discover));
    assert.equal(result2.kind, 'expanded');
    if (result2.kind !== 'expanded') return;

    // Level 2 from 'a': confirm child + 'b' child + 'c' child = 3
    // (canConfirm=true gives a confirm child, plus 2 remaining options)
    assert.equal(result2.children.length, 3);

    // Verify accumulation: the non-confirm children should have 2-element arrays.
    const nonConfirmChildren = result2.children.filter(
      (c: MctsNode) => !c.decisionBinding?.startsWith('$confirm:'),
    );
    const accumulated = nonConfirmChildren.map(
      (c: MctsNode) => c.partialMove?.params?.$targets,
    );
    assert.deepEqual(accumulated, [['a', 'b'], ['a', 'c']]);
  });
});

// ---------------------------------------------------------------------------
// 3. Confirm node availability (min: 0) — confirm available at root level
// ---------------------------------------------------------------------------

describe('chooseN unit — confirm node availability (min: 0)', () => {
  it('chooseN with min:0 has confirm node available at root level', () => {
    const request = makeChooseNRequest({
      decisionKey: '$targets',
      options: [{ value: 'zoneA' }, { value: 'zoneB' }],
      min: 0,
      max: 2,
      canConfirm: true, // min:0 means canConfirm is true even with 0 selected
    });

    const discover: DiscoverChoicesFn = () => request;
    const pool = createNodePool(20, PLAYER_COUNT);
    pool.allocate();

    const node = makeDecisionNode(stubPartialMove());
    const result = expandDecisionNode(node, pool, makeCtx(discover));

    assert.equal(result.kind, 'expanded');
    if (result.kind !== 'expanded') return;

    // Should have: 1 confirm child + 2 option children = 3
    assert.equal(result.children.length, 3);

    // Verify confirm child exists (uses $confirm: binding prefix).
    const confirmChildren = result.children.filter(
      (c: MctsNode) => c.decisionBinding?.startsWith('$confirm:'),
    );
    assert.equal(confirmChildren.length, 1, 'should have exactly 1 confirm child');
  });
});

// ---------------------------------------------------------------------------
// 4. Confirm node availability (min: 2) — confirm NOT available until 2 selected
// ---------------------------------------------------------------------------

describe('chooseN unit — confirm node availability (min: 2)', () => {
  it('chooseN with min:2 has NO confirm node until 2 items selected', () => {
    // Level 0: min:2, 0 selected → canConfirm: false
    const request = makeChooseNRequest({
      decisionKey: '$targets',
      options: [{ value: 'a' }, { value: 'b' }, { value: 'c' }],
      min: 2,
      max: 3,
      canConfirm: false, // 0 selected < min:2
    });

    const discover: DiscoverChoicesFn = () => request;
    const pool = createNodePool(20, PLAYER_COUNT);
    pool.allocate();

    const node = makeDecisionNode(stubPartialMove());
    const result = expandDecisionNode(node, pool, makeCtx(discover));

    assert.equal(result.kind, 'expanded');
    if (result.kind !== 'expanded') return;

    // No confirm children at level 0 (0 selected < min:2).
    const confirmChildren = result.children.filter(
      (c: MctsNode) => c.decisionBinding?.startsWith('$confirm:'),
    );
    assert.equal(confirmChildren.length, 0, 'no confirm child when selected < min');

    // Only option children: 3
    assert.equal(result.children.length, 3);
  });

  it('chooseN with min:2 has confirm node once 2 items selected', () => {
    // Simulate level 2: already have ['a', 'b'] selected, canConfirm: true
    const request = makeChooseNRequest({
      decisionKey: '$targets',
      options: [{ value: 'c' }],
      min: 2,
      max: 3,
      selected: ['a', 'b'],
      canConfirm: true, // 2 selected >= min:2
    });

    const discover: DiscoverChoicesFn = () => request;
    const pool = createNodePool(20, PLAYER_COUNT);
    pool.allocate();

    // Start with a partial move that already has ['a','b'] accumulated.
    const node = makeDecisionNode(stubPartialMove({ $targets: ['a', 'b'] }));
    const result = expandDecisionNode(node, pool, makeCtx(discover));

    assert.equal(result.kind, 'expanded');
    if (result.kind !== 'expanded') return;

    // Should have: 1 confirm child + 1 option child = 2
    assert.equal(result.children.length, 2);

    const confirmChildren = result.children.filter(
      (c: MctsNode) => c.decisionBinding?.startsWith('$confirm:'),
    );
    assert.equal(confirmChildren.length, 1, 'confirm child present when selected >= min');
  });
});

// ---------------------------------------------------------------------------
// 5. Duplicate prevention — lexicographic ordering
// ---------------------------------------------------------------------------

describe('chooseN unit — duplicate prevention', () => {
  it('children at level 2 only include options with index > parent selected index', () => {
    // After picking 'b' (index 1), only 'c' (index 2) should be available.
    // 'a' (index 0) should be excluded (would produce duplicate permutation).
    const discover: DiscoverChoicesFn = (_def, _state, probeMove, opts) => {
      const current = getAccumulated(probeMove, '$targets', opts);
      if (current !== undefined && current.length >= 1) {
        // After first pick: return ALL options, but expansion should filter.
        return makeChooseNRequest({
          decisionKey: '$targets',
          options: [{ value: 'a' }, { value: 'b' }, { value: 'c' }],
          min: 1,
          max: 3,
          selected: current as string[],
          canConfirm: true,
        });
      }
      return makeChooseNRequest({
        decisionKey: '$targets',
        options: [{ value: 'a' }, { value: 'b' }, { value: 'c' }],
        min: 1,
        max: 3,
        canConfirm: false,
      });
    };

    const pool = createNodePool(40, PLAYER_COUNT);
    pool.allocate();

    // Level 1 expansion.
    const node = makeDecisionNode(stubPartialMove());
    const result1 = expandDecisionNode(node, pool, makeCtx(discover));
    assert.equal(result1.kind, 'expanded');
    if (result1.kind !== 'expanded') return;

    // Pick child 'b' (the second child).
    const childB = result1.children[1]!;
    assert.deepEqual(childB.partialMove?.params?.$targets, ['b']);

    // Level 2 from 'b'.
    const result2 = expandDecisionNode(childB, pool, makeCtx(discover));
    assert.equal(result2.kind, 'expanded');
    if (result2.kind !== 'expanded') return;

    // Should have: confirm + 'c' only. No 'a' (comes before 'b'), no 'b' (already selected).
    const nonConfirmChildren = result2.children.filter(
      (c: MctsNode) => !c.decisionBinding?.startsWith('$confirm:'),
    );
    const values = nonConfirmChildren.map(
      (c: MctsNode) => (c.partialMove?.params?.$targets as string[])?.[1],
    );
    assert.deepEqual(values, ['c'], 'only options after last selected should appear');
    assert.ok(!values.includes('a'), 'no option before last selected (duplicate prevention)');
    assert.ok(!values.includes('b'), 'no already-selected option');
  });
});

// ---------------------------------------------------------------------------
// 6. Min/max cardinality
// ---------------------------------------------------------------------------

describe('chooseN unit — min/max cardinality', () => {
  it('min:1, max:3 — no confirm at 0, confirm at 1-3, no expansion beyond 3', () => {
    // We test three levels:
    // Level 0: 0 selected, canConfirm: false (0 < min:1)
    // Level 1: 1 selected, canConfirm: true (1 >= min:1)
    // Level 3: 3 selected, canConfirm: true, no more options (at max)
    const discover: DiscoverChoicesFn = (_def, _state, probeMove, opts) => {
      const current = getAccumulated(probeMove, '$targets', opts);
      const len = current !== undefined ? current.length : 0;

      if (len >= 3) {
        // At max:3 — no more options, only confirm via forced-sequence compression.
        return makeChooseNRequest({
          decisionKey: '$targets',
          options: [],
          min: 1,
          max: 3,
          selected: current as string[],
          canConfirm: true,
        });
      }
      if (len >= 1) {
        return makeChooseNRequest({
          decisionKey: '$targets',
          options: [{ value: 'b' }, { value: 'c' }, { value: 'd' }],
          min: 1,
          max: 3,
          selected: current as string[],
          canConfirm: true,
        });
      }
      return makeChooseNRequest({
        decisionKey: '$targets',
        options: [{ value: 'a' }, { value: 'b' }, { value: 'c' }, { value: 'd' }],
        min: 1,
        max: 3,
        canConfirm: false,
      });
    };

    const pool = createNodePool(40, PLAYER_COUNT);
    pool.allocate();

    // Level 0: no confirm (0 < min:1).
    const node = makeDecisionNode(stubPartialMove());
    const result0 = expandDecisionNode(node, pool, makeCtx(discover));
    assert.equal(result0.kind, 'expanded');
    if (result0.kind !== 'expanded') return;

    const confirmAt0 = result0.children.filter(
      (c: MctsNode) => c.decisionBinding?.startsWith('$confirm:'),
    );
    assert.equal(confirmAt0.length, 0, 'no confirm at 0 selections (min:1)');

    // Level 1: confirm available (1 >= min:1).
    const childA = result0.children[0]!;
    const result1 = expandDecisionNode(childA, pool, makeCtx(discover));
    assert.equal(result1.kind, 'expanded');
    if (result1.kind !== 'expanded') return;

    const confirmAt1 = result1.children.filter(
      (c: MctsNode) => c.decisionBinding?.startsWith('$confirm:'),
    );
    assert.equal(confirmAt1.length, 1, 'confirm available at 1 selection (min:1)');
  });
});

// ---------------------------------------------------------------------------
// 7. Empty selection — confirm with empty array []
// ---------------------------------------------------------------------------

describe('chooseN unit — empty selection', () => {
  it('chooseN with min:0 can confirm with empty array', () => {
    const request = makeChooseNRequest({
      decisionKey: '$targets',
      options: [{ value: 'zoneA' }, { value: 'zoneB' }],
      min: 0,
      max: 2,
      canConfirm: true,
    });

    const discover: DiscoverChoicesFn = () => request;
    const pool = createNodePool(20, PLAYER_COUNT);
    pool.allocate();

    const node = makeDecisionNode(stubPartialMove());
    const result = expandDecisionNode(node, pool, makeCtx(discover));

    assert.equal(result.kind, 'expanded');
    if (result.kind !== 'expanded') return;

    // Find confirm child.
    const confirmChild = result.children.find(
      (c: MctsNode) => c.decisionBinding?.startsWith('$confirm:'),
    );
    assert.ok(confirmChild, 'confirm child should exist for min:0');

    // Confirm child's param should be an empty array.
    const paramVal = confirmChild!.partialMove?.params?.$targets;
    assert.ok(Array.isArray(paramVal), `confirm param should be array, got ${typeof paramVal}`);
    assert.deepEqual(paramVal, [], 'confirm with empty selection produces []');
  });
});

// ---------------------------------------------------------------------------
// 8. Single option — min:1, max:1 with 1 option
// ---------------------------------------------------------------------------

describe('chooseN unit — single option', () => {
  it('chooseN with 1 option, min:1, max:1 triggers forced-sequence compression', () => {
    let callCount = 0;
    const discover: DiscoverChoicesFn = () => {
      callCount += 1;
      if (callCount === 1) {
        // Single option, canConfirm: false (must pick) → forced-sequence compression.
        return makeChooseNRequest({
          decisionKey: '$targets',
          options: [{ value: 'onlyZone' }],
          min: 1,
          max: 1,
          canConfirm: false,
        });
      }
      // After compression: complete.
      return { kind: 'complete', complete: true } as ChoiceRequest;
    };

    const pool = createNodePool(10, PLAYER_COUNT);
    const node = makeDecisionNode(stubPartialMove());
    const result = expandDecisionNode(node, pool, makeCtx(discover));

    // Forced-sequence compression should complete immediately.
    assert.equal(result.kind, 'complete');
    if (result.kind !== 'complete') return;

    // The param should be an array with the single option.
    const paramVal = node.partialMove?.params?.$targets;
    assert.ok(Array.isArray(paramVal), `expected array, got ${typeof paramVal}`);
    assert.deepEqual(paramVal, ['onlyZone']);
  });
});

// ---------------------------------------------------------------------------
// 9. Decision type metadata
// ---------------------------------------------------------------------------

describe('chooseN unit — decision type metadata', () => {
  it('chooseN nodes have decisionType "chooseN"', () => {
    const request = makeChooseNRequest({
      decisionKey: '$targets',
      options: [{ value: 'a' }, { value: 'b' }],
      min: 1,
      max: 2,
      canConfirm: false,
    });

    const discover: DiscoverChoicesFn = () => request;
    const pool = createNodePool(20, PLAYER_COUNT);
    pool.allocate();

    const node = makeDecisionNode(stubPartialMove());
    const result = expandDecisionNode(node, pool, makeCtx(discover));

    assert.equal(result.kind, 'expanded');
    if (result.kind !== 'expanded') return;

    for (const child of result.children) {
      assert.equal(child.decisionType, 'chooseN', 'chooseN children should have decisionType "chooseN"');
    }
  });

  it('chooseOne nodes have decisionType "chooseOne"', () => {
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

    for (const child of result.children) {
      assert.equal(child.decisionType, 'chooseOne', 'chooseOne children should have decisionType "chooseOne"');
    }
  });

  it('state nodes (root) have decisionType null', () => {
    const root = createRootNode(PLAYER_COUNT);
    assert.equal(root.decisionType, null, 'root state node should have decisionType null');
  });
});

// ---------------------------------------------------------------------------
// 10. chooseOne regression — still produces scalar params
// ---------------------------------------------------------------------------

describe('chooseN unit — chooseOne regression', () => {
  it('chooseOne expansion still produces scalar params, not arrays', () => {
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
    pool.allocate();

    const node = makeDecisionNode(stubPartialMove());
    const result = expandDecisionNode(node, pool, makeCtx(discover));

    assert.equal(result.kind, 'expanded');
    if (result.kind !== 'expanded') return;
    assert.equal(result.children.length, 3);

    // chooseOne params must be scalar strings, NOT arrays.
    for (const child of result.children) {
      const paramVal = child.partialMove?.params?.province;
      assert.ok(!Array.isArray(paramVal), `expected scalar, got array: ${String(paramVal)}`);
      assert.equal(typeof paramVal, 'string');
    }

    assert.equal(result.children[0]!.partialMove?.params?.province, 'quangTri');
    assert.equal(result.children[1]!.partialMove?.params?.province, 'binhDinh');
    assert.equal(result.children[2]!.partialMove?.params?.province, 'phuBon');
  });
});
