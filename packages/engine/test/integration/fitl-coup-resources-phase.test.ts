import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  advancePhase,
  applyMove,
  asActionId,
  asPhaseId,
  asTokenId,
  initialState,
  legalChoicesDiscover,
  type GameDef,
  type GameState,
  type Move,
  type Token,
} from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const compileProductionDef = (): GameDef => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assert.equal(compiled.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
  assert.notEqual(compiled.gameDef, null);
  return structuredClone(compiled.gameDef!);
};

const withClearedZones = (state: GameState): GameState => ({
  ...state,
  zones: Object.fromEntries(Object.keys(state.zones).map((zoneId) => [zoneId, []])),
});

const piece = (id: string, faction: string, pieceType: string): Token => ({
  id: asTokenId(id),
  type: 'piece',
  props: { faction, type: pieceType },
});

const card = (id: string, isCoup: boolean): Token => ({
  id: asTokenId(id),
  type: 'card',
  props: { isCoup },
});

const withCoupRound = (
  base: GameState,
  overrides?: {
    readonly globalVars?: Partial<GameState['globalVars']>;
    readonly zones?: Partial<GameState['zones']>;
    readonly markers?: Partial<GameState['markers']>;
  },
): GameState => {
  const globalVars = overrides?.globalVars === undefined
    ? base.globalVars
    : ({ ...base.globalVars, ...overrides.globalVars } as GameState['globalVars']);
  const zones = {
    ...base.zones,
    'played:none': [card('played-coup', true)],
    'lookahead:none': [card('lookahead-event', false)],
    'deck:none': [card('deck-event', false)],
    ...(overrides?.zones ?? {}),
  };
  const markers = overrides?.markers === undefined
    ? base.markers
    : ({ ...base.markers, ...overrides.markers } as GameState['markers']);

  return {
    ...base,
    currentPhase: asPhaseId('main'),
    globalVars,
    zones,
    markers,
  };
};

const enterCoupResources = (def: GameDef, state: GameState): GameState => {
  const atVictory = advancePhase(def, state);
  assert.equal(atVictory.currentPhase, asPhaseId('coupVictory'));
  const afterVictory = applyMove(def, atVictory, { actionId: asActionId('coupVictoryCheck'), params: {} }).state;
  assert.equal(afterVictory.currentPhase, asPhaseId('coupResources'));
  return afterVictory;
};

const resolveResources = (def: GameDef, state: GameState, params: Move['params'] = {}): GameState =>
  applyMove(def, state, { actionId: asActionId('coupResourcesResolve'), params }).state;

const pickPendingChoice = (decisionId: string, selected: readonly string[]): Move['params'] => {
  return {
    [decisionId]: selected,
  };
};

const resolveResourcesWithDefaultChoice = (def: GameDef, state: GameState): GameState => {
  const move: Move = { actionId: asActionId('coupResourcesResolve'), params: {} };
  const pending = legalChoicesDiscover(def, state, move);
  if (pending.kind !== 'pending') {
    return resolveResources(def, state);
  }
  const selected = pending.options.slice(0, pending.max ?? 0).map((option) => String(option.value));
  return resolveResources(def, state, pickPendingChoice(pending.decisionId, selected));
};

