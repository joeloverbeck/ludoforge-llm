import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = fileURLToPath(new URL('.', import.meta.url));
const runnerRoot = resolve(scriptDir, '..');
const assetsDir = join(runnerRoot, 'dist', 'assets');
const nodeImportPattern = /(["'`])node:[A-Za-z0-9_/-]+\1/g;
const viteBrowserExternalPattern = /__vite-browser-external/g;

let assetNames;

try {
  assetNames = readdirSync(assetsDir);
} catch (error) {
  console.error(
    `Runner browser-bundle smoke check could not read ${assetsDir}. Run the runner build before this check.`,
  );
  throw error;
}

const scriptAssetNames = assetNames.filter((name) => name.endsWith('.js')).sort();

if (scriptAssetNames.length === 0) {
  console.error(`Runner browser-bundle smoke check found no JavaScript assets in ${assetsDir}.`);
  process.exitCode = 1;
} else {
  const violations = [];

  for (const assetName of scriptAssetNames) {
    const assetPath = join(assetsDir, assetName);
    const source = readFileSync(assetPath, 'utf8');
    const matches = Array.from(
      new Set([
        ...(source.match(nodeImportPattern) ?? []),
        ...(assetName.includes('__vite-browser-external') ? ['__vite-browser-external asset'] : []),
        ...(source.match(viteBrowserExternalPattern) ?? []),
      ]),
    ).sort();

    for (const match of matches) {
      violations.push(`${assetPath}: ${match}`);
    }
  }

  if (violations.length > 0) {
    console.error('Runner browser bundle contains node:* references:');
    for (const violation of violations) {
      console.error(`  ${violation}`);
    }
    process.exitCode = 1;
  } else {
    console.log(`Runner browser-bundle smoke check passed (${scriptAssetNames.length} JS assets scanned).`);
  }
}
