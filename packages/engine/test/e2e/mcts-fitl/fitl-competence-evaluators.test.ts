import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { MctsSearchDiagnostics } from '../../../src/agents/index.js';
import {
  asActionId,
  asTokenId,
  type GameDef,
  type GameState,
  type Move,
  type MoveParamValue,
  type PlayerId,
  type Token,
} from '../../../src/kernel/index.js';

import {
  arvnAidPreservation,
  arvnControlMaintain,
  arvnGovern,
  arvnLocControl,
  arvnSweepRaid,
  arvnTrainCubes,
  categoryCompetence,
  monsoonAwareness,
  nvaAttackConditions,
  nvaBombardUsage,
  nvaControlGrowth,
  nvaInfiltrateValue,
  nvaMarchSouthward,
  nvaRallyTrailImprove,
  passStrategicValue,
  resourceDiscipline,
  usAssaultRemoval,
  usForcePreservation,
  usPacification,
  usSupportGrowth,
  usSweepActivation,
  usTrailDegradation,
  vcBaseExpansion,
  vcOppositionGrowth,
  vcRallyQuality,
  vcResourceManagement,
  vcSubvertTargeting,
  vcTaxEfficiency,
  vcTerrorTarget,
  victoryDefense,
  victoryProgress,
  type CompetenceEvalContext,
} from './fitl-competence-evaluators.js';
import {
  compileFitlDef,
  createPlaybookBaseState,
  engineerScenarioState,
  ARVN_PLAYER,
  NVA_PLAYER,
  US_PLAYER,
  VC_PLAYER,
} from './fitl-mcts-test-helpers.js';

const diagnosticsStub: MctsSearchDiagnostics = {
  iterations: 1,
  nodesAllocated: 1,
  maxTreeDepth: 1,
  rootChildVisits: {},
};

const makeToken = (
  id: string,
  type: Token['type'],
  faction: 'VC' | 'ARVN' | 'US' | 'NVA',
  props: Readonly<Record<string, string>> = {},
): Token => ({
  id: asTokenId(id),
  type,
  props: {
    faction,
    type,
    ...props,
  },
});

const makeRuntimeToken = (
  id: string,
  runtimeType: Token['type'],
  semanticType: string,
  faction: 'VC' | 'ARVN' | 'US' | 'NVA',
  props: Readonly<Record<string, string>> = {},
): Token => ({
  id: asTokenId(id),
  type: runtimeType,
  props: {
    faction,
    type: semanticType,
    ...props,
  },
});

const cloneLookaheadWithCoupFlag = (isCoup: boolean): Token => {
  const def = compileFitlDef();
  const state = createPlaybookBaseState(def);
  const lookaheadZoneId = def.turnOrder?.type === 'cardDriven'
    ? def.turnOrder.config.turnFlow.cardLifecycle.lookahead
    : null;
  if (lookaheadZoneId === null) {
    throw new Error('expected FITL test def to use card-driven turn order');
  }
  const existing = state.zones[lookaheadZoneId]?.[0];
  if (existing === undefined) {
    throw new Error('expected lookahead zone to contain a card token');
  }
  return {
    ...existing,
    props: {
      ...existing.props,
      isCoup,
    },
  };
};

const createContext = (
  actionId: string,
  options?: {
    readonly playerId?: PlayerId;
    readonly actionClass?: string;
    readonly freeOperation?: boolean;
    readonly budget?: CompetenceEvalContext['budget'];
    readonly globalVarsBefore?: Readonly<Record<string, number | boolean>>;
    readonly globalVarsAfter?: Readonly<Record<string, number | boolean>>;
    readonly zoneVarsBefore?: Readonly<Record<string, Readonly<Record<string, number>>>>;
    readonly zoneVarsAfter?: Readonly<Record<string, Readonly<Record<string, number>>>>;
    readonly markersBefore?: Readonly<Record<string, Readonly<Record<string, string>>>>;
    readonly markersAfter?: Readonly<Record<string, Readonly<Record<string, string>>>>;
    readonly zonesBefore?: Readonly<Record<string, readonly Token[]>>;
    readonly zonesAfter?: Readonly<Record<string, readonly Token[]>>;
    readonly params?: Readonly<Record<string, MoveParamValue>>;
    readonly compound?: Move['compound'];
    readonly lookaheadIsCoup?: boolean;
  },
): CompetenceEvalContext => {
  const def = compileFitlDef();
  const baseState = createPlaybookBaseState(def);
  const lookaheadZoneId = def.turnOrder?.type === 'cardDriven'
    ? def.turnOrder.config.turnFlow.cardLifecycle.lookahead
    : null;
  const stateBefore = engineerScenarioState(baseState, {
    ...(options?.globalVarsBefore === undefined ? {} : { globalVars: options.globalVarsBefore }),
    ...(options?.zoneVarsBefore === undefined ? {} : { zoneVars: options.zoneVarsBefore }),
    ...(options?.markersBefore === undefined ? {} : { markers: options.markersBefore }),
    ...(options?.zonesBefore === undefined ? {} : { zones: options.zonesBefore }),
    ...(lookaheadZoneId === null || options?.lookaheadIsCoup === undefined
      ? {}
      : {
        zones: {
          [lookaheadZoneId]: [cloneLookaheadWithCoupFlag(options.lookaheadIsCoup)],
        },
      }),
  });
  const stateAfter = (
    options?.globalVarsAfter === undefined
    && options?.zoneVarsAfter === undefined
    && options?.markersAfter === undefined
    && options?.zonesAfter === undefined
  )
    ? stateBefore
    : engineerScenarioState(stateBefore, {
      ...(options?.globalVarsAfter === undefined ? {} : { globalVars: options.globalVarsAfter }),
      ...(options?.zoneVarsAfter === undefined ? {} : { zoneVars: options.zoneVarsAfter }),
      ...(options?.markersAfter === undefined ? {} : { markers: options.markersAfter }),
      ...(options?.zonesAfter === undefined ? {} : { zones: options.zonesAfter }),
    });
  const move: Move = {
    actionId: asActionId(actionId),
    params: { ...(options?.params ?? {}) },
    ...(options?.actionClass === undefined ? {} : { actionClass: options.actionClass }),
    ...(options?.freeOperation === undefined ? {} : { freeOperation: options.freeOperation }),
    ...(options?.compound === undefined ? {} : { compound: options.compound }),
  };
  return {
    def,
    stateBefore,
    move,
    stateAfter,
    playerId: options?.playerId ?? VC_PLAYER,
    diagnostics: diagnosticsStub,
    budget: options?.budget ?? 'interactive',
  };
};

describe('categoryCompetence', () => {
  it('passes when actionId is in the acceptable set', () => {
    const evaluator = categoryCompetence(['rally', 'terror']);

    const result = evaluator.evaluate(createContext('rally'));

    assert.equal(result.evaluatorName, 'categoryCompetence');
    assert.equal(result.passed, true);
    assert.match(result.explanation, /acceptable/u);
  });

  it('fails when actionId is not in the acceptable set', () => {
    const evaluator = categoryCompetence(['rally', 'terror']);

    const result = evaluator.evaluate(createContext('pass'));

    assert.equal(result.evaluatorName, 'categoryCompetence');
    assert.equal(result.passed, false);
    assert.match(result.explanation, /expected actionId in \[rally, terror\]/u);
    assert.match(result.explanation, /got 'pass'/u);
  });

  it('exposes stable evaluator metadata', () => {
    const evaluator = categoryCompetence(['rally']);

    assert.equal(evaluator.name, 'categoryCompetence');
    assert.equal(evaluator.minBudget, 'interactive');
  });
});

