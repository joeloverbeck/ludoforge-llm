import type { Diagnostic } from '../kernel/diagnostics.js';
import type { DataAssetSelectionFailureReason } from './data-asset-selection.js';
import { selectDataAssetById } from './data-asset-selection.js';

export type ScenarioLinkedAssetKind = 'map' | 'pieceCatalog' | 'seatCatalog';

interface ScenarioSelectionMissingReferenceContext {
  readonly selectedScenarioAssetId: string;
  readonly alternatives: readonly string[];
}

interface ScenarioSelectionAmbiguousContext {
  readonly alternatives: readonly string[];
}

interface ScenarioSelectionDialect {
  readonly onMissingReference?: (context: ScenarioSelectionMissingReferenceContext) => Diagnostic;
  readonly onAmbiguousSelection?: (context: ScenarioSelectionAmbiguousContext) => Diagnostic;
}

interface ScenarioLinkedAssetMissingReferenceContext {
  readonly kind: ScenarioLinkedAssetKind;
  readonly selectedId: string;
  readonly selectedPath: string;
  readonly alternatives: readonly string[];
  readonly entityId?: string;
}

interface ScenarioLinkedAssetAmbiguousContext {
  readonly kind: ScenarioLinkedAssetKind;
  readonly alternatives: readonly string[];
}

interface ScenarioLinkedAssetSelectionDialect {
  readonly onMissingReference?: (context: ScenarioLinkedAssetMissingReferenceContext) => Diagnostic;
  readonly onAmbiguousSelection?: (context: ScenarioLinkedAssetAmbiguousContext) => Diagnostic;
}

interface ScenarioLinkedAssetSelectionOptions {
  readonly kind: ScenarioLinkedAssetKind;
  readonly selectedPath: string;
  readonly entityId?: string;
  readonly dialect: ScenarioLinkedAssetSelectionDialect;
}

export function selectScenarioRefWithPolicy<TScenario extends { readonly entityId: string }>(
  scenarios: ReadonlyArray<TScenario>,
  selectedScenarioAssetId: string | undefined,
  diagnostics: Diagnostic[],
  dialect: ScenarioSelectionDialect,
): {
  readonly selected: TScenario | undefined;
  readonly failureReason: DataAssetSelectionFailureReason | undefined;
} {
  const selection = selectDataAssetById(scenarios, selectedScenarioAssetId, {
    getId: (scenario) => scenario.entityId,
  });

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

  return {
    selected: selection.selected,
    failureReason: selection.failureReason,
  };
}

export function selectScenarioLinkedAssetWithPolicy<TAsset extends { readonly id: string }>(
  assets: ReadonlyArray<TAsset>,
  selectedId: string | undefined,
  diagnostics: Diagnostic[],
  options: ScenarioLinkedAssetSelectionOptions,
): {
  readonly selected: TAsset | undefined;
  readonly failureReason: DataAssetSelectionFailureReason | undefined;
} {
  const selection = selectDataAssetById(assets, selectedId);

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

  return {
    selected: selection.selected,
    failureReason: selection.failureReason,
  };
}
