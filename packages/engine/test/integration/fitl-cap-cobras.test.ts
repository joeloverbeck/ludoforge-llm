import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { asActionId, asPlayerId, asTokenId, type GameDef, type GameState, type Token } from '../../src/kernel/index.js';
import type { DecisionOverrideRule } from '../helpers/decision-param-helpers.js';
import { applyMoveWithResolvedDecisionIds } from '../helpers/decision-param-helpers.js';
import { makeIsolatedInitialState } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const SWEEP_A = 'quang-tri-thua-thien:none';
const SWEEP_B = 'quang-nam:none';
const SWEEP_C = 'quang-tin-quang-ngai:none';
const ASSAULT_A = 'saigon:none';
const ASSAULT_B = 'hue:none';

const addToken = (state: GameState, zoneId: string, token: Token): GameState => ({
  ...state,
  zones: {
    ...state.zones,
    [zoneId]: [...(state.zones[zoneId] ?? []), token],
  },
});

const countTokens = (
  state: GameState,
  zoneId: string,
  predicate: (token: Token) => boolean,
): number => (state.zones[zoneId] ?? []).filter((token) => predicate(token)).length;

const makeTroop = (id: string, faction: 'US' | 'ARVN' | 'NVA'): Token => ({
  id: asTokenId(id),
  type: `${faction.toLowerCase()}-troops`,
  props: { faction, type: 'troops' },
});

const makeGuerrilla = (id: string, faction: 'NVA' | 'VC', activity: 'active' | 'underground'): Token => ({
  id: asTokenId(id),
  type: `${faction.toLowerCase()}-guerrilla`,
  props: { faction, type: 'guerrilla', activity },
});

const makeBase = (id: string, faction: 'NVA' | 'VC', tunnel: 'tunneled' | 'untunneled'): Token => ({
  id: asTokenId(id),
  type: `${faction.toLowerCase()}-base`,
  props: { faction, type: 'base', tunnel },
});

const makeSweepState = (
  def: GameDef,
  seed: number,
  options: {
    readonly actor: 'US' | 'ARVN';
    readonly cobras: 'inactive' | 'unshaded' | 'shaded';
    readonly spaces?: readonly string[];
  },
): GameState => {
  const spaces = options.spaces ?? [SWEEP_A];
  const start = makeIsolatedInitialState(def, seed, 4, { turnOrderMode: 'roundRobin' });
  const isUS = options.actor === 'US';

  let state: GameState = {
    ...start,
    activePlayer: isUS ? asPlayerId(0) : asPlayerId(1),
    globalVars: {
      ...start.globalVars,
      ...(isUS ? {} : { arvnResources: 30 }),
    },
    globalMarkers: {
      ...start.globalMarkers,
      cap_cobras: options.cobras,
      cap_boobyTraps: 'inactive',
      cap_caps: 'inactive',
    },
  };

  for (const space of spaces) {
    const suffix = space.split(':')[0];
    const actorTroop = makeTroop(`cobras-${options.actor.toLowerCase()}-troop-${suffix}-${seed}`, options.actor);
    state = addToken(state, space, actorTroop);
  }

  return state;
};

const cobrasSelectionOverride = (spaces: readonly string[]): DecisionOverrideRule => ({
  when: (request) =>
    request.type === 'chooseN' &&
    request.min === 0 &&
    request.max === 2 &&
    Array.isArray(request.options) &&
    spaces.every((space) => request.options.some((option) => option.value === space)),
  value: [...spaces],
});

