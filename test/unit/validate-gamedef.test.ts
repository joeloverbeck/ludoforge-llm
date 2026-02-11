import * as assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { type GameDef, validateGameDef } from '../../src/kernel/index.js';

const loadFixtureGameDef = (fixtureName: string): GameDef => {
  const distRelativeFixturePath = fileURLToPath(new URL(`../../../test/fixtures/gamedef/${fixtureName}`, import.meta.url));
  const sourceRelativeFixturePath = fileURLToPath(new URL(`../fixtures/gamedef/${fixtureName}`, import.meta.url));
  const fixturePath = existsSync(distRelativeFixturePath) ? distRelativeFixturePath : sourceRelativeFixturePath;
  return JSON.parse(readFileSync(fixturePath, 'utf8')) as GameDef;
};

const createValidGameDef = (): GameDef =>
  ({
    metadata: { id: 'test-game', players: { min: 2, max: 4 } },
    constants: {},
    globalVars: [{ name: 'money', type: 'int', init: 0, min: 0, max: 99 }],
    perPlayerVars: [{ name: 'vp', type: 'int', init: 0, min: 0, max: 100 }],
    zones: [
      { id: 'market:none', owner: 'none', visibility: 'public', ordering: 'set' },
      { id: 'deck:none', owner: 'none', visibility: 'hidden', ordering: 'stack' },
    ],
    tokenTypes: [{ id: 'card', props: {} }],
    setup: [{ shuffle: { zone: 'deck:none' } }],
    turnStructure: {
      phases: [{ id: 'main' }],
      activePlayerOrder: 'roundRobin',
    },
    actions: [
      {
        id: 'playCard',
        actor: 'active',
        phase: 'main',
        params: [{ name: '$n', domain: { query: 'intsInRange', min: 0, max: 3 } }],
        pre: null,
        cost: [],
        effects: [{ draw: { from: 'deck:none', to: 'market:none', count: 1 } }],
        limits: [],
      },
    ],
    triggers: [{ id: 'onPlay', event: { type: 'actionResolved', action: 'playCard' }, effects: [] }],
    endConditions: [{ when: { op: '==', left: 1, right: 1 }, result: { type: 'draw' } }],
  }) as unknown as GameDef;

