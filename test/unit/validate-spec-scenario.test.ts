import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Diagnostic } from '../../src/kernel/diagnostics.js';
import { createEmptyGameSpecDoc } from '../../src/cnl/game-spec-doc.js';
import { validateGameSpec } from '../../src/cnl/validate-spec.js';

function createBaseDoc() {
  return {
    ...createEmptyGameSpecDoc(),
    metadata: { id: 'demo', players: { min: 2, max: 4 } },
    zones: [{ id: 'deck', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
    turnStructure: { phases: [{ id: 'main' }] },
    actions: [
      {
        id: 'draw',
        actor: { currentPlayer: true },
        phase: 'main',
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
    ],
    terminal: { conditions: [{ when: { always: false }, result: { type: 'draw' } }] },
  };
}

function createMapPayload() {
  return {
    spaces: [
      {
        id: 'saigon',
        spaceType: 'city',
        population: 6,
        econ: 0,
        terrainTags: ['urban'],
        country: 'south-vietnam',
        coastal: true,
        adjacentTo: ['hue'],
      },
      {
        id: 'hue',
        spaceType: 'city',
        population: 2,
        econ: 0,
        terrainTags: ['urban'],
        country: 'south-vietnam',
        coastal: true,
        adjacentTo: ['saigon'],
      },
    ],
    tracks: [
      { id: 'aid', scope: 'global', min: 0, max: 75, initial: 15 },
      { id: 'patronage', scope: 'faction', faction: 'arvn', min: 0, max: 50, initial: 15 },
    ],
    markerLattices: [
      { id: 'support', states: ['active-support', 'passive-support', 'neutral', 'passive-opposition', 'active-opposition'], defaultState: 'neutral' },
    ],
  };
}

function createPieceCatalogPayload() {
  return {
    pieceTypes: [
      {
        id: 'us-troops',
        faction: 'us',
        statusDimensions: [],
        transitions: [],
      },
      {
        id: 'nva-guerrillas',
        faction: 'nva',
        statusDimensions: ['activity'],
        transitions: [
          { dimension: 'activity', from: 'underground', to: 'active' },
          { dimension: 'activity', from: 'active', to: 'underground' },
        ],
      },
    ],
    inventory: [
      { pieceTypeId: 'us-troops', faction: 'us', total: 30 },
      { pieceTypeId: 'nva-guerrillas', faction: 'nva', total: 20 },
    ],
  };
}

function createDocWithScenario(scenarioPayload: Record<string, unknown>) {
  return {
    ...createBaseDoc(),
    dataAssets: [
      { id: 'test-map', kind: 'map', payload: createMapPayload() },
      { id: 'test-pieces', kind: 'pieceCatalog', payload: createPieceCatalogPayload() },
      {
        id: 'test-scenario',
        kind: 'scenario',
        payload: {
          mapAssetId: 'test-map',
          pieceCatalogAssetId: 'test-pieces',
          scenarioName: 'Test',
          yearRange: '1964-1972',
          ...scenarioPayload,
        },
      },
    ],
  };
}

function diagnosticsWithCode(diagnostics: readonly Diagnostic[], code: string): readonly Diagnostic[] {
  return diagnostics.filter((d) => d.code === code);
}

describe('validateGameSpec scenario cross-reference validation', () => {
  it('scenario with valid placements referencing existing map spaces produces no placement errors', () => {
    const diagnostics = validateGameSpec(
      createDocWithScenario({
        initialPlacements: [{ spaceId: 'saigon', pieceTypeId: 'us-troops', faction: 'us', count: 5 }],
      }),
    );

    assert.equal(diagnosticsWithCode(diagnostics, 'CNL_VALIDATOR_SCENARIO_PLACEMENT_SPACE_INVALID').length, 0);
    assert.equal(diagnosticsWithCode(diagnostics, 'CNL_VALIDATOR_SCENARIO_PLACEMENT_PIECE_INVALID').length, 0);
    assert.equal(diagnosticsWithCode(diagnostics, 'CNL_VALIDATOR_SCENARIO_PLACEMENT_FACTION_MISMATCH').length, 0);
  });

  it('scenario referencing a non-existent space ID emits CNL_VALIDATOR_SCENARIO_PLACEMENT_SPACE_INVALID', () => {
    const diagnostics = validateGameSpec(
      createDocWithScenario({
        initialPlacements: [{ spaceId: 'hanoi', pieceTypeId: 'us-troops', faction: 'us', count: 5 }],
      }),
    );

    const matches = diagnosticsWithCode(diagnostics, 'CNL_VALIDATOR_SCENARIO_PLACEMENT_SPACE_INVALID');
    assert.equal(matches.length, 1);
    assert.ok(matches[0]!.message.includes('hanoi'));
  });

  it('scenario referencing a non-existent piece type emits CNL_VALIDATOR_SCENARIO_PLACEMENT_PIECE_INVALID', () => {
    const diagnostics = validateGameSpec(
      createDocWithScenario({
        initialPlacements: [{ spaceId: 'saigon', pieceTypeId: 'arvn-rangers', faction: 'arvn', count: 2 }],
      }),
    );

    const matches = diagnosticsWithCode(diagnostics, 'CNL_VALIDATOR_SCENARIO_PLACEMENT_PIECE_INVALID');
    assert.equal(matches.length, 1);
    assert.ok(matches[0]!.message.includes('arvn-rangers'));
  });

  it('scenario with faction mismatch on placement emits CNL_VALIDATOR_SCENARIO_PLACEMENT_FACTION_MISMATCH', () => {
    const diagnostics = validateGameSpec(
      createDocWithScenario({
        initialPlacements: [{ spaceId: 'saigon', pieceTypeId: 'us-troops', faction: 'nva', count: 5 }],
      }),
    );

    const matches = diagnosticsWithCode(diagnostics, 'CNL_VALIDATOR_SCENARIO_PLACEMENT_FACTION_MISMATCH');
    assert.equal(matches.length, 1);
  });

  it('scenario with initialTrackValues out of bounds emits CNL_VALIDATOR_SCENARIO_TRACK_VALUE_OUT_OF_BOUNDS', () => {
    const diagnostics = validateGameSpec(
      createDocWithScenario({
        initialTrackValues: [{ trackId: 'aid', value: 100 }],
      }),
    );

    const matches = diagnosticsWithCode(diagnostics, 'CNL_VALIDATOR_SCENARIO_TRACK_VALUE_OUT_OF_BOUNDS');
    assert.equal(matches.length, 1);
    assert.ok(matches[0]!.message.includes('aid'));
  });

  it('scenario with unknown trackId emits CNL_VALIDATOR_SCENARIO_TRACK_VALUE_INVALID', () => {
    const diagnostics = validateGameSpec(
      createDocWithScenario({
        initialTrackValues: [{ trackId: 'unknown-track', value: 5 }],
      }),
    );

    const matches = diagnosticsWithCode(diagnostics, 'CNL_VALIDATOR_SCENARIO_TRACK_VALUE_INVALID');
    assert.equal(matches.length, 1);
    assert.ok(matches[0]!.message.includes('unknown-track'));
  });

  it('scenario with invalid marker state emits CNL_VALIDATOR_SCENARIO_MARKER_INVALID', () => {
    const diagnostics = validateGameSpec(
      createDocWithScenario({
        initialMarkers: [{ spaceId: 'saigon', markerId: 'support', state: 'allegiance' }],
      }),
    );

    const matches = diagnosticsWithCode(diagnostics, 'CNL_VALIDATOR_SCENARIO_MARKER_INVALID');
    assert.equal(matches.length, 1);
    assert.ok(matches[0]!.message.includes('allegiance'));
  });

  it('scenario with invalid marker spaceId emits CNL_VALIDATOR_SCENARIO_MARKER_INVALID', () => {
    const diagnostics = validateGameSpec(
      createDocWithScenario({
        initialMarkers: [{ spaceId: 'hanoi', markerId: 'support', state: 'neutral' }],
      }),
    );

    const matches = diagnosticsWithCode(diagnostics, 'CNL_VALIDATOR_SCENARIO_MARKER_INVALID');
    assert.equal(matches.length, 1);
    assert.ok(matches[0]!.message.includes('hanoi'));
  });

  it('scenario with unknown markerId emits CNL_VALIDATOR_SCENARIO_MARKER_INVALID', () => {
    const diagnostics = validateGameSpec(
      createDocWithScenario({
        initialMarkers: [{ spaceId: 'saigon', markerId: 'unknown-lattice', state: 'neutral' }],
      }),
    );

    const matches = diagnosticsWithCode(diagnostics, 'CNL_VALIDATOR_SCENARIO_MARKER_INVALID');
    assert.equal(matches.length, 1);
    assert.ok(matches[0]!.message.includes('unknown-lattice'));
  });

  it('scenario exceeding piece inventory emits CNL_VALIDATOR_SCENARIO_PIECE_CONSERVATION_VIOLATED', () => {
    const diagnostics = validateGameSpec(
      createDocWithScenario({
        initialPlacements: [{ spaceId: 'saigon', pieceTypeId: 'us-troops', faction: 'us', count: 25 }],
        outOfPlay: [{ pieceTypeId: 'us-troops', faction: 'us', count: 10 }],
      }),
    );

    const matches = diagnosticsWithCode(diagnostics, 'CNL_VALIDATOR_SCENARIO_PIECE_CONSERVATION_VIOLATED');
    assert.equal(matches.length, 1);
    assert.ok(matches[0]!.message.includes('us-troops'));
  });

  it('scenario within piece inventory limits emits no conservation violation', () => {
    const diagnostics = validateGameSpec(
      createDocWithScenario({
        initialPlacements: [{ spaceId: 'saigon', pieceTypeId: 'us-troops', faction: 'us', count: 10 }],
        outOfPlay: [{ pieceTypeId: 'us-troops', faction: 'us', count: 10 }],
      }),
    );

    assert.equal(diagnosticsWithCode(diagnostics, 'CNL_VALIDATOR_SCENARIO_PIECE_CONSERVATION_VIOLATED').length, 0);
  });

  it('scenario with invalid outOfPlay pieceTypeId emits CNL_VALIDATOR_SCENARIO_OUT_OF_PLAY_INVALID', () => {
    const diagnostics = validateGameSpec(
      createDocWithScenario({
        outOfPlay: [{ pieceTypeId: 'unknown-piece', faction: 'us', count: 5 }],
      }),
    );

    const matches = diagnosticsWithCode(diagnostics, 'CNL_VALIDATOR_SCENARIO_OUT_OF_PLAY_INVALID');
    assert.equal(matches.length, 1);
    assert.ok(matches[0]!.message.includes('unknown-piece'));
  });

  it('scenario with outOfPlay faction mismatch emits CNL_VALIDATOR_SCENARIO_OUT_OF_PLAY_FACTION_MISMATCH', () => {
    const diagnostics = validateGameSpec(
      createDocWithScenario({
        outOfPlay: [{ pieceTypeId: 'us-troops', faction: 'nva', count: 1 }],
      }),
    );

    const matches = diagnosticsWithCode(diagnostics, 'CNL_VALIDATOR_SCENARIO_OUT_OF_PLAY_FACTION_MISMATCH');
    assert.equal(matches.length, 1);
    assert.ok(matches[0]!.message.includes('expected "us"'));
  });

  it('scenario with invalid usPolicy emits CNL_VALIDATOR_SCENARIO_US_POLICY_INVALID', () => {
    const diagnostics = validateGameSpec(
      createDocWithScenario({
        usPolicy: 'fdr',
      }),
    );

    const matches = diagnosticsWithCode(diagnostics, 'CNL_VALIDATOR_SCENARIO_US_POLICY_INVALID');
    assert.equal(matches.length, 1);
  });

  it('scenario with valid usPolicy emits no usPolicy error', () => {
    for (const policy of ['jfk', 'lbj', 'nixon']) {
      const diagnostics = validateGameSpec(createDocWithScenario({ usPolicy: policy }));
      assert.equal(diagnosticsWithCode(diagnostics, 'CNL_VALIDATOR_SCENARIO_US_POLICY_INVALID').length, 0);
    }
  });

  it('scenario without optional fields produces no cross-reference errors', () => {
    const diagnostics = validateGameSpec(createDocWithScenario({}));

    assert.equal(diagnosticsWithCode(diagnostics, 'CNL_VALIDATOR_SCENARIO_PLACEMENT_SPACE_INVALID').length, 0);
    assert.equal(diagnosticsWithCode(diagnostics, 'CNL_VALIDATOR_SCENARIO_PLACEMENT_PIECE_INVALID').length, 0);
    assert.equal(diagnosticsWithCode(diagnostics, 'CNL_VALIDATOR_SCENARIO_TRACK_VALUE_INVALID').length, 0);
    assert.equal(diagnosticsWithCode(diagnostics, 'CNL_VALIDATOR_SCENARIO_MARKER_INVALID').length, 0);
    assert.equal(diagnosticsWithCode(diagnostics, 'CNL_VALIDATOR_SCENARIO_OUT_OF_PLAY_INVALID').length, 0);
    assert.equal(diagnosticsWithCode(diagnostics, 'CNL_VALIDATOR_SCENARIO_OUT_OF_PLAY_FACTION_MISMATCH').length, 0);
    assert.equal(diagnosticsWithCode(diagnostics, 'CNL_VALIDATOR_SCENARIO_PIECE_CONSERVATION_VIOLATED').length, 0);
    assert.equal(diagnosticsWithCode(diagnostics, 'CNL_VALIDATOR_SCENARIO_US_POLICY_INVALID').length, 0);
  });
});
