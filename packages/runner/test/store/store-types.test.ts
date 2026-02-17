import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  ChoicePendingRequest,
  LegalMoveEnumerationResult,
  MoveParamValue,
  TerminalResult,
} from '@ludoforge/engine';
import { asActionId, asPlayerId } from '@ludoforge/engine';

import type { PartialChoice, RenderContext } from '../../src/store/store-types';

describe('store-types', () => {
  it('constructs PartialChoice with valid MoveParamValue values', () => {
    const scalarChoice: PartialChoice = {
      decisionId: 'target-zone',
      name: 'Target Zone',
      value: 'zone:main' as MoveParamValue,
    };

    const vectorChoice: PartialChoice = {
      decisionId: 'targets',
      name: 'Targets',
      value: ['zone:main', asPlayerId(1)] as MoveParamValue,
    };

    expect(scalarChoice.decisionId).toBe('target-zone');
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
      decisionId: 'choose-card',
      name: 'Choose Card',
      type: 'chooseOne',
      options: ['card:a'],
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
      choiceStack: [],
      playerSeats: new Map([
        [asPlayerId(0), 'human'],
        [asPlayerId(1), 'ai-random'],
      ]),
      terminal,
    };

    expect(context.playerSeats.get(asPlayerId(0))).toBe('human');
    expectTypeOf(context).toMatchTypeOf<RenderContext>();
  });
});
