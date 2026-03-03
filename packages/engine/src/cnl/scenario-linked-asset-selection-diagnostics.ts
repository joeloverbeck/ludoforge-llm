import type { Diagnostic } from '../kernel/diagnostics.js';
import type { ScenarioSelectionResult } from './scenario-linked-asset-selection-core.js';

export type ScenarioLinkedAssetKind = 'map' | 'pieceCatalog' | 'seatCatalog';

export interface ScenarioSelectionMissingReferenceContext {
  readonly selectedScenarioAssetId: string;
  readonly alternatives: readonly string[];
}

export interface ScenarioSelectionAmbiguousContext {
  readonly alternatives: readonly string[];
}

export interface ScenarioSelectionDialect {
  readonly onMissingReference?: (context: ScenarioSelectionMissingReferenceContext) => Diagnostic;
  readonly onAmbiguousSelection?: (context: ScenarioSelectionAmbiguousContext) => Diagnostic;
}

export interface ScenarioLinkedAssetMissingReferenceContext {
  readonly kind: ScenarioLinkedAssetKind;
  readonly selectedId: string;
  readonly selectedPath: string;
  readonly alternatives: readonly string[];
  readonly entityId?: string;
}

export interface ScenarioLinkedAssetAmbiguousContext {
  readonly kind: ScenarioLinkedAssetKind;
  readonly alternatives: readonly string[];
}

export interface ScenarioLinkedAssetSelectionDialect {
  readonly onMissingReference?: (context: ScenarioLinkedAssetMissingReferenceContext) => Diagnostic;
  readonly onAmbiguousSelection?: (context: ScenarioLinkedAssetAmbiguousContext) => Diagnostic;
}

export interface ScenarioLinkedAssetSelectionDiagnosticOptions {
  readonly kind: ScenarioLinkedAssetKind;
  readonly selectedPath: string;
  readonly entityId?: string;
  readonly dialect: ScenarioLinkedAssetSelectionDialect;
}

export function emitScenarioSelectionDiagnostics(
  selection: ScenarioSelectionResult<unknown>,
  diagnostics: Diagnostic[],
  dialect: ScenarioSelectionDialect,
): void {
  if (
    selection.failureReason === 'missing-reference'
    && selection.requestedId !== undefined
    && dialect.onMissingReference !== undefined
  ) {
    diagnostics.push(
      dialect.onMissingReference({
        selectedScenarioAssetId: selection.requestedId,
        alternatives: [...selection.alternatives],
      }),
    );
  }

  if (selection.failureReason === 'ambiguous-selection' && dialect.onAmbiguousSelection !== undefined) {
    diagnostics.push(
      dialect.onAmbiguousSelection({
        alternatives: [...selection.alternatives],
      }),
    );
  }
}

export function emitScenarioLinkedAssetSelectionDiagnostics(
  selection: ScenarioSelectionResult<unknown>,
  diagnostics: Diagnostic[],
  options: ScenarioLinkedAssetSelectionDiagnosticOptions,
): void {
  if (
    selection.failureReason === 'missing-reference'
    && selection.requestedId !== undefined
    && options.dialect.onMissingReference !== undefined
  ) {
    diagnostics.push(
      options.dialect.onMissingReference({
        kind: options.kind,
        selectedId: selection.requestedId,
        selectedPath: options.selectedPath,
        alternatives: [...selection.alternatives],
        ...(options.entityId === undefined ? {} : { entityId: options.entityId }),
      }),
    );
  }

  if (selection.failureReason === 'ambiguous-selection' && options.dialect.onAmbiguousSelection !== undefined) {
    diagnostics.push(
      options.dialect.onAmbiguousSelection({
        kind: options.kind,
        alternatives: [...selection.alternatives],
      }),
    );
  }
}
