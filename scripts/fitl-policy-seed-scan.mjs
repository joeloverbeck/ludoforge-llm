import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..');
const FITL_ENTRYPOINT = resolve(REPO_ROOT, 'data', 'games', 'fire-in-the-lake.game-spec.md');
const ENGINE_AGENTS_MODULE_URL = new URL('../packages/engine/dist/src/agents/index.js', import.meta.url);
const ENGINE_CNL_MODULE_URL = new URL('../packages/engine/dist/src/cnl/index.js', import.meta.url);
const ENGINE_KERNEL_MODULE_URL = new URL('../packages/engine/dist/src/kernel/index.js', import.meta.url);
const ENGINE_SIM_MODULE_URL = new URL('../packages/engine/dist/src/sim/index.js', import.meta.url);
const DEFAULT_MAX_TURNS = 5;
const DEFAULT_SEED_START = 1;
const DEFAULT_SEED_COUNT = 10;
const FAILURE_KINDS = ['exception', 'emergencyFallback'];

function fail(message) {
  throw new Error(message);
}

function parsePositiveInteger(value, flagName) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    fail(`${flagName} must be a positive safe integer, received ${String(value)}`);
  }
  return parsed;
}

function parseSeedList(value) {
  const seeds = value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => parsePositiveInteger(entry, '--seed-list'));

  if (seeds.length === 0) {
    fail('--seed-list must contain at least one seed');
  }

  return [...new Set(seeds)];
}

async function loadEngineModules() {
  try {
    const [agentsModule, cnlModule, kernelModule, simModule] = await Promise.all([
      import(ENGINE_AGENTS_MODULE_URL),
      import(ENGINE_CNL_MODULE_URL),
      import(ENGINE_KERNEL_MODULE_URL),
      import(ENGINE_SIM_MODULE_URL),
    ]);

    return {
      PolicyAgent: agentsModule.PolicyAgent,
      loadGameSpecBundleFromEntrypoint: cnlModule.loadGameSpecBundleFromEntrypoint,
      runGameSpecStagesFromBundle: cnlModule.runGameSpecStagesFromBundle,
      assertValidatedGameDef: kernelModule.assertValidatedGameDef,
      runGame: simModule.runGame,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fail(`Unable to load engine build artifacts. Run "pnpm -F @ludoforge/engine build" first.\n${message}`);
  }
}

export function parseCliArgs(argv = process.argv.slice(2)) {
  const options = {
    seedStart: DEFAULT_SEED_START,
    seedCount: DEFAULT_SEED_COUNT,
    seedList: null,
    maxTurns: DEFAULT_MAX_TURNS,
    outputDir: resolve(REPO_ROOT, 'artifacts', 'fitl-policy-seed-scan'),
    traceLevel: 'summary',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === '--seed-start') {
      if (next === undefined) fail('--seed-start requires a value');
      options.seedStart = parsePositiveInteger(next, '--seed-start');
      index += 1;
      continue;
    }
    if (arg === '--seed-count') {
      if (next === undefined) fail('--seed-count requires a value');
      options.seedCount = parsePositiveInteger(next, '--seed-count');
      index += 1;
      continue;
    }
    if (arg === '--seed-list') {
      if (next === undefined) fail('--seed-list requires a value');
      options.seedList = parseSeedList(next);
      index += 1;
      continue;
    }
    if (arg === '--max-turns') {
      if (next === undefined) fail('--max-turns requires a value');
      options.maxTurns = parsePositiveInteger(next, '--max-turns');
      index += 1;
      continue;
    }
    if (arg === '--output-dir') {
      if (next === undefined) fail('--output-dir requires a value');
      options.outputDir = resolve(next);
      index += 1;
      continue;
    }
    if (arg === '--trace-level') {
      if (next === undefined) fail('--trace-level requires a value');
      if (next !== 'summary' && next !== 'verbose') {
        fail(`--trace-level must be "summary" or "verbose", received ${next}`);
      }
      options.traceLevel = next;
      index += 1;
      continue;
    }

    fail(`Unknown argument: ${arg}`);
  }

  if (options.seedList !== null && (options.seedStart !== DEFAULT_SEED_START || options.seedCount !== DEFAULT_SEED_COUNT)) {
    fail('Use either --seed-list or the --seed-start/--seed-count range inputs, not both');
  }

  return {
    ...options,
    seeds: options.seedList ?? Array.from({ length: options.seedCount }, (_, index) => options.seedStart + index),
  };
}

export async function compileFitlProductionGameDef() {
  const {
    loadGameSpecBundleFromEntrypoint,
    runGameSpecStagesFromBundle,
    assertValidatedGameDef,
  } = await loadEngineModules();
  const bundle = loadGameSpecBundleFromEntrypoint(FITL_ENTRYPOINT);
  const staged = runGameSpecStagesFromBundle(bundle);
  const diagnostics = [
    ...staged.parsed.diagnostics,
    ...staged.validation.diagnostics,
    ...(staged.compilation.result?.diagnostics ?? []),
  ];
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === 'error');

  if (errors.length > 0 || staged.compilation.result?.gameDef == null) {
    const preview = errors
      .slice(0, 10)
      .map((diagnostic) => `${diagnostic.code} at ${diagnostic.path}: ${diagnostic.message}`)
      .join('\n');
    fail(
      `FITL production compilation failed with ${errors.length} error diagnostic(s).${preview.length > 0 ? `\n${preview}` : ''}`,
    );
  }

  return assertValidatedGameDef(staged.compilation.result.gameDef);
}

function createAgents(PolicyAgent, traceLevel, playerCount) {
  return Array.from({ length: playerCount }, () => new PolicyAgent({ traceLevel }));
}

