import {
  tryCompileCondition,
  tryCompileTokenFilter,
  tryCompileValueExpr,
  type ConditionAST,
  type GameDef,
  type NumericValueExpr,
  type OptionsQuery,
  type TokenFilterExpr,
  type ValueExpr,
} from '../../../src/kernel/index.js';
import { walkTokenFilterExpr } from '../../../src/kernel/token-filter-expr-utils.js';

export interface CompilationCoverageBucket {
  readonly compiled: number;
  readonly total: number;
}

export interface CompilationCoverageSummary {
  readonly conditions: CompilationCoverageBucket;
  readonly values: CompilationCoverageBucket;
  readonly tokenFilters: CompilationCoverageBucket;
}

type MutableCompilationCoverageSummary = {
  -readonly [K in keyof CompilationCoverageSummary]: {
    compiled: number;
    total: number;
  };
};

const createSummary = (): MutableCompilationCoverageSummary => ({
  conditions: { compiled: 0, total: 0 },
  values: { compiled: 0, total: 0 },
  tokenFilters: { compiled: 0, total: 0 },
});

const recordCondition = (
  summary: MutableCompilationCoverageSummary,
  condition: ConditionAST,
): void => {
  summary.conditions.total += 1;
  if (tryCompileCondition(condition) !== null) {
    summary.conditions.compiled += 1;
  }
};

const recordValueExpr = (
  summary: MutableCompilationCoverageSummary,
  expr: ValueExpr,
): void => {
  summary.values.total += 1;
  if (tryCompileValueExpr(expr) !== null) {
    summary.values.compiled += 1;
  }
};

const recordTokenFilter = (
  summary: MutableCompilationCoverageSummary,
  expr: TokenFilterExpr,
): void => {
  walkTokenFilterExpr(expr, (entry) => {
    summary.tokenFilters.total += 1;
    if (tryCompileTokenFilter(entry) !== null) {
      summary.tokenFilters.compiled += 1;
    }
  });
};

const walkNumericValueExpr = (
  summary: MutableCompilationCoverageSummary,
  expr: NumericValueExpr,
): void => {
  walkValueExpr(summary, expr as ValueExpr);
};

const walkCondition = (
  summary: MutableCompilationCoverageSummary,
  condition: ConditionAST,
): void => {
  recordCondition(summary, condition);

  if (typeof condition === 'boolean') {
    return;
  }

  switch (condition.op) {
    case 'and':
    case 'or':
      condition.args.forEach((arg) => {
        walkCondition(summary, arg);
      });
      return;
    case 'not':
      walkCondition(summary, condition.arg);
      return;
    case '==':
    case '!=':
    case '<':
    case '<=':
    case '>':
    case '>=':
      walkValueExpr(summary, condition.left);
      walkValueExpr(summary, condition.right);
      return;
    case 'in':
      walkValueExpr(summary, condition.item);
      walkValueExpr(summary, condition.set);
      return;
    case 'connected':
      if (condition.via !== undefined) {
        walkCondition(summary, condition.via);
      }
      return;
    case 'zonePropIncludes':
      walkValueExpr(summary, condition.value);
      return;
    case 'markerStateAllowed':
      walkValueExpr(summary, condition.state);
      return;
    case 'markerShiftAllowed':
      walkNumericValueExpr(summary, condition.delta);
      return;
    case 'adjacent':
      return;
    default: {
      const _exhaustive: never = condition;
      void _exhaustive;
    }
  }
};

const walkValueExpr = (
  summary: MutableCompilationCoverageSummary,
  expr: ValueExpr,
): void => {
  recordValueExpr(summary, expr);

  if (typeof expr === 'number' || typeof expr === 'boolean' || typeof expr === 'string') {
    return;
  }

  switch (expr._t) {
    case 1:
    case 2:
      return;
    case 3:
      expr.concat.forEach((child) => {
        walkValueExpr(summary, child);
      });
      return;
    case 4:
      walkCondition(summary, expr.if.when);
      walkValueExpr(summary, expr.if.then);
      walkValueExpr(summary, expr.if.else);
      return;
    case 5:
      walkOptionsQueryConditionsAndValues(summary, expr.aggregate.query);
      if (expr.aggregate.op !== 'count') {
        walkNumericValueExpr(summary, expr.aggregate.valueExpr);
      }
      return;
    case 6:
      walkValueExpr(summary, expr.left);
      walkValueExpr(summary, expr.right);
      return;
    default: {
      const _exhaustive: never = expr;
      void _exhaustive;
    }
  }
};

