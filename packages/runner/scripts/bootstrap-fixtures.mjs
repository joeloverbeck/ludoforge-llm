import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
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
const BOOTSTRAP_TARGETS_PATH = resolve(RUNNER_ROOT, 'src', 'bootstrap', 'bootstrap-targets.json');

export function loadBootstrapFixtureTargets() {
  const targetsInput = JSON.parse(readFileSync(BOOTSTRAP_TARGETS_PATH, 'utf8'));
  const targets = assertBootstrapFixtureTargets(targetsInput);
  return targets
    .filter((target) => target.generatedFromSpecPath !== undefined)
    .map((target) => ({
      id: target.id,
      label: target.sourceLabel,
      specPath: resolve(REPO_ROOT, target.generatedFromSpecPath),
      outputPath: resolve(RUNNER_ROOT, 'src', 'bootstrap', target.fixtureFile),
    }));
}

function assertBootstrapFixtureTargets(targetsInput) {
  if (!Array.isArray(targetsInput) || targetsInput.length === 0) {
    throw new Error('Bootstrap targets manifest must be a non-empty array');
  }

  const ids = new Set();
  const fixtureFiles = new Set();

  return targetsInput.map((target, index) => {
    if (target === null || typeof target !== 'object') {
      throw new Error(`Bootstrap target at index ${index} must be an object`);
    }

    const id = requireNonEmptyString(target.id, `Bootstrap target id (index=${index})`);
    const sourceLabel = requireNonEmptyString(target.sourceLabel, `Bootstrap target sourceLabel (id=${id})`);
    const fixtureFile = requireNonEmptyString(target.fixtureFile, `Bootstrap target fixtureFile (id=${id})`);

    const generatedFromSpecPath = target.generatedFromSpecPath === undefined
      ? undefined
      : requireNonEmptyString(target.generatedFromSpecPath, `Bootstrap target generatedFromSpecPath (id=${id})`);

    if (ids.has(id)) {
      throw new Error(`Bootstrap target id must be unique (id=${id})`);
    }
    if (fixtureFiles.has(fixtureFile)) {
      throw new Error(`Bootstrap target fixtureFile must be unique (fixtureFile=${fixtureFile})`);
    }

    ids.add(id);
    fixtureFiles.add(fixtureFile);

    return {
      id,
      sourceLabel,
      fixtureFile,
      generatedFromSpecPath,
    };
  });
}

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function compileFixtureGameDef(target) {
  const loaded = loadGameSpecSource(target.specPath);
  const parsed = parseGameSpec(loaded.markdown, { sourceId: target.specPath });
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
      `${target.label} bootstrap compilation failed with ${errors.length} error diagnostics.${preview.length > 0 ? `\n${preview}` : ''}`,
    );
  }

  return compiled.gameDef;
}

export function renderFixtureContent(target) {
  return `${JSON.stringify(compileFixtureGameDef(target), null, 2)}\n`;
}

export function syncBootstrapFixtures(options = {}) {
  const mode = options.mode ?? 'generate';
  const targets = options.targets ?? loadBootstrapFixtureTargets();
  const render = options.render ?? renderFixtureContent;

  if (mode !== 'generate' && mode !== 'check') {
    throw new Error(`Unsupported mode: ${mode}`);
  }

  const mismatches = [];

  for (const target of targets) {
    const rendered = render(target);

    if (mode === 'generate') {
      mkdirSync(dirname(target.outputPath), { recursive: true });
      writeFileSync(target.outputPath, rendered, 'utf8');
      continue;
    }

    let existing = null;
    try {
      existing = readFileSync(target.outputPath, 'utf8');
    } catch {
      mismatches.push({ id: target.id, outputPath: target.outputPath, reason: 'missing fixture file' });
      continue;
    }

    if (existing !== rendered) {
      mismatches.push({ id: target.id, outputPath: target.outputPath, reason: 'fixture content differs from generated output' });
    }
  }

  return { mode, targetCount: targets.length, mismatches };
}

function printSummary(result) {
  if (result.mode === 'generate') {
    console.log(`Generated ${result.targetCount} bootstrap fixture(s).`);
    return;
  }

  if (result.mismatches.length === 0) {
    console.log(`Bootstrap fixtures are current (${result.targetCount} target(s)).`);
    return;
  }

  console.error('Bootstrap fixture drift detected:');
  for (const mismatch of result.mismatches) {
    console.error(`- ${mismatch.id}: ${mismatch.reason} (${mismatch.outputPath})`);
  }
}

export function runCli(argv = process.argv.slice(2)) {
  const [modeArg = 'generate'] = argv;

  if (modeArg !== 'generate' && modeArg !== 'check') {
    throw new Error('Usage: node scripts/bootstrap-fixtures.mjs <generate|check>');
  }

  const result = syncBootstrapFixtures({ mode: modeArg });
  printSummary(result);

  if (modeArg === 'check' && result.mismatches.length > 0) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli();
}
