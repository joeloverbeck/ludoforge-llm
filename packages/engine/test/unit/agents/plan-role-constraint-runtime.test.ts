// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  constraintsSatisfied,
  routeGraphProviderForDef,
} from '../../../src/agents/plan-role-constraint-eval.js';
import type { PlanRoleBinding } from '../../../src/agents/plan-execution.js';
import {
  asTokenId,
  type GameDef,
  type GameState,
} from '../../../src/kernel/index.js';
import { createSyntheticDecisionDef } from '../../helpers/synthetic-decision-fixture.js';

const roleBinding = (role: string, selectedId: string): PlanRoleBinding => ({
  role,
  selectedId,
  quality: 0,
  rank: 0,
  components: {},
});

const state = (): GameState => ({
  zones: {
    'zone-a': [{ id: asTokenId('token-a'), type: 'piece', props: {} }],
    'zone-b': [{ id: asTokenId('token-b'), type: 'piece', props: {} }],
    'zone-c': [],
    'zone-d': [],
  },
} as unknown as GameState);

const routeGraphDef = (): GameDef => ({
  ...createSyntheticDecisionDef(),
  runtimeDataAssets: [{
    id: 'test-route-graph',
    kind: 'routeGraph',
    payload: {
      routeClasses: [{ id: 'land' }, { id: 'trail' }],
      edges: [
        { from: 'zone-a', to: 'zone-b', classes: ['land'] },
        { from: 'zone-b', to: 'zone-c', classes: ['land'] },
        { from: 'zone-c', to: 'zone-d', classes: ['trail'] },
      ],
      defaultMaxHops: 3,
    },
  }],
});

describe('plan role constraint runtime evaluation', () => {
  it('preserves notEqual role-binding semantics', () => {
    const current = roleBinding('destination', 'zone-b');
    assert.equal(constraintsSatisfied(
      current,
      [{ kind: 'notEqual', role: 'origin' }],
      { origin: roleBinding('origin', 'zone-a') },
      state(),
      null,
    ), true);
    assert.equal(constraintsSatisfied(
      current,
      [{ kind: 'notEqual', role: 'origin' }],
      { origin: roleBinding('origin', 'zone-b') },
      state(),
      null,
    ), false);
  });

  it('evaluates locatedIn against literal-zone and role-container constraints', () => {
    assert.equal(constraintsSatisfied(
      roleBinding('unit', 'token-a'),
      [{ kind: 'locatedIn', role: 'unit', container: 'zone-a' }],
      {},
      state(),
      null,
    ), true);
    assert.equal(constraintsSatisfied(
      roleBinding('unit', 'token-a'),
      [{ kind: 'locatedIn', role: 'unit', container: 'zone-b' }],
      {},
      state(),
      null,
    ), false);
    assert.equal(constraintsSatisfied(
      roleBinding('escort', 'token-a'),
      [{ kind: 'locatedIn', role: 'escort', container: 'origin' }],
      { origin: roleBinding('origin', 'zone-a') },
      state(),
      null,
    ), true);
    assert.equal(constraintsSatisfied(
      roleBinding('escort', 'token-a'),
      [{ kind: 'locatedIn', role: 'escort', container: 'origin' }],
      { origin: roleBinding('origin', 'zone-b') },
      state(),
      null,
    ), false);
  });

  it('evaluates distinctOriginDestination from bound role zones', () => {
    assert.equal(constraintsSatisfied(
      roleBinding('destination', 'zone-b'),
      [{ kind: 'distinctOriginDestination', origin: 'origin', destination: 'destination' }],
      { origin: roleBinding('origin', 'token-a') },
      state(),
      null,
    ), true);
    assert.equal(constraintsSatisfied(
      roleBinding('destination', 'zone-a'),
      [{ kind: 'distinctOriginDestination', origin: 'origin', destination: 'destination' }],
      { origin: roleBinding('origin', 'token-a') },
      state(),
      null,
    ), false);
  });

  it('evaluates reachable with route class and max-hop bounds', () => {
    const provider = routeGraphProviderForDef(routeGraphDef());
    assert.notEqual(provider, null);
    assert.equal(constraintsSatisfied(
      roleBinding('destination', 'zone-c'),
      [{ kind: 'reachable', from: 'origin', to: 'destination', via: 'land', maxHops: 2 }],
      { origin: roleBinding('origin', 'zone-a') },
      state(),
      provider,
    ), true);
    assert.equal(constraintsSatisfied(
      roleBinding('destination', 'zone-c'),
      [{ kind: 'reachable', from: 'origin', to: 'destination', via: 'land', maxHops: 1 }],
      { origin: roleBinding('origin', 'zone-a') },
      state(),
      provider,
    ), false);
    assert.equal(constraintsSatisfied(
      roleBinding('destination', 'zone-d'),
      [{ kind: 'reachable', from: 'origin', to: 'destination', via: 'land' }],
      { origin: roleBinding('origin', 'zone-a') },
      state(),
      provider,
    ), false);
  });

  it('evaluates adjacent through the compiled routeGraph provider', () => {
    const provider = routeGraphProviderForDef(routeGraphDef());
    assert.notEqual(provider, null);
    assert.equal(constraintsSatisfied(
      roleBinding('destination', 'zone-b'),
      [{ kind: 'adjacent', a: 'origin', b: 'destination' }],
      { origin: roleBinding('origin', 'zone-a') },
      state(),
      provider,
    ), true);
    assert.equal(constraintsSatisfied(
      roleBinding('destination', 'zone-c'),
      [{ kind: 'adjacent', a: 'origin', b: 'destination' }],
      { origin: roleBinding('origin', 'zone-a') },
      state(),
      provider,
    ), false);
  });

  it('fails closed when route constraints lack a routeGraph provider', () => {
    assert.throws(
      () => constraintsSatisfied(
        roleBinding('destination', 'zone-b'),
        [{ kind: 'reachable', from: 'origin', to: 'destination' }],
        { origin: roleBinding('origin', 'zone-a') },
        state(),
        null,
      ),
      /reachable constraint reached runtime evaluation without a compiled RouteGraphProvider/u,
    );
    assert.throws(
      () => constraintsSatisfied(
        roleBinding('destination', 'zone-b'),
        [{ kind: 'adjacent', a: 'origin', b: 'destination' }],
        { origin: roleBinding('origin', 'zone-a') },
        state(),
        null,
      ),
      /adjacent constraint reached runtime evaluation without a compiled RouteGraphProvider/u,
    );
  });
});
