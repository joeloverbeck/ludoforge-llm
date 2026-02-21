import type { Diagnostic } from '../kernel/diagnostics.js';
import { validateDataAssetEnvelope } from '../kernel/data-assets.js';
import { RuntimeTableConstraintSchema } from '../kernel/schemas-core.js';
import type {
  EffectAST,
  SeatDef,
  MapPayload,
  NumericTrackDef,
  PieceCatalogPayload,
  PieceStatusDimension,
  RuntimeDataAsset,
  RuntimeTableContract,
  ScenarioPayload,
  SpaceMarkerLatticeDef,
  SpaceMarkerValueDef,
  StackingConstraint,
} from '../kernel/types.js';
import type { GameSpecDoc } from './game-spec-doc.js';
import { isRecord, normalizeIdentifier } from './compile-lowering.js';
import { deriveTokenTraitVocabularyFromPieceCatalogPayload } from './token-trait-vocabulary.js';
import {
  collectScenarioProjectionEntries,
  evaluateScenarioProjectionInvariants,
  mapScenarioProjectionInvariantIssuesToDiagnostics,
  type ScenarioProjectionInvariantDiagnosticDialect,
} from './scenario-projection-invariants.js';

const COMPILER_SCENARIO_PROJECTION_DIAGNOSTIC_DIALECT: ScenarioProjectionInvariantDiagnosticDialect = {
  unknownPieceType: {
    initialPlacementsCode: 'CNL_COMPILER_SCENARIO_PLACEMENT_PIECE_INVALID',
    outOfPlayCode: 'CNL_COMPILER_SCENARIO_OUT_OF_PLAY_PIECE_INVALID',
    initialPlacementsMessage: (pieceTypeId) => `Unknown piece type "${pieceTypeId}" in scenario placement.`,
    outOfPlayMessage: (pieceTypeId) => `Unknown piece type "${pieceTypeId}" in scenario outOfPlay.`,
    suggestion: 'Use a pieceTypeId declared in the selected piece catalog.',
  },
  seatMismatch: {
    initialPlacementsCode: 'CNL_COMPILER_SCENARIO_PLACEMENT_SEAT_MISMATCH',
    outOfPlayCode: 'CNL_COMPILER_SCENARIO_OUT_OF_PLAY_SEAT_MISMATCH',
    message: (actualSeat, pieceTypeId, expectedSeat) =>
      `Seat "${actualSeat}" does not match piece type "${pieceTypeId}" (expected "${expectedSeat}").`,
    suggestion: (expectedSeat) => `Set seat to "${expectedSeat}" or use a different piece type.`,
  },
  conservationViolation: {
    code: 'CNL_COMPILER_SCENARIO_PIECE_CONSERVATION_VIOLATED',
    message: (pieceTypeId, usedCount, totalInventory) =>
      `Piece type "${pieceTypeId}" uses ${usedCount} but inventory has only ${totalInventory}.`,
    suggestion: (pieceTypeId, totalInventory) =>
      `Reduce placed + out-of-play count for "${pieceTypeId}" to at most ${totalInventory}.`,
  },
};

