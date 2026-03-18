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
  return compiled.gameDef!;
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

const usPacifyPieces = (prefix: string): Token[] => [
  piece(`${prefix}-us-t`, 'US', 'troops'),
  piece(`${prefix}-arvn-p`, 'ARVN', 'police'),
];

const arvnPacifyPieces = (prefix: string): Token[] => [
  piece(`${prefix}-arvn-t`, 'ARVN', 'troops'),
  piece(`${prefix}-arvn-p`, 'ARVN', 'police'),
];

const withNeutralSupportSpace = (
  state: GameState,
  space: string,
  pieces: Token[],
  options?: {
    readonly markers?: Record<string, unknown>;
    readonly terrorCount?: number;
  },
): GameState => ({
  ...state,
  zones: {
    ...state.zones,
    [space]: pieces,
  },
  markers: {
    ...state.markers,
    [space]: {
      ...(state.markers[space] ?? {}),
      supportOpposition: 'neutral',
      ...(options?.markers ?? {}),
    },
  },
  zoneVars: options?.terrorCount === undefined
    ? state.zoneVars
    : {
        ...state.zoneVars,
        [space]: {
          ...(state.zoneVars[space] ?? {}),
          terrorCount: options.terrorCount,
        },
      },
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

// Hoist compilation to module level — avoids per-test structuredClone of the large FITL GameDef.
// Tests only read from def, so sharing is safe.
const DEF = compileProductionDef();

describe('FITL coup support phase production actions', () => {
  it('defines production support actions for US/ARVN pacification and VC agitation', () => {
    const def = DEF;
    const ids = new Set(def.actions.map((action) => String(action.id)));

    assert.equal(ids.has('coupPacifyUS'), true);
    assert.equal(ids.has('coupPacifyARVN'), true);
    assert.equal(ids.has('coupAgitateVC'), true);
  });

  it('allows US pacification terror removal at the totalEcon floor boundary and applies leader-adjusted cost', () => {
    const def = DEF;
    const base = withClearedZones(initialState(def, 8701, 4).state);
    const target = 'quang-nam:none';

    const state = withNeutralSupportSpace(withCoupSupportPhase(base, {
      activePlayer: 0 as GameState['activePlayer'],
      globalVars: {
        ...base.globalVars,
        arvnResources: 18,
        totalEcon: 15,
      },
      globalMarkers: {
        ...(base.globalMarkers ?? {}),
        activeLeader: 'minh',
      },
    }), target, usPacifyPieces('floor-boundary'), { terrorCount: 1 });

    const result = applyMove(def, state, {
      actionId: asActionId('coupPacifyUS'),
      params: { targetSpace: target, action: 'removeTerror' },
    });

    assert.equal(result.state.globalVars.arvnResources, 15);
    assert.equal(result.state.zoneVars[target]?.terrorCount ?? 0, 0);
    assert.equal(result.state.markers[target]?.coupPacifySpaceUsage, 'used');
  });

  it('applies Blowtorch Komer reduced Coup pacification cost (1) for US terror removal', () => {
    const def = DEF;
    const base = withClearedZones(initialState(def, 8711, 4).state);
    const target = 'quang-nam:none';

    const state = withNeutralSupportSpace(withCoupSupportPhase(base, {
      activePlayer: 0 as GameState['activePlayer'],
      globalVars: {
        ...base.globalVars,
        arvnResources: 16,
        totalEcon: 15,
        mom_blowtorchKomer: true,
      },
      globalMarkers: {
        ...(base.globalMarkers ?? {}),
        activeLeader: 'ky',
      },
    }), target, usPacifyPieces('bk'), { terrorCount: 1 });

    const result = applyMove(def, state, {
      actionId: asActionId('coupPacifyUS'),
      params: { targetSpace: target, action: 'removeTerror' },
    });

    assert.equal(result.state.globalVars.arvnResources, 15);
    assert.equal(result.state.zoneVars[target]?.terrorCount ?? 0, 0);
  });

  it('blocks US pacification if it would drop ARVN resources below totalEcon', () => {
    const def = DEF;
    const base = withClearedZones(initialState(def, 8702, 4).state);
    const target = 'quang-nam:none';

    const state = withNeutralSupportSpace(withCoupSupportPhase(base, {
      activePlayer: 0 as GameState['activePlayer'],
      globalVars: {
        ...base.globalVars,
        arvnResources: 17,
        totalEcon: 15,
      },
      globalMarkers: {
        ...(base.globalMarkers ?? {}),
        activeLeader: 'minh',
      },
    }), target, usPacifyPieces('below-floor'));

    assert.throws(() => applyMove(def, state, {
      actionId: asActionId('coupPacifyUS'),
      params: { targetSpace: target, action: 'shiftSupport' },
    }));
  });

  it('requires terror removal before US can shift support in a space', () => {
    const def = DEF;
    const base = withClearedZones(initialState(def, 8705, 4).state);
    const target = 'quang-nam:none';

    const terrorPresent = withNeutralSupportSpace(withCoupSupportPhase(base, {
      activePlayer: 0 as GameState['activePlayer'],
      globalVars: {
        ...base.globalVars,
        arvnResources: 25,
        totalEcon: 15,
      },
      globalMarkers: {
        ...(base.globalMarkers ?? {}),
        activeLeader: 'minh',
      },
    }), target, usPacifyPieces('terror-present'), { terrorCount: 1 });

    assert.throws(() => applyMove(def, terrorPresent, {
      actionId: asActionId('coupPacifyUS'),
      params: { targetSpace: target, action: 'shiftSupport' },
    }));

    const terrorRemoved = applyMove(def, terrorPresent, {
      actionId: asActionId('coupPacifyUS'),
      params: { targetSpace: target, action: 'removeTerror' },
    }).state;

    assert.equal(terrorRemoved.zoneVars[target]?.terrorCount ?? 0, 0);

    const noTerror = withNeutralSupportSpace(withCoupSupportPhase(base, {
      activePlayer: 0 as GameState['activePlayer'],
      globalVars: {
        ...base.globalVars,
        arvnResources: 25,
        totalEcon: 15,
      },
      globalMarkers: {
        ...(base.globalMarkers ?? {}),
        activeLeader: 'minh',
      },
    }), target, usPacifyPieces('no-terror'));

    const shifted = applyMove(def, noTerror, {
      actionId: asActionId('coupPacifyUS'),
      params: { targetSpace: target, action: 'shiftSupport' },
    }).state;

    assert.equal(shifted.markers[target]?.supportOpposition, 'passiveSupport');
  });

  it('enforces shared US+ARVN 4-space pacification limit and per-space 2-shift cap', () => {
    const def = DEF;
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
    const def = DEF;
    const base = withClearedZones(initialState(def, 8706, 4).state);
    const target = 'quang-nam:none';

    const terrorPresent = withNeutralSupportSpace(withCoupSupportPhase(base, {
      activePlayer: 1 as GameState['activePlayer'],
      globalVars: {
        ...base.globalVars,
        arvnResources: 30,
      },
      globalMarkers: {
        ...(base.globalMarkers ?? {}),
        activeLeader: 'minh',
      },
    }), target, arvnPacifyPieces('arvn-terror-present'), { terrorCount: 1 });

    assert.throws(() => applyMove(def, terrorPresent, {
      actionId: asActionId('coupPacifyARVN'),
      params: { targetSpace: target, action: 'shiftSupport' },
    }));

    const terrorRemoved = applyMove(def, terrorPresent, {
      actionId: asActionId('coupPacifyARVN'),
      params: { targetSpace: target, action: 'removeTerror' },
    }).state;

    assert.equal(terrorRemoved.zoneVars[target]?.terrorCount ?? 0, 0);

    const noTerror = withNeutralSupportSpace(withCoupSupportPhase(base, {
      activePlayer: 1 as GameState['activePlayer'],
      globalVars: {
        ...base.globalVars,
        arvnResources: 30,
      },
      globalMarkers: {
        ...(base.globalMarkers ?? {}),
        activeLeader: 'minh',
      },
    }), target, arvnPacifyPieces('arvn-no-terror'));

    const shifted = applyMove(def, noTerror, {
      actionId: asActionId('coupPacifyARVN'),
      params: { targetSpace: target, action: 'shiftSupport' },
    }).state;

    assert.equal(shifted.markers[target]?.supportOpposition, 'passiveSupport');
  });

  it('applies Blowtorch Komer reduced Coup pacification cost (1) for ARVN shift support, overriding Ky rate', () => {
    const def = DEF;
    const base = withClearedZones(initialState(def, 8712, 4).state);
    const target = 'quang-nam:none';

    const state = withNeutralSupportSpace(withCoupSupportPhase(base, {
      activePlayer: 1 as GameState['activePlayer'],
      globalVars: {
        ...base.globalVars,
        arvnResources: 1,
        mom_blowtorchKomer: true,
      },
      globalMarkers: {
        ...(base.globalMarkers ?? {}),
        activeLeader: 'ky',
      },
    }), target, arvnPacifyPieces('arvn-bk'));

    const result = applyMove(def, state, {
      actionId: asActionId('coupPacifyARVN'),
      params: { targetSpace: target, action: 'shiftSupport' },
    });

    assert.equal(result.state.globalVars.arvnResources, 0);
    assert.equal(result.state.markers[target]?.supportOpposition, 'passiveSupport');
  });

  it('applies cap_mandateOfHeaven shaded as an ARVN-only one-space pacify limit while still allowing repeat steps in that space', () => {
    const def = DEF;
    const base = withClearedZones(initialState(def, 8713, 4).state);
    const firstSpace = 'quang-nam:none';
    const secondSpace = 'can-tho:none';

    const state = withNeutralSupportSpace(
      withNeutralSupportSpace(withCoupSupportPhase(base, {
      activePlayer: 1 as GameState['activePlayer'],
      globalVars: {
        ...base.globalVars,
        arvnResources: 30,
      },
      globalMarkers: {
        ...(base.globalMarkers ?? {}),
        activeLeader: 'minh',
        cap_mandateOfHeaven: 'shaded',
      },
    }), firstSpace, arvnPacifyPieces('moh-first'), { terrorCount: 1 }),
      secondSpace,
      arvnPacifyPieces('moh-second'),
    );

    const firstResult = applyMove(def, state, {
      actionId: asActionId('coupPacifyARVN'),
      params: { targetSpace: firstSpace, action: 'removeTerror' },
    }).state;

    assert.equal(firstResult.markers[firstSpace]?.coupPacifyArvnSpaceUsage, 'used');
    assert.equal(firstResult.zoneVars[firstSpace]?.terrorCount ?? 0, 0);

    const secondResult = applyMove(def, firstResult, {
      actionId: asActionId('coupPacifyARVN'),
      params: { targetSpace: firstSpace, action: 'shiftSupport' },
    }).state;

    assert.equal(secondResult.markers[firstSpace]?.supportOpposition, 'passiveSupport');
    assert.equal(secondResult.markers[firstSpace]?.coupSupportShiftCount, 'one');

    assert.throws(() => applyMove(def, secondResult, {
      actionId: asActionId('coupPacifyARVN'),
      params: { targetSpace: secondSpace, action: 'shiftSupport' },
    }));
  });

  it('does not let Mandate of Heaven shaded block ARVN from reusing a US-pacified space, but blocks opening a second ARVN space', () => {
    const def = DEF;
    const base = withClearedZones(initialState(def, 8714, 4).state);
    const sharedSpace = 'quang-nam:none';
    const secondSpace = 'can-tho:none';

    const state = withNeutralSupportSpace(
      withNeutralSupportSpace(withCoupSupportPhase(base, {
      activePlayer: 1 as GameState['activePlayer'],
      globalVars: {
        ...base.globalVars,
        arvnResources: 30,
      },
      globalMarkers: {
        ...(base.globalMarkers ?? {}),
        activeLeader: 'minh',
        cap_mandateOfHeaven: 'shaded',
      },
    }), sharedSpace, arvnPacifyPieces('moh-shared'), { markers: { coupPacifySpaceUsage: 'used' } }),
      secondSpace,
      arvnPacifyPieces('moh-open'),
    );

    const sharedResult = applyMove(def, state, {
      actionId: asActionId('coupPacifyARVN'),
      params: { targetSpace: sharedSpace, action: 'shiftSupport' },
    }).state;

    assert.equal(sharedResult.markers[sharedSpace]?.coupPacifyArvnSpaceUsage, 'used');
    assert.equal(sharedResult.markers[sharedSpace]?.coupPacifySpaceUsage, 'used');

    assert.throws(() => applyMove(def, sharedResult, {
      actionId: asActionId('coupPacifyARVN'),
      params: { targetSpace: secondSpace, action: 'shiftSupport' },
    }));
  });

  it('requires terror removal before VC can shift opposition in a space', () => {
    const def = DEF;
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
    const def = DEF;
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

  it('applies Ky Coup pacification cost (4) for ARVN support shift without Blowtorch Komer', () => {
    const def = DEF;
    const base = withClearedZones(initialState(def, 8720, 4).state);
    const target = 'quang-nam:none';

    const state = withNeutralSupportSpace(withCoupSupportPhase(base, {
      activePlayer: 1 as GameState['activePlayer'],
      globalVars: {
        ...base.globalVars,
        arvnResources: 20,
      },
      globalMarkers: {
        ...(base.globalMarkers ?? {}),
        activeLeader: 'ky',
      },
    }), target, arvnPacifyPieces('arvn-ky-shift'));

    const result = applyMove(def, state, {
      actionId: asActionId('coupPacifyARVN'),
      params: { targetSpace: target, action: 'shiftSupport' },
    });

    assert.equal(result.state.globalVars.arvnResources, 16, 'Ky Coup pacification should cost 4 per support shift');
    assert.equal(result.state.markers[target]?.supportOpposition, 'passiveSupport');
  });

  it('applies Ky Coup pacification cost (4) for US terror removal without Blowtorch Komer', () => {
    const def = DEF;
    const base = withClearedZones(initialState(def, 8721, 4).state);
    const target = 'quang-nam:none';

    const state = withNeutralSupportSpace(withCoupSupportPhase(base, {
      activePlayer: 0 as GameState['activePlayer'],
      globalVars: {
        ...base.globalVars,
        arvnResources: 20,
        totalEcon: 15,
      },
      globalMarkers: {
        ...(base.globalMarkers ?? {}),
        activeLeader: 'ky',
      },
    }), target, usPacifyPieces('us-ky-terror'), { terrorCount: 1 });

    const result = applyMove(def, state, {
      actionId: asActionId('coupPacifyUS'),
      params: { targetSpace: target, action: 'removeTerror' },
    });

    assert.equal(result.state.globalVars.arvnResources, 16, 'Ky Coup US terror removal should cost 4 ARVN resources');
    assert.equal(result.state.zoneVars[target]?.terrorCount ?? 0, 0);
  });

  it('applies Ky Coup pacification cost (4) for ARVN terror removal without Blowtorch Komer', () => {
    const def = DEF;
    const base = withClearedZones(initialState(def, 8722, 4).state);
    const target = 'quang-nam:none';

    const state = withNeutralSupportSpace(withCoupSupportPhase(base, {
      activePlayer: 1 as GameState['activePlayer'],
      globalVars: {
        ...base.globalVars,
        arvnResources: 20,
      },
      globalMarkers: {
        ...(base.globalMarkers ?? {}),
        activeLeader: 'ky',
      },
    }), target, arvnPacifyPieces('arvn-ky-terror'), { terrorCount: 1 });

    const result = applyMove(def, state, {
      actionId: asActionId('coupPacifyARVN'),
      params: { targetSpace: target, action: 'removeTerror' },
    });

    assert.equal(result.state.globalVars.arvnResources, 16, 'Ky Coup ARVN terror removal should cost 4 ARVN resources');
    assert.equal(result.state.zoneVars[target]?.terrorCount ?? 0, 0);
  });

  it('enforces Ky Coup pacification resource boundary (exactly 4 succeeds, 3 fails)', () => {
    const def = DEF;
    const base = withClearedZones(initialState(def, 8723, 4).state);
    const target = 'quang-nam:none';

    const stateWith4 = withNeutralSupportSpace(withCoupSupportPhase(base, {
      activePlayer: 1 as GameState['activePlayer'],
      globalVars: {
        ...base.globalVars,
        arvnResources: 4,
      },
      globalMarkers: {
        ...(base.globalMarkers ?? {}),
        activeLeader: 'ky',
      },
    }), target, arvnPacifyPieces('arvn-ky-boundary-ok'));

    const successResult = applyMove(def, stateWith4, {
      actionId: asActionId('coupPacifyARVN'),
      params: { targetSpace: target, action: 'shiftSupport' },
    });
    assert.equal(successResult.state.globalVars.arvnResources, 0, 'Exactly 4 ARVN resources with Ky should succeed');
    assert.equal(successResult.state.markers[target]?.supportOpposition, 'passiveSupport');

    const stateWith3 = withNeutralSupportSpace(withCoupSupportPhase(base, {
      activePlayer: 1 as GameState['activePlayer'],
      globalVars: {
        ...base.globalVars,
        arvnResources: 3,
      },
      globalMarkers: {
        ...(base.globalMarkers ?? {}),
        activeLeader: 'ky',
      },
    }), target, arvnPacifyPieces('arvn-ky-boundary-fail'));

    assert.throws(
      () => applyMove(def, stateWith3, {
        actionId: asActionId('coupPacifyARVN'),
        params: { targetSpace: target, action: 'shiftSupport' },
      }),
      'Only 3 ARVN resources with Ky should fail (needs 4)',
    );
  });
});
