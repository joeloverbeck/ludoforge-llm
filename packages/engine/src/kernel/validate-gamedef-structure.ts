import type { Diagnostic } from './diagnostics.js';
import { attributeValueEquals } from './attribute-value-equals.js';
import { RUNTIME_RESERVED_MOVE_BINDING_NAMES } from './move-runtime-bindings.js';
import { resolveRuntimeTableRowsByPath } from './runtime-table-path.js';
import type { GameDef, PlayerSel, ScenarioPiecePlacement, StackingConstraint, VariableDef, ZoneDef } from './types.js';

const MAX_ALTERNATIVE_DISTANCE = 3;
const PLAYER_ZONE_QUALIFIER_PATTERN = /^[0-9]+$/;
const RESERVED_RUNTIME_PARAM_NAMES: ReadonlySet<string> = new Set(RUNTIME_RESERVED_MOVE_BINDING_NAMES);

export type ValidationContext = {
  globalVarNames: Set<string>;
  perPlayerVarNames: Set<string>;
  globalVarTypesByName: ReadonlyMap<string, VariableDef['type']>;
  perPlayerVarTypesByName: ReadonlyMap<string, VariableDef['type']>;
  globalVarCandidates: readonly string[];
  perPlayerVarCandidates: readonly string[];
  zoneVarNames: Set<string>;
  zoneVarTypesByName: ReadonlyMap<string, 'int'>;
  zoneVarCandidates: readonly string[];
  markerLatticeNames: Set<string>;
  markerLatticeCandidates: readonly string[];
  markerLatticeStatesById: ReadonlyMap<string, readonly string[]>;
  globalMarkerLatticeNames: Set<string>;
  globalMarkerLatticeCandidates: readonly string[];
  globalMarkerLatticeStatesById: ReadonlyMap<string, readonly string[]>;
  zoneNames: Set<string>;
  zoneCandidates: readonly string[];
  zoneOwners: ReadonlyMap<string, GameDef['zones'][number]['owner']>;
  mapSpaceZoneNames: Set<string>;
  mapSpaceZoneCandidates: readonly string[];
  mapSpacePropCandidates: readonly string[];
  mapSpacePropKinds: ReadonlyMap<string, 'scalar' | 'array' | 'mixed'>;
  runtimeDataAssetIdsByNormalized: ReadonlyMap<string, string>;
  runtimeDataAssetPayloadByNormalized: ReadonlyMap<string, unknown>;
  runtimeDataAssetCandidates: readonly string[];
  tableContractsById: ReadonlyMap<string, NonNullable<GameDef['tableContracts']>[number]>;
  tableContractCandidates: readonly string[];
  tokenTypeNames: Set<string>;
  tokenTypeCandidates: readonly string[];
  tokenFilterPropCandidates: readonly string[];
  turnPhaseNames: Set<string>;
  turnPhaseCandidates: readonly string[];
  phaseNames: Set<string>;
  phaseCandidates: readonly string[];
  playerIdMin: number;
  playerIdMaxInclusive: number;
};

export const checkDuplicateIds = (
  diagnostics: Diagnostic[],
  values: readonly string[],
  code: string,
  label: string,
  pathPrefix: string,
): void => {
  const seen = new Set<string>();

  for (const [index, value] of values.entries()) {
    if (!seen.has(value)) {
      seen.add(value);
      continue;
    }

    diagnostics.push({
      code,
      path: `${pathPrefix}[${index}]`,
      severity: 'error',
      message: `Duplicate ${label} "${value}".`,
    });
  }
};

const canonicalUniqueKeyTuple = (tuple: readonly string[]): string =>
  [...tuple].sort((left, right) => left.localeCompare(right)).join('\u0000');

function encodeRuntimeTableScalar(value: string | number | boolean): string {
  if (typeof value === 'string') {
    return `s:${value}`;
  }
  if (typeof value === 'number') {
    return `n:${value}`;
  }
  return `b:${value ? '1' : '0'}`;
}


const levenshteinDistance = (left: string, right: string): number => {
  const cols = right.length + 1;
  let previousRow: number[] = Array.from({ length: cols }, (_unused, index) => index);

  for (let row = 1; row <= left.length; row += 1) {
    const currentRow: number[] = new Array<number>(cols).fill(0);
    currentRow[0] = row;

    for (let col = 1; col <= right.length; col += 1) {
      const substitutionCost = left[row - 1] === right[col - 1] ? 0 : 1;
      const insertCost = (currentRow[col - 1] ?? Number.POSITIVE_INFINITY) + 1;
      const deleteCost = (previousRow[col] ?? Number.POSITIVE_INFINITY) + 1;
      const replaceCost = (previousRow[col - 1] ?? Number.POSITIVE_INFINITY) + substitutionCost;
      currentRow[col] = Math.min(insertCost, deleteCost, replaceCost);
    }

    previousRow = currentRow;
  }

  return previousRow[right.length] ?? 0;
};

const getAlternatives = (value: string, validValues: readonly string[]): readonly string[] => {
  if (validValues.length === 0) {
    return [];
  }

  const scored = validValues
    .map((candidate) => ({ candidate, distance: levenshteinDistance(value, candidate) }))
    .sort((left, right) => {
      if (left.distance !== right.distance) {
        return left.distance - right.distance;
      }

      return left.candidate.localeCompare(right.candidate);
    });

  const bestDistance = scored[0]?.distance;
  if (bestDistance === undefined || bestDistance > MAX_ALTERNATIVE_DISTANCE) {
    return [];
  }

  return scored.filter((item) => item.distance === bestDistance).map((item) => item.candidate);
};

export const pushMissingReferenceDiagnostic = (
  diagnostics: Diagnostic[],
  code: string,
  path: string,
  message: string,
  value: string,
  validValues: readonly string[],
): void => {
  const alternatives = getAlternatives(value, validValues);
  const suggestion =
    alternatives.length > 0 ? `Did you mean "${alternatives[0]}"?` : 'Use one of the declared values.';

  if (alternatives.length > 0) {
    diagnostics.push({
      code,
      path,
      severity: 'error',
      message,
      suggestion,
      alternatives,
    });
    return;
  }

  diagnostics.push({
    code,
    path,
    severity: 'error',
    message,
    suggestion,
  });
};

export const parseZoneSelector = (
  zoneSelector: string,
): {
  base: string;
  qualifier: string | null;
} => {
  const separatorIndex = zoneSelector.lastIndexOf(':');
  if (separatorIndex < 0 || separatorIndex === zoneSelector.length - 1) {
    return {
      base: zoneSelector,
      qualifier: null,
    };
  }

  return {
    base: zoneSelector.slice(0, separatorIndex),
    qualifier: zoneSelector.slice(separatorIndex + 1),
  };
};

