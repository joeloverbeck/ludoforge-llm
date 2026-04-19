// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asActionId,
  type DecisionKey,
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

const asDecisionKey = (value: string): DecisionKey => value as DecisionKey;

describe('decision sequence satisfiability', () => {
  it('explores legal options before unknown or illegal options', () => {
    const explored: unknown[] = [];
    const result = classifyDecisionSequenceSatisfiability(
      makeMove(),
      (move: Move): ChoiceRequest => {
        const selected = move.params[asDecisionKey('decision:$pick')];
        if (selected === undefined) {
          return {
            kind: 'pending',
            complete: false,
            decisionKey: asDecisionKey('decision:$pick'),
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
        const selected = move.params[asDecisionKey('decision:$pick')];
        if (selected === undefined) {
          return {
            kind: 'pending',
            complete: false,
            decisionKey: asDecisionKey('decision:$pick'),
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
        decisionKey: asDecisionKey('decision:$pick'),
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
        const selected = move.params[asDecisionKey('decision:$pickMany')];
        if (selected !== undefined) {
          return { kind: 'illegal', complete: false, reason: 'pipelineLegalityFailed' };
        }
        return {
          kind: 'pending',
          complete: false,
          decisionKey: asDecisionKey('decision:$pickMany'),
          name: '$pickMany',
          type: 'chooseN',
          min: 50,
          max: 50,
          selected: [],
          canConfirm: false,
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

  it('classifies stochastic pending alternatives as unknown', () => {
    const result = classifyDecisionSequenceSatisfiability(
      makeMove(),
      (): ChoiceRequest => ({
        kind: 'pendingStochastic',
        complete: false,
        source: 'rollRandom',
        alternatives: [
          {
            kind: 'pending',
            complete: false,
            decisionKey: asDecisionKey('decision:$alpha'),
            name: '$alpha',
            type: 'chooseOne',
            targetKinds: [],
            options: [{ value: 'a', legality: 'unknown', illegalReason: null }],
          },
          {
            kind: 'pending',
            complete: false,
            decisionKey: asDecisionKey('decision:$beta'),
            name: '$beta',
            type: 'chooseOne',
            targetKinds: [],
            options: [{ value: 'b', legality: 'unknown', illegalReason: null }],
          },
        ],
        outcomes: [
          { bindings: { $roll: 1 }, nextDecision: {
            kind: 'pending',
            complete: false,
            decisionKey: asDecisionKey('decision:$alpha'),
            name: '$alpha',
            type: 'chooseOne',
            targetKinds: [],
            options: [{ value: 'a', legality: 'unknown', illegalReason: null }],
          } },
          { bindings: { $roll: 2 }, nextDecision: {
            kind: 'pending',
            complete: false,
            decisionKey: asDecisionKey('decision:$beta'),
            name: '$beta',
            type: 'chooseOne',
            targetKinds: [],
            options: [{ value: 'b', legality: 'unknown', illegalReason: null }],
          } },
        ],
      }),
    );

    assert.equal(result.classification, 'unknown');
  });

  it('emits canonicalViableHeadSelection for a satisfiable chooseN head', () => {
    const result = classifyDecisionSequenceSatisfiability(
      makeMove(),
      (move: Move): ChoiceRequest => {
        const selected = move.params[asDecisionKey('decision:$pickMany')];
        if (selected === undefined) {
          return {
            kind: 'pending',
            complete: false,
            decisionKey: asDecisionKey('decision:$pickMany'),
            name: '$pickMany',
            type: 'chooseN',
            min: 1,
            max: 1,
            selected: [],
            canConfirm: false,
            targetKinds: [],
            options: [
              { value: 'option-bad', legality: 'unknown', illegalReason: null },
              { value: 'option-good', legality: 'unknown', illegalReason: null },
              { value: 'option-dead', legality: 'unknown', illegalReason: null },
            ],
          };
        }

        const [choice] = selected as readonly string[];
        if (choice === 'option-good') {
          return { kind: 'complete', complete: true };
        }
        return { kind: 'illegal', complete: false, reason: 'pipelineLegalityFailed' };
      },
      { emitCanonicalViableHeadSelection: true },
    );

    assert.equal(result.classification, 'satisfiable');
    assert.deepEqual(result.canonicalViableHeadSelection, ['option-good']);
  });

  it('omits canonicalViableHeadSelection when all chooseN head options are dead-ends', () => {
    const result = classifyDecisionSequenceSatisfiability(
      makeMove(),
      (move: Move): ChoiceRequest => {
        const selected = move.params[asDecisionKey('decision:$pickMany')];
        if (selected === undefined) {
          return {
            kind: 'pending',
            complete: false,
            decisionKey: asDecisionKey('decision:$pickMany'),
            name: '$pickMany',
            type: 'chooseN',
            min: 1,
            max: 1,
            selected: [],
            canConfirm: false,
            targetKinds: [],
            options: [
              { value: 'option-a', legality: 'unknown', illegalReason: null },
              { value: 'option-b', legality: 'unknown', illegalReason: null },
              { value: 'option-c', legality: 'unknown', illegalReason: null },
            ],
          };
        }
        return { kind: 'illegal', complete: false, reason: 'pipelineLegalityFailed' };
      },
      { emitCanonicalViableHeadSelection: true },
    );

    assert.equal(result.classification, 'unsatisfiable');
    assert.equal(result.canonicalViableHeadSelection, undefined);
  });

  it('does not emit canonicalViableHeadSelection when the head decision is not chooseN', () => {
    const result = classifyDecisionSequenceSatisfiability(
      makeMove(),
      (move: Move): ChoiceRequest => {
        const selected = move.params[asDecisionKey('decision:$pick')];
        if (selected === undefined) {
          return {
            kind: 'pending',
            complete: false,
            decisionKey: asDecisionKey('decision:$pick'),
            name: '$pick',
            type: 'chooseOne',
            targetKinds: [],
            options: [
              { value: 'option-a', legality: 'unknown', illegalReason: null },
              { value: 'option-b', legality: 'unknown', illegalReason: null },
            ],
          };
        }
        return selected === 'option-a'
          ? { kind: 'complete', complete: true }
          : { kind: 'illegal', complete: false, reason: 'pipelineLegalityFailed' };
      },
      { emitCanonicalViableHeadSelection: true },
    );

    assert.equal(result.classification, 'satisfiable');
    assert.equal(result.canonicalViableHeadSelection, undefined);
  });

  it('emits a full canonical viable selection for a multi-pick chooseN head', () => {
    const result = classifyDecisionSequenceSatisfiability(
      makeMove(),
      (move: Move): ChoiceRequest => {
        const selected = move.params[asDecisionKey('decision:$pickMany')] as readonly string[] | undefined;
        if (selected === undefined) {
          return {
            kind: 'pending',
            complete: false,
            decisionKey: asDecisionKey('decision:$pickMany'),
            name: '$pickMany',
            type: 'chooseN',
            min: 2,
            max: 2,
            selected: [],
            canConfirm: false,
            targetKinds: [],
            options: [
              { value: 'alpha', legality: 'unknown', illegalReason: null },
              { value: 'beta', legality: 'unknown', illegalReason: null },
              { value: 'gamma', legality: 'unknown', illegalReason: null },
            ],
          };
        }

        return selected.includes('alpha') && selected.includes('beta')
          ? { kind: 'complete', complete: true }
          : { kind: 'illegal', complete: false, reason: 'pipelineLegalityFailed' };
      },
      { emitCanonicalViableHeadSelection: true },
    );

    assert.equal(result.classification, 'satisfiable');
    assert.deepEqual(result.canonicalViableHeadSelection, ['alpha', 'beta']);
  });
});
