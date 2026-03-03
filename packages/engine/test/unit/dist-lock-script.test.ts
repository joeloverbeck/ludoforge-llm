import * as assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { spawn } from 'node:child_process';

const engineRoot = resolve(import.meta.dirname, '..', '..', '..');
const lockScript = join(engineRoot, 'scripts/run-with-dist-lock.mjs');
const tmpDir = '/tmp/ludoforge-engine-tests';
const lockRoot = join(tmpDir, 'dist-locks');

const cleanupPaths: string[] = [];

const runWithLock = (command: string, lockName: string): Promise<void> =>
  runWithLockResult(command, lockName).then((result) => {
    if (result.code !== 0) {
      throw new Error(`run-with-dist-lock exited with code ${result.code ?? 'null'}: ${result.stderr}`);
    }
  });

const runWithLockResult = (
  command: string,
  lockName: string,
  extraEnv: Readonly<Record<string, string>> = {},
): Promise<{ readonly code: number | null; readonly stderr: string }> =>
  new Promise((resolveRun, rejectRun) => {
    let stderr = '';
    const child = spawn(process.execPath, [lockScript, command], {
      cwd: engineRoot,
      stdio: ['ignore', 'ignore', 'pipe'],
      env: {
        ...process.env,
        ENGINE_DIST_LOCK_NAME: lockName,
        ENGINE_DIST_LOCK_DIR: lockRoot,
        ...extraEnv,
      },
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', rejectRun);
    child.on('exit', (code) => {
      resolveRun({ code, stderr });
    });
  });

describe('run-with-dist-lock script', () => {
  afterEach(() => {
    for (const path of cleanupPaths.splice(0)) {
      rmSync(path, { recursive: true, force: true });
    }
  });

  it('serializes concurrent commands touching dist artifacts', async () => {
    mkdirSync(tmpDir, { recursive: true });
    const outputFile = join(tmpDir, `dist-lock-order-${randomUUID()}.txt`);
    const lockName = `.dist-lock-test-${randomUUID()}`;
    const lockPath = join(lockRoot, lockName);
    cleanupPaths.push(outputFile);
    cleanupPaths.push(lockPath);

    const firstCommand = `node -e "const fs=require('node:fs'); setTimeout(() => fs.appendFileSync('${outputFile}', 'first\\\\n'), 350); setTimeout(() => process.exit(0), 450);"`;
    const secondCommand = `node -e "const fs=require('node:fs'); fs.appendFileSync('${outputFile}', 'second\\\\n');"`;

    const first = runWithLock(firstCommand, lockName);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
    const second = runWithLock(secondCommand, lockName);

    await Promise.all([first, second]);

    assert.equal(readFileSync(outputFile, 'utf8'), 'first\nsecond\n');
  });

  it('reclaims stale lock metadata when pid points to an unrelated alive process', async () => {
    mkdirSync(tmpDir, { recursive: true });
    const outputFile = join(tmpDir, `dist-lock-stale-reclaim-${randomUUID()}.txt`);
    const lockName = `.dist-lock-test-${randomUUID()}`;
    const lockPath = join(lockRoot, lockName);
    cleanupPaths.push(outputFile);
    cleanupPaths.push(lockPath);

    mkdirSync(lockPath, { recursive: true });
    writeFileSync(
      join(lockPath, 'owner.json'),
      JSON.stringify({
        pid: process.pid,
        command: 'not run-with-dist-lock',
        createdAt: Date.now(),
      }),
      'utf8',
    );

    await runWithLock(`node -e "const fs=require('node:fs'); fs.writeFileSync('${outputFile}', 'ok\\n');"`, lockName);

    assert.equal(readFileSync(outputFile, 'utf8'), 'ok\n');
  });

  it('fails with a clear timeout when lock cannot be acquired in time', async () => {
    const lockName = `.dist-lock-test-${randomUUID()}`;
    const lockPath = join(lockRoot, lockName);
    cleanupPaths.push(lockPath);

    const holderCommand = 'node -e "setTimeout(() => process.exit(0), 400);"';
    const holder = runWithLock(holderCommand, lockName);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));

    const waitingResult = await runWithLockResult('node -e "process.exit(0)"', lockName, {
      ENGINE_DIST_LOCK_MAX_WAIT_MS: '100',
    });

    await holder;

    assert.equal(waitingResult.code, 1);
    assert.match(waitingResult.stderr, /Timed out waiting for dist lock/u);
  });
});
