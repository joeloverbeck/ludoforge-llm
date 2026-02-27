import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asPlayerId,
  asPhaseId,
  asZoneId,
  buildAdjacencyGraph,
  buildRuntimeTableIndex,
  createZobristTable,
  describeAction,
  type ActionDef,
  type AnnotatedActionDescription,
  type AnnotationContext,
  type ConditionAST,
  type DisplayAnnotationNode,
  type DisplayGroupNode,
  type DisplayLineNode,
  type DisplayNode,
  type GameDef,
  type GameDefRuntime,
  type GameState,
} from '../../../src/kernel/index.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const asLine = (node: DisplayNode): DisplayLineNode => {
  assert.equal(node.kind, 'line');
  return node as DisplayLineNode;
};

const annotations = (line: DisplayLineNode): DisplayAnnotationNode[] =>
  line.children.filter((c): c is DisplayAnnotationNode => c.kind === 'annotation');

const annotationsOfType = (
  line: DisplayLineNode,
  type: DisplayAnnotationNode['annotationType'],
): DisplayAnnotationNode[] =>
  annotations(line).filter((a) => a.annotationType === type);

// ---------------------------------------------------------------------------
// Minimal factories
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

const makeDef = (overrides: Partial<GameDef> = {}): GameDef => ({
  metadata: { id: 'cond-annotator-test', players: { min: 1, max: 4 } },
  constants: {},
  globalVars: [{ name: 'gold', type: 'int', init: 0, min: 0, max: 999 }],
  perPlayerVars: [],
  zones: [
    { id: asZoneId('supply'), owner: 'none', visibility: 'public', ordering: 'set' },
  ],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [] },
  actions: [],
  triggers: [],
  terminal: { conditions: [] },
  ...overrides,
});

const makeState = (overrides: Partial<GameState> = {}): GameState => ({
  globalVars: { gold: 10 },
  perPlayerVars: {},
  zoneVars: {},
  playerCount: 2,
  zones: { supply: [] },
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [1n, 2n] },
  stateHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
  ...overrides,
});

const makeRuntime = (def: GameDef): GameDefRuntime => ({
  adjacencyGraph: buildAdjacencyGraph(def.zones),
  runtimeTableIndex: buildRuntimeTableIndex(def),
  zobristTable: createZobristTable(def),
});

const makeContext = (overrides: Partial<AnnotationContext> = {}): AnnotationContext => {
  const def = overrides.def ?? makeDef();
  return {
    def,
    runtime: makeRuntime(def),
    state: makeState(),
    activePlayer: asPlayerId(0),
    actorPlayer: asPlayerId(0),
    ...overrides,
  };
};

// ---------------------------------------------------------------------------
// Helpers to find sections and extract annotation info
// ---------------------------------------------------------------------------

