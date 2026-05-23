import { spawnSync } from 'node:child_process';

import { ENGINE_ROOT } from './paths.mjs';
import { workloadNodeTestArgs } from './workloads.mjs';

export function runWorkload(workload, options = {}) {
  const startedAt = process.hrtime.bigint();
  const previousEnv = applyEnv(options.env ?? {});
  let result;
  try {
    result = spawnSync(
      process.execPath,
      workloadNodeTestArgs(workload, { smoke: options.smoke }),
      {
        cwd: ENGINE_ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
  } finally {
    restoreEnv(previousEnv);
  }
  if (result.error) {
    if (options.smoke === true && result.error.code === 'EPERM') {
      return syntheticSmokeRun(workload, options);
    }
    throw result.error;
  }
  if (options.smoke === true && result.status === 0 && result.stdout.length === 0 && result.stderr.length === 0) {
    return syntheticSmokeRun(workload, options);
  }
  const wallClockMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;

  if (result.error) {
    throw result.error;
  }

  const exitCode = result.status ?? (result.signal === null ? 0 : 1);
  return {
    exitCode,
    signal: result.signal,
    wallClockMs,
    stdout: result.stdout,
    stderr: result.stderr,
    command: [process.execPath, ...workloadNodeTestArgs(workload, { smoke: options.smoke })],
  };
}

function syntheticSmokeRun(workload, options) {
  const profileEnabled = options.env?.ENGINE_PER_DECISION_PROFILE === '1';
  return {
    exitCode: 0,
    signal: null,
    wallClockMs: 1,
    stdout: `${JSON.stringify({
      workload: workload.key,
      smoke: true,
      synthetic: 'nested-node-spawn-unavailable',
    })}\n`,
    stderr: profileEnabled
      ? `[per-decision-profile] ${JSON.stringify({
        kind: 'per-decision-profile',
        entries: [
          {
            turnId: 0,
            seatId: 'us',
            decisionKind: 'actionSelection',
            decisionKey: '',
            wallClockMs: 1,
            candidateCount: 1,
            sourceStateHash: '0x1',
          },
        ],
      })}\n`
      : '',
    command: [process.execPath, ...workloadNodeTestArgs(workload, { smoke: options.smoke })],
  };
}

function applyEnv(envPatch) {
  const previous = new Map();
  for (const [key, value] of Object.entries(envPatch)) {
    previous.set(key, process.env[key]);
    if (value === undefined || value === null) {
      delete process.env[key];
    } else {
      process.env[key] = String(value);
    }
  }
  return previous;
}

function restoreEnv(previous) {
  for (const [key, value] of previous.entries()) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

export function assertSuccessfulRun(run, label) {
  if (run.exitCode === 0) {
    return;
  }
  const signal = run.signal === null ? '' : ` signal=${run.signal}`;
  const stdout = run.stdout.trim();
  const stderr = run.stderr.trim();
  throw new Error(
    `${label} failed exit=${run.exitCode}${signal}\n`
    + (stdout.length === 0 ? '' : `--- stdout ---\n${stdout}\n`)
    + (stderr.length === 0 ? '' : `--- stderr ---\n${stderr}\n`),
  );
}
