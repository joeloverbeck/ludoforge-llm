import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { advancePhase, asPhaseId, initialState, type ConditionAST, type EffectAST, type GameDef, type TriggerLogEntry } from '../../src/kernel/index.js';

const pacifyCondition = (spaceVar: string, trackerVar: string, actor: 'us' | 'arvn'): ConditionAST => {
  const spendConstraints: readonly ConditionAST[] =
    actor === 'us'
      ? [
          { op: '>', left: { ref: 'gvar', var: 'arvnResources' }, right: { ref: 'gvar', var: 'totalEcon' } },
          { op: '>', left: { ref: 'gvar', var: 'arvnResources' }, right: 0 },
        ]
      : [{ op: '>', left: { ref: 'gvar', var: 'arvnResources' }, right: 0 }];

  return {
    op: 'and',
    args: [
      { op: '<', left: { ref: 'gvar', var: spaceVar }, right: 2 },
      { op: '<', left: { ref: 'gvar', var: trackerVar }, right: 2 },
      {
        op: 'or',
        args: [
          { op: '<', left: { ref: 'gvar', var: 'pacSpacesUsed' }, right: 4 },
          { op: '>', left: { ref: 'gvar', var: trackerVar }, right: 0 },
        ],
      },
      ...spendConstraints,
    ],
  };
};

const agitationCondition = (spaceVar: string, trackerVar: string): ConditionAST => ({
  op: 'and',
  args: [
    { op: '>', left: { ref: 'gvar', var: spaceVar }, right: -2 },
    { op: '<', left: { ref: 'gvar', var: trackerVar }, right: 2 },
    {
      op: 'or',
      args: [
        { op: '<', left: { ref: 'gvar', var: 'agSpacesUsed' }, right: 4 },
        { op: '>', left: { ref: 'gvar', var: trackerVar }, right: 0 },
      ],
    },
    { op: '>', left: { ref: 'gvar', var: 'vcResources' }, right: 0 },
  ],
});

const attemptPacifyShift = (spaceVar: string, trackerVar: string, actor: 'us' | 'arvn'): EffectAST => ({
  if: {
    when: pacifyCondition(spaceVar, trackerVar, actor),
    then: [
      {
        if: {
          when: { op: '==', left: { ref: 'gvar', var: trackerVar }, right: 0 },
          then: [{ addVar: { scope: 'global', var: 'pacSpacesUsed', delta: 1 } }],
        },
      },
      { addVar: { scope: 'global', var: spaceVar, delta: 1 } },
      { addVar: { scope: 'global', var: trackerVar, delta: 1 } },
      { addVar: { scope: 'global', var: actor === 'us' ? 'usShifts' : 'arvnShifts', delta: 1 } },
      { addVar: { scope: 'global', var: 'arvnResources', delta: -1 } },
    ],
  },
});

const attemptAgitationShift = (spaceVar: string, trackerVar: string): EffectAST => ({
  if: {
    when: agitationCondition(spaceVar, trackerVar),
    then: [
      {
        if: {
          when: { op: '==', left: { ref: 'gvar', var: trackerVar }, right: 0 },
          then: [{ addVar: { scope: 'global', var: 'agSpacesUsed', delta: 1 } }],
        },
      },
      { addVar: { scope: 'global', var: spaceVar, delta: -1 } },
      { addVar: { scope: 'global', var: trackerVar, delta: 1 } },
      { addVar: { scope: 'global', var: 'vcShifts', delta: 1 } },
      { addVar: { scope: 'global', var: 'vcResources', delta: -1 } },
    ],
  },
});

