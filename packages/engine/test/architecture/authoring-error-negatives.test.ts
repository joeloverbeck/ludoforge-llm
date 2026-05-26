// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CNL_COMPILER_DIAGNOSTIC_CODES } from '../../src/cnl/compiler-diagnostic-codes.js';
import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '../../src/cnl/index.js';
import {
  compoundWitnessZoneSelector,
  createAgentPlanCompoundWitnessDoc,
  defaultCompoundWitnessSelectors,
  validCompoundPlanTemplate,
} from './fixtures/agent-plan-compound-witness-fixture.js';
import type { CnlCompilerDiagnosticCode } from '../../src/cnl/compiler-diagnostic-codes.js';
import type {
  GameSpecDoc,
  GameSpecPhaseBoundaryDef,
  GameSpecScheduleKindDef,
} from '../../src/cnl/game-spec-doc.js';

interface GoldenDiagnostic {
  readonly code: CnlCompilerDiagnosticCode;
  readonly path: string;
  readonly message: string;
}

interface NegativeCase {
  readonly name: string;
  readonly doc: GameSpecDoc;
  readonly diagnostic: GoldenDiagnostic;
  readonly offender: string;
}

function diagnosticSnapshot(doc: GameSpecDoc, code: CnlCompilerDiagnosticCode): GoldenDiagnostic {
  const diagnostics = compileGameSpecToGameDef(doc).diagnostics;
  const diagnostic = diagnostics.find((entry) => entry.code === code);
  assert.ok(
    diagnostic,
    `expected ${code}; got ${diagnostics.map((entry) => `${entry.code}: ${entry.message}`).join('\n')}`,
  );
  return { code: diagnostic.code as CnlCompilerDiagnosticCode, path: diagnostic.path ?? '', message: diagnostic.message };
}

function assertGoldenDiagnostic(testCase: NegativeCase): void {
  const first = diagnosticSnapshot(testCase.doc, testCase.diagnostic.code);
  const second = diagnosticSnapshot(testCase.doc, testCase.diagnostic.code);

  assert.deepEqual(first, testCase.diagnostic);
  assert.deepEqual(second, testCase.diagnostic);
  assert.ok(
    first.message.includes(testCase.offender) || first.path.includes(testCase.offender),
    `expected diagnostic to identify ${testCase.offender}; got ${first.path}: ${first.message}`,
  );
}

function planDoc(planTemplates: Record<string, unknown>, selectors = defaultCompoundWitnessSelectors()): GameSpecDoc {
  return createAgentPlanCompoundWitnessDoc(planTemplates, selectors);
}

function validTemplate(overrides: Record<string, unknown> = {}): any {
  return validCompoundPlanTemplate(overrides);
}

function strategyModule(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    traceLabel: 'doctrine',
    when: true,
    applies: { scopes: ['move'] },
    priority: { tier: 10 },
    selectors: [{ role: 'primaryTarget', selectorId: 'trainSpace' }],
    scoreGroups: [{ id: 'targetQuality', summary: 'sum', terms: [{ id: 'constant', value: 1, weight: 1 }] }],
    guardrailIds: [],
    fallback: { ifInactive: 'noContribution', ifSelectorEmpty: 'noContribution' },
    ...overrides,
  };
}

function doctrineGatingDoc(strategyModuleOverrides: Record<string, unknown>): GameSpecDoc {
  const base = planDoc({
    alphaPlan: validTemplate({ traceLabel: 'alpha-plan' }),
    betaPlan: validTemplate({ traceLabel: 'beta-plan' }),
  });
  const baseline = base.agents!.profiles!.baseline!;
  return {
    ...base,
    agents: {
      ...base.agents!,
      library: {
        ...base.agents!.library,
        strategyModules: { doctrine: strategyModule(strategyModuleOverrides) },
      },
      profiles: {
        baseline: {
          ...baseline,
          use: {
            ...baseline.use,
            planTemplates: ['alphaPlan', 'betaPlan'],
            strategyModules: ['doctrine'],
          },
        },
      },
    },
  };
}

function selectorDiagnosticsDoc(selectorDef: Record<string, unknown>): GameSpecDoc {
  return {
    ...createEmptyGameSpecDoc(),
    metadata: { id: 'authoring-error-selector-negative', players: { min: 2, max: 2 } },
    observability: { observers: { testObserver: { surfaces: { victory: { currentMargin: 'public' } } } } },
    zones: [{ id: 'zone-a', owner: 'none', visibility: 'public', ordering: 'set' }],
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
      library: { selectors: { bad: selectorDef as any } },
      profiles: {},
      bindings: {},
    },
  };
}

function validSelector(overrides: Record<string, unknown> = {}): any {
  return {
    scopes: ['move'],
    source: { collection: { kind: 'zones' } },
    quality: { components: [{ id: 'constant', value: 1, weight: 1 }], order: 'qualityDesc' },
    result: { maxItems: 4, order: ['qualityDesc', 'stableKeyAsc'], onEmpty: 'noContribution' },
    ...overrides,
  };
}

