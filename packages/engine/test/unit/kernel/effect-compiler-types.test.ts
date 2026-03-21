import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import * as kernel from '../../../src/kernel/index.js';
import {
  asPhaseId,
  createGameDefRuntime,
  makeCompiledLifecycleEffectKey,
  type CompiledEffectContext,
  type CompiledEffectSequence,
  type GameDef,
} from '../../../src/kernel/index.js';

const createDef = (): GameDef => ({
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

  it('initializes createGameDefRuntime with an empty compiled lifecycle map', () => {
    const runtime = createGameDefRuntime(createDef());

    assert.ok(runtime.compiledLifecycleEffects instanceof Map);
    assert.equal(runtime.compiledLifecycleEffects.size, 0);
  });

  it('re-exports the compiled effect contract through the kernel barrel', () => {
    assert.equal(kernel.makeCompiledLifecycleEffectKey, makeCompiledLifecycleEffectKey);

    const _sequence: CompiledEffectSequence | null = null;
    const _context: CompiledEffectContext | null = null;
    assert.equal(_sequence, null);
    assert.equal(_context, null);
  });
});
