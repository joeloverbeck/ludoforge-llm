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
  type ConditionAST,
  type EffectAST,
  type GameDef,
  type GameState,
  type Move,
} from '../../../src/kernel/index.js';
import { asTaggedGameDef } from '../../helpers/gamedef-fixtures.js';

const makeBaseDef = (overrides?: {
  actions?: readonly ActionDef[];
  globalVars?: GameDef['globalVars'];
  tokenTypes?: GameDef['tokenTypes'];
  zones?: GameDef['zones'];
}): GameDef =>
  asTaggedGameDef({
    metadata: { id: 'illegal-path-test', players: { min: 2, max: 2 } },
    seats: [{ id: '0' }, { id: '1' }],
    constants: {},
    globalVars: overrides?.globalVars ?? [],
    perPlayerVars: [],
    zones: overrides?.zones ?? [
      { id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set' },
      { id: asZoneId('hand:0'), owner: 'player', visibility: 'owner', ordering: 'stack' },
    ],
    tokenTypes: overrides?.tokenTypes ?? [],
    setup: [],
    turnStructure: {
      phases: [{ id: asPhaseId('main') }],
    },
    actions: overrides?.actions ?? [],
    actionPipelines: undefined,
    triggers: [],
    terminal: { conditions: [] },
  });

const makeBaseState = (overrides?: Partial<GameState>): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  zoneVars: {},
  playerCount: 2,
  zones: {
    'board:none': [],
    'hand:0': [],
  },
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
  reveals: undefined,
  globalMarkers: undefined,
  activeLastingEffects: undefined,
  interruptPhaseStack: undefined,
  ...overrides,
});

const makeMove = (actionId: string, params: Record<string, unknown> = {}): Move => ({
  actionId: asActionId(actionId),
  params: params as Move['params'],
});

