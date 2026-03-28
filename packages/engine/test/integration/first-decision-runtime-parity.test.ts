import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { legalMoves } from '../../src/kernel/index.js';
import {
  buildFitlFirstDecisionParityFixture,
} from '../helpers/first-decision-production-helpers.js';

const FIXTURE = buildFitlFirstDecisionParityFixture();

describe('FITL production first-decision runtime parity', () => {
  it('reports descriptive compiled coverage for production actions and pipelines', () => {
    console.warn(
      [
        'FITL first-decision coverage:',
        `actionCompiled=${FIXTURE.coverage.compiledActions}/${FIXTURE.coverage.totalActionsWithDecisions}`,
        `pipelineCompiled=${FIXTURE.coverage.compiledPipelines}/${FIXTURE.coverage.totalPipelineProfilesWithDecisions}`,
        `states=${FIXTURE.stateCorpus.length}`,
      ].join(' '),
    );

    assert.ok(FIXTURE.coverage.totalActionsWithDecisions > 0, 'Expected FITL to expose actions with structural first decisions');
    assert.ok(FIXTURE.coverage.totalPipelineProfilesWithDecisions > 0, 'Expected FITL to expose pipeline profiles with structural first decisions');
    assert.ok(FIXTURE.coverage.compiledActions > 0, 'Expected FITL to include compiled plain-action first-decision guards');
    assert.ok(FIXTURE.coverage.compiledPipelines > 0, 'Expected FITL to include compiled pipeline first-decision guards');
    assert.ok(FIXTURE.stateCorpus.length >= 8, 'Expected deterministic FITL corpus to include multiple progressed states');
  });

  it('preserves legalMoves output when compiled guards are enabled for default enumeration', () => {
    for (const [stateIndex, state] of FIXTURE.stateCorpus.entries()) {
      const compiledMoves = legalMoves(FIXTURE.def, state, undefined, FIXTURE.runtime);
      const interpretedMoves = legalMoves(FIXTURE.def, state, undefined, FIXTURE.runtimeWithDisabledGuards);

      assert.deepEqual(
        compiledMoves,
        interpretedMoves,
        `Expected legalMoves parity for default enumeration at corpus state ${stateIndex}`,
      );
    }
  });

  it('preserves legalMoves output when compiled guards are enabled for plain-action feasibility probing', () => {
    for (const [stateIndex, state] of FIXTURE.stateCorpus.entries()) {
      const compiledMoves = legalMoves(
        FIXTURE.def,
        state,
        { probePlainActionFeasibility: true },
        FIXTURE.runtime,
      );
      const interpretedMoves = legalMoves(
        FIXTURE.def,
        state,
        { probePlainActionFeasibility: true },
        FIXTURE.runtimeWithDisabledGuards,
      );

      assert.deepEqual(
        compiledMoves,
        interpretedMoves,
        `Expected legalMoves parity for feasibility probing at corpus state ${stateIndex}`,
      );
    }
  });
});
