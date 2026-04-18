// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { asPlayerId } from '../../src/kernel/branded.js';
import {
  createCollector,
  emitConditionTrace,
  emitDecisionTrace,
  emitSelectorTrace,
  emitTrace,
} from '../../src/kernel/execution-collector.js';

const provenance = {
  phase: 'main',
  eventContext: 'actionEffect',
  effectPath: 'test',
} as const;

describe('trace emission with sequencing', () => {
  it('assigns incrementing seq across channels', () => {
    const c = createCollector({
      trace: true,
      conditionTrace: true,
      decisionTrace: true,
      selectorTrace: true,
    });

    emitTrace(c, {
      kind: 'moveToken',
      tokenId: 't1',
      from: 'a',
      to: 'b',
      provenance,
    });

    emitConditionTrace(c, {
      kind: 'conditionEval',
      condition: true,
      result: true,
      context: 'ifBranch',
      provenance,
    });

    emitSelectorTrace(c, {
      kind: 'selectorResolution',
      selectorType: 'player',
      selectorExpr: 'all',
      candidateCount: 4,
      resolvedIds: ['0', '1', '2', '3'],
      provenance,
    });

    emitDecisionTrace(c, {
      kind: 'decision',
      decisionKey: '$target',
      type: 'chooseOne',
      player: asPlayerId(0),
      options: ['a', 'b'],
      selected: ['a'],
      provenance,
    });

    assert.equal(c.trace![0]!.seq, 0);
    assert.equal(c.conditionTrace![0]!.seq, 1);
    assert.equal(c.selectorTrace![0]!.seq, 2);
    assert.equal(c.decisionTrace![0]!.seq, 3);
    assert.equal(c.nextSeq, 4);
  });

  it('does not emit when channel is disabled', () => {
    const c = createCollector({ trace: true });

    emitConditionTrace(c, {
      kind: 'conditionEval',
      condition: true,
      result: true,
      context: 'ifBranch',
      provenance,
    });

    assert.equal(c.conditionTrace, null);
    assert.equal(c.decisionTrace, null);
    assert.equal(c.selectorTrace, null);
    assert.equal(c.nextSeq, 0);
  });

  it('does not emit when collector is undefined', () => {
    emitConditionTrace(undefined, {
      kind: 'conditionEval',
      condition: true,
      result: true,
      context: 'ifBranch',
      provenance,
    });
    emitDecisionTrace(undefined, {
      kind: 'decision',
      decisionKey: '$x',
      type: 'chooseOne',
      player: asPlayerId(0),
      options: [],
      selected: [],
      provenance,
    });
    emitSelectorTrace(undefined, {
      kind: 'selectorResolution',
      selectorType: 'zone',
      selectorExpr: 'hand:actor',
      candidateCount: 0,
      resolvedIds: [],
      provenance,
    });
    // No assertions needed — just verifying no throw
  });

  it('createCollector initializes all channels correctly', () => {
    const full = createCollector({
      trace: true,
      conditionTrace: true,
      decisionTrace: true,
      selectorTrace: true,
    });
    assert.ok(Array.isArray(full.trace));
    assert.ok(Array.isArray(full.conditionTrace));
    assert.ok(Array.isArray(full.decisionTrace));
    assert.ok(Array.isArray(full.selectorTrace));
    assert.equal(full.nextSeq, 0);

    const minimal = createCollector();
    assert.equal(minimal.trace, null);
    assert.equal(minimal.conditionTrace, null);
    assert.equal(minimal.decisionTrace, null);
    assert.equal(minimal.selectorTrace, null);
    assert.equal(minimal.nextSeq, 0);
  });
});
