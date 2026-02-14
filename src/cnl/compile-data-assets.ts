import type { Diagnostic } from '../kernel/diagnostics.js';
import { validateDataAssetEnvelope } from '../kernel/data-assets.js';
import type {
  MapPayload,
  MapSpaceDef,
  NumericTrackDef,
  PieceCatalogPayload,
  ScenarioPayload,
  SpaceMarkerLatticeDef,
  SpaceMarkerValueDef,
  StackingConstraint,
} from '../kernel/types.js';
import type { GameSpecDoc } from './game-spec-doc.js';
import { isRecord, normalizeIdentifier } from './compile-lowering.js';

export function deriveSectionsFromDataAssets(
  doc: GameSpecDoc,
  diagnostics: Diagnostic[],
  options: {
    readonly defaultScenarioAssetId?: string;
  } = {},
): {
  readonly zones: GameSpecDoc['zones'];
  readonly tokenTypes: GameSpecDoc['tokenTypes'];
  readonly mapSpaces: readonly MapSpaceDef[] | null;
  readonly tracks: readonly NumericTrackDef[] | null;
  readonly scenarioInitialTrackValues: ReadonlyArray<{ readonly trackId: string; readonly value: number }> | null;
  readonly markerLattices: readonly SpaceMarkerLatticeDef[] | null;
  readonly spaceMarkers: readonly SpaceMarkerValueDef[] | null;
  readonly stackingConstraints: readonly StackingConstraint[] | null;
  readonly derivationFailures: {
    readonly map: boolean;
    readonly pieceCatalog: boolean;
  };
} {
  if (doc.dataAssets === null) {
    return {
      zones: null,
      tokenTypes: null,
      mapSpaces: null,
      tracks: null,
      scenarioInitialTrackValues: null,
      markerLattices: null,
      spaceMarkers: null,
      stackingConstraints: null,
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
    readonly initialTrackValues?: ReadonlyArray<{ readonly trackId: string; readonly value: number }>;
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
      const payload = validated.asset.payload as ScenarioPayload;
      const mapAssetId =
        typeof payload.mapAssetId === 'string' && payload.mapAssetId.trim() !== '' ? payload.mapAssetId.trim() : undefined;
      const pieceCatalogAssetId =
        typeof payload.pieceCatalogAssetId === 'string' && payload.pieceCatalogAssetId.trim() !== ''
          ? payload.pieceCatalogAssetId.trim()
          : undefined;
      scenarioRefs.push({
        ...(mapAssetId === undefined ? {} : { mapAssetId }),
        ...(pieceCatalogAssetId === undefined ? {} : { pieceCatalogAssetId }),
        ...(payload.initialTrackValues === undefined ? {} : { initialTrackValues: payload.initialTrackValues }),
        path: `${pathPrefix}.payload`,
        entityId: validated.asset.id,
      });
      continue;
    }

  }

  const scenarioSelection = selectScenarioRef(scenarioRefs, options.defaultScenarioAssetId, diagnostics);
  const selectedScenario = scenarioSelection.selected;
  const skipAssetInference = scenarioSelection.failed;

  const selectedMapResult = selectAssetById(
    skipAssetInference ? [] : mapAssets,
    skipAssetInference ? undefined : selectedScenario?.mapAssetId,
    diagnostics,
    'map',
    selectedScenario?.path ?? 'doc.dataAssets',
    selectedScenario?.entityId,
  );
  mapDerivationFailed = mapDerivationFailed || selectedMapResult.failed;
  const selectedMap = selectedMapResult.selected;
  const selectedPieceCatalogResult = selectAssetById(
    skipAssetInference ? [] : pieceCatalogAssets,
    skipAssetInference ? undefined : selectedScenario?.pieceCatalogAssetId,
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
    mapSpaces: selectedMap?.payload.spaces ?? null,
    tracks: selectedMap?.payload.tracks ?? null,
    scenarioInitialTrackValues: selectedScenario?.initialTrackValues ?? null,
    markerLattices: selectedMap?.payload.markerLattices ?? null,
    spaceMarkers: selectedMap?.payload.spaceMarkers ?? null,
    stackingConstraints: selectedMap?.payload.stackingConstraints ?? null,
    derivationFailures: {
      map: mapDerivationFailed,
      pieceCatalog: pieceCatalogDerivationFailed,
    },
  };
}

function selectScenarioRef(
  scenarios: ReadonlyArray<{
    readonly mapAssetId?: string;
    readonly pieceCatalogAssetId?: string;
    readonly initialTrackValues?: ReadonlyArray<{ readonly trackId: string; readonly value: number }>;
    readonly path: string;
    readonly entityId: string;
  }>,
  selectedScenarioAssetId: string | undefined,
  diagnostics: Diagnostic[],
): {
  readonly selected:
    | {
        readonly mapAssetId?: string;
        readonly pieceCatalogAssetId?: string;
        readonly initialTrackValues?: ReadonlyArray<{ readonly trackId: string; readonly value: number }>;
        readonly path: string;
        readonly entityId: string;
      }
    | undefined;
  readonly failed: boolean;
} {
  if (selectedScenarioAssetId !== undefined) {
    const normalizedSelectedId = normalizeIdentifier(selectedScenarioAssetId);
    const matched = scenarios.find((scenario) => normalizeIdentifier(scenario.entityId) === normalizedSelectedId);
    if (matched !== undefined) {
      return {
        selected: matched,
        failed: false,
      };
    }

    diagnostics.push({
      code: 'CNL_COMPILER_DATA_ASSET_SCENARIO_SELECTOR_MISSING',
      path: 'doc.metadata.defaultScenarioAssetId',
      severity: 'error',
      message: `metadata.defaultScenarioAssetId references unknown scenario asset "${selectedScenarioAssetId}".`,
      suggestion: 'Set metadata.defaultScenarioAssetId to an existing doc.dataAssets scenario id.',
      alternatives: scenarios.map((scenario) => scenario.entityId).sort((left, right) => left.localeCompare(right)),
    });
    return {
      selected: undefined,
      failed: true,
    };
  }

  if (scenarios.length <= 1) {
    return {
      selected: scenarios[0],
      failed: false,
    };
  }

  diagnostics.push({
    code: 'CNL_COMPILER_DATA_ASSET_SCENARIO_AMBIGUOUS',
    path: 'doc.dataAssets',
    severity: 'error',
    message: `Multiple scenario assets found (${scenarios.length}); explicit metadata.defaultScenarioAssetId is required.`,
    suggestion: 'Set metadata.defaultScenarioAssetId to one scenario id.',
    alternatives: scenarios.map((scenario) => scenario.entityId).sort((left, right) => left.localeCompare(right)),
  });
  return {
    selected: undefined,
    failed: true,
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
