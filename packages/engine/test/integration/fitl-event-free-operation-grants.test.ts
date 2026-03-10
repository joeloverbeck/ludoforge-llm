import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  asActionId,
  asPhaseId,
  asPlayerId,
  asTokenId,
  ILLEGAL_MOVE_REASONS,
  initialState,
  legalMoves,
  type EventCardDef,
  type EventDeckDef,
  type GameDef,
  type GameState,
} from '../../src/kernel/index.js';
import { requireCardDrivenRuntime } from '../helpers/turn-order-helpers.js';

const createDef = (): GameDef =>
  ({
    metadata: { id: 'event-turn-flow-directives-int', players: { min: 4, max: 4 }, maxTriggerDepth: 8 },
    seats: [{ id: 'US' }, { id: 'ARVN' }, { id: 'NVA' }, { id: 'VC' }],
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
            seats: ['US', 'ARVN', 'NVA', 'VC'],
          },
          windows: [],
          optionMatrix: [{ first: 'event', second: ['operation'] }],
          passRewards: [],
          freeOperationActionIds: ['operation'],
          durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
        },
      },
    },
    actions: [
      {
        id: asActionId('event'),
capabilities: ['cardEvent'],
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
        params: [
          { name: 'eventCardId', domain: { query: 'enums', values: ['card-1', 'card-2', 'card-3', 'card-4', 'card-5', 'card-6', 'card-7', 'card-9', 'card-required-outcome', 'card-overlap-required-outcome'] } },
          { name: 'side', domain: { query: 'enums', values: ['unshaded'] } },
          { name: 'branch', domain: { query: 'enums', values: ['branch-grant-nva', 'none'] } },
        ],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
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
        stages: [{ effects: [] }],
        atomicity: 'atomic',
      },
    ],
    triggers: [],
    terminal: { conditions: [] },
    eventDecks: [
      {
        id: 'event-deck',
        drawZone: 'deck:none',
        discardZone: 'played:none',
        cards: [
          {
            id: 'card-1',
            title: 'Directive From Side',
            sideMode: 'single',
            unshaded: {
              text: 'Grant free op to VC.',
              freeOperationGrants: [
                {
                  seat: 'VC',
                  sequence: { chain: 'vc-op', step: 0 },
                  operationClass: 'operation',
                  actionIds: ['operation'],
                },
              ],
            },
          },
          {
            id: 'card-2',
            title: 'Directive From Branch',
            sideMode: 'single',
            unshaded: {
              text: 'Branch grants free op to NVA.',
              branches: [
                {
                  id: 'branch-grant-nva',
                  freeOperationGrants: [
                    {
                      seat: 'NVA',
                      sequence: { chain: 'nva-op', step: 0 },
                      operationClass: 'operation',
                      actionIds: ['operation'],
                    },
                  ],
                },
              ],
            },
          },
          {
            id: 'card-3',
            title: 'Two Independent VC Grants',
            sideMode: 'single',
            unshaded: {
              text: 'Grant VC two free operations.',
              freeOperationGrants: [
                { seat: 'VC', sequence: { chain: 'vc-op-1', step: 0 }, operationClass: 'operation', actionIds: ['operation'] },
                { seat: 'VC', sequence: { chain: 'vc-op-2', step: 0 }, operationClass: 'operation', actionIds: ['operation'] },
              ],
            },
          },
          {
            id: 'card-4',
            title: 'Reusable VC Grant',
            sideMode: 'single',
            unshaded: {
              text: 'Grant VC a reusable free operation.',
              freeOperationGrants: [
                {
                  id: 'vc-reusable-op',
                  seat: 'VC',
                  sequence: { chain: 'vc-reusable-op', step: 0 },
                  operationClass: 'operation',
                  actionIds: ['operation'],
                  uses: 2,
                },
              ],
            },
          },
          {
            id: 'card-5',
            title: 'Limited VC Grant',
            sideMode: 'single',
            unshaded: {
              text: 'Grant VC a limited free operation.',
              freeOperationGrants: [
                {
                  seat: 'VC',
                  sequence: { chain: 'vc-limited', step: 0 },
                  operationClass: 'limitedOperation',
                  actionIds: ['operation'],
                },
              ],
            },
          },
          {
            id: 'card-6',
            title: 'Ordered VC Grant Chain',
            sideMode: 'single',
            unshaded: {
              text: 'VC gets limited operation first, then regular operation.',
              freeOperationGrants: [
                { seat: 'VC', sequence: { chain: 'vc-ordered', step: 0 }, operationClass: 'limitedOperation', actionIds: ['operation'] },
                { seat: 'VC', sequence: { chain: 'vc-ordered', step: 1 }, operationClass: 'operation', actionIds: ['operation'] },
              ],
            },
          },
          {
            id: 'card-7',
            title: 'Ordered Cross-Faction Grant Chain',
            sideMode: 'single',
            unshaded: {
              text: 'VC gets a free operation before NVA gets one.',
              freeOperationGrants: [
                { seat: 'VC', sequence: { chain: 'vc-nva-ordered', step: 0 }, operationClass: 'operation', actionIds: ['operation'] },
                { seat: 'NVA', sequence: { chain: 'vc-nva-ordered', step: 1 }, operationClass: 'operation', actionIds: ['operation'] },
              ],
            },
          },
          {
            id: 'card-9',
            title: 'Grant From Effect',
            sideMode: 'single',
            unshaded: {
              text: 'Grant VC free operation via effect execution.',
              effects: [{ grantFreeOperation: { seat: 'VC', operationClass: 'operation', actionIds: ['operation'] } }],
            },
          },
          {
            id: 'card-required-outcome',
            title: 'Required Self Grant',
            sideMode: 'single',
            unshaded: {
              text: 'US must take a free operation that changes gameplay state.',
              freeOperationGrants: [
                {
                  seat: 'US',
                  sequence: { chain: 'required-self', step: 0 },
                  operationClass: 'operation',
                  actionIds: ['operation'],
                  completionPolicy: 'required',
                  outcomePolicy: 'mustChangeGameplayState',
                  postResolutionTurnFlow: 'resumeCardFlow',
                },
              ],
            },
          },
          {
            id: 'card-overlap-required-outcome',
            title: 'Overlapping Required Self Grant',
            sideMode: 'single',
            unshaded: {
              text: 'US receives overlapping free operations, one of which must change gameplay state.',
              freeOperationGrants: [
                {
                  seat: 'US',
                  sequence: { chain: 'overlap-self-weaker', step: 0 },
                  operationClass: 'operation',
                  actionIds: ['operation'],
                },
                {
                  seat: 'US',
                  sequence: { chain: 'overlap-self-required', step: 0 },
                  operationClass: 'operation',
                  actionIds: ['operation'],
                  completionPolicy: 'required',
                  outcomePolicy: 'mustChangeGameplayState',
                  postResolutionTurnFlow: 'resumeCardFlow',
                },
              ],
            },
          },
        ],
      } as EventDeckDef,
    ],
  }) as unknown as GameDef;

const createClassAwareDedupDef = (): GameDef => {
  const def = createDef() as unknown as {
    metadata: { id: string };
    turnOrder: {
      type: 'cardDriven';
      config: { turnFlow: { optionMatrix: Array<{ first: string; second: string[] }>; actionClassByActionId?: Record<string, string> } };
    };
    actions: Array<{ id: ReturnType<typeof asActionId>; params: Array<{ name: string; domain?: { query: string; values?: string[] } }> }>;
    eventDecks: EventDeckDef[];
  };

  def.metadata.id = 'event-free-op-class-aware-dedup-int';
  def.turnOrder.config.turnFlow.optionMatrix = [{ first: 'operation', second: ['operation', 'limitedOperation'] }];
  def.turnOrder.config.turnFlow.actionClassByActionId = {};

  const eventAction = def.actions.find((action) => String(action.id) === 'event');
  const eventCardParam = eventAction?.params.find((param) => param.name === 'eventCardId');
  const eventCardValues = eventCardParam?.domain?.values;
  if (Array.isArray(eventCardValues) && !eventCardValues.includes('card-10')) {
    eventCardValues.push('card-10');
  }

  const card10: EventCardDef = {
    id: 'card-10',
    title: 'Dual-Class VC Grant',
    sideMode: 'single',
    unshaded: {
      text: 'Grant VC both operation and limited operation free variants.',
      freeOperationGrants: [
        { seat: 'VC', sequence: { chain: 'vc-dual-class', step: 0 }, operationClass: 'operation', actionIds: ['operation'] },
        { seat: 'VC', sequence: { chain: 'vc-dual-class', step: 0 }, operationClass: 'limitedOperation', actionIds: ['operation'] },
      ],
    },
  };
  const primaryDeck = def.eventDecks[0];
  if (primaryDeck !== undefined) {
    def.eventDecks[0] = { ...primaryDeck, cards: [...primaryDeck.cards, card10] };
  }

  return def as unknown as GameDef;
};

const createRequiredGrantResumeDef = (): GameDef =>
  ({
    metadata: { id: 'event-required-grant-resume-int', players: { min: 4, max: 4 }, maxTriggerDepth: 8 },
    seats: [{ id: 'US' }, { id: 'ARVN' }, { id: 'NVA' }, { id: 'VC' }],
    constants: {},
    globalVars: [{ name: 'opCount', type: 'int', init: 0, min: 0, max: 10 }],
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
            seats: ['US', 'ARVN', 'NVA', 'VC'],
          },
          windows: [],
          optionMatrix: [{ first: 'event', second: ['operation'] }],
          passRewards: [],
          freeOperationActionIds: ['operation'],
          durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
          actionClassByActionId: { event: 'event', operation: 'operation' },
        },
      },
    },
    actions: [
      {
        id: asActionId('event'),
        capabilities: ['cardEvent'],
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [
          { name: 'eventCardId', domain: { query: 'enums', values: ['card-required-resume'] } },
          { name: 'side', domain: { query: 'enums', values: ['unshaded'] } },
          { name: 'branch', domain: { query: 'enums', values: ['none'] } },
        ],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
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
        stages: [{ effects: [{ addVar: { scope: 'global', var: 'opCount', delta: 1 } }] }],
        atomicity: 'atomic',
      },
    ],
    triggers: [],
    terminal: { conditions: [] },
    eventDecks: [
      {
        id: 'event-deck',
        drawZone: 'deck:none',
        discardZone: 'played:none',
        cards: [
          {
            id: 'card-required-resume',
            title: 'Required Follow-Up',
            sideMode: 'single',
            unshaded: {
              text: 'US event requires ARVN to take a free operation.',
              freeOperationGrants: [
                {
                  seat: 'ARVN',
                  sequence: { chain: 'resume-chain', step: 0 },
                  operationClass: 'operation',
                  actionIds: ['operation'],
                  completionPolicy: 'required',
                  postResolutionTurnFlow: 'resumeCardFlow',
                },
              ],
            },
          },
        ],
      } as EventDeckDef,
    ],
  }) as unknown as GameDef;

