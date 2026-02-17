import type { GameSpecDoc } from './game-spec-doc.js';

export type TokenTraitVocabulary = Readonly<Record<string, readonly string[]>>;

export function deriveTokenTraitVocabularyFromGameSpecDoc(doc: GameSpecDoc): TokenTraitVocabulary | null {
  const dataAssets = doc.dataAssets;
  if (!Array.isArray(dataAssets)) {
    return null;
  }

  const pieceCatalogAssets = dataAssets.filter(
    (asset): asset is { readonly id: string; readonly payload: unknown } =>
      isRecord(asset) &&
      asset.kind === 'pieceCatalog' &&
      typeof asset.id === 'string' &&
      asset.id.trim() !== '',
  );
  if (pieceCatalogAssets.length === 0) {
    return null;
  }

  const scenarioAssets = dataAssets.filter(
    (asset): asset is { readonly id: string; readonly payload: unknown } =>
      isRecord(asset) &&
      asset.kind === 'scenario' &&
      typeof asset.id === 'string' &&
      asset.id.trim() !== '',
  );

  const selectedScenario = selectScenarioAsset(doc, scenarioAssets);
  const selectedPieceCatalog = selectPieceCatalogAsset(selectedScenario, pieceCatalogAssets);
  if (selectedPieceCatalog === undefined) {
    return null;
  }

  return deriveTokenTraitVocabularyFromPieceCatalogPayload(selectedPieceCatalog.payload);
}

export function deriveTokenTraitVocabularyFromPieceCatalogPayload(payload: unknown): TokenTraitVocabulary {
  const pieceTypes = readPieceTypes(payload);
  const valuesByProp = new Map<string, Set<string>>();

  for (const pieceType of pieceTypes) {
    const runtimeProps = isRecord(pieceType.runtimeProps) ? pieceType.runtimeProps : {};
    for (const [prop, value] of Object.entries(runtimeProps)) {
      if (typeof value !== 'string') {
        continue;
      }
      addCanonical(valuesByProp, prop, value);
    }

    if (!Array.isArray(pieceType.transitions)) {
      continue;
    }
    for (const transition of pieceType.transitions) {
      if (!isRecord(transition) || typeof transition.dimension !== 'string') {
        continue;
      }
      if (typeof transition.from === 'string') {
        addCanonical(valuesByProp, transition.dimension, transition.from);
      }
      if (typeof transition.to === 'string') {
        addCanonical(valuesByProp, transition.dimension, transition.to);
      }
    }
  }

  return Object.freeze(
    Object.fromEntries(
      [...valuesByProp.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([prop, values]) => [prop, Object.freeze([...values].sort((left, right) => left.localeCompare(right)))]),
    ),
  );
}

function selectScenarioAsset(
  doc: GameSpecDoc,
  scenarios: ReadonlyArray<{ readonly id: string; readonly payload: unknown }>,
): { readonly id: string; readonly payload: unknown } | undefined {
  const selectedScenarioAssetId =
    typeof doc.metadata?.defaultScenarioAssetId === 'string' && doc.metadata.defaultScenarioAssetId.trim() !== ''
      ? doc.metadata.defaultScenarioAssetId
      : undefined;

  if (selectedScenarioAssetId !== undefined) {
    const normalized = normalizeIdentifier(selectedScenarioAssetId);
    return scenarios.find((scenario) => normalizeIdentifier(scenario.id) === normalized);
  }

  if (scenarios.length === 1) {
    return scenarios[0];
  }

  return undefined;
}

function selectPieceCatalogAsset(
  scenario: { readonly id: string; readonly payload: unknown } | undefined,
  pieceCatalogAssets: ReadonlyArray<{ readonly id: string; readonly payload: unknown }>,
): { readonly id: string; readonly payload: unknown } | undefined {
  if (scenario !== undefined && isRecord(scenario.payload)) {
    const referencedCatalogId =
      typeof scenario.payload.pieceCatalogAssetId === 'string' && scenario.payload.pieceCatalogAssetId.trim() !== ''
        ? scenario.payload.pieceCatalogAssetId
        : undefined;
    if (referencedCatalogId !== undefined) {
      const normalized = normalizeIdentifier(referencedCatalogId);
      return pieceCatalogAssets.find((asset) => normalizeIdentifier(asset.id) === normalized);
    }
  }

  if (pieceCatalogAssets.length === 1) {
    return pieceCatalogAssets[0];
  }

  return undefined;
}

function readPieceTypes(payload: unknown): readonly Record<string, unknown>[] {
  if (!isRecord(payload) || !Array.isArray(payload.pieceTypes)) {
    return [];
  }

  return payload.pieceTypes.filter((pieceType): pieceType is Record<string, unknown> => isRecord(pieceType));
}

function addCanonical(valuesByProp: Map<string, Set<string>>, prop: string, rawValue: string): void {
  const canonical = rawValue.trim();
  if (canonical.length === 0) {
    return;
  }
  let values = valuesByProp.get(prop);
  if (values === undefined) {
    values = new Set<string>();
    valuesByProp.set(prop, values);
  }
  values.add(canonical);
}

function normalizeIdentifier(value: string): string {
  return value.trim().normalize('NFC');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
