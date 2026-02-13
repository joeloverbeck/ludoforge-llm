import type { Diagnostic } from '../kernel/diagnostics.js';
import { validateDataAssetEnvelope } from '../kernel/data-assets.js';
import type { MapPayload, PieceCatalogPayload } from '../kernel/types.js';
import type { GameSpecDoc } from './game-spec-doc.js';
import { isRecord, normalizeIdentifier } from './compile-lowering.js';

export function deriveSectionsFromDataAssets(
  doc: GameSpecDoc,
  diagnostics: Diagnostic[],
): {
  readonly zones: GameSpecDoc['zones'];
  readonly tokenTypes: GameSpecDoc['tokenTypes'];
  readonly derivationFailures: {
    readonly map: boolean;
    readonly pieceCatalog: boolean;
  };
} {
  if (doc.dataAssets === null) {
    return {
      zones: null,
      tokenTypes: null,
      derivationFailures: {
        map: false,
        pieceCatalog: false,
      },
    };
  }

  const mapAssets: Array<{ readonly id: string; readonly payload: MapPayload }> = [];
  const pieceCatalogAssets: Array<{ readonly id: string; readonly payload: PieceCatalogPayload }> = [];
  const scenarioRefs: Array<{
    readonly mapAssetId?: string;
    readonly pieceCatalogAssetId?: string;
    readonly path: string;
    readonly entityId: string;
  }> = [];
  let mapDerivationFailed = false;
  let pieceCatalogDerivationFailed = false;

  for (const [index, rawAsset] of doc.dataAssets.entries()) {
    if (!isRecord(rawAsset)) {
      continue;
    }
    const pathPrefix = `doc.dataAssets.${index}`;
    const validated = validateDataAssetEnvelope(rawAsset, {
      expectedKinds: ['map', 'scenario', 'pieceCatalog'],
      pathPrefix,
    });
    diagnostics.push(...validated.diagnostics);
    if (validated.asset === null) {
      if (rawAsset.kind === 'map') {
        mapDerivationFailed = true;
      }
      if (rawAsset.kind === 'pieceCatalog') {
        pieceCatalogDerivationFailed = true;
      }
      continue;
    }

    if (validated.asset.kind === 'map') {
      mapAssets.push({
        id: validated.asset.id,
        payload: validated.asset.payload as MapPayload,
      });
      continue;
    }

    if (validated.asset.kind === 'pieceCatalog') {
      pieceCatalogAssets.push({
        id: validated.asset.id,
        payload: validated.asset.payload as PieceCatalogPayload,
      });
      continue;
    }

    if (validated.asset.kind === 'scenario') {
      const payload = validated.asset.payload;
      if (!isRecord(payload)) {
        continue;
      }
      const mapAssetId =
        typeof payload.mapAssetId === 'string' && payload.mapAssetId.trim() !== '' ? payload.mapAssetId.trim() : undefined;
      const pieceCatalogAssetId =
        typeof payload.pieceCatalogAssetId === 'string' && payload.pieceCatalogAssetId.trim() !== ''
          ? payload.pieceCatalogAssetId.trim()
          : undefined;
      scenarioRefs.push({
        ...(mapAssetId === undefined ? {} : { mapAssetId }),
        ...(pieceCatalogAssetId === undefined ? {} : { pieceCatalogAssetId }),
        path: `${pathPrefix}.payload`,
        entityId: validated.asset.id,
      });
      continue;
    }

  }

  const selectedScenario = scenarioRefs.length > 0 ? scenarioRefs[0] : undefined;
  if (scenarioRefs.length > 1) {
    diagnostics.push({
      code: 'CNL_COMPILER_DATA_ASSET_SCENARIO_AMBIGUOUS',
      path: 'doc.dataAssets',
      severity: 'warning',
      message: `Multiple scenario assets found (${scenarioRefs.length}); compiler will use the first one ('${selectedScenario?.entityId ?? 'unknown'}').`,
      suggestion: 'Keep one scenario asset in the compiled document, or specify the default.',
    });
  }

  const selectedMapResult = selectAssetById(
    mapAssets,
    selectedScenario?.mapAssetId,
    diagnostics,
    'map',
    selectedScenario?.path ?? 'doc.dataAssets',
    selectedScenario?.entityId,
  );
  mapDerivationFailed = mapDerivationFailed || selectedMapResult.failed;
  const selectedMap = selectedMapResult.selected;
  const selectedPieceCatalogResult = selectAssetById(
    pieceCatalogAssets,
    selectedScenario?.pieceCatalogAssetId,
    diagnostics,
    'pieceCatalog',
    selectedScenario?.path ?? 'doc.dataAssets',
    selectedScenario?.entityId,
  );
  pieceCatalogDerivationFailed = pieceCatalogDerivationFailed || selectedPieceCatalogResult.failed;
  const selectedPieceCatalog = selectedPieceCatalogResult.selected;

  const zones =
    selectedMap === undefined
      ? null
      : selectedMap.payload.spaces.map((space) => ({
          id: space.id,
          owner: 'none',
          visibility: 'public',
          ordering: 'set',
          adjacentTo: [...space.adjacentTo].sort((left, right) => left.localeCompare(right)),
        }));

  const tokenTypes =
    selectedPieceCatalog === undefined
      ? null
      : selectedPieceCatalog.payload.pieceTypes.map((pieceType) => ({
          id: pieceType.id,
          props: Object.fromEntries(
            [...pieceType.statusDimensions]
              .sort((left, right) => left.localeCompare(right))
              .map((dimension) => [dimension, 'string']),
          ),
        }));

  return {
    zones,
    tokenTypes,
    derivationFailures: {
      map: mapDerivationFailed,
      pieceCatalog: pieceCatalogDerivationFailed,
    },
  };
}

