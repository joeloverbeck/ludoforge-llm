import * as assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { spawn } from 'node:child_process';

const engineRoot = resolve(import.meta.dirname, '..', '..', '..');
const lockScript = join(engineRoot, 'scripts/run-with-dist-lock.mjs');
const tmpDir = '/tmp/ludoforge-engine-tests';

const cleanupPaths: string[] = [];

const runWithLock = (command: string, lockName: string): Promise<void> =>
  new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [lockScript, command], {
      cwd: engineRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        ENGINE_DIST_LOCK_NAME: lockName,
      },
    });

    child.on('error', rejectRun);
    child.on('exit', (code) => {
      if (code === 0) {
        resolveRun();
        return;
      }
      rejectRun(new Error(`run-with-dist-lock exited with code ${code ?? 'null'}`));
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
    const lockPath = join(engineRoot, lockName);
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
});
