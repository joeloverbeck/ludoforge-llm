// @test-class: golden-trace
import * as assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';

import { PolicyAgent } from '../../src/agents/index.js';
import {
  applyDecision,
  assertValidatedGameDef,
  createGameDefRuntime,
  createRng,
  initialState,
  type AgentPolicyCatalog,
  type AgentPolicyExpr,
  type AgentPolicyLiteral,
  type CompiledAgentPreviewConfig,
  type CompiledAgentPolicyRef,
  type Decision,
  type GameDef,
  type GameState,
} from '../../src/kernel/index.js';
import { publishMicroturn } from '../../src/kernel/microturn/publish.js';
import { getFitlProductionFixture } from '../helpers/production-spec-helpers.js';

interface DiagnosticProfileArtifact {
  readonly diagnosticAgents?: {
    readonly library?: {
      readonly considerations?: {
        readonly preferOptionProjectedMargin?: {
          readonly scopes?: readonly string[];
          readonly costClass?: string;
          readonly weight?: number;
          readonly value?: {
            readonly ref?: string;
          };
        };
      };
    };
    readonly profiles?: {
      readonly 'policy-preview-inner-fitl-canary'?: {
        readonly extends?: string;
        readonly preview?: {
          readonly mode?: string;
          readonly completion?: string;
          readonly fallbackCompletionPolicy?: string;
          readonly inner?: {
            readonly chooseOne?: boolean;
            readonly chooseNStep?: boolean;
            readonly maxOptions?: number;
            readonly chooseNBeamWidth?: number;
            readonly depthCap?: number;
          };
        };
        readonly use?: {
          readonly considerations?: readonly string[];
        };
      };
    };
  };
}

interface InnerPreviewCanaryFixture {
  readonly seed: number;
  readonly replayedDecisionCount: number;
  readonly profileId: string;
  readonly selectedStableMoveKey: string | null;
  readonly previewUsage: unknown;
  readonly candidates: readonly unknown[];
}

const PROFILE_ID = 'policy-preview-inner-fitl-canary';
const CONSIDERATION_ID = 'preferOptionProjectedMargin';
const PREVIEW_REF_ID = 'preview.option.delta.victory.currentMargin.self';
const here = dirname(fileURLToPath(import.meta.url));
const fixtureUrl = new URL('../../../test/fixtures/trace/policy-preview-inner-fitl-canary.json', import.meta.url);
const replayFixtureUrl = new URL('../../../test/fixtures/spec-144-probe-recovery/seed-1001-nva-march-dead-end/decision-sequence.json', import.meta.url);

function resolveRepoRoot(): string {
  let cursor = here;
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(join(cursor, 'pnpm-workspace.yaml'))) {
      return cursor;
    }
    cursor = resolve(cursor, '..');
  }
  return process.cwd();
}

const diagnosticProfilePath = join(resolveRepoRoot(), 'data', 'games', 'fire-in-the-lake', '94-diagnostic-agents.md');

const literal = (value: AgentPolicyLiteral): AgentPolicyExpr => ({ kind: 'literal', value });
const refExpr = (ref: CompiledAgentPolicyRef): AgentPolicyExpr => ({ kind: 'ref', ref });

function extractYamlBlock(markdown: string): string {
  const match = /```yaml\n([\s\S]*?)\n```/u.exec(markdown);
  assert.ok(match?.[1], 'Expected diagnostic profile markdown to contain one yaml block');
  return match[1];
}

function loadDiagnosticProfileArtifact(): Required<Required<DiagnosticProfileArtifact>['diagnosticAgents']> {
  const doc = parseDocument(extractYamlBlock(readFileSync(diagnosticProfilePath, 'utf8')), {
    schema: 'core',
    strict: true,
    uniqueKeys: true,
  });
  assert.deepEqual(doc.errors, []);
  const parsed = doc.toJSON() as DiagnosticProfileArtifact;
  const diagnosticAgents = parsed.diagnosticAgents;
  assert.ok(diagnosticAgents?.library);
  assert.ok(diagnosticAgents.profiles);
  return diagnosticAgents as Required<Required<DiagnosticProfileArtifact>['diagnosticAgents']>;
}

