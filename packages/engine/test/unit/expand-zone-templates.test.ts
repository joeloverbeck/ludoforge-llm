import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { expandZoneTemplates } from '../../src/cnl/expand-zone-templates.js';
import { CNL_COMPILER_DIAGNOSTIC_CODES } from '../../src/cnl/compiler-diagnostic-codes.js';
import type {
  GameSpecDataAsset,
  GameSpecZoneDef,
  GameSpecZoneTemplateDef,
} from '../../src/cnl/game-spec-doc.js';
import { createEmptyGameSpecDoc, type GameSpecDoc } from '../../src/cnl/game-spec-doc.js';

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

const fitlSeats = ['US', 'ARVN', 'NVA', 'VC'];
const pokerSeats = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10'];

const baseDoc = (): GameSpecDoc => ({
  ...createEmptyGameSpecDoc(),
  metadata: { id: 'zone-template-test', players: { min: 2, max: 4 } },
});

function makeTemplate(overrides: Partial<GameSpecZoneTemplateDef['template']> = {}): GameSpecZoneTemplateDef {
  return {
    template: {
      idPattern: 'hand-{seat}',
      perSeat: true,
      owner: 'player',
      visibility: 'hidden',
      ordering: 'set',
      ...overrides,
    },
  };
}

function individualZone(overrides: Partial<GameSpecZoneDef> = {}): GameSpecZoneDef {
  return {
    id: 'board',
    owner: 'none',
    visibility: 'public',
    ordering: 'set',
    ...overrides,
  };
}