const walkOptionsQueryConditionsAndValues = (
  summary: MutableCompilationCoverageSummary,
  query: OptionsQuery,
): void => {
  switch (query.query) {
    case 'concat':
      query.sources.forEach((source) => {
        walkOptionsQueryConditionsAndValues(summary, source);
      });
      return;
    case 'prioritized':
      query.tiers.forEach((tier) => {
        walkOptionsQueryConditionsAndValues(summary, tier);
      });
      return;
    case 'tokenZones':
      walkOptionsQueryConditionsAndValues(summary, query.source);
      return;
    case 'tokensInZone':
    case 'adjacentZones':
    case 'tokensInAdjacentZones':
    case 'binding':
    case 'grantContext':
    case 'capturedSequenceZones':
    case 'enums':
    case 'globalMarkers':
    case 'players':
      return;
    case 'assetRows':
      query.where?.forEach((predicate) => {
        const predicateValue = predicate.value;
        if (!Array.isArray(predicateValue)) {
          walkValueExpr(summary, predicateValue as ValueExpr);
        }
      });
      return;
    case 'tokensInMapSpaces':
      if (query.spaceFilter?.condition !== undefined) {
        walkCondition(summary, query.spaceFilter.condition);
      }
      return;
    case 'nextInOrderByCondition':
      walkOptionsQueryConditionsAndValues(summary, query.source);
      walkValueExpr(summary, query.from);
      walkCondition(summary, query.where);
      return;
    case 'intsInRange':
      walkNumericValueExpr(summary, query.min);
      walkNumericValueExpr(summary, query.max);
      if (query.step !== undefined) {
        walkNumericValueExpr(summary, query.step);
      }
      query.alwaysInclude?.forEach((entry) => {
        walkNumericValueExpr(summary, entry);
      });
      if (query.maxResults !== undefined) {
        walkNumericValueExpr(summary, query.maxResults);
      }
      return;
    case 'intsInVarRange':
      if (query.min !== undefined) {
        walkNumericValueExpr(summary, query.min);
      }
      if (query.max !== undefined) {
        walkNumericValueExpr(summary, query.max);
      }
      if (query.step !== undefined) {
        walkNumericValueExpr(summary, query.step);
      }
      query.alwaysInclude?.forEach((entry) => {
        walkNumericValueExpr(summary, entry);
      });
      if (query.maxResults !== undefined) {
        walkNumericValueExpr(summary, query.maxResults);
      }
      return;
    case 'zones':
    case 'mapSpaces':
      if (query.filter?.condition !== undefined) {
        walkCondition(summary, query.filter.condition);
      }
      return;
    case 'connectedZones':
      if (query.via !== undefined) {
        walkCondition(summary, query.via);
      }
      return;
    default: {
      const _exhaustive: never = query;
      void _exhaustive;
    }
  }
};

const walkActionParamDomainTokenFilters = (
  summary: MutableCompilationCoverageSummary,
  query: OptionsQuery,
): void => {
  switch (query.query) {
    case 'concat':
      query.sources.forEach((source) => {
        walkActionParamDomainTokenFilters(summary, source);
      });
      return;
    case 'prioritized':
      query.tiers.forEach((tier) => {
        walkActionParamDomainTokenFilters(summary, tier);
      });
      return;
    case 'tokenZones':
      walkActionParamDomainTokenFilters(summary, query.source);
      return;
    case 'nextInOrderByCondition':
      walkActionParamDomainTokenFilters(summary, query.source);
      return;
    case 'tokensInZone':
    case 'tokensInAdjacentZones':
    case 'tokensInMapSpaces':
      if (query.filter !== undefined) {
        recordTokenFilter(summary, query.filter);
      }
      return;
    default:
      return;
  }
};

export const reportCompilationCoverage = (
  def: GameDef,
): CompilationCoverageSummary => {
  const summary = createSummary();

  def.actions.forEach((action) => {
    if (action.pre !== null) {
      walkCondition(summary, action.pre);
    }
    action.params.forEach((param) => {
      walkActionParamDomainTokenFilters(summary, param.domain);
    });
  });

  def.actionPipelines?.forEach((pipeline) => {
    if (pipeline.applicability !== undefined) {
      walkCondition(summary, pipeline.applicability);
    }
    if (pipeline.legality !== null) {
      walkCondition(summary, pipeline.legality);
    }
    if (pipeline.costValidation !== null) {
      walkCondition(summary, pipeline.costValidation);
    }
    if (pipeline.targeting.filter !== undefined) {
      walkCondition(summary, pipeline.targeting.filter);
    }
    pipeline.stages.forEach((stage) => {
      if (stage.legality != null) {
        walkCondition(summary, stage.legality);
      }
      if (stage.costValidation != null) {
        walkCondition(summary, stage.costValidation);
      }
    });
  });

  def.triggers?.forEach((trigger) => {
    if (trigger.match !== undefined) {
      walkCondition(summary, trigger.match);
    }
    if (trigger.when !== undefined) {
      walkCondition(summary, trigger.when);
    }
  });

  def.turnStructure.phases.forEach((phase) => {
    if (phase.actionDefaults?.pre !== undefined) {
      walkCondition(summary, phase.actionDefaults.pre);
    }
  });

  def.terminal.conditions.forEach((condition) => {
    walkCondition(summary, condition.when);
  });
  def.terminal.checkpoints?.forEach((checkpoint) => {
    walkCondition(summary, checkpoint.when);
  });
  if (def.terminal.scoring !== undefined) {
    walkNumericValueExpr(summary, def.terminal.scoring.value);
  }
  def.terminal.margins?.forEach((margin) => {
    walkValueExpr(summary, margin.value);
  });

  return summary;
};