function withDiagnosticInnerPreviewProfile(def: GameDef): GameDef {
  const artifact = loadDiagnosticProfileArtifact();
  const consideration = artifact.library.considerations?.[CONSIDERATION_ID];
  const profileArtifact = artifact.profiles[PROFILE_ID];
  const agents = def.agents;
  assert.ok(agents, 'expected FITL production agents');
  assert.ok(consideration, `expected ${CONSIDERATION_ID} diagnostic consideration`);
  assert.ok(profileArtifact, `expected ${PROFILE_ID} diagnostic profile`);
  assert.deepEqual(consideration.scopes, ['microturn']);
  assert.equal(consideration.costClass, 'preview');
  assert.equal(consideration.value?.ref, PREVIEW_REF_ID);
  assert.equal(profileArtifact.extends, 'arvn-baseline');
  assert.equal(profileArtifact.preview?.inner?.chooseOne, true);
  assert.deepEqual(profileArtifact.use?.considerations, [CONSIDERATION_ID]);

  const baseProfile = agents.profiles[profileArtifact.extends];
  assert.ok(baseProfile, `expected base FITL profile ${profileArtifact.extends}`);
  const previewInner = profileArtifact.preview?.inner;
  assert.ok(previewInner, `expected ${PROFILE_ID} preview.inner config`);
  const diagnosticPreview: CompiledAgentPreviewConfig = {
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

  const updatedAgents: AgentPolicyCatalog = {
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
        use: {
          ...baseProfile.use,
          considerations: baseUseConsiderations,
        },
        plan: {
          ...baseProfile.plan,
          considerations: basePlanConsiderations,
        },
      },
    },
    bindingsBySeat: {
      ...agents.bindingsBySeat,
      arvn: PROFILE_ID,
    },
  };

  return assertValidatedGameDef({ ...def, agents: updatedAgents });
}

function readReplayDecisions(): readonly Decision[] {
  return JSON.parse(readFileSync(replayFixtureUrl, 'utf8')) as readonly Decision[];
}

function normalizeCanaryTrace(input: InnerPreviewCanaryFixture): InnerPreviewCanaryFixture {
  return JSON.parse(`${JSON.stringify(input, null, 2)}\n`) as InnerPreviewCanaryFixture;
}

function capturePolicyPreviewInnerFitlCanary(): InnerPreviewCanaryFixture {
  const expected = JSON.parse(readFileSync(fixtureUrl, 'utf8')) as InnerPreviewCanaryFixture;
  const def = withDiagnosticInnerPreviewProfile(getFitlProductionFixture().gameDef);
  const runtime = createGameDefRuntime(def);
  const replayDecisions = readReplayDecisions();
  const agent = new PolicyAgent({ profileId: PROFILE_ID, traceLevel: 'verbose' });
  let state: GameState = initialState(def, expected.seed, 4, undefined, runtime).state;

  for (let index = 0; index < expected.replayedDecisionCount; index += 1) {
    const decision = replayDecisions[index];
    assert.ok(decision, `Expected replay decision ${index}`);
    state = applyDecision(def, state, decision, undefined, runtime).state;
  }

  const microturn = publishMicroturn(def, state, runtime);
  assert.equal(microturn.kind, 'chooseOne');
  assert.equal(String(microturn.seatId), 'arvn');
  const decision = agent.chooseDecision({ def, state, microturn, rng: createRng(BigInt(expected.seed)), runtime });
  const trace = decision.agentDecision;
  assert.ok(trace, 'Expected verbose policy trace');
  assert.ok(trace.candidates, 'Expected verbose candidate trace');

  return normalizeCanaryTrace({
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
  });
}

describe('FITL inner preview policy canary golden', () => {
  it('matches the frozen per-option projected-margin fixture', () => {
    const expectedBytes = readFileSync(fixtureUrl, 'utf8');
    const actualBytes = `${JSON.stringify(capturePolicyPreviewInnerFitlCanary(), null, 2)}\n`;

    assert.equal(
      actualBytes,
      expectedBytes,
      [
        'FITL inner preview canary drifted.',
        'Re-bless golden trace: packages/engine/test/integration/policy-preview-inner-fitl-canary-golden.test.ts',
      ].join(' '),
    );
  });
});
