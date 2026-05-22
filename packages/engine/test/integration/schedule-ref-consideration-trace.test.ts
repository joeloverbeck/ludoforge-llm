// @test-class: golden-trace
import * as assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';

import { evaluatePolicyMoveCore } from '../../src/agents/policy-eval.js';
import {
  asActionId,
  asBoundaryId,
  asPlayerId,
  assertValidatedGameDef,
  createGameDefRuntime,
  initialState,
  type AgentPolicyCatalog,
  type AgentPolicyExpr,
  type AgentPolicyLiteral,
  type CompiledAgentPolicyRef,
  type GameDef,
} from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { getFitlProductionFixture } from '../helpers/production-spec-helpers.js';

interface SandboxProfileArtifact {
  readonly sandboxAgents?: {
    readonly library?: {
      readonly considerations?: {
        readonly preferGovernEarlyInCoupCycle?: {
          readonly scopes?: readonly string[];
          readonly costClass?: string;
          readonly weight?: number;
          readonly when?: { readonly ref?: string };
          readonly value?: { readonly ref?: string };
          readonly scheduleFallback?: {
            readonly onUnavailable?: string;
            readonly onPartial?: { readonly visiblePrefixExhausted?: string };
          };
        };
      };
    };
    readonly profiles?: {
      readonly 'spec-169-schedule-demo'?: {
        readonly extends?: string;
        readonly observer?: string;
        readonly use?: { readonly considerations?: readonly string[] };
      };
    };
  };
}

const CONSIDERATION_ID = 'preferGovernEarlyInCoupCycle';
const PROFILE_ID = 'spec-169-schedule-demo';
const SCHEDULE_REF_ID = 'schedule.distance.toBoundary.coupEntry.cards';
const here = dirname(fileURLToPath(import.meta.url));

const literal = (value: AgentPolicyLiteral): AgentPolicyExpr => ({ kind: 'literal', value });
const refExpr = (ref: CompiledAgentPolicyRef): AgentPolicyExpr => ({ kind: 'ref', ref });

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

function extractYamlBlock(markdown: string): string {
  const match = /```yaml\n([\s\S]*?)\n```/u.exec(markdown);
  assert.ok(match?.[1], 'expected sandbox profile markdown to contain one yaml block');
  return match[1];
}

function loadSandboxProfileArtifact(): Required<Required<SandboxProfileArtifact>['sandboxAgents']> {
  const profilePath = join(
    resolveRepoRoot(),
    'data',
    'games',
    'fire-in-the-lake',
    'sandbox-profiles',
    '169-demonstration.md',
  );
  const doc = parseDocument(extractYamlBlock(readFileSync(profilePath, 'utf8')), {
    schema: 'core',
    strict: true,
    uniqueKeys: true,
  });
  assert.deepEqual(doc.errors, []);
  const parsed = doc.toJSON() as SandboxProfileArtifact;
  assert.ok(parsed.sandboxAgents?.library);
  assert.ok(parsed.sandboxAgents.profiles);
  return parsed.sandboxAgents as Required<Required<SandboxProfileArtifact>['sandboxAgents']>;
}

