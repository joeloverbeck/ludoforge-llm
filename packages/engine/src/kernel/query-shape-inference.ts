import type { GameDef, OptionsQuery, RuntimeTableContract, ValueExpr } from './types.js';
import { inferLeafOptionsQueryContract, type QueryRuntimeShape as SharedQueryRuntimeShape } from './query-kind-contract.js';

export type QueryRuntimeShape = SharedQueryRuntimeShape;
export type ValueRuntimeShape = 'number' | 'string' | 'boolean' | 'unknown';

export interface StaticValueShapeContext {
  readonly globalVarTypesByName: ReadonlyMap<string, GameDef['globalVars'][number]['type']>;
  readonly perPlayerVarTypesByName: ReadonlyMap<string, GameDef['perPlayerVars'][number]['type']>;
  readonly tableContractsById: ReadonlyMap<string, RuntimeTableContract>;
}

export function dedupeQueryRuntimeShapes(shapes: readonly QueryRuntimeShape[]): readonly QueryRuntimeShape[] {
  return [...new Set(shapes)];
}

export function dedupeValueRuntimeShapes(shapes: readonly ValueRuntimeShape[]): readonly ValueRuntimeShape[] {
  return [...new Set(shapes)];
}

export function inferQueryRuntimeShapes(query: OptionsQuery): readonly QueryRuntimeShape[] {
  switch (query.query) {
    case 'concat': {
      const nested = query.sources.flatMap((source) => inferQueryRuntimeShapes(source));
      return dedupeQueryRuntimeShapes(nested);
    }
    case 'nextInOrderByCondition':
      return inferQueryRuntimeShapes(query.source);
    default:
      return [inferLeafOptionsQueryContract(query).runtimeShape];
  }
}

export function inferValueRuntimeShapes(
  valueExpr: ValueExpr,
  context: StaticValueShapeContext,
): readonly ValueRuntimeShape[] {
  if (typeof valueExpr === 'number') {
    return ['number'];
  }

  if (typeof valueExpr === 'string') {
    return ['string'];
  }

  if (typeof valueExpr === 'boolean') {
    return ['boolean'];
  }

  if ('ref' in valueExpr) {
    if (valueExpr.ref === 'gvar') {
      const globalType = context.globalVarTypesByName.get(valueExpr.var);
      if (globalType === 'int') {
        return ['number'];
      }
      if (globalType === 'boolean') {
        return ['boolean'];
      }
      return ['unknown'];
    }

    if (valueExpr.ref === 'pvar') {
      const perPlayerType = context.perPlayerVarTypesByName.get(valueExpr.var);
      if (perPlayerType === 'int') {
        return ['number'];
      }
      if (perPlayerType === 'boolean') {
        return ['boolean'];
      }
      return ['unknown'];
    }

    if (valueExpr.ref === 'zoneCount' || valueExpr.ref === 'activePlayer') {
      return ['number'];
    }

    if (valueExpr.ref === 'markerState' || valueExpr.ref === 'globalMarkerState' || valueExpr.ref === 'tokenZone') {
      return ['string'];
    }

    if (valueExpr.ref === 'assetField') {
      const contract = context.tableContractsById.get(valueExpr.tableId);
      const fieldType = contract?.fields.find((field) => field.field === valueExpr.field)?.type;
      if (fieldType === 'int') {
        return ['number'];
      }
      if (fieldType === 'string') {
        return ['string'];
      }
      if (fieldType === 'boolean') {
        return ['boolean'];
      }
      return ['unknown'];
    }

    return ['unknown'];
  }

  if ('concat' in valueExpr) {
    return ['string'];
  }

  if ('op' in valueExpr || 'aggregate' in valueExpr) {
    return ['number'];
  }

  if ('if' in valueExpr) {
    return dedupeValueRuntimeShapes([
      ...inferValueRuntimeShapes(valueExpr.if.then, context),
      ...inferValueRuntimeShapes(valueExpr.if.else, context),
    ]);
  }

  const _exhaustive: never = valueExpr;
  return _exhaustive;
}

export function areSourceAndAnchorShapesCompatible(
  sourceShape: QueryRuntimeShape,
  anchorShape: ValueRuntimeShape,
): boolean {
  if (sourceShape === 'number' && anchorShape === 'number') {
    return true;
  }
  if (sourceShape === 'string' && anchorShape === 'string') {
    return true;
  }
  return false;
}
