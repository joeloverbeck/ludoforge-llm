import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  asActionId,
  asPhaseId,
  asPlayerId,
  initialState,
  type GameDef,
  type Move,
} from '../../src/kernel/index.js';
import {
  createEligibilityOverrideDirective,
  createFreeOpGrantedDirective,
  FITL_NO_OVERRIDE,
} from './fitl-events-test-helpers.js';
import { requireCardDrivenRuntime } from '../helpers/turn-order-helpers.js';

const selfOverride = createEligibilityOverrideDirective({
  target: 'self',
  eligibility: 'eligible',
  windowId: 'remain-eligible',
});
const targetOverride = createEligibilityOverrideDirective({
  target: 2,
  eligibility: 'ineligible',
  windowId: 'force-ineligible',
});
const noOverride = FITL_NO_OVERRIDE;
const freeOpDirective = createFreeOpGrantedDirective(2);

const createDef = (): GameDef =>
  ({
    metadata: { id: 'fitl-eligibility-window-int', players: { min: 4, max: 4 }, maxTriggerDepth: 8 },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    turnOrder: {
      type: 'cardDriven',
      config: {
        turnFlow: {
          cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
          eligibility: {
            factions: ['0', '1', '2', '3'],
            overrideWindows: [
              { id: 'remain-eligible', duration: 'nextTurn' },
              { id: 'force-ineligible', duration: 'nextTurn' },
            ],
          },
          optionMatrix: [{ first: 'event', second: ['operation'] }],
          passRewards: [],
          durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
        },
      },
    },
    actions: [
      {
        id: asActionId('event'),
        actor: 'active',
        phase: asPhaseId('main'),
        params: [
          { name: 'selfOverride', domain: { query: 'enums', values: [noOverride, selfOverride] } },
          { name: 'targetOverride', domain: { query: 'enums', values: [noOverride, targetOverride] } },
          { name: 'freeOp', domain: { query: 'enums', values: [noOverride, freeOpDirective] } },
        ],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
      {
        id: asActionId('operation'),
        actor: 'active',
        phase: asPhaseId('main'),
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
    ],
    triggers: [],
    terminal: { conditions: [] },
  }) as unknown as GameDef;

describe('FITL eligibility window integration', () => {
  it('applies declared nextTurn overrides at card end', () => {
    const def = createDef();
    const start = initialState(def, 41, 4);

    const first = applyMove(def, start, {
      actionId: asActionId('event'),
      params: { selfOverride, targetOverride, freeOp: noOverride },
    }).state;
    const second = applyMove(def, first, { actionId: asActionId('operation'), params: {} });

    assert.deepEqual(requireCardDrivenRuntime(second.state).eligibility, { '0': true, '1': false, '2': false, '3': true });
    assert.equal(requireCardDrivenRuntime(second.state).currentCard.firstEligible, '0');
    assert.equal(requireCardDrivenRuntime(second.state).currentCard.secondEligible, '3');
  });

  it('does not mutate eligibility for non-executing factions when free-op metadata is present', () => {
    const def = createDef();
    const start = initialState(def, 43, 4);

    const firstMove: Move = {
      actionId: asActionId('event'),
      params: { selfOverride: noOverride, targetOverride: noOverride, freeOp: freeOpDirective },
    };
    const firstResult = applyMove(def, start, firstMove);
    const secondResult = applyMove(def, firstResult.state, { actionId: asActionId('operation'), params: {} });
    const second = secondResult.state;

    assert.equal(
      firstResult.triggerFirings.some(
        (entry) => entry.kind === 'turnFlowEligibility' && entry.step === 'overrideCreate',
      ),
      false,
    );

    const cardEndEntry = secondResult.triggerFirings.find(
      (entry) => entry.kind === 'turnFlowEligibility' && entry.step === 'cardEnd',
    );
    assert.equal(cardEndEntry?.kind, 'turnFlowEligibility');
    assert.equal(cardEndEntry?.overrides, undefined);

    assert.deepEqual(requireCardDrivenRuntime(second).eligibility, { '0': false, '1': false, '2': true, '3': true });
    assert.equal(second.activePlayer, asPlayerId(2));
    assert.equal(requireCardDrivenRuntime(second).currentCard.firstEligible, '2');
    assert.equal(requireCardDrivenRuntime(second).currentCard.secondEligible, '3');
  });
});
