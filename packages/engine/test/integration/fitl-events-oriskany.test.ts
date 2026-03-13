import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  advancePhase,
  applyMove,
  asActionId,
  asPhaseId,
  asPlayerId,
  asTokenId,
  createEvalRuntimeResources,
  initialState,
  legalChoicesDiscover,
  legalMoves,
  type GameDef,
  type GameState,
  type Move,
  type Token,
} from '../../src/kernel/index.js';
import { applyMoveWithResolvedDecisionIds } from '../helpers/decision-param-helpers.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { clearAllZones } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const CARD_ID = 'card-39';
const NORTH_VIETNAM = 'north-vietnam:none';
const CENTRAL_LAOS = 'central-laos:none';

const makeToken = (
  id: string,
  type: string,
  faction: string,
  extraProps?: Readonly<Record<string, string | number | boolean>>,
): Token => ({
  id: asTokenId(id),
  type,
  props: {
    faction,
    type,
    ...(extraProps ?? {}),
  },
});

const compileDef = (): GameDef => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assert.notEqual(compiled.gameDef, null);
  return compiled.gameDef!;
};

const findOriskanyMove = (def: GameDef, state: GameState, side: 'unshaded' | 'shaded') =>
  legalMoves(def, state).find(
    (move) =>
      String(move.actionId) === 'event'
      && move.params.side === side
      && (move.params.eventCardId === undefined || move.params.eventCardId === CARD_ID),
  );

const countNvaInZone = (state: GameState, zone: string, filter: (token: Token) => boolean): number =>
  (state.zones[zone] ?? []).filter(
    (token) => token.props.faction === 'NVA' && filter(token),
  ).length;

const withCoupRound = (
  base: GameState,
  globalVars: Partial<GameState['globalVars']>,
): GameState => ({
  ...base,
  currentPhase: asPhaseId('main'),
  globalVars: {
    ...base.globalVars,
    ...globalVars,
  } as GameState['globalVars'],
  zones: {
    ...base.zones,
    'played:none': [{ id: asTokenId('played-coup'), type: 'card', props: { isCoup: true } }],
    'lookahead:none': [{ id: asTokenId('lookahead-event'), type: 'card', props: { isCoup: false } }],
    'deck:none': [{ id: asTokenId('deck-event'), type: 'card', props: { isCoup: false } }],
    [CENTRAL_LAOS]: [makeToken('coin-laos-us', 'troops', 'US')],
  },
});

const resolveResourcesWithDefaultChoice = (def: GameDef, state: GameState): GameState => {
  const move: Move = { actionId: asActionId('coupResourcesResolve'), params: {} };
  const pending = legalChoicesDiscover(def, state, move);
  if (pending.kind !== 'pending') {
    return applyMove(def, state, move).state;
  }
  const selected = pending.options.slice(0, pending.max ?? 0).map((option) => String(option.value));
  return applyMove(def, state, { actionId: asActionId('coupResourcesResolve'), params: { [pending.decisionKey]: selected } }).state;
};

const enterCoupResources = (def: GameDef, state: GameState): GameState => {
  const atVictory = advancePhase({ def, state, evalRuntimeResources: createEvalRuntimeResources() });
  assert.equal(atVictory.currentPhase, asPhaseId('coupVictory'));
  const atResources = applyMove(def, atVictory, { actionId: asActionId('coupVictoryCheck'), params: {} }).state;
  assert.equal(atResources.currentPhase, asPhaseId('coupResources'));
  return atResources;
};

