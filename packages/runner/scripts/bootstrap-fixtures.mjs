import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  loadGameSpecBundleFromEntrypoint,
  runGameSpecStagesFromBundle,
} from '@ludoforge/engine/cnl';

const SCRIPT_DIR = fileURLToPath(new URL('.', import.meta.url));
const RUNNER_ROOT = resolve(SCRIPT_DIR, '..');
const REPO_ROOT = resolve(RUNNER_ROOT, '..', '..');
const BOOTSTRAP_TARGETS_PATH = resolve(RUNNER_ROOT, 'src', 'bootstrap', 'bootstrap-targets.json');

export function loadBootstrapFixtureTargets() {
  const targetsInput = JSON.parse(readFileSync(BOOTSTRAP_TARGETS_PATH, 'utf8'));
  const targets = assertBootstrapFixtureTargets(targetsInput);
  return targets
    .map((target) => ({
      id: target.id,
      label: target.sourceLabel,
      specPath: resolve(REPO_ROOT, target.specEntrypoint),
      gameDefOutputPath: resolve(RUNNER_ROOT, 'src', 'bootstrap', target.fixtureFile),
      metadataOutputPath: resolve(RUNNER_ROOT, 'src', 'bootstrap', deriveMetadataFileName(target.fixtureFile)),
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

    const specEntrypoint = requireNonEmptyString(
      target.specEntrypoint,
      `Bootstrap target specEntrypoint (id=${id})`,
    );

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
      specEntrypoint,
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
  const bundle = loadGameSpecBundleFromEntrypoint(target.specPath);
  const staged = runGameSpecStagesFromBundle(bundle);

  const allDiagnostics = [
    ...staged.parsed.diagnostics,
    ...staged.validation.diagnostics,
    ...(staged.compilation.result?.diagnostics ?? []),
  ];
  const errors = allDiagnostics.filter((d) => d.severity === 'error');

  if (errors.length > 0 || staged.compilation.result?.gameDef == null) {
    const preview = errors
      .slice(0, 10)
      .map((d) => `${d.code} at ${d.path}: ${d.message}`)
      .join('\n');
    throw new Error(
      `${target.label} bootstrap compilation failed with ${errors.length} error diagnostics.${preview.length > 0 ? `\n${preview}` : ''}`,
    );
  }

  return staged.compilation.result.gameDef;
}

export function renderFixtureGameDefContent(target) {
  return `${JSON.stringify(compileFixtureGameDef(target), null, 2)}\n`;
}

export function renderFixtureMetadataContent(target) {
  const gameDef = compileFixtureGameDef(target);
  return `${JSON.stringify(extractBootstrapGameMetadata(gameDef), null, 2)}\n`;
}

export function syncBootstrapFixtures(options = {}) {
  const mode = options.mode ?? 'generate';
  const targets = options.targets ?? loadBootstrapFixtureTargets();
  const renderGameDef = options.renderGameDef ?? renderFixtureGameDefContent;
  const renderMetadata = options.renderMetadata ?? renderFixtureMetadataContent;

  if (mode !== 'generate' && mode !== 'check') {
    throw new Error(`Unsupported mode: ${mode}`);
  }

  const mismatches = [];

  for (const target of targets) {
    const outputs = [
      {
        outputPath: target.gameDefOutputPath,
        rendered: renderGameDef(target),
        kind: 'game-def',
      },
      {
        outputPath: target.metadataOutputPath,
        rendered: renderMetadata(target),
        kind: 'metadata',
      },
    ];

    if (mode === 'generate') {
      for (const output of outputs) {
        mkdirSync(dirname(output.outputPath), { recursive: true });
        writeFileSync(output.outputPath, output.rendered, 'utf8');
      }
      continue;
    }

    for (const output of outputs) {
      let existing;
      try {
        existing = readFileSync(output.outputPath, 'utf8');
      } catch {
        mismatches.push({ id: target.id, outputPath: output.outputPath, reason: `missing ${output.kind} fixture file` });
        continue;
      }

      if (existing !== output.rendered) {
        mismatches.push({
          id: target.id,
          outputPath: output.outputPath,
          reason: `${output.kind} fixture content differs from generated output`,
        });
      }
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

function deriveMetadataFileName(fixtureFile) {
  if (!fixtureFile.endsWith('-game-def.json')) {
    throw new Error(`Bootstrap target fixtureFile must end with "-game-def.json" (fixtureFile=${fixtureFile})`);
  }
  return fixtureFile.replace(/-game-def\.json$/u, '-game-metadata.json');
}

function extractBootstrapGameMetadata(gameDef) {
  const metadata = gameDef?.metadata ?? {};
  const players = metadata?.players ?? {};
  return {
    name: typeof metadata.name === 'string' ? metadata.name : '',
    description: typeof metadata.description === 'string' ? metadata.description : '',
    playerMin: Number.isSafeInteger(players.min) && players.min >= 0 ? players.min : 0,
    playerMax: Number.isSafeInteger(players.max) && players.max >= 0 ? players.max : 0,
    factionIds: Array.isArray(gameDef?.seats)
      ? gameDef.seats
          .map((seat) => (seat !== null && typeof seat === 'object' && typeof seat.id === 'string' ? seat.id : null))
          .filter((id) => typeof id === 'string' && id.length > 0)
      : [],
  };
}
