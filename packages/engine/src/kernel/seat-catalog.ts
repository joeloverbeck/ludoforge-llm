import type { Diagnostic } from './diagnostics.js';
import { SeatCatalogPayloadSchema } from './schemas.js';
import type { SeatCatalogPayload } from './types.js';

export interface SeatCatalogDiagnosticContext {
  readonly assetPath?: string;
  readonly entityId?: string;
  readonly pathPrefix?: string;
}

export function validateSeatCatalogPayload(
  payload: unknown,
  context: SeatCatalogDiagnosticContext = {},
): readonly Diagnostic[] {
  const parseResult = SeatCatalogPayloadSchema.safeParse(payload);
  if (!parseResult.success) {
    return parseResult.error.issues.map((issue) => ({
      code: 'SEAT_CATALOG_SCHEMA_INVALID',
      path: remapPayloadPath(issue.path.length > 0 ? `asset.payload.${issue.path.join('.')}` : 'asset.payload', context),
      severity: 'error' as const,
      message: issue.message,
      ...(context.assetPath === undefined ? {} : { assetPath: context.assetPath }),
      ...(context.entityId === undefined ? {} : { entityId: context.entityId }),
    }));
  }

  const diagnostics: Diagnostic[] = [];
  const catalog = parseResult.data as SeatCatalogPayload;
  const seen = new Set<string>();
  for (const [index, seat] of catalog.seats.entries()) {
    if (seen.has(seat.id)) {
      diagnostics.push(withContext(
        {
          code: 'SEAT_CATALOG_DUPLICATE_SEAT',
          path: `asset.payload.seats[${index}].id`,
          severity: 'error',
          message: `Duplicate seat id "${seat.id}" in seat catalog payload.`,
        },
        context,
      ));
      continue;
    }
    seen.add(seat.id);
  }

  return diagnostics;
}

function withContext(diagnostic: Diagnostic, context: SeatCatalogDiagnosticContext): Diagnostic {
  return {
    ...diagnostic,
    path: remapPayloadPath(diagnostic.path, context),
    ...(context.assetPath === undefined ? {} : { assetPath: context.assetPath }),
    ...(context.entityId === undefined ? {} : { entityId: context.entityId }),
  };
}

function remapPayloadPath(path: string, context: SeatCatalogDiagnosticContext): string {
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
