import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseGameSpec } from '../../src/cnl/index.js';
import { readProductionSpec } from '../helpers/production-spec-helpers.js';
import type {
  MapPayload,
  MapSpaceInput,
  PieceCatalogPayload,
  PieceInventoryEntry,
  ScenarioPayload,
  ScenarioPiecePlacement,
} from '../../src/kernel/types.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

interface ParsedFitlData {
  readonly mapPayload: MapPayload;
  readonly catalogPayload: PieceCatalogPayload;
  readonly scenarios: ReadonlyMap<string, ScenarioPayload>;
}

function loadFitlData(): ParsedFitlData {
  const markdown = readProductionSpec();
  const parsed = parseGameSpec(markdown);
  const parseErrors = parsed.diagnostics.filter((d) => d.severity === 'error');
  assert.equal(parseErrors.length, 0, `Parse errors: ${parseErrors.map((d) => d.message).join('; ')}`);

  const allAssets = parsed.doc.dataAssets ?? [];

  const mapAsset = allAssets.find((a) => a.id === 'fitl-map-production' && a.kind === 'map');
  assert.ok(mapAsset, 'Expected fitl-map-production map asset');
  const mapPayload = mapAsset.payload as MapPayload;

  const catalogAsset = allAssets.find((a) => a.id === 'fitl-piece-catalog-production' && a.kind === 'pieceCatalog');
  assert.ok(catalogAsset, 'Expected fitl-piece-catalog-production piece catalog asset');
  const catalogPayload = catalogAsset.payload as PieceCatalogPayload;

  const scenarioIds = ['fitl-scenario-full', 'fitl-scenario-short', 'fitl-scenario-medium'] as const;
  const scenarios = new Map<string, ScenarioPayload>();
  for (const id of scenarioIds) {
    const asset = allAssets.find((a) => a.id === id && a.kind === 'scenario');
    assert.ok(asset, `Expected scenario asset ${id}`);
    scenarios.set(id, asset.payload as ScenarioPayload);
  }

  return { mapPayload, catalogPayload, scenarios };
}

function sumPlacedByPieceType(
  placements: readonly ScenarioPiecePlacement[],
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const p of placements) {
    counts.set(p.pieceTypeId, (counts.get(p.pieceTypeId) ?? 0) + p.count);
  }
  return counts;
}

function getOutOfPlayCount(
  outOfPlay: readonly { readonly pieceTypeId: string; readonly count: number }[] | undefined,
  pieceTypeId: string,
): number {
  if (!outOfPlay) return 0;
  return outOfPlay
    .filter((o) => o.pieceTypeId === pieceTypeId)
    .reduce((sum, o) => sum + o.count, 0);
}

function getInventoryTotal(inventory: readonly PieceInventoryEntry[], pieceTypeId: string): number {
  const entry = inventory.find((e) => e.pieceTypeId === pieceTypeId);
  assert.ok(entry, `Inventory entry not found for ${pieceTypeId}`);
  return entry.total;
}

/** Build map of spaceId -> { pieces by faction+type } from placements. */
function buildSpacePieceMap(
  placements: readonly ScenarioPiecePlacement[],
): ReadonlyMap<string, ReadonlyMap<string, number>> {
  const result = new Map<string, Map<string, number>>();
  for (const p of placements) {
    let spaceMap = result.get(p.spaceId);
    if (!spaceMap) {
      spaceMap = new Map();
      result.set(p.spaceId, spaceMap);
    }
    spaceMap.set(p.pieceTypeId, (spaceMap.get(p.pieceTypeId) ?? 0) + p.count);
  }
  return result;
}

function getPieceCount(spacePieces: ReadonlyMap<string, number> | undefined, pieceTypeId: string): number {
  return spacePieces?.get(pieceTypeId) ?? 0;
}

/**
 * Compute COIN forces for a space: US troops + US bases + US irregulars +
 * ARVN troops + ARVN police + ARVN rangers + ARVN bases
 */
