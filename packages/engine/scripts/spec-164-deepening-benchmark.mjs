import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';

const repoRoot = process.cwd();
const engineRoot = join(repoRoot, 'packages', 'engine');
const distRoot = join(engineRoot, 'dist');

const [
  { PolicyAgent },
  { assertValidatedGameDef, createGameDefRuntime },
  { runGame },
  productionHelpers,
] = await Promise.all([
  import(pathToFileURL(join(distRoot, 'src', 'agents', 'index.js')).href),
  import(pathToFileURL(join(distRoot, 'src', 'kernel', 'index.js')).href),
  import(pathToFileURL(join(distRoot, 'src', 'sim', 'index.js')).href),
  import(pathToFileURL(join(distRoot, 'test', 'helpers', 'production-spec-helpers.js')).href),
]);

const dateArgIndex = process.argv.indexOf('--date');
const dateStamp = dateArgIndex >= 0 && process.argv[dateArgIndex + 1] !== undefined
  ? process.argv[dateArgIndex + 1]
  : new Date().toISOString().slice(0, 10).replaceAll('-', '');
const outputPath = join(repoRoot, 'reports', `spec-164-deepening-benchmarks-${dateStamp}.md`);

const fitlProfiles = ['us-baseline', 'arvn-baseline', 'nva-baseline', 'vc-baseline'];

const deep1024 = {
  strategy: 'continuedDeepening',
  capClass: 'deep1024',
  depthCap: 4,
  continuedDeepening: {
    broad: { depthCap: 4 },
    deep: {
      depthCap: 16,
      trigger: ['allRequestedRefsDepthCapped'],
      rootPolicy: 'allRootsWithinCap',
    },
  },
};

const texasStandard256 = {
  mode: 'exactWorld',
  completion: 'policyGuided',
  inner: {
    chooseOne: true,
    chooseNStep: true,
    maxOptions: 4,
    chooseNBeamWidth: 2,
    depthCap: 4,
    strategy: 'continuedDeepening',
    capClass: 'standard256',
    continuedDeepening: {
      broad: { depthCap: 4 },
      deep: {
        depthCap: 8,
        trigger: ['allRequestedRefsDepthCapped'],
        rootPolicy: 'allRootsWithinCap',
      },
    },
  },
};

function cloneDef(def) {
  return structuredClone(def);
}

function withFitlDeepening(def) {
  const next = cloneDef(def);
  const profile = next.agents?.profiles?.['arvn-baseline'];
  if (profile?.preview?.inner === undefined) {
    throw new Error('Expected FITL arvn-baseline preview.inner');
  }
  profile.preview.inner = {
    ...profile.preview.inner,
    ...deep1024,
  };
  return assertValidatedGameDef(next);
}

function withTexasDeepening(def) {
  const next = cloneDef(def);
  const profile = next.agents?.profiles?.baseline;
  if (profile === undefined) {
    throw new Error('Expected Texas baseline profile');
  }
  profile.preview = texasStandard256;
  return assertValidatedGameDef(next);
}

function agentsFor(def, options = {}) {
  const agentCount = Math.max(options.playerCount ?? 0, def.seats?.length ?? 0);
  return Array.from({ length: agentCount }, (_unused, index) => new PolicyAgent({
    profileId: options.profileIds?.[index],
    traceLevel: options.traceLevel ?? 'summary',
  }));
}

function runMeasured({ label, def, seed, maxTurns, playerCount, profileIds }) {
  const runtime = createGameDefRuntime(def);
  const agents = agentsFor(def, { profileIds, traceLevel: 'summary', playerCount });
  const startedAt = performance.now();
  const trace = runGame(
    def,
    seed,
    agents,
    maxTurns,
    playerCount,
    { skipDeltas: true, traceRetention: 'full' },
    runtime,
  );
  const totalMs = performance.now() - startedAt;
  return {
    label,
    seed,
    maxTurns,
    playerCount,
    totalMs,
    stopReason: trace.stopReason,
    decisions: trace.decisions.length,
    coverage: summarizeCoverage(trace),
  };
}

function summarizeCoverage(trace) {
  const result = {
    previewDecisionCount: 0,
    broad: emptyPhase(),
    deep: emptyPhase(),
    finalReadyRootOptionCount: 0,
    finalUnavailableRootOptionCount: 0,
    tiebreakAfterPreviewNoSignalCount: 0,
    previewDrivenAfterBroadNoSignalCount: 0,
  };

  for (const decision of trace.decisions) {
    const agentDecision = decision.agentDecision;
    const coverage = agentDecision?.previewUsage?.coverage;
    if (coverage === undefined) continue;
    if (coverage.requestedRefCount === 0 && coverage.broad === undefined && coverage.deep === undefined) continue;

    result.previewDecisionCount += 1;
    result.finalReadyRootOptionCount += coverage.readyRootOptionCount ?? 0;
    result.finalUnavailableRootOptionCount += coverage.unavailableRootOptionCount ?? 0;
    if (coverage.selectedByTieBreakerBecausePreviewUnavailable === true) {
      result.tiebreakAfterPreviewNoSignalCount += 1;
    }
    if (coverage.broad !== undefined) addPhase(result.broad, coverage.broad);
    if (coverage.deep !== undefined) addPhase(result.deep, coverage.deep);

    const broadNoSignal = coverage.broad !== undefined
      && coverage.broad.evaluatedRootOptionCount > 0
      && coverage.broad.unavailableRootOptionCount === coverage.broad.evaluatedRootOptionCount;
    if (
      broadNoSignal
      && coverage.deep !== undefined
      && coverage.readyRootOptionCount > 0
      && coverage.selectedByTieBreakerBecausePreviewUnavailable !== true
    ) {
      result.previewDrivenAfterBroadNoSignalCount += 1;
    }
  }

  return result;
}

