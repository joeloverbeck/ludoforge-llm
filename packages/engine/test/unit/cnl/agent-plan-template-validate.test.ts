// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CNL_COMPILER_DIAGNOSTIC_CODES } from '../../../src/cnl/compiler-diagnostic-codes.js';
import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '../../../src/cnl/index.js';
import type { CnlCompilerDiagnosticCode } from '../../../src/cnl/compiler-diagnostic-codes.js';
import type { GameSpecDoc } from '../../../src/cnl/game-spec-doc.js';

function createDoc(planTemplates: Record<string, unknown>, selectors: Record<string, unknown> = defaultSelectors()): GameSpecDoc {
  return {
    ...createEmptyGameSpecDoc(),
    metadata: { id: 'agent-plan-template-validate-test', players: { min: 2, max: 2 } },
    observability: { observers: { testObserver: { surfaces: { victory: { currentMargin: 'public' } } } } },
    zones: [
      { id: 'zone-a', owner: 'none', visibility: 'public', ordering: 'set' },
      { id: 'zone-b', owner: 'none', visibility: 'public', ordering: 'set' },
    ],
    turnStructure: { phases: [{ id: 'main' }] },
    actions: [{
      id: 'pass',
      actor: 'active',
      executor: 'actor',
      phase: ['main'],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
      tags: ['pass'],
    }],
    terminal: {
      conditions: [{ when: { op: '==', left: 1, right: 0 }, result: { type: 'draw' } }],
      margins: [{ seat: 'p1', value: 0 }, { seat: 'p2', value: 0 }],
      ranking: { order: 'desc' },
    },
    dataAssets: [{ id: 'seats', kind: 'seatCatalog', payload: { seats: [{ id: 'p1' }, { id: 'p2' }] } }],
    agents: {
      library: {
        selectors: selectors as any,
        planTemplates: planTemplates as any,
        considerations: { neutral: { scopes: ['move'], weight: 1, value: 0 } },
        tieBreakers: { stableMoveKey: { kind: 'stableMoveKey' } },
      },
      profiles: {
        baseline: {
          observer: 'testObserver',
          params: {},
          use: { considerations: ['neutral'], guardrails: [], tieBreakers: ['stableMoveKey'] },
        },
      },
      bindings: { p1: 'baseline' },
    },
  };
}

function defaultSelectors(): Record<string, unknown> {
  return {
    trainSpace: zoneSelector(),
    governSpace: zoneSelector(),
  };
}

function zoneSelector(overrides: Record<string, unknown> = {}): any {
  return {
    scopes: ['move'],
    source: { collection: { kind: 'zones' } },
    quality: { components: [{ id: 'constant', value: 1, weight: 1 }], order: 'qualityDesc' },
    result: { maxItems: 4, order: ['qualityDesc', 'stableKeyAsc'], onEmpty: 'noContribution' },
    ...overrides,
  };
}

function validTemplate(overrides: Record<string, unknown> = {}): any {
  return {
    traceLabel: 'train-govern',
    root: {
      actionTags: ['operation'],
      compound: { specialTags: ['specialActivity'], timing: 'after' },
    },
    roles: {
      trainSpace: { selector: 'trainSpace', required: true },
      governSpace: {
        selector: 'governSpace',
        required: true,
        constraints: [{ notEqual: 'role.trainSpace' }],
      },
    },
    steps: [
      {
        label: 'select-train-space',
        role: 'trainSpace',
        match: { decisionKind: 'chooseOne', targetKind: 'zone', decisionPath: 'operation.target' },
      },
      {
        label: 'select-govern-space',
        role: 'governSpace',
        match: { decisionKind: 'chooseOne', targetKind: 'zone', decisionPath: 'special.target' },
      },
    ],
    caps: { capClass: 'standard256', maxSteps: 2 },
    fallback: { ifRoleTargetUnavailable: 'primitivePolicy', ifPreviewUnavailable: 'traceOnly' },
    ...overrides,
  };
}