function coinForces(spacePieces: ReadonlyMap<string, number> | undefined): number {
  return (
    getPieceCount(spacePieces, 'us-troops') +
    getPieceCount(spacePieces, 'us-bases') +
    getPieceCount(spacePieces, 'us-irregulars') +
    getPieceCount(spacePieces, 'arvn-troops') +
    getPieceCount(spacePieces, 'arvn-police') +
    getPieceCount(spacePieces, 'arvn-rangers') +
    getPieceCount(spacePieces, 'arvn-bases')
  );
}

/**
 * Compute Insurgent forces for a space: NVA troops + NVA guerrillas +
 * NVA bases + VC guerrillas + VC bases
 */
function insurgentForces(spacePieces: ReadonlyMap<string, number> | undefined): number {
  return (
    getPieceCount(spacePieces, 'nva-troops') +
    getPieceCount(spacePieces, 'nva-guerrillas') +
    getPieceCount(spacePieces, 'nva-bases') +
    getPieceCount(spacePieces, 'vc-guerrillas') +
    getPieceCount(spacePieces, 'vc-bases')
  );
}

/** Compute NVA forces alone for a space. */
function nvaForces(spacePieces: ReadonlyMap<string, number> | undefined): number {
  return (
    getPieceCount(spacePieces, 'nva-troops') +
    getPieceCount(spacePieces, 'nva-guerrillas') +
    getPieceCount(spacePieces, 'nva-bases')
  );
}

/** Compute all other forces (non-NVA) for a space. */
function nonNvaForces(spacePieces: ReadonlyMap<string, number> | undefined): number {
  return (
    getPieceCount(spacePieces, 'us-troops') +
    getPieceCount(spacePieces, 'us-bases') +
    getPieceCount(spacePieces, 'us-irregulars') +
    getPieceCount(spacePieces, 'arvn-troops') +
    getPieceCount(spacePieces, 'arvn-police') +
    getPieceCount(spacePieces, 'arvn-rangers') +
    getPieceCount(spacePieces, 'arvn-bases') +
    getPieceCount(spacePieces, 'vc-guerrillas') +
    getPieceCount(spacePieces, 'vc-bases')
  );
}

function getAlignmentWeight(state: string): number {
  switch (state) {
    case 'activeSupport':
      return 2;
    case 'passiveSupport':
      return 1;
    case 'activeOpposition':
      return -2;
    case 'passiveOpposition':
      return -1;
    default:
      return 0;
  }
}

/**
 * Get the alignment marker state for a given space from scenario initial markers.
 * Falls back to 'neutral' (the lattice default) if no marker is specified.
 */
function getAlignmentState(
  markers: readonly { readonly spaceId: string; readonly markerId: string; readonly state: string }[] | undefined,
  spaceId: string,
): string {
  if (!markers) return 'neutral';
  const marker = markers.find((m) => m.spaceId === spaceId && m.markerId === 'supportOpposition');
  return marker?.state ?? 'neutral';
}

interface VictoryMarkers {
  readonly us: number;
  readonly arvn: number;
  readonly vc: number;
  readonly nva: number;
}

function getPopulation(space: MapSpaceInput): number {
  const pop = space.attributes?.population;
  return typeof pop === 'number' ? pop : 0;
}

function getEcon(space: MapSpaceInput): number {
  const econ = space.attributes?.econ;
  return typeof econ === 'number' ? econ : 0;
}

