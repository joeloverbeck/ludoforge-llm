import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asPhaseId,
  asPlayerId,
  asTokenId,
  countFactionTokens,
  isCoinControlled,
  isSoloFactionControlled,
  getPopulationMultiplier,
  computeTotalSupport,
  computeTotalOpposition,
  isSabotaged,
  computeTotalEcon,
  sumControlledPopulation,
  countTokensInZone,
  countBasesOnMap,
  computeVictoryMarker,
  type FactionConfig,
  type MarkerWeightConfig,
  type VictoryFormula,
  type GameState,
  type MapSpaceDef,
  type Token,
} from '../../src/kernel/index.js';

// ─── Factories ───────────────────────────────────────────────────────────────

const makeFactionToken = (id: string, faction: string, type: string = 'piece'): Token => ({
  id: asTokenId(id),
  type,
  props: { faction },
});

const makeSpace = (overrides: Partial<MapSpaceDef> & { id: string }): MapSpaceDef => ({
  spaceType: 'province',
  population: 0,
  econ: 0,
  terrainTags: [],
  country: 'test',
  coastal: false,
  adjacentTo: [],
  ...overrides,
});

const makeState = (zones: Record<string, readonly Token[]>, globalVars: Record<string, number> = {}): GameState => ({
  globalVars,
  perPlayerVars: {},
  playerCount: 4,
  zones,
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [1n, 2n] },
  stateHash: 0n,
  actionUsage: {},
});

const DEFAULT_FACTION_CONFIG: FactionConfig = {
  coinFactions: ['US', 'ARVN'],
  insurgentFactions: ['NVA', 'VC'],
  soloFaction: 'NVA',
  factionProp: 'faction',
};

const SUPPORT_CONFIG: MarkerWeightConfig = {
  activeState: 'activeSupport',
  passiveState: 'passiveSupport',
};

const OPPOSITION_CONFIG: MarkerWeightConfig = {
  activeState: 'activeOpposition',
  passiveState: 'passiveOpposition',
};

// ─── countFactionTokens ──────────────────────────────────────────────────────

describe('countFactionTokens', () => {
  it('counts tokens matching any faction in the list', () => {
    const state = makeState({
      'space-a': [
        makeFactionToken('t1', 'US'),
        makeFactionToken('t2', 'US'),
        makeFactionToken('t3', 'ARVN'),
        makeFactionToken('t4', 'NVA'),
      ],
    });
    assert.equal(countFactionTokens(state, 'space-a', ['US', 'ARVN'], 'faction'), 3);
  });

  it('returns 0 for missing zone', () => {
    const state = makeState({});
    assert.equal(countFactionTokens(state, 'nonexistent', ['US'], 'faction'), 0);
  });

  it('returns 0 for empty zone', () => {
    const state = makeState({ 'space-a': [] });
    assert.equal(countFactionTokens(state, 'space-a', ['US'], 'faction'), 0);
  });

  it('ignores tokens without the faction prop', () => {
    const state = makeState({
      'space-a': [
        { id: asTokenId('t1'), type: 'piece', props: { color: 'red' } },
        makeFactionToken('t2', 'US'),
      ],
    });
    assert.equal(countFactionTokens(state, 'space-a', ['US'], 'faction'), 1);
  });
});

// ─── isCoinControlled ────────────────────────────────────────────────────────

