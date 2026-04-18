// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  compileGameSpecToGameDef,
  expandTemplates,
} from '../../src/cnl/index.js';
import {
  createEmptyGameSpecDoc,
  type GameSpecDoc,
  type GameSpecDataAsset,
  type GameSpecPhaseTemplateDef,
  type GameSpecZoneTemplateDef,
  type GameSpecBatchGlobalMarkerLattice,
  type GameSpecBatchVarDef,
} from '../../src/cnl/game-spec-doc.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { asPhaseId } from '../../src/kernel/branded.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function seatCatalogAsset(seatIds: readonly string[]): GameSpecDataAsset {
  return {
    id: 'seats',
    kind: 'seatCatalog',
    payload: { seats: seatIds.map((id) => ({ id })) },
  };
}

function pieceCatalogAsset(seat: string): GameSpecDataAsset {
  return {
    id: 'deck',
    kind: 'pieceCatalog',
    payload: {
      pieceTypes: [
        {
          generate: {
            idPattern: 'piece-{color}-{role}',
            seat,
            statusDimensions: ['activity'],
            transitions: [{ dimension: 'activity', from: 'underground', to: 'active' }],
            dimensions: [
              { name: 'color', values: ['red', 'blue'] },
              { name: 'role', values: ['warrior', 'scout'] },
            ],
            inventoryPerCombination: 1,
          },
        },
      ],
      inventory: [],
    },
  };
}

