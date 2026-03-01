import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asTokenId,
  initialState,
  terminalResult,
  type GameDef,
  type GameState,
  type TerminalResult,
  type VictoryTerminalRankingEntry,
} from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

/**
 * Tests that verify Rule 1.6.2: "Active Support or Opposition counts double
 * Population for Total Support or Opposition."
 *
 * Total Support  = 2 × Pop(Active Support) + 1 × Pop(Passive Support)
 * Total Opposition = 2 × Pop(Active Opposition) + 1 × Pop(Passive Opposition)
 *
 * These tests exercise the compiled `if/when/then/else` valueExpr ASTs in the
 * production terminal definition (90-terminal.md) through the full kernel
 * expression evaluation pipeline.
 */

const compileProductionDef = (): GameDef => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assert.equal(compiled.diagnostics.some((d) => d.severity === 'error'), false);
  assert.notEqual(compiled.gameDef, null);
  return compiled.gameDef!;
};

/**
 * Clear all zones to a known empty state so we can construct precise
 * population/support scenarios without interference from initial tokens.
 */
const withClearedZones = (state: GameState): GameState => ({
  ...state,
  zones: Object.fromEntries(Object.keys(state.zones).map((zoneId) => [zoneId, []])),
});

/**
 * Build a markers record that assigns a supportOpposition state to specific
 * zones. All other zones remain unmarked (will use the lattice default).
 */
const buildSupportMarkers = (
  assignments: ReadonlyArray<readonly [string, string]>,
): Readonly<Record<string, Readonly<Record<string, string>>>> =>
  Object.fromEntries(
    assignments.map(([zoneId, markerValue]) => [
      zoneId,
      { supportOpposition: markerValue },
    ]),
  );

/**
 * Create a during-coup state (played zone contains a coup card) with specific
 * marker assignments and optional available-US pieces.
 */
const buildDuringCoupState = (
  def: GameDef,
  seed: number,
  markerAssignments: ReadonlyArray<readonly [string, string]>,
  availableUsPieces: number,
): GameState => {
  const start = withClearedZones(initialState(def, seed, 4).state);
  const usReserve = Array.from({ length: availableUsPieces }, (_unused, index) => ({
    id: asTokenId(`us-piece-${index}`),
    type: 'piece' as const,
    props: { faction: 'US', type: 'troops' as const },
  }));
  return {
    ...start,
    globalVars: {
      ...start.globalVars,
      patronage: 0,
    },
    markers: buildSupportMarkers(markerAssignments),
    zones: {
      ...start.zones,
      'played:none': [{ id: asTokenId('coup-card'), type: 'card', props: { isCoup: true } }],
      'lookahead:none': [{ id: asTokenId('non-coup'), type: 'card', props: { isCoup: false } }],
      'available-US:none': usReserve,
    },
  };
};

/**
 * Create a final-coup state (played has coup card, deck and lookahead empty)
 * to trigger margin-based ranking.
 */
const buildFinalCoupState = (
  def: GameDef,
  seed: number,
  markerAssignments: ReadonlyArray<readonly [string, string]>,
  availableUsPieces: number,
  vcBasesOnMap: ReadonlyArray<{ readonly zoneId: string }> = [],
): GameState => {
  const start = withClearedZones(initialState(def, seed, 4).state);
  const usReserve = Array.from({ length: availableUsPieces }, (_unused, index) => ({
    id: asTokenId(`us-piece-${index}`),
    type: 'piece' as const,
    props: { faction: 'US', type: 'troops' as const },
  }));

  // Place VC bases on map spaces for VC margin calculation.
  const zonesWithBases = { ...start.zones };
  for (const { zoneId } of vcBasesOnMap) {
    const existing = zonesWithBases[zoneId] ?? [];
    zonesWithBases[zoneId] = [
      ...existing,
      { id: asTokenId(`vc-base-${zoneId}`), type: 'base', props: { faction: 'VC', type: 'base' } },
    ];
  }

  return {
    ...start,
    globalVars: {
      ...start.globalVars,
      patronage: 0,
    },
    markers: buildSupportMarkers(markerAssignments),
    zones: {
      ...zonesWithBases,
      'played:none': [{ id: asTokenId('coup-card'), type: 'card', props: { isCoup: true } }],
      'lookahead:none': [],
      'deck:none': [],
      'available-US:none': usReserve,
    },
  };
};

