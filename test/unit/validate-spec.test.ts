import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createEmptyGameSpecDoc } from '../../src/cnl/game-spec-doc.js';
import { validateGameSpec } from '../../src/cnl/validate-spec.js';

function createStructurallyValidDoc() {
  const validAction = {
    id: 'draw',
    actor: { currentPlayer: true },
    phase: 'main',
    params: [],
    pre: null,
    cost: [],
    effects: [],
    limits: [],
  };

  return {
    ...createEmptyGameSpecDoc(),
    metadata: { id: 'demo', players: { min: 2, max: 4 } },
    globalVars: [{ name: 'score', type: 'int', init: 0, min: 0, max: 10 }],
    perPlayerVars: [{ name: 'health', type: 'int', init: 5, min: 0, max: 10 }],
    zones: [{ id: 'deck', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
    turnStructure: { phases: [{ id: 'main' }], activePlayerOrder: 'roundRobin' },
    actions: [validAction],
    endConditions: [{ when: { always: false }, result: { type: 'draw' } }],
  };
}

describe('validateGameSpec structural rules', () => {
  it('returns zero diagnostics for a structurally valid doc', () => {
    const diagnostics = validateGameSpec(createStructurallyValidDoc());
    assert.equal(diagnostics.length, 0);
  });

  it('accepts optional sourceMap argument', () => {
    const diagnostics = validateGameSpec(createStructurallyValidDoc(), { sourceMap: { byPath: {} } });
    assert.equal(diagnostics.length, 0);
  });

  it('emits missing required section diagnostics', () => {
    const diagnostics = validateGameSpec(createEmptyGameSpecDoc());
    assert.equal(diagnostics.length, 5);
    assert.deepEqual(
      diagnostics.map((diagnostic) => diagnostic.path).sort(),
      ['doc.actions', 'doc.endConditions', 'doc.metadata', 'doc.turnStructure', 'doc.zones'],
    );
  });

  it('does not require zones section when a map data asset is present', () => {
    const diagnostics = validateGameSpec({
      ...createStructurallyValidDoc(),
      zones: null,
      dataAssets: [{ id: 'fitl-map-foundation', kind: 'map', payload: { spaces: [] } }],
    });

    assert.equal(diagnostics.some((diagnostic) => diagnostic.path === 'doc.zones'), false);
  });

  it('validates scenario references against declared map and pieceCatalog assets', () => {
    const diagnostics = validateGameSpec({
      ...createStructurallyValidDoc(),
      dataAssets: [
        { id: 'fitl-map-foundation', kind: 'map', payload: { spaces: [] } },
        { id: 'fitl-pieces-foundation', kind: 'pieceCatalog', payload: { pieceTypes: [], inventory: [] } },
        {
          id: 'fitl-scenario-foundation',
          kind: 'scenario',
          payload: {
            mapAssetId: 'fitl-map-missing',
            pieceCatalogAssetId: 'fitl-pieces-missing',
          },
        },
      ],
    });

    assert.equal(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_VALIDATOR_REFERENCE_MISSING' &&
          diagnostic.path === 'doc.dataAssets.2.payload.mapAssetId',
      ),
      true,
    );
    assert.equal(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_VALIDATOR_REFERENCE_MISSING' &&
          diagnostic.path === 'doc.dataAssets.2.payload.pieceCatalogAssetId',
      ),
      true,
    );
  });

  it('accepts event-card-set data assets through the shared data-asset validator path', () => {
    const diagnostics = validateGameSpec({
      ...createStructurallyValidDoc(),
      dataAssets: [
        {
          id: 'fitl-event-cards-initial',
          kind: 'eventCardSet',
          payload: {
            cards: [
              {
                id: 'card-82',
                title: 'Domino Theory',
                sideMode: 'dual',
                unshaded: { effects: [{ op: 'branch-a' }] },
                shaded: {
                  targets: [{ id: 't', selector: { query: 'piecesInPool' }, cardinality: { max: 3 } }],
                },
              },
            ],
          },
        },
      ],
    });

    assert.equal(
      diagnostics.some((diagnostic) => diagnostic.path === 'doc.dataAssets.0.kind' && diagnostic.code === 'DATA_ASSET_KIND_UNSUPPORTED'),
      false,
    );
  });

  it('surfaces malformed event-card-set diagnostics with nested payload paths', () => {
    const diagnostics = validateGameSpec({
      ...createStructurallyValidDoc(),
      dataAssets: [
        {
          id: 'fitl-event-cards-invalid',
          kind: 'eventCardSet',
          payload: {
            cards: [
              {
                id: 'card-82',
                title: 'Domino Theory',
                sideMode: 'dual',
                unshaded: { effects: [{ op: 'branch-a' }] },
                shaded: {
                  targets: [{ id: 't', selector: { query: 'piecesInPool' }, cardinality: { min: 2, max: 1 } }],
                  lastingEffects: [{ id: 'l', duration: 'season', effect: { op: 'aidDelta', value: -9 } }],
                },
              },
            ],
          },
        },
      ],
    } as unknown as Parameters<typeof validateGameSpec>[0]);

    assert.equal(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'DATA_ASSET_EVENT_CARD_SCHEMA_INVALID' &&
          diagnostic.path === 'doc.dataAssets.0.payload.cards.0.shaded.targets.0.cardinality.min',
      ),
      true,
    );
    assert.equal(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'DATA_ASSET_EVENT_CARD_SCHEMA_INVALID' &&
          diagnostic.path === 'doc.dataAssets.0.payload.cards.0.shaded.lastingEffects.0.duration',
      ),
      true,
    );
  });

  it('validates metadata and variable ranges', () => {
    const diagnostics = validateGameSpec({
      ...createStructurallyValidDoc(),
      metadata: { id: 'demo', players: { min: 0, max: 0 } },
      globalVars: [{ name: 'score', type: 'int', init: 11, min: 5, max: 4 }],
    });
    assert.deepEqual(diagnostics.map((diagnostic) => diagnostic.code).sort(), [
      'CNL_VALIDATOR_METADATA_PLAYERS_MIN_TOO_LOW',
      'CNL_VALIDATOR_VARIABLE_INIT_OUT_OF_RANGE',
      'CNL_VALIDATOR_VARIABLE_MIN_GT_MAX',
    ]);
  });

  it('validates zone enums', () => {
    const diagnostics = validateGameSpec({
      ...createStructurallyValidDoc(),
      zones: [{ id: 'deck', owner: 'any', visibility: 'team', ordering: 'ring' }],
    });
    assert.deepEqual(diagnostics.map((diagnostic) => diagnostic.path), [
      'doc.zones.0.ordering',
      'doc.zones.0.owner',
      'doc.zones.0.visibility',
    ]);
  });

  it('validates action required fields and shape constraints', () => {
    const validDoc = createStructurallyValidDoc();
    const baseAction = validDoc.actions![0]!;
    const diagnostics = validateGameSpec({
      ...validDoc,
      actions: [{ ...baseAction, id: '', phase: '', actor: null, effects: {} as unknown as unknown[] }],
    });
    assert.deepEqual(diagnostics.map((diagnostic) => diagnostic.path), [
      'doc.actions.0.actor',
      'doc.actions.0.effects',
      'doc.actions.0.id',
      'doc.actions.0.phase',
    ]);
  });

  it('validates turn structure shape', () => {
    const diagnostics = validateGameSpec({
      ...createStructurallyValidDoc(),
      turnStructure: { phases: [], activePlayerOrder: 'zigzag' },
    });
    assert.deepEqual(diagnostics.map((diagnostic) => diagnostic.path), [
      'doc.actions.0.phase',
      'doc.turnStructure.activePlayerOrder',
      'doc.turnStructure.phases',
    ]);
  });

  it('accepts a valid optional turnFlow section', () => {
    const diagnostics = validateGameSpec({
      ...createStructurallyValidDoc(),
      turnFlow: {
        cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
        eligibility: {
          factions: ['us', 'arvn', 'nva', 'vc'],
          overrideWindows: [{ id: 'remain-eligible', duration: 'nextCard' }],
        },
        optionMatrix: [{ first: 'event', second: ['operation', 'operationPlusSpecialActivity'] }],
        passRewards: [{ factionClass: 'coin', resource: 'arvnResources', amount: 3 }],
        durationWindows: ['card', 'nextCard', 'coup', 'campaign'],
      },
    });

    assert.equal(diagnostics.some((diagnostic) => diagnostic.path.startsWith('doc.turnFlow')), false);
  });

  it('reports malformed turnFlow with explicit nested paths', () => {
    const diagnostics = validateGameSpec({
      ...createStructurallyValidDoc(),
      turnFlow: {
        cardLifecycle: { played: 'played:none', lookahead: '', leader: 'leader:none' },
        eligibility: {
          factions: ['us', ''],
          overrideWindows: [{ id: 'window-a', duration: 'season' }],
        },
        optionMatrix: [{ first: 'event', second: ['operation', 'invalid'] }],
        passRewards: [{ factionClass: 'coin', resource: 'arvnResources', amount: '3' }],
        durationWindows: ['campaign', 'epoch'],
      },
    } as unknown as Parameters<typeof validateGameSpec>[0]);

    assert.equal(
      diagnostics.some((diagnostic) => diagnostic.path === 'doc.turnFlow.eligibility.overrideWindows.0.duration'),
      true,
    );
    assert.equal(
      diagnostics.some((diagnostic) => diagnostic.path === 'doc.turnFlow.optionMatrix.0.second.1'),
      true,
    );
    assert.equal(
      diagnostics.some((diagnostic) => diagnostic.path === 'doc.turnFlow.passRewards.0.amount'),
      true,
    );
    assert.equal(
      diagnostics.some((diagnostic) => diagnostic.path === 'doc.turnFlow.durationWindows.1'),
      true,
    );
  });

  it('accepts valid optional operationProfiles section', () => {
    const diagnostics = validateGameSpec({
      ...createStructurallyValidDoc(),
      operationProfiles: [
        {
          id: 'op-pass',
          actionId: 'draw',
          legality: { when: 'always' },
          cost: { spend: 0 },
          targeting: { select: 'none' },
          resolution: [{ stage: 'resolve' }],
          partialExecution: { mode: 'forbid' },
        },
      ],
    });

    assert.equal(diagnostics.some((diagnostic) => diagnostic.path.startsWith('doc.operationProfiles')), false);
  });

  it('reports incomplete or ambiguous operationProfiles with explicit nested paths', () => {
    const diagnostics = validateGameSpec({
      ...createStructurallyValidDoc(),
      operationProfiles: [
        {
          id: 'op-pass-a',
          actionId: 'draw',
          legality: null,
          cost: {},
          targeting: {},
          resolution: [],
          partialExecution: { mode: 'invalid' },
        },
        {
          id: 'op-pass-b',
          actionId: 'draw',
          legality: {},
          cost: {},
          targeting: {},
          resolution: [{ stage: 'resolve' }],
          partialExecution: { mode: 'forbid' },
        },
        {
          id: 'op-missing-action',
          actionId: 'unknown-action',
          legality: {},
          cost: {},
          targeting: {},
          resolution: [{ stage: 'resolve' }],
          partialExecution: { mode: 'forbid' },
        },
      ],
    } as unknown as Parameters<typeof validateGameSpec>[0]);

    assert.equal(
      diagnostics.some((diagnostic) => diagnostic.path === 'doc.operationProfiles.0.legality'),
      true,
    );
    assert.equal(
      diagnostics.some((diagnostic) => diagnostic.path === 'doc.operationProfiles.0.resolution'),
      true,
    );
    assert.equal(
      diagnostics.some((diagnostic) => diagnostic.path === 'doc.operationProfiles.0.partialExecution.mode'),
      true,
    );
    assert.equal(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_VALIDATOR_OPERATION_PROFILE_ACTION_MAPPING_AMBIGUOUS' &&
          diagnostic.path === 'doc.operationProfiles',
      ),
      true,
    );
    assert.equal(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_VALIDATOR_REFERENCE_MISSING' &&
          diagnostic.path === 'doc.operationProfiles.2.actionId',
      ),
      true,
    );
  });

  it('reports missing phase reference in action with alternatives', () => {
    const diagnostics = validateGameSpec({
      ...createStructurallyValidDoc(),
      actions: [
        {
          ...createStructurallyValidDoc().actions![0]!,
          phase: 'mian',
        },
      ],
    });
    const missingPhase = diagnostics.find((diagnostic) => diagnostic.path === 'doc.actions.0.phase');
    assert.ok(missingPhase);
    assert.equal(missingPhase.code, 'CNL_VALIDATOR_REFERENCE_MISSING');
    assert.deepEqual(missingPhase.alternatives, ['main']);
  });

  it('reports unknown keys with fuzzy suggestion', () => {
    const diagnostics = validateGameSpec({
      ...createStructurallyValidDoc(),
      actions: [
        {
          ...createStructurallyValidDoc().actions![0]!,
          effcts: [],
        } as unknown as (ReturnType<typeof createStructurallyValidDoc>['actions'][number]),
      ],
    });
    const unknownKey = diagnostics.find((diagnostic) => diagnostic.path === 'doc.actions.0.effcts');
    assert.ok(unknownKey);
    assert.equal(unknownKey.code, 'CNL_VALIDATOR_UNKNOWN_KEY');
    assert.equal(unknownKey.severity, 'warning');
    assert.deepEqual(unknownKey.alternatives, ['effects']);
  });

  it('reports duplicate IDs after NFC normalization', () => {
    const diagnostics = validateGameSpec({
      ...createStructurallyValidDoc(),
      zones: [
        { id: 'café', owner: 'none', visibility: 'hidden', ordering: 'stack' },
        { id: 'cafe\u0301', owner: 'none', visibility: 'hidden', ordering: 'stack' },
      ],
    });
    const duplicate = diagnostics.find((diagnostic) => diagnostic.code === 'CNL_VALIDATOR_IDENTIFIER_DUPLICATE_NORMALIZED');
    assert.ok(duplicate);
    assert.equal(duplicate.path, 'doc.zones.1');
  });

  it('validates trigger references and zone adjacency references', () => {
    const diagnostics = validateGameSpec({
      ...createStructurallyValidDoc(),
      zones: [
        { id: 'deck', owner: 'none', visibility: 'hidden', ordering: 'stack', adjacentTo: ['disard'] },
        { id: 'discard', owner: 'none', visibility: 'hidden', ordering: 'stack' },
      ],
      triggers: [
        {
          event: { type: 'phaseEnter', phase: 'mian' },
          effects: [],
        },
        {
          event: { type: 'actionResolved', action: 'drwa' },
          effects: [],
        },
      ],
    });

    assert.equal(
      diagnostics.some((diagnostic) => diagnostic.path === 'doc.zones.0.adjacentTo.0' && diagnostic.code === 'CNL_VALIDATOR_REFERENCE_MISSING'),
      true,
    );
    assert.equal(
      diagnostics.some((diagnostic) => diagnostic.path === 'doc.triggers.0.event.phase' && diagnostic.code === 'CNL_VALIDATOR_REFERENCE_MISSING'),
      true,
    );
    assert.equal(
      diagnostics.some((diagnostic) => diagnostic.path === 'doc.triggers.1.event.action' && diagnostic.code === 'CNL_VALIDATOR_REFERENCE_MISSING'),
      true,
    );
  });

  it('returns deterministically ordered diagnostics for identical input', () => {
    const doc = {
      ...createStructurallyValidDoc(),
      actions: [
        {
          ...createStructurallyValidDoc().actions![0]!,
          phase: 'mian',
          effcts: [],
        } as unknown as (ReturnType<typeof createStructurallyValidDoc>['actions'][number]),
      ],
      zones: [
        { id: 'café', owner: 'none', visibility: 'hidden', ordering: 'stack', adjacentTo: ['disard'] },
        { id: 'cafe\u0301', owner: 'none', visibility: 'hidden', ordering: 'stack' },
      ],
    };

    const first = validateGameSpec(doc);
    const second = validateGameSpec(doc);
    assert.deepEqual(first, second);
  });

  it('does not throw and does not mutate input for malformed content', () => {
    const malformedDoc = {
      ...createStructurallyValidDoc(),
      metadata: { id: '', players: { min: Number.NaN, max: Number.NaN } },
      actions: [42],
    };
    const before = structuredClone(malformedDoc);

    assert.doesNotThrow(() => validateGameSpec(malformedDoc as unknown as Parameters<typeof validateGameSpec>[0]));
    validateGameSpec(malformedDoc as unknown as Parameters<typeof validateGameSpec>[0]);

    assert.deepEqual(malformedDoc, before);
  });
});
