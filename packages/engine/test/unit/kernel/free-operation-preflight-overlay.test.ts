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

    assert.deepEqual(overlay, {
      executionPlayerOverride: asPlayerId(1),
      skipPhaseCheck: true,
    });
  });

  it('threads zone-filter diagnostics with provided surface and move payload for both surfaces', () => {
    const zoneFilter = {
      op: '==',
      left: { _t: 2 as const, ref: 'zoneProp', zone: '$zone', prop: 'category' },
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
        skipPhaseCheck: true,
        freeOperationOverlay: {
          zoneFilter,
          zoneFilterDiagnostics: {
            source: surface,
            actionId: 'operation:free',
            moveParams,
          },
        },
      });
    }
  });

  it('threads grantContext payloads inside the overlay object', () => {
    const overlay = buildFreeOperationPreflightOverlay(
      { executionPlayer: asPlayerId(0), executionContext: { allowedTargets: [2], effectCode: 7 } },
      { actionId: asActionId('operation:free'), params: { target: 2 } },
      'turnFlowEligibility',
    );

    assert.deepEqual(overlay, {
      executionPlayerOverride: asPlayerId(0),
      skipPhaseCheck: true,
      freeOperationOverlay: {
        grantContext: {
          allowedTargets: [2],
          effectCode: 7,
        },
      },
    });
  });

  it('threads token interpretations inside the overlay object', () => {
    const tokenInterpretations = [
      {
        when: {
          op: 'and' as const,
          args: [
            { prop: 'faction', op: 'eq' as const, value: 'ARVN' },
            { prop: 'type', op: 'in' as const, value: ['troops', 'police'] },
          ],
        },
        assign: {
          faction: 'US',
          type: 'troops',
        },
      },
    ] as const;

    const overlay = buildFreeOperationPreflightOverlay(
      { executionPlayer: asPlayerId(0), tokenInterpretations },
      { actionId: asActionId('operation:free'), params: { target: 2 } },
      'turnFlowEligibility',
    );

    assert.deepEqual(overlay, {
      executionPlayerOverride: asPlayerId(0),
      skipPhaseCheck: true,
      freeOperationOverlay: {
        tokenInterpretations,
      },
    });
  });

  it('can omit skipPhaseCheck when the caller needs ordinary phase gating', () => {
    const overlay = buildFreeOperationPreflightOverlay(
      { executionPlayer: asPlayerId(0), executionContext: { allowedTargets: [2] } },
      { actionId: asActionId('operation:free'), params: { target: 2 } },
      'turnFlowEligibility',
      { skipPhaseCheck: false },
    );

    assert.deepEqual(overlay, {
      executionPlayerOverride: asPlayerId(0),
      freeOperationOverlay: {
        grantContext: {
          allowedTargets: [2],
        },
      },
    });
  });
});
