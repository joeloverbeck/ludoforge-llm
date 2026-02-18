import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asActionId,
  type ChoiceRequest,
  type Move,
} from '../../../src/kernel/index.js';
import {
  classifyDecisionSequenceSatisfiability,
} from '../../../src/kernel/decision-sequence-satisfiability.js';

const makeMove = (): Move => ({
  actionId: asActionId('decision-satisfiability-op'),
  params: {},
});

describe('decision sequence satisfiability', () => {
  it('explores legal options before unknown or illegal options', () => {
    const explored: unknown[] = [];
    const result = classifyDecisionSequenceSatisfiability(
      makeMove(),
      (move: Move): ChoiceRequest => {
        const selected = move.params['decision:$pick'];
        if (selected === undefined) {
          return {
            kind: 'pending',
            complete: false,
            decisionId: 'decision:$pick',
            name: '$pick',
            type: 'chooseOne',
            targetKinds: [],
            options: [
              { value: 'unknown', legality: 'unknown', illegalReason: null },
              { value: 'legal', legality: 'legal', illegalReason: null },
              { value: 'illegal', legality: 'illegal', illegalReason: null },
            ],
          };
        }

        explored.push(selected);
        if (selected === 'legal') {
          return { kind: 'complete', complete: true };
        }
        return { kind: 'illegal', complete: false, reason: 'pipelineLegalityFailed' };
      },
    );

    assert.equal(result.classification, 'satisfiable');
    assert.deepEqual(explored, ['legal']);
  });

  it('falls back to unknown options when no legal options exist', () => {
    const explored: unknown[] = [];
    const result = classifyDecisionSequenceSatisfiability(
      makeMove(),
      (move: Move): ChoiceRequest => {
        const selected = move.params['decision:$pick'];
        if (selected === undefined) {
          return {
            kind: 'pending',
            complete: false,
            decisionId: 'decision:$pick',
            name: '$pick',
            type: 'chooseOne',
            targetKinds: [],
            options: [
              { value: 'unknown-a', legality: 'unknown', illegalReason: null },
              { value: 'unknown-b', legality: 'unknown', illegalReason: null },
              { value: 'illegal', legality: 'illegal', illegalReason: null },
            ],
          };
        }

        explored.push(selected);
        if (selected === 'unknown-a') {
          return { kind: 'complete', complete: true };
        }
        return { kind: 'illegal', complete: false, reason: 'pipelineLegalityFailed' };
      },
    );

    assert.equal(result.classification, 'satisfiable');
    assert.deepEqual(explored, ['unknown-a']);
  });

  it('does not expand illegal options when illegal fallback is not enabled', () => {
    const result = classifyDecisionSequenceSatisfiability(
      makeMove(),
      (): ChoiceRequest => ({
        kind: 'pending',
        complete: false,
        decisionId: 'decision:$pick',
        name: '$pick',
        type: 'chooseOne',
        targetKinds: [],
        options: [
          { value: 'illegal-a', legality: 'illegal', illegalReason: null },
          { value: 'illegal-b', legality: 'illegal', illegalReason: null },
        ],
      }),
    );

    assert.equal(result.classification, 'unsatisfiable');
  });

  it('applies param expansion budget during chooseN enumeration without materializing all combinations', () => {
    const result = classifyDecisionSequenceSatisfiability(
      makeMove(),
      (move: Move): ChoiceRequest => {
        const selected = move.params['decision:$pickMany'];
        if (selected !== undefined) {
          return { kind: 'illegal', complete: false, reason: 'pipelineLegalityFailed' };
        }
        return {
          kind: 'pending',
          complete: false,
          decisionId: 'decision:$pickMany',
          name: '$pickMany',
          type: 'chooseN',
          min: 50,
          max: 50,
          targetKinds: [],
          options: Array.from({ length: 100 }, (_, index) => ({
            value: `option-${index}`,
            legality: 'unknown' as const,
            illegalReason: null,
          })),
        };
      },
      {
        budgets: {
          maxParamExpansions: 100,
        },
      },
    );

    assert.equal(result.classification, 'unknown');
    assert.equal(result.warnings.some((warning) => warning.code === 'MOVE_ENUM_PARAM_EXPANSION_BUDGET_EXCEEDED'), true);
  });
});
