import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asZoneId,
  legalChoicesDiscover,
  legalChoicesEvaluate,
  type ActionDef,
  type EffectAST,
  type GameDef,
  type GameState,
  type Move,
  type ChoicePendingRequest,
} from '../../../src/kernel/index.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeBaseDef = (overrides?: {
  actions?: readonly ActionDef[];
  zones?: GameDef['zones'];
}): GameDef =>
  ({
    metadata: { id: 'compound-sa-test', players: { min: 2, max: 2 } },
    seats: [{ id: '0' }, { id: '1' }, { id: '2' }, { id: '3' }],
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: overrides?.zones ?? [
      { id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set' },
    ],
    tokenTypes: [],
    setup: [],
    turnStructure: {
      phases: [{ id: asPhaseId('main') }],
    },
    actions: overrides?.actions ?? [],
    triggers: [],
    terminal: { conditions: [] },
  }) as unknown as GameDef;

const makeBaseState = (overrides?: Partial<GameState>): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  zoneVars: {},
  playerCount: 2,
  zones: { 'board:none': [] },
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
  stateHash: 0n,
  _runningHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
  ...overrides,
});

/** A chooseOne effect that asks for one of the given enum values. */
const chooseOneEffect = (bind: string, values: readonly string[]): EffectAST => ({
  chooseOne: {
    internalDecisionId: `decision:${bind}`,
    bind,
    options: { query: 'enums', values: [...values] },
  },
});

/** Build a minimal action def with the given effects. */
const makeAction = (id: string, effects: readonly EffectAST[], params: ActionDef['params'] = []): ActionDef => ({
  id: asActionId(id),
  actor: 'active',
  executor: 'actor',
  phase: [asPhaseId('main')],
  params,
  pre: null,
  cost: [],
  effects: [...effects],
  limits: [],
});

