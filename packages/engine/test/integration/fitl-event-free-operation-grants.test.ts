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
            overrideWindows: [],
          },
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
          { name: 'eventCardId', domain: { query: 'enums', values: ['card-1', 'card-2', 'card-3', 'card-4', 'card-5', 'card-6', 'card-7', 'card-9'] } },
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
            overrideWindows: [],
          },
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
            overrideWindows: [],
          },
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
            overrideWindows: [],
          },
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
          { name: 'eventCardId', domain: { query: 'enums', values: ['card-require-usable-play', 'card-require-usable-issue'] } },
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
            overrideWindows: [],
          },
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
});
