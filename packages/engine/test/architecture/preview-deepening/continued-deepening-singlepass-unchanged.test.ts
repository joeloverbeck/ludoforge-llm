// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { createPolicyAgentChooseNStepInnerPreview } from '../../../src/agents/policy-agent-inner-preview.js';
import {
  applyDecision,
  asActionId,
  asPhaseId,
  assertValidatedGameDef,
  initialState,
  publishMicroturn,
  type ActionDef,
  type ActionPipelineDef,
  type AgentMicroturnDecisionInput,
  type AgentPolicyCatalog,
  type AgentPolicyExpr,
  type AgentPolicyLiteral,
  type CompiledAgentPolicyRef,
  type CompiledAgentProfile,
  type GameDef,
} from '../../../src/kernel/index.js';
import type { ChooseNStepContext, MicroturnState } from '../../../src/kernel/microturn/types.js';
import { eff } from '../../helpers/effect-tag-helper.js';
import {
  withCompiledPolicyCatalog,
  type AgentPolicyCatalogFixtureLibrary,
} from '../../helpers/policy-catalog-fixtures.js';

type ChooseNStepMicroturn = MicroturnState & {
  readonly kind: 'chooseNStep';
  readonly decisionContext: ChooseNStepContext;
};

type SerializedPreview = {
  readonly refIds: readonly string[];
  readonly usage: unknown;
  readonly options: readonly {
    readonly stableMoveKey: string;
    readonly outcome: string;
    readonly completionPolicyFallbackCount: number;
    readonly resolvedRefs: readonly [string, unknown][];
  }[];
};

const phaseId = asPhaseId('main');
const literal = (value: AgentPolicyLiteral): AgentPolicyExpr => ({ kind: 'literal', value });
const refExpr = (ref: CompiledAgentPolicyRef): AgentPolicyExpr => ({ kind: 'ref', ref });
const previewDeltaRef: Extract<CompiledAgentPolicyRef, { readonly kind: 'previewOptionRef' }> = {
  kind: 'previewOptionRef',
  refKind: 'deltaVictoryCurrentMarginSelf',
};

const resolveRepoRoot = (): string => {
  let cursor = process.cwd();
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(join(cursor, 'pnpm-workspace.yaml'))) {
      return cursor;
    }
    cursor = join(cursor, '..');
  }
  return process.cwd();
};

const microturnConsiderations = (
  definitions: Record<string, Omit<AgentPolicyCatalogFixtureLibrary['considerations'][string], 'scopes'>>,
): AgentPolicyCatalogFixtureLibrary['considerations'] =>
  Object.fromEntries(
    Object.entries(definitions).map(([id, definition]) => [id, { scopes: ['microturn'], ...definition }]),
  );

const createProfile = (
  strategy: NonNullable<CompiledAgentProfile['preview']['inner']>['strategy'],
): CompiledAgentProfile => {
  const considerations = ['preferProjectedMargin'];
  return {
    fingerprint: `continued-deepening-${strategy}`,
    params: {},
    preview: {
      mode: 'exactWorld',
      completion: 'policyGuided',
      inner: {
        chooseOne: false,
        chooseNStep: true,
        maxOptions: 4,
        chooseNBeamWidth: 2,
        depthCap: 3,
        strategy,
        capClass: strategy === 'continuedDeepening' ? 'deep1024' : 'standard256',
        ...(strategy === 'continuedDeepening'
          ? {
              continuedDeepening: {
                broad: { depthCap: 3 },
                deep: {
                  depthCap: 4,
                  trigger: ['allRequestedRefsDepthCapped'],
                  rootPolicy: 'allRootsWithinCap',
                },
              },
            }
          : {}),
      },
    },
    selection: { mode: 'argmax' },
    use: {
      guardrails: [],
      considerations,
      tieBreakers: [],
    },
    plan: {
      stateFeatures: [],
      candidateFeatures: [],
      candidateAggregates: [],
      considerations,
    },
  };
};

const createCatalog = (
  strategy: NonNullable<CompiledAgentProfile['preview']['inner']>['strategy'],
): AgentPolicyCatalog => {
  const profile = createProfile(strategy);
  return withCompiledPolicyCatalog({
    schemaVersion: 2,
    catalogFingerprint: `continued-deepening-${strategy}`,
    surfaceVisibility: {
      globalVars: {},
      globalMarkers: {},
      perPlayerVars: {},
      derivedMetrics: {},
      victory: {
        currentMargin: { current: 'public', preview: { visibility: 'public', allowWhenHiddenSampling: true } },
        currentRank: { current: 'public', preview: { visibility: 'public', allowWhenHiddenSampling: true } },
      },
      activeCardIdentity: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
      activeCardTag: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
      activeCardMetadata: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
      activeCardAnnotation: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
    },
    parameterDefs: {},
    candidateParamDefs: {},
    library: {
      stateFeatures: {},
      candidateFeatures: {},
      candidateAggregates: {},
      guardrails: {},
      considerations: microturnConsiderations({
        preferProjectedMargin: {
          costClass: 'preview',
          when: literal(true),
          weight: literal(1),
          value: refExpr(previewDeltaRef),
          previewFallback: { onUnavailable: 'noContribution' },
          dependencies: {
            parameters: [],
            stateFeatures: [],
            candidateFeatures: [],
            aggregates: [],
            strategicConditions: [],
          },
        },
      }),
      tieBreakers: {},
      strategicConditions: {},
    },
    profiles: {
      baseline: profile,
    },
    bindingsBySeat: {
      us: 'baseline',
      arvn: 'baseline',
    },
  });
};

