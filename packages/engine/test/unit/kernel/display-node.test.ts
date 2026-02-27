import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type {
  AnnotatedActionDescription,
  DisplayAnnotationNode,
  DisplayGroupNode,
  DisplayInlineNode,
  DisplayKeywordNode,
  DisplayLineNode,
  DisplayNode,
  DisplayNodeKind,
  DisplayOperatorNode,
  DisplayPunctuationNode,
  DisplayReferenceNode,
  DisplayValueNode,
  LimitUsageInfo,
} from '../../../src/kernel/index.js';

// ---------------------------------------------------------------------------
// Helpers — one exemplar for each node kind
// ---------------------------------------------------------------------------

const keyword: DisplayKeywordNode = { kind: 'keyword', text: 'if' };
const operator: DisplayOperatorNode = { kind: 'operator', text: '>=' };
const value: DisplayValueNode = { kind: 'value', text: '3', valueType: 'number' };
const valueNoType: DisplayValueNode = { kind: 'value', text: 'hello' };
const reference: DisplayReferenceNode = { kind: 'reference', text: 'Saigon', refKind: 'zone' };
const punctuation: DisplayPunctuationNode = { kind: 'punctuation', text: '(' };
const annotation: DisplayAnnotationNode = { kind: 'annotation', annotationType: 'pass', text: 'TRUE' };

const line: DisplayLineNode = {
  kind: 'line',
  indent: 1,
  children: [keyword, operator, value, reference, punctuation, annotation],
};

const group: DisplayGroupNode = {
  kind: 'group',
  label: 'Preconditions',
  icon: 'check',
  children: [line],
  collapsible: true,
};

const groupMinimal: DisplayGroupNode = {
  kind: 'group',
  label: 'Effects',
  children: [],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DisplayNode type system', () => {
  describe('kind discriminant', () => {
    const ALL_KINDS: readonly DisplayNodeKind[] = [
      'group',
      'line',
      'keyword',
      'operator',
      'value',
      'reference',
      'punctuation',
      'annotation',
    ] as const;

    const exemplars: Record<DisplayNodeKind, DisplayNode> = {
      group,
      line,
      keyword,
      operator,
      value,
      reference,
      punctuation,
      annotation,
    };

    it('covers every declared DisplayNodeKind', () => {
      for (const kind of ALL_KINDS) {
        assert.equal(exemplars[kind].kind, kind, `exemplar for "${kind}" has correct kind`);
      }
    });

    it('all exemplars have string kind fields', () => {
      for (const node of Object.values(exemplars)) {
        assert.equal(typeof node.kind, 'string');
      }
    });
  });

  describe('structured-clone round-trip', () => {
    it('inline nodes survive structuredClone', () => {
      const inlines: readonly DisplayInlineNode[] = [
        keyword,
        operator,
        value,
        valueNoType,
        reference,
        punctuation,
        annotation,
      ];

      for (const node of inlines) {
        const cloned = structuredClone(node);
        assert.deepEqual(cloned, node, `${node.kind} node round-trips`);
      }
    });

    it('DisplayLineNode survives structuredClone', () => {
      const cloned = structuredClone(line);
      assert.deepEqual(cloned, line);
    });

    it('DisplayGroupNode survives structuredClone', () => {
      const cloned = structuredClone(group);
      assert.deepEqual(cloned, group);
    });

    it('minimal DisplayGroupNode (no optional fields) survives structuredClone', () => {
      const cloned = structuredClone(groupMinimal);
      assert.deepEqual(cloned, groupMinimal);
    });

    it('nested group hierarchy survives structuredClone', () => {
      const nested: DisplayGroupNode = {
        kind: 'group',
        label: 'Root',
        children: [
          group,
          {
            kind: 'group',
            label: 'Inner',
            children: [line, keyword],
          },
        ],
      };
      const cloned = structuredClone(nested);
      assert.deepEqual(cloned, nested);
    });
  });

  describe('AnnotatedActionDescription', () => {
    it('survives structuredClone with all fields populated', () => {
      const limitUsage: readonly LimitUsageInfo[] = [
        { scope: 'turn', max: 1, current: 0 },
        { scope: 'phase', max: 3, current: 2 },
        { scope: 'game', max: 10, current: 7 },
      ];

      const description: AnnotatedActionDescription = {
        sections: [group, groupMinimal],
        limitUsage,
      };

      const cloned = structuredClone(description);
      assert.deepEqual(cloned, description);
    });

    it('survives structuredClone with empty sections and limits', () => {
      const description: AnnotatedActionDescription = {
        sections: [],
        limitUsage: [],
      };

      const cloned = structuredClone(description);
      assert.deepEqual(cloned, description);
    });
  });

  describe('LimitUsageInfo extends LimitDef', () => {
    it('has scope, max, and current fields', () => {
      const info: LimitUsageInfo = { scope: 'turn', max: 2, current: 1 };
      assert.equal(info.scope, 'turn');
      assert.equal(info.max, 2);
      assert.equal(info.current, 1);
    });
  });

  describe('plain-object invariant', () => {
    it('no node contains functions or class instances', () => {
      const description: AnnotatedActionDescription = {
        sections: [group],
        limitUsage: [{ scope: 'game', max: 5, current: 3 }],
      };

      const json = JSON.stringify(description);
      const parsed = JSON.parse(json) as AnnotatedActionDescription;
      assert.deepEqual(parsed, description, 'JSON round-trip preserves all data');
    });
  });
});