const createSupportFixtureDef = (): GameDef => {
  const usPlan = [
    ['supportA', 'pacA'],
    ['supportA', 'pacA'],
    ['supportB', 'pacB'],
    ['supportB', 'pacB'],
    ['supportC', 'pacC'],
    ['supportC', 'pacC'],
    ['supportD', 'pacD'],
    ['supportD', 'pacD'],
    ['supportE', 'pacE'],
    ['supportE', 'pacE'],
  ] as const;

  const arvnPlan = [
    ['supportB', 'pacB'],
    ['supportB', 'pacB'],
    ['supportC', 'pacC'],
    ['supportC', 'pacC'],
    ['supportD', 'pacD'],
    ['supportD', 'pacD'],
    ['supportE', 'pacE'],
    ['supportE', 'pacE'],
    ['supportA', 'pacA'],
    ['supportA', 'pacA'],
  ] as const;

  const vcPlan = [
    ['supportE', 'agE'],
    ['supportC', 'agC'],
    ['supportB', 'agB'],
    ['supportA', 'agA'],
    ['supportD', 'agD'],
    ['supportE', 'agE'],
    ['supportC', 'agC'],
    ['supportB', 'agB'],
    ['supportA', 'agA'],
    ['supportD', 'agD'],
  ] as const;

  const supportEffects: EffectAST[] = [
    ...usPlan.map(([spaceVar, trackerVar]) => attemptPacifyShift(spaceVar, trackerVar, 'us')),
    { setVar: { scope: 'global', var: 'arvnAfterUs', value: { ref: 'gvar', var: 'arvnResources' } } },
    ...arvnPlan.map(([spaceVar, trackerVar]) => attemptPacifyShift(spaceVar, trackerVar, 'arvn')),
    ...vcPlan.map(([spaceVar, trackerVar]) => attemptAgitationShift(spaceVar, trackerVar)),
  ];

  return {
    metadata: { id: 'fitl-coup-support-phase-int', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
    constants: {},
    globalVars: [
      { name: 'supportA', type: 'int', init: -1, min: -2, max: 2 },
      { name: 'supportB', type: 'int', init: 0, min: -2, max: 2 },
      { name: 'supportC', type: 'int', init: 1, min: -2, max: 2 },
      { name: 'supportD', type: 'int', init: 0, min: -2, max: 2 },
      { name: 'supportE', type: 'int', init: 2, min: -2, max: 2 },
      { name: 'arvnResources', type: 'int', init: 5, min: 0, max: 75 },
      { name: 'totalEcon', type: 'int', init: 3, min: 0, max: 15 },
      { name: 'vcResources', type: 'int', init: 8, min: 0, max: 75 },
      { name: 'pacSpacesUsed', type: 'int', init: 0, min: 0, max: 4 },
      { name: 'agSpacesUsed', type: 'int', init: 0, min: 0, max: 4 },
      { name: 'usShifts', type: 'int', init: 0, min: 0, max: 8 },
      { name: 'arvnShifts', type: 'int', init: 0, min: 0, max: 8 },
      { name: 'vcShifts', type: 'int', init: 0, min: 0, max: 8 },
      { name: 'arvnAfterUs', type: 'int', init: 0, min: 0, max: 75 },
      { name: 'pacA', type: 'int', init: 0, min: 0, max: 2 },
      { name: 'pacB', type: 'int', init: 0, min: 0, max: 2 },
      { name: 'pacC', type: 'int', init: 0, min: 0, max: 2 },
      { name: 'pacD', type: 'int', init: 0, min: 0, max: 2 },
      { name: 'pacE', type: 'int', init: 0, min: 0, max: 2 },
      { name: 'agA', type: 'int', init: 0, min: 0, max: 2 },
      { name: 'agB', type: 'int', init: 0, min: 0, max: 2 },
      { name: 'agC', type: 'int', init: 0, min: 0, max: 2 },
      { name: 'agD', type: 'int', init: 0, min: 0, max: 2 },
      { name: 'agE', type: 'int', init: 0, min: 0, max: 2 },
    ],
    perPlayerVars: [],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: {
      phases: [{ id: asPhaseId('main') }, { id: asPhaseId('support') }],
    },
    actions: [
      {
        id: 'pass',
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
    ],
    triggers: [{ id: 'on_support_enter', event: { type: 'phaseEnter', phase: asPhaseId('support') }, effects: supportEffects }],
    terminal: { conditions: [] },
  } as unknown as GameDef;
};

describe('FITL coup support phase integration', () => {
  it('executes deterministic US/ARVN Pacification and VC Agitation budgets with per-space caps', () => {
    const def = createSupportFixtureDef();
    const start = initialState(def, 41, 2).state;
    const triggerLog: TriggerLogEntry[] = [];

    const next = advancePhase(def, start, triggerLog);

    assert.equal(next.currentPhase, asPhaseId('support'));

    assert.equal(next.globalVars.usShifts, 2);
    assert.equal(next.globalVars.arvnShifts, 3);
    assert.equal(next.globalVars.vcShifts, 8);
    assert.equal(next.globalVars.pacSpacesUsed, 3);
    assert.equal(next.globalVars.agSpacesUsed, 4);

    assert.equal(next.globalVars.arvnAfterUs, next.globalVars.totalEcon);
    assert.equal(next.globalVars.arvnResources, 0);

    assert.equal(next.globalVars.supportA, -1);
    assert.equal(next.globalVars.supportB, 0);
    assert.equal(next.globalVars.supportC, 0);
    assert.equal(next.globalVars.supportD, 0);
    assert.equal(next.globalVars.supportE, 0);

    const perSpaceCounters = [
      next.globalVars.pacA,
      next.globalVars.pacB,
      next.globalVars.pacC,
      next.globalVars.pacD,
      next.globalVars.pacE,
      next.globalVars.agA,
      next.globalVars.agB,
      next.globalVars.agC,
      next.globalVars.agD,
      next.globalVars.agE,
    ];

    for (const counter of perSpaceCounters) {
      assert.ok(Number(counter ?? 0) <= 2);
    }

    const supportEnterFirings = triggerLog.filter(
      (entry) => entry.kind === 'fired' && entry.triggerId === 'on_support_enter',
    );
    assert.equal(supportEnterFirings.length, 1);
  });

  it('is deterministic for identical seeds and inputs', () => {
    const def = createSupportFixtureDef();

    const runOnce = () => {
      const start = initialState(def, 41, 2).state;
      const triggerLog: TriggerLogEntry[] = [];
      const end = advancePhase(def, start, triggerLog);
      return { end, triggerLog };
    };

    const first = runOnce();
    const second = runOnce();

    assert.deepEqual(second, first);
  });
});