describe('resourceDiscipline', () => {
  it('passes when a zero-resource faction chooses pass', () => {
    const evaluator = resourceDiscipline();

    const result = evaluator.evaluate(createContext('pass', {
      globalVarsBefore: { vcResources: 0 },
      playerId: VC_PLAYER,
      budget: 'turn',
    }));

    assert.equal(result.passed, true);
    assert.match(result.explanation, /gains 1 vcResources/u);
  });

  it('fails when a zero-resource faction chooses a paid action class', () => {
    const evaluator = resourceDiscipline();

    const result = evaluator.evaluate(createContext('rally', {
      globalVarsBefore: { vcResources: 0 },
      playerId: VC_PLAYER,
      actionClass: 'operation',
      budget: 'turn',
    }));

    assert.equal(result.passed, false);
    assert.match(result.explanation, /paid actionClass 'operation'/u);
  });

  it('skips free operations at zero resources', () => {
    const evaluator = resourceDiscipline();

    const result = evaluator.evaluate(createContext('rally', {
      globalVarsBefore: { vcResources: 0 },
      playerId: VC_PLAYER,
      actionClass: 'operation',
      freeOperation: true,
      budget: 'turn',
    }));

    assert.equal(result.passed, true);
    assert.match(result.explanation, /freeOperation move/u);
  });

  it('skips when resources are above zero', () => {
    const evaluator = resourceDiscipline();

    const result = evaluator.evaluate(createContext('rally', {
      globalVarsBefore: { arvnResources: 5 },
      playerId: ARVN_PLAYER,
      actionClass: 'operation',
      budget: 'turn',
    }));

    assert.equal(result.passed, true);
    assert.match(result.explanation, /resources=5 > 0/u);
  });
});

describe('monsoonAwareness', () => {
  it('fails when the move action is monsoon-restricted by turn-flow config', () => {
    const evaluator = monsoonAwareness();

    const result = evaluator.evaluate(createContext('march', {
      lookaheadIsCoup: true,
      budget: 'background',
    }));

    assert.equal(result.passed, false);
    assert.match(result.explanation, /restricted during monsoon/u);
  });

  it('passes when the move action is not monsoon-restricted', () => {
    const evaluator = monsoonAwareness();

    const result = evaluator.evaluate(createContext('rally', {
      lookaheadIsCoup: true,
      budget: 'background',
    }));

    assert.equal(result.passed, true);
    assert.match(result.explanation, /allowed during monsoon/u);
  });

  it('skips when the lookahead card is not a Coup card', () => {
    const evaluator = monsoonAwareness();

    const result = evaluator.evaluate(createContext('march', {
      lookaheadIsCoup: false,
      budget: 'background',
    }));

    assert.equal(result.passed, true);
    assert.match(result.explanation, /not a Coup card/u);
  });
});

describe('passStrategicValue', () => {
  it('passes when pass is justified by low resources', () => {
    const evaluator = passStrategicValue({
      minAdequateResources: 2,
      isUpcomingCardStrong: () => true,
    });

    const result = evaluator.evaluate(createContext('pass', {
      globalVarsBefore: { vcResources: 0 },
      playerId: VC_PLAYER,
      budget: 'background',
    }));

    assert.equal(result.passed, true);
    assert.match(result.explanation, /resources=0/u);
    assert.match(result.explanation, /upcomingStrong=true/u);
  });

  it('passes when the upcoming card is weak even with adequate resources', () => {
    const evaluator = passStrategicValue({
      minAdequateResources: 2,
      isUpcomingCardStrong: () => false,
    });

    const result = evaluator.evaluate(createContext('pass', {
      globalVarsBefore: { vcResources: 3 },
      playerId: VC_PLAYER,
      budget: 'background',
    }));

    assert.equal(result.passed, true);
    assert.match(result.explanation, /resources=3/u);
    assert.match(result.explanation, /upcomingStrong=false/u);
  });

  it('fails when pass wastes a strong upcoming card with adequate resources', () => {
    const evaluator = passStrategicValue({
      minAdequateResources: 2,
      isUpcomingCardStrong: () => true,
    });

    const result = evaluator.evaluate(createContext('pass', {
      globalVarsBefore: { vcResources: 3 },
      playerId: VC_PLAYER,
      budget: 'background',
    }));

    assert.equal(result.passed, false);
    assert.match(result.explanation, /wasted initiative/u);
  });

  it('skips when the move is not pass', () => {
    const evaluator = passStrategicValue({
      minAdequateResources: 2,
      isUpcomingCardStrong: () => true,
    });

    const result = evaluator.evaluate(createContext('rally', {
      globalVarsBefore: { vcResources: 3 },
      playerId: VC_PLAYER,
      budget: 'background',
    }));

    assert.equal(result.passed, true);
    assert.equal(result.explanation, 'Skipped — move is not pass');
  });
});

describe('victoryProgress', () => {
  const computeVictory = (_def: GameDef, state: GameState): number =>
    typeof state.globalVars.testVictory === 'number' ? state.globalVars.testVictory : 0;

  it('passes when the move improves distance to the threshold', () => {
    const evaluator = victoryProgress(computeVictory, 35, 2);

    const result = evaluator.evaluate(createContext('rally', {
      globalVarsBefore: { testVictory: 30 },
      globalVarsAfter: { testVictory: 33 },
      budget: 'turn',
    }));

    assert.equal(result.passed, true);
    assert.equal(result.score, 3);
    assert.match(result.explanation, /before=30/u);
    assert.match(result.explanation, /after=33/u);
  });

  it('passes when the score is unchanged within tolerance', () => {
    const evaluator = victoryProgress(computeVictory, 35, 2);

    const result = evaluator.evaluate(createContext('rally', {
      globalVarsBefore: { testVictory: 30 },
      globalVarsAfter: { testVictory: 30 },
      budget: 'turn',
    }));

    assert.equal(result.passed, true);
    assert.equal(result.score, 0);
  });

  it('fails when regression exceeds tolerance', () => {
    const evaluator = victoryProgress(computeVictory, 35, 2);

    const result = evaluator.evaluate(createContext('rally', {
      globalVarsBefore: { testVictory: 30 },
      globalVarsAfter: { testVictory: 27 },
      budget: 'turn',
    }));

    assert.equal(result.passed, false);
    assert.equal(result.score, -3);
    assert.match(result.explanation, /Failed/u);
  });

  it('treats threshold crossing as continued progress', () => {
    const evaluator = victoryProgress(computeVictory, 35, 0);

    const result = evaluator.evaluate(createContext('rally', {
      globalVarsBefore: { testVictory: 34 },
      globalVarsAfter: { testVictory: 36 },
      budget: 'turn',
    }));

    assert.equal(result.passed, true);
    assert.equal(result.score, 2);
    assert.match(result.explanation, /dist=1/u);
    assert.match(result.explanation, /dist=-1/u);
  });
});

describe('victoryDefense', () => {
  const computeOwnVictory = (_def: GameDef, state: GameState): number =>
    typeof state.globalVars.ownVictory === 'number' ? state.globalVars.ownVictory : 0;
  const computeOpponentVictory = (
    _def: GameDef,
    state: GameState,
  ): number => (typeof state.globalVars.opponentVictory === 'number' ? state.globalVars.opponentVictory : 0);

  it('passes when the faction keeps its relative lead', () => {
    const evaluator = victoryDefense(computeOwnVictory, computeOpponentVictory, 35, 18, 0);

    const result = evaluator.evaluate(createContext('assault', {
      globalVarsBefore: { ownVictory: 30, opponentVictory: 10 },
      globalVarsAfter: { ownVictory: 32, opponentVictory: 11 },
      budget: 'turn',
    }));

    assert.equal(result.passed, true);
    assert.equal(result.score, 1);
    assert.match(result.explanation, /lead 3->4/u);
  });

  it('fails when the faction loses its relative lead beyond tolerance', () => {
    const evaluator = victoryDefense(computeOwnVictory, computeOpponentVictory, 35, 18, 1);

    const result = evaluator.evaluate(createContext('assault', {
      globalVarsBefore: { ownVictory: 30, opponentVictory: 10 },
      globalVarsAfter: { ownVictory: 28, opponentVictory: 13 },
      budget: 'turn',
    }));

    assert.equal(result.passed, false);
    assert.equal(result.score, -5);
    assert.match(result.explanation, /lead 3->-2/u);
  });

  it('passes when the lead shrinks within tolerance', () => {
    const evaluator = victoryDefense(computeOwnVictory, computeOpponentVictory, 35, 18, 2);

    const result = evaluator.evaluate(createContext('assault', {
      globalVarsBefore: { ownVictory: 30, opponentVictory: 10 },
      globalVarsAfter: { ownVictory: 30, opponentVictory: 11 },
      budget: 'turn',
    }));

    assert.equal(result.passed, true);
    assert.equal(result.score, -1);
    assert.match(result.explanation, /tolerance=2/u);
  });

  it('exposes stable evaluator metadata', () => {
    const evaluator = victoryDefense(computeOwnVictory, computeOpponentVictory, 35, 18, 0);

    assert.equal(evaluator.name, 'victoryDefense');
    assert.equal(evaluator.minBudget, 'turn');
    const progress = victoryProgress(computeOwnVictory, 35, 0);
    assert.equal(progress.name, 'victoryProgress');
    assert.equal(progress.minBudget, 'turn');
  });
});

