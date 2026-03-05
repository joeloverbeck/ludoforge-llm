import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { findEnginePackageRoot } from '../../helpers/lint-policy-helpers.js';

const thisDir = dirname(fileURLToPath(import.meta.url));
const engineRoot = findEnginePackageRoot(thisDir);
const missingReferenceContractPath = resolve(engineRoot, 'src', 'contracts', 'missing-reference-diagnostic-contract.ts');
const bindingIdentifierContractPath = resolve(engineRoot, 'src', 'contracts', 'binding-identifier-contract.ts');
const editDistanceContractPath = resolve(engineRoot, 'src', 'contracts', 'edit-distance-contract.ts');

function hasLocalLevenshteinDefinition(source: string): boolean {
  return /\b(?:const|function)\s+levenshteinDistance\b/u.test(source);
}

describe('contracts edit-distance source guard', () => {
  it('keeps edit-distance ownership centralized in edit-distance-contract', () => {
    const missingReferenceSource = readFileSync(missingReferenceContractPath, 'utf8');
    const bindingIdentifierSource = readFileSync(bindingIdentifierContractPath, 'utf8');
    const editDistanceSource = readFileSync(editDistanceContractPath, 'utf8');

    assert.equal(
      missingReferenceSource.includes("from './edit-distance-contract.js'"),
      true,
      'missing-reference-diagnostic-contract.ts must import edit-distance helper from ./edit-distance-contract.js.',
    );
    assert.equal(
      bindingIdentifierSource.includes("from './edit-distance-contract.js'"),
      true,
      'binding-identifier-contract.ts must import edit-distance helper from ./edit-distance-contract.js.',
    );
    assert.equal(
      missingReferenceSource.includes('rankByEditDistance('),
      true,
      'missing-reference-diagnostic-contract.ts must use rankByEditDistance for scoring.',
    );
    assert.equal(
      bindingIdentifierSource.includes('rankByEditDistance('),
      true,
      'binding-identifier-contract.ts must use rankByEditDistance for scoring.',
    );
    assert.equal(
      hasLocalLevenshteinDefinition(missingReferenceSource),
      false,
      'missing-reference-diagnostic-contract.ts must not define a local levenshteinDistance helper.',
    );
    assert.equal(
      hasLocalLevenshteinDefinition(bindingIdentifierSource),
      false,
      'binding-identifier-contract.ts must not define a local levenshteinDistance helper.',
    );
    assert.equal(
      hasLocalLevenshteinDefinition(editDistanceSource),
      true,
      'edit-distance-contract.ts must own the canonical levenshteinDistance helper.',
    );
  });
});
