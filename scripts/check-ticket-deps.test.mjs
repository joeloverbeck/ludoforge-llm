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
