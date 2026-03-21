import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  annotateLimitsGroup,
  asPlayerId,
  asPhaseId,
  asZoneId,
  buildAdjacencyGraph,
  buildRuntimeTableIndex,
  createZobristTable,
  describeAction,
  type ActionDef,
  type ActionPipelineDef,
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
  type VerbalizationDef,
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
  ruleCardCache: new Map(),
  compiledLifecycleEffects: new Map(),
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
      limits: [{ id: 'test::turn::0', scope: 'turn', max: 2 }],
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
    assert.equal(result.limitUsage[0]!.id, 'test::turn::0');
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

  it('preserves canonical limit ids from ActionDef without re-deriving', () => {
    const action = minimalActionDef({
      limits: [{ id: 'canonical-limit-id', scope: 'turn', max: 2 }],
      effects: [{ addVar: { scope: 'global', var: 'gold', delta: 1 } }],
    });
    const ctx = makeContext({
      state: makeState({
        actionUsage: {
          test: { turnCount: 1, phaseCount: 0, gameCount: 0 },
        },
      }),
    });

    const result = describeAction(action, ctx);
    assert.equal(result.limitUsage.length, 1);
    assert.equal(result.limitUsage[0]?.id, 'canonical-limit-id');
    assert.equal(result.tooltipPayload?.ruleState.limitUsage?.[0]?.id, 'canonical-limit-id');
  });

  it('keeps duplicate-scope limit identities distinct and parity-aligned across surfaces', () => {
    const action = minimalActionDef({
      limits: [
        { id: 'test::turn::0', scope: 'turn', max: 1 },
        { id: 'test::turn::1', scope: 'turn', max: 3 },
      ],
      effects: [{ addVar: { scope: 'global', var: 'gold', delta: 1 } }],
    });
    const ctx = makeContext({
      state: makeState({
        actionUsage: {
          test: { turnCount: 1, phaseCount: 0, gameCount: 0 },
        },
      }),
    });

    const result = describeAction(action, ctx);
    assert.ok(result.tooltipPayload !== undefined);
    const tooltipLimitUsage = result.tooltipPayload.ruleState.limitUsage;
    assert.ok(tooltipLimitUsage !== undefined);

    assert.equal(result.limitUsage.length, 2);
    assert.equal(new Set(result.limitUsage.map((limit) => limit.id)).size, 2);

    assert.deepEqual(
      result.limitUsage.map((limit) => ({
        id: limit.id,
        scope: limit.scope,
        max: limit.max,
        used: limit.current,
      })),
      tooltipLimitUsage,
    );
  });

  // -----------------------------------------------------------------------
  // Invariant enforcement: missing/mismatched limit source identity
  // -----------------------------------------------------------------------

  it('annotates limit line with fail when sourceRef is missing', () => {
    const lineWithoutSourceRef: DisplayLineNode = {
      kind: 'line',
      indent: 0,
      children: [{ kind: 'keyword', text: 'orphan limit line' }],
      // no sourceRef
    };
    const group: DisplayGroupNode = {
      kind: 'group',
      label: 'Limits',
      children: [lineWithoutSourceRef],
    };
    const action = minimalActionDef({
      limits: [{ id: 'test::turn::0', scope: 'turn', max: 2 }],
    });
    const state = makeState();

    const { annotatedGroup, limitUsage } = annotateLimitsGroup(group, action, state);
    const ln = asLine(annotatedGroup.children[0]!);
    const failAnns = annotationsOfType(ln, 'fail');
    assert.equal(failAnns.length, 1, 'Should have exactly one fail annotation');
    assert.equal(failAnns[0]!.text, 'missing limit identity');
    // limitUsage is still computed from action.limits
    assert.equal(limitUsage.length, 1);
  });

  it('annotates limit line with fail when sourceRef id does not match any limit', () => {
    const lineWithBadRef: DisplayLineNode = {
      kind: 'line',
      indent: 0,
      children: [{ kind: 'keyword', text: 'mismatched limit' }],
      sourceRef: { entity: 'limit', id: 'nonexistent-limit-id' },
    };
    const group: DisplayGroupNode = {
      kind: 'group',
      label: 'Limits',
      children: [lineWithBadRef],
    };
    const action = minimalActionDef({
      limits: [{ id: 'test::turn::0', scope: 'turn', max: 2 }],
    });
    const state = makeState();

    const { annotatedGroup } = annotateLimitsGroup(group, action, state);
    const ln = asLine(annotatedGroup.children[0]!);
    const failAnns = annotationsOfType(ln, 'fail');
    assert.equal(failAnns.length, 1, 'Should have exactly one fail annotation');
    assert.equal(failAnns[0]!.text, 'unresolved limit identity');
    const usageAnns = annotationsOfType(ln, 'usage');
    assert.equal(usageAnns.length, 0, 'Should not have usage annotation for mismatched id');
  });

  it('handles mixed valid and invalid limit lines deterministically', () => {
    const validLine: DisplayLineNode = {
      kind: 'line',
      indent: 0,
      children: [{ kind: 'keyword', text: 'valid' }],
      sourceRef: { entity: 'limit', id: 'test::turn::0' },
    };
    const orphanLine: DisplayLineNode = {
      kind: 'line',
      indent: 0,
      children: [{ kind: 'keyword', text: 'orphan' }],
    };
    const mismatchLine: DisplayLineNode = {
      kind: 'line',
      indent: 0,
      children: [{ kind: 'keyword', text: 'mismatch' }],
      sourceRef: { entity: 'limit', id: 'bogus-id' },
    };
    const group: DisplayGroupNode = {
      kind: 'group',
      label: 'Limits',
      children: [validLine, orphanLine, mismatchLine],
    };
    const action = minimalActionDef({
      limits: [{ id: 'test::turn::0', scope: 'turn', max: 3 }],
    });
    const state = makeState({
      actionUsage: { test: { turnCount: 2, phaseCount: 0, gameCount: 0 } },
    });

    const { annotatedGroup } = annotateLimitsGroup(group, action, state);

    // First line: valid — usage annotation
    const ln0 = asLine(annotatedGroup.children[0]!);
    assert.equal(annotationsOfType(ln0, 'usage').length, 1);
    assert.equal(annotationsOfType(ln0, 'usage')[0]!.text, '2/3');

    // Second line: missing sourceRef — fail annotation
    const ln1 = asLine(annotatedGroup.children[1]!);
    assert.equal(annotationsOfType(ln1, 'fail').length, 1);
    assert.equal(annotationsOfType(ln1, 'fail')[0]!.text, 'missing limit identity');

    // Third line: mismatched sourceRef — fail annotation
    const ln2 = asLine(annotatedGroup.children[2]!);
    assert.equal(annotationsOfType(ln2, 'fail').length, 1);
    assert.equal(annotationsOfType(ln2, 'fail')[0]!.text, 'unresolved limit identity');
  });

  it('describeAction never throws when limits group has invariant violations', () => {
    const action = minimalActionDef({
      limits: [
        { id: 'limit-a', scope: 'turn', max: 1 },
        { id: 'limit-b', scope: 'game', max: 5 },
      ],
    });
    const ctx = makeContext();
    const result = describeAction(action, ctx);

    assert.ok(Array.isArray(result.sections));
    assert.ok(Array.isArray(result.limitUsage));
    assert.equal(result.limitUsage.length, 2);
    const limitsGroup = findSection(result, 'Limits');
    assert.ok(limitsGroup !== undefined);
    for (const child of limitsGroup.children) {
      if (child.kind === 'line') {
        const usageAnns = annotationsOfType(child, 'usage');
        assert.ok(usageAnns.length >= 1, 'Each limit line should have usage annotation');
      }
    }
  });

  // -----------------------------------------------------------------------
  // Cross-surface consistency under invariant stress
  // -----------------------------------------------------------------------

  it('limitUsage and tooltipPayload.ruleState.limitUsage stay coherent when annotateLimitsGroup encounters mixed valid/invalid lines', () => {
    // This tests the public describeAction path: even if internal invariant
    // guards fire, limitUsage (from action.limits) and ruleState.limitUsage
    // (from tooltip pipeline) must remain parity-aligned.
    const action = minimalActionDef({
      limits: [
        { id: 'test::turn::0', scope: 'turn', max: 2 },
        { id: 'test::game::1', scope: 'game', max: 5 },
      ],
      effects: [{ addVar: { scope: 'global', var: 'gold', delta: 1 } }],
    });
    const ctx = makeContext({
      state: makeState({
        actionUsage: {
          test: { turnCount: 1, phaseCount: 0, gameCount: 3 },
        },
      }),
    });

    const result = describeAction(action, ctx);

    // Both surfaces must report same limits
    assert.ok(result.tooltipPayload !== undefined);
    const descLimits = result.limitUsage;
    const tooltipLimits = result.tooltipPayload.ruleState.limitUsage;
    assert.ok(tooltipLimits !== undefined);

    assert.deepEqual(
      descLimits.map((l) => ({ id: l.id, scope: l.scope, max: l.max, used: l.current })),
      tooltipLimits,
      'Description limitUsage and tooltip ruleState.limitUsage must be parity-aligned',
    );
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
    const action = minimalActionDef({ pre, limits: [{ id: 'test::turn::0', scope: 'turn', max: 3 }] });
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
      limits: [{ id: 'test::game::0', scope: 'game', max: 1 }],
    });
    const ctx = makeContext();

    // Should not throw
    const result = describeAction(action, ctx);
    assert.ok(Array.isArray(result.sections));
    assert.ok(Array.isArray(result.limitUsage));
  });

  // -----------------------------------------------------------------------
  // 11. Pipeline-backed action produces non-empty sections
  // -----------------------------------------------------------------------
  it('includes pipeline sections for shell actions with matching pipelines', () => {
    const action = minimalActionDef(); // empty shell
    const pipeline: ActionPipelineDef = {
      id: 'train-us',
      actionId: action.id,
      legality: { op: '>=', left: { ref: 'gvar', var: 'gold' }, right: 1 },
      costValidation: null,
      costEffects: [{ addVar: { scope: 'global', var: 'gold', delta: -3 } }],
      targeting: {},
      stages: [{ stage: 'placement', effects: [{ advancePhase: {} }] }],
      atomicity: 'atomic',
    };
    const def = makeDef({ actionPipelines: [pipeline] });
    const ctx = makeContext({ def });
    const result = describeAction(action, ctx);

    // Should have at least one pipeline group
    const pipelineGroup = result.sections.find((s) => s.label === 'Pipeline: train-us');
    assert.ok(pipelineGroup !== undefined, 'Pipeline group should be present');
    assert.equal(pipelineGroup.collapsible, true);
    // Should contain legality, costs, stage sub-groups
    const childLabels = pipelineGroup.children
      .filter((c): c is DisplayGroupNode => c.kind === 'group')
      .map((c) => c.label);
    assert.ok(childLabels.includes('Legality'), 'Should include Legality');
    assert.ok(childLabels.includes('Costs'), 'Should include Costs');
    assert.ok(childLabels.includes('Stage: placement'), 'Should include Stage: placement');
  });

  // -----------------------------------------------------------------------
  // 12. Pipeline legality conditions are annotated with pass/fail
  // -----------------------------------------------------------------------
  it('annotates pipeline legality conditions', () => {
    const action = minimalActionDef();
    const pipeline: ActionPipelineDef = {
      id: 'pipeline-annotated',
      actionId: action.id,
      legality: { op: '>=', left: { ref: 'gvar', var: 'gold' }, right: 5 },
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [],
      atomicity: 'atomic',
    };
    const def = makeDef({ actionPipelines: [pipeline] });
    const ctx = makeContext({ def, state: makeState({ globalVars: { gold: 10 } }) });
    const result = describeAction(action, ctx);

    const pipelineGroup = result.sections.find((s) => s.label === 'Pipeline: pipeline-annotated')!;
    const legalityGroup = pipelineGroup.children.find(
      (c): c is DisplayGroupNode => c.kind === 'group' && c.label === 'Legality',
    )!;
    assert.ok(legalityGroup !== undefined);
    const ln = asLine(legalityGroup.children[0]!);
    const passAnns = annotations(ln).filter((a) => a.annotationType === 'pass');
    assert.ok(passAnns.length >= 1, 'Legality should have pass annotation');
  });

  it('annotates stage-level pipeline predicates inside the stage group', () => {
    const action = minimalActionDef();
    const pipeline: ActionPipelineDef = {
      id: 'pipeline-stage-annotated',
      actionId: action.id,
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [
        {
          stage: 'resolution',
          legality: { op: '>=', left: { ref: 'gvar', var: 'gold' }, right: 5 },
          costValidation: { op: '>=', left: { ref: 'gvar', var: 'gold' }, right: 2 },
          effects: [{ advancePhase: {} }],
        },
      ],
      atomicity: 'atomic',
    };
    const def = makeDef({ actionPipelines: [pipeline] });
    const ctx = makeContext({ def, state: makeState({ globalVars: { gold: 10 } }) });
    const result = describeAction(action, ctx);

    const pipelineGroup = result.sections.find((s) => s.label === 'Pipeline: pipeline-stage-annotated')!;
    const stageGroup = pipelineGroup.children.find(
      (c): c is DisplayGroupNode => c.kind === 'group' && c.label === 'Stage: resolution',
    )!;
    const stageChildLabels = stageGroup.children
      .filter((c): c is DisplayGroupNode => c.kind === 'group')
      .map((c) => c.label);
    assert.deepEqual(stageChildLabels, ['Legality', 'Cost Validation']);
  });

  // -----------------------------------------------------------------------
  // 13. Only applicable pipelines are included
  // -----------------------------------------------------------------------
  it('filters out inapplicable pipelines', () => {
    const action = minimalActionDef();
    const passingPipeline: ActionPipelineDef = {
      id: 'train-us',
      actionId: action.id,
      applicability: { op: '==', left: { ref: 'gvar', var: 'gold' }, right: 10 },
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [{ effects: [{ advancePhase: {} }] }],
      atomicity: 'atomic',
    };
    const failingPipeline: ActionPipelineDef = {
      id: 'train-arvn',
      actionId: action.id,
      applicability: { op: '==', left: { ref: 'gvar', var: 'gold' }, right: 999 },
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [{ effects: [{ advancePhase: {} }] }],
      atomicity: 'atomic',
    };
    const def = makeDef({ actionPipelines: [passingPipeline, failingPipeline] });
    const ctx = makeContext({ def, state: makeState({ globalVars: { gold: 10 } }) });
    const result = describeAction(action, ctx);

    const pipelineLabels = result.sections
      .filter((s) => s.label.startsWith('Pipeline:'))
      .map((s) => s.label);
    assert.ok(pipelineLabels.includes('Pipeline: train-us'), 'Applicable pipeline should be included');
    assert.ok(!pipelineLabels.includes('Pipeline: train-arvn'), 'Inapplicable pipeline should be filtered out');
  });

  // -----------------------------------------------------------------------
  // 14. Multiple applicable pipelines produce multiple groups
  // -----------------------------------------------------------------------
  it('includes multiple applicable pipelines as separate groups', () => {
    const action = minimalActionDef();
    const p1: ActionPipelineDef = {
      id: 'pipeline-a',
      actionId: action.id,
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [{ effects: [{ advancePhase: {} }] }],
      atomicity: 'atomic',
    };
    const p2: ActionPipelineDef = {
      id: 'pipeline-b',
      actionId: action.id,
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [{ effects: [{ advancePhase: {} }] }],
      atomicity: 'atomic',
    };
    const def = makeDef({ actionPipelines: [p1, p2] });
    const ctx = makeContext({ def });
    const result = describeAction(action, ctx);

    const pipelineLabels = result.sections
      .filter((s) => s.label.startsWith('Pipeline:'))
      .map((s) => s.label);
    assert.deepEqual(pipelineLabels, ['Pipeline: pipeline-a', 'Pipeline: pipeline-b']);
  });

  // -----------------------------------------------------------------------
  // 15. No matching pipelines — same result as before (no regression)
  // -----------------------------------------------------------------------
  it('produces unchanged result when no pipelines match', () => {
    const pre: ConditionAST = { op: '>=', left: { ref: 'gvar', var: 'gold' }, right: 5 };
    const action = minimalActionDef({ pre });
    const otherPipeline: ActionPipelineDef = {
      id: 'unrelated',
      actionId: 'other-action' as ActionPipelineDef['actionId'],
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [],
      atomicity: 'atomic',
    };
    const def = makeDef({ actionPipelines: [otherPipeline] });
    const ctx = makeContext({ def, state: makeState({ globalVars: { gold: 10 } }) });
    const result = describeAction(action, ctx);

    assert.ok(result.sections.every((s) => !s.label.startsWith('Pipeline:')),
      'No pipeline groups should be present');
    assert.ok(result.sections.some((s) => s.label === 'Preconditions'),
      'Original sections should remain');
  });

  // -----------------------------------------------------------------------
  // 16. Error fallback includes unannotated pipeline sections
  // -----------------------------------------------------------------------
  it('includes unannotated pipeline sections on error fallback', () => {
    const action = minimalActionDef({
      // Force an eval error by using a nonexistent binding in pre
      pre: { op: '>=', left: { ref: 'binding', name: 'crash' }, right: 5 },
    });
    const pipeline: ActionPipelineDef = {
      id: 'fallback-pipeline',
      actionId: action.id,
      legality: { op: '>=', left: { ref: 'gvar', var: 'gold' }, right: 1 },
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [],
      atomicity: 'atomic',
    };
    const def = makeDef({ actionPipelines: [pipeline] });
    const ctx = makeContext({ def });
    const result = describeAction(action, ctx);

    // The try branch should succeed (tryEvalCondition handles errors gracefully),
    // so we should still see the pipeline section
    const pipelineGroup = result.sections.find((s) => s.label === 'Pipeline: fallback-pipeline');
    assert.ok(pipelineGroup !== undefined, 'Pipeline section should be present');
  });

  // -----------------------------------------------------------------------
  // Tooltip pipeline tests
  // -----------------------------------------------------------------------

  // -----------------------------------------------------------------------
  // 17. tooltipPayload present when action has effects
  // -----------------------------------------------------------------------
  it('returns tooltipPayload with ruleCard and ruleState when action has effects', () => {
    const action = minimalActionDef({
      pre: { op: '>=', left: { ref: 'gvar', var: 'gold' }, right: 5 },
      effects: [{ addVar: { scope: 'global', var: 'gold', delta: 3 } }],
    });
    const ctx = makeContext({ state: makeState({ globalVars: { gold: 10 } }) });
    const result = describeAction(action, ctx);

    assert.ok(result.tooltipPayload !== undefined, 'tooltipPayload should be present');
    assert.ok(result.tooltipPayload.ruleCard !== undefined, 'ruleCard should be present');
    assert.ok(result.tooltipPayload.ruleState !== undefined, 'ruleState should be present');
    assert.ok(result.tooltipPayload.ruleCard.steps.length >= 1, 'should have at least one step');
  });

  // -----------------------------------------------------------------------
  // 18. tooltipPayload present even without verbalization (auto-humanize)
  // -----------------------------------------------------------------------
  it('returns tooltipPayload even without verbalization via auto-humanization', () => {
    const action = minimalActionDef({
      effects: [{ addVar: { scope: 'global', var: 'gold', delta: -2 } }],
    });
    const def = makeDef(); // no verbalization
    const ctx = makeContext({ def });
    const result = describeAction(action, ctx);

    assert.ok(result.tooltipPayload !== undefined, 'tooltipPayload should be present');
    assert.equal(result.tooltipPayload.ruleState.available, true);
  });

  // -----------------------------------------------------------------------
  // 19. RuleCard caching — reference equality on second call
  // -----------------------------------------------------------------------
  it('returns same RuleCard reference on repeated calls for same action', () => {
    const action = minimalActionDef({
      effects: [{ addVar: { scope: 'global', var: 'gold', delta: 1 } }],
    });
    const def = makeDef();
    const runtime = makeRuntime(def);
    const ctx: AnnotationContext = {
      def,
      runtime,
      state: makeState(),
      activePlayer: asPlayerId(0),
      actorPlayer: asPlayerId(0),
    };

    const result1 = describeAction(action, ctx);
    const result2 = describeAction(action, ctx);

    assert.ok(result1.tooltipPayload !== undefined);
    assert.ok(result2.tooltipPayload !== undefined);
    assert.equal(
      result1.tooltipPayload.ruleCard,
      result2.tooltipPayload.ruleCard,
      'RuleCard should be reference-equal (cached)',
    );
  });

  it('uses pipeline effects (not base action effects) in RuleCard when pipelines are configured', () => {
    const action = minimalActionDef({
      effects: [{ addVar: { scope: 'global', var: 'baseResource', delta: 5 } }],
    });
    const pipeline: ActionPipelineDef = {
      id: 'pipeline-only-effects',
      actionId: action.id,
      legality: null,
      costValidation: null,
      costEffects: [{ addVar: { scope: 'global', var: 'pipeCostResource', delta: -1 } }],
      targeting: {},
      stages: [
        {
          stage: 'main',
          effects: [{ addVar: { scope: 'global', var: 'pipeStageResource', delta: 2 } }],
        },
      ],
      atomicity: 'atomic',
    };
    const verbalization: VerbalizationDef = {
      labels: {
        baseResource: { singular: 'BASE_RESOURCE_LABEL', plural: 'BASE_RESOURCE_LABEL' },
        pipeCostResource: { singular: 'PIPE_COST_LABEL', plural: 'PIPE_COST_LABEL' },
        pipeStageResource: { singular: 'PIPE_STAGE_LABEL', plural: 'PIPE_STAGE_LABEL' },
      },
      stages: {},
      macros: {},
      sentencePlans: {},
      suppressPatterns: [],
      stageDescriptions: {},
      modifierEffects: {},
    };
    const def = makeDef({
      actions: [action],
      globalVars: [
        { name: 'gold', type: 'int', init: 0, min: 0, max: 999 },
        { name: 'baseResource', type: 'int', init: 0, min: 0, max: 999 },
        { name: 'pipeCostResource', type: 'int', init: 0, min: 0, max: 999 },
        { name: 'pipeStageResource', type: 'int', init: 0, min: 0, max: 999 },
      ],
      verbalization,
      actionPipelines: [pipeline],
    });
    const ctx = makeContext({ def });
    const result = describeAction(action, ctx);

    assert.ok(result.tooltipPayload !== undefined);
    const text = result.tooltipPayload.ruleCard.steps
      .flatMap((step) => step.lines.map((line) => line.text))
      .join(' ');

    assert.ok(text.includes('PIPE_COST_LABEL'), `Expected pipeline cost label in RuleCard text, got: ${text}`);
    assert.ok(text.includes('PIPE_STAGE_LABEL'), `Expected pipeline stage label in RuleCard text, got: ${text}`);
    assert.ok(!text.includes('BASE_RESOURCE_LABEL'), `Base action effect leaked into RuleCard text: ${text}`);
  });

  it('represents pipeline applicability as RuleCard modifier conditions', () => {
    const applicability: ConditionAST = {
      op: '>=',
      left: { ref: 'gvar', var: 'gold' },
      right: 5,
    };
    const action = minimalActionDef();
    const pipeline: ActionPipelineDef = {
      id: 'pipeline-applicability-modifier',
      actionId: action.id,
      applicability,
      legality: null,
      costValidation: null,
      costEffects: [{ addVar: { scope: 'global', var: 'gold', delta: -1 } }],
      targeting: {},
      stages: [
        {
          stage: 'main',
          effects: [{ addVar: { scope: 'global', var: 'gold', delta: 1 } }],
        },
      ],
      atomicity: 'atomic',
    };
    const def = makeDef({ actionPipelines: [pipeline] });
    const runtime = makeRuntime(def);

    const activeCtx: AnnotationContext = {
      def,
      runtime,
      state: makeState({ globalVars: { gold: 10 } }),
      activePlayer: asPlayerId(0),
      actorPlayer: asPlayerId(0),
    };
    const inactiveCtx: AnnotationContext = {
      def,
      runtime,
      state: makeState({ globalVars: { gold: 2 } }),
      activePlayer: asPlayerId(0),
      actorPlayer: asPlayerId(0),
    };

    const activeResult = describeAction(action, activeCtx);
    const inactiveResult = describeAction(action, inactiveCtx);

    assert.ok(activeResult.tooltipPayload !== undefined);
    assert.ok(inactiveResult.tooltipPayload !== undefined);

    const modifiers = activeResult.tooltipPayload.ruleCard.modifiers;
    assert.equal(modifiers.length, 1, 'Expected one pipeline applicability modifier');
    assert.deepEqual(modifiers[0]!.conditionAST, applicability);
    assert.deepEqual(activeResult.tooltipPayload.ruleState.activeModifierIndices, [0]);
    assert.deepEqual(inactiveResult.tooltipPayload.ruleState.activeModifierIndices, []);
  });

  // -----------------------------------------------------------------------
  // 20. RuleState varies with GameState
  // -----------------------------------------------------------------------
  it('produces different ruleState.available when precondition passes vs fails', () => {
    const pre: ConditionAST = {
      op: '>=',
      left: { ref: 'gvar', var: 'gold' },
      right: 5,
    };
    const action = minimalActionDef({ pre, effects: [{ addVar: { scope: 'global', var: 'gold', delta: 1 } }] });
    const def = makeDef();
    const runtime = makeRuntime(def);

    const ctxPass: AnnotationContext = {
      def,
      runtime,
      state: makeState({ globalVars: { gold: 10 } }),
      activePlayer: asPlayerId(0),
      actorPlayer: asPlayerId(0),
    };
    const ctxFail: AnnotationContext = {
      def,
      runtime,
      state: makeState({ globalVars: { gold: 2 } }),
      activePlayer: asPlayerId(0),
      actorPlayer: asPlayerId(0),
    };

    const resultPass = describeAction(action, ctxPass);
    const resultFail = describeAction(action, ctxFail);

    assert.ok(resultPass.tooltipPayload !== undefined);
    assert.ok(resultFail.tooltipPayload !== undefined);
    assert.equal(resultPass.tooltipPayload.ruleState.available, true);
    assert.equal(resultFail.tooltipPayload.ruleState.available, false);
    assert.ok(resultFail.tooltipPayload.ruleState.blockers.length >= 1, 'should have blocker details');
  });

  // -----------------------------------------------------------------------
  // 21. Existing sections and limitUsage unchanged (no regression)
  // -----------------------------------------------------------------------
  it('does not alter sections or limitUsage when tooltipPayload is present', () => {
    const pre: ConditionAST = {
      op: '>=',
      left: { ref: 'gvar', var: 'gold' },
      right: 5,
    };
    const action = minimalActionDef({
      pre,
      effects: [{ setVar: { scope: 'global', var: 'gold', value: 0 } }],
      limits: [{ id: 'test::turn::0', scope: 'turn', max: 3 }],
    });
    const def = makeDef();
    const runtime = makeRuntime(def);
    const state = makeState({ globalVars: { gold: 10 } });
    const ctx: AnnotationContext = {
      def,
      runtime,
      state,
      activePlayer: asPlayerId(0),
      actorPlayer: asPlayerId(0),
    };

    const result = describeAction(action, ctx);

    // Existing output preserved
    assert.ok(result.sections.some((s) => s.label === 'Preconditions'));
    assert.ok(result.sections.some((s) => s.label === 'Limits'));
    assert.ok(result.sections.some((s) => s.label === 'Effects'));
    assert.equal(result.limitUsage.length, 1);
    // tooltipPayload is additive
    assert.ok(result.tooltipPayload !== undefined);
    assert.deepEqual(result.tooltipPayload.ruleState.limitUsage, [{ id: 'test::turn::0', scope: 'turn', used: 0, max: 3 }]);
  });

  it('surfaces all ruleState limit usage entries for multi-limit actions', () => {
    const action = minimalActionDef({
      limits: [
        { id: 'test::turn::0', scope: 'turn', max: 1 },
        { id: 'test::game::1', scope: 'game', max: 3 },
      ],
      effects: [{ addVar: { scope: 'global', var: 'gold', delta: 1 } }],
    });
    const ctx = makeContext({
      state: makeState({
        actionUsage: {
          test: { turnCount: 1, phaseCount: 0, gameCount: 2 },
        },
      }),
    });

    const result = describeAction(action, ctx);

    assert.ok(result.tooltipPayload !== undefined);
    assert.deepEqual(result.tooltipPayload.ruleState.limitUsage, [
      { id: 'test::turn::0', scope: 'turn', used: 1, max: 1 },
      { id: 'test::game::1', scope: 'game', used: 2, max: 3 },
    ]);
  });

  // -----------------------------------------------------------------------
  // 22. Error resilience — tooltipPayload undefined on empty action
  // -----------------------------------------------------------------------
  it('returns tooltipPayload even for action with no effects (empty RuleCard)', () => {
    const action = minimalActionDef(); // no effects, no pre
    const ctx = makeContext();
    const result = describeAction(action, ctx);

    // Even with empty effects, the pipeline should succeed (producing an empty RuleCard)
    assert.ok(result.tooltipPayload !== undefined, 'tooltipPayload should still be present');
    assert.equal(result.tooltipPayload.ruleState.available, true, 'no pre means available');
  });

  // -----------------------------------------------------------------------
  // 23. Active modifier indices populated from conditionAST
  // -----------------------------------------------------------------------
  it('populates activeModifierIndices when if-condition is satisfied', () => {
    const action = minimalActionDef({
      effects: [{
        if: {
          when: { op: '>=', left: { ref: 'gvar', var: 'gold' }, right: 5 },
          then: [{ addVar: { scope: 'global', var: 'gold', delta: 1 } }],
        },
      }],
    });
    const def = makeDef();
    const runtime = makeRuntime(def);

    // gold=10: condition satisfied → modifier active
    const ctxActive: AnnotationContext = {
      def,
      runtime,
      state: makeState({ globalVars: { gold: 10 } }),
      activePlayer: asPlayerId(0),
      actorPlayer: asPlayerId(0),
    };
    const resultActive = describeAction(action, ctxActive);
    assert.ok(resultActive.tooltipPayload !== undefined);
    assert.ok(
      resultActive.tooltipPayload.ruleState.activeModifierIndices.includes(0),
      'modifier 0 should be active when condition is satisfied',
    );

    // gold=2: condition not satisfied → modifier inactive
    const ctxInactive: AnnotationContext = {
      def,
      runtime,
      state: makeState({ globalVars: { gold: 2 } }),
      activePlayer: asPlayerId(0),
      actorPlayer: asPlayerId(0),
    };
    const resultInactive = describeAction(action, ctxInactive);
    assert.ok(resultInactive.tooltipPayload !== undefined);
    assert.ok(
      !resultInactive.tooltipPayload.ruleState.activeModifierIndices.includes(0),
      'modifier 0 should be inactive when condition is not satisfied',
    );
  });

  // -----------------------------------------------------------------------
  // 24. tooltipPayload with verbalization labels
  // -----------------------------------------------------------------------
  it('uses verbalization labels in RuleCard when available', () => {
    const verbalization: VerbalizationDef = {
      labels: { gold: { singular: 'Gold Coin', plural: 'Gold Coins' } },
      stages: {},
      macros: {},
      sentencePlans: {},
      suppressPatterns: [],
      stageDescriptions: {},
      modifierEffects: {},
    };
    const action = minimalActionDef({
      effects: [{ addVar: { scope: 'global', var: 'gold', delta: 3 } }],
    });
    const def = makeDef({ verbalization });
    const ctx = makeContext({ def });
    const result = describeAction(action, ctx);

    assert.ok(result.tooltipPayload !== undefined);
    const allText = result.tooltipPayload.ruleCard.steps
      .flatMap((s) => s.lines.map((l) => l.text))
      .join(' ');
    assert.ok(allText.includes('Gold Coins'), `Expected "Gold Coins" in RuleCard text, got: ${allText}`);
  });

  it('uses actionSummaries as the RuleCard synopsis for matching action ids', () => {
    const verbalization: VerbalizationDef = {
      labels: { testAction: 'Test Action' },
      stages: {},
      macros: {},
      sentencePlans: {},
      suppressPatterns: [],
      stageDescriptions: {},
      modifierEffects: {},
      actionSummaries: {
        testAction: 'Authored summary',
      },
    };
    const action = minimalActionDef({
      id: 'testAction' as ActionDef['id'],
      effects: [{
        chooseOne: {
          internalDecisionId: 'decision:testAction:choice',
          bind: '$choice',
          options: { query: 'enums', values: ['alpha', 'beta'] },
        },
      }],
    });
    const def = makeDef({ verbalization });
    const ctx = makeContext({ def });

    const result = describeAction(action, ctx);

    assert.ok(result.tooltipPayload !== undefined);
    assert.equal(result.tooltipPayload.ruleCard.synopsis, 'Test Action — Authored summary');
  });

  it('prefers actionSummaries over generated choose/select synopsis text', () => {
    const verbalization: VerbalizationDef = {
      labels: {
        testAction: 'Test Action',
        alpha: 'Alpha',
        beta: 'Beta',
      },
      stages: {},
      macros: {},
      sentencePlans: {},
      suppressPatterns: [],
      stageDescriptions: {},
      modifierEffects: {},
      actionSummaries: {
        testAction: 'Authored summary',
      },
    };
    const action = minimalActionDef({
      id: 'testAction' as ActionDef['id'],
      effects: [{
        chooseOne: {
          internalDecisionId: 'decision:testAction:choice',
          bind: '$choice',
          options: { query: 'enums', values: ['alpha', 'beta'] },
        },
      }],
    });
    const def = makeDef({ verbalization });
    const ctx = makeContext({ def });

    const result = describeAction(action, ctx);

    assert.ok(result.tooltipPayload !== undefined);
    assert.equal(result.tooltipPayload.ruleCard.synopsis, 'Test Action — Authored summary');
    assert.notEqual(result.tooltipPayload.ruleCard.synopsis, 'Test Action — Choose: Alpha, Beta');
  });

  // -----------------------------------------------------------------------
  // 25. structuredClone-safe with tooltipPayload
  // -----------------------------------------------------------------------
  it('produces structuredClone-safe output including tooltipPayload', () => {
    const action = minimalActionDef({
      pre: { op: '>=', left: { ref: 'gvar', var: 'gold' }, right: 5 },
      effects: [{ addVar: { scope: 'global', var: 'gold', delta: 1 } }],
    });
    const ctx = makeContext();
    const result = describeAction(action, ctx);

    const cloned = structuredClone(result);
    assert.deepEqual(cloned.sections, result.sections);
    assert.deepEqual(cloned.limitUsage, result.limitUsage);
    assert.deepEqual(cloned.tooltipPayload, result.tooltipPayload);
  });
});
