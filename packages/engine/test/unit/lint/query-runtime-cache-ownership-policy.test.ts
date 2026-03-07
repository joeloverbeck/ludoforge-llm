import * as assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  collectStaticModuleReferences,
  findEnginePackageRoot,
  listTypeScriptFiles,
} from '../../helpers/lint-policy-helpers.js';

type ForbiddenSpecifierViolation = {
  readonly file: string;
  readonly line: number;
  readonly kind: 'import' | 'export-from' | 'import-equals-require';
  readonly specifier: string;
};

const FORBIDDEN_MODULE_SPECIFIER_PATTERN = /(?:^|\/)query-runtime-cache(?:\.[cm]?[jt]s)?$/u;

const isForbiddenQueryRuntimeCacheSpecifier = (specifier: string): boolean =>
  FORBIDDEN_MODULE_SPECIFIER_PATTERN.test(specifier);

describe('query-runtime-cache removal policy', () => {
  it('removes legacy query-runtime-cache module and forbids imports', () => {
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const engineRoot = findEnginePackageRoot(thisDir);
    const kernelDir = resolve(engineRoot, 'src', 'kernel');
    const sourceFiles = [
      ...listTypeScriptFiles(resolve(engineRoot, 'src')),
      ...listTypeScriptFiles(resolve(engineRoot, 'test')),
    ];

    const legacyModulePath = resolve(kernelDir, 'query-runtime-cache.ts');
    const forbiddenSpecifierViolations: ForbiddenSpecifierViolation[] = [];

    for (const file of sourceFiles) {
      const content = readFileSync(file, 'utf8');
      const references = collectStaticModuleReferences(content, file);
      for (const reference of references) {
        if (isForbiddenQueryRuntimeCacheSpecifier(reference.specifier)) {
          forbiddenSpecifierViolations.push({
            file,
            line: reference.line,
            kind: reference.kind,
            specifier: reference.specifier,
          });
        }
      }
    }

    assert.equal(existsSync(legacyModulePath), false, 'Legacy src/kernel/query-runtime-cache.ts must not exist');
    assert.deepEqual(
      forbiddenSpecifierViolations,
      [],
      [
        'Legacy query-runtime-cache imports are forbidden after canonical token-state-index adoption.',
        ...forbiddenSpecifierViolations.map(
          (violation) => `- ${violation.file}:${violation.line} [${violation.kind}] -> ${violation.specifier}`,
        ),
      ].join('\n'),
    );
  });

  it('detects forbidden static specifiers in import/export forms and ignores unrelated text literals', () => {
    const fixtureSource = [
      "import type { Cache } from './query-runtime-cache.js';",
      "export { readQueryCache } from '../kernel/query-runtime-cache.ts';",
      "import queryRuntimeCache = require('query-runtime-cache');",
      "const textOnly = 'query-runtime-cache';",
    ].join('\n');

    const forbiddenReferences = collectStaticModuleReferences(fixtureSource, 'fixture.ts').filter((reference) =>
      isForbiddenQueryRuntimeCacheSpecifier(reference.specifier),
    );
    const seenKinds = new Set(forbiddenReferences.map((reference) => reference.kind));

    assert.equal(forbiddenReferences.length, 3, 'all static query-runtime-cache references must be detected');
    assert.equal(seenKinds.has('import'), true, 'type-only imports must be detected');
    assert.equal(seenKinds.has('export-from'), true, 're-export specifiers must be detected');
    assert.equal(seenKinds.has('import-equals-require'), true, 'import-equals require specifiers must be detected');
  });
});
