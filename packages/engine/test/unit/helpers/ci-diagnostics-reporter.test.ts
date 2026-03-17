/**
 * Unit tests for CiDiagnosticsReporter.
 *
 * Tests JSONL output when MCTS_DIAGNOSTICS_DIR is set,
 * console-only fallback when unset, and JSONL record format.
 */
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, beforeEach, afterEach } from 'node:test';

import { createCiDiagnosticsReporter } from '../../helpers/ci-diagnostics-reporter.js';
import type { MctsSearchEvent } from '../../../src/agents/index.js';

// ---------------------------------------------------------------------------
// Fixtures: representative events covering all types
// ---------------------------------------------------------------------------

const SEARCH_START: MctsSearchEvent = {
  type: 'searchStart',
  totalIterations: 200,
  legalMoveCount: 10,
  readyCount: 3,
  pendingCount: 7,
  poolCapacity: 1024,
};

const ITERATION_BATCH: MctsSearchEvent = {
  type: 'iterationBatch',
  fromIteration: 0,
  toIteration: 49,
  rootChildCount: 5,
  elapsedMs: 120,
  nodesAllocated: 80,
  topChildren: [{ actionId: 'train', visits: 20 }],
};

const SEARCH_COMPLETE: MctsSearchEvent = {
  type: 'searchComplete',
  iterations: 200,
  stopReason: 'iterations',
  elapsedMs: 500,
  bestActionId: 'train',
  bestVisits: 80,
};

const POOL_EXHAUSTED: MctsSearchEvent = {
  type: 'poolExhausted',
  capacity: 1024,
  iteration: 150,
};

const MOVE_DROPPED: MctsSearchEvent = {
  type: 'moveDropped',
  actionId: 'march',
  reason: 'unsatisfiable',
};

const EXPANSION: MctsSearchEvent = {
  type: 'expansion',
  actionId: 'train',
  moveKey: 'train:abc',
  childIndex: 0,
  totalChildren: 5,
};

const DECISION_NODE_CREATED: MctsSearchEvent = {
  type: 'decisionNodeCreated',
  actionId: 'march',
  decisionName: '$targetSpaces',
  optionCount: 4,
  decisionDepth: 1,
};

const DECISION_COMPLETED: MctsSearchEvent = {
  type: 'decisionCompleted',
  actionId: 'march',
  stepsUsed: 3,
  moveKey: 'march:def',
};

const DECISION_ILLEGAL: MctsSearchEvent = {
  type: 'decisionIllegal',
  actionId: 'march',
  decisionName: '$targetSpaces',
  reason: 'no valid targets',
};

const APPLY_MOVE_FAILURE: MctsSearchEvent = {
  type: 'applyMoveFailure',
  actionId: 'train',
  phase: 'expansion',
  error: 'zone full',
};

const ROOT_CANDIDATES: MctsSearchEvent = {
  type: 'rootCandidates',
  ready: [{ actionId: 'pass', moveKey: 'pass:0' }],
  pending: [{ actionId: 'march' }],
};

