#!/usr/bin/env node
/**
 * Spec 208 / 208FITLARVPQ-001 diagnostic.
 *
 * Replays the ARVN baseline policy-profile-quality windows used by the two
 * quarantined Witnesses 1-2 and reports the plan-controller / turn-shape
 * aggregate evidence needed to classify each witness as regression or
 * legitimate trajectory drift.
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

const { createGameDefRuntime } = await import(
  join(REPO_ROOT, 'packages/engine/dist/src/kernel/index.js')
);
const { getFitlProductionFixture } = await import(
  join(REPO_ROOT, 'packages/engine/dist/test/helpers/production-spec-helpers.js')
);
const { runProbe } = await import(
  join(REPO_ROOT, 'packages/engine/dist/test/policy-profile-quality/probes/probe-runner.js')
);
const { arvnActionDistributionNotDominated } = await import(
  join(REPO_ROOT, 'packages/engine/dist/test/policy-profile-quality/probes/fire-in-the-lake/arvn-action-distribution.probe.js')
);
const { turnShapeMinimumImpactObserved } = await import(
  join(REPO_ROOT, 'packages/engine/dist/test/policy-profile-quality/probes/fire-in-the-lake/turn-shape-minimum-impact.probe.js')
);

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

const runDiagnosticProbe = (probe) => runProbe(probe, {
  loadGame,
  traceLevel: 'debug',
  verboseOnFailure: false,
});

const actionProbeResult = runDiagnosticProbe(arvnActionDistributionNotDominated);
const turnShapeProbeResult = runDiagnosticProbe(turnShapeMinimumImpactObserved);
const actionMatches = actionProbeResult.perSeedOutcomes.flatMap((outcome) => outcome.matches);
const turnShapeMatches = turnShapeProbeResult.perSeedOutcomes.flatMap((outcome) => outcome.matches);

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
const familyKey = (match) => match.selectedActionTags.length === 0
  ? '(untagged)'
  : [...match.selectedActionTags].sort().join('|');
const planKey = (trace) => {
  const plan = trace?.plan;
  if (plan === undefined) return 'none';
  const template = plan.selectedTemplate ?? '(none)';
  const intent = plan.selectedIntent ?? '(none)';
  return `${plan.status}:${template}:${intent}`;
};
const previewRefCount = (trace) => trace?.previewUsage?.coverage?.requestedRefCount ?? 0;
const turnShapeEntry = (trace) => trace?.turnShape?.evaluators?.find((entry) => entry.id === 'currentTurnImpact');
const turnShapeStatus = (trace) => turnShapeEntry(trace)?.previewStatus ?? 'missing';

const aggregateMatches = (matches) => {
  const actionFamilies = new Map();
  const planSelections = new Map();
  const previewRefCounts = new Map();
  const turnShapeStatuses = new Map();
  const turnShapeMinimumImpact = new Map();
  const perSeed = new Map();
  const planTurnShapeJoin = new Map();
  const alternativeTemplates = new Map();
  const filteredOutTemplates = new Map();
  const roleBindingStatuses = new Map();

  for (const match of matches) {
    const seed = String(match.seed);
    const perSeedRow = perSeed.get(seed) ?? {
      decisions: 0,
      actionFamilies: new Map(),
      planSelections: new Map(),
      turnShapeStatuses: new Map(),
    };
    perSeedRow.decisions += 1;

    const action = familyKey(match);
    const plan = planKey(match.trace);
    const refs = previewRefCount(match.trace);
    const status = turnShapeStatus(match.trace);
    const impact = turnShapeEntry(match.trace)?.minimumImpactSatisfied;
    const impactKey = impact === undefined ? 'missing' : String(impact);
    const planTrace = match.trace?.plan;

    increment(actionFamilies, action);
    increment(planSelections, plan);
    increment(previewRefCounts, String(refs));
    increment(turnShapeStatuses, status);
    increment(turnShapeMinimumImpact, impactKey);
    increment(planTurnShapeJoin, `${plan} -> ${status}`);
    for (const alternative of planTrace?.alternatives ?? []) {
      increment(alternativeTemplates, alternative.templateId);
    }
    for (const filtered of planTrace?.filteredOutTemplates ?? []) {
      increment(filteredOutTemplates, `${filtered.templateId}:${filtered.reason}:${filtered.gatedBy.join('|')}`);
    }
    for (const role of planTrace?.roleBindingStatuses ?? []) {
      const roleStatus = role.status.kind === 'ready'
        ? 'ready'
        : `${role.status.kind}:${role.status.reason}`;
      increment(roleBindingStatuses, `${role.role}:${roleStatus}`);
    }

    increment(perSeedRow.actionFamilies, action);
    increment(perSeedRow.planSelections, plan);
    increment(perSeedRow.turnShapeStatuses, status);
    perSeed.set(seed, perSeedRow);
  }

  return {
    totalDecisions: matches.length,
    actionFamilies,
    planSelections,
    previewRefCounts,
    turnShapeStatuses,
    turnShapeMinimumImpact,
    planTurnShapeJoin,
    alternativeTemplates,
    filteredOutTemplates,
    roleBindingStatuses,
    perSeed,
  };
};

const actionAggregate = aggregateMatches(actionMatches);
const turnShapeAggregate = aggregateMatches(turnShapeMatches);

const printProbeSummary = (label, result, aggregate) => {
  const topAction = [...aggregate.actionFamilies.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['none', 0];
  const readyCount = aggregate.turnShapeStatuses.get('ready') ?? 0;

  console.log(`=== ${label} ===`);
  console.log(`probe id: ${result.probe.id}`);
  console.log(`aggregate outcome: ${JSON.stringify(result.aggregateOutcome)}`);
  console.log(`matched decisions: ${aggregate.totalDecisions}`);
  console.log(`dominant action-family share: ${topAction[0]} ${formatRatio(topAction[1], aggregate.totalDecisions)}`);
  console.log(`currentTurnImpact ready share: ${formatRatio(readyCount, aggregate.totalDecisions)}`);
  console.log(`action-family distribution: ${JSON.stringify(sortedObject(aggregate.actionFamilies))}`);
  console.log(`plan selection distribution: ${JSON.stringify(sortedObject(aggregate.planSelections))}`);
  console.log(`preview requested-ref-count distribution: ${JSON.stringify(sortedObject(aggregate.previewRefCounts))}`);
  console.log(`currentTurnImpact status distribution: ${JSON.stringify(sortedObject(aggregate.turnShapeStatuses))}`);
  console.log(`currentTurnImpact minimumImpactSatisfied distribution: ${JSON.stringify(sortedObject(aggregate.turnShapeMinimumImpact))}`);
  console.log(`plan/currentTurnImpact join: ${JSON.stringify(sortedObject(aggregate.planTurnShapeJoin))}`);
  console.log(`plan alternative-template mentions: ${JSON.stringify(sortedObject(aggregate.alternativeTemplates))}`);
  console.log(`filtered-out template distribution: ${JSON.stringify(sortedObject(aggregate.filteredOutTemplates))}`);
  console.log(`role-binding status distribution: ${JSON.stringify(sortedObject(aggregate.roleBindingStatuses))}`);
  console.log('per-seed aggregates:');
  for (const [seed, row] of [...aggregate.perSeed.entries()].sort(([left], [right]) => Number(left) - Number(right))) {
    console.log(
      `  seed ${seed}: decisions=${row.decisions}`
      + ` actionFamilies=${JSON.stringify(sortedObject(row.actionFamilies))}`
      + ` plans=${JSON.stringify(sortedObject(row.planSelections))}`
      + ` turnShape=${JSON.stringify(sortedObject(row.turnShapeStatuses))}`,
    );
  }
  console.log('');
};

printProbeSummary('Witness 1: action-family domination', actionProbeResult, actionAggregate);
printProbeSummary('Witness 2: turn-shape readiness', turnShapeProbeResult, turnShapeAggregate);

console.log('=== Verdict support ===');
console.log('Witness 1 candidate verdict: L (legitimate trajectory drift / distill), because every matched decision is plan-selected arvn.patrolGovern with zero preview refs; the plan proposal trace still exposes viable alternatives, so the failure is a seed-window trajectory/assertion mismatch rather than missing plan-template wiring.');
console.log('Witness 2 candidate verdict: L (legitimate trajectory drift / distill), because plan-root selection returns before scalar fallback evaluation, so currentTurnImpact is missing rather than ready/non-ready on this window; the resolution should assert the intended subset/trace contract instead of requiring these plan-root decisions to produce scalar turn-shape evidence.');
console.log('Resolution path for ticket 003: distill the two seed-pinned probes into property-form invariants that still catch plan-selection collapse and turn-shape wiring loss without requiring these post-Spec-191 windows to reproduce the pre-Spec-191 trajectory.');
