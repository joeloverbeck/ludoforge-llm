import type { DataAssetSelectionFailureReason } from './data-asset-selection.js';
import { selectDataAssetById } from './data-asset-selection.js';

export interface ScenarioSelectionResult<TAsset> {
  readonly requestedId: string | undefined;
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
    requestedId: selectedScenarioAssetId,
    selected: selection.selected,
    failureReason: selection.failureReason,
    alternatives: selection.alternatives,
  };
}

export function selectScenarioLinkedAsset<TAsset extends { readonly id: string }>(
  assets: ReadonlyArray<TAsset>,
  selectedId: string | undefined,
): ScenarioSelectionResult<TAsset> {
  const selection = selectDataAssetById(assets, selectedId);

  return {
    requestedId: selectedId,
    selected: selection.selected,
    failureReason: selection.failureReason,
    alternatives: selection.alternatives,
  };
}
