import * as assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const thisDir = dirname(fileURLToPath(import.meta.url));
const contractsDir = resolve(thisDir, '../../../src/contracts');

describe('contracts -> kernel boundary', () => {
  it('keeps shared contracts free of kernel imports', () => {
    const contractFiles = readdirSync(contractsDir).filter((name) => name.endsWith('.ts')).sort();
    for (const filename of contractFiles) {
      const source = readFileSync(resolve(contractsDir, filename), 'utf8');
      assert.equal(
        source.includes('../kernel/'),
        false,
        `${filename} must not import kernel modules`,
      );
    }
  });
});
