import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  synthesizeDerivedMetricsFromStandings,
  FORMULA_TYPE_TO_COMPUTATION_REQUIREMENTS,
} from '../../../src/cnl/synthesize-derived-metrics.js';
import type { DerivedMetricDef, VictoryStandingsDef } from '../../../src/kernel/types-core.js';
import type { MarkerWeightConfig, SeatGroupConfig } from '../../../src/kernel/derived-values.js';

const STUB_SEAT_GROUP: SeatGroupConfig = {
  coinSeats: ['US', 'ARVN'],
  insurgentSeats: ['VC', 'NVA'],
  soloSeat: 'NVA',
  seatProp: 'faction',
};

const STUB_MARKER_CONFIG: MarkerWeightConfig = {
  activeState: 'activeSupport',
  passiveState: 'passiveSupport',
};

function makeStandings(formulaTypes: readonly string[]): VictoryStandingsDef {
  return {
    seatGroupConfig: STUB_SEAT_GROUP,
    markerConfigs: { support: STUB_MARKER_CONFIG },
    markerName: 'supportOpposition',
    defaultMarkerState: 'neutral',
    entries: formulaTypes.map((type, i) => ({
      seat: `seat-${i}`,
      threshold: 0,
      formula:
        type === 'markerTotalPlusZoneCount'
          ? { type: 'markerTotalPlusZoneCount' as const, markerConfig: STUB_MARKER_CONFIG, countZone: 'z' }
          : type === 'markerTotalPlusMapBases'
            ? { type: 'markerTotalPlusMapBases' as const, markerConfig: STUB_MARKER_CONFIG, baseSeat: 's', basePieceTypes: ['b'] }
            : type === 'controlledPopulationPlusMapBases'
              ? { type: 'controlledPopulationPlusMapBases' as const, controlFn: 'coin' as const, baseSeat: 's', basePieceTypes: ['b'] }
              : { type: 'controlledPopulationPlusGlobalVar' as const, controlFn: 'coin' as const, varName: 'v' },
    })),
    tieBreakOrder: formulaTypes.map((_, i) => `seat-${i}`),
  };
}

describe('synthesizeDerivedMetricsFromStandings', () => {
  it('returns [] for null victoryStandings', () => {
    const result = synthesizeDerivedMetricsFromStandings(null, null, []);
    assert.deepEqual(result, []);
  });

  it('produces markerTotal metric for markerTotalPlusZoneCount formula', () => {
    const standings = makeStandings(['markerTotalPlusZoneCount']);
    const result = synthesizeDerivedMetricsFromStandings(standings, null, []);
    assert.equal(result.length, 1);
    assert.equal(result[0]!.computation, 'markerTotal');
    assert.equal(result[0]!.id, 'auto:victory:markerTotal');
    assert.deepEqual(result[0]!.zoneFilter, { zoneKinds: ['board'] });
    assert.deepEqual(result[0]!.requirements, [{ key: 'population', expectedType: 'number' }]);
  });

  it('produces controlledPopulation metric for controlledPopulationPlusMapBases formula', () => {
    const standings = makeStandings(['controlledPopulationPlusMapBases']);
    const result = synthesizeDerivedMetricsFromStandings(standings, null, []);
    assert.equal(result.length, 1);
    assert.equal(result[0]!.computation, 'controlledPopulation');
  });

  it('produces two distinct metrics when both computation types are used', () => {
    const standings = makeStandings(['markerTotalPlusZoneCount', 'controlledPopulationPlusGlobalVar']);
    const result = synthesizeDerivedMetricsFromStandings(standings, null, []);
    assert.equal(result.length, 2);
    const computations = new Set(result.map((m) => m.computation));
    assert.ok(computations.has('markerTotal'));
    assert.ok(computations.has('controlledPopulation'));
  });

  it('deduplicates when multiple entries use the same computation', () => {
    const standings = makeStandings(['markerTotalPlusZoneCount', 'markerTotalPlusMapBases']);
    const result = synthesizeDerivedMetricsFromStandings(standings, null, []);
    assert.equal(result.length, 1);
    assert.equal(result[0]!.computation, 'markerTotal');
  });

  it('skips computation already covered by manual metrics', () => {
    const standings = makeStandings(['markerTotalPlusZoneCount', 'controlledPopulationPlusGlobalVar']);
    const manualMetrics: readonly DerivedMetricDef[] = [
      {
        id: 'manual-marker',
        computation: 'markerTotal',
        requirements: [{ key: 'population', expectedType: 'number' }],
      },
    ];
    const result = synthesizeDerivedMetricsFromStandings(standings, manualMetrics, []);
    assert.equal(result.length, 1);
    assert.equal(result[0]!.computation, 'controlledPopulation');
  });

  it('adds missing computation when manual metrics cover a different one', () => {
    const standings = makeStandings(['markerTotalPlusZoneCount']);
    const manualMetrics: readonly DerivedMetricDef[] = [
      {
        id: 'manual-pop',
        computation: 'controlledPopulation',
        requirements: [{ key: 'population', expectedType: 'number' }],
      },
    ];
    const result = synthesizeDerivedMetricsFromStandings(standings, manualMetrics, []);
    assert.equal(result.length, 1);
    assert.equal(result[0]!.computation, 'markerTotal');
  });

  it('mapping covers all four formula types', () => {
    const expectedTypes = [
      'markerTotalPlusZoneCount',
      'markerTotalPlusMapBases',
      'controlledPopulationPlusMapBases',
      'controlledPopulationPlusGlobalVar',
    ] as const;
    for (const ft of expectedTypes) {
      assert.ok(
        FORMULA_TYPE_TO_COMPUTATION_REQUIREMENTS[ft] !== undefined,
        `Missing mapping for formula type: ${ft}`,
      );
    }
  });
});
