// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { asActionId, asPhaseId, type ActionDef, type GameDef } from '../../../src/kernel/index.js';
import { getPhaseActionIndex } from '../../../src/kernel/phase-action-index.js';
import { asTaggedGameDef } from '../../helpers/gamedef-fixtures.js';

const makeGameDef = (actions: readonly ActionDef[]): GameDef =>
  asTaggedGameDef({
    metadata: { id: 'phase-action-index-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [{ id: 'board:none', owner: 'none', visibility: 'public', ordering: 'set' }],
    tokenTypes: [],
    setup: [],
    turnStructure: {
      phases: [{ id: 'main' }, { id: 'coup' }, { id: 'cleanup' }],
    },
    actions,
    triggers: [],
    terminal: { conditions: [] },
  });

describe('phase-action-index', () => {
  it('groups actions by phase and preserves dual-phase membership', () => {
    const mainOnly: ActionDef = {
      id: asActionId('mainOnly'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };
    const dualPhase: ActionDef = {
      id: asActionId('dualPhase'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main'), asPhaseId('coup')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };
    const cleanupOnly: ActionDef = {
      id: asActionId('cleanupOnly'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('cleanup')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const def = makeGameDef([mainOnly, dualPhase, cleanupOnly]);
    const index = getPhaseActionIndex(def);

    assert.deepEqual(index.actionsByPhase.get(asPhaseId('main')), [mainOnly, dualPhase]);
    assert.deepEqual(index.actionsByPhase.get(asPhaseId('coup')), [dualPhase]);
    assert.deepEqual(index.actionsByPhase.get(asPhaseId('cleanup')), [cleanupOnly]);
    assert.equal(index.actionsByPhase.get(asPhaseId('missing')), undefined);
  });

  it('caches by the def.actions array identity', () => {
    const left = makeGameDef([
      {
        id: asActionId('shared'),
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
    ]);
    const right: GameDef = {
      ...left,
      metadata: {
        ...left.metadata,
        id: 'phase-action-index-test-copy',
      },
    };
    const leftIndex = getPhaseActionIndex(left);

    assert.equal(getPhaseActionIndex(left), leftIndex);
    assert.equal(getPhaseActionIndex(right), leftIndex);
  });

  it('builds independent indexes for distinct action arrays', () => {
    const left = makeGameDef([
      {
        id: asActionId('left'),
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
    ]);
    const right = makeGameDef([
      {
        id: asActionId('right'),
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
    ]);

    assert.notEqual(getPhaseActionIndex(left), getPhaseActionIndex(right));
  });
});
