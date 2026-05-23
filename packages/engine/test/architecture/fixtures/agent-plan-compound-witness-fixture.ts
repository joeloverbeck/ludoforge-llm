import { createEmptyGameSpecDoc } from '../../../src/cnl/index.js';
import type { GameSpecDoc } from '../../../src/cnl/game-spec-doc.js';

export function createAgentPlanCompoundWitnessDoc(
  planTemplates: Record<string, unknown>,
  selectors: Record<string, unknown> = defaultCompoundWitnessSelectors(),
): GameSpecDoc {
  return {
    ...createEmptyGameSpecDoc(),
    metadata: { id: 'agent-plan-compound-witness-test', players: { min: 2, max: 2 } },
    observability: { observers: { testObserver: { surfaces: { victory: { currentMargin: 'public' } } } } },
    zones: [
      { id: 'zone-a', owner: 'none', visibility: 'public', ordering: 'set' },
      { id: 'zone-b', owner: 'none', visibility: 'public', ordering: 'set' },
    ],
    turnStructure: { phases: [{ id: 'main' }] },
    actions: [{
      id: 'operation',
      actor: 'active',
      executor: 'actor',
      phase: ['main'],
      params: [
        { name: 'operationTarget', domain: { query: 'mapSpaces' } },
      ],
      pre: null,
      cost: [],
      effects: [
        {
          chooseOne: {
            bind: '$specialTarget',
            options: { query: 'mapSpaces' },
          },
        },
      ],
      limits: [],
      tags: ['operation'],
    }, {
      id: 'special',
      actor: 'active',
      executor: 'actor',
      phase: ['main'],
      params: [],
      pre: null,
      cost: [],
      effects: [
        {
          chooseOne: {
            bind: '$specialTarget',
            options: { query: 'mapSpaces' },
          },
        },
      ],
      limits: [],
      tags: ['special-activity'],
    }],
    actionPipelines: [{
      id: 'operation-profile',
      actionId: 'operation',
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [
        { effects: [] },
        { effects: [{ chooseOne: { bind: '$operationStageTarget', options: { query: 'mapSpaces' } } }] },
      ],
      atomicity: 'partial',
    }, {
      id: 'special-profile',
      actionId: 'special',
      accompanyingOps: ['operation'],
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [{ effects: [] }],
      atomicity: 'partial',
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

export function defaultCompoundWitnessSelectors(): Record<string, unknown> {
  return {
    trainSpace: compoundWitnessZoneSelector(),
    governSpace: compoundWitnessZoneSelector(),
  };
}

export function compoundWitnessZoneSelector(overrides: Record<string, unknown> = {}): any {
  return {
    scopes: ['move'],
    source: { collection: { kind: 'zones' } },
    quality: { components: [{ id: 'constant', value: 1, weight: 1 }], order: 'qualityDesc' },
    result: { maxItems: 4, order: ['qualityDesc', 'stableKeyAsc'], onEmpty: 'noContribution' },
    ...overrides,
  };
}

export function validCompoundPlanTemplate(overrides: Record<string, unknown> = {}): any {
  return {
    traceLabel: 'train-govern',
    root: {
      actionTags: ['operation'],
      compound: { specialTags: ['special-activity'], timing: 'after' },
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
        match: { decisionKind: 'chooseOne', targetKind: 'zone', decisionPath: 'operationTarget', actionTag: 'operation' },
      },
      {
        label: 'select-govern-space',
        role: 'governSpace',
        match: { decisionKind: 'chooseOne', targetKind: 'zone', decisionPath: 'specialTarget', actionTag: 'special-activity' },
      },
    ],
    caps: { capClass: 'standard256', maxSteps: 2 },
    fallback: { ifRoleTargetUnavailable: 'primitivePolicy', ifPreviewUnavailable: 'traceOnly' },
    ...overrides,
  };
}
