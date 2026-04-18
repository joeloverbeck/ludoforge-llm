// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { asActionId, asPlayerId, asTokenId, type GameDef, type GameState, type Move, type Token } from '../../src/kernel/index.js';
import { decisionParamKeysMatching } from '../helpers/decision-key-matchers.js';
import { applyMoveWithResolvedDecisionIds, normalizeDecisionParamsForMove } from '../helpers/decision-param-helpers.js';
import { makeIsolatedInitialState } from '../helpers/isolated-state-helpers.js';
import { getFitlProductionFixture } from '../helpers/production-spec-helpers.js';

const FITL_PRODUCTION_FIXTURE = getFitlProductionFixture();

const TRAIN_A = 'saigon:none';
const TRAIN_B = 'hue:none';
const TRAIN_C = 'quang-tri-thua-thien:none';
const ARVN_SOURCE = 'can-tho:none';

const SWEEP_A = 'quang-nam:none';
const SWEEP_B = 'quang-tin-quang-ngai:none';
const SWEEP_C = 'binh-dinh:none';

const makeToken = (id: string, type: string, faction: string, extra?: Record<string, unknown>): Token => ({
  id: asTokenId(id),
  type,
  props: { faction, type, ...extra },
});

const addToken = (state: GameState, zoneId: string, token: Token): GameState => ({
  ...state,
  zones: {
    ...state.zones,
    [zoneId]: [...(state.zones[zoneId] ?? []), token],
  },
});

const countPolice = (state: GameState, zoneId: string): number =>
  (state.zones[zoneId] ?? []).filter((token) => token.props.faction === 'ARVN' && token.props.type === 'police').length;

const seedUsAvailableIrregulars = (state: GameState, seed: number, count: number): GameState => {
  let next = state;
  for (let i = 0; i < count; i += 1) {
    next = addToken(
      next,
      'available-US:none',
      makeToken(`caps-us-irr-${seed}-${i}`, 'irregular', 'US', { type: 'irregular' }),
    );
  }
  return next;
};

const baseUsTrainState = (def: GameDef, seed: number): GameState => {
  let state = makeIsolatedInitialState(def, seed, 4, { turnOrderMode: 'roundRobin' });
  state = {
    ...state,
    activePlayer: asPlayerId(0),
  };
  state = seedUsAvailableIrregulars(state, seed, 6);
  state = addToken(state, TRAIN_A, makeToken(`caps-us-t-a-${seed}`, 'troops', 'US'));
  state = addToken(state, TRAIN_B, makeToken(`caps-us-t-b-${seed}`, 'troops', 'US'));
  state = addToken(state, TRAIN_C, makeToken(`caps-us-t-c-${seed}`, 'troops', 'US'));
  return state;
};

const resolveCanonicalDecisionKey = (
  def: GameDef,
  state: GameState,
  move: Move,
  fragment: string,
): string => {
  const resolved = normalizeDecisionParamsForMove(def, state, move);
  const matches = decisionParamKeysMatching(resolved.params, { resolvedBindPattern: new RegExp(fragment, 'u') });
  assert.equal(matches.length, 1, `Expected exactly one canonical decision key for ${fragment}`);
  return matches[0]!;
};

