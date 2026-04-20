import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asZoneId,
  type GameDef,
  type GameState,
  type Move,
} from '../../src/kernel/index.js';
import { asTaggedGameDef } from './gamedef-fixtures.js';
import { eff } from './effect-tag-helper.js';

const SUPPORTED_SPACE = 'space-13';
const SUPPORTED_FOLLOWUP = 'commit';

export interface Spec139CertificateSearchFixture {
  readonly def: GameDef;
  readonly state: GameState;
  readonly move: Move;
  readonly supportedSpace: string;
  readonly supportedFollowup: string;
  readonly isSupportedMove: (move: Move) => boolean;
}

const makeState = (): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  zoneVars: {},
  playerCount: 2,
  zones: {
    'board:none': [],
  },
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [17n, 31n] },
  stateHash: 0n,
  _runningHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
  reveals: undefined,
  globalMarkers: undefined,
  activeLastingEffects: undefined,
  interruptPhaseStack: undefined,
});

const makeDef = (): GameDef =>
  asTaggedGameDef({
    metadata: { id: 'spec-139-certificate-search-fixture', players: { min: 2, max: 2 } },
    seats: [{ id: '0' }, { id: '1' }],
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [{ id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set' }],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [{
      id: asActionId('certificate-search-op'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    }],
    actionPipelines: [{
      id: 'certificate-search-op-profile',
      actionId: asActionId('certificate-search-op'),
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [{
        effects: [
          eff({
            chooseN: {
              internalDecisionId: 'decision:$targetSpaces',
              bind: '$targetSpaces',
              options: {
                query: 'enums',
                values: Array.from({ length: 27 }, (_, index) => `space-${index}`),
              },
              min: 1,
              max: 27,
            },
          }) as GameDef['actions'][number]['effects'][number],
          eff({
            chooseOne: {
              internalDecisionId: 'decision:$followup',
              bind: '$followup',
              options: {
                query: 'enums',
                values: [SUPPORTED_FOLLOWUP, 'hold'],
              },
            },
          }) as GameDef['actions'][number]['effects'][number],
        ],
      }],
      atomicity: 'partial',
    }],
    triggers: [],
    terminal: { conditions: [] },
  });

const makeMove = (): Move => ({
  actionId: asActionId('certificate-search-op'),
  params: {},
});

const isSupportedMove = (move: Move): boolean => {
  const paramValues = Object.values(move.params);
  const selectedSpaces = paramValues.find((value): value is readonly string[] =>
    Array.isArray(value) && value.every((entry) => typeof entry === 'string'));
  const followup = paramValues.find((value): value is string => typeof value === 'string');
  return Array.isArray(selectedSpaces)
    && selectedSpaces.length === 1
    && selectedSpaces[0] === SUPPORTED_SPACE
    && followup === SUPPORTED_FOLLOWUP;
};

export const createSpec139CertificateSearchFixture = (): Spec139CertificateSearchFixture => ({
  def: makeDef(),
  state: makeState(),
  move: makeMove(),
  supportedSpace: SUPPORTED_SPACE,
  supportedFollowup: SUPPORTED_FOLLOWUP,
  isSupportedMove,
});