describe('expandZoneTemplates', () => {
  // ---------- Happy path: 4 seats (FITL factions) ----------
  it('expands a template with 4 seats to 4 individual zones', () => {
    const doc: GameSpecDoc = {
      ...baseDoc(),
      dataAssets: [seatCatalogAsset(fitlSeats)],
      zones: [makeTemplate()],
    };

    const result = expandZoneTemplates(doc);

    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.doc.zones!.length, 4);

    const zones = result.doc.zones! as readonly GameSpecZoneDef[];
    assert.equal(zones[0]!.id, 'hand-US');
    assert.equal(zones[1]!.id, 'hand-ARVN');
    assert.equal(zones[2]!.id, 'hand-NVA');
    assert.equal(zones[3]!.id, 'hand-VC');
  });

  // ---------- Happy path: 10 seats (Texas Hold'em) ----------
  it('expands a template with 10 seats to 10 individual zones', () => {
    const doc: GameSpecDoc = {
      ...baseDoc(),
      dataAssets: [seatCatalogAsset(pokerSeats)],
      zones: [makeTemplate()],
    };

    const result = expandZoneTemplates(doc);

    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.doc.zones!.length, 10);

    const zones = result.doc.zones! as readonly GameSpecZoneDef[];
    for (let i = 0; i < 10; i++) {
      assert.equal(zones[i]!.id, `hand-p${i + 1}`);
    }
  });

  // ---------- {seat} substitution ----------
  it('substitutes {seat} in idPattern correctly', () => {
    const doc: GameSpecDoc = {
      ...baseDoc(),
      dataAssets: [seatCatalogAsset(['alpha', 'beta'])],
      zones: [makeTemplate({ idPattern: 'available-{seat}' })],
    };

    const result = expandZoneTemplates(doc);

    assert.deepEqual(result.diagnostics, []);
    const zones = result.doc.zones! as readonly GameSpecZoneDef[];
    assert.equal(zones[0]!.id, 'available-alpha');
    assert.equal(zones[1]!.id, 'available-beta');
  });

  // ---------- Multiple {seat} occurrences in pattern ----------
  it('substitutes all {seat} occurrences in idPattern', () => {
    const doc: GameSpecDoc = {
      ...baseDoc(),
      dataAssets: [seatCatalogAsset(['x'])],
      zones: [makeTemplate({ idPattern: '{seat}-zone-{seat}' })],
    };

    const result = expandZoneTemplates(doc);

    assert.deepEqual(result.diagnostics, []);
    const zones = result.doc.zones! as readonly GameSpecZoneDef[];
    assert.equal(zones[0]!.id, 'x-zone-x');
  });

  // ---------- owner: player propagation ----------
  it('sets owner to player on each expanded zone when template owner is player', () => {
    const doc: GameSpecDoc = {
      ...baseDoc(),
      dataAssets: [seatCatalogAsset(fitlSeats)],
      zones: [makeTemplate({ owner: 'player' })],
    };

    const result = expandZoneTemplates(doc);

    const zones = result.doc.zones! as readonly GameSpecZoneDef[];
    for (const zone of zones) {
      assert.equal(zone.owner, 'player');
    }
  });

  // ---------- owner: none preservation ----------
  it('preserves owner none on each expanded zone', () => {
    const doc: GameSpecDoc = {
      ...baseDoc(),
      dataAssets: [seatCatalogAsset(['a', 'b'])],
      zones: [makeTemplate({ owner: 'none' })],
    };

    const result = expandZoneTemplates(doc);

    const zones = result.doc.zones! as readonly GameSpecZoneDef[];
    for (const zone of zones) {
      assert.equal(zone.owner, 'none');
    }
  });

  // ---------- Mixed template + individual entries ----------
  it('handles mixed template and individual entries with in-place ordering', () => {
    const doc: GameSpecDoc = {
      ...baseDoc(),
      dataAssets: [seatCatalogAsset(['a', 'b'])],
      zones: [
        individualZone({ id: 'deck' }),
        makeTemplate({ idPattern: 'hand-{seat}' }),
        individualZone({ id: 'discard' }),
      ],
    };

    const result = expandZoneTemplates(doc);

    assert.deepEqual(result.diagnostics, []);
    const zones = result.doc.zones! as readonly GameSpecZoneDef[];
    assert.equal(zones.length, 4);
    assert.equal(zones[0]!.id, 'deck');
    assert.equal(zones[1]!.id, 'hand-a');
    assert.equal(zones[2]!.id, 'hand-b');
    assert.equal(zones[3]!.id, 'discard');
  });

  // ---------- Missing seatCatalog ----------
  it('emits diagnostic when templates exist but no seatCatalog found', () => {
    const doc: GameSpecDoc = {
      ...baseDoc(),
      dataAssets: null,
      zones: [makeTemplate()],
    };

    const result = expandZoneTemplates(doc);

    assert.equal(result.diagnostics.length, 1);
    assert.equal(
      result.diagnostics[0]!.code,
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_ZONE_TEMPLATE_SEAT_CATALOG_MISSING,
    );
  });

  // ---------- Missing seatCatalog (empty dataAssets) ----------
  it('emits diagnostic when templates exist and dataAssets has no seatCatalog', () => {
    const doc: GameSpecDoc = {
      ...baseDoc(),
      dataAssets: [{ id: 'other', kind: 'pieceCatalog', payload: {} }],
      zones: [makeTemplate()],
    };

    const result = expandZoneTemplates(doc);

    assert.equal(result.diagnostics.length, 1);
    assert.equal(
      result.diagnostics[0]!.code,
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_ZONE_TEMPLATE_SEAT_CATALOG_MISSING,
    );
  });

  // ---------- idPattern without {seat} ----------
  it('emits diagnostic when idPattern does not contain {seat}', () => {
    const doc: GameSpecDoc = {
      ...baseDoc(),
      dataAssets: [seatCatalogAsset(['a'])],
      zones: [makeTemplate({ idPattern: 'hand-player' })],
    };

    const result = expandZoneTemplates(doc);

    assert.equal(result.diagnostics.length, 1);
    assert.equal(
      result.diagnostics[0]!.code,
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_ZONE_TEMPLATE_ID_PATTERN_MISSING_SEAT,
    );
    assert.ok(result.diagnostics[0]!.message.includes('hand-player'));
  });

  // ---------- Zone ID collision: template vs individual ----------
  it('emits diagnostic for zone ID collision between template expansion and individual zone', () => {
    const doc: GameSpecDoc = {
      ...baseDoc(),
      dataAssets: [seatCatalogAsset(['a'])],
      zones: [
        individualZone({ id: 'hand-a' }),
        makeTemplate({ idPattern: 'hand-{seat}' }),
      ],
    };

    const result = expandZoneTemplates(doc);

    const dupDiags = result.diagnostics.filter(
      (d) => d.code === CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_ZONE_TEMPLATE_DUPLICATE_ID,
    );
    assert.equal(dupDiags.length, 1);
    assert.ok(dupDiags[0]!.message.includes('hand-a'));
  });

  // ---------- Zone ID collision: two template expansions ----------
  it('emits diagnostic for zone ID collision between two template expansions', () => {
    const doc: GameSpecDoc = {
      ...baseDoc(),
      dataAssets: [seatCatalogAsset(['x'])],
      zones: [
        makeTemplate({ idPattern: 'zone-{seat}' }),
        makeTemplate({ idPattern: 'zone-{seat}' }),
      ],
    };

    const result = expandZoneTemplates(doc);

    const dupDiags = result.diagnostics.filter(
      (d) => d.code === CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_ZONE_TEMPLATE_DUPLICATE_ID,
    );
    assert.equal(dupDiags.length, 1);
    assert.ok(dupDiags[0]!.message.includes('zone-x'));
  });

  // ---------- No templates = no-op ----------
  it('returns doc unchanged when no template entries exist', () => {
    const doc: GameSpecDoc = {
      ...baseDoc(),
      zones: [individualZone({ id: 'board' }), individualZone({ id: 'discard' })],
    };

    const result = expandZoneTemplates(doc);

    assert.deepEqual(result.diagnostics, []);
    assert.strictEqual(result.doc, doc);
  });

  // ---------- No templates, no seatCatalog = no-op (no error) ----------
  it('returns doc unchanged when no templates and no seatCatalog exist', () => {
    const doc: GameSpecDoc = {
      ...baseDoc(),
      dataAssets: null,
      zones: [individualZone()],
    };

    const result = expandZoneTemplates(doc);

    assert.deepEqual(result.diagnostics, []);
    assert.strictEqual(result.doc, doc);
  });

  // ---------- Null zones = no-op ----------
  it('returns doc unchanged when zones is null', () => {
    const doc: GameSpecDoc = {
      ...baseDoc(),
      zones: null,
    };

    const result = expandZoneTemplates(doc);

    assert.deepEqual(result.diagnostics, []);
    assert.strictEqual(result.doc, doc);
  });

  // ---------- Empty zones = no-op ----------
  it('returns doc unchanged when zones is empty', () => {
    const doc: GameSpecDoc = {
      ...baseDoc(),
      zones: [],
    };

    const result = expandZoneTemplates(doc);

    assert.deepEqual(result.diagnostics, []);
    assert.strictEqual(result.doc, doc);
  });

  // ---------- Template properties copied: zoneKind, category, attributes ----------
  it('copies zoneKind, category, and attributes to each expanded zone', () => {
    const doc: GameSpecDoc = {
      ...baseDoc(),
      dataAssets: [seatCatalogAsset(['a', 'b'])],
      zones: [
        makeTemplate({
          idPattern: 'reserve-{seat}',
          zoneKind: 'aux',
          category: 'reserve',
          attributes: { capacity: 10, special: true },
        }),
      ],
    };

    const result = expandZoneTemplates(doc);

    assert.deepEqual(result.diagnostics, []);
    const zones = result.doc.zones! as readonly GameSpecZoneDef[];
    assert.equal(zones.length, 2);

    for (const zone of zones) {
      assert.equal(zone.zoneKind, 'aux');
      assert.equal(zone.category, 'reserve');
      assert.deepEqual(zone.attributes, { capacity: 10, special: true });
    }
  });

  // ---------- Template properties: isInternal ----------
  it('copies isInternal to each expanded zone', () => {
    const doc: GameSpecDoc = {
      ...baseDoc(),
      dataAssets: [seatCatalogAsset(['a'])],
      zones: [makeTemplate({ isInternal: true })],
    };

    const result = expandZoneTemplates(doc);

    assert.deepEqual(result.diagnostics, []);
    const zones = result.doc.zones! as readonly GameSpecZoneDef[];
    assert.equal(zones[0]!.isInternal, true);
  });

  // ---------- Optional properties omitted when not in template ----------
  it('does not add optional properties when absent from template', () => {
    const doc: GameSpecDoc = {
      ...baseDoc(),
      dataAssets: [seatCatalogAsset(['a'])],
      zones: [makeTemplate()],
    };

    const result = expandZoneTemplates(doc);

    const zones = result.doc.zones! as readonly GameSpecZoneDef[];
    const zone = zones[0]!;
    assert.equal(zone.zoneKind, undefined);
    assert.equal(zone.isInternal, undefined);
    assert.equal(zone.category, undefined);
    assert.equal(zone.attributes, undefined);
    assert.equal(zone.adjacentTo, undefined);
  });

  // ---------- Purity: input doc not mutated ----------
  it('does not mutate the input document', () => {
    const originalZones: readonly (GameSpecZoneDef | GameSpecZoneTemplateDef)[] = [
      individualZone({ id: 'board' }),
      makeTemplate(),
    ];
    const doc: GameSpecDoc = {
      ...baseDoc(),
      dataAssets: [seatCatalogAsset(fitlSeats)],
      zones: originalZones,
    };

    const result = expandZoneTemplates(doc);

    // Input zones array unchanged
    assert.equal(doc.zones!.length, 2);
    assert.ok('template' in doc.zones![1]!);
    // Output is a different object
    assert.notStrictEqual(result.doc, doc);
    assert.notStrictEqual(result.doc.zones, doc.zones);
  });

  // ---------- Output contains only GameSpecZoneDef (no templates) ----------
  it('produces output zones with no template entries remaining', () => {
    const doc: GameSpecDoc = {
      ...baseDoc(),
      dataAssets: [seatCatalogAsset(fitlSeats)],
      zones: [
        individualZone({ id: 'board' }),
        makeTemplate({ idPattern: 'hand-{seat}' }),
        makeTemplate({ idPattern: 'reserve-{seat}' }),
      ],
    };

    const result = expandZoneTemplates(doc);

    assert.deepEqual(result.diagnostics, []);
    for (const zone of result.doc.zones!) {
      assert.ok('id' in zone, 'Every output entry should be a GameSpecZoneDef with an id');
      assert.ok(!('template' in zone), 'No template entries should remain');
    }
    // 1 individual + 4 FITL seats × 2 templates = 9
    assert.equal(result.doc.zones!.length, 9);
  });

  // ---------- Ordering: visibility + ordering preserved ----------
  it('copies visibility and ordering from template to each expanded zone', () => {
    const doc: GameSpecDoc = {
      ...baseDoc(),
      dataAssets: [seatCatalogAsset(['a', 'b'])],
      zones: [makeTemplate({ visibility: 'ownerOnly', ordering: 'stack' })],
    };

    const result = expandZoneTemplates(doc);

    const zones = result.doc.zones! as readonly GameSpecZoneDef[];
    for (const zone of zones) {
      assert.equal(zone.visibility, 'ownerOnly');
      assert.equal(zone.ordering, 'stack');
    }
  });
});
