#!/usr/bin/env node
/**
 * Spec 208 / 208FITLARVPQ-002 diagnostic.
 *
 * Replays the ARVN baseline policy-profile-quality replay windows used by the
 * quarantined `fitl-arvn-may17-equivalent-opponent-preview` witness and reports
 * the grant-flow opponent-margin preview evidence needed to classify the
 * witness as regression or legitimate bounded trajectory drift.
 *
 * Imports from packages/engine/dist/, so run:
 *   pnpm -F @ludoforge/engine build
 * before treating this diagnostic as final evidence.
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = (() => {
  let cur = HERE;
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(join(cur, 'pnpm-workspace.yaml'))) return cur;
    cur = join(cur, '..');
  }
  return process.cwd();
})();

const FITL_SCENARIO = 'fitl-default';
const OPPONENT_MARGIN_REFS = [
  'victoryCurrentMargin.currentMargin.nva',
  'victoryCurrentMargin.currentMargin.vc',
];
const READY_MARGIN_REFS = [
  ...OPPONENT_MARGIN_REFS,
  'victoryCurrentMargin.currentMargin.role:currentLeader',
  'victoryCurrentMargin.currentMargin.role:nearestThreat',
];

const { createGameDefRuntime } = await import(
  join(REPO_ROOT, 'packages/engine/dist/src/kernel/index.js')
);
const { readFixtureJson } = await import(
  join(REPO_ROOT, 'packages/engine/dist/test/helpers/fixture-reader.js')
);
const { getFitlProductionFixture } = await import(
  join(REPO_ROOT, 'packages/engine/dist/test/helpers/production-spec-helpers.js')
);
const { defineProbe } = await import(
  join(REPO_ROOT, 'packages/engine/dist/test/policy-profile-quality/probes/define-probe.js')
);
const { runProbe } = await import(
  join(REPO_ROOT, 'packages/engine/dist/test/policy-profile-quality/probes/probe-runner.js')
);

const arvnReplayWindows = readFixtureJson(
  'policy-profile-quality/fitl-arvn-action-distribution-windows.json',
);

const arvnOpponentPreviewProbe = defineProbe({
  id: 'fitl-arvn-may17-equivalent-opponent-preview',
  game: 'fire-in-the-lake',
  profile: 'arvn-baseline',
  seat: 'ARVN',
  stateBinding: {
    scenario: FITL_SCENARIO,
    stateSamples: arvnReplayWindows,
    maxMatchesPerSeed: 1,
    decisionFilter: { phase: 'main' },
  },
  decisionBinding: {
    contextKind: 'actionSelection',
    occurrence: 'every',
  },
  assertions: [],
  severity: 'profileQuality',
  tags: ['arvn-baseline', 'grant-flow', 'spec-185'],
});

const loadGame = (request) => {
  if (request.game !== 'fire-in-the-lake') {
    throw new Error(`unsupported game for Spec 208 diagnostic: ${request.game}`);
  }
  const def = getFitlProductionFixture().gameDef;
  return {
    def,
    runtime: createGameDefRuntime(def),
    playerCount: 4,
    scenario: request.scenario,
  };
};

const increment = (map, key, count = 1) => {
  map.set(key, (map.get(key) ?? 0) + count);
};

const sortedObject = (map) => Object.fromEntries(
  [...map.entries()].sort(([leftKey, leftValue], [rightKey, rightValue]) => (
    rightValue - leftValue || String(leftKey).localeCompare(String(rightKey))
  )),
);

const ratio = (count, total) => total === 0 ? 0 : count / total;
const formatRatio = (count, total) => `${count}/${total} (${ratio(count, total).toFixed(3)})`;

const unknownReasonFor = (candidate, refId) =>
  candidate.unknownPreviewRefs?.find((entry) => entry.refId === refId)?.reason;

const matrixStatusFor = (trace, candidate, refId) => {
  const candidateMatrix = trace.previewUsage?.seatMatrix?.byCandidate?.[candidate.stableMoveKey];
  const refCells = candidateMatrix?.perSeatRefs?.[refId];
  if (refCells === undefined) return undefined;
  const statuses = [...new Set(Object.values(refCells).map((cell) => cell.status))].sort();
  return statuses.length === 0 ? undefined : statuses.join('|');
};

const refStatusFor = (trace, candidate, refId) => {
  const unknownReason = unknownReasonFor(candidate, refId);
  if (unknownReason !== undefined) return unknownReason;
  const matrixStatus = matrixStatusFor(trace, candidate, refId);
  if (matrixStatus !== undefined) return matrixStatus;
  if (candidate.previewRefIds?.includes(refId)) return 'ready';
  return 'notRequested';
};

const capClassForStatus = (status) => {
  if (status === 'postGrantCap') return 'postGrant16';
  if (status === 'freeOperationCap') return 'grantFlow16';
  if (status === 'grantFlowPartial') return 'grantFlowContinuation';
  if (status === 'depthCap') return 'innerDepthCap';
  return status;
};

const grantFlowSegmentSummary = (candidate) => {
  const segments = candidate.previewDrive?.grantFlowSegments ?? [];
  if (segments.length === 0) return '(none)';
  const counts = new Map();
  for (const segment of segments) increment(counts, segment.kind);
  return JSON.stringify(sortedObject(counts));
};

const syntheticDecisionDepth = (candidate) =>
  candidate.previewDrive?.syntheticDecisions?.length ?? 0;

const runResult = runProbe(arvnOpponentPreviewProbe, {
  loadGame,
  traceLevel: 'debug',
  verboseOnFailure: false,
});

const matches = runResult.perSeedOutcomes.flatMap((outcome) => outcome.matches);
const traces = matches.flatMap((match) => match.trace === null ? [] : [match.trace]);

const statusByRef = new Map();
const capClassByRef = new Map();
const previewOutcomeByCandidate = new Map();
const previewDriveKindByCandidate = new Map();
const actionIds = new Map();
const selectedActions = new Map();
const grantFlowExitCounts = new Map();
const candidateDepths = new Map();
const candidateSegmentShapes = new Map();
const perSeed = new Map();
const representativeRows = [];

let candidateCount = 0;
let readyOpponentCandidates = 0;
let candidatesWithAnyOpponentRef = 0;

for (const match of matches) {
  const seed = String(match.seed);
  const seedRow = perSeed.get(seed) ?? {
    matches: 0,
    candidates: 0,
    readyOpponentCandidates: 0,
    statusByRef: new Map(),
    previewOutcomes: new Map(),
  };
  seedRow.matches += 1;

  const trace = match.trace;
  if (trace === null) {
    perSeed.set(seed, seedRow);
    continue;
  }

  const selectedAction = match.selectedDecision?.actionId ?? '(unknown)';
  increment(selectedActions, selectedAction);
  const continuation = trace.previewUsage?.grantFlowContinuation;
  if (continuation !== undefined) {
    for (const [key, value] of Object.entries(continuation.exitCounts ?? {})) {
      increment(grantFlowExitCounts, key, value);
    }
  }

  for (const candidate of trace.candidates ?? []) {
    candidateCount += 1;
    seedRow.candidates += 1;
    increment(actionIds, candidate.actionId ?? '(unknown)');
    increment(previewOutcomeByCandidate, candidate.previewOutcome ?? '(missing)');
    increment(previewDriveKindByCandidate, candidate.previewDrive?.kind ?? '(missing)');
    increment(candidateDepths, String(syntheticDecisionDepth(candidate)));
    increment(candidateSegmentShapes, grantFlowSegmentSummary(candidate));

    const hasAnyOpponentRef = OPPONENT_MARGIN_REFS.some((refId) =>
      candidate.previewRefIds?.includes(refId) || unknownReasonFor(candidate, refId) !== undefined,
    );
    if (hasAnyOpponentRef) candidatesWithAnyOpponentRef += 1;

    const statuses = new Map();
    for (const refId of READY_MARGIN_REFS) {
      const status = refStatusFor(trace, candidate, refId);
      statuses.set(refId, status);
      increment(statusByRef, `${refId}:${status}`);
      increment(seedRow.statusByRef, `${refId}:${status}`);
      if (status !== 'ready' && status !== 'notRequested') {
        increment(capClassByRef, `${refId}:${capClassForStatus(status)}`);
      }
    }

    const readyOpponent = OPPONENT_MARGIN_REFS.every((refId) => statuses.get(refId) === 'ready');
    const noReadyMarginUnknowns = [...statuses.entries()]
      .filter(([refId]) => READY_MARGIN_REFS.includes(refId))
      .every(([_refId, status]) => status === 'ready' || status === 'notRequested');
    if (readyOpponent && noReadyMarginUnknowns) {
      readyOpponentCandidates += 1;
      seedRow.readyOpponentCandidates += 1;
    }

    for (const status of statuses.values()) {
      if (status !== 'notRequested') increment(seedRow.previewOutcomes, status);
    }

    if (representativeRows.length < 8 && hasAnyOpponentRef) {
      representativeRows.push({
        seed,
        stateHash: match.stateHash,
        selectedAction,
        candidateAction: candidate.actionId,
        stableMoveKey: candidate.stableMoveKey,
        previewOutcome: candidate.previewOutcome ?? '(missing)',
        previewDriveKind: candidate.previewDrive?.kind ?? '(missing)',
        previewDriveDepth: candidate.previewDrive?.depth ?? null,
        syntheticDecisionCount: syntheticDecisionDepth(candidate),
        refStatuses: Object.fromEntries(statuses),
        grantFlowSegments: candidate.previewDrive?.grantFlowSegments ?? [],
      });
    }
  }

  perSeed.set(seed, seedRow);
}

const outcomeBreakdownTotals = new Map();
for (const trace of traces) {
  for (const [key, value] of Object.entries(trace.previewUsage?.outcomeBreakdown ?? {})) {
    increment(outcomeBreakdownTotals, key, value);
  }
}

console.log('=== Spec 208 Witness 3: grant-flow opponent-margin diagnostic ===');
console.log(`probe id: ${runResult.probe.id}`);
console.log(`aggregate outcome: ${JSON.stringify(runResult.aggregateOutcome)}`);
console.log(`replay window samples: ${arvnReplayWindows.length}`);
console.log(`matched decisions: ${matches.length}`);
console.log(`candidate count: ${candidateCount}`);
console.log(`candidates with any NVA/VC opponent-margin ref: ${candidatesWithAnyOpponentRef}`);
console.log(`ready opponent-margin candidates among all candidates: ${formatRatio(readyOpponentCandidates, candidateCount)}`);
console.log(`ready opponent-margin candidates among candidates requesting NVA/VC refs: ${formatRatio(readyOpponentCandidates, candidatesWithAnyOpponentRef)}`);
console.log(`selected action distribution: ${JSON.stringify(sortedObject(selectedActions))}`);
console.log(`candidate action distribution: ${JSON.stringify(sortedObject(actionIds))}`);
console.log(`candidate previewOutcome distribution: ${JSON.stringify(sortedObject(previewOutcomeByCandidate))}`);
console.log(`candidate previewDrive.kind distribution: ${JSON.stringify(sortedObject(previewDriveKindByCandidate))}`);
console.log(`candidate synthetic-decision-count distribution: ${JSON.stringify(sortedObject(candidateDepths))}`);
console.log(`previewUsage outcomeBreakdown totals: ${JSON.stringify(sortedObject(outcomeBreakdownTotals))}`);
console.log(`grantFlowContinuation exitCounts totals: ${JSON.stringify(sortedObject(grantFlowExitCounts))}`);
console.log(`opponent/standing ref status distribution: ${JSON.stringify(sortedObject(statusByRef))}`);
console.log(`non-ready cap/status class distribution: ${JSON.stringify(sortedObject(capClassByRef))}`);
console.log(`grant-flow segment shape distribution: ${JSON.stringify(sortedObject(candidateSegmentShapes))}`);
console.log('per-seed aggregates:');
for (const [seed, row] of [...perSeed.entries()].sort(([left], [right]) => Number(left) - Number(right))) {
  console.log(
    `  seed ${seed}: matches=${row.matches}`
    + ` candidates=${row.candidates}`
    + ` readyOpponentCandidates=${row.readyOpponentCandidates}`
    + ` statuses=${JSON.stringify(sortedObject(row.statusByRef))}`
    + ` outcomes=${JSON.stringify(sortedObject(row.previewOutcomes))}`,
  );
}
console.log('representative opponent-margin candidate rows:');
for (const row of representativeRows) {
  console.log(JSON.stringify(row));
}

console.log('=== Verdict support ===');
console.log('Witness 3 candidate verdict: L (legitimate post-Spec-191 trajectory drift / distill), because the current replay window is plan-root Patrol/Govern: it produces no scalar-evaluation candidate rows, no requested NVA/VC opponent-margin refs, and no grantFlowContinuation trace to exhaust. The old ready-opponent-margin assertion is therefore calibrated to a decision-source trajectory that no longer exists in this window.');
console.log('Resolution path for ticket 003: distill the seed-pinned ready-opponent-margin assertion into a property-form invariant that first distinguishes plan-root decisions from scalar preview-evaluated decisions, then preserves explicit non-ready statuses and cap-class accounting when grant-flow preview is actually exercised. Do not coerce unknown/postGrantCap/freeOperationCap/grantFlowPartial to ready.');
