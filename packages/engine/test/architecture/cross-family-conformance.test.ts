// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { commitPlanExecutionState, type PlanExecutionStateStore } from '../../src/agents/plan-execution.js';
import { selectPlanControlledDecision } from '../../src/agents/plan-controller.js';
import { loadGameSpecBundleFromEntrypoint, runGameSpecStagesFromBundle } from '../../src/cnl/index.js';
import {
  applyPublishedDecision,
  assertValidatedGameDef,
  asSeatId,
  createGameDefRuntime,
  initialState,
  publishMicroturn,
  serializeGameState,
  terminalResult,
  type ChoiceTargetKind,
  type Decision,
  type DecisionContext,
  type DecisionContextKind,
  type GameState,
  type ValidatedGameDef,
} from '../../src/kernel/index.js';
import type { DecisionKey } from '../../src/kernel/decision-scope.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec, compileTexasProductionSpec } from '../helpers/production-spec-helpers.js';

const ALLOWED_DECISION_KINDS = new Set([
  'actionSelection',
  'chooseOne',
  'chooseNStep',
  'stochasticResolve',
  'outcomeGrantResolve',
  'turnRetirement',
]);

const FUZZ_GAME_COUNT = 20;
const FUZZ_MICROTURN_BOUND = 50;
const REPLAY_MICROTURN_BOUND = 40;

interface CorpusGame {
  readonly name: string;
  readonly playerCount: number;
  readonly compile: () => ValidatedGameDef;
  readonly invariants: {
    readonly compilerDeterminism: true;
    readonly legalityPublication: true;
    readonly planControllerFrontierAuthority: 'applies' | 'not_configured';
    readonly replayIdentity: true;
    readonly boundedSeededFuzz: true;
  };
  readonly matrixRationale: string;
}

const compileGenericControl = (): ValidatedGameDef => {
  const entrypoint = join(process.cwd(), '..', '..', 'data', 'games', 'generic-control.game-spec.md');
  const staged = runGameSpecStagesFromBundle(loadGameSpecBundleFromEntrypoint(entrypoint));

  assert.equal(staged.validation.blocked, false);
  assert.equal(staged.compilation.blocked, false);
  assert.deepEqual(staged.validation.diagnostics, []);
  assert.ok(staged.compilation.result, 'generic-control must produce a compile result');
  assert.deepEqual(staged.compilation.result.diagnostics, []);
  assert.ok(staged.compilation.result.gameDef, 'generic-control must compile to a GameDef');

  return assertValidatedGameDef(staged.compilation.result.gameDef);
};

const compileFitl = (): ValidatedGameDef => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assertNoErrors(compiled);
  return assertValidatedGameDef(compiled.gameDef);
};

const compileTexas = (): ValidatedGameDef => {
  const { parsed, compiled } = compileTexasProductionSpec();
  assertNoErrors(parsed);
  assertNoErrors(compiled);
  return assertValidatedGameDef(compiled.gameDef);
};

const CORPUS_GAMES: readonly CorpusGame[] = [
  {
    name: 'generic-control',
    playerCount: 2,
    compile: compileGenericControl,
    invariants: {
      compilerDeterminism: true,
      legalityPublication: true,
      planControllerFrontierAuthority: 'not_configured',
      replayIdentity: true,
      boundedSeededFuzz: true,
    },
    matrixRationale: 'perfect-information board axis; baseline profile has move considerations but no plan templates',
  },
  {
    name: 'fire-in-the-lake',
    playerCount: 4,
    compile: compileFitl,
    invariants: {
      compilerDeterminism: true,
      legalityPublication: true,
      planControllerFrontierAuthority: 'applies',
      replayIdentity: true,
      boundedSeededFuzz: true,
    },
    matrixRationale: 'asymmetric phase-heavy axis; production policy profiles exercise plan-controller paths',
  },
  {
    name: 'texas-holdem',
    playerCount: 6,
    compile: compileTexas,
    invariants: {
      compilerDeterminism: true,
      legalityPublication: true,
      planControllerFrontierAuthority: 'not_configured',
      replayIdentity: true,
      boundedSeededFuzz: true,
    },
    matrixRationale: 'hidden-information stochastic card axis; no plan-template profile is currently configured',
  },
];

type CorpusRun = ReturnType<typeof runDeterministicMicroturns>;

const decisionKey = (decision: Decision): string => JSON.stringify(decision);

const selectDecision = (
  microturn: ReturnType<typeof publishMicroturn>,
  seed: number,
  step: number,
): Decision => {
  const index = Math.abs(seed + step) % microturn.legalActions.length;
  return microturn.legalActions[index]!;
};

