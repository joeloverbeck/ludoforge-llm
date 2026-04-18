import * as assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, it } from 'node:test';

type ExecutionPlan = {
  readonly lane: string;
  readonly execution: 'batched' | 'sequential';
  readonly patterns: readonly string[];
  readonly timeoutMs?: number;
};

type SpawnResult = {
  readonly status: number | null;
  readonly signal: string | null;
  readonly error?: NodeJS.ErrnoException;
};

type RunTestsModule = {
  readonly buildExecutionPlan: (argv: readonly string[], env?: NodeJS.ProcessEnv) => ExecutionPlan;
  readonly runExecutionPlan: (
    plan: ExecutionPlan,
    options?: {
      readonly spawnSyncImpl?: (command: string, args: readonly string[], options: Record<string, unknown>) => SpawnResult;
      readonly stdout?: { write: (chunk: string) => void };
      readonly stderr?: { write: (chunk: string) => void };
      readonly execPath?: string;
      readonly env?: NodeJS.ProcessEnv;
      readonly now?: () => number;
    },
  ) => number;
};

const thisDir = dirname(fileURLToPath(import.meta.url));
const engineRoot = resolve(thisDir, '..', '..', '..');
const runTestsPath = resolve(engineRoot, 'scripts/run-tests.mjs');

const loadRunTestsModule = async (): Promise<RunTestsModule> =>
  import(pathToFileURL(runTestsPath).href) as Promise<RunTestsModule>;

const createLogSink = () => {
  let output = '';
  return {
    stream: {
      write(chunk: string) {
        output += chunk;
      },
    },
    read() {
      return output;
    },
  };
};

describe('run-tests script', () => {
  it('uses sequential execution with a lane-local timeout for determinism lane defaults', async () => {
    const { buildExecutionPlan } = await loadRunTestsModule();

    const plan = buildExecutionPlan(['--lane', 'determinism'], {});

    assert.equal(plan.lane, 'determinism');
    assert.equal(plan.execution, 'sequential');
    assert.equal(plan.patterns.length > 0, true);
    assert.equal(plan.timeoutMs !== undefined && plan.timeoutMs > 0, true);
  });

  it('runs batched lanes with the test-class reporter attached', async () => {
    const { runExecutionPlan } = await loadRunTestsModule();
    const spawnCalls: Array<{ readonly command: string; readonly args: readonly string[]; readonly timeout: unknown }> = [];

    const exitCode = runExecutionPlan(
      {
        lane: 'default',
        execution: 'batched',
        patterns: ['dist/test/unit/a.test.js', 'dist/test/integration/b.test.js'],
      },
      {
        execPath: '/fake/node',
        spawnSyncImpl: (command, args, options) => {
          spawnCalls.push({ command, args, timeout: options.timeout });
          return { status: 0, signal: null };
        },
      },
    );

    assert.equal(exitCode, 0);
    assert.deepEqual(spawnCalls, [
      {
        command: '/fake/node',
        args: [
          '--test',
          '--test-reporter=./scripts/test-class-reporter.mjs',
          '--test-reporter-destination=stdout',
          'dist/test/unit/a.test.js',
          'dist/test/integration/b.test.js',
        ],
        timeout: undefined,
      },
    ]);
  });

  it('runs determinism files sequentially and reports start/end markers', async () => {
    const { runExecutionPlan } = await loadRunTestsModule();
    const stdout = createLogSink();
    const stderr = createLogSink();
    const spawnCalls: Array<{ readonly command: string; readonly args: readonly string[]; readonly timeout: unknown }> = [];
    const durations = [0, 5_000, 5_000, 9_000, 9_000, 12_000];
    let durationIndex = 0;

    const exitCode = runExecutionPlan(
      {
        lane: 'determinism',
        execution: 'sequential',
        patterns: ['dist/test/determinism/a.test.js', 'dist/test/determinism/b.test.js'],
        timeoutMs: 30_000,
      },
      {
        execPath: '/fake/node',
        stdout: stdout.stream,
        stderr: stderr.stream,
        now: () => {
          const value = durations[durationIndex];
          durationIndex += 1;
          return value ?? durations.at(-1) ?? 0;
        },
        spawnSyncImpl: (command, args, options) => {
          spawnCalls.push({ command, args, timeout: options.timeout });
          return { status: 0, signal: null };
        },
      },
    );

    assert.equal(exitCode, 0);
    assert.deepEqual(spawnCalls, [
      {
        command: '/fake/node',
        args: [
          '--test',
          '--test-reporter=./scripts/test-class-reporter.mjs',
          '--test-reporter-destination=stdout',
          'dist/test/determinism/a.test.js',
        ],
        timeout: 30_000,
      },
      {
        command: '/fake/node',
        args: [
          '--test',
          '--test-reporter=./scripts/test-class-reporter.mjs',
          '--test-reporter-destination=stdout',
          'dist/test/determinism/b.test.js',
        ],
        timeout: 30_000,
      },
    ]);
    assert.match(stdout.read(), /\[run-tests\] \[determinism\] start dist\/test\/determinism\/a\.test\.js/u);
    assert.match(stdout.read(), /\[run-tests\] \[determinism\] done dist\/test\/determinism\/a\.test\.js \(5s\)/u);
    assert.match(stdout.read(), /\[run-tests\] \[determinism\] done dist\/test\/determinism\/b\.test\.js \(4s\)/u);
    assert.match(stdout.read(), /\[run-tests\] \[determinism\] summary 2\/2 files passed/u);
    assert.equal(stderr.read(), '');
  });

  it('fails determinism lane loudly when a file times out', async () => {
    const { runExecutionPlan } = await loadRunTestsModule();
    const stdout = createLogSink();
    const stderr = createLogSink();
    const timeoutError = Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' });
    const timestamps = [0, 65_000];

    const exitCode = runExecutionPlan(
      {
        lane: 'determinism',
        execution: 'sequential',
        patterns: ['dist/test/determinism/a.test.js'],
        timeoutMs: 60_000,
      },
      {
        stdout: stdout.stream,
        stderr: stderr.stream,
        now: () => timestamps.shift() ?? 65_000,
        spawnSyncImpl: () => ({
          status: null,
          signal: 'SIGTERM',
          error: timeoutError,
        }),
      },
    );

    assert.equal(exitCode, 1);
    assert.match(stdout.read(), /\[run-tests\] \[determinism\] start dist\/test\/determinism\/a\.test\.js/u);
    assert.match(
      stderr.read(),
      /\[run-tests\] \[determinism\] timeout dist\/test\/determinism\/a\.test\.js after 1m 5s \(limit 1m 0s\)/u,
    );
  });
});