/**
 * Assert result is a win with final-coup ranking, then return the ranking.
 */
const assertFinalCoupWin = (result: TerminalResult | null): readonly VictoryTerminalRankingEntry[] => {
  assert.notEqual(result, null, 'Expected a terminal result');
  assert.equal(result!.type, 'win');
  if (result!.type !== 'win') throw new Error('unreachable');
  assert.ok(result!.victory, 'Expected victory metadata');
  assert.ok(result!.victory!.ranking, 'Expected ranking in victory metadata');
  return result!.victory!.ranking!;
};

/**
 * Extract the margin for a specific seat from a ranking.
 */
const marginForSeat = (ranking: readonly VictoryTerminalRankingEntry[], seat: string): number => {
  const entry = ranking.find((e) => e.seat === seat);
  assert.ok(entry, `Expected ranking entry for seat ${seat}`);
  return entry!.margin;
};

describe('FITL active support/opposition doubling in victory calculations', () => {
  // -----------------------------------------------------------------------
  // Production FITL zones used in these tests:
  //   hue:none        — city, population 2
  //   saigon:none     — city, population 6
  //   da-nang:none    — city, population 1
  //   kontum:none     — city, population 1
  //
  // US victory threshold: Total Support + available US pieces > 50
  // VC victory threshold: Total Opposition + VC bases on map > 35
  // -----------------------------------------------------------------------

  describe('US victory checkpoint — active support doubling', () => {
    it('doubles population for active support in the Total Support sum', () => {
      // Saigon (pop 6) as Active Support: contributes 12, not 6.
      // With 39 available US pieces: 12 + 39 = 51, one above threshold.
      const def = compileProductionDef();
      const state = buildDuringCoupState(
        def,
        8001,
        [['saigon:none', 'activeSupport']],
        39,
      );
      const result = terminalResult(def, state);
      assert.notEqual(result, null, 'US should win: Active Support(6) x 2 = 12, + 39 pieces = 51 > 50');
      assert.equal(result!.type, 'win');
      assert.deepEqual(result!.victory, {
        timing: 'duringCoup',
        checkpointId: 'us-victory',
        winnerSeat: 'US',
        ranking: [
          { seat: 'US', margin: 1, rank: 1, tieBreakKey: 'US' },
          { seat: 'NVA', margin: -18, rank: 2, tieBreakKey: 'NVA' },
          { seat: 'VC', margin: -35, rank: 3, tieBreakKey: 'VC' },
          { seat: 'ARVN', margin: -50, rank: 4, tieBreakKey: 'ARVN' },
        ],
      });
    });

    it('does NOT double population for passive support', () => {
      // Saigon (pop 6) as Passive Support: contributes 6, not 12.
      // With 38 available US pieces: 6 + 38 = 44, below 50 threshold.
      const def = compileProductionDef();
      const state = buildDuringCoupState(
        def,
        8002,
        [['saigon:none', 'passiveSupport']],
        38,
      );
      const result = terminalResult(def, state);
      assert.equal(result, null, 'US should NOT win: Passive Support(6) x 1 = 6, + 38 pieces = 44 < 50');
    });

    it('correctly sums mixed active and passive support with doubling', () => {
      // Saigon (pop 6) Active Support: 6 x 2 = 12
      // Hue (pop 2) Passive Support: 2 x 1 = 2
      // Da Nang (pop 1) Active Support: 1 x 2 = 2
      // Total Support = 12 + 2 + 2 = 16
      // Available US pieces = 34
      // Grand total = 16 + 35 = 51, one above threshold.
      const def = compileProductionDef();
      const state = buildDuringCoupState(
        def,
        8003,
        [
          ['saigon:none', 'activeSupport'],
          ['hue:none', 'passiveSupport'],
          ['da-nang:none', 'activeSupport'],
        ],
        35,
      );
      const result = terminalResult(def, state);
      assert.notEqual(result, null, 'US should win: Active(6)x2 + Passive(2)x1 + Active(1)x2 = 16, + 35 pieces = 51 > 50');
      assert.equal(result!.type, 'win');
      assert.deepEqual(result!.victory, {
        timing: 'duringCoup',
        checkpointId: 'us-victory',
        winnerSeat: 'US',
        ranking: [
          { seat: 'US', margin: 1, rank: 1, tieBreakKey: 'US' },
          { seat: 'NVA', margin: -18, rank: 2, tieBreakKey: 'NVA' },
          { seat: 'VC', margin: -35, rank: 3, tieBreakKey: 'VC' },
          { seat: 'ARVN', margin: -50, rank: 4, tieBreakKey: 'ARVN' },
        ],
      });
    });

    it('fails victory when active support is needed but only passive is present', () => {
      // Saigon (pop 6) Active Support: 6 x 2 = 12
      // Hue (pop 2) Active Support: 2 x 2 = 4
      // Total Support = 16
      // Available US pieces = 35
      // Grand total = 51 → should win.
      //
      // But if BOTH were Passive instead:
      // Total Support = 6 + 2 = 8
      // Grand total = 8 + 34 = 42 → should NOT win.
      const def = compileProductionDef();
      const passiveState = buildDuringCoupState(
        def,
        8004,
        [
          ['saigon:none', 'passiveSupport'],
          ['hue:none', 'passiveSupport'],
        ],
        35,
      );
      assert.equal(terminalResult(def, passiveState), null,
        'Should NOT win with passive-only support: 6 + 2 + 35 = 43 <= 50');

      const activeState = buildDuringCoupState(
        def,
        8005,
        [
          ['saigon:none', 'activeSupport'],
          ['hue:none', 'activeSupport'],
        ],
        35,
      );
      const activeResult = terminalResult(def, activeState);
      assert.notEqual(activeResult, null,
        'SHOULD win with active support: 12 + 4 + 35 = 51 > 50');
    });
  });

  describe('VC victory checkpoint — active opposition doubling', () => {
    it('doubles population for active opposition in the Total Opposition sum', () => {
      // Saigon (pop 6) as Active Opposition: contributes 12.
      // Hue (pop 2) as Active Opposition: contributes 4.
      // Total Opposition = 16
      // VC bases on map = 20  →  16 + 20 = 36, one above threshold.
      const def = compileProductionDef();
      const start = withClearedZones(initialState(def, 8010, 4).state);

      // Place 20 VC bases on map spaces.
      const baseZones = ['saigon:none', 'hue:none', 'da-nang:none', 'kontum:none'];
      const vcBaseCount = 20;
      const zonesWithBases = { ...start.zones };
      for (let index = 0; index < vcBaseCount; index += 1) {
        const zoneId = baseZones[index % baseZones.length]!;
        const existing = zonesWithBases[zoneId] ?? [];
        zonesWithBases[zoneId] = [
          ...existing,
          { id: asTokenId(`vc-base-${zoneId}-${index}`), type: 'base', props: { faction: 'VC', type: 'base' } },
        ];
      }

      const state: GameState = {
        ...start,
        globalVars: { ...start.globalVars, patronage: 0 },
        markers: buildSupportMarkers([
          ['saigon:none', 'activeOpposition'],
          ['hue:none', 'activeOpposition'],
        ]),
        zones: {
          ...zonesWithBases,
          'played:none': [{ id: asTokenId('coup-card'), type: 'card', props: { isCoup: true } }],
          'lookahead:none': [{ id: asTokenId('non-coup'), type: 'card', props: { isCoup: false } }],
        },
      };

      const result = terminalResult(def, state);
      assert.notEqual(result, null, 'VC should win: Active Opp(6)x2 + Active Opp(2)x2 = 16, + 20 bases = 36 > 35');
      assert.equal(result!.type, 'win');
      assert.deepEqual(result!.victory, {
        timing: 'duringCoup',
        checkpointId: 'vc-victory',
        winnerSeat: 'VC',
        ranking: [
          { seat: 'VC', margin: 1, rank: 1, tieBreakKey: 'VC' },
          { seat: 'NVA', margin: -18, rank: 2, tieBreakKey: 'NVA' },
          { seat: 'ARVN', margin: -50, rank: 3, tieBreakKey: 'ARVN' },
          { seat: 'US', margin: -50, rank: 4, tieBreakKey: 'US' },
        ],
      });
    });

    it('does NOT double population for passive opposition', () => {
      // Same setup but passive: Saigon(6) + Hue(2) = 8, + 20 bases = 28 < 35.
      const def = compileProductionDef();
      const start = withClearedZones(initialState(def, 8011, 4).state);

      const baseZones = ['saigon:none', 'hue:none', 'da-nang:none', 'kontum:none'];
      const vcBaseCount = 20;
      const zonesWithBases = { ...start.zones };
      for (let index = 0; index < vcBaseCount; index += 1) {
        const zoneId = baseZones[index % baseZones.length]!;
        const existing = zonesWithBases[zoneId] ?? [];
        zonesWithBases[zoneId] = [
          ...existing,
          { id: asTokenId(`vc-base-${zoneId}-${index}`), type: 'base', props: { faction: 'VC', type: 'base' } },
        ];
      }

      const state: GameState = {
        ...start,
        globalVars: { ...start.globalVars, patronage: 0 },
        markers: buildSupportMarkers([
          ['saigon:none', 'passiveOpposition'],
          ['hue:none', 'passiveOpposition'],
        ]),
        zones: {
          ...zonesWithBases,
          'played:none': [{ id: asTokenId('coup-card'), type: 'card', props: { isCoup: true } }],
          'lookahead:none': [{ id: asTokenId('non-coup'), type: 'card', props: { isCoup: false } }],
        },
      };

      assert.equal(terminalResult(def, state), null,
        'VC should NOT win: Passive Opp(6)x1 + Passive Opp(2)x1 = 8, + 20 bases = 28 <= 35');
    });
  });

  describe('final-coup margin ranking — active doubling affects margins', () => {
    it('active support produces higher US margin than passive support', () => {
      const def = compileProductionDef();

      // Active scenario: Saigon (pop 6) Active Support → contributes 12
      const activeState = buildFinalCoupState(
        def,
        8020,
        [['saigon:none', 'activeSupport']],
        0,
      );
      const activeRanking = assertFinalCoupWin(terminalResult(def, activeState));

      // Passive scenario: Saigon (pop 6) Passive Support → contributes 6
      const passiveState = buildFinalCoupState(
        def,
        8021,
        [['saigon:none', 'passiveSupport']],
        0,
      );
      const passiveRanking = assertFinalCoupWin(terminalResult(def, passiveState));

      // Extract US margins from rankings.
      const activeUsMargin = marginForSeat(activeRanking, 'US');
      const passiveUsMargin = marginForSeat(passiveRanking, 'US');

      assert.ok(
        activeUsMargin > passiveUsMargin,
        `Active US margin (${activeUsMargin}) should exceed passive (${passiveUsMargin}) by pop x 1 = 6`,
      );
      assert.equal(
        activeUsMargin - passiveUsMargin,
        6,
        'Difference should equal Saigon population (6): active contributes 12, passive contributes 6',
      );
    });

    it('active opposition produces higher VC margin than passive opposition', () => {
      const def = compileProductionDef();

      // Active scenario: Saigon (pop 6) Active Opposition → contributes 12
      const activeState = buildFinalCoupState(
        def,
        8022,
        [['saigon:none', 'activeOpposition']],
        0,
        [{ zoneId: 'saigon:none' }],
      );
      const activeRanking = assertFinalCoupWin(terminalResult(def, activeState));

      // Passive scenario: Saigon (pop 6) Passive Opposition → contributes 6
      const passiveState = buildFinalCoupState(
        def,
        8023,
        [['saigon:none', 'passiveOpposition']],
        0,
        [{ zoneId: 'saigon:none' }],
      );
      const passiveRanking = assertFinalCoupWin(terminalResult(def, passiveState));

      const activeVcMargin = marginForSeat(activeRanking, 'VC');
      const passiveVcMargin = marginForSeat(passiveRanking, 'VC');

      assert.ok(
        activeVcMargin > passiveVcMargin,
        `Active VC margin (${activeVcMargin}) should exceed passive (${passiveVcMargin}) by pop x 1 = 6`,
      );
      assert.equal(
        activeVcMargin - passiveVcMargin,
        6,
        'Difference should equal Saigon population (6): active contributes 12, passive contributes 6',
      );
    });

    it('verifies exact margin values for a multi-zone mixed support/opposition scenario', () => {
      const def = compileProductionDef();

      // Saigon (pop 6): Active Support → 12 to US, 0 to VC
      // Hue (pop 2): Active Opposition → 0 to US, 4 to VC
      // Da Nang (pop 1): Passive Support → 1 to US, 0 to VC
      // Kontum (pop 1): Passive Opposition → 0 to US, 1 to VC
      //
      // US Total Support = 12 + 1 = 13
      // US margin = Total Support + available pieces - 50 = 13 + 0 - 50 = -37
      //
      // VC Total Opposition = 4 + 1 = 5
      // VC margin = Total Opposition + VC bases on map - 35 = 5 + 2 - 35 = -28
      const state = buildFinalCoupState(
        def,
        8024,
        [
          ['saigon:none', 'activeSupport'],
          ['hue:none', 'activeOpposition'],
          ['da-nang:none', 'passiveSupport'],
          ['kontum:none', 'passiveOpposition'],
        ],
        0,
        [{ zoneId: 'hue:none' }, { zoneId: 'kontum:none' }],
      );

      const ranking = assertFinalCoupWin(terminalResult(def, state));

      const usMargin = marginForSeat(ranking, 'US');
      const vcMargin = marginForSeat(ranking, 'VC');

      assert.equal(usMargin, -37,
        'US margin = Active Support Saigon(6x2=12) + Passive Support Da Nang(1x1=1) + 0 pieces - 50 = -37');
      assert.equal(vcMargin, -28,
        'VC margin = Active Opp Hue(2x2=4) + Passive Opp Kontum(1x1=1) + 2 VC bases - 35 = -28');
    });
  });

  describe('neutral and unrelated markers do not contribute', () => {
    it('neutral spaces contribute zero to both support and opposition totals', () => {
      const def = compileProductionDef();

      // Saigon (pop 6) neutral → 0 to both US and VC totals
      // Da Nang (pop 1) Active Support → 2 to US
      const state = buildFinalCoupState(
        def,
        8030,
        [
          ['saigon:none', 'neutral'],
          ['da-nang:none', 'activeSupport'],
        ],
        0,
      );

      const ranking = assertFinalCoupWin(terminalResult(def, state));
      const usMargin = marginForSeat(ranking, 'US');

      // US margin = Active Support Da Nang(1x2=2) + 0 pieces - 50 = -48
      // Saigon neutral contributes 0 despite pop 6.
      assert.equal(usMargin, -48,
        'Neutral Saigon(pop 6) should contribute 0; US margin = Active Da Nang(1x2=2) - 50 = -48');
    });
  });
});