function summarizeMove(moveLog, moveIndex) {
  return {
    moveIndex,
    player: moveLog.player,
    actionId: String(moveLog.move.actionId),
    params: moveLog.move.params,
    warningCount: moveLog.warnings.length,
  };
}

export function classifyTraceFailure(seed, trace) {
  const emergencyMoveIndex = trace.moves.findIndex(
    (moveLog) => moveLog.agentDecision?.kind === 'policy' && moveLog.agentDecision.emergencyFallback === true,
  );

  if (emergencyMoveIndex >= 0) {
    const moveLog = trace.moves[emergencyMoveIndex];
    return {
      seed,
      kind: 'emergencyFallback',
      message: `PolicyAgent emergency fallback on move ${emergencyMoveIndex}`,
      stopReason: trace.stopReason,
      turnsExecuted: trace.turnsCount,
      lastMoveSummary: moveLog === undefined ? null : summarizeMove(moveLog, emergencyMoveIndex),
      warningCount: trace.moves.reduce((total, entry) => total + entry.warnings.length, 0),
    };
  }

  return null;
}

function classifyExceptionFailure(seed, error) {
  return {
    seed,
    kind: 'exception',
    message: error instanceof Error ? error.message : String(error),
    stopReason: null,
    turnsExecuted: null,
    lastMoveSummary: null,
    warningCount: 0,
    errorName: error instanceof Error ? error.name : 'Error',
  };
}

export async function runFitlPolicySeedScan(config, dependencies = {}) {
  const compileGameDef = dependencies.compileGameDef ?? compileFitlProductionGameDef;
  const engineModules = dependencies.runSimulation !== undefined && dependencies.createAgents !== undefined
    ? null
    : await loadEngineModules();
  const runSimulation = dependencies.runSimulation ?? engineModules.runGame;
  const buildAgents = dependencies.createAgents ?? ((traceLevel, playerCount) =>
    createAgents(engineModules.PolicyAgent, traceLevel, playerCount));
  const now = dependencies.now ?? (() => Date.now());
  const gameDef = await compileGameDef();
  const scanStartedAt = now();
  const failures = [];
  const stopReasons = {
    terminal: 0,
    maxTurns: 0,
    noLegalMoves: 0,
  };
  let passedSeedCount = 0;
  let totalWarnings = 0;
  let seedsWithWarnings = 0;
  const warningCodeCounts = new Map();

  for (const seed of config.seeds) {
    const seedStartedAt = now();

    try {
      const trace = runSimulation(
        gameDef,
        seed,
        buildAgents(config.traceLevel, gameDef.seats.length),
        config.maxTurns,
        gameDef.seats.length,
      );
      stopReasons[trace.stopReason] += 1;

      const warningCount = trace.moves.reduce((total, entry) => total + entry.warnings.length, 0);
      totalWarnings += warningCount;
      if (warningCount > 0) {
        seedsWithWarnings += 1;
      }
      for (const move of trace.moves) {
        for (const warning of move.warnings) {
          warningCodeCounts.set(warning.code, (warningCodeCounts.get(warning.code) ?? 0) + 1);
        }
      }

      const failure = classifyTraceFailure(seed, trace);
      if (failure === null) {
        passedSeedCount += 1;
        continue;
      }

      failures.push({
        ...failure,
        durationMs: now() - seedStartedAt,
      });
    } catch (error) {
      failures.push({
        ...classifyExceptionFailure(seed, error),
        durationMs: now() - seedStartedAt,
      });
    }
  }

  const countsByFailureKind = Object.fromEntries(FAILURE_KINDS.map((kind) => [kind, 0]));
  for (const failure of failures) {
    countsByFailureKind[failure.kind] += 1;
  }

  return {
    summary: {
      gameDefId: gameDef.metadata.id,
      config: {
        seeds: config.seeds,
        maxTurns: config.maxTurns,
        traceLevel: config.traceLevel,
      },
      scannedSeedCount: config.seeds.length,
      passedSeedCount,
      failedSeedCount: failures.length,
      countsByFailureKind,
      stopReasons,
      warnings: {
        totalWarnings,
        seedsWithWarnings,
        countsByCode: Object.fromEntries([...warningCodeCounts.entries()].sort(([left], [right]) => left.localeCompare(right))),
      },
      timing: {
        durationMs: now() - scanStartedAt,
      },
    },
    failures,
  };
}

export function writeArtifacts(outputDir, report) {
  mkdirSync(outputDir, { recursive: true });
  const summaryPath = resolve(outputDir, 'summary.json');
  const failuresPath = resolve(outputDir, 'failures.ndjson');
  writeFileSync(summaryPath, `${JSON.stringify(report.summary, null, 2)}\n`, 'utf8');
  writeFileSync(
    failuresPath,
    report.failures.map((failure) => JSON.stringify(failure)).join('\n') + (report.failures.length > 0 ? '\n' : ''),
    'utf8',
  );
  return {
    summaryPath,
    failuresPath,
  };
}

export async function runCli(argv = process.argv.slice(2), dependencies = {}) {
  const config = parseCliArgs(argv);
  const report = await runFitlPolicySeedScan(config, dependencies);
  const artifactPaths = writeArtifacts(config.outputDir, report);

  console.log(`Scanned ${report.summary.scannedSeedCount} FITL seed(s).`);
  console.log(`Passed: ${report.summary.passedSeedCount}`);
  console.log(`Failed: ${report.summary.failedSeedCount}`);
  console.log(`summary.json: ${artifactPaths.summaryPath}`);
  console.log(`failures.ndjson: ${artifactPaths.failuresPath}`);

  if (report.summary.failedSeedCount > 0) {
    process.exitCode = 1;
  }

  return { config, report, artifactPaths };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
