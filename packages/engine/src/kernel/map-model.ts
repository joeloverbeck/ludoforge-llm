import type { Diagnostic } from './diagnostics.js';
import { createEvalContext, createEvalRuntimeResources } from './eval-context.js';
import { evalCondition } from './eval-condition.js';
import { MapPayloadSchema } from './schemas.js';
import { buildAdjacencyGraph } from './spatial.js';
import { findSpaceMarkerConstraintViolation } from './space-marker-rules.js';
import type {
  GameDef,
  GameState,
  MapPayload,
  MapSpaceInput,
  SpaceMarkerLatticeDef,
} from './types.js';
import { asZoneId } from './branded.js';
import { buildValidationContext } from './validate-gamedef-structure.js';
import { validateConditionAst } from './validate-conditions.js';

export interface MapPayloadDiagnosticContext {
  readonly assetPath?: string;
  readonly entityId?: string;
  readonly pathPrefix?: string;
}

export function validateMapPayload(
  payload: unknown,
  context: MapPayloadDiagnosticContext = {},
): readonly Diagnostic[] {
  const parseResult = MapPayloadSchema.safeParse(payload);
  if (!parseResult.success) {
    return parseResult.error.issues.map((issue) => ({
      code: 'MAP_PAYLOAD_SCHEMA_INVALID',
      path: remapPayloadPath(issue.path.length > 0 ? `asset.payload.${issue.path.join('.')}` : 'asset.payload', context),
      severity: 'error' as const,
      message: issue.message,
      ...(context.assetPath === undefined ? {} : { assetPath: context.assetPath }),
      ...(context.entityId === undefined ? {} : { entityId: context.entityId }),
    }));
  }

  const mapPayload = parseResult.data as unknown as MapPayload;
  const diagnostics: Diagnostic[] = [];
  const spaces = mapPayload.spaces;
  const tracks = mapPayload.tracks ?? [];
  const markerLattices = mapPayload.markerLattices ?? [];
  const spaceMarkers = mapPayload.spaceMarkers ?? [];
  const validationDef = buildMarkerConstraintValidationDef(spaces, markerLattices);
  const validationContext = buildValidationContext(validationDef).context;

  const spaceIds = new Set(spaces.map((space) => space.id));
  const trackKeys = new Set<string>();
  tracks.forEach((track, trackIndex) => {
    const trackKey = `${track.id}::${track.scope}::${track.seat ?? ''}`;
    if (trackKeys.has(trackKey)) {
      diagnostics.push(withContext(
        {
          code: 'MAP_TRACK_DUPLICATE',
          path: `asset.payload.tracks[${trackIndex}].id`,
          severity: 'error',
          message: `Duplicate track "${track.id}" for scope "${track.scope}${track.seat ? `:${track.seat}` : ''}".`,
        },
        context,
      ));
    } else {
      trackKeys.add(trackKey);
    }

    if (track.min > track.initial || track.initial > track.max) {
      diagnostics.push(withContext(
        {
          code: 'MAP_TRACK_BOUNDS_INVALID',
          path: `asset.payload.tracks[${trackIndex}]`,
          severity: 'error',
          message: `Track "${track.id}" must satisfy min <= initial <= max; received ${track.min} <= ${track.initial} <= ${track.max}.`,
        },
        context,
      ));
    }

    if (track.scope === 'seat' && track.seat === undefined) {
      diagnostics.push(withContext(
        {
          code: 'MAP_TRACK_SCOPE_INVALID',
          path: `asset.payload.tracks[${trackIndex}].seat`,
          severity: 'error',
          message: `Track "${track.id}" with scope "seat" requires a seat id.`,
        },
        context,
      ));
    }

    if (track.scope === 'global' && track.seat !== undefined) {
      diagnostics.push(withContext(
        {
          code: 'MAP_TRACK_SCOPE_INVALID',
          path: `asset.payload.tracks[${trackIndex}].seat`,
          severity: 'error',
          message: `Track "${track.id}" with scope "global" must not declare a seat id.`,
        },
        context,
      ));
    }
  });

  const latticeById = new Map<string, SpaceMarkerLatticeDef>();
  markerLattices.forEach((lattice, latticeIndex) => {
    if (latticeById.has(lattice.id)) {
      diagnostics.push(withContext(
        {
          code: 'MAP_MARKER_LATTICE_DUPLICATE',
          path: `asset.payload.markerLattices[${latticeIndex}].id`,
          severity: 'error',
          message: `Duplicate marker lattice "${lattice.id}".`,
        },
        context,
      ));
      return;
    }

    latticeById.set(lattice.id, lattice);

    if (lattice.states.length === 0) {
      diagnostics.push(withContext(
        {
          code: 'MAP_MARKER_LATTICE_STATES_EMPTY',
          path: `asset.payload.markerLattices[${latticeIndex}].states`,
          severity: 'error',
          message: `Marker lattice "${lattice.id}" must declare at least one state.`,
        },
        context,
      ));
    }

    if (!lattice.states.includes(lattice.defaultState)) {
      diagnostics.push(withContext(
        {
          code: 'MAP_MARKER_DEFAULT_INVALID',
          path: `asset.payload.markerLattices[${latticeIndex}].defaultState`,
          severity: 'error',
          message: `Marker lattice "${lattice.id}" default state "${lattice.defaultState}" must be one of its declared states.`,
          alternatives: [...lattice.states],
        },
        context,
      ));
    }

    lattice.constraints?.forEach((constraint, constraintIndex) => {
      if (constraint.allowedStates.length === 0) {
        diagnostics.push(withContext(
          {
            code: 'MAP_MARKER_CONSTRAINT_STATES_EMPTY',
            path: `asset.payload.markerLattices[${latticeIndex}].constraints[${constraintIndex}].allowedStates`,
            severity: 'error',
            message: `Marker lattice "${lattice.id}" constraint must declare at least one allowed state.`,
          },
          context,
        ));
      }

      constraint.allowedStates.forEach((state, stateIndex) => {
        if (lattice.states.includes(state)) {
          return;
        }

        diagnostics.push(withContext(
          {
            code: 'MAP_MARKER_CONSTRAINT_STATE_UNKNOWN',
            path: `asset.payload.markerLattices[${latticeIndex}].constraints[${constraintIndex}].allowedStates[${stateIndex}]`,
            severity: 'error',
            message: `Constraint state "${state}" is not declared in marker lattice "${lattice.id}".`,
            alternatives: [...lattice.states],
          },
          context,
        ));
      });
      validateConditionAst(
        diagnostics,
        constraint.when,
        `asset.payload.markerLattices[${latticeIndex}].constraints[${constraintIndex}].when`,
        validationContext,
      );
    });
  });

  const markerValues = new Map<string, string>();
  spaceMarkers.forEach((entry, entryIndex) => {
    if (!spaceIds.has(entry.spaceId)) {
      diagnostics.push(withContext(
        {
          code: 'MAP_SPACE_MARKER_SPACE_UNKNOWN',
          path: `asset.payload.spaceMarkers[${entryIndex}].spaceId`,
          severity: 'error',
          message: `Marker value references unknown space "${entry.spaceId}".`,
        },
        context,
      ));
      return;
    }

    const lattice = latticeById.get(entry.markerId);
    if (lattice === undefined) {
      diagnostics.push(withContext(
        {
          code: 'MAP_SPACE_MARKER_LATTICE_UNKNOWN',
          path: `asset.payload.spaceMarkers[${entryIndex}].markerId`,
          severity: 'error',
          message: `Marker value references unknown lattice "${entry.markerId}".`,
        },
        context,
      ));
      return;
    }

    if (!lattice.states.includes(entry.state)) {
      diagnostics.push(withContext(
        {
          code: 'MAP_SPACE_MARKER_STATE_UNKNOWN',
          path: `asset.payload.spaceMarkers[${entryIndex}].state`,
          severity: 'error',
          message: `State "${entry.state}" is not declared by marker lattice "${entry.markerId}".`,
          alternatives: [...lattice.states],
        },
        context,
      ));
      return;
    }

    const key = `${entry.spaceId}::${entry.markerId}`;
    if (markerValues.has(key)) {
      diagnostics.push(withContext(
        {
          code: 'MAP_SPACE_MARKER_DUPLICATE',
          path: `asset.payload.spaceMarkers[${entryIndex}]`,
          severity: 'error',
          message: `Duplicate marker value declaration for space "${entry.spaceId}" and marker "${entry.markerId}".`,
        },
        context,
      ));
      return;
    }

    markerValues.set(key, entry.state);
  });

  const markerState = buildMarkerConstraintValidationState(validationDef, markerValues);
  const markerEvalCtx = createEvalContext({
    def: validationDef,
    adjacencyGraph: buildAdjacencyGraph(validationDef.zones),
    state: markerState,
    activePlayer: 0 as never,
    actorPlayer: 0 as never,
    bindings: {},
    resources: createEvalRuntimeResources(),
  });

  markerLattices.forEach((lattice) => {
    spaces.forEach((space, spaceIndex) => {
      const key = `${space.id}::${lattice.id}`;
      const state = markerValues.get(key) ?? lattice.defaultState;
      try {
        const violation = findSpaceMarkerConstraintViolation(lattice, space.id, state, markerEvalCtx, evalCondition);
        if (violation === null) {
          return;
        }
        diagnostics.push(withContext(
          {
            code: 'MAP_MARKER_CONSTRAINT_VIOLATION',
            path: `asset.payload.spaces[${spaceIndex}].id`,
            severity: 'error',
            message: `Space "${space.id}" marker "${lattice.id}" has state "${state}" which violates constraint ${violation.constraintIndex} on marker lattice "${lattice.id}".`,
            suggestion: `Use one of the allowed states: ${violation.constraint.allowedStates.join(', ')}.`,
          },
          context,
        ));
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        diagnostics.push(withContext(
          {
            code: 'MAP_MARKER_CONSTRAINT_EVALUATION_FAILED',
            path: `asset.payload.spaces[${spaceIndex}].id`,
            severity: 'error',
            message: `Unable to evaluate marker constraint for space "${space.id}" and lattice "${lattice.id}": ${message}`,
          },
          context,
        ));
      }
    });
  });

  return diagnostics;
}

