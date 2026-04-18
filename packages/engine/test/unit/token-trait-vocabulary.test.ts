// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createEmptyGameSpecDoc } from '../../src/cnl/game-spec-doc.js';
import { deriveTokenTraitVocabularyFromGameSpecDoc } from '../../src/cnl/token-trait-vocabulary.js';

describe('deriveTokenTraitVocabularyFromGameSpecDoc', () => {
  it('infers vocabulary from a single pieceCatalog when no scenario exists', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      dataAssets: [
        {
          id: 'pieces',
          kind: 'pieceCatalog' as const,
          payload: {
            pieceTypes: [
              {
                id: 'unit-a',
                seat: 'us',
                runtimeProps: { posture: 'ready' },
                statusDimensions: [],
                transitions: [],
              },
            ],
            inventory: [{ pieceTypeId: 'unit-a', seat: 'us', total: 1 }],
          },
        },
      ],
    };

    assert.deepEqual(deriveTokenTraitVocabularyFromGameSpecDoc(doc), { posture: ['ready'] });
  });

  it('returns null when metadata.defaultScenarioAssetId references an unknown scenario even with a singleton pieceCatalog', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'demo', players: { min: 2, max: 2 }, defaultScenarioAssetId: 'scenario-missing' },
      dataAssets: [
        {
          id: 'pieces',
          kind: 'pieceCatalog' as const,
          payload: {
            pieceTypes: [
              {
                id: 'unit-a',
                seat: 'us',
                runtimeProps: { posture: 'ready' },
                statusDimensions: [],
                transitions: [],
              },
            ],
            inventory: [{ pieceTypeId: 'unit-a', seat: 'us', total: 1 }],
          },
        },
      ],
    };

    assert.equal(deriveTokenTraitVocabularyFromGameSpecDoc(doc), null);
  });

  it('returns null when scenario selection is ambiguous and pieceCatalog cannot be inferred', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      dataAssets: [
        {
          id: 'pieces-a',
          kind: 'pieceCatalog' as const,
          payload: {
            pieceTypes: [{ id: 'unit-a', seat: 'us', runtimeProps: { posture: 'ready' }, statusDimensions: [], transitions: [] }],
            inventory: [{ pieceTypeId: 'unit-a', seat: 'us', total: 1 }],
          },
        },
        {
          id: 'pieces-b',
          kind: 'pieceCatalog' as const,
          payload: {
            pieceTypes: [{ id: 'unit-b', seat: 'nva', runtimeProps: { posture: 'hidden' }, statusDimensions: [], transitions: [] }],
            inventory: [{ pieceTypeId: 'unit-b', seat: 'nva', total: 1 }],
          },
        },
        {
          id: 'scenario-a',
          kind: 'scenario' as const,
          payload: { pieceCatalogAssetId: 'pieces-a', scenarioName: 'A', yearRange: '1964-1972' },
        },
        {
          id: 'scenario-b',
          kind: 'scenario' as const,
          payload: { pieceCatalogAssetId: 'pieces-a', scenarioName: 'B', yearRange: '1964-1972' },
        },
      ],
    };

    assert.equal(deriveTokenTraitVocabularyFromGameSpecDoc(doc), null);
  });

  it('uses metadata.defaultScenarioAssetId to select the scenario-linked pieceCatalog', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'demo', players: { min: 2, max: 2 }, defaultScenarioAssetId: 'scenario-b' },
      dataAssets: [
        {
          id: 'pieces-a',
          kind: 'pieceCatalog' as const,
          payload: {
            pieceTypes: [{ id: 'unit-a', seat: 'us', runtimeProps: { posture: 'ready' }, statusDimensions: [], transitions: [] }],
            inventory: [{ pieceTypeId: 'unit-a', seat: 'us', total: 1 }],
          },
        },
        {
          id: 'pieces-b',
          kind: 'pieceCatalog' as const,
          payload: {
            pieceTypes: [{ id: 'unit-b', seat: 'nva', runtimeProps: { posture: 'hidden' }, statusDimensions: [], transitions: [] }],
            inventory: [{ pieceTypeId: 'unit-b', seat: 'nva', total: 1 }],
          },
        },
        {
          id: 'scenario-a',
          kind: 'scenario' as const,
          payload: { pieceCatalogAssetId: 'pieces-a', scenarioName: 'A', yearRange: '1964-1972' },
        },
        {
          id: 'scenario-b',
          kind: 'scenario' as const,
          payload: { pieceCatalogAssetId: 'pieces-b', scenarioName: 'B', yearRange: '1964-1972' },
        },
      ],
    };

    assert.deepEqual(deriveTokenTraitVocabularyFromGameSpecDoc(doc), { posture: ['hidden'] });
  });
});