export const validatePlayerSelector = (
  diagnostics: Diagnostic[],
  playerSelector: PlayerSel,
  path: string,
  context: ValidationContext,
): void => {
  if (typeof playerSelector !== 'object' || !('id' in playerSelector)) {
    return;
  }

  const id = playerSelector.id;
  if (!Number.isInteger(id) || id < context.playerIdMin || id > context.playerIdMaxInclusive) {
    diagnostics.push({
      code: 'PLAYER_SELECTOR_ID_OUT_OF_BOUNDS',
      path,
      severity: 'error',
      message: `PlayerSel.id must be an integer in [${context.playerIdMin}, ${context.playerIdMaxInclusive}] based on metadata.players.max.`,
      suggestion: `Use a value between ${context.playerIdMin} and ${context.playerIdMaxInclusive}, or a dynamic selector such as "active".`,
    });
  }
};

export const validateZoneSelector = (
  diagnostics: Diagnostic[],
  zoneSelector: string,
  path: string,
  context: ValidationContext,
): void => {
  // Dynamic zone bindings (for example "$zone") are resolved at runtime.
  if (zoneSelector.startsWith('$')) {
    return;
  }

  if (context.zoneNames.has(zoneSelector)) {
    const owner = context.zoneOwners.get(zoneSelector);
    const qualifier = parseZoneSelector(zoneSelector).qualifier;

    if (owner !== undefined && qualifier !== null) {
      if (qualifier === 'none' && owner !== 'none') {
        diagnostics.push({
          code: 'ZONE_SELECTOR_OWNERSHIP_INVALID',
          path,
          severity: 'error',
          message: `Selector "${zoneSelector}" uses :none, but zone "${zoneSelector}" is owner "${owner}".`,
          suggestion: `Use a selector that targets a player-owned zone, or change "${zoneSelector}" owner to "none".`,
        });
      } else if (qualifier !== 'none' && owner !== 'player') {
        diagnostics.push({
          code: 'ZONE_SELECTOR_OWNERSHIP_INVALID',
          path,
          severity: 'error',
          message: `Selector "${zoneSelector}" is owner-qualified, but zone "${zoneSelector}" is owner "${owner}".`,
          suggestion: `Use :none for unowned zones, or change "${zoneSelector}" owner to "player".`,
        });
      }
    }

    return;
  }

  const { base, qualifier } = parseZoneSelector(zoneSelector);
  const baseMatches = context.zoneCandidates.filter((candidate) => candidate.startsWith(`${base}:`));

  if (baseMatches.length === 0) {
    pushMissingReferenceDiagnostic(
      diagnostics,
      'REF_ZONE_MISSING',
      path,
      `Unknown zone "${zoneSelector}".`,
      zoneSelector,
      context.zoneCandidates,
    );
    return;
  }

  if (qualifier === null) {
    return;
  }

  const hasUnownedVariant = baseMatches.some((candidate) => context.zoneOwners.get(candidate) === 'none');
  const hasPlayerOwnedVariant = baseMatches.some((candidate) => context.zoneOwners.get(candidate) === 'player');

  if (qualifier === 'none') {
    if (!hasUnownedVariant) {
      diagnostics.push({
        code: 'ZONE_SELECTOR_OWNERSHIP_INVALID',
        path,
        severity: 'error',
        message: `Selector "${zoneSelector}" uses :none, but zone base "${base}" is player-owned.`,
        suggestion: `Use a selector that targets a player-owned zone, or change "${base}" owner to "none".`,
      });
    }
    return;
  }

  if (!hasPlayerOwnedVariant) {
    diagnostics.push({
      code: 'ZONE_SELECTOR_OWNERSHIP_INVALID',
      path,
      severity: 'error',
      message: `Selector "${zoneSelector}" is owner-qualified, but zone base "${base}" is unowned.`,
      suggestion: `Use :none for unowned zones, or change "${base}" owner to "player".`,
    });
  }
};

