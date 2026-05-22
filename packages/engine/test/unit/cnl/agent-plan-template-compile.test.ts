// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '../../../src/cnl/index.js';
import type { GameSpecDoc } from '../../../src/cnl/game-spec-doc.js';

function createDoc(): GameSpecDoc {
  return {
    ...createEmptyGameSpecDoc(),
    metadata: { id: 'agent-plan-template-compile-test', players: { min: 2, max: 2 } },
    observability: {
      observers: {
        testObserver: {
          surfaces: { victory: { currentMargin: 'public' } },
        },
      },
    },
    zones: [
      { id: 'zone-a', owner: 'none', visibility: 'public', ordering: 'set', attributes: { population: 1 } },
      { id: 'zone-b', owner: 'none', visibility: 'public', ordering: 'set', attributes: { population: 2 } },
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
    dataAssets: [{
      id: 'seats',
      kind: 'seatCatalog',
      payload: { seats: [{ id: 'p1' }, { id: 'p2' }] },
    }],
  };
}

function zoneSelector(maxItems = 4): any {
  return {
    scopes: ['move'],
    source: { collection: { kind: 'zones' } },
    quality: {
      components: [{ id: 'constant', value: 1, weight: 1 }],
      order: 'qualityDesc',
    },
    result: { maxItems, order: ['qualityDesc', 'stableKeyAsc'], onEmpty: 'noContribution' },
  };
}

function compilePlanDoc() {
  return compileGameSpecToGameDef({
    ...createDoc(),
    agents: {
      library: {
        selectors: {
          trainSpace: zoneSelector(),
          governSpace: zoneSelector(),
        },
        planTemplates: {
          trainGovern: {
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
                match: {
                  decisionKind: 'chooseOne',
                  targetKind: 'zone',
                  decisionPath: 'special.target',
                  actionTag: 'specialActivity',
                  stageIndex: 1,
                },
              },
            ],
            caps: { capClass: 'standard256', maxSteps: 2 },
            fallback: {
              ifRoleTargetUnavailable: 'primitivePolicy',
              ifPreviewUnavailable: 'traceOnly',
            },
          },
          rivalTrainAdvise: {
            traceLabel: 'rival-train-advise',
            root: {
              actionTags: ['rival-operation'],
              compound: { specialTags: ['rival-special'], timing: 'after' },
            },
            roles: {
              trainSpace: { selector: 'trainSpace', required: true },
            },
            steps: [
              {
                label: 'select-rival-train-space',
                role: 'trainSpace',
                match: { decisionKind: 'chooseOne', targetKind: 'zone', decisionPath: 'operation.target' },
              },
            ],
            caps: { capClass: 'standard256', maxSteps: 1 },
            fallback: { ifRoleTargetUnavailable: 'primitivePolicy' },
          },
        },
        considerations: {
          neutral: { scopes: ['move'], weight: 1, value: 0 },
        },
        tieBreakers: { stableMoveKey: { kind: 'stableMoveKey' } },
      },
      profiles: {
        baseline: {
          observer: 'testObserver',
          params: {},
          use: {
            considerations: ['neutral'],
            guardrails: [],
            planTemplates: ['trainGovern'],
            tieBreakers: ['stableMoveKey'],
          },
        },
        rival: {
          observer: 'testObserver',
          params: {},
          use: {
            considerations: ['neutral'],
            guardrails: [],
            planTemplates: ['rivalTrainAdvise'],
            tieBreakers: ['stableMoveKey'],
          },
        },
      },
      bindings: { p1: 'baseline', p2: 'rival' },
    },
  });
}

describe('agent plan-template IR compilation', () => {
  it('lowers plan templates with role-bound selectors and deterministic catalog output', () => {
    const first = compilePlanDoc();
    const second = compilePlanDoc();

    assert.deepEqual(first.diagnostics.filter((diagnostic) => diagnostic.severity === 'error'), []);
    assert.deepEqual(second.diagnostics.filter((diagnostic) => diagnostic.severity === 'error'), []);
    assert.equal(first.gameDef?.agents?.schemaVersion, 3);

    const template = first.gameDef?.agents?.library.planTemplates?.trainGovern;
    assert.equal(template?.traceLabel, 'train-govern');
    assert.deepEqual(template?.root.actionTags, ['operation']);
    assert.deepEqual(template?.root.compound?.specialTags, ['specialActivity']);
    assert.equal(template?.roles.trainSpace?.selectorId, 'trainSpace');
    assert.equal(template?.roles.trainSpace?.selector.role, 'trainSpace');
    assert.equal(template?.roles.trainSpace?.selector.refs.quality, 'role.trainSpace.quality');
    assert.deepEqual(template?.roles.governSpace?.constraints, [{ kind: 'notEqual', role: 'trainSpace' }]);
    assert.equal(template?.steps[1]?.match.actionTag, 'specialActivity');
    assert.deepEqual(template?.caps, { capClass: 'standard256', maxSteps: 2 });
    assert.deepEqual(first.gameDef?.agents?.profiles.baseline?.plan.planTemplates, ['trainGovern']);
    assert.deepEqual(first.gameDef?.agents?.profiles.rival?.plan.planTemplates, ['rivalTrainAdvise']);

    assert.equal(JSON.stringify(first.gameDef), JSON.stringify(second.gameDef));
  });
});