const planDecisionFixture = (
  context: DecisionContext,
  decisionKind: Decision['kind'],
  decisionPath: string,
  selectedId: string,
): readonly Decision[] => {
  if (decisionKind === 'chooseOne' && context.kind === 'chooseOne') {
    return [
      { kind: 'chooseOne', decisionKey: decisionPath as DecisionKey, value: selectedId },
      { kind: 'chooseOne', decisionKey: decisionPath as DecisionKey, value: 'alternate-target' },
    ];
  }
  if (decisionKind === 'chooseNStep' && context.kind === 'chooseNStep') {
    return [
      { kind: 'chooseNStep', decisionKey: decisionPath as DecisionKey, command: 'add', value: selectedId },
      { kind: 'chooseNStep', decisionKey: decisionPath as DecisionKey, command: 'add', value: 'alternate-target' },
      { kind: 'chooseNStep', decisionKey: decisionPath as DecisionKey, command: 'confirm' },
    ];
  }
  throw new Error(`unsupported plan-controller fixture decision kind: ${decisionKind}`);
};

const planDecisionContextFixture = (
  decisionKind: Decision['kind'],
  decisionPath: string,
  targetKind: ChoiceTargetKind,
  stageIndex: number | undefined,
): DecisionContext => {
  if (decisionKind === 'chooseOne') {
    return {
      kind: 'chooseOne',
      seatId: asSeatId('alpha'),
      decisionKey: decisionPath as DecisionKey,
      targetKinds: [targetKind],
      ...(stageIndex === undefined ? {} : { stageIndex }),
      options: [
        { value: 'selected-target', legality: 'legal', illegalReason: null },
        { value: 'alternate-target', legality: 'legal', illegalReason: null },
      ],
    };
  }
  if (decisionKind === 'chooseNStep') {
    return {
      kind: 'chooseNStep',
      seatId: asSeatId('alpha'),
      decisionKey: decisionPath as DecisionKey,
      targetKinds: [targetKind],
      ...(stageIndex === undefined ? {} : { stageIndex }),
      selectedSoFar: [],
      cardinality: { min: 1, max: 1 },
      stepCommands: ['add', 'confirm'],
      options: [
        { value: 'selected-target', legality: 'legal', illegalReason: null },
        { value: 'alternate-target', legality: 'legal', illegalReason: null },
      ],
    };
  }
  throw new Error(`unsupported plan-controller fixture context kind: ${decisionKind}`);
};

const assertPlanControllerFrontierAuthority = (game: CorpusGame, def: ValidatedGameDef): void => {
  if (game.invariants.planControllerFrontierAuthority === 'not_configured') {
    assert.equal(def.agents?.library.planTemplates === undefined, true);
    return;
  }

  const catalog = def.agents;
  assert.ok(catalog, `${game.name} must compile an agent catalog`);
  const [selectedTemplate, template] = Object.entries(catalog.library.planTemplates ?? {})[0] ?? [];
  assert.ok(selectedTemplate, `${game.name} must compile at least one plan template`);
  assert.ok(template, `${game.name} must compile at least one plan template`);
  const step = template.steps[0];
  assert.ok(step, `${game.name} plan template must include a controller step`);
  const selectedId = 'selected-target';
  const context = planDecisionContextFixture(
    step.match.decisionKind as DecisionContextKind,
    step.match.decisionPath,
    step.match.targetKind as ChoiceTargetKind,
    step.match.stageIndex,
  );
  const legalActions = planDecisionFixture(
    context,
    step.match.decisionKind as DecisionContextKind,
    step.match.decisionPath,
    selectedId,
  );
  const store: PlanExecutionStateStore = new Map();
  commitPlanExecutionState(store, {
    selectedTemplate,
    intent: selectedTemplate,
    roleBindings: {
      [step.role]: {
        role: step.role,
        selectedId,
        quality: 1,
        rank: 0,
        components: {},
      },
    },
    nextStepIndex: 0,
    fallbackHistory: [],
    deviations: [],
    turnId: '1',
    seatId: 'alpha',
  });

  const controlled = selectPlanControlledDecision({
    def,
    catalog,
    store,
    turnId: '1',
    seatId: 'alpha',
    legalActions,
    decisionContext: context,
  });

  assert.ok(controlled, `${game.name} plan controller should select from the fixture frontier`);
  assert.ok(
    legalActions.some((decision) => decisionKey(decision) === decisionKey(controlled.decision)),
    `${game.name} plan-controller decision must be in the supplied published frontier`,
  );
  assert.equal(controlled.planTrace.microturns?.[0]?.match, 'exact');
};