export const validateStructureSections = (diagnostics: Diagnostic[], def: GameDef): void => {
  if (def.metadata.players.min < 1) {
    diagnostics.push({
      code: 'META_PLAYERS_MIN_INVALID',
      path: 'metadata.players.min',
      severity: 'error',
      message: `metadata.players.min must be >= 1; received ${def.metadata.players.min}.`,
    });
  }
  if (def.metadata.players.min > def.metadata.players.max) {
    diagnostics.push({
      code: 'META_PLAYERS_RANGE_INVALID',
      path: 'metadata.players',
      severity: 'error',
      message: `metadata.players.min (${def.metadata.players.min}) must be <= metadata.players.max (${def.metadata.players.max}).`,
    });
  }
  if (
    def.metadata.maxTriggerDepth !== undefined &&
    (!Number.isInteger(def.metadata.maxTriggerDepth) || def.metadata.maxTriggerDepth < 1)
  ) {
    diagnostics.push({
      code: 'META_MAX_TRIGGER_DEPTH_INVALID',
      path: 'metadata.maxTriggerDepth',
      severity: 'error',
      message: `metadata.maxTriggerDepth must be an integer >= 1; received ${def.metadata.maxTriggerDepth}.`,
    });
  }

  def.globalVars.forEach((variable, index) => {
    if (variable.type === 'int' && (variable.min > variable.init || variable.init > variable.max)) {
      diagnostics.push({
        code: 'VAR_BOUNDS_INVALID',
        path: `globalVars[${index}]`,
        severity: 'error',
        message: `Variable "${variable.name}" must satisfy min <= init <= max; received ${variable.min} <= ${variable.init} <= ${variable.max}.`,
      });
    }
  });
  def.perPlayerVars.forEach((variable, index) => {
    if (variable.type === 'int' && (variable.min > variable.init || variable.init > variable.max)) {
      diagnostics.push({
        code: 'VAR_BOUNDS_INVALID',
        path: `perPlayerVars[${index}]`,
        severity: 'error',
        message: `Variable "${variable.name}" must satisfy min <= init <= max; received ${variable.min} <= ${variable.init} <= ${variable.max}.`,
      });
    }
  });
  (def.zoneVars ?? []).forEach((variable, index) => {
    if (variable.type !== 'int') {
      diagnostics.push({
        code: 'ZONE_VAR_TYPE_INVALID',
        path: `zoneVars[${index}].type`,
        severity: 'error',
        message: `zoneVars variable \"${variable.name}\" must use type \"int\".`,
        suggestion: 'Use int zoneVars definitions; boolean zoneVars are not supported.',
      });
      return;
    }
    if (variable.min > variable.init || variable.init > variable.max) {
      diagnostics.push({
        code: 'VAR_BOUNDS_INVALID',
        path: `zoneVars[${index}]`,
        severity: 'error',
        message: `Variable \"${variable.name}\" must satisfy min <= init <= max; received ${variable.min} <= ${variable.init} <= ${variable.max}.`,
      });
    }
  });

  (def.globalMarkerLattices ?? []).forEach((lattice, index) => {
    if (lattice.states.length === 0) {
      diagnostics.push({
        code: 'GLOBAL_MARKER_LATTICE_STATES_EMPTY',
        path: `globalMarkerLattices[${index}].states`,
        severity: 'error',
        message: `Global marker lattice "${lattice.id}" must declare at least one state.`,
      });
      return;
    }
    if (!lattice.states.includes(lattice.defaultState)) {
      diagnostics.push({
        code: 'GLOBAL_MARKER_LATTICE_DEFAULT_INVALID',
        path: `globalMarkerLattices[${index}].defaultState`,
        severity: 'error',
        message: `Global marker lattice "${lattice.id}" defaultState "${lattice.defaultState}" must exist in states.`,
        suggestion: 'Set defaultState to one of the declared states.',
      });
    }
    checkDuplicateIds(
      diagnostics,
      lattice.states,
      'DUPLICATE_GLOBAL_MARKER_STATE_ID',
      'global marker state id',
      `globalMarkerLattices[${index}].states`,
    );
  });

  checkDuplicateIds(diagnostics, def.zones.map((zone) => zone.id), 'DUPLICATE_ZONE_ID', 'zone id', 'zones');
  checkDuplicateIds(
    diagnostics,
    def.tokenTypes.map((tokenType) => tokenType.id),
    'DUPLICATE_TOKEN_TYPE_ID',
    'token type id',
    'tokenTypes',
  );
  const declaredSeatIds = new Set((def.seats ?? []).map((seatDef) => seatDef.id));
  if (declaredSeatIds.size > 0) {
    def.tokenTypes.forEach((tokenType, tokenTypeIndex) => {
      if (tokenType.seat === undefined || declaredSeatIds.has(tokenType.seat)) {
        return;
      }
      diagnostics.push({
        code: 'TOKEN_TYPE_SEAT_UNDECLARED',
        path: `tokenTypes[${tokenTypeIndex}].seat`,
        severity: 'error',
        message: `Token type "${tokenType.id}" references unknown seat "${tokenType.seat}".`,
        suggestion: 'Use one of the ids declared in seats[].id.',
      });
    });
  }
  checkDuplicateIds(
    diagnostics,
    def.turnStructure.phases.map((phase) => phase.id),
    'DUPLICATE_PHASE_ID',
    'phase id',
    'turnStructure.phases',
  );
  checkDuplicateIds(
    diagnostics,
    (def.turnStructure.interrupts ?? []).map((phase) => phase.id),
    'DUPLICATE_PHASE_ID',
    'interrupt phase id',
    'turnStructure.interrupts',
  );
  const mainPhaseIds = new Set(def.turnStructure.phases.map((phase) => phase.id));
  (def.turnStructure.interrupts ?? []).forEach((phase, index) => {
    if (!mainPhaseIds.has(phase.id)) {
      return;
    }
    diagnostics.push({
      code: 'DUPLICATE_PHASE_ID',
      path: `turnStructure.interrupts[${index}].id`,
      severity: 'error',
      message: `Interrupt phase id "${phase.id}" duplicates a turnStructure.phases id.`,
      suggestion: 'Use distinct ids between turn phases and interrupt phases.',
    });
  });
  checkDuplicateIds(
    diagnostics,
    def.actions.map((action) => action.id),
    'DUPLICATE_ACTION_ID',
    'action id',
    'actions',
  );
  checkDuplicateIds(
    diagnostics,
    def.triggers.map((trigger) => trigger.id),
    'DUPLICATE_TRIGGER_ID',
    'trigger id',
    'triggers',
  );
  checkDuplicateIds(
    diagnostics,
    def.globalVars.map((variable) => variable.name),
    'DUPLICATE_GLOBAL_VAR_NAME',
    'global var name',
    'globalVars',
  );
  checkDuplicateIds(
    diagnostics,
    def.perPlayerVars.map((variable) => variable.name),
    'DUPLICATE_PER_PLAYER_VAR_NAME',
    'per-player var name',
    'perPlayerVars',
  );
  checkDuplicateIds(
    diagnostics,
    (def.actionPipelines ?? []).map((operationProfile) => operationProfile.id),
    'DUPLICATE_OPERATION_PROFILE_ID',
    'operation profile id',
    'actionPipelines',
  );
  checkDuplicateIds(
    diagnostics,
    (def.globalMarkerLattices ?? []).map((lattice) => lattice.id),
    'DUPLICATE_GLOBAL_MARKER_LATTICE_ID',
    'global marker lattice id',
    'globalMarkerLattices',
  );
  checkDuplicateIds(
    diagnostics,
    (def.tableContracts ?? []).map((contract) => contract.id),
    'DUPLICATE_RUNTIME_TABLE_ID',
    'runtime table id',
    'tableContracts',
  );
  (def.tableContracts ?? []).forEach((contract, contractIndex) => {
    checkDuplicateIds(
      diagnostics,
      contract.fields.map((field) => field.field),
      'DUPLICATE_RUNTIME_TABLE_FIELD_ID',
      'runtime table field',
      `tableContracts[${contractIndex}].fields`,
    );

    const declaredFields = new Set(contract.fields.map((field) => field.field));
    const uniqueKeyCandidates = contract.fields.map((field) => field.field);
    const uniqueKeyTuplePaths = new Map<string, number>();
    (contract.uniqueBy ?? []).forEach((tuple, tupleIndex) => {
      const tuplePath = `tableContracts[${contractIndex}].uniqueBy[${tupleIndex}]`;
      if (tuple.length === 0) {
        diagnostics.push({
          code: 'RUNTIME_TABLE_UNIQUE_KEY_EMPTY',
          path: tuplePath,
          severity: 'error',
          message: `Runtime table contract "${contract.id}" uniqueBy tuple must include at least one field.`,
          suggestion: 'Declare one or more field names for each unique key tuple.',
        });
        return;
      }

      const tupleFieldSeen = new Set<string>();
      let tupleValidForDedup = true;
      tuple.forEach((field, fieldIndex) => {
        if (!declaredFields.has(field)) {
          tupleValidForDedup = false;
          pushMissingReferenceDiagnostic(
            diagnostics,
            'REF_RUNTIME_TABLE_UNIQUE_KEY_FIELD_MISSING',
            `${tuplePath}[${fieldIndex}]`,
            `Unknown unique key field "${field}" in runtime table "${contract.id}".`,
            field,
            uniqueKeyCandidates,
          );
          return;
        }
        if (tupleFieldSeen.has(field)) {
          tupleValidForDedup = false;
          diagnostics.push({
            code: 'RUNTIME_TABLE_UNIQUE_KEY_FIELD_DUPLICATE',
            path: `${tuplePath}[${fieldIndex}]`,
            severity: 'error',
            message: `Runtime table contract "${contract.id}" uniqueBy tuple repeats field "${field}".`,
            suggestion: 'Remove duplicate fields from the unique key tuple.',
          });
          return;
        }
        tupleFieldSeen.add(field);
      });

      if (!tupleValidForDedup) {
        return;
      }

      const canonical = canonicalUniqueKeyTuple(tuple);
      const existingTupleIndex = uniqueKeyTuplePaths.get(canonical);
      if (existingTupleIndex !== undefined) {
        diagnostics.push({
          code: 'RUNTIME_TABLE_UNIQUE_KEY_DUPLICATE',
          path: tuplePath,
          severity: 'error',
          message: `Runtime table contract "${contract.id}" uniqueBy tuple duplicates tableContracts[${contractIndex}].uniqueBy[${existingTupleIndex}].`,
          suggestion: 'Keep each declared unique key tuple distinct.',
        });
        return;
      }
      uniqueKeyTuplePaths.set(canonical, tupleIndex);
    });

    const fieldTypeByName = new Map(contract.fields.map((field) => [field.field, field.type] as const));
    (contract.constraints ?? []).forEach((constraint, constraintIndex) => {
      const constraintPath = `tableContracts[${contractIndex}].constraints[${constraintIndex}]`;
      if (!declaredFields.has(constraint.field)) {
        pushMissingReferenceDiagnostic(
          diagnostics,
          'REF_RUNTIME_TABLE_CONSTRAINT_FIELD_MISSING',
          `${constraintPath}.field`,
          `Unknown constraint field "${constraint.field}" in runtime table "${contract.id}".`,
          constraint.field,
          uniqueKeyCandidates,
        );
        return;
      }

      const fieldType = fieldTypeByName.get(constraint.field);
      if (
        (constraint.kind === 'monotonic' || constraint.kind === 'contiguousInt' || constraint.kind === 'numericRange') &&
        fieldType !== 'int'
      ) {
        diagnostics.push({
          code: 'RUNTIME_TABLE_CONSTRAINT_FIELD_TYPE_INVALID',
          path: `${constraintPath}.field`,
          severity: 'error',
          message: `Runtime table constraint "${constraint.kind}" requires int field "${constraint.field}" in table "${contract.id}".`,
          suggestion: 'Use an int field or switch to a compatible constraint kind.',
        });
      }
      if (constraint.kind === 'contiguousInt' && constraint.step !== undefined && constraint.step <= 0) {
        diagnostics.push({
          code: 'RUNTIME_TABLE_CONSTRAINT_STEP_INVALID',
          path: `${constraintPath}.step`,
          severity: 'error',
          message: `Runtime table contiguousInt constraint step must be > 0 for table "${contract.id}".`,
          suggestion: 'Set step to a positive integer.',
        });
      }
      if (
        constraint.kind === 'numericRange' &&
        constraint.min !== undefined &&
        constraint.max !== undefined &&
        constraint.min > constraint.max
      ) {
        diagnostics.push({
          code: 'RUNTIME_TABLE_CONSTRAINT_RANGE_INVALID',
          path: constraintPath,
          severity: 'error',
          message: `Runtime table numericRange constraint min cannot exceed max for field "${constraint.field}" in table "${contract.id}".`,
          suggestion: 'Set min <= max.',
        });
      }
    });
  });
  const runtimeAssets = def.runtimeDataAssets ?? [];
  const runtimeDataAssetCandidates = [...new Set(runtimeAssets.map((asset) => asset.id))].sort((left, right) => left.localeCompare(right));
  const runtimeAssetIdsByNormalized = new Set(runtimeDataAssetCandidates.map((assetId) => assetId.normalize('NFC')));
  const runtimeAssetPayloadByNormalized = new Map<string, unknown>();
  for (const asset of runtimeAssets) {
    const normalized = asset.id.normalize('NFC');
    if (!runtimeAssetPayloadByNormalized.has(normalized)) {
      runtimeAssetPayloadByNormalized.set(normalized, asset.payload);
    }
  }
  (def.tableContracts ?? []).forEach((contract, index) => {
    const normalizedAssetId = contract.assetId.normalize('NFC');
    if (!runtimeAssetIdsByNormalized.has(contract.assetId.normalize('NFC'))) {
      pushMissingReferenceDiagnostic(
        diagnostics,
        'REF_RUNTIME_DATA_ASSET_MISSING',
        `tableContracts[${index}].assetId`,
        `Unknown runtime data asset "${contract.assetId}" for table contract "${contract.id}".`,
        contract.assetId,
        runtimeDataAssetCandidates,
      );
    }
    if (contract.tablePath.trim().length === 0) {
      diagnostics.push({
        code: 'RUNTIME_TABLE_PATH_INVALID',
        path: `tableContracts[${index}].tablePath`,
        severity: 'error',
        message: `Runtime table contract "${contract.id}" must declare a non-empty tablePath.`,
        suggestion: 'Set tablePath to a dotted payload path such as "blindSchedule.levels".',
      });
      return;
    }

    const payload = runtimeAssetPayloadByNormalized.get(normalizedAssetId);
    const resolvedRows = payload === undefined ? { rows: null } : resolveRuntimeTableRowsByPath(payload, contract.tablePath);
    if (resolvedRows.rows === null) {
      return;
    }
    const rows = resolvedRows.rows;

    (contract.uniqueBy ?? []).forEach((tuple, tupleIndex) => {
      const rowIndexByKey = new Map<string, number>();
      for (const [rowIndex, row] of rows.entries()) {
        const encodedParts: string[] = [];
        let scalarFailure = false;
        for (const field of tuple) {
          const value = row[field];
          if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
            diagnostics.push({
              code: 'RUNTIME_TABLE_UNIQUE_KEY_VALUE_INVALID',
              path: `tableContracts[${index}].uniqueBy[${tupleIndex}]`,
              severity: 'error',
              message: `Runtime table "${contract.id}" row ${rowIndex} has non-scalar unique key value for field "${field}".`,
              suggestion: 'Ensure unique key fields resolve to string/number/boolean on every row.',
            });
            scalarFailure = true;
            break;
          }
          encodedParts.push(encodeRuntimeTableScalar(value));
        }
        if (scalarFailure) {
          continue;
        }
        const key = encodedParts.join('\u0002');
        const firstRowIndex = rowIndexByKey.get(key);
        if (firstRowIndex !== undefined) {
          diagnostics.push({
            code: 'RUNTIME_TABLE_UNIQUE_KEY_VIOLATION',
            path: `tableContracts[${index}].uniqueBy[${tupleIndex}]`,
            severity: 'error',
            message: `Runtime table "${contract.id}" violates uniqueBy [${tuple.join(', ')}]: duplicate rows at indices ${firstRowIndex} and ${rowIndex}.`,
            suggestion: 'Ensure each uniqueBy tuple identifies at most one row.',
          });
          continue;
        }
        rowIndexByKey.set(key, rowIndex);
      }
    });

    (contract.constraints ?? []).forEach((constraint, constraintIndex) => {
      const constraintPath = `tableContracts[${index}].constraints[${constraintIndex}]`;
      if (constraint.kind === 'monotonic') {
        let previous: number | undefined;
        let previousRowIndex: number | undefined;
        for (const [rowIndex, row] of rows.entries()) {
          const value = row[constraint.field];
          if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
            diagnostics.push({
              code: 'RUNTIME_TABLE_CONSTRAINT_VALUE_INVALID',
              path: constraintPath,
              severity: 'error',
              message: `Runtime table "${contract.id}" row ${rowIndex} has non-int value for monotonic field "${constraint.field}".`,
              suggestion: 'Ensure constrained fields are safe integers on every row.',
            });
            return;
          }
          if (previous !== undefined) {
            const isOrdered =
              constraint.direction === 'asc'
                ? constraint.strict === false
                  ? previous <= value
                  : previous < value
                : constraint.strict === false
                  ? previous >= value
                  : previous > value;
            if (!isOrdered) {
              diagnostics.push({
                code: 'RUNTIME_TABLE_CONSTRAINT_MONOTONIC_VIOLATION',
                path: constraintPath,
                severity: 'error',
                message: `Runtime table "${contract.id}" violates monotonic ${constraint.direction} on field "${constraint.field}" at rows ${previousRowIndex} -> ${rowIndex}.`,
                suggestion: 'Fix row order/values to satisfy declared monotonic constraint.',
              });
              return;
            }
          }
          previous = value;
          previousRowIndex = rowIndex;
        }
        return;
      }

      if (constraint.kind === 'numericRange') {
        for (const [rowIndex, row] of rows.entries()) {
          const value = row[constraint.field];
          if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
            diagnostics.push({
              code: 'RUNTIME_TABLE_CONSTRAINT_VALUE_INVALID',
              path: constraintPath,
              severity: 'error',
              message: `Runtime table "${contract.id}" row ${rowIndex} has non-int value for numericRange field "${constraint.field}".`,
              suggestion: 'Ensure constrained fields are safe integers on every row.',
            });
            return;
          }
          if (constraint.min !== undefined && value < constraint.min) {
            diagnostics.push({
              code: 'RUNTIME_TABLE_CONSTRAINT_RANGE_VIOLATION',
              path: constraintPath,
              severity: 'error',
              message: `Runtime table "${contract.id}" row ${rowIndex} value ${value} is below min ${constraint.min} for field "${constraint.field}".`,
              suggestion: 'Adjust row values or relax numericRange bounds.',
            });
            return;
          }
          if (constraint.max !== undefined && value > constraint.max) {
            diagnostics.push({
              code: 'RUNTIME_TABLE_CONSTRAINT_RANGE_VIOLATION',
              path: constraintPath,
              severity: 'error',
              message: `Runtime table "${contract.id}" row ${rowIndex} value ${value} exceeds max ${constraint.max} for field "${constraint.field}".`,
              suggestion: 'Adjust row values or relax numericRange bounds.',
            });
            return;
          }
        }
        return;
      }

      const step = constraint.step ?? 1;
      const expectedStart = constraint.start;
      const valuesWithRows: Array<{ readonly rowIndex: number; readonly value: number }> = [];
      for (const [rowIndex, row] of rows.entries()) {
        const value = row[constraint.field];
        if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
          diagnostics.push({
            code: 'RUNTIME_TABLE_CONSTRAINT_VALUE_INVALID',
            path: constraintPath,
            severity: 'error',
            message: `Runtime table "${contract.id}" row ${rowIndex} has non-int value for contiguousInt field "${constraint.field}".`,
            suggestion: 'Ensure constrained fields are safe integers on every row.',
          });
          return;
        }
        valuesWithRows.push({ rowIndex, value });
      }

      valuesWithRows.sort((left, right) => left.value - right.value || left.rowIndex - right.rowIndex);
      for (let valueIndex = 1; valueIndex < valuesWithRows.length; valueIndex += 1) {
        const prev = valuesWithRows[valueIndex - 1]!;
        const current = valuesWithRows[valueIndex]!;
        if (current.value === prev.value) {
          diagnostics.push({
            code: 'RUNTIME_TABLE_CONSTRAINT_CONTIGUOUS_VIOLATION',
            path: constraintPath,
            severity: 'error',
            message: `Runtime table "${contract.id}" contiguousInt field "${constraint.field}" repeats value ${current.value} at rows ${prev.rowIndex} and ${current.rowIndex}.`,
            suggestion: 'Use unique integers for contiguousInt constraints.',
          });
          return;
        }
        if (current.value - prev.value !== step) {
          diagnostics.push({
            code: 'RUNTIME_TABLE_CONSTRAINT_CONTIGUOUS_VIOLATION',
            path: constraintPath,
            severity: 'error',
            message: `Runtime table "${contract.id}" contiguousInt field "${constraint.field}" has gap between values ${prev.value} and ${current.value} (expected step ${step}).`,
            suggestion: 'Fix sequence values to form a contiguous progression.',
          });
          return;
        }
      }
      if (expectedStart !== undefined && valuesWithRows[0] !== undefined && valuesWithRows[0]!.value !== expectedStart) {
        diagnostics.push({
          code: 'RUNTIME_TABLE_CONSTRAINT_CONTIGUOUS_VIOLATION',
          path: constraintPath,
          severity: 'error',
          message: `Runtime table "${contract.id}" contiguousInt field "${constraint.field}" starts at ${valuesWithRows[0]!.value}, expected ${expectedStart}.`,
          suggestion: 'Fix sequence start value or update constraint.start.',
        });
      }
    });
  });
  def.actions.forEach((action, actionIndex) => {
    const paramNames = action.params.map((param) => param.name);
    checkDuplicateIds(
      diagnostics,
      paramNames,
      'DUPLICATE_ACTION_PARAM_NAME',
      'action param name',
      `actions[${actionIndex}].params`,
    );

    action.params.forEach((param, paramIndex) => {
      if (!RESERVED_RUNTIME_PARAM_NAMES.has(param.name)) {
        return;
      }
      diagnostics.push({
        code: 'ACTION_PARAM_RESERVED_NAME',
        path: `actions[${actionIndex}].params[${paramIndex}].name`,
        severity: 'error',
        message: `Action "${action.id}" param "${param.name}" uses a reserved runtime binding name.`,
        suggestion: 'Rename the action param; names beginning with runtime-reserved "__" identifiers are not allowed.',
      });
    });
  });

  const tokenTypeById = new Map(def.tokenTypes.map((tokenType) => [tokenType.id, tokenType] as const));
  (def.stackingConstraints ?? []).forEach((constraint, index) => {
    if ((constraint.pieceFilter.seats?.length ?? 0) === 0) {
      return;
    }

    const scopedPieceTypeIds = constraint.pieceFilter.pieceTypeIds;
    const requiredTokenTypeIds =
      scopedPieceTypeIds !== undefined && scopedPieceTypeIds.length > 0
        ? [...new Set(scopedPieceTypeIds)]
        : def.tokenTypes.map((tokenType) => tokenType.id);
    const missingSeatTokenTypeIds = requiredTokenTypeIds
      .filter((tokenTypeId) => {
        const tokenType = tokenTypeById.get(tokenTypeId);
        return tokenType !== undefined && typeof tokenType.seat !== 'string';
      })
      .sort((left, right) => left.localeCompare(right));

    if (missingSeatTokenTypeIds.length > 0) {
      diagnostics.push({
        code: 'STACKING_CONSTRAINT_TOKEN_TYPE_SEAT_MISSING',
        path: `stackingConstraints[${index}].pieceFilter.seats`,
        severity: 'error',
        message: `Stacking constraint "${constraint.id}" uses pieceFilter.seats but tokenTypes are missing canonical seat metadata: ${missingSeatTokenTypeIds.join(', ')}.`,
        suggestion: 'Define tokenTypes[].seat for each constrained token type.',
      });
    }
  });

  def.zones.forEach((zone, index) => {
    const qualifier = parseZoneSelector(zone.id).qualifier;

    if (zone.owner === 'none') {
      if (qualifier !== 'none') {
        diagnostics.push({
          code: 'ZONE_ID_OWNERSHIP_INVALID',
          path: `zones[${index}].id`,
          severity: 'error',
          message: `Unowned zone "${zone.id}" must use the :none qualifier to match owner "none".`,
          suggestion: 'Rename zone id to use :none, or change owner to "player".',
        });
      }
      return;
    }

    if (qualifier === null || !PLAYER_ZONE_QUALIFIER_PATTERN.test(qualifier)) {
      diagnostics.push({
        code: 'ZONE_ID_PLAYER_QUALIFIER_INVALID',
        path: `zones[${index}].id`,
        severity: 'error',
        message: `Player-owned zone "${zone.id}" must use a numeric owner qualifier (for example :0).`,
        suggestion: 'Rename zone id to include a numeric player qualifier, or change owner to "none".',
      });
      return;
    }

    const playerId = Number(qualifier);
    if (playerId > def.metadata.players.max - 1) {
      diagnostics.push({
        code: 'ZONE_ID_PLAYER_INDEX_OUT_OF_BOUNDS',
        path: `zones[${index}].id`,
        severity: 'error',
        message: `Player-owned zone "${zone.id}" targets player ${playerId}, which exceeds metadata.players.max (${def.metadata.players.max}).`,
        suggestion: `Use a qualifier in [0, ${def.metadata.players.max - 1}] or increase metadata.players.max.`,
      });
    }
  });
};

