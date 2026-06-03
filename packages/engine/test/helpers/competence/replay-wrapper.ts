import * as assert from 'node:assert/strict';

import { toMoveIdentityKey } from '../../../src/kernel/move-identity.js';
import {
  serializeGameState,
  type Decision,
  type DecisionLog,
  type GameDef,
} from '../../../src/kernel/index.js';
import type { CompetenceRunResult } from './live-frontier-runner.js';
import {
  computeOutcomeDeltas,
  type OutcomeDeltaAssertion,
  type OutcomeDeltaResult,
} from './outcome-delta.js';

export interface CompetenceReplayFixtureResult {
  readonly result: CompetenceRunResult;
  readonly outcomeDeltas?: readonly OutcomeDeltaResult[];
}

export type CompetenceReplayFixture =
  () => CompetenceRunResult | CompetenceReplayFixtureResult;

export interface AssertReplayIdentityInput {
  readonly def?: GameDef;
  readonly runFixture: CompetenceReplayFixture;
  readonly outcomeDeltaAssertions?: readonly OutcomeDeltaAssertion[];
}

export interface ReplayIdentitySnapshot {
  readonly selectedStableMoveKey: string;
  readonly decisions: readonly ReplayDecisionSnapshot[];
  readonly microturns: readonly ReplayMicroturnSnapshot[];
  readonly outcomeDeltas: readonly OutcomeDeltaResult[];
  readonly finalState: ReturnType<typeof serializeGameState>;
}

export interface ReplayDecisionSnapshot {
  readonly turnId: string;
  readonly decisionContextKind: DecisionLog['decisionContextKind'];
  readonly decisionKey: string | null;
  readonly stableDecisionKey: string;
  readonly turnRetired: boolean;
  readonly legalActionCount: number;
}

export interface ReplayMicroturnSnapshot {
  readonly expectedStep?: string | null;
  readonly matchedRole?: string | null;
  readonly selectedLegalOption?: string;
  readonly match: string;
  readonly fallbackReasonKind?: string;
}

export function assertReplayIdentity(runFixture: CompetenceReplayFixture): ReplayIdentitySnapshot;
export function assertReplayIdentity(input: AssertReplayIdentityInput): ReplayIdentitySnapshot;
export function assertReplayIdentity(
  inputOrRunFixture: AssertReplayIdentityInput | CompetenceReplayFixture,
): ReplayIdentitySnapshot {
  const input = typeof inputOrRunFixture === 'function'
    ? { runFixture: inputOrRunFixture }
    : inputOrRunFixture;
  const first = snapshotFrom(input, normalizeFixtureResult(input.runFixture()));
  const second = snapshotFrom(input, normalizeFixtureResult(input.runFixture()));

  assert.deepEqual(second, first, replayDiffMessage(first, second));
  return first;
}

const normalizeFixtureResult = (
  value: CompetenceRunResult | CompetenceReplayFixtureResult,
): CompetenceReplayFixtureResult =>
  'result' in value ? value : { result: value };

const snapshotFrom = (
  input: AssertReplayIdentityInput,
  fixture: CompetenceReplayFixtureResult,
): ReplayIdentitySnapshot => {
  const outcomeDeltas = fixture.outcomeDeltas ?? (
    input.outcomeDeltaAssertions === undefined || input.def === undefined
      ? []
      : computeOutcomeDeltas({
          def: input.def,
          before: fixture.result.preState,
          after: fixture.result.postState,
          assertions: input.outcomeDeltaAssertions,
        })
  );
  return {
    selectedStableMoveKey: selectedStableKey(input.def, fixture.result),
    decisions: fixture.result.decisions.map((entry) => decisionSnapshot(input.def, entry)),
    microturns: fixture.result.microturnTraces.map((entry) => ({
      ...(entry.expectedStep === undefined ? {} : { expectedStep: entry.expectedStep }),
      ...(entry.matchedRole === undefined ? {} : { matchedRole: entry.matchedRole }),
      ...(entry.selectedLegalOption === undefined ? {} : { selectedLegalOption: entry.selectedLegalOption }),
      match: entry.match,
      ...(entry.fallbackReason === undefined ? {} : { fallbackReasonKind: entry.fallbackReason.kind }),
    })),
    outcomeDeltas,
    finalState: serializeGameState(fixture.result.postState),
  };
};

const selectedStableKey = (
  def: GameDef | undefined,
  result: CompetenceRunResult,
): string => {
  if (result.agentDecision?.selectedStableMoveKey !== undefined && result.agentDecision.selectedStableMoveKey !== null) {
    return result.agentDecision.selectedStableMoveKey;
  }
  return decisionStableKey(def, result.selectedDecision);
};

const decisionSnapshot = (
  def: GameDef | undefined,
  log: DecisionLog,
): ReplayDecisionSnapshot => ({
  turnId: String(log.turnId),
  decisionContextKind: log.decisionContextKind,
  decisionKey: log.decisionKey === null ? null : String(log.decisionKey),
  stableDecisionKey: decisionStableKey(def, log.decision),
  turnRetired: log.turnRetired,
  legalActionCount: log.legalActionCount,
});

const decisionStableKey = (def: GameDef | undefined, decision: Decision): string => {
  if (decision.kind !== 'actionSelection') {
    return `${decision.kind}:${JSON.stringify(decision)}`;
  }
  if (decision.move === undefined) {
    return String(decision.actionId);
  }
  return def === undefined ? JSON.stringify(decision.move) : toMoveIdentityKey(def, decision.move);
};

const replayDiffMessage = (
  first: ReplayIdentitySnapshot,
  second: ReplayIdentitySnapshot,
): string => {
  const fields: readonly (keyof ReplayIdentitySnapshot)[] = [
    'selectedStableMoveKey',
    'decisions',
    'microturns',
    'outcomeDeltas',
    'finalState',
  ];
  const diverged = fields.find((field) => JSON.stringify(first[field]) !== JSON.stringify(second[field]));
  return diverged === undefined
    ? 'expected replay snapshots to be identical'
    : `expected replay snapshots to be identical; first divergence: ${diverged}`;
};
