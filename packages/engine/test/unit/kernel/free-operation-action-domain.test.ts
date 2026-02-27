import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveEffectiveFreeOperationActionDomain, resolveGrantFreeOperationActionDomain, resolveTurnFlowDefaultFreeOperationActionDomain } from '../../../src/kernel/free-operation-action-domain.js';
import type { GameDef } from '../../../src/kernel/index.js';

const makeDef = (freeOperationActionIds?: readonly string[]): GameDef =>
  ({
    turnOrder: {
      type: 'cardDriven',
      config: {
        turnFlow: {
          freeOperationActionIds,
        },
      },
    },
  }) as unknown as GameDef;

describe('free-operation-action-domain', () => {
  it('resolves effective domain to empty array when grant and defaults are absent', () => {
    const resolved = resolveEffectiveFreeOperationActionDomain(undefined, undefined);
    assert.deepEqual(resolved, []);
  });

  it('prefers explicit grant actionIds over defaults', () => {
    const resolved = resolveEffectiveFreeOperationActionDomain(['explicit-action'], ['default-action']);
    assert.deepEqual(resolved, ['explicit-action']);
  });

  it('resolves turn-flow default domain to empty array when absent', () => {
    const resolved = resolveTurnFlowDefaultFreeOperationActionDomain(makeDef(undefined));
    assert.deepEqual(resolved, []);
  });

  it('resolves grant domain against turn-flow defaults', () => {
    const resolved = resolveGrantFreeOperationActionDomain(makeDef(['default-action']), {});
    assert.deepEqual(resolved, ['default-action']);
  });
});
