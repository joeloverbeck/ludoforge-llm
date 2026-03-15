import type { Diagnostic } from './diagnostics.js';
import { PieceCatalogPayloadSchema } from './schemas.js';
import type { PieceCatalogPayload, PieceStatusDimension } from './types.js';

const DIMENSION_VALUES: Readonly<Record<PieceStatusDimension, readonly string[]>> = {
  activity: ['underground', 'active'],
  tunnel: ['untunneled', 'tunneled'],
};

export interface PieceCatalogDiagnosticContext {
  readonly assetPath?: string;
  readonly entityId?: string;
  readonly pathPrefix?: string;
}

export function validatePieceCatalogPayload(
  payload: unknown,
  context: PieceCatalogDiagnosticContext = {},
): readonly Diagnostic[] {
  const parseResult = PieceCatalogPayloadSchema.safeParse(payload);
  if (!parseResult.success) {
    return parseResult.error.issues.map((issue) => ({
      code: 'PIECE_CATALOG_SCHEMA_INVALID',
      path: remapPayloadPath(issue.path.length > 0 ? `asset.payload.${issue.path.join('.')}` : 'asset.payload', context),
      severity: 'error' as const,
      message: issue.message,
      ...(context.assetPath === undefined ? {} : { assetPath: context.assetPath }),
      ...(context.entityId === undefined ? {} : { entityId: context.entityId }),
    }));
  }

  const diagnostics: Diagnostic[] = [];
  const rawData = parseResult.data as Record<string, unknown>;
  const rawPieceTypes = rawData.pieceTypes as readonly Record<string, unknown>[];

  // Filter out generate: blocks — they are pre-expansion templates validated after expansion
  const hasGenerateBlocks = rawPieceTypes.some((entry) => 'generate' in entry);
  const concretePieceTypes = rawPieceTypes.filter(
    (entry): entry is PieceCatalogPayload['pieceTypes'][number] & Record<string, unknown> => !('generate' in entry),
  ) as readonly PieceCatalogPayload['pieceTypes'][number][];
  const catalog: PieceCatalogPayload = {
    pieceTypes: concretePieceTypes,
    inventory: (rawData.inventory ?? []) as PieceCatalogPayload['inventory'],
  };
  const pieceTypeById = new Map<string, PieceCatalogPayload['pieceTypes'][number]>();

  catalog.pieceTypes.forEach((pieceType, index) => {
    if (pieceTypeById.has(pieceType.id)) {
      diagnostics.push(withContext(
        {
          code: 'PIECE_CATALOG_DUPLICATE_PIECE_TYPE',
          path: `asset.payload.pieceTypes[${index}].id`,
          severity: 'error',
          message: `Duplicate piece type "${pieceType.id}".`,
        },
        context,
      ));
      return;
    }

    pieceTypeById.set(pieceType.id, pieceType);

    const declaredDimensions = new Set(pieceType.statusDimensions);

    if (pieceType.onZoneEntry !== undefined) {
      pieceType.onZoneEntry.forEach((rule, ruleIndex) => {
        for (const [key, value] of Object.entries(rule.set)) {
          if (!declaredDimensions.has(key as PieceStatusDimension)) {
            diagnostics.push(withContext(
              {
                code: 'PIECE_ZONE_ENTRY_DIMENSION_UNDECLARED',
                path: `asset.payload.pieceTypes[${index}].onZoneEntry[${ruleIndex}].set.${key}`,
                severity: 'error',
                message: `onZoneEntry set key "${key}" is not a declared statusDimension for piece type "${pieceType.id}".`,
              },
              context,
            ));
            continue;
          }

          const allowedValues = DIMENSION_VALUES[key as PieceStatusDimension];
          if (allowedValues !== undefined && !allowedValues.includes(String(value))) {
            diagnostics.push(withContext(
              {
                code: 'PIECE_ZONE_ENTRY_VALUE_INVALID',
                path: `asset.payload.pieceTypes[${index}].onZoneEntry[${ruleIndex}].set.${key}`,
                severity: 'error',
                message: `Invalid value "${String(value)}" for dimension "${key}" in onZoneEntry for piece type "${pieceType.id}".`,
                alternatives: [...allowedValues],
              },
              context,
            ));
          }
        }
      });
    }

    pieceType.transitions.forEach((transition, transitionIndex) => {
      if (!declaredDimensions.has(transition.dimension)) {
        diagnostics.push(withContext(
          {
            code: 'PIECE_STATUS_DIMENSION_UNDECLARED',
            path: `asset.payload.pieceTypes[${index}].transitions[${transitionIndex}].dimension`,
            severity: 'error',
            message: `Transition dimension "${transition.dimension}" is not declared for piece type "${pieceType.id}".`,
          },
          context,
        ));
        return;
      }

      const allowedValues = DIMENSION_VALUES[transition.dimension];
      if (!allowedValues.includes(transition.from)) {
        diagnostics.push(withContext(
          {
            code: 'PIECE_STATUS_VALUE_INVALID',
            path: `asset.payload.pieceTypes[${index}].transitions[${transitionIndex}].from`,
            severity: 'error',
            message: `Invalid "${transition.dimension}" status value "${transition.from}" for piece type "${pieceType.id}".`,
            alternatives: [...allowedValues],
          },
          context,
        ));
      }
      if (!allowedValues.includes(transition.to)) {
        diagnostics.push(withContext(
          {
            code: 'PIECE_STATUS_VALUE_INVALID',
            path: `asset.payload.pieceTypes[${index}].transitions[${transitionIndex}].to`,
            severity: 'error',
            message: `Invalid "${transition.dimension}" status value "${transition.to}" for piece type "${pieceType.id}".`,
            alternatives: [...allowedValues],
          },
          context,
        ));
      }
    });
  });

  const inventoryCounts = new Map<string, number>();
  catalog.inventory.forEach((entry, index) => {
    const pieceType = pieceTypeById.get(entry.pieceTypeId);
    if (!pieceType) {
      diagnostics.push(withContext(
        {
          code: 'PIECE_INVENTORY_UNKNOWN_PIECE_TYPE',
          path: `asset.payload.inventory[${index}].pieceTypeId`,
          severity: 'error',
          message: `Unknown inventory piece type "${entry.pieceTypeId}".`,
        },
        context,
      ));
      return;
    }

    if (pieceType.seat !== entry.seat) {
      diagnostics.push(withContext(
        {
          code: 'PIECE_INVENTORY_SEAT_MISMATCH',
          path: `asset.payload.inventory[${index}].seat`,
          severity: 'error',
          message: `Inventory seat "${entry.seat}" does not match piece type "${entry.pieceTypeId}" seat "${pieceType.seat}".`,
        },
        context,
      ));
    }

    inventoryCounts.set(entry.pieceTypeId, (inventoryCounts.get(entry.pieceTypeId) ?? 0) + 1);
  });

  // Skip inventory cross-validation when generate blocks are present — expansion
  // will produce both pieceTypes and inventory entries that are validated after expansion.
  if (!hasGenerateBlocks) {
    catalog.pieceTypes.forEach((pieceType, index) => {
      const count = inventoryCounts.get(pieceType.id) ?? 0;
      if (count === 0) {
        diagnostics.push(withContext(
          {
            code: 'PIECE_INVENTORY_MISSING',
            path: `asset.payload.pieceTypes[${index}].id`,
            severity: 'error',
            message: `Missing inventory declaration for piece type "${pieceType.id}".`,
          },
          context,
        ));
        return;
      }

      if (count > 1) {
        diagnostics.push(withContext(
          {
            code: 'PIECE_INVENTORY_DUPLICATE',
            path: `asset.payload.pieceTypes[${index}].id`,
            severity: 'error',
            message: `Piece type "${pieceType.id}" has duplicate inventory declarations.`,
          },
          context,
        ));
      }
    });
  }

  return diagnostics;
}

function withContext(diagnostic: Diagnostic, context: PieceCatalogDiagnosticContext): Diagnostic {
  return {
    ...diagnostic,
    path: remapPayloadPath(diagnostic.path, context),
    ...(context.assetPath === undefined ? {} : { assetPath: context.assetPath }),
    ...(context.entityId === undefined ? {} : { entityId: context.entityId }),
  };
}

function remapPayloadPath(path: string, context: PieceCatalogDiagnosticContext): string {
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
