// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  findEnginePackageRoot,
  findReExportSpecifierViolations,
  listTypeScriptFiles,
} from '../../helpers/lint-policy-helpers.js';

const CORE_SPECIFIER = './scenario-linked-asset-selection-core.js';
const DIAGNOSTICS_SPECIFIER = './scenario-linked-asset-selection-diagnostics.js';

describe('cnl scenario-selection no-alias re-export policy', () => {
  it('forbids CNL facade modules that re-export scenario-selection core/diagnostics surfaces', () => {
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const engineRoot = findEnginePackageRoot(thisDir);
    const cnlDir = resolve(engineRoot, 'src', 'cnl');
    const files = listTypeScriptFiles(cnlDir);
    const violations = findReExportSpecifierViolations(files, [CORE_SPECIFIER, DIAGNOSTICS_SPECIFIER]);

    assert.deepEqual(
      violations,
      [],
      'scenario-selection core/diagnostics must not be re-exported via CNL facade modules',
    );
  });
});
