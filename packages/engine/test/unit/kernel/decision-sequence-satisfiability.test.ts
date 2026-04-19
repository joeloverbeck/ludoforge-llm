// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asActionId,
  type ChoiceRequest,
  type DecisionKey,
  type Move,
} from '../../../src/kernel/index.js';
import { classifyDecisionSequenceSatisfiability } from '../../../src/kernel/decision-sequence-satisfiability.js';

const makeMove = (): Move => ({
  actionId: asActionId('decision-satisfiability-op'),
  params: {},
});

const asDecisionKey = (value: string): DecisionKey => value as DecisionKey;
const fingerprintStateHash = 1n;

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

  it('applies param expansion budgets during bounded search', () => {
    const result = classifyDecisionSequenceSatisfiability(
      makeMove(),
      (move: Move): ChoiceRequest => {
        const first = move.params[asDecisionKey('decision:$first')];
        if (first === undefined) {
          return {
            kind: 'pending',
            complete: false,
            decisionKey: asDecisionKey('decision:$first'),
            name: '$first',
            type: 'chooseOne',
            targetKinds: [],
            options: Array.from({ length: 5 }, (_, index) => ({
              value: `option-${index}`,
              legality: 'unknown' as const,
              illegalReason: null,
            })),
          };
        }
        return { kind: 'illegal', complete: false, reason: 'pipelineLegalityFailed' };
      },
      {
        budgets: {
          maxParamExpansions: 2,
        },
      },
    );

    assert.equal(result.classification, 'unknown');
    assert.equal(result.warnings.some((warning) => warning.code === 'MOVE_ENUM_PARAM_EXPANSION_BUDGET_EXCEEDED'), true);
  });

  it('classifies root stochastic pending alternatives as explicitStochastic', () => {
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
        ],
        outcomes: [],
      }),
    );

    assert.equal(result.classification, 'explicitStochastic');
    assert.equal(result.certificate, undefined);
  });

  it('classifies a mid-sequence stochastic boundary as explicitStochastic and retains the deterministic prefix certificate', () => {
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
              { value: 'bad', legality: 'unknown', illegalReason: null },
              { value: 'good', legality: 'legal', illegalReason: null },
            ],
          };
        }
        if (selected === 'good') {
          return {
            kind: 'pendingStochastic',
            complete: false,
            source: 'rollRandom',
            alternatives: [],
            outcomes: [],
          };
        }
        return { kind: 'illegal', complete: false, reason: 'pipelineLegalityFailed' };
      },
      {
        emitCompletionCertificate: true,
        certificateFingerprintStateHash: fingerprintStateHash,
      },
    );

    assert.equal(result.classification, 'explicitStochastic');
    assert.deepEqual(result.certificate?.assignments, [
      {
        decisionKey: asDecisionKey('decision:$pick'),
        requestType: 'chooseOne',
        value: 'good',
      },
    ]);
  });

  it('emits a completion certificate for a satisfiable chooseN head', () => {
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
            ],
          };
        }

        const [choice] = selected as readonly string[];
        return choice === 'option-good'
          ? { kind: 'complete', complete: true }
          : { kind: 'illegal', complete: false, reason: 'pipelineLegalityFailed' };
      },
      {
        emitCompletionCertificate: true,
        certificateFingerprintStateHash: fingerprintStateHash,
      },
    );

    assert.equal(result.classification, 'satisfiable');
    assert.deepEqual(result.certificate?.assignments, [
      {
        decisionKey: asDecisionKey('decision:$pickMany'),
        requestType: 'chooseN',
        value: ['option-good'],
      },
    ]);
    assert.equal(typeof result.certificate?.fingerprint, 'string');
    assert.equal(result.certificate?.diagnostics?.probeStepsConsumed !== undefined, true);
  });

  it('omits certificates when all branches are dead-ends', () => {
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
            ],
          };
        }
        return { kind: 'illegal', complete: false, reason: 'pipelineLegalityFailed' };
      },
      {
        emitCompletionCertificate: true,
        certificateFingerprintStateHash: fingerprintStateHash,
      },
    );

    assert.equal(result.classification, 'unsatisfiable');
    assert.equal(result.certificate, undefined);
  });

  it('emits full-path certificates for non-chooseN heads', () => {
    const result = classifyDecisionSequenceSatisfiability(
      makeMove(),
      (move: Move): ChoiceRequest => {
        const pick = move.params[asDecisionKey('decision:$pick')];
        const confirm = move.params[asDecisionKey('decision:$confirm')];
        if (pick === undefined) {
          return {
            kind: 'pending',
            complete: false,
            decisionKey: asDecisionKey('decision:$pick'),
            name: '$pick',
            type: 'chooseOne',
            targetKinds: [],
            options: [
              { value: 'alpha', legality: 'unknown', illegalReason: null },
              { value: 'beta', legality: 'unknown', illegalReason: null },
            ],
          };
        }
        if (confirm === undefined) {
          return pick === 'alpha'
            ? {
              kind: 'pending',
              complete: false,
              decisionKey: asDecisionKey('decision:$confirm'),
              name: '$confirm',
              type: 'chooseOne',
              targetKinds: [],
              options: [{ value: 'done', legality: 'legal', illegalReason: null }],
            }
            : { kind: 'illegal', complete: false, reason: 'pipelineLegalityFailed' };
        }
        return confirm === 'done'
          ? { kind: 'complete', complete: true }
          : { kind: 'illegal', complete: false, reason: 'pipelineLegalityFailed' };
      },
      {
        emitCompletionCertificate: true,
        certificateFingerprintStateHash: fingerprintStateHash,
      },
    );

    assert.equal(result.classification, 'satisfiable');
    assert.deepEqual(result.certificate?.assignments, [
      {
        decisionKey: asDecisionKey('decision:$pick'),
        requestType: 'chooseOne',
        value: 'alpha',
      },
      {
        decisionKey: asDecisionKey('decision:$confirm'),
        requestType: 'chooseOne',
        value: 'done',
      },
    ]);
  });

  it('emits a full multi-pick chooseN certificate', () => {
    const result = classifyDecisionSequenceSatisfiability(
      makeMove(),
      (move: Move): ChoiceRequest => {
        const selected = move.params[asDecisionKey('decision:$pickMany')] as readonly string[] | undefined;
        if (selected === undefined || selected.length < 2) {
          return {
            kind: 'pending',
            complete: false,
            decisionKey: asDecisionKey('decision:$pickMany'),
            name: '$pickMany',
            type: 'chooseN',
            min: 2,
            max: 2,
            selected: selected === undefined ? [] : [...selected],
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
      {
        emitCompletionCertificate: true,
        certificateFingerprintStateHash: fingerprintStateHash,
      },
    );

    assert.equal(result.classification, 'satisfiable');
    assert.deepEqual(result.certificate?.assignments, [
      {
        decisionKey: asDecisionKey('decision:$pickMany'),
        requestType: 'chooseN',
        value: ['alpha', 'beta'],
      },
    ]);
  });
});
