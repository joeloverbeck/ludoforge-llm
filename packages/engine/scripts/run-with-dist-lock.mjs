import { closeSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const lockName = process.env.ENGINE_DIST_LOCK_NAME || '.dist-lock';
const defaultLockRoot = join('/tmp', 'ludoforge-engine-dist-locks', process.cwd().replaceAll('/', '_'));
const lockRoot = process.env.ENGINE_DIST_LOCK_DIR || defaultLockRoot;
const lockPath = join(lockRoot, lockName);
const pollMs = 200;
const staleMs = 30 * 60 * 1000;
const maxWaitMs = Number.parseInt(process.env.ENGINE_DIST_LOCK_MAX_WAIT_MS ?? '', 10) || 5 * 60 * 1000;
const heartbeatMs = 1000;

const command = process.argv.slice(2).join(' ').trim();

mkdirSync(lockRoot, { recursive: true });

if (!command) {
  console.error('run-with-dist-lock requires a command string');
  process.exit(2);
}

if (process.env.ENGINE_DIST_LOCK_HELD === '1') {
  const nestedResult = spawnSync(command, {
    stdio: 'inherit',
    env: process.env,
    shell: true,
  });

  if (nestedResult.error) {
    throw nestedResult.error;
  }

  process.exit(nestedResult.status ?? 1);
}

const isProcessAlive = (pid) => {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const getLinuxProcessStartTicks = (pid) => {
  if (process.platform !== 'linux') {
    return null;
  }
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    const closeParen = stat.lastIndexOf(')');
    if (closeParen === -1) {
      return null;
    }
    const after = stat.slice(closeParen + 2).trim();
    const fields = after.split(/\s+/u);
    const startTicks = Number.parseInt(fields[19] ?? '', 10);
    return Number.isFinite(startTicks) ? startTicks : null;
  } catch {
    return null;
  }
};

const selfStartTicks = getLinuxProcessStartTicks(process.pid);

const isExpectedLockOwnerProcess = (pid, startedAtTicks) => {
  if (!isProcessAlive(pid)) {
    return false;
  }

  if (process.platform !== 'linux') {
    return true;
  }

  try {
    if (typeof startedAtTicks === 'number') {
      const currentStartTicks = getLinuxProcessStartTicks(pid);
      if (currentStartTicks === null || currentStartTicks !== startedAtTicks) {
        return false;
      }
    }
    const cmdline = readFileSync(`/proc/${pid}/cmdline`, 'utf8');
    return cmdline.includes('run-with-dist-lock.mjs');
  } catch {
    // If cmdline cannot be read, treat the lock as stale so dead/unverifiable owners do not block dist indefinitely.
    return false;
  }
};

const isStale = (metadataRaw) => {
  try {
    const metadata = JSON.parse(metadataRaw);
    if (typeof metadata?.heartbeatAt === 'number') {
      return (Date.now() - metadata.heartbeatAt) > staleMs;
    }
    const staleByAge = typeof metadata?.createdAt === 'number' && (Date.now() - metadata.createdAt) > staleMs;
    const staleByPid = typeof metadata?.pid === 'number'
      && !isExpectedLockOwnerProcess(metadata.pid, metadata.startedAtTicks);
    return staleByAge || staleByPid;
  } catch {
    return true;
  }
};

const readLockMetadata = () => {
  try {
    return readFileSync(lockPath, 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error) {
      if (error.code === 'EISDIR') {
        try {
          return readFileSync(join(lockPath, 'owner.json'), 'utf8');
        } catch {
          return null;
        }
      }
      if (error.code === 'ENOENT') {
        return null;
      }
    }
    return null;
  }
};

const tryAcquire = () => {
  try {
    const fd = openSync(lockPath, 'wx');
    try {
      writeFileSync(
        fd,
        JSON.stringify({
          pid: process.pid,
          command,
          createdAt: Date.now(),
          startedAtTicks: selfStartTicks,
          heartbeatAt: Date.now(),
        }),
        'utf8',
      );
    } finally {
      closeSync(fd);
    }
    return true;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error) {
      if (error.code === 'EEXIST' || error.code === 'EISDIR') {
        const metadataRaw = readLockMetadata();
        if (metadataRaw === null || isStale(metadataRaw)) {
          rmSync(lockPath, { recursive: true, force: true });
        }
        return false;
      }
    }
    throw error;
  }
};

const release = () => {
  rmSync(lockPath, { recursive: true, force: true });
};

const refreshHeartbeat = () => {
  writeFileSync(
    lockPath,
    JSON.stringify({
      pid: process.pid,
      command,
      createdAt: Date.now(),
      startedAtTicks: selfStartTicks,
      heartbeatAt: Date.now(),
    }),
    'utf8',
  );
};

const acquire = async () => {
  const startedAt = Date.now();
  while (!tryAcquire()) {
    if (Date.now() - startedAt > maxWaitMs) {
      const owner = readLockMetadata() ?? 'unreadable';
      throw new Error(`Timed out waiting for dist lock "${lockName}" after ${maxWaitMs}ms. Current owner: ${owner}`);
    }
    await sleep(pollMs);
  }
};

await acquire();

const cleanup = () => {
  release();
};

process.on('SIGINT', () => {
  cleanup();
  process.exit(130);
});
process.on('SIGTERM', () => {
  cleanup();
  process.exit(143);
});

let activeChild = null;

try {
  const heartbeatTimer = setInterval(() => {
    try {
      refreshHeartbeat();
    } catch {
      // If the lock file is unexpectedly removed, the child process will still finish;
      // cleanup will attempt to remove the path again.
    }
  }, heartbeatMs);
  heartbeatTimer.unref?.();

  const result = await new Promise((resolvePromise, rejectPromise) => {
    activeChild = spawn(command, {
      stdio: 'inherit',
      env: {
        ...process.env,
        ENGINE_DIST_LOCK_HELD: '1',
      },
      shell: true,
    });

    activeChild.on('error', rejectPromise);
    activeChild.on('exit', (code, signal) => {
      resolvePromise({ code, signal });
    });
  });

  clearInterval(heartbeatTimer);
  activeChild = null;

  process.exitCode = result.code ?? (result.signal === null ? 1 : 1);
} finally {
  if (activeChild !== null) {
    activeChild.kill('SIGTERM');
  }
  cleanup();
}