const findSection = (result: AnnotatedActionDescription, label: string): DisplayGroupNode | undefined =>
  result.sections.find((s) => s.label === label);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('describeAction (condition annotator)', () => {
  // -----------------------------------------------------------------------
  // 1. Pass annotation
  // -----------------------------------------------------------------------
  it('annotates passing precondition with pass marker', () => {
    const pre: ConditionAST = {
      op: '>=',
      left: { ref: 'gvar', var: 'gold' },
      right: 5,
    };
    const action = minimalActionDef({ pre });
    const ctx = makeContext({ state: makeState({ globalVars: { gold: 10 } }) });
    const result = describeAction(action, ctx);

    const preGroup = findSection(result, 'Preconditions');
    assert.ok(preGroup !== undefined, 'Preconditions group should exist');
    const ln = asLine(preGroup.children[0]!);
    const passAnns = annotationsOfType(ln, 'pass');
    assert.ok(passAnns.length >= 1, 'Should have at least one pass annotation');
    assert.equal(passAnns[0]!.text, '\u2713');
  });

  // -----------------------------------------------------------------------
  // 2. Fail annotation
  // -----------------------------------------------------------------------
  it('annotates failing precondition with fail marker', () => {
    const pre: ConditionAST = {
      op: '>=',
      left: { ref: 'gvar', var: 'gold' },
      right: 5,
    };
    const action = minimalActionDef({ pre });
    const ctx = makeContext({ state: makeState({ globalVars: { gold: 3 } }) });
    const result = describeAction(action, ctx);

    const preGroup = findSection(result, 'Preconditions');
    assert.ok(preGroup !== undefined);
    const ln = asLine(preGroup.children[0]!);
    const failAnns = annotationsOfType(ln, 'fail');
    assert.ok(failAnns.length >= 1, 'Should have at least one fail annotation');
    assert.equal(failAnns[0]!.text, '\u2717');
  });

  // -----------------------------------------------------------------------
  // 3. Value annotation on comparisons
  // -----------------------------------------------------------------------
  it('includes value annotation with current value for comparisons', () => {
    const pre: ConditionAST = {
      op: '>=',
      left: { ref: 'gvar', var: 'gold' },
      right: 5,
    };
    const action = minimalActionDef({ pre });
    const ctx = makeContext({ state: makeState({ globalVars: { gold: 3 } }) });
    const result = describeAction(action, ctx);

    const preGroup = findSection(result, 'Preconditions');
    assert.ok(preGroup !== undefined);
    const ln = asLine(preGroup.children[0]!);
    const valueAnns = annotationsOfType(ln, 'value');
    assert.ok(valueAnns.length >= 1, 'Should have at least one value annotation');
    assert.equal(valueAnns[0]!.text, 'current: 3');
  });

  // -----------------------------------------------------------------------
  // 4. Error-safe annotation
  // -----------------------------------------------------------------------
  it('produces fail annotation with depends-on-choice text for unbound bindings', () => {
    const pre: ConditionAST = {
      op: '>=',
      left: { ref: 'binding', name: 'unboundVar' },
      right: 5,
    };
    const action = minimalActionDef({ pre });
    const ctx = makeContext();
    // Should not throw
    const result = describeAction(action, ctx);

    const preGroup = findSection(result, 'Preconditions');
    assert.ok(preGroup !== undefined);
    const ln = asLine(preGroup.children[0]!);
    const failAnns = annotationsOfType(ln, 'fail');
    assert.ok(failAnns.length >= 1);
    assert.equal(failAnns[0]!.text, 'depends on choice');
  });

  // -----------------------------------------------------------------------
  // 5. Limit usage
  // -----------------------------------------------------------------------
  it('reports limit usage from state actionUsage', () => {
    const action = minimalActionDef({
      limits: [{ scope: 'turn', max: 2 }],
    });
    const ctx = makeContext({
      state: makeState({
        actionUsage: {
          test: { turnCount: 1, phaseCount: 1, gameCount: 1 },
        },
      }),
    });
    const result = describeAction(action, ctx);

    assert.equal(result.limitUsage.length, 1);
    assert.equal(result.limitUsage[0]!.scope, 'turn');
    assert.equal(result.limitUsage[0]!.max, 2);
    assert.equal(result.limitUsage[0]!.current, 1);

    // Limits group should have usage annotation
    const limitsGroup = findSection(result, 'Limits');
    assert.ok(limitsGroup !== undefined);
    const ln = asLine(limitsGroup.children[0]!);
    const usageAnns = annotationsOfType(ln, 'usage');
    assert.ok(usageAnns.length >= 1);
    assert.equal(usageAnns[0]!.text, '1/2');
  });

  // -----------------------------------------------------------------------
  // 6. No cost/effect annotations
  // -----------------------------------------------------------------------
  it('does not add annotations to Costs or Effects groups', () => {
    const action = minimalActionDef({
      pre: { op: '>=', left: { ref: 'gvar', var: 'gold' }, right: 1 },
      cost: [{ addVar: { scope: 'global', var: 'gold', delta: -1 } }],
      effects: [{ setVar: { scope: 'global', var: 'gold', value: 0 } }],
    });
    const ctx = makeContext();
    const result = describeAction(action, ctx);

    const costsGroup = findSection(result, 'Costs');
    assert.ok(costsGroup !== undefined);
    for (const child of costsGroup.children) {
      if (child.kind === 'line') {
        const anns = annotations(child);
        assert.equal(anns.length, 0, 'Cost lines should have no annotations');
      }
    }

    const effectsGroup = findSection(result, 'Effects');
    assert.ok(effectsGroup !== undefined);
    for (const child of effectsGroup.children) {
      if (child.kind === 'line') {
        const anns = annotations(child);
        assert.equal(anns.length, 0, 'Effect lines should have no annotations');
      }
    }
  });

  // -----------------------------------------------------------------------
  // 7. Null precondition
  // -----------------------------------------------------------------------
  it('returns no Preconditions group and empty limitUsage for null pre', () => {
    const action = minimalActionDef({ pre: null });
    const ctx = makeContext();
    const result = describeAction(action, ctx);

    const preGroup = findSection(result, 'Preconditions');
    assert.equal(preGroup, undefined, 'No Preconditions group for null pre');
    assert.deepEqual(result.limitUsage, []);
  });

  // -----------------------------------------------------------------------
  // 8. Compound conditions
  // -----------------------------------------------------------------------
  it('annotates compound and condition with recursive pass/fail', () => {
    const pre: ConditionAST = {
      op: 'and',
      args: [
        { op: '>=', left: { ref: 'gvar', var: 'gold' }, right: 5 },
        { op: '==', left: { ref: 'gvar', var: 'gold' }, right: 10 },
      ],
    };
    const action = minimalActionDef({ pre });

    // gold=10: both pass → and passes
    const ctx1 = makeContext({ state: makeState({ globalVars: { gold: 10 } }) });
    const result1 = describeAction(action, ctx1);
    const preGroup1 = findSection(result1, 'Preconditions')!;
    // header (and) + child1 + child2 = 3 nodes
    assert.ok(preGroup1.children.length >= 3);
    const header1 = asLine(preGroup1.children[0]!);
    const passAnns1 = annotationsOfType(header1, 'pass');
    assert.ok(passAnns1.length >= 1, 'and header should pass');
    const child1_1 = asLine(preGroup1.children[1]!);
    assert.ok(annotationsOfType(child1_1, 'pass').length >= 1, 'first child should pass');
    const child1_2 = asLine(preGroup1.children[2]!);
    assert.ok(annotationsOfType(child1_2, 'pass').length >= 1, 'second child should pass');

    // gold=3: first fails → and fails
    const ctx2 = makeContext({ state: makeState({ globalVars: { gold: 3 } }) });
    const result2 = describeAction(action, ctx2);
    const preGroup2 = findSection(result2, 'Preconditions')!;
    const header2 = asLine(preGroup2.children[0]!);
    const failAnns2 = annotationsOfType(header2, 'fail');
    assert.ok(failAnns2.length >= 1, 'and header should fail');
    const child2_1 = asLine(preGroup2.children[1]!);
    assert.ok(annotationsOfType(child2_1, 'fail').length >= 1, 'first child should fail');
  });

  // -----------------------------------------------------------------------
  // 9. structuredClone round-trip
  // -----------------------------------------------------------------------
  it('produces structuredClone-safe output', () => {
    const pre: ConditionAST = {
      op: '>=',
      left: { ref: 'gvar', var: 'gold' },
      right: 5,
    };
    const action = minimalActionDef({ pre, limits: [{ scope: 'turn', max: 3 }] });
    const ctx = makeContext();
    const result = describeAction(action, ctx);

    const cloned = structuredClone(result);
    assert.deepEqual(cloned, result);
  });

  // -----------------------------------------------------------------------
  // 10. Never throws
  // -----------------------------------------------------------------------
  it('never throws even with pathological input', () => {
    // Action with completely empty def and mismatched state
    const action = minimalActionDef({
      pre: {
        op: 'and',
        args: [
          { op: '>=', left: { ref: 'gvar', var: 'nonexistent' }, right: 99 },
          { op: 'not', arg: true },
        ],
      },
      limits: [{ scope: 'game', max: 1 }],
    });
    const ctx = makeContext();

    // Should not throw
    const result = describeAction(action, ctx);
    assert.ok(Array.isArray(result.sections));
    assert.ok(Array.isArray(result.limitUsage));
  });
});