describe('FITL coup resources phase (production data)', () => {
  it('requires VC choice when eligible LoCs exceed remaining sabotage markers and applies only chosen spaces', () => {
    const def = compileProductionDef();
    const base = withClearedZones(initialState(def, 8601, 4).state);
    const state = withCoupRound(base, {
      globalVars: {
        ...base.globalVars,
        terrorSabotageMarkersPlaced: 14,
        trail: 2,
      },
      zones: {
        'loc-hue-khe-sanh:none': [
          piece('nva-g-1', 'NVA', 'guerrilla'),
          piece('vc-g-1', 'VC', 'guerrilla'),
          piece('us-t-1', 'US', 'troops'),
        ],
        'da-nang:none': [piece('vc-g-2', 'VC', 'guerrilla')],
      },
      markers: {
        ...base.markers,
        'loc-hue-khe-sanh:none': { ...(base.markers['loc-hue-khe-sanh:none'] ?? {}), sabotage: 'none' },
        'loc-hue-da-nang:none': { ...(base.markers['loc-hue-da-nang:none'] ?? {}), sabotage: 'none' },
      },
    });

    const atResources = enterCoupResources(def, state);
    const move: Move = { actionId: asActionId('coupResourcesResolve'), params: {} };
    const pending = legalChoicesDiscover(def, atResources, move);
    assert.equal(pending.kind, 'pending');
    assert.equal(pending.type, 'chooseN');
    assert.equal(pending.min, 1);
    assert.equal(pending.max, 1);

    const options = pending.options.map((option) => String(option.value));
    assert.equal(options.includes('loc-hue-khe-sanh:none'), true);
    assert.equal(options.includes('loc-hue-da-nang:none'), true);

    const selected = ['loc-hue-da-nang:none'];
    const next = resolveResources(def, atResources, pickPendingChoice(pending.decisionId, selected));

    assert.equal(next.globalVars.terrorSabotageMarkersPlaced, 15);
    assert.equal(next.markers['loc-hue-da-nang:none']?.sabotage, 'sabotage');
    assert.equal(next.markers['loc-hue-khe-sanh:none']?.sabotage, 'none');
    assert.equal(next.currentPhase, asPhaseId('coupSupport'));
  });

  it('auto-sabotages all eligible LoCs without a choice when markers are sufficient', () => {
    const def = compileProductionDef();
    const base = withClearedZones(initialState(def, 8611, 4).state);
    const locIds = def.zones
      .filter((zone) => zone.category === 'loc')
      .map((zone) => String(zone.id));
    const preSabotagedLocMarkers = Object.fromEntries(
      locIds.map((locId) => [locId, { ...(base.markers[locId] ?? {}), sabotage: 'sabotage' }]),
    );
    const state = withCoupRound(base, {
      globalVars: {
        ...base.globalVars,
        terrorSabotageMarkersPlaced: 13,
        trail: 2,
      },
      zones: {
        'loc-hue-khe-sanh:none': [
          piece('nva-g-1', 'NVA', 'guerrilla'),
          piece('vc-g-1', 'VC', 'guerrilla'),
          piece('us-t-1', 'US', 'troops'),
        ],
        'da-nang:none': [piece('vc-g-2', 'VC', 'guerrilla')],
      },
      markers: {
        ...base.markers,
        ...preSabotagedLocMarkers,
        'loc-hue-khe-sanh:none': { ...(base.markers['loc-hue-khe-sanh:none'] ?? {}), sabotage: 'none' },
        'loc-hue-da-nang:none': { ...(base.markers['loc-hue-da-nang:none'] ?? {}), sabotage: 'none' },
      },
    });

    const atResources = enterCoupResources(def, state);
    const pending = legalChoicesDiscover(def, atResources, { actionId: asActionId('coupResourcesResolve'), params: {} });
    assert.equal(pending.kind, 'complete');

    const next = resolveResources(def, atResources);
    assert.equal(next.globalVars.terrorSabotageMarkersPlaced, 15);
    assert.equal(next.markers['loc-hue-khe-sanh:none']?.sabotage, 'sabotage');
    assert.equal(next.markers['loc-hue-da-nang:none']?.sabotage, 'sabotage');
  });

  it('degrades trail when a Laos/Cambodia space is COIN-controlled and no-ops otherwise', () => {
    const def = compileProductionDef();
    const base = withClearedZones(initialState(def, 8602, 4).state);

    const coinControlled = withCoupRound(base, {
      globalVars: { ...base.globalVars, trail: 3 },
      zones: {
        'central-laos:none': [piece('us-t-1', 'US', 'troops')],
      },
    });
    const afterDegrade = resolveResourcesWithDefaultChoice(def, enterCoupResources(def, coinControlled));
    assert.equal(afterDegrade.globalVars.trail, 2);

    const notControlled = withCoupRound(base, {
      globalVars: { ...base.globalVars, trail: 3 },
      zones: {
        'central-laos:none': [
          piece('us-t-2', 'US', 'troops'),
          piece('nva-g-1', 'NVA', 'guerrilla'),
        ],
      },
    });
    const afterNoDegrade = resolveResourcesWithDefaultChoice(def, enterCoupResources(def, notControlled));
    assert.equal(afterNoDegrade.globalVars.trail, 3);
  });

  it('applies ARVN earnings, insurgent earnings, totalEcon update, and aid casualties reduction', () => {
    const def = compileProductionDef();
    const base = withClearedZones(initialState(def, 8603, 4).state);
    const state = withCoupRound(base, {
      globalVars: {
        ...base.globalVars,
        aid: 20,
        arvnResources: 5,
        vcResources: 1,
        nvaResources: 2,
        trail: 2,
        totalEcon: 15,
        terrorSabotageMarkersPlaced: 15,
      },
      zones: {
        'quang-tri-thua-thien:none': [piece('vc-base-1', 'VC', 'base')],
        'pleiku-darlac:none': [piece('vc-base-2', 'VC', 'base')],
        'tay-ninh:none': [piece('vc-base-3', 'VC', 'base')],
        'central-laos:none': [piece('nva-base-1', 'NVA', 'base')],
        'northeast-cambodia:none': [piece('nva-base-2', 'NVA', 'base')],
        'casualties-US:none': [
          piece('cas-us-1', 'US', 'troops'),
          piece('cas-us-2', 'US', 'troops'),
          piece('cas-us-3', 'US', 'base'),
          piece('cas-us-4', 'US', 'irregular'),
        ],
      },
      markers: {
        ...base.markers,
        'loc-saigon-can-tho:none': { ...(base.markers['loc-saigon-can-tho:none'] ?? {}), sabotage: 'sabotage' },
        'loc-hue-da-nang:none': { ...(base.markers['loc-hue-da-nang:none'] ?? {}), sabotage: 'sabotage' },
      },
    });

    const next = resolveResourcesWithDefaultChoice(def, enterCoupResources(def, state));

    assert.equal(next.globalVars.totalEcon, 12);
    assert.equal(next.globalVars.arvnResources, 37);
    assert.equal(next.globalVars.vcResources, 4);
    assert.equal(next.globalVars.nvaResources, 8);
    assert.equal(next.globalVars.aid, 8);
  });

  it('clamps ARVN resources to 75 and clamps aid at 0 under high casualties', () => {
    const def = compileProductionDef();
    const base = withClearedZones(initialState(def, 8604, 4).state);
    const casualties = Array.from({ length: 10 }, (_unused, index) => piece(`cas-us-${index}`, 'US', 'troops'));
    const state = withCoupRound(base, {
      globalVars: {
        ...base.globalVars,
        aid: 10,
        arvnResources: 70,
        trail: 1,
        terrorSabotageMarkersPlaced: 15,
      },
      zones: {
        'casualties-US:none': casualties,
      },
    });

    const next = resolveResourcesWithDefaultChoice(def, enterCoupResources(def, state));

    assert.equal(next.globalVars.totalEcon, 15);
    assert.equal(next.globalVars.arvnResources, 75);
    assert.equal(next.globalVars.aid, 0);
  });
});
