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
  categoryCompetence,
  monsoonAwareness,
  passStrategicValue,
  resourceDiscipline,
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
      params: { $targetSpaces: ['loc-hue-khe-sanh:none'] },
      zonesBefore: {
        'loc-hue-khe-sanh:none': [
          makeToken('vc-tax-loc', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
        'phuoc-long:none': [
          makeToken('vc-tax-pop0', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
      },
      zonesAfter: {
        'loc-hue-khe-sanh:none': [
          makeToken('vc-tax-loc', 'guerrilla', 'VC', { activity: 'active' }),
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
        'loc-hue-khe-sanh:none': [
          makeToken('vc-tax-loc', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
        'phuoc-long:none': [
          makeToken('vc-tax-pop0', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
      },
      zonesAfter: {
        'loc-hue-khe-sanh:none': [
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
