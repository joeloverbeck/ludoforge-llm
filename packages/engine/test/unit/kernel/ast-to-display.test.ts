import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asPlayerId,
  type ActionDef,
  type ConditionAST,
  type DisplayGroupNode,
  type DisplayInlineNode,
  type DisplayLineNode,
  type DisplayNode,
  type EffectAST,
  type OptionsQuery,
  type ValueExpr,
} from '../../../src/kernel/index.js';

import {
  actionDefToDisplayTree,
  conditionToDisplayNodes,
  effectToDisplayNodes,
  optionsQueryToInlineNodes,
  playerSelToInlineNodes,
  valueExprToInlineNodes,
  zoneRefToInlineNodes,
} from '../../../src/kernel/index.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const asLine = (node: DisplayNode): DisplayLineNode => {
  assert.equal(node.kind, 'line');
  return node as DisplayLineNode;
};

const asGroup = (node: DisplayNode): DisplayGroupNode => {
  assert.equal(node.kind, 'group');
  return node as DisplayGroupNode;
};

const kinds = (nodes: readonly DisplayInlineNode[]): string[] => nodes.map((n) => n.kind);

const texts = (nodes: readonly DisplayInlineNode[]): string[] => nodes.map((n) => n.text);

const findByKind = (nodes: readonly DisplayInlineNode[], kind: string): DisplayInlineNode[] =>
  nodes.filter((n) => n.kind === kind);

// ---------------------------------------------------------------------------
// Minimal ActionDef factory
// ---------------------------------------------------------------------------

const minimalActionDef = (overrides: Partial<ActionDef> = {}): ActionDef => ({
  id: 'test' as ActionDef['id'],
  actor: 'active',
  executor: 'actor',
  phase: [],
  params: [],
  pre: null,
  cost: [],
  effects: [],
  limits: [],
  ...overrides,
});

// ---------------------------------------------------------------------------
// ConditionAST tests
// ---------------------------------------------------------------------------

describe('conditionToDisplayNodes', () => {
  it('renders boolean literal true', () => {
    const nodes = conditionToDisplayNodes(true, 0);
    assert.equal(nodes.length, 1);
    const ln = asLine(nodes[0]!);
    assert.equal(ln.indent, 0);
    assert.deepEqual(texts(ln.children), ['true']);
    assert.deepEqual(kinds(ln.children), ['value']);
  });

  it('renders boolean literal false', () => {
    const nodes = conditionToDisplayNodes(false, 0);
    const ln = asLine(nodes[0]!);
    assert.deepEqual(texts(ln.children), ['false']);
  });

  it('renders and with children', () => {
    const cond: ConditionAST = { op: 'and', args: [true, false] };
    const nodes = conditionToDisplayNodes(cond, 0);
    assert.ok(nodes.length >= 3);
    const header = asLine(nodes[0]!);
    assert.equal(header.indent, 0);
    assert.ok(texts(header.children).includes('and'));
    // Children are indented
    const child1 = asLine(nodes[1]!);
    assert.equal(child1.indent, 1);
  });

  it('renders or with children', () => {
    const cond: ConditionAST = { op: 'or', args: [true] };
    const nodes = conditionToDisplayNodes(cond, 0);
    const header = asLine(nodes[0]!);
    assert.ok(texts(header.children).includes('or'));
  });

  it('renders not with child', () => {
    const cond: ConditionAST = { op: 'not', arg: true };
    const nodes = conditionToDisplayNodes(cond, 0);
    assert.ok(nodes.length >= 2);
    const header = asLine(nodes[0]!);
    assert.ok(texts(header.children).includes('not'));
    const child = asLine(nodes[1]!);
    assert.equal(child.indent, 1);
  });

  for (const compOp of ['==', '!=', '<', '<=', '>', '>='] as const) {
    it(`renders comparison ${compOp}`, () => {
      const cond: ConditionAST = { op: compOp, left: 1, right: 2 };
      const nodes = conditionToDisplayNodes(cond, 0);
      assert.equal(nodes.length, 1);
      const ln = asLine(nodes[0]!);
      const opNodes = findByKind(ln.children, 'operator');
      assert.ok(opNodes.some((n) => n.text === compOp));
    });
  }

  it('renders in condition', () => {
    const cond: ConditionAST = { op: 'in', item: 1, set: 2 };
    const nodes = conditionToDisplayNodes(cond, 0);
    const ln = asLine(nodes[0]!);
    assert.ok(texts(ln.children).includes('in'));
  });

  it('renders adjacent condition', () => {
    const cond: ConditionAST = { op: 'adjacent', left: 'Saigon', right: 'CentralVietnam' };
    const nodes = conditionToDisplayNodes(cond, 0);
    const ln = asLine(nodes[0]!);
    assert.ok(texts(ln.children).includes('adjacent'));
    const refs = findByKind(ln.children, 'reference');
    assert.ok(refs.some((n) => n.text === 'Saigon'));
  });

  it('renders connected condition with maxDepth', () => {
    const cond: ConditionAST = { op: 'connected', from: 'A', to: 'B', maxDepth: 3 };
    const nodes = conditionToDisplayNodes(cond, 0);
    const ln = asLine(nodes[0]!);
    assert.ok(texts(ln.children).includes('connected'));
    assert.ok(texts(ln.children).includes('3'));
  });

  it('renders connected condition with via', () => {
    const cond: ConditionAST = {
      op: 'connected',
      from: 'A',
      to: 'B',
      via: { op: '==', left: { ref: 'zoneProp', zone: 'A', prop: 'terrain' }, right: '"jungle"' },
    };
    const nodes = conditionToDisplayNodes(cond, 0);
    const ln = asLine(nodes[0]!);
    assert.ok(texts(ln.children).includes('connected'));
    assert.ok(texts(ln.children).includes('via'));
  });

  it('renders zonePropIncludes condition', () => {
    const cond: ConditionAST = { op: 'zonePropIncludes', zone: 'Saigon', prop: 'terrain', value: '"urban"' };
    const nodes = conditionToDisplayNodes(cond, 0);
    const ln = asLine(nodes[0]!);
    assert.ok(texts(ln.children).includes('includes'));
  });

  it('respects indent parameter', () => {
    const nodes = conditionToDisplayNodes(true, 3);
    const ln = asLine(nodes[0]!);
    assert.equal(ln.indent, 3);
  });
});