const createActionIdMismatchDef = (): GameDef => {
  const def = createDef() as unknown as {
    eventDecks: EventDeckDef[];
    actions: Array<{
      id: ReturnType<typeof asActionId>;
      actor: 'active';
      executor: 'actor';
      phase: ReturnType<typeof asPhaseId>[];
      params: [];
      pre: null;
      cost: [];
      effects: [];
      limits: [];
    }>;
    actionPipelines: Array<{
      id: string;
      actionId: ReturnType<typeof asActionId>;
      legality: null;
      costValidation: null;
      costEffects: [];
      targeting: Record<string, never>;
      stages: Array<{ effects: [] }>;
      atomicity: 'atomic';
    }>;
  };

  def.actions.push({
    id: asActionId('operation-alt'),
    actor: 'active',
    executor: 'actor',
    phase: [asPhaseId('main')],
    params: [],
    pre: null,
    cost: [],
    effects: [],
    limits: [],
  });

  def.actionPipelines.push({
    id: 'operation-alt-profile',
    actionId: asActionId('operation-alt'),
    legality: null,
    costValidation: null,
    costEffects: [],
    targeting: {},
    stages: [{ effects: [] }],
    atomicity: 'atomic',
  });

  const deck = def.eventDecks[0];
  if (deck !== undefined) {
    def.eventDecks[0] = {
      ...deck,
      cards: deck.cards.map((card) => {
        if (card.id !== 'card-1' || card.unshaded?.freeOperationGrants?.[0] === undefined) {
          return card;
        }
        return {
          ...card,
          unshaded: {
            ...card.unshaded,
            freeOperationGrants: [
              {
                ...card.unshaded.freeOperationGrants[0],
                actionIds: ['operation-alt'],
              },
            ],
          },
        };
      }),
    };
  }
  return def as unknown as GameDef;
};

const createExecutionContextGrantDef = (): GameDef => ({
  metadata: { id: 'event-turn-flow-grant-execution-context', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
  seats: [{ id: 'US' }, { id: 'NVA' }],
  constants: {},
  globalVars: [
    { name: 'effectCode', type: 'int', init: 0, min: 0, max: 99 },
    { name: 'selectedTarget', type: 'int', init: 0, min: 0, max: 99 },
  ],
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
          seats: ['US', 'NVA'],
        },
        windows: [],
        actionClassByActionId: { event: 'event', operation: 'operation' },
        optionMatrix: [{ first: 'event', second: ['operation'] }],
        passRewards: [],
        freeOperationActionIds: ['operation'],
        durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
      },
    },
  },
  actions: [
    {
      id: asActionId('event'),
      capabilities: ['cardEvent'],
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [
        { name: 'eventCardId', domain: { query: 'enums', values: ['card-context', 'card-context-effect'] } },
        { name: 'side', domain: { query: 'enums', values: ['unshaded'] } },
        { name: 'branch', domain: { query: 'enums', values: ['none'] } },
      ],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    },
    {
      id: asActionId('operation'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [{ name: 'target', domain: { query: 'intsInRange', min: 1, max: 2 } }],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    },
  ],
  actionPipelines: [
    {
      id: 'operation-with-grant-context',
      actionId: asActionId('operation'),
      legality: {
        op: 'in',
        item: { ref: 'binding', name: 'target' },
        set: { ref: 'grantContext', key: 'allowedTargets' },
      },
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [
        {
          effects: [
            { setVar: { scope: 'global', var: 'effectCode', value: { ref: 'grantContext', key: 'effectCode' } } },
            { setVar: { scope: 'global', var: 'selectedTarget', value: { ref: 'binding', name: 'target' } } },
          ],
        },
      ],
      atomicity: 'atomic',
    },
  ],
  triggers: [],
  terminal: { conditions: [] },
  eventDecks: [
    {
      id: 'event-deck',
      drawZone: 'deck:none',
      discardZone: 'played:none',
      cards: [
        {
          id: 'card-context',
          title: 'Declarative Context Grant',
          sideMode: 'single',
          unshaded: {
            text: 'Grant US a context-scoped free operation.',
            freeOperationGrants: [
              {
                seat: 'US',
                sequence: { chain: 'context', step: 0 },
                operationClass: 'operation',
                actionIds: ['operation'],
                completionPolicy: 'required',
                postResolutionTurnFlow: 'resumeCardFlow',
                executionContext: {
                  allowedTargets: { scalarArray: [2] },
                  effectCode: 7,
                },
              },
            ],
          },
        },
        {
          id: 'card-context-effect',
          title: 'Effect Context Grant',
          sideMode: 'single',
          unshaded: {
            text: 'Grant US a context-scoped free operation from an effect.',
            effects: [
              {
                grantFreeOperation: {
                  seat: 'self',
                  operationClass: 'operation',
                  actionIds: ['operation'],
                  completionPolicy: 'required',
                  postResolutionTurnFlow: 'resumeCardFlow',
                  executionContext: {
                    allowedTargets: { scalarArray: [1] },
                    effectCode: { op: '+', left: 4, right: 5 },
                  },
                },
              },
            ],
          },
        },
      ],
    },
  ],
});

const assertFreeOperationDenial = (error: unknown, expectedCause: string): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }
  const details = error as Error & {
    readonly reason?: string;
    readonly context?: { readonly freeOperationDenial?: { readonly cause?: string } };
  };
  return (
    details.reason === ILLEGAL_MOVE_REASONS.FREE_OPERATION_NOT_GRANTED
    && details.context?.freeOperationDenial?.cause === expectedCause
  );
};