describe('legalChoicesDiscover() — illegal path edge cases', () => {
  it('returns illegal with emptyDomain when action param has empty enum domain', () => {
    const action: ActionDef = {
      id: asActionId('emptyEnumAction'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [
        { name: 'target', domain: { query: 'enums', values: [] } },
      ],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const def = makeBaseDef({ actions: [action] });
    const state = makeBaseState();

    const result = legalChoicesDiscover(def, state, makeMove('emptyEnumAction'));
    assert.equal(result.kind, 'illegal');
    assert.equal(result.complete, false);
    if (result.kind === 'illegal') {
      assert.equal(result.reason, 'emptyDomain');
    }
  });

  it('returns illegal with emptyDomain when chooseOne queries an empty zone', () => {
    const action: ActionDef = {
      id: asActionId('pickFromEmpty'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [
        {
          chooseOne: {
            internalDecisionId: 'decision:$token',
            bind: '$token',
            options: { query: 'tokensInZone', zone: 'board:none' },
          },
        } as EffectAST,
      ],
      limits: [],
    };

    const def = makeBaseDef({ actions: [action] });
    const state = makeBaseState({ zones: { 'board:none': [], 'hand:0': [] } });

    const result = legalChoicesDiscover(def, state, makeMove('pickFromEmpty'));
    assert.equal(result.kind, 'illegal');
    if (result.kind === 'illegal') {
      assert.equal(result.reason, 'emptyDomain');
    }
  });

  it('returns illegal with emptyDomain when chooseN has min > 0 and empty domain', () => {
    const action: ActionDef = {
      id: asActionId('selectFromEmpty'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [
        {
          chooseN: {
            internalDecisionId: 'decision:$targets',
            bind: '$targets',
            options: { query: 'tokensInZone', zone: 'board:none' },
            min: 1,
            max: 3,
          },
        } as EffectAST,
      ],
      limits: [],
    };

    const def = makeBaseDef({ actions: [action] });
    const state = makeBaseState({ zones: { 'board:none': [], 'hand:0': [] } });

    const result = legalChoicesDiscover(def, state, makeMove('selectFromEmpty'));
    assert.equal(result.kind, 'illegal');
    if (result.kind === 'illegal') {
      assert.equal(result.reason, 'emptyDomain');
    }
  });

  it('illegal result reason string is descriptive (non-empty)', () => {
    const action: ActionDef = {
      id: asActionId('emptyDomainReason'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [
        { name: 'pick', domain: { query: 'enums', values: [] } },
      ],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const def = makeBaseDef({ actions: [action] });
    const state = makeBaseState();

    const result = legalChoicesDiscover(def, state, makeMove('emptyDomainReason'));
    assert.equal(result.kind, 'illegal');
    if (result.kind === 'illegal') {
      assert.equal(typeof result.reason, 'string');
      assert.ok(result.reason.length > 0, 'reason should be a non-empty string');
    }
  });

  it('chooseN with min = 0 and empty domain remains pending (canConfirm is valid)', () => {
    const action: ActionDef = {
      id: asActionId('optionalFromEmpty'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [
        {
          chooseN: {
            internalDecisionId: 'decision:$targets',
            bind: '$targets',
            options: { query: 'tokensInZone', zone: 'board:none' },
            min: 0,
            max: 3,
          },
        } as EffectAST,
      ],
      limits: [],
    };

    const def = makeBaseDef({ actions: [action] });
    const state = makeBaseState({ zones: { 'board:none': [], 'hand:0': [] } });

    const result = legalChoicesDiscover(def, state, makeMove('optionalFromEmpty'));
    assert.equal(result.kind, 'pending');
    if (result.kind === 'pending') {
      assert.equal(result.type, 'chooseN');
      assert.deepStrictEqual(result.options.map((o) => o.value), []);
      assert.equal(result.canConfirm, true);
    }
  });

  it('legalChoicesEvaluate also returns illegal for empty domain', () => {
    const action: ActionDef = {
      id: asActionId('emptyEval'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [
        { name: 'target', domain: { query: 'enums', values: [] } },
      ],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const def = makeBaseDef({ actions: [action] });
    const state = makeBaseState();

    const result = legalChoicesEvaluate(def, state, makeMove('emptyEval'));
    assert.equal(result.kind, 'illegal');
    if (result.kind === 'illegal') {
      assert.equal(result.reason, 'emptyDomain');
    }
  });
});

// ---------------------------------------------------------------------------
// action.pre precondition enforcement in legalChoices
// ---------------------------------------------------------------------------

describe('legalChoicesDiscover() — action.pre precondition enforcement', () => {
  // Action with two params and a precondition that checks param2 != 'blocked'
  const preCond: ConditionAST = {
    op: '!=',
    left: { _t: 2, ref: 'binding', name: 'mode' },
    right: 'blocked',
  };

  const makePreAction = (pre: ConditionAST | null): ActionDef => ({
    id: asActionId('preAction'),
    actor: 'active',
    executor: 'actor',
    phase: [asPhaseId('main')],
    params: [
      { name: 'target', domain: { query: 'enums', values: ['a', 'b'] } },
      { name: 'mode', domain: { query: 'enums', values: ['allowed', 'blocked'] } },
    ],
    pre,
    cost: [],
    effects: [],
    limits: [],
  });

  it('returns illegal when all params resolved and action.pre fails', () => {
    const action = makePreAction(preCond);
    const def = makeBaseDef({ actions: [action] });
    const state = makeBaseState();

    const move = makeMove('preAction', { target: 'a', mode: 'blocked' });
    const result = legalChoicesDiscover(def, state, move);
    assert.equal(result.kind, 'illegal');
    if (result.kind === 'illegal') {
      assert.equal(result.reason, 'actionPreconditionFailed');
    }
  });

  it('returns complete when all params resolved and action.pre passes', () => {
    const action = makePreAction(preCond);
    const def = makeBaseDef({ actions: [action] });
    const state = makeBaseState();

    const move = makeMove('preAction', { target: 'a', mode: 'allowed' });
    const result = legalChoicesDiscover(def, state, move);
    assert.equal(result.kind, 'complete');
  });

  it('returns pending (not illegal) when params are still partial', () => {
    const action = makePreAction(preCond);
    const def = makeBaseDef({ actions: [action] });
    const state = makeBaseState();

    const move = makeMove('preAction', { target: 'a' });
    const result = legalChoicesDiscover(def, state, move);
    assert.equal(result.kind, 'pending');
  });

  it('marks failing option as illegal in probe-based evaluation', () => {
    const action = makePreAction(preCond);
    const def = makeBaseDef({ actions: [action] });
    const state = makeBaseState();

    // Partial move with first param only — probe second param options
    const move = makeMove('preAction', { target: 'a' });
    const result = legalChoicesEvaluate(def, state, move);
    assert.equal(result.kind, 'pending');
    if (result.kind === 'pending') {
      const allowedOpt = result.options.find((o) => o.value === 'allowed');
      const blockedOpt = result.options.find((o) => o.value === 'blocked');
      assert.ok(allowedOpt, 'allowed option should exist');
      assert.ok(blockedOpt, 'blocked option should exist');
      assert.equal(allowedOpt!.legality, 'legal');
      assert.equal(blockedOpt!.legality, 'illegal');
    }
  });

  it('returns complete when action has no precondition (pre: null)', () => {
    const action = makePreAction(null);
    const def = makeBaseDef({ actions: [action] });
    const state = makeBaseState();

    const move = makeMove('preAction', { target: 'a', mode: 'blocked' });
    const result = legalChoicesDiscover(def, state, move);
    assert.equal(result.kind, 'complete');
  });
});
