// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { Ajv } from 'ajv';

import { buildPolicyAgentDecisionTrace } from '../../../src/agents/policy-diagnostics.js';
import {
  PREVIEW_UTILITY_VALUES,
  SELECTION_REASONS,
  type PolicyEvaluationMetadata,
} from '../../../src/agents/policy-eval.js';

const readTraceSchema = (): Record<string, unknown> => {
  const schemaPath = path.join(process.cwd(), 'schemas', 'Trace.schema.json');
  return JSON.parse(readFileSync(schemaPath, 'utf8')) as Record<string, unknown>;
};

const asRecord = (value: unknown): Record<string, unknown> => {
  assert.equal(typeof value, 'object');
  assert.notEqual(value, null);
  return value as Record<string, unknown>;
};

const propertySchema = (schema: Record<string, unknown>, property: string): Record<string, unknown> => {
  const properties = asRecord(schema.properties);
  return asRecord(properties[property]);
};

const withDefinitions = (
  rootSchema: Record<string, unknown>,
  schema: Record<string, unknown>,
): Record<string, unknown> => ({
  ...schema,
  definitions: rootSchema.definitions,
});

const findObjectWithProperty = (
  value: unknown,
  property: string,
): Record<string, unknown> | null => {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const properties = record.properties;
  if (typeof properties === 'object' && properties !== null && property in properties) {
    return record;
  }
  for (const child of Object.values(record)) {
    const found = findObjectWithProperty(child, property);
    if (found !== null) {
      return found;
    }
  }
  return null;
};

const createMetadata = (): PolicyEvaluationMetadata => ({
  seatId: 'us',
  requestedProfileId: 'baseline',
  profileId: 'baseline',
  profileFingerprint: 'trace-shape',
  canonicalOrder: ['advance'],
  candidates: [{
    actionId: 'advance',
    stableMoveKey: 'advance|{}|false|event',
    score: 0,
    prunedBy: [],
    scoreContributions: [],
    previewRefIds: [],
    unknownPreviewRefs: [],
    unknownLookupRefs: [],
    unknownCandidateParamRefs: [],
    selectionReason: 'gated',
  }],
  pruningSteps: [],
  tieBreakChain: [],
  previewUsage: {
    mode: 'exactWorld',
    evaluatedCandidateCount: 0,
    completionPolicyFallbackCount: 0,
    refIds: [],
    unknownRefs: [],
    readyRefStats: {},
    utility: 'none',
    widenedBecauseUniform: false,
    outcomeBreakdown: {
      ready: 0,
      stochastic: 0,
      unknownRandom: 0,
      unknownHidden: 0,
      unknownUnresolved: 0,
      unknownDepthCap: 0,
      unknownPostGrantCap: 0,
      unknownFreeOperationCap: 0,
      unknownGrantFlowPartial: 0,
      unknownNoPreviewDecision: 0,
      unknownGated: 0,
      unknownFailed: 0,
    },
    coverage: {
      requestedRefCount: 0,
      evaluatedRootOptionCount: 0,
      readyRootOptionCount: 0,
      unavailableRootOptionCount: 0,
      allRootsUnavailable: false,
      selectedByTieBreakerBecausePreviewUnavailable: false,
      strategy: 'singlePass',
      capClass: 'standard256',
    },
  },
  selectedStableMoveKey: 'advance|{}|false|event',
  finalScore: 0,
  usedFallback: false,
  failure: null,
});

describe('policy trace shape', () => {
  it('exports preview utility and selection reason constants matching Trace.schema.json', () => {
    const traceSchema = readTraceSchema();
    const agentDecisionSchema = findObjectWithProperty(traceSchema, 'previewUsage');
    assert.notEqual(agentDecisionSchema, null);
    const previewUsageSchema = propertySchema(agentDecisionSchema!, 'previewUsage');
    const utilitySchema = propertySchema(previewUsageSchema, 'utility');
    assert.deepEqual(utilitySchema.enum, [...PREVIEW_UTILITY_VALUES]);

    const candidatesSchema = propertySchema(agentDecisionSchema!, 'candidates');
    const candidateSchema = asRecord(candidatesSchema.items);
    const selectionReasonSchema = propertySchema(candidateSchema, 'selectionReason');
    assert.deepEqual(selectionReasonSchema.enum, [...SELECTION_REASONS]);
  });

  it('emits schema-valid safe-empty preview observability defaults on policy traces', () => {
    const traceSchema = readTraceSchema();
    const agentDecisionSchema = findObjectWithProperty(traceSchema, 'previewUsage');
    assert.notEqual(agentDecisionSchema, null);
    const previewUsageSchema = propertySchema(agentDecisionSchema!, 'previewUsage');
    const candidatesSchema = propertySchema(agentDecisionSchema!, 'candidates');
    const candidateSchema = asRecord(candidatesSchema.items);
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validatePreviewUsage = ajv.compile(withDefinitions(traceSchema, previewUsageSchema));
    const validateCandidate = ajv.compile(withDefinitions(traceSchema, candidateSchema));
    const trace = buildPolicyAgentDecisionTrace(createMetadata(), 'verbose');

    assert.deepEqual(trace.previewUsage.readyRefStats, {});
    assert.equal(trace.previewUsage.utility, 'none');
    assert.equal(trace.candidates?.[0]?.selectionReason, 'gated');
    assert.deepEqual(trace.candidates?.[0]?.scoreContributions, []);
    assert.equal(validatePreviewUsage(trace.previewUsage), true, JSON.stringify(validatePreviewUsage.errors, null, 2));
    assert.equal(validateCandidate(trace.candidates?.[0]), true, JSON.stringify(validateCandidate.errors, null, 2));
  });
});