function zoneMatchesDerivedMetricFilter(
  zone: ZoneDef,
  filter: NonNullable<NonNullable<GameDef['derivedMetrics']>[number]['zoneFilter']>,
): boolean {
  if (filter.zoneKinds !== undefined && filter.zoneKinds.length > 0) {
    const zoneKind = zone.zoneKind ?? 'aux';
    if (!filter.zoneKinds.includes(zoneKind)) {
      return false;
    }
  }
  if (filter.category !== undefined && filter.category.length > 0) {
    if (zone.category === undefined || !filter.category.includes(zone.category)) {
      return false;
    }
  }
  if (filter.attributeEquals !== undefined) {
    for (const [key, expected] of Object.entries(filter.attributeEquals)) {
      const actual = zone.attributes?.[key];
      if (!attributeValueEquals(actual, expected)) {
        return false;
      }
    }
  }
  return true;
}

export const validateDerivedMetrics = (
  diagnostics: Diagnostic[],
  def: GameDef,
  context: ValidationContext,
): void => {
  if (def.derivedMetrics === undefined || def.derivedMetrics.length === 0) {
    return;
  }

  checkDuplicateIds(
    diagnostics,
    def.derivedMetrics.map((metric) => metric.id),
    'DUPLICATE_DERIVED_METRIC_ID',
    'derived metric id',
    'derivedMetrics',
  );

  const zoneIndicesById = new Map(def.zones.map((zone, index) => [zone.id, index] as const));
  for (const [metricIndex, metric] of def.derivedMetrics.entries()) {
    const metricPath = `derivedMetrics[${metricIndex}]`;
    if (metric.requirements.length === 0) {
      diagnostics.push({
        code: 'DERIVED_METRIC_REQUIREMENTS_EMPTY',
        path: `${metricPath}.requirements`,
        severity: 'error',
        message: `Derived metric "${metric.id}" must declare at least one requirement.`,
        suggestion: 'Add one or more numeric attribute requirements.',
      });
      continue;
    }

    const requestedZoneIds = metric.zoneFilter?.zoneIds;
    if (requestedZoneIds !== undefined) {
      for (const [zoneIdIndex, zoneId] of requestedZoneIds.entries()) {
        if (context.zoneNames.has(zoneId)) {
          continue;
        }
        pushMissingReferenceDiagnostic(
          diagnostics,
          'DERIVED_METRIC_ZONE_REFERENCE_MISSING',
          `${metricPath}.zoneFilter.zoneIds[${zoneIdIndex}]`,
          `Derived metric "${metric.id}" references unknown zone "${zoneId}".`,
          zoneId,
          context.zoneCandidates,
        );
      }
    }

    const candidateZones = def.zones.filter((zone) => {
      if (requestedZoneIds !== undefined && requestedZoneIds.length > 0 && !requestedZoneIds.includes(zone.id)) {
        return false;
      }
      if (metric.zoneFilter === undefined) {
        return true;
      }
      return zoneMatchesDerivedMetricFilter(zone, metric.zoneFilter);
    });

    for (const requirement of metric.requirements) {
      for (const zone of candidateZones) {
        const value = zone.attributes?.[requirement.key];
        if (typeof value === requirement.expectedType) {
          continue;
        }
        const zoneIndex = zoneIndicesById.get(zone.id);
        const zonePath = zoneIndex === undefined ? `zones[id=${String(zone.id)}]` : `zones[${zoneIndex}]`;
        diagnostics.push({
          code: 'DERIVED_METRIC_ZONE_ATTRIBUTE_INVALID',
          path: `${zonePath}.attributes.${requirement.key}`,
          severity: 'error',
          message: `Derived metric "${metric.id}" (${metric.computation}) requires "${requirement.key}" to be ${requirement.expectedType} on zone "${zone.id}".`,
          suggestion: `Set zones.attributes.${requirement.key} to a ${requirement.expectedType} value for all zones selected by this metric.`,
        });
      }
    }
  }
};

