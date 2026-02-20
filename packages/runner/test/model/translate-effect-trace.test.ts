import { describe, expect, it } from 'vitest';
import {
  asPlayerId,
  asTriggerId,
  type EffectTraceEntry,
  type GameDef,
  type TriggerLogEntry,
} from '@ludoforge/engine/runtime';

import { VisualConfigProvider } from '../../src/config/visual-config-provider.js';
import { translateEffectTrace } from '../../src/model/translate-effect-trace.js';

describe('translateEffectTrace', () => {
  it('translates effect and trigger entries with deterministic ordering and ids', () => {
    const visualConfig = new VisualConfigProvider({
      version: 1,
      zones: {
        overrides: {
          saigon: { label: 'Saigon' },
          hue: { label: 'Hue' },
        },
      },
      factions: {
        us: { displayName: 'United States' },
      },
      tokenTypes: {
        'ace-of-spades': { displayName: 'Ace of Spades Card' },
        'nva-troop': { displayName: 'NVA Troop' },
      },
    });

    const effectTrace: readonly EffectTraceEntry[] = [
      {
        kind: 'moveToken',
        tokenId: 'vc-guerrilla-1',
        from: 'saigon',
        to: 'hue',
        provenance: provenance(),
      },
      {
        kind: 'varChange',
        scope: 'perPlayer',
        varName: 'resources',
        oldValue: 9,
        newValue: 7,
        player: asPlayerId(0),
        provenance: provenance(),
      },
      {
        kind: 'createToken',
        tokenId: 'ace-spades-0',
        type: 'ace-of-spades',
        zone: 'hand:0',
        provenance: provenance(),
      },
      {
        kind: 'destroyToken',
        tokenId: 'nva-troop-2',
        type: 'nva-troop',
        zone: 'hue',
        provenance: provenance(),
      },
      {
        kind: 'resourceTransfer',
        from: { scope: 'perPlayer', varName: 'resources', player: asPlayerId(0) },
        to: { scope: 'global', varName: 'pool' },
        requestedAmount: 3,
        actualAmount: 2,
        sourceAvailable: 2,
        destinationHeadroom: 5,
        provenance: provenance(),
      },
      {
        kind: 'setTokenProp',
        tokenId: 'vc-guerrilla-1',
        prop: 'activity',
        oldValue: 'underground',
        newValue: 'active',
        provenance: provenance(),
      },
      {
        kind: 'forEach',
        bind: 'target',
        matchCount: 3,
        iteratedCount: 2,
        provenance: provenance(),
      },
      {
        kind: 'reduce',
        itemBind: 'item',
        accBind: 'acc',
        resultBind: 'total',
        matchCount: 4,
        iteratedCount: 4,
        provenance: provenance(),
      },
      {
        kind: 'lifecycleEvent',
        eventType: 'phaseEnter',
        phase: 'main',
        provenance: provenance(),
      },
    ];

    const triggerLog: readonly TriggerLogEntry[] = [
      {
        kind: 'fired',
        triggerId: asTriggerId('on-turn-start'),
        event: { type: 'tokenEntered', zone: 'hue' as never },
        depth: 2,
      },
      {
        kind: 'truncated',
        event: { type: 'turnEnd' },
        depth: 1,
      },
      {
        kind: 'turnFlowLifecycle',
        step: 'revealLookahead',
        slots: { played: 'played', lookahead: 'lookahead', leader: 'leader' },
        before: { playedCardId: null, lookaheadCardId: null, leaderCardId: null },
        after: { playedCardId: null, lookaheadCardId: null, leaderCardId: null },
      },
      {
        kind: 'turnFlowEligibility',
        step: 'passChain',
        faction: 'us',
        before: {
          firstEligible: null,
          secondEligible: null,
          actedFactions: [],
          passedFactions: [],
          nonPassCount: 0,
          firstActionClass: null,
        },
        after: {
          firstEligible: null,
          secondEligible: null,
          actedFactions: [],
          passedFactions: [],
          nonPassCount: 0,
          firstActionClass: null,
        },
      },
      {
        kind: 'simultaneousSubmission',
        player: 'us',
        move: { actionId: 'pass', params: {} },
        submittedBefore: { us: false },
        submittedAfter: { us: true },
      },
      {
        kind: 'simultaneousCommit',
        playersInOrder: ['us'],
        pendingCount: 0,
      },
      {
        kind: 'operationPartial',
        actionId: 'patrol' as never,
        profileId: 'op-profile',
        step: 'costSpendSkipped',
        reason: 'costValidationFailed',
      },
      {
        kind: 'operationFree',
        actionId: 'sweep' as never,
        step: 'costSpendSkipped',
      },
    ];

    const entries = translateEffectTrace(effectTrace, triggerLog, visualConfig, gameDefFixture(), 7);

    expect(entries).toHaveLength(effectTrace.length + triggerLog.length);
    expect(entries.map((entry) => entry.id)).toEqual([
      'move-7-effect-0',
      'move-7-effect-1',
      'move-7-effect-2',
      'move-7-effect-3',
      'move-7-effect-4',
      'move-7-effect-5',
      'move-7-effect-6',
      'move-7-effect-7',
      'move-7-effect-8',
      'move-7-trigger-0',
      'move-7-trigger-1',
      'move-7-trigger-2',
      'move-7-trigger-3',
      'move-7-trigger-4',
      'move-7-trigger-5',
      'move-7-trigger-6',
      'move-7-trigger-7',
    ]);

    const movement = entries[0];
    expect(movement).toMatchObject({
      kind: 'movement',
      zoneIds: ['saigon', 'hue'],
      tokenIds: ['vc-guerrilla-1'],
      depth: 0,
      moveIndex: 7,
    });
    expect(movement?.message).toContain('Saigon');
    expect(movement?.message).toContain('Hue');

    const perPlayerVar = entries[1];
    expect(perPlayerVar).toMatchObject({
      kind: 'variable',
      playerId: 0,
      zoneIds: [],
      tokenIds: [],
    });
    expect(perPlayerVar?.message).toContain('United States');

    const create = entries[2];
    expect(create).toMatchObject({
      kind: 'token',
      zoneIds: ['hand:0'],
      tokenIds: ['ace-spades-0'],
    });
    expect(create?.message).toContain('Ace of Spades Card');

    const destroy = entries[3];
    expect(destroy).toMatchObject({
      kind: 'token',
      zoneIds: ['hue'],
      tokenIds: ['nva-troop-2'],
    });
    expect(destroy?.message).toContain('NVA Troop');

    const fired = entries[9];
    expect(fired).toMatchObject({
      kind: 'trigger',
      depth: 2,
      zoneIds: ['hue'],
      tokenIds: [],
    });

    const truncated = entries[10];
    expect(truncated).toMatchObject({ kind: 'trigger', depth: 1 });

    const eligibility = entries[12];
    expect(eligibility).toMatchObject({ kind: 'phase', depth: 0, playerId: 0 });

    const simultaneous = entries[13];
    expect(simultaneous).toMatchObject({ kind: 'lifecycle', depth: 0, playerId: 0 });

    const uniqueIds = new Set(entries.map((entry) => entry.id));
    expect(uniqueIds.size).toBe(entries.length);
    expect(entries.every((entry) => entry.moveIndex === 7)).toBe(true);
  });

  it('summarizes hygienic macro binding names in forEach and reduce messages', () => {
    const visualConfig = new VisualConfigProvider(null);
    const effectTrace: readonly EffectTraceEntry[] = [
      {
        kind: 'forEach',
        bind: '$__macro_collect_forced_bets_turnStructure_phases_0__onEnter_15__player',
        matchCount: 4,
        iteratedCount: 4,
        provenance: provenance(),
      },
      {
        kind: 'reduce',
        itemBind: 'item',
        accBind: 'acc',
        resultBind: '$__macro_hand_rank_score_turnStructure_phases_5__onEnter_1__straightHigh',
        matchCount: 21,
        iteratedCount: 21,
        provenance: provenance(),
      },
      {
        kind: 'forEach',
        bind: '$player',
        matchCount: 3,
        iteratedCount: 3,
        provenance: provenance(),
      },
      {
        kind: 'reduce',
        itemBind: 'combo',
        accBind: 'best',
        resultBind: 'bestScore',
        matchCount: 5,
        iteratedCount: 5,
        provenance: provenance(),
      },
    ];

    const entries = translateEffectTrace(effectTrace, [], visualConfig, gameDefNoFactionsFixture(), 0);

    expect(entries[0]?.message).toBe('For-each Player in Collect Forced Bets iterated 4/4.');
    expect(entries[1]?.message).toBe('Reduce Straight High in Hand Rank Score iterated 21/21.');
    expect(entries[2]?.message).toBe('For-each Player iterated 3/3.');
    expect(entries[3]?.message).toBe('Reduce Best Score iterated 5/5.');
  });

  it('falls back to formatted ids and player labels when visual names are missing', () => {
    const visualConfig = new VisualConfigProvider(null);
    const effectTrace: readonly EffectTraceEntry[] = [
      {
        kind: 'varChange',
        scope: 'perPlayer',
        varName: 'pot_size',
        oldValue: 10,
        newValue: 20,
        player: asPlayerId(3),
        provenance: provenance(),
      },
      {
        kind: 'moveToken',
        tokenId: 'nva-guerrilla-1',
        from: 'loc:central-highlands',
        to: 'loc:saigon',
        provenance: provenance(),
      },
      {
        kind: 'createToken',
        tokenId: 'nva-guerrilla-2',
        type: 'nva-guerrillas',
        zone: 'loc:saigon',
        provenance: provenance(),
      },
    ];

    const entries = translateEffectTrace(effectTrace, [], visualConfig, gameDefNoFactionsFixture(), 2);

    expect(entries[0]?.message).toContain('Player 3');
    expect(entries[0]?.message).toContain('Pot Size');
    expect(entries[1]?.message).toContain('Loc Central Highlands');
    expect(entries[1]?.message).toContain('Loc Saigon');
    expect(entries[2]?.message).toContain('Nva Guerrillas');
  });
});

function provenance() {
  return {
    phase: 'main',
    eventContext: 'actionEffect' as const,
    actionId: 'act',
    effectPath: 'effects[0]',
  };
}

function gameDefFixture(): GameDef {
  return {
    metadata: { id: 'fixture', players: { min: 2, max: 4 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [],
    factions: [{ id: 'us' }, { id: 'arvn' }],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: 'main' as never }] },
    turnOrder: {
      type: 'fixedOrder',
      order: ['us', 'arvn'],
    },
    actions: [],
    triggers: [],
    terminal: { conditions: [] },
  } as GameDef;
}

function gameDefNoFactionsFixture(): GameDef {
  return {
    metadata: { id: 'fixture-no-factions', players: { min: 2, max: 4 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: 'main' as never }] },
    actions: [],
    triggers: [],
    terminal: { conditions: [] },
  } as GameDef;
}
