import * as assert from 'node:assert/strict';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { analyzeCanonicalSymbolOwnerPolicy } from '../../helpers/lint-policy-helpers.js';

const CANONICAL_MODULE_BASENAME = 'identifier-utils.ts';
const CANONICAL_IMPORT_SPECIFIER = './identifier-utils.js';

describe('cnl identifier normalization single-source policy', () => {
  it('keeps normalizeIdentifier defined and exported only in identifier-utils.ts with no alias boundaries', () => {
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const report = analyzeCanonicalSymbolOwnerPolicy(thisDir, {
      moduleSubdir: ['src', 'cnl'],
      canonicalModuleBasename: CANONICAL_MODULE_BASENAME,
      canonicalImportSpecifier: CANONICAL_IMPORT_SPECIFIER,
      symbolNames: ['normalizeIdentifier'],
    });

    assert.deepEqual(
      report.exportedDefinitionFiles,
      [report.canonicalFile],
      'normalizeIdentifier export must exist only in src/cnl/identifier-utils.ts',
    );

    assert.deepEqual(
      report.invalidLocalDefinitions,
      [],
      'non-canonical CNL modules must not define local normalizeIdentifier implementations',
    );

    assert.deepEqual(
      report.invalidImports,
      [],
      'CNL modules must import normalizeIdentifier only from ./identifier-utils.js without aliasing',
    );

    assert.deepEqual(
      report.invalidReExports,
      [],
      'non-canonical CNL modules must not re-export normalizeIdentifier through alias or wildcard paths',
    );

    assert.deepEqual(
      report.invalidNonCanonicalExports,
      [],
      'non-canonical CNL modules must not export normalizeIdentifier',
    );
  });
});
