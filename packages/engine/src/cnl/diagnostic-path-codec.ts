import {
  isDotSafePathKey,
  joinPathSegments,
  normalizeArrayIndexSegmentsToBrackets,
  normalizeArrayIndexSegmentsToDots,
  splitPathSegments,
  stripMacroPathSegments,
  toObjectPathSuffix,
} from './path-utils.js';

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
  const withoutMacroSegments = stripMacroPathSegments(bracketPath);
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
