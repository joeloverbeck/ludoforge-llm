import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { advancePhase, asPhaseId, initialState, type EffectAST, type GameDef } from '../../src/kernel/index.js';

interface ResourcesFixtureOptions {
  readonly sabotageCount: number;
  readonly aid: number;
  readonly casualties: number;
  readonly trail: number;
  readonly laosControl: boolean;
  readonly cambodiaControl: boolean;
}

const createResourcesFixtureDef = (options: ResourcesFixtureOptions): GameDef => {
  const setup: EffectAST[] = [];

  for (let index = 0; index < options.sabotageCount; index += 1) {
    setup.push({ createToken: { type: 'sabotage', zone: 'marker_pool:none', props: { isSabotage: true, econ: 0 } } });
  }

  for (let index = 0; index < options.casualties; index += 1) {
    setup.push({ createToken: { type: 'us_casualty', zone: 'casualties-US:none', props: { isCasualty: true } } });
  }

  setup.push(
    { createToken: { type: 'econ', zone: 'loc_a:none', props: { econ: 2 } } },
    { createToken: { type: 'econ', zone: 'loc_b:none', props: { econ: 1 } } },
    { createToken: { type: 'econ', zone: 'loc_c:none', props: { econ: 3 } } },
  );

  if (options.laosControl) {
    setup.push({ createToken: { type: 'control', zone: 'laos_coin:none', props: { coin: true } } });
  }
  if (options.cambodiaControl) {
    setup.push({ createToken: { type: 'control', zone: 'cambodia_coin:none', props: { coin: true } } });
  }

  const resourcesPhaseEffects: EffectAST[] = [
    {
      forEach: {
        bind: '$sabotage',
        over: { query: 'tokensInZone', zone: 'marker_pool:none' },
        effects: [
          {
            if: {
              when: { op: '==', left: { ref: 'zoneCount', zone: 'loc_a:none' }, right: 1 },
              then: [{ moveToken: { token: '$sabotage', from: 'marker_pool:none', to: 'loc_a:none' } }],
              else: [
                {
                  if: {
                    when: { op: '==', left: { ref: 'zoneCount', zone: 'loc_b:none' }, right: 1 },
                    then: [{ moveToken: { token: '$sabotage', from: 'marker_pool:none', to: 'loc_b:none' } }],
                    else: [
                      {
                        if: {
                          when: { op: '==', left: { ref: 'zoneCount', zone: 'loc_c:none' }, right: 1 },
                          then: [{ moveToken: { token: '$sabotage', from: 'marker_pool:none', to: 'loc_c:none' } }],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
    {
      if: {
        when: {
          op: 'and',
          args: [
            { op: '>', left: { ref: 'zoneCount', zone: 'laos_coin:none' }, right: 0 },
            { op: '>', left: { ref: 'zoneCount', zone: 'cambodia_coin:none' }, right: 0 },
          ],
        },
        then: [{ addVar: { scope: 'global', var: 'trail', delta: -1 } }],
      },
    },
    { setVar: { scope: 'global', var: 'totalEcon', value: 0 } },
    {
      if: {
        when: { op: '==', left: { ref: 'zoneCount', zone: 'loc_a:none' }, right: 1 },
        then: [{ addVar: { scope: 'global', var: 'totalEcon', delta: 2 } }],
      },
    },
    {
      if: {
        when: { op: '==', left: { ref: 'zoneCount', zone: 'loc_b:none' }, right: 1 },
        then: [{ addVar: { scope: 'global', var: 'totalEcon', delta: 1 } }],
      },
    },
    {
      if: {
        when: { op: '==', left: { ref: 'zoneCount', zone: 'loc_c:none' }, right: 1 },
        then: [{ addVar: { scope: 'global', var: 'totalEcon', delta: 3 } }],
      },
    },
    {
      setVar: {
        scope: 'global',
        var: 'arvnResources',
        value: {
          op: '+',
          left: { ref: 'gvar', var: 'aid' },
          right: { ref: 'gvar', var: 'totalEcon' },
        },
      },
    },
    { addVar: { scope: 'global', var: 'vcResources', delta: { ref: 'gvar', var: 'totalEcon' } } },
    { addVar: { scope: 'global', var: 'nvaResources', delta: { ref: 'gvar', var: 'trail' } } },
    {
      addVar: {
        scope: 'global',
        var: 'aid',
        delta: {
          op: '-',
          left: 0,
          right: {
            op: '*',
            left: 3,
            right: {
              aggregate: {
                op: 'count',
                query: { query: 'tokensInZone', zone: 'casualties-US:none' },
              },
            },
          },
        },
      },
    },
  ];

  return {
    metadata: { id: 'fitl-coup-resources-phase-int', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
    constants: {},
    globalVars: [
      { name: 'aid', type: 'int', init: options.aid, min: 0, max: 75 },
      { name: 'trail', type: 'int', init: options.trail, min: 0, max: 4 },
      { name: 'totalEcon', type: 'int', init: 0, min: 0, max: 15 },
      { name: 'arvnResources', type: 'int', init: 0, min: 0, max: 75 },
      { name: 'vcResources', type: 'int', init: 0, min: 0, max: 75 },
      { name: 'nvaResources', type: 'int', init: 0, min: 0, max: 75 },
    ],
    perPlayerVars: [],
    zones: [
      { id: 'marker_pool:none', owner: 'none', visibility: 'public', ordering: 'stack' },
      { id: 'loc_a:none', owner: 'none', visibility: 'public', ordering: 'queue' },
      { id: 'loc_b:none', owner: 'none', visibility: 'public', ordering: 'queue' },
      { id: 'loc_c:none', owner: 'none', visibility: 'public', ordering: 'queue' },
      { id: 'laos_coin:none', owner: 'none', visibility: 'public', ordering: 'queue' },
      { id: 'cambodia_coin:none', owner: 'none', visibility: 'public', ordering: 'queue' },
      { id: 'casualties-US:none', owner: 'none', visibility: 'public', ordering: 'set' },
    ],
    tokenTypes: [
      { id: 'sabotage', props: { isSabotage: 'boolean', econ: 'int' } },
      { id: 'econ', props: { econ: 'int' } },
      { id: 'control', props: { coin: 'boolean' } },
      { id: 'us_casualty', props: { isCasualty: 'boolean' } },
    ],
    setup,
    turnStructure: {
      phases: [{ id: asPhaseId('main') }, { id: asPhaseId('resources') }],
    },
    actions: [
      {
        id: 'pass',
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
    ],
    triggers: [{ id: 'on_resources_enter', event: { type: 'phaseEnter', phase: asPhaseId('resources') }, effects: resourcesPhaseEffects }],
    terminal: { conditions: [] },
  } as unknown as GameDef;
};

describe('FITL coup resources phase integration', () => {
  it('executes deterministic sabotage placement, coupled earnings, and aid floor arithmetic', () => {
    const def = createResourcesFixtureDef({
      sabotageCount: 2,
      aid: 10,
      casualties: 4,
      trail: 3,
      laosControl: true,
      cambodiaControl: true,
    });
    const start = initialState(def, 17, 2).state;

    const next = advancePhase(def, start);

    assert.equal(next.currentPhase, asPhaseId('resources'));
    assert.equal(next.zones['marker_pool:none']?.length, 0);
    assert.equal(next.zones['loc_a:none']?.length, 2);
    assert.equal(next.zones['loc_b:none']?.length, 2);
    assert.equal(next.zones['loc_c:none']?.length, 1);

    assert.equal(next.globalVars.trail, 2);
    assert.equal(next.globalVars.totalEcon, 3);
    assert.equal(next.globalVars.arvnResources, 13);
    assert.equal(next.globalVars.vcResources, 3);
    assert.equal(next.globalVars.nvaResources, 2);
    assert.equal(next.globalVars.aid, 0);
  });

  it('leaves excess sabotage markers in pool once all LoC targets are exhausted and keeps deterministic results', () => {
    const def = createResourcesFixtureDef({
      sabotageCount: 4,
      aid: 8,
      casualties: 1,
      trail: 2,
      laosControl: true,
      cambodiaControl: false,
    });

    const runOnce = () => {
      const start = initialState(def, 23, 2).state;
      return advancePhase(def, start);
    };

    const first = runOnce();
    const second = runOnce();

    assert.deepEqual(second, first);
    assert.equal(first.zones['marker_pool:none']?.length, 1);
    assert.equal(first.zones['loc_a:none']?.length, 2);
    assert.equal(first.zones['loc_b:none']?.length, 2);
    assert.equal(first.zones['loc_c:none']?.length, 2);
    assert.equal(first.globalVars.totalEcon, 0);
    assert.equal(first.globalVars.trail, 2);
    assert.equal(first.globalVars.aid, 5);
  });
});
