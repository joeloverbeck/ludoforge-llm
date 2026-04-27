import { spawnSync } from 'node:child_process';
import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  ALL_DETERMINISM_TESTS,
  ALL_POLICY_PROFILE_QUALITY_TESTS,
  listE2eTestsForLane,
  listIntegrationTestsForLane,
  toDistTestPath,
} from './test-lane-manifest.mjs';

const DEFAULT_DETERMINISM_TIMEOUT_MS = 20 * 60 * 1000;
const DEFAULT_HEAVY_INTEGRATION_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_FITL_RULES_TIMEOUT_MS = 5 * 60 * 1000;
const KILL_SIGNAL = 'SIGTERM';
const TEST_CLASS_REPORTER_ARGS = ['--test-reporter=./scripts/test-class-reporter.mjs', '--test-reporter-destination=stdout'];
const TEST_PROGRESS_LANE_ENV = 'ENGINE_TEST_PROGRESS_LANE';

const laneConfigs = {
  default: {
    execution: 'batched',
    patterns: [
      'dist/test/unit/**/*.test.js',
      ...listIntegrationTestsForLane('integration:core').map(toDistTestPath),
    ],
  },
  e2e: { execution: 'batched', patterns: listE2eTestsForLane('e2e').map(toDistTestPath) },
  'e2e:slow': { execution: 'batched', patterns: listE2eTestsForLane('e2e:slow').map(toDistTestPath) },
  'e2e:all': { execution: 'batched', patterns: listE2eTestsForLane('e2e:all').map(toDistTestPath) },
  integration: {
    execution: 'sequential',
    patterns: listIntegrationTestsForLane('integration').map(toDistTestPath),
    timeoutMs: DEFAULT_HEAVY_INTEGRATION_TIMEOUT_MS,
  },
  'integration:core': { execution: 'batched', patterns: listIntegrationTestsForLane('integration:core').map(toDistTestPath) },
  'integration:game-packages': {
    execution: 'sequential',
    patterns: listIntegrationTestsForLane('integration:game-packages').map(toDistTestPath),
    timeoutMs: DEFAULT_HEAVY_INTEGRATION_TIMEOUT_MS,
  },
  'integration:fitl-events': {
    execution: 'sequential',
    patterns: listIntegrationTestsForLane('integration:fitl-events').map(toDistTestPath),
    timeoutMs: DEFAULT_HEAVY_INTEGRATION_TIMEOUT_MS,
  },
  'integration:fitl-events-shard-a': {
    execution: 'sequential',
    patterns: listIntegrationTestsForLane('integration:fitl-events-shard-a').map(toDistTestPath),
    timeoutMs: DEFAULT_HEAVY_INTEGRATION_TIMEOUT_MS,
  },
  'integration:fitl-events-shard-b': {
    execution: 'sequential',
    patterns: listIntegrationTestsForLane('integration:fitl-events-shard-b').map(toDistTestPath),
    timeoutMs: DEFAULT_HEAVY_INTEGRATION_TIMEOUT_MS,
  },
  'integration:fitl-events-shard-c': {
    execution: 'sequential',
    patterns: listIntegrationTestsForLane('integration:fitl-events-shard-c').map(toDistTestPath),
    timeoutMs: DEFAULT_HEAVY_INTEGRATION_TIMEOUT_MS,
  },
  'integration:fitl-rules': {
    execution: 'sequential',
    patterns: listIntegrationTestsForLane('integration:fitl-rules').map(toDistTestPath),
    timeoutMs: DEFAULT_FITL_RULES_TIMEOUT_MS,
  },
  'integration:texas-cross-game': {
    execution: 'batched',
    patterns: listIntegrationTestsForLane('integration:texas-cross-game').map(toDistTestPath),
  },
  'integration:slow-parity': {
    execution: 'sequential',
    patterns: listIntegrationTestsForLane('integration:slow-parity').map(toDistTestPath),
    timeoutMs: DEFAULT_HEAVY_INTEGRATION_TIMEOUT_MS,
  },
  'integration:slow-parity-shard-a': {
    execution: 'sequential',
    patterns: listIntegrationTestsForLane('integration:slow-parity-shard-a').map(toDistTestPath),
    timeoutMs: DEFAULT_HEAVY_INTEGRATION_TIMEOUT_MS,
  },
  'integration:slow-parity-shard-b': {
    execution: 'sequential',
    patterns: listIntegrationTestsForLane('integration:slow-parity-shard-b').map(toDistTestPath),
    timeoutMs: DEFAULT_HEAVY_INTEGRATION_TIMEOUT_MS,
  },
  'integration:slow-parity-shard-c': {
    execution: 'sequential',
    patterns: listIntegrationTestsForLane('integration:slow-parity-shard-c').map(toDistTestPath),
    timeoutMs: DEFAULT_HEAVY_INTEGRATION_TIMEOUT_MS,
  },
  determinism: {
    execution: 'sequential',
    patterns: ALL_DETERMINISM_TESTS.map(toDistTestPath),
    timeoutMs: DEFAULT_DETERMINISM_TIMEOUT_MS,
  },
  'policy-profile-quality': {
    execution: 'batched',
    patterns: ALL_POLICY_PROFILE_QUALITY_TESTS.map(toDistTestPath),
  },
};