// ---------------------------------------------------------------------------
// ValueExpr tests
// ---------------------------------------------------------------------------

describe('valueExprToInlineNodes', () => {
  it('renders number literal', () => {
    const nodes = valueExprToInlineNodes(42);
    assert.deepEqual(nodes.length, 1);
    assert.equal(nodes[0]!.kind, 'value');
    assert.equal(nodes[0]!.text, '42');
  });

  it('renders boolean literal', () => {
    const nodes = valueExprToInlineNodes(true);
    assert.equal(nodes[0]!.text, 'true');
  });

  it('renders string literal', () => {
    const nodes = valueExprToInlineNodes('hello');
    assert.equal(nodes[0]!.kind, 'value');
    assert.equal(nodes[0]!.text, '"hello"');
  });

  it('renders gvar reference', () => {
    const expr: ValueExpr = { ref: 'gvar', var: 'score' };
    const nodes = valueExprToInlineNodes(expr);
    assert.equal(nodes[0]!.kind, 'reference');
    assert.equal(nodes[0]!.text, 'score');
  });

  it('renders pvar reference', () => {
    const expr: ValueExpr = { ref: 'pvar', player: 'actor', var: 'resources' };
    const nodes = valueExprToInlineNodes(expr);
    const refs = findByKind(nodes, 'reference');
    assert.ok(refs.some((n) => n.text === 'resources'));
  });

  it('renders binding reference', () => {
    const expr: ValueExpr = { ref: 'binding', name: 'x' };
    const nodes = valueExprToInlineNodes(expr);
    assert.equal(nodes[0]!.kind, 'reference');
    assert.equal(nodes[0]!.text, 'x');
  });

  it('renders binary op', () => {
    const expr: ValueExpr = { op: '+', left: 1, right: 2 };
    const nodes = valueExprToInlineNodes(expr);
    const ops = findByKind(nodes, 'operator');
    assert.ok(ops.some((n) => n.text === '+'));
  });

  it('renders count aggregate', () => {
    const expr: ValueExpr = { aggregate: { op: 'count', query: { query: 'players' } } };
    const nodes = valueExprToInlineNodes(expr);
    assert.ok(texts(nodes).includes('count'));
  });

  it('renders conditional if', () => {
    const expr: ValueExpr = { if: { when: true, then: 1, else: 0 } };
    const nodes = valueExprToInlineNodes(expr);
    assert.ok(texts(nodes).includes('if'));
  });
});

