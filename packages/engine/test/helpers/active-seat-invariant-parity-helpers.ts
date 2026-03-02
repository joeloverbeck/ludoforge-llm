import * as assert from 'node:assert/strict';

import {
  EFFECT_RUNTIME_REASONS,
  effectRuntimeError,
  makeTurnFlowActiveSeatUnresolvableEffectRuntimeContext,
  runtimeContractInvalidError,
  type KernelRuntimeErrorContext,
  type TurnFlowActiveSeatInvariantSurface,
} from '../../src/kernel/index.js';
import {
  activeSeatUnresolvableInvariantMessage,
  makeActiveSeatUnresolvableInvariantContext,
} from '../../src/kernel/turn-flow-runtime-invariants.js';

export interface ActiveSeatInvariantParityFixture {
  readonly surface: TurnFlowActiveSeatInvariantSurface;
  readonly activePlayer: number;
  readonly seatOrder: readonly string[];
}

export const assertActiveSeatInvariantContractParity = (
  fixture: ActiveSeatInvariantParityFixture,
): void => {
  const activeSeatInvariant = makeActiveSeatUnresolvableInvariantContext(
    fixture.surface,
    fixture.activePlayer,
    fixture.seatOrder,
  );
  const message = activeSeatUnresolvableInvariantMessage(activeSeatInvariant);

  const kernelError = runtimeContractInvalidError(message, activeSeatInvariant);
  const effectError = effectRuntimeError(
    EFFECT_RUNTIME_REASONS.TURN_FLOW_RUNTIME_VALIDATION_FAILED,
    message,
    makeTurnFlowActiveSeatUnresolvableEffectRuntimeContext(activeSeatInvariant),
  );

  assert.equal(kernelError.code, 'RUNTIME_CONTRACT_INVALID');
  assert.equal(effectError.code, 'EFFECT_RUNTIME');
  const kernelContext: KernelRuntimeErrorContext<'RUNTIME_CONTRACT_INVALID'> = kernelError.context!;
  assert.ok('invariant' in kernelContext);
  if (!('invariant' in kernelContext)) {
    assert.fail('expected active-seat invariant context on kernel runtime contract error');
  }

  const effectContext = effectError.context;
  assert.ok(effectContext);
  if (effectContext === undefined) {
    assert.fail('expected effect runtime context');
  }
  assert.equal(effectContext.reason, EFFECT_RUNTIME_REASONS.TURN_FLOW_RUNTIME_VALIDATION_FAILED);
  assert.ok('invariant' in effectContext);
  if (!('invariant' in effectContext)) {
    assert.fail('expected active-seat invariant context on effect runtime error');
  }

  assert.equal(kernelContext.invariant, effectContext.invariant);
  assert.equal(kernelContext.surface, effectContext.surface);
  assert.equal(kernelContext.activePlayer, effectContext.activePlayer);
  assert.deepEqual(kernelContext.seatOrder, effectContext.seatOrder);
  assert.equal(effectContext.effectType, 'grantFreeOperation');

  const canonicalPrefix = `${message} context=`;
  assert.equal(kernelError.message.startsWith(canonicalPrefix), true);
  assert.equal(effectError.message.startsWith(canonicalPrefix), true);
  assert.match(kernelError.message, /could not resolve active seat/i);
  assert.match(effectError.message, /could not resolve active seat/i);
};
