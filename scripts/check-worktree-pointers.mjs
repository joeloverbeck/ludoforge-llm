import { execSync } from 'node:child_process';

const WORKTREE_PATH = '.claude/worktrees';

function run(command) {
  try {
    return execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    return {
      failed: true,
      message:
        typeof error?.stderr === 'string' && error.stderr.length > 0
          ? error.stderr.trim()
          : typeof error?.message === 'string'
            ? error.message
            : 'Unknown command failure',
    };
  }
}

function listChangedPaths(command) {
  const output = run(command);
  if (typeof output !== 'string') {
    return [];
  }
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function unique(values) {
  return [...new Set(values)];
}

function detectLocalChanges() {
  return unique([
    ...listChangedPaths(`git diff --name-only -- ${WORKTREE_PATH}`),
    ...listChangedPaths(`git diff --cached --name-only -- ${WORKTREE_PATH}`),
  ]);
}

function detectCiChanges() {
  const event = process.env.GITHUB_EVENT_NAME;
  const baseRef = process.env.GITHUB_BASE_REF;

  if (event === 'pull_request' && baseRef) {
    const fetchResult = run(`git fetch --no-tags --depth=1 origin ${baseRef}`);
    if (typeof fetchResult !== 'string') {
      throw new Error(`Failed to fetch base branch for guard: ${fetchResult.message}`);
    }
    return listChangedPaths(`git diff --name-only origin/${baseRef}...HEAD -- ${WORKTREE_PATH}`);
  }

  const hasParent = run('git rev-parse --verify HEAD~1');
  if (typeof hasParent !== 'string' || hasParent.length === 0) {
    return [];
  }

  return listChangedPaths(`git diff --name-only HEAD~1..HEAD -- ${WORKTREE_PATH}`);
}

function main() {
  const isCi = process.env.CI === 'true';
  const changedPaths = isCi ? detectCiChanges() : detectLocalChanges();

  if (changedPaths.length === 0) {
    console.log(`No ${WORKTREE_PATH} pointer changes detected.`);
    return;
  }

  const details = changedPaths.map((path) => `- ${path}`).join('\n');
  console.error(
    [
      `Blocked: detected changes under ${WORKTREE_PATH}.`,
      'These are environment/worktree pointers and must not be included in feature changes.',
      'Changed paths:',
      details,
      'Remove or separate these pointer changes before merging.',
    ].join('\n'),
  );
  process.exit(1);
}

main();