export const buildValidationContext = (
  def: GameDef,
): {
  context: ValidationContext;
  phaseCandidates: readonly string[];
  actionCandidates: readonly string[];
} => {
  const zoneCandidates = [...new Set(def.zones.map((zone) => zone.id))].sort((left, right) => left.localeCompare(right));
  const globalVarCandidates = [...new Set(def.globalVars.map((variable) => variable.name))].sort((left, right) =>
    left.localeCompare(right),
  );
  const perPlayerVarCandidates = [...new Set(def.perPlayerVars.map((variable) => variable.name))].sort((left, right) =>
    left.localeCompare(right),
  );
  const zoneVarCandidates = [...new Set((def.zoneVars ?? []).map((variable) => variable.name))].sort((left, right) =>
    left.localeCompare(right),
  );
  const tokenTypeCandidates = [...new Set(def.tokenTypes.map((tokenType) => tokenType.id))].sort((left, right) =>
    left.localeCompare(right),
  );
  const tokenFilterPropCandidates = [
    ...new Set(def.tokenTypes.flatMap((tokenType) => Object.keys(tokenType.props))),
  ].sort((left, right) => left.localeCompare(right));
  const markerLatticeCandidates = [...new Set((def.markerLattices ?? []).map((lattice) => lattice.id))].sort((left, right) =>
    left.localeCompare(right),
  );
  const globalMarkerLatticeCandidates = [...new Set((def.globalMarkerLattices ?? []).map((lattice) => lattice.id))].sort(
    (left, right) => left.localeCompare(right),
  );
  const turnPhaseCandidates = [...new Set(def.turnStructure.phases.map((phase) => phase.id))].sort((left, right) =>
    left.localeCompare(right),
  );
  const phaseCandidates = [
    ...new Set([
      ...turnPhaseCandidates,
      ...(def.turnStructure.interrupts ?? []).map((phase) => phase.id),
    ]),
  ].sort((left, right) => left.localeCompare(right));
  const actionCandidates = [...new Set(def.actions.map((action) => action.id))].sort((left, right) =>
    left.localeCompare(right),
  );
  const mapSpaceZones = def.zones.filter((zone) => zone.zoneKind === 'board');
  const mapSpaceZoneCandidates = [...new Set(mapSpaceZones.map((zone) => zone.id))].sort((left, right) =>
    left.localeCompare(right),
  );
  const mapSpacePropKinds = classifyZoneAttributePropertyKinds(mapSpaceZones);
  const mapSpacePropCandidates = [...mapSpacePropKinds.keys()].sort((left, right) => left.localeCompare(right));
  const runtimeDataAssets = def.runtimeDataAssets ?? [];
  const runtimeDataAssetIdsByNormalized = new Map<string, string>();
  const runtimeDataAssetPayloadByNormalized = new Map<string, unknown>();
  for (const asset of runtimeDataAssets) {
    const normalizedId = asset.id.normalize('NFC');
    if (!runtimeDataAssetIdsByNormalized.has(normalizedId)) {
      runtimeDataAssetIdsByNormalized.set(normalizedId, asset.id);
      runtimeDataAssetPayloadByNormalized.set(normalizedId, asset.payload);
    }
  }
  const runtimeDataAssetCandidates = [...new Set(runtimeDataAssets.map((asset) => asset.id))].sort((left, right) =>
    left.localeCompare(right),
  );
  const tableContracts = def.tableContracts ?? [];
  const tableContractCandidates = [...new Set(tableContracts.map((contract) => contract.id))].sort((left, right) =>
    left.localeCompare(right),
  );
  const tableContractsById = new Map(tableContracts.map((contract) => [contract.id, contract] as const));

  const context: ValidationContext = {
    zoneNames: new Set(zoneCandidates),
    zoneCandidates,
    zoneOwners: new Map(def.zones.map((zone) => [zone.id, zone.owner])),
    mapSpaceZoneNames: new Set(mapSpaceZoneCandidates),
    mapSpaceZoneCandidates,
    mapSpacePropCandidates,
    mapSpacePropKinds,
    runtimeDataAssetIdsByNormalized,
    runtimeDataAssetPayloadByNormalized,
    runtimeDataAssetCandidates,
    tableContractsById,
    tableContractCandidates,
    globalVarNames: new Set(globalVarCandidates),
    globalVarTypesByName: new Map(def.globalVars.map((variable) => [variable.name, variable.type])),
    globalVarCandidates,
    perPlayerVarNames: new Set(perPlayerVarCandidates),
    perPlayerVarTypesByName: new Map(def.perPlayerVars.map((variable) => [variable.name, variable.type])),
    perPlayerVarCandidates,
    zoneVarNames: new Set(zoneVarCandidates),
    zoneVarTypesByName: new Map((def.zoneVars ?? []).map((variable) => [variable.name, variable.type])),
    zoneVarCandidates,
    markerLatticeNames: new Set(markerLatticeCandidates),
    markerLatticeCandidates,
    markerLatticeStatesById: new Map((def.markerLattices ?? []).map((lattice) => [lattice.id, lattice.states])),
    globalMarkerLatticeNames: new Set(globalMarkerLatticeCandidates),
    globalMarkerLatticeCandidates,
    globalMarkerLatticeStatesById: new Map((def.globalMarkerLattices ?? []).map((lattice) => [lattice.id, lattice.states])),
    tokenTypeNames: new Set(tokenTypeCandidates),
    tokenTypeCandidates,
    tokenFilterPropCandidates,
    turnPhaseNames: new Set(turnPhaseCandidates),
    turnPhaseCandidates,
    phaseNames: new Set(phaseCandidates),
    phaseCandidates,
    playerIdMin: 0,
    playerIdMaxInclusive: def.metadata.players.max - 1,
  };

  return { context, phaseCandidates, actionCandidates };
};

