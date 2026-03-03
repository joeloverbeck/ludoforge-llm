import type { Diagnostic } from '../kernel/diagnostics.js';
import type { DataAssetSelectionFailureReason } from './data-asset-selection.js';
import { selectDataAssetById } from './data-asset-selection.js';

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

export interface ScenarioSelectionResult<TAsset> {
  readonly selected: TAsset | undefined;
  readonly failureReason: DataAssetSelectionFailureReason | undefined;
  readonly alternatives: readonly string[];
}

export function selectScenarioRef<TScenario extends { readonly entityId: string }>(
  scenarios: ReadonlyArray<TScenario>,
  selectedScenarioAssetId: string | undefined,
): ScenarioSelectionResult<TScenario> {
  const selection = selectDataAssetById(scenarios, selectedScenarioAssetId, {
    getId: (scenario) => scenario.entityId,
  });

  return {
    selected: selection.selected,
    failureReason: selection.failureReason,
    alternatives: selection.alternatives,
  };
}

export function emitScenarioSelectionDiagnostics(
  selection: ScenarioSelectionResult<unknown>,
  selectedScenarioAssetId: string | undefined,
  diagnostics: Diagnostic[],
  dialect: ScenarioSelectionDialect,
): void {
  if (
    selection.failureReason === 'missing-reference'
    && selectedScenarioAssetId !== undefined
    && dialect.onMissingReference !== undefined
  ) {
    diagnostics.push(
      dialect.onMissingReference({
        selectedScenarioAssetId,
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

export function selectScenarioLinkedAsset<TAsset extends { readonly id: string }>(
  assets: ReadonlyArray<TAsset>,
  selectedId: string | undefined,
): ScenarioSelectionResult<TAsset> {
  const selection = selectDataAssetById(assets, selectedId);

  return {
    selected: selection.selected,
    failureReason: selection.failureReason,
    alternatives: selection.alternatives,
  };
}

export function emitScenarioLinkedAssetSelectionDiagnostics(
  selection: ScenarioSelectionResult<unknown>,
  selectedId: string | undefined,
  diagnostics: Diagnostic[],
  options: ScenarioLinkedAssetSelectionDiagnosticOptions,
): void {
  if (
    selection.failureReason === 'missing-reference'
    && selectedId !== undefined
    && options.dialect.onMissingReference !== undefined
  ) {
    diagnostics.push(
      options.dialect.onMissingReference({
        kind: options.kind,
        selectedId,
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
