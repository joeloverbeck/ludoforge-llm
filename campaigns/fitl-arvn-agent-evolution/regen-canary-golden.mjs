#!/usr/bin/env node
/**
 * Regenerate the `policy-preview-inner-fitl-canary` golden trace fixture.
 *
 * The `policy-preview-inner-fitl-canary` diagnostic profile (`94-diagnostic-agents.md`)
 * declares `extends: arvn-baseline`, so it inherits every consideration the
 * `fitl-arvn-agent-evolution` campaign adds to `arvn-baseline`. Move-scope
 * additions don't touch its microturn golden trace, but microturn-scope
 * additions do — making the golden a profile-coupled, derived artifact of the
 * (legitimately evolving) `arvn-baseline` profile.
 *
 * This script mirrors `capturePolicyPreviewInnerFitlCanary` /
 * `withDiagnosticInnerPreviewProfile` from
 * `packages/engine/test/integration/policy-preview-inner-fitl-canary-golden.test.ts`
 * and rewrites `packages/engine/test/fixtures/trace/policy-preview-inner-fitl-canary.json`
 * so the golden test stays a byte-exact proof against the current profile.
 * Run by `sync-fixtures.sh` (after build, before the harness test gate).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = (() => {
  let cur = HERE;
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(join(cur, 'pnpm-workspace.yaml'))) return cur;
    cur = resolve(cur, '..');
  }
  return process.cwd();
})();

// `yaml` is a runtime dep of the engine package; resolve it from there.
const engineRequire = createRequire(join(REPO_ROOT, 'packages/engine/package.json'));
const { parseDocument } = await import(engineRequire.resolve('yaml'));

const { PolicyAgent } = await import(join(REPO_ROOT, 'packages/engine/dist/src/agents/index.js'));
const {
  applyDecision,
  assertValidatedGameDef,
  createGameDefRuntime,
  createRng,
  initialState,
} = await import(join(REPO_ROOT, 'packages/engine/dist/src/kernel/index.js'));
const { publishMicroturn } = await import(join(REPO_ROOT, 'packages/engine/dist/src/kernel/microturn/publish.js'));
const { getFitlProductionFixture } = await import(join(REPO_ROOT, 'packages/engine/dist/test/helpers/production-spec-helpers.js'));

const PROFILE_ID = 'policy-preview-inner-fitl-canary';
const CONSIDERATION_ID = 'preferOptionProjectedMargin';
const fixturePath = join(REPO_ROOT, 'packages/engine/test/fixtures/trace/policy-preview-inner-fitl-canary.json');
const replayFixturePath = join(
  REPO_ROOT,
  'packages/engine/test/fixtures/spec-144-probe-recovery/seed-1001-nva-march-dead-end/decision-sequence.json',
);
const diagnosticProfilePath = join(REPO_ROOT, 'data/games/fire-in-the-lake/94-diagnostic-agents.md');

const literal = (value) => ({ kind: 'literal', value });
const refExpr = (ref) => ({ kind: 'ref', ref });

function extractYamlBlock(markdown) {
  const match = /```yaml\n([\s\S]*?)\n```/u.exec(markdown);
  if (!match?.[1]) throw new Error('Expected diagnostic profile markdown to contain one yaml block');
  return match[1];
}

function loadDiagnosticProfileArtifact() {
  const doc = parseDocument(extractYamlBlock(readFileSync(diagnosticProfilePath, 'utf8')), {
    schema: 'core',
    strict: true,
    uniqueKeys: true,
  });
  if (doc.errors.length > 0) throw new Error(`diagnostic profile parse errors: ${JSON.stringify(doc.errors)}`);
  const parsed = doc.toJSON();
  const diagnosticAgents = parsed.diagnosticAgents;
  if (!diagnosticAgents?.library || !diagnosticAgents.profiles) {
    throw new Error('expected diagnosticAgents.library and .profiles');
  }
  return diagnosticAgents;
}

function withDiagnosticInnerPreviewProfile(def) {
  const artifact = loadDiagnosticProfileArtifact();
  const consideration = artifact.library.considerations?.[CONSIDERATION_ID];
  const profileArtifact = artifact.profiles[PROFILE_ID];
  const agents = def.agents;
  if (!agents) throw new Error('expected FITL production agents');
  if (!consideration) throw new Error(`expected ${CONSIDERATION_ID} diagnostic consideration`);
  if (!profileArtifact) throw new Error(`expected ${PROFILE_ID} diagnostic profile`);

  const baseProfile = agents.profiles[profileArtifact.extends];
  if (!baseProfile) throw new Error(`expected base FITL profile ${profileArtifact.extends}`);
  const previewInner = profileArtifact.preview?.inner;
  if (!previewInner) throw new Error(`expected ${PROFILE_ID} preview.inner config`);

  const diagnosticPreview = {
    ...baseProfile.preview,
    mode: profileArtifact.preview?.mode === 'exactWorld' ? 'exactWorld' : baseProfile.preview.mode,
    ...(profileArtifact.preview?.completion === 'policyGuided' ? { completion: 'policyGuided' } : {}),
    ...(profileArtifact.preview?.fallbackCompletionPolicy === 'fail' ? { fallbackCompletionPolicy: 'fail' } : {}),
    inner: {
      chooseOne: previewInner.chooseOne === true,
      chooseNStep: previewInner.chooseNStep === true,
      maxOptions: previewInner.maxOptions ?? 1,
      chooseNBeamWidth: previewInner.chooseNBeamWidth ?? 1,
      depthCap: previewInner.depthCap ?? 1,
      strategy: 'singlePass',
      capClass: 'standard256',
    },
  };

  const baseUseConsiderations = baseProfile.use.considerations.includes(CONSIDERATION_ID)
    ? baseProfile.use.considerations
    : [...baseProfile.use.considerations, CONSIDERATION_ID];
  const basePlanConsiderations = baseProfile.plan.considerations.includes(CONSIDERATION_ID)
    ? baseProfile.plan.considerations
    : [...baseProfile.plan.considerations, CONSIDERATION_ID];

  const updatedAgents = {
    ...agents,
    compiled: {
      ...agents.compiled,
      considerations: {
        ...agents.compiled.considerations,
        [CONSIDERATION_ID]: {
          scopes: ['microturn'],
          costClass: 'preview',
          weight: literal(consideration.weight ?? 0),
          value: refExpr({ kind: 'previewOptionRef', refKind: 'deltaVictoryCurrentMarginSelf' }),
          previewFallback: { onUnavailable: 'noContribution' },
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
        },
      },
    },
    library: {
      ...agents.library,
      considerations: {
        ...agents.library.considerations,
        [CONSIDERATION_ID]: {
          scopes: ['microturn'],
          costClass: 'preview',
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
        },
      },
    },
    profiles: {
      ...agents.profiles,
      [PROFILE_ID]: {
        ...baseProfile,
        fingerprint: PROFILE_ID,
        preview: diagnosticPreview,
        use: { ...baseProfile.use, considerations: baseUseConsiderations },
        plan: { ...baseProfile.plan, considerations: basePlanConsiderations },
      },
    },
    bindingsBySeat: { ...agents.bindingsBySeat, arvn: PROFILE_ID },
  };

  return assertValidatedGameDef({ ...def, agents: updatedAgents });
}

function capture() {
  const expected = JSON.parse(readFileSync(fixturePath, 'utf8'));
  const def = withDiagnosticInnerPreviewProfile(getFitlProductionFixture().gameDef);
  const runtime = createGameDefRuntime(def);
  const replayDecisions = JSON.parse(readFileSync(replayFixturePath, 'utf8'));
  const agent = new PolicyAgent({ profileId: PROFILE_ID, traceLevel: 'verbose' });
  let state = initialState(def, expected.seed, 4, undefined, runtime).state;

  for (let index = 0; index < expected.replayedDecisionCount; index += 1) {
    const decision = replayDecisions[index];
    if (!decision) throw new Error(`Expected replay decision ${index}`);
    state = applyDecision(def, state, decision, undefined, runtime).state;
  }

  const microturn = publishMicroturn(def, state, runtime);
  if (microturn.kind !== 'chooseOne') throw new Error(`expected chooseOne microturn, got ${microturn.kind}`);
  if (String(microturn.seatId) !== 'arvn') throw new Error(`expected arvn microturn, got ${microturn.seatId}`);
  const decision = agent.chooseDecision({ def, state, microturn, rng: createRng(BigInt(expected.seed)), runtime });
  const trace = decision.agentDecision;
  if (!trace?.candidates) throw new Error('Expected verbose candidate trace');

  return {
    seed: expected.seed,
    replayedDecisionCount: expected.replayedDecisionCount,
    profileId: PROFILE_ID,
    selectedStableMoveKey: trace.selectedStableMoveKey,
    previewUsage: trace.previewUsage,
    candidates: trace.candidates.map((candidate) => ({
      stableMoveKey: candidate.stableMoveKey,
      score: candidate.score,
      scoreContributions: candidate.scoreContributions,
      previewOutcome: candidate.previewOutcome,
      previewDrive: candidate.previewDrive,
    })),
  };
}

const captured = capture();
writeFileSync(fixturePath, `${JSON.stringify(captured, null, 2)}\n`);
process.stderr.write('  policy-preview-inner-fitl-canary.json regenerated\n');