function classifyZoneAttributePropertyKinds(
  zones: readonly ZoneDef[],
): ReadonlyMap<string, 'scalar' | 'array' | 'mixed'> {
  const kinds = new Map<string, 'scalar' | 'array' | 'mixed'>();

  // Synthetic zone properties accessible via zoneProp / zonePropIncludes.
  // 'id' and 'category' are first-class ZoneDef fields, not stored in attributes.
  kinds.set('id', 'scalar');
  kinds.set('category', 'scalar');

  for (const zone of zones) {
    if (zone.attributes === undefined) {
      continue;
    }
    for (const [key, value] of Object.entries(zone.attributes)) {
      const nextKind = Array.isArray(value) ? 'array' : 'scalar';
      const existingKind = kinds.get(key);
      if (existingKind === undefined) {
        kinds.set(key, nextKind);
        continue;
      }
      if (existingKind !== nextKind) {
        kinds.set(key, 'mixed');
      }
    }
  }

  return kinds;
}

const zoneMatchesFilter = (zone: ZoneDef, filter: StackingConstraint['spaceFilter']): boolean => {
  if (filter.spaceIds !== undefined && filter.spaceIds.length > 0 && !filter.spaceIds.includes(zone.id)) {
    return false;
  }
  if (filter.category !== undefined && filter.category.length > 0) {
    if (zone.category === undefined || !filter.category.includes(zone.category)) {
      return false;
    }
  }
  if (filter.attributeEquals !== undefined) {
    for (const [key, expected] of Object.entries(filter.attributeEquals)) {
      const actual = zone.attributes?.[key];
      if (!attributeValueEquals(actual, expected)) {
        return false;
      }
    }
  }
  return true;
};