// ---------------------------------------------------------------------------
// OptionsQuery tests
// ---------------------------------------------------------------------------

describe('optionsQueryToInlineNodes', () => {
  it('renders tokensInZone', () => {
    const query: OptionsQuery = { query: 'tokensInZone', zone: 'hand' };
    const nodes = optionsQueryToInlineNodes(query);
    assert.ok(texts(nodes).includes('tokens'));
    const refs = findByKind(nodes, 'reference');
    assert.ok(refs.some((n) => n.text === 'hand'));
  });

  it('renders intsInRange', () => {
    const query: OptionsQuery = { query: 'intsInRange', min: 1, max: 10 };
    const nodes = optionsQueryToInlineNodes(query);
    assert.ok(texts(nodes).includes('ints'));
    assert.ok(texts(nodes).includes('1'));
    assert.ok(texts(nodes).includes('10'));
  });

  it('renders enums', () => {
    const query: OptionsQuery = { query: 'enums', values: ['a', 'b', 'c'] };
    const nodes = optionsQueryToInlineNodes(query);
    assert.ok(texts(nodes).includes('enum'));
  });

  it('renders players', () => {
    const query: OptionsQuery = { query: 'players' };
    const nodes = optionsQueryToInlineNodes(query);
    assert.deepEqual(texts(nodes), ['players']);
  });

  it('renders zones', () => {
    const query: OptionsQuery = { query: 'zones' };
    const nodes = optionsQueryToInlineNodes(query);
    assert.deepEqual(texts(nodes), ['zones']);
  });

  it('renders binding', () => {
    const query: OptionsQuery = { query: 'binding', name: 'selected' };
    const nodes = optionsQueryToInlineNodes(query);
    assert.equal(nodes[0]!.kind, 'reference');
    assert.equal(nodes[0]!.text, 'selected');
  });
});

// ---------------------------------------------------------------------------
// PlayerSel / ZoneRef tests
// ---------------------------------------------------------------------------

describe('playerSelToInlineNodes', () => {
  it('renders string player sel', () => {
    const nodes = playerSelToInlineNodes('actor');
    assert.equal(nodes[0]!.kind, 'reference');
    assert.equal(nodes[0]!.text, 'actor');
  });

  it('renders id player sel', () => {
    const nodes = playerSelToInlineNodes({ id: asPlayerId(1) });
    assert.equal(nodes[0]!.kind, 'reference');
  });

  it('renders chosen player sel', () => {
    const nodes = playerSelToInlineNodes({ chosen: 'target' });
    assert.equal(nodes[0]!.text, 'target');
  });

  it('renders relative player sel', () => {
    const nodes = playerSelToInlineNodes({ relative: 'left' });
    assert.equal(nodes[0]!.text, 'left');
  });
});

describe('zoneRefToInlineNodes', () => {
  it('renders string zone ref', () => {
    const nodes = zoneRefToInlineNodes('hand');
    assert.equal(nodes[0]!.kind, 'reference');
    assert.equal(nodes[0]!.text, 'hand');
  });

  it('renders zoneExpr zone ref', () => {
    const nodes = zoneRefToInlineNodes({ zoneExpr: { ref: 'binding', name: 'z' } });
    assert.equal(nodes[0]!.kind, 'reference');
    assert.equal(nodes[0]!.text, 'z');
  });
});

// ---------------------------------------------------------------------------
// EffectAST tests
// ---------------------------------------------------------------------------