describe('isCoinControlled', () => {
  it('returns true when COIN > insurgent (3 US + 1 ARVN vs 2 NVA + 1 VC)', () => {
    const state = makeState({
      'space-a': [
        makeFactionToken('t1', 'US'),
        makeFactionToken('t2', 'US'),
        makeFactionToken('t3', 'US'),
        makeFactionToken('t4', 'ARVN'),
        makeFactionToken('t5', 'NVA'),
        makeFactionToken('t6', 'NVA'),
        makeFactionToken('t7', 'VC'),
      ],
    });
    assert.equal(isCoinControlled(state, 'space-a', DEFAULT_FACTION_CONFIG), true);
  });

  it('returns false when equal counts (strict >)', () => {
    const state = makeState({
      'space-a': [
        makeFactionToken('t1', 'US'),
        makeFactionToken('t2', 'ARVN'),
        makeFactionToken('t3', 'NVA'),
        makeFactionToken('t4', 'VC'),
      ],
    });
    assert.equal(isCoinControlled(state, 'space-a', DEFAULT_FACTION_CONFIG), false);
  });

  it('returns false for empty space', () => {
    const state = makeState({ 'space-a': [] });
    assert.equal(isCoinControlled(state, 'space-a', DEFAULT_FACTION_CONFIG), false);
  });

  it('returns false when insurgent > COIN', () => {
    const state = makeState({
      'space-a': [
        makeFactionToken('t1', 'US'),
        makeFactionToken('t2', 'NVA'),
        makeFactionToken('t3', 'NVA'),
        makeFactionToken('t4', 'VC'),
      ],
    });
    assert.equal(isCoinControlled(state, 'space-a', DEFAULT_FACTION_CONFIG), false);
  });
});

// ─── isSoloFactionControlled ─────────────────────────────────────────────────────────

describe('isSoloFactionControlled', () => {
  it('returns true when solo faction > all others (4 vs 2 + 1)', () => {
    const state = makeState({
      'space-a': [
        makeFactionToken('t1', 'NVA'),
        makeFactionToken('t2', 'NVA'),
        makeFactionToken('t3', 'NVA'),
        makeFactionToken('t4', 'NVA'),
        makeFactionToken('t5', 'US'),
        makeFactionToken('t6', 'US'),
        makeFactionToken('t7', 'VC'),
      ],
    });
    assert.equal(isSoloFactionControlled(state, 'space-a', DEFAULT_FACTION_CONFIG), true);
  });

  it('returns true when 1 solo faction vs 0 others', () => {
    const state = makeState({
      'space-a': [makeFactionToken('t1', 'NVA')],
    });
    assert.equal(isSoloFactionControlled(state, 'space-a', DEFAULT_FACTION_CONFIG), true);
  });

  it('returns false for empty space', () => {
    const state = makeState({ 'space-a': [] });
    assert.equal(isSoloFactionControlled(state, 'space-a', DEFAULT_FACTION_CONFIG), false);
  });

  it('returns false when solo faction equals others (strict >)', () => {
    const state = makeState({
      'space-a': [
        makeFactionToken('t1', 'NVA'),
        makeFactionToken('t2', 'US'),
      ],
    });
    assert.equal(isSoloFactionControlled(state, 'space-a', DEFAULT_FACTION_CONFIG), false);
  });
});

// ─── getPopulationMultiplier ─────────────────────────────────────────────────

describe('getPopulationMultiplier', () => {
  it('returns 2 for active state', () => {
    assert.equal(getPopulationMultiplier('activeSupport', SUPPORT_CONFIG), 2);
  });

  it('returns 1 for passive state', () => {
    assert.equal(getPopulationMultiplier('passiveSupport', SUPPORT_CONFIG), 1);
  });

  it('returns 0 for neutral', () => {
    assert.equal(getPopulationMultiplier('neutral', SUPPORT_CONFIG), 0);
  });

  it('returns 0 for any unrecognized state', () => {
    assert.equal(getPopulationMultiplier('activeOpposition', SUPPORT_CONFIG), 0);
  });
});

// ─── computeTotalSupport / computeTotalOpposition ────────────────────────────

describe('computeTotalSupport', () => {
  it('computes Active Support (pop 2) + Passive Support (pop 1) + Neutral (pop 3) = 5', () => {
    const spaces: readonly MapSpaceDef[] = [
      makeSpace({ id: 's1', population: 2 }),
      makeSpace({ id: 's2', population: 1 }),
      makeSpace({ id: 's3', population: 3 }),
    ];
    const markerStates: Record<string, string> = {
      s1: 'activeSupport',
      s2: 'passiveSupport',
      s3: 'neutral',
    };
    assert.equal(computeTotalSupport(spaces, markerStates, SUPPORT_CONFIG), 5);
  });

  it('zero population spaces contribute nothing regardless of marker state', () => {
    const spaces: readonly MapSpaceDef[] = [
      makeSpace({ id: 's1', population: 0 }),
    ];
    const markerStates: Record<string, string> = { s1: 'activeSupport' };
    assert.equal(computeTotalSupport(spaces, markerStates, SUPPORT_CONFIG), 0);
  });

  it('uses defaultMarkerState for missing entries', () => {
    const spaces: readonly MapSpaceDef[] = [
      makeSpace({ id: 's1', population: 3 }),
    ];
    // s1 not in markerStates → uses default 'neutral' → multiplier 0
    assert.equal(computeTotalSupport(spaces, {}, SUPPORT_CONFIG), 0);
  });
});

