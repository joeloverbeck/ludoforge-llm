import type { Diagnostic } from '../kernel/diagnostics.js';
import type { DerivedMetricComputation, DerivedMetricDef, VictoryStandingsDef } from '../kernel/types-core.js';
import type { VictoryFormula } from '../kernel/derived-values.js';

interface ComputationRequirements {
  readonly computation: DerivedMetricComputation;
  readonly requirements: readonly { readonly key: string; readonly expectedType: 'number' }[];
}

/**
 * Maps each victory formula type to the derived-metric computation it requires
 * and the zone-attribute contracts that computation needs.
 */
export const FORMULA_TYPE_TO_COMPUTATION_REQUIREMENTS: Readonly<
  Record<VictoryFormula['type'], ComputationRequirements>
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

  const neededComputations = new Map<DerivedMetricComputation, ComputationRequirements>();

  for (const entry of victoryStandings.entries) {
    const req = FORMULA_TYPE_TO_COMPUTATION_REQUIREMENTS[entry.formula.type];
    if (!manualComputations.has(req.computation) && !neededComputations.has(req.computation)) {
      neededComputations.set(req.computation, req);
    }
  }

  const synthesized: DerivedMetricDef[] = [];
  for (const [computation, req] of neededComputations) {
    synthesized.push({
      id: `auto:victory:${computation}`,
      computation,
      zoneFilter: { zoneKinds: ['board'] },
      requirements: req.requirements,
    });
  }

  return synthesized;
}
