import * as assert from 'node:assert/strict';

import { proposeAdvisoryTurnPlan } from '../../src/agents/plan-proposal.js';
import { PolicyEvaluationContext, type PolicyEvaluationCandidate } from '../../src/agents/policy-evaluation-core.js';
import { evaluateStrategyModule } from '../../src/agents/policy-strategy-module-eval.js';
import {
  asActionId,
  asPlayerId,
  asTokenId,
  createGameDefRuntime,
  initialState,
  type AgentPolicyCatalog,
  type AgentPolicyLiteral,
  type CompiledPolicyExpr,
  type Decision,
  type GameDef,
  type GameState,
} from '../../src/kernel/index.js';
import { emitPolicyProfileQualityRecord } from '../helpers/policy-profile-quality-report-helpers.js';
import { getFitlProductionFixture } from '../helpers/production-spec-helpers.js';

export type FitlProfile = 'us' | 'arvn' | 'nva' | 'vc';
export type SharedModuleKey =
  | 'immediateWin'
  | 'blockCurrentLeader'
  | 'nearCoupConcreteSwing'
  | 'resourceLogistics'
  | 'eventDirectSwing'
  | 'allyRivalThrottle'
  | 'monsoonOperationalRestriction';

const profileIds: Record<FitlProfile, string> = {
  us: 'us-baseline',
  arvn: 'arvn-baseline',
  nva: 'nva-baseline',
  vc: 'vc-baseline',
};

const expectations: Record<SharedModuleKey, {
  readonly moduleId: string;
  readonly traceLabel: string;
  readonly priorityTier: number;
  readonly scoreGroupId?: string;
  readonly strategicCondition?: string;
  readonly candidateFeatures: readonly string[];
  readonly actionTags?: readonly string[];
  readonly expressionNeedle?: string;
  readonly expectedScore?: number;
}> = {
  immediateWin: {
    moduleId: 'shared.immediateWin',
    traceLabel: 'complete immediate win',
    priorityTier: 90,
    scoreGroupId: 'immediateWin',
    strategicCondition: 'selfCanWinNow',
    candidateFeatures: ['projectedSelfMargin'],
    expectedScore: 20,
  },
  blockCurrentLeader: {
    moduleId: 'shared.blockCurrentLeader',
    traceLabel: 'block current leader',
    priorityTier: 80,
    scoreGroupId: 'leaderDenial',
    strategicCondition: 'currentLeaderNearWin',
    candidateFeatures: ['projectedLeaderMarginDelta'],
    actionTags: ['govern', 'patrol', 'sweep', 'assault', 'train', 'air-strike', 'march', 'attack', 'terror', 'infiltrate', 'bombard'],
    expectedScore: 20,
  },
  nearCoupConcreteSwing: {
    moduleId: 'shared.nearCoupConcreteSwing',
    traceLabel: 'concrete coup swing',
    priorityTier: 70,
    scoreGroupId: 'concreteCoupSwing',
    strategicCondition: 'coupImminent',
    candidateFeatures: ['projectedSelfMarginDelta', 'projectedAidDelta'],
    expectedScore: 20,
  },
  resourceLogistics: {
    moduleId: 'shared.resourceLogistics',
    traceLabel: 'preserve resources and logistics',
    priorityTier: 60,
    scoreGroupId: 'logisticsSwing',
    strategicCondition: 'resourcesLow',
    candidateFeatures: ['projectedAidDelta', 'projectedTrailDelta'],
    expectedScore: 16,
  },
  eventDirectSwing: {
    moduleId: 'shared.eventDirectSwing',
    traceLabel: 'play event for direct swing',
    priorityTier: 50,
    scoreGroupId: 'eventSwing',
    candidateFeatures: ['projectedSelfMargin'],
    expressionNeedle: 'event-play',
    expectedScore: 16,
  },
  allyRivalThrottle: {
    moduleId: 'shared.allyRivalThrottle',
    traceLabel: 'throttle ally gains when ally near win',
    priorityTier: 65,
    scoreGroupId: 'allyRivalRisk',
    strategicCondition: 'allyNearWin',
    candidateFeatures: ['projectedAllyMarginDelta'],
    expectedScore: -12,
  },
  monsoonOperationalRestriction: {
    moduleId: 'shared.monsoonOperationalRestriction',
    traceLabel: 'avoid Sweep and March under Monsoon',
    priorityTier: 75,
    strategicCondition: 'monsoonNow',
    candidateFeatures: [],
    actionTags: ['sweep', 'march'],
  },
};

