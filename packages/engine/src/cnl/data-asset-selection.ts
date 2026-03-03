import { normalizeIdentifier } from './identifier-utils.js';

export type DataAssetSelectionFailureReason = 'missing-reference' | 'ambiguous-selection';

export interface DataAssetSelectionResult<TAsset> {
  readonly selected: TAsset | undefined;
  readonly failureReason: DataAssetSelectionFailureReason | undefined;
  readonly alternatives: readonly string[];
}

interface SelectDataAssetByIdOptions<TAsset> {
  readonly getId?: (asset: TAsset) => string;
}

interface AssetWithId {
  readonly id: string;
}

function hasStringId(value: unknown): value is AssetWithId {
  return typeof value === 'object' && value !== null && 'id' in value && typeof value.id === 'string';
}

export function selectDataAssetById<TAsset extends AssetWithId>(
  assets: readonly TAsset[],
  selectedId: string | undefined,
  options?: SelectDataAssetByIdOptions<TAsset>,
): DataAssetSelectionResult<TAsset>;
export function selectDataAssetById<TAsset>(
  assets: readonly TAsset[],
  selectedId: string | undefined,
  options: SelectDataAssetByIdOptions<TAsset>,
): DataAssetSelectionResult<TAsset>;
export function selectDataAssetById<TAsset>(
  assets: readonly TAsset[],
  selectedId: string | undefined,
  options?: SelectDataAssetByIdOptions<TAsset>,
): DataAssetSelectionResult<TAsset> {
  const getId = options?.getId ?? ((asset: TAsset): string => {
    if (!hasStringId(asset)) {
      throw new TypeError('selectDataAssetById requires options.getId when assets do not expose string id fields.');
    }
    return asset.id;
  });
  const alternatives = [...new Set(assets.map((asset) => normalizeIdentifier(getId(asset))))]
    .sort((left, right) => left.localeCompare(right));

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
