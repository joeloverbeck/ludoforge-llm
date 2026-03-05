import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const scriptsDir = dirname(currentFile);
const checkScript = resolve(scriptsDir, 'check-ticket-deps.mjs');

function withTempRepo(callback) {
  const tempRoot = mkdtempSync(join(tmpdir(), 'check-ticket-deps-test-'));
  try {
    mkdirSync(join(tempRoot, 'tickets'), { recursive: true });
    callback(tempRoot);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

function runCheck(cwd) {
  return spawnSync(process.execPath, [checkScript], {
    cwd,
    encoding: 'utf8',
  });
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
  runGit(cwd, ['config', 'user.email', 'check-ticket-deps@test.local']);
  runGit(cwd, ['config', 'user.name', 'check-ticket-deps']);
}

function commitAll(cwd, message) {
  runGit(cwd, ['add', '.']);
  runGit(cwd, ['commit', '-m', message, '--no-gpg-sign']);
}

test('passes when all ticket dependency paths exist', () => {
  withTempRepo((tempRoot) => {
    mkdirSync(join(tempRoot, 'specs'), { recursive: true });
    writeFileSync(join(tempRoot, 'specs', '51-example.md'), '# Spec\n', 'utf8');
    writeFileSync(
      join(tempRoot, 'tickets', 'ENGINEARCH-200-example.md'),
      ['# Example', '', '**Deps**: specs/51-example.md'].join('\n'),
      'utf8',
    );

    const result = runCheck(tempRoot);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Ticket dependency integrity check passed/);
  });
});

test('fails when a dependency path does not exist', () => {
  withTempRepo((tempRoot) => {
    writeFileSync(
      join(tempRoot, 'tickets', 'ENGINEARCH-201-missing-dep.md'),
      ['# Missing dep', '', '**Deps**: tickets/DOES-NOT-EXIST.md'].join('\n'),
      'utf8',
    );

    const result = runCheck(tempRoot);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /unresolved dependency path/);
  });
});

test('fails when deps header is missing', () => {
  withTempRepo((tempRoot) => {
    writeFileSync(join(tempRoot, 'tickets', 'ENGINEARCH-202-no-deps.md'), '# No deps header\n', 'utf8');

    const result = runCheck(tempRoot);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /missing required "\*\*Deps\*\*:" line/);
  });
});

test('accepts "None" dependencies', () => {
  withTempRepo((tempRoot) => {
    writeFileSync(
      join(tempRoot, 'tickets', 'ENGINEARCH-203-none.md'),
      ['# No dependencies', '', '**Deps**: None'].join('\n'),
      'utf8',
    );

    const result = runCheck(tempRoot);
    assert.equal(result.status, 0, result.stderr);
  });
});

test('passes with mixed active and archived dependency paths', () => {
  withTempRepo((tempRoot) => {
    mkdirSync(join(tempRoot, 'tickets'), { recursive: true });
    mkdirSync(join(tempRoot, 'archive', 'tickets'), { recursive: true });
    writeFileSync(join(tempRoot, 'tickets', 'ENGINEARCH-210-active.md'), '# Active dep\n\n**Deps**: None\n', 'utf8');
    writeFileSync(join(tempRoot, 'archive', 'tickets', 'ENGINEARCH-111-archived.md'), '# Archived dep\n', 'utf8');
    writeFileSync(
      join(tempRoot, 'tickets', 'ENGINEARCH-211-mixed.md'),
      [
        '# Mixed deps',
        '',
        '**Deps**: tickets/ENGINEARCH-210-active.md, archive/tickets/ENGINEARCH-111-archived.md',
      ].join('\n'),
      'utf8',
    );

    const result = runCheck(tempRoot);
    assert.equal(result.status, 0, result.stderr);
  });
});

test('fails when a stale active ticket reference exists outside deps', () => {
  withTempRepo((tempRoot) => {
    mkdirSync(join(tempRoot, 'archive', 'tickets', 'KERQUERY'), { recursive: true });
    writeFileSync(
      join(tempRoot, 'archive', 'tickets', 'KERQUERY', 'KERQUERY-013-centralize-query-runtime-cache-index-keys-and-typed-accessors.md'),
      '# Archived dep\n',
      'utf8',
    );
    writeFileSync(
      join(tempRoot, 'tickets', 'KERQUERY-300-reference-drift.md'),
      [
        '# Drift sample',
        '',
        '**Deps**: archive/tickets/KERQUERY/KERQUERY-013-centralize-query-runtime-cache-index-keys-and-typed-accessors.md',
        '',
        'Out of scope: (`tickets/KERQUERY-013-centralize-query-runtime-cache-index-keys-and-typed-accessors.md`).',
      ].join('\n'),
      'utf8',
    );

    const result = runCheck(tempRoot);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /KERQUERY-300-reference-drift\.md:5: unresolved ticket reference/);
  });
});

