import { spawnSync } from 'node:child_process';

function appendPathspec(args, pathspecs = []) {
  if (!pathspecs || pathspecs.length === 0) {
    return args;
  }
  return [...args, '--', ...pathspecs];
}

export function runGit(cwd, args) {
  try {
    const result = spawnSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (result.status === 0) {
      return { ok: true, output: result.stdout.trim() };
    }

    return {
      ok: false,
      error: typeof result.stderr === 'string' && result.stderr.length > 0 ? result.stderr.trim() : 'Git command failed',
    };
  } catch (error) {
    return {
      ok: false,
      error:
        typeof error?.message === 'string' && error.message.length > 0 ? error.message : 'Unknown git execution failure',
    };
  }
}

export function hasHeadCommit(cwd) {
  const result = runGit(cwd, ['rev-parse', '--verify', 'HEAD']);
  return result.ok && result.output.length > 0;
}

export function hasParentCommit(cwd) {
  const result = runGit(cwd, ['rev-parse', '--verify', 'HEAD~1']);
  return result.ok && result.output.length > 0;
}

export function parseChangedPaths(output) {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function unique(values) {
  return [...new Set(values)];
}

export function listChangedPaths(cwd, args, pathspecs = []) {
  const result = runGit(cwd, appendPathspec(args, pathspecs));
  if (!result.ok) {
    return [];
  }
  return parseChangedPaths(result.output);
}

export function detectLocalChangedPaths(cwd, pathspecs = []) {
  return unique([
    ...listChangedPaths(cwd, ['diff', '--name-only'], pathspecs),
    ...listChangedPaths(cwd, ['diff', '--cached', '--name-only'], pathspecs),
  ]);
}

export function detectCiChangedPaths(cwd, env, pathspecs = []) {
  const event = env.GITHUB_EVENT_NAME;
  const baseRef = env.GITHUB_BASE_REF;

  if (event === 'pull_request' && baseRef) {
    const fetchResult = runGit(cwd, ['fetch', '--no-tags', '--depth=1', 'origin', baseRef]);
    if (!fetchResult.ok) {
      return {
        ok: false,
        error: `Failed to fetch base branch for guard: ${fetchResult.error}`,
      };
    }

    return {
      ok: true,
      paths: unique(listChangedPaths(cwd, ['diff', '--name-only', `origin/${baseRef}...HEAD`], pathspecs)),
    };
  }

  if (!hasParentCommit(cwd)) {
    return { ok: true, paths: [] };
  }

  return {
    ok: true,
    paths: unique(listChangedPaths(cwd, ['diff', '--name-only', 'HEAD~1..HEAD'], pathspecs)),
  };
}

export function collectLocalDiffText(cwd, path) {
  const parts = [];
  const unstaged = runGit(cwd, ['diff', '--unified=0', '--no-color', '--', path]);
  if (unstaged.ok && unstaged.output.length > 0) {
    parts.push(unstaged.output);
  }

  const staged = runGit(cwd, ['diff', '--cached', '--unified=0', '--no-color', '--', path]);
  if (staged.ok && staged.output.length > 0) {
    parts.push(staged.output);
  }

  return parts.join('\n');
}

export function collectCiDiffText(cwd, path, env) {
  const event = env.GITHUB_EVENT_NAME;
  const baseRef = env.GITHUB_BASE_REF;

  if (event === 'pull_request' && baseRef) {
    const result = runGit(cwd, ['diff', '--unified=0', '--no-color', `origin/${baseRef}...HEAD`, '--', path]);
    return result.ok ? result.output : '';
  }

  if (!hasParentCommit(cwd)) {
    return '';
  }

  const result = runGit(cwd, ['diff', '--unified=0', '--no-color', 'HEAD~1..HEAD', '--', path]);
  return result.ok ? result.output : '';
}
