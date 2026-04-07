import {
  asZoneId,
  type GameDef,
  type GameState,
} from '../../src/kernel/index.js';

export const SEQUENCE_CONTEXT_CAPTURE_ZONE_ID = 'board:cambodia';
export const SEQUENCE_CONTEXT_DENIED_ZONE_ID = 'board:vietnam';
export const SEQUENCE_CONTEXT_KEY = 'selected-space';
export const SEQUENCE_CONTEXT_BATCH_ID = 'batch-0';

export const createSequenceContextMismatchZones = (
  options?: {
    readonly includeAdjacency?: boolean;
  },
): GameDef['zones'] => {
  const baseZones: GameDef['zones'] = [
    {
      id: asZoneId(SEQUENCE_CONTEXT_CAPTURE_ZONE_ID),
      owner: 'none',
      visibility: 'public',
      ordering: 'set',
      category: 'province',
      attributes: { population: 1, econ: 0, terrainTags: [], country: 'cambodia', coastal: false },
    },
    {
      id: asZoneId(SEQUENCE_CONTEXT_DENIED_ZONE_ID),
      owner: 'none',
      visibility: 'public',
      ordering: 'set',
      category: 'province',
      attributes: { population: 1, econ: 0, terrainTags: [], country: 'southVietnam', coastal: false },
    },
  ];
  if (options?.includeAdjacency !== true) {
    return baseZones;
  }
  return baseZones.map((zone) => ({
    ...zone,
    adjacentTo: [],
  })) as GameDef['zones'];
};

export const createSequenceContextMismatchZoneState = (): GameState['zones'] => ({
  [SEQUENCE_CONTEXT_CAPTURE_ZONE_ID]: [],
  [SEQUENCE_CONTEXT_DENIED_ZONE_ID]: [],
});

export const createSequenceContextMismatchTurnOrderState = (): Extract<GameState['turnOrderState'], { type: 'cardDriven' }> => ({
  type: 'cardDriven',
  runtime: {
    seatOrder: ['0', '1'],
    eligibility: { '0': true, '1': true },
    currentCard: {
      firstEligible: '0',
      secondEligible: '1',
      actedSeats: [],
      passedSeats: [],
      nonPassCount: 0,
      firstActionClass: null,
    },
    pendingEligibilityOverrides: [],
    pendingFreeOperationGrants: [
      {
        grantId: 'grant-0',
        phase: 'ready',
        seat: '0',
        operationClass: 'operation',
        actionIds: ['operation'],
        sequenceBatchId: SEQUENCE_CONTEXT_BATCH_ID,
        sequenceIndex: 0,
        sequenceContext: {
          requireMoveZoneCandidatesFrom: SEQUENCE_CONTEXT_KEY,
        },
        remainingUses: 1,
      },
    ],
    freeOperationSequenceContexts: {
      [SEQUENCE_CONTEXT_BATCH_ID]: {
        capturedMoveZonesByKey: {
          [SEQUENCE_CONTEXT_KEY]: [SEQUENCE_CONTEXT_CAPTURE_ZONE_ID],
        },
        progressionPolicy: 'strictInOrder',
        skippedStepIndices: [],
      },
    },
  },
});