test('passes when markdown links and inline ticket references resolve', () => {
  withTempRepo((tempRoot) => {
    mkdirSync(join(tempRoot, 'archive', 'tickets', 'KERQUERY'), { recursive: true });
    writeFileSync(
      join(tempRoot, 'archive', 'tickets', 'KERQUERY', 'KERQUERY-014-enforce-query-runtime-cache-ownership-boundary-contracts.md'),
      '# Archived dep\n',
      'utf8',
    );
    writeFileSync(
      join(tempRoot, 'tickets', 'KERQUERY-301-resolved-references.md'),
      [
        '# Resolved refs',
        '',
        '**Deps**: None',
        '',
        'See [KERQUERY-014](archive/tickets/KERQUERY/KERQUERY-014-enforce-query-runtime-cache-ownership-boundary-contracts.md).',
        'Also referenced as `archive/tickets/KERQUERY/KERQUERY-014-enforce-query-runtime-cache-ownership-boundary-contracts.md`.',
      ].join('\n'),
      'utf8',
    );

    const result = runCheck(tempRoot);
    assert.equal(result.status, 0, result.stderr);
  });
});

test('fails when an archived Outcome contradicts changed path claims', () => {
  withTempRepo((tempRoot) => {
    mkdirSync(join(tempRoot, 'archive', 'tickets'), { recursive: true });
    writeFileSync(join(tempRoot, 'tickets', 'ENGINEARCH-400-active.md'), '# Active\n\n**Deps**: None\n', 'utf8');
    writeFileSync(
      join(tempRoot, 'archive', 'tickets', 'ENGINEARCH-399-archived.md'),
      [
        '# Archived',
        '',
        '**Status**: ✅ COMPLETED',
        '',
        '## Outcome',
        '',
        '- **What actually changed**:',
        '  - Updated `scripts/check-ticket-deps.mjs` with new integrity logic.',
        '  - no `scripts/check-ticket-deps.mjs` changes were required.',
      ].join('\n'),
      'utf8',
    );

    const result = runCheck(tempRoot);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /contradictory Outcome claim/);
    assert.match(result.stderr, /archive\/tickets\/ENGINEARCH-399-archived\.md:9/);
  });
});

test('passes when archived Outcome unchanged path claims do not conflict', () => {
  withTempRepo((tempRoot) => {
    mkdirSync(join(tempRoot, 'archive', 'tickets'), { recursive: true });
    writeFileSync(join(tempRoot, 'tickets', 'ENGINEARCH-401-active.md'), '# Active\n\n**Deps**: None\n', 'utf8');
    writeFileSync(
      join(tempRoot, 'archive', 'tickets', 'ENGINEARCH-398-archived.md'),
      [
        '# Archived',
        '',
        '**Status**: ✅ COMPLETED',
        '',
        '## Outcome',
        '',
        '- **What actually changed**:',
        '  - Updated `scripts/check-ticket-deps.mjs` with new integrity logic.',
        '  - `scripts/archive-ticket.mjs` remained unchanged.',
      ].join('\n'),
      'utf8',
    );

    const result = runCheck(tempRoot);
    assert.equal(result.status, 0, result.stderr);
  });
});

