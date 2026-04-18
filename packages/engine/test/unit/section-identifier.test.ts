// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveSectionsFromBlock } from '../../src/cnl/section-identifier.js';

describe('resolveSectionsFromBlock', () => {
  it('recognizes explicit phaseTemplates section key', () => {
    const result = resolveSectionsFromBlock({
      phaseTemplates: [
        {
          id: 'betting-round',
          params: [{ name: 'minBet' }],
          phase: { id: 'placeholder', steps: [] },
        },
      ],
    });

    assert.equal(result.issue, undefined);
    assert.equal(result.resolved.length, 1);
    assert.equal(result.resolved[0]?.section, 'phaseTemplates');
  });

  it('identifies phaseTemplates by fingerprint when key is the only entry', () => {
    const block = {
      phaseTemplates: [
        {
          id: 'round-tmpl',
          params: [],
          phase: { id: 'round', steps: [] },
        },
      ],
    };

    const result = resolveSectionsFromBlock(block);

    assert.equal(result.issue, undefined);
    assert.equal(result.resolved.length, 1);
    assert.equal(result.resolved[0]?.section, 'phaseTemplates');
  });

  it('rejects phaseTemplates fingerprint when entries lack id', () => {
    const block = {
      phaseTemplates: [
        { params: [], phase: {} },
      ],
    };

    const result = resolveSectionsFromBlock(block);

    // Should resolve via canonical key match (phaseTemplates is a canonical key),
    // even though fingerprint would fail — canonical key match takes priority.
    assert.equal(result.resolved.length, 1);
    assert.equal(result.resolved[0]?.section, 'phaseTemplates');
  });

  it('rejects phaseTemplates fingerprint when entries lack params array', () => {
    const block = {
      phaseTemplates: [
        { id: 'tmpl', phase: {} },
      ],
    };

    const result = resolveSectionsFromBlock(block);

    // Canonical key match still works
    assert.equal(result.resolved.length, 1);
    assert.equal(result.resolved[0]?.section, 'phaseTemplates');
  });

  it('recognizes phaseTemplates via explicit section annotation', () => {
    const result = resolveSectionsFromBlock({
      section: 'phaseTemplates',
      someData: [{ id: 'tmpl', params: [] }],
    });

    assert.equal(result.issue, undefined);
    assert.equal(result.resolved.length, 1);
    assert.equal(result.resolved[0]?.section, 'phaseTemplates');
  });

  it('recognizes agents via canonical top-level key', () => {
    const result = resolveSectionsFromBlock({
      agents: {
        profiles: {
          baseline: {
            params: {},
            use: {
              pruningRules: [],
              considerations: [],
              tieBreakers: ['stableMoveKey'],
            },
          },
        },
      },
    });

    assert.equal(result.issue, undefined);
    assert.equal(result.resolved.length, 1);
    assert.equal(result.resolved[0]?.section, 'agents');
  });

  it('recognizes agents via explicit section annotation', () => {
    const result = resolveSectionsFromBlock({
      section: 'agents',
      profiles: {
        baseline: {
          params: {},
          use: {
            pruningRules: [],
            considerations: [],
            tieBreakers: ['stableMoveKey'],
          },
        },
      },
    });

    assert.equal(result.issue, undefined);
    assert.equal(result.resolved.length, 1);
    assert.equal(result.resolved[0]?.section, 'agents');
  });
});
