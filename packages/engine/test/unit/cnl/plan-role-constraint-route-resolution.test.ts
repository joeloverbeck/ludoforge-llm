// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CNL_COMPILER_DIAGNOSTIC_CODES } from '../../../src/cnl/compiler-diagnostic-codes.js';
import { compileGameSpecToGameDef } from '../../../src/cnl/index.js';
import {
  createAgentPlanCompoundWitnessDoc,
  defaultCompoundWitnessSelectors,
  validCompoundPlanTemplate,
} from '../../architecture/fixtures/agent-plan-compound-witness-fixture.js';
import type { GameSpecDoc } from '../../../src/cnl/game-spec-doc.js';

function createDoc(constraints: readonly unknown[], includeRouteGraph: boolean): GameSpecDoc {
  const doc = createAgentPlanCompoundWitnessDoc({
    trainGovern: validCompoundPlanTemplate({
      roles: {
        trainSpace: { selector: 'trainSpace', required: true },
        governSpace: {
          selector: 'governSpace',
          required: true,
          constraints,
        },
      },
    }),
  }, defaultCompoundWitnessSelectors());
  if (includeRouteGraph) {
    return {
      ...doc,
      dataAssets: [
        ...(doc.dataAssets ?? []),
        {
          id: 'test-route-graph',
          kind: 'routeGraph',
          payload: {
            routeClasses: [{ id: 'land' }],
            edges: [{ from: 'zone-a', to: 'zone-b', classes: ['land'] }],
            defaultMaxHops: 2,
          },
        },
      ],
    };
  }
  return doc;
}

function createDocWithRouteGraphPayload(payload: unknown): GameSpecDoc {
  const doc = createDoc([], false);
  return {
    ...doc,
    dataAssets: [
      ...(doc.dataAssets ?? []),
      { id: 'test-route-graph', kind: 'routeGraph', payload },
    ],
  };
}

function assertCode(doc: GameSpecDoc, code: string, messageMatch?: RegExp): void {
  const result = compileGameSpecToGameDef(doc);
  const diagnostic = result.diagnostics.find((entry) => entry.code === code);
  assert.ok(
    diagnostic,
    `expected ${code}; got ${result.diagnostics.map((entry) => `${entry.code}: ${entry.message}`).join('\n')}`,
  );
  if (messageMatch !== undefined) {
    assert.match(diagnostic.message, messageMatch);
  }
}

describe('plan role constraint route resolution', () => {
  it('rejects reachable constraints when routeGraph is missing', () => {
    assertCode(
      createDoc([{ reachable: { from: 'role.trainSpace', to: 'role.trainSpace', via: 'routeClass.land' } }], false),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PLAN_TEMPLATE_ROUTE_GRAPH_MISSING,
      /requires a routeGraph/u,
    );
  });

  it('rejects adjacent constraints when routeGraph is missing', () => {
    assertCode(
      createDoc([{ adjacent: { a: 'role.trainSpace', b: 'role.trainSpace' } }], false),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PLAN_TEMPLATE_ROUTE_GRAPH_MISSING,
      /requires a routeGraph/u,
    );
  });

  it('rejects unresolved routeClass refs', () => {
    assertCode(
      createDoc([{ reachable: { from: 'role.trainSpace', to: 'role.trainSpace', via: 'routeClass.trail' } }], true),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PLAN_TEMPLATE_ROUTE_CLASS_UNRESOLVED,
      /unknown route class "trail"/u,
    );
  });

  it('rejects routeGraph payloads with no route classes', () => {
    assertCode(
      createDocWithRouteGraphPayload({
        routeClasses: [],
        edges: [],
        defaultMaxHops: 2,
      }),
      'ROUTE_GRAPH_SCHEMA_INVALID',
      /Too small/u,
    );
  });

  it('rejects routeGraph edges referencing missing route classes', () => {
    assertCode(
      createDocWithRouteGraphPayload({
        routeClasses: [{ id: 'land' }],
        edges: [{ from: 'zone-a', to: 'zone-b', classes: ['trail'] }],
        defaultMaxHops: 2,
      }),
      'ROUTE_GRAPH_ROUTE_CLASS_UNRESOLVED',
      /unknown route class "trail"/u,
    );
  });

  it('rejects routeGraph payloads with non-positive defaultMaxHops', () => {
    assertCode(
      createDocWithRouteGraphPayload({
        routeClasses: [{ id: 'land' }],
        edges: [{ from: 'zone-a', to: 'zone-b', classes: ['land'] }],
        defaultMaxHops: 0,
      }),
      'ROUTE_GRAPH_SCHEMA_INVALID',
      />0/u,
    );
  });
});
