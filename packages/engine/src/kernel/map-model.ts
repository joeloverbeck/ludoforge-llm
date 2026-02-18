import type { Diagnostic } from './diagnostics.js';
import { MapPayloadSchema } from './schemas.js';
import type {
  MapPayload,
  MapSpaceInput,
  MapVisualRuleMatch,
  SpaceMarkerConstraintDef,
  SpaceMarkerLatticeDef,
} from './types.js';

export interface MapPayloadDiagnosticContext {
  readonly assetPath?: string;
  readonly entityId?: string;
}

export function validateMapPayload(
  payload: unknown,
  context: MapPayloadDiagnosticContext = {},
): readonly Diagnostic[] {
  const parseResult = MapPayloadSchema.safeParse(payload);
  if (!parseResult.success) {
    return parseResult.error.issues.map((issue) => ({
      code: 'MAP_PAYLOAD_SCHEMA_INVALID',
      path: issue.path.length > 0 ? `asset.payload.${issue.path.join('.')}` : 'asset.payload',
      severity: 'error' as const,
      message: issue.message,
      ...(context.assetPath === undefined ? {} : { assetPath: context.assetPath }),
      ...(context.entityId === undefined ? {} : { entityId: context.entityId }),
    }));
  }

  const mapPayload = parseResult.data as MapPayload;
  const diagnostics: Diagnostic[] = [];
  const spaces = mapPayload.spaces;
  const tracks = mapPayload.tracks ?? [];
  const markerLattices = mapPayload.markerLattices ?? [];
  const spaceMarkers = mapPayload.spaceMarkers ?? [];

  const spaceIds = new Set(spaces.map((space) => space.id));
  const categories = new Set(spaces.filter((space) => space.category !== undefined).map((space) => space.category!));
  const visualRules = mapPayload.visualRules ?? [];

  visualRules.forEach((rule, ruleIndex) => {
    const match = rule.match;
    if (match === undefined) {
      return;
    }

    match.spaceIds?.forEach((spaceId, spaceIdIndex) => {
      if (spaceIds.has(spaceId)) {
        return;
      }

      diagnostics.push(withContext(
        {
          code: 'MAP_VISUAL_RULE_SPACE_UNKNOWN',
          path: `asset.payload.visualRules[${ruleIndex}].match.spaceIds[${spaceIdIndex}]`,
          severity: 'error',
          message: `Visual rule references unknown space "${spaceId}".`,
        },
        context,
      ));
    });

    match.category?.forEach((category, categoryIndex) => {
      if (categories.has(category)) {
        return;
      }

      diagnostics.push(withContext(
        {
          code: 'MAP_VISUAL_RULE_CATEGORY_UNKNOWN',
          path: `asset.payload.visualRules[${ruleIndex}].match.category[${categoryIndex}]`,
          severity: 'error',
          message: `Visual rule references unknown category "${category}".`,
        },
        context,
      ));
    });
  });

  const trackKeys = new Set<string>();
  tracks.forEach((track, trackIndex) => {
    const trackKey = `${track.id}::${track.scope}::${track.faction ?? ''}`;
    if (trackKeys.has(trackKey)) {
      diagnostics.push(withContext(
        {
          code: 'MAP_TRACK_DUPLICATE',
          path: `asset.payload.tracks[${trackIndex}].id`,
          severity: 'error',
          message: `Duplicate track "${track.id}" for scope "${track.scope}${track.faction ? `:${track.faction}` : ''}".`,
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

    if (track.scope === 'faction' && track.faction === undefined) {
      diagnostics.push(withContext(
        {
          code: 'MAP_TRACK_SCOPE_INVALID',
          path: `asset.payload.tracks[${trackIndex}].faction`,
          severity: 'error',
          message: `Track "${track.id}" with scope "faction" requires a faction id.`,
        },
        context,
      ));
    }

    if (track.scope === 'global' && track.faction !== undefined) {
      diagnostics.push(withContext(
        {
          code: 'MAP_TRACK_SCOPE_INVALID',
          path: `asset.payload.tracks[${trackIndex}].faction`,
          severity: 'error',
          message: `Track "${track.id}" with scope "global" must not declare a faction id.`,
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

      constraint.spaceIds?.forEach((spaceId, spaceIdIndex) => {
        if (spaceIds.has(spaceId)) {
          return;
        }

        diagnostics.push(withContext(
          {
            code: 'MAP_MARKER_CONSTRAINT_SPACE_UNKNOWN',
            path: `asset.payload.markerLattices[${latticeIndex}].constraints[${constraintIndex}].spaceIds[${spaceIdIndex}]`,
            severity: 'error',
            message: `Constraint references unknown space "${spaceId}".`,
          },
          context,
        ));
      });

      constraint.category?.forEach((cat, catIndex) => {
        if (categories.has(cat)) {
          return;
        }

        diagnostics.push(withContext(
          {
            code: 'MAP_MARKER_CONSTRAINT_CATEGORY_UNKNOWN',
            path: `asset.payload.markerLattices[${latticeIndex}].constraints[${constraintIndex}].category[${catIndex}]`,
            severity: 'error',
            message: `Constraint references unknown category "${cat}".`,
          },
          context,
        ));
      });
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

  markerLattices.forEach((lattice) => {
    lattice.constraints?.forEach((constraint, constraintIndex) => {
      spaces.forEach((space, spaceIndex) => {
        if (!constraintApplies(constraint, space)) {
          return;
        }

        const key = `${space.id}::${lattice.id}`;
        const state = markerValues.get(key) ?? lattice.defaultState;
        if (constraint.allowedStates.includes(state)) {
          return;
        }

        diagnostics.push(withContext(
          {
            code: 'MAP_MARKER_CONSTRAINT_VIOLATION',
            path: `asset.payload.spaces[${spaceIndex}].id`,
            severity: 'error',
            message: `Space "${space.id}" marker "${lattice.id}" has state "${state}" which violates constraint ${constraintIndex} on marker lattice "${lattice.id}".`,
            suggestion: `Use one of the allowed states: ${constraint.allowedStates.join(', ')}.`,
          },
          context,
        ));
      });
    });
  });

  return diagnostics;
}

function constraintApplies(constraint: SpaceMarkerConstraintDef, space: MapSpaceInput): boolean {
  if (constraint.spaceIds !== undefined && !constraint.spaceIds.includes(space.id)) {
    return false;
  }

  if (constraint.category !== undefined && constraint.category.length > 0) {
    if (space.category === undefined || !constraint.category.includes(space.category)) {
      return false;
    }
  }

  if (constraint.attributeEquals !== undefined) {
    for (const [key, expected] of Object.entries(constraint.attributeEquals)) {
      const actual = space.attributes?.[key];
      if (actual !== expected) {
        return false;
      }
    }
  }

  return true;
}

export function mapVisualRuleMatchApplies(match: MapVisualRuleMatch | undefined, space: MapSpaceInput): boolean {
  if (match === undefined) {
    return true;
  }

  if (match.spaceIds !== undefined && !match.spaceIds.includes(space.id)) {
    return false;
  }

  if (match.category !== undefined && match.category.length > 0) {
    if (space.category === undefined || !match.category.includes(space.category)) {
      return false;
    }
  }

  if (match.attributeEquals !== undefined) {
    for (const [key, expected] of Object.entries(match.attributeEquals)) {
      const actual = space.attributes?.[key];
      if (!attributeValueEquals(actual, expected)) {
        return false;
      }
    }
  }

  if (match.attributeContains !== undefined) {
    for (const [key, expected] of Object.entries(match.attributeContains)) {
      const actual = space.attributes?.[key];
      if (!Array.isArray(actual) || !actual.includes(expected)) {
        return false;
      }
    }
  }

  return true;
}

function attributeValueEquals(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }
    return left.every((value, index) => value === right[index]);
  }
  return left === right;
}

function withContext(diagnostic: Diagnostic, context: MapPayloadDiagnosticContext): Diagnostic {
  return {
    ...diagnostic,
    ...(context.assetPath === undefined ? {} : { assetPath: context.assetPath }),
    ...(context.entityId === undefined ? {} : { entityId: context.entityId }),
  };
}