test('fails when policy-window archived ticket has post-completion edits without Outcome amended marker', () => {
  withTempRepo((tempRoot) => {
    mkdirSync(join(tempRoot, 'archive', 'tickets'), { recursive: true });
    writeFileSync(join(tempRoot, 'tickets', 'ENGINEARCH-500-active.md'), '# Active\n\n**Deps**: None\n', 'utf8');
    writeFileSync(
      join(tempRoot, 'archive', 'tickets', 'ENGINEARCH-499-archived.md'),
      [
        '# Archived',
        '',
        '**Status**: ✅ COMPLETED',
        '',
        '## Outcome',
        '',
        '- **Completion date**: 2026-03-05',
        '- **What actually changed**:',
        '  - Updated `scripts/check-ticket-deps.mjs`.',
      ].join('\n'),
      'utf8',
    );

    initGitRepo(tempRoot);
    commitAll(tempRoot, 'initial archive');
    writeFileSync(
      join(tempRoot, 'archive', 'tickets', 'ENGINEARCH-499-archived.md'),
      [
        '# Archived',
        '',
        '**Status**: ✅ COMPLETED',
        '',
        '## Outcome',
        '',
        '- **Completion date**: 2026-03-05',
        '- **What actually changed**:',
        '  - Updated `scripts/check-ticket-deps.mjs`.',
        '- **Deviations from original plan**:',
        '  - Clarified wording.',
      ].join('\n'),
      'utf8',
    );
    commitAll(tempRoot, 'post-completion refinement');

    const result = runCheck(tempRoot);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /missing required "Outcome amended: YYYY-MM-DD" marker/);
  });
});

test('passes when policy-window archived ticket post-completion edits include Outcome amended marker', () => {
  withTempRepo((tempRoot) => {
    mkdirSync(join(tempRoot, 'archive', 'tickets'), { recursive: true });
    writeFileSync(join(tempRoot, 'tickets', 'ENGINEARCH-501-active.md'), '# Active\n\n**Deps**: None\n', 'utf8');
    writeFileSync(
      join(tempRoot, 'archive', 'tickets', 'ENGINEARCH-498-archived.md'),
      [
        '# Archived',
        '',
        '**Status**: ✅ COMPLETED',
        '',
        '## Outcome',
        '',
        '- **Completion date**: 2026-03-05',
        '- **What actually changed**:',
        '  - Updated `scripts/check-ticket-deps.mjs`.',
      ].join('\n'),
      'utf8',
    );

    initGitRepo(tempRoot);
    commitAll(tempRoot, 'initial archive');
    writeFileSync(
      join(tempRoot, 'archive', 'tickets', 'ENGINEARCH-498-archived.md'),
      [
        '# Archived',
        '',
        '**Status**: ✅ COMPLETED',
        '',
        '## Outcome',
        '',
        '- **Completion date**: 2026-03-05',
        '- Outcome amended: 2026-03-06',
        '- **What actually changed**:',
        '  - Updated `scripts/check-ticket-deps.mjs`.',
        '- **Deviations from original plan**:',
        '  - Clarified wording.',
      ].join('\n'),
      'utf8',
    );
    commitAll(tempRoot, 'post-completion refinement with amendment marker');

    const result = runCheck(tempRoot);
    assert.equal(result.status, 0, result.stderr);
  });
});

test('fails when Outcome amended marker date is earlier than completion date', () => {
  withTempRepo((tempRoot) => {
    mkdirSync(join(tempRoot, 'archive', 'tickets'), { recursive: true });
    writeFileSync(join(tempRoot, 'tickets', 'ENGINEARCH-502-active.md'), '# Active\n\n**Deps**: None\n', 'utf8');
    writeFileSync(
      join(tempRoot, 'archive', 'tickets', 'ENGINEARCH-497-archived.md'),
      [
        '# Archived',
        '',
        '**Status**: ✅ COMPLETED',
        '',
        '## Outcome',
        '',
        '- **Completion date**: 2026-03-05',
        '- **What actually changed**:',
        '  - Updated `scripts/check-ticket-deps.mjs`.',
      ].join('\n'),
      'utf8',
    );

    initGitRepo(tempRoot);
    commitAll(tempRoot, 'initial archive');
    writeFileSync(
      join(tempRoot, 'archive', 'tickets', 'ENGINEARCH-497-archived.md'),
      [
        '# Archived',
        '',
        '**Status**: ✅ COMPLETED',
        '',
        '## Outcome',
        '',
        '- **Completion date**: 2026-03-05',
        '- Outcome amended: 2026-03-04',
        '- **What actually changed**:',
        '  - Updated `scripts/check-ticket-deps.mjs`.',
      ].join('\n'),
      'utf8',
    );
    commitAll(tempRoot, 'post-completion refinement with invalid amendment date');

    const result = runCheck(tempRoot);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Outcome amendment date "2026-03-04" is earlier than completion date "2026-03-05"/);
  });
});
