import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SCHEMA_ARTIFACT_FILENAMES, buildSchemaArtifactMap } from '../dist/src/kernel/schema-artifacts.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const mode = process.argv.includes('--check') ? 'check' : 'write';
const generated = buildSchemaArtifactMap();

if (mode === 'check') {
  const outOfSync = [];
  for (const filename of SCHEMA_ARTIFACT_FILENAMES) {
    const artifactPath = path.join(rootDir, 'schemas', filename);
    const existing = readFileSync(artifactPath, 'utf8');
    const expected = `${JSON.stringify(generated[filename], null, 2)}\n`;
    if (existing !== expected) {
      outOfSync.push(filename);
    }
  }

  if (outOfSync.length > 0) {
    console.error(`Schema artifact(s) out of sync: ${outOfSync.join(', ')}`);
    console.error('Run: pnpm -F @ludoforge/engine run schema:artifacts');
    process.exit(1);
  }
  process.exit(0);
}

for (const filename of SCHEMA_ARTIFACT_FILENAMES) {
  const artifactPath = path.join(rootDir, 'schemas', filename);
  const serialized = `${JSON.stringify(generated[filename], null, 2)}\n`;
  writeFileSync(artifactPath, serialized, 'utf8');
  console.log(`Wrote ${artifactPath}`);
}
