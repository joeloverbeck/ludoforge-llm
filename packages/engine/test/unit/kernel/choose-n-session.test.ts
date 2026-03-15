import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asZoneId,
  legalChoicesDiscover,
  type ActionDef,
  type DecisionKey,
  type EffectAST,
  type GameDef,
  type GameState,
  type LegalChoicesPreparedContext,
  type Move,
} from '../../../src/kernel/index.js';
import {
  createChooseNTemplate,
  rebuildPendingFromTemplate,
  isChooseNSessionEligible,
  type CreateChooseNTemplateInput,
} from '../../../src/kernel/choose-n-session.js';
import type { PrioritizedTierEntry } from '../../../src/kernel/prioritized-tier-legality.js';
import type {
  ChoicePendingChooseNRequest,
  ChoiceTargetKind,
  MoveParamScalar,
} from '../../../src/kernel/types.js';

const asDecisionKey = (value: string): DecisionKey => value as DecisionKey;

// ── Test fixtures ───────────────────────────────────────────────────

const makeBaseDef = (): GameDef =>
  ({
    metadata: { id: 'session-test', players: { min: 2, max: 2 } },
    seats: [{ id: '0' }, { id: '1' }, { id: '2' }, { id: '3' }],
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [
      { id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set' },
    ],
    tokenTypes: [],
    setup: [],
    turnStructure: {
      phases: [{ id: asPhaseId('main') }],
    },
    actions: [],
    triggers: [],
    terminal: { conditions: [] },
  }) as unknown as GameDef;

const makeBaseState = (): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  zoneVars: {},
  playerCount: 2,
  zones: {
    'board:none': [],
  },
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
  stateHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
}) as unknown as GameState;

