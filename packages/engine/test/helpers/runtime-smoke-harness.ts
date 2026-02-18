import * as assert from 'node:assert/strict';

import {
  applyMove,
  createRng,
  initialState,
  legalMoves,
  nextInt,
  pickDeterministicChoiceValue,
  resolveMoveDecisionSequence,
  terminalResult,
  type ChoicePendingRequest,
  type GameDef,
  type GameState,
  type Move,
  type MoveParamValue,
} from '../../src/kernel/index.js';

export interface RuntimeSmokeInvariantContext {
  readonly def: GameDef;
  readonly state: GameState;
  readonly step: number;
  readonly appliedMoves: number;
  readonly seed: number;
  readonly playerCount: number;
  readonly policyId: string;
  readonly terminal: ReturnType<typeof terminalResult>;
}

export interface RuntimeSmokeInvariant {
  readonly id: string;
  readonly check: (context: RuntimeSmokeInvariantContext) => void;
}

export interface RuntimeSmokeSelectMoveContext {
  readonly moves: readonly Move[];
  readonly state: GameState;
  readonly step: number;
  readonly seed: number;
  readonly playerCount: number;
  readonly drawInt: (min: number, max: number) => number;
  readonly policyState: unknown;
}

export interface RuntimeSmokePolicyInitContext {
  readonly def: GameDef;
  readonly seed: number;
  readonly playerCount: number;
}

export interface RuntimeSmokePolicyAdvanceContext {
  readonly previousState: unknown;
  readonly move: Move;
  readonly postMoveState: GameState;
  readonly step: number;
  readonly seed: number;
  readonly playerCount: number;
}

export interface RuntimeSmokePolicy {
  readonly id: string;
  readonly selectMove: (context: RuntimeSmokeSelectMoveContext) => number;
  readonly chooseDecision?: (request: ChoicePendingRequest, context: RuntimeSmokeSelectMoveContext) => MoveParamValue | undefined;
  readonly initPolicyState?: (context: RuntimeSmokePolicyInitContext) => unknown;
  readonly advancePolicyState?: (context: RuntimeSmokePolicyAdvanceContext) => unknown;
}

export interface RuntimeSmokeGateConfig {
  readonly def: GameDef;
  readonly seed: number;
  readonly playerCount: number;
  readonly maxSteps: number;
  readonly minAppliedMoves?: number;
  readonly policy: RuntimeSmokePolicy;
  readonly bootstrapState?: (def: GameDef, seed: number, playerCount: number) => GameState;
  readonly invariants?: readonly RuntimeSmokeInvariant[];
}

export interface RuntimeSmokeGateResult {
  readonly appliedMoves: number;
  readonly terminalReached: boolean;
  readonly stateHashes: readonly bigint[];
  readonly actionIds: readonly string[];
  readonly finalState: GameState;
}

const MAX_DECISION_STEPS = 256;

const deterministicDefaultDecision = (request: ChoicePendingRequest): MoveParamValue => {
  const selected = pickDeterministicChoiceValue(request);
  if (selected !== undefined) {
    return selected;
  }
  return request.type === 'chooseN' ? [] : (null as unknown as MoveParamValue);
};

const assertNumericBounds = (def: GameDef, state: GameState): void => {
  for (const variable of def.globalVars) {
    if (variable.type !== 'int') {
      continue;
    }

    const value = Number(state.globalVars[variable.name]);
    assert.equal(Number.isFinite(value), true, `global var ${variable.name} must be finite`);
    assert.equal(value >= variable.min, true, `global var ${variable.name} must be >= ${variable.min}`);
    assert.equal(value <= variable.max, true, `global var ${variable.name} must be <= ${variable.max}`);
  }

  for (const variable of def.perPlayerVars) {
    if (variable.type !== 'int') {
      continue;
    }

    for (let player = 0; player < state.playerCount; player += 1) {
      const playerVars = state.perPlayerVars[String(player)] as Readonly<Record<string, unknown>> | undefined;
      const rawValue = playerVars?.[variable.name];
      const value: number = Number(rawValue);
      assert.equal(Number.isFinite(value), true, `player ${player} var ${variable.name} must be finite`);
      assert.equal(value >= variable.min, true, `player ${player} var ${variable.name} must be >= ${variable.min}`);
      assert.equal(value <= variable.max, true, `player ${player} var ${variable.name} must be <= ${variable.max}`);
    }
  }
};

const resolveMoveDecisionsForPolicy = (
  def: GameDef,
  state: GameState,
  move: Move,
  context: RuntimeSmokeSelectMoveContext,
  policy: RuntimeSmokePolicy,
): Move => {
  const decisionResult = resolveMoveDecisionSequence(def, state, move, {
    budgets: {
      maxDecisionProbeSteps: MAX_DECISION_STEPS,
    },
    choose: (request) => policy.chooseDecision?.(request, context) ?? deterministicDefaultDecision(request),
  });

  if (!decisionResult.complete) {
    const nextDecision = decisionResult.nextDecision;
    const detail =
      nextDecision === undefined
        ? `illegal=${decisionResult.illegal?.reason ?? 'unknown'}`
        : `decision=${nextDecision.decisionId} name=${nextDecision.name}`;
    throw new Error(`Could not complete move decisions for action ${String(move.actionId)}: ${detail}`);
  }

  return decisionResult.move;
};