const runDeterministicMicroturns = (
  game: CorpusGame,
  def: ValidatedGameDef,
  seed: number,
  microturnBound: number,
): {
  readonly finalState: GameState;
  readonly decisions: readonly Decision[];
  readonly stopReason: 'terminal' | 'noLegalActions' | 'bound';
} => {
  const runtime = createGameDefRuntime(def);
  let state = initialState(def, seed, game.playerCount).state;
  const decisions: Decision[] = [];

  for (let step = 0; step < microturnBound; step += 1) {
    if (terminalResult(def, state) !== null) {
      return { finalState: state, decisions, stopReason: 'terminal' };
    }

    const microturn = publishMicroturn(def, state, runtime);
    assert.ok(ALLOWED_DECISION_KINDS.has(microturn.kind), `${game.name} published non-atomic decision kind`);
    assert.ok(microturn.legalActions.length > 0, `${game.name} published an empty legal frontier`);
    assert.ok(
      microturn.legalActions.every((decision) => decision.kind === microturn.kind),
      `${game.name} published mixed decision kinds in one microturn`,
    );

    const selected = selectDecision(microturn, seed, step);
    decisions.push(selected);
    state = applyPublishedDecision(def, state, microturn, selected, undefined, runtime).state;
  }

  return { finalState: state, decisions, stopReason: 'bound' };
};

describe('cross-family conformance corpus', () => {
  const compiled = CORPUS_GAMES.map((game) => ({ game, def: game.compile() }));

  it('documents the per-game invariant applicability matrix', () => {
    assert.deepEqual(
      CORPUS_GAMES.map((game) => ({
        name: game.name,
        invariants: game.invariants,
        rationale: game.matrixRationale,
      })),
      [
        {
          name: 'generic-control',
          invariants: {
            compilerDeterminism: true,
            legalityPublication: true,
            planControllerFrontierAuthority: 'not_configured',
            replayIdentity: true,
            boundedSeededFuzz: true,
          },
          rationale: 'perfect-information board axis; baseline profile has move considerations but no plan templates',
        },
        {
          name: 'fire-in-the-lake',
          invariants: {
            compilerDeterminism: true,
            legalityPublication: true,
            planControllerFrontierAuthority: 'applies',
            replayIdentity: true,
            boundedSeededFuzz: true,
          },
          rationale: 'asymmetric phase-heavy axis; production policy profiles exercise plan-controller paths',
        },
        {
          name: 'texas-holdem',
          invariants: {
            compilerDeterminism: true,
            legalityPublication: true,
            planControllerFrontierAuthority: 'not_configured',
            replayIdentity: true,
            boundedSeededFuzz: true,
          },
          rationale: 'hidden-information stochastic card axis; no plan-template profile is currently configured',
        },
      ],
    );
  });

  for (const game of CORPUS_GAMES) {
    it(`${game.name} compiles deterministically`, () => {
      assert.equal(JSON.stringify(game.compile()), JSON.stringify(game.compile()));
    });
  }

  for (const { game, def } of compiled) {
    it(`${game.name} publishes finite atomic frontiers on the initial state`, () => {
      const microturn = publishMicroturn(def, initialState(def, 198_002, game.playerCount).state, createGameDefRuntime(def));

      assert.ok(ALLOWED_DECISION_KINDS.has(microturn.kind));
      assert.ok(Number.isFinite(microturn.legalActions.length));
      assert.ok(microturn.legalActions.length > 0);
      assert.ok(microturn.legalActions.every((decision) => decision.kind === microturn.kind));
    });

    it(`${game.name} plan-controller frontier authority follows the matrix`, () => {
      assertPlanControllerFrontierAuthority(game, def);
    });

    it(`${game.name} replays the same deterministic decision stream to the same canonical state`, () => {
      const first: CorpusRun = runDeterministicMicroturns(game, def, 198_002, REPLAY_MICROTURN_BOUND);
      const second: CorpusRun = runDeterministicMicroturns(game, def, 198_002, REPLAY_MICROTURN_BOUND);

      assert.deepEqual(second.decisions, first.decisions);
      assert.deepEqual(serializeGameState(second.finalState), serializeGameState(first.finalState));
    });

    it(`${game.name} bounded seeded fuzz does not throw`, { timeout: 20_000 }, () => {
      for (let offset = 0; offset < FUZZ_GAME_COUNT; offset += 1) {
        const run = runDeterministicMicroturns(game, def, 198_100 + offset, FUZZ_MICROTURN_BOUND);

        assert.ok(run.stopReason === 'terminal' || run.stopReason === 'bound');
      }
    });
  }
});
