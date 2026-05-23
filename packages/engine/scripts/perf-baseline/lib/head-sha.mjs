import { spawnSync } from 'node:child_process';

import { REPO_ROOT } from './paths.mjs';

export function currentHeadSha() {
  const result = spawnSync('git', ['rev-parse', '--short=10', 'HEAD'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    throw new Error(`git rev-parse failed: ${result.stderr.trim()}`);
  }
  return result.stdout.trim();
}
