import { spawnSync } from 'node:child_process';

import { ALL_POLICY_PROFILE_QUALITY_TESTS, toDistTestPath } from './test-lane-manifest.mjs';

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const KILL_SIGNAL = 'SIGTERM';
const TEST_CLASS_REPORTER_ARGS = ['--test-reporter=./scripts/test-class-reporter.mjs', '--test-reporter-destination=stdout'];
const TEST_PROGRESS_LANE_ENV = 'ENGINE_TEST_PROGRESS_LANE';

const toPositiveInteger = (value) => {
  if (value === undefined) {
    return null;
  }
  const parsed = Number.parseInt(String(value), 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const formatDuration = (durationMs) => {
  const totalSeconds = Math.ceil(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes === 0 ? `${seconds}s` : `${minutes}m ${seconds}s`;
};

const logLine = (stream, line) => {
  stream.write(`${line}\n`);
};

const timeoutMs =
  toPositiveInteger(process.env.ENGINE_POLICY_PROFILE_QUALITY_TEST_TIMEOUT_MS) ?? DEFAULT_TIMEOUT_MS;

let completed = 0;
for (const pattern of ALL_POLICY_PROFILE_QUALITY_TESTS.map(toDistTestPath)) {
  const startedAt = Date.now();
  logLine(process.stdout, `[run-policy-profile-quality] start ${pattern}`);
  const result = spawnSync(
    process.execPath,
    ['--test', ...TEST_CLASS_REPORTER_ARGS, pattern],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        [TEST_PROGRESS_LANE_ENV]: 'policy-profile-quality',
      },
      timeout: timeoutMs,
      killSignal: KILL_SIGNAL,
    },
  );
  const duration = formatDuration(Date.now() - startedAt);

  if (result.error?.code === 'ETIMEDOUT') {
    logLine(
      process.stderr,
      `[run-policy-profile-quality] timeout ${pattern} after ${duration} (limit ${formatDuration(timeoutMs)})`,
    );
    process.exit(1);
  }

  if (result.error) {
    throw result.error;
  }

  const exitCode = result.status ?? (result.signal === null ? 0 : 1);
  if (exitCode !== 0) {
    const signalSuffix = result.signal === null ? '' : ` signal=${result.signal}`;
    logLine(
      process.stderr,
      `[run-policy-profile-quality] failed ${pattern} exit=${exitCode}${signalSuffix} after ${duration}`,
    );
    process.exit(exitCode);
  }

  completed += 1;
  logLine(process.stdout, `[run-policy-profile-quality] done ${pattern} (${duration})`);
}

logLine(
  process.stdout,
  `[run-policy-profile-quality] summary ${completed}/${ALL_POLICY_PROFILE_QUALITY_TESTS.length} files passed`,
);
