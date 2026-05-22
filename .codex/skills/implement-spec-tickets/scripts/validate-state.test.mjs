import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const scriptsDir = dirname(currentFile);
const validateStateScript = resolve(scriptsDir, 'validate-state.mjs');
const statePath = '.codex/run-state/implement-spec-tickets.json';

function withTempRepo(callback) {
  const tempRoot = mkdtempSync(join(tmpdir(), 'validate-state-test-'));
  try {
    initGitRepo(tempRoot);
    mkdirSync(join(tempRoot, '.codex', 'run-state'), { recursive: true });
    mkdirSync(join(tempRoot, 'specs'), { recursive: true });
    mkdirSync(join(tempRoot, 'tickets'), { recursive: true });
    writeFileSync(join(tempRoot, 'specs', 'sample.md'), '# Sample spec\n', 'utf8');
    writeFileSync(join(tempRoot, 'tickets', 'sample.md'), '# Sample ticket\n\n**Deps**: None\n', 'utf8');
    writeState(tempRoot);
    commitAll(tempRoot, 'initial state');

    callback(tempRoot);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

function runGit(cwd, args) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function initGitRepo(cwd) {
  runGit(cwd, ['init']);
  runGit(cwd, ['config', 'user.email', 'validate-state@test.local']);
  runGit(cwd, ['config', 'user.name', 'validate-state']);
}

function commitAll(cwd, message) {
  runGit(cwd, ['add', '.']);
  runGit(cwd, ['commit', '-m', message, '--no-gpg-sign']);
}

function writeState(cwd, overrides = {}) {
  const state = {
    originating_spec: 'specs/sample.md',
    archived_spec: null,
    last_ticket: 'tickets/sample.md',
    last_result: 'completed_archived',
    last_work_commit: 'none',
    last_state_commit: 'none',
    next_target: 'tickets/sample.md',
    queue: ['tickets/sample.md'],
    phase: 'ready_for_next_ticket',
    in_progress_ticket: null,
    owned_dirty_summary: null,
    blocked: false,
    blocker: null,
    dirty_state: 'clean',
    updated_at: '2026-05-22T00:00:00Z',
    ...overrides,
  };
  writeFileSync(join(cwd, statePath), `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function dirtyStateFile(cwd) {
  writeState(cwd, { updated_at: '2026-05-22T00:00:01Z' });
}

function runValidate(cwd, args) {
  return spawnSync(process.execPath, [validateStateScript, ...args], {
    cwd,
    encoding: 'utf8',
  });
}

test('validates clean worktree state without allowance flag', () => {
  withTempRepo((tempRoot) => {
    const result = runValidate(tempRoot, [statePath]);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /state validation ok/);
  });
});

test('allow-only-state-file-dirty accepts flag before state path', () => {
  withTempRepo((tempRoot) => {
    dirtyStateFile(tempRoot);

    const result = runValidate(tempRoot, ['--allow-only-state-file-dirty', statePath]);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /state validation ok/);
  });
});

test('allow-only-state-file-dirty accepts flag after state path', () => {
  withTempRepo((tempRoot) => {
    dirtyStateFile(tempRoot);

    const result = runValidate(tempRoot, [statePath, '--allow-only-state-file-dirty']);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /state validation ok/);
  });
});

test('allow-only-state-file-dirty rejects additional dirty paths', () => {
  withTempRepo((tempRoot) => {
    dirtyStateFile(tempRoot);
    writeFileSync(join(tempRoot, 'tickets', 'other.md'), '# Other\n\n**Deps**: None\n', 'utf8');

    const result = runValidate(tempRoot, ['--allow-only-state-file-dirty', statePath]);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /dirty_state cannot be clean when git status has entries/);
  });
});

test('rejects last_work_commit self', () => {
  withTempRepo((tempRoot) => {
    writeState(tempRoot, { last_work_commit: 'self' });

    const result = runValidate(tempRoot, ['--allow-only-state-file-dirty', statePath]);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /last_work_commit cannot be self/);
  });
});

test('accepts reachable commit SHAs', () => {
  withTempRepo((tempRoot) => {
    const head = runGit(tempRoot, ['rev-parse', 'HEAD']);
    writeState(tempRoot, {
      last_work_commit: head,
      last_state_commit: head,
    });

    const result = runValidate(tempRoot, ['--allow-only-state-file-dirty', statePath]);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /state validation ok/);
  });
});

test('rejects unreachable commit SHAs', () => {
  withTempRepo((tempRoot) => {
    writeState(tempRoot, {
      last_work_commit: '0123456789abcdef0123456789abcdef01234567',
      last_state_commit: '0123456789abcdef0123456789abcdef01234567',
    });

    const result = runValidate(tempRoot, ['--allow-only-state-file-dirty', statePath]);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /git cat-file -e .* failed/);
  });
});
