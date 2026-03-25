import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  resolveEventCardPendingChoice,
  asActionId,
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  type EventCardDef,
  type GameDef,
  type GameState,
  type Move,
} from '../../../src/kernel/index.js';
import { eff } from '../../helpers/effect-tag-helper.js';

const makeBaseDef = (card: EventCardDef): GameDef =>
  ({
    metadata: { id: 'event-param-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [
      { id: asZoneId('draw:none'), owner: 'none', visibility: 'hidden', ordering: 'stack' },
      { id: asZoneId('discard:none'), owner: 'none', visibility: 'public', ordering: 'stack' },
    ],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [],
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

const makeBaseState = (cardId: string): GameState => ({
  globalVars: {},
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

const dualUseCard: EventCardDef = {
  id: 'card-dual',
  title: 'Dual Use Card',
  sideMode: 'dual',
  unshaded: { effects: [eff({ addVar: { scope: 'global', var: 'x', delta: 1 } })] },
  shaded: { effects: [eff({ addVar: { scope: 'global', var: 'x', delta: -1 } })] },
};

const singleUnshadedCard: EventCardDef = {
  id: 'card-single-u',
  title: 'Single Unshaded',
  sideMode: 'single',
  unshaded: { effects: [eff({ addVar: { scope: 'global', var: 'x', delta: 1 } })] },
};

const singleShadedCard: EventCardDef = {
  id: 'card-single-s',
  title: 'Single Shaded',
  sideMode: 'single',
  shaded: { effects: [eff({ addVar: { scope: 'global', var: 'x', delta: -1 } })] },
};

const dualUseBranchedCard: EventCardDef = {
  id: 'card-branched',
  title: 'Dual Branched',
  sideMode: 'dual',
  unshaded: {
    effects: [],
    branches: [
      { id: 'branch-a', effects: [eff({ addVar: { scope: 'global', var: 'x', delta: 1 } })] },
      { id: 'branch-b', effects: [eff({ addVar: { scope: 'global', var: 'x', delta: 2 } })] },
    ],
  },
  shaded: { effects: [eff({ addVar: { scope: 'global', var: 'x', delta: -1 } })] },
};

const dualUseSingleBranchCard: EventCardDef = {
  id: 'card-single-branch',
  title: 'Single Branch Side',
  sideMode: 'dual',
  unshaded: {
    effects: [],
    branches: [
      { id: 'only-branch', effects: [eff({ addVar: { scope: 'global', var: 'x', delta: 1 } })] },
    ],
  },
  shaded: { effects: [eff({ addVar: { scope: 'global', var: 'x', delta: -1 } })] },
};

const makeMove = (params: Move['params'] = {}): Move => ({
  actionId: asActionId('event'),
  params,
});

describe('resolveEventCardPendingChoice', () => {
  it('returns null when no current event card in state', () => {
    const def = makeBaseDef(dualUseCard);
    const state: GameState = {
      ...makeBaseState('card-dual'),
      zones: { 'draw:none': [], 'discard:none': [] },
    };
    const result = resolveEventCardPendingChoice(def, state, makeMove());
    assert.equal(result, null);
  });

  it('returns pending chooseOne for side when card is dual-use and side is missing', () => {
    const def = makeBaseDef(dualUseCard);
    const state = makeBaseState('card-dual');
    const result = resolveEventCardPendingChoice(def, state, makeMove());
    assert.notEqual(result, null);
    assert.equal(result!.kind, 'pending');
    assert.equal(result!.type, 'chooseOne');
    assert.equal(result!.decisionKey, 'side');
    assert.equal(result!.name, 'side');
    assert.equal(result!.options.length, 2);
    const values = result!.options.map((o: { readonly value: unknown }) => o.value);
    assert.deepEqual(values, ['unshaded', 'shaded']);
  });

  it('returns null when card is single-side (sideMode single, only unshaded)', () => {
    const def = makeBaseDef(singleUnshadedCard);
    const state = makeBaseState('card-single-u');
    const result = resolveEventCardPendingChoice(def, state, makeMove());
    assert.equal(result, null);
  });

  it('returns null when card is single-side (sideMode single, only shaded)', () => {
    const def = makeBaseDef(singleShadedCard);
    const state = makeBaseState('card-single-s');
    const result = resolveEventCardPendingChoice(def, state, makeMove());
    assert.equal(result, null);
  });

  it('returns null when side is already in move.params', () => {
    const def = makeBaseDef(dualUseCard);
    const state = makeBaseState('card-dual');
    const result = resolveEventCardPendingChoice(def, state, makeMove({ side: 'shaded' }));
    assert.equal(result, null);
  });

  it('returns pending chooseOne for branch when side is resolved and multiple branches exist', () => {
    const def = makeBaseDef(dualUseBranchedCard);
    const state = makeBaseState('card-branched');
    const result = resolveEventCardPendingChoice(
      def, state, makeMove({ side: 'unshaded' }),
    );
    assert.notEqual(result, null);
    assert.equal(result!.kind, 'pending');
    assert.equal(result!.type, 'chooseOne');
    assert.equal(result!.decisionKey, 'branch');
    assert.equal(result!.name, 'branch');
    assert.equal(result!.options.length, 2);
    const values = result!.options.map((o: { readonly value: unknown }) => o.value);
    assert.deepEqual(values, ['branch-a', 'branch-b']);
  });

  it('returns null when side is resolved and chosen side has 0 branches', () => {
    const def = makeBaseDef(dualUseBranchedCard);
    const state = makeBaseState('card-branched');
    const result = resolveEventCardPendingChoice(
      def, state, makeMove({ side: 'shaded' }),
    );
    assert.equal(result, null);
  });

  it('returns null when side is resolved and chosen side has exactly 1 branch', () => {
    const def = makeBaseDef(dualUseSingleBranchCard);
    const state = makeBaseState('card-single-branch');
    const result = resolveEventCardPendingChoice(
      def, state, makeMove({ side: 'unshaded' }),
    );
    assert.equal(result, null);
  });

  it('returns null when both side and branch are already in params', () => {
    const def = makeBaseDef(dualUseBranchedCard);
    const state = makeBaseState('card-branched');
    const result = resolveEventCardPendingChoice(
      def, state, makeMove({ side: 'unshaded', branch: 'branch-a' }),
    );
    assert.equal(result, null);
  });

  it('sets decisionPlayer to activePlayer', () => {
    const def = makeBaseDef(dualUseCard);
    const state = makeBaseState('card-dual');
    const result = resolveEventCardPendingChoice(def, state, makeMove());
    assert.equal(result!.decisionPlayer, state.activePlayer);
  });
});
