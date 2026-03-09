import type { ConditionAST, ResolvedFreeOperationExecutionContext } from './types.js';
import type { FreeOperationZoneFilterSurface } from './free-operation-zone-filter-contract.js';

export interface FreeOperationZoneFilterDiagnostics {
  readonly source: FreeOperationZoneFilterSurface;
  readonly actionId: string;
  readonly moveParams: Readonly<Record<string, unknown>>;
}

export interface FreeOperationExecutionOverlay {
  readonly zoneFilter?: ConditionAST;
  readonly zoneFilterDiagnostics?: FreeOperationZoneFilterDiagnostics;
  readonly grantContext?: ResolvedFreeOperationExecutionContext;
}
