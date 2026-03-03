import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { findEnginePackageRoot, listTypeScriptFiles } from '../../helpers/lint-policy-helpers.js';

const CORE_SPECIFIER = './scenario-linked-asset-selection-core.js';
const DIAGNOSTICS_SPECIFIER = './scenario-linked-asset-selection-diagnostics.js';

describe('cnl scenario-selection no-alias re-export policy', () => {
  it('forbids CNL facade modules that re-export scenario-selection core/diagnostics surfaces', () => {
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const engineRoot = findEnginePackageRoot(thisDir);
    const cnlDir = resolve(engineRoot, 'src', 'cnl');
    const files = listTypeScriptFiles(cnlDir);
    const violations: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const line of source.split('\n')) {
        const match = line.match(/^\s*export\s+[^;]*\sfrom\s*['"]([^'"]+)['"]/u);
        const specifier = match?.[1];
        if (specifier === CORE_SPECIFIER || specifier === DIAGNOSTICS_SPECIFIER) {
          violations.push(`${file}:${specifier}`);
        }
      }
    }

    assert.deepEqual(
      violations,
      [],
      'scenario-selection core/diagnostics must not be re-exported via CNL facade modules',
    );
  });
});