describe('validateGameDef reference checks', () => {
  it('emits deterministic duplicate action diagnostics', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      actions: [...base.actions, { ...base.actions[0], limits: [] }],
    } as unknown as GameDef;

    const first = validateGameDef(def);
    const second = validateGameDef(def);

    assert.deepEqual(first, second);
    const duplicate = first.find((diag) => diag.code === 'DUPLICATE_ACTION_ID');
    assert.ok(duplicate);
    assert.equal(duplicate.severity, 'error');
    assert.equal(duplicate.path, 'actions[1]');
  });

  it('reports missing zone references with alternatives', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          effects: [{ draw: { from: 'deck:none', to: 'markte:none', count: 1 } }],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    const missingZone = diagnostics.find((diag) => diag.code === 'REF_ZONE_MISSING');

    assert.ok(missingZone);
    assert.equal(missingZone.path, 'actions[0].effects[0].draw.to');
    assert.deepEqual(missingZone.alternatives, ['market:none']);
    assert.equal(typeof missingZone.suggestion, 'string');
  });

  it('accepts binding-qualified zone selectors for player-owned zone bases', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      zones: [
        ...base.zones,
        { id: 'hand:0', owner: 'player', visibility: 'owner', ordering: 'set' },
        { id: 'hand:1', owner: 'player', visibility: 'owner', ordering: 'set' },
      ],
      actions: [
        {
          ...base.actions[0],
          effects: [
            {
              forEach: {
                bind: '$p',
                over: { query: 'players' },
                effects: [{ draw: { from: 'deck:none', to: 'hand:$p', count: 1 } }],
              },
            },
          ],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some((diag) => diag.path === 'actions[0].effects[0].forEach.effects[0].draw.to'),
      false,
    );
  });

  it('reports undefined gvar references', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          pre: { op: '==', left: { ref: 'gvar', var: 'gold' }, right: 1 },
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(diagnostics.some((diag) => diag.code === 'REF_GVAR_MISSING' && diag.path === 'actions[0].pre.left.var'));
  });

  it('reports undefined pvar references', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          effects: [{ setVar: { scope: 'pvar', player: 'active', var: 'health', value: 1 } }],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some((diag) => diag.code === 'REF_PVAR_MISSING' && diag.path === 'actions[0].effects[0].setVar.var'),
    );
  });

  it('reports invalid phase references with alternatives', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      actions: [{ ...base.actions[0], phase: 'mian' }],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    const missingPhase = diagnostics.find((diag) => diag.code === 'REF_PHASE_MISSING');

    assert.ok(missingPhase);
    assert.equal(missingPhase.path, 'actions[0].phase');
    assert.deepEqual(missingPhase.alternatives, ['main']);
  });

  it('reports invalid action references in actionResolved triggers', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      triggers: [
        {
          ...base.triggers[0],
          event: { type: 'actionResolved', action: 'playCrad' },
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) => diag.code === 'REF_ACTION_MISSING' && diag.path === 'triggers[0].event.action',
      ),
    );
  });

  it('reports invalid createToken type references', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          effects: [{ createToken: { type: 'crad', zone: 'market:none' } }],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) => diag.code === 'REF_TOKEN_TYPE_MISSING' && diag.path === 'actions[0].effects[0].createToken.type',
      ),
    );
  });

  it('reports malformed intsInRange param domains', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          params: [{ name: '$n', domain: { query: 'intsInRange', min: 5, max: 1 } }],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'DOMAIN_INTS_RANGE_INVALID' &&
          diag.path === 'actions[0].params[0].domain' &&
          diag.severity === 'error',
      ),
    );
  });

  it('reports operation profile action references missing from actions', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      operationProfiles: [
        {
          id: 'patrol-profile',
          actionId: 'patrol',
          legality: {},
          cost: {},
          targeting: {},
          resolution: [{ stage: 'resolve' }],
          partialExecution: { mode: 'forbid' },
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some((diag) => diag.code === 'REF_ACTION_MISSING' && diag.path === 'operationProfiles[0].actionId'),
    );
  });

  it('reports ambiguous operation profile action mappings', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      operationProfiles: [
        {
          id: 'profile-a',
          actionId: 'playCard',
          legality: {},
          cost: {},
          targeting: {},
          resolution: [{ stage: 'resolve' }],
          partialExecution: { mode: 'forbid' },
        },
        {
          id: 'profile-b',
          actionId: 'playCard',
          legality: {},
          cost: {},
          targeting: {},
          resolution: [{ stage: 'resolve' }],
          partialExecution: { mode: 'allow' },
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) => diag.code === 'OPERATION_PROFILE_ACTION_MAPPING_AMBIGUOUS' && diag.path === 'operationProfiles[1].actionId',
      ),
    );
  });
});