const sharedModuleIds = Object.values(expectations).map((entry) => entry.moduleId);

const previewCandidateFeatureIds = [
  'projectedLeaderMarginDelta',
  'projectedAllyMarginDelta',
  'projectedAidDelta',
  'projectedTrailDelta',
  'projectedSupportDelta',
  'projectedOppositionDelta',
] as const;

export function assertSharedModuleWitness(
  testFile: string,
  profile: FitlProfile,
  moduleKey: SharedModuleKey,
): void {
  const fixture = getFitlProductionFixture();
  const catalog = fixture.gameDef.agents;
  assert.ok(catalog, 'expected FITL production agents');

  const expectation = expectations[moduleKey];
  const profileId = profileIds[profile];
  const compiledProfile = catalog.profiles[profileId];
  assert.ok(compiledProfile, `expected ${profileId} profile`);

  assert.ok(
    compiledProfile.use.strategyModules?.includes(expectation.moduleId),
    `expected ${profileId} to bind ${expectation.moduleId} in use.strategyModules`,
  );
  assert.ok(
    compiledProfile.plan.strategyModules?.includes(expectation.moduleId),
    `expected ${profileId} to plan with ${expectation.moduleId}`,
  );

  const module = catalog.compiled.strategyModules?.[expectation.moduleId];
  assert.ok(module, `expected compiled module ${expectation.moduleId}`);
  assert.equal(module.traceLabel, expectation.traceLabel);
  assert.equal(module.priority.tier, expectation.priorityTier);
  assert.ok(module.applies.scopes.includes('move'), `${expectation.moduleId} must apply at move scope`);

  if (expectation.actionTags !== undefined) {
    assert.deepEqual(module.applies.actionTags, expectation.actionTags);
  }

  if (expectation.strategicCondition !== undefined) {
    assert.ok(
      module.dependencies.strategicConditions.includes(expectation.strategicCondition),
      `${expectation.moduleId} should activate from ${expectation.strategicCondition}`,
    );
  }

  for (const featureId of expectation.candidateFeatures) {
    assert.ok(
      module.dependencies.candidateFeatures.includes(featureId),
      `${expectation.moduleId} should score with ${featureId}`,
    );
  }

  if (expectation.expressionNeedle !== undefined) {
    assert.match(JSON.stringify(module.when), new RegExp(expectation.expressionNeedle, 'u'));
  }

  if (expectation.scoreGroupId !== undefined) {
    assert.ok(
      module.scoreGroups.some((group) => group.id === expectation.scoreGroupId && group.terms.length > 0),
      `${expectation.moduleId} should retain score group ${expectation.scoreGroupId}`,
    );
  }

  if (expectation.expectedScore !== undefined) {
    assert.notEqual(moduleKey, 'monsoonOperationalRestriction');
    const behavior = evaluateSharedModuleBehavior(
      fixture.gameDef,
      catalog,
      moduleKey as Exclude<SharedModuleKey, 'monsoonOperationalRestriction'>,
    );
    assert.equal(behavior.active, true, `${expectation.moduleId} should activate in its curated behavior fixture`);
    assert.equal(
      behavior.scoreGroups.get(expectation.scoreGroupId!),
      expectation.expectedScore,
      `${expectation.moduleId} should produce its expected curated score-group contribution`,
    );
    assert.equal(
      behavior.contribution,
      expectation.expectedScore,
      `${expectation.moduleId} should contribute its curated behavior score`,
    );
  }

  emitPolicyProfileQualityRecord({
    file: testFile,
    variantId: profileId,
    seed: 201_006,
    passed: true,
    stopReason: `${expectation.moduleId}:compiled-witness`,
    decisions: 1,
  });
}

export function assertSharedModulesBoundByAllProfiles(): void {
  const catalog = requireFitlAgentCatalog();

  for (const [profile, profileId] of Object.entries(profileIds)) {
    const compiledProfile = catalog.profiles[profileId];
    assert.ok(compiledProfile, `expected ${profileId} profile for ${profile}`);
    assert.deepEqual(
      sharedModuleIds.filter((id) => compiledProfile.use.strategyModules?.includes(id)),
      sharedModuleIds,
      `expected ${profileId} to bind every shared module`,
    );
  }
}

