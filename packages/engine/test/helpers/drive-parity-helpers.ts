import * as assert from 'node:assert/strict';

import { advanceAutoresolvable, createRng, initialState, terminalResult } from '../../src/kernel/index.js';
import type { GameDefRuntime } from '../../src/kernel/gamedef-runtime.js';
import { applyPublishedDecisionFromCanonicalState } from '../../src/kernel/microturn/apply.js';
import { applyPreviewDriveGreedyChooseOne } from '../../src/kernel/microturn/drive.js';
import { publishMicroturn, publishMicroturnGreedyChooseOne } from '../../src/kernel/microturn/publish.js';
import type { PreviewDriveOrigin, PreviewDriveResult } from '../../src/kernel/microturn/types.js';
import type { GameDef, GameState } from '../../src/kernel/types-core.js';
import { computeFullHash } from '../../src/kernel/zobrist.js';

export const PREVIEW_DEPTH_CAP = 8;
export const DETERMINISM_RUNS = 10;

export interface PreviewDriveFixture {
  readonly label: string;
  readonly state: GameState;
  readonly origin: PreviewDriveOrigin;
  readonly expectedMinDepth: number;
}

interface MutableBranchSnapshot {
  readonly decisionStack: GameState['decisionStack'];
  readonly globalVars: GameState['globalVars'];
  readonly perPlayerVars: GameState['perPlayerVars'];
  readonly zoneVars: GameState['zoneVars'];
  readonly zones: GameState['zones'];
  readonly actionUsage: GameState['actionUsage'];
  readonly markers: GameState['markers'];
  readonly reveals: GameState['reveals'];
  readonly globalMarkers: GameState['globalMarkers'];
  readonly activeLastingEffects: GameState['activeLastingEffects'];
  readonly interruptPhaseStack: GameState['interruptPhaseStack'];
  readonly turnOrderState: GameState['turnOrderState'];
}

const cloneState = (state: GameState): GameState => structuredClone(state) as GameState;

const snapshotMutableBranches = (state: GameState): MutableBranchSnapshot => structuredClone({
  decisionStack: state.decisionStack,
  globalVars: state.globalVars,
  perPlayerVars: state.perPlayerVars,
  zoneVars: state.zoneVars,
  zones: state.zones,
  actionUsage: state.actionUsage,
  markers: state.markers,
  reveals: state.reveals,
  globalMarkers: state.globalMarkers,
  activeLastingEffects: state.activeLastingEffects,
  interruptPhaseStack: state.interruptPhaseStack,
  turnOrderState: state.turnOrderState,
}) as MutableBranchSnapshot;

export const assertPreviewDriveDoesNotMutateInput = (
  def: GameDef,
  runtime: GameDefRuntime,
  fixture: PreviewDriveFixture,
): PreviewDriveResult => {
  const beforeStoredHash = fixture.state.stateHash;
  const beforeFullHash = computeFullHash(runtime.zobristTable, fixture.state);
  const beforeBranches = snapshotMutableBranches(fixture.state);

  const result = applyPreviewDriveGreedyChooseOne(
    def,
    fixture.state,
    fixture.origin,
    PREVIEW_DEPTH_CAP,
    runtime,
  );

  assert.equal(fixture.state.stateHash, beforeStoredHash, `${fixture.label}: stored input hash changed`);
  assert.equal(
    computeFullHash(runtime.zobristTable, fixture.state),
    beforeFullHash,
    `${fixture.label}: input content hash changed`,
  );
  assert.deepStrictEqual(
    snapshotMutableBranches(fixture.state),
    beforeBranches,
    `${fixture.label}: nested mutable branches changed`,
  );
  assert.equal(
    result.state.stateHash,
    computeFullHash(runtime.zobristTable, result.state),
    `${fixture.label}: returned state is not canonical`,
  );
  return result;
};

export const assertPreviewDriveDeterministic = (
  def: GameDef,
  runtime: GameDefRuntime,
  fixture: PreviewDriveFixture,
): void => {
  const results = Array.from({ length: DETERMINISM_RUNS }, () =>
    applyPreviewDriveGreedyChooseOne(def, fixture.state, fixture.origin, PREVIEW_DEPTH_CAP, runtime),
  );
  const first = results[0]!;
  for (const result of results.slice(1)) {
    assert.equal(result.kind, first.kind, `${fixture.label}: kind drifted`);
    assert.equal(result.depth, first.depth, `${fixture.label}: depth drifted`);
    assert.equal(result.state.stateHash, first.state.stateHash, `${fixture.label}: stateHash drifted`);
  }
};

export const replayPreviewDriveCanonically = (
  def: GameDef,
  initial: GameState,
  origin: PreviewDriveOrigin,
  depthCap: number,
  runtime: GameDefRuntime,
): PreviewDriveResult => {
  let state = initial;
  let depth = 0;
  let kind: PreviewDriveResult['kind'];

  while (true) {
    const top = state.decisionStack?.at(-1);
    if (top === undefined) {
      kind = 'completed';
      break;
    }

    const ctxKind = top.context.kind;
    if (
      ctxKind === 'actionSelection'
      || ctxKind === 'chooseNStep'
      || ctxKind === 'outcomeGrantResolve'
      || ctxKind === 'turnRetirement'
      || top.context.seatId !== origin.seatId
      || top.turnId !== origin.turnId
    ) {
      kind = 'completed';
      break;
    }

    if (ctxKind === 'stochasticResolve') {
      kind = 'stochastic';
      break;
    }

    if (depth >= depthCap) {
      kind = 'depthCap';
      break;
    }

    const greedy = publishMicroturnGreedyChooseOne(def, state, runtime);
    if (greedy === null) {
      return {
        state,
        depth,
        kind: 'failed',
        failureReason: 'noPreviewDecision',
      };
    }

    state = applyPublishedDecisionFromCanonicalState(
      def,
      state,
      greedy.microturn,
      greedy.decision,
      { advanceToDecisionPoint: true },
      runtime,
    ).state;
    depth += 1;
  }

  return { state, depth, kind };
};

