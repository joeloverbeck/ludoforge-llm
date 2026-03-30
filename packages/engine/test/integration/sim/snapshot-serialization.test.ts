import * as assert from 'node:assert/strict';
import { readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  assertValidatedGameDef,
  asActionId,
  asPhaseId,
  computeFullHash,
  createGameDefRuntime,
  type ValidatedGameDef,
} from '../../../src/kernel/index.js';
import { RandomAgent } from '../../../src/agents/index.js';
import { enrichTrace, runGame, writeEnrichedTrace } from '../../../src/sim/index.js';
import { extractDecisionPointSnapshot } from '../../../src/sim/index.js';
import type { StandardDecisionPointSnapshot } from '../../../src/sim/snapshot-types.js';
import { asTaggedGameDef } from '../../helpers/gamedef-fixtures.js';
import { eff } from '../../helpers/effect-tag-helper.js';
import { compileProductionSpec } from '../../helpers/production-spec-helpers.js';

// ---------------------------------------------------------------------------
// Minimal two-player fixture with margins and victory standings
// ---------------------------------------------------------------------------

const makeDef = (): ValidatedGameDef =>
  assertValidatedGameDef(asTaggedGameDef({
    metadata: { id: 'snapshot-ser-test', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
    constants: {},
    seats: [{ id: 'A' }, { id: 'B' }],
    globalVars: [
      { name: 'score', type: 'int', init: 0, min: 0, max: 99 },
    ],
    perPlayerVars: [
      { name: 'influence', type: 'int', init: 0, min: 0, max: 99 },
    ],
    zoneVars: [],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [
      {
        id: asActionId('step'),
        actor: 'active',
        executor: 'actor' as const,
        phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [eff({ addVar: { scope: 'global', var: 'score', delta: 1 } })],
        limits: [],
      },
    ],
    triggers: [],
    terminal: {
      conditions: [
        {
          when: { op: '>=', left: { ref: 'gvar', var: 'score' }, right: 6 },
          result: { type: 'draw' },
        },
      ],
      margins: [
        { seat: 'A', value: { ref: 'gvar', var: 'score' } },
        { seat: 'B', value: { op: '-', left: { ref: 'gvar', var: 'score' }, right: 2 } },
      ],
    },
  }));

// ---------------------------------------------------------------------------
// 1. Serialization round-trip: runGame → enrichTrace → writeEnrichedTrace → read back
// ---------------------------------------------------------------------------

describe('snapshot serialization round-trip', () => {
  it('snapshots survive enrichTrace → writeEnrichedTrace → JSON parse without data loss', () => {
    const def = makeDef();
    const agents = [new RandomAgent(), new RandomAgent()];

    const trace = runGame(def, 42, agents, 20, 2, { snapshotDepth: 'standard' });

    // Trace must have moves with snapshots
    assert.ok(trace.moves.length > 0, 'trace should have at least one move');
    for (const moveLog of trace.moves) {
      assert.notEqual(moveLog.snapshot, undefined, 'every move should have a snapshot at standard depth');
    }

    // Enrich trace
    const enriched = enrichTrace(trace, def);
    for (const enrichedMove of enriched.moves) {
      assert.notEqual(enrichedMove.snapshot, undefined, 'enriched moves should retain snapshot via spread');
    }

    // Write to temp file and read back
    const tmpPath = join(tmpdir(), `snapshot-ser-test-${Date.now()}.json`);
    try {
      writeEnrichedTrace(enriched, tmpPath);
      const raw = readFileSync(tmpPath, 'utf-8');
      const parsed = JSON.parse(raw) as { readonly moves: readonly Record<string, unknown>[] };

      assert.ok(parsed.moves.length > 0, 'parsed trace should have moves');
      for (const move of parsed.moves) {
        const snapshot = move['snapshot'] as Record<string, unknown> | undefined;
        assert.notEqual(snapshot, undefined, 'serialized move should retain snapshot field');
        assert.equal(typeof snapshot!['turnCount'], 'number', 'turnCount should be a number');
        assert.equal(typeof snapshot!['phaseId'], 'string', 'phaseId should be a string');
        assert.equal(typeof snapshot!['activePlayer'], 'number', 'activePlayer should be a number');
        assert.ok(Array.isArray(snapshot!['seatStandings']), 'seatStandings should be an array');
        assert.ok('globalVars' in snapshot!, 'standard snapshot should include globalVars');
      }
    } finally {
      try { unlinkSync(tmpPath); } catch { /* ignore cleanup errors */ }
    }
  });

  it('snapshot field values match direct state inspection after round-trip', () => {
    const def = makeDef();
    const agents = [new RandomAgent(), new RandomAgent()];

    const trace = runGame(def, 99, agents, 20, 2, { snapshotDepth: 'standard' });
    const firstMove = trace.moves[0];
    assert.ok(firstMove !== undefined);

    const snapshot = firstMove.snapshot as StandardDecisionPointSnapshot;
    assert.ok(snapshot !== undefined);

    // turnCount should be 0 at the first decision (before any moves applied)
    assert.equal(snapshot.turnCount, 0);

    // margins: seat A = score (0), seat B = score - 2 (-2)
    assert.deepEqual(snapshot.seatStandings.map((s) => ({ seat: s.seat, margin: s.margin })), [
      { seat: 'A', margin: 0 },
      { seat: 'B', margin: -2 },
    ]);

    // globalVars should have score = 0 at start
    assert.equal(snapshot.globalVars['score'], 0);
  });

  it('no BigInt or non-JSON-serializable values appear in snapshot objects', () => {
    const def = makeDef();
    const agents = [new RandomAgent(), new RandomAgent()];

    const trace = runGame(def, 77, agents, 20, 2, { snapshotDepth: 'verbose' });
    for (const moveLog of trace.moves) {
      assert.ok(moveLog.snapshot !== undefined);
      // JSON.stringify would throw on BigInt — if this succeeds, no BigInt present
      const serialized = JSON.stringify(moveLog.snapshot);
      assert.ok(typeof serialized === 'string', 'snapshot should serialize without error');
      // Round-trip preserves structure
      const parsed = JSON.parse(serialized) as unknown;
      assert.deepEqual(parsed, moveLog.snapshot);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Property tests
// ---------------------------------------------------------------------------

describe('snapshot property tests', () => {
  it('extractDecisionPointSnapshot is a pure read-only operation (hash before === hash after)', () => {
    const def = makeDef();
    const runtime = createGameDefRuntime(def);
    const agents = [new RandomAgent(), new RandomAgent()];

    // Run a short game to get mid-game state for testing
    const midTrace = runGame(def, 456, agents, 3, 2, undefined, runtime);
    // Get the final state and extract snapshot from it
    const state = midTrace.finalState;
    const hashBefore = computeFullHash(runtime.zobristTable, state);

    extractDecisionPointSnapshot(def, state, runtime, 'verbose');

    const hashAfter = computeFullHash(runtime.zobristTable, state);
    assert.equal(hashAfter, hashBefore, 'state hash must not change after snapshot extraction');
  });

  it('snapshotDepth "none" produces MoveLog entries where snapshot is strictly undefined', () => {
    const def = makeDef();
    const agents = [new RandomAgent(), new RandomAgent()];

    // Default options (no snapshotDepth = 'none')
    const traceDefault = runGame(def, 55, agents, 20, 2);
    assert.ok(traceDefault.moves.length > 0);
    for (const moveLog of traceDefault.moves) {
      assert.equal(moveLog.snapshot, undefined, 'default (none) should have no snapshot');
      assert.ok(!('snapshot' in moveLog), 'snapshot key should be absent, not just undefined');
    }

    // Explicit 'none'
    const traceExplicit = runGame(def, 55, agents, 20, 2, { snapshotDepth: 'none' });
    for (const moveLog of traceExplicit.moves) {
      assert.equal(moveLog.snapshot, undefined, 'explicit none should have no snapshot');
      assert.ok(!('snapshot' in moveLog), 'snapshot key should be absent with explicit none');
    }
  });
});

// ---------------------------------------------------------------------------
// 3. FITL golden test
// ---------------------------------------------------------------------------

describe('FITL snapshot golden test', () => {
  it('snapshots contain FITL-specific data: 4 seat margins, per-player vars, token counts', () => {
    const { compiled } = compileProductionSpec();
    const def = assertValidatedGameDef(compiled.gameDef);
    const runtime = createGameDefRuntime(def);
    const seatCount = def.seats?.length ?? 2;
    const agents = Array.from({ length: seatCount }, () => new RandomAgent());

    const trace = runGame(def, 2024, agents, 10, seatCount, { snapshotDepth: 'standard' }, runtime);

    assert.ok(trace.moves.length > 0, 'FITL trace should have at least one move');

    const firstSnapshot = trace.moves[0]!.snapshot as StandardDecisionPointSnapshot;
    assert.ok(firstSnapshot !== undefined, 'first move should have a snapshot');

    // FITL has 4 seats: vc, nva, us, arvn — check margins exist
    assert.equal(firstSnapshot.seatStandings.length, 4, 'FITL should have 4 seat standings');
    const seatIds = firstSnapshot.seatStandings.map((s) => s.seat);
    assert.ok(seatIds.includes('vc'), 'should include vc seat');
    assert.ok(seatIds.includes('nva'), 'should include nva seat');
    assert.ok(seatIds.includes('us'), 'should include us seat');
    assert.ok(seatIds.includes('arvn'), 'should include arvn seat');

    // Each seat should have per-player vars (FITL defines resources, etc.)
    for (const standing of firstSnapshot.seatStandings) {
      assert.ok(standing.perPlayerVars !== undefined, `${standing.seat} should have perPlayerVars`);
      assert.ok(typeof standing.perPlayerVars === 'object', `${standing.seat} perPlayerVars should be an object`);
    }

    // Each seat should have a numeric margin
    for (const standing of firstSnapshot.seatStandings) {
      assert.equal(typeof standing.margin, 'number', `${standing.seat} margin should be a number`);
    }

    // Standard depth should include globalVars
    assert.ok('globalVars' in firstSnapshot, 'standard snapshot should include globalVars');
    assert.ok(typeof firstSnapshot.globalVars === 'object', 'globalVars should be an object');

    // Token counts should be present (FITL has victoryStandings with seatGroupConfig)
    for (const standing of firstSnapshot.seatStandings) {
      assert.equal(typeof standing.tokenCountOnBoard, 'number', `${standing.seat} should have tokenCountOnBoard`);
    }
  });
});
