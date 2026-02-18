import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  compileGameSpecToGameDef,
  loadGameSpecSource,
  parseGameSpec,
  validateGameSpec,
} from '@ludoforge/engine/cnl';

const SCRIPT_DIR = fileURLToPath(new URL('.', import.meta.url));
const RUNNER_ROOT = resolve(SCRIPT_DIR, '..');
const REPO_ROOT = resolve(RUNNER_ROOT, '..', '..');
const TEXAS_SPEC_PATH = resolve(REPO_ROOT, 'data', 'games', 'texas-holdem');
const OUTPUT_PATH = resolve(RUNNER_ROOT, 'src', 'bootstrap', 'texas-game-def.json');

const loaded = loadGameSpecSource(TEXAS_SPEC_PATH);
const parsed = parseGameSpec(loaded.markdown, { sourceId: TEXAS_SPEC_PATH });
const validatorDiagnostics = validateGameSpec(parsed.doc, { sourceMap: parsed.sourceMap });
const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });

const diagnostics = [...parsed.diagnostics, ...validatorDiagnostics, ...compiled.diagnostics];
const errors = diagnostics.filter((diagnostic) => diagnostic.severity === 'error');

if (errors.length > 0 || compiled.gameDef === null) {
  const preview = errors
    .slice(0, 10)
    .map((diagnostic) => `${diagnostic.code} at ${diagnostic.path}: ${diagnostic.message}`)
    .join('\n');
  throw new Error(
    `Texas Hold'em bootstrap compilation failed with ${errors.length} error diagnostics.${preview.length > 0 ? `\n${preview}` : ''}`,
  );
}

writeFileSync(OUTPUT_PATH, `${JSON.stringify(compiled.gameDef, null, 2)}\n`, 'utf8');
console.log(`Wrote Texas Hold'em bootstrap GameDef to ${OUTPUT_PATH}`);
