import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { parse as parseYaml } from 'yaml';

import type { Diagnostic } from './diagnostics.js';
import {
  validateDataAssetEnvelope,
  type LoadDataAssetEnvelopeOptions,
  type LoadDataAssetEnvelopeResult,
} from './data-assets.js';

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

  return validateDataAssetEnvelope(fileResult.value, {
    ...(options.expectedKinds === undefined ? {} : { expectedKinds: options.expectedKinds }),
    assetPath,
  });
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

function formatError(error: unknown): string {
  if (error instanceof Error && error.message.trim() !== '') {
    return error.message;
  }
  return String(error);
}