describe('computeTotalOpposition', () => {
  it('computes Active Opposition (pop 2) + Passive Opposition (pop 1) + Neutral (pop 3) = 5', () => {
    const spaces: readonly MapSpaceDef[] = [
      makeSpace({ id: 's1', population: 2 }),
      makeSpace({ id: 's2', population: 1 }),
      makeSpace({ id: 's3', population: 3 }),
    ];
    const markerStates: Record<string, string> = {
      s1: 'activeOpposition',
      s2: 'passiveOpposition',
      s3: 'neutral',
    };
    assert.equal(computeTotalOpposition(spaces, markerStates, OPPOSITION_CONFIG), 5);
  });
});

// ─── isSabotaged ─────────────────────────────────────────────────────────────

describe('isSabotaged', () => {
  it('returns true when terror token present', () => {
    const state = makeState({
      'space-a': [
        makeFactionToken('t1', 'US'),
        { id: asTokenId('terror-1'), type: 'terror', props: {} },
      ],
    });
    assert.equal(isSabotaged(state, 'space-a', 'terror'), true);
  });

  it('returns false when no terror token present', () => {
    const state = makeState({
      'space-a': [makeFactionToken('t1', 'US')],
    });
    assert.equal(isSabotaged(state, 'space-a', 'terror'), false);
  });

  it('returns false for empty zone', () => {
    const state = makeState({ 'space-a': [] });
    assert.equal(isSabotaged(state, 'space-a', 'terror'), false);
  });
});

// ─── computeTotalEcon ────────────────────────────────────────────────────────

describe('computeTotalEcon', () => {
  const spaces: readonly MapSpaceDef[] = [
    makeSpace({ id: 'loc-1', spaceType: 'loc', econ: 1 }),
    makeSpace({ id: 'loc-2', spaceType: 'loc', econ: 1 }),
    makeSpace({ id: 'loc-3', spaceType: 'loc', econ: 1 }),
    makeSpace({ id: 'loc-4', spaceType: 'loc', econ: 1 }),
    makeSpace({ id: 'province-1', spaceType: 'province', econ: 5 }),
  ];

  it('sums econ of COIN-controlled unsabotaged LoCs', () => {
    // loc-1: COIN controlled, not sabotaged → econ 1
    // loc-2: COIN controlled, not sabotaged → econ 1
    // loc-3: not COIN controlled → excluded
    // loc-4: COIN controlled, sabotaged → excluded
    // province-1: not a LoC → excluded
    const state = makeState({
      'loc-1': [makeFactionToken('t1', 'US'), makeFactionToken('t2', 'ARVN')],
      'loc-2': [makeFactionToken('t3', 'US')],
      'loc-3': [makeFactionToken('t4', 'NVA'), makeFactionToken('t5', 'VC')],
      'loc-4': [
        makeFactionToken('t6', 'US'),
        makeFactionToken('t7', 'US'),
        { id: asTokenId('terror-1'), type: 'terror', props: {} },
      ],
      'province-1': [makeFactionToken('t8', 'US'), makeFactionToken('t9', 'US')],
    });
    assert.equal(computeTotalEcon(state, spaces, DEFAULT_FACTION_CONFIG, 'terror'), 2);
  });

  it('excludes sabotaged LoC even if COIN-controlled', () => {
    const state = makeState({
      'loc-1': [
        makeFactionToken('t1', 'US'),
        makeFactionToken('t2', 'US'),
        { id: asTokenId('terror-1'), type: 'terror', props: {} },
      ],
    });
    assert.equal(computeTotalEcon(state, spaces, DEFAULT_FACTION_CONFIG, 'terror'), 0);
  });

  it('ignores non-LoC spaces even if COIN-controlled with econ > 0', () => {
    const state = makeState({
      'province-1': [makeFactionToken('t1', 'US')],
    });
    assert.equal(computeTotalEcon(state, spaces, DEFAULT_FACTION_CONFIG, 'terror'), 0);
  });
});

