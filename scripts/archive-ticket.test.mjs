import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const currentFile = fileURLToPath(import.meta.url);
const scriptsDir = dirname(currentFile);
const archiveScript = resolve(scriptsDir, 'archive-ticket.mjs');

function runArchive(sourcePath, destinationPath) {
  return spawnSync(process.execPath, [archiveScript, sourcePath, destinationPath], {
    encoding: 'utf8',
  });
}

function withTempDir(callback) {
  const tempRoot = mkdtempSync(join(tmpdir(), 'archive-ticket-test-'));
  try {
    callback(tempRoot);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

test('moves source into destination directory when no collision exists', () => {
  withTempDir((tempRoot) => {
    const sourceDir = join(tempRoot, 'tickets');
    const archiveDir = join(tempRoot, 'archive', 'tickets');
    mkdirSync(sourceDir, { recursive: true });
    mkdirSync(archiveDir, { recursive: true });

    const sourcePath = join(sourceDir, 'ENGINEARCH-080.md');
    writeFileSync(sourcePath, 'ticket body', 'utf8');

    const result = runArchive(sourcePath, archiveDir);
    assert.equal(result.status, 0, result.stderr);

    const movedPath = join(archiveDir, 'ENGINEARCH-080.md');
    assert.equal(readFileSync(movedPath, 'utf8'), 'ticket body');
    assert.equal(result.stdout.includes('Archived'), true);
  });
});

test('fails when destination file already exists', () => {
  withTempDir((tempRoot) => {
    const sourceDir = join(tempRoot, 'tickets');
    const archiveDir = join(tempRoot, 'archive', 'tickets');
    mkdirSync(sourceDir, { recursive: true });
    mkdirSync(archiveDir, { recursive: true });

    const sourcePath = join(sourceDir, 'ENGINEARCH-080.md');
    const destinationPath = join(archiveDir, 'ENGINEARCH-080.md');
    writeFileSync(sourcePath, 'new content', 'utf8');
    writeFileSync(destinationPath, 'existing archive', 'utf8');

    const result = runArchive(sourcePath, archiveDir);
    assert.notEqual(result.status, 0);
    assert.equal(result.stderr.includes('Destination already exists'), true);
    assert.equal(readFileSync(destinationPath, 'utf8'), 'existing archive');
    assert.equal(readFileSync(sourcePath, 'utf8'), 'new content');
  });
});

test('succeeds when explicit non-colliding destination path is provided', () => {
  withTempDir((tempRoot) => {
    const sourceDir = join(tempRoot, 'tickets');
    const archiveDir = join(tempRoot, 'archive', 'tickets');
    mkdirSync(sourceDir, { recursive: true });
    mkdirSync(archiveDir, { recursive: true });

    const sourcePath = join(sourceDir, 'FITLGOLT4-006.md');
    const renamedDestination = join(archiveDir, 'FITLGOLT4-006-turn4-golden-coverage.md');
    writeFileSync(sourcePath, 'ticket body', 'utf8');

    const result = runArchive(sourcePath, renamedDestination);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(renamedDestination, 'utf8'), 'ticket body');
  });
});

test('fails when source path is missing', () => {
  withTempDir((tempRoot) => {
    const archiveDir = join(tempRoot, 'archive', 'tickets');
    mkdirSync(archiveDir, { recursive: true });

    const missingSource = join(tempRoot, 'tickets', 'MISSING.md');
    const result = runArchive(missingSource, archiveDir);

    assert.notEqual(result.status, 0);
    assert.equal(result.stderr.includes('Source path does not exist'), true);
  });
});

test('fails when destination parent directory does not exist', () => {
  withTempDir((tempRoot) => {
    const sourceDir = join(tempRoot, 'tickets');
    mkdirSync(sourceDir, { recursive: true });

    const sourcePath = join(sourceDir, 'ENGINEARCH-080.md');
    writeFileSync(sourcePath, 'ticket body', 'utf8');

    const invalidDestination = join(tempRoot, 'archive', 'tickets', 'ENGINEARCH-080.md');
    const result = runArchive(sourcePath, invalidDestination);

    assert.notEqual(result.status, 0);
    assert.equal(result.stderr.includes('Destination parent directory does not exist'), true);
    assert.equal(readFileSync(sourcePath, 'utf8'), 'ticket body');
  });
});