function buildMarkerConstraintValidationDef(
  spaces: readonly MapSpaceInput[],
  markerLattices: NonNullable<MapPayload['markerLattices']>,
): GameDef {
  return {
    metadata: {
      id: 'map-payload-validation',
      players: { min: 1, max: 1 },
    },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: spaces.map((space) => ({
      id: asZoneId(space.id),
      zoneKind: 'board',
      owner: 'none',
      visibility: 'public',
      ordering: 'set',
      adjacentTo: space.adjacentTo.map((adjacency) => ({
        ...adjacency,
        to: asZoneId(adjacency.to),
      })),
      ...(space.category === undefined ? {} : { category: space.category }),
      ...(space.attributes === undefined ? {} : { attributes: space.attributes }),
    })),
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: 'validation-phase' as never }] },
    actions: [],
    triggers: [],
    terminal: { conditions: [] },
    markerLattices,
  };
}

function buildMarkerConstraintValidationState(
  def: GameDef,
  markerValues: ReadonlyMap<string, string>,
): GameState {
  const markers: Record<string, Record<string, string>> = {};
  for (const [key, state] of markerValues.entries()) {
    const [spaceId, markerId] = key.split('::');
    if (spaceId === undefined || markerId === undefined) {
      continue;
    }
    markers[spaceId] = {
      ...(markers[spaceId] ?? {}),
      [markerId]: state,
    };
  }

  return {
    globalVars: {},
    perPlayerVars: { 0: {} },
    zoneVars: {},
    playerCount: 1,
    zones: Object.fromEntries(def.zones.map((zone) => [zone.id, []])),
    nextTokenOrdinal: 0,
    currentPhase: 'validation-phase' as never,
    activePlayer: 0 as never,
    turnCount: 0,
    rng: {
      algorithm: 'pcg-dxsm-128',
      version: 1,
      state: [0n, 0n],
    },
    stateHash: 0n,
    actionUsage: {},
    turnOrderState: { type: 'roundRobin' },
    markers,
    globalMarkers: {},
  };
}

function withContext(diagnostic: Diagnostic, context: MapPayloadDiagnosticContext): Diagnostic {
  return {
    ...diagnostic,
    path: remapPayloadPath(diagnostic.path, context),
    ...(context.assetPath === undefined ? {} : { assetPath: context.assetPath }),
    ...(context.entityId === undefined ? {} : { entityId: context.entityId }),
  };
}

function remapPayloadPath(path: string, context: MapPayloadDiagnosticContext): string {
  const targetPrefix = context.pathPrefix ?? 'asset.payload';
  if (targetPrefix === 'asset.payload') {
    return path;
  }
  if (path === 'asset.payload') {
    return targetPrefix;
  }
  if (path.startsWith('asset.payload.')) {
    return `${targetPrefix}${path.slice('asset.payload'.length)}`;
  }
  if (path.startsWith('asset.payload[')) {
    return `${targetPrefix}${path.slice('asset.payload'.length)}`;
  }
  return path;
}
