import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { expandBatchMarkers } from '../../src/cnl/expand-batch-markers.js';
import { expandBatchVars } from '../../src/cnl/expand-batch-vars.js';
import { expandZoneTemplates } from '../../src/cnl/expand-zone-templates.js';
import { expandPhaseTemplates } from '../../src/cnl/expand-phase-templates.js';
import { expandPieceGeneration } from '../../src/cnl/expand-piece-generation.js';
import { createEmptyGameSpecDoc } from '../../src/cnl/game-spec-doc.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function docWith(overrides: Partial<ReturnType<typeof createEmptyGameSpecDoc>>) {
  return { ...createEmptyGameSpecDoc(), ...overrides };
}

// ---------------------------------------------------------------------------
// Batch markers provenance
// ---------------------------------------------------------------------------

describe('expansion provenance — batchMarkers', () => {
  it('adds _origin to expanded markers', () => {
    const doc = docWith({
      globalMarkerLattices: [
        {
          batch: {
            ids: ['m1', 'm2'],
            states: ['off', 'on'],
            defaultState: 'off',
          },
        },
      ],
    });

    const result = expandBatchMarkers(doc);
    const markers = result.doc.globalMarkerLattices!;
    assert.equal(markers.length, 2);
    for (const marker of markers) {
      assert.ok('_origin' in marker, 'marker should have _origin');
      const origin = (marker as { _origin: { pass: string } })._origin;
      assert.equal(origin.pass, 'batchMarkers');
    }
  });
});

// ---------------------------------------------------------------------------
// Batch vars provenance
// ---------------------------------------------------------------------------

describe('expansion provenance — batchVars', () => {
  it('adds _origin to expanded globalVars', () => {
    const doc = docWith({
      globalVars: [
        {
          batch: {
            names: ['v1', 'v2'],
            type: 'int' as const,
            init: 0,
            min: 0,
            max: 10,
          },
        },
      ],
    });

    const result = expandBatchVars(doc);
    const vars = result.doc.globalVars!;
    assert.equal(vars.length, 2);
    for (const v of vars) {
      assert.ok('_origin' in v, 'var should have _origin');
      const origin = (v as { _origin: { pass: string } })._origin;
      assert.equal(origin.pass, 'batchVars');
    }
  });
});

// ---------------------------------------------------------------------------
// Zone templates provenance
// ---------------------------------------------------------------------------

describe('expansion provenance — zoneTemplates', () => {
  it('adds _origin with template to expanded zones', () => {
    const doc = docWith({
      dataAssets: [
        {
          id: 'seats',
          kind: 'seatCatalog',
          payload: { seats: [{ id: 'us' }, { id: 'arvn' }] },
        },
      ],
      zones: [
        {
          template: {
            idPattern: 'hand-{seat}',
            perSeat: true as const,
            owner: '{seat}',
            visibility: 'owner',
            ordering: 'none',
          },
        },
      ],
    });

    const result = expandZoneTemplates(doc);
    const zones = result.doc.zones!;
    assert.equal(zones.length, 2);
    for (const zone of zones) {
      assert.ok('_origin' in zone, 'zone should have _origin');
      const origin = (zone as { _origin: { pass: string; template: string } })._origin;
      assert.equal(origin.pass, 'zoneTemplates');
      assert.equal(origin.template, 'hand-{seat}');
    }
  });
});

// ---------------------------------------------------------------------------
// Phase templates provenance
// ---------------------------------------------------------------------------

describe('expansion provenance — phaseTemplates', () => {
  it('adds _origin with template to expanded phases', () => {
    const doc = docWith({
      phaseTemplates: [
        {
          id: 'roundTmpl',
          params: [{ name: 'roundId' }],
          phase: { id: '{roundId}', onEnter: [] },
        },
      ],
      turnStructure: {
        phases: [
          { fromTemplate: 'roundTmpl', args: { roundId: 'round1' } },
        ],
      },
    });

    const result = expandPhaseTemplates(doc);
    const phases = result.doc.turnStructure!.phases;
    assert.equal(phases.length, 1);
    const phase = phases[0] as { _origin?: { pass: string; template: string } };
    assert.ok(phase._origin, 'phase should have _origin');
    assert.equal(phase._origin.pass, 'phaseTemplates');
    assert.equal(phase._origin.template, 'roundTmpl');
  });
});

// ---------------------------------------------------------------------------
// Piece generation — no provenance on payload objects
// ---------------------------------------------------------------------------

describe('expansion provenance — pieceGeneration', () => {
  it('does NOT add _origin to generated piece types (strict Zod schema on payload)', () => {
    const doc = docWith({
      dataAssets: [
        {
          id: 'pieces',
          kind: 'pieceCatalog',
          payload: {
            pieceTypes: [
              {
                generate: {
                  idPattern: '{color}-troop',
                  seat: 'player',
                  statusDimensions: ['active'],
                  transitions: [],
                  dimensions: [
                    { name: 'color', values: ['red', 'blue'] },
                  ],
                  inventoryPerCombination: 3,
                },
              },
            ],
            inventory: [],
          },
        },
      ],
    });

    const result = expandPieceGeneration(doc);
    const payload = result.doc.dataAssets![0]!.payload as {
      pieceTypes: readonly Record<string, unknown>[];
    };
    assert.equal(payload.pieceTypes.length, 2);
    // Piece types live inside data asset payloads validated by strict Zod
    // schemas — _origin would cause PIECE_CATALOG_SCHEMA_INVALID errors.
    for (const pt of payload.pieceTypes) {
      assert.equal('_origin' in pt, false, 'piece type must not carry _origin');
    }
  });
});

// ---------------------------------------------------------------------------
// Provenance does not leak into literal (non-expanded) entries
// ---------------------------------------------------------------------------

describe('expansion provenance — literal entries', () => {
  it('literal markers have no _origin', () => {
    const doc = docWith({
      globalMarkerLattices: [
        { id: 'manual', states: ['a', 'b'], defaultState: 'a' },
      ],
    });

    const result = expandBatchMarkers(doc);
    const marker = result.doc.globalMarkerLattices![0]!;
    assert.equal('_origin' in marker, false);
  });

  it('literal phases have no _origin', () => {
    const doc = docWith({
      turnStructure: {
        phases: [{ id: 'literal', onEnter: [] }],
      },
    });

    const result = expandPhaseTemplates(doc);
    const phase = result.doc.turnStructure!.phases[0] as { _origin?: unknown };
    assert.equal(phase._origin, undefined);
  });
});
