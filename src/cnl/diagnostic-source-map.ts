import type { GameSpecSourceMap, SourceSpan } from './source-map.js';

export function resolveSpanForDiagnosticPath(path: string, sourceMap?: GameSpecSourceMap): SourceSpan | undefined {
  if (sourceMap === undefined) {
    return undefined;
  }

  const candidates = buildSourceLookupCandidates(path);
  for (const candidate of candidates) {
    const direct = sourceMap.byPath[candidate];
    if (direct !== undefined) {
      return direct;
    }

    for (const parent of buildPathParents(candidate)) {
      const parentSpan = sourceMap.byPath[parent];
      if (parentSpan !== undefined) {
        return parentSpan;
      }
    }
  }

  return undefined;
}

export function compareSourceSpans(left?: SourceSpan, right?: SourceSpan): number {
  if (left === undefined && right === undefined) {
    return 0;
  }
  if (left === undefined) {
    return 1;
  }
  if (right === undefined) {
    return -1;
  }

  if (left.blockIndex !== right.blockIndex) {
    return left.blockIndex - right.blockIndex;
  }
  if (left.markdownLineStart !== right.markdownLineStart) {
    return left.markdownLineStart - right.markdownLineStart;
  }
  if (left.markdownColStart !== right.markdownColStart) {
    return left.markdownColStart - right.markdownColStart;
  }
  if (left.markdownLineEnd !== right.markdownLineEnd) {
    return left.markdownLineEnd - right.markdownLineEnd;
  }
  return left.markdownColEnd - right.markdownColEnd;
}

function buildSourceLookupCandidates(path: string): readonly string[] {
  const withoutDocPrefix = path.startsWith('doc.') ? path.slice(4) : path;
  const bracketPath = withoutDocPrefix.replace(/\.([0-9]+)(?=\.|$)/g, '[$1]');
  const withoutMacroSegments = bracketPath.replace(/\[macro:[^\]]+\](\[[0-9]+\])?/g, '');
  const unique = new Set<string>([path, withoutDocPrefix, bracketPath, withoutMacroSegments]);
  return [...unique];
}

function buildPathParents(path: string): readonly string[] {
  const parents: string[] = [];
  let cursor = path;
  while (true) {
    const next = trimLastPathSegment(cursor);
    if (next === undefined) {
      break;
    }
    parents.push(next);
    cursor = next;
  }
  return parents;
}

function trimLastPathSegment(path: string): string | undefined {
  if (path.length === 0) {
    return undefined;
  }

  if (path.endsWith(']')) {
    const openIndex = path.lastIndexOf('[');
    if (openIndex <= 0) {
      return undefined;
    }
    return path.slice(0, openIndex);
  }

  const dotIndex = path.lastIndexOf('.');
  if (dotIndex <= 0) {
    return undefined;
  }
  return path.slice(0, dotIndex);
}