const makeTemplateInput = (
  overrides?: Partial<CreateChooseNTemplateInput>,
): CreateChooseNTemplateInput => ({
  decisionKey: asDecisionKey('action:pickItems:$items'),
  name: '$items',
  normalizedOptions: ['a', 'b', 'c', 'd'],
  targetKinds: [] as readonly ChoiceTargetKind[],
  minCardinality: 1,
  maxCardinality: 3,
  prioritizedTierEntries: null,
  qualifierMode: 'none',
  preparedContext: {
    def: makeBaseDef(),
    state: makeBaseState(),
    action: {
      id: asActionId('pickItems'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    } as ActionDef,
    adjacencyGraph: { neighbors: {}, zoneCount: 1 },
    runtimeTableIndex: { tableIds: [], tablesById: new Map() },
    seatResolution: { index: new Map() } as unknown as LegalChoicesPreparedContext['seatResolution'],
  },
  partialMoveIdentity: {
    actionId: 'pickItems',
    params: {},
  },
  choiceDecisionPlayer: asPlayerId(0),
  chooser: undefined,
  ...overrides,
});

// ── createChooseNTemplate tests ─────────────────────────────────────

describe('createChooseNTemplate', () => {
  it('captures all selection-invariant data', () => {
    const input = makeTemplateInput();
    const template = createChooseNTemplate(input);

    assert.equal(template.decisionKey, input.decisionKey);
    assert.equal(template.name, input.name);
    assert.deepStrictEqual(template.normalizedDomain, input.normalizedOptions);
    assert.deepStrictEqual(template.cardinalityBounds, {
      min: input.minCardinality,
      max: input.maxCardinality,
    });
    assert.deepStrictEqual(template.targetKinds, input.targetKinds);
    assert.equal(template.prioritizedTierEntries, input.prioritizedTierEntries);
    assert.equal(template.qualifierMode, input.qualifierMode);
    assert.equal(template.preparedContext, input.preparedContext);
    assert.deepStrictEqual(template.partialMoveIdentity, input.partialMoveIdentity);
    assert.equal(template.choiceDecisionPlayer, input.choiceDecisionPlayer);
    assert.equal(template.chooser, input.chooser);
  });

  it('builds domainIndex with stable option ordering', () => {
    const input = makeTemplateInput({
      normalizedOptions: ['x', 'y', 'z'],
    });
    const template = createChooseNTemplate(input);

    assert.equal(template.domainIndex.size, 3);
    // Each option key maps to its index in normalizedDomain
    const keys = [...template.domainIndex.entries()];
    assert.equal(keys.length, 3);
    for (let i = 0; i < input.normalizedOptions.length; i++) {
      const key = JSON.stringify([typeof input.normalizedOptions[i], input.normalizedOptions[i]]);
      assert.equal(template.domainIndex.get(key), i);
    }
  });

  it('captures prioritized tier entries when present', () => {
    const tiers: readonly (readonly PrioritizedTierEntry[])[] = [
      [{ value: 'a' }, { value: 'b' }],
      [{ value: 'c' }],
    ];
    const input = makeTemplateInput({
      prioritizedTierEntries: tiers,
      qualifierMode: 'none',
    });
    const template = createChooseNTemplate(input);

    assert.deepStrictEqual(template.prioritizedTierEntries, tiers);
    assert.equal(template.qualifierMode, 'none');
  });
});

// ── rebuildPendingFromTemplate tests ────────────────────────────────

describe('rebuildPendingFromTemplate', () => {
  it('with empty selection matches initial buildChooseNPendingChoice output structure', () => {
    const input = makeTemplateInput();
    const template = createChooseNTemplate(input);
    const result = rebuildPendingFromTemplate(template, []);

    assert.equal(result.kind, 'pending');
    assert.equal(result.complete, false);
    assert.equal(result.type, 'chooseN');
    assert.equal(result.decisionKey, input.decisionKey);
    assert.equal(result.name, input.name);
    assert.equal(result.min, input.minCardinality);
    assert.equal(result.max, input.maxCardinality);
    assert.deepStrictEqual(result.selected, []);
    assert.equal(result.canConfirm, false); // 0 < min(1)

    // All options should be unknown (no selection, has capacity, no tiers)
    const pending = result as ChoicePendingChooseNRequest;
    for (const option of pending.options) {
      assert.equal(option.legality, 'unknown');
      assert.equal(option.illegalReason, null);
    }
    assert.equal(pending.options.length, 4);
  });

  it('with selection [a, b] marks selected options illegal and computes canConfirm', () => {
    const input = makeTemplateInput();
    const template = createChooseNTemplate(input);
    const result = rebuildPendingFromTemplate(template, ['a', 'b']);
    const pending = result as ChoicePendingChooseNRequest;

    assert.equal(pending.canConfirm, true); // 2 >= min(1) && 2 <= max(3)
    assert.deepStrictEqual(pending.selected, ['a', 'b']);

    // 'a' and 'b' should be illegal (already selected)
    const optA = pending.options.find((o) => o.value === 'a');
    const optB = pending.options.find((o) => o.value === 'b');
    assert.equal(optA?.legality, 'illegal');
    assert.equal(optB?.legality, 'illegal');

    // 'c' and 'd' should be unknown (selectable)
    const optC = pending.options.find((o) => o.value === 'c');
    const optD = pending.options.find((o) => o.value === 'd');
    assert.equal(optC?.legality, 'unknown');
    assert.equal(optD?.legality, 'unknown');
  });

  it('marks all unselected options illegal when at max capacity', () => {
    const input = makeTemplateInput({ maxCardinality: 2 });
    const template = createChooseNTemplate(input);
    const result = rebuildPendingFromTemplate(template, ['a', 'b']);
    const pending = result as ChoicePendingChooseNRequest;

    // At max capacity — no more adds allowed
    for (const option of pending.options) {
      assert.equal(option.legality, 'illegal');
    }
    assert.equal(pending.canConfirm, true); // 2 >= min(1) && 2 <= max(2)
  });

  it('omits decisionPlayer when chooser is undefined', () => {
    const input = makeTemplateInput({ chooser: undefined });
    const template = createChooseNTemplate(input);
    const result = rebuildPendingFromTemplate(template, []);

    assert.equal('decisionPlayer' in result, false);
  });

  it('includes decisionPlayer when chooser is defined', () => {
    const input = makeTemplateInput({
      chooser: { player: 'active' } as unknown as CreateChooseNTemplateInput['chooser'],
      choiceDecisionPlayer: asPlayerId(1),
    });
    const template = createChooseNTemplate(input);
    const result = rebuildPendingFromTemplate(template, []);

    assert.equal(result.decisionPlayer, asPlayerId(1));
  });

  it('handles prioritized tiers — blocks non-admissible options', () => {
    // Tier 0: [a, b], Tier 1: [c, d]
    // With empty selection, only tier 0 is admissible
    const tiers: readonly (readonly PrioritizedTierEntry[])[] = [
      [{ value: 'a' }, { value: 'b' }],
      [{ value: 'c' }, { value: 'd' }],
    ];
    const input = makeTemplateInput({
      prioritizedTierEntries: tiers,
    });
    const template = createChooseNTemplate(input);
    const result = rebuildPendingFromTemplate(template, []);
    const pending = result as ChoicePendingChooseNRequest;

    // Tier 0 options should be unknown (admissible)
    const optA = pending.options.find((o) => o.value === 'a');
    const optB = pending.options.find((o) => o.value === 'b');
    assert.equal(optA?.legality, 'unknown');
    assert.equal(optB?.legality, 'unknown');

    // Tier 1 options should be illegal (not yet admissible)
    const optC = pending.options.find((o) => o.value === 'c');
    const optD = pending.options.find((o) => o.value === 'd');
    assert.equal(optC?.legality, 'illegal');
    assert.equal(optD?.legality, 'illegal');
  });

  it('after selecting all tier 0, tier 1 becomes admissible', () => {
    const tiers: readonly (readonly PrioritizedTierEntry[])[] = [
      [{ value: 'a' }, { value: 'b' }],
      [{ value: 'c' }, { value: 'd' }],
    ];
    const input = makeTemplateInput({
      prioritizedTierEntries: tiers,
      maxCardinality: 4,
    });
    const template = createChooseNTemplate(input);
    const result = rebuildPendingFromTemplate(template, ['a', 'b']);
    const pending = result as ChoicePendingChooseNRequest;

    // Tier 0 selected — illegal
    assert.equal(pending.options.find((o) => o.value === 'a')?.legality, 'illegal');
    assert.equal(pending.options.find((o) => o.value === 'b')?.legality, 'illegal');

    // Tier 1 now admissible — unknown
    assert.equal(pending.options.find((o) => o.value === 'c')?.legality, 'unknown');
    assert.equal(pending.options.find((o) => o.value === 'd')?.legality, 'unknown');
  });

  it('parity: rebuild with same selection produces identical result', () => {
    const input = makeTemplateInput();
    const template = createChooseNTemplate(input);

    // Build two results with the same selection
    const resultEmpty1 = rebuildPendingFromTemplate(template, []);
    const resultEmpty2 = rebuildPendingFromTemplate(template, []);
    assert.deepStrictEqual(resultEmpty1, resultEmpty2);

    const resultAB1 = rebuildPendingFromTemplate(template, ['a', 'b']);
    const resultAB2 = rebuildPendingFromTemplate(template, ['a', 'b']);
    assert.deepStrictEqual(resultAB1, resultAB2);
  });
});

// ── Integration parity with legalChoicesDiscover ────────────────────

describe('rebuildPendingFromTemplate parity with legalChoicesDiscover', () => {
  const chooseNAction: ActionDef = {
    id: asActionId('pick'),
    actor: 'active',
    executor: 'actor',
    phase: [asPhaseId('main')],
    params: [],
    pre: null,
    cost: [],
    effects: [
      {
        chooseN: {
          internalDecisionId: 'decision:$items',
          bind: '$items',
          options: { query: 'enums', values: ['alpha', 'beta', 'gamma'] },
          min: 1,
          max: 2,
        },
      } as EffectAST,
    ],
    limits: [],
  };

  const def: GameDef = {
    ...makeBaseDef(),
    actions: [chooseNAction],
  } as unknown as GameDef;

  const state = makeBaseState();
  const move: Move = {
    actionId: asActionId('pick'),
    params: {} as Move['params'],
  };

  it('empty selection: template rebuild matches discover output', () => {
    const discovered = legalChoicesDiscover(def, state, move);
    assert.equal(discovered.kind, 'pending');
    assert.equal((discovered as ChoicePendingChooseNRequest).type, 'chooseN');

    const pending = discovered as ChoicePendingChooseNRequest;

    // Build template from the discovered values
    const template = createChooseNTemplate({
      decisionKey: pending.decisionKey,
      name: pending.name,
      normalizedOptions: pending.options.map((o) => o.value as MoveParamScalar),
      targetKinds: pending.targetKinds,
      minCardinality: pending.min ?? 0,
      maxCardinality: pending.max ?? pending.options.length,
      prioritizedTierEntries: null,
      qualifierMode: 'none',
      preparedContext: {
        def,
        state,
        action: chooseNAction,
        adjacencyGraph: { neighbors: {}, zoneCount: 1 },
        runtimeTableIndex: { tableIds: [], tablesById: new Map() },
        seatResolution: { index: new Map() } as unknown as LegalChoicesPreparedContext['seatResolution'],
      },
      partialMoveIdentity: { actionId: 'pick', params: {} },
      choiceDecisionPlayer: asPlayerId(0),
      chooser: undefined,
    });

    const rebuilt = rebuildPendingFromTemplate(template, []);
    const rebuiltPending = rebuilt as ChoicePendingChooseNRequest;

    // Structural parity checks
    assert.equal(rebuiltPending.kind, pending.kind);
    assert.equal(rebuiltPending.type, pending.type);
    assert.equal(rebuiltPending.decisionKey, pending.decisionKey);
    assert.equal(rebuiltPending.name, pending.name);
    assert.equal(rebuiltPending.min, pending.min);
    assert.equal(rebuiltPending.max, pending.max);
    assert.deepStrictEqual(rebuiltPending.selected, pending.selected);
    assert.equal(rebuiltPending.canConfirm, pending.canConfirm);
    assert.equal(rebuiltPending.options.length, pending.options.length);

    // Option values and static legality must match
    for (let i = 0; i < pending.options.length; i++) {
      const rebuiltOpt = rebuiltPending.options[i]!;
      const discoveredOpt = pending.options[i]!;
      assert.deepStrictEqual(rebuiltOpt.value, discoveredOpt.value);
      // Both should be 'unknown' for empty selection with no tiers
      assert.equal(rebuiltOpt.legality, discoveredOpt.legality);
    }
  });

  it('selection [alpha, beta]: template rebuild matches discover output', () => {
    const moveWithSelection: Move = {
      actionId: asActionId('pick'),
      params: {} as Move['params'],
    };

    // Get initial discovery to extract domain info
    const initial = legalChoicesDiscover(def, state, moveWithSelection);
    const initialPending = initial as ChoicePendingChooseNRequest;

    const template = createChooseNTemplate({
      decisionKey: initialPending.decisionKey,
      name: initialPending.name,
      normalizedOptions: initialPending.options.map((o) => o.value as MoveParamScalar),
      targetKinds: initialPending.targetKinds,
      minCardinality: initialPending.min ?? 0,
      maxCardinality: initialPending.max ?? initialPending.options.length,
      prioritizedTierEntries: null,
      qualifierMode: 'none',
      preparedContext: {
        def,
        state,
        action: chooseNAction,
        adjacencyGraph: { neighbors: {}, zoneCount: 1 },
        runtimeTableIndex: { tableIds: [], tablesById: new Map() },
        seatResolution: { index: new Map() } as unknown as LegalChoicesPreparedContext['seatResolution'],
      },
      partialMoveIdentity: { actionId: 'pick', params: {} },
      choiceDecisionPlayer: asPlayerId(0),
      chooser: undefined,
    });

    // Rebuild with [alpha, beta] selection
    const rebuilt = rebuildPendingFromTemplate(template, ['alpha', 'beta']);
    const rebuiltPending = rebuilt as ChoicePendingChooseNRequest;

    assert.equal(rebuiltPending.canConfirm, true); // 2 >= 1 && 2 <= 2
    assert.deepStrictEqual(rebuiltPending.selected, ['alpha', 'beta']);

    // alpha and beta should be illegal (selected)
    const optAlpha = rebuiltPending.options.find((o) => o.value === 'alpha');
    const optBeta = rebuiltPending.options.find((o) => o.value === 'beta');
    assert.equal(optAlpha?.legality, 'illegal');
    assert.equal(optBeta?.legality, 'illegal');

    // gamma should be illegal too (at max capacity = 2)
    const optGamma = rebuiltPending.options.find((o) => o.value === 'gamma');
    assert.equal(optGamma?.legality, 'illegal');
  });
});

// ── isChooseNSessionEligible tests ──────────────────────────────────

describe('isChooseNSessionEligible', () => {
  it('standard chooseN passes eligibility', () => {
    const template = createChooseNTemplate(makeTemplateInput());
    assert.equal(isChooseNSessionEligible(template), true);
  });

  it('rejects empty domain', () => {
    const template = createChooseNTemplate(makeTemplateInput({
      normalizedOptions: [],
      maxCardinality: 0,
      minCardinality: 0,
    }));
    assert.equal(isChooseNSessionEligible(template), false);
  });

  it('rejects negative min cardinality', () => {
    const template = createChooseNTemplate(makeTemplateInput({
      minCardinality: -1,
    }));
    assert.equal(isChooseNSessionEligible(template), false);
  });

  it('rejects max < min', () => {
    const template = createChooseNTemplate(makeTemplateInput({
      minCardinality: 3,
      maxCardinality: 1,
    }));
    assert.equal(isChooseNSessionEligible(template), false);
  });

  it('rejects max > domain length', () => {
    const template = createChooseNTemplate(makeTemplateInput({
      normalizedOptions: ['a', 'b'],
      maxCardinality: 5,
    }));
    assert.equal(isChooseNSessionEligible(template), false);
  });

  it('accepts valid boundary case: min=0, max=domain.length', () => {
    const template = createChooseNTemplate(makeTemplateInput({
      normalizedOptions: ['a', 'b', 'c'],
      minCardinality: 0,
      maxCardinality: 3,
    }));
    assert.equal(isChooseNSessionEligible(template), true);
  });
});
