import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { asActionId, asPlayerId } from '../../../src/kernel/branded.js';
import { buildFreeOperationPreflightOverlay } from '../../../src/kernel/free-operation-preflight-overlay.js';

describe('free-operation preflight overlay builder', () => {
  it('returns an empty overlay when free-operation analysis is missing', () => {
    const overlay = buildFreeOperationPreflightOverlay(
      null,
      { actionId: asActionId('operation'), params: {} },
      'turnFlowEligibility',
    );

    assert.deepEqual(overlay, {});
  });

  it('always sets executionPlayerOverride when analysis is present', () => {
    const overlay = buildFreeOperationPreflightOverlay(
      { executionPlayer: asPlayerId(1) },
      { actionId: asActionId('operation'), params: {} },
      'legalChoices',
    );

    assert.deepEqual(overlay, { executionPlayerOverride: asPlayerId(1) });
  });

  it('threads zone-filter diagnostics with the provided surface and move payload', () => {
    const zoneFilter = {
      op: '==',
      left: { ref: 'zoneProp', zone: '$zone', prop: 'category' },
      right: 'board',
    } as const;
    const moveParams = { zone: 'board:none', count: 2 };
    const overlay = buildFreeOperationPreflightOverlay(
      { executionPlayer: asPlayerId(0), zoneFilter },
      { actionId: asActionId('operation:free'), params: moveParams },
      'legalChoices',
    );

    assert.deepEqual(overlay, {
      executionPlayerOverride: asPlayerId(0),
      freeOperationZoneFilter: zoneFilter,
      freeOperationZoneFilterDiagnostics: {
        source: 'legalChoices',
        actionId: 'operation:free',
        moveParams,
      },
    });
  });
});