function previewFallbackDoc(consideration: Record<string, unknown>): GameSpecDoc {
  return {
    ...createEmptyGameSpecDoc(),
    metadata: { id: 'authoring-error-preview-negative', players: { min: 2, max: 2 } },
    dataAssets: [{ id: 'seats', kind: 'seatCatalog', payload: { seats: [{ id: 'us' }, { id: 'them' }] } }],
    zones: [{ id: 'board', owner: 'none', visibility: 'public', ordering: 'set' }],
    turnStructure: { phases: [{ id: 'main' }] },
    actions: [],
    terminal: {
      conditions: [],
      margins: [{ seat: 'us', value: 0 }, { seat: 'them', value: 0 }],
      ranking: { order: 'desc' },
    },
    observability: { observers: { currentPlayer: { surfaces: { victory: { currentMargin: 'public' } } } } },
    agents: {
      library: {
        considerations: { preferProjectedMargin: consideration as any },
        tieBreakers: { stableMoveKey: { kind: 'stableMoveKey' } },
      },
      profiles: {
        baseline: {
          observer: 'currentPlayer',
          params: {},
          use: { guardrails: [], considerations: ['preferProjectedMargin'], tieBreakers: ['stableMoveKey'] },
          preview: { mode: 'exactWorld' },
        },
      },
      bindings: { us: 'baseline' },
    },
  };
}

function cardScheduleDoc(boundary: GameSpecPhaseBoundaryDef): GameSpecDoc {
  return {
    ...createEmptyGameSpecDoc(),
    metadata: { id: 'authoring-error-observer-policy-negative', players: { min: 1, max: 1 } },
    dataAssets: [{ id: 'seats', kind: 'seatCatalog', payload: { seats: [{ id: 'solo' }] } }],
    zones: [
      { id: 'draw', owner: 'none', visibility: 'hidden', ordering: 'stack', behavior: { type: 'deck', drawFrom: 'top' } },
      { id: 'discard', owner: 'none', visibility: 'public', ordering: 'stack' },
      { id: 'lookahead', owner: 'none', visibility: 'public', ordering: 'stack' },
    ],
    turnStructure: { phases: [{ id: 'main' }, { id: 'scoring' }] },
    actions: [{
      id: 'pass',
      actor: 'active',
      executor: 'actor',
      phase: ['main'],
      tags: ['pass'],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    }],
    terminal: { conditions: [] },
    eventDecks: [{
      id: 'eventDeck',
      drawZone: 'draw:none',
      discardZone: 'discard:none',
      cards: [{ id: 'coup-1', title: 'Coup 1', sideMode: 'single', tags: ['coup'] }],
    }],
    phaseBoundaries: [boundary],
  };
}

function cardBoundary(schedule: GameSpecScheduleKindDef): GameSpecPhaseBoundaryDef {
  return { id: 'coupEntry', kind: 'phaseEntry', phaseId: 'scoring', schedule };
}

function validCardSchedule(): Extract<GameSpecScheduleKindDef, { readonly kind: 'cardDraw' }> {
  return {
    kind: 'cardDraw',
    deckId: 'eventDeck',
    cardSelector: { tags: ['coup'] },
    observerPolicy: {
      kind: 'topNVisible',
      visiblePrefix: { sources: [{ id: 'lookahead:none', take: 1 }] },
    },
  };
}

