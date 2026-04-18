// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asActionId,
  asPhaseId,
  asZoneId,
  getActionPipelineLookup,
  getActionPipelinesForAction,
  hasActionPipeline,
  type ActionDef,
  type ActionPipelineDef,
  type GameDef,
} from '../../../src/kernel/index.js';

const makeAction = (id: string): ActionDef => ({
  id: asActionId(id),
  actor: 'active',
  executor: 'actor',
  phase: [asPhaseId('main')],
  params: [],
  pre: null,
  cost: [],
  effects: [],
  limits: [],
});

const makePipeline = (id: string, actionId: string): ActionPipelineDef => ({
  id,
  actionId: asActionId(actionId),
  legality: null,
  costValidation: null,
  costEffects: [],
  targeting: {},
  stages: [],
  atomicity: 'atomic',
});

const makeDef = (actionPipelines?: readonly ActionPipelineDef[]): GameDef =>
  ({
    metadata: { id: 'action-pipeline-lookup-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [{ id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set' }],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [makeAction('op'), makeAction('event')],
    ...(actionPipelines === undefined ? {} : { actionPipelines }),
    triggers: [],
    terminal: { conditions: [] },
  }) as unknown as GameDef;

describe('action pipeline lookup', () => {
  it('groups pipelines by action id while preserving declaration order', () => {
    const def = makeDef([
      makePipeline('op-primary', 'op'),
      makePipeline('event-primary', 'event'),
      makePipeline('op-secondary', 'op'),
    ]);

    assert.deepStrictEqual(
      getActionPipelinesForAction(def, asActionId('op')).map((pipeline) => pipeline.id),
      ['op-primary', 'op-secondary'],
    );
    assert.deepStrictEqual(
      getActionPipelinesForAction(def, asActionId('event')).map((pipeline) => pipeline.id),
      ['event-primary'],
    );
  });

  it('returns a stable empty lookup when no pipelines are defined', () => {
    const defA = makeDef();
    const defB = makeDef([]);

    assert.equal(getActionPipelineLookup(defA), getActionPipelineLookup(defA));
    assert.equal(getActionPipelineLookup(defA), getActionPipelineLookup(defB));
    assert.deepStrictEqual(getActionPipelinesForAction(defA, asActionId('op')), []);
    assert.equal(hasActionPipeline(defA, asActionId('op')), false);
  });

  it('reuses cached lookup identity for the same actionPipelines array', () => {
    const pipelines = [makePipeline('op-primary', 'op')];
    const def = makeDef(pipelines);

    assert.equal(getActionPipelineLookup(def), getActionPipelineLookup(def));
  });

  it('keeps independent lookups for different pipeline arrays', () => {
    const defA = makeDef([makePipeline('op-primary', 'op')]);
    const defB = makeDef([makePipeline('op-primary', 'op')]);

    assert.notEqual(getActionPipelineLookup(defA), getActionPipelineLookup(defB));
  });
});
