import type { DataAssetSelectionFailureReason } from './data-asset-selection.js';
import { selectDataAssetById } from './data-asset-selection.js';

export interface ScenarioSelectionResult<TAsset> {
  readonly requestedId: string | undefined;
  readonly selected: TAsset | undefined;
  readonly failureReason: DataAssetSelectionFailureReason | undefined;
  readonly alternatives: readonly string[];
}

export function createUnresolvedScenarioSelectionResult<TAsset>(
  requestedId: string | undefined,
): ScenarioSelectionResult<TAsset> {
  return {
    requestedId,
    selected: undefined,
    failureReason: undefined,
    alternatives: [],
  };
}

function toScenarioSelectionResult<TAsset>(
  requestedId: string | undefined,
  selection: {
    readonly selected: TAsset | undefined;
    readonly failureReason: DataAssetSelectionFailureReason | undefined;
    readonly alternatives: readonly string[];
  },
): ScenarioSelectionResult<TAsset> {
  return {
    requestedId,
    selected: selection.selected,
    failureReason: selection.failureReason,
    alternatives: selection.alternatives,
  };
}

function selectScenarioAssetById<TAsset extends { readonly id: string }>(
  assets: ReadonlyArray<TAsset>,
  requestedId: string | undefined,
): ScenarioSelectionResult<TAsset> {
  const selection = selectDataAssetById(assets, requestedId);
  return toScenarioSelectionResult(requestedId, selection);
}

function selectScenarioAssetBy<TAsset>(
  assets: ReadonlyArray<TAsset>,
  requestedId: string | undefined,
  getId: (asset: TAsset) => string,
): ScenarioSelectionResult<TAsset> {
  const selection = selectDataAssetById(assets, requestedId, { getId });
  return toScenarioSelectionResult(requestedId, selection);
}

export function selectScenarioRef<TScenario extends { readonly entityId: string }>(
  scenarios: ReadonlyArray<TScenario>,
  selectedScenarioAssetId: string | undefined,
): ScenarioSelectionResult<TScenario> {
  return selectScenarioAssetBy(scenarios, selectedScenarioAssetId, (scenario) => scenario.entityId);
}

export function selectScenarioLinkedAsset<TAsset extends { readonly id: string }>(
  assets: ReadonlyArray<TAsset>,
  selectedId: string | undefined,
): ScenarioSelectionResult<TAsset> {
  return selectScenarioAssetById(assets, selectedId);
}