// ─── sumControlledPopulation ─────────────────────────────────────────────────

describe('sumControlledPopulation', () => {
  it('sums population of COIN-controlled spaces', () => {
    const spaces: readonly MapSpaceDef[] = [
      makeSpace({ id: 's1', population: 2 }),
      makeSpace({ id: 's2', population: 3 }),
      makeSpace({ id: 's3', population: 1 }),
    ];
    const state = makeState({
      s1: [makeFactionToken('t1', 'US'), makeFactionToken('t2', 'US')],
      s2: [makeFactionToken('t3', 'NVA'), makeFactionToken('t4', 'VC')],
      s3: [makeFactionToken('t5', 'ARVN')],
    });
    // s1: COIN 2 > insurgent 0 → pop 2
    // s2: COIN 0 < insurgent 2 → excluded
    // s3: COIN 1 > insurgent 0 → pop 1
    assert.equal(sumControlledPopulation(state, spaces, isCoinControlled, DEFAULT_FACTION_CONFIG), 3);
  });
});

// ─── countTokensInZone ───────────────────────────────────────────────────────

describe('countTokensInZone', () => {
  it('counts all tokens when no faction filter', () => {
    const state = makeState({
      'zone-a': [makeFactionToken('t1', 'US'), makeFactionToken('t2', 'NVA')],
    });
    assert.equal(countTokensInZone(state, 'zone-a'), 2);
  });

  it('counts only matching faction tokens when filtered', () => {
    const state = makeState({
      'zone-a': [makeFactionToken('t1', 'US'), makeFactionToken('t2', 'NVA')],
    });
    assert.equal(countTokensInZone(state, 'zone-a', ['US'], 'faction'), 1);
  });

  it('returns 0 for missing zone', () => {
    const state = makeState({});
    assert.equal(countTokensInZone(state, 'nonexistent'), 0);
  });
});

// ─── countBasesOnMap ─────────────────────────────────────────────────────────

describe('countBasesOnMap', () => {
  it('counts bases of a specific faction across all map spaces', () => {
    const spaces: readonly MapSpaceDef[] = [
      makeSpace({ id: 's1' }),
      makeSpace({ id: 's2' }),
      makeSpace({ id: 's3' }),
    ];
    const state = makeState({
      s1: [
        { id: asTokenId('b1'), type: 'base', props: { faction: 'VC' } },
        { id: asTokenId('g1'), type: 'guerrilla', props: { faction: 'VC' } },
      ],
      s2: [{ id: asTokenId('b2'), type: 'base', props: { faction: 'NVA' } }],
      s3: [{ id: asTokenId('b3'), type: 'base', props: { faction: 'VC' } }],
    });
    assert.equal(countBasesOnMap(state, spaces, 'VC', ['base'], 'faction'), 2);
  });
});

// ─── computeVictoryMarker ────────────────────────────────────────────────────