const applyInvariants = (
  invariants: readonly RuntimeSmokeInvariant[],
  context: RuntimeSmokeInvariantContext,
): void => {
  for (const invariant of invariants) {
    try {
      invariant.check(context);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Runtime smoke invariant failed [${invariant.id}] policy=${context.policyId} seed=${context.seed} players=${context.playerCount} step=${context.step}: ${message}`,
      );
    }
  }
};

const executePath = (config: RuntimeSmokeGateConfig): RuntimeSmokeGateResult => {
  const bootstrapState = config.bootstrapState ?? ((def, seed, playerCount) => initialState(def, seed, playerCount));
  const invariants = config.invariants ?? [];

  let state = bootstrapState(config.def, config.seed, config.playerCount);
  let rng = createRng(BigInt(config.seed));
  let policyState = config.policy.initPolicyState?.({
    def: config.def,
    seed: config.seed,
    playerCount: config.playerCount,
  });
  let appliedMoves = 0;

  const stateHashes: bigint[] = [state.stateHash];
  const actionIds: string[] = [];

  while (appliedMoves < config.maxSteps && terminalResult(config.def, state) === null) {
    assertNumericBounds(config.def, state);
    applyInvariants(invariants, {
      def: config.def,
      state,
      step: appliedMoves,
      appliedMoves,
      seed: config.seed,
      playerCount: config.playerCount,
      policyId: config.policy.id,
      terminal: terminalResult(config.def, state),
    });

    const moves = legalMoves(config.def, state);
    assert.equal(
      moves.length > 0,
      true,
      `Runtime smoke stalled before terminal policy=${config.policy.id} seed=${config.seed} players=${config.playerCount} step=${appliedMoves}`,
    );

    const drawInt = (min: number, max: number): number => {
      const [value, nextRng] = nextInt(rng, min, max);
      rng = nextRng;
      return value;
    };
    const selectionContext: RuntimeSmokeSelectMoveContext = {
      moves,
      state,
      step: appliedMoves,
      seed: config.seed,
      playerCount: config.playerCount,
      drawInt,
      policyState,
    };
    const moveIndex = config.policy.selectMove(selectionContext);
    assert.equal(Number.isInteger(moveIndex), true, `Policy ${config.policy.id} returned a non-integer move index`);
    assert.equal(moveIndex >= 0 && moveIndex < moves.length, true, `Policy ${config.policy.id} selected out-of-range move index`);

    const selectedMove = moves[moveIndex]!;
    const completedMove = resolveMoveDecisionsForPolicy(config.def, state, selectedMove, selectionContext, config.policy);
    const next = applyMove(config.def, state, completedMove);

    state = next.state;
    if (config.policy.advancePolicyState !== undefined) {
      policyState = config.policy.advancePolicyState({
        previousState: policyState,
        move: completedMove,
        postMoveState: state,
        step: appliedMoves,
        seed: config.seed,
        playerCount: config.playerCount,
      });
    }
    appliedMoves += 1;

    stateHashes.push(state.stateHash);
    actionIds.push(String(completedMove.actionId));
  }

  assertNumericBounds(config.def, state);
  applyInvariants(invariants, {
    def: config.def,
    state,
    step: appliedMoves,
    appliedMoves,
    seed: config.seed,
    playerCount: config.playerCount,
    policyId: config.policy.id,
    terminal: terminalResult(config.def, state),
  });

  return {
    appliedMoves,
    terminalReached: terminalResult(config.def, state) !== null,
    stateHashes,
    actionIds,
    finalState: state,
  };
};

export const runRuntimeSmokeGate = (config: RuntimeSmokeGateConfig): RuntimeSmokeGateResult => {
  const first = executePath(config);
  const second = executePath(config);

  assert.deepEqual(
    first.stateHashes,
    second.stateHashes,
    `Runtime smoke determinism mismatch for policy=${config.policy.id} seed=${config.seed} players=${config.playerCount}`,
  );
  assert.deepEqual(
    first.actionIds,
    second.actionIds,
    `Runtime smoke action path mismatch for policy=${config.policy.id} seed=${config.seed} players=${config.playerCount}`,
  );

  if (config.minAppliedMoves !== undefined) {
    assert.equal(
      first.appliedMoves >= config.minAppliedMoves,
      true,
      `Runtime smoke applied ${first.appliedMoves} moves; expected at least ${config.minAppliedMoves} for policy=${config.policy.id} seed=${config.seed} players=${config.playerCount}`,
    );
  }

  return first;
};

export const firstLegalPolicy = (): RuntimeSmokePolicy => ({
  id: 'first-legal',
  selectMove: () => 0,
});

export const seededRandomLegalPolicy = (): RuntimeSmokePolicy => ({
  id: 'seeded-random-legal',
  selectMove: ({ moves, drawInt }) => drawInt(0, moves.length - 1),
});

export const selectorPolicy = (
  id: string,
  chooseMoveIndex: (context: RuntimeSmokeSelectMoveContext) => number,
): RuntimeSmokePolicy => ({
  id,
  selectMove: (context) => chooseMoveIndex(context),
});