const ALL_EVENTS: readonly MctsSearchEvent[] = [
  SEARCH_START, ITERATION_BATCH, EXPANSION, DECISION_NODE_CREATED,
  DECISION_COMPLETED, DECISION_ILLEGAL, MOVE_DROPPED,
  APPLY_MOVE_FAILURE, POOL_EXHAUSTED, SEARCH_COMPLETE, ROOT_CANDIDATES,
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcts-diag-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CiDiagnosticsReporter', () => {
  it('writes valid JSONL when outputDir is set', () => {
    const reporter = createCiDiagnosticsReporter({
      scenario: 'test-scenario',
      outputDir: tmpDir,
    });

    reporter.onEvent!(SEARCH_START);
    reporter.onEvent!(SEARCH_COMPLETE);

    const filePath = path.join(tmpDir, 'test-scenario.jsonl');
    assert.ok(fs.existsSync(filePath), 'JSONL file should exist');

    const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n');
    assert.equal(lines.length, 2);

    for (const line of lines) {
      const parsed = JSON.parse(line);
      assert.ok(typeof parsed.timestamp === 'number', 'timestamp should be a number');
      assert.equal(parsed.scenario, 'test-scenario');
      assert.ok(parsed.event !== undefined, 'event should be present');
      assert.ok(typeof parsed.event.type === 'string', 'event.type should be a string');
    }
  });

  it('falls back to console-only when outputDir is not set', () => {
    // Save and clear env var
    const saved = process.env.MCTS_DIAGNOSTICS_DIR;
    delete process.env.MCTS_DIAGNOSTICS_DIR;

    try {
      const reporter = createCiDiagnosticsReporter({
        scenario: 'console-only',
      });

      // Should not throw for any event type
      for (const event of ALL_EVENTS) {
        reporter.onEvent!(event);
      }

      // No files should be created in tmpDir
      const files = fs.readdirSync(tmpDir);
      assert.equal(files.length, 0, 'No files should be created without outputDir');
    } finally {
      if (saved !== undefined) {
        process.env.MCTS_DIAGNOSTICS_DIR = saved;
      }
    }
  });

  it('uses MCTS_DIAGNOSTICS_DIR env var when outputDir option is not provided', () => {
    const saved = process.env.MCTS_DIAGNOSTICS_DIR;
    process.env.MCTS_DIAGNOSTICS_DIR = tmpDir;

    try {
      const reporter = createCiDiagnosticsReporter({
        scenario: 'env-test',
      });

      reporter.onEvent!(SEARCH_START);

      const filePath = path.join(tmpDir, 'env-test.jsonl');
      assert.ok(fs.existsSync(filePath), 'JSONL file should be created from env var');
    } finally {
      if (saved !== undefined) {
        process.env.MCTS_DIAGNOSTICS_DIR = saved;
      } else {
        delete process.env.MCTS_DIAGNOSTICS_DIR;
      }
    }
  });

  it('JSONL lines have timestamp, scenario, and event fields', () => {
    const reporter = createCiDiagnosticsReporter({
      scenario: 'field-check',
      outputDir: tmpDir,
    });

    for (const event of ALL_EVENTS) {
      reporter.onEvent!(event);
    }

    const filePath = path.join(tmpDir, 'field-check.jsonl');
    const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n');
    assert.equal(lines.length, ALL_EVENTS.length);

    for (const [i, line] of lines.entries()) {
      const parsed = JSON.parse(line);
      assert.ok(typeof parsed.timestamp === 'number', `line ${i}: timestamp should be number`);
      assert.equal(parsed.scenario, 'field-check', `line ${i}: scenario mismatch`);
      assert.equal(parsed.event.type, ALL_EVENTS[i]!.type, `line ${i}: event type mismatch`);
    }
  });

  it('creates output directory if it does not exist', () => {
    const nestedDir = path.join(tmpDir, 'nested', 'deep');
    assert.ok(!fs.existsSync(nestedDir), 'nested dir should not exist yet');

    const reporter = createCiDiagnosticsReporter({
      scenario: 'mkdir-test',
      outputDir: nestedDir,
    });

    reporter.onEvent!(SEARCH_START);

    assert.ok(fs.existsSync(nestedDir), 'nested dir should be created');
    const filePath = path.join(nestedDir, 'mkdir-test.jsonl');
    assert.ok(fs.existsSync(filePath), 'JSONL file should exist in nested dir');
  });

  it('sanitizes scenario name for filesystem', () => {
    const reporter = createCiDiagnosticsReporter({
      scenario: 'S1: T1 VC — test/scenario',
      outputDir: tmpDir,
    });

    reporter.onEvent!(SEARCH_START);

    // Should sanitize special characters
    const files = fs.readdirSync(tmpDir);
    assert.equal(files.length, 1);
    assert.ok(!files[0]!.includes(':'), 'filename should not contain colons');
    assert.ok(!files[0]!.includes('/'), 'filename should not contain slashes');
  });

  it('appends to existing JSONL file (append-only)', () => {
    const reporter = createCiDiagnosticsReporter({
      scenario: 'append-test',
      outputDir: tmpDir,
    });

    reporter.onEvent!(SEARCH_START);
    reporter.onEvent!(SEARCH_COMPLETE);

    const filePath = path.join(tmpDir, 'append-test.jsonl');
    const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n');
    assert.equal(lines.length, 2);

    // First line should be searchStart, second searchComplete
    assert.equal(JSON.parse(lines[0]!).event.type, 'searchStart');
    assert.equal(JSON.parse(lines[1]!).event.type, 'searchComplete');
  });
});