export function assertNoPerFactionBlockImmediateWin(): void {
  const catalog = requireFitlAgentCatalog();
  const retiredIds = ['arvn.blockImmediateWin', 'us.blockImmediateWin', 'nva.blockImmediateWin'];

  for (const id of retiredIds) {
    assert.equal(catalog.compiled.strategyModules?.[id], undefined, `retired module still compiled: ${id}`);
    assert.equal(catalog.library.strategyModules?.[id], undefined, `retired module still indexed: ${id}`);
  }

  for (const [profileId, profile] of Object.entries(catalog.profiles)) {
    for (const id of retiredIds) {
      assert.equal(profile.use.strategyModules?.includes(id), false, `${profileId} still binds ${id}`);
      assert.equal(profile.plan.strategyModules?.includes(id), false, `${profileId} still plans with ${id}`);
    }
  }
}

export function assertSharedPreviewIntegrityFallback(): void {
  const catalog = requireFitlAgentCatalog();

  for (const featureId of previewCandidateFeatureIds) {
    assert.deepEqual(
      catalog.library.candidateFeatures[featureId]?.previewFallback,
      { onUnavailable: 'noContribution' },
      `${featureId} should retain library previewFallback`,
    );
    assert.deepEqual(
      catalog.compiled.candidateFeatures[featureId]?.previewFallback,
      { onUnavailable: 'noContribution' },
      `${featureId} should retain compiled previewFallback`,
    );
  }

  const previewDrivenModules = [
    'shared.blockCurrentLeader',
    'shared.nearCoupConcreteSwing',
    'shared.resourceLogistics',
    'shared.allyRivalThrottle',
  ];
  for (const moduleId of previewDrivenModules) {
    const module = catalog.compiled.strategyModules?.[moduleId];
    assert.ok(module, `expected ${moduleId}`);
    assert.ok(module.dependencies.candidateFeatures.length > 0, `${moduleId} must score preview-derived features explicitly`);
  }
}

export function assertMonsoonAwarenessWitness(testFile: string, profile: FitlProfile): void {
  const fixture = getFitlProductionFixture();
  const catalog = fixture.gameDef.agents;
  assert.ok(catalog, 'expected FITL production agents');
  const profileId = profileIds[profile];
  const compiledProfile = catalog.profiles[profileId];
  assert.ok(compiledProfile, `expected ${profileId} profile`);

  const condition = catalog.compiled.strategicConditions.monsoonNow;
  assert.ok(condition, 'expected compiled monsoonNow condition');
  assert.match(JSON.stringify(condition.target), /monsoonNow/u, 'monsoonNow condition must consume monsoonNow state feature');

  const monsoonFeature = catalog.compiled.stateFeatures.monsoonNow;
  assert.ok(monsoonFeature, 'expected monsoonNow state feature');
  assert.match(JSON.stringify(monsoonFeature.expr), /scheduleLowerBound.*scheduleDistance.*coupEntry/u);

  const planTemplates = compiledProfile.plan.planTemplates ?? [];
  const monsoonSensitiveTemplate = planTemplates.find((templateId) => {
    const template = catalog.library.planTemplates?.[templateId];
    const rootTags = template?.root.actionTags.map(String) ?? [];
    return rootTags.includes('sweep') || rootTags.includes('march');
  });
  assert.ok(monsoonSensitiveTemplate, `${profileId} should retain a Sweep/March template for the monsoon exclusion witness`);

  const module = catalog.compiled.strategyModules?.['shared.monsoonOperationalRestriction'];
  assert.ok(module, 'expected shared.monsoonOperationalRestriction module');
  assert.ok(
    compiledProfile.use.strategyModules?.includes('shared.monsoonOperationalRestriction'),
    `${profileId} should bind shared.monsoonOperationalRestriction`,
  );
  assert.deepEqual(
    module.suppressesPlanTemplates.filter((id) => planTemplates.includes(id)).sort(),
    expectedMonsoonSuppressedTemplates(profile),
  );

  const monsoonProfile = catalog.profiles[profileId];
  assert.ok(monsoonProfile, `expected ${profileId} profile in Monsoon catalog`);
  const runtime = createGameDefRuntime(fixture.gameDef);
  const state = withMonsoonLookahead(fixture.gameDef, initialState(fixture.gameDef, 201_006, 4, undefined, runtime).state);
  const proposal = proposeAdvisoryTurnPlan({
    def: fixture.gameDef,
    state,
    seatId: profile,
    playerId: asPlayerId(playerIndexByProfile[profile]),
    profile: monsoonProfile,
    catalog,
    actionDecisions: planRootActionDecisions(fixture.gameDef, catalog, planTemplates),
    runtime,
  });
  assert.ok(
    proposal.activeDoctrines.includes('shared.monsoonOperationalRestriction'),
    `${profileId} should activate shared.monsoonOperationalRestriction under Monsoon`,
  );
  assert.deepEqual(
    proposal.filteredOutTemplates
      .filter((entry) => entry.gatedBy.includes('shared.monsoonOperationalRestriction'))
      .map((entry) => entry.templateId)
      .sort(),
    expectedMonsoonSuppressedTemplates(profile),
    `${profileId} should suppress its Sweep/March templates under Monsoon`,
  );
  assert.equal(
    proposal.alternatives.some((entry) => expectedMonsoonSuppressedTemplates(profile).includes(entry.templateId)),
    false,
    `${profileId} should not propose suppressed Sweep/March templates under Monsoon`,
  );

  emitPolicyProfileQualityRecord({
    file: testFile,
    variantId: profileId,
    seed: 201_006,
    passed: true,
    stopReason: 'monsoonNow:behavioral-template-suppression',
    decisions: 1,
  });
}