export function deriveSectionsFromDataAssets(
  doc: GameSpecDoc,
  diagnostics: Diagnostic[],
  options: {
    readonly defaultScenarioAssetId?: string;
  } = {},
): {
  readonly zones: GameSpecDoc['zones'];
  readonly tokenTypes: GameSpecDoc['tokenTypes'];
  readonly seats: readonly SeatDef[] | null;
  readonly tracks: readonly NumericTrackDef[] | null;
  readonly scenarioInitialTrackValues: ReadonlyArray<{ readonly trackId: string; readonly value: number }> | null;
  readonly markerLattices: readonly SpaceMarkerLatticeDef[] | null;
  readonly spaceMarkers: readonly SpaceMarkerValueDef[] | null;
  readonly stackingConstraints: readonly StackingConstraint[] | null;
  readonly scenarioSetupEffects: readonly EffectAST[];
  readonly runtimeDataAssets: readonly RuntimeDataAsset[];
  readonly tableContracts: readonly RuntimeTableContract[];
  readonly selectedScenarioAssetId?: string;
  readonly derivationFailures: {
    readonly map: boolean;
    readonly pieceCatalog: boolean;
  };
  readonly tokenTraitVocabulary: Readonly<Record<string, readonly string[]>> | null;
} {
  if (doc.dataAssets === null) {
    return {
      zones: null,
      tokenTypes: null,
      seats: null,
      tracks: null,
      scenarioInitialTrackValues: null,
      markerLattices: null,
      spaceMarkers: null,
      stackingConstraints: null,
      scenarioSetupEffects: [],
      runtimeDataAssets: [],
      tableContracts: [],
      derivationFailures: {
        map: false,
        pieceCatalog: false,
      },
      tokenTraitVocabulary: null,
    };
  }

  const mapAssets: Array<{ readonly id: string; readonly payload: MapPayload }> = [];
  const pieceCatalogAssets: Array<{ readonly id: string; readonly payload: PieceCatalogPayload }> = [];
  const runtimeDataAssets: RuntimeDataAsset[] = [];
  const tableContracts: RuntimeTableContract[] = [];
  const scenarioRefs: Array<{
    readonly payload: ScenarioPayload;
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
    const declaredTableContracts = readDeclaredRuntimeTableContracts(rawAsset, `${pathPrefix}.tableContracts`, diagnostics);
    const validated = validateDataAssetEnvelope(
      {
        id: rawAsset.id,
        kind: rawAsset.kind,
        payload: rawAsset.payload,
      },
      {
      pathPrefix,
      },
    );
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

    runtimeDataAssets.push({
      id: validated.asset.id,
      kind: validated.asset.kind,
      payload: validated.asset.payload,
    });
    tableContracts.push(
      ...deriveRuntimeTableContracts(
        validated.asset.id,
        validated.asset.payload,
        declaredTableContracts,
        diagnostics,
        `${pathPrefix}.tableContracts`,
      ),
    );

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
        payload,
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

  const shouldResolveMap =
    !skipAssetInference && (selectedScenario?.mapAssetId !== undefined || mapAssets.length === 1);
  const selectedMapResult = shouldResolveMap
    ? selectAssetById(
        mapAssets,
        selectedScenario?.mapAssetId,
        diagnostics,
        'map',
        selectedScenario?.path ?? 'doc.dataAssets',
        selectedScenario?.entityId,
      )
    : { selected: undefined, failed: false };
  mapDerivationFailed = mapDerivationFailed || selectedMapResult.failed;
  const selectedMap = selectedMapResult.selected;
  const shouldResolvePieceCatalog =
    !skipAssetInference && (selectedScenario?.pieceCatalogAssetId !== undefined || pieceCatalogAssets.length === 1);
  const selectedPieceCatalogResult = shouldResolvePieceCatalog
    ? selectAssetById(
        pieceCatalogAssets,
        selectedScenario?.pieceCatalogAssetId,
        diagnostics,
        'pieceCatalog',
        selectedScenario?.path ?? 'doc.dataAssets',
        selectedScenario?.entityId,
      )
    : { selected: undefined, failed: false };
  pieceCatalogDerivationFailed = pieceCatalogDerivationFailed || selectedPieceCatalogResult.failed;
  const selectedPieceCatalog = selectedPieceCatalogResult.selected;

  const zones =
    selectedMap === undefined
      ? null
      : selectedMap.payload.spaces.map((space) => ({
          id: space.id,
          zoneKind: 'board' as const,
          owner: 'none',
          visibility: 'public',
          ordering: 'set',
          adjacentTo: [...space.adjacentTo]
            .sort((left, right) => {
              const toCompare = left.to.localeCompare(right.to);
              if (toCompare !== 0) {
                return toCompare;
              }
              return (left.direction ?? 'bidirectional').localeCompare(right.direction ?? 'bidirectional');
            })
            .map((entry) => ({
              to: entry.to,
              direction: entry.direction ?? 'bidirectional',
              ...(entry.category === undefined ? {} : { category: entry.category }),
              ...(entry.attributes === undefined ? {} : { attributes: entry.attributes }),
            })),
          ...(space.category === undefined ? {} : { category: space.category }),
          ...(space.attributes === undefined ? {} : { attributes: space.attributes }),
        }));

  const tokenTypes =
    selectedPieceCatalog === undefined
      ? null
      : selectedPieceCatalog.payload.pieceTypes.map((pieceType) => ({
          id: pieceType.id,
          seat: pieceType.seat,
          props: Object.fromEntries(
            Object.entries({
              ...(pieceType.runtimeProps === undefined ? {} : inferRuntimePropSchema(pieceType.runtimeProps)),
              ...Object.fromEntries(
                [...pieceType.statusDimensions]
                  .sort((left, right) => left.localeCompare(right))
                  .map((dimension) => [dimension, 'string']),
              ),
            }),
          ),
        }));

  const scenarioSetupEffects = buildScenarioSetupEffects({
    selectedScenario,
    selectedPieceCatalog,
    diagnostics,
  });

  return {
    zones,
    tokenTypes,
    seats: selectedPieceCatalog?.payload.seats ?? null,
    tracks: selectedMap?.payload.tracks ?? null,
    scenarioInitialTrackValues: selectedScenario?.initialTrackValues ?? null,
    markerLattices: selectedMap?.payload.markerLattices ?? null,
    spaceMarkers: selectedMap?.payload.spaceMarkers ?? null,
    stackingConstraints: selectedMap?.payload.stackingConstraints ?? null,
    scenarioSetupEffects,
    runtimeDataAssets,
    tableContracts,
    ...(selectedScenario?.entityId === undefined ? {} : { selectedScenarioAssetId: selectedScenario.entityId }),
    derivationFailures: {
      map: mapDerivationFailed,
      pieceCatalog: pieceCatalogDerivationFailed,
    },
    tokenTraitVocabulary:
      selectedPieceCatalog === undefined
        ? null
        : deriveTokenTraitVocabularyFromPieceCatalogPayload(selectedPieceCatalog.payload),
  };
}

function selectScenarioRef(
  scenarios: ReadonlyArray<{
    readonly payload: ScenarioPayload;
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
        readonly payload: ScenarioPayload;
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

const inferRuntimePropSchema = (
  runtimeProps: Readonly<Record<string, string | number | boolean>>,
): Readonly<Record<string, 'string' | 'int' | 'boolean'>> =>
  Object.fromEntries(
    Object.entries(runtimeProps).map(([key, value]) => [
      key,
      typeof value === 'number' ? 'int' : typeof value === 'boolean' ? 'boolean' : 'string',
    ]),
  );

interface ScenarioSetupContext {
  readonly selectedScenario:
    | {
        readonly payload: ScenarioPayload;
        readonly path: string;
      }
    | undefined;
  readonly selectedPieceCatalog:
    | {
        readonly payload: PieceCatalogPayload;
      }
    | undefined;
  readonly diagnostics: Diagnostic[];
}

const buildScenarioSetupEffects = ({
  selectedScenario,
  selectedPieceCatalog,
  diagnostics,
}: ScenarioSetupContext): readonly EffectAST[] => {
  if (selectedScenario === undefined || selectedPieceCatalog === undefined) {
    return [];
  }

  const scenario = selectedScenario.payload;
  const hasProjectionInputs = (scenario.initialPlacements ?? []).length > 0 || (scenario.outOfPlay ?? []).length > 0;
  if ((scenario.seatPools ?? []).length === 0) {
    if (hasProjectionInputs) {
      diagnostics.push({
        code: 'CNL_COMPILER_SCENARIO_SEAT_POOLS_REQUIRED',
        path: `${selectedScenario.path}.seatPools`,
        severity: 'error',
        message: 'Scenario defines initialPlacements/outOfPlay but payload.seatPools is missing or empty.',
        suggestion: 'Add payload.seatPools entries with availableZoneId/outOfPlayZoneId for participating seats.',
      });
    }
    return [];
  }
  const pieceTypesById = new Map(selectedPieceCatalog.payload.pieceTypes.map((pieceType) => [pieceType.id, pieceType]));
  const inventoryByPieceType = new Map<string, number>();
  for (const entry of selectedPieceCatalog.payload.inventory) {
    inventoryByPieceType.set(entry.pieceTypeId, (inventoryByPieceType.get(entry.pieceTypeId) ?? 0) + entry.total);
  }

  const poolBySeat = new Map((scenario.seatPools ?? []).map((pool) => [pool.seat, pool]));
  const effects: EffectAST[] = [];
  const usedByPieceType = new Map<string, number>();
  const pieceTypeSeatById = new Map<string, string>();
  for (const [pieceTypeId, pieceType] of pieceTypesById.entries()) {
    pieceTypeSeatById.set(pieceTypeId, pieceType.seat);
  }
  const scenarioEntries = collectScenarioProjectionEntries(scenario, selectedScenario.path);
  const projectionIssues = evaluateScenarioProjectionInvariants(
    scenarioEntries,
    pieceTypeSeatById,
    inventoryByPieceType,
  );
  diagnostics.push(
    ...mapScenarioProjectionInvariantIssuesToDiagnostics(projectionIssues, COMPILER_SCENARIO_PROJECTION_DIAGNOSTIC_DIALECT, {
      conservationPath: `${selectedScenario.path}`,
    }),
  );
  const oversubscribedPieceTypes = new Set(projectionIssues.conservationViolation.map((issue) => issue.pieceTypeId));

  for (const placement of scenario.initialPlacements ?? []) {
    const pieceType = pieceTypesById.get(placement.pieceTypeId);
    if (pieceType === undefined) {
      continue;
    }
    if (placement.seat !== pieceType.seat) {
      continue;
    }
    const props = resolveScenarioTokenProps(pieceType, placement.status);
    for (let index = 0; index < placement.count; index += 1) {
      effects.push({
        createToken: {
          type: placement.pieceTypeId,
          zone: placement.spaceId,
          ...(Object.keys(props).length === 0 ? {} : { props }),
        },
      });
    }
    usedByPieceType.set(placement.pieceTypeId, (usedByPieceType.get(placement.pieceTypeId) ?? 0) + placement.count);
  }

  for (const [index, outOfPlay] of (scenario.outOfPlay ?? []).entries()) {
    const pieceType = pieceTypesById.get(outOfPlay.pieceTypeId);
    if (pieceType === undefined) {
      continue;
    }
    if (outOfPlay.seat !== pieceType.seat) {
      continue;
    }
    const pool = poolBySeat.get(outOfPlay.seat);
    if (pool?.outOfPlayZoneId === undefined) {
      diagnostics.push({
        code: 'CNL_COMPILER_SCENARIO_OUT_OF_PLAY_POOL_MISSING',
        path: `${selectedScenario.path}.outOfPlay.${index}.seat`,
        severity: 'error',
        message: `Scenario outOfPlay entry references seat "${outOfPlay.seat}" without an out-of-play zone mapping.`,
        suggestion: 'Add payload.seatPools entry with outOfPlayZoneId for this seat.',
      });
      continue;
    }

    const props = resolveScenarioTokenProps(pieceType, undefined);
    for (let count = 0; count < outOfPlay.count; count += 1) {
      effects.push({
        createToken: {
          type: outOfPlay.pieceTypeId,
          zone: pool.outOfPlayZoneId,
          ...(Object.keys(props).length === 0 ? {} : { props }),
        },
      });
    }
    usedByPieceType.set(outOfPlay.pieceTypeId, (usedByPieceType.get(outOfPlay.pieceTypeId) ?? 0) + outOfPlay.count);
  }

  for (const [pieceTypeId, total] of inventoryByPieceType.entries()) {
    const pieceType = pieceTypesById.get(pieceTypeId);
    if (pieceType === undefined) {
      continue;
    }
    if (oversubscribedPieceTypes.has(pieceTypeId)) {
      continue;
    }
    const used = usedByPieceType.get(pieceTypeId) ?? 0;
    const remaining = total - used;
    if (remaining === 0) {
      continue;
    }
    const pool = poolBySeat.get(pieceType.seat);
    if (pool?.availableZoneId === undefined) {
      diagnostics.push({
        code: 'CNL_COMPILER_SCENARIO_AVAILABLE_POOL_MISSING',
        path: `${selectedScenario.path}.seatPools`,
        severity: 'error',
        message: `Scenario is missing available pool mapping for seat "${pieceType.seat}" (pieceType "${pieceTypeId}").`,
        suggestion: 'Add payload.seatPools entries with availableZoneId for each seat used by piece catalog inventory.',
      });
      continue;
    }
    const props = resolveScenarioTokenProps(pieceType, undefined);
    for (let count = 0; count < remaining; count += 1) {
      effects.push({
        createToken: {
          type: pieceTypeId,
          zone: pool.availableZoneId,
          ...(Object.keys(props).length === 0 ? {} : { props }),
        },
      });
    }
  }

  return effects;
};

type DeclaredRuntimeTableContract = {
  readonly tablePath: string;
  readonly uniqueBy?: readonly (readonly [string, ...string[]])[];
  readonly constraints?: RuntimeTableContract['constraints'];
};

function readDeclaredRuntimeTableContracts(
  rawAsset: Record<string, unknown>,
  path: string,
  diagnostics: Diagnostic[],
): readonly DeclaredRuntimeTableContract[] {
  const rawContracts = rawAsset.tableContracts;
  if (rawContracts === undefined || rawContracts === null) {
    return [];
  }
  if (!Array.isArray(rawContracts)) {
    diagnostics.push({
      code: 'CNL_COMPILER_RUNTIME_TABLE_CONTRACTS_INVALID',
      path,
      severity: 'error',
      message: 'tableContracts must be an array when provided.',
      suggestion: 'Set tableContracts to an array of tablePath/uniqueBy/constraints objects.',
    });
    return [];
  }

  const results: DeclaredRuntimeTableContract[] = [];
  const seenTablePaths = new Set<string>();
  for (const [index, contract] of rawContracts.entries()) {
    const contractPath = `${path}.${index}`;
    if (!isRecord(contract)) {
      diagnostics.push({
        code: 'CNL_COMPILER_RUNTIME_TABLE_CONTRACT_INVALID',
        path: contractPath,
        severity: 'error',
        message: 'tableContracts entries must be objects.',
        suggestion: 'Use { tablePath, uniqueBy?, constraints? }.',
      });
      continue;
    }

    const tablePath = typeof contract.tablePath === 'string' ? contract.tablePath.trim() : '';
    if (tablePath.length === 0) {
      diagnostics.push({
        code: 'CNL_COMPILER_RUNTIME_TABLE_CONTRACT_PATH_INVALID',
        path: `${contractPath}.tablePath`,
        severity: 'error',
        message: 'tableContracts[].tablePath must be a non-empty string.',
        suggestion: 'Set tablePath to a dotted payload path such as "settings.blindSchedule".',
      });
      continue;
    }
    if (seenTablePaths.has(tablePath)) {
      diagnostics.push({
        code: 'CNL_COMPILER_RUNTIME_TABLE_CONTRACT_PATH_DUPLICATE',
        path: `${contractPath}.tablePath`,
        severity: 'error',
        message: `Duplicate tableContracts entry for tablePath "${tablePath}".`,
        suggestion: 'Keep one declaration per tablePath.',
      });
      continue;
    }
    seenTablePaths.add(tablePath);

    let uniqueBy: DeclaredRuntimeTableContract['uniqueBy'] | undefined;
    if (contract.uniqueBy !== undefined) {
      if (!Array.isArray(contract.uniqueBy)) {
        diagnostics.push({
          code: 'CNL_COMPILER_RUNTIME_TABLE_UNIQUE_BY_INVALID',
          path: `${contractPath}.uniqueBy`,
          severity: 'error',
          message: 'tableContracts[].uniqueBy must be an array of non-empty string tuples.',
          suggestion: 'Set uniqueBy like [["level"], ["phase", "level"]].',
        });
        continue;
      }
      const parsedTuples: Array<readonly [string, ...string[]]> = [];
      let tupleValidationFailed = false;
      for (const [tupleIndex, tuple] of contract.uniqueBy.entries()) {
        const tuplePath = `${contractPath}.uniqueBy.${tupleIndex}`;
        if (!Array.isArray(tuple) || tuple.length === 0 || tuple.some((field) => typeof field !== 'string' || field.trim().length === 0)) {
          diagnostics.push({
            code: 'CNL_COMPILER_RUNTIME_TABLE_UNIQUE_BY_INVALID',
            path: tuplePath,
            severity: 'error',
            message: 'Each uniqueBy tuple must be a non-empty array of non-empty field names.',
            suggestion: 'Use tuples like ["level"] or ["season", "round"].',
          });
          tupleValidationFailed = true;
          continue;
        }
        parsedTuples.push(tuple.map((field) => field.trim()) as [string, ...string[]]);
      }
      if (tupleValidationFailed) {
        continue;
      }
      uniqueBy = parsedTuples;
    }

    let constraints: DeclaredRuntimeTableContract['constraints'] | undefined;
    if (contract.constraints !== undefined) {
      if (!Array.isArray(contract.constraints)) {
        diagnostics.push({
          code: 'CNL_COMPILER_RUNTIME_TABLE_CONSTRAINTS_INVALID',
          path: `${contractPath}.constraints`,
          severity: 'error',
          message: 'tableContracts[].constraints must be an array when provided.',
          suggestion: 'Use an array of generic constraints (monotonic/contiguousInt/numericRange).',
        });
        continue;
      }

      const parsedConstraints: NonNullable<DeclaredRuntimeTableContract['constraints']>[number][] = [];
      let constraintValidationFailed = false;
      for (const [constraintIndex, rawConstraint] of contract.constraints.entries()) {
        const parsed = RuntimeTableConstraintSchema.safeParse(rawConstraint);
        if (!parsed.success) {
          diagnostics.push({
            code: 'CNL_COMPILER_RUNTIME_TABLE_CONSTRAINT_INVALID',
            path: `${contractPath}.constraints.${constraintIndex}`,
            severity: 'error',
            message: parsed.error.issues[0]?.message ?? 'Invalid runtime table constraint.',
            suggestion: 'Use a valid generic runtime table constraint shape.',
          });
          constraintValidationFailed = true;
          continue;
        }
        const normalizedConstraint =
          parsed.data.kind === 'monotonic'
            ? {
                kind: 'monotonic' as const,
                field: parsed.data.field,
                direction: parsed.data.direction,
                ...(parsed.data.strict === undefined ? {} : { strict: parsed.data.strict }),
              }
            : parsed.data.kind === 'contiguousInt'
              ? {
                  kind: 'contiguousInt' as const,
                  field: parsed.data.field,
                  ...(parsed.data.start === undefined ? {} : { start: parsed.data.start }),
                  ...(parsed.data.step === undefined ? {} : { step: parsed.data.step }),
                }
              : {
                  kind: 'numericRange' as const,
                  field: parsed.data.field,
                  ...(parsed.data.min === undefined ? {} : { min: parsed.data.min }),
                  ...(parsed.data.max === undefined ? {} : { max: parsed.data.max }),
                };
        parsedConstraints.push(normalizedConstraint);
      }
      if (constraintValidationFailed) {
        continue;
      }
      constraints = parsedConstraints;
    }

    results.push({
      tablePath,
      ...(uniqueBy === undefined ? {} : { uniqueBy }),
      ...(constraints === undefined ? {} : { constraints }),
    });
  }

  return results;
}

function deriveRuntimeTableContracts(
  assetId: string,
  payload: unknown,
  declaredContracts: readonly DeclaredRuntimeTableContract[],
  diagnostics: Diagnostic[],
  declarationPath: string,
): readonly RuntimeTableContract[] {
  const contracts: RuntimeTableContract[] = [];
  const visited = new Set<unknown>();

  const walk = (node: unknown, pathSegments: readonly string[]): void => {
    if (typeof node !== 'object' || node === null) {
      return;
    }
    if (visited.has(node)) {
      return;
    }
    visited.add(node);

    if (Array.isArray(node)) {
      const rowFields = deriveScalarRowFields(node);
      if (rowFields !== null && pathSegments.length > 0) {
        const tablePath = pathSegments.join('.');
        const uniqueBy = deriveSingleFieldUniqueKeys(node, rowFields);
        contracts.push({
          id: `${assetId}::${tablePath}`,
          assetId,
          tablePath,
          fields: rowFields,
          ...(uniqueBy.length === 0 ? {} : { uniqueBy }),
        });
      }
      return;
    }

    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      walk(value, [...pathSegments, key]);
    }
  };

  walk(payload, []);
  const contractsByTablePath = new Map(contracts.map((contract) => [contract.tablePath, contract] as const));

  for (const [index, declared] of declaredContracts.entries()) {
    const target = contractsByTablePath.get(declared.tablePath);
    if (target === undefined) {
      diagnostics.push({
        code: 'CNL_COMPILER_RUNTIME_TABLE_CONTRACT_PATH_UNKNOWN',
        path: `${declarationPath}.${index}.tablePath`,
        severity: 'error',
        message: `tableContracts entry references unknown tablePath "${declared.tablePath}" for asset "${assetId}".`,
        suggestion: 'Use a tablePath that resolves to an array of scalar-object rows in payload.',
      });
      continue;
    }
    contractsByTablePath.set(declared.tablePath, {
      ...target,
      ...(declared.uniqueBy === undefined ? {} : { uniqueBy: declared.uniqueBy }),
      ...(declared.constraints === undefined ? {} : { constraints: declared.constraints }),
    });
  }

  return [...contractsByTablePath.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function deriveScalarRowFields(rows: readonly unknown[]): RuntimeTableContract['fields'] | null {
  for (const row of rows) {
    if (typeof row !== 'object' || row === null || Array.isArray(row)) {
      return null;
    }
  }

  const fieldKinds = new Map<string, RuntimeTableContract['fields'][number]['type']>();
  for (const row of rows as readonly Record<string, unknown>[]) {
    for (const [field, value] of Object.entries(row)) {
      const kind = scalarTypeOf(value);
      if (kind === null) {
        return null;
      }
      const existing = fieldKinds.get(field);
      if (existing !== undefined && existing !== kind) {
        return null;
      }
      fieldKinds.set(field, kind);
    }
  }

  return [...fieldKinds.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([field, type]) => ({ field, type }));
}

function deriveSingleFieldUniqueKeys(
  rows: readonly unknown[],
  rowFields: RuntimeTableContract['fields'],
): readonly (readonly [string])[] {
  if (rows.length === 0 || rowFields.length === 0) {
    return [];
  }

  const scalarRows = rows as readonly Record<string, unknown>[];
  const uniqueBy: Array<readonly [string]> = [];

  for (const fieldContract of rowFields) {
    const seenValues = new Set<string>();
    let isUnique = true;
    for (const row of scalarRows) {
      if (!(fieldContract.field in row)) {
        isUnique = false;
        break;
      }
      const value = row[fieldContract.field];
      if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
        isUnique = false;
        break;
      }
      const valueKey = JSON.stringify([typeof value, value]);
      if (seenValues.has(valueKey)) {
        isUnique = false;
        break;
      }
      seenValues.add(valueKey);
    }
    if (isUnique) {
      uniqueBy.push([fieldContract.field]);
    }
  }

  return uniqueBy;
}

function scalarTypeOf(value: unknown): RuntimeTableContract['fields'][number]['type'] | null {
  if (typeof value === 'string') {
    return 'string';
  }
  if (typeof value === 'boolean') {
    return 'boolean';
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Number.isSafeInteger(value) ? 'int' : null;
  }
  return null;
}

const defaultStatusForDimension = (dimension: PieceStatusDimension): string =>
  dimension === 'activity' ? 'underground' : 'untunneled';

const resolveScenarioTokenProps = (
  pieceType: PieceCatalogPayload['pieceTypes'][number],
  status: Readonly<Record<string, string>> | undefined,
): Readonly<Record<string, string | number | boolean>> => {
  const props: Record<string, string | number | boolean> = {
    ...(pieceType.runtimeProps ?? {}),
  };
  for (const dimension of pieceType.statusDimensions) {
    if (!(dimension in props)) {
      props[dimension] = defaultStatusForDimension(dimension);
    }
  }
  if (status !== undefined) {
    for (const [key, value] of Object.entries(status)) {
      props[key] = value;
    }
  }
  return props;
};

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
