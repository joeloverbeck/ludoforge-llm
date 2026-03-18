import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { MctsSearchDiagnostics } from '../../../src/agents/index.js';
import { asActionId, type GameDef, type GameState, type Move, type PlayerId, type Token } from '../../../src/kernel/index.js';

import {
  categoryCompetence,
  monsoonAwareness,
  passStrategicValue,
  resourceDiscipline,
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
    ...(lookaheadZoneId === null || options?.lookaheadIsCoup === undefined
      ? {}
      : {
        zones: {
          [lookaheadZoneId]: [cloneLookaheadWithCoupFlag(options.lookaheadIsCoup)],
        },
      }),
  });
  const stateAfter = options?.globalVarsAfter === undefined
    ? stateBefore
    : engineerScenarioState(stateBefore, { globalVars: options.globalVarsAfter });
  const move: Move = {
    actionId: asActionId(actionId),
    params: {},
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
