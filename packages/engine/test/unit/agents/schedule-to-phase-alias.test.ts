// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '../../../src/cnl/index.js';
import { createPolicyRuntimeProviders } from '../../../src/agents/policy-runtime.js';
import { asPlayerId, type CompiledAgentPolicyRef } from '../../../src/kernel/index.js';
import {
  makeScheduleRefDef,
  runtimeWithDrawnCount,
  scheduleDistanceRef,
  stateWithDrawnCount,
} from './schedule-ref-test-fixtures.js';

const authoredRef = (value: string) => ({ ref: value });

function compiledAliasRef(): Extract<CompiledAgentPolicyRef, { readonly kind: 'scheduleDistance' }> {
  const baseDef = makeScheduleRefDef();
  const result = compileGameSpecToGameDef({
    ...createEmptyGameSpecDoc(),
    metadata: { id: 'schedule-to-phase-alias', players: { min: 1, max: 1 } },
    dataAssets: [{ id: 'seats', kind: 'seatCatalog', payload: { seats: [{ id: 'solo' }] } }],
    zones: [
      { id: 'draw', owner: 'none', visibility: 'public', ordering: 'stack', behavior: { type: 'deck', drawFrom: 'top' } },
      { id: 'discard', owner: 'none', visibility: 'public', ordering: 'stack' },
    ],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: 'main' }, { id: 'scoring' }] },
    actions: [{
      id: 'pass',
      actor: 'active',
      executor: 'actor',
      phase: ['main'],
      tags: ['pass'],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    }],
    triggers: [],
    terminal: { conditions: [] },
    eventDecks: [{
      id: 'eventDeck',
      drawZone: 'draw:none',
      discardZone: 'discard:none',
      cards: baseDef.eventDecks![0]!.cards,
    }],
    phaseBoundaries: baseDef.phaseBoundaries!.map((boundary) => ({
      id: String(boundary.id),
      kind: boundary.kind,
      phaseId: String(boundary.phaseId),
      schedule: boundary.schedule!,
    })),
    agents: {
      library: {
        considerations: {
          phaseCards: {
            scopes: ['move'],
            weight: 1,
            value: authoredRef('schedule.distance.toPhase.scoring.cards'),
            scheduleFallback: { onUnavailable: 'noContribution' },
          },
        },
      },
    },
  });

  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
  const expr = result.gameDef!.agents!.compiled.considerations.phaseCards!.value;
  assert.equal(expr.kind, 'ref');
  assert.equal(expr.ref.kind, 'scheduleDistance');
  assert.deepEqual(expr.ref, scheduleDistanceRef('coupEntry'));
  return expr.ref;
}

describe('schedule toPhase aliases', () => {
  it('resolve identically to the first declared matching phaseEntry boundary', () => {
    const def = makeScheduleRefDef();
    const aliasRef = compiledAliasRef();
    const rows = [0, 1, 2, 3, 5].map((drawnCount) => {
      const runtime = runtimeWithDrawnCount(def, drawnCount);
      const state = stateWithDrawnCount(def, drawnCount);
      const providers = createPolicyRuntimeProviders({
        def,
        state,
        playerId: asPlayerId(0),
        seatId: 'solo',
        trustedMoveIndex: new Map(),
        catalog: def.agents!,
        runtime,
        runtimeError: (code, message) => new Error(`${code}: ${message}`),
      });
      return [
        providers.phaseSchedule.resolveScheduleDistance(aliasRef),
        providers.phaseSchedule.resolveScheduleDistance(scheduleDistanceRef('coupEntry')),
        providers.phaseSchedule.resolveScheduleDistance(scheduleDistanceRef('lateCoupEntry')),
      ] as const;
    });

    assert.deepEqual(rows, [
      [{ kind: 'ready', value: 2 }, { kind: 'ready', value: 2 }, { kind: 'ready', value: 4 }],
      [{ kind: 'ready', value: 1 }, { kind: 'ready', value: 1 }, { kind: 'ready', value: 3 }],
      [{ kind: 'ready', value: 2 }, { kind: 'ready', value: 2 }, { kind: 'ready', value: 2 }],
      [{ kind: 'ready', value: 1 }, { kind: 'ready', value: 1 }, { kind: 'ready', value: 1 }],
      [
        { kind: 'unavailable', reason: 'noTriggeringCardRemaining' },
        { kind: 'unavailable', reason: 'noTriggeringCardRemaining' },
        { kind: 'unavailable', reason: 'noTriggeringCardRemaining' },
      ],
    ]);
  });
});
