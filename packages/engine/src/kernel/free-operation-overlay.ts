import type {
  ConditionAST,
  FreeOperationTokenInterpretationRule,
  ResolvedFreeOperationExecutionContext,
} from './types.js';
import type { CapturedSequenceZonesByKey } from './free-operation-captured-sequence-zones.js';
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
  readonly capturedSequenceZonesByKey?: CapturedSequenceZonesByKey;
  readonly tokenInterpretations?: readonly FreeOperationTokenInterpretationRule[];
}
