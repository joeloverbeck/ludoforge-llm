export interface ReservedCompilerMetadataKeyOccurrence {
  readonly key: string;
  readonly path: string;
}

const RESERVED_COMPILER_METADATA_PREFIX = '__';

export function isReservedCompilerMetadataKey(key: string): boolean {
  return key.startsWith(RESERVED_COMPILER_METADATA_PREFIX);
}

export function collectReservedCompilerMetadataKeyOccurrencesOnRecord(
  node: unknown,
  path: string,
): readonly ReservedCompilerMetadataKeyOccurrence[] {
  if (!isRecord(node)) {
    return [];
  }
  const occurrences: ReservedCompilerMetadataKeyOccurrence[] = [];
  for (const key of Object.keys(node)) {
    if (!isReservedCompilerMetadataKey(key)) {
      continue;
    }
    occurrences.push({ key, path: `${path}.${key}` });
  }
  return occurrences;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
