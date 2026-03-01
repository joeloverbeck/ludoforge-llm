import * as assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const thisDir = dirname(fileURLToPath(import.meta.url));
const engineSrcDir = resolve(thisDir, '../../../../src');
const contractsDir = resolve(engineSrcDir, 'contracts');
const contractsIndexPath = resolve(contractsDir, 'index.ts');

function collectTsFiles(dirPath: string): readonly string[] {
  const entries = readdirSync(dirPath, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const absolutePath = resolve(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTsFiles(absolutePath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(absolutePath);
    }
  }
  return files;
}

describe('contracts public surface import policy', () => {
  it('requires kernel and CNL modules to import shared contracts from ../contracts/index.js', () => {
    const consumerRoots = [resolve(engineSrcDir, 'cnl'), resolve(engineSrcDir, 'kernel')];
    const contractImportPattern = /from\s+['"](\.\.\/contracts\/[a-z0-9-]+\.js)['"]/g;

    for (const consumerRoot of consumerRoots) {
      const files = collectTsFiles(consumerRoot);
      for (const filePath of files) {
        const source = readFileSync(filePath, 'utf8');
        for (const match of source.matchAll(contractImportPattern)) {
          const importPath = match[1] ?? '';
          assert.equal(
            importPath,
            '../contracts/index.js',
            `${filePath} must import contracts via ../contracts/index.js (found ${importPath})`,
          );
        }
      }
    }
  });

  it('requires contracts/index.ts to re-export all contract modules', () => {
    const indexSource = readFileSync(contractsIndexPath, 'utf8');
    const expectedModules = readdirSync(contractsDir)
      .filter((name) => name.endsWith('.ts') && name !== 'index.ts')
      .map((name) => name.replace(/\.ts$/, ''))
      .sort();

    for (const moduleName of expectedModules) {
      assert.equal(
        indexSource.includes(`'./${moduleName}.js'`) || indexSource.includes(`"./${moduleName}.js"`),
        true,
        `contracts/index.ts must re-export ./${moduleName}.js`,
      );
    }
  });
});
