import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asActionId,
  asPhaseId,
  createRng,
  createSeatResolutionContext,
  initialState,
  legalMoves,
  type GameDef,
  type Move,
} from '../../src/kernel/index.js';
import { resolveFreeOperationDiscoveryAnalysis } from '../../src/kernel/free-operation-discovery-analysis.js';
import { completeTemplateMove } from '../../src/kernel/move-completion.js';
import { extractBindingCountBounds } from '../../src/kernel/zone-filter-constraint-extraction.js';
import { asTaggedGameDef } from '../helpers/gamedef-fixtures.js';
import { withPendingFreeOperationGrant } from '../helpers/turn-order-helpers.js';
import { eff } from '../helpers/effect-tag-helper.js';

const CITY_A = 'city-a:none';
const CITY_B = 'city-b:none';

const createDef = (): GameDef =>
  asTaggedGameDef({
    metadata: { id: 'free-operation-completion-overlap-int', players: { min: 2, max: 2 } },
    seats: [{ id: '0' }, { id: '1' }],
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [
      { id: CITY_A, owner: 'none', visibility: 'public', ordering: 'set', category: 'city' },
      { id: CITY_B, owner: 'none', visibility: 'public', ordering: 'set', category: 'city' },
      { id: 'deck:none', owner: 'none', visibility: 'hidden', ordering: 'stack' },
      { id: 'played:none', owner: 'none', visibility: 'public', ordering: 'stack' },
      { id: 'lookahead:none', owner: 'none', visibility: 'hidden', ordering: 'stack' },
      { id: 'leader:none', owner: 'none', visibility: 'public', ordering: 'stack' },
    ],
    tokenTypes: [{ id: 'card', props: {} }],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    turnOrder: {
      type: 'cardDriven',
      config: {
        turnFlow: {
          cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
          eligibility: { seats: ['0', '1'] },
          windows: [],
          actionClassByActionId: { operation: 'operation' },
          optionMatrix: [],
          passRewards: [],
          freeOperationActionIds: ['operation'],
          durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
        },
      },
    },
    actions: [
      {
        id: asActionId('operation'),
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
    ],
    actionPipelines: [
      {
        id: 'operation-profile',
        actionId: asActionId('operation'),
        legality: null,
        costValidation: null,
        costEffects: [],
        targeting: {},
        stages: [
          {
            effects: [
              eff({
                chooseN: {
                  internalDecisionId: 'decision:$targetSpaces',
                  bind: '$targetSpaces',
                  options: { query: 'enums', values: [CITY_A, CITY_B] },
                  min: 1,
                  max: 99,
                },
              }),
              eff({
                chooseOne: {
                  internalDecisionId: 'decision:$path',
                  bind: '$path',
                  options: { query: 'enums', values: ['trap', 'safe'] },
                },
              }),
              eff({
                if: {
                  when: { op: '==', left: { _t: 2, ref: 'binding', name: '$path' }, right: 'trap' },
                  then: [
                    eff({
                      chooseOne: {
                        internalDecisionId: 'decision:$dead',
                        bind: '$dead',
                        options: { query: 'enums', values: [] },
                      },
                    }),
                  ],
                  else: [
                    eff({
                      chooseOne: {
                        internalDecisionId: 'decision:$safe',
                        bind: '$safe',
                        options: { query: 'enums', values: ['done'] },
                      },
                    }),
                  ],
                },
              }),
            ],
          },
        ],
        atomicity: 'partial',
      },
    ],
    triggers: [],
    terminal: { conditions: [] },
    eventDecks: [
      {
        id: 'event-deck',
        drawZone: 'deck:none',
        discardZone: 'played:none',
        cards: [],
      },
    ],
  });

const createWitnessState = (def: GameDef) => {
  const base = initialState(def, 17, 2).state;
  return withPendingFreeOperationGrant(
    withPendingFreeOperationGrant(base, {
      grantId: 'grant-singleton',
      seat: '0',
      actionIds: ['operation'],
      moveZoneBindings: ['$targetSpaces'],
      completionPolicy: 'required',
      outcomePolicy: 'mustChangeGameplayState',
      postResolutionTurnFlow: 'resumeCardFlow',
      zoneFilter: {
        op: 'and',
        args: [
          {
            op: '==',
            left: {
              _t: 5,
              aggregate: {
                op: 'count',
                query: { query: 'binding', name: '$targetSpaces' },
              },
            },
            right: 1,
          },
          {
            op: 'in',
            item: { _t: 2, ref: 'binding', name: '$zone' },
            set: { _t: 1, scalarArray: [CITY_A, CITY_B] },
          },
        ],
      },
    }),
    {
      grantId: 'grant-overlap',
      seat: '0',
      actionIds: ['operation'],
      moveZoneBindings: ['$targetSpaces'],
      executionContext: {
        selectedSpaces: [CITY_A, CITY_B],
      },
      zoneFilter: {
        op: 'in',
        item: { _t: 2, ref: 'binding', name: '$zone' },
        set: { _t: 2, ref: 'grantContext', key: 'selectedSpaces' },
      },
    },
  );
};

describe('free-operation completion with overlapping grants', () => {
  it('uses the highest-priority grant for binding-count clamps on overlapping free-operation grants', () => {
    const def = createDef();
    const state = createWitnessState(def);
    const template: Move = { actionId: asActionId('operation'), freeOperation: true, params: {} };

    const freeMoves = legalMoves(def, state).filter(
      (move) => String(move.actionId) === 'operation' && move.freeOperation === true,
    );
    assert.equal(freeMoves.length, 2);

    const analysis = resolveFreeOperationDiscoveryAnalysis(
      def,
      state,
      template,
      createSeatResolutionContext(def, state.playerCount),
    );

    assert.notEqual(analysis.zoneFilter, undefined);
    assert.equal(typeof analysis.zoneFilter, 'object');
    assert.equal((analysis.zoneFilter as { op?: string }).op, 'or');
    assert.equal(extractBindingCountBounds(analysis.zoneFilter!, '$targetSpaces'), null);
    assert.equal(extractBindingCountBounds(analysis.bindingCountZoneFilter!, '$targetSpaces')?.max, 1);

    let observedTargetSpacesMax: number | undefined;
    const guided = completeTemplateMove(def, state, template, createRng(0n), undefined, {
      choose: (request) => {
        if (request.type === 'chooseN' && request.name === '$targetSpaces') {
          observedTargetSpacesMax = request.max;
          return [CITY_A];
        }
        if (request.type === 'chooseOne' && request.name === '$path') {
          return 'safe';
        }
        return undefined;
      },
    });

    assert.equal(observedTargetSpacesMax, 1);
    assert.equal(guided.kind, 'completed');
    if (guided.kind !== 'completed') {
      throw new Error('Expected guided completion to succeed');
    }
    assert.equal(guided.move.params.$path, 'safe');
    assert.equal(guided.move.params.$safe, 'done');

    // Random completion uses discovery-mode (not evaluation-mode), so it may
    // walk into the "trap" branch whose empty domain makes the move structurally unsatisfiable.
    // The important invariant is that the $targetSpaces max clamp (tested above)
    // is correctly applied regardless of completion outcome.
    const random = completeTemplateMove(def, state, template, createRng(0n));
    assert.ok(
      random.kind === 'completed' || random.kind === 'structurallyUnsatisfiable',
      `Expected completed or structurallyUnsatisfiable, got ${random.kind}`,
    );
    if (random.kind === 'completed') {
      assert.equal(random.move.params.$path, 'safe');
      assert.equal(random.move.params.$safe, 'done');
    }
  });
});