describe('effectToDisplayNodes', () => {
  it('renders setVar (global)', () => {
    const effect: EffectAST = { setVar: { scope: 'global', var: 'score', value: 10 } };
    const nodes = effectToDisplayNodes(effect, 0);
    assert.equal(nodes.length, 1);
    const ln = asLine(nodes[0]!);
    assert.ok(texts(ln.children).includes('set'));
    assert.ok(texts(ln.children).includes('score'));
  });

  it('renders setVar (pvar)', () => {
    const effect: EffectAST = { setVar: { scope: 'pvar', player: 'actor', var: 'gold', value: 5 } };
    const nodes = effectToDisplayNodes(effect, 0);
    const ln = asLine(nodes[0]!);
    assert.ok(texts(ln.children).includes('gold'));
  });

  it('renders addVar', () => {
    const effect: EffectAST = { addVar: { scope: 'global', var: 'turn', delta: 1 } };
    const nodes = effectToDisplayNodes(effect, 0);
    const ln = asLine(nodes[0]!);
    assert.ok(texts(ln.children).includes('add'));
  });

  it('renders moveToken', () => {
    const effect: EffectAST = { moveToken: { token: '$t', from: 'hand', to: 'board' } };
    const nodes = effectToDisplayNodes(effect, 0);
    const ln = asLine(nodes[0]!);
    assert.ok(texts(ln.children).includes('move'));
  });

  it('renders if with then and else', () => {
    const effect: EffectAST = {
      if: {
        when: true,
        then: [{ setVar: { scope: 'global', var: 'a', value: 1 } }],
        else: [{ setVar: { scope: 'global', var: 'b', value: 2 } }],
      },
    };
    const nodes = effectToDisplayNodes(effect, 0);
    // Should have: if-header, then-body, else-header, else-body
    assert.ok(nodes.length >= 4);
    const header = asLine(nodes[0]!);
    assert.ok(texts(header.children).includes('if'));
    // Find the else line
    const elseLine = nodes.find(
      (n) => n.kind === 'line' && (n as DisplayLineNode).children.some((c) => c.text === 'else'),
    );
    assert.ok(elseLine !== undefined, 'should have an else line');
  });

  it('renders forEach with nested effects', () => {
    const effect: EffectAST = {
      forEach: {
        bind: 'token',
        over: { query: 'tokensInZone', zone: 'hand' },
        effects: [{ setVar: { scope: 'global', var: 'x', value: 1 } }],
      },
    };
    const nodes = effectToDisplayNodes(effect, 0);
    assert.ok(nodes.length >= 2);
    const header = asLine(nodes[0]!);
    assert.ok(texts(header.children).includes('forEach'));
    // Nested effects are indented
    const nested = asLine(nodes[1]!);
    assert.equal(nested.indent, 1);
  });

  it('renders let with body', () => {
    const effect: EffectAST = {
      let: {
        bind: 'x',
        value: 42,
        in: [{ setVar: { scope: 'global', var: 'y', value: { ref: 'binding', name: 'x' } } }],
      },
    };
    const nodes = effectToDisplayNodes(effect, 0);
    const header = asLine(nodes[0]!);
    assert.ok(texts(header.children).includes('let'));
    assert.ok(texts(header.children).includes('x'));
  });

  it('renders reduce', () => {
    const effect: EffectAST = {
      reduce: {
        itemBind: 'item',
        accBind: 'acc',
        over: { query: 'players' },
        initial: 0,
        next: { op: '+', left: { ref: 'binding', name: 'acc' }, right: 1 },
        resultBind: 'total',
        in: [],
      },
    };
    const nodes = effectToDisplayNodes(effect, 0);
    const header = asLine(nodes[0]!);
    assert.ok(texts(header.children).includes('reduce'));
  });

  it('renders chooseOne', () => {
    const effect: EffectAST = {
      chooseOne: { internalDecisionId: 'd1', bind: 'choice', options: { query: 'players' } },
    };
    const nodes = effectToDisplayNodes(effect, 0);
    const ln = asLine(nodes[0]!);
    assert.ok(texts(ln.children).includes('choose'));
  });

  it('renders setMarker', () => {
    const effect: EffectAST = { setMarker: { space: 'Saigon', marker: 'control', state: '"NVA"' } };
    const nodes = effectToDisplayNodes(effect, 0);
    const ln = asLine(nodes[0]!);
    assert.ok(texts(ln.children).includes('setMarker'));
  });

  it('renders flipGlobalMarker with stateA and stateB', () => {
    const effect: EffectAST = { flipGlobalMarker: { marker: '"monsoon"', stateA: '"dry"', stateB: '"wet"' } };
    const nodes = effectToDisplayNodes(effect, 0);
    const ln = asLine(nodes[0]!);
    assert.ok(texts(ln.children).includes('flipGlobalMarker'));
    assert.ok(texts(ln.children).includes('between'));
    // stateA and stateB are string literals rendered as JSON-quoted values
    assert.ok(texts(ln.children).some((t) => t.includes('dry')));
    assert.ok(texts(ln.children).some((t) => t.includes('wet')));
  });

  it('renders gotoPhaseExact', () => {
    const effect: EffectAST = { gotoPhaseExact: { phase: 'combat' } };
    const nodes = effectToDisplayNodes(effect, 0);
    const ln = asLine(nodes[0]!);
    assert.ok(texts(ln.children).includes('goto'));
    assert.ok(texts(ln.children).includes('combat'));
  });

  it('renders advancePhase', () => {
    const effect: EffectAST = { advancePhase: {} };
    const nodes = effectToDisplayNodes(effect, 0);
    const ln = asLine(nodes[0]!);
    assert.ok(texts(ln.children).includes('advancePhase'));
  });

  it('respects indent parameter', () => {
    const effect: EffectAST = { advancePhase: {} };
    const nodes = effectToDisplayNodes(effect, 5);
    const ln = asLine(nodes[0]!);
    assert.equal(ln.indent, 5);
  });
});

