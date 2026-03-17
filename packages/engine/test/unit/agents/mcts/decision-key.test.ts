import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { decisionNodeKey, templateDecisionRootKey } from '../../../../src/agents/mcts/decision-key.js';

describe('decisionNodeKey', () => {
  it('produces a deterministic key from actionId, bindingName, and bindingValue', () => {
    const key = decisionNodeKey('rally', 'province', 'quang-tri');
    assert.equal(typeof key, 'string');
    assert.equal(key, decisionNodeKey('rally', 'province', 'quang-tri'));
  });

  it('different binding values produce different keys', () => {
    const k1 = decisionNodeKey('rally', 'province', 'quang-tri');
    const k2 = decisionNodeKey('rally', 'province', 'binh-dinh');
    assert.notEqual(k1, k2);
  });

  it('different binding names produce different keys', () => {
    const k1 = decisionNodeKey('rally', 'province', 'quang-tri');
    const k2 = decisionNodeKey('rally', 'city', 'quang-tri');
    assert.notEqual(k1, k2);
  });

  it('different actionIds produce different keys', () => {
    const k1 = decisionNodeKey('rally', 'province', 'quang-tri');
    const k2 = decisionNodeKey('march', 'province', 'quang-tri');
    assert.notEqual(k1, k2);
  });

  it('keys are prefixed with D: to distinguish from concrete move keys', () => {
    const key = decisionNodeKey('rally', 'province', 'quang-tri');
    assert.ok(key.startsWith('D:'));
  });

  it('keys contain no undefined or null components', () => {
    const key = decisionNodeKey('rally', 'province', 'quang-tri');
    assert.ok(!key.includes('undefined'));
    assert.ok(!key.includes('null'));
  });

  it('encodes actionId, binding name, and binding value in the format D:<actionId>:<bindingName>=<value>', () => {
    const key = decisionNodeKey('rally', 'province', 'quang-tri');
    assert.equal(key, 'D:rally:province=quang-tri');
  });
});

describe('templateDecisionRootKey', () => {
  it('produces D:<actionId> format', () => {
    const key = templateDecisionRootKey('rally');
    assert.equal(key, 'D:rally');
  });

  it('is deterministic — same input produces same output', () => {
    assert.equal(
      templateDecisionRootKey('march'),
      templateDecisionRootKey('march'),
    );
  });

  it('different actionIds produce different keys', () => {
    assert.notEqual(
      templateDecisionRootKey('rally'),
      templateDecisionRootKey('march'),
    );
  });

  it('is prefixed with D:', () => {
    assert.ok(templateDecisionRootKey('train').startsWith('D:'));
  });

  it('does not collide with decisionNodeKey for the same actionId', () => {
    const rootKey = templateDecisionRootKey('rally');
    const nodeKey = decisionNodeKey('rally', 'province', 'quang-tri');
    assert.notEqual(rootKey, nodeKey);
  });
});
