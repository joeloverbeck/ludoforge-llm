import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import * as kernel from '../../../src/kernel/index.js';
import {
  asPhaseId,
  asActionId,
  createGameDefRuntime,
  makeCompiledLifecycleEffectKey,
  type CompiledEffectContext,
  type CompiledEffectSequence,
  type GameDef,
} from '../../../src/kernel/index.js';
import { eff } from '../../helpers/effect-tag-helper.js';

const createEmptyDef = (): GameDef => ({
  metadata: { id: 'compiled-effect-types-test', players: { min: 2, max: 2 } },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [{ id: asPhaseId('main') }] },
  actions: [],
  triggers: [],
  terminal: { conditions: [] },
});

const createLifecycleDef = (): GameDef => ({
  ...createEmptyDef(),
  turnStructure: {
    phases: [
      {
        id: asPhaseId('main'),
        onEnter: [eff({ setVar: { scope: 'global', var: 'ready', value: true } })],
      },
    ],
  },
  globalVars: [{ name: 'ready', type: 'boolean', init: false }],
});

describe('effect-compiler-types', () => {
  it('creates canonical lifecycle effect keys', () => {
    assert.equal(
      makeCompiledLifecycleEffectKey(asPhaseId('main'), 'onEnter'),
      'main:onEnter',
    );
    assert.equal(
      makeCompiledLifecycleEffectKey(asPhaseId('cleanup'), 'onExit'),
      'cleanup:onExit',
    );
  });

  it('initializes createGameDefRuntime with an empty compiled lifecycle map when no lifecycle effects exist', () => {
    const runtime = createGameDefRuntime(createEmptyDef());

    assert.ok(runtime.alwaysCompleteActionIds instanceof Set);
    assert.equal(runtime.alwaysCompleteActionIds.size, 0);
    assert.ok(runtime.compiledLifecycleEffects instanceof Map);
    assert.equal(runtime.compiledLifecycleEffects.size, 0);
  });

  it('eagerly populates createGameDefRuntime with compiled lifecycle effects when phases define them', () => {
    const runtime = createGameDefRuntime(createLifecycleDef());

    assert.ok(runtime.compiledLifecycleEffects instanceof Map);
    assert.equal(runtime.compiledLifecycleEffects.size, 1);
    assert.ok(runtime.compiledLifecycleEffects.has(makeCompiledLifecycleEffectKey(asPhaseId('main'), 'onEnter')));
  });

  it('precomputes always-complete action ids in createGameDefRuntime', () => {
    const actionId = asActionId('pass');
    const runtime = createGameDefRuntime({
      ...createEmptyDef(),
      actions: [{
        id: actionId,
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
        capabilities: [],
      }],
    });

    assert.ok(runtime.alwaysCompleteActionIds instanceof Set);
    assert.equal(runtime.alwaysCompleteActionIds.has(actionId), true);
  });

  it('re-exports the compiled effect contract through the kernel barrel', () => {
    assert.equal(kernel.makeCompiledLifecycleEffectKey, makeCompiledLifecycleEffectKey);

    const _sequence: CompiledEffectSequence | null = null;
    const _context: CompiledEffectContext | null = null;
    assert.equal(_sequence, null);
    assert.equal(_context, null);
  });
});