const normalizeRequestedPattern = (pattern) => {
  if (pattern === '--') {
    return null;
  }

  if (pattern.endsWith('.test.ts')) {
    const jsFileName = basename(pattern).replace(/\.ts$/, '.js');
    return `dist/test/**/${jsFileName}`;
  }

  if (pattern.startsWith('test/') && pattern.endsWith('.test.js')) {
    return `dist/${pattern}`;
  }

  return pattern;
};

function parseArgs(argv) {
  let lane = 'default';
  const rawPatterns = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--lane') {
      lane = argv[index + 1] ?? lane;
      index += 1;
      continue;
    }
    if (arg.startsWith('--lane=')) {
      lane = arg.slice('--lane='.length);
      continue;
    }
    rawPatterns.push(arg);
  }

  return { lane, rawPatterns };
}

const toPositiveInteger = (value) => {
  if (value === undefined) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const formatDuration = (durationMs) => {
  const totalSeconds = Math.ceil(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes === 0 ? `${seconds}s` : `${minutes}m ${seconds}s`;
};

export function buildExecutionPlan(argv, env = process.env) {
  const { lane, rawPatterns } = parseArgs(argv);
  const requestedPatterns = rawPatterns
    .map(normalizeRequestedPattern)
    .filter((pattern) => pattern !== null);
  const laneConfig = laneConfigs[lane];

  if (!laneConfig) {
    throw new Error(`Unknown test lane: ${lane}`);
  }

  if (requestedPatterns.length > 0) {
    return {
      lane,
      execution: 'batched',
      patterns: requestedPatterns,
    };
  }

  return {
    lane,
    execution: laneConfig.execution,
    patterns: laneConfig.patterns,
    ...(laneConfig.timeoutMs === undefined
      ? {}
      : {
          timeoutMs: lane === 'determinism'
            ? toPositiveInteger(env.ENGINE_DETERMINISM_TEST_TIMEOUT_MS) ?? laneConfig.timeoutMs
            : lane === 'integration:fitl-rules'
              ? toPositiveInteger(env.ENGINE_FITL_RULES_TEST_TIMEOUT_MS) ?? laneConfig.timeoutMs
              : laneConfig.timeoutMs,
        }),
  };
}

function logLine(stream, line) {
  stream.write(`${line}\n`);
}

function buildChildEnv(env, lane) {
  return {
    ...env,
    [TEST_PROGRESS_LANE_ENV]: lane,
  };
}

export function runExecutionPlan(plan, options = {}) {
  const spawnSyncImpl = options.spawnSyncImpl ?? spawnSync;
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const execPath = options.execPath ?? process.execPath;
  const env = options.env ?? process.env;
  const now = options.now ?? (() => Date.now());

  if (plan.execution === 'batched') {
    const childEnv = buildChildEnv(env, plan.lane);
    const result = spawnSyncImpl(execPath, ['--test', ...TEST_CLASS_REPORTER_ARGS, ...plan.patterns], {
      stdio: 'inherit',
      env: childEnv,
    });
    if (result.error) {
      throw result.error;
    }
    return result.status ?? 1;
  }

  const timeoutMs = plan.timeoutMs;
  if (timeoutMs === undefined) {
    throw new Error(`Sequential lane ${plan.lane} requires a timeout.`);
  }

  let completed = 0;
  for (const pattern of plan.patterns) {
    const startedAt = now();
    const childEnv = buildChildEnv(env, plan.lane);
    logLine(stdout, `[run-tests] [${plan.lane}] start ${pattern}`);
    const result = spawnSyncImpl(execPath, ['--test', ...TEST_CLASS_REPORTER_ARGS, pattern], {
      stdio: 'inherit',
      env: childEnv,
      timeout: timeoutMs,
      killSignal: KILL_SIGNAL,
    });
    const duration = formatDuration(now() - startedAt);

    if (result.error?.code === 'ETIMEDOUT') {
      logLine(stderr, `[run-tests] [${plan.lane}] timeout ${pattern} after ${duration} (limit ${formatDuration(timeoutMs)})`);
      return 1;
    }

    if (result.error) {
      throw result.error;
    }

    const exitCode = result.status ?? (result.signal === null ? 0 : 1);
    if (exitCode !== 0) {
      const signalSuffix = result.signal === null ? '' : ` signal=${result.signal}`;
      logLine(stderr, `[run-tests] [${plan.lane}] failed ${pattern} exit=${exitCode}${signalSuffix} after ${duration}`);
      return exitCode;
    }

    completed += 1;
    logLine(stdout, `[run-tests] [${plan.lane}] done ${pattern} (${duration})`);
  }

  logLine(stdout, `[run-tests] [${plan.lane}] summary ${completed}/${plan.patterns.length} files passed`);
  return 0;
}

export function main(argv = process.argv.slice(2), env = process.env) {
  const plan = buildExecutionPlan(argv, env);
  return runExecutionPlan(plan, { env });
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