const createDef = (catalog: AgentPolicyCatalog): GameDef =>
  assertValidatedGameDef({
    metadata: { id: 'continued-deepening-singlepass-unchanged', players: { min: 2, max: 2 } },
    seats: [{ id: 'us' }, { id: 'arvn' }],
    constants: {},
    globalVars: [{ name: 'score', type: 'int', init: 0, min: 0, max: 20 }],
    perPlayerVars: [],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: phaseId }] },
    agents: catalog,
    actions: [{
      id: asActionId('draft-options'),
      actor: 'active',
      executor: 'actor',
      phase: [phaseId],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    }] satisfies ActionDef[],
    actionPipelines: [{
      id: 'draft-options-pipeline',
      actionId: asActionId('draft-options'),
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [{
        effects: [
          eff({
            chooseN: {
              internalDecisionId: 'decision:$picks',
              bind: '$picks',
              options: { query: 'enums', values: ['low', 'high', 'spare'] },
              n: 1,
            },
          }) as ActionPipelineDef['stages'][number]['effects'][number],
          eff({
            if: {
              when: { op: 'in', item: 'high', set: { _t: 2 as const, ref: 'binding', name: '$picks' } },
              then: [eff({ addVar: { scope: 'global', var: 'score', delta: 5 } })],
              else: [eff({ addVar: { scope: 'global', var: 'score', delta: 1 } })],
            },
          }) as ActionPipelineDef['stages'][number]['effects'][number],
        ],
      }],
      atomicity: 'partial',
    }],
    triggers: [],
    terminal: {
      conditions: [],
      margins: [
        { seat: 'us', value: { _t: 2 as const, ref: 'gvar', var: 'score' } },
        { seat: 'arvn', value: 0 },
      ],
    },
  });

const createInput = (
  def: GameDef,
  state: ReturnType<typeof initialState>['state'],
  microturn: MicroturnState,
): AgentMicroturnDecisionInput => ({
  def,
  state,
  microturn,
  rng: { state: state.rng },
});

const capturePreview = (
  strategy: NonNullable<CompiledAgentProfile['preview']['inner']>['strategy'],
): SerializedPreview => {
  const catalog = createCatalog(strategy);
  const def = createDef(catalog);
  const initial = initialState(def, 164, 2);
  const actionSelection = publishMicroturn(def, initial.state);
  const firstAction = actionSelection.legalActions[0];
  assert.ok(firstAction !== undefined);
  const afterAction = applyDecision(def, initial.state, firstAction).state;
  const microturn = publishMicroturn(def, afterAction);
  assert.equal(microturn.kind, 'chooseNStep');
  const preview = createPolicyAgentChooseNStepInnerPreview(
    createInput(def, afterAction, microturn as ChooseNStepMicroturn),
    {
      catalog,
      seatId: 'us',
      profileId: 'baseline',
      profile: catalog.profiles.baseline!,
    },
  );
  assert.ok(preview !== undefined);
  return {
    refIds: preview.refIds,
    usage: preview.usage,
    options: preview.run.options.map((option) => ({
      stableMoveKey: option.stableMoveKey,
      outcome: option.outcome,
      completionPolicyFallbackCount: option.completionPolicyFallbackCount,
      resolvedRefs: [...option.resolvedRefs.entries()].sort(([left], [right]) => left.localeCompare(right)),
    })),
  };
};

describe('continued deepening singlePass dispatch seam', () => {
  it('keeps representative singlePass chooseNStep inner previews byte-identical across replays', () => {
    assert.equal(
      JSON.stringify(capturePreview('singlePass')),
      JSON.stringify(capturePreview('singlePass')),
    );
  });

  it('keeps option results unchanged when continuedDeepening broad coverage does not fire a trigger', () => {
    const continued = capturePreview('continuedDeepening');
    const singlePass = capturePreview('singlePass');

    assert.deepEqual(continued.options, singlePass.options);
    assert.equal((continued.usage as { coverage: { strategy?: string } }).coverage.strategy, 'continuedDeepening');
    assert.equal((continued.usage as { coverage: { broad?: unknown; deep?: unknown } }).coverage.broad !== undefined, true);
    assert.equal((continued.usage as { coverage: { broad?: unknown; deep?: unknown } }).coverage.deep, undefined);
  });

  it('keeps the strategy dispatch insertion site explicit for Ticket 004', () => {
    const source = readFileSync(
      join(resolveRepoRoot(), 'packages/engine/src/agents/policy-agent-inner-preview.ts'),
      'utf8',
    );

    assert.match(source, /resolvedProfile\.profile\.preview\.inner\?\.strategy\s*\?\?\s*'singlePass'/u);
    assert.match(source, /strategy\s*===\s*'continuedDeepening'/u);
    assert.match(source, /policy-preview-inner-deepening/u);
  });
});