const negativeCases: readonly NegativeCase[] = [
  {
    name: 'unsupported role-constraint kind',
    doc: planDoc({
      trainGovern: validTemplate({
        roles: {
          trainSpace: { selector: 'trainSpace', required: true },
          governSpace: {
            selector: 'governSpace',
            required: true,
            constraints: [{ unknownKind: 'role.trainSpace' }],
          },
        },
      }),
    }),
    diagnostic: {
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PLAN_TEMPLATE_CONSTRAINT_UNSUPPORTED,
      path: 'doc.agents.library.planTemplates.trainGovern.roles.governSpace.constraints.0.unknownKind',
      message: 'Plan template "trainGovern" role "governSpace" constraint "unknownKind" has no runtime implementation.',
    },
    offender: 'unknownKind',
  },
  {
    name: 'targetKind mismatch',
    doc: planDoc({
      trainGovern: validTemplate({
        steps: [{
          label: 'bad-kind',
          role: 'trainSpace',
          match: { decisionKind: 'chooseOne', targetKind: 'token', decisionPath: 'operationTarget', actionTag: 'operation' },
        }],
      }),
    }),
    diagnostic: {
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PLAN_TEMPLATE_STEP_MATCH_INVALID,
      path: 'doc.agents.library.planTemplates.trainGovern.steps.0.match.targetKind',
      message: 'Plan template "trainGovern" step 0 role "trainSpace" targetKind "token" does not match selector target kind "zone".',
    },
    offender: 'trainSpace',
  },
  {
    name: 'out-of-range stageIndex',
    doc: planDoc({
      trainGovern: validTemplate({
        steps: [{
          label: 'bad-stage',
          role: 'trainSpace',
          match: {
            decisionKind: 'chooseOne',
            targetKind: 'zone',
            decisionPath: 'operationStageTarget',
            actionTag: 'operation',
            stageIndex: 4,
          },
        }],
      }),
    }),
    diagnostic: {
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PLAN_TEMPLATE_STEP_MATCH_INVALID,
      path: 'doc.agents.library.planTemplates.trainGovern.steps.0.match',
      message: 'Plan template "trainGovern" step 0 role "trainSpace" match does not resolve to a declared decision surface.',
    },
    offender: 'trainGovern',
  },
  {
    name: 'ungrantable compound timing',
    doc: planDoc({
      trainGovern: validTemplate({
        root: { actionTags: ['operation'], compound: { specialTags: ['missingSpecial'], timing: 'after' } },
      }),
    }),
    diagnostic: {
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PLAN_TEMPLATE_COMPOUND_UNPROVABLE,
      path: 'doc.agents.library.planTemplates.trainGovern.root.compound',
      message: 'Plan template "trainGovern" root.compound has no authored operation/special-activity continuation witness for the requested tags and timing.',
    },
    offender: 'trainGovern',
  },
  {
    name: 'unknown enablesPlanTemplates id',
    doc: doctrineGatingDoc({ enablesPlanTemplates: ['missingPlan'] }),
    diagnostic: {
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_MODULE_REF_UNKNOWN,
      path: 'doc.agents.library.strategyModules.doctrine.enablesPlanTemplates.0',
      message: 'Strategy module "doctrine" enablesPlanTemplates references unknown plan template "missingPlan".',
    },
    offender: 'missingPlan',
  },
  {
    name: 'unbounded subset selector',
    doc: selectorDiagnosticsDoc(validSelector({
      source: { kind: 'subset', of: { collection: { kind: 'zones' } } },
    })),
    diagnostic: {
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_SELECTOR_MAXITEMS_MISSING_OR_EXCEEDS_CAP,
      path: 'doc.agents.library.selectors.bad.source',
      message: 'subset selector source requires min, max, and beamWidth.',
    },
    offender: 'bad',
  },
  {
    name: 'card observer-policy source missing take',
    doc: cardScheduleDoc(cardBoundary({
      ...validCardSchedule(),
      observerPolicy: {
        kind: 'topNVisible',
        visiblePrefix: { sources: [{ id: 'lookahead:none' }] },
      },
    } as unknown as GameSpecScheduleKindDef)),
    diagnostic: {
      code: CNL_COMPILER_DIAGNOSTIC_CODES.OBSERVER_POLICY_MISSING_TAKE,
      path: 'doc.phaseBoundaries.0.schedule.observerPolicy.visiblePrefix.sources.0.take',
      message: 'phase boundary "coupEntry" observerPolicy source "lookahead:none" must declare take.',
    },
    offender: 'coupEntry',
  },
  {
    name: 'hidden preview ref without authored fallback',
    doc: previewFallbackDoc({
      scopes: ['microturn'],
      weight: 1,
      value: { ref: 'preview.option.delta.victory.currentMargin.self' },
    }),
    diagnostic: {
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_REF_REQUIRES_EXPLICIT_FALLBACK,
      path: 'doc.agents.library.considerations.preferProjectedMargin.previewFallback',
      message: 'Consideration "preferProjectedMargin" references preview.option.delta.victory.currentMargin.self but does not declare previewFallback.onUnavailable.',
    },
    offender: 'preferProjectedMargin',
  },
];

describe('authoring-error negative-test infrastructure', () => {
  for (const negativeCase of negativeCases) {
    it(`golden-checks ${negativeCase.name}`, () => {
      assertGoldenDiagnostic(negativeCase);
    });
  }

  it('documents the extension pattern for future validation surfaces', () => {
    const names = negativeCases.map((testCase) => testCase.name);
    assert.deepEqual(names, [
      'unsupported role-constraint kind',
      'targetKind mismatch',
      'out-of-range stageIndex',
      'ungrantable compound timing',
      'unknown enablesPlanTemplates id',
      'unbounded subset selector',
      'card observer-policy source missing take',
      'hidden preview ref without authored fallback',
    ]);
    const trainSpaceSelector = defaultCompoundWitnessSelectors().trainSpace as ReturnType<typeof compoundWitnessZoneSelector>;
    assert.equal(trainSpaceSelector.source.collection.kind, compoundWitnessZoneSelector().source.collection.kind);
  });
});
