import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { type GameDef, validateGameDef } from '../../src/kernel/index.js';

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
});
