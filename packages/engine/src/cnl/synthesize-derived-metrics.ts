import type { Diagnostic } from '../kernel/diagnostics.js';
import type { DerivedMetricComputation, DerivedMetricDef, VictoryStandingsDef } from '../kernel/types-core.js';
import type { VictoryFormula } from '../kernel/derived-values.js';

interface SynthesizedMetricTemplate {
  readonly id: string;
  readonly computation: DerivedMetricComputation;
  readonly requirements: readonly { readonly key: string; readonly expectedType: 'number' }[];
  readonly runtime: DerivedMetricDef['runtime'];
}

/**
 * Maps each victory formula type to the derived-metric computation it requires
 * and the zone-attribute contracts that computation needs.
 */
export const FORMULA_TYPE_TO_COMPUTATION_REQUIREMENTS: Readonly<
  Record<VictoryFormula['type'], {
    readonly computation: DerivedMetricComputation;
    readonly requirements: readonly { readonly key: string; readonly expectedType: 'number' }[];
  }>
> = {
  markerTotalPlusZoneCount: {
    computation: 'markerTotal',
    requirements: [{ key: 'population', expectedType: 'number' }],
  },
  markerTotalPlusMapBases: {
    computation: 'markerTotal',
    requirements: [{ key: 'population', expectedType: 'number' }],
  },
  controlledPopulationPlusMapBases: {
    computation: 'controlledPopulation',
    requirements: [{ key: 'population', expectedType: 'number' }],
  },
  controlledPopulationPlusGlobalVar: {
    computation: 'controlledPopulation',
    requirements: [{ key: 'population', expectedType: 'number' }],
  },
};

/**
 * Auto-synthesize `DerivedMetricDef[]` from victory-standings formulas.
 *
 * Each formula type maps to a known computation + attribute requirements.
 * Computations already covered by `manualMetrics` are skipped.
 * Returns deduplicated metrics with `id: 'auto:victory:{computation}'`.
 */
export function synthesizeDerivedMetricsFromStandings(
  victoryStandings: VictoryStandingsDef | null,
  manualMetrics: readonly DerivedMetricDef[] | null,
  _diagnostics: Diagnostic[],
): readonly DerivedMetricDef[] {
  if (victoryStandings === null) {
    return [];
  }

  const manualComputations = new Set(
    (manualMetrics ?? []).map((m) => m.computation),
  );

  const neededMetrics = new Map<string, SynthesizedMetricTemplate>();

  for (const entry of victoryStandings.entries) {
    const req = FORMULA_TYPE_TO_COMPUTATION_REQUIREMENTS[entry.formula.type];
    if (manualComputations.has(req.computation)) {
      continue;
    }

    const synthesized = synthesizeMetricFromFormula(victoryStandings, entry.formula, req);
    if (!neededMetrics.has(synthesized.id)) {
      neededMetrics.set(synthesized.id, synthesized);
    }
  }

  const synthesized: DerivedMetricDef[] = [];
  for (const metric of neededMetrics.values()) {
    synthesized.push({
      id: metric.id,
      computation: metric.computation,
      zoneFilter: { zoneKinds: ['board'] },
      requirements: metric.requirements,
      runtime: metric.runtime,
    });
  }

  return synthesized;
}

function synthesizeMetricFromFormula(
  standings: VictoryStandingsDef,
  formula: VictoryFormula,
  requirements: {
    readonly computation: DerivedMetricComputation;
    readonly requirements: readonly { readonly key: string; readonly expectedType: 'number' }[];
  },
): SynthesizedMetricTemplate {
  switch (formula.type) {
    case 'markerTotalPlusZoneCount':
    case 'markerTotalPlusMapBases':
      return {
        id: [
          'auto:victory',
          requirements.computation,
          standings.markerName,
          formula.markerConfig.activeState,
          formula.markerConfig.passiveState,
        ].join(':'),
        computation: requirements.computation,
        requirements: requirements.requirements,
        runtime: {
          kind: 'markerTotal',
          markerId: standings.markerName,
          markerConfig: formula.markerConfig,
          defaultMarkerState: standings.defaultMarkerState,
        },
      };
    case 'controlledPopulationPlusMapBases':
    case 'controlledPopulationPlusGlobalVar':
      return {
        id: ['auto:victory', requirements.computation, formula.controlFn].join(':'),
        computation: requirements.computation,
        requirements: requirements.requirements,
        runtime: {
          kind: 'controlledPopulation',
          controlFn: formula.controlFn,
          seatGroupConfig: standings.seatGroupConfig,
        },
      };
  }
}
