import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createEmptyGameSpecDoc } from '../../src/cnl/game-spec-doc.js';
import { validateGameSpec } from '../../src/cnl/validate-spec.js';

function createStructurallyValidDoc() {
  const validAction = {
    id: 'draw',
actor: { currentPlayer: true },
executor: 'actor',
phase: ['main'],
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
    turnStructure: { phases: [{ id: 'main' }] },
    actions: [validAction],
    terminal: { conditions: [{ when: { always: false }, result: { type: 'draw' } }] },
  };
}

describe('validateGameSpec structural rules', () => {
  it('returns zero diagnostics for a structurally valid doc', () => {
    const diagnostics = validateGameSpec(createStructurallyValidDoc());
    assert.equal(diagnostics.length, 0);
  });

  it('rejects authored macroOrigin fields in effect sections', () => {
    const diagnostics = validateGameSpec({
      ...createStructurallyValidDoc(),
      setup: [
        {
          forEach: {
            bind: '$p',
            macroOrigin: { macroId: 'authored', stem: 'setup' },
            over: { query: 'players' },
            effects: [],
          },
        },
      ],
      turnStructure: {
        phases: [
          {
            id: 'main',
            onEnter: [
              {
                forEach: {
                  bind: '$p',
                  macroOrigin: { macroId: 'authored', stem: 'onEnter' },
                  over: { query: 'players' },
                  effects: [],
                },
              },
            ],
          },
        ],
      },
      actions: [
        {
          ...createStructurallyValidDoc().actions[0],
          cost: [
            {
              forEach: {
                bind: '$p',
                macroOrigin: { macroId: 'authored', stem: 'cost' },
                over: { query: 'players' },
                effects: [],
              },
            },
          ],
          effects: [
            {
              reduce: {
                itemBind: '$n',
                accBind: '$acc',
                macroOrigin: { macroId: 'authored', stem: 'effects' },
                over: { query: 'intsInRange', min: 1, max: 2 },
                initial: 0,
                next: 0,
                resultBind: '$sum',
                in: [],
              },
            },
          ],
        },
      ],
    } as Parameters<typeof validateGameSpec>[0]);

    const macroOriginDiagnostics = diagnostics.filter(
      (diagnostic) => diagnostic.code === 'CNL_VALIDATOR_EFFECT_MACRO_ORIGIN_FORBIDDEN',
    );
    assert.equal(macroOriginDiagnostics.length, 4);
    assert.equal(
      macroOriginDiagnostics.some((diagnostic) => diagnostic.path === 'doc.setup.0.forEach.macroOrigin'),
      true,
    );
    assert.equal(
      macroOriginDiagnostics.some((diagnostic) => diagnostic.path === 'doc.turnStructure.phases.0.onEnter.0.forEach.macroOrigin'),
      true,
    );
    assert.equal(
      macroOriginDiagnostics.some((diagnostic) => diagnostic.path === 'doc.actions.0.cost.0.forEach.macroOrigin'),
      true,
    );
    assert.equal(
      macroOriginDiagnostics.some((diagnostic) => diagnostic.path === 'doc.actions.0.effects.0.reduce.macroOrigin'),
      true,
    );
  });

  it('rejects reserved compiler metadata keys in authored effect trees', () => {
    const diagnostics = validateGameSpec({
      ...createStructurallyValidDoc(),
      setup: [
        {
          setVar: {
            scope: 'global',
            var: 'score',
            value: 1,
            __compilerMeta: { source: 'authored' },
          },
        },
      ],
      actions: [
        {
          ...createStructurallyValidDoc().actions[0],
          effects: [
            {
              forEach: {
                bind: '$p',
                over: { query: 'players' },
                effects: [{ setVar: { scope: 'global', var: 'score', value: 1, __internal: true } }],
              },
            },
          ],
        },
      ],
    } as Parameters<typeof validateGameSpec>[0]);

    const reservedDiagnostics = diagnostics.filter(
      (diagnostic) => diagnostic.code === 'CNL_VALIDATOR_RESERVED_COMPILER_METADATA_FORBIDDEN',
    );
    assert.equal(reservedDiagnostics.length, 2);
    assert.equal(
      reservedDiagnostics.some((diagnostic) => diagnostic.path === 'doc.setup.0.setVar.__compilerMeta'),
      true,
    );
    assert.equal(
      reservedDiagnostics.some((diagnostic) => diagnostic.path === 'doc.actions.0.effects.0.forEach.effects.0.setVar.__internal'),
      true,
    );
  });

  it('allows reserved-looking keys inside gameplay payload maps', () => {
    const diagnostics = validateGameSpec({
      ...createStructurallyValidDoc(),
      actions: [
        {
          ...createStructurallyValidDoc().actions[0],
          effects: [
            {
              createToken: {
                type: 'piece',
                zone: 'board',
                props: {
                  __engineIndependent: 1,
                },
              },
            },
          ],
        },
      ],
    } as Parameters<typeof validateGameSpec>[0]);

    assert.equal(
      diagnostics.some((diagnostic) => diagnostic.code === 'CNL_VALIDATOR_RESERVED_COMPILER_METADATA_FORBIDDEN'),
      false,
    );
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
      ['doc.actions', 'doc.metadata', 'doc.terminal', 'doc.turnStructure', 'doc.zones'],
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
        {
          id: 'fitl-pieces-foundation',
          kind: 'pieceCatalog',
          payload: { factions: [{ id: 'us' }], pieceTypes: [], inventory: [] },
        },
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

  it('does not require scenario mapAssetId or pieceCatalogAssetId', () => {
    const diagnostics = validateGameSpec({
      ...createStructurallyValidDoc(),
      dataAssets: [
        {
          id: 'fitl-scenario-foundation',
          kind: 'scenario',
          payload: {},
        },
      ],
    });

    assert.equal(
      diagnostics.some((diagnostic) => diagnostic.path === 'doc.dataAssets.0.payload.mapAssetId'),
      false,
    );
    assert.equal(
      diagnostics.some((diagnostic) => diagnostic.path === 'doc.dataAssets.0.payload.pieceCatalogAssetId'),
      false,
    );
  });

  it('accepts custom data-asset kinds through the shared data-asset validator path', () => {
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
      diagnostics.some((diagnostic) => diagnostic.path === 'doc.dataAssets.0.kind'),
      false,
    );
  });

  it('validates eventDecks card identifiers', () => {
    const diagnostics = validateGameSpec({
      ...createStructurallyValidDoc(),
      eventDecks: [
        {
          id: 'fitl-events-initial',
          drawZone: 'leader:none',
          discardZone: 'played:none',
          cards: [
            {
              id: 'card-82',
              title: 'Domino Theory',
              sideMode: 'single',
              unshaded: { effects: [{ shuffle: { zone: 'played:none' } }] },
            },
            {
              id: 'card-82',
              title: 'Domino Theory Duplicate',
              sideMode: 'single',
              unshaded: { effects: [{ shuffle: { zone: 'played:none' } }] },
            },
          ],
        },
      ],
    } as unknown as Parameters<typeof validateGameSpec>[0]);

    assert.equal(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_VALIDATOR_IDENTIFIER_DUPLICATE_NORMALIZED' &&
          diagnostic.path === 'doc.eventDecks.0.cards.1',
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

  it('accepts metadata.defaultScenarioAssetId when it is a non-empty trimmed string', () => {
    const diagnostics = validateGameSpec({
      ...createStructurallyValidDoc(),
      metadata: {
        id: 'demo',
        players: { min: 2, max: 4 },
        defaultScenarioAssetId: 'fitl-scenario-foundation',
      },
    });

    assert.equal(
      diagnostics.some((diagnostic) => diagnostic.path === 'doc.metadata.defaultScenarioAssetId'),
      false,
    );
  });

  it('accepts metadata.name and metadata.description when they are non-empty trimmed strings', () => {
    const diagnostics = validateGameSpec({
      ...createStructurallyValidDoc(),
      metadata: {
        id: 'demo',
        name: 'Fire in the Lake',
        description: 'A 4-faction COIN-series game set in Vietnam.',
        players: { min: 2, max: 4 },
      },
    });

    assert.equal(
      diagnostics.some((diagnostic) => diagnostic.path === 'doc.metadata.name'),
      false,
    );
    assert.equal(
      diagnostics.some((diagnostic) => diagnostic.path === 'doc.metadata.description'),
      false,
    );
  });

  it('rejects invalid metadata.name and metadata.description values', () => {
    const diagnostics = validateGameSpec({
      ...createStructurallyValidDoc(),
      metadata: {
        id: 'demo',
        name: '  ',
        description: 42,
        players: { min: 2, max: 4 },
      },
    } as unknown as Parameters<typeof validateGameSpec>[0]);

    const displayDiagnostics = diagnostics.filter(
      (diagnostic) => diagnostic.code === 'CNL_VALIDATOR_METADATA_DISPLAY_STRING_INVALID',
    );
    assert.equal(displayDiagnostics.length, 2);
    assert.equal(displayDiagnostics.some((diagnostic) => diagnostic.path === 'doc.metadata.name'), true);
    assert.equal(displayDiagnostics.some((diagnostic) => diagnostic.path === 'doc.metadata.description'), true);
  });

  it('rejects metadata.name and metadata.description with surrounding whitespace', () => {
    const diagnostics = validateGameSpec({
      ...createStructurallyValidDoc(),
      metadata: {
        id: 'demo',
        name: ' Fire in the Lake',
        description: 'Vietnam setting ',
        players: { min: 2, max: 4 },
      },
    });

    const displayDiagnostics = diagnostics.filter(
      (diagnostic) => diagnostic.code === 'CNL_VALIDATOR_METADATA_DISPLAY_STRING_INVALID',
    );
    assert.equal(displayDiagnostics.length, 2);
    assert.equal(displayDiagnostics.some((diagnostic) => diagnostic.path === 'doc.metadata.name'), true);
    assert.equal(displayDiagnostics.some((diagnostic) => diagnostic.path === 'doc.metadata.description'), true);
  });

  it('rejects invalid metadata.defaultScenarioAssetId values', () => {
    const diagnostics = validateGameSpec({
      ...createStructurallyValidDoc(),
      metadata: {
        id: 'demo',
        players: { min: 2, max: 4 },
        defaultScenarioAssetId: '  ',
      },
    } as unknown as Parameters<typeof validateGameSpec>[0]);

    assert.equal(
      diagnostics.some((diagnostic) => diagnostic.code === 'CNL_VALIDATOR_METADATA_DEFAULT_SCENARIO_INVALID'),
      true,
    );
  });

  it('accepts metadata.namedSets when ids and values are valid', () => {
    const diagnostics = validateGameSpec({
      ...createStructurallyValidDoc(),
      metadata: {
        id: 'demo',
        players: { min: 2, max: 4 },
        namedSets: {
          COIN: ['US', 'ARVN'],
          Insurgent: ['NVA', 'VC'],
        },
      },
    });

    assert.equal(
      diagnostics.some((diagnostic) => diagnostic.path.startsWith('doc.metadata.namedSets')),
      false,
    );
  });

  it('rejects invalid metadata.namedSets values and duplicates', () => {
    const diagnostics = validateGameSpec({
      ...createStructurallyValidDoc(),
      metadata: {
        id: 'demo',
        players: { min: 2, max: 4 },
        namedSets: {
          COIN: ['US', 'US'],
          Broken: [1, 'ARVN'],
        },
      },
    } as unknown as Parameters<typeof validateGameSpec>[0]);

    assert.equal(
      diagnostics.some((diagnostic) => diagnostic.code === 'CNL_VALIDATOR_METADATA_NAMED_SET_DUPLICATE_VALUE'),
      true,
    );
    assert.equal(
      diagnostics.some((diagnostic) => diagnostic.code === 'CNL_VALIDATOR_METADATA_NAMED_SET_VALUES_INVALID'),
      true,
    );
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

  it('rejects removed metadata visual keys as errors', () => {
    const diagnostics = validateGameSpec({
      ...createStructurallyValidDoc(),
      metadata: {
        id: 'demo',
        players: { min: 2, max: 4 },
        layoutMode: 'graph',
        cardAnimation: { cardTokenTypes: { idPrefixes: ['card-'] }, zoneRoles: { draw: ['deck'] } },
      } as unknown as Parameters<typeof validateGameSpec>[0]['metadata'],
    });

    assert.equal(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_VALIDATOR_METADATA_LAYOUT_MODE_REMOVED'
          && diagnostic.path === 'doc.metadata.layoutMode'
          && diagnostic.severity === 'error',
      ),
      true,
    );
    assert.equal(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_VALIDATOR_METADATA_CARD_ANIMATION_REMOVED'
          && diagnostic.path === 'doc.metadata.cardAnimation'
          && diagnostic.severity === 'error',
      ),
      true,
    );
  });

  it('rejects removed zone visual keys as errors', () => {
    const diagnostics = validateGameSpec({
      ...createStructurallyValidDoc(),
      zones: [
        {
          id: 'deck',
          owner: 'none',
          visibility: 'hidden',
          ordering: 'stack',
          layoutRole: 'card',
          visual: { shape: 'rectangle' },
        },
      ] as unknown as Parameters<typeof validateGameSpec>[0]['zones'],
    });

    assert.equal(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_VALIDATOR_ZONE_LAYOUT_ROLE_REMOVED'
          && diagnostic.path === 'doc.zones.0.layoutRole'
          && diagnostic.severity === 'error',
      ),
      true,
    );
    assert.equal(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_VALIDATOR_ZONE_VISUAL_REMOVED'
          && diagnostic.path === 'doc.zones.0.visual'
          && diagnostic.severity === 'error',
      ),
      true,
    );
  });

  it('rejects removed piece-catalog visual fields in data assets as errors', () => {
    const diagnostics = validateGameSpec({
      ...createStructurallyValidDoc(),
      dataAssets: [
        {
          id: 'fitl-pieces',
          kind: 'pieceCatalog',
          payload: {
            factions: [
              { id: 'us', color: '#e63946', displayName: 'United States' },
            ],
            pieceTypes: [
              {
                id: 'us-troops',
                faction: 'us',
                statusDimensions: [],
                transitions: [],
                visual: { shape: 'cube' },
              },
            ],
            inventory: [{ pieceTypeId: 'us-troops', faction: 'us', total: 10 }],
          },
        },
      ],
    } as unknown as Parameters<typeof validateGameSpec>[0]);

    assert.equal(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'PIECE_CATALOG_SCHEMA_INVALID' &&
          diagnostic.path.startsWith('doc.dataAssets.0.payload.factions') &&
          diagnostic.message.includes('color') &&
          diagnostic.severity === 'error',
      ),
      true,
    );
    assert.equal(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'PIECE_CATALOG_SCHEMA_INVALID' &&
          diagnostic.path.startsWith('doc.dataAssets.0.payload.factions') &&
          diagnostic.message.includes('displayName') &&
          diagnostic.severity === 'error',
      ),
      true,
    );
    assert.equal(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'PIECE_CATALOG_SCHEMA_INVALID' &&
          diagnostic.path.startsWith('doc.dataAssets.0.payload.pieceTypes') &&
          diagnostic.severity === 'error',
      ),
      true,
    );
  });

  it('rejects removed map visual fields in data assets as errors', () => {
    const diagnostics = validateGameSpec({
      ...createStructurallyValidDoc(),
      dataAssets: [
        {
          id: 'fitl-map',
          kind: 'map',
          payload: {
            visualRules: { regions: [] },
            spaces: [
              {
                id: 'hanoi',
                adjacentTo: [],
                visual: { shape: 'circle' },
              },
            ],
          },
        },
      ],
    } as unknown as Parameters<typeof validateGameSpec>[0]);

    assert.equal(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'MAP_PAYLOAD_SCHEMA_INVALID' &&
          diagnostic.path === 'doc.dataAssets.0.payload' &&
          diagnostic.severity === 'error',
      ),
      true,
    );
    assert.equal(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'MAP_PAYLOAD_SCHEMA_INVALID' &&
          diagnostic.path.startsWith('doc.dataAssets.0.payload.spaces') &&
          diagnostic.severity === 'error',
      ),
      true,
    );
  });

  it('validates action required fields and shape constraints', () => {
    const validDoc = createStructurallyValidDoc();
    const baseAction = validDoc.actions![0]!;
    const diagnostics = validateGameSpec({
      ...validDoc,
      actions: [{ ...baseAction, id: '', phase: [] as const, actor: null, executor: null, effects: {} as unknown as unknown[] }],
    });
    assert.deepEqual(diagnostics.map((diagnostic) => diagnostic.path), [
      'doc.actions.0.actor',
      'doc.actions.0.effects',
      'doc.actions.0.executor',
      'doc.actions.0.id',
      'doc.actions.0.phase',
    ]);
  });

  it('validates action capabilities shape and uniqueness', () => {
    const validDoc = createStructurallyValidDoc();
    const baseAction = validDoc.actions![0]!;
    const diagnostics = validateGameSpec({
      ...validDoc,
      actions: [
        {
          ...baseAction,
          capabilities: ['cardEvent', '', 'cardEvent'],
        },
      ],
    } as unknown as Parameters<typeof validateGameSpec>[0]);

    assert.equal(
      diagnostics.some((diagnostic) => diagnostic.path === 'doc.actions.0.capabilities.1' && diagnostic.code === 'CNL_VALIDATOR_ACTION_CAPABILITIES_INVALID'),
      true,
    );
    assert.equal(
      diagnostics.some((diagnostic) => diagnostic.path === 'doc.actions.0.capabilities.2' && diagnostic.code === 'CNL_VALIDATOR_ACTION_CAPABILITIES_DUPLICATE'),
      true,
    );
  });

  it('rejects scalar action.phase and requires non-empty phase arrays', () => {
    const validDoc = createStructurallyValidDoc();
    const baseAction = validDoc.actions![0]!;
    const diagnostics = validateGameSpec({
      ...validDoc,
      actions: [{ ...baseAction, phase: 'main' } as unknown as (typeof baseAction)],
    });

    assert.equal(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.path === 'doc.actions.0.phase' &&
          diagnostic.code === 'CNL_VALIDATOR_ACTION_REQUIRED_FIELD_MISSING',
      ),
      true,
    );
  });

  it('rejects duplicate action.phase ids', () => {
    const validDoc = createStructurallyValidDoc();
    const baseAction = validDoc.actions![0]!;
    const diagnostics = validateGameSpec({
      ...validDoc,
      actions: [{ ...baseAction, phase: ['main', 'main'] }],
    });

    assert.equal(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.path === 'doc.actions.0.phase.1' &&
          diagnostic.code === 'CNL_VALIDATOR_ACTION_PHASE_DUPLICATE',
      ),
      true,
    );
  });

  it('validates turn structure shape', () => {
    const diagnostics = validateGameSpec({
      ...createStructurallyValidDoc(),
      turnStructure: { phases: [] },
    });
    assert.deepEqual(diagnostics.map((diagnostic) => diagnostic.path), [
      'doc.actions.0.phase.0',
      'doc.turnStructure.phases',
    ]);
  });

  it('accepts a valid optional turnOrder section', () => {
    const diagnostics = validateGameSpec({
      ...createStructurallyValidDoc(),
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: {
              factions: ['us', 'arvn', 'nva', 'vc'],
              overrideWindows: [{ id: 'remain-eligible', duration: 'nextTurn' }],
            },
            optionMatrix: [{ first: 'event', second: ['operation', 'operationPlusSpecialActivity'] }],
            passRewards: [{ factionClass: 'coin', resource: 'arvnResources', amount: 3 }],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
          },
        },
      },
    });

    assert.equal(diagnostics.some((diagnostic) => diagnostic.path.startsWith('doc.turnOrder')), false);
  });

  it('reports malformed turnOrder cardDriven flow with explicit nested paths', () => {
    const diagnostics = validateGameSpec({
      ...createStructurallyValidDoc(),
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: '', leader: 'leader:none' },
            eligibility: {
              factions: ['us', ''],
              overrideWindows: [{ id: 'window-a', duration: 'season' }],
            },
            optionMatrix: [{ first: 'event', second: ['operation', 'invalid'] }],
            passRewards: [{ factionClass: 'coin', resource: 'arvnResources', amount: '3' }],
            durationWindows: ['cycle', 'epoch'],
          },
        },
      },
    } as unknown as Parameters<typeof validateGameSpec>[0]);

    assert.equal(
      diagnostics.some((diagnostic) => diagnostic.path === 'doc.turnOrder.config.turnFlow.eligibility.overrideWindows.0.duration'),
      true,
    );
    assert.equal(
      diagnostics.some((diagnostic) => diagnostic.path === 'doc.turnOrder.config.turnFlow.optionMatrix.0.second.1'),
      true,
    );
    assert.equal(
      diagnostics.some((diagnostic) => diagnostic.path === 'doc.turnOrder.config.turnFlow.passRewards.0.amount'),
      true,
    );
    assert.equal(
      diagnostics.some((diagnostic) => diagnostic.path === 'doc.turnOrder.config.turnFlow.durationWindows.1'),
      true,
    );
  });

  it('accepts valid optional actionPipelines section', () => {
    const diagnostics = validateGameSpec({
      ...createStructurallyValidDoc(),
      actionPipelines: [
        {
          id: 'op-pass',
          actionId: 'draw',
          accompanyingOps: 'any',
          legality: true,
          costValidation: null, costEffects: [],
          targeting: {},
          stages: [{ stage: 'resolve' }],
          atomicity: 'atomic',
        },
      ],
    });

    assert.equal(diagnostics.some((diagnostic) => diagnostic.path.startsWith('doc.actionPipelines')), false);
  });

  it('reports incomplete or ambiguous actionPipelines with explicit nested paths', () => {
    const diagnostics = validateGameSpec({
      ...createStructurallyValidDoc(),
      actionPipelines: [
        {
          id: 'op-pass-a',
          actionId: 'draw',
          legality: null,
          costValidation: null, costEffects: [],
          targeting: {},
          stages: [],
          atomicity: 'invalid',
        },
        {
          id: 'op-pass-b',
          actionId: 'draw',
          legality: null,
          costValidation: null, costEffects: [],
          targeting: {},
          stages: [{ stage: 'resolve' }],
          atomicity: 'atomic',
        },
        {
          id: 'op-missing-action',
          actionId: 'unknown-action',
          legality: null,
          costValidation: null, costEffects: [],
          targeting: {},
          stages: [{ stage: 'resolve' }],
          atomicity: 'atomic',
        },
      ],
    } as unknown as Parameters<typeof validateGameSpec>[0]);

    assert.equal(
      diagnostics.some((diagnostic) => diagnostic.path === 'doc.actionPipelines.0.stages'),
      true,
    );
    assert.equal(
      diagnostics.some((diagnostic) => diagnostic.path === 'doc.actionPipelines.0.atomicity'),
      true,
    );
    assert.equal(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_VALIDATOR_ACTION_PIPELINE_ACTION_MAPPING_AMBIGUOUS' &&
          diagnostic.path === 'doc.actionPipelines',
      ),
      true,
    );
    assert.equal(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_VALIDATOR_REFERENCE_MISSING' &&
          diagnostic.path === 'doc.actionPipelines.2.actionId',
      ),
      true,
    );
  });

  it('reports invalid accompanyingOps shape in action pipeline metadata', () => {
    const diagnostics = validateGameSpec({
      ...createStructurallyValidDoc(),
      actionPipelines: [
        {
          id: 'op-pass',
          actionId: 'draw',
          accompanyingOps: [1] as unknown as readonly string[],
          legality: null,
          costValidation: null, costEffects: [],
          targeting: {},
          stages: [{ stage: 'resolve' }],
          atomicity: 'atomic',
        },
      ],
    });

    assert.equal(
      diagnostics.some((diagnostic) => diagnostic.path === 'doc.actionPipelines.0.accompanyingOps.0'),
      true,
    );
  });

  it('reports invalid compoundParamConstraints shape in action pipeline metadata', () => {
    const diagnostics = validateGameSpec({
      ...createStructurallyValidDoc(),
      actionPipelines: [
        {
          id: 'op-pass',
          actionId: 'draw',
          compoundParamConstraints: [{ relation: 'overlap', operationParam: '', specialActivityParam: 'targetSpaces' }],
          legality: null,
          costValidation: null, costEffects: [],
          targeting: {},
          stages: [{ stage: 'resolve' }],
          atomicity: 'atomic',
        },
      ],
    } as unknown as Parameters<typeof validateGameSpec>[0]);

    assert.equal(
      diagnostics.some((diagnostic) => diagnostic.path === 'doc.actionPipelines.0.compoundParamConstraints.0.relation'),
      true,
    );
    assert.equal(
      diagnostics.some((diagnostic) => diagnostic.path === 'doc.actionPipelines.0.compoundParamConstraints.0.operationParam'),
      true,
    );
  });

  it('accepts valid optional derivedMetrics section', () => {
    const diagnostics = validateGameSpec({
      ...createStructurallyValidDoc(),
      zones: [
        {
          id: 'city:none',
          zoneKind: 'board',
          owner: 'none',
          visibility: 'public',
          ordering: 'set',
          category: 'city',
          attributes: { population: 2, econ: 0, terrainTags: [], country: 'test', coastal: false },
        },
      ],
      derivedMetrics: [
        {
          id: 'support-total',
          computation: 'markerTotal',
          zoneFilter: { zoneKinds: ['board'], category: ['city'] },
          requirements: [{ key: 'population', expectedType: 'number' }],
        },
      ],
    });

    assert.equal(diagnostics.some((diagnostic) => diagnostic.path.startsWith('doc.derivedMetrics')), false);
  });

  it('reports malformed derivedMetrics entries with nested paths', () => {
    const diagnostics = validateGameSpec({
      ...createStructurallyValidDoc(),
      derivedMetrics: [
        {
          id: 'support-total',
          computation: 'bad-computation',
          zoneFilter: {
            zoneIds: ['missing-zone'],
            zoneKinds: ['bad-kind'],
            category: [''],
            attributeEquals: 'bad',
          },
          requirements: [{ key: '', expectedType: 'string' }],
        },
      ],
    } as unknown as Parameters<typeof validateGameSpec>[0]);

    assert.equal(diagnostics.some((diagnostic) => diagnostic.path === 'doc.derivedMetrics.0.computation'), true);
    assert.equal(diagnostics.some((diagnostic) => diagnostic.path === 'doc.derivedMetrics.0.zoneFilter.zoneIds.0'), true);
    assert.equal(diagnostics.some((diagnostic) => diagnostic.path === 'doc.derivedMetrics.0.zoneFilter.zoneKinds.0'), true);
    assert.equal(diagnostics.some((diagnostic) => diagnostic.path === 'doc.derivedMetrics.0.zoneFilter.attributeEquals'), true);
    assert.equal(diagnostics.some((diagnostic) => diagnostic.path === 'doc.derivedMetrics.0.requirements.0.key'), true);
    assert.equal(diagnostics.some((diagnostic) => diagnostic.path === 'doc.derivedMetrics.0.requirements.0.expectedType'), true);
  });

  it('reports missing phase reference in action with alternatives', () => {
    const diagnostics = validateGameSpec({
      ...createStructurallyValidDoc(),
      actions: [
        {
          ...createStructurallyValidDoc().actions![0]!,
          phase: ['mian'],
        },
      ],
    });
    const missingPhase = diagnostics.find((diagnostic) => diagnostic.path === 'doc.actions.0.phase.0');
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
        { id: 'deck', owner: 'none', visibility: 'hidden', ordering: 'stack', adjacentTo: [{ to: 'disard' }] },
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
      diagnostics.some((diagnostic) => diagnostic.path === 'doc.zones.0.adjacentTo.0.to' && diagnostic.code === 'CNL_VALIDATOR_REFERENCE_MISSING'),
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
        { id: 'café', owner: 'none', visibility: 'hidden', ordering: 'stack', adjacentTo: [{ to: 'disard' }] },
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