export const assertPreviewDriveMatchesCanonicalReplay = (
  def: GameDef,
  runtime: GameDefRuntime,
  fixture: PreviewDriveFixture,
): void => {
  const drive = applyPreviewDriveGreedyChooseOne(
    def,
    fixture.state,
    fixture.origin,
    PREVIEW_DEPTH_CAP,
    runtime,
  );
  const canonical = replayPreviewDriveCanonically(
    def,
    fixture.state,
    fixture.origin,
    PREVIEW_DEPTH_CAP,
    runtime,
  );

  assert.equal(drive.kind, canonical.kind, `${fixture.label}: kind differs from canonical replay`);
  assert.equal(drive.depth, canonical.depth, `${fixture.label}: depth differs from canonical replay`);
  assert.equal(
    drive.state.stateHash,
    canonical.state.stateHash,
    `${fixture.label}: final hash differs from canonical replay`,
  );
  assert.ok(
    drive.depth >= fixture.expectedMinDepth,
    `${fixture.label}: expected depth >= ${fixture.expectedMinDepth}, got ${drive.depth}`,
  );
};

export const collectChooseOneDriveFixtures = (
  def: GameDef,
  runtime: GameDefRuntime,
  input: {
    readonly seed: number;
    readonly playerCount: number;
    readonly count: number;
    readonly expectedMinDepth: number;
    readonly maxSteps: number;
  },
): readonly PreviewDriveFixture[] => {
  let state = initialState(def, input.seed, input.playerCount, undefined, runtime).state;
  let rng = createRng(BigInt(input.seed) ^ 0x146dn);
  const fixtures: PreviewDriveFixture[] = [];

  for (let step = 0; step < input.maxSteps && fixtures.length < input.count; step += 1) {
    const auto = advanceAutoresolvable(def, state, rng, runtime);
    state = auto.state;
    rng = auto.rng;
    if (terminalResult(def, state, runtime) !== null) {
      break;
    }

    const microturn = publishMicroturn(def, state, runtime);
    for (const decision of microturn.legalActions) {
      const candidate = applyPublishedDecisionFromCanonicalState(
        def,
        state,
        microturn,
        decision,
        { advanceToDecisionPoint: true },
        runtime,
      ).state;
      const top = candidate.decisionStack?.at(-1);
      if (top?.context.kind !== 'chooseOne') {
        continue;
      }

      const origin = { seatId: top.context.seatId, turnId: top.turnId };
      const probe = applyPreviewDriveGreedyChooseOne(
        def,
        cloneState(candidate),
        origin,
        PREVIEW_DEPTH_CAP,
        runtime,
      );
      if (probe.depth < input.expectedMinDepth) {
        continue;
      }

      fixtures.push({
        label: `seed=${input.seed} step=${step} decision=${decision.kind}`,
        state: candidate,
        origin,
        expectedMinDepth: input.expectedMinDepth,
      });
      state = probe.state;
      break;
    }

    if (state.decisionStack?.at(-1)?.context.kind === 'chooseOne') {
      const top = state.decisionStack.at(-1)!;
      state = applyPreviewDriveGreedyChooseOne(
        def,
        state,
        { seatId: top.context.seatId, turnId: top.turnId },
        PREVIEW_DEPTH_CAP,
        runtime,
      ).state;
      continue;
    }

    if (fixtures.length < input.count && microturn.legalActions[0] !== undefined) {
      state = applyPublishedDecisionFromCanonicalState(
        def,
        state,
        microturn,
        microturn.legalActions[0],
        { advanceToDecisionPoint: true },
        runtime,
      ).state;
    }
  }

  assert.equal(
    fixtures.length,
    input.count,
    `expected ${input.count} chooseOne drive fixtures with depth >= ${input.expectedMinDepth}`,
  );
  return fixtures;
};

export const createInitialStateExitFixtures = (
  def: GameDef,
  runtime: GameDefRuntime,
  input: {
    readonly seeds: readonly number[];
    readonly playerCount: number;
  },
): readonly PreviewDriveFixture[] =>
  input.seeds.map((seed) => {
    const state = initialState(def, seed, input.playerCount, undefined, runtime).state;
    const seatId = state.activeDeciderSeatId;
    const turnId = state.nextTurnId;
    if (seatId === undefined) {
      throw new Error(`seed=${seed}: initial active decider missing`);
    }
    if (turnId === undefined) {
      throw new Error(`seed=${seed}: initial turn id missing`);
    }
    return {
      label: `seed=${seed} initial-state exit`,
      state,
      origin: {
        seatId,
        turnId,
      },
      expectedMinDepth: 0,
    };
  });