function computeVictoryMarkers(
  scenario: ScenarioPayload,
  catalogPayload: PieceCatalogPayload,
  spaces: readonly MapSpaceInput[],
): VictoryMarkers {
  const placements = scenario.initialPlacements ?? [];
  const spacePieceMap = buildSpacePieceMap(placements);
  const markers = (scenario.initializations ?? [])
    .filter((entry): entry is { readonly spaceId: string; readonly markerId: string; readonly state: string } => 'spaceId' in entry)
    .map((entry) => ({ spaceId: entry.spaceId, markerId: entry.markerId, state: entry.state }));
  const outOfPlay = scenario.outOfPlay;
  const patronageInitialization = (scenario.initializations ?? []).find(
    (entry): entry is { readonly trackId: string; readonly value: number } =>
      'trackId' in entry && entry.trackId === 'patronage',
  );
  const patronage = patronageInitialization?.value ?? 0;

  // Total Support: sum of pop * weight for spaces with support (positive weight)
  let totalSupport = 0;
  for (const space of spaces) {
    const pop = getPopulation(space);
    if (pop === 0) continue;
    const alignState = getAlignmentState(markers, space.id);
    const weight = getAlignmentWeight(alignState);
    if (weight > 0) {
      totalSupport += pop * weight;
    }
  }

  // Total Opposition: sum of pop * |weight| for spaces with opposition (negative weight)
  let totalOpposition = 0;
  for (const space of spaces) {
    const pop = getPopulation(space);
    if (pop === 0) continue;
    const alignState = getAlignmentState(markers, space.id);
    const weight = getAlignmentWeight(alignState);
    if (weight < 0) {
      totalOpposition += pop * Math.abs(weight);
    }
  }

  // Available US Troops and Bases
  const totalUsTroops = getInventoryTotal(catalogPayload.inventory, 'us-troops');
  const placedUsTroops = sumPlacedByPieceType(placements).get('us-troops') ?? 0;
  const oopUsTroops = getOutOfPlayCount(outOfPlay, 'us-troops');
  const availableUsTroops = totalUsTroops - placedUsTroops - oopUsTroops;

  const totalUsBases = getInventoryTotal(catalogPayload.inventory, 'us-bases');
  const placedUsBases = sumPlacedByPieceType(placements).get('us-bases') ?? 0;
  const oopUsBases = getOutOfPlayCount(outOfPlay, 'us-bases');
  const availableUsBases = totalUsBases - placedUsBases - oopUsBases;

  // US marker = Total Support + Available US Troops + Available US Bases
  const us = totalSupport + availableUsTroops + availableUsBases;

  // COIN-Controlled Population: sum of pop for spaces where COIN > Insurgent
  let coinControlledPop = 0;
  for (const space of spaces) {
    const pop = getPopulation(space);
    if (pop === 0) continue;
    const pieces = spacePieceMap.get(space.id);
    const coin = coinForces(pieces);
    const ins = insurgentForces(pieces);
    if (coin > ins) {
      coinControlledPop += pop;
    }
  }

  // ARVN marker = COIN-Controlled Population + Patronage
  const arvn = coinControlledPop + patronage;

  // VC Bases on map = total placed VC bases
  const vcBasesOnMap = sumPlacedByPieceType(placements).get('vc-bases') ?? 0;

  // VC marker = Total Opposition + VC Bases on map
  const vc = totalOpposition + vcBasesOnMap;

  // NVA-Controlled Population: sum of pop for spaces where NVA forces alone > all other forces
  let nvaControlledPop = 0;
  for (const space of spaces) {
    const pop = getPopulation(space);
    if (pop === 0) continue;
    const pieces = spacePieceMap.get(space.id);
    const nva = nvaForces(pieces);
    const others = nonNvaForces(pieces);
    if (nva > others) {
      nvaControlledPop += pop;
    }
  }

  // NVA Bases on map = total placed NVA bases
  const nvaBasesOnMap = sumPlacedByPieceType(placements).get('nva-bases') ?? 0;

  // NVA marker = NVA-Controlled Population + NVA Bases on map
  const nvaMarker = nvaControlledPop + nvaBasesOnMap;

  return { us, arvn, vc, nva: nvaMarker };
}

/**
 * Compute totalEcon: sum of econ values for COIN-controlled LoCs.
 * In FITL, a LoC is COIN-controlled (not sabotaged) when there are
 * no insurgent forces present on it. This differs from province/city
 * control which uses COIN > Insurgent.
 */
