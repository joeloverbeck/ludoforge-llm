import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { findEnginePackageRoot, listTypeScriptFiles } from '../../helpers/lint-policy-helpers.js';

type LineMatch = {
  readonly line: number;
  readonly excerpt: string;
};

type PolicyViolation = {
  readonly file: string;
  readonly reason: string;
  readonly matches: readonly LineMatch[];
};

const ID_IN_VALUE_PATTERN = /['"]id['"]\s+in\s+value/u;
const TYPE_IN_VALUE_PATTERN = /['"]type['"]\s+in\s+value/u;
const PROPS_IN_VALUE_PATTERN = /['"]props['"]\s+in\s+value/u;

const NON_TOKEN_ID_CHECK_ALLOWLIST = new Map<string, string>([
  ['src/kernel/binding-template.ts', 'Generic template interpolation supports any object carrying an id-like key.'],
  ['src/kernel/move-param-normalization.ts', 'Move-parameter comparison normalizes id-like scalar wrappers, not token contracts.'],
]);

function collectMatches(source: string, pattern: RegExp): readonly LineMatch[] {
  const matches: LineMatch[] = [];
  const lines = source.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (!pattern.test(line)) {
      continue;
    }
    matches.push({
      line: index + 1,
      excerpt: line.trim(),
    });
  }
  return matches;
}

describe('token-shape contract ownership policy', () => {
  it('keeps token runtime shape guards owned by token-shape.ts and documents non-token id checks explicitly', () => {
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const engineRoot = findEnginePackageRoot(thisDir);
    const kernelRoot = resolve(engineRoot, 'src', 'kernel');
    const ownershipFile = 'src/kernel/token-shape.ts';
    const files = listTypeScriptFiles(kernelRoot);

    const tokenRuntimeShapeViolations: PolicyViolation[] = [];
    const nonTokenAllowlistViolations: PolicyViolation[] = [];

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      const fileLabel = relative(engineRoot, file).replaceAll('\\', '/');
      const idMatches = collectMatches(source, ID_IN_VALUE_PATTERN);
      const typeMatches = collectMatches(source, TYPE_IN_VALUE_PATTERN);
      const propsMatches = collectMatches(source, PROPS_IN_VALUE_PATTERN);

      const hasRuntimeShapeTuple = idMatches.length > 0 && typeMatches.length > 0 && propsMatches.length > 0;
      if (fileLabel !== ownershipFile && hasRuntimeShapeTuple) {
        tokenRuntimeShapeViolations.push({
          file: fileLabel,
          reason: 'detected ad-hoc token runtime shape guard tuple (`id` + `type` + `props`) outside ownership module',
          matches: [...idMatches, ...typeMatches, ...propsMatches],
        });
      }

      if (idMatches.length > 0 && fileLabel !== ownershipFile && !NON_TOKEN_ID_CHECK_ALLOWLIST.has(fileLabel)) {
        nonTokenAllowlistViolations.push({
          file: fileLabel,
          reason: 'contains generic `id` guard without explicit non-token allowlist rationale',
          matches: idMatches,
        });
      }
    }

    assert.deepEqual(
      tokenRuntimeShapeViolations,
      [],
      [
        'Token runtime shape guards must be centralized in src/kernel/token-shape.ts.',
        'Do not duplicate (`id` + `type` + `props`) shape checks in other kernel modules.',
        'Violations:',
        ...tokenRuntimeShapeViolations.map((violation) => `- ${violation.file}: ${violation.reason}`),
      ].join('\n'),
    );

    assert.deepEqual(
      nonTokenAllowlistViolations,
      [],
      [
        'Kernel modules that use generic `id` guards must be explicitly documented as non-token callsites.',
        'Add new non-token sites to NON_TOKEN_ID_CHECK_ALLOWLIST with rationale.',
        'Current allowlist:',
        ...[...NON_TOKEN_ID_CHECK_ALLOWLIST.entries()].map(([path, reason]) => `- ${path}: ${reason}`),
        'Violations:',
        ...nonTokenAllowlistViolations.map((violation) => (
          `- ${violation.file}: ${violation.reason} at ${violation.matches.map((m) => `${m.line}`).join(', ')}`
        )),
      ].join('\n'),
    );
  });
});
