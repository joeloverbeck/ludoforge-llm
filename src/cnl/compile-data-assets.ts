import type { Diagnostic } from '../kernel/diagnostics.js';
import { validateDataAssetEnvelope } from '../kernel/data-assets.js';
import type { EventCardDef, EventCardSetPayload, MapPayload, PieceCatalogPayload } from '../kernel/types.js';
import type { GameSpecDoc } from './game-spec-doc.js';
import { isRecord, normalizeIdentifier } from './compile-lowering.js';
import { lowerEventCards } from './compile-event-cards.js';

export function deriveSectionsFromDataAssets(
  doc: GameSpecDoc,
  diagnostics: Diagnostic[],
): {
  readonly zones: GameSpecDoc['zones'];
  readonly tokenTypes: GameSpecDoc['tokenTypes'];
  readonly eventCards?: readonly EventCardDef[];
} {
  if (doc.dataAssets === null) {
    return { zones: null, tokenTypes: null };
  }

  const mapAssets: Array<{ readonly id: string; readonly payload: MapPayload }> = [];
  const pieceCatalogAssets: Array<{ readonly id: string; readonly payload: PieceCatalogPayload }> = [];
  const scenarioRefs: Array<{
    readonly mapAssetId?: string;
    readonly pieceCatalogAssetId?: string;
    readonly path: string;
    readonly entityId: string;
  }> = [];
  const eventCardSetAssets: Array<{
    readonly id: string;
    readonly payload: EventCardSetPayload;
    readonly path: string;
  }> = [];

  for (const [index, rawAsset] of doc.dataAssets.entries()) {
    if (!isRecord(rawAsset)) {
      continue;
    }
    const pathPrefix = `doc.dataAssets.${index}`;
    const validated = validateDataAssetEnvelope(rawAsset, {
      expectedKinds: ['map', 'scenario', 'pieceCatalog', 'eventCardSet'],
      pathPrefix,
    });
    diagnostics.push(...validated.diagnostics);
    if (validated.asset === null) {
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

    if (validated.asset.kind === 'eventCardSet') {
      eventCardSetAssets.push({
        id: validated.asset.id,
        payload: validated.asset.payload as EventCardSetPayload,
        path: `${pathPrefix}.payload.cards`,
      });
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

  const selectedMap = selectAssetById(
    mapAssets,
    selectedScenario?.mapAssetId,
    diagnostics,
    'map',
    selectedScenario?.path ?? 'doc.dataAssets',
    selectedScenario?.entityId,
  );
  const selectedPieceCatalog = selectAssetById(
    pieceCatalogAssets,
    selectedScenario?.pieceCatalogAssetId,
    diagnostics,
    'pieceCatalog',
    selectedScenario?.path ?? 'doc.dataAssets',
    selectedScenario?.entityId,
  );

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

  let eventCards: readonly EventCardDef[] | undefined;
  if (eventCardSetAssets.length === 1) {
    const [selectedSet] = eventCardSetAssets;
    if (selectedSet !== undefined) {
      eventCards = lowerEventCards(selectedSet.payload.cards, diagnostics, selectedSet.path);
    }
  } else if (eventCardSetAssets.length > 1) {
    diagnostics.push({
      code: 'CNL_COMPILER_EVENT_CARD_SET_AMBIGUOUS',
      path: 'doc.dataAssets',
      severity: 'error',
      message: `Multiple eventCardSet assets found (${eventCardSetAssets.length}); compiler cannot determine a single canonical event-card source.`,
      suggestion: 'Keep one eventCardSet asset in the compiled document.',
      alternatives: eventCardSetAssets
        .map((asset) => asset.id)
        .sort((left, right) => left.localeCompare(right)),
    });
  }

  return {
    zones,
    tokenTypes,
    ...(eventCards === undefined ? {} : { eventCards }),
  };
}

function selectAssetById<TPayload>(
  assets: ReadonlyArray<{ readonly id: string; readonly payload: TPayload }>,
  selectedId: string | undefined,
  diagnostics: Diagnostic[],
  kind: 'map' | 'pieceCatalog',
  selectedPath: string,
  entityId?: string,
): { readonly id: string; readonly payload: TPayload } | undefined {
  if (selectedId !== undefined) {
    const normalizedSelectedId = normalizeIdentifier(selectedId);
    const matched = assets.find((asset) => normalizeIdentifier(asset.id) === normalizedSelectedId);
    if (matched !== undefined) {
      return matched;
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
    return undefined;
  }

  if (assets.length === 1) {
    return assets[0];
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

  return undefined;
}