const createZoneFilteredDef = (): GameDef =>
  ({
    metadata: { id: 'event-free-op-zone-filter-int', players: { min: 3, max: 3 }, maxTriggerDepth: 8 },
    seats: [{ id: 'US' }, { id: 'ARVN' }, { id: 'NVA' }],
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [
      {
        id: 'boardCambodia:none',
        owner: 'none',
        visibility: 'public',
        ordering: 'set',
        category: 'province',
        attributes: { population: 1, econ: 0, country: 'cambodia', coastal: false },
      },
      {
        id: 'boardVietnam:none',
        owner: 'none',
        visibility: 'public',
        ordering: 'set',
        category: 'province',
        attributes: { population: 1, econ: 0, country: 'southVietnam', coastal: false },
      },
    ],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    turnOrder: {
      type: 'cardDriven',
      config: {
        turnFlow: {
          cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
          eligibility: {
            seats: ['US', 'ARVN', 'NVA'],
          },
          windows: [],
          optionMatrix: [{ first: 'event', second: ['operation'] }],
          passRewards: [],
          freeOperationActionIds: ['operation'],
          durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
        },
      },
    },
    actions: [
      {
        id: asActionId('event'),
capabilities: ['cardEvent'],
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
        params: [
          { name: 'eventCardId', domain: { query: 'enums', values: ['card-75-like'] } },
          { name: 'side', domain: { query: 'enums', values: ['unshaded'] } },
          { name: 'branch', domain: { query: 'enums', values: ['none'] } },
        ],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
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
        id: 'operation-select-zone',
        actionId: asActionId('operation'),
        legality: null,
        costValidation: null,
        costEffects: [],
        targeting: {},
        stages: [
          {
            effects: [
              {
                chooseOne: {
                  internalDecisionId: 'decision:$zone',
                  bind: '$zone',
                  options: { query: 'zones' },
                },
              },
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
        cards: [
          {
            id: 'card-75-like',
            title: 'Cambodia Restriction',
            sideMode: 'single',
            unshaded: {
              text: 'NVA free operation in Cambodia only.',
              freeOperationGrants: [
                {
                  seat: 'NVA',
                  sequence: { chain: 'nva-cambodia', step: 0 },
                  operationClass: 'operation',
                  actionIds: ['operation'],
                  zoneFilter: {
                    op: '==',
                    left: { ref: 'zoneProp', zone: '$zone', prop: 'country' },
                    right: 'cambodia',
                  },
                },
              ],
            },
          },
        ],
      } as EventDeckDef,
    ],
  }) as unknown as GameDef;

const createSequenceContextDef = (): GameDef =>
  ({
    metadata: { id: 'event-free-op-sequence-context-int', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
    seats: [{ id: 'US' }, { id: 'NVA' }],
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [
      {
        id: 'boardCambodia:none',
        owner: 'none',
        visibility: 'public',
        ordering: 'set',
        category: 'province',
        attributes: { population: 1, econ: 0, country: 'cambodia', coastal: false },
      },
      {
        id: 'boardVietnam:none',
        owner: 'none',
        visibility: 'public',
        ordering: 'set',
        category: 'province',
        attributes: { population: 1, econ: 0, country: 'southVietnam', coastal: false },
      },
    ],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    turnOrder: {
      type: 'cardDriven',
      config: {
        turnFlow: {
          cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
          eligibility: {
            seats: ['US', 'NVA'],
          },
          windows: [],
          optionMatrix: [{ first: 'event', second: ['operation'] }],
          passRewards: [],
          freeOperationActionIds: ['operation'],
          durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
        },
      },
    },
    actions: [
      {
        id: asActionId('event'),
capabilities: ['cardEvent'],
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
        params: [
          {
            name: 'eventCardId',
            domain: {
              query: 'enums',
              values: ['card-sequence-context', 'card-sequence-context-branch', 'card-sequence-context-effect-branch'],
            },
          },
          { name: 'side', domain: { query: 'enums', values: ['unshaded'] } },
          { name: 'branch', domain: { query: 'enums', values: ['branch-follow-up', 'branch-effect-follow-up', 'none'] } },
        ],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
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
        id: 'operation-select-zone',
        actionId: asActionId('operation'),
        legality: null,
        costValidation: null,
        costEffects: [],
        targeting: {},
        stages: [
          {
            effects: [
              {
                chooseOne: {
                  internalDecisionId: 'decision:$zone',
                  bind: '$zone',
                  options: { query: 'zones' },
                },
              },
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
        cards: [
          {
            id: 'card-sequence-context',
            title: 'Sequence Context Capture',
            sideMode: 'single',
            unshaded: {
              text: 'Capture first free-op space; require second free-op in same space.',
              freeOperationGrants: [
                {
                  seat: 'NVA',
                  sequence: { chain: 'nva-sequence-context', step: 0 },
                  operationClass: 'operation',
                  actionIds: ['operation'],
                  sequenceContext: {
                    captureMoveZoneCandidatesAs: 'selected-space',
                  },
                },
                {
                  seat: 'NVA',
                  sequence: { chain: 'nva-sequence-context', step: 1 },
                  operationClass: 'operation',
                  actionIds: ['operation'],
                  sequenceContext: {
                    requireMoveZoneCandidatesFrom: 'selected-space',
                  },
                },
              ],
            },
          },
          {
            id: 'card-sequence-context-branch',
            title: 'Sequence Context Capture With Branch Follow-Up',
            sideMode: 'single',
            unshaded: {
              text: 'Capture from side grant; require from selected branch grant.',
              freeOperationGrants: [
                {
                  seat: 'NVA',
                  sequence: { chain: 'nva-sequence-context-branch', step: 0 },
                  operationClass: 'operation',
                  actionIds: ['operation'],
                  sequenceContext: {
                    captureMoveZoneCandidatesAs: 'selected-space',
                  },
                },
              ],
              branches: [
                {
                  id: 'branch-follow-up',
                  freeOperationGrants: [
                    {
                      seat: 'NVA',
                      sequence: { chain: 'nva-sequence-context-branch', step: 1 },
                      operationClass: 'operation',
                      actionIds: ['operation'],
                      sequenceContext: {
                        requireMoveZoneCandidatesFrom: 'selected-space',
                      },
                    },
                  ],
                },
              ],
            },
          },
          {
            id: 'card-sequence-context-effect-branch',
            title: 'Sequence Context Effect Capture With Branch Follow-Up',
            sideMode: 'single',
            unshaded: {
              text: 'Capture from side effect grant; require from selected branch effect grant.',
              effects: [
                {
                  grantFreeOperation: {
                    seat: 'NVA',
                    sequence: { chain: 'nva-sequence-context-effect-branch', step: 0 },
                    operationClass: 'operation',
                    actionIds: ['operation'],
                    sequenceContext: {
                      captureMoveZoneCandidatesAs: 'selected-space',
                    },
                  },
                },
              ],
              branches: [
                {
                  id: 'branch-effect-follow-up',
                  effects: [
                    {
                      grantFreeOperation: {
                        seat: 'NVA',
                        sequence: { chain: 'nva-sequence-context-effect-branch', step: 1 },
                        operationClass: 'operation',
                        actionIds: ['operation'],
                        sequenceContext: {
                          requireMoveZoneCandidatesFrom: 'selected-space',
                        },
                      },
                    },
                  ],
                },
              ],
            },
          },
        ],
      } as EventDeckDef,
    ],
  }) as unknown as GameDef;

const createExecuteAsSeatDef = (): GameDef =>
  ({
    metadata: { id: 'event-free-op-execute-as-faction-int', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
    seats: [{ id: 'US' }, { id: 'ARVN' }],
    constants: {},
    globalVars: [{ name: 'executeAsMarker', type: 'int', init: 0, min: 0, max: 999 }],
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
            seats: ['US', 'ARVN'],
          },
          windows: [],
          optionMatrix: [{ first: 'event', second: ['operation'] }],
          passRewards: [],
          freeOperationActionIds: ['operation'],
          durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
        },
      },
    },
    actions: [
      {
        id: asActionId('event'),
capabilities: ['cardEvent'],
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
        params: [
          { name: 'eventCardId', domain: { query: 'enums', values: ['card-8'] } },
          { name: 'side', domain: { query: 'enums', values: ['unshaded'] } },
          { name: 'branch', domain: { query: 'enums', values: ['none'] } },
        ],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
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
        id: 'operation-as-us',
        actionId: asActionId('operation'),
        applicability: { op: '==', left: { ref: 'activePlayer' }, right: 0 },
        legality: null,
        costValidation: null,
        costEffects: [],
        targeting: {},
        stages: [{ effects: [{ setVar: { scope: 'global', var: 'executeAsMarker', value: 100 } }] }],
        atomicity: 'atomic',
      },
      {
        id: 'operation-as-self',
        actionId: asActionId('operation'),
        applicability: { op: '==', left: { ref: 'activePlayer' }, right: 1 },
        legality: null,
        costValidation: null,
        costEffects: [],
        targeting: {},
        stages: [{ effects: [{ setVar: { scope: 'global', var: 'executeAsMarker', value: 200 } }] }],
        atomicity: 'atomic',
      },
    ],
    triggers: [],
    terminal: { conditions: [] },
    eventDecks: [
      {
        id: 'event-deck',
        drawZone: 'deck:none',
        discardZone: 'played:none',
        cards: [
          {
            id: 'card-8',
            title: 'Execute As Faction',
            sideMode: 'single',
            unshaded: {
              text: 'Faction 1 executes Operation as if faction 0.',
              freeOperationGrants: [
                {
                  seat: 'ARVN',
                  executeAsSeat: 'US',
                  sequence: { chain: 'execute-as-faction', step: 0 },
                  operationClass: 'operation',
                  actionIds: ['operation'],
                },
              ],
            },
          },
        ],
      } as EventDeckDef,
    ],
  }) as unknown as GameDef;

const createGrantViabilityPolicyDef = (): GameDef =>
  ({
    metadata: { id: 'event-free-op-viability-policy-int', players: { min: 3, max: 3 }, maxTriggerDepth: 8 },
    seats: [{ id: 'US' }, { id: 'ARVN' }, { id: 'NVA' }],
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [
      {
        id: 'boardCambodia:none',
        owner: 'none',
        visibility: 'public',
        ordering: 'set',
        category: 'province',
        attributes: { population: 1, econ: 0, country: 'cambodia', coastal: false },
      },
      {
        id: 'boardVietnam:none',
        owner: 'none',
        visibility: 'public',
        ordering: 'set',
        category: 'province',
        attributes: { population: 1, econ: 0, country: 'southVietnam', coastal: false },
      },
    ],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    turnOrder: {
      type: 'cardDriven',
      config: {
        turnFlow: {
          cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
          eligibility: {
            seats: ['US', 'ARVN', 'NVA'],
          },
          windows: [],
          optionMatrix: [{ first: 'event', second: ['operation'] }],
          passRewards: [],
          freeOperationActionIds: ['operation'],
          durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
        },
      },
    },
    actions: [
      {
        id: asActionId('event'),
capabilities: ['cardEvent'],
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
        params: [
          {
            name: 'eventCardId',
            domain: {
              query: 'enums',
              values: [
                'card-require-usable-play',
                'card-require-usable-play-outcome',
                'card-require-usable-issue',
                'card-effect-require-usable-issue',
                'card-effect-require-usable-issue-sequence',
                'card-effect-require-usable-issue-sequence-usable',
                'card-effect-require-usable-issue-sequence-nested',
                'card-effect-require-usable-issue-sequence-nested-usable',
              ],
            },
          },
          { name: 'side', domain: { query: 'enums', values: ['unshaded'] } },
          { name: 'branch', domain: { query: 'enums', values: ['none'] } },
        ],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
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
        id: 'operation-select-zone',
        actionId: asActionId('operation'),
        legality: null,
        costValidation: null,
        costEffects: [],
        targeting: {},
        stages: [
          {
            effects: [
              {
                chooseOne: {
                  internalDecisionId: 'decision:$zone',
                  bind: '$zone',
                  options: { query: 'zones' },
                },
              },
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
        cards: [
          {
            id: 'card-require-usable-play',
            title: 'Play-time Viability Required',
            sideMode: 'single',
            unshaded: {
              text: 'Only playable when grant is usable.',
              freeOperationGrants: [
                {
                  seat: 'self',
                  sequence: { chain: 'nva-unusable', step: 0 },
                  operationClass: 'operation',
                  actionIds: ['operation'],
                  viabilityPolicy: 'requireUsableForEventPlay',
                  zoneFilter: {
                    op: '==',
                    left: { ref: 'zoneProp', zone: '$zone', prop: 'country' },
                    right: 'laos',
                  },
                },
              ],
            },
          },
          {
            id: 'card-require-usable-play-outcome',
            title: 'Play-time Viability Requires Non-Noop Completion',
            sideMode: 'single',
            unshaded: {
              text: 'Only playable when grant can complete with a gameplay-state change.',
              freeOperationGrants: [
                {
                  seat: 'self',
                  sequence: { chain: 'outcome-unusable', step: 0 },
                  operationClass: 'operation',
                  actionIds: ['operation'],
                  viabilityPolicy: 'requireUsableForEventPlay',
                  completionPolicy: 'required',
                  outcomePolicy: 'mustChangeGameplayState',
                  postResolutionTurnFlow: 'resumeCardFlow',
                  zoneFilter: {
                    op: '==',
                    left: { ref: 'zoneProp', zone: '$zone', prop: 'country' },
                    right: 'cambodia',
                  },
                },
              ],
            },
          },
          {
            id: 'card-require-usable-issue',
            title: 'Issue-time Viability Required',
            sideMode: 'single',
            unshaded: {
              text: 'Emit only the grants that are currently usable.',
              freeOperationGrants: [
                {
                  seat: 'self',
                  sequence: { chain: 'issue-usable', step: 0 },
                  operationClass: 'operation',
                  actionIds: ['operation'],
                  viabilityPolicy: 'requireUsableAtIssue',
                  zoneFilter: {
                    op: '==',
                    left: { ref: 'zoneProp', zone: '$zone', prop: 'country' },
                    right: 'cambodia',
                  },
                },
                {
                  seat: 'self',
                  sequence: { chain: 'issue-unusable', step: 0 },
                  operationClass: 'operation',
                  actionIds: ['operation'],
                  viabilityPolicy: 'requireUsableAtIssue',
                  zoneFilter: {
                    op: '==',
                    left: { ref: 'zoneProp', zone: '$zone', prop: 'country' },
                    right: 'laos',
                  },
                },
              ],
            },
          },
          {
            id: 'card-effect-require-usable-issue',
            title: 'Effect Issue-time Viability Required',
            sideMode: 'single',
            unshaded: {
              text: 'Effect-issued grants emit only when currently usable.',
              effects: [
                {
                  grantFreeOperation: {
                    seat: 'self',
                    operationClass: 'operation',
                    actionIds: ['operation'],
                    viabilityPolicy: 'requireUsableAtIssue',
                    zoneFilter: {
                      op: '==',
                      left: { ref: 'zoneProp', zone: '$zone', prop: 'country' },
                      right: 'cambodia',
                    },
                  },
                },
                {
                  grantFreeOperation: {
                    seat: 'self',
                    operationClass: 'operation',
                    actionIds: ['operation'],
                    viabilityPolicy: 'requireUsableAtIssue',
                    zoneFilter: { op: '==', left: 1, right: 2 },
                  },
                },
              ],
            },
          },
          {
            id: 'card-effect-require-usable-issue-sequence',
            title: 'Effect Issue-time Viability Sequence Required',
            sideMode: 'single',
            unshaded: {
              text: 'Later sequence steps are not emitted when earlier steps are currently unusable.',
              effects: [
                {
                  grantFreeOperation: {
                    seat: 'self',
                    operationClass: 'operation',
                    actionIds: ['operation'],
                    sequence: { chain: 'effect-issue-seq', step: 0 },
                    viabilityPolicy: 'requireUsableAtIssue',
                    zoneFilter: { op: '==', left: 1, right: 2 },
                  },
                },
                {
                  grantFreeOperation: {
                    seat: 'self',
                    operationClass: 'operation',
                    actionIds: ['operation'],
                    sequence: { chain: 'effect-issue-seq', step: 1 },
                    viabilityPolicy: 'requireUsableAtIssue',
                  },
                },
              ],
            },
          },
          {
            id: 'card-effect-require-usable-issue-sequence-usable',
            title: 'Effect Issue-time Viability Sequence Usable',
            sideMode: 'single',
            unshaded: {
              text: 'Later sequence steps are emitted when earlier steps are currently usable.',
              effects: [
                {
                  grantFreeOperation: {
                    seat: 'self',
                    operationClass: 'operation',
                    actionIds: ['operation'],
                    sequence: { chain: 'effect-issue-seq-usable', step: 0 },
                    viabilityPolicy: 'requireUsableAtIssue',
                    zoneFilter: {
                      op: '==',
                      left: { ref: 'zoneProp', zone: '$zone', prop: 'country' },
                      right: 'cambodia',
                    },
                  },
                },
                {
                  grantFreeOperation: {
                    seat: 'self',
                    operationClass: 'operation',
                    actionIds: ['operation'],
                    sequence: { chain: 'effect-issue-seq-usable', step: 1 },
                    viabilityPolicy: 'requireUsableAtIssue',
                  },
                },
              ],
            },
          },
          {
            id: 'card-effect-require-usable-issue-sequence-nested',
            title: 'Effect Issue-time Viability Sequence Nested Required',
            sideMode: 'single',
            unshaded: {
              text: 'Nested later sequence steps are not emitted when earlier nested steps are currently unusable.',
              effects: [
                {
                  if: {
                    when: { op: '==', left: 1, right: 1 },
                    then: [
                      {
                        grantFreeOperation: {
                          seat: 'self',
                          operationClass: 'operation',
                          actionIds: ['operation'],
                          sequence: { chain: 'effect-issue-seq-nested', step: 0 },
                          viabilityPolicy: 'requireUsableAtIssue',
                          zoneFilter: { op: '==', left: 1, right: 2 },
                        },
                      },
                      {
                        grantFreeOperation: {
                          seat: 'self',
                          operationClass: 'operation',
                          actionIds: ['operation'],
                          sequence: { chain: 'effect-issue-seq-nested', step: 1 },
                          viabilityPolicy: 'requireUsableAtIssue',
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
          {
            id: 'card-effect-require-usable-issue-sequence-nested-usable',
            title: 'Effect Issue-time Viability Sequence Nested Usable',
            sideMode: 'single',
            unshaded: {
              text: 'Nested later sequence steps are emitted when earlier nested steps are currently usable.',
              effects: [
                {
                  if: {
                    when: { op: '==', left: 1, right: 1 },
                    then: [
                      {
                        grantFreeOperation: {
                          seat: 'self',
                          operationClass: 'operation',
                          actionIds: ['operation'],
                          sequence: { chain: 'effect-issue-seq-nested-usable', step: 0 },
                          viabilityPolicy: 'requireUsableAtIssue',
                          zoneFilter: {
                            op: '==',
                            left: { ref: 'zoneProp', zone: '$zone', prop: 'country' },
                            right: 'cambodia',
                          },
                        },
                      },
                      {
                        grantFreeOperation: {
                          seat: 'self',
                          operationClass: 'operation',
                          actionIds: ['operation'],
                          sequence: { chain: 'effect-issue-seq-nested-usable', step: 1 },
                          viabilityPolicy: 'requireUsableAtIssue',
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      } as EventDeckDef,
    ],
  }) as unknown as GameDef;

const createExecuteAsSeatSpecialActivityDef = (): GameDef =>
  ({
    metadata: { id: 'event-free-op-execute-as-special-activity-int', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
    seats: [{ id: 'US' }, { id: 'ARVN' }],
    constants: {},
    globalVars: [{ name: 'executeAsMarker', type: 'int', init: 0, min: 0, max: 999 }],
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
            seats: ['US', 'ARVN'],
          },
          windows: [],
          actionClassByActionId: { airStrike: 'specialActivity' },
          optionMatrix: [{ first: 'event', second: ['operationPlusSpecialActivity'] }],
          passRewards: [],
          freeOperationActionIds: ['airStrike'],
          durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
        },
      },
    },
    actions: [
      {
        id: asActionId('event'),
capabilities: ['cardEvent'],
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
        params: [
          { name: 'eventCardId', domain: { query: 'enums', values: ['card-13'] } },
          { name: 'side', domain: { query: 'enums', values: ['unshaded'] } },
          { name: 'branch', domain: { query: 'enums', values: ['none'] } },
        ],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
      {
        id: asActionId('airStrike'),
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
        id: 'air-strike-as-us',
        actionId: asActionId('airStrike'),
        applicability: { op: '==', left: { ref: 'activePlayer' }, right: 0 },
        legality: null,
        costValidation: null,
        costEffects: [],
        targeting: {},
        stages: [{ effects: [{ setVar: { scope: 'global', var: 'executeAsMarker', value: 300 } }] }],
        atomicity: 'atomic',
      },
    ],
    triggers: [],
    terminal: { conditions: [] },
    eventDecks: [
      {
        id: 'event-deck',
        drawZone: 'deck:none',
        discardZone: 'played:none',
        cards: [
          {
            id: 'card-13',
            title: 'Execute As Faction Special Activity',
            sideMode: 'single',
            unshaded: {
              text: 'Faction 1 executes Air Strike as if faction 0.',
              freeOperationGrants: [
                {
                  seat: 'ARVN',
                  executeAsSeat: 'US',
                  sequence: { chain: 'execute-as-faction-sa', step: 0 },
                  operationClass: 'operation',
                  actionIds: ['airStrike'],
                },
              ],
            },
          },
        ],
      } as EventDeckDef,
    ],
  }) as unknown as GameDef;

const createMonsoonGrantBypassDef = (): GameDef => {
  const def = createDef() as unknown as {
    turnOrder: {
      type: 'cardDriven';
      config: {
        turnFlow: {
          monsoon?: { restrictedActions: Array<{ actionId: string }> };
        };
      };
    };
    actions: Array<{
      id: ReturnType<typeof asActionId>;
      params: Array<{ name: string; domain?: { query: string; values?: string[] } }>;
    }>;
    eventDecks: EventDeckDef[];
  };

  def.turnOrder.config.turnFlow.monsoon = {
    restrictedActions: [{ actionId: 'operation' }],
  };

  const eventAction = def.actions.find((action) => String(action.id) === 'event');
  const eventCardParam = eventAction?.params.find((param) => param.name === 'eventCardId');
  if (eventCardParam?.domain?.values !== undefined) {
    if (!eventCardParam.domain.values.includes('card-11')) {
      eventCardParam.domain.values.push('card-11');
    }
    if (!eventCardParam.domain.values.includes('card-12')) {
      eventCardParam.domain.values.push('card-12');
    }
  }

  const primaryDeck = def.eventDecks[0];
  if (primaryDeck !== undefined) {
    const card11: EventCardDef = {
      id: 'card-11',
      title: 'Monsoon Override Grant',
      sideMode: 'single',
      unshaded: {
        text: 'Grant VC a free operation that is still legal during monsoon restrictions.',
        freeOperationGrants: [
          {
            seat: 'VC',
            sequence: { chain: 'vc-monsoon-op', step: 0 },
            operationClass: 'operation',
            actionIds: ['operation'],
            allowDuringMonsoon: true,
          },
        ],
      },
    };
    const card12: EventCardDef = {
      id: 'card-12',
      title: 'Monsoon Restricted Grant',
      sideMode: 'single',
      unshaded: {
        text: 'Grant VC a free operation without monsoon bypass.',
        freeOperationGrants: [
          {
            seat: 'VC',
            sequence: { chain: 'vc-monsoon-blocked-op', step: 0 },
            operationClass: 'operation',
            actionIds: ['operation'],
          },
        ],
      },
    };
    def.eventDecks[0] = { ...primaryDeck, cards: [...primaryDeck.cards, card11, card12] };
  }

  return def as unknown as GameDef;
};

describe('event free-operation grants integration', () => {
  it('creates pending free-operation grants from event side declarations', () => {
    const def = createDef();
    const start = initialState(def, 9, 4).state;

    const first = applyMove(def, start, {
      actionId: asActionId('event'),
      params: { eventCardId: 'card-1', side: 'unshaded', branch: 'none' },
    }).state;
    const second = applyMove(def, first, { actionId: asActionId('operation'), params: {} }).state;

    const runtime = requireCardDrivenRuntime(second);
    assert.equal(runtime.pendingFreeOperationGrants?.length, 1);
    assert.equal(runtime.pendingFreeOperationGrants?.[0]?.seat, 'VC');
    assert.equal(runtime.pendingFreeOperationGrants?.[0]?.operationClass, 'operation');
    assert.deepEqual(runtime.pendingFreeOperationGrants?.[0]?.actionIds, ['operation']);
    assert.equal(runtime.pendingFreeOperationGrants?.[0]?.remainingUses, 1);
    assert.equal(typeof runtime.pendingFreeOperationGrants?.[0]?.grantId, 'string');
    assert.equal(second.activePlayer, asPlayerId(2));

    const nvaMoves = legalMoves(def, second).filter((move) => String(move.actionId) === 'operation');
    assert.equal(nvaMoves.some((move) => move.freeOperation === true), false);

    const third = applyMove(def, second, { actionId: asActionId('operation'), params: {} }).state;
    assert.equal(third.activePlayer, asPlayerId(3));
    const vcMoves = legalMoves(def, third).filter((move) => String(move.actionId) === 'operation');
    assert.equal(vcMoves.some((move) => move.freeOperation === true), true);
  });

  it('enumerates class-distinct free-operation variants without dedup collision', () => {
    const def = createClassAwareDedupDef();
    const start = initialState(def, 27, 4).state;

    const first = applyMove(def, start, {
      actionId: asActionId('event'),
      params: { eventCardId: 'card-10', side: 'unshaded', branch: 'none' },
    }).state;
    const second = applyMove(def, first, { actionId: asActionId('operation'), params: {} }).state;
    const third = applyMove(def, second, { actionId: asActionId('operation'), params: {} }).state;
    const pending = requireCardDrivenRuntime(third).pendingFreeOperationGrants ?? [];
    assert.equal(pending.length, 2);
    assert.equal(pending.some((grant) => grant.operationClass === 'operation'), true);

    const firstRun = legalMoves(def, third).filter((move) => String(move.actionId) === 'operation' && move.freeOperation === true);
    const secondRun = legalMoves(def, third).filter((move) => String(move.actionId) === 'operation' && move.freeOperation === true);

    assert.equal(firstRun.length > 0, true);
    assert.deepEqual(secondRun, firstRun);
  });

  it('creates pending free-operation grants from event branch declarations', () => {
    const def = createDef();
    const start = initialState(def, 10, 4).state;

    const first = applyMove(def, start, {
      actionId: asActionId('event'),
      params: { eventCardId: 'card-2', side: 'unshaded', branch: 'branch-grant-nva' },
    }).state;
    const second = applyMove(def, first, { actionId: asActionId('operation'), params: {} }).state;

    const runtime = requireCardDrivenRuntime(second);
    assert.equal(runtime.pendingFreeOperationGrants?.length, 1);
    assert.equal(runtime.pendingFreeOperationGrants?.[0]?.seat, 'NVA');
    assert.equal(runtime.pendingFreeOperationGrants?.[0]?.operationClass, 'operation');
    assert.deepEqual(runtime.pendingFreeOperationGrants?.[0]?.actionIds, ['operation']);
    assert.equal(runtime.pendingFreeOperationGrants?.[0]?.remainingUses, 1);
    assert.equal(typeof runtime.pendingFreeOperationGrants?.[0]?.grantId, 'string');
    const nvaMoves = legalMoves(def, second).filter((move) => String(move.actionId) === 'operation');
    assert.equal(nvaMoves.some((move) => move.freeOperation === true), true);
  });

  it('creates pending free-operation grants from event effect execution', () => {
    const def = createDef();
    const start = initialState(def, 12, 4).state;

    const first = applyMove(def, start, {
      actionId: asActionId('event'),
      params: { eventCardId: 'card-9', side: 'unshaded', branch: 'none' },
    }).state;
    const second = applyMove(def, first, { actionId: asActionId('operation'), params: {} }).state;
    const third = applyMove(def, second, { actionId: asActionId('operation'), params: {} }).state;

    const runtime = requireCardDrivenRuntime(third);
    assert.equal(runtime.pendingFreeOperationGrants?.length, 1);
    assert.equal(runtime.pendingFreeOperationGrants?.[0]?.seat, 'VC');
    assert.equal(runtime.pendingFreeOperationGrants?.[0]?.operationClass, 'operation');
    assert.deepEqual(runtime.pendingFreeOperationGrants?.[0]?.actionIds, ['operation']);
  });

  it('supports two consecutive free operations when two grants exist for one faction', () => {
    const def = createDef();
    const start = initialState(def, 17, 4).state;

    const first = applyMove(def, start, {
      actionId: asActionId('event'),
      params: { eventCardId: 'card-3', side: 'unshaded', branch: 'none' },
    }).state;
    const second = applyMove(def, first, { actionId: asActionId('operation'), params: {} }).state;
    const runtimeAfterCardPlay = requireCardDrivenRuntime(second);
    assert.equal(runtimeAfterCardPlay.pendingFreeOperationGrants?.length, 2);
    assert.equal(second.activePlayer, asPlayerId(2));

    const third = applyMove(def, second, { actionId: asActionId('operation'), params: {} }).state;
    assert.equal(third.activePlayer, asPlayerId(3));
    const vcMovesFirstWindow = legalMoves(def, third).filter((move) => String(move.actionId) === 'operation');
    assert.equal(vcMovesFirstWindow.some((move) => move.freeOperation === true), true);

    const fourth = applyMove(def, third, { actionId: asActionId('operation'), params: {}, freeOperation: true }).state;
    assert.equal(requireCardDrivenRuntime(fourth).pendingFreeOperationGrants?.length, 1);
    const vcMovesSecondWindow = legalMoves(def, fourth).filter((move) => String(move.actionId) === 'operation');
    assert.equal(vcMovesSecondWindow.some((move) => move.freeOperation === true), true);

    const fifth = applyMove(def, fourth, { actionId: asActionId('operation'), params: {}, freeOperation: true }).state;
    assert.deepEqual(requireCardDrivenRuntime(fifth).pendingFreeOperationGrants ?? [], []);
  });

  it('tracks reusable grants with remainingUses and stable explicit grant id', () => {
    const def = createDef();
    const start = initialState(def, 18, 4).state;

    const first = applyMove(def, start, {
      actionId: asActionId('event'),
      params: { eventCardId: 'card-4', side: 'unshaded', branch: 'none' },
    }).state;
    const second = applyMove(def, first, { actionId: asActionId('operation'), params: {} }).state;
    const third = applyMove(def, second, { actionId: asActionId('operation'), params: {} }).state;
    const beforeFreeUse = requireCardDrivenRuntime(third).pendingFreeOperationGrants ?? [];
    assert.equal(beforeFreeUse.length, 1);
    assert.equal(beforeFreeUse[0]?.grantId, 'vc-reusable-op');
    assert.equal(beforeFreeUse[0]?.remainingUses, 2);

    const fourth = applyMove(def, third, { actionId: asActionId('operation'), params: {}, freeOperation: true }).state;
    const afterFirstUse = requireCardDrivenRuntime(fourth).pendingFreeOperationGrants ?? [];
    assert.equal(afterFirstUse.length, 1);
    assert.equal(afterFirstUse[0]?.grantId, 'vc-reusable-op');
    assert.equal(afterFirstUse[0]?.remainingUses, 1);

    const fifth = applyMove(def, fourth, { actionId: asActionId('operation'), params: {}, freeOperation: true }).state;
    assert.deepEqual(requireCardDrivenRuntime(fifth).pendingFreeOperationGrants ?? [], []);
  });

  it('enforces operationClass on free-operation grants', () => {
    const def = createDef();
    const start = initialState(def, 21, 4).state;

    const first = applyMove(def, start, {
      actionId: asActionId('event'),
      params: { eventCardId: 'card-5', side: 'unshaded', branch: 'none' },
    }).state;
    const second = applyMove(def, first, { actionId: asActionId('operation'), params: {} }).state;
    const third = applyMove(def, second, { actionId: asActionId('operation'), params: {} }).state;

    assert.equal(third.activePlayer, asPlayerId(3));

    assert.throws(
      () => applyMove(def, third, { actionId: asActionId('operation'), params: {}, freeOperation: true, actionClass: 'operation' }),
      (error: unknown) => assertFreeOperationDenial(error, 'actionClassMismatch'),
    );

    const fourth = applyMove(def, third, {
      actionId: asActionId('operation'),
      params: {},
      freeOperation: true,
      actionClass: 'limitedOperation',
    }).state;
    assert.deepEqual(requireCardDrivenRuntime(fourth).pendingFreeOperationGrants ?? [], []);
  });

  it('enforces ordered same-faction grant chains within one event resolution', () => {
    const def = createDef();
    const start = initialState(def, 25, 4).state;

    const first = applyMove(def, start, {
      actionId: asActionId('event'),
      params: { eventCardId: 'card-6', side: 'unshaded', branch: 'none' },
    }).state;
    const second = applyMove(def, first, { actionId: asActionId('operation'), params: {} }).state;
    const third = applyMove(def, second, { actionId: asActionId('operation'), params: {} }).state;
    assert.equal(third.activePlayer, asPlayerId(3));

    assert.throws(
      () => applyMove(def, third, { actionId: asActionId('operation'), params: {}, freeOperation: true }),
      (error: unknown) => assertFreeOperationDenial(error, 'actionClassMismatch'),
    );

    const fourth = applyMove(def, third, {
      actionId: asActionId('operation'),
      params: {},
      freeOperation: true,
      actionClass: 'limitedOperation',
    }).state;
    const pendingAfterFirst = requireCardDrivenRuntime(fourth).pendingFreeOperationGrants ?? [];
    assert.equal(pendingAfterFirst.length, 1);
    assert.equal(pendingAfterFirst[0]?.operationClass, 'operation');

    const fifth = applyMove(def, fourth, {
      actionId: asActionId('operation'),
      params: {},
      freeOperation: true,
    }).state;
    assert.deepEqual(requireCardDrivenRuntime(fifth).pendingFreeOperationGrants ?? [], []);
  });

  it('enforces ordered cross-faction grant chains within one event resolution', () => {
    const def = createDef();
    const start = initialState(def, 26, 4).state;

    const first = applyMove(def, start, {
      actionId: asActionId('event'),
      params: { eventCardId: 'card-7', side: 'unshaded', branch: 'none' },
    }).state;
    const second = applyMove(def, first, { actionId: asActionId('operation'), params: {} }).state;
    assert.equal(second.activePlayer, asPlayerId(2));

    const nvaMoves = legalMoves(def, second).filter((move) => String(move.actionId) === 'operation');
    assert.equal(
      nvaMoves.some((move) => move.freeOperation === true),
      false,
      'NVA free operation should stay locked until the earlier VC sequence step is consumed',
    );

    assert.throws(
      () => applyMove(def, second, { actionId: asActionId('operation'), params: {}, freeOperation: true }),
      (error: unknown) => {
        assert.equal(assertFreeOperationDenial(error, 'sequenceLocked'), true);
        if (!(error instanceof Error)) {
          return false;
        }
        const details = error as Error & {
          readonly context?: {
            readonly freeOperationDenial?: {
              readonly matchingGrantIds?: readonly string[];
              readonly sequenceLockBlockingGrantIds?: readonly string[];
            };
          };
        };
        const matchingGrantIds = details.context?.freeOperationDenial?.matchingGrantIds ?? [];
        const blockingGrantIds = details.context?.freeOperationDenial?.sequenceLockBlockingGrantIds ?? [];
        assert.equal(matchingGrantIds.length > 0, true);
        assert.equal(blockingGrantIds.length > 0, true);
        assert.equal(blockingGrantIds.some((id) => matchingGrantIds.includes(id)), false);
        return true;
      },
    );
  });

  it('reports actionIdMismatch when grant actionIds exclude the attempted free action', () => {
    const def = createActionIdMismatchDef();
    const start = initialState(def, 41, 4).state;

    const first = applyMove(def, start, {
      actionId: asActionId('event'),
      params: { eventCardId: 'card-1', side: 'unshaded', branch: 'none' },
    }).state;
    const second = applyMove(def, first, { actionId: asActionId('operation'), params: {} }).state;
    const third = applyMove(def, second, { actionId: asActionId('operation'), params: {} }).state;
    assert.equal(third.activePlayer, asPlayerId(3));

    assert.throws(
      () => applyMove(def, third, { actionId: asActionId('operation'), params: {}, freeOperation: true }),
      (error: unknown) => assertFreeOperationDenial(error, 'actionIdMismatch'),
    );
  });

  it('reports noActiveSeatGrant when a different seat holds the pending free-operation grant', () => {
    const def = createDef();
    const start = initialState(def, 42, 4).state;

    const afterEvent = applyMove(def, start, {
      actionId: asActionId('event'),
      params: { eventCardId: 'card-1', side: 'unshaded', branch: 'none' },
    }).state;

    assert.notEqual(afterEvent.activePlayer, asPlayerId(3));

    assert.throws(
      () => applyMove(def, afterEvent, { actionId: asActionId('operation'), params: {}, freeOperation: true }),
      (error: unknown) => assertFreeOperationDenial(error, 'noActiveSeatGrant'),
    );
  });

  it('enforces Cambodia-only free-operation grants across discovery, decision flow, and final apply', () => {
    const def = createZoneFilteredDef();
    const start = initialState(def, 11, 3).state;

    const first = applyMove(def, start, {
      actionId: asActionId('event'),
      params: { eventCardId: 'card-75-like', side: 'unshaded', branch: 'none' },
    }).state;
    const second = applyMove(def, first, { actionId: asActionId('operation'), params: { 'decision:$zone': 'boardCambodia:none' } }).state;
    assert.equal(second.activePlayer, asPlayerId(2));

    const operationMoves = legalMoves(def, second).filter((move) => String(move.actionId) === 'operation');
    assert.equal(operationMoves.some((move) => move.freeOperation === true), true);

    assert.throws(
      () =>
        applyMove(def, second, {
          actionId: asActionId('operation'),
          params: { 'decision:$zone': 'boardVietnam:none' },
          freeOperation: true,
        }),
      (error: unknown) => assertFreeOperationDenial(error, 'zoneFilterMismatch'),
    );

    const third = applyMove(def, second, {
      actionId: asActionId('operation'),
      params: { 'decision:$zone': 'boardCambodia:none' },
      freeOperation: true,
    }).state;
    assert.deepEqual(requireCardDrivenRuntime(third).pendingFreeOperationGrants ?? [], []);
  });

  it('captures sequence context from consumed free operation and enforces same-zone follow-up grants', () => {
    const def = createSequenceContextDef();
    const start = initialState(def, 121, 2).state;

    const afterEvent = applyMove(def, start, {
      actionId: asActionId('event'),
      params: { eventCardId: 'card-sequence-context', side: 'unshaded', branch: 'none' },
    }).state;

    const grantReadyState: GameState = {
      ...afterEvent,
      activePlayer: asPlayerId(1),
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
          ...requireCardDrivenRuntime(afterEvent),
          currentCard: {
            ...requireCardDrivenRuntime(afterEvent).currentCard,
            firstEligible: 'NVA',
            secondEligible: null,
            actedSeats: [],
            passedSeats: [],
            nonPassCount: 0,
            firstActionClass: null,
          },
        },
      },
    };

    const afterFirstFreeOp = applyMove(def, grantReadyState, {
      actionId: asActionId('operation'),
      params: { 'decision:$zone': 'boardCambodia:none' },
      freeOperation: true,
    }).state;

    const runtimeAfterFirst = requireCardDrivenRuntime(afterFirstFreeOp);
    assert.equal(runtimeAfterFirst.pendingFreeOperationGrants?.length, 1);
    const sequenceBatchId = runtimeAfterFirst.pendingFreeOperationGrants?.[0]?.sequenceBatchId;
    assert.notEqual(sequenceBatchId, undefined);
    assert.deepEqual(
      runtimeAfterFirst.freeOperationSequenceContexts?.[sequenceBatchId!]?.capturedMoveZonesByKey?.['selected-space'],
      ['boardCambodia:none'],
    );

    assert.throws(
      () =>
        applyMove(def, afterFirstFreeOp, {
          actionId: asActionId('operation'),
          params: { 'decision:$zone': 'boardVietnam:none' },
          freeOperation: true,
        }),
      (error: unknown) => {
        if (!(error instanceof Error)) {
          return false;
        }
        const details = error as Error & {
          readonly reason?: string;
          readonly context?: {
            readonly freeOperationDenial?: {
              readonly cause?: string;
              readonly sequenceContextMismatchGrantIds?: readonly string[];
            };
          };
        };
        return (
          details.reason === ILLEGAL_MOVE_REASONS.FREE_OPERATION_NOT_GRANTED
          && details.context?.freeOperationDenial?.cause === 'sequenceContextMismatch'
          && (details.context?.freeOperationDenial?.sequenceContextMismatchGrantIds?.length ?? 0) > 0
        );
      },
    );

    const afterSecondFreeOp = applyMove(def, afterFirstFreeOp, {
      actionId: asActionId('operation'),
      params: { 'decision:$zone': 'boardCambodia:none' },
      freeOperation: true,
    }).state;
    const runtimeAfterSecond = requireCardDrivenRuntime(afterSecondFreeOp);
    assert.deepEqual(runtimeAfterSecond.pendingFreeOperationGrants ?? [], []);
    assert.equal(runtimeAfterSecond.freeOperationSequenceContexts, undefined);
  });

  it('accepts side capture plus branch require for event free-operation grants and enforces the captured zone at runtime', () => {
    const def = createSequenceContextDef();
    const start = initialState(def, 122, 2).state;

    const afterEvent = applyMove(def, start, {
      actionId: asActionId('event'),
      params: { eventCardId: 'card-sequence-context-branch', side: 'unshaded', branch: 'branch-follow-up' },
    }).state;

    const grantReadyState: GameState = {
      ...afterEvent,
      activePlayer: asPlayerId(1),
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
          ...requireCardDrivenRuntime(afterEvent),
          currentCard: {
            ...requireCardDrivenRuntime(afterEvent).currentCard,
            firstEligible: 'NVA',
            secondEligible: null,
            actedSeats: [],
            passedSeats: [],
            nonPassCount: 0,
            firstActionClass: null,
          },
        },
      },
    };

    const afterFirstFreeOp = applyMove(def, grantReadyState, {
      actionId: asActionId('operation'),
      params: { 'decision:$zone': 'boardCambodia:none' },
      freeOperation: true,
    }).state;

    assert.throws(
      () =>
        applyMove(def, afterFirstFreeOp, {
          actionId: asActionId('operation'),
          params: { 'decision:$zone': 'boardVietnam:none' },
          freeOperation: true,
        }),
      (error: unknown) => assertFreeOperationDenial(error, 'sequenceContextMismatch'),
    );

    const afterSecondFreeOp = applyMove(def, afterFirstFreeOp, {
      actionId: asActionId('operation'),
      params: { 'decision:$zone': 'boardCambodia:none' },
      freeOperation: true,
    }).state;

    const runtimeAfterSecond = requireCardDrivenRuntime(afterSecondFreeOp);
    assert.deepEqual(runtimeAfterSecond.pendingFreeOperationGrants ?? [], []);
    assert.equal(runtimeAfterSecond.freeOperationSequenceContexts, undefined);
  });

  it('accepts side effect-issued capture plus branch effect-issued require and issues both grants from the selected branch scope', () => {
    const def = createSequenceContextDef();
    const start = initialState(def, 123, 2).state;

    const afterEvent = applyMove(def, start, {
      actionId: asActionId('event'),
      params: {
        eventCardId: 'card-sequence-context-effect-branch',
        side: 'unshaded',
        branch: 'branch-effect-follow-up',
      },
    }).state;

    const runtime = requireCardDrivenRuntime(afterEvent);
    const grants = runtime.pendingFreeOperationGrants ?? [];
    assert.equal(grants.length, 2);
    assert.deepEqual(grants.map((grant) => grant.sequenceIndex), [0, 1]);
  });

  it('rejects nested effect-issued sequence context requires without an earlier capture', () => {
    const base = createGrantViabilityPolicyDef();
    const def = {
      ...base,
      eventDecks: base.eventDecks?.map((deck) => ({
        ...deck,
        cards: deck.cards.map((card) => {
          if (card.id !== 'card-effect-require-usable-issue-sequence-nested' || card.unshaded === undefined) {
            return card;
          }
          const effects = card.unshaded.effects ?? [];
          const rewrittenEffects = effects.map((effect) => {
            if (!('if' in effect)) {
              return effect;
            }
            return {
              if: {
                ...effect.if,
                then: effect.if.then.map((nestedEffect, nestedIndex) => {
                  if (!('grantFreeOperation' in nestedEffect) || nestedIndex !== 1) {
                    return nestedEffect;
                  }
                  return {
                    grantFreeOperation: {
                      ...nestedEffect.grantFreeOperation,
                      sequenceContext: { requireMoveZoneCandidatesFrom: 'selected-space' },
                    },
                  };
                }),
              },
            };
          });
          return {
            ...card,
            unshaded: {
              ...card.unshaded,
              effects: rewrittenEffects,
            },
          };
        }),
      })),
    } as GameDef;

    assert.throws(
      () => initialState(def, 111, 3),
      /FREE_OPERATION_SEQUENCE_CONTEXT_REQUIRE_CAPTURE_MISSING/,
    );
  });

  it('rejects nested effect-issued sequence context requires when capture exists only in sibling if.then path', () => {
    const base = createGrantViabilityPolicyDef();
    const def = {
      ...base,
      eventDecks: base.eventDecks?.map((deck) => ({
        ...deck,
        cards: deck.cards.map((card) => {
          if (card.id !== 'card-effect-require-usable-issue-sequence-nested' || card.unshaded === undefined) {
            return card;
          }
          const effects = card.unshaded.effects ?? [];
          const rewrittenEffects = effects.map((effect) => {
            if (!('if' in effect)) {
              return effect;
            }
            return {
              if: {
                ...effect.if,
                then: effect.if.then.map((nestedEffect, nestedIndex) => {
                  if (!('grantFreeOperation' in nestedEffect) || nestedIndex !== 0) {
                    return nestedEffect;
                  }
                  return {
                    grantFreeOperation: {
                      ...nestedEffect.grantFreeOperation,
                      sequenceContext: { captureMoveZoneCandidatesAs: 'selected-space' },
                    },
                  };
                }),
                else: [
                  {
                    grantFreeOperation: {
                      seat: 'self',
                      operationClass: 'operation',
                      actionIds: ['operation'],
                      sequence: { chain: 'effect-issue-seq-nested', step: 1 },
                      viabilityPolicy: 'requireUsableAtIssue',
                      sequenceContext: { requireMoveZoneCandidatesFrom: 'selected-space' },
                    },
                  },
                ],
              },
            };
          });
          return {
            ...card,
            unshaded: {
              ...card.unshaded,
              effects: rewrittenEffects,
            },
          };
        }),
      })),
    } as GameDef;

    assert.throws(
      () => initialState(def, 111, 3),
      /FREE_OPERATION_SEQUENCE_CONTEXT_REQUIRE_CAPTURE_MISSING/,
    );
  });

  it('suppresses event moves when requireUsableForEventPlay grants are currently unusable', () => {
    const def = createGrantViabilityPolicyDef();
    const start = initialState(def, 111, 3).state;
    const blockedEventMove = {
      actionId: asActionId('event'),
      params: { eventCardId: 'card-require-usable-play', side: 'unshaded', branch: 'none' },
    } as const;

    const moves = legalMoves(def, start).filter(
      (move) => String(move.actionId) === 'event' && move.params.eventCardId === 'card-require-usable-play',
    );
    assert.equal(moves.length, 0);

    assert.throws(
      () => applyMove(def, start, blockedEventMove),
      (error: unknown) => {
        if (!(error instanceof Error)) {
          return false;
        }
        const details = error as Error & { readonly reason?: string };
        return details.reason === ILLEGAL_MOVE_REASONS.MOVE_NOT_LEGAL_IN_CURRENT_STATE;
      },
    );
  });

  it('suppresses event moves when requireUsableForEventPlay cannot satisfy a required non-noop outcome', () => {
    const def = createGrantViabilityPolicyDef();
    const start = initialState(def, 211, 3).state;

    const moves = legalMoves(def, start).filter(
      (move) => String(move.actionId) === 'event' && move.params.eventCardId === 'card-require-usable-play-outcome',
    );
    assert.equal(moves.length, 0);
  });

  it('emits only currently-usable grants when requireUsableAtIssue is set', () => {
    const def = createGrantViabilityPolicyDef();
    const start = initialState(def, 112, 3).state;

    const afterEvent = applyMove(def, start, {
      actionId: asActionId('event'),
      params: { eventCardId: 'card-require-usable-issue', side: 'unshaded', branch: 'none' },
    }).state;

    const grants = requireCardDrivenRuntime(afterEvent).pendingFreeOperationGrants ?? [];
    assert.equal(grants.length, 1);
    assert.equal(grants[0]?.sequenceBatchId?.includes('issue-usable'), true);
  });

  it('applies requireUsableAtIssue parity for effect-issued grants', () => {
    const def = createGrantViabilityPolicyDef();
    const start = initialState(def, 113, 3).state;

    const afterEvent = applyMove(def, start, {
      actionId: asActionId('event'),
      params: { eventCardId: 'card-effect-require-usable-issue', side: 'unshaded', branch: 'none' },
    }).state;

    const grants = requireCardDrivenRuntime(afterEvent).pendingFreeOperationGrants ?? [];
    assert.equal(grants.length, 1);
    assert.equal(grants.every((grant) => grant.viabilityPolicy === 'requireUsableAtIssue'), true);
  });

  it('does not emit sequence-later effect grants when earlier requireUsableAtIssue steps are currently unusable', () => {
    const def = createGrantViabilityPolicyDef();
    const start = initialState(def, 114, 3).state;

    const afterEvent = applyMove(def, start, {
      actionId: asActionId('event'),
      params: { eventCardId: 'card-effect-require-usable-issue-sequence', side: 'unshaded', branch: 'none' },
    }).state;

    const grants = requireCardDrivenRuntime(afterEvent).pendingFreeOperationGrants ?? [];
    assert.equal(grants.length, 0);
  });

  it('emits sequence-later effect grants when earlier requireUsableAtIssue steps are currently usable', () => {
    const def = createGrantViabilityPolicyDef();
    const start = initialState(def, 115, 3).state;

    const afterEvent = applyMove(def, start, {
      actionId: asActionId('event'),
      params: { eventCardId: 'card-effect-require-usable-issue-sequence-usable', side: 'unshaded', branch: 'none' },
    }).state;

    const grants = requireCardDrivenRuntime(afterEvent).pendingFreeOperationGrants ?? [];
    assert.equal(grants.length, 2);
    assert.deepEqual(grants.map((grant) => grant.sequenceIndex), [0, 1]);
  });

  it('does not emit nested sequence-later effect grants when earlier nested requireUsableAtIssue steps are currently unusable', () => {
    const def = createGrantViabilityPolicyDef();
    const start = initialState(def, 116, 3).state;

    const afterEvent = applyMove(def, start, {
      actionId: asActionId('event'),
      params: { eventCardId: 'card-effect-require-usable-issue-sequence-nested', side: 'unshaded', branch: 'none' },
    }).state;

    const grants = requireCardDrivenRuntime(afterEvent).pendingFreeOperationGrants ?? [];
    assert.equal(grants.length, 0);
  });

  it('emits nested sequence-later effect grants when earlier nested requireUsableAtIssue steps are currently usable', () => {
    const def = createGrantViabilityPolicyDef();
    const start = initialState(def, 117, 3).state;

    const afterEvent = applyMove(def, start, {
      actionId: asActionId('event'),
      params: { eventCardId: 'card-effect-require-usable-issue-sequence-nested-usable', side: 'unshaded', branch: 'none' },
    }).state;

    const grants = requireCardDrivenRuntime(afterEvent).pendingFreeOperationGrants ?? [];
    assert.equal(grants.length, 2);
    assert.deepEqual(grants.map((grant) => grant.sequenceIndex), [0, 1]);
  });

  it('applies free-operation grants with executeAsSeat using the overridden action profile', () => {
    const def = createExecuteAsSeatDef();
    const start = initialState(def, 33, 2).state;

    const first = applyMove(def, start, {
      actionId: asActionId('event'),
      params: { eventCardId: 'card-8', side: 'unshaded', branch: 'none' },
    }).state;
    assert.equal(first.activePlayer, asPlayerId(1));

    const operationMoves = legalMoves(def, first).filter((move) => String(move.actionId) === 'operation');
    assert.equal(operationMoves.some((move) => move.freeOperation === true), true);

    const second = applyMove(def, first, { actionId: asActionId('operation'), params: {}, freeOperation: true }).state;
    assert.equal(second.globalVars.executeAsMarker, 100);
    assert.deepEqual(requireCardDrivenRuntime(second).pendingFreeOperationGrants ?? [], []);
  });

  it('applies executeAsSeat free-operation grants to special-activity actionIds', () => {
    const def = createExecuteAsSeatSpecialActivityDef();
    const start = initialState(def, 34, 2).state;

    const first = applyMove(def, start, {
      actionId: asActionId('event'),
      params: { eventCardId: 'card-13', side: 'unshaded', branch: 'none' },
    }).state;
    assert.equal(first.activePlayer, asPlayerId(1));

    const regularAirStrikeMoves = legalMoves(def, first).filter(
      (move) => String(move.actionId) === 'airStrike' && move.freeOperation !== true,
    );
    const freeAirStrikeMoves = legalMoves(def, first).filter(
      (move) => String(move.actionId) === 'airStrike' && move.freeOperation === true,
    );

    assert.equal(regularAirStrikeMoves.length, 0);
    assert.equal(freeAirStrikeMoves.length > 0, true);

    const second = applyMove(def, first, { actionId: asActionId('airStrike'), params: {}, freeOperation: true }).state;
    assert.equal(second.globalVars.executeAsMarker, 300);
    assert.deepEqual(requireCardDrivenRuntime(second).pendingFreeOperationGrants ?? [], []);
  });

  it('allows monsoon-restricted free operations only when the applicable grant explicitly allows monsoon execution', () => {
    const def = createMonsoonGrantBypassDef();
    const start = initialState(def, 77, 4).state;

    const afterAllowedEvent = applyMove(def, start, {
      actionId: asActionId('event'),
      params: { eventCardId: 'card-11', side: 'unshaded', branch: 'none' },
    }).state;
    const allowedRuntime = requireCardDrivenRuntime(afterAllowedEvent);
    const allowedMonsoonState = {
      ...afterAllowedEvent,
      activePlayer: asPlayerId(3),
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
          ...allowedRuntime,
          currentCard: {
            ...allowedRuntime.currentCard,
            firstEligible: 'VC',
            secondEligible: null,
          },
        },
      },
      zones: {
        ...afterAllowedEvent.zones,
        'lookahead:none': [{ id: asTokenId('monsoon-lookahead'), type: 'card', props: { isCoup: true } }],
      },
    } as GameState;

    const blockedNormal = legalMoves(def, allowedMonsoonState).filter(
      (move) => String(move.actionId) === 'operation' && move.freeOperation !== true,
    );
    const allowedFree = legalMoves(def, allowedMonsoonState).filter(
      (move) => String(move.actionId) === 'operation' && move.freeOperation === true,
    );
    const afterBlockedEvent = applyMove(def, start, {
      actionId: asActionId('event'),
      params: { eventCardId: 'card-12', side: 'unshaded', branch: 'none' },
    }).state;
    const blockedRuntime = requireCardDrivenRuntime(afterBlockedEvent);
    const blockedMonsoonState = {
      ...afterBlockedEvent,
      activePlayer: asPlayerId(3),
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
          ...blockedRuntime,
          currentCard: {
            ...blockedRuntime.currentCard,
            firstEligible: 'VC',
            secondEligible: null,
          },
        },
      },
      zones: {
        ...afterBlockedEvent.zones,
        'lookahead:none': [{ id: asTokenId('monsoon-lookahead'), type: 'card', props: { isCoup: true } }],
      },
    } as GameState;
    const blockedFree = legalMoves(def, blockedMonsoonState).filter(
      (move) => String(move.actionId) === 'operation' && move.freeOperation === true,
    );

    assert.equal(blockedNormal.length, 0, 'Monsoon restriction should block regular operation moves');
    assert.equal(allowedFree.length > 0, true, 'Grant-marked free operation should bypass monsoon restriction');
    assert.equal(blockedFree.length, 0, 'Free operation should be blocked when grant lacks monsoon allowance');
  });

  it('blocks pass during required grant windows and rejects free operations that fail outcome policy', () => {
    const def = createDef();
    const start = initialState(def, 88, 4).state;

    const afterEvent = applyMove(def, start, {
      actionId: asActionId('event'),
      params: { eventCardId: 'card-required-outcome', side: 'unshaded', branch: 'none' },
    }).state;

    assert.equal(afterEvent.activePlayer, asPlayerId(0));
    const moves = legalMoves(def, afterEvent);
    assert.equal(
      moves.some((move) => String(move.actionId) === 'pass'),
      false,
      'required pending grants should suppress pass during the obligation window',
    );
    assert.equal(
      moves.some((move) => String(move.actionId) === 'operation' && move.freeOperation === true),
      true,
      'required pending grants should still expose the matching free operation',
    );
    assert.equal(
      moves.some((move) => String(move.actionId) === 'operation' && move.freeOperation !== true),
      false,
      'required pending grants should suppress unrelated non-free actions',
    );

    assert.throws(
      () => applyMove(def, afterEvent, { actionId: asActionId('operation'), params: {}, freeOperation: true }),
      (error: unknown) => {
        if (!(error instanceof Error)) {
          return false;
        }
        const details = error as Error & {
          readonly reason?: string;
          readonly context?: {
            readonly grantId?: string;
            readonly outcomePolicy?: string;
          };
        };
        return (
          details.reason === ILLEGAL_MOVE_REASONS.FREE_OPERATION_OUTCOME_POLICY_FAILED
          && typeof details.context?.grantId === 'string'
          && details.context?.outcomePolicy === 'mustChangeGameplayState'
        );
      },
    );
  });

  it('rejects overlapping free operations that fail required outcome policy even when pending grants are reordered', () => {
    const def = createDef();
    const start = initialState(def, 90, 4).state;

    const afterEvent = applyMove(def, start, {
      actionId: asActionId('event'),
      params: { eventCardId: 'card-overlap-required-outcome', side: 'unshaded', branch: 'none' },
    }).state;

    assert.equal(afterEvent.turnOrderState.type, 'cardDriven');
    const emittedGrants = afterEvent.turnOrderState.runtime.pendingFreeOperationGrants ?? [];
    assert.equal(emittedGrants.length, 2);

    for (const state of [
      afterEvent,
      {
        ...afterEvent,
        turnOrderState: {
          type: 'cardDriven' as const,
          runtime: {
            ...afterEvent.turnOrderState.runtime,
            pendingFreeOperationGrants: [...emittedGrants].reverse(),
          },
        },
      },
    ]) {
      assert.throws(
        () => applyMove(def, state, { actionId: asActionId('operation'), params: {}, freeOperation: true }),
        (error: unknown) => {
          if (!(error instanceof Error)) {
            return false;
          }
          const details = error as Error & {
            readonly reason?: string;
            readonly context?: {
              readonly grantId?: string;
              readonly outcomePolicy?: string;
            };
          };
          return (
            details.reason === ILLEGAL_MOVE_REASONS.FREE_OPERATION_OUTCOME_POLICY_FAILED
            && typeof details.context?.grantId === 'string'
            && details.context?.grantId.includes('freeOp:')
            && details.context?.outcomePolicy === 'mustChangeGameplayState'
          );
        },
      );
    }
  });

  it('rejects ambiguous declarative event free-operation grants before play starts', () => {
    const def = createDef();
    const invalidDecks = (def.eventDecks ?? []).map((deck) => ({
      ...deck,
      cards: deck.cards.map((card) =>
        card.id !== 'card-1'
          ? card
          : {
              ...card,
              unshaded: {
                ...card.unshaded!,
                freeOperationGrants: [
                  {
                    seat: 'VC',
                    sequence: { chain: 'invalid-overlap-a', step: 0 },
                    operationClass: 'operation',
                    actionIds: ['operation'],
                    uses: 1,
                  },
                  {
                    seat: 'VC',
                    sequence: { chain: 'invalid-overlap-b', step: 0 },
                    operationClass: 'operation',
                    actionIds: ['operation'],
                    uses: 2,
                  },
                ],
              },
            }),
    })) as readonly EventDeckDef[];

    assert.throws(
      () => initialState({
        ...def,
        eventDecks: invalidDecks,
      }, 124, 4),
      /FREE_OPERATION_GRANT_OVERLAP_AMBIGUOUS/,
    );
  });

  it('rejects ambiguous effect-issued event free-operation grants before play starts', () => {
    const def = createDef();
    const invalidDecks = (def.eventDecks ?? []).map((deck) => ({
      ...deck,
      cards: deck.cards.map((card) =>
        card.id !== 'card-1'
          ? card
          : {
              ...card,
              unshaded: {
                ...card.unshaded!,
                effects: [
                  {
                    grantFreeOperation: {
                      seat: 'VC',
                      sequence: { chain: 'invalid-effect-overlap-a', step: 0 },
                      operationClass: 'operation',
                      actionIds: ['operation'],
                      sequenceContext: { captureMoveZoneCandidatesAs: 'selected-space' },
                    },
                  },
                  {
                    grantFreeOperation: {
                      seat: 'VC',
                      sequence: { chain: 'invalid-effect-overlap-b', step: 0 },
                      operationClass: 'operation',
                      actionIds: ['operation'],
                      sequenceContext: { captureMoveZoneCandidatesAs: 'selected-space' },
                    },
                  },
                ],
              },
            }),
    })) as readonly EventDeckDef[];

    assert.throws(
      () => initialState({
        ...def,
        eventDecks: invalidDecks,
      }, 125, 4),
      /FREE_OPERATION_GRANT_OVERLAP_AMBIGUOUS/,
    );
  });

  it('accepts effect-issued free-operation grants that only appear on mutually exclusive event paths', () => {
    const def = createDef();
    const validDecks = (def.eventDecks ?? []).map((deck) => ({
      ...deck,
      cards: deck.cards.map((card) =>
        card.id !== 'card-1'
          ? card
          : {
              ...card,
              unshaded: {
                ...card.unshaded!,
                effects: [
                  {
                    if: {
                      when: { op: '==', left: 1, right: 1 },
                      then: [
                        {
                          grantFreeOperation: {
                            seat: 'VC',
                            sequence: { chain: 'exclusive-effect-overlap-then', step: 0 },
                            operationClass: 'operation',
                            actionIds: ['operation'],
                            sequenceContext: { captureMoveZoneCandidatesAs: 'selected-space' },
                          },
                        },
                      ],
                      else: [
                        {
                          grantFreeOperation: {
                            seat: 'VC',
                            sequence: { chain: 'exclusive-effect-overlap-else', step: 0 },
                            operationClass: 'operation',
                            actionIds: ['operation'],
                            sequenceContext: { captureMoveZoneCandidatesAs: 'selected-space' },
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            }),
    })) as readonly EventDeckDef[];

    assert.doesNotThrow(() => initialState({
      ...def,
      eventDecks: validDecks,
    }, 126, 4));
  });

  it('resumes turn flow after a successful required free operation and advances to the next card candidates', () => {
    const def = createRequiredGrantResumeDef();
    const start = initialState(def, 89, 4).state;

    const afterEvent = applyMove(def, start, {
      actionId: asActionId('event'),
      params: { eventCardId: 'card-required-resume', side: 'unshaded', branch: 'none' },
    }).state;

    assert.equal(afterEvent.activePlayer, asPlayerId(1));
    const forcedMoves = legalMoves(def, afterEvent);
    assert.equal(
      forcedMoves.some((move) => String(move.actionId) === 'operation' && move.freeOperation === true),
      true,
      'required grant window should force the granted free operation',
    );
    assert.equal(
      forcedMoves.some((move) => String(move.actionId) === 'operation' && move.freeOperation !== true),
      false,
      'required grant window should suppress regular operations until resolution',
    );

    const afterRequiredOperation = applyMove(def, afterEvent, {
      actionId: asActionId('operation'),
      params: {},
      freeOperation: true,
    }).state;

    const runtime = requireCardDrivenRuntime(afterRequiredOperation);
    assert.equal(afterRequiredOperation.globalVars['opCount'], 1);
    assert.deepEqual(runtime.pendingFreeOperationGrants ?? [], []);
    assert.equal(afterRequiredOperation.activePlayer, asPlayerId(2));
    assert.deepEqual(runtime.currentCard, {
      firstEligible: 'NVA',
      secondEligible: 'VC',
      actedSeats: [],
      passedSeats: [],
      nonPassCount: 0,
      firstActionClass: null,
    });

    const followupMoves = legalMoves(def, afterRequiredOperation);
    assert.equal(
      followupMoves.some((move) => String(move.actionId) === 'operation' && move.freeOperation === true),
      false,
      'after resolution the next card should expose only ordinary moves',
    );
  });

  it('threads declarative grant executionContext into free-operation legality and effects', () => {
    const def = createExecutionContextGrantDef();
    const start = initialState(def, 501, 2).state;

    const afterEvent = applyMove(def, start, {
      actionId: asActionId('event'),
      params: { eventCardId: 'card-context', side: 'unshaded', branch: 'none' },
    }).state;

    const runtime = requireCardDrivenRuntime(afterEvent);
    assert.deepEqual(runtime.pendingFreeOperationGrants?.[0]?.executionContext, {
      allowedTargets: [2],
      effectCode: 7,
    });

    const freeMoves = legalMoves(def, afterEvent).filter(
      (move) => String(move.actionId) === 'operation' && move.freeOperation === true,
    );
    assert.deepEqual(freeMoves.map((move) => move.params.target), [2]);

    const afterOperation = applyMove(def, afterEvent, {
      actionId: asActionId('operation'),
      params: { target: 2 },
      freeOperation: true,
    }).state;

    assert.equal(afterOperation.globalVars.effectCode, 7);
    assert.equal(afterOperation.globalVars.selectedTarget, 2);
  });

  it('resolves effect-issued grant executionContext expressions before the free operation executes', () => {
    const def = createExecutionContextGrantDef();
    const start = initialState(def, 502, 2).state;

    const afterEvent = applyMove(def, start, {
      actionId: asActionId('event'),
      params: { eventCardId: 'card-context-effect', side: 'unshaded', branch: 'none' },
    }).state;

    const runtime = requireCardDrivenRuntime(afterEvent);
    assert.deepEqual(runtime.pendingFreeOperationGrants?.[0]?.executionContext, {
      allowedTargets: [1],
      effectCode: 9,
    });

    const freeMoves = legalMoves(def, afterEvent).filter(
      (move) => String(move.actionId) === 'operation' && move.freeOperation === true,
    );
    assert.deepEqual(freeMoves.map((move) => move.params.target), [1]);

    const afterOperation = applyMove(def, afterEvent, {
      actionId: asActionId('operation'),
      params: { target: 1 },
      freeOperation: true,
    }).state;

    assert.equal(afterOperation.globalVars.effectCode, 9);
    assert.equal(afterOperation.globalVars.selectedTarget, 1);
  });

  it('rejects overlapping declarative grants that differ only by executionContext', () => {
    const def = createExecutionContextGrantDef();
    const invalidDecks = (def.eventDecks ?? []).map((deck) => ({
      ...deck,
      cards: deck.cards.map((card) =>
        card.id !== 'card-context'
          ? card
          : {
              ...card,
              unshaded: {
                ...card.unshaded!,
                freeOperationGrants: [
                  {
                    seat: 'US',
                    sequence: { chain: 'context-a', step: 0 },
                    operationClass: 'operation',
                    actionIds: ['operation'],
                    executionContext: { allowedTargets: [1], effectCode: 3 },
                  },
                  {
                    seat: 'US',
                    sequence: { chain: 'context-b', step: 0 },
                    operationClass: 'operation',
                    actionIds: ['operation'],
                    executionContext: { allowedTargets: [2], effectCode: 4 },
                  },
                ],
              },
            }),
    })) as readonly EventDeckDef[];

    assert.throws(
      () => initialState({ ...def, eventDecks: invalidDecks }, 503, 2),
      /FREE_OPERATION_GRANT_OVERLAP_AMBIGUOUS/,
    );
  });

});
