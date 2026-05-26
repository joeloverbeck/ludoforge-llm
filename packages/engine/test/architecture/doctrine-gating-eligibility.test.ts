// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createDoctrineGatingCatalog,
  doctrineStrategyModule,
  proposeDoctrineGatingPlan,
  richDoctrineGatingCatalog,
} from '../helpers/doctrine-gating-fixtures.js';

describe('doctrine-gated plan-template eligibility invariants', () => {
  it('restricts candidates to enabled templates and records non-enabled provenance', () => {
    const result = proposeDoctrineGatingPlan(createDoctrineGatingCatalog({
      modules: [doctrineStrategyModule({
        id: 'doctrine.enable' as never,
        enablesPlanTemplates: ['alpha' as never, 'beta' as never],
      })],
    }));

    assert.equal(result.status, 'selected');
    assert.deepEqual(result.alternatives.map((alternative) => alternative.templateId), ['alpha', 'beta']);
    assert.deepEqual(result.filteredOutTemplates, [
      { templateId: 'gamma', gatedBy: ['doctrine.enable'], reason: 'notEnabled' },
    ]);
  });

  it('removes suppressed templates and records suppressing provenance', () => {
    const result = proposeDoctrineGatingPlan(createDoctrineGatingCatalog({
      modules: [doctrineStrategyModule({
        id: 'doctrine.suppress' as never,
        suppressesPlanTemplates: ['gamma' as never],
      })],
    }));

    assert.equal(result.status, 'selected');
    assert.deepEqual(result.alternatives.map((alternative) => alternative.templateId), ['alpha', 'beta']);
    assert.deepEqual(result.filteredOutTemplates, [
      { templateId: 'gamma', gatedBy: ['doctrine.suppress'], reason: 'suppressed' },
    ]);
  });

  it('lets suppression win over an enabled template', () => {
    const result = proposeDoctrineGatingPlan(richDoctrineGatingCatalog());

    assert.equal(result.status, 'selected');
    assert.deepEqual(result.alternatives.map((alternative) => alternative.templateId), ['alpha']);
    assert.deepEqual(result.filteredOutTemplates, [
      { templateId: 'beta', gatedBy: ['doctrine.suppress'], reason: 'suppressed' },
      { templateId: 'gamma', gatedBy: ['doctrine.enable'], reason: 'notEnabled' },
    ]);
  });

  it('returns noEligibleTemplate when active gating removes every template', () => {
    const result = proposeDoctrineGatingPlan(createDoctrineGatingCatalog({
      modules: [
        doctrineStrategyModule({ id: 'doctrine.enable' as never, enablesPlanTemplates: ['alpha' as never] }),
        doctrineStrategyModule({ id: 'doctrine.suppress' as never, suppressesPlanTemplates: ['alpha' as never] }),
      ],
    }));

    assert.equal(result.status, 'noEligibleTemplate');
    assert.deepEqual(result.alternatives, []);
    assert.deepEqual(result.filteredOutTemplates, [
      { templateId: 'alpha', gatedBy: ['doctrine.suppress'], reason: 'suppressed' },
      { templateId: 'beta', gatedBy: ['doctrine.enable'], reason: 'notEnabled' },
      { templateId: 'gamma', gatedBy: ['doctrine.enable'], reason: 'notEnabled' },
    ]);
  });

  it('keeps every filtered template tied to explicit doctrine provenance', () => {
    const results = [
      proposeDoctrineGatingPlan(createDoctrineGatingCatalog({
        modules: [doctrineStrategyModule({ id: 'doctrine.enable' as never, enablesPlanTemplates: ['alpha' as never] })],
      })),
      proposeDoctrineGatingPlan(createDoctrineGatingCatalog({
        modules: [doctrineStrategyModule({ id: 'doctrine.suppress' as never, suppressesPlanTemplates: ['gamma' as never] })],
      })),
      proposeDoctrineGatingPlan(richDoctrineGatingCatalog()),
    ];

    for (const entry of results.flatMap((result) => result.filteredOutTemplates)) {
      assert.ok(entry.gatedBy.length > 0, `expected non-empty provenance for ${entry.templateId}`);
    }
  });
});