describe('validateGameDef constraints and warnings', () => {
  it('reports PlayerSel.id outside configured bounds', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      actions: [{ ...base.actions[0], actor: { id: 4 } }],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) => diag.code === 'PLAYER_SELECTOR_ID_OUT_OF_BOUNDS' && diag.path === 'actions[0].actor',
      ),
    );
  });

  it('reports invalid players metadata', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      metadata: { ...base.metadata, players: { min: 0, max: 0 } },
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some((diag) => diag.code === 'META_PLAYERS_MIN_INVALID' && diag.path === 'metadata.players.min'),
    );
  });

  it('reports invalid maxTriggerDepth metadata', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      metadata: { ...base.metadata, maxTriggerDepth: 1.5 },
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) => diag.code === 'META_MAX_TRIGGER_DEPTH_INVALID' && diag.path === 'metadata.maxTriggerDepth',
      ),
    );
  });

  it('reports variable bounds inconsistency', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      globalVars: [{ name: 'money', type: 'int', min: 2, init: 1, max: 99 }],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(diagnostics.some((diag) => diag.code === 'VAR_BOUNDS_INVALID' && diag.path === 'globalVars[0]'));
  });

  it('reports score end-condition without scoring definition', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      endConditions: [{ when: { op: '==', left: 1, right: 1 }, result: { type: 'score' } }],
      scoring: undefined,
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) => diag.code === 'SCORING_REQUIRED_FOR_SCORE_RESULT' && diag.path === 'endConditions[0].result',
      ),
    );
  });

  it('warns when scoring is configured but never used by end-conditions', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      scoring: { method: 'highest', value: 1 },
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some((diag) => diag.code === 'SCORING_UNUSED' && diag.path === 'scoring' && diag.severity === 'warning'),
    );
  });

  it('warns on asymmetric adjacency declarations with spatial diagnostics', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      zones: [
        { ...base.zones[0], adjacentTo: ['deck:none'] },
        { ...base.zones[1], adjacentTo: [] },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    const diagnostic = diagnostics.find((diag) => diag.code === 'SPATIAL_ASYMMETRIC_EDGE_NORMALIZED');
    assert.ok(diagnostic);
    assert.equal(diagnostic.path, 'zones[0].adjacentTo[0]');
    assert.equal(diagnostic.severity, 'warning');
    assert.equal(typeof diagnostic.message, 'string');
    assert.equal(typeof diagnostic.suggestion, 'string');
  });

  it('reports dangling adjacency references with spatial diagnostics', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      zones: [{ ...base.zones[0], adjacentTo: ['missing:none'] }, base.zones[1]],
    } as unknown as GameDef;

    const diagnostic = validateGameDef(def).find((diag) => diag.code === 'SPATIAL_DANGLING_ZONE_REF');
    assert.ok(diagnostic);
    assert.equal(diagnostic.path, 'zones[0].adjacentTo[0]');
    assert.equal(diagnostic.severity, 'error');
    assert.equal(typeof diagnostic.message, 'string');
    assert.equal(typeof diagnostic.suggestion, 'string');
  });

  it('reports unsorted adjacency declarations with spatial diagnostics', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      zones: [{ ...base.zones[0], adjacentTo: ['market:none', 'deck:none'] }, base.zones[1]],
    } as unknown as GameDef;

    const diagnostic = validateGameDef(def).find((diag) => diag.code === 'SPATIAL_NEIGHBORS_UNSORTED');
    assert.ok(diagnostic);
    assert.equal(diagnostic.path, 'zones[0].adjacentTo[1]');
    assert.equal(diagnostic.severity, 'error');
    assert.equal(typeof diagnostic.message, 'string');
    assert.equal(typeof diagnostic.suggestion, 'string');
  });

  it('reports ownership mismatch for :none selector targeting player-owned zone', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      zones: [{ ...base.zones[0], owner: 'player' }, base.zones[1]],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'ZONE_SELECTOR_OWNERSHIP_INVALID' &&
          diag.path === 'actions[0].effects[0].draw.to' &&
          diag.severity === 'error',
      ),
    );
  });

  it('reports unowned zone ids that do not use :none qualifier', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      zones: [{ ...base.zones[0], id: 'market:0', owner: 'none' }, base.zones[1]],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) => diag.code === 'ZONE_ID_OWNERSHIP_INVALID' && diag.path === 'zones[0].id' && diag.severity === 'error',
      ),
    );
  });

  it('reports player-owned zone ids without numeric qualifiers', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      zones: [{ ...base.zones[0], id: 'hand:actor', owner: 'player' }, base.zones[1]],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'ZONE_ID_PLAYER_QUALIFIER_INVALID' && diag.path === 'zones[0].id' && diag.severity === 'error',
      ),
    );
  });

  it('reports player-owned zone ids that exceed metadata.players.max bounds', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      zones: [{ ...base.zones[0], id: 'hand:4', owner: 'player' }, base.zones[1]],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'ZONE_ID_PLAYER_INDEX_OUT_OF_BOUNDS' &&
          diag.path === 'zones[0].id' &&
          diag.severity === 'error',
      ),
    );
  });

  it('reports invalid chooseN range cardinality declarations', () => {
    const base = createValidGameDef();
    const def = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          effects: [
            {
              chooseN: {
                bind: '$pick',
                options: { query: 'players' },
                n: 1,
                max: 2,
              },
            },
          ],
        },
      ],
    } as unknown as GameDef;

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'EFFECT_CHOOSE_N_CARDINALITY_INVALID' &&
          diag.path === 'actions[0].effects[0].chooseN' &&
          diag.severity === 'error',
      ),
    );
  });

  it('returns no diagnostics for fully valid game def', () => {
    const diagnostics = validateGameDef(createValidGameDef());
    assert.deepEqual(diagnostics, []);
  });

  it('returns no diagnostics for FITL foundation map fixture', () => {
    const diagnostics = validateGameDef(loadFixtureGameDef('fitl-map-foundation-valid.json'));
    assert.deepEqual(diagnostics, []);
  });
});