function computeTotalEcon(
  scenario: ScenarioPayload,
  spaces: readonly MapSpaceInput[],
): number {
  const placements = scenario.initialPlacements ?? [];
  const spacePieceMap = buildSpacePieceMap(placements);

  let totalEcon = 0;
  for (const space of spaces) {
    if (space.category !== 'loc') continue;
    const econ = getEcon(space);
    if (econ === 0) continue;
    const pieces = spacePieceMap.get(space.id);
    const ins = insurgentForces(pieces);
    if (ins === 0) {
      totalEcon += econ;
    }
  }

  return totalEcon;
}

// ─── Conservation Table Golden Values ───────────────────────────────────────

interface ConservationRow {
  readonly pieceTypeId: string;
  readonly placed: number;
  readonly outOfPlay: number;
  readonly available: number;
  readonly total: number;
}

const FULL_CONSERVATION: readonly ConservationRow[] = [
  { pieceTypeId: 'us-troops', placed: 9, outOfPlay: 10, available: 21, total: 40 },
  { pieceTypeId: 'us-bases', placed: 2, outOfPlay: 2, available: 2, total: 6 },
  { pieceTypeId: 'us-irregulars', placed: 3, outOfPlay: 0, available: 3, total: 6 },
  { pieceTypeId: 'arvn-troops', placed: 12, outOfPlay: 10, available: 8, total: 30 },
  { pieceTypeId: 'arvn-police', placed: 20, outOfPlay: 0, available: 10, total: 30 },
  { pieceTypeId: 'arvn-rangers', placed: 1, outOfPlay: 3, available: 2, total: 6 },
  { pieceTypeId: 'arvn-bases', placed: 0, outOfPlay: 2, available: 1, total: 3 },
  { pieceTypeId: 'nva-troops', placed: 0, outOfPlay: 0, available: 40, total: 40 },
  { pieceTypeId: 'nva-guerrillas', placed: 12, outOfPlay: 0, available: 8, total: 20 },
  { pieceTypeId: 'nva-bases', placed: 4, outOfPlay: 0, available: 5, total: 9 },
  { pieceTypeId: 'vc-guerrillas', placed: 16, outOfPlay: 0, available: 14, total: 30 },
  { pieceTypeId: 'vc-bases', placed: 7, outOfPlay: 0, available: 2, total: 9 },
];

const SHORT_CONSERVATION: readonly ConservationRow[] = [
  { pieceTypeId: 'us-troops', placed: 22, outOfPlay: 6, available: 12, total: 40 },
  { pieceTypeId: 'us-bases', placed: 4, outOfPlay: 0, available: 2, total: 6 },
  { pieceTypeId: 'us-irregulars', placed: 3, outOfPlay: 0, available: 3, total: 6 },
  { pieceTypeId: 'arvn-troops', placed: 12, outOfPlay: 10, available: 8, total: 30 },
  { pieceTypeId: 'arvn-police', placed: 19, outOfPlay: 0, available: 11, total: 30 },
  { pieceTypeId: 'arvn-rangers', placed: 3, outOfPlay: 3, available: 0, total: 6 },
  { pieceTypeId: 'arvn-bases', placed: 1, outOfPlay: 0, available: 2, total: 3 },
  { pieceTypeId: 'nva-troops', placed: 12, outOfPlay: 0, available: 28, total: 40 },
  { pieceTypeId: 'nva-guerrillas', placed: 14, outOfPlay: 0, available: 6, total: 20 },
  { pieceTypeId: 'nva-bases', placed: 8, outOfPlay: 0, available: 1, total: 9 },
  { pieceTypeId: 'vc-guerrillas', placed: 14, outOfPlay: 0, available: 16, total: 30 },
  { pieceTypeId: 'vc-bases', placed: 5, outOfPlay: 0, available: 4, total: 9 },
];

