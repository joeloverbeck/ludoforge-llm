import type { Diagnostic } from './diagnostics.js';
import { validateMapPayload } from './map-model.js';
import { validatePieceCatalogPayload } from './piece-catalog.js';
import { validateRouteGraphPayload } from './route-graph-provider.js';
import { validateSeatCatalogPayload } from './seat-catalog.js';
import { DataAssetEnvelopeSchema } from './schemas.js';
import type { DataAssetEnvelope } from './types.js';

export interface LoadDataAssetEnvelopeOptions {
  readonly expectedKinds?: readonly string[];
}

export interface LoadDataAssetEnvelopeResult {
  readonly asset: DataAssetEnvelope | null;
  readonly diagnostics: readonly Diagnostic[];
}

export interface ValidateDataAssetEnvelopeOptions {
  readonly expectedKinds?: readonly string[];
  readonly assetPath?: string;
  readonly pathPrefix?: string;
}

export function validateDataAssetEnvelope(
  value: unknown,
  options: ValidateDataAssetEnvelopeOptions = {},
): LoadDataAssetEnvelopeResult {
  const pathPrefix = options.pathPrefix ?? 'asset';
  const envelopeResult = DataAssetEnvelopeSchema.safeParse(value);
  if (!envelopeResult.success) {
    const entityId = readEntityId(value);
    return {
      asset: null,
      diagnostics: envelopeResult.error.issues.map((issue) => ({
        code: 'DATA_ASSET_SCHEMA_INVALID',
        path: issue.path.length > 0 ? `${pathPrefix}.${issue.path.join('.')}` : pathPrefix,
        severity: 'error',
        message: issue.message,
        ...(options.assetPath === undefined ? {} : { assetPath: options.assetPath }),
        ...(entityId === undefined ? {} : { entityId }),
      })),
    };
  }

  const envelope = envelopeResult.data;
  const diagnostics: Diagnostic[] = [];
  if (options.expectedKinds !== undefined && !options.expectedKinds.includes(envelope.kind)) {
    diagnostics.push({
      code: 'DATA_ASSET_KIND_UNSUPPORTED',
      path: `${pathPrefix}.kind`,
      severity: 'error',
      message: `Unsupported asset kind "${envelope.kind}".`,
      suggestion: 'Use one of the supported asset kinds.',
      alternatives: [...options.expectedKinds],
      ...(options.assetPath === undefined ? {} : { assetPath: options.assetPath }),
      entityId: envelope.id,
    });
  }

  if (envelope.kind === 'pieceCatalog') {
    diagnostics.push(
      ...validatePieceCatalogPayload(envelope.payload, {
        pathPrefix: `${pathPrefix}.payload`,
        ...(options.assetPath === undefined ? {} : { assetPath: options.assetPath }),
        entityId: envelope.id,
      }),
    );
  }

  if (envelope.kind === 'map') {
    diagnostics.push(
      ...validateMapPayload(envelope.payload, {
        pathPrefix: `${pathPrefix}.payload`,
        ...(options.assetPath === undefined ? {} : { assetPath: options.assetPath }),
        entityId: envelope.id,
      }),
    );
  }

  if (envelope.kind === 'seatCatalog') {
    diagnostics.push(
      ...validateSeatCatalogPayload(envelope.payload, {
        pathPrefix: `${pathPrefix}.payload`,
        ...(options.assetPath === undefined ? {} : { assetPath: options.assetPath }),
        entityId: envelope.id,
      }),
    );
  }

  if (envelope.kind === 'routeGraph') {
    diagnostics.push(
      ...validateRouteGraphPayload(envelope.payload, {
        pathPrefix: `${pathPrefix}.payload`,
        ...(options.assetPath === undefined ? {} : { assetPath: options.assetPath }),
        entityId: envelope.id,
      }),
    );
  }

  if (diagnostics.length > 0) {
    return {
      asset: null,
      diagnostics,
    };
  }

  return {
    asset: envelope,
    diagnostics: [],
  };
}

function readEntityId(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }

  const id = (value as Record<string, unknown>).id;
  return typeof id === 'string' && id.trim() !== '' ? id : undefined;
}
