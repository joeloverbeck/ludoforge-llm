// @test-class: golden-trace
import * as assert from 'node:assert/strict';
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { selectPlanControlledDecision } from '../../src/agents/plan-controller.js';
import { commitPlanExecutionState, type PlanExecutionStateStore } from '../../src/agents/plan-execution.js';
import {
  assertValidatedGameDef,
  initialState,
  type CompiledPlanTemplate,
  type Decision,
  type DecisionContext,
  type GameDef,
  type GameState,
} from '../../src/kernel/index.js';
import type { PlanMicroturnFallbackReason, PolicyPlanMicroturnTrace } from '../../src/kernel/types-plan-trace.js';
import { readFixtureJson } from '../helpers/fixture-reader.js';
import { getFitlProductionFixture } from '../helpers/production-spec-helpers.js';

interface SemanticCorrespondenceCase {
  readonly templateId: string;
  readonly traceLabel: string;
  readonly root: CompiledPlanTemplate['root'];
  readonly stepIndex: number;
  readonly stepLabel: string;
  readonly role: string;
  readonly authoredMatch: CompiledPlanTemplate['steps'][number]['match'];
  readonly frontierContext: {
    readonly kind: DecisionContext['kind'];
    readonly decisionPath?: string;
    readonly targetKinds?: readonly string[];
    readonly stageIndex?: number;
  };
  readonly selectedLegalOption: string;
  readonly resultDecision: Decision;
  readonly planMicroturn: PolicyPlanMicroturnTrace;
}

interface SemanticCorrespondenceGolden {
  readonly seed: number;
  readonly profile: string;
  readonly cases: readonly SemanticCorrespondenceCase[];
  readonly mismatchProbes: readonly {
    readonly templateId: string;
    readonly stepLabel: string;
    readonly mismatch: string;
    readonly observedMatch: PolicyPlanMicroturnTrace['match'];
    readonly fallbackReason?: PlanMicroturnFallbackReason;
  }[];
}

const FITL_PLAYER_COUNT = 4;
const FIXTURE_PATH = 'trace/plan-semantic-correspondence.golden.json';
const here = dirname(fileURLToPath(import.meta.url));

const resolveRepoRoot = (): string => {
  let cursor = here;
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(join(cursor, 'pnpm-workspace.yaml'))) {
      return cursor;
    }
    cursor = resolve(cursor, '..');
  }
  return process.cwd();
};

const fixturePath = join(resolveRepoRoot(), 'packages', 'engine', 'test', 'fixtures', FIXTURE_PATH);

const selectedIdFor = (state: GameState, ordinal: number): string => {
  const zoneIds = Object.keys(state.zones)
    .filter((zoneId) => !zoneId.startsWith('__') && !zoneId.startsWith('available-'))
    .sort();
  const selected = zoneIds[ordinal];
  assert.notEqual(selected, undefined, `expected FITL production GameDef to expose zone ${ordinal}`);
  return selected!;
};

const decisionFor = (
  match: CompiledPlanTemplate['steps'][number]['match'],
  selectedId: string,
): Extract<Decision, { readonly kind: 'chooseOne' | 'chooseNStep' }> => {
  if (match.decisionKind === 'chooseOne') {
    return { kind: 'chooseOne', decisionKey: match.decisionPath as never, value: selectedId };
  }
  assert.equal(match.decisionKind, 'chooseNStep');
  return { kind: 'chooseNStep', decisionKey: match.decisionPath as never, command: 'add', value: selectedId };
};

const contextFor = (
  match: CompiledPlanTemplate['steps'][number]['match'],
  selectedId: string,
  overrides: Partial<DecisionContext> = {},
): DecisionContext => {
  const base = match.decisionKind === 'chooseOne'
    ? {
        kind: 'chooseOne' as const,
        seatId: 'arvn' as never,
        decisionKey: match.decisionPath as never,
        targetKinds: [match.targetKind as never],
        options: [{ value: selectedId, legality: 'legal' as const, illegalReason: null }],
        ...(match.stageIndex === undefined ? {} : { stageIndex: match.stageIndex }),
      }
    : {
        kind: 'chooseNStep' as const,
        seatId: 'arvn' as never,
        decisionKey: match.decisionPath as never,
        targetKinds: [match.targetKind as never],
        options: [{ value: selectedId, legality: 'legal' as const, illegalReason: null }],
        selectedSoFar: [],
        cardinality: { min: 1, max: 1 },
        stepCommands: ['add' as const, 'confirm' as const],
        ...(match.stageIndex === undefined ? {} : { stageIndex: match.stageIndex }),
      };
  return { ...base, ...overrides } as DecisionContext;
};

const buildStateStore = (
  templateId: string,
  stepIndex: number,
  role: string,
  selectedId: string,
): PlanExecutionStateStore => {
  const store: PlanExecutionStateStore = new Map();
  commitPlanExecutionState(store, {
    selectedTemplate: templateId,
    intent: templateId,
    roleBindings: {
      [role]: {
        role,
        selectedId,
        quality: 1,
        rank: 0,
        components: { semanticGolden: 1 },
      },
    },
    nextStepIndex: stepIndex,
    fallbackHistory: [],
    deviations: [],
    turnId: '191004',
    seatId: 'arvn',
  });
  return store;
};