function emptyPhase() {
  return {
    evaluatedRootOptionCount: 0,
    readyRootOptionCount: 0,
    unavailableRootOptionCount: 0,
    triggerFired: {},
  };
}

function addPhase(target, source) {
  target.evaluatedRootOptionCount += source.evaluatedRootOptionCount ?? 0;
  target.readyRootOptionCount += source.readyRootOptionCount ?? 0;
  target.unavailableRootOptionCount += source.unavailableRootOptionCount ?? 0;
  if (source.triggerFired !== undefined) {
    target.triggerFired[source.triggerFired] = (target.triggerFired[source.triggerFired] ?? 0) + 1;
  }
}

function deltaPercent(baseline, treatment) {
  if (baseline.totalMs === 0) return 'n/a';
  return `${(((treatment.totalMs - baseline.totalMs) / baseline.totalMs) * 100).toFixed(1)}%`;
}

function renderRun(run) {
  const coverage = run.coverage;
  return [
    `- command label: ${run.label}`,
    `- seed/maxTurns/playerCount: ${run.seed}/${run.maxTurns}/${run.playerCount}`,
    `- stopReason/decisions: ${run.stopReason}/${run.decisions}`,
    `- wall clock: ${run.totalMs.toFixed(2)} ms`,
    `- preview decisions: ${coverage.previewDecisionCount}`,
    `- broad coverage: evaluated=${coverage.broad.evaluatedRootOptionCount}, ready=${coverage.broad.readyRootOptionCount}, unavailable=${coverage.broad.unavailableRootOptionCount}`,
    `- deep coverage: evaluated=${coverage.deep.evaluatedRootOptionCount}, ready=${coverage.deep.readyRootOptionCount}, unavailable=${coverage.deep.unavailableRootOptionCount}, triggers=${JSON.stringify(coverage.deep.triggerFired)}`,
    `- final ready/unavailable roots: ${coverage.finalReadyRootOptionCount}/${coverage.finalUnavailableRootOptionCount}`,
    `- tiebreakAfterPreviewNoSignal decisions: ${coverage.tiebreakAfterPreviewNoSignalCount}`,
    `- broad-no-signal decisions flipped to preview-driven: ${coverage.previewDrivenAfterBroadNoSignalCount}`,
  ].join('\n');
}

const fitlBaseDef = assertValidatedGameDef(productionHelpers.getFitlProductionFixture().gameDef);
const texasBaseDef = assertValidatedGameDef(productionHelpers.getTexasProductionFixture().gameDef);

const fitlBaseline = runMeasured({
  label: 'FITL arvn-baseline singlePass standard256',
  def: fitlBaseDef,
  seed: 1000,
  maxTurns: 600,
  playerCount: 4,
  profileIds: fitlProfiles,
});
const fitlTreatment = runMeasured({
  label: 'FITL arvn-baseline continuedDeepening deep1024 Db=4 Dd=16',
  def: withFitlDeepening(fitlBaseDef),
  seed: 1000,
  maxTurns: 600,
  playerCount: 4,
  profileIds: fitlProfiles,
});
const texasBaseline = runMeasured({
  label: 'Texas Holdem baseline preview disabled',
  def: texasBaseDef,
  seed: 42,
  maxTurns: 200,
  playerCount: 4,
});
const texasTreatment = runMeasured({
  label: 'Texas Holdem diagnostic continuedDeepening standard256 Db=4 Dd=8',
  def: withTexasDeepening(texasBaseDef),
  seed: 42,
  maxTurns: 200,
  playerCount: 4,
});

const markdown = `# Spec 164 deepening benchmark sweep

Generated: ${new Date().toISOString()}

Command:

\`\`\`bash
pnpm -F @ludoforge/engine build
node packages/engine/scripts/spec-164-deepening-benchmark.mjs --date ${dateStamp}
\`\`\`

This report is empirical evidence for future default-change work. It is not a
green/red acceptance gate for production profile migration.

## FITL arvn-baseline

Baseline:

${renderRun(fitlBaseline)}

Treatment:

${renderRun(fitlTreatment)}

Timing delta: ${deltaPercent(fitlBaseline, fitlTreatment)}

## Texas Holdem representative profile

Baseline:

${renderRun(texasBaseline)}

Treatment:

${renderRun(texasTreatment)}

Timing delta: ${deltaPercent(texasBaseline, texasTreatment)}

The current Texas production profile has no microturn-scoped
\`preview.option.*\` considerations, so the diagnostic continued-deepening run
records preview-decision count 0. This preserves the no-production-default
boundary and documents that Texas does not currently supply a meaningful
deepening signal surface.

## Summary

- FITL ref-flip count: ${fitlTreatment.coverage.previewDrivenAfterBroadNoSignalCount}
- Texas ref-flip count: ${texasTreatment.coverage.previewDrivenAfterBroadNoSignalCount}
- Production profile defaults changed: no
- Follow-up input: any future default migration should start from the FITL
  ready-signal recovery row and separately introduce a Texas profile signal
  surface before treating Texas deepening as meaningful.
`;

writeFileSync(outputPath, markdown);
console.log(outputPath);