function selectAssetById<TPayload>(
  assets: ReadonlyArray<{ readonly id: string; readonly payload: TPayload }>,
  selectedId: string | undefined,
  diagnostics: Diagnostic[],
  kind: 'map' | 'pieceCatalog',
  selectedPath: string,
  entityId?: string,
): {
  readonly selected: { readonly id: string; readonly payload: TPayload } | undefined;
  readonly failed: boolean;
} {
  if (selectedId !== undefined) {
    const normalizedSelectedId = normalizeIdentifier(selectedId);
    const matched = assets.find((asset) => normalizeIdentifier(asset.id) === normalizedSelectedId);
    if (matched !== undefined) {
      return {
        selected: matched,
        failed: false,
      };
    }

    diagnostics.push({
      code: 'CNL_COMPILER_DATA_ASSET_REF_MISSING',
      path: `${selectedPath}.${kind}AssetId`,
      severity: 'error',
      message: `Scenario references unknown ${kind} asset "${selectedId}".`,
      suggestion: `Use an existing ${kind} asset id from doc.dataAssets.`,
      alternatives: assets.map((asset) => asset.id).sort((left, right) => left.localeCompare(right)),
      ...(entityId === undefined ? {} : { entityId }),
    });
    return {
      selected: undefined,
      failed: true,
    };
  }

  if (assets.length === 1) {
    return {
      selected: assets[0],
      failed: false,
    };
  }

  if (assets.length > 1) {
    diagnostics.push({
      code: 'CNL_COMPILER_DATA_ASSET_AMBIGUOUS',
      path: 'doc.dataAssets',
      severity: 'error',
      message: `Multiple ${kind} assets found (${assets.length}); compiler cannot infer which one to use.`,
      suggestion: `Provide a scenario asset referencing exactly one ${kind} asset id.`,
      alternatives: assets.map((asset) => asset.id).sort((left, right) => left.localeCompare(right)),
    });
  }

  return {
    selected: undefined,
    failed: assets.length > 1,
  };
}
