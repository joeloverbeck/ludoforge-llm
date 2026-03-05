import { fileURLToPath } from 'node:url';
import { detectCiChangedPaths, detectLocalChangedPaths } from './git-guard-utils.mjs';

const WORKTREE_PATH = '.claude/worktrees';

export function evaluateWorktreePointersGuard({ cwd = process.cwd(), env = process.env } = {}) {
  const isCi = env.CI === 'true';
  const changedPathsResult = isCi
    ? detectCiChangedPaths(cwd, env, [WORKTREE_PATH])
    : { ok: true, paths: detectLocalChangedPaths(cwd, [WORKTREE_PATH]) };

  if (!changedPathsResult.ok) {
    return { ok: false, stderr: changedPathsResult.error };
  }

  const changedPaths = changedPathsResult.paths;
  if (changedPaths.length === 0) {
    return { ok: true, stdout: `No ${WORKTREE_PATH} pointer changes detected.` };
  }

  const details = changedPaths.map((path) => `- ${path}`).join('\n');
  return {
    ok: false,
    stderr: [
      `Blocked: detected changes under ${WORKTREE_PATH}.`,
      'These are environment/worktree pointers and must not be included in feature changes.',
      'Changed paths:',
      details,
      'Remove or separate these pointer changes before merging.',
    ].join('\n'),
  };
}

function main() {
  const result = evaluateWorktreePointersGuard();
  if (result.stdout) {
    console.log(result.stdout);
  }
  if (result.stderr) {
    console.error(result.stderr);
  }

  if (!result.ok) {
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
