function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

const TOKEN_QUERY_WITH_FILTER = new Set(['tokensInZone', 'tokensInMapSpaces', 'tokensInAdjacentZones']);

function maybeCollectViolation(node: Record<string, unknown>, path: string, violations: string[]): void {
  const query = node.query;
  if (typeof query === 'string' && TOKEN_QUERY_WITH_FILTER.has(query) && hasOwn(node, 'filter') && Array.isArray(node.filter)) {
    violations.push(`${path}.filter`);
  }

  const reveal = node.reveal;
  if (isRecord(reveal) && hasOwn(reveal, 'filter') && Array.isArray(reveal.filter)) {
    violations.push(`${path}.reveal.filter`);
  }

  const conceal = node.conceal;
  if (isRecord(conceal) && hasOwn(conceal, 'filter') && Array.isArray(conceal.filter)) {
    violations.push(`${path}.conceal.filter`);
  }
}

function walk(node: unknown, path: string, violations: string[]): void {
  if (Array.isArray(node)) {
    node.forEach((entry, index) => walk(entry, `${path}.${index}`, violations));
    return;
  }

  if (!isRecord(node)) {
    return;
  }

  maybeCollectViolation(node, path, violations);
  for (const [key, value] of Object.entries(node)) {
    walk(value, `${path}.${key}`, violations);
  }
}

export function findLegacyTokenFilterArrayPaths(doc: unknown, rootPath = 'doc'): readonly string[] {
  const violations: string[] = [];
  walk(doc, rootPath, violations);
  return violations;
}