/** Build a move with optional compound payload. */
const makeMove = (
  actionId: string,
  params: Record<string, unknown> = {},
  compound?: Move['compound'],
): Move => ({
  actionId: asActionId(actionId),
  params: params as Move['params'],
  ...(compound !== undefined ? { compound } : {}),
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('legalChoicesDiscover() compound SA chaining', () => {
  // ---- Basic chaining ----

  it('presents main operation decisions first for a compound move', () => {
    const mainAction = makeAction('train', [chooseOneEffect('$province', ['A', 'B'])]);
    const saAction = makeAction('govern', [chooseOneEffect('$city', ['X', 'Y'])]);
    const def = makeBaseDef({ actions: [mainAction, saAction] });
    const state = makeBaseState();

    const saMove: Move = { actionId: asActionId('govern'), params: {} };
    const move = makeMove('train', {}, {
      specialActivity: saMove,
      timing: 'after',
    });

    const result = legalChoicesDiscover(def, state, move);
    assert.equal(result.kind, 'pending');
    // First decision is from the main action, not the SA
    assert.equal((result as ChoicePendingRequest).name, '$province');
    assert.equal((result as ChoicePendingRequest).decisionPath, undefined);
  });

  it('chains into SA decisions after main op decisions complete', () => {
    const mainAction = makeAction('train', [chooseOneEffect('$province', ['A', 'B'])]);
    const saAction = makeAction('govern', [chooseOneEffect('$city', ['X', 'Y'])]);
    const def = makeBaseDef({ actions: [mainAction, saAction] });
    const state = makeBaseState();

    const saMove: Move = { actionId: asActionId('govern'), params: {} };
    const move = makeMove('train', { '$province': 'A' }, {
      specialActivity: saMove,
      timing: 'after',
    });

    const result = legalChoicesDiscover(def, state, move, { chainCompoundSA: true });
    assert.equal(result.kind, 'pending');
    const pending = result as ChoicePendingRequest;
    // SA decision is presented with decisionPath
    assert.equal(pending.name, '$city');
    assert.equal(pending.decisionPath, 'compound.specialActivity');
    assert.equal(pending.options.length, 2);
  });

  it('returns complete only when ALL decisions (main + SA) are resolved', () => {
    const mainAction = makeAction('train', [chooseOneEffect('$province', ['A', 'B'])]);
    const saAction = makeAction('govern', [chooseOneEffect('$city', ['X', 'Y'])]);
    const def = makeBaseDef({ actions: [mainAction, saAction] });
    const state = makeBaseState();

    const saMove: Move = { actionId: asActionId('govern'), params: { '$city': 'X' } };
    const move = makeMove('train', { '$province': 'A' }, {
      specialActivity: saMove,
      timing: 'after',
    });

    const result = legalChoicesDiscover(def, state, move, { chainCompoundSA: true });
    assert.equal(result.kind, 'complete');
  });

  // ---- Non-compound unaffected ----

  it('non-compound moves are unaffected — no decisionPath field', () => {
    const action = makeAction('simple', [chooseOneEffect('$target', ['A', 'B'])]);
    const def = makeBaseDef({ actions: [action] });
    const state = makeBaseState();

    const result = legalChoicesDiscover(def, state, makeMove('simple'));
    assert.equal(result.kind, 'pending');
    assert.equal((result as ChoicePendingRequest).decisionPath, undefined);
  });

  it('non-compound move returns complete normally', () => {
    const action = makeAction('simple', [chooseOneEffect('$target', ['A', 'B'])]);
    const def = makeBaseDef({ actions: [action] });
    const state = makeBaseState();

    const result = legalChoicesDiscover(def, state, makeMove('simple', { '$target': 'A' }));
    assert.equal(result.kind, 'complete');
  });

  // ---- SA with no params / no effects ----

  it('compound move with SA that has no decisions completes after main op', () => {
    const mainAction = makeAction('train', [chooseOneEffect('$province', ['A', 'B'])]);
    // SA action has no choices — empty effects
    const saAction = makeAction('govern', []);
    const def = makeBaseDef({ actions: [mainAction, saAction] });
    const state = makeBaseState();

    const saMove: Move = { actionId: asActionId('govern'), params: {} };
    const move = makeMove('train', { '$province': 'A' }, {
      specialActivity: saMove,
      timing: 'after',
    });

    const result = legalChoicesDiscover(def, state, move, { chainCompoundSA: true });
    assert.equal(result.kind, 'complete');
  });

  // ---- SA with multiple sequential decisions ----

  it('SA with multiple sequential decisions chains correctly', () => {
    const mainAction = makeAction('train', [chooseOneEffect('$province', ['A', 'B'])]);
    // SA has two sequential choices
    const saAction = makeAction('govern', [
      chooseOneEffect('$city', ['X', 'Y']),
      chooseOneEffect('$level', ['low', 'high']),
    ]);
    const def = makeBaseDef({ actions: [mainAction, saAction] });
    const state = makeBaseState();

    // Main complete, SA first decision
    const move1 = makeMove('train', { '$province': 'A' }, {
      specialActivity: { actionId: asActionId('govern'), params: {} },
      timing: 'after',
    });
    const r1 = legalChoicesDiscover(def, state, move1, { chainCompoundSA: true });
    assert.equal(r1.kind, 'pending');
    assert.equal((r1 as ChoicePendingRequest).name, '$city');
    assert.equal((r1 as ChoicePendingRequest).decisionPath, 'compound.specialActivity');

    // SA first decision filled, expect second SA decision
    const move2 = makeMove('train', { '$province': 'A' }, {
      specialActivity: { actionId: asActionId('govern'), params: { '$city': 'X' } },
      timing: 'after',
    });
    const r2 = legalChoicesDiscover(def, state, move2, { chainCompoundSA: true });
    assert.equal(r2.kind, 'pending');
    assert.equal((r2 as ChoicePendingRequest).name, '$level');
    assert.equal((r2 as ChoicePendingRequest).decisionPath, 'compound.specialActivity');

    // Both SA decisions filled — complete
    const move3 = makeMove('train', { '$province': 'A' }, {
      specialActivity: {
        actionId: asActionId('govern'),
        params: { '$city': 'X', '$level': 'high' },
      },
      timing: 'after',
    });
    const r3 = legalChoicesDiscover(def, state, move3, { chainCompoundSA: true });
    assert.equal(r3.kind, 'complete');
  });

  // ---- Compound timing variants ----

  it('compound with timing "before" chains SA decisions', () => {
    const mainAction = makeAction('train', [chooseOneEffect('$province', ['A'])]);
    const saAction = makeAction('govern', [chooseOneEffect('$city', ['X'])]);
    const def = makeBaseDef({ actions: [mainAction, saAction] });
    const state = makeBaseState();

    const move = makeMove('train', { '$province': 'A' }, {
      specialActivity: { actionId: asActionId('govern'), params: {} },
      timing: 'before',
    });
    const result = legalChoicesDiscover(def, state, move, { chainCompoundSA: true });
    assert.equal(result.kind, 'pending');
    assert.equal((result as ChoicePendingRequest).decisionPath, 'compound.specialActivity');
  });

  it('compound with timing "during" chains SA decisions', () => {
    const mainAction = makeAction('train', [chooseOneEffect('$province', ['A'])]);
    const saAction = makeAction('govern', [chooseOneEffect('$city', ['X'])]);
    const def = makeBaseDef({ actions: [mainAction, saAction] });
    const state = makeBaseState();

    const move = makeMove('train', { '$province': 'A' }, {
      specialActivity: { actionId: asActionId('govern'), params: {} },
      timing: 'during',
      insertAfterStage: 0,
    });
    const result = legalChoicesDiscover(def, state, move, { chainCompoundSA: true });
    assert.equal(result.kind, 'pending');
    assert.equal((result as ChoicePendingRequest).decisionPath, 'compound.specialActivity');
  });

  // ---- SA action not found ----

  it('throws when compound SA action id does not exist', () => {
    const mainAction = makeAction('train', [chooseOneEffect('$province', ['A'])]);
    const def = makeBaseDef({ actions: [mainAction] });
    const state = makeBaseState();

    const move = makeMove('train', { '$province': 'A' }, {
      specialActivity: { actionId: asActionId('nonExistentSA'), params: {} },
      timing: 'after',
    });
    assert.throws(
      () => legalChoicesDiscover(def, state, move, { chainCompoundSA: true }),
      (error: unknown) => {
        return error instanceof Error && error.message.includes('nonExistentSA');
      },
    );
  });

  // ---- SA with illegal first decision ----

  it('SA that is immediately illegal returns illegal with no decisionPath', () => {
    const mainAction = makeAction('train', [chooseOneEffect('$province', ['A'])]);
    // SA action requires a different phase — will be illegal
    const saAction: ActionDef = {
      id: asActionId('govern'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('otherPhase') as GameDef['turnStructure']['phases'][number]['id']],
      params: [],
      pre: null,
      cost: [],
      effects: [chooseOneEffect('$city', ['X'])],
      limits: [],
    };
    const def = makeBaseDef({ actions: [mainAction, saAction] });
    const state = makeBaseState();

    const move = makeMove('train', { '$province': 'A' }, {
      specialActivity: { actionId: asActionId('govern'), params: {} },
      timing: 'after',
    });
    const result = legalChoicesDiscover(def, state, move, { chainCompoundSA: true });
    // SA is illegal due to phase mismatch — tagSADecisionPath passes 'illegal' through unchanged
    assert.equal(result.kind, 'illegal');
  });

  // ---- legalChoicesEvaluate with compound ----

  it('legalChoicesEvaluate chains into SA with option legality', () => {
    const mainAction = makeAction('train', [chooseOneEffect('$province', ['A'])]);
    const saAction = makeAction('govern', [chooseOneEffect('$city', ['X', 'Y'])]);
    const def = makeBaseDef({ actions: [mainAction, saAction] });
    const state = makeBaseState();

    const saMove: Move = { actionId: asActionId('govern'), params: {} };
    const move = makeMove('train', { '$province': 'A' }, {
      specialActivity: saMove,
      timing: 'after',
    });

    const result = legalChoicesEvaluate(def, state, move);
    assert.equal(result.kind, 'pending');
    const pending = result as ChoicePendingRequest;
    assert.equal(pending.name, '$city');
    assert.equal(pending.decisionPath, 'compound.specialActivity');
    // Options should have legality evaluated
    assert.ok(pending.options.length > 0);
    for (const opt of pending.options) {
      assert.ok(opt.legality !== undefined);
    }
  });

  // ---- Main op with multiple decisions + SA ----

  it('main op with multiple effect decisions chains into SA after all resolve', () => {
    const mainAction = makeAction('train', [
      chooseOneEffect('$province', ['A', 'B']),
      chooseOneEffect('$unit', ['infantry', 'cavalry']),
    ]);
    const saAction = makeAction('govern', [chooseOneEffect('$city', ['X', 'Y'])]);
    const def = makeBaseDef({ actions: [mainAction, saAction] });
    const state = makeBaseState();

    // Only first main decision filled — second main decision should be next
    const move1 = makeMove('train', { '$province': 'A' }, {
      specialActivity: { actionId: asActionId('govern'), params: {} },
      timing: 'after',
    });
    const r1 = legalChoicesDiscover(def, state, move1, { chainCompoundSA: true });
    assert.equal(r1.kind, 'pending');
    assert.equal((r1 as ChoicePendingRequest).name, '$unit');
    assert.equal((r1 as ChoicePendingRequest).decisionPath, undefined);

    // Both main decisions filled — SA should be next
    const move2 = makeMove('train', { '$province': 'A', '$unit': 'infantry' }, {
      specialActivity: { actionId: asActionId('govern'), params: {} },
      timing: 'after',
    });
    const r2 = legalChoicesDiscover(def, state, move2, { chainCompoundSA: true });
    assert.equal(r2.kind, 'pending');
    assert.equal((r2 as ChoicePendingRequest).name, '$city');
    assert.equal((r2 as ChoicePendingRequest).decisionPath, 'compound.specialActivity');
  });

  // ---- Fully-resolved compound moves (regression for 63COMPDSACHAIN-001) ----

  it('legalChoicesEvaluate with fully-resolved compound move returns complete', () => {
    const mainAction = makeAction('train', [chooseOneEffect('$province', ['A', 'B'])]);
    const saAction = makeAction('govern', [chooseOneEffect('$city', ['X', 'Y'])]);
    const def = makeBaseDef({ actions: [mainAction, saAction] });
    const state = makeBaseState();

    const move = makeMove('train', { '$province': 'A' }, {
      specialActivity: { actionId: asActionId('govern'), params: { '$city': 'X' } },
      timing: 'after',
    });

    const result = legalChoicesEvaluate(def, state, move);
    assert.equal(result.kind, 'complete');
  });

  it('legalChoicesDiscover with fully-resolved compound move returns complete', () => {
    const mainAction = makeAction('train', [chooseOneEffect('$province', ['A', 'B'])]);
    const saAction = makeAction('govern', [chooseOneEffect('$city', ['X', 'Y'])]);
    const def = makeBaseDef({ actions: [mainAction, saAction] });
    const state = makeBaseState();

    const move = makeMove('train', { '$province': 'A' }, {
      specialActivity: { actionId: asActionId('govern'), params: { '$city': 'X' } },
      timing: 'after',
    });

    const result = legalChoicesDiscover(def, state, move);
    assert.equal(result.kind, 'complete');
  });

  it('legalChoicesEvaluate with partially-resolved compound SA returns pending with SA decision', () => {
    const mainAction = makeAction('train', [chooseOneEffect('$province', ['A', 'B'])]);
    const saAction = makeAction('govern', [
      chooseOneEffect('$city', ['X', 'Y']),
      chooseOneEffect('$level', ['low', 'high']),
    ]);
    const def = makeBaseDef({ actions: [mainAction, saAction] });
    const state = makeBaseState();

    // Main resolved, SA has first decision filled but second pending
    const move = makeMove('train', { '$province': 'A' }, {
      specialActivity: { actionId: asActionId('govern'), params: { '$city': 'X' } },
      timing: 'after',
    });

    const result = legalChoicesEvaluate(def, state, move);
    assert.equal(result.kind, 'pending');
    const pending = result as ChoicePendingRequest;
    assert.equal(pending.name, '$level');
    assert.equal(pending.decisionPath, 'compound.specialActivity');
  });

  // ---- Action param main op + SA ----

  it('action-param-based main op chains into SA after all params resolved', () => {
    const mainAction: ActionDef = {
      id: asActionId('train'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [
        { name: 'targetZone', domain: { query: 'enums', values: ['zone-a', 'zone-b'] } },
      ],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };
    const saAction = makeAction('govern', [chooseOneEffect('$city', ['X', 'Y'])]);
    const def = makeBaseDef({ actions: [mainAction, saAction] });
    const state = makeBaseState();

    // Main action param not yet resolved — should present main param
    const move1 = makeMove('train', {}, {
      specialActivity: { actionId: asActionId('govern'), params: {} },
      timing: 'after',
    });
    const r1 = legalChoicesDiscover(def, state, move1, { chainCompoundSA: true });
    assert.equal(r1.kind, 'pending');
    assert.equal((r1 as ChoicePendingRequest).name, 'targetZone');
    assert.equal((r1 as ChoicePendingRequest).decisionPath, undefined);

    // Main action param resolved — should chain into SA
    const move2 = makeMove('train', { targetZone: 'zone-a' }, {
      specialActivity: { actionId: asActionId('govern'), params: {} },
      timing: 'after',
    });
    const r2 = legalChoicesDiscover(def, state, move2, { chainCompoundSA: true });
    assert.equal(r2.kind, 'pending');
    assert.equal((r2 as ChoicePendingRequest).name, '$city');
    assert.equal((r2 as ChoicePendingRequest).decisionPath, 'compound.specialActivity');
  });

  // ---- SA with action params (not effect choices) ----

  it('SA with declared action params discovers them with decisionPath', () => {
    const mainAction = makeAction('train', [chooseOneEffect('$province', ['A'])]);
    const saAction: ActionDef = {
      id: asActionId('govern'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [
        { name: 'targetCity', domain: { query: 'enums', values: ['city-x', 'city-y'] } },
      ],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };
    const def = makeBaseDef({ actions: [mainAction, saAction] });
    const state = makeBaseState();

    const move = makeMove('train', { '$province': 'A' }, {
      specialActivity: { actionId: asActionId('govern'), params: {} },
      timing: 'after',
    });
    const result = legalChoicesDiscover(def, state, move, { chainCompoundSA: true });
    assert.equal(result.kind, 'pending');
    const pending = result as ChoicePendingRequest;
    assert.equal(pending.name, 'targetCity');
    assert.equal(pending.decisionPath, 'compound.specialActivity');
    assert.deepStrictEqual(
      pending.options.map((o) => o.value),
      ['city-x', 'city-y'],
    );
  });
});