// ---------------------------------------------------------------------------
// ActionDef integration tests
// ---------------------------------------------------------------------------

describe('actionDefToDisplayTree', () => {
  it('produces correct sections for full action', () => {
    const action = minimalActionDef({
      params: [{ name: 'target', domain: { query: 'zones' } }],
      pre: { op: '>', left: { ref: 'gvar', var: 'score' }, right: 0 },
      cost: [{ addVar: { scope: 'global', var: 'gold', delta: -1 } }],
      effects: [{ setVar: { scope: 'global', var: 'done', value: true } }],
      limits: [{ scope: 'turn', max: 1 }],
    });

    const sections = actionDefToDisplayTree(action);
    assert.equal(sections.length, 5);

    const labels = sections.map((s) => s.label);
    assert.deepEqual(labels, ['Parameters', 'Preconditions', 'Costs', 'Effects', 'Limits']);
  });

  it('omits empty sections', () => {
    const action = minimalActionDef({
      effects: [{ advancePhase: {} }],
    });

    const sections = actionDefToDisplayTree(action);
    assert.equal(sections.length, 1);
    assert.equal(sections[0]!.label, 'Effects');
  });

  it('produces empty array when action has no content', () => {
    const action = minimalActionDef();
    const sections = actionDefToDisplayTree(action);
    assert.equal(sections.length, 0);
  });

  it('Parameters section shows param names and domains', () => {
    const action = minimalActionDef({
      params: [
        { name: 'target', domain: { query: 'zones' } },
        { name: 'amount', domain: { query: 'intsInRange', min: 1, max: 5 } },
      ],
    });
    const sections = actionDefToDisplayTree(action);
    const paramSection = asGroup(sections[0]!);
    assert.equal(paramSection.label, 'Parameters');
    assert.equal(paramSection.children.length, 2);
  });

  it('Limits section shows max and scope', () => {
    const action = minimalActionDef({
      limits: [{ scope: 'turn', max: 1 }, { scope: 'game', max: 3 }],
      effects: [{ advancePhase: {} }],
    });
    const sections = actionDefToDisplayTree(action);
    const limitSection = sections.find((s) => s.label === 'Limits');
    assert.ok(limitSection !== undefined);
    assert.equal(asGroup(limitSection).children.length, 2);
  });

  it('output is structuredClone-safe', () => {
    const action = minimalActionDef({
      pre: { op: 'and', args: [true, { op: '==', left: 1, right: 1 }] },
      effects: [
        { forEach: { bind: 'x', over: { query: 'players' }, effects: [{ advancePhase: {} }] } },
      ],
    });
    const sections = actionDefToDisplayTree(action);
    const cloned = structuredClone(sections);
    assert.deepEqual(cloned, sections);
  });
});
