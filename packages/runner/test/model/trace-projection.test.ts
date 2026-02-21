import { asPlayerId, type EffectTraceEntry, type TriggerEvent } from '@ludoforge/engine/runtime';
import { describe, expect, it } from 'vitest';

import {
  isTriggeredEffectTraceEntry,
  projectEffectTraceEntry,
  projectTriggerEvent,
} from '../../src/model/trace-projection.js';

describe('trace-projection', () => {
  it('projects refs and player context for effect trace entries', () => {
    const move: EffectTraceEntry = {
      kind: 'moveToken',
      tokenId: 'tok-1',
      from: 'zone-a',
      to: 'zone-b',
      provenance: provenance('actionEffect'),
    };
    expect(projectEffectTraceEntry(move)).toEqual({
      kind: 'moveToken',
      isTriggered: false,
      zoneIds: ['zone-a', 'zone-b'],
      tokenIds: ['tok-1'],
    });

    const perPlayerVar: EffectTraceEntry = {
      kind: 'varChange',
      scope: 'perPlayer',
      varName: 'coins',
      oldValue: 1,
      newValue: 2,
      player: asPlayerId(2),
      provenance: provenance('triggerEffect'),
    };
    expect(projectEffectTraceEntry(perPlayerVar)).toEqual({
      kind: 'varChange',
      isTriggered: true,
      zoneIds: [],
      tokenIds: [],
      playerId: 2,
    });

    const transfer: EffectTraceEntry = {
      kind: 'resourceTransfer',
      from: { scope: 'global', varName: 'bank' },
      to: { scope: 'perPlayer', varName: 'coins', player: asPlayerId(1) },
      requestedAmount: 3,
      actualAmount: 2,
      sourceAvailable: 2,
      destinationHeadroom: 10,
      provenance: provenance('actionEffect'),
    };
    expect(projectEffectTraceEntry(transfer)).toEqual({
      kind: 'resourceTransfer',
      isTriggered: false,
      zoneIds: [],
      tokenIds: [],
      playerId: 1,
    });

    const create: EffectTraceEntry = {
      kind: 'createToken',
      tokenId: 'tok-2',
      type: 'cube',
      zone: 'zone-c',
      provenance: provenance('actionEffect'),
    };
    expect(projectEffectTraceEntry(create)).toEqual({
      kind: 'createToken',
      isTriggered: false,
      zoneIds: ['zone-c'],
      tokenIds: ['tok-2'],
    });

    const setProp: EffectTraceEntry = {
      kind: 'setTokenProp',
      tokenId: 'tok-3',
      prop: 'active',
      oldValue: false,
      newValue: true,
      provenance: provenance('actionEffect'),
    };
    expect(projectEffectTraceEntry(setProp)).toEqual({
      kind: 'setTokenProp',
      isTriggered: false,
      zoneIds: [],
      tokenIds: ['tok-3'],
    });

    const revealToSingle: EffectTraceEntry = {
      kind: 'reveal',
      zone: 'zone-secret',
      observers: [asPlayerId(1)],
      provenance: provenance('actionEffect'),
    };
    expect(projectEffectTraceEntry(revealToSingle)).toEqual({
      kind: 'reveal',
      isTriggered: false,
      zoneIds: ['zone-secret'],
      tokenIds: [],
      playerId: 1,
    });

    const revealToAll: EffectTraceEntry = {
      kind: 'reveal',
      zone: 'zone-secret',
      observers: 'all',
      provenance: provenance('triggerEffect'),
    };
    expect(projectEffectTraceEntry(revealToAll)).toEqual({
      kind: 'reveal',
      isTriggered: true,
      zoneIds: ['zone-secret'],
      tokenIds: [],
    });

    const concealFromMany: EffectTraceEntry = {
      kind: 'conceal',
      zone: 'zone-secret',
      from: [asPlayerId(0), asPlayerId(2)],
      grantsRemoved: 2,
      provenance: provenance('actionEffect'),
    };
    expect(projectEffectTraceEntry(concealFromMany)).toEqual({
      kind: 'conceal',
      isTriggered: false,
      zoneIds: ['zone-secret'],
      tokenIds: [],
    });
  });

  it('projects trigger event refs and player context', () => {
    const tokenEntered: TriggerEvent = {
      type: 'tokenEntered',
      zone: 'zone-a' as never,
    };
    expect(projectTriggerEvent(tokenEntered)).toEqual({ zoneIds: ['zone-a'] });

    const perPlayerVar: TriggerEvent = {
      type: 'varChanged',
      scope: 'perPlayer',
      var: 'coins',
      player: asPlayerId(3),
      oldValue: 1,
      newValue: 2,
    };
    expect(projectTriggerEvent(perPlayerVar)).toEqual({ zoneIds: [], playerId: 3 });

    const globalVar: TriggerEvent = {
      type: 'varChanged',
      scope: 'global',
      var: 'pot',
      oldValue: 10,
      newValue: 20,
    };
    expect(projectTriggerEvent(globalVar)).toEqual({ zoneIds: [] });
  });

  it('detects triggered effect trace entries', () => {
    const triggered: EffectTraceEntry = {
      kind: 'forEach',
      bind: '$x',
      matchCount: 2,
      iteratedCount: 1,
      provenance: provenance('triggerEffect'),
    };
    const nonTriggered: EffectTraceEntry = {
      kind: 'reduce',
      itemBind: '$item',
      accBind: '$acc',
      resultBind: '$result',
      matchCount: 2,
      iteratedCount: 2,
      provenance: provenance('actionEffect'),
    };

    expect(isTriggeredEffectTraceEntry(triggered)).toBe(true);
    expect(isTriggeredEffectTraceEntry(nonTriggered)).toBe(false);
  });
});

function provenance(eventContext: EffectTraceEntry['provenance']['eventContext']) {
  return {
    phase: 'main',
    eventContext,
    effectPath: 'effects[0]',
  } as const;
}
