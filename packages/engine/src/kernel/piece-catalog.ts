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
}

export function validatePieceCatalogPayload(
  payload: unknown,
  context: PieceCatalogDiagnosticContext = {},
): readonly Diagnostic[] {
  const parseResult = PieceCatalogPayloadSchema.safeParse(payload);
  if (!parseResult.success) {
    return parseResult.error.issues.map((issue) => ({
      code: 'PIECE_CATALOG_SCHEMA_INVALID',
      path: issue.path.length > 0 ? `asset.payload.${issue.path.join('.')}` : 'asset.payload',
      severity: 'error' as const,
      message: issue.message,
      ...(context.assetPath === undefined ? {} : { assetPath: context.assetPath }),
      ...(context.entityId === undefined ? {} : { entityId: context.entityId }),
    }));
  }

  const diagnostics: Diagnostic[] = [];
  const catalog = parseResult.data as PieceCatalogPayload;
  const pieceTypeById = new Map<string, PieceCatalogPayload['pieceTypes'][number]>();
  const declaredFactions = new Set<string>();
  for (const [index, faction] of (catalog.factions ?? []).entries()) {
    if (!declaredFactions.has(faction.id)) {
      declaredFactions.add(faction.id);
      continue;
    }
    diagnostics.push(withContext(
      {
        code: 'PIECE_CATALOG_DUPLICATE_FACTION',
        path: `asset.payload.factions[${index}].id`,
        severity: 'error',
        message: `Duplicate faction id "${faction.id}" in piece catalog payload.`,
      },
      context,
    ));
  }

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

    if (declaredFactions.size > 0 && !declaredFactions.has(pieceType.faction)) {
      diagnostics.push(withContext(
        {
          code: 'PIECE_CATALOG_PIECE_TYPE_FACTION_UNDECLARED',
          path: `asset.payload.pieceTypes[${index}].faction`,
          severity: 'error',
          message: `Piece type "${pieceType.id}" references undeclared faction "${pieceType.faction}".`,
          suggestion: 'Add the faction to payload.factions or update pieceTypes[*].faction.',
        },
        context,
      ));
    }

    const declaredDimensions = new Set(pieceType.statusDimensions);

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

    if (pieceType.faction !== entry.faction) {
      diagnostics.push(withContext(
        {
          code: 'PIECE_INVENTORY_FACTION_MISMATCH',
          path: `asset.payload.inventory[${index}].faction`,
          severity: 'error',
          message: `Inventory faction "${entry.faction}" does not match piece type "${entry.pieceTypeId}" faction "${pieceType.faction}".`,
        },
        context,
      ));
    }

    if (declaredFactions.size > 0 && !declaredFactions.has(entry.faction)) {
      diagnostics.push(withContext(
        {
          code: 'PIECE_CATALOG_INVENTORY_FACTION_UNDECLARED',
          path: `asset.payload.inventory[${index}].faction`,
          severity: 'error',
          message: `Inventory entry for piece type "${entry.pieceTypeId}" references undeclared faction "${entry.faction}".`,
          suggestion: 'Add the faction to payload.factions or update inventory[*].faction.',
        },
        context,
      ));
    }

    inventoryCounts.set(entry.pieceTypeId, (inventoryCounts.get(entry.pieceTypeId) ?? 0) + 1);
  });

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

  return diagnostics;
}

function withContext(diagnostic: Diagnostic, context: PieceCatalogDiagnosticContext): Diagnostic {
  return {
    ...diagnostic,
    ...(context.assetPath === undefined ? {} : { assetPath: context.assetPath }),
    ...(context.entityId === undefined ? {} : { entityId: context.entityId }),
  };
}
