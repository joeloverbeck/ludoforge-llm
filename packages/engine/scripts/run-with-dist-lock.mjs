import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const lockName = process.env.ENGINE_DIST_LOCK_NAME || '.dist-lock';
const lockDir = join(process.cwd(), lockName);
const lockMetaFile = join(lockDir, 'owner.json');
const pollMs = 200;
const staleMs = 30 * 60 * 1000;

const command = process.argv.slice(2).join(' ').trim();

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

const isStale = (metadataRaw) => {
  try {
    const metadata = JSON.parse(metadataRaw);
    const staleByAge = typeof metadata?.createdAt === 'number' && (Date.now() - metadata.createdAt) > staleMs;
    const staleByPid = typeof metadata?.pid === 'number' && !isProcessAlive(metadata.pid);
    return staleByAge || staleByPid;
  } catch {
    return false;
  }
};

const tryAcquire = () => {
  try {
    mkdirSync(lockDir);
    writeFileSync(
      lockMetaFile,
      JSON.stringify({
        pid: process.pid,
        command,
        createdAt: Date.now(),
      }),
      'utf8',
    );
    return true;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST') {
      try {
        const metadataRaw = readFileSync(lockMetaFile, 'utf8');
        if (isStale(metadataRaw)) {
          rmSync(lockDir, { recursive: true, force: true });
        }
      } catch {
        // If metadata cannot be read (or lock dir is partially created), keep waiting.
      }
      return false;
    }
    throw error;
  }
};

const release = () => {
  rmSync(lockDir, { recursive: true, force: true });
};

const acquire = async () => {
  while (!tryAcquire()) {
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

try {
  const result = spawnSync(command, {
    stdio: 'inherit',
    env: {
      ...process.env,
      ENGINE_DIST_LOCK_HELD: '1',
    },
    shell: true,
  });

  if (result.error) {
    throw result.error;
  }

  process.exit(result.status ?? 1);
} finally {
  cleanup();
}