describe('FITL Cobras capability integration', () => {
  it('unshaded removes 1 enemy in up to 2 selected Sweep spaces and does not affect non-selected spaces', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    let state = makeSweepState(def, 13001, {
      actor: 'US',
      cobras: 'unshaded',
      spaces: [SWEEP_A, SWEEP_B, SWEEP_C],
    });
    state = addToken(state, SWEEP_A, makeTroop('cobras-nva-t-a', 'NVA'));
    state = addToken(state, SWEEP_B, makeGuerrilla('cobras-vc-g-b', 'VC', 'active'));
    state = addToken(state, SWEEP_C, makeTroop('cobras-nva-t-c', 'NVA'));

    const result = applyMoveWithResolvedDecisionIds(
      def,
      state,
      {
        actionId: asActionId('sweep'),
        params: {
          targetSpaces: [SWEEP_A, SWEEP_B, SWEEP_C],
        },
      },
      {
        overrides: [cobrasSelectionOverride([SWEEP_A, SWEEP_B])],
      },
    ).state;

    assert.equal(
      countTokens(result, SWEEP_A, (token) => token.props.faction === 'NVA' || token.props.faction === 'VC'),
      0,
      'Selected Sweep space A should lose one enemy to Cobras',
    );
    assert.equal(
      countTokens(result, SWEEP_B, (token) => token.props.faction === 'NVA' || token.props.faction === 'VC'),
      0,
      'Selected Sweep space B should lose one enemy to Cobras',
    );
    assert.equal(
      countTokens(result, SWEEP_C, (token) => token.props.faction === 'NVA' || token.props.faction === 'VC'),
      1,
      'Non-selected Sweep space should not receive Cobras removal',
    );
  });

  it('unshaded enforces Troops-first, Bases-last and ignores underground/tunneled-only targets', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    let state = makeSweepState(def, 13002, {
      actor: 'ARVN',
      cobras: 'unshaded',
      spaces: [SWEEP_A],
    });
    state = addToken(state, SWEEP_A, makeTroop('cobras-order-nva-t', 'NVA'));
    state = addToken(state, SWEEP_A, makeBase('cobras-order-vc-base', 'VC', 'untunneled'));
    state = addToken(state, SWEEP_B, makeGuerrilla('cobras-order-vc-underground', 'VC', 'underground'));
    state = addToken(state, SWEEP_B, makeBase('cobras-order-nva-tunneled', 'NVA', 'tunneled'));

    const result = applyMoveWithResolvedDecisionIds(
      def,
      state,
      {
        actionId: asActionId('sweep'),
        params: {
          targetSpaces: [SWEEP_A, SWEEP_B],
        },
      },
      {
        overrides: [cobrasSelectionOverride([SWEEP_A, SWEEP_B])],
      },
    ).state;

    assert.equal(
      countTokens(result, SWEEP_A, (token) => token.props.faction === 'NVA' && token.type === 'nva-troops'),
      0,
      'Troops-first should remove enemy troops before any base',
    );
    assert.equal(
      countTokens(result, SWEEP_A, (token) => token.props.faction === 'VC' && token.props.type === 'base'),
      1,
      'With budget 1, untunneled base should remain when a troop is present',
    );
    assert.equal(
      countTokens(result, SWEEP_B, (token) => token.props.faction === 'VC' && token.props.type === 'guerrilla'),
      1,
      'Cobras should not remove underground guerrillas',
    );
    assert.equal(
      countTokens(result, SWEEP_B, (token) => token.props.faction === 'NVA' && token.props.type === 'base'),
      1,
      'Cobras should not remove tunneled bases',
    );
  });

  it('shaded applies only to US Assault spaces; ARVN Assault never sends US troops to Casualties', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    for (let seed = 1; seed <= 64; seed += 1) {
      let state = makeIsolatedInitialState(def, seed, 4, { turnOrderMode: 'roundRobin' });
      state = {
        ...state,
        activePlayer: asPlayerId(1),
        globalVars: {
          ...state.globalVars,
          arvnResources: 30,
          mom_bodyCount: false,
        },
        globalMarkers: {
          ...state.globalMarkers,
          cap_cobras: 'shaded',
        },
      };
      state = addToken(state, ASSAULT_A, makeTroop(`cobras-arvn-a-${seed}`, 'ARVN'));
      state = addToken(state, ASSAULT_A, makeTroop(`cobras-us-a-${seed}`, 'US'));
      state = addToken(state, ASSAULT_A, makeGuerrilla(`cobras-vc-a-${seed}`, 'VC', 'active'));

      const final = applyMoveWithResolvedDecisionIds(def, state, {
        actionId: asActionId('assault'),
        params: { targetSpaces: [ASSAULT_A] },
      }).state;

      assert.equal(
        countTokens(final, 'casualties-US:none', (token) => token.props.faction === 'US' && token.props.type === 'troops'),
        0,
        `Seed ${seed}: ARVN Assault should not trigger Cobras shaded US troop losses`,
      );
    }
  });

  it('shaded rolls per US Assault space and ARVN follow-up does not add extra Cobras casualty effect', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    let foundMixedTwoSpace = false;
    for (let seed = 1; seed <= 128; seed += 1) {
      let state = makeIsolatedInitialState(def, seed, 4, { turnOrderMode: 'roundRobin' });
      state = {
        ...state,
        activePlayer: asPlayerId(0),
        globalMarkers: {
          ...state.globalMarkers,
          cap_cobras: 'shaded',
        },
      };
      state = addToken(state, ASSAULT_A, makeTroop(`cobras-us-multi-a-${seed}`, 'US'));
      state = addToken(state, ASSAULT_A, makeGuerrilla(`cobras-vc-multi-a-${seed}`, 'VC', 'active'));
      state = addToken(state, ASSAULT_B, makeTroop(`cobras-us-multi-b-${seed}`, 'US'));
      state = addToken(state, ASSAULT_B, makeGuerrilla(`cobras-nva-multi-b-${seed}`, 'NVA', 'active'));

      const final = applyMoveWithResolvedDecisionIds(def, state, {
        actionId: asActionId('assault'),
        params: {
          targetSpaces: [ASSAULT_A, ASSAULT_B],
          $arvnFollowupSpaces: [],
        },
      }).state;
      const lossesA = countTokens(final, ASSAULT_A, (token) => token.props.faction === 'US' && token.props.type === 'troops') === 0;
      const lossesB = countTokens(final, ASSAULT_B, (token) => token.props.faction === 'US' && token.props.type === 'troops') === 0;

      if (lossesA !== lossesB) {
        foundMixedTwoSpace = true;
        break;
      }
    }
    assert.ok(foundMixedTwoSpace, 'Expected at least one seed with mixed Cobras outcomes across US Assault spaces');

    for (let seed = 1; seed <= 128; seed += 1) {
      let base = makeIsolatedInitialState(def, seed, 4, { turnOrderMode: 'roundRobin' });
      base = {
        ...base,
        activePlayer: asPlayerId(0),
        globalVars: {
          ...base.globalVars,
          arvnResources: 30,
          mom_bodyCount: false,
        },
        globalMarkers: {
          ...base.globalMarkers,
          cap_cobras: 'shaded',
        },
      };
      base = addToken(base, ASSAULT_A, makeTroop(`cobras-us-followup-1-${seed}`, 'US'));
      base = addToken(base, ASSAULT_A, makeTroop(`cobras-us-followup-2-${seed}`, 'US'));
      base = addToken(base, ASSAULT_A, makeTroop(`cobras-arvn-followup-${seed}`, 'ARVN'));
      base = addToken(base, ASSAULT_A, makeGuerrilla(`cobras-vc-followup-${seed}`, 'VC', 'active'));

      const withoutFollowup = applyMoveWithResolvedDecisionIds(def, base, {
        actionId: asActionId('assault'),
        params: {
          targetSpaces: [ASSAULT_A],
          $arvnFollowupSpaces: [],
        },
      }).state;
      const withFollowup = applyMoveWithResolvedDecisionIds(def, base, {
        actionId: asActionId('assault'),
        params: {
          targetSpaces: [ASSAULT_A],
          $arvnFollowupSpaces: [ASSAULT_A],
        },
      }).state;

      const noFollowupCasualties = countTokens(
        withoutFollowup,
        'casualties-US:none',
        (token) => token.props.faction === 'US' && token.props.type === 'troops',
      );
      const withFollowupCasualties = countTokens(
        withFollowup,
        'casualties-US:none',
        (token) => token.props.faction === 'US' && token.props.type === 'troops',
      );

      assert.equal(
        withFollowupCasualties,
        noFollowupCasualties,
        `Seed ${seed}: ARVN follow-up in US Assault space must not add extra Cobras US troop casualties`,
      );
      assert.ok(
        withFollowupCasualties <= 1,
        `Seed ${seed}: Cobras shaded should apply at most once per US Assault space`,
      );
    }
  });
});