function requireFitlAgentCatalog() {
  const catalog = getFitlProductionFixture().gameDef.agents;
  assert.ok(catalog, 'expected FITL production agents');
  return catalog;
}

const playerIndexByProfile: Record<FitlProfile, number> = {
  us: 0,
  arvn: 1,
  nva: 2,
  vc: 3,
};

const literalExpr = (value: AgentPolicyLiteral): CompiledPolicyExpr => ({ kind: 'literal', value });

function evaluateSharedModuleBehavior(
  def: GameDef,
  catalog: AgentPolicyCatalog,
  moduleKey: Exclude<SharedModuleKey, 'monsoonOperationalRestriction'>,
) {
  const expectation = expectations[moduleKey];
  const module = catalog.compiled.strategyModules?.[expectation.moduleId];
  assert.ok(module, `expected compiled module ${expectation.moduleId}`);
  const candidate = behaviorCandidate(def, moduleKey);
  const behaviorCatalog = catalogWithBehaviorLiterals(catalog, moduleKey);
  const state = initialState(def, 201_006, 4).state;
  const context = new PolicyEvaluationContext({
    def: { ...def, agents: behaviorCatalog },
    state,
    playerId: asPlayerId(0),
    seatId: 'us',
    catalog: behaviorCatalog,
    parameterValues: {},
    trustedMoveIndex: new Map(),
    cacheBinding: { kind: 'isolated' },
  }, [candidate]);
  try {
    return evaluateStrategyModule({
      moduleId: expectation.moduleId,
      module,
      candidate,
      stateHash: state.stateHash,
      actionTagIndex: def.actionTagIndex,
      activationCache: new Map(),
      evaluationCache: new Map(),
      evaluateExpr: (expr, exprCandidate) => context.evaluateCompiledExpr(expr, exprCandidate),
      evaluateSelector: (selectorId) => ({ selectorId, selected: [], impactSatisfied: false }),
    });
  } finally {
    context.dispose();
  }
}

