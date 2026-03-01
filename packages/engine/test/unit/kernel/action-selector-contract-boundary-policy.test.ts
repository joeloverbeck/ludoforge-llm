import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const thisDir = dirname(fileURLToPath(import.meta.url));
const contractRegistryPath = resolve(thisDir, '../../../../src/contracts/action-selector-contract-registry.ts');

describe('action selector contract boundary policy', () => {
  it('keeps shared selector contract free of CNL rendering concerns', () => {
    const source = readFileSync(contractRegistryPath, 'utf8');

    for (const pattern of [
      /CNL_COMPILER_/,
      /CNL_XREF_/,
      /compileLowering/,
      /crossValidate/,
      /Diagnostic/,
      /buildActionSelectorContractViolationDiagnostic/,
    ]) {
      assert.equal(pattern.test(source), false, `shared selector contract must not contain ${pattern}`);
    }
  });
});