describe('FITL card-39 Oriskany', () => {
  it('encodes card text and lasting effect contract for both sides', () => {
    const def = compileDef();
    const card = def.eventDecks?.[0]?.cards.find((entry) => entry.id === CARD_ID);
    assert.notEqual(card, undefined, 'Expected card-39 in production event deck');

    assert.equal(card?.unshaded?.text, 'Remove any 4 pieces from North Vietnam or, once none, Laos. Degrade Trail 2 boxes.');
    assert.equal(card?.shaded?.text, '1 Available US Troop out of play. Through next Coup, no Degrade of Trail. MOMENTUM');
    assert.equal(card?.tags?.includes('momentum'), true);
    assert.deepEqual(card?.shaded?.lastingEffects, [
      {
        id: 'mom-oriskany',
        duration: 'round',
        setupEffects: [{ setVar: { scope: 'global', var: 'mom_oriskany', value: true } }],
        teardownEffects: [{ setVar: { scope: 'global', var: 'mom_oriskany', value: false } }],
      },
    ]);
  });

  it('unshaded removes up to 4 eligible NVA pieces from North Vietnam before Laos and degrades Trail by 2', () => {
    const def = compileDef();
    const base = clearAllZones(initialState(def, 39001, 4).state);
    const setup: GameState = {
      ...base,
      activePlayer: asPlayerId(2),
      turnOrderState: { type: 'roundRobin' },
      globalVars: {
        ...base.globalVars,
        trail: 3,
      },
      zones: {
        ...base.zones,
        'played:none': [makeToken(CARD_ID, 'card', 'none')],
        [NORTH_VIETNAM]: [
          makeToken('oriskany-nv-t1', 'troops', 'NVA'),
          makeToken('oriskany-nv-t2', 'troops', 'NVA'),
          makeToken('oriskany-nv-g1', 'guerrilla', 'NVA', { activity: 'underground' }),
          makeToken('oriskany-nv-b-u', 'base', 'NVA', { tunnel: 'untunneled' }),
          makeToken('oriskany-nv-b-t', 'base', 'NVA', { tunnel: 'tunneled' }),
        ],
        [CENTRAL_LAOS]: [
          makeToken('oriskany-laos-t1', 'troops', 'NVA'),
        ],
      },
    };

    const move = findOriskanyMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined, 'Expected card-39 unshaded event move');

    const after = applyMoveWithResolvedDecisionIds(def, setup, move!).state;
    assert.equal(after.globalVars.trail, 1, 'Unshaded should degrade Trail by 2');
    assert.equal(
      (after.zones[NORTH_VIETNAM] ?? []).some((token) => token.id === asTokenId('oriskany-nv-b-t')),
      true,
      'Tunneled base should remain because it is not an eligible piece for this event',
    );
    assert.equal(
      countNvaInZone(after, NORTH_VIETNAM, (token) => token.id !== asTokenId('oriskany-nv-b-t')),
      0,
      'All 4 eligible North Vietnam pieces should be removed before considering Laos',
    );
    assert.equal(
      (after.zones[CENTRAL_LAOS] ?? []).some((token) => token.id === asTokenId('oriskany-laos-t1')),
      true,
      'Laos pieces should not be touched when North Vietnam already supplies 4 removals',
    );
  });

  it('unshaded falls back to Laos only after exhausting North Vietnam eligible pieces', () => {
    const def = compileDef();
    const base = clearAllZones(initialState(def, 39002, 4).state);
    const setup: GameState = {
      ...base,
      activePlayer: asPlayerId(2),
      turnOrderState: { type: 'roundRobin' },
      globalVars: {
        ...base.globalVars,
        trail: 4,
      },
      zones: {
        ...base.zones,
        'played:none': [makeToken(CARD_ID, 'card', 'none')],
        [NORTH_VIETNAM]: [
          makeToken('oriskany2-nv-t1', 'troops', 'NVA'),
          makeToken('oriskany2-nv-b-u', 'base', 'NVA', { tunnel: 'untunneled' }),
        ],
        [CENTRAL_LAOS]: [
          makeToken('oriskany2-laos-t1', 'troops', 'NVA'),
          makeToken('oriskany2-laos-g1', 'guerrilla', 'NVA', { activity: 'underground' }),
          makeToken('oriskany2-laos-b-u', 'base', 'NVA', { tunnel: 'untunneled' }),
          makeToken('oriskany2-laos-b-t', 'base', 'NVA', { tunnel: 'tunneled' }),
        ],
      },
    };

    const move = findOriskanyMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined, 'Expected card-39 unshaded event move');

    const beforeEligibleLaos = countNvaInZone(
      setup,
      CENTRAL_LAOS,
      (token) => token.type !== 'base' || token.props.tunnel === 'untunneled',
    );
    const after = applyMoveWithResolvedDecisionIds(def, setup, move!).state;
    const afterEligibleLaos = countNvaInZone(
      after,
      CENTRAL_LAOS,
      (token) => token.type !== 'base' || token.props.tunnel === 'untunneled',
    );

    assert.equal(after.globalVars.trail, 2, 'Unshaded should still degrade Trail by 2 from 4 to 2');
    assert.equal(
      countNvaInZone(after, NORTH_VIETNAM, (token) => token.type !== 'base' || token.props.tunnel === 'untunneled'),
      0,
      'North Vietnam eligible pieces should be fully exhausted first',
    );
    assert.equal(beforeEligibleLaos - afterEligibleLaos, 2, 'With only 2 eligible in North Vietnam, exactly 2 additional pieces should be removed from Laos');
    assert.equal(
      (after.zones[CENTRAL_LAOS] ?? []).some((token) => token.id === asTokenId('oriskany2-laos-b-t')),
      true,
      'Tunneled Laos bases should remain ineligible for removal',
    );
  });

  it('shaded moves 1 available US troop out of play (if present) and blocks Coup trail degradation while active', () => {
    const def = compileDef();
    const base = clearAllZones(initialState(def, 39003, 4).state);
    const setup: GameState = {
      ...base,
      activePlayer: asPlayerId(0),
      turnOrderState: { type: 'roundRobin' },
      zones: {
        ...base.zones,
        'played:none': [makeToken(CARD_ID, 'card', 'none')],
        'available-US:none': [
          makeToken('oriskany-us-t1', 'troops', 'US'),
          makeToken('oriskany-us-i1', 'irregular', 'US'),
        ],
      },
    };

    const move = findOriskanyMove(def, setup, 'shaded');
    assert.notEqual(move, undefined, 'Expected card-39 shaded event move');

    const afterShaded = applyMove(def, setup, move!).state;
    assert.equal(afterShaded.globalVars.mom_oriskany, true, 'Shaded should activate Oriskany momentum');
    assert.equal(
      (afterShaded.zones['out-of-play-US:none'] ?? []).some((token) => token.id === asTokenId('oriskany-us-t1')),
      true,
      'Shaded should move 1 available US troop out of play immediately',
    );
    assert.equal(
      (afterShaded.zones['available-US:none'] ?? []).some((token) => token.id === asTokenId('oriskany-us-i1')),
      true,
      'Shaded should not remove non-troop US pieces',
    );

    const withoutMomentum = withCoupRound(base, { trail: 4 });
    const withMomentum = withCoupRound(base, { trail: 4, mom_oriskany: true });
    const withoutMomentumAfterResources = resolveResourcesWithDefaultChoice(def, enterCoupResources(def, withoutMomentum));
    const withMomentumAfterResources = resolveResourcesWithDefaultChoice(def, enterCoupResources(def, withMomentum));

    assert.equal(withoutMomentumAfterResources.globalVars.trail, 3, 'Without Oriskany, Coup resources should degrade Trail from Laos/Cambodia COIN control');
    assert.equal(withMomentumAfterResources.globalVars.trail, 4, 'Oriskany should block Coup-resource Trail degradation while momentum is active');
  });
});
