import { asPlayerId } from './branded.js';
import { applyEffects } from './effects.js';
import { createRng } from './prng.js';
import { buildAdjacencyGraph } from './spatial.js';
import { initializeTurnFlowEligibilityState } from './turn-flow-eligibility.js';
import { applyTurnFlowInitialReveal } from './turn-flow-lifecycle.js';
import { kernelRuntimeError } from './runtime-error.js';
import { dispatchTriggers } from './trigger-dispatch.js';
import { createCollector } from './execution-collector.js';
import type { GameDef, GameState } from './types.js';
import { computeFullHash, createZobristTable } from './zobrist.js';

const DEFAULT_MAX_TRIGGER_DEPTH = 8;

const parseFixedOrderPlayer = (playerId: string, playerCount: number): number | null => {
  const numeric = Number(playerId);
  if (!Number.isInteger(numeric) || numeric < 0 || numeric >= playerCount) {
    return null;
  }
  return numeric;
};

export const initialState = (def: GameDef, seed: number, playerCount?: number): GameState => {
  const resolvedPlayerCount = resolvePlayerCount(def, playerCount);
  const initialPhase = resolveInitialPhase(def);
  const initialTurnOrderState = resolveInitialTurnOrderState(def, resolvedPlayerCount);
  const rng = createRng(BigInt(seed));
  const adjacencyGraph = buildAdjacencyGraph(def.zones);
  const initialMarkers = buildInitialMarkers(def.spaceMarkers);
  const initialGlobalMarkers = buildInitialGlobalMarkers(def.globalMarkerLattices);

  const baseState: GameState = {
    globalVars: Object.fromEntries(def.globalVars.map((variable) => [variable.name, variable.init])),
    perPlayerVars: Object.fromEntries(
      Array.from({ length: resolvedPlayerCount }, (_, player) => [
        String(player),
        Object.fromEntries(def.perPlayerVars.map((variable) => [variable.name, variable.init])),
      ]),
    ),
    playerCount: resolvedPlayerCount,
    zones: Object.fromEntries(def.zones.map((zone) => [String(zone.id), []])),
    nextTokenOrdinal: 0,
    currentPhase: initialPhase,
    activePlayer: asPlayerId(0),
    turnCount: 0,
    rng: rng.state,
    stateHash: 0n,
    actionUsage: {},
    markers: initialMarkers,
    globalMarkers: initialGlobalMarkers,
    turnOrderState: initialTurnOrderState,
  };
  const withInitialActivePlayer = resolveInitialActivePlayer(baseState, def.turnOrder);

  const setupResult = applyEffects(def.setup, {
    def,
    adjacencyGraph,
    state: withInitialActivePlayer,
    rng,
    activePlayer: withInitialActivePlayer.activePlayer,
    actorPlayer: withInitialActivePlayer.activePlayer,
    bindings: {},
    moveParams: {},
    collector: createCollector(),
  });
  const lifecycleResult = applyTurnFlowInitialReveal(def, setupResult.state);
  const maxDepth = def.metadata.maxTriggerDepth ?? DEFAULT_MAX_TRIGGER_DEPTH;
  const turnStartResult = dispatchTriggers(
    def,
    lifecycleResult.state,
    setupResult.rng,
    { type: 'turnStart' },
    0,
    maxDepth,
    [],
    adjacencyGraph,
  );
  const phaseEnterResult = dispatchTriggers(
    def,
    turnStartResult.state,
    turnStartResult.rng,
    { type: 'phaseEnter', phase: initialPhase },
    0,
    maxDepth,
    turnStartResult.triggerLog,
    adjacencyGraph,
  );
  const stateWithRng = {
    ...phaseEnterResult.state,
    rng: phaseEnterResult.rng.state,
  };
  const withTurnFlow = initializeTurnFlowEligibilityState(def, stateWithRng);
  const table = createZobristTable(def);

  return {
    ...withTurnFlow,
    stateHash: computeFullHash(table, withTurnFlow),
  };
};

const resolvePlayerCount = (def: GameDef, playerCount: number | undefined): number => {
  const resolved = playerCount ?? def.metadata.players.min;
  if (!Number.isSafeInteger(resolved)) {
    throw new RangeError(`playerCount must be a safe integer, received ${String(resolved)}`);
  }

  const min = def.metadata.players.min;
  const max = def.metadata.players.max;
  if (resolved < min || resolved > max) {
    throw new RangeError(`playerCount ${resolved} is out of range [${min}, ${max}]`);
  }

  return resolved;
};

const resolveInitialTurnOrderState = (def: GameDef, playerCount: number): GameState['turnOrderState'] => {
  const strategy = def.turnOrder;
  if (strategy === undefined || strategy.type === 'roundRobin') {
    return { type: 'roundRobin' };
  }
  if (strategy.type === 'fixedOrder') {
    return { type: 'fixedOrder', currentIndex: 0 };
  }
  if (strategy.type === 'simultaneous') {
    return {
      type: 'simultaneous',
      submitted: Object.fromEntries(Array.from({ length: playerCount }, (_unused, index) => [String(index), false])),
      pending: {},
    };
  }
  return {
    type: 'cardDriven',
    runtime: {
      factionOrder: [],
      eligibility: {},
      currentCard: {
        firstEligible: null,
        secondEligible: null,
        actedFactions: [],
        passedFactions: [],
        nonPassCount: 0,
        firstActionClass: null,
      },
      pendingEligibilityOverrides: [],
    },
  };
};

const resolveInitialActivePlayer = (state: GameState, strategy: GameDef['turnOrder']): GameState => {
  if (strategy?.type !== 'fixedOrder') {
    return state;
  }
  const first = strategy.order[0];
  if (first === undefined) {
    return state;
  }
  const player = parseFixedOrderPlayer(first, state.playerCount);
  if (player === null) {
    return state;
  }
  return {
    ...state,
    activePlayer: asPlayerId(player),
  };
};

const resolveInitialPhase = (def: GameDef): GameState['currentPhase'] => {
  const initialPhase = def.turnStructure.phases.at(0)?.id;
  if (initialPhase === undefined) {
    throw kernelRuntimeError(
      'INITIAL_STATE_NO_PHASES',
      'initialState requires at least one phase in turnStructure.phases',
    );
  }

  return initialPhase;
};

const buildInitialMarkers = (spaceMarkers: GameDef['spaceMarkers']): GameState['markers'] => {
  if (spaceMarkers === undefined || spaceMarkers.length === 0) {
    return {};
  }

  const markers: Record<string, Record<string, string>> = {};
  for (const marker of spaceMarkers) {
    const currentSpaceMarkers = markers[marker.spaceId] ?? {};
    markers[marker.spaceId] = {
      ...currentSpaceMarkers,
      [marker.markerId]: marker.state,
    };
  }
  return markers;
};

const buildInitialGlobalMarkers = (
  globalMarkerLattices: GameDef['globalMarkerLattices'],
): Readonly<Record<string, string>> => {
  if (globalMarkerLattices === undefined || globalMarkerLattices.length === 0) {
    return {};
  }

  return Object.fromEntries(globalMarkerLattices.map((lattice) => [lattice.id, lattice.defaultState]));
};
