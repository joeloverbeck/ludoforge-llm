import { describe, expect, it } from 'vitest';
import {
  asPlayerId,
  asTriggerId,
  type EffectTraceEntry,
  type GameDef,
  type TriggerLogEntry,
} from '@ludoforge/engine/runtime';

import { VisualConfigProvider } from '../../src/config/visual-config-provider.js';
import { projectEffectTraceEntry } from '../../src/model/trace-projection.js';
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
        seat: 'us',
        before: {
          firstEligible: null,
          secondEligible: null,
          actedSeats: [],
          passedSeats: [],
          nonPassCount: 0,
          firstActionClass: null,
        },
        after: {
          firstEligible: null,
          secondEligible: null,
          actedSeats: [],
          passedSeats: [],
          nonPassCount: 0,
          firstActionClass: null,
        },
      },
      {
        kind: 'simultaneousSubmission',
        player: 0,
        move: { actionId: 'pass', params: {} },
        submittedBefore: { 0: false },
        submittedAfter: { 0: true },
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
      {
        kind: 'operationCompoundStagesReplaced',
        actionId: 'assault' as never,
        profileId: 'assault-profile',
        insertAfterStage: 1,
        totalStages: 3,
        skippedStageCount: 1,
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
      'move-7-trigger-8',
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

    expect(entries[6]).toMatchObject({ kind: 'iteration' });
    expect(entries[7]).toMatchObject({ kind: 'iteration' });

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
    expect(entries[14]).toMatchObject({ kind: 'lifecycle', depth: 0 });
    expect(entries[15]).toMatchObject({ kind: 'lifecycle', depth: 0 });
    expect(entries[16]).toMatchObject({ kind: 'lifecycle', depth: 0 });
    expect(entries[17]).toMatchObject({ kind: 'lifecycle', depth: 0 });
    expect(entries[17]?.message).toContain('Assault');
    expect(entries[17]?.message).toContain('Assault Profile');
    expect(entries[17]?.message).toContain('1/3');

    const uniqueIds = new Set(entries.map((entry) => entry.id));
    expect(uniqueIds.size).toBe(entries.length);
    expect(entries.every((entry) => entry.moveIndex === 7)).toBe(true);
  });

  it('uses structured macroOrigin metadata for forEach and reduce messages', () => {
    const visualConfig = new VisualConfigProvider(null);
    const effectTrace: readonly EffectTraceEntry[] = [
      {
        kind: 'forEach',
        bind: '$__macro_collect_forced_bets_turnStructure_phases_0__onEnter_15__macro_post_forced_bets_and_set_preflop_actor__0__if_then_0__forEach_effects_0__let_in_0__player',
        macroOrigin: { macroId: 'collect-forced-bets', stem: 'player' },
        matchCount: 4,
        iteratedCount: 4,
        provenance: provenance(),
      },
      {
        kind: 'reduce',
        itemBind: 'item',
        accBind: 'acc',
        resultBind: '$__macro_hand_rank_score_turnStructure_phases_5__onEnter_1__forEach_effects_0__if_then_1__evaluateSubset_compute_0__straightHigh',
        macroOrigin: { macroId: 'hand-rank-score', stem: 'straightHigh' },
        matchCount: 21,
        iteratedCount: 21,
        provenance: provenance(),
      },
      {
        kind: 'forEach',
        bind: '$__macro_some_macro_turnStructure_phases_0__stem',
        matchCount: 1,
        iteratedCount: 1,
        provenance: provenance(),
      },
      {
        kind: 'forEach',
        bind: 'target',
        matchCount: 2,
        iteratedCount: 2,
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
    expect(entries[2]?.message).toBe('For-each Macro Some Macro Turn Structure Phases 0 Stem iterated 1/1.');
    expect(entries[3]?.message).toBe('For-each Target iterated 2/2.');
    expect(entries[4]?.message).toBe('For-each Player iterated 3/3.');
    expect(entries[5]?.message).toBe('Reduce Best Score iterated 5/5.');
  });

  it('translates reveal/conceal entries with observer scope and filter summaries', () => {
    const visualConfig = new VisualConfigProvider({
      version: 1,
      zones: {
        overrides: {
          'hand:0': { label: 'US Hand' },
        },
      },
      factions: {
        us: { displayName: 'United States' },
        arvn: { displayName: 'ARVN' },
      },
    });

    const effectTrace: readonly EffectTraceEntry[] = [
      {
        kind: 'reveal',
        zone: 'hand:0',
        observers: [asPlayerId(0)],
        filter: [{ prop: 'faction', op: 'eq', value: 'us' }],
        provenance: provenance(),
      },
      {
        kind: 'reveal',
        zone: 'hand:0',
        observers: 'all',
        provenance: provenance(),
      },
      {
        kind: 'conceal',
        zone: 'hand:0',
        from: [asPlayerId(0), asPlayerId(1)],
        filter: [{ prop: 'status', op: 'notIn', value: ['revealed', 'peeked'] }],
        grantsRemoved: 2,
        provenance: provenance(),
      },
      {
        kind: 'conceal',
        zone: 'hand:0',
        from: 'all',
        grantsRemoved: 1,
        provenance: provenance(),
      },
    ];

    const entries = translateEffectTrace(effectTrace, [], visualConfig, gameDefFixture(), 3);

    expect(entries[0]?.kind).toBe('lifecycle');
    expect(entries[0]?.message).toBe('Reveal in US Hand to United States (filter: Faction == us).');
    expect(entries[0]?.playerId).toBe(0);
    expect(entries[0]?.zoneIds).toEqual(['hand:0']);

    expect(entries[1]?.message).toBe('Reveal in US Hand to all players.');
    expect(entries[1]?.playerId).toBeUndefined();

    expect(entries[2]?.message).toBe(
      'Conceal in US Hand removed 2 grant(s) from United States, ARVN (filter: Status not in ["revealed","peeked"]).',
    );
    expect(entries[2]?.playerId).toBeUndefined();

    expect(entries[3]?.message).toBe('Conceal in US Hand removed 1 grant(s) from public grants.');
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

  it('formats zone-scoped resource transfer endpoints using zone labels', () => {
    const visualConfig = new VisualConfigProvider({
      version: 1,
      zones: {
        overrides: {
          alpha: { label: 'Alpha Zone' },
          beta: { label: 'Beta Zone' },
        },
      },
    });

    const effectTrace: readonly EffectTraceEntry[] = [
      {
        kind: 'resourceTransfer',
        from: { scope: 'zone', varName: 'supply', zone: 'alpha' },
        to: { scope: 'zone', varName: 'supply', zone: 'beta' },
        requestedAmount: 3,
        actualAmount: 2,
        sourceAvailable: 2,
        destinationHeadroom: 5,
        provenance: provenance(),
      },
    ];

    const entries = translateEffectTrace(effectTrace, [], visualConfig, gameDefNoFactionsFixture(), 1);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.zoneIds).toEqual(['alpha', 'beta']);
    expect(entries[0]?.message).toContain('from Alpha Zone to Beta Zone');
  });

  it('formats zone-scoped var changes with zone labels for effect and trigger logs', () => {
    const visualConfig = new VisualConfigProvider({
      version: 1,
      zones: {
        overrides: {
          alpha: { label: 'Alpha Zone' },
        },
      },
    });

    const effectTrace: readonly EffectTraceEntry[] = [
      {
        kind: 'varChange',
        scope: 'zone',
        varName: 'support',
        oldValue: 0,
        newValue: 1,
        zone: 'alpha',
        provenance: provenance(),
      },
    ];

    const triggerLog: readonly TriggerLogEntry[] = [
      {
        kind: 'fired',
        triggerId: asTriggerId('on-support-changed'),
        event: {
          type: 'varChanged',
          scope: 'zone',
          var: 'support',
          zone: 'alpha' as never,
          oldValue: 0,
          newValue: 1,
        },
        depth: 1,
      },
      {
        kind: 'truncated',
        event: {
          type: 'varChanged',
          scope: 'zone',
          var: 'support',
          zone: 'alpha' as never,
          oldValue: 1,
          newValue: 2,
        },
        depth: 2,
      },
    ];

    const entries = translateEffectTrace(effectTrace, triggerLog, visualConfig, gameDefNoFactionsFixture(), 5);

    expect(entries).toHaveLength(3);
    expect(entries[0]).toMatchObject({
      kind: 'variable',
      zoneIds: ['alpha'],
      tokenIds: [],
      depth: 0,
      moveIndex: 5,
    });
    expect(entries[0]?.message).toBe('Alpha Zone: Support changed from 0 to 1.');

    expect(entries[1]).toMatchObject({
      kind: 'trigger',
      zoneIds: ['alpha'],
      tokenIds: [],
      depth: 1,
      moveIndex: 5,
    });
    expect(entries[1]?.message).toBe('Triggered On Support Changed on Alpha Zone: Support changed from 0 to 1.');

    expect(entries[2]).toMatchObject({
      kind: 'trigger',
      zoneIds: ['alpha'],
      tokenIds: [],
      depth: 2,
      moveIndex: 5,
    });
    expect(entries[2]?.message).toBe('Trigger processing truncated for Alpha Zone: Support changed from 1 to 2.');
  });

  it('formats per-player varChanged trigger text using the shared scope prefix renderer', () => {
    const visualConfig = new VisualConfigProvider({
      version: 1,
      factions: {
        us: { displayName: 'United States' },
      },
    });

    const triggerLog: readonly TriggerLogEntry[] = [
      {
        kind: 'fired',
        triggerId: asTriggerId('on-resources-changed'),
        event: {
          type: 'varChanged',
          scope: 'perPlayer',
          var: 'resources',
          player: asPlayerId(0),
          oldValue: 9,
          newValue: 7,
        },
        depth: 1,
      },
    ];

    const entries = translateEffectTrace([], triggerLog, visualConfig, gameDefFixture(), 9);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.message).toBe(
      'Triggered On Resources Changed on United States: Resources changed from 9 to 7.',
    );
    expect(entries[0]?.playerId).toBe(0);
  });

  it('keeps scope actor rendering consistent across var changes, trigger varChanged, and transfer endpoints', () => {
    const visualConfig = new VisualConfigProvider({
      version: 1,
      zones: {
        overrides: {
          alpha: { label: 'Alpha Zone' },
        },
      },
      factions: {
        us: { displayName: 'United States' },
      },
    });

    const effectTrace: readonly EffectTraceEntry[] = [
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
        kind: 'varChange',
        scope: 'zone',
        varName: 'support',
        oldValue: 1,
        newValue: 2,
        zone: 'alpha',
        provenance: provenance(),
      },
      {
        kind: 'varChange',
        scope: 'zone',
        zone: 'beta',
        varName: 'support',
        oldValue: 2,
        newValue: 3,
        provenance: provenance(),
      },
      {
        kind: 'resourceTransfer',
        from: { scope: 'perPlayer', varName: 'resources', player: asPlayerId(0) },
        to: { scope: 'zone', varName: 'resources', zone: 'alpha' },
        requestedAmount: 1,
        actualAmount: 1,
        sourceAvailable: 1,
        destinationHeadroom: 1,
        provenance: provenance(),
      },
      {
        kind: 'resourceTransfer',
        from: { scope: 'global', varName: 'pool' },
        to: { scope: 'perPlayer', varName: 'resources', player: asPlayerId(1) },
        requestedAmount: 1,
        actualAmount: 1,
        sourceAvailable: 1,
        destinationHeadroom: 1,
        provenance: provenance(),
      },
      {
        kind: 'resourceTransfer',
        from: { scope: 'zone', varName: 'support', zone: 'alpha' },
        to: { scope: 'global', varName: 'pool' },
        requestedAmount: 1,
        actualAmount: 1,
        sourceAvailable: 1,
        destinationHeadroom: 1,
        provenance: provenance(),
      },
    ];

    const triggerLog: readonly TriggerLogEntry[] = [
      {
        kind: 'fired',
        triggerId: asTriggerId('on-resources-changed'),
        event: {
          type: 'varChanged',
          scope: 'perPlayer',
          var: 'resources',
          player: asPlayerId(0),
          oldValue: 9,
          newValue: 7,
        },
        depth: 1,
      },
      {
        kind: 'truncated',
        event: {
          type: 'varChanged',
          scope: 'zone',
          var: 'support',
          zone: 'alpha' as never,
          oldValue: 1,
          newValue: 2,
        },
        depth: 1,
      },
      {
        kind: 'fired',
        triggerId: asTriggerId('on-zone-support-changed'),
        event: {
          type: 'varChanged',
          scope: 'zone',
          var: 'support',
          oldValue: 2,
          newValue: 3,
        },
        depth: 1,
      },
    ];

    const entries = translateEffectTrace(effectTrace, triggerLog, visualConfig, gameDefFixture(), 11);
    expect(entries).toHaveLength(9);

    expect(entries[0]?.message).toBe('United States: Resources changed from 9 to 7.');
    expect(entries[1]?.message).toBe('Alpha Zone: Support changed from 1 to 2.');
    expect(entries[2]?.message).toBe('Beta: Support changed from 2 to 3.');

    expect(entries[3]?.message).toContain('from United States to Alpha Zone');
    expect(entries[4]?.message).toContain('from Global to Arvn');
    expect(entries[5]?.message).toContain('from Alpha Zone to Global');

    expect(entries[6]?.message).toBe(
      'Triggered On Resources Changed on United States: Resources changed from 9 to 7.',
    );
    expect(entries[7]?.message).toBe('Trigger processing truncated for Alpha Zone: Support changed from 1 to 2.');
    expect(entries[8]?.message).toBe(
      'Triggered On Zone Support Changed on Zone: Support changed from 2 to 3.',
    );
  });

  it('throws on invalid resource-transfer endpoint scope instead of coercing to Global', () => {
    const visualConfig = new VisualConfigProvider(null);
    const invalidTraceEntry: EffectTraceEntry = {
      kind: 'resourceTransfer',
      from: { scope: undefined as unknown as 'global', varName: 'pool' },
      to: { scope: 'global', varName: 'pool' },
      requestedAmount: 1,
      actualAmount: 1,
      sourceAvailable: 1,
      destinationHeadroom: 1,
      provenance: provenance(),
    };

    expect(() =>
      translateEffectTrace([invalidTraceEntry], [], visualConfig, gameDefNoFactionsFixture(), 1),
    ).toThrow('Invalid transfer endpoint scope');
  });

  it('throws on missing per-player resource-transfer endpoint identity', () => {
    const visualConfig = new VisualConfigProvider(null);
    const invalidTraceEntry: EffectTraceEntry = {
      kind: 'resourceTransfer',
      from: { scope: 'perPlayer', varName: 'pool', player: undefined as unknown as ReturnType<typeof asPlayerId> },
      to: { scope: 'global', varName: 'pool' },
      requestedAmount: 1,
      actualAmount: 1,
      sourceAvailable: 1,
      destinationHeadroom: 1,
      provenance: provenance(),
    };

    expect(() =>
      translateEffectTrace([invalidTraceEntry], [], visualConfig, gameDefNoFactionsFixture(), 1),
    ).toThrow('Missing endpoint identity for perPlayer scope: playerId');
  });

  it('throws on missing zone resource-transfer endpoint identity', () => {
    const visualConfig = new VisualConfigProvider(null);
    const invalidTraceEntry: EffectTraceEntry = {
      kind: 'resourceTransfer',
      from: { scope: 'zone', varName: 'pool', zone: undefined as unknown as string },
      to: { scope: 'global', varName: 'pool' },
      requestedAmount: 1,
      actualAmount: 1,
      sourceAvailable: 1,
      destinationHeadroom: 1,
      provenance: provenance(),
    };

    expect(() =>
      translateEffectTrace([invalidTraceEntry], [], visualConfig, gameDefNoFactionsFixture(), 1),
    ).toThrow('Missing endpoint identity for zone scope: zoneId');
  });

  it('throws on missing destination per-player resource-transfer endpoint identity', () => {
    const visualConfig = new VisualConfigProvider(null);
    const invalidTraceEntry: EffectTraceEntry = {
      kind: 'resourceTransfer',
      from: { scope: 'global', varName: 'pool' },
      to: { scope: 'perPlayer', varName: 'pool', player: undefined as unknown as ReturnType<typeof asPlayerId> },
      requestedAmount: 1,
      actualAmount: 1,
      sourceAvailable: 1,
      destinationHeadroom: 1,
      provenance: provenance(),
    };

    expect(() =>
      translateEffectTrace([invalidTraceEntry], [], visualConfig, gameDefNoFactionsFixture(), 1),
    ).toThrow('Missing endpoint identity for perPlayer scope: playerId');
  });

  it('throws on missing destination zone resource-transfer endpoint identity', () => {
    const visualConfig = new VisualConfigProvider(null);
    const invalidTraceEntry: EffectTraceEntry = {
      kind: 'resourceTransfer',
      from: { scope: 'global', varName: 'pool' },
      to: { scope: 'zone', varName: 'pool', zone: undefined as unknown as string },
      requestedAmount: 1,
      actualAmount: 1,
      sourceAvailable: 1,
      destinationHeadroom: 1,
      provenance: provenance(),
    };

    expect(() =>
      translateEffectTrace([invalidTraceEntry], [], visualConfig, gameDefNoFactionsFixture(), 1),
    ).toThrow('Missing endpoint identity for zone scope: zoneId');
  });

  it('throws on invalid destination resource-transfer endpoint scope instead of coercing to Global', () => {
    const visualConfig = new VisualConfigProvider(null);
    const invalidTraceEntry: EffectTraceEntry = {
      kind: 'resourceTransfer',
      from: { scope: 'global', varName: 'pool' },
      to: { scope: undefined as unknown as 'global', varName: 'pool' },
      requestedAmount: 1,
      actualAmount: 1,
      sourceAvailable: 1,
      destinationHeadroom: 1,
      provenance: provenance(),
    };

    expect(() =>
      translateEffectTrace([invalidTraceEntry], [], visualConfig, gameDefNoFactionsFixture(), 1),
    ).toThrow('Invalid transfer endpoint scope');
  });

  it('throws deterministic error when resource-transfer from endpoint is missing', () => {
    const visualConfig = new VisualConfigProvider(null);
    const invalidTraceEntry = {
      kind: 'resourceTransfer',
      to: { scope: 'global', varName: 'pool' },
      requestedAmount: 1,
      actualAmount: 1,
      sourceAvailable: 1,
      destinationHeadroom: 1,
      provenance: provenance(),
    } as unknown as EffectTraceEntry;

    expect(() =>
      translateEffectTrace([invalidTraceEntry], [], visualConfig, gameDefNoFactionsFixture(), 1),
    ).toThrow('Invalid transfer endpoint payload: from must be an object');
  });

  it('throws deterministic error when resource-transfer to endpoint is non-object', () => {
    const visualConfig = new VisualConfigProvider(null);
    const invalidTraceEntries: readonly EffectTraceEntry[] = [
      {
        kind: 'resourceTransfer',
        from: { scope: 'global', varName: 'pool' },
        to: null as unknown as { scope: 'global'; varName: string },
        requestedAmount: 1,
        actualAmount: 1,
        sourceAvailable: 1,
        destinationHeadroom: 1,
        provenance: provenance(),
      } as unknown as EffectTraceEntry,
      {
        kind: 'resourceTransfer',
        from: { scope: 'global', varName: 'pool' },
        to: 'global' as unknown as { scope: 'global'; varName: string },
        requestedAmount: 1,
        actualAmount: 1,
        sourceAvailable: 1,
        destinationHeadroom: 1,
        provenance: provenance(),
      } as unknown as EffectTraceEntry,
    ];

    for (const invalidTraceEntry of invalidTraceEntries) {
      expect(() =>
        translateEffectTrace([invalidTraceEntry], [], visualConfig, gameDefNoFactionsFixture(), 1),
      ).toThrow('Invalid transfer endpoint payload: to must be an object');
    }
  });

  it('throws deterministic error when resource-transfer from.varName is missing or non-string', () => {
    const visualConfig = new VisualConfigProvider(null);
    const invalidTraceEntries: readonly EffectTraceEntry[] = [
      {
        kind: 'resourceTransfer',
        from: { scope: 'global' } as unknown as { scope: 'global'; varName: string },
        to: { scope: 'global', varName: 'pool' },
        requestedAmount: 1,
        actualAmount: 1,
        sourceAvailable: 1,
        destinationHeadroom: 1,
        provenance: provenance(),
      },
      {
        kind: 'resourceTransfer',
        from: { scope: 'global', varName: 42 } as unknown as { scope: 'global'; varName: string },
        to: { scope: 'global', varName: 'pool' },
        requestedAmount: 1,
        actualAmount: 1,
        sourceAvailable: 1,
        destinationHeadroom: 1,
        provenance: provenance(),
      },
    ];

    for (const invalidTraceEntry of invalidTraceEntries) {
      expect(() =>
        translateEffectTrace([invalidTraceEntry], [], visualConfig, gameDefNoFactionsFixture(), 1),
      ).toThrow('Invalid transfer endpoint payload: from.varName must be a string');
    }
  });

  it('throws deterministic error when resource-transfer to.varName is missing or non-string', () => {
    const visualConfig = new VisualConfigProvider(null);
    const invalidTraceEntries: readonly EffectTraceEntry[] = [
      {
        kind: 'resourceTransfer',
        from: { scope: 'global', varName: 'pool' },
        to: { scope: 'global' } as unknown as { scope: 'global'; varName: string },
        requestedAmount: 1,
        actualAmount: 1,
        sourceAvailable: 1,
        destinationHeadroom: 1,
        provenance: provenance(),
      },
      {
        kind: 'resourceTransfer',
        from: { scope: 'global', varName: 'pool' },
        to: { scope: 'global', varName: 42 } as unknown as { scope: 'global'; varName: string },
        requestedAmount: 1,
        actualAmount: 1,
        sourceAvailable: 1,
        destinationHeadroom: 1,
        provenance: provenance(),
      },
    ];

    for (const invalidTraceEntry of invalidTraceEntries) {
      expect(() =>
        translateEffectTrace([invalidTraceEntry], [], visualConfig, gameDefNoFactionsFixture(), 1),
      ).toThrow('Invalid transfer endpoint payload: to.varName must be a string');
    }
  });

  it('matches trace projection error semantics for malformed resource-transfer endpoints', () => {
    const visualConfig = new VisualConfigProvider(null);
    const invalidTraceEntry: EffectTraceEntry = {
      kind: 'resourceTransfer',
      from: { scope: 'perPlayer', varName: 'pool', player: undefined as unknown as ReturnType<typeof asPlayerId> },
      to: { scope: 'global', varName: 'pool' },
      requestedAmount: 1,
      actualAmount: 1,
      sourceAvailable: 1,
      destinationHeadroom: 1,
      provenance: provenance(),
    };

    const translateError = catchError(() =>
      translateEffectTrace([invalidTraceEntry], [], visualConfig, gameDefNoFactionsFixture(), 1),
    );
    const projectionError = catchError(() => projectEffectTraceEntry(invalidTraceEntry));

    expect(translateError).toBe('Missing endpoint identity for perPlayer scope: playerId');
    expect(projectionError).toBe(translateError);
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
    seats: [{ id: 'us' }, { id: 'arvn' }],
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

function catchError(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('Expected function to throw');
}
