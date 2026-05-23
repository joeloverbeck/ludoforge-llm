#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const STATE_PATH = '.codex/run-state/implement-spec-tickets.json';
const FULL_SHA = /^[0-9a-f]{40}$/;

function git(args) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.error?.message || 'unknown error'}`);
  }
  return (result.stdout || '').trim();
}

function pathExistsForState(value) {
  if (value === null || value === undefined || value === '') return true;
  if (['blocked', 'final_spec_archive'].includes(value)) return true;
  return existsSync(value);
}

function verifyCommit(value, field) {
  if (value === 'none' || value === 'self') return;
  if (typeof value !== 'string' || !FULL_SHA.test(value)) {
    throw new Error(`${field} must be "none", "self", or a full commit SHA`);
  }
  git(['cat-file', '-e', `${value}^{commit}`]);
}

function readState() {
  if (!existsSync(STATE_PATH)) return null;
  return JSON.parse(readFileSync(STATE_PATH, 'utf8'));
}

function validateStateBasics(state) {
  const problems = [];
  if (!state) return ['state file missing'];

  if (state.last_work_commit === 'self') {
    problems.push('last_work_commit cannot be self');
  } else {
    try {
      verifyCommit(state.last_work_commit, 'last_work_commit');
    } catch (error) {
      problems.push(error.message);
    }
  }

  if (
    state.last_state_commit !== 'none' &&
    state.last_state_commit !== 'self' &&
    state.last_state_commit !== state.last_work_commit
  ) {
    try {
      verifyCommit(state.last_state_commit, 'last_state_commit');
    } catch (error) {
      problems.push(error.message);
    }
  }

  for (const key of ['originating_spec', 'archived_spec', 'last_ticket', 'next_target']) {
    if (!pathExistsForState(state[key])) problems.push(`${key} missing: ${state[key]}`);
  }

  if (!Array.isArray(state.queue)) {
    problems.push('queue must be an array');
  } else {
    for (const value of state.queue) {
      if (!existsSync(value)) problems.push(`queue missing: ${value}`);
    }
  }

  return problems;
}

function parseStatusEntries(status) {
  if (status === '') return [];
  return status.split('\n').filter(Boolean).map((line) => line.slice(3));
}

function shouldPrintStateOnlyCheckpoint(state, status) {
  const paths = parseStatusEntries(status);
  const onlyStateFileDirty = paths.length === 1 && paths[0] === STATE_PATH;
  return onlyStateFileDirty || state?.last_state_commit === 'self';
}

function formatStateCommit(state, status) {
  const value = state?.last_state_commit;
  if (value !== 'self') return value ?? '<sha | self | none>';
  if (status.includes(STATE_PATH)) return 'self (<actual state commit sha after commit>)';
  return `self (${git(['rev-parse', 'HEAD'])})`;
}

function printScaffold(state, status) {
  const spec = state?.archived_spec ?? state?.originating_spec ?? '<spec>';
  const next = state?.next_target ?? '<next-target>';
  const queue = Array.isArray(state?.queue) ? state.queue.join(', ') || '<empty>' : '<queue>';
  const dirty = status === '' ? 'clean' : status.replaceAll('\n', '; ');

  console.log('Required-visible-block checkpoint:');
  console.log('- implement-ticket audit block: <emitted | not_applicable: reason>');
  console.log('- Acceptance-to-command map: <emitted | not_applicable: reason | blocked: reason>');
  console.log('- pre-archive gate: <emitted before archive command | not_applicable: no ticket archive in this iteration | late_recovered: reason>');
  console.log('- post-ticket-review block: <emitted | not_applicable: reason>');
  console.log('- post-ticket-review audit block: <emitted | not_applicable: reason | blocked: reason>');
  console.log('- state-file validity: <valid | not_changed | blocked: reason>');
  console.log('- generated-artifact provenance: <emitted | not_applicable: reason | blocked: reason>');
  console.log('- generated-artifact generator durability: <verified exact body/retained script | not_applicable: no generated artifact | blocked: reason>');
  console.log('- source-size ledger: <emitted | not_applicable: reason | blocked: reason>');
  console.log('- abandoned-probe cleanup proof: <emitted | not_applicable: no abandoned exploratory source/test/schema/proof probe | blocked: reason>');
  console.log('- baseline worktree lifecycle: <emitted | not_applicable: no temporary baseline worktree | blocked: reason>');
  console.log('- dependent classification: <emitted | not_applicable: no prerequisite insertion or directly affected siblings | blocked: reason>');
  console.log('- approved extra paths: <none | paths + approval source + commit-message/handoff treatment>');
  console.log('- Harness handoff: <ready_to_emit | not_applicable: reason>');
  if (shouldPrintStateOnlyCheckpoint(state, status)) {
    console.log('');
    console.log('State-only commit checkpoint:');
    console.log(`- staged state file: ${status.includes(STATE_PATH) ? '<yes | blocked: reason>' : 'not_applicable: state file not dirty'}`);
    console.log(`- recorded work commit: ${state?.last_work_commit ?? '<full sha | none>'}`);
    console.log(`- recorded state commit: ${state?.last_state_commit ?? '<self | full sha | none>'}`);
    console.log('- state-only validator mode: <not_applicable | --allow-only-state-file-dirty used because only state file is dirty>');
    console.log(`- post-commit dirty-state expectation: ${state?.dirty_state ?? '<clean | unrelated_dirty/untracked paths | blocked: reason>'}`);
    console.log('- planned revalidation: <retained validator + git status | manual state checks + git status>');
  }
  console.log('');
  console.log('Harness handoff:');
  console.log(`- Originating spec: ${spec}`);
  console.log(`- Last ticket processed: ${state?.last_ticket ?? '<ticket>'} ${state?.last_result ?? '<result>'}`);
  console.log(`- Work commit: ${state?.last_work_commit ?? '<sha or none>'}`);
  console.log(`- State commit: ${formatStateCommit(state, status)}`);
  console.log(`- Next target: ${next}`);
  console.log(`- Queue: ${queue}`);
  console.log(`- Dirty state: ${dirty}`);
  console.log(`- State file: ${STATE_PATH}`);
  console.log(`- Required next invocation: $implement-spec-tickets ${spec} ${next}`);
  console.log('- Reset boundary: <fresh context recommended | continuing same-seam follow-up/direct dependent with reason | not_applicable: final/blocked>');
  console.log('- Approved boundary resets: <none | user-approved decision + artifact where recorded>');
}

try {
  const state = readState();
  const status = git(['status', '--short']);
  const problems = validateStateBasics(state);

  printScaffold(state, status);

  if (problems.length > 0) {
    console.error('');
    console.error('State/path preflight problems:');
    for (const problem of problems) console.error(`- ${problem}`);
    process.exit(1);
  }

  console.error('');
  console.error('State/path preflight ok.');
} catch (error) {
  console.error(`handoff preflight failed: ${error.message}`);
  process.exit(1);
}