const MEDIUM_CONSERVATION: readonly ConservationRow[] = [
  { pieceTypeId: 'us-troops', placed: 30, outOfPlay: 5, available: 5, total: 40 },
  { pieceTypeId: 'us-bases', placed: 6, outOfPlay: 0, available: 0, total: 6 },
  { pieceTypeId: 'us-irregulars', placed: 6, outOfPlay: 0, available: 0, total: 6 },
  { pieceTypeId: 'arvn-troops', placed: 20, outOfPlay: 10, available: 0, total: 30 },
  { pieceTypeId: 'arvn-police', placed: 26, outOfPlay: 0, available: 4, total: 30 },
  { pieceTypeId: 'arvn-rangers', placed: 3, outOfPlay: 3, available: 0, total: 6 },
  { pieceTypeId: 'arvn-bases', placed: 1, outOfPlay: 0, available: 2, total: 3 },
  { pieceTypeId: 'nva-troops', placed: 18, outOfPlay: 0, available: 22, total: 40 },
  { pieceTypeId: 'nva-guerrillas', placed: 18, outOfPlay: 0, available: 2, total: 20 },
  { pieceTypeId: 'nva-bases', placed: 8, outOfPlay: 0, available: 1, total: 9 },
  { pieceTypeId: 'vc-guerrillas', placed: 23, outOfPlay: 0, available: 7, total: 30 },
  { pieceTypeId: 'vc-bases', placed: 8, outOfPlay: 0, available: 1, total: 9 },
];

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('FITL scenario conservation and golden validation', () => {
  const data = loadFitlData();
  const spaces = data.mapPayload.spaces;

  const scenarioConfigs = [
    { id: 'fitl-scenario-full', label: 'full', conservation: FULL_CONSERVATION },
    { id: 'fitl-scenario-short', label: 'short', conservation: SHORT_CONSERVATION },
    { id: 'fitl-scenario-medium', label: 'medium', conservation: MEDIUM_CONSERVATION },
  ] as const;

  // ── Piece Conservation ──────────────────────────────────────────────────

  for (const { id, label, conservation } of scenarioConfigs) {
    describe(`piece conservation — ${label} scenario`, () => {
      const scenario = data.scenarios.get(id)!;
      const placements = scenario.initialPlacements ?? [];
      const placedCounts = sumPlacedByPieceType(placements);

      for (const row of conservation) {
        it(`${row.pieceTypeId}: placed=${row.placed}, outOfPlay=${row.outOfPlay}, available=${row.available}, total=${row.total}`, () => {
          const total = getInventoryTotal(data.catalogPayload.inventory, row.pieceTypeId);
          assert.equal(total, row.total, `${row.pieceTypeId} inventory total`);

          const placed = placedCounts.get(row.pieceTypeId) ?? 0;
          assert.equal(placed, row.placed, `${row.pieceTypeId} placed count`);

          const outOfPlay = getOutOfPlayCount(scenario.outOfPlay, row.pieceTypeId);
          assert.equal(outOfPlay, row.outOfPlay, `${row.pieceTypeId} out-of-play count`);

          const available = total - placed - outOfPlay;
          assert.equal(available >= 0, true, `${row.pieceTypeId} available must be non-negative (got ${available})`);
          assert.equal(available, row.available, `${row.pieceTypeId} available count`);
          assert.equal(placed + outOfPlay + available, total, `${row.pieceTypeId} conservation: placed + outOfPlay + available === total`);
        });
      }
    });
  }

  // ── Golden Victory Markers ──────────────────────────────────────────────

  const goldenMarkers = new Map<string, VictoryMarkers>([
    ['fitl-scenario-full', { us: 38, arvn: 35, vc: 27, nva: 4 }],
    ['fitl-scenario-short', { us: 38, arvn: 41, vc: 23, nva: 10 }],
    ['fitl-scenario-medium', { us: 37, arvn: 44, vc: 23, nva: 8 }],
  ]);

  for (const { id, label } of scenarioConfigs) {
    describe(`golden victory markers — ${label} scenario`, () => {
      const scenario = data.scenarios.get(id)!;
      const computed = computeVictoryMarkers(scenario, data.catalogPayload, spaces);
      const expected = goldenMarkers.get(id)!;

      it(`US marker = ${expected.us}`, () => {
        assert.equal(computed.us, expected.us, `US victory marker for ${label}`);
      });

      it(`ARVN marker = ${expected.arvn}`, () => {
        assert.equal(computed.arvn, expected.arvn, `ARVN victory marker for ${label}`);
      });

      it(`VC marker = ${expected.vc}`, () => {
        assert.equal(computed.vc, expected.vc, `VC victory marker for ${label}`);
      });

      it(`NVA marker = ${expected.nva}`, () => {
        assert.equal(computed.nva, expected.nva, `NVA victory marker for ${label}`);
      });
    });
  }

  // ── TotalEcon ───────────────────────────────────────────────────────────

  describe('totalEcon — all scenarios', () => {
    for (const { id, label } of scenarioConfigs) {
      it(`${label} scenario totalEcon = 15`, () => {
        const scenario = data.scenarios.get(id)!;
        const totalEcon = computeTotalEcon(scenario, spaces);
        assert.equal(totalEcon, 15, `totalEcon for ${label} scenario`);
      });
    }
  });

  // ── Control Annotation Spot Checks ──────────────────────────────────────

  describe('control annotation spot checks', () => {
    for (const { id, label } of scenarioConfigs) {
      describe(`${label} scenario`, () => {
        const scenario = data.scenarios.get(id)!;
        const placements = scenario.initialPlacements ?? [];
        const spacePieceMap = buildSpacePieceMap(placements);

        it('Saigon is COIN-controlled', () => {
          const pieces = spacePieceMap.get('saigon:none');
          const coin = coinForces(pieces);
          const ins = insurgentForces(pieces);
          assert.equal(coin > ins, true, `Saigon COIN (${coin}) > Insurgent (${ins}) in ${label}`);
        });
      });
    }

    // Full scenario: NVA bases exist in North Vietnam, Central Laos, Southern Laos, Parrot's Beak
    // but these are Pop 0 provinces so no NVA-controlled population
    describe('full scenario — foreign bases have no population control', () => {
      const scenario = data.scenarios.get('fitl-scenario-full')!;
      const placements = scenario.initialPlacements ?? [];
      const spacePieceMap = buildSpacePieceMap(placements);

      for (const spaceId of [
        'north-vietnam:none',
        'central-laos:none',
        'southern-laos:none',
        'the-parrots-beak:none',
      ]) {
        it(`${spaceId} has Pop 0 (no population control impact)`, () => {
          const space = spaces.find((s) => s.id === spaceId);
          assert.ok(space, `Space ${spaceId} not found`);
          assert.equal(getPopulation(space), 0, `${spaceId} should have Pop 0`);
          // NVA controls these spaces, but Pop 0 means no contribution to NVA-Controlled Pop
          const pieces = spacePieceMap.get(spaceId);
          const nva = nvaForces(pieces);
          assert.equal(nva > 0, true, `${spaceId} should have NVA presence`);
        });
      }
    });

    // Short scenario: Quang Tri has NVA forces > others (NVA 5 vs ARVN 3)
    describe('short scenario — Quang Tri NVA-controlled', () => {
      const scenario = data.scenarios.get('fitl-scenario-short')!;
      const placements = scenario.initialPlacements ?? [];
      const spacePieceMap = buildSpacePieceMap(placements);

      it('Quang Tri has NVA forces > all other forces', () => {
        const pieces = spacePieceMap.get('quang-tri-thua-thien:none');
        const nva = nvaForces(pieces);
        const others = nonNvaForces(pieces);
        assert.equal(nva > others, true, `Quang Tri NVA (${nva}) > others (${others})`);
      });
    });
  });
});