function withSandboxProfile(def: GameDef): GameDef {
  const artifact = loadSandboxProfileArtifact();
  const consideration = artifact.library.considerations?.[CONSIDERATION_ID];
  const profileArtifact = artifact.profiles[PROFILE_ID];
  const agents = def.agents;
  assert.ok(agents, 'expected FITL production agents');
  assert.ok(consideration, `expected ${CONSIDERATION_ID} sandbox consideration`);
  assert.ok(profileArtifact, `expected ${PROFILE_ID} sandbox profile`);
  assert.deepEqual(consideration.scopes, ['move']);
  assert.equal(consideration.costClass, 'state');
  assert.equal(consideration.weight, 250);
  assert.equal(consideration.when?.ref, 'candidate.tag.govern');
  assert.equal(consideration.value?.ref, SCHEDULE_REF_ID);
  assert.deepEqual(consideration.scheduleFallback, {
    onUnavailable: 'noContribution',
    onPartial: { visiblePrefixExhausted: 'useLowerBound' },
  });
  assert.equal(profileArtifact.extends, 'arvn-baseline');
  assert.deepEqual(profileArtifact.use?.considerations, [CONSIDERATION_ID]);

  const baseProfile = agents.profiles[profileArtifact.extends];
  assert.ok(baseProfile, `expected base FITL profile ${profileArtifact.extends}`);
  const scheduleRef: CompiledAgentPolicyRef = {
    kind: 'scheduleDistance',
    target: { kind: 'boundary', boundaryId: asBoundaryId('coupEntry') },
    unit: 'cards',
  };
  const updatedAgents: AgentPolicyCatalog = {
    ...agents,
    compiled: {
      ...agents.compiled,
      considerations: {
        ...agents.compiled.considerations,
        [CONSIDERATION_ID]: {
          scopes: ['move'],
          costClass: 'state',
          when: refExpr({ kind: 'candidateTag', tagName: 'govern' }),
          weight: literal(250),
          value: refExpr(scheduleRef),
          scheduleFallback: {
            onUnavailable: 'noContribution',
            onPartial: { visiblePrefixExhausted: 'useLowerBound' },
          },
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
        },
      },
    },
    library: {
      ...agents.library,
      considerations: {
        ...agents.library.considerations,
        [CONSIDERATION_ID]: {
          scopes: ['move'],
          costClass: 'state',
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
        },
      },
    },
    profiles: {
      ...agents.profiles,
      [PROFILE_ID]: {
        ...baseProfile,
        fingerprint: PROFILE_ID,
        preview: { mode: 'disabled' },
        selection: { mode: 'argmax' },
        use: {
          guardrails: [],
          considerations: [CONSIDERATION_ID],
          tieBreakers: ['stableMoveKey'],
        },
        plan: {
          stateFeatures: [],
          candidateFeatures: [],
          candidateAggregates: [],
          considerations: [CONSIDERATION_ID],
        },
      },
    },
  };
  return assertValidatedGameDef({ ...def, agents: updatedAgents });
}

describe('FITL schedule ref sandbox consideration trace shape', () => {
  it('pins scheduleFallbackFired metadata without loading the sandbox profile in production', () => {
    const { parsed, gameDef } = getFitlProductionFixture();
    assertNoErrors(parsed);
    assert.equal(gameDef.agents?.profiles[PROFILE_ID], undefined, 'sandbox profile must not be production-loaded');
    const REQUIRED_ARVN_EVOLVED_TERMS = [
      'preferOptionProjectedMargin',
    ];
    const arvnEvolvedConsiderations = gameDef.agents?.profiles['arvn-baseline']?.use.considerations ?? [];
    for (const term of REQUIRED_ARVN_EVOLVED_TERMS) {
      assert.ok(
        arvnEvolvedConsiderations.includes(term),
        `arvn-baseline must contain required baseline consideration ${term} (current: [${arvnEvolvedConsiderations.join(', ')}])`,
      );
    }

    const def = withSandboxProfile(gameDef);
    const state = initialState(def, 1000, 4).state;
    const runtime = createGameDefRuntime(def);
    const result = evaluatePolicyMoveCore({
      def,
      state,
      playerId: asPlayerId(0),
      legalMoves: [
        { actionId: asActionId('govern'), params: {} },
        { actionId: asActionId('pass'), params: {} },
      ],
      trustedMoveIndex: new Map(),
      rng: { state: state.rng },
      runtime,
      profileIdOverride: PROFILE_ID,
      encodedStateMode: 'disabled',
      traceLevel: 'verbose',
    });

    assert.equal(result.kind, 'success');
    const governCandidate = result.metadata.candidates.find((candidate) => candidate.actionId === 'govern');
    assert.deepEqual(governCandidate, {
      actionId: 'govern',
      stableMoveKey: 'govern|{}|false|specialActivity',
      score: 500,
      prunedBy: [],
      scoreContributions: [{ termId: CONSIDERATION_ID, contribution: 500 }],
      previewRefIds: [],
      unknownPreviewRefs: [],
      unknownLookupRefs: [],
      unknownCandidateParamRefs: [],
      inputRefs: {
        [SCHEDULE_REF_ID]: {
          status: 'partial',
          partialKind: 'lowerBound',
          lowerBound: 2,
          observerPolicy: 'topNVisible',
          visiblePrefixLength: 2,
          visibleSequenceSources: [
            { zoneId: 'played:none', availablePublic: 1, taken: 1 },
            { zoneId: 'lookahead:none', availablePublic: 1, taken: 1 },
          ],
          fallbackApplied: { kind: 'useLowerBound', numericValue: 2 },
        },
      },
      scheduleFallbackFired: {
        termId: CONSIDERATION_ID,
        kind: 'useLowerBound',
        value: 2,
        reason: 'partial.lowerBound.visiblePrefixExhausted',
      },
      selectionReason: 'prior',
    });
  });
});
