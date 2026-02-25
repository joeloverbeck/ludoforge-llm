import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { applyMove, asActionId, asPhaseId, asTokenId, initialState, type GameDef, type GameState, type Token } from '../../src/kernel/index.js';
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

const withCoupSupportPhase = (
  base: GameState,
  overrides?: {
    readonly activePlayer?: GameState['activePlayer'];
    readonly globalVars?: Partial<GameState['globalVars']>;
    readonly zones?: Partial<GameState['zones']>;
    readonly markers?: Partial<GameState['markers']>;
    readonly globalMarkers?: Partial<GameState['globalMarkers']>;
    readonly zoneVars?: Partial<GameState['zoneVars']>;
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
  const zoneVars = overrides?.zoneVars === undefined
    ? base.zoneVars
    : ({ ...base.zoneVars, ...overrides.zoneVars } as GameState['zoneVars']);
  const globalMarkers: Readonly<Record<string, string>> = {
    ...((base.globalMarkers ?? {}) as Record<string, string>),
    ...((overrides?.globalMarkers ?? {}) as Record<string, string>),
  };

  return {
    ...base,
    currentPhase: asPhaseId('coupSupport'),
    activePlayer: overrides?.activePlayer ?? base.activePlayer,
    globalVars,
    zones,
    markers,
    zoneVars,
    globalMarkers: globalMarkers as GameState['globalMarkers'],
  } as GameState;
};

describe('FITL coup support phase production actions', () => {
  it('defines production support actions for US/ARVN pacification and VC agitation', () => {
    const def = compileProductionDef();
    const ids = new Set(def.actions.map((action) => String(action.id)));

    assert.equal(ids.has('coupPacifyUS'), true);
    assert.equal(ids.has('coupPacifyARVN'), true);
    assert.equal(ids.has('coupAgitateVC'), true);
  });

  it('allows US pacification terror removal at the totalEcon floor boundary and applies leader-adjusted cost', () => {
    const def = compileProductionDef();
    const base = withClearedZones(initialState(def, 8701, 4).state);
    const target = 'quang-nam:none';

    const state = withCoupSupportPhase(base, {
      activePlayer: 0 as GameState['activePlayer'],
      globalVars: {
        ...base.globalVars,
        arvnResources: 18,
        totalEcon: 15,
      },
      zones: {
        [target]: [
          piece('us-t', 'US', 'troops'),
          piece('arvn-p', 'ARVN', 'police'),
        ],
      },
      markers: {
        ...base.markers,
        [target]: {
          ...(base.markers[target] ?? {}),
          supportOpposition: 'neutral',
        },
      },
      zoneVars: {
        ...base.zoneVars,
        [target]: {
          ...(base.zoneVars[target] ?? {}),
          terrorCount: 1,
        },
      },
      globalMarkers: {
        ...(base.globalMarkers ?? {}),
        activeLeader: 'minh',
      },
    });

    const result = applyMove(def, state, {
      actionId: asActionId('coupPacifyUS'),
      params: { targetSpace: target, action: 'removeTerror' },
    });

    assert.equal(result.state.globalVars.arvnResources, 15);
    assert.equal(result.state.zoneVars[target]?.terrorCount ?? 0, 0);
    assert.equal(result.state.markers[target]?.coupPacifySpaceUsage, 'used');
  });

  it('blocks US pacification if it would drop ARVN resources below totalEcon', () => {
    const def = compileProductionDef();
    const base = withClearedZones(initialState(def, 8702, 4).state);
    const target = 'quang-nam:none';

    const state = withCoupSupportPhase(base, {
      activePlayer: 0 as GameState['activePlayer'],
      globalVars: {
        ...base.globalVars,
        arvnResources: 17,
        totalEcon: 15,
      },
      zones: {
        [target]: [
          piece('us-t', 'US', 'troops'),
          piece('arvn-p', 'ARVN', 'police'),
        ],
      },
      markers: {
        ...base.markers,
        [target]: {
          ...(base.markers[target] ?? {}),
          supportOpposition: 'neutral',
        },
      },
      globalMarkers: {
        ...(base.globalMarkers ?? {}),
        activeLeader: 'minh',
      },
    });

    assert.throws(() => applyMove(def, state, {
      actionId: asActionId('coupPacifyUS'),
      params: { targetSpace: target, action: 'shiftSupport' },
    }));
  });

  it('requires terror removal before US can shift support in a space', () => {
    const def = compileProductionDef();
    const base = withClearedZones(initialState(def, 8705, 4).state);
    const target = 'quang-nam:none';

    const terrorPresent = withCoupSupportPhase(base, {
      activePlayer: 0 as GameState['activePlayer'],
      globalVars: {
        ...base.globalVars,
        arvnResources: 25,
        totalEcon: 15,
      },
      zones: {
        [target]: [piece('us-t-2', 'US', 'troops'), piece('arvn-p-2', 'ARVN', 'police')],
      },
      markers: {
        ...base.markers,
        [target]: {
          ...(base.markers[target] ?? {}),
          supportOpposition: 'neutral',
        },
      },
      zoneVars: {
        ...base.zoneVars,
        [target]: {
          ...(base.zoneVars[target] ?? {}),
          terrorCount: 1,
        },
      },
      globalMarkers: {
        ...(base.globalMarkers ?? {}),
        activeLeader: 'minh',
      },
    });

    assert.throws(() => applyMove(def, terrorPresent, {
      actionId: asActionId('coupPacifyUS'),
      params: { targetSpace: target, action: 'shiftSupport' },
    }));

    const terrorRemoved = applyMove(def, terrorPresent, {
      actionId: asActionId('coupPacifyUS'),
      params: { targetSpace: target, action: 'removeTerror' },
    }).state;

    assert.equal(terrorRemoved.zoneVars[target]?.terrorCount ?? 0, 0);

    const noTerror = withCoupSupportPhase(base, {
      activePlayer: 0 as GameState['activePlayer'],
      globalVars: {
        ...base.globalVars,
        arvnResources: 25,
        totalEcon: 15,
      },
      zones: {
        [target]: [piece('us-t-3', 'US', 'troops'), piece('arvn-p-3', 'ARVN', 'police')],
      },
      markers: {
        ...base.markers,
        [target]: {
          ...(base.markers[target] ?? {}),
          supportOpposition: 'neutral',
        },
      },
      globalMarkers: {
        ...(base.globalMarkers ?? {}),
        activeLeader: 'minh',
      },
    });

    const shifted = applyMove(def, noTerror, {
      actionId: asActionId('coupPacifyUS'),
      params: { targetSpace: target, action: 'shiftSupport' },
    }).state;

    assert.equal(shifted.markers[target]?.supportOpposition, 'passiveSupport');
  });

  it('enforces shared US+ARVN 4-space pacification limit and per-space 2-shift cap', () => {
    const def = compileProductionDef();
    const base = withClearedZones(initialState(def, 8703, 4).state);
    const blockedTarget = 'quang-nam:none';

    const overSpaceLimit = withCoupSupportPhase(base, {
      activePlayer: 1 as GameState['activePlayer'],
      globalVars: {
        ...base.globalVars,
        arvnResources: 30,
      },
      zones: {
        [blockedTarget]: [piece('arvn-t', 'ARVN', 'troops'), piece('arvn-p', 'ARVN', 'police')],
      },
      markers: {
        ...base.markers,
        [blockedTarget]: {
          ...(base.markers[blockedTarget] ?? {}),
          supportOpposition: 'neutral',
          coupPacifySpaceUsage: 'open',
        },
        'saigon:none': { coupPacifySpaceUsage: 'used' },
        'da-nang:none': { coupPacifySpaceUsage: 'used' },
        'hue:none': { coupPacifySpaceUsage: 'used' },
        'can-tho:none': { coupPacifySpaceUsage: 'used' },
      },
      globalMarkers: {
        ...(base.globalMarkers ?? {}),
        activeLeader: 'minh',
      },
    });

    assert.throws(() => applyMove(def, overSpaceLimit, {
      actionId: asActionId('coupPacifyARVN'),
      params: { targetSpace: blockedTarget, action: 'shiftSupport' },
    }));

    const overShiftCap = withCoupSupportPhase(base, {
      activePlayer: 1 as GameState['activePlayer'],
      globalVars: {
        ...base.globalVars,
        arvnResources: 30,
      },
      zones: {
        [blockedTarget]: [piece('arvn-t2', 'ARVN', 'troops'), piece('arvn-p2', 'ARVN', 'police')],
      },
      markers: {
        ...base.markers,
        [blockedTarget]: {
          ...(base.markers[blockedTarget] ?? {}),
          supportOpposition: 'neutral',
          coupPacifySpaceUsage: 'used',
          coupSupportShiftCount: 'two',
        },
      },
      globalMarkers: {
        ...(base.globalMarkers ?? {}),
        activeLeader: 'minh',
      },
    });

    assert.throws(() => applyMove(def, overShiftCap, {
      actionId: asActionId('coupPacifyARVN'),
      params: { targetSpace: blockedTarget, action: 'shiftSupport' },
    }));
  });

  it('requires terror removal before ARVN can shift support in a space', () => {
    const def = compileProductionDef();
    const base = withClearedZones(initialState(def, 8706, 4).state);
    const target = 'quang-nam:none';

    const terrorPresent = withCoupSupportPhase(base, {
      activePlayer: 1 as GameState['activePlayer'],
      globalVars: {
        ...base.globalVars,
        arvnResources: 30,
      },
      zones: {
        [target]: [piece('arvn-t-3', 'ARVN', 'troops'), piece('arvn-p-3', 'ARVN', 'police')],
      },
      markers: {
        ...base.markers,
        [target]: {
          ...(base.markers[target] ?? {}),
          supportOpposition: 'neutral',
        },
      },
      zoneVars: {
        ...base.zoneVars,
        [target]: {
          ...(base.zoneVars[target] ?? {}),
          terrorCount: 1,
        },
      },
      globalMarkers: {
        ...(base.globalMarkers ?? {}),
        activeLeader: 'minh',
      },
    });

    assert.throws(() => applyMove(def, terrorPresent, {
      actionId: asActionId('coupPacifyARVN'),
      params: { targetSpace: target, action: 'shiftSupport' },
    }));

    const terrorRemoved = applyMove(def, terrorPresent, {
      actionId: asActionId('coupPacifyARVN'),
      params: { targetSpace: target, action: 'removeTerror' },
    }).state;

    assert.equal(terrorRemoved.zoneVars[target]?.terrorCount ?? 0, 0);

    const noTerror = withCoupSupportPhase(base, {
      activePlayer: 1 as GameState['activePlayer'],
      globalVars: {
        ...base.globalVars,
        arvnResources: 30,
      },
      zones: {
        [target]: [piece('arvn-t-4', 'ARVN', 'troops'), piece('arvn-p-4', 'ARVN', 'police')],
      },
      markers: {
        ...base.markers,
        [target]: {
          ...(base.markers[target] ?? {}),
          supportOpposition: 'neutral',
        },
      },
      globalMarkers: {
        ...(base.globalMarkers ?? {}),
        activeLeader: 'minh',
      },
    });

    const shifted = applyMove(def, noTerror, {
      actionId: asActionId('coupPacifyARVN'),
      params: { targetSpace: target, action: 'shiftSupport' },
    }).state;

    assert.equal(shifted.markers[target]?.supportOpposition, 'passiveSupport');
  });

  it('requires terror removal before VC can shift opposition in a space', () => {
    const def = compileProductionDef();
    const base = withClearedZones(initialState(def, 8704, 4).state);
    const target = 'quang-tri-thua-thien:none';

    const terrorPresent = withCoupSupportPhase(base, {
      activePlayer: 3 as GameState['activePlayer'],
      globalVars: {
        ...base.globalVars,
        vcResources: 6,
      },
      zones: {
        [target]: [piece('vc-g', 'VC', 'guerrilla')],
      },
      markers: {
        ...base.markers,
        [target]: {
          ...(base.markers[target] ?? {}),
          supportOpposition: 'neutral',
        },
      },
      zoneVars: {
        ...base.zoneVars,
        [target]: {
          ...(base.zoneVars[target] ?? {}),
          terrorCount: 1,
        },
      },
    });

    assert.throws(() => applyMove(def, terrorPresent, {
      actionId: asActionId('coupAgitateVC'),
      params: { targetSpace: target, action: 'shiftOpposition' },
    }));

    const terrorRemoved = applyMove(def, terrorPresent, {
      actionId: asActionId('coupAgitateVC'),
      params: { targetSpace: target, action: 'removeTerror' },
    }).state;

    assert.equal(terrorRemoved.zoneVars[target]?.terrorCount ?? 0, 0);
    assert.equal(terrorRemoved.globalVars.vcResources, 5);

    const noTerror = withCoupSupportPhase(base, {
      activePlayer: 3 as GameState['activePlayer'],
      globalVars: {
        ...base.globalVars,
        vcResources: 6,
      },
      zones: {
        [target]: [piece('vc-g-ready', 'VC', 'guerrilla')],
      },
      markers: {
        ...base.markers,
        [target]: {
          ...(base.markers[target] ?? {}),
          supportOpposition: 'neutral',
        },
      },
    });

    const shifted = applyMove(def, noTerror, {
      actionId: asActionId('coupAgitateVC'),
      params: { targetSpace: target, action: 'shiftOpposition' },
    }).state;

    assert.equal(shifted.globalVars.vcResources, 5);
    assert.equal(shifted.markers[target]?.supportOpposition, 'passiveOpposition');
    assert.equal(shifted.markers[target]?.coupAgitateSpaceUsage, 'used');
  });

  it('enforces 4-space agitation cap for VC', () => {
    const def = compileProductionDef();
    const base = withClearedZones(initialState(def, 8707, 4).state);
    const blockedBySpaceCap = withCoupSupportPhase(base, {
      activePlayer: 3 as GameState['activePlayer'],
      globalVars: {
        ...base.globalVars,
        vcResources: 6,
      },
      zones: {
        'quang-nam:none': [piece('vc-g2', 'VC', 'guerrilla')],
      },
      markers: {
        ...base.markers,
        'quang-nam:none': { supportOpposition: 'neutral', coupAgitateSpaceUsage: 'open' },
        'saigon:none': { coupAgitateSpaceUsage: 'used' },
        'da-nang:none': { coupAgitateSpaceUsage: 'used' },
        'hue:none': { coupAgitateSpaceUsage: 'used' },
        'can-tho:none': { coupAgitateSpaceUsage: 'used' },
      },
    });

    assert.throws(() => applyMove(def, blockedBySpaceCap, {
      actionId: asActionId('coupAgitateVC'),
      params: { targetSpace: 'quang-nam:none', action: 'shiftOpposition' },
    }));
  });
});
