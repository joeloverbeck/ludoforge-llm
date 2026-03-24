import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  enumerateLegalMoves,
  legalChoicesEvaluate,
  type ActionDef,
  type EventCardDef,
  type GameDef,
  type GameState,
  type Move,
} from '../../src/kernel/index.js';

const eventAction: ActionDef = {
  id: asActionId('event'),
  actor: 'active',
  executor: 'actor',
  phase: [asPhaseId('main')],
  params: [],
  pre: null,
  cost: [],
  effects: [],
  limits: [],
  capabilities: ['cardEvent'],
} as unknown as ActionDef;

const dualUseCard: EventCardDef = {
  id: 'card-dual',
  title: 'Dual Use Test Card',
  sideMode: 'dual',
  unshaded: { effects: [{ addVar: { scope: 'global', var: 'x', delta: 1 } }] },
  shaded: { effects: [{ addVar: { scope: 'global', var: 'x', delta: -1 } }] },
};

const singleCard: EventCardDef = {
  id: 'card-single',
  title: 'Single Test Card',
  sideMode: 'single',
  unshaded: { effects: [{ addVar: { scope: 'global', var: 'x', delta: 1 } }] },
};

const branchedDualCard: EventCardDef = {
  id: 'card-branched',
  title: 'Branched Dual Card',
  sideMode: 'dual',
  unshaded: {
    effects: [],
    branches: [
      { id: 'branch-a', effects: [{ addVar: { scope: 'global', var: 'x', delta: 1 } }] },
      { id: 'branch-b', effects: [{ addVar: { scope: 'global', var: 'x', delta: 2 } }] },
    ],
  },
  shaded: { effects: [{ addVar: { scope: 'global', var: 'x', delta: -1 } }] },
};

const makeDef = (card: EventCardDef): GameDef =>
  ({
    metadata: { id: 'event-side-choice-test', players: { min: 2, max: 2 } },
    seats: [{ id: '0' }, { id: '1' }],
    constants: {},
    globalVars: [{ name: 'x', type: 'int', initial: 0, min: -100, max: 100 }],
    perPlayerVars: [],
    zones: [
      { id: asZoneId('draw:none'), owner: 'none', visibility: 'hidden', ordering: 'stack' },
      { id: asZoneId('discard:none'), owner: 'none', visibility: 'public', ordering: 'stack' },
    ],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [eventAction],
    actionPipelines: undefined,
    triggers: [],
    terminal: { conditions: [] },
    eventDecks: [
      {
        id: 'deck',
        drawZone: 'draw:none',
        discardZone: 'discard:none',
        cards: [card],
      },
    ],
  }) as unknown as GameDef;

const makeState = (cardId: string): GameState => ({
  globalVars: { x: 0 },
  perPlayerVars: {},
  zoneVars: {},
  markers: {},
  playerCount: 2,
  zones: {
    'draw:none': [],
    'discard:none': [{ id: asTokenId(cardId), type: 'card', props: {} }],
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
});

const makeMove = (params: Move['params'] = {}): Move => ({
  actionId: asActionId('event'),
  params,
});

describe('event card side choice flow (integration)', () => {
  it('legalChoicesEvaluate returns pending side choice for dual-use card with empty params', () => {
    const def = makeDef(dualUseCard);
    const state = makeState('card-dual');
    const result = legalChoicesEvaluate(def, state, makeMove());
    assert.equal(result.kind, 'pending');
    assert.equal((result as { type: string }).type, 'chooseOne');
    assert.equal((result as { decisionKey: string }).decisionKey, 'side');
    const options = (result as { options: readonly { value: unknown }[] }).options;
    assert.equal(options.length, 2);
    assert.deepEqual(options.map((o) => o.value), ['unshaded', 'shaded']);
  });

  it('legalChoicesEvaluate returns complete when side is provided on dual-use card', () => {
    const def = makeDef(dualUseCard);
    const state = makeState('card-dual');
    const result = legalChoicesEvaluate(def, state, makeMove({ side: 'shaded' }));
    assert.equal(result.kind, 'complete');
  });

  it('legalChoicesEvaluate returns complete for single-side card with empty params', () => {
    const def = makeDef(singleCard);
    const state = makeState('card-single');
    const result = legalChoicesEvaluate(def, state, makeMove());
    assert.equal(result.kind, 'complete');
  });

  it('legalChoicesEvaluate returns pending branch choice when side resolved and multi-branch', () => {
    const def = makeDef(branchedDualCard);
    const state = makeState('card-branched');
    const result = legalChoicesEvaluate(def, state, makeMove({ side: 'unshaded' }));
    assert.equal(result.kind, 'pending');
    assert.equal((result as { decisionKey: string }).decisionKey, 'branch');
    const options = (result as { options: readonly { value: unknown }[] }).options;
    assert.deepEqual(options.map((o) => o.value), ['branch-a', 'branch-b']);
  });

  it('legalChoicesEvaluate returns complete when side and branch are both provided', () => {
    const def = makeDef(branchedDualCard);
    const state = makeState('card-branched');
    const result = legalChoicesEvaluate(def, state, makeMove({ side: 'unshaded', branch: 'branch-a' }));
    assert.equal(result.kind, 'complete');
  });

  it('legalMoves still returns pre-filled moves for agents (both sides)', () => {
    const def = makeDef(dualUseCard);
    const state = makeState('card-dual');
    const result = enumerateLegalMoves(def, state);
    const eventMoves = result.moves.filter(({ move }) => move.actionId === asActionId('event'));
    assert.equal(eventMoves.length, 2, 'should enumerate both sides as separate moves');
    const sides = eventMoves.map(({ move }) => move.params.side);
    assert.ok(sides.includes('unshaded'), 'should include unshaded');
    assert.ok(sides.includes('shaded'), 'should include shaded');
  });

  it('dual-use card without side param is pending, not auto-resolved to unshaded', () => {
    const def = makeDef(dualUseCard);
    const state = makeState('card-dual');
    const result = legalChoicesEvaluate(def, state, makeMove());
    assert.equal(result.kind, 'pending', 'dual-use card without side must be pending');
  });
});