describe('VC strategic evaluators', () => {
  it('vcRallyQuality passes when rally improves an existing-base space', () => {
    const evaluator = vcRallyQuality();

    const result = evaluator.evaluate(createContext('rally', {
      budget: 'background',
      params: { $targetSpaces: ['quang-tri-thua-thien:none'] },
      zonesBefore: {
        'quang-tri-thua-thien:none': [
          makeToken('vc-base-home', 'base', 'VC', { tunnel: 'untunneled' }),
          makeToken('vc-g-home-1', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
        'tay-ninh:none': [
          makeToken('vc-g-away-1', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
      },
      zonesAfter: {
        'quang-tri-thua-thien:none': [
          makeToken('vc-base-home', 'base', 'VC', { tunnel: 'untunneled' }),
          makeToken('vc-g-home-1', 'guerrilla', 'VC', { activity: 'underground' }),
          makeToken('vc-g-home-2', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
        'tay-ninh:none': [
          makeToken('vc-g-away-1', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
      },
    }));

    assert.equal(result.passed, true);
    assert.match(result.explanation, /with-base space/u);
  });

  it('vcRallyQuality fails when rally ignores a stronger existing-base space', () => {
    const evaluator = vcRallyQuality();

    const result = evaluator.evaluate(createContext('rally', {
      budget: 'background',
      params: { $targetSpaces: ['tay-ninh:none'] },
      zonesBefore: {
        'quang-tri-thua-thien:none': [
          makeToken('vc-base-home', 'base', 'VC', { tunnel: 'untunneled' }),
          makeToken('vc-g-home-1', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
        'tay-ninh:none': [
          makeToken('vc-g-away-1', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
      },
      zonesAfter: {
        'quang-tri-thua-thien:none': [
          makeToken('vc-base-home', 'base', 'VC', { tunnel: 'untunneled' }),
          makeToken('vc-g-home-1', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
        'tay-ninh:none': [
          makeToken('vc-g-away-1', 'guerrilla', 'VC', { activity: 'underground' }),
          makeToken('vc-g-away-2', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
      },
    }));

    assert.equal(result.passed, false);
    assert.match(result.explanation, /did not improve any with-base VC space/u);
  });

  it('vcRallyQuality skips non-rally moves', () => {
    const evaluator = vcRallyQuality();

    const result = evaluator.evaluate(createContext('terror', { budget: 'background' }));

    assert.equal(result.passed, true);
    assert.equal(result.explanation, 'Skipped — move is not rally');
  });

  it('vcRallyQuality reads semantic piece type from runtime-shaped FITL tokens', () => {
    const evaluator = vcRallyQuality();

    const result = evaluator.evaluate(createContext('rally', {
      budget: 'background',
      params: { $targetSpaces: ['quang-tri-thua-thien:none'] },
      zonesBefore: {
        'quang-tri-thua-thien:none': [
          makeRuntimeToken('vc-base-home-rt', 'vc-bases', 'base', 'VC', { tunnel: 'untunneled' }),
          makeRuntimeToken('vc-g-home-rt-1', 'vc-guerrillas', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
      },
      zonesAfter: {
        'quang-tri-thua-thien:none': [
          makeRuntimeToken('vc-base-home-rt', 'vc-bases', 'base', 'VC', { tunnel: 'untunneled' }),
          makeRuntimeToken('vc-g-home-rt-1', 'vc-guerrillas', 'guerrilla', 'VC', { activity: 'underground' }),
          makeRuntimeToken('vc-g-home-rt-2', 'vc-guerrillas', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
      },
    }));

    assert.equal(result.passed, true);
    assert.match(result.explanation, /with-base space/u);
  });

  it('vcTerrorTarget passes for a high-population support target', () => {
    const evaluator = vcTerrorTarget();

    const result = evaluator.evaluate(createContext('terror', {
      budget: 'background',
      params: { $targetSpaces: ['saigon:none'] },
      markersBefore: {
        'saigon:none': { supportOpposition: 'activeSupport' },
        'phuoc-long:none': { supportOpposition: 'neutral' },
      },
      zoneVarsAfter: {
        'saigon:none': { terrorCount: 1 },
      },
      markersAfter: {
        'saigon:none': { supportOpposition: 'passiveSupport' },
        'phuoc-long:none': { supportOpposition: 'neutral' },
      },
    }));

    assert.equal(result.passed, true);
    assert.match(result.explanation, /top-value populated support space/u);
  });

  it('vcTerrorTarget fails for a low-value target when a better support target exists', () => {
    const evaluator = vcTerrorTarget();

    const result = evaluator.evaluate(createContext('terror', {
      budget: 'background',
      params: { $targetSpaces: ['phuoc-long:none'] },
      markersBefore: {
        'hue:none': { supportOpposition: 'activeSupport' },
        'phuoc-long:none': { supportOpposition: 'neutral' },
      },
      zoneVarsAfter: {
        'phuoc-long:none': { terrorCount: 1 },
      },
      markersAfter: {
        'hue:none': { supportOpposition: 'activeSupport' },
        'phuoc-long:none': { supportOpposition: 'neutral' },
      },
    }));

    assert.equal(result.passed, false);
    assert.match(result.explanation, /better space scored/u);
  });

  it('vcBaseExpansion passes when rally converts a 2-guerrilla space into a base', () => {
    const evaluator = vcBaseExpansion();

    const result = evaluator.evaluate(createContext('rally', {
      budget: 'background',
      params: { $targetSpaces: ['tay-ninh:none'] },
      zonesBefore: {
        'tay-ninh:none': [
          makeToken('vc-g-expand-1', 'guerrilla', 'VC', { activity: 'underground' }),
          makeToken('vc-g-expand-2', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
      },
      zonesAfter: {
        'tay-ninh:none': [
          makeToken('vc-base-expand', 'base', 'VC', { tunnel: 'untunneled' }),
        ],
      },
    }));

    assert.equal(result.passed, true);
    assert.match(result.explanation, /expanded a VC base/u);
  });

  it('vcBaseExpansion fails when rally misses an authored base-expansion opportunity', () => {
    const evaluator = vcBaseExpansion();

    const result = evaluator.evaluate(createContext('rally', {
      budget: 'background',
      params: { $targetSpaces: ['tay-ninh:none'] },
      zonesBefore: {
        'tay-ninh:none': [
          makeToken('vc-g-expand-1', 'guerrilla', 'VC', { activity: 'underground' }),
          makeToken('vc-g-expand-2', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
      },
      zonesAfter: {
        'tay-ninh:none': [
          makeToken('vc-g-expand-1', 'guerrilla', 'VC', { activity: 'underground' }),
          makeToken('vc-g-expand-2', 'guerrilla', 'VC', { activity: 'underground' }),
          makeToken('vc-g-expand-3', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
      },
    }));

    assert.equal(result.passed, false);
    assert.match(result.explanation, /ignored eligible VC base expansion/u);
  });

  it('vcOppositionGrowth passes when the VC victory marker improves', () => {
    const evaluator = vcOppositionGrowth();

    const result = evaluator.evaluate(createContext('terror', {
      budget: 'background',
      zonesBefore: {
        'tay-ninh:none': [
          makeToken('vc-base-opp', 'base', 'VC', { tunnel: 'untunneled' }),
        ],
      },
      zonesAfter: {
        'tay-ninh:none': [
          makeToken('vc-base-opp', 'base', 'VC', { tunnel: 'untunneled' }),
        ],
      },
      markersBefore: {
        'quang-nam:none': { supportOpposition: 'passiveOpposition' },
      },
      markersAfter: {
        'quang-nam:none': { supportOpposition: 'activeOpposition' },
      },
    }));

    assert.equal(result.passed, true);
    assert.equal(result.score, 1);
  });

  it('vcOppositionGrowth fails when the VC victory marker regresses', () => {
    const evaluator = vcOppositionGrowth();

    const result = evaluator.evaluate(createContext('terror', {
      budget: 'background',
      zonesBefore: {
        'tay-ninh:none': [
          makeToken('vc-base-opp', 'base', 'VC', { tunnel: 'untunneled' }),
        ],
      },
      zonesAfter: {
        'tay-ninh:none': [
          makeToken('vc-base-opp', 'base', 'VC', { tunnel: 'untunneled' }),
        ],
      },
      markersBefore: {
        'quang-nam:none': { supportOpposition: 'activeOpposition' },
      },
      markersAfter: {
        'quang-nam:none': { supportOpposition: 'passiveOpposition' },
      },
    }));

    assert.equal(result.passed, false);
    assert.equal(result.score, -1);
  });

  it('vcResourceManagement passes when resource-starved VC chooses Tax', () => {
    const evaluator = vcResourceManagement();

    const result = evaluator.evaluate(createContext('tax', {
      budget: 'background',
      globalVarsBefore: { vcResources: 1 },
      globalVarsAfter: { vcResources: 3 },
      params: { $targetSpaces: ['loc-hue-khe-sanh:none'] },
      zonesBefore: {
        'loc-hue-khe-sanh:none': [
          makeToken('vc-tax-low-resource', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
      },
      zonesAfter: {
        'loc-hue-khe-sanh:none': [
          makeToken('vc-tax-low-resource', 'guerrilla', 'VC', { activity: 'active' }),
        ],
      },
    }));

    assert.equal(result.passed, true);
    assert.match(result.explanation, /resource-starved/u);
  });

  it('vcResourceManagement fails when resource-starved VC ignores a tax line', () => {
    const evaluator = vcResourceManagement();

    const result = evaluator.evaluate(createContext('rally', {
      budget: 'background',
      globalVarsBefore: { vcResources: 1 },
      params: { $targetSpaces: ['tay-ninh:none'] },
      zonesBefore: {
        'loc-hue-khe-sanh:none': [
          makeToken('vc-tax-low-resource', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
        'tay-ninh:none': [
          makeToken('vc-rally-low-resource', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
      },
      zonesAfter: {
        'loc-hue-khe-sanh:none': [
          makeToken('vc-tax-low-resource', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
        'tay-ninh:none': [
          makeToken('vc-rally-low-resource', 'guerrilla', 'VC', { activity: 'underground' }),
          makeToken('vc-rally-low-resource-2', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
      },
    }));

    assert.equal(result.passed, false);
    assert.match(result.explanation, /ignored an available tax line/u);
  });

  it('vcSubvertTargeting passes when Subvert removes two ARVN cubes from the strongest target', () => {
    const evaluator = vcSubvertTargeting();

    const result = evaluator.evaluate(createContext('subvert', {
      budget: 'background',
      params: { $targetSpaces: ['tay-ninh:none'] },
      zonesBefore: {
        'tay-ninh:none': [
          makeToken('vc-subvert-g', 'guerrilla', 'VC', { activity: 'underground' }),
          makeToken('arvn-subvert-1', 'troops', 'ARVN'),
          makeToken('arvn-subvert-2', 'troops', 'ARVN'),
        ],
      },
      zonesAfter: {
        'tay-ninh:none': [
          makeToken('vc-subvert-g', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
      },
    }));

    assert.equal(result.passed, true);
    assert.match(result.explanation, /top-value legal target/u);
  });

  it('vcSubvertTargeting fails when Subvert chooses a weaker replace target over a remove-two target', () => {
    const evaluator = vcSubvertTargeting();

    const result = evaluator.evaluate(createContext('subvert', {
      budget: 'background',
      params: { $targetSpaces: ['quang-nam:none'] },
      zonesBefore: {
        'tay-ninh:none': [
          makeToken('vc-subvert-best', 'guerrilla', 'VC', { activity: 'underground' }),
          makeToken('arvn-best-1', 'troops', 'ARVN'),
          makeToken('arvn-best-2', 'troops', 'ARVN'),
        ],
        'quang-nam:none': [
          makeToken('vc-subvert-replace', 'guerrilla', 'VC', { activity: 'underground' }),
          makeToken('arvn-replace-1', 'police', 'ARVN'),
        ],
        'available-VC:none': [
          makeToken('vc-avail-subvert', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
      },
      zonesAfter: {
        'tay-ninh:none': [
          makeToken('vc-subvert-best', 'guerrilla', 'VC', { activity: 'underground' }),
          makeToken('arvn-best-1', 'troops', 'ARVN'),
          makeToken('arvn-best-2', 'troops', 'ARVN'),
        ],
        'quang-nam:none': [
          makeToken('vc-subvert-replace', 'guerrilla', 'VC', { activity: 'underground' }),
          makeToken('vc-subvert-replace-new', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
        'available-VC:none': [],
      },
    }));

    assert.equal(result.passed, false);
    assert.match(result.explanation, /best available/u);
  });

  it('vcSubvertTargeting fails when Subvert activates VC guerrillas', () => {
    const evaluator = vcSubvertTargeting();

    const result = evaluator.evaluate(createContext('subvert', {
      budget: 'background',
      params: { $targetSpaces: ['quang-nam:none'] },
      zonesBefore: {
        'quang-nam:none': [
          makeToken('vc-subvert-replace', 'guerrilla', 'VC', { activity: 'underground' }),
          makeToken('arvn-replace-1', 'police', 'ARVN'),
        ],
        'available-VC:none': [
          makeToken('vc-avail-subvert', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
      },
      zonesAfter: {
        'quang-nam:none': [
          makeToken('vc-subvert-replace', 'guerrilla', 'VC', { activity: 'active' }),
          makeToken('vc-subvert-replace-new', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
        'available-VC:none': [],
      },
    }));

    assert.equal(result.passed, false);
    assert.match(result.explanation, /activated 1 VC guerrilla/u);
  });

  it('vcTaxEfficiency passes when Tax selects the best authored-payoff target', () => {
    const evaluator = vcTaxEfficiency();

    const result = evaluator.evaluate(createContext('tax', {
      budget: 'background',
      params: { $targetSpaces: ['quang-tri-thua-thien:none'] },
      zonesBefore: {
        'quang-tri-thua-thien:none': [
          makeToken('vc-tax-best', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
        'phuoc-long:none': [
          makeToken('vc-tax-pop0', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
      },
      zonesAfter: {
        'quang-tri-thua-thien:none': [
          makeToken('vc-tax-best', 'guerrilla', 'VC', { activity: 'active' }),
        ],
        'phuoc-long:none': [
          makeToken('vc-tax-pop0', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
      },
    }));

    assert.equal(result.passed, true);
    assert.match(result.explanation, /top-value authored payoff target/u);
  });

  it('vcTaxEfficiency fails when Tax skips a better LoC for a population-0 province', () => {
    const evaluator = vcTaxEfficiency();

    const result = evaluator.evaluate(createContext('tax', {
      budget: 'background',
      params: { $targetSpaces: ['phuoc-long:none'] },
      zonesBefore: {
        'loc-saigon-can-tho:none': [
          makeToken('vc-tax-loc', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
        'phuoc-long:none': [
          makeToken('vc-tax-pop0', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
      },
      zonesAfter: {
        'loc-saigon-can-tho:none': [
          makeToken('vc-tax-loc', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
        'phuoc-long:none': [
          makeToken('vc-tax-pop0', 'guerrilla', 'VC', { activity: 'active' }),
        ],
      },
    }));

    assert.equal(result.passed, false);
    assert.match(result.explanation, /better tax line scored/u);
  });

  it('vcTaxEfficiency treats a populated province as more valuable than a population-0 province', () => {
    const evaluator = vcTaxEfficiency();

    const result = evaluator.evaluate(createContext('tax', {
      budget: 'background',
      params: { $targetSpaces: ['phuoc-long:none'] },
      zonesBefore: {
        'quang-nam:none': [
          makeToken('vc-tax-populated', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
        'phuoc-long:none': [
          makeToken('vc-tax-pop0', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
      },
      zonesAfter: {
        'quang-nam:none': [
          makeToken('vc-tax-populated', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
        'phuoc-long:none': [
          makeToken('vc-tax-pop0', 'guerrilla', 'VC', { activity: 'active' }),
        ],
      },
      markersBefore: {
        'quang-nam:none': { supportOpposition: 'neutral' },
        'phuoc-long:none': { supportOpposition: 'neutral' },
      },
      markersAfter: {
        'quang-nam:none': { supportOpposition: 'neutral' },
        'phuoc-long:none': { supportOpposition: 'neutral' },
      },
    }));

    assert.equal(result.passed, false);
    assert.match(result.explanation, /better tax line scored/u);
  });
});

describe('NVA strategic evaluators', () => {
  it('nvaAttackConditions passes when attack gains NVA control in the target space', () => {
    const evaluator = nvaAttackConditions();

    const result = evaluator.evaluate(createContext('attack', {
      budget: 'background',
      playerId: NVA_PLAYER,
      params: { $targetSpaces: ['quang-nam:none'] },
      zonesBefore: {
        'quang-nam:none': [
          makeToken('nva-attack-1', 'troops', 'NVA'),
          makeToken('nva-attack-2', 'troops', 'NVA'),
          makeToken('arvn-def-1', 'troops', 'ARVN'),
          makeToken('arvn-def-2', 'troops', 'ARVN'),
          makeToken('arvn-def-3', 'troops', 'ARVN'),
        ],
      },
      zonesAfter: {
        'quang-nam:none': [
          makeToken('nva-attack-1', 'troops', 'NVA'),
          makeToken('nva-attack-2', 'troops', 'NVA'),
          makeToken('arvn-def-1', 'troops', 'ARVN'),
        ],
      },
    }));

    assert.equal(result.passed, true);
    assert.match(result.explanation, /worthwhile outcome/u);
  });

  it('nvaAttackConditions passes when attack removes an enemy base', () => {
    const evaluator = nvaAttackConditions();

    const result = evaluator.evaluate(createContext('attack', {
      budget: 'background',
      playerId: NVA_PLAYER,
      params: { $targetSpaces: ['tay-ninh:none'] },
      zonesBefore: {
        'tay-ninh:none': [
          makeToken('nva-base-hunt-1', 'troops', 'NVA'),
          makeToken('nva-base-hunt-2', 'troops', 'NVA'),
          makeToken('arvn-base-target', 'base', 'ARVN'),
        ],
      },
      zonesAfter: {
        'tay-ninh:none': [
          makeToken('nva-base-hunt-1', 'troops', 'NVA'),
          makeToken('nva-base-hunt-2', 'troops', 'NVA'),
        ],
      },
    }));

    assert.equal(result.passed, true);
  });

  it('nvaAttackConditions fails when attack produces no strategic payoff', () => {
    const evaluator = nvaAttackConditions();

    const result = evaluator.evaluate(createContext('attack', {
      budget: 'background',
      playerId: NVA_PLAYER,
      params: { $targetSpaces: ['quang-tri-thua-thien:none'] },
      zonesBefore: {
        'quang-tri-thua-thien:none': [
          makeToken('nva-no-payoff-1', 'troops', 'NVA'),
          makeToken('nva-no-payoff-2', 'troops', 'NVA'),
          makeToken('arvn-no-payoff', 'troops', 'ARVN'),
        ],
      },
      zonesAfter: {
        'quang-tri-thua-thien:none': [
          makeToken('nva-no-payoff-1', 'troops', 'NVA'),
          makeToken('nva-no-payoff-2', 'troops', 'NVA'),
          makeToken('arvn-no-payoff', 'troops', 'ARVN'),
        ],
      },
    }));

    assert.equal(result.passed, false);
    assert.match(result.explanation, /gained no control/u);
  });

  it('nvaAttackConditions skips non-attack moves', () => {
    const evaluator = nvaAttackConditions();

    const result = evaluator.evaluate(createContext('rally', {
      budget: 'background',
      playerId: NVA_PLAYER,
    }));

    assert.equal(result.passed, true);
    assert.equal(result.explanation, 'Skipped — move is not attack');
  });

  it('nvaMarchSouthward passes when troops move toward populated South Vietnam', () => {
    const evaluator = nvaMarchSouthward();

    const result = evaluator.evaluate(createContext('march', {
      budget: 'background',
      playerId: NVA_PLAYER,
      params: { $targetSpaces: ['saigon:none'] },
      zonesBefore: {
        'saigon:none': [],
        'north-vietnam:none': [
          makeToken('nva-south-1', 'troops', 'NVA'),
          makeToken('nva-south-2', 'troops', 'NVA'),
        ],
      },
      zonesAfter: {
        'north-vietnam:none': [],
        'saigon:none': [
          makeToken('nva-south-1', 'troops', 'NVA'),
          makeToken('nva-south-2', 'troops', 'NVA'),
        ],
      },
    }));

    assert.equal(result.passed, true);
    assert.equal(result.score! > 0, true);
  });

  it('nvaMarchSouthward fails when troops move away from populated South Vietnam', () => {
    const evaluator = nvaMarchSouthward();

    const result = evaluator.evaluate(createContext('march', {
      budget: 'background',
      playerId: NVA_PLAYER,
      params: { $targetSpaces: ['north-vietnam:none'] },
      zonesBefore: {
        'north-vietnam:none': [],
        'saigon:none': [
          makeToken('nva-away-1', 'troops', 'NVA'),
          makeToken('nva-away-2', 'troops', 'NVA'),
        ],
      },
      zonesAfter: {
        'saigon:none': [],
        'north-vietnam:none': [
          makeToken('nva-away-1', 'troops', 'NVA'),
          makeToken('nva-away-2', 'troops', 'NVA'),
        ],
      },
    }));

    assert.equal(result.passed, false);
    assert.equal(result.score! < 0, true);
  });

  it('nvaRallyTrailImprove passes when rally improves trail under strategic pressure', () => {
    const evaluator = nvaRallyTrailImprove();

    const result = evaluator.evaluate(createContext('rally', {
      budget: 'background',
      playerId: NVA_PLAYER,
      globalVarsBefore: { trail: 2, nvaResources: 4 },
      globalVarsAfter: { trail: 3, nvaResources: 2 },
    }));

    assert.equal(result.passed, true);
    assert.equal(result.score, 1);
  });

  it('nvaRallyTrailImprove fails when rally omits trail improvement that was legal and warranted', () => {
    const evaluator = nvaRallyTrailImprove();

    const result = evaluator.evaluate(createContext('rally', {
      budget: 'background',
      playerId: NVA_PLAYER,
      globalVarsBefore: { trail: 2, nvaResources: 4 },
      globalVarsAfter: { trail: 2, nvaResources: 4 },
    }));

    assert.equal(result.passed, false);
    assert.match(result.explanation, /skipped trail improvement/u);
  });

  it('nvaRallyTrailImprove skips when trail improvement is strategically desirable but illegal', () => {
    const evaluator = nvaRallyTrailImprove();

    const result = evaluator.evaluate(createContext('rally', {
      budget: 'background',
      playerId: NVA_PLAYER,
      globalVarsBefore: { trail: 2, nvaResources: 1 },
      globalVarsAfter: { trail: 2, nvaResources: 1 },
    }));

    assert.equal(result.passed, true);
    assert.match(result.explanation, /not legal/u);
  });

  it('nvaControlGrowth passes when NVA victory improves', () => {
    const evaluator = nvaControlGrowth();

    const result = evaluator.evaluate(createContext('rally', {
      budget: 'background',
      playerId: NVA_PLAYER,
      zonesBefore: {
        'tay-ninh:none': [],
      },
      zonesAfter: {
        'tay-ninh:none': [
          makeToken('nva-control-base', 'base', 'NVA', { tunnel: 'untunneled' }),
        ],
      },
    }));

    assert.equal(result.passed, true);
    assert.equal(result.score, 2);
  });

  it('nvaControlGrowth fails when NVA victory regresses', () => {
    const evaluator = nvaControlGrowth();

    const result = evaluator.evaluate(createContext('rally', {
      budget: 'background',
      playerId: NVA_PLAYER,
      zonesBefore: {
        'tay-ninh:none': [
          makeToken('nva-control-base', 'base', 'NVA', { tunnel: 'untunneled' }),
        ],
      },
      zonesAfter: {
        'tay-ninh:none': [],
      },
    }));

    assert.equal(result.passed, false);
    assert.equal(result.score, -2);
  });

  it('nvaInfiltrateValue passes when compound infiltrate places a base', () => {
    const evaluator = nvaInfiltrateValue();

    const result = evaluator.evaluate(createContext('march', {
      budget: 'background',
      playerId: NVA_PLAYER,
      actionClass: 'operationPlusSpecialActivity',
      compound: {
        specialActivity: {
          actionId: asActionId('infiltrate'),
          actionClass: 'operationPlusSpecialActivity',
          params: { $targetSpaces: ['kien-giang-an-xuyen:none'] },
        },
        timing: 'after',
      },
      zonesBefore: {
        'kien-giang-an-xuyen:none': [
          makeToken('vc-infiltrate-base-target', 'base', 'VC', { tunnel: 'untunneled' }),
        ],
      },
      zonesAfter: {
        'kien-giang-an-xuyen:none': [
          makeToken('nva-infiltrate-base', 'base', 'NVA', { tunnel: 'untunneled' }),
        ],
      },
    }));

    assert.equal(result.passed, true);
    assert.match(result.explanation, /meaningful value/u);
  });

  it('nvaInfiltrateValue passes when infiltrate creates a major troop buildup', () => {
    const evaluator = nvaInfiltrateValue();

    const result = evaluator.evaluate(createContext('march', {
      budget: 'background',
      playerId: NVA_PLAYER,
      actionClass: 'operationPlusSpecialActivity',
      compound: {
        specialActivity: {
          actionId: asActionId('infiltrate'),
          actionClass: 'operationPlusSpecialActivity',
          params: { $targetSpaces: ['southern-laos:none'] },
        },
        timing: 'after',
      },
      zonesBefore: {
        'southern-laos:none': [],
      },
      zonesAfter: {
        'southern-laos:none': [
          makeToken('nva-build-1', 'troops', 'NVA'),
          makeToken('nva-build-2', 'troops', 'NVA'),
          makeToken('nva-build-3', 'troops', 'NVA'),
          makeToken('nva-build-4', 'troops', 'NVA'),
        ],
      },
    }));

    assert.equal(result.passed, true);
  });

  it('nvaInfiltrateValue fails when infiltrate is strategically trivial', () => {
    const evaluator = nvaInfiltrateValue();

    const result = evaluator.evaluate(createContext('march', {
      budget: 'background',
      playerId: NVA_PLAYER,
      actionClass: 'operationPlusSpecialActivity',
      compound: {
        specialActivity: {
          actionId: asActionId('infiltrate'),
          actionClass: 'operationPlusSpecialActivity',
          params: { $targetSpaces: ['southern-laos:none'] },
        },
        timing: 'after',
      },
      zonesBefore: {
        'southern-laos:none': [],
      },
      zonesAfter: {
        'southern-laos:none': [
          makeToken('nva-trivial-build', 'troops', 'NVA'),
        ],
      },
    }));

    assert.equal(result.passed, false);
    assert.match(result.explanation, /strategically trivial/u);
  });

  it('nvaBombardUsage passes when a compound move includes Bombard for an authored opportunity', () => {
    const evaluator = nvaBombardUsage();

    const result = evaluator.evaluate(createContext('march', {
      budget: 'background',
      playerId: NVA_PLAYER,
      actionClass: 'operationPlusSpecialActivity',
      compound: {
        specialActivity: {
          actionId: asActionId('bombard'),
          actionClass: 'operationPlusSpecialActivity',
          params: { $targetSpaces: ['quang-tri-thua-thien:none'] },
        },
        timing: 'after',
      },
      zonesBefore: {
        'quang-tri-thua-thien:none': [
          makeToken('us-bombard-1', 'troops', 'US'),
          makeToken('us-bombard-2', 'troops', 'US'),
          makeToken('us-bombard-3', 'troops', 'US'),
        ],
        'hue:none': [
          makeToken('nva-bombard-1', 'troops', 'NVA'),
          makeToken('nva-bombard-2', 'troops', 'NVA'),
          makeToken('nva-bombard-3', 'troops', 'NVA'),
        ],
      },
    }));

    assert.equal(result.passed, true);
  });

  it('nvaBombardUsage fails when an authored Bombard opportunity is ignored', () => {
    const evaluator = nvaBombardUsage();

    const result = evaluator.evaluate(createContext('march', {
      budget: 'background',
      playerId: NVA_PLAYER,
      zonesBefore: {
        'quang-tri-thua-thien:none': [
          makeToken('us-bombard-1', 'troops', 'US'),
          makeToken('us-bombard-2', 'troops', 'US'),
          makeToken('us-bombard-3', 'troops', 'US'),
        ],
        'hue:none': [
          makeToken('nva-bombard-1', 'troops', 'NVA'),
          makeToken('nva-bombard-2', 'troops', 'NVA'),
          makeToken('nva-bombard-3', 'troops', 'NVA'),
        ],
      },
    }));

    assert.equal(result.passed, false);
    assert.match(result.explanation, /omitted Bombard/u);
  });

  it('nvaBombardUsage skips when no authored Bombard opportunity exists', () => {
    const evaluator = nvaBombardUsage();

    const result = evaluator.evaluate(createContext('march', {
      budget: 'background',
      playerId: NVA_PLAYER,
      zonesBefore: {
        'quang-tri-thua-thien:none': [
          makeToken('us-too-few-1', 'troops', 'US'),
          makeToken('us-too-few-2', 'troops', 'US'),
        ],
        'hue:none': [
          makeToken('nva-too-few-1', 'troops', 'NVA'),
          makeToken('nva-too-few-2', 'troops', 'NVA'),
        ],
      },
    }));

    assert.equal(result.passed, true);
    assert.match(result.explanation, /no authored Bombard opportunity/u);
  });
});

describe('US strategic evaluators', () => {
  it('usSweepActivation passes when sweep activates underground insurgents', () => {
    const evaluator = usSweepActivation();

    const result = evaluator.evaluate(createContext('sweep', {
      budget: 'background',
      playerId: US_PLAYER,
      params: { $targetSpaces: ['quang-nam:none'] },
      zonesBefore: {
        'quang-nam:none': [
          makeToken('us-sweep-1', 'troops', 'US'),
          makeToken('vc-sweep-1', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
      },
      zonesAfter: {
        'quang-nam:none': [
          makeToken('us-sweep-1', 'troops', 'US'),
          makeToken('vc-sweep-1', 'guerrilla', 'VC', { activity: 'active' }),
        ],
      },
    }));

    assert.equal(result.passed, true);
    assert.match(result.explanation, /activated underground insurgents/u);
  });

  it('usSweepActivation fails when sweep leaves insurgents underground', () => {
    const evaluator = usSweepActivation();

    const result = evaluator.evaluate(createContext('sweep', {
      budget: 'background',
      playerId: US_PLAYER,
      params: { $targetSpaces: ['quang-nam:none'] },
      zonesBefore: {
        'quang-nam:none': [
          makeToken('us-sweep-1', 'troops', 'US'),
          makeToken('vc-sweep-1', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
      },
      zonesAfter: {
        'quang-nam:none': [
          makeToken('us-sweep-1', 'troops', 'US'),
          makeToken('vc-sweep-1', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
      },
    }));

    assert.equal(result.passed, false);
    assert.match(result.explanation, /activated no underground insurgents/u);
  });

  it('usSweepActivation skips non-sweep moves', () => {
    const evaluator = usSweepActivation();

    const result = evaluator.evaluate(createContext('assault', {
      budget: 'background',
      playerId: US_PLAYER,
    }));

    assert.equal(result.passed, true);
    assert.equal(result.explanation, 'Skipped — move is not sweep');
  });

  it('usAssaultRemoval passes when assault removes an enemy base', () => {
    const evaluator = usAssaultRemoval();

    const result = evaluator.evaluate(createContext('assault', {
      budget: 'background',
      playerId: US_PLAYER,
      params: { $targetSpaces: ['tay-ninh:none'] },
      zonesBefore: {
        'tay-ninh:none': [
          makeToken('us-assault-1', 'troops', 'US'),
          makeToken('us-assault-2', 'troops', 'US'),
          makeToken('vc-base-target', 'base', 'VC', { tunnel: 'untunneled' }),
        ],
      },
      zonesAfter: {
        'tay-ninh:none': [
          makeToken('us-assault-1', 'troops', 'US'),
          makeToken('us-assault-2', 'troops', 'US'),
        ],
      },
    }));

    assert.equal(result.passed, true);
    assert.match(result.explanation, /worthwhile outcome/u);
  });

  it('usAssaultRemoval fails when assault produces no meaningful strategic outcome', () => {
    const evaluator = usAssaultRemoval();

    const result = evaluator.evaluate(createContext('assault', {
      budget: 'background',
      playerId: US_PLAYER,
      params: { $targetSpaces: ['tay-ninh:none'] },
      zonesBefore: {
        'tay-ninh:none': [
          makeToken('us-assault-1', 'troops', 'US'),
          makeToken('us-assault-2', 'troops', 'US'),
          makeToken('vc-g-1', 'guerrilla', 'VC', { activity: 'active' }),
          makeToken('vc-g-2', 'guerrilla', 'VC', { activity: 'active' }),
        ],
      },
      zonesAfter: {
        'tay-ninh:none': [
          makeToken('us-assault-1', 'troops', 'US'),
          makeToken('us-assault-2', 'troops', 'US'),
          makeToken('vc-g-2', 'guerrilla', 'VC', { activity: 'active' }),
        ],
      },
    }));

    assert.equal(result.passed, false);
    assert.match(result.explanation, /removed no NVA control, enemy base\/tunnel, or 6\+ enemy pieces/u);
  });

  it('usSupportGrowth passes when the US victory marker improves', () => {
    const evaluator = usSupportGrowth();

    const result = evaluator.evaluate(createContext('train', {
      budget: 'background',
      playerId: US_PLAYER,
      markersBefore: {
        'quang-nam:none': { supportOpposition: 'neutral' },
      },
      markersAfter: {
        'quang-nam:none': { supportOpposition: 'passiveSupport' },
      },
    }));

    assert.equal(result.passed, true);
    assert.equal(result.score, 1);
  });

  it('usSupportGrowth fails when the US victory marker regresses', () => {
    const evaluator = usSupportGrowth();

    const result = evaluator.evaluate(createContext('train', {
      budget: 'background',
      playerId: US_PLAYER,
      markersBefore: {
        'quang-nam:none': { supportOpposition: 'activeSupport' },
      },
      markersAfter: {
        'quang-nam:none': { supportOpposition: 'passiveSupport' },
      },
    }));

    assert.equal(result.passed, false);
    assert.equal(result.score, -1);
  });

  it('usTrailDegradation passes when compound airStrike includes trail degradation', () => {
    const evaluator = usTrailDegradation();

    const result = evaluator.evaluate(createContext('train', {
      budget: 'background',
      playerId: US_PLAYER,
      actionClass: 'operationPlusSpecialActivity',
      globalVarsBefore: { trail: 3, fitl_airStrikeWindowMode: 0 },
      compound: {
        specialActivity: {
          actionId: asActionId('airStrike'),
          actionClass: 'operationPlusSpecialActivity',
          params: {
            $spaces: ['quang-tri-thua-thien:none'],
            $degradeTrail: 'yes',
          },
        },
        timing: 'after',
      },
    }));

    assert.equal(result.passed, true);
    assert.match(result.explanation, /included trail degradation/u);
  });

  it('usTrailDegradation fails when compound airStrike omits trail degradation at high trail', () => {
    const evaluator = usTrailDegradation();

    const result = evaluator.evaluate(createContext('train', {
      budget: 'background',
      playerId: US_PLAYER,
      actionClass: 'operationPlusSpecialActivity',
      globalVarsBefore: { trail: 3, fitl_airStrikeWindowMode: 0 },
      compound: {
        specialActivity: {
          actionId: asActionId('airStrike'),
          actionClass: 'operationPlusSpecialActivity',
          params: {
            $spaces: ['quang-tri-thua-thien:none'],
            $degradeTrail: 'no',
          },
        },
        timing: 'after',
      },
    }));

    assert.equal(result.passed, false);
    assert.match(result.explanation, /omitted trail degradation/u);
  });

  it('usTrailDegradation skips when the move does not include airStrike', () => {
    const evaluator = usTrailDegradation();

    const result = evaluator.evaluate(createContext('sweep', {
      budget: 'background',
      playerId: US_PLAYER,
      globalVarsBefore: { trail: 3, fitl_airStrikeWindowMode: 0 },
    }));

    assert.equal(result.passed, true);
    assert.equal(result.explanation, 'Skipped — move does not include airStrike');
  });

  it('usPacification passes when coupPacifyUS picks the strongest shift space', () => {
    const evaluator = usPacification();

    const result = evaluator.evaluate(createContext('coupPacifyUS', {
      budget: 'background',
      playerId: US_PLAYER,
      params: { targetSpace: 'saigon:none', action: 'shiftSupport' },
      markersBefore: {
        'saigon:none': { supportOpposition: 'activeOpposition' },
        'hue:none': { supportOpposition: 'activeOpposition' },
      },
    }));

    assert.equal(result.passed, true);
    assert.match(result.explanation, /top-value space/u);
  });

  it('usPacification fails when coupPacifyUS chooses a weaker shift target', () => {
    const evaluator = usPacification();

    const result = evaluator.evaluate(createContext('coupPacifyUS', {
      budget: 'background',
      playerId: US_PLAYER,
      params: { targetSpace: 'hue:none', action: 'shiftSupport' },
      markersBefore: {
        'saigon:none': { supportOpposition: 'activeOpposition' },
        'hue:none': { supportOpposition: 'activeOpposition' },
      },
    }));

    assert.equal(result.passed, false);
    assert.match(result.explanation, /better pacification line scored/u);
  });

  it('usForcePreservation passes when voluntary US losses stay within 2 pieces', () => {
    const evaluator = usForcePreservation();

    const result = evaluator.evaluate(createContext('assault', {
      budget: 'background',
      playerId: US_PLAYER,
      actionClass: 'operation',
      zonesAfter: {
        'casualties-US:none': [
          makeToken('us-loss-1', 'troops', 'US'),
          makeToken('us-loss-2', 'troops', 'US'),
        ],
      },
    }));

    assert.equal(result.passed, true);
    assert.equal(result.score, -2);
  });

  it('usForcePreservation fails when voluntary US losses exceed 2 pieces', () => {
    const evaluator = usForcePreservation();

    const result = evaluator.evaluate(createContext('assault', {
      budget: 'background',
      playerId: US_PLAYER,
      actionClass: 'operation',
      zonesAfter: {
        'casualties-US:none': [
          makeToken('us-loss-1', 'troops', 'US'),
          makeToken('us-loss-2', 'troops', 'US'),
          makeToken('us-loss-3', 'troops', 'US'),
        ],
      },
    }));

    assert.equal(result.passed, false);
    assert.equal(result.score, -3);
    assert.match(result.explanation, /lost too many US pieces/u);
  });
});

describe('ARVN strategic evaluators', () => {
  it('arvnTrainCubes passes when train improves the strongest city priority', () => {
    const evaluator = arvnTrainCubes();

    const result = evaluator.evaluate(createContext('train', {
      budget: 'background',
      playerId: ARVN_PLAYER,
      params: { $targetSpaces: ['saigon:none'] },
      zonesBefore: {
        'saigon:none': [],
        'phuoc-long:none': [],
      },
      zonesAfter: {
        'saigon:none': [
          makeToken('arvn-train-city-1', 'troops', 'ARVN'),
          makeToken('arvn-train-city-2', 'police', 'ARVN'),
        ],
        'phuoc-long:none': [],
      },
    }));

    assert.equal(result.passed, true);
    assert.match(result.explanation, /top-priority ARVN space/u);
  });

  it('arvnTrainCubes fails when train improves only a weaker province while a city is available', () => {
    const evaluator = arvnTrainCubes();

    const result = evaluator.evaluate(createContext('train', {
      budget: 'background',
      playerId: ARVN_PLAYER,
      params: { $targetSpaces: ['phuoc-long:none'] },
      zonesBefore: {
        'saigon:none': [],
        'phuoc-long:none': [],
      },
      zonesAfter: {
        'saigon:none': [],
        'phuoc-long:none': [
          makeToken('arvn-train-province-1', 'troops', 'ARVN'),
        ],
      },
    }));

    assert.equal(result.passed, false);
    assert.match(result.explanation, /while 'saigon:none' scored/u);
  });

  it('arvnTrainCubes skips non-train moves', () => {
    const evaluator = arvnTrainCubes();

    const result = evaluator.evaluate(createContext('govern', {
      budget: 'background',
      playerId: ARVN_PLAYER,
    }));

    assert.equal(result.passed, true);
    assert.equal(result.explanation, 'Skipped — move is not train');
  });

  it('arvnTrainCubes reads semantic piece type from runtime-shaped FITL tokens', () => {
    const evaluator = arvnTrainCubes();

    const result = evaluator.evaluate(createContext('train', {
      budget: 'background',
      playerId: ARVN_PLAYER,
      params: { $targetSpaces: ['saigon:none'] },
      zonesBefore: {
        'saigon:none': [],
      },
      zonesAfter: {
        'saigon:none': [
          makeRuntimeToken('arvn-train-city-rt-1', 'arvn-troops', 'troops', 'ARVN'),
          makeRuntimeToken('arvn-train-city-rt-2', 'arvn-police', 'police', 'ARVN'),
        ],
      },
    }));

    assert.equal(result.passed, true);
    assert.match(result.explanation, /top-priority ARVN space/u);
  });

  it('arvnGovern passes when govern increases aid', () => {
    const evaluator = arvnGovern();

    const result = evaluator.evaluate(createContext('govern', {
      budget: 'background',
      playerId: ARVN_PLAYER,
      globalVarsBefore: { aid: 15, patronage: 10 },
      globalVarsAfter: { aid: 18, patronage: 10 },
    }));

    assert.equal(result.passed, true);
    assert.match(result.explanation, /strategic payoff/u);
  });

  it('arvnGovern also evaluates compound govern moves', () => {
    const evaluator = arvnGovern();

    const result = evaluator.evaluate(createContext('train', {
      budget: 'background',
      playerId: ARVN_PLAYER,
      actionClass: 'operationPlusSpecialActivity',
      globalVarsBefore: { aid: 15, patronage: 10 },
      globalVarsAfter: { aid: 15, patronage: 12 },
      compound: {
        specialActivity: {
          actionId: asActionId('govern'),
          actionClass: 'operationPlusSpecialActivity',
          params: { $targetSpaces: ['can-tho:none'] },
        },
        timing: 'after',
      },
    }));

    assert.equal(result.passed, true);
    assert.match(result.explanation, /patronageDelta=2/u);
  });

  it('arvnGovern fails when govern produces no aid or patronage gain', () => {
    const evaluator = arvnGovern();

    const result = evaluator.evaluate(createContext('govern', {
      budget: 'background',
      playerId: ARVN_PLAYER,
      globalVarsBefore: { aid: 15, patronage: 10 },
      globalVarsAfter: { aid: 15, patronage: 10 },
    }));

    assert.equal(result.passed, false);
    assert.match(result.explanation, /no aid or patronage gain/u);
  });

  it('arvnControlMaintain passes when ARVN victory improves', () => {
    const evaluator = arvnControlMaintain();

    const result = evaluator.evaluate(createContext('train', {
      budget: 'background',
      playerId: ARVN_PLAYER,
      globalVarsBefore: { patronage: 10 },
      globalVarsAfter: { patronage: 12 },
    }));

    assert.equal(result.passed, true);
    assert.equal(result.score, 2);
  });

  it('arvnControlMaintain fails when ARVN victory regresses', () => {
    const evaluator = arvnControlMaintain();

    const result = evaluator.evaluate(createContext('train', {
      budget: 'background',
      playerId: ARVN_PLAYER,
      globalVarsBefore: { patronage: 10 },
      globalVarsAfter: { patronage: 8 },
    }));

    assert.equal(result.passed, false);
    assert.equal(result.score, -2);
  });

  it('arvnSweepRaid passes when sweep removes insurgent guerrillas', () => {
    const evaluator = arvnSweepRaid();

    const result = evaluator.evaluate(createContext('sweep', {
      budget: 'background',
      playerId: ARVN_PLAYER,
      params: { $targetSpaces: ['quang-nam:none'] },
      zonesBefore: {
        'quang-nam:none': [
          makeToken('vc-sweep-target-1', 'guerrilla', 'VC', { activity: 'active' }),
          makeToken('vc-sweep-target-2', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
      },
      zonesAfter: {
        'quang-nam:none': [
          makeToken('vc-sweep-target-2', 'guerrilla', 'VC', { activity: 'active' }),
        ],
      },
    }));

    assert.equal(result.passed, true);
    assert.match(result.explanation, /produced payoff/u);
  });

  it('arvnSweepRaid also credits compound raid lines that gain resources', () => {
    const evaluator = arvnSweepRaid();

    const result = evaluator.evaluate(createContext('sweep', {
      budget: 'background',
      playerId: ARVN_PLAYER,
      actionClass: 'operationPlusSpecialActivity',
      globalVarsBefore: { arvnResources: 5 },
      globalVarsAfter: { arvnResources: 7 },
      compound: {
        specialActivity: {
          actionId: asActionId('raid'),
          actionClass: 'operationPlusSpecialActivity',
          params: { $targetSpaces: ['quang-tri-thua-thien:none'] },
        },
        timing: 'after',
      },
    }));

    assert.equal(result.passed, true);
    assert.match(result.explanation, /resourceDelta=2/u);
  });

  it('arvnSweepRaid fails when sweep or raid produces no payoff', () => {
    const evaluator = arvnSweepRaid();

    const result = evaluator.evaluate(createContext('sweep', {
      budget: 'background',
      playerId: ARVN_PLAYER,
      params: { $targetSpaces: ['quang-nam:none'] },
      globalVarsBefore: { arvnResources: 5 },
      globalVarsAfter: { arvnResources: 5 },
      zonesBefore: {
        'quang-nam:none': [
          makeToken('vc-no-payoff-1', 'guerrilla', 'VC', { activity: 'active' }),
        ],
      },
      zonesAfter: {
        'quang-nam:none': [
          makeToken('vc-no-payoff-1', 'guerrilla', 'VC', { activity: 'active' }),
        ],
      },
    }));

    assert.equal(result.passed, false);
    assert.match(result.explanation, /no guerrilla removal or resource gain/u);
  });

  it('arvnLocControl passes when patrol targets a sabotaged LoC', () => {
    const evaluator = arvnLocControl();

    const result = evaluator.evaluate(createContext('patrol', {
      budget: 'background',
      playerId: ARVN_PLAYER,
      globalVarsBefore: { arvnResources: 3 },
      markersBefore: {
        'loc-hue-khe-sanh:none': { sabotage: 'sabotage' },
      },
      params: { $targetLoCs: ['loc-hue-khe-sanh:none'] },
    }));

    assert.equal(result.passed, true);
    assert.match(result.explanation, /targeted sabotaged LoC/u);
  });

  it('arvnLocControl fails when a sabotaged LoC is ignored', () => {
    const evaluator = arvnLocControl();

    const result = evaluator.evaluate(createContext('govern', {
      budget: 'background',
      playerId: ARVN_PLAYER,
      globalVarsBefore: { arvnResources: 3 },
      markersBefore: {
        'loc-hue-khe-sanh:none': { sabotage: 'sabotage' },
      },
    }));

    assert.equal(result.passed, false);
    assert.match(result.explanation, /instead of patrol/u);
  });

  it('arvnAidPreservation passes when govern keeps aid at the Total Econ floor', () => {
    const evaluator = arvnAidPreservation();

    const result = evaluator.evaluate(createContext('govern', {
      budget: 'background',
      playerId: ARVN_PLAYER,
      globalVarsAfter: { aid: 12, totalEcon: 12 },
    }));

    assert.equal(result.passed, true);
    assert.equal(result.score, 0);
  });

  it('arvnAidPreservation fails when govern leaves aid below Total Econ', () => {
    const evaluator = arvnAidPreservation();

    const result = evaluator.evaluate(createContext('govern', {
      budget: 'background',
      playerId: ARVN_PLAYER,
      globalVarsAfter: { aid: 10, totalEcon: 12 },
    }));

    assert.equal(result.passed, false);
    assert.equal(result.score, -2);
    assert.match(result.explanation, /below Total Econ/u);
  });
});
