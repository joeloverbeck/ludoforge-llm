export function isDotSafePathKey(key: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key);
}

export function toObjectPathSuffix(key: string): string {
  return isDotSafePathKey(key) ? `.${key}` : `[${JSON.stringify(key)}]`;
}

export function normalizeArrayIndexSegmentsToBrackets(path: string): string {
  let normalized = '';
  let index = 0;

  while (index < path.length) {
    const ch = path[index];
    if (ch !== '.') {
      normalized += ch;
      index += 1;
      continue;
    }

    const next = path[index + 1];
    if (next === undefined || next < '0' || next > '9') {
      normalized += ch;
      index += 1;
      continue;
    }

    let end = index + 1;
    while (end < path.length) {
      const digit = path[end];
      if (digit === undefined || digit < '0' || digit > '9') {
        break;
      }
      end += 1;
    }

    const terminator = path[end];
    if (terminator === undefined || terminator === '.' || terminator === '[') {
      normalized += `[${path.slice(index + 1, end)}]`;
      index = end;
      continue;
    }

    normalized += ch;
    index += 1;
  }

  return normalized;
}

export function normalizeArrayIndexSegmentsToDots(path: string): string {
  let normalized = '';
  let index = 0;

  while (index < path.length) {
    const ch = path[index];
    if (ch !== '[') {
      normalized += ch;
      index += 1;
      continue;
    }

    const segmentEnd = readBracketSegmentEnd(path, index);
    if (segmentEnd === undefined) {
      normalized += ch;
      index += 1;
      continue;
    }

    const segment = path.slice(index, segmentEnd);
    if (/^\[[0-9]+\]$/.test(segment)) {
      normalized += `.${segment.slice(1, -1)}`;
      index = segmentEnd;
      continue;
    }

    normalized += segment;
    index = segmentEnd;
  }

  return normalized;
}

export function splitPathSegments(path: string): readonly string[] {
  if (path.length === 0) {
    return [];
  }

  const segments: string[] = [];
  let index = 0;

  while (index < path.length) {
    const ch = path[index];
    if (ch === '.') {
      index += 1;
      continue;
    }

    if (ch === '[') {
      const segmentEnd = readBracketSegmentEnd(path, index);
      if (segmentEnd === undefined) {
        return [];
      }
      segments.push(path.slice(index, segmentEnd));
      index = segmentEnd;
      continue;
    }

    let end = index;
    while (end < path.length && path[end] !== '.' && path[end] !== '[') {
      end += 1;
    }
    segments.push(path.slice(index, end));
    index = end;
  }

  return segments;
}

export function trimLastPathSegment(path: string): string | undefined {
  const segments = splitPathSegments(path);
  if (segments.length <= 1) {
    return undefined;
  }

  const parentSegments = segments.slice(0, -1);
  let parent = parentSegments[0] ?? '';
  for (const segment of parentSegments.slice(1)) {
    parent += segment.startsWith('[') ? segment : `.${segment}`;
  }
  return parent;
}

function readBracketSegmentEnd(path: string, start: number): number | undefined {
  let index = start + 1;
  if (path[index] === '"') {
    index += 1;
    while (index < path.length) {
      const ch = path[index];
      if (ch === '\\') {
        index += 2;
        continue;
      }
      if (ch === '"') {
        index += 1;
        break;
      }
      index += 1;
    }
  } else {
    while (index < path.length && path[index] !== ']') {
      index += 1;
    }
  }

  if (path[index] !== ']') {
    return undefined;
  }
  return index + 1;
}
