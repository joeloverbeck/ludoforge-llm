import { normalizeIdentifier } from './validate-spec-shared.js';

export type DataAssetSelectionFailureReason = 'missing-reference' | 'ambiguous-selection';

export interface DataAssetSelectionResult<TAsset> {
  readonly selected: TAsset | undefined;
  readonly failureReason: DataAssetSelectionFailureReason | undefined;
  readonly alternatives: readonly string[];
}

interface SelectDataAssetByIdOptions<TAsset> {
  readonly getId?: (asset: TAsset) => string;
}

export function selectDataAssetById<TAsset>(
  assets: readonly TAsset[],
  selectedId: string | undefined,
  options: SelectDataAssetByIdOptions<TAsset> = {},
): DataAssetSelectionResult<TAsset> {
  const getId = options.getId ?? ((asset: TAsset): string => (asset as { readonly id: string }).id);
  const alternatives = assets.map((asset) => getId(asset)).sort((left, right) => left.localeCompare(right));

  if (selectedId !== undefined) {
    const normalizedSelectedId = normalizeIdentifier(selectedId);
    const matched = assets.find((asset) => normalizeIdentifier(getId(asset)) === normalizedSelectedId);
    return {
      selected: matched,
      failureReason: matched === undefined ? 'missing-reference' : undefined,
      alternatives,
    };
  }

  if (assets.length === 1) {
    return {
      selected: assets[0],
      failureReason: undefined,
      alternatives,
    };
  }

  return {
    selected: undefined,
    failureReason: assets.length > 1 ? 'ambiguous-selection' : undefined,
    alternatives,
  };
}
