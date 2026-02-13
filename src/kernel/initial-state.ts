import { asPlayerId } from './branded.js';
import { applyEffects } from './effects.js';
import { createRng } from './prng.js';
import { buildAdjacencyGraph } from './spatial.js';
import { initializeTurnFlowEligibilityState } from './turn-flow-eligibility.js';
import { applyTurnFlowInitialReveal } from './turn-flow-lifecycle.js';
import { dispatchTriggers } from './trigger-dispatch.js';
import { createCollector } from './execution-collector.js';
import type { GameDef, GameState } from './types.js';
import { computeFullHash, createZobristTable } from './zobrist.js';

const DEFAULT_MAX_TRIGGER_DEPTH = 8;

export const initialState = (def: GameDef, seed: number, playerCount?: number): GameState => {
  const resolvedPlayerCount = resolvePlayerCount(def, playerCount);
  const initialPhase = resolveInitialPhase(def);
  const rng = createRng(BigInt(seed));
  const adjacencyGraph = buildAdjacencyGraph(def.zones);

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
    markers: {},
  };

  const setupResult = applyEffects(def.setup, {
    def,
    adjacencyGraph,
    state: baseState,
    rng,
    activePlayer: baseState.activePlayer,
    actorPlayer: baseState.activePlayer,
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

const resolveInitialPhase = (def: GameDef): GameState['currentPhase'] => {
  const initialPhase = def.turnStructure.phases.at(0)?.id;
  if (initialPhase === undefined) {
    throw new Error('initialState requires at least one phase in turnStructure.phases');
  }

  return initialPhase;
};