const placementMatchesPieceFilter = (
  placement: ScenarioPiecePlacement,
  filter: StackingConstraint['pieceFilter'],
  pieceTypeSeatById: ReadonlyMap<string, string> | undefined,
): boolean => {
  if (
    filter.pieceTypeIds !== undefined &&
    filter.pieceTypeIds.length > 0 &&
    !filter.pieceTypeIds.includes(placement.pieceTypeId)
  ) {
    return false;
  }
  if (filter.seats !== undefined && filter.seats.length > 0) {
    const canonicalSeat = pieceTypeSeatById?.get(placement.pieceTypeId);
    if (typeof canonicalSeat !== 'string' || !filter.seats.includes(canonicalSeat)) {
      return false;
    }
  }
  return true;
};

export const validateInitialPlacementsAgainstStackingConstraints = (
  constraints: readonly StackingConstraint[],
  placements: readonly ScenarioPiecePlacement[],
  zones: readonly ZoneDef[],
  pieceTypeSeatById?: ReadonlyMap<string, string>,
): Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];
  const zoneMap = new Map(zones.map((zone) => [String(zone.id), zone]));
  const reportedMissingSeatKeys = new Set<string>();

  for (const constraint of constraints) {
    if ((constraint.pieceFilter.seats?.length ?? 0) > 0) {
      const scopedPieceTypeIds = constraint.pieceFilter.pieceTypeIds;
      const relevantPlacements =
        scopedPieceTypeIds === undefined || scopedPieceTypeIds.length === 0
          ? placements
          : placements.filter((placement) => scopedPieceTypeIds.includes(placement.pieceTypeId));
      const requiredPieceTypeIds = [...new Set(relevantPlacements.map((placement) => placement.pieceTypeId))];
      for (const pieceTypeId of requiredPieceTypeIds) {
        if (pieceTypeSeatById?.has(pieceTypeId) === true) {
          continue;
        }
        const reportKey = `${constraint.id}::${pieceTypeId}`;
        if (reportedMissingSeatKeys.has(reportKey)) {
          continue;
        }
        reportedMissingSeatKeys.add(reportKey);
        diagnostics.push({
          code: 'STACKING_CONSTRAINT_TOKEN_TYPE_SEAT_MISSING',
          path: `stackingConstraints[${constraint.id}]`,
          severity: 'error',
          message: `Stacking constraint "${constraint.id}" uses pieceFilter.seats but pieceType "${pieceTypeId}" has no canonical seat mapping.`,
          suggestion: 'Provide a pieceTypeId -> seat mapping for compile-time stacking validation.',
        });
      }
    }

    const matchingZoneIds = zones
      .filter((zone) => zoneMatchesFilter(zone, constraint.spaceFilter))
      .map((zone) => String(zone.id));

    const matchingZoneSet = new Set(matchingZoneIds);

    const countByZone = new Map<string, number>();
    for (const placement of placements) {
      if (!matchingZoneSet.has(placement.spaceId)) {
        continue;
      }
      if (!placementMatchesPieceFilter(placement, constraint.pieceFilter, pieceTypeSeatById)) {
        continue;
      }
      const current = countByZone.get(placement.spaceId) ?? 0;
      countByZone.set(placement.spaceId, current + placement.count);
    }

    for (const [spaceId, count] of countByZone) {
      const zone = zoneMap.get(spaceId);
      const spaceLabel = zone ? `${spaceId} (${zone.category ?? 'zone'})` : spaceId;

      if (constraint.rule === 'prohibit' && count > 0) {
        diagnostics.push({
          code: 'STACKING_CONSTRAINT_VIOLATION',
          path: `stackingConstraints[${constraint.id}]`,
          severity: 'error',
          message: `Stacking violation: ${count} piece(s) in ${spaceLabel} violate constraint "${constraint.id}" (${constraint.description}).`,
          suggestion: `Remove the prohibited pieces from ${spaceId} or adjust the constraint.`,
        });
      }

      if (constraint.rule === 'maxCount' && constraint.maxCount !== undefined && count > constraint.maxCount) {
        diagnostics.push({
          code: 'STACKING_CONSTRAINT_VIOLATION',
          path: `stackingConstraints[${constraint.id}]`,
          severity: 'error',
          message: `Stacking violation: ${count} piece(s) in ${spaceLabel} exceed max ${constraint.maxCount} for constraint "${constraint.id}" (${constraint.description}).`,
          suggestion: `Reduce pieces in ${spaceId} to at most ${constraint.maxCount} or adjust the constraint.`,
        });
      }
    }
  }

  return diagnostics;
};
