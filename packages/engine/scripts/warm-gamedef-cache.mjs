import { readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  compileProductionSpec,
  compileTexasProductionSpec,
} from '../dist/test/helpers/production-spec-helpers.js';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const cacheDir = join(scriptDir, '..', 'dist', '.cache');

compileProductionSpec();
compileTexasProductionSpec();

const entries = readdirSync(cacheDir, { withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => {
    const path = join(cacheDir, entry.name);
    return {
      name: entry.name,
      size: statSync(path).size,
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

const warmedGameKeys = new Set(
  entries
    .filter((entry) => entry.name.endsWith('.gamedef.json') && entry.size > 0)
    .map((entry) => entry.name.split('.')[0]),
);

if (entries.length === 0) {
  throw new Error(`GameDef cache warm produced no files in ${cacheDir}`);
}

for (const requiredGameKey of ['fire-in-the-lake', 'texas-holdem']) {
  if (!warmedGameKeys.has(requiredGameKey)) {
    throw new Error(`GameDef cache warm did not produce a non-empty ${requiredGameKey} cache file in ${cacheDir}`);
  }
}

const totalBytes = entries.reduce((sum, entry) => sum + entry.size, 0);

console.log(`GameDef cache warmed: ${entries.length} files, ${totalBytes} bytes`);
for (const entry of entries) {
  console.log(`${entry.name}\t${entry.size} bytes`);
}