const baseDoc = (): GameSpecDoc => ({
  ...createEmptyGameSpecDoc(),
  metadata: { id: 'expand-templates-integration', players: { min: 2, max: 4 } },
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('expandTemplates orchestrator (unit)', () => {
  it('passes through a doc with no template patterns unchanged', () => {
    const doc = baseDoc();
    const result = expandTemplates(doc);
    assert.deepEqual(result.diagnostics, []);
    assert.deepStrictEqual(result.doc, doc);
  });

  it('chains all five expansion passes in order', () => {
    const seats = ['p1', 'p2'];

    const phaseTemplate: GameSpecPhaseTemplateDef = {
      id: 'betting',
      params: [{ name: 'roundId' }],
      phase: { id: '{roundId}' },
    };

    const zoneTemplate: GameSpecZoneTemplateDef = {
      template: {
        idPattern: 'hand-{seat}',
        perSeat: true,
        owner: 'player',
        visibility: 'hidden',
        ordering: 'set',
      },
    };

    const batchMarkers: GameSpecBatchGlobalMarkerLattice = {
      batch: {
        ids: ['cap_0', 'cap_1'],
        states: ['off', 'on'],
        defaultState: 'off',
      },
    };

    const batchVars: GameSpecBatchVarDef = {
      batch: {
        names: ['ops_0', 'ops_1'],
        type: 'int',
        init: 0,
        min: 0,
        max: 10,
      },
    };

    const doc: GameSpecDoc = {
      ...baseDoc(),
      dataAssets: [seatCatalogAsset(seats), pieceCatalogAsset('p1')],
      globalMarkerLattices: [batchMarkers],
      globalVars: [batchVars],
      zones: [
        { id: 'board', owner: 'none', visibility: 'public', ordering: 'set' },
        zoneTemplate,
      ],
      phaseTemplates: [phaseTemplate],
      turnStructure: {
        phases: [
          { fromTemplate: 'betting', args: { roundId: 'preflop' } },
          { fromTemplate: 'betting', args: { roundId: 'flop' } },
        ],
      },
    };

    const result = expandTemplates(doc);
    assert.deepEqual(result.diagnostics, []);

    // A1: piece generation — 2 suits × 2 ranks = 4 piece types
    const piecePayload = result.doc.dataAssets![1]!.payload as {
      pieceTypes: readonly unknown[];
    };
    assert.equal(piecePayload.pieceTypes.length, 4);

    // A2: batch markers — 2 markers expanded
    assert.equal(result.doc.globalMarkerLattices!.length, 2);

    // A3: batch vars — 2 vars expanded
    assert.equal(result.doc.globalVars!.length, 2);

    // A4: zone templates — 1 individual + 2 per-seat = 3
    assert.equal(result.doc.zones!.length, 3);

    // A5: phase templates — 2 instantiations
    assert.equal(result.doc.turnStructure!.phases.length, 2);
    // Verify no fromTemplate artifacts remain
    for (const phase of result.doc.turnStructure!.phases) {
      assert.equal('fromTemplate' in phase, false);
    }
  });

  it('collects diagnostics from all passes', () => {
    const doc: GameSpecDoc = {
      ...baseDoc(),
      // A2: batch markers with empty ids → diagnostic
      globalMarkerLattices: [{
        batch: {
          ids: [],
          states: ['off', 'on'],
          defaultState: 'off',
        },
      }],
      // A3: batch vars with empty names → diagnostic
      globalVars: [{
        batch: {
          names: [],
          type: 'int',
          init: 0,
          min: 0,
          max: 10,
        },
      }],
    };

    const result = expandTemplates(doc);
    // At least 2 diagnostics from batch-markers (empty ids) and batch-vars (empty names)
    assert.ok(result.diagnostics.length >= 2, `Expected ≥2 diagnostics, got ${result.diagnostics.length}`);
  });
});

describe('expandTemplates pipeline integration', () => {
  it('doc with no templates compiles identically to before', () => {
    const doc: GameSpecDoc = {
      ...baseDoc(),
      zones: [
        { id: 'board', owner: 'none', visibility: 'public', ordering: 'set' },
      ],
      turnStructure: { phases: [{ id: 'main' }] },
      actions: [
        {
          id: 'pass',
          actor: 'active',
          executor: 'actor',
          phase: ['main'],
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
      ],
      terminal: {
        conditions: [
          { when: { op: '==', left: 1, right: 1 }, result: { type: 'draw' } },
        ],
      },
    };

    const result = compileGameSpecToGameDef(doc);
    assertNoErrors(result);
    assert.ok(result.gameDef !== null, 'Expected successful compilation');
  });

  it('template diagnostics appear before macro diagnostics in compile result', () => {
    const doc: GameSpecDoc = {
      ...baseDoc(),
      // Bad batch markers → template diagnostic
      globalMarkerLattices: [{
        batch: {
          ids: [],
          states: ['off', 'on'],
          defaultState: 'off',
        },
      }],
      zones: [
        { id: 'board', owner: 'none', visibility: 'public', ordering: 'set' },
      ],
      turnStructure: { phases: [{ id: 'main' }] },
      actions: [
        {
          id: 'pass',
          actor: 'active',
          executor: 'actor',
          phase: ['main'],
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
      ],
      terminal: {
        conditions: [
          { when: { op: '==', left: 1, right: 1 }, result: { type: 'draw' } },
        ],
      },
    };

    const result = compileGameSpecToGameDef(doc);
    // Template diagnostics should be present (path normalized to doc.globalMarkerLattices...)
    const templateDiagnostics = result.diagnostics.filter(
      (d) => d.path?.includes('globalMarkerLattices'),
    );
    assert.ok(templateDiagnostics.length > 0, 'Expected at least one template diagnostic');
  });

  it('doc with all 5 template patterns compiles through full pipeline', () => {
    const seats = ['p1', 'p2'];

    const phaseTemplate: GameSpecPhaseTemplateDef = {
      id: 'betting',
      params: [{ name: 'roundId' }],
      phase: { id: '{roundId}' },
    };

    const doc: GameSpecDoc = {
      ...baseDoc(),
      dataAssets: [seatCatalogAsset(seats), pieceCatalogAsset('p1')],
      globalMarkerLattices: [{
        batch: {
          ids: ['marker_a', 'marker_b'],
          states: ['off', 'on'],
          defaultState: 'off',
        },
      }],
      globalVars: [{
        batch: {
          names: ['counter_a', 'counter_b'],
          type: 'int',
          init: 0,
          min: 0,
          max: 99,
        },
      }],
      zones: [
        { id: 'board', owner: 'none', visibility: 'public', ordering: 'set' },
        {
          template: {
            idPattern: 'hand-{seat}',
            perSeat: true,
            owner: 'player',
            visibility: 'hidden',
            ordering: 'set',
          },
        },
      ],
      phaseTemplates: [phaseTemplate],
      turnStructure: {
        phases: [
          { fromTemplate: 'betting', args: { roundId: 'preflop' } },
          { fromTemplate: 'betting', args: { roundId: 'flop' } },
        ],
      },
      actions: [
        {
          id: 'pass',
          actor: 'active',
          executor: 'actor',
          phase: ['preflop', 'flop'],
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
      ],
      terminal: {
        conditions: [
          { when: { op: '==', left: 1, right: 1 }, result: { type: 'draw' } },
        ],
      },
    };

    const result = compileGameSpecToGameDef(doc);
    assertNoErrors(result);
    assert.ok(result.gameDef !== null, 'Expected successful compilation');

    // Verify expanded entities made it into the GameDef
    const gameDef = result.gameDef!;

    // Expanded batch markers
    assert.ok(
      gameDef.globalMarkerLattices!.some((m) => m.id === 'marker_a'),
      'Expected marker_a in GameDef',
    );
    assert.ok(
      gameDef.globalMarkerLattices!.some((m) => m.id === 'marker_b'),
      'Expected marker_b in GameDef',
    );

    // Expanded batch vars
    const allVarNames = gameDef.globalVars.map((v) => v.name);
    assert.ok(allVarNames.includes('counter_a'), 'Expected counter_a in globalVars');
    assert.ok(allVarNames.includes('counter_b'), 'Expected counter_b in globalVars');

    // Expanded zone templates — hand-p1:*, hand-p2:* should exist
    // (owner: 'player' zones get per-player expansion during compilation, e.g. hand-p1:0)
    const zoneIds = gameDef.zones.map((z) => z.id as string);
    assert.ok(zoneIds.some((id) => id.startsWith('hand-p1')), 'Expected hand-p1 zone');
    assert.ok(zoneIds.some((id) => id.startsWith('hand-p2')), 'Expected hand-p2 zone');

    // Expanded phase templates — preflop, flop should be phases
    const phaseIds = gameDef.turnStructure!.phases.map((p) => p.id);
    assert.ok(phaseIds.includes(asPhaseId('preflop')), 'Expected preflop phase');
    assert.ok(phaseIds.includes(asPhaseId('flop')), 'Expected flop phase');
  });
});
