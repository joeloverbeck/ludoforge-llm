export function isDotSafePathKey(key: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key);
}

export function renderMacroPathSegment(macroId: string): string {
  return `[macro:${escapeMacroPathSegmentValue(macroId)}]`;
}

export function parseMacroPathSegment(segment: string): { macroId: string } | undefined {
  if (!segment.startsWith('[macro:') || !segment.endsWith(']')) {
    return undefined;
  }

  const encodedMacroId = segment.slice('[macro:'.length, -1);
  let decodedMacroId = '';

  for (let index = 0; index < encodedMacroId.length; index += 1) {
    const ch = encodedMacroId[index];
    if (ch !== '\\') {
      decodedMacroId += ch;
      continue;
    }

    const escaped = encodedMacroId[index + 1];
    if (escaped === '\\' || escaped === ']') {
      decodedMacroId += escaped;
      index += 1;
      continue;
    }

    return undefined;
  }

  return { macroId: decodedMacroId };
}

export function appendMacroPathSegment(basePath: string, macroId: string, expansionIndex?: number): string {
  const macroSegment = `${basePath}${renderMacroPathSegment(macroId)}`;
  return expansionIndex === undefined ? macroSegment : `${macroSegment}[${expansionIndex}]`;
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

export function joinPathSegments(segments: readonly string[]): string {
  if (segments.length === 0) {
    return '';
  }

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

export function stripMacroPathSegments(path: string): string {
  const segments = splitPathSegments(path);
  if (segments.length === 0) {
    return path;
  }

  const stripped: string[] = [];
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (segment !== undefined && parseMacroPathSegment(segment) !== undefined) {
      if (/^\[[0-9]+\]$/.test(segments[index + 1] ?? '')) {
        index += 1;
      }
      continue;
    }
    if (segment !== undefined) {
      stripped.push(segment);
    }
  }

  return stripped.length === 0 ? '' : joinPathSegments(stripped);
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
    while (index < path.length) {
      const ch = path[index];
      if (ch === '\\') {
        index += 2;
        continue;
      }
      if (ch === ']') {
        break;
      }
      index += 1;
    }
  }

  if (path[index] !== ']') {
    return undefined;
  }
  return index + 1;
}

function escapeMacroPathSegmentValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\]/g, '\\]');
}
