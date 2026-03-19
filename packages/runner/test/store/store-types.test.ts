import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  ChoicePendingRequest,
  DecisionKey,
  LegalMoveEnumerationResult,
  MoveParamValue,
  TerminalResult,
} from '@ludoforge/engine/runtime';
import { asActionId, asPlayerId } from '@ludoforge/engine/runtime';

import { createAgentSeatController, createHumanSeatController } from '../../src/seat/seat-controller.js';
import type { PartialChoice, RenderContext } from '../../src/store/store-types';

const asDecisionKey = (value: string): DecisionKey => value as DecisionKey;

describe('store-types', () => {
  it('constructs PartialChoice with valid MoveParamValue values', () => {
    const scalarChoice: PartialChoice = {
      decisionKey: asDecisionKey('target-zone'),
      name: 'Target Zone',
      value: 'zone:main' as MoveParamValue,
    };

    const vectorChoice: PartialChoice = {
      decisionKey: asDecisionKey('targets'),
      name: 'Targets',
      value: ['zone:main', asPlayerId(1)] as MoveParamValue,
    };

    expect(scalarChoice.decisionKey).toBe('target-zone');
    expect(vectorChoice.name).toBe('Targets');
    expectTypeOf(vectorChoice.value).toMatchTypeOf<MoveParamValue>();
  });

  it('constructs RenderContext with branded engine fields', () => {
    const legalMoveResult: LegalMoveEnumerationResult = {
      moves: [],
      warnings: [],
    };

    const choicePending: ChoicePendingRequest = {
      kind: 'pending',
      complete: false,
      decisionKey: asDecisionKey('choose-card'),
      name: 'Choose Card',
      type: 'chooseOne',
      options: [{ value: 'card:a', legality: 'legal', illegalReason: null }],
      targetKinds: [],
    };

    const terminal: TerminalResult = {
      type: 'win',
      player: asPlayerId(0),
    };

    const context: RenderContext = {
      playerID: asPlayerId(0),
      legalMoveResult,
      choicePending,
      selectedAction: asActionId('play-card'),
      partialMove: { actionId: asActionId('play-card'), params: {} },
      choiceStack: [],
      playerSeats: new Map<ReturnType<typeof asPlayerId>, ReturnType<typeof createHumanSeatController> | ReturnType<typeof createAgentSeatController>>([
        [asPlayerId(0), createHumanSeatController()],
        [asPlayerId(1), createAgentSeatController({ kind: 'builtin', builtinId: 'random' })],
      ]),
      terminal,
    };

    expect(context.playerSeats.get(asPlayerId(0))).toEqual(createHumanSeatController());
    expectTypeOf(context).toMatchTypeOf<RenderContext>();
  });
});
