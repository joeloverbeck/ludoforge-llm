import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { findEnginePackageRoot } from '../../helpers/lint-policy-helpers.js';

describe('cnl scenario-selection unresolved fallback policy', () => {
  it('requires compile-data-assets to use canonical unresolved selection helper', () => {
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const engineRoot = findEnginePackageRoot(thisDir);
    const compilerPath = resolve(engineRoot, 'src', 'cnl', 'compile-data-assets.ts');
    const source = readFileSync(compilerPath, 'utf8');

    assert.equal(
      source.includes('createUnresolvedScenarioSelectionResult'),
      true,
      'compile-data-assets must import/use createUnresolvedScenarioSelectionResult for unresolved selection branches',
    );
    assert.equal(
      source.includes('selected: undefined, failureReason: undefined, alternatives: []'),
      false,
      'compile-data-assets must not inline unresolved ScenarioSelectionResult object literals',
    );
  });
});
