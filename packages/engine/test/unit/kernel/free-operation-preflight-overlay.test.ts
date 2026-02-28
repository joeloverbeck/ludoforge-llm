import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { asActionId, asPlayerId } from '../../../src/kernel/branded.js';
import { buildFreeOperationPreflightOverlay } from '../../../src/kernel/free-operation-preflight-overlay.js';
import type { FreeOperationZoneFilterSurface } from '../../../src/kernel/free-operation-zone-filter-contract.js';

describe('free-operation preflight overlay builder', () => {
  it('returns an empty overlay when free-operation analysis is missing', () => {
    const overlay = buildFreeOperationPreflightOverlay(
      null,
      { actionId: asActionId('operation'), params: {} },
      'turnFlowEligibility',
    );

    assert.deepEqual(overlay, {});
  });

  it('sets executionPlayerOverride and omits diagnostics when analysis has no zoneFilter', () => {
    const overlay = buildFreeOperationPreflightOverlay(
      { executionPlayer: asPlayerId(1) },
      { actionId: asActionId('operation'), params: {} },
      'turnFlowEligibility',
    );

    assert.deepEqual(overlay, { executionPlayerOverride: asPlayerId(1) });
  });

  it('threads zone-filter diagnostics with provided surface and move payload for both surfaces', () => {
    const zoneFilter = {
      op: '==',
      left: { ref: 'zoneProp', zone: '$zone', prop: 'category' },
      right: 'board',
    } as const;
    const moveParams = { zone: 'board:none', count: 2 };
    const surfaces: readonly FreeOperationZoneFilterSurface[] = [
      'legalChoices',
      'turnFlowEligibility',
    ];

    for (const surface of surfaces) {
      const overlay = buildFreeOperationPreflightOverlay(
        { executionPlayer: asPlayerId(0), zoneFilter },
        { actionId: asActionId('operation:free'), params: moveParams },
        surface,
      );

      assert.deepEqual(overlay, {
        executionPlayerOverride: asPlayerId(0),
        freeOperationZoneFilter: zoneFilter,
        freeOperationZoneFilterDiagnostics: {
          source: surface,
          actionId: 'operation:free',
          moveParams,
        },
      });
    }
  });
});