describe('computeVictoryMarker', () => {
  // Build a small scenario for victory tests:
  // Spaces: s1 (pop 2, active support), s2 (pop 1, passive support), s3 (pop 3, neutral)
  // Total Support = 2×2 + 1×1 + 3×0 = 5
  // Total Opposition = 2×0 + 1×0 + 3×0 = 0
  const spaces: readonly MapSpaceDef[] = [
    makeSpace({ id: 's1', population: 2 }),
    makeSpace({ id: 's2', population: 1 }),
    makeSpace({ id: 's3', population: 3 }),
  ];
  const markerStates: Record<string, string> = {
    s1: 'activeSupport',
    s2: 'passiveSupport',
    s3: 'neutral',
  };

  it('markerTotalPlusZoneCount: Total Support (5) + available pieces (3) = 8', () => {
    const state = makeState({
      s1: [],
      s2: [],
      s3: [],
      available: [
        makeFactionToken('a1', 'US'),
        makeFactionToken('a2', 'US'),
        makeFactionToken('a3', 'US'),
      ],
    });
    const formula: VictoryFormula = {
      type: 'markerTotalPlusZoneCount',
      markerConfig: SUPPORT_CONFIG,
      countZone: 'available',
    };
    assert.equal(computeVictoryMarker(state, spaces, markerStates, DEFAULT_FACTION_CONFIG, formula), 8);
  });

  it('markerTotalPlusMapBases: Total Opposition (3) + VC bases on map (1) = 4', () => {
    const oppSpaces: readonly MapSpaceDef[] = [
      makeSpace({ id: 's1', population: 1 }),
      makeSpace({ id: 's2', population: 1 }),
    ];
    const oppMarkers: Record<string, string> = {
      s1: 'activeOpposition',
      s2: 'passiveOpposition',
    };
    // Opposition = 1×2 + 1×1 = 3
    const state = makeState({
      s1: [{ id: asTokenId('b1'), type: 'base', props: { faction: 'VC' } }],
      s2: [],
    });
    const formula: VictoryFormula = {
      type: 'markerTotalPlusMapBases',
      markerConfig: OPPOSITION_CONFIG,
      baseFaction: 'VC',
      basePieceTypes: ['base'],
    };
    assert.equal(computeVictoryMarker(state, oppSpaces, oppMarkers, DEFAULT_FACTION_CONFIG, formula), 4);
  });

  it('controlledPopulationPlusMapBases (solo): pop of solo-controlled (6) + bases (2) = 8', () => {
    const nvaSpaces: readonly MapSpaceDef[] = [
      makeSpace({ id: 's1', population: 3 }),
      makeSpace({ id: 's2', population: 3 }),
      makeSpace({ id: 's3', population: 2 }),
    ];
    const state = makeState({
      // s1: NVA 3 vs others 1 → NVA controlled → pop 3
      s1: [
        makeFactionToken('n1', 'NVA'),
        makeFactionToken('n2', 'NVA'),
        makeFactionToken('n3', 'NVA'),
        makeFactionToken('u1', 'US'),
        { id: asTokenId('b1'), type: 'base', props: { faction: 'NVA' } },
      ],
      // s2: NVA 2 vs others 1 → NVA controlled → pop 3
      s2: [
        makeFactionToken('n4', 'NVA'),
        makeFactionToken('n5', 'NVA'),
        makeFactionToken('v1', 'VC'),
        { id: asTokenId('b2'), type: 'base', props: { faction: 'NVA' } },
      ],
      // s3: NVA 1 vs others 1 → NOT NVA controlled → excluded
      s3: [
        makeFactionToken('n6', 'NVA'),
        makeFactionToken('u2', 'US'),
      ],
    });
    const formula: VictoryFormula = {
      type: 'controlledPopulationPlusMapBases',
      controlFn: 'solo',
      baseFaction: 'NVA',
      basePieceTypes: ['base'],
    };
    assert.equal(computeVictoryMarker(state, nvaSpaces, {}, DEFAULT_FACTION_CONFIG, formula), 8);
  });

  it('controlledPopulationPlusGlobalVar (COIN): pop of COIN-controlled (4) + Patronage (18) = 22', () => {
    const arvnSpaces: readonly MapSpaceDef[] = [
      makeSpace({ id: 's1', population: 2 }),
      makeSpace({ id: 's2', population: 2 }),
      makeSpace({ id: 's3', population: 3 }),
    ];
    const state = makeState(
      {
        // s1: COIN 2 > insurgent 1 → controlled → pop 2
        s1: [makeFactionToken('u1', 'US'), makeFactionToken('a1', 'ARVN'), makeFactionToken('n1', 'NVA')],
        // s2: COIN 1 > insurgent 0 → controlled → pop 2
        s2: [makeFactionToken('a2', 'ARVN')],
        // s3: COIN 0 < insurgent 1 → not controlled
        s3: [makeFactionToken('n2', 'NVA')],
      },
      { patronage: 18 },
    );
    const formula: VictoryFormula = {
      type: 'controlledPopulationPlusGlobalVar',
      controlFn: 'coin',
      varName: 'patronage',
    };
    assert.equal(computeVictoryMarker(state, arvnSpaces, {}, DEFAULT_FACTION_CONFIG, formula), 22);
  });
});
