import { dataAssetEvalError, type EvalError } from './eval-error.js';
import type { RuntimeTableContract } from './types.js';
import type { RuntimeTableIssue } from './runtime-table-index.js';

type SurfaceContext =
  | { readonly query: unknown }
  | { readonly reference: unknown };

function withSurfaceContext(surface: SurfaceContext, context: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  return {
    ...surface,
    ...context,
  };
}

export function runtimeTableContractMissingEvalError(
  surface: SurfaceContext,
  tableId: string,
  availableTableIds: readonly string[],
): EvalError {
  return dataAssetEvalError('DATA_ASSET_TABLE_CONTRACT_MISSING', `Runtime table contract not found: ${tableId}`, {
    ...surface,
    tableId,
    availableTableIds,
  });
}

export function runtimeTableIssueEvalError(
  surface: SurfaceContext,
  tableId: string,
  contract: RuntimeTableContract,
  issue: RuntimeTableIssue,
  availableAssetIds?: readonly string[],
): EvalError {
  if (issue.kind === 'assetMissing') {
    return dataAssetEvalError('DATA_ASSET_RUNTIME_ASSET_MISSING', `Runtime data asset not found: ${issue.assetId}`, {
      ...surface,
      tableId,
      assetId: issue.assetId,
      ...(availableAssetIds === undefined ? {} : { availableAssetIds }),
    });
  }

  if (issue.kind === 'tablePathEmpty') {
    return dataAssetEvalError('DATA_ASSET_TABLE_PATH_EMPTY', 'tableContracts.tablePath must contain at least one path segment', {
      ...surface,
      tableId,
      assetId: contract.assetId,
      tablePath: contract.tablePath,
    });
  }

  if (issue.kind === 'tablePathMissing') {
    return dataAssetEvalError('DATA_ASSET_TABLE_PATH_MISSING', `tableContracts.tablePath segment not found: ${issue.segment}`, {
      ...surface,
      tableId,
      assetId: contract.assetId,
      tablePath: contract.tablePath,
      segment: issue.segment,
      segmentIndex: issue.segmentIndex,
      availableKeys: issue.availableKeys,
    });
  }

  if (issue.kind === 'tablePathTypeInvalid') {
    return dataAssetEvalError('DATA_ASSET_TABLE_PATH_TYPE_INVALID', 'tableContracts.tablePath traversal expected object segment', {
      ...surface,
      tableId,
      assetId: contract.assetId,
      tablePath: contract.tablePath,
      segment: issue.segment,
      segmentIndex: issue.segmentIndex,
      actualType: issue.actualType,
    });
  }

  if (issue.kind === 'tableTypeInvalid') {
    return dataAssetEvalError('DATA_ASSET_TABLE_TYPE_INVALID', 'tableContracts.tablePath must resolve to an array of rows', {
      ...surface,
      tableId,
      assetId: contract.assetId,
      tablePath: contract.tablePath,
      actualType: issue.actualType,
    });
  }

  return dataAssetEvalError('DATA_ASSET_ROW_TYPE_INVALID', 'assetRows table rows must be objects', {
    ...surface,
    tableId,
    assetId: contract.assetId,
    tablePath: contract.tablePath,
    rowIndex: issue.rowIndex,
    actualType: issue.actualType,
  });
}

export function runtimeTableRowsUnavailableEvalError(surface: SurfaceContext, tableId: string): EvalError {
  return dataAssetEvalError('DATA_ASSET_TABLE_TYPE_INVALID', `Runtime table rows unavailable: ${tableId}`, {
    ...surface,
    tableId,
  });
}

export function runtimeTableFieldUndeclaredEvalError(
  surface: SurfaceContext,
  tableId: string,
  field: string,
  availableFields: readonly string[],
): EvalError {
  return dataAssetEvalError('DATA_ASSET_FIELD_UNDECLARED', `Runtime table field not declared in contract: ${field}`, {
    ...surface,
    tableId,
    field,
    availableFields,
  });
}

export function runtimeTableFieldMissingEvalError(
  surface: SurfaceContext,
  tableId: string,
  field: string,
  row: string,
  rowTemplate: string,
  availableFields: readonly string[],
): EvalError {
  return dataAssetEvalError('DATA_ASSET_FIELD_MISSING', `Row field not found: ${field}`, {
    ...surface,
    row,
    rowTemplate,
    tableId,
    field,
    availableFields,
  });
}

export function runtimeTableRowBindingTypeEvalError(
  surface: SurfaceContext,
  row: string,
  rowTemplate: string,
  value: unknown,
): EvalError {
  return dataAssetEvalError('DATA_ASSET_ROW_BINDING_TYPE_INVALID', `Row binding ${row} must resolve to a row object`, withSurfaceContext(surface, {
    row,
    rowTemplate,
    actualType: Array.isArray(value) ? 'array' : typeof value,
    value,
  }));
}

export function runtimeTableFieldTypeEvalError(
  surface: SurfaceContext,
  row: string,
  rowTemplate: string,
  tableId: string,
  field: string,
  expectedType: string,
  value: unknown,
): EvalError {
  const actualType =
    typeof value === 'string'
      ? 'string'
      : typeof value === 'boolean'
        ? 'boolean'
        : typeof value === 'number' && Number.isSafeInteger(value)
          ? 'int'
          : Array.isArray(value)
            ? 'array'
            : typeof value;
  return dataAssetEvalError('DATA_ASSET_FIELD_TYPE_INVALID', `Row field ${field} does not match declared table contract type`, {
    ...surface,
    row,
    rowTemplate,
    tableId,
    field,
    expectedType,
    actualType,
    value,
  });
}