describe('FITL Combined Action Platoons capability (card 18)', () => {
  it('unshaded grants exactly one ARVN Police placement/relocation per US Train operation', () => {
    const { compiled } = FITL_PRODUCTION_FIXTURE;
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    let state = baseUsTrainState(def, 18101);
    state = addToken(state, 'available-ARVN:none', makeToken('caps-police-avail-1', 'police', 'ARVN'));
    state = {
      ...state,
      globalMarkers: {
        ...state.globalMarkers,
        cap_caps: 'unshaded',
      },
    };

    const baseMove = {
      actionId: asActionId('train'),
      params: {
        $targetSpaces: [TRAIN_A, TRAIN_B],
        $trainChoice: 'place-irregulars',
        $subActionSpaces: [],
      },
    } as const;
    const capCapsBonusSpaceKey = resolveCanonicalDecisionKey(def, state, baseMove, 'capCapsBonusSpace');

    const result = applyMoveWithResolvedDecisionIds(def, state, {
      ...baseMove,
      params: {
        ...baseMove.params,
        [capCapsBonusSpaceKey]: TRAIN_C,
      },
    }).state;

    assert.equal(countPolice(result, TRAIN_A), 0);
    assert.equal(countPolice(result, TRAIN_B), 0);
    assert.equal(countPolice(result, TRAIN_C), 1, 'CAPs should add exactly one police in selected bonus destination');
    assert.equal(countPolice(result, 'available-ARVN:none'), 0, 'Exactly one ARVN police should be sourced from Available');
  });

  it('unshaded destination may be any US-Troops space, including a non-trained space', () => {
    const { compiled } = FITL_PRODUCTION_FIXTURE;
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    let state = baseUsTrainState(def, 18102);
    state = addToken(state, 'available-ARVN:none', makeToken('caps-police-avail-2', 'police', 'ARVN'));
    state = {
      ...state,
      globalMarkers: {
        ...state.globalMarkers,
        cap_caps: 'unshaded',
      },
    };

    const baseMove = {
      actionId: asActionId('train'),
      params: {
        $targetSpaces: [TRAIN_A],
        $trainChoice: 'place-irregulars',
        $subActionSpaces: [],
      },
    } as const;
    const capCapsBonusSpaceKey = resolveCanonicalDecisionKey(def, state, baseMove, 'capCapsBonusSpace');

    const result = applyMoveWithResolvedDecisionIds(def, state, {
      ...baseMove,
      params: {
        ...baseMove.params,
        [capCapsBonusSpaceKey]: TRAIN_C,
      },
    }).state;

    assert.equal(countPolice(result, TRAIN_A), 0, 'Train target space should not auto-receive CAPs police');
    assert.equal(countPolice(result, TRAIN_C), 1, 'Non-trained US-Troops space should be legal CAPs destination');
  });

  it('unshaded relocates from map when no ARVN police are Available', () => {
    const { compiled } = FITL_PRODUCTION_FIXTURE;
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    let state = baseUsTrainState(def, 18103);
    state = addToken(state, ARVN_SOURCE, makeToken('caps-police-map-src', 'police', 'ARVN'));
    state = {
      ...state,
      globalMarkers: {
        ...state.globalMarkers,
        cap_caps: 'unshaded',
      },
    };

    const baseMove = {
      actionId: asActionId('train'),
      params: {
        $targetSpaces: [TRAIN_A],
        $trainChoice: 'place-irregulars',
        $subActionSpaces: [],
      },
    } as const;
    const capCapsBonusSpaceKey = resolveCanonicalDecisionKey(def, state, baseMove, 'capCapsBonusSpace');
    const capCapsRelocateSourcesKey = resolveCanonicalDecisionKey(def, state, {
      ...baseMove,
      params: {
        ...baseMove.params,
        [capCapsBonusSpaceKey]: TRAIN_C,
      },
    }, 'capCapsRelocateSources');

    const result = applyMoveWithResolvedDecisionIds(def, state, {
      ...baseMove,
      params: {
        ...baseMove.params,
        [capCapsBonusSpaceKey]: TRAIN_C,
        [capCapsRelocateSourcesKey]: [ARVN_SOURCE],
      },
    }).state;

    assert.equal(countPolice(result, ARVN_SOURCE), 0, 'Relocation source should lose one ARVN police');
    assert.equal(countPolice(result, TRAIN_C), 1, 'CAPs destination should gain one relocated ARVN police');
  });

  it('unshaded does nothing when no space has US Troops (US Train with base-only presence)', () => {
    const { compiled } = FITL_PRODUCTION_FIXTURE;
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    let state = makeIsolatedInitialState(def, 18104, 4, { turnOrderMode: 'roundRobin' });
    state = {
      ...state,
      activePlayer: asPlayerId(0),
      globalMarkers: {
        ...state.globalMarkers,
        cap_caps: 'unshaded',
      },
    };
    state = addToken(state, 'available-US:none', makeToken('caps-us-irr-base-only', 'irregular', 'US', { type: 'irregular' }));
    state = addToken(state, 'available-ARVN:none', makeToken('caps-police-avail-3', 'police', 'ARVN'));
    state = addToken(state, TRAIN_A, makeToken('caps-us-base-only', 'base', 'US', { type: 'base' }));

    const result = applyMoveWithResolvedDecisionIds(def, state, {
      actionId: asActionId('train'),
      params: {
        $targetSpaces: [TRAIN_A],
        $trainChoice: 'place-irregulars',
        $subActionSpaces: [],
      },
    }).state;

    assert.equal(countPolice(result, 'available-ARVN:none'), 1, 'No CAPs bonus should resolve without any US-Troops destination');
    assert.equal(countPolice(result, TRAIN_A), 0, 'Base-only Train spaces should not qualify as CAPs destination');
  });

  it('unshaded does not modify ARVN Train resolution', () => {
    const { compiled } = FITL_PRODUCTION_FIXTURE;
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    let state = makeIsolatedInitialState(def, 18105, 4, { turnOrderMode: 'roundRobin' });
    state = {
      ...state,
      activePlayer: asPlayerId(1),
      globalMarkers: {
        ...state.globalMarkers,
        cap_caps: 'unshaded',
      },
      globalVars: {
        ...state.globalVars,
        arvnResources: 10,
      },
    };
    state = addToken(state, TRAIN_A, makeToken('caps-arvn-train-t', 'troops', 'ARVN'));
    state = addToken(state, TRAIN_B, makeToken('caps-us-for-eligibility', 'troops', 'US'));
    state = addToken(state, 'available-ARVN:none', makeToken('caps-police-avail-4', 'police', 'ARVN'));
    state = addToken(state, 'available-ARVN:none', makeToken('caps-ranger-avail', 'ranger', 'ARVN', { type: 'ranger' }));

    const result = applyMoveWithResolvedDecisionIds(def, state, {
      actionId: asActionId('train'),
      params: {
        $targetSpaces: [TRAIN_A],
        $trainChoice: 'rangers',
        $subActionSpaces: [],
      },
    }).state;

    assert.equal(
      countPolice(result, 'available-ARVN:none'),
      1,
      'ARVN Train should not consume CAPs police bonus even when CAPs marker is unshaded',
    );
  });

  it('shaded caps US Sweep selection to at most 2 spaces', () => {
    const { compiled } = FITL_PRODUCTION_FIXTURE;
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const makeSweepState = (caps: 'inactive' | 'shaded'): GameState => {
      const state = makeIsolatedInitialState(def, caps === 'shaded' ? 18106 : 18107, 4, { turnOrderMode: 'roundRobin' });
      return {
        ...state,
        activePlayer: asPlayerId(0),
        globalMarkers: {
          ...state.globalMarkers,
          cap_caps: caps,
        },
      };
    };

    assert.throws(
      () =>
        applyMoveWithResolvedDecisionIds(def, makeSweepState('shaded'), {
          actionId: asActionId('sweep'),
          params: {
            $targetSpaces: [SWEEP_A, SWEEP_B, SWEEP_C],
          },
        }),
      /choiceRuntimeValidationFailed|cardinality mismatch/,
      'CAPs shaded should reject selecting more than 2 Sweep spaces',
    );

    assert.doesNotThrow(() =>
      applyMoveWithResolvedDecisionIds(def, makeSweepState('inactive'), {
        actionId: asActionId('sweep'),
        params: {
          $targetSpaces: [SWEEP_A, SWEEP_B, SWEEP_C],
        },
      }));
  });
});
