#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { relative } from 'node:path';

const DEFAULT_STATE_PATH = '.codex/run-state/implement-spec-tickets.json';
const FULL_SHA = /^[0-9a-f]{40}$/;
const VALID_DIRTY_STATE =
  /^(clean|unrelated_untracked: .+|unrelated_dirty: .+|owned_dirty: .+|mixed_dirty: owned=.+; unrelated=.+)$/;

const args = process.argv.slice(2);
const allowOnlyStateFileDirty = args.includes('--allow-only-state-file-dirty');
const statePath = args.find((arg) => !arg.startsWith('--')) ?? DEFAULT_STATE_PATH;

function fail(message) {
  console.error(`state validation failed: ${message}`);
  process.exit(1);
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`cannot parse ${path}: ${error.message}`);
  }
}

function git(args) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.error && result.status !== 0) {
    fail(`git ${args.join(' ')} failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    fail(`git ${args.join(' ')} failed: ${result.stderr || result.error?.message || 'unknown error'}`);
  }
  return (result.stdout || '').trim();
}

function normalizeRepoPath(path) {
  return path.replaceAll('\\', '/').replace(/^\.\//, '');
}

function statePathForGitStatus(path) {
  const normalizedPath = normalizeRepoPath(path);
  if (!path.startsWith('/')) return normalizedPath;

  const repoRoot = git(['rev-parse', '--show-toplevel']);
  return normalizeRepoPath(relative(repoRoot, path));
}

function statusPath(line) {
  if (line[2] === ' ') return normalizeRepoPath(line.slice(3));
  if (line[1] === ' ') return normalizeRepoPath(line.slice(2));
  return normalizeRepoPath(line.slice(3));
}

function pathExistsForState(value) {
  if (typeof value !== 'string' || value.length === 0) return true;
  if (['blocked', 'final_spec_archive'].includes(value)) return true;
  return existsSync(value);
}

function verifyCommit(value, field) {
  if (value === 'none' || value === 'self') return;
  if (typeof value !== 'string' || !FULL_SHA.test(value)) {
    fail(`${field} must be "none", "self", or a full commit SHA`);
  }
  try {
    git(['cat-file', '-e', `${value}^{commit}`]);
  } catch (error) {
    fail(`${field} is not a reachable commit: ${value}; ${error.message}`);
  }
}

const state = readJson(statePath);

if (state.last_work_commit === 'self') {
  fail('last_work_commit cannot be self');
}

if (state.last_work_commit !== 'none') {
  verifyCommit(state.last_work_commit, 'last_work_commit');
}

if (
  state.last_state_commit !== 'none' &&
  state.last_state_commit !== 'self' &&
  state.last_state_commit !== state.last_work_commit
) {
  verifyCommit(state.last_state_commit, 'last_state_commit');
}

for (const key of ['originating_spec', 'archived_spec', 'last_ticket', 'next_target']) {
  if (!pathExistsForState(state[key])) {
    fail(`${key} missing: ${state[key]}`);
  }
}

if (!Array.isArray(state.queue)) {
  fail('queue must be an array');
}

for (const value of state.queue) {
  if (!existsSync(value)) {
    fail(`queue missing: ${value}`);
  }
}

if (state.phase === 'completed' && state.queue.length !== 0) {
  fail('completed phase must have an empty queue');
}

if (typeof state.dirty_state !== 'string' || !VALID_DIRTY_STATE.test(state.dirty_state)) {
  fail(`dirty_state vocabulary: ${state.dirty_state}`);
}

const status = git(['status', '--short']);
const statusLines = status === '' ? [] : status.split('\n');
const gitStatusStatePath = statePathForGitStatus(statePath);
const onlyStateFileDirty =
  statusLines.length > 0 && statusLines.every((line) => statusPath(line) === gitStatusStatePath);

if (status === '' && state.dirty_state !== 'clean') {
  fail(`dirty_state should be clean when git status is clean: ${state.dirty_state}`);
}
if (status !== '' && state.dirty_state === 'clean' && !(allowOnlyStateFileDirty && onlyStateFileDirty)) {
  fail('dirty_state cannot be clean when git status has entries');
}

console.log('state validation ok');
