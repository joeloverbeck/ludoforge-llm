import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { MctsSearchDiagnostics } from '../../../src/agents/index.js';
import { asActionId, type Move } from '../../../src/kernel/index.js';

import { categoryCompetence, type CompetenceEvalContext } from './fitl-competence-evaluators.js';
import { compileFitlDef, createPlaybookBaseState, VC_PLAYER } from './fitl-mcts-test-helpers.js';

const diagnosticsStub: MctsSearchDiagnostics = {
  iterations: 1,
  nodesAllocated: 1,
  maxTreeDepth: 1,
  rootChildVisits: {},
};

const createContext = (actionId: string): CompetenceEvalContext => {
  const def = compileFitlDef();
  const state = createPlaybookBaseState(def);
  const move: Move = {
    actionId: asActionId(actionId),
    params: {},
  };
  return {
    def,
    stateBefore: state,
    move,
    stateAfter: state,
    playerId: VC_PLAYER,
    diagnostics: diagnosticsStub,
    budget: 'interactive',
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
