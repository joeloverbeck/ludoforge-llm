import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { Diagnostic } from './diagnostics.js';
import { validatePieceCatalogPayload } from './piece-catalog.js';
import { DataAssetEnvelopeSchema } from './schemas.js';
import type { DataAssetEnvelope, DataAssetKind } from './types.js';

export interface LoadDataAssetEnvelopeOptions {
  readonly expectedKinds?: readonly DataAssetKind[];
  readonly expectedVersion?: number;
}

export interface LoadDataAssetEnvelopeResult {
  readonly asset: DataAssetEnvelope | null;
  readonly diagnostics: readonly Diagnostic[];
}

export function loadDataAssetEnvelopeFromFile(
  assetPath: string,
  options: LoadDataAssetEnvelopeOptions = {},
): LoadDataAssetEnvelopeResult {
  const fileResult = readAssetFile(assetPath);
  if (fileResult.diagnostic !== undefined) {
    return {
      asset: null,
      diagnostics: [fileResult.diagnostic],
    };
  }

  const envelopeResult = DataAssetEnvelopeSchema.safeParse(fileResult.value);
  if (!envelopeResult.success) {
    const entityId = readEntityId(fileResult.value);
    return {
      asset: null,
      diagnostics: envelopeResult.error.issues.map((issue) => ({
        code: 'DATA_ASSET_SCHEMA_INVALID',
        path: issue.path.length > 0 ? `asset.${issue.path.join('.')}` : 'asset',
        severity: 'error',
        message: issue.message,
        assetPath,
        ...(entityId === undefined ? {} : { entityId }),
      })),
    };
  }

  const envelope = envelopeResult.data;
  const diagnostics: Diagnostic[] = [];
  if (options.expectedKinds !== undefined && !options.expectedKinds.includes(envelope.kind)) {
    diagnostics.push({
      code: 'DATA_ASSET_KIND_UNSUPPORTED',
      path: 'asset.kind',
      severity: 'error',
      message: `Unsupported asset kind "${envelope.kind}".`,
      suggestion: 'Use one of the supported asset kinds.',
      alternatives: [...options.expectedKinds],
      assetPath,
      entityId: envelope.id,
    });
  }

  if (options.expectedVersion !== undefined && envelope.version !== options.expectedVersion) {
    diagnostics.push({
      code: 'DATA_ASSET_VERSION_UNSUPPORTED',
      path: 'asset.version',
      severity: 'error',
      message: `Unsupported asset version ${envelope.version}; expected ${options.expectedVersion}.`,
      suggestion: 'Use an explicit supported schema version.',
      assetPath,
      entityId: envelope.id,
    });
  }

  if (envelope.kind === 'pieceCatalog') {
    diagnostics.push(
      ...validatePieceCatalogPayload(envelope.payload, {
        assetPath,
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

function readAssetFile(assetPath: string): { readonly value: unknown; readonly diagnostic?: Diagnostic } {
  const extension = extname(assetPath).toLowerCase();
  if (extension !== '.json' && extension !== '.yaml' && extension !== '.yml') {
    return {
      value: null,
      diagnostic: {
        code: 'DATA_ASSET_FORMAT_UNSUPPORTED',
        path: 'asset.file',
        severity: 'error',
        message: `Unsupported asset format "${extension || '(none)'}".`,
        suggestion: 'Use .json, .yaml, or .yml asset files.',
        assetPath,
      },
    };
  }

  try {
    const source = readFileSync(assetPath, 'utf8');
    return {
      value: extension === '.json' ? JSON.parse(source) : parseYaml(source),
    };
  } catch (error) {
    return {
      value: null,
      diagnostic: {
        code: 'DATA_ASSET_PARSE_ERROR',
        path: 'asset.file',
        severity: 'error',
        message: `Failed to parse asset file: ${formatError(error)}.`,
        suggestion: 'Fix file syntax and try loading again.',
        assetPath,
      },
    };
  }
}

function readEntityId(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }

  const id = (value as Record<string, unknown>).id;
  return typeof id === 'string' && id.trim() !== '' ? id : undefined;
}

function formatError(error: unknown): string {
  if (error instanceof Error && error.message.trim() !== '') {
    return error.message;
  }
  return String(error);
}
