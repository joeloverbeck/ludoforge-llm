import {
  normalizeArrayIndexSegmentsToBrackets,
  normalizeArrayIndexSegmentsToDots,
  toObjectPathSuffix,
} from './path-utils.js';

const MACRO_SEGMENT_PATTERN = /\[macro:[^\]]+\](\[[0-9]+\])?/g;

export function appendDiagnosticKeySegment(basePath: string, key: string): string {
  return `${basePath}${toObjectPathSuffix(key)}`;
}

export function canonicalizeDiagnosticPath(path: string): string {
  const withDots = normalizeArrayIndexSegmentsToDots(path);
  return withDots.startsWith('doc.') ? withDots : `doc.${withDots}`;
}

export function buildDiagnosticSourceLookupCandidates(path: string): readonly string[] {
  const canonicalPath = canonicalizeDiagnosticPath(path);
  const withoutDocPrefix = canonicalPath.slice(4);
  const bracketPath = normalizeArrayIndexSegmentsToBrackets(withoutDocPrefix);
  const withoutMacroSegments = bracketPath.replace(MACRO_SEGMENT_PATTERN, '');
  const unique = new Set<string>([path, canonicalPath, withoutDocPrefix, bracketPath, withoutMacroSegments]);
  return [...unique];
}