const runCorrespondenceCase = (
  def: GameDef,
  templateId: string,
  stepIndex: number,
  selectedId: string,
): SemanticCorrespondenceCase => {
  const template = def.agents?.library.planTemplates?.[templateId];
  assert.ok(template, `expected FITL production template ${templateId}`);
  const step = template.steps[stepIndex];
  assert.ok(step, `expected ${templateId} step ${stepIndex}`);
  const decision = decisionFor(step.match, selectedId);
  const controlled = selectPlanControlledDecision({
    def,
    catalog: def.agents!,
    store: buildStateStore(templateId, stepIndex, step.role, selectedId),
    turnId: '191004',
    seatId: 'arvn',
    legalActions: [decision],
    decisionContext: contextFor(step.match, selectedId),
    primitiveDecision: decision,
  });
  const microturn = controlled?.planTrace.microturns?.[0];

  assert.ok(controlled, `expected ${templateId}/${step.label} to select from the published frontier`);
  assert.ok(microturn, `expected ${templateId}/${step.label} to emit a plan microturn trace`);
  assert.equal(microturn.match, 'exact');
  assert.equal(microturn.expectedStep, step.label);
  assert.equal(microturn.matchedRole, step.role);

  return {
    templateId,
    traceLabel: template.traceLabel,
    root: template.root,
    stepIndex,
    stepLabel: step.label,
    role: step.role,
    authoredMatch: step.match,
    frontierContext: {
      kind: step.match.decisionKind as DecisionContext['kind'],
      decisionPath: step.match.decisionPath,
      targetKinds: [step.match.targetKind],
      ...(step.match.stageIndex === undefined ? {} : { stageIndex: step.match.stageIndex }),
    },
    selectedLegalOption: microturn.selectedLegalOption,
    resultDecision: controlled.decision,
    planMicroturn: microturn,
  };
};

const runMismatchProbe = (
  def: GameDef,
  input: {
    readonly templateId: string;
    readonly stepIndex: number;
    readonly selectedId: string;
    readonly mismatch: string;
    readonly overrides: Partial<DecisionContext>;
  },
): SemanticCorrespondenceGolden['mismatchProbes'][number] => {
  const template = def.agents?.library.planTemplates?.[input.templateId];
  assert.ok(template, `expected FITL production template ${input.templateId}`);
  const step = template.steps[input.stepIndex];
  assert.ok(step, `expected ${input.templateId} step ${input.stepIndex}`);
  const decision = decisionFor(step.match, input.selectedId);
  const controlled = selectPlanControlledDecision({
    def,
    catalog: def.agents!,
    store: buildStateStore(input.templateId, input.stepIndex, step.role, input.selectedId),
    turnId: '191004',
    seatId: 'arvn',
    legalActions: [decision],
    decisionContext: contextFor(step.match, input.selectedId, input.overrides),
  });
  const microturn = controlled?.planTrace.microturns?.[0];

  assert.ok(controlled, `expected ${input.templateId}/${step.label} mismatch to fall back inside the frontier`);
  assert.ok(microturn, `expected ${input.templateId}/${step.label} mismatch to emit a plan microturn trace`);
  assert.equal(microturn.match, 'fallback');

  return {
    templateId: input.templateId,
    stepLabel: step.label,
    mismatch: input.mismatch,
    observedMatch: microturn.match,
    ...(microturn.fallbackReason === undefined ? {} : { fallbackReason: microturn.fallbackReason }),
  };
};

const buildGolden = (): SemanticCorrespondenceGolden => {
  const def = assertValidatedGameDef(getFitlProductionFixture().gameDef);
  const state = initialState(def, 191004, FITL_PLAYER_COUNT).state;
  return {
    seed: 191004,
    profile: 'FITL production agent catalog',
    cases: [
      runCorrespondenceCase(def, 'arvn.trainGovern', 0, selectedIdFor(state, 0)),
      runCorrespondenceCase(def, 'arvn.trainGovern', 1, selectedIdFor(state, 1)),
      runCorrespondenceCase(def, 'arvn.assaultTransportAssault', 0, selectedIdFor(state, 2)),
      runCorrespondenceCase(def, 'us.assaultAirLiftAssault', 0, selectedIdFor(state, 3)),
    ],
    mismatchProbes: [
      runMismatchProbe(def, {
        templateId: 'arvn.trainGovern',
        stepIndex: 0,
        selectedId: selectedIdFor(state, 0),
        mismatch: 'decisionPath',
        overrides: { decisionKey: 'wrongTargetSpaces' as never },
      }),
      runMismatchProbe(def, {
        templateId: 'arvn.trainGovern',
        stepIndex: 1,
        selectedId: selectedIdFor(state, 1),
        mismatch: 'targetKind',
        overrides: { targetKinds: ['token'] as never },
      }),
      runMismatchProbe(def, {
        templateId: 'arvn.assaultTransportAssault',
        stepIndex: 0,
        selectedId: selectedIdFor(state, 2),
        mismatch: 'stageIndex',
        overrides: { stageIndex: 1 },
      }),
    ],
  };
};

describe('plan semantic correspondence golden trace', () => {
  it('pins authored role kind/path/stage correspondence against the frontier consumed by the plan controller', () => {
    const actual = buildGolden();
    if (process.env.UPDATE_GOLDEN === '1') {
      writeFileSync(fixturePath, `${JSON.stringify(actual, null, 2)}\n`);
    }
    assert.ok(existsSync(fixturePath), `missing fixture ${fixturePath}; rerun with UPDATE_GOLDEN=1 to bless intentionally`);
    const expected = readFixtureJson<SemanticCorrespondenceGolden>(FIXTURE_PATH);

    assert.deepEqual(actual, expected);
  });
});