function catalogWithBehaviorLiterals(
  catalog: AgentPolicyCatalog,
  moduleKey: Exclude<SharedModuleKey, 'monsoonOperationalRestriction'>,
): AgentPolicyCatalog {
  const expectation = expectations[moduleKey];
  const stateFeatures = { ...catalog.compiled.stateFeatures };
  const candidateFeatures = { ...catalog.compiled.candidateFeatures };
  const strategicConditions = { ...catalog.compiled.strategicConditions };

  if (expectation.strategicCondition !== undefined) {
    const condition = strategicConditions[expectation.strategicCondition];
    assert.ok(condition, `expected strategic condition ${expectation.strategicCondition}`);
    strategicConditions[expectation.strategicCondition] = {
      ...condition,
      target: literalExpr(true),
    };
  }

  for (const featureId of expectation.candidateFeatures) {
    const feature = candidateFeatures[featureId];
    assert.ok(feature, `expected candidate feature ${featureId}`);
    candidateFeatures[featureId] = {
      ...feature,
      expr: literalExpr(behaviorFeatureValue(moduleKey, featureId)),
    };
  }

  return {
    ...catalog,
    compiled: {
      ...catalog.compiled,
      stateFeatures,
      candidateFeatures,
      strategicConditions,
    },
  };
}

function behaviorFeatureValue(moduleKey: Exclude<SharedModuleKey, 'monsoonOperationalRestriction'>, featureId: string): number {
  if (moduleKey === 'blockCurrentLeader' && featureId === 'projectedLeaderMarginDelta') return -2;
  if (moduleKey === 'allyRivalThrottle' && featureId === 'projectedAllyMarginDelta') return 2;
  return 2;
}

function behaviorCandidate(def: GameDef, moduleKey: Exclude<SharedModuleKey, 'monsoonOperationalRestriction'>): PolicyEvaluationCandidate {
  const actionId = actionIdForModuleBehavior(def, moduleKey);
  return {
    move: { actionId: asActionId(actionId), params: {} },
    stableMoveKey: `${actionId}|{}|false|unclassified`,
    actionId,
    previewRefIds: new Set(),
    unknownPreviewRefs: new Map(),
    unknownLookupRefs: new Map(),
    unknownCandidateParamRefs: new Map(),
  };
}

function actionIdForModuleBehavior(def: GameDef, moduleKey: Exclude<SharedModuleKey, 'monsoonOperationalRestriction'>): string {
  if (moduleKey === 'eventDirectSwing') {
    return requireActionIdForTag(def, 'event-play');
  }
  return def.actionTagIndex?.byTag.govern?.[0]
    ?? def.actionTagIndex?.byTag.train?.[0]
    ?? def.actions[0]?.id
    ?? assert.fail('expected at least one FITL action');
}

function requireActionIdForTag(def: GameDef, tag: string): string {
  const actionId = def.actionTagIndex?.byTag[tag]?.[0];
  assert.ok(actionId, `expected FITL action tagged ${tag}`);
  return actionId;
}

function expectedMonsoonSuppressedTemplates(profile: FitlProfile): readonly string[] {
  switch (profile) {
    case 'us':
      return ['us.sweepAirStrike'];
    case 'arvn':
      return ['arvn.sweepRaid'];
    case 'nva':
      return [
        'nva.locOccupationBeforeCoup',
        'nva.marchAmbush',
        'nva.marchControl',
        'nva.marchInfiltrate',
        'nva.marchInfiltrateControl',
      ];
    case 'vc':
      return ['vc.marchAmbushFromLoc', 'vc.marchSubvert'];
  }
}

function withMonsoonLookahead(_def: GameDef, state: GameState): GameState {
  return {
    ...state,
    zones: {
      ...state.zones,
      'lookahead:none': [
        { id: asTokenId('spec-201-monsoon-lookahead'), type: 'card', props: { isCoup: true } },
      ],
    },
  };
}

function planRootActionDecisions(
  def: GameDef,
  catalog: AgentPolicyCatalog,
  templateIds: readonly string[],
): readonly Extract<Decision, { readonly kind: 'actionSelection' }>[] {
  const actionIds = new Set<string>();
  for (const templateId of templateIds) {
    const template = catalog.library.planTemplates?.[templateId];
    if (template === undefined) continue;
    for (const actionId of template.root.actionIds) {
      actionIds.add(String(actionId));
    }
    for (const actionTag of template.root.actionTags) {
      for (const actionId of def.actionTagIndex?.byTag[String(actionTag)] ?? []) {
        actionIds.add(actionId);
      }
    }
  }
  assert.ok(actionIds.size > 0, 'expected plan root action decisions for Monsoon proposal witness');
  return [...actionIds].sort().map((actionId) => ({
    kind: 'actionSelection',
    actionId: asActionId(actionId),
    move: { actionId: asActionId(actionId), params: {} },
  }));
}
