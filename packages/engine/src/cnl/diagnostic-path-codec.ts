import {
  isDotSafePathKey,
  normalizeArrayIndexSegmentsToBrackets,
  normalizeArrayIndexSegmentsToDots,
  splitPathSegments,
  toObjectPathSuffix,
} from './path-utils.js';

const MACRO_SEGMENT_PATTERN = /\[macro:[^\]]+\](\[[0-9]+\])?/g;

export function appendDiagnosticKeySegment(basePath: string, key: string): string {
  return `${basePath}${toObjectPathSuffix(key)}`;
}

export function canonicalizeDiagnosticPath(path: string): string {
  const withDots = normalizeArrayIndexSegmentsToDots(path);
  const withDocPrefix = withDots.startsWith('doc.') ? withDots : `doc.${withDots}`;
  const segments = splitPathSegments(withDocPrefix);
  if (segments.length === 0) {
    return withDocPrefix;
  }

  const normalized = segments.map((segment) => normalizeQuotedKeySegment(segment));
  return joinPathSegments(normalized);
}

export function buildDiagnosticSourceLookupCandidates(path: string): readonly string[] {
  const canonicalPath = canonicalizeDiagnosticPath(path);
  const withoutDocPrefix = canonicalPath.slice(4);
  const bracketPath = normalizeArrayIndexSegmentsToBrackets(withoutDocPrefix);
  const withoutMacroSegments = bracketPath.replace(MACRO_SEGMENT_PATTERN, '');
  const unique = new Set<string>([path, canonicalPath, withoutDocPrefix, bracketPath, withoutMacroSegments]);
  return [...unique];
}

function normalizeQuotedKeySegment(segment: string): string {
  if (!segment.startsWith('["') || !segment.endsWith('"]')) {
    return segment;
  }

  try {
    const decoded = JSON.parse(segment.slice(1, -1));
    if (typeof decoded !== 'string') {
      return segment;
    }
    if (isDotSafePathKey(decoded)) {
      return decoded;
    }
    return `[${JSON.stringify(decoded)}]`;
  } catch {
    return segment;
  }
}

function joinPathSegments(segments: readonly string[]): string {
  let path = segments[0] ?? '';
  for (const segment of segments.slice(1)) {
    if (segment.startsWith('[')) {
      path += segment;
      continue;
    }
    if (/^[0-9]+$/.test(segment)) {
      path += `.${segment}`;
      continue;
    }
    path += toObjectPathSuffix(segment);
  }
  return path;
}
