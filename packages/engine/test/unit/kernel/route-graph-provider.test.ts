// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileRouteGraphProvider } from '../../../src/kernel/route-graph-provider.js';
import type { RouteGraphPayload } from '../../../src/kernel/types.js';

const FIXTURE_GRAPH: RouteGraphPayload = {
  routeClasses: [
    { id: 'highway', label: 'Highway' },
    { id: 'land', label: 'Land' },
  ],
  edges: [
    { from: 'zone.c', to: 'zone.d', classes: ['land'] },
    { from: 'zone.a', to: 'zone.b', classes: ['land', 'highway'] },
    { from: 'zone.b', to: 'zone.c', classes: ['land'] },
    { from: 'zone.d', to: 'zone.e', classes: ['highway'] },
  ],
  defaultMaxHops: 4,
};

describe('RouteGraphProvider', () => {
  it('answers adjacent and reachable queries by route class', () => {
    const provider = compileRouteGraphProvider(FIXTURE_GRAPH);

    assert.equal(provider.adjacent('zone.a', 'zone.b'), true);
    assert.equal(provider.adjacent('zone.b', 'zone.a', 'land'), true);
    assert.equal(provider.adjacent('zone.b', 'zone.c', 'highway'), false);
    assert.equal(provider.reachable('zone.a', 'zone.d', 'land'), true);
    assert.equal(provider.reachable('zone.a', 'zone.d', 'land', 2), false);
    assert.equal(provider.reachable('zone.a', 'zone.e', 'highway'), false);
    assert.equal(provider.reachable('zone.a', 'zone.e'), true);
  });

  it('materializes deterministic compiled indices', () => {
    const first = compileRouteGraphProvider(FIXTURE_GRAPH).serialize();
    const second = compileRouteGraphProvider({
      ...FIXTURE_GRAPH,
      routeClasses: [...FIXTURE_GRAPH.routeClasses].reverse(),
      edges: [...FIXTURE_GRAPH.edges].reverse(),
    }).serialize();

    assert.equal(JSON.stringify(first), JSON.stringify(second));
    assert.deepEqual(first.adjacencyByClass.land?.['zone.b'], ['zone.a', 'zone.c']);
  });
});
