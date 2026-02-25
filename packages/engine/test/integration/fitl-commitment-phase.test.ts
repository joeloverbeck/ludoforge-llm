import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  asPlayerId,
  asTokenId,
  createRng,
  initialState,
  legalChoicesEvaluate,
  legalMoves,
  type GameDef,
  type GameState,
  type Move,
  type Token,
} from '../../src/kernel/index.js';
import { completeTemplateMove } from '../../src/kernel/move-completion.js';
import { applyMoveWithResolvedDecisionIds } from '../helpers/decision-param-helpers.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const makeToken = (id: string, type: string, faction: string): Token => ({
  id: asTokenId(id),
  type,
  props: { faction, type },
});

const compileDef = (): GameDef => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assert.notEqual(compiled.gameDef, null);
  return compiled.gameDef!;
};

const countTokens = (state: GameState, zoneId: string, faction: string, type: string): number =>
  (state.zones[zoneId] ?? []).filter((token) => token.props.faction === faction && token.props.type === type).length;

const completeIfPending = (
  def: GameDef,
  state: GameState,
  move: Move,
  seed: bigint,
): Move => {
  const probe = legalChoicesEvaluate(def, state, move);
  if (probe.kind === 'complete') {
    return move;
  }
  assert.equal(probe.kind, 'pending', 'Expected event move to be complete or pending');
  const completed = completeTemplateMove(def, state, move, createRng(seed));
  assert.notEqual(completed, null, 'Expected pending event template to be completable');
  return completed!.move;
};

describe('FITL commitment phase production wiring', () => {
  it('declares commitment in turnStructure and wires card-73 to request and advance to it', () => {
    const { parsed, compiled } = compileProductionSpec();
    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const phaseIds = compiled.gameDef?.turnStructure.phases.map((phase) => phase.id);
    const interruptIds = compiled.gameDef?.turnStructure.interrupts?.map((phase) => phase.id) ?? [];
    assert.deepEqual(phaseIds, [
      'main',
      'coupVictory',
      'coupResources',
      'coupSupport',
      'coupRedeploy',
      'coupCommitment',
      'coupReset',
    ]);
    assert.deepEqual(interruptIds, ['commitment']);

    const card73 = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-73');
    assert.notEqual(card73, undefined);
    assert.deepEqual(card73?.unshaded?.effects, [
      { pushInterruptPhase: { phase: 'commitment', resumePhase: 'main' } },
    ]);
  });

  it('executes card-73 unshaded by running commitment casualty transfer', () => {
    const def = compileDef();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined, 'Expected at least one event deck');

    const baseState = initialState(def, 7301, 2).state;
    const setup: GameState = {
      ...baseState,
      activePlayer: asPlayerId(0),
      zones: {
        ...baseState.zones,
        [eventDeck!.discardZone]: [makeToken('card-73', 'card', 'none')],
        'casualties-US:none': [
          makeToken('us-cas-t-1', 'troops', 'US'),
          makeToken('us-cas-t-2', 'troops', 'US'),
          makeToken('us-cas-t-3', 'troops', 'US'),
          makeToken('us-cas-t-4', 'troops', 'US'),
          makeToken('us-cas-t-5', 'troops', 'US'),
          makeToken('us-cas-b-1', 'base', 'US'),
          makeToken('us-cas-b-2', 'base', 'US'),
          makeToken('us-cas-i-1', 'irregular', 'US'),
        ],
      },
    };

    const outOfPlayTroopsBefore = countTokens(setup, 'out-of-play-US:none', 'US', 'troops');
    const outOfPlayBasesBefore = countTokens(setup, 'out-of-play-US:none', 'US', 'base');
    const availableTroopsBefore = countTokens(setup, 'available-US:none', 'US', 'troops');
    const availableIrregularBefore = countTokens(setup, 'available-US:none', 'US', 'irregular');

    const eventMoves = legalMoves(def, setup).filter((move) => String(move.actionId) === 'event');
    const unshadedMove = eventMoves.find((move) => move.params.side === 'unshaded');
    assert.notEqual(unshadedMove, undefined, 'Expected unshaded card-73 event move');

    const result = applyMove(def, setup, completeIfPending(def, setup, unshadedMove!, 7301n)).state;

    assert.equal(result.currentPhase, 'commitment', 'Expected card-73 to advance into commitment phase');

    const commitmentMove = legalMoves(def, result).find((move) => String(move.actionId) === 'resolveCommitment');
    assert.notEqual(commitmentMove, undefined, 'Expected resolveCommitment move in commitment phase');

    const commitmentApplied = applyMoveWithResolvedDecisionIds(
      def,
      { ...result, turnOrderState: setup.turnOrderState },
      commitmentMove!,
    ).state;

    assert.equal(
      countTokens(commitmentApplied, 'out-of-play-US:none', 'US', 'troops') - outOfPlayTroopsBefore,
      1,
      'Expected floor(5/3) US troop casualties moved out of play',
    );
    assert.equal(
      countTokens(commitmentApplied, 'out-of-play-US:none', 'US', 'base') - outOfPlayBasesBefore,
      2,
      'Expected all US base casualties moved out of play',
    );
    assert.equal(
      countTokens(commitmentApplied, 'available-US:none', 'US', 'troops') - availableTroopsBefore,
      4,
      'Expected remaining US troop casualties moved to Available',
    );
    assert.equal(
      countTokens(commitmentApplied, 'available-US:none', 'US', 'irregular') - availableIrregularBefore,
      1,
      'Expected non-base US casualties moved to Available',
    );
    assert.equal(commitmentApplied.zones['casualties-US:none']?.length ?? 0, 0, 'Expected casualties-US to be emptied');
    assert.equal(commitmentApplied.currentPhase, 'main', 'Expected to return to main phase after resolveCommitment');
  });
});