function assertCode(doc: GameSpecDoc, code: CnlCompilerDiagnosticCode, messageMatch?: RegExp): void {
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

function diagnosticSnapshot(doc: GameSpecDoc): ReadonlyArray<Pick<ReturnType<typeof compileGameSpecToGameDef>['diagnostics'][number], 'code' | 'message' | 'path'>> {
  return compileGameSpecToGameDef(doc).diagnostics.map(({ code, message, path }) => ({ code, message, path }));
}

describe('agent plan-template validation diagnostics', () => {
  it('accepts a valid plan template without unknown-library-key diagnostics', () => {
    const result = compileGameSpecToGameDef(createDoc({ trainGovern: validTemplate() }));

    assert.deepEqual(result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error'), []);
    assert.equal(result.gameDef?.agents?.library.planTemplates?.trainGovern?.traceLabel, 'train-govern');
  });

  it('reports role selector refs, unbound role constraints, and missing step caps', () => {
    assertCode(
      createDoc({ trainGovern: validTemplate({ roles: { trainSpace: { selector: 'missing', required: true } } }) }),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PLAN_TEMPLATE_REF_UNKNOWN,
      /trainGovern.*trainSpace.*missing/u,
    );
    assertCode(
      createDoc({
        trainGovern: validTemplate({
          roles: {
            trainSpace: { selector: 'trainSpace', constraints: [{ notEqual: 'role.futureSpace' }] },
            futureSpace: { selector: 'governSpace' },
          },
        }),
      }),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PLAN_TEMPLATE_ROLE_UNBOUND,
      /trainGovern.*trainSpace.*futureSpace.*not bound/u,
    );
    assertCode(
      createDoc({ trainGovern: validTemplate({ caps: undefined }) }),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PLAN_TEMPLATE_CAPS_INVALID,
      /trainGovern.*caps/u,
    );
  });

  it('rejects role constraint kinds without runtime support', () => {
    assertCode(
      createDoc({
        trainGovern: validTemplate({
          roles: {
            trainSpace: { selector: 'trainSpace', required: true },
            governSpace: {
              selector: 'governSpace',
              required: true,
              constraints: [{ locatedIn: 'role.trainSpace' }],
            },
          },
        }),
      }),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PLAN_TEMPLATE_CONSTRAINT_UNSUPPORTED,
      /trainGovern.*governSpace.*locatedIn.*no runtime implementation/u,
    );
  });

  it('reports fallback target, fallback cycle, cap class, and stable ordering diagnostics', () => {
    assertCode(
      createDoc({ trainGovern: validTemplate({ fallback: { ifRoleTargetUnavailable: 'missingTemplate' } }) }),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PLAN_TEMPLATE_FALLBACK_UNKNOWN,
      /trainGovern.*missingTemplate/u,
    );
    assertCode(
      createDoc({
        trainGovern: validTemplate({ fallback: { ifRoleTargetUnavailable: 'alternate' } }),
        alternate: validTemplate({ fallback: { ifRoleTargetUnavailable: 'trainGovern' } }),
      }),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PLAN_TEMPLATE_FALLBACK_CYCLE,
      /trainGovern|alternate/u,
    );
    assertCode(
      createDoc({ trainGovern: validTemplate({ caps: { capClass: 'unknown', maxSteps: 2 } }) }),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PLAN_TEMPLATE_CAPS_INVALID,
      /capClass/u,
    );
    assertCode(
      createDoc(
        { trainGovern: validTemplate() },
        { trainSpace: zoneSelector({ result: { maxItems: 4, order: ['qualityDesc'], onEmpty: 'noContribution' } }), governSpace: zoneSelector() },
      ),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PLAN_TEMPLATE_STABLE_TIEBREAKER_REQUIRED,
      /trainGovern.*trainSpace.*stableKey/u,
    );
  });

  it('reports deterministic diagnostics for the same invalid plan template', () => {
    const doc = createDoc({
      trainGovern: validTemplate({
        roles: {
          trainSpace: { selector: 'missing', required: true },
          futureSpace: { selector: 'governSpace', constraints: [{ notEqual: 'role.trainSpace' }] },
        },
        caps: { capClass: 'unknown', maxSteps: 2 },
        fallback: { ifRoleTargetUnavailable: 'missingTemplate' },
      }),
    });

    assert.deepEqual(diagnosticSnapshot(doc), diagnosticSnapshot(doc));
  });
});
