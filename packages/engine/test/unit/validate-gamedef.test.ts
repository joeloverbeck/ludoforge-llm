import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CARD_SEAT_ORDER_MIN_DISTINCT_SEATS,
  type EffectAST,
  type GameDef,
  type ScenarioPiecePlacement,
  type StackingConstraint,
  type ZoneDef,
  type ZoneId,
  isValidatedGameDef,
  validateGameDef,
  validateGameDefBoundary,
  validateInitialPlacementsAgainstStackingConstraints,
} from '../../src/kernel/index.js';
import {
  appendActionPipelineConditionSurfacePath,
  appendEffectConditionSurfacePath,
  appendQueryConditionSurfacePath,
  CONDITION_SURFACE_SUFFIX,
  conditionSurfacePathForActionPre,
  conditionSurfacePathForTerminalCheckpointWhen,
  conditionSurfacePathForTerminalConditionWhen,
  conditionSurfacePathForTriggerMatch,
  conditionSurfacePathForTriggerWhen,
  EFFECT_BINDER_SURFACE_CONTRACT,
} from '../../src/contracts/index.js';
import { booleanArityMessage } from '../../src/kernel/boolean-arity-policy.js';
import { collectEffectDeclaredBinderPolicyPatternsForTest } from '../../src/kernel/validate-gamedef-behavior.js';
import { asTaggedGameDef, createValidGameDef, readGameDefFixture } from '../helpers/gamedef-fixtures.js';
import { eff } from '../helpers/effect-tag-helper.js';
import { readKernelSource } from '../helpers/kernel-source-guard.js';

const withCardDrivenTurnFlow = (
  base: GameDef,
  cardSeatOrderMapping: Readonly<Record<string, string>>,
  seatOrder: readonly string[],
  eligibilitySeats: readonly string[] = ['0', '1'],
): GameDef =>
  asTaggedGameDef({
    ...base,
    turnOrder: {
      type: 'cardDriven',
      config: {
        turnFlow: {
          cardLifecycle: {
            played: 'market:none',
            lookahead: 'deck:none',
            leader: 'deck:none',
          },
          eligibility: {
            seats: eligibilitySeats,
          },
          windows: [],
          actionClassByActionId: {
            playCard: 'event',
          },
          optionMatrix: [{ first: 'event', second: ['pass'] }],
          passRewards: [],
          durationWindows: ['turn'],
          cardSeatOrderMetadataKey: 'seatOrder',
          cardSeatOrderMapping,
        },
      },
    },
    eventDecks: [
      {
        id: 'deck',
        drawZone: 'deck:none',
        discardZone: 'market:none',
        cards: [{ id: 'card-1', metadata: { seatOrder } }],
      },
    ],
  });

const withPipelineZonePropCondition = (
  prop: string,
  right: unknown,
  surface: 'stage' | 'cost' = 'stage',
): GameDef => {
  const base = createValidGameDef();
  const when = { op: '==', left: { ref: 'zoneProp', zone: 'market:none', prop }, right };
  return asTaggedGameDef({
    ...base,
    zones: [
      {
        id: 'market:none',
        zoneKind: 'board',
        owner: 'none',
        visibility: 'public',
        ordering: 'set',
        category: 'city',
        attributes: { population: 2, country: 'southVietnam' },
        adjacentTo: [],
      },
      { id: 'deck:none', zoneKind: 'aux', owner: 'none', visibility: 'hidden', ordering: 'stack' },
    ],
    actionPipelines: [
      {
        id: 'profile-a',
        actionId: 'playCard',
        legality: null,
        costValidation: null,
        costEffects: surface === 'cost' ? [{ if: { when, then: [] } }] : [],
        targeting: {},
        stages: [{ stage: 'resolve', effects: surface === 'stage' ? [{ if: { when, then: [] } }] : [] }],
        atomicity: 'atomic',
      },
    ],
  });
};

const withPipelineLinkedWindows = (
  linkedWindows: readonly string[] | undefined,
  options?: {
    readonly overrideWindowIds?: readonly string[];
    readonly overrideWindowUsages?: readonly ('eligibilityOverride' | 'actionPipeline')[] | undefined;
    readonly turnOrderType?: 'cardDriven' | 'roundRobin';
  },
): GameDef => {
  const base = createValidGameDef();
  const turnOrderType = options?.turnOrderType ?? 'cardDriven';
  const overrideWindowIds = options?.overrideWindowIds ?? ['special-window'];
  const overrideWindowUsages = options?.overrideWindowUsages ?? ['actionPipeline'];
  return asTaggedGameDef({
    ...base,
    turnOrder: turnOrderType === 'cardDriven'
      ? {
          type: 'cardDriven',
          config: {
            turnFlow: {
              cardLifecycle: { played: 'deck:none', lookahead: 'deck:none', leader: 'deck:none' },
              eligibility: {
                seats: ['0', '1'],
              },
              windows: overrideWindowIds.map((id) => ({ id, duration: 'nextTurn', usages: overrideWindowUsages })),
              actionClassByActionId: { playCard: 'event' },
              optionMatrix: [],
              passRewards: [],
              durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
            },
          },
        }
      : { type: 'roundRobin' },
    actionPipelines: [
      {
        id: 'profile-a',
        actionId: 'playCard',
        legality: null,
        costValidation: null,
        costEffects: [],
        targeting: {},
        stages: [{ stage: 'resolve', effects: [] }],
        atomicity: 'atomic',
        ...(linkedWindows === undefined ? {} : { linkedWindows }),
      },
    ],
  });
};

const withMalformedPipelineOmissions = (
  omittedFields: readonly ('costEffects' | 'stages' | 'targeting')[],
): GameDef => {
  const base = createValidGameDef();
  const pipeline: Record<string, unknown> = {
    id: 'profile-a',
    actionId: 'playCard',
    legality: null,
    costValidation: null,
    costEffects: [],
    targeting: {},
    stages: [{ stage: 'resolve', effects: [] }],
    atomicity: 'atomic',
  };
  for (const field of omittedFields) {
    delete pipeline[field];
  }
  return asTaggedGameDef({
    ...base,
    actionPipelines: [pipeline],
  });
};

const collectDeclaredEffectBinderPatternsFromContract = (): readonly string[] => {
  const patterns: string[] = [];
  for (const [effectKind, surface] of Object.entries(EFFECT_BINDER_SURFACE_CONTRACT)) {
    for (const binderPath of surface.declaredBinderPaths) {
      patterns.push(`${effectKind}.${binderPath.join('.')}`);
    }
  }
  return patterns;
};

describe('validateGameDef reference checks', () => {
  it('validates eligibility seats against canonical declared seats', () => {
    const base = createValidGameDef();
    const def = withCardDrivenTurnFlow(
      asTaggedGameDef({
        ...base,
        seats: [{ id: 'US' }, { id: 'ARVN' }],
      }),
      { US: 'US', ARVN: 'ARVN' },
      ['US', 'ARVN'],
      ['US', 'NVA'],
    );

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'TURN_FLOW_ELIGIBILITY_SEAT_UNRESOLVABLE'
          && diag.path === 'turnOrder.config.turnFlow.eligibility.seats[1]',
      ),
    );
  });

  it('requires unique canonical seats across resolved eligibility seats', () => {
    const base = createValidGameDef();
    const def = withCardDrivenTurnFlow(
      asTaggedGameDef({
        ...base,
        seats: [{ id: 'NVA' }, { id: 'US' }],
      }),
      { north_vietnam: 'NVA', US: 'US' },
      ['north_vietnam', 'US'],
      ['NVA', 'north_vietnam'],
    );

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'TURN_FLOW_ELIGIBILITY_SEAT_DUPLICATE_RESOLVED'
          && diag.path === 'turnOrder.config.turnFlow.eligibility.seats[1]',
      ),
    );
  });

  it('validates cardSeatOrderMapping targets against eligibility seats', () => {
    const base = createValidGameDef();
    const def = withCardDrivenTurnFlow(base, { US: '0', NVA: '2' }, ['US', 'NVA']);

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'TURN_FLOW_CARD_SEAT_ORDER_MAPPING_TARGET_UNKNOWN_SEAT'
          && diag.path === 'turnOrder.config.turnFlow.cardSeatOrderMapping["NVA"]',
      ),
    );
  });

  it('requires unique cardSeatOrderMapping targets', () => {
    const base = createValidGameDef();
    const def = withCardDrivenTurnFlow(base, { US: '0', ARVN: '0' }, ['US', 'ARVN']);

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'TURN_FLOW_CARD_SEAT_ORDER_MAPPING_TARGET_DUPLICATE'
          && diag.path === 'turnOrder.config.turnFlow.cardSeatOrderMapping["ARVN"]',
      ),
    );
  });

  it('rejects cardSeatOrderMapping source key normalization collisions', () => {
    const base = createValidGameDef();
    const def = withCardDrivenTurnFlow(base, { US: '0', 'u-s': '1' }, ['US', 'u-s']);

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'TURN_FLOW_CARD_SEAT_ORDER_MAPPING_SOURCE_COLLISION'
          && diag.path === 'turnOrder.config.turnFlow.cardSeatOrderMapping["u-s"]',
      ),
    );
  });

  it('errors when card metadata seat-order entries resolve to unknown seats', () => {
    const base = createValidGameDef();
    const def = withCardDrivenTurnFlow(base, { US: '0' }, ['US', 'NVA']);

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'TURN_FLOW_CARD_SEAT_ORDER_ENTRY_UNKNOWN_SEAT'
          && diag.path === 'eventDecks[0].cards[0].metadata.seatOrder[1]'
          && diag.severity === 'error',
      ),
    );
  });

  it('errors when card metadata seat-order resolves duplicate seats', () => {
    const base = createValidGameDef();
    const def = withCardDrivenTurnFlow(base, { US: '0', NVA: '1' }, ['US', 'NVA', 'US']);

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'TURN_FLOW_CARD_SEAT_ORDER_ENTRY_DUPLICATE_SEAT'
          && diag.path === 'eventDecks[0].cards[0].metadata.seatOrder[2]'
          && diag.severity === 'error',
      ),
    );
  });

  it('errors when card metadata seat-order distinct raw values collapse to duplicate mapped seats', () => {
    const base = createValidGameDef();
    const def = withCardDrivenTurnFlow(
      base,
      { US: '0', UNITED_STATES: '0', NVA: '1' },
      ['US', 'UNITED_STATES', 'NVA'],
    );

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'TURN_FLOW_CARD_SEAT_ORDER_ENTRY_DUPLICATE_SEAT'
          && diag.path === 'eventDecks[0].cards[0].metadata.seatOrder[1]'
          && diag.severity === 'error',
      ),
    );
  });

  it('errors when card metadata seat-order has fewer than policy distinct seats', () => {
    const base = createValidGameDef();
    const def = withCardDrivenTurnFlow(base, { US: '0' }, ['US']);

    const diagnostics = validateGameDef(def);
    const insufficientSeatOrder = diagnostics.find(
      (diag) =>
        diag.code === 'TURN_FLOW_CARD_SEAT_ORDER_INSUFFICIENT_DISTINCT_SEATS'
        && diag.path === 'eventDecks[0].cards[0].metadata.seatOrder'
        && diag.severity === 'error',
    );
    assert.ok(insufficientSeatOrder);
    assert.match(insufficientSeatOrder.message, new RegExp(`at least ${CARD_SEAT_ORDER_MIN_DISTINCT_SEATS} are required`));
    assert.match(
      String(insufficientSeatOrder.suggestion),
      new RegExp(`at least ${CARD_SEAT_ORDER_MIN_DISTINCT_SEATS} distinct seats`),
    );
  });

  it('emits deterministic duplicate action diagnostics', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [...base.actions, { ...base.actions[0], limits: [] }],
    });

    const first = validateGameDef(def);
    const second = validateGameDef(def);

    assert.deepEqual(first, second);
    const duplicate = first.find((diag) => diag.code === 'DUPLICATE_ACTION_ID');
    assert.ok(duplicate);
    assert.equal(duplicate.severity, 'error');
    assert.equal(duplicate.path, 'actions[1]');
  });

  it('reports missing zone references with alternatives', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          effects: [{ draw: { from: 'deck:none', to: 'markte:none', count: 1 } }],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    const missingZone = diagnostics.find((diag) => diag.code === 'REF_ZONE_MISSING');

    assert.ok(missingZone);
    assert.equal(missingZone.path, 'actions[0].effects[0].draw.to');
    assert.deepEqual(missingZone.alternatives, ['market:none']);
    assert.equal(typeof missingZone.suggestion, 'string');
  });

  it('reports out-of-bounds player selectors for conceal.from', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          effects: [{ conceal: { zone: 'market:none', from: { id: 99 } } }],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) => diag.code === 'PLAYER_SELECTOR_ID_OUT_OF_BOUNDS' && diag.path === 'actions[0].effects[0].conceal.from',
      ),
    );
  });

  it('validates conceal.filter value expressions', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          effects: [
            {
              conceal: {
                zone: 'market:none',
                filter: { prop: 'faction', op: 'eq', value: { ref: 'gvar', var: 'missingVar' } },
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) => diag.code === 'REF_GVAR_MISSING' && diag.path === 'actions[0].effects[0].conceal.filter.value.var',
      ),
    );
  });

  it('rejects unknown token-filter props in tokensInZone domains', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      tokenTypes: [{ id: 'card', props: { faction: 'string' } }],
      actions: [
        {
          ...base.actions[0],
          params: [
            {
              name: '$token',
              domain: {
                query: 'tokensInZone',
                zone: 'deck:none',
                filter: { prop: 'factoin', op: 'eq', value: 'US' },
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    const diagnostic = diagnostics.find(
      (diag) =>
        diag.code === 'REF_TOKEN_FILTER_PROP_MISSING' &&
        diag.path === 'actions[0].params[0].domain.filter.prop',
    );
    assert.ok(diagnostic);
    assert.deepEqual(diagnostic.alternatives, ['faction']);
  });

  it('rejects empty boolean token-filter args across all query/effect filter surfaces', () => {
    const cases: readonly {
      readonly name: string;
      readonly expectedPath: string;
      readonly buildDef: (base: GameDef) => GameDef;
    }[] = [
      {
        name: 'tokensInZone domain filter',
        expectedPath: 'actions[0].params[0].domain.filter.args',
        buildDef: (base) => asTaggedGameDef({
          ...base,
          actions: [
            {
              ...base.actions[0],
              params: [
                {
                  name: '$token',
                  domain: {
                    query: 'tokensInZone',
                    zone: 'deck:none',
                    filter: { op: 'and', args: [] },
                  },
                },
              ],
            },
          ],
        }),
      },
      {
        name: 'tokensInMapSpaces domain filter',
        expectedPath: 'actions[0].params[0].domain.filter.args',
        buildDef: (base) => asTaggedGameDef({
          ...base,
          actions: [
            {
              ...base.actions[0],
              params: [
                {
                  name: '$token',
                  domain: {
                    query: 'tokensInMapSpaces',
                    filter: { op: 'and', args: [] },
                  },
                },
              ],
            },
          ],
        }),
      },
      {
        name: 'tokensInAdjacentZones domain filter',
        expectedPath: 'actions[0].params[0].domain.filter.args',
        buildDef: (base) => asTaggedGameDef({
          ...base,
          actions: [
            {
              ...base.actions[0],
              params: [
                {
                  name: '$token',
                  domain: {
                    query: 'tokensInAdjacentZones',
                    zone: 'market:none',
                    filter: { op: 'and', args: [] },
                  },
                },
              ],
            },
          ],
        }),
      },
      {
        name: 'reveal.filter effect',
        expectedPath: 'actions[0].effects[0].reveal.filter.args',
        buildDef: (base) => asTaggedGameDef({
          ...base,
          actions: [
            {
              ...base.actions[0],
              effects: [
                {
                  reveal: {
                    to: 'all',
                    zone: 'deck:none',
                    filter: { op: 'or', args: [] },
                  },
                },
              ],
            },
          ],
        }),
      },
      {
        name: 'conceal.filter effect',
        expectedPath: 'actions[0].effects[0].conceal.filter.args',
        buildDef: (base) => asTaggedGameDef({
          ...base,
          actions: [
            {
              ...base.actions[0],
              effects: [
                {
                  conceal: {
                    zone: 'deck:none',
                    filter: { op: 'and', args: [] },
                  },
                },
              ],
            },
          ],
        }),
      },
    ];

    for (const testCase of cases) {
      const diagnostics = validateGameDef(testCase.buildDef(createValidGameDef()));
      assert.ok(
        diagnostics.some(
          (diag) => diag.code === 'DOMAIN_QUERY_INVALID' && diag.path === testCase.expectedPath,
        ),
        `Expected DOMAIN_QUERY_INVALID at ${testCase.expectedPath} for ${testCase.name}`,
      );
    }
  });

  it('rejects nested empty boolean token-filter args with full nested path', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          effects: [
            {
              reveal: {
                to: 'all',
                zone: 'deck:none',
                filter: {
                  op: 'not',
                  arg: {
                    op: 'or',
                    args: [
                      { prop: 'id', op: 'eq', value: 'token-1' },
                      { op: 'and', args: [] },
                    ],
                  },
                },
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'DOMAIN_QUERY_INVALID'
          && diag.path === 'actions[0].effects[0].reveal.filter.arg.args[1].args',
      ),
    );
  });

  it('co-reports empty-args and unknown-prop diagnostics for sibling token-filter branches', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      tokenTypes: [{ id: 'card', props: { faction: 'string' } }],
      actions: [
        {
          ...base.actions[0],
          params: [
            {
              name: '$token',
              domain: {
                query: 'tokensInZone',
                zone: 'deck:none',
                filter: {
                  op: 'and',
                  args: [
                    { op: 'or', args: [] },
                    { prop: 'factoin', op: 'eq', value: 'US' },
                  ],
                },
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'DOMAIN_QUERY_INVALID'
          && diag.path === 'actions[0].params[0].domain.filter.args[0].args',
      ),
    );
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'REF_TOKEN_FILTER_PROP_MISSING'
          && diag.path === 'actions[0].params[0].domain.filter.args[1].prop',
      ),
    );
  });

  it('preserves nested deterministic paths when mixed token-filter traversal and prop diagnostics coexist', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      tokenTypes: [{ id: 'card', props: { faction: 'string' } }],
      actions: [
        {
          ...base.actions[0],
          effects: [
            {
              reveal: {
                to: 'all',
                zone: 'deck:none',
                filter: {
                  op: 'not',
                  arg: {
                    op: 'or',
                    args: [
                      {
                        op: 'and',
                        args: [
                          { prop: 'id', op: 'eq', value: 'token-1' },
                          { op: 'and', args: [] },
                        ],
                      },
                      { prop: 'factoin', op: 'eq', value: 'US' },
                    ],
                  },
                },
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'DOMAIN_QUERY_INVALID'
          && diag.path === 'actions[0].effects[0].reveal.filter.arg.args[0].args[1].args',
      ),
    );
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'REF_TOKEN_FILTER_PROP_MISSING'
          && diag.path === 'actions[0].effects[0].reveal.filter.arg.args[1].prop',
      ),
    );
  });

  it('maps token-filter traversal reasons to deterministic validator boundary messages/suggestions', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          params: [
            {
              name: '$token',
              domain: {
                query: 'tokensInZone',
                zone: 'deck:none',
                filter: {
                  op: 'and',
                  args: [
                    { op: 'or', args: [] },
                    { op: 'xor', args: [{ prop: 'id', op: 'eq', value: 'token-1' }] },
                    { op: 'and' },
                  ],
                },
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    const emptyArgsDiagnostic = diagnostics.find(
      (diag) =>
        diag.code === 'DOMAIN_QUERY_INVALID'
        && diag.path === 'actions[0].params[0].domain.filter.args[0].args',
    );
    const unsupportedOperatorDiagnostic = diagnostics.find(
      (diag) =>
        diag.code === 'DOMAIN_QUERY_INVALID'
        && diag.path === 'actions[0].params[0].domain.filter.args[1].op',
    );
    const nonConformingNodeDiagnostic = diagnostics.find(
      (diag) =>
        diag.code === 'DOMAIN_QUERY_INVALID'
        && diag.path === 'actions[0].params[0].domain.filter.args[2].op',
    );
    const traversalDiagnostics = diagnostics.filter(
      (diag) =>
        diag.code === 'DOMAIN_QUERY_INVALID'
        && diag.path.startsWith('actions[0].params[0].domain.filter.args['),
    );

    assert.ok(emptyArgsDiagnostic);
    assert.equal(emptyArgsDiagnostic.suggestion, 'Provide one or more token filter expression arguments.');
    assert.equal(emptyArgsDiagnostic.message, 'Token filter operator "or" requires at least one expression argument.');
    assert.ok(unsupportedOperatorDiagnostic);
    assert.equal(unsupportedOperatorDiagnostic.suggestion, 'Use one of: and, or, not.');
    assert.equal(unsupportedOperatorDiagnostic.message, 'Unsupported token filter operator "xor".');
    assert.ok(nonConformingNodeDiagnostic);
    assert.equal(
      nonConformingNodeDiagnostic.suggestion,
      'Use a predicate leaf or a well-formed and/or/not expression node.',
    );
    assert.equal(nonConformingNodeDiagnostic.message, 'Malformed token filter expression node for operator "and".');
    assert.equal(traversalDiagnostics.length, 3);
  });

  it('keeps condition-surface suffix taxonomy canonicalized by family', () => {
    const querySuffixes = Object.values(CONDITION_SURFACE_SUFFIX.query);
    const effectSuffixes = Object.values(CONDITION_SURFACE_SUFFIX.effect);
    const actionPipelineSuffixes = Object.values(CONDITION_SURFACE_SUFFIX.actionPipeline);

    assert.equal(CONDITION_SURFACE_SUFFIX.valueExpr.ifWhen, 'if.when');
    assert.equal(CONDITION_SURFACE_SUFFIX.effect.ifWhen, 'if.when');
    assert.equal(CONDITION_SURFACE_SUFFIX.valueExpr.ifWhen, CONDITION_SURFACE_SUFFIX.effect.ifWhen);
    assert.equal(new Set(querySuffixes).size, querySuffixes.length);
    assert.equal(new Set(effectSuffixes).size, effectSuffixes.length);
    assert.equal(new Set(actionPipelineSuffixes).size, actionPipelineSuffixes.length);
  });

  it('rejects empty boolean ConditionAST args across condition-bearing validator surfaces', () => {
    const cases: readonly {
      readonly name: string;
      readonly expectedPath: string;
      readonly buildDef: (seed: GameDef) => GameDef;
    }[] = [
      {
        name: 'actions.pre',
        expectedPath: `${conditionSurfacePathForActionPre(0)}.args`,
        buildDef: (seed) => asTaggedGameDef({
          ...seed,
          actions: [{ ...seed.actions[0], pre: { op: 'and', args: [] } }],
        }),
      },
      {
        name: 'triggers.match',
        expectedPath: `${conditionSurfacePathForTriggerMatch(0)}.args`,
        buildDef: (seed) => asTaggedGameDef({
          ...seed,
          triggers: [{ ...seed.triggers[0], match: { op: 'and', args: [] } }],
        }),
      },
      {
        name: 'triggers.when',
        expectedPath: `${conditionSurfacePathForTriggerWhen(0)}.args`,
        buildDef: (seed) => asTaggedGameDef({
          ...seed,
          triggers: [{ ...seed.triggers[0], when: { op: 'or', args: [] } }],
        }),
      },
      {
        name: 'terminal.conditions.when',
        expectedPath: `${conditionSurfacePathForTerminalConditionWhen(0)}.args`,
        buildDef: (seed) => asTaggedGameDef({
          ...seed,
          terminal: {
            ...seed.terminal,
            conditions: [{ ...seed.terminal.conditions[0], when: { op: 'and', args: [] } }],
          },
        }),
      },
      {
        name: 'actions.params.domain.zones.filter.condition',
        expectedPath: `${appendQueryConditionSurfacePath('actions[0].params[0].domain', CONDITION_SURFACE_SUFFIX.query.filterCondition)}.args`,
        buildDef: (seed) => asTaggedGameDef({
          ...seed,
          actions: [
            {
              ...seed.actions[0],
              params: [
                {
                  name: '$zone',
                  domain: { query: 'zones', filter: { condition: { op: 'and', args: [] } } },
                },
              ],
            },
          ],
        }),
      },
      {
        name: 'actions.params.domain.connectedZones.via',
        expectedPath: `${appendQueryConditionSurfacePath('actions[0].params[0].domain', CONDITION_SURFACE_SUFFIX.query.via)}.args`,
        buildDef: (seed) => asTaggedGameDef({
          ...seed,
          actions: [
            {
              ...seed.actions[0],
              params: [
                {
                  name: '$zone',
                  domain: { query: 'connectedZones', zone: 'deck:none', via: { op: 'and', args: [] } },
                },
              ],
            },
          ],
        }),
      },
      {
        name: 'actions.params.domain.nextInOrderByCondition.where',
        expectedPath: `${appendQueryConditionSurfacePath('actions[0].params[0].domain', CONDITION_SURFACE_SUFFIX.query.where)}.args`,
        buildDef: (seed) => asTaggedGameDef({
          ...seed,
          actions: [
            {
              ...seed.actions[0],
              params: [
                {
                  name: '$seat',
                  domain: {
                    query: 'nextInOrderByCondition',
                    source: { query: 'players' },
                    from: 0,
                    bind: '$candidate',
                    where: { op: 'and', args: [] },
                  },
                },
              ],
            },
          ],
        }),
      },
      {
        name: 'actions.effects.moveAll.filter',
        expectedPath: `${appendEffectConditionSurfacePath('actions[0].effects[0]', CONDITION_SURFACE_SUFFIX.effect.moveAllFilter)}.args`,
        buildDef: (seed) => asTaggedGameDef({
          ...seed,
          actions: [
            {
              ...seed.actions[0],
              effects: [{ moveAll: { from: 'deck:none', to: 'market:none', filter: { op: 'or', args: [] } } }],
            },
          ],
        }),
      },
      {
        name: 'actionPipelines.applicability',
        expectedPath: `${appendActionPipelineConditionSurfacePath('actionPipelines[0]', CONDITION_SURFACE_SUFFIX.actionPipeline.applicability)}.args`,
        buildDef: (seed) => asTaggedGameDef({
          ...seed,
          actionPipelines: [
            {
              id: 'profile-a',
              actionId: 'playCard',
              applicability: { op: 'and', args: [] },
              legality: null,
              costValidation: null,
              costEffects: [],
              targeting: {},
              stages: [{ stage: 'resolve', effects: [] }],
              atomicity: 'atomic',
            },
          ],
        }),
      },
      {
        name: 'actionPipelines.legality',
        expectedPath: `${appendActionPipelineConditionSurfacePath('actionPipelines[0]', CONDITION_SURFACE_SUFFIX.actionPipeline.legality)}.args`,
        buildDef: (seed) => asTaggedGameDef({
          ...seed,
          actionPipelines: [
            {
              id: 'profile-a',
              actionId: 'playCard',
              legality: { op: 'and', args: [] },
              costValidation: null,
              costEffects: [],
              targeting: {},
              stages: [{ stage: 'resolve', effects: [] }],
              atomicity: 'atomic',
            },
          ],
        }),
      },
      {
        name: 'actionPipelines.costValidation',
        expectedPath: `${appendActionPipelineConditionSurfacePath('actionPipelines[0]', CONDITION_SURFACE_SUFFIX.actionPipeline.costValidation)}.args`,
        buildDef: (seed) => asTaggedGameDef({
          ...seed,
          actionPipelines: [
            {
              id: 'profile-a',
              actionId: 'playCard',
              legality: null,
              costValidation: { op: 'and', args: [] },
              costEffects: [],
              targeting: {},
              stages: [{ stage: 'resolve', effects: [] }],
              atomicity: 'atomic',
            },
          ],
        }),
      },
      {
        name: 'actionPipelines.targeting.filter',
        expectedPath: `${appendActionPipelineConditionSurfacePath('actionPipelines[0]', CONDITION_SURFACE_SUFFIX.actionPipeline.targetingFilter)}.args`,
        buildDef: (seed) => asTaggedGameDef({
          ...seed,
          actionPipelines: [
            {
              id: 'profile-a',
              actionId: 'playCard',
              legality: null,
              costValidation: null,
              costEffects: [],
              targeting: { filter: { op: 'and', args: [] } },
              stages: [{ stage: 'resolve', effects: [] }],
              atomicity: 'atomic',
            },
          ],
        }),
      },
      {
        name: 'actionPipelines.stages.legality',
        expectedPath: `${appendActionPipelineConditionSurfacePath('actionPipelines[0].stages[0]', CONDITION_SURFACE_SUFFIX.actionPipeline.legality)}.args`,
        buildDef: (seed) => asTaggedGameDef({
          ...seed,
          actionPipelines: [
            {
              id: 'profile-a',
              actionId: 'playCard',
              legality: null,
              costValidation: null,
              costEffects: [],
              targeting: {},
              stages: [{ legality: { op: 'and', args: [] }, effects: [] }],
              atomicity: 'atomic',
            },
          ],
        }),
      },
      {
        name: 'actionPipelines.stages.costValidation',
        expectedPath: `${appendActionPipelineConditionSurfacePath('actionPipelines[0].stages[0]', CONDITION_SURFACE_SUFFIX.actionPipeline.costValidation)}.args`,
        buildDef: (seed) => asTaggedGameDef({
          ...seed,
          actionPipelines: [
            {
              id: 'profile-a',
              actionId: 'playCard',
              legality: null,
              costValidation: null,
              costEffects: [],
              targeting: {},
              stages: [{ costValidation: { op: 'and', args: [] }, effects: [] }],
              atomicity: 'atomic',
            },
          ],
        }),
      },
      {
        name: 'terminal.checkpoints.when',
        expectedPath: `${conditionSurfacePathForTerminalCheckpointWhen(0)}.args`,
        buildDef: (seed) => asTaggedGameDef({
          ...seed,
          terminal: {
            ...seed.terminal,
            checkpoints: [
              { id: 'cp-1', seat: '0', timing: 'duringCoup', when: { op: 'and', args: [] } },
            ],
          },
        }),
      },
    ];

    for (const testCase of cases) {
      const diagnostics = validateGameDef(testCase.buildDef(createValidGameDef()));
      assert.ok(
        diagnostics.some(
          (diag) => diag.code === 'CONDITION_BOOLEAN_ARITY_INVALID' && diag.path === testCase.expectedPath,
        ),
        `Expected CONDITION_BOOLEAN_ARITY_INVALID at ${testCase.expectedPath} for ${testCase.name}`,
      );
    }
  });

  it('rejects nested empty boolean ConditionAST args with full nested path', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          params: [
            {
              name: '$zone',
              domain: {
                query: 'connectedZones',
                zone: 'deck:none',
                via: {
                  op: 'not',
                  arg: {
                    op: 'or',
                    args: [
                      { op: '==', left: { ref: 'binding', name: '$zone' }, right: 'hand:0' },
                      { op: 'and', args: [] },
                    ],
                  },
                },
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'CONDITION_BOOLEAN_ARITY_INVALID'
          && diag.path === `${appendQueryConditionSurfacePath('actions[0].params[0].domain', CONDITION_SURFACE_SUFFIX.query.via)}.arg.args[1].args`,
      ),
    );
  });

  it('reports malformed boolean ConditionAST nodes without throwing', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          params: [
            {
              name: '$zone',
              domain: {
                query: 'connectedZones',
                zone: 'deck:none',
                via: { op: 'and' },
              },
            },
          ],
        },
      ],
    });

    assert.doesNotThrow(() => {
      const diagnostics = validateGameDef(def);
      assert.ok(
        diagnostics.some(
          (diag) =>
            diag.code === 'CONDITION_BOOLEAN_ARITY_INVALID'
            && diag.path === `${appendQueryConditionSurfacePath('actions[0].params[0].domain', CONDITION_SURFACE_SUFFIX.query.via)}.args`,
        ),
      );
    });
  });

  it('uses shared condition boolean-arity message for empty or args', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      terminal: {
        ...base.terminal,
        conditions: [{ when: { op: 'or', args: [] }, result: { type: 'draw' } }],
      },
    });

    const diagnostics = validateGameDef(def);
    const diagnostic = diagnostics.find(
      (diag) =>
        diag.code === 'CONDITION_BOOLEAN_ARITY_INVALID'
        && diag.path === `${conditionSurfacePathForTerminalConditionWhen(0)}.args`,
    );

    assert.ok(diagnostic);
    assert.equal(diagnostic.message, booleanArityMessage('condition', 'or'));
  });

  it('rejects unsupported token-filter operators when malformed objects bypass typing', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          effects: [
            {
              reveal: {
                to: 'all',
                zone: 'deck:none',
                filter: {
                  op: 'xor',
                  args: [{ prop: 'id', op: 'eq', value: 'token-1' }],
                },
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'DOMAIN_QUERY_INVALID'
          && diag.path === 'actions[0].effects[0].reveal.filter.op',
      ),
    );
  });

  it('rejects unsupported token-filter operators in query filter surfaces', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          params: [
            {
              name: '$token',
              domain: {
                query: 'tokensInZone',
                zone: 'deck:none',
                filter: {
                  op: 'xor',
                  args: [{ prop: 'id', op: 'eq', value: 'token-1' }],
                },
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'DOMAIN_QUERY_INVALID'
          && diag.path === 'actions[0].params[0].domain.filter.op',
      ),
    );
  });

  it('rejects unsupported nested token-filter operators with full nested path', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          params: [
            {
              name: '$token',
              domain: {
                query: 'tokensInZone',
                zone: 'deck:none',
                filter: {
                  op: 'not',
                  arg: {
                    op: 'or',
                    args: [
                      { prop: 'id', op: 'eq', value: 'token-1' },
                      {
                        op: 'xor',
                        args: [{ prop: 'id', op: 'eq', value: 'token-2' }],
                      },
                    ],
                  },
                },
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'DOMAIN_QUERY_INVALID'
          && diag.path === 'actions[0].params[0].domain.filter.arg.args[1].op',
      ),
    );
  });

  it('rejects unsupported token-filter predicate operators on effect surfaces', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          effects: [
            {
              reveal: {
                to: 'all',
                zone: 'deck:none',
                filter: { prop: 'id', op: 'xor', value: 'token-1' },
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'DOMAIN_QUERY_INVALID'
          && diag.path === 'actions[0].effects[0].reveal.filter.op',
      ),
    );
  });

  it('rejects unsupported token-filter predicate operators on query surfaces', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          params: [
            {
              name: '$token',
              domain: {
                query: 'tokensInZone',
                zone: 'deck:none',
                filter: { prop: 'id', op: 'xor', value: 'token-1' },
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'DOMAIN_QUERY_INVALID'
          && diag.path === 'actions[0].params[0].domain.filter.op',
      ),
    );
  });

  it('rejects unsupported nested token-filter predicate operators with full nested path', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          params: [
            {
              name: '$token',
              domain: {
                query: 'tokensInZone',
                zone: 'deck:none',
                filter: {
                  op: 'and',
                  args: [
                    { prop: 'id', op: 'eq', value: 'token-1' },
                    { prop: 'id', op: 'xor', value: 'token-2' },
                  ],
                },
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'DOMAIN_QUERY_INVALID'
          && diag.path === 'actions[0].params[0].domain.filter.args[1].op',
      ),
    );
  });

  it('rejects non-conforming boolean token-filter nodes when malformed objects bypass typing', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          params: [
            {
              name: '$token',
              domain: {
                query: 'tokensInZone',
                zone: 'deck:none',
                filter: {
                  op: 'and',
                },
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'DOMAIN_QUERY_INVALID'
          && diag.path === 'actions[0].params[0].domain.filter.op'
          && diag.message === 'Malformed token filter expression node for operator "and".',
      ),
    );
  });

  it('accepts intrinsic token-filter prop id in query and effect surfaces', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          params: [
            {
              name: '$token',
              domain: {
                query: 'tokensInZone',
                zone: 'deck:none',
                filter: { prop: 'id', op: 'eq', value: 'card-1' },
              },
            },
          ],
          effects: [
            {
              reveal: {
                to: 'all',
                zone: 'deck:none',
                filter: { prop: 'id', op: 'eq', value: 'card-1' },
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.equal(diagnostics.some((diag) => diag.code === 'REF_TOKEN_FILTER_PROP_MISSING'), false);
  });

  it('accepts declared token-filter props across mixed token-type schemas', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      tokenTypes: [
        { id: 'card', props: { faction: 'string' } },
        { id: 'leader', props: { rank: 'string' } },
      ],
      actions: [
        {
          ...base.actions[0],
          params: [
            {
              name: '$token',
              domain: {
                query: 'tokensInZone',
                zone: 'deck:none',
                filter: { prop: 'rank', op: 'eq', value: 'elite' },
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.equal(diagnostics.some((diag) => diag.code === 'REF_TOKEN_FILTER_PROP_MISSING'), false);
  });

  it('rejects unknown token-filter props in tokensInMapSpaces domains', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          params: [
            {
              name: '$token',
              domain: {
                query: 'tokensInMapSpaces',
                filter: { prop: 'typeTypo', op: 'eq', value: 'troops' },
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'REF_TOKEN_FILTER_PROP_MISSING' &&
          diag.path === 'actions[0].params[0].domain.filter.prop',
      ),
    );
  });

  it('rejects unknown token-filter props in tokensInAdjacentZones domains', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          params: [
            {
              name: '$token',
              domain: {
                query: 'tokensInAdjacentZones',
                zone: 'market:none',
                filter: { prop: 'typeTypo', op: 'eq', value: 'troops' },
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'REF_TOKEN_FILTER_PROP_MISSING' &&
          diag.path === 'actions[0].params[0].domain.filter.prop',
      ),
    );
  });

  it('accepts intrinsic token-filter prop id in tokensInAdjacentZones domains', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          params: [
            {
              name: '$token',
              domain: {
                query: 'tokensInAdjacentZones',
                zone: 'market:none',
                filter: { prop: 'id', op: 'eq', value: 'token-1' },
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.equal(diagnostics.some((diag) => diag.code === 'REF_TOKEN_FILTER_PROP_MISSING'), false);
  });

  it('rejects unknown token-filter props in reveal.filter effects', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          effects: [
            {
              reveal: {
                to: 'all',
                zone: 'deck:none',
                filter: { prop: 'typeTypo', op: 'eq', value: 'troops' },
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'REF_TOKEN_FILTER_PROP_MISSING' &&
          diag.path === 'actions[0].effects[0].reveal.filter.prop',
      ),
    );
  });

  it('accepts declared token-filter props in reveal.filter effects', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      tokenTypes: [{ id: 'card', props: { faction: 'string' } }],
      actions: [
        {
          ...base.actions[0],
          effects: [
            {
              reveal: {
                to: 'all',
                zone: 'deck:none',
                filter: { prop: 'faction', op: 'eq', value: 'US' },
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.equal(diagnostics.some((diag) => diag.code === 'REF_TOKEN_FILTER_PROP_MISSING'), false);
  });

  it('rejects unknown token-filter props in conceal.filter effects', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          effects: [
            {
              conceal: {
                zone: 'market:none',
                filter: { prop: 'typeTypo', op: 'eq', value: 'troops' },
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'REF_TOKEN_FILTER_PROP_MISSING' &&
          diag.path === 'actions[0].effects[0].conceal.filter.prop',
      ),
    );
  });

  it('accepts intrinsic token-filter prop id in conceal.filter effects', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          effects: [
            {
              conceal: {
                zone: 'market:none',
                filter: { prop: 'id', op: 'eq', value: 'token-1' },
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.equal(diagnostics.some((diag) => diag.code === 'REF_TOKEN_FILTER_PROP_MISSING'), false);
  });

  it('reports unknown map-space properties used by zoneProp references', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      zones: [
        {
          id: 'market:none',
          zoneKind: 'board',
          owner: 'none',
          visibility: 'public',
          ordering: 'set',
          category: 'city',
          attributes: { population: 2, econ: 1, terrainTags: ['urban'], country: 'southVietnam', coastal: false },
          adjacentTo: [],
        },
        { id: 'deck:none', zoneKind: 'aux', owner: 'none', visibility: 'hidden', ordering: 'stack' },
      ],
      actions: [
        {
          ...base.actions[0],
          pre: { op: '==', left: { ref: 'zoneProp', zone: 'market:none', prop: 'controlClass' }, right: 'coin' },
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) => diag.code === 'REF_MAP_SPACE_PROP_MISSING' && diag.path === 'actions[0].pre.left.prop',
      ),
    );
  });

  it('reports map-space property kind mismatches for zoneProp', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      zones: [
        {
          id: 'market:none',
          zoneKind: 'board',
          owner: 'none',
          visibility: 'public',
          ordering: 'set',
          category: 'city',
          attributes: { population: 2, econ: 1, terrainTags: ['urban'], country: 'southVietnam', coastal: false },
          adjacentTo: [],
        },
        { id: 'deck:none', zoneKind: 'aux', owner: 'none', visibility: 'hidden', ordering: 'stack' },
      ],
      actions: [
        {
          ...base.actions[0],
          pre: { op: '==', left: { ref: 'zoneProp', zone: 'market:none', prop: 'terrainTags' }, right: 'urban' },
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) => diag.code === 'REF_MAP_SPACE_PROP_KIND_INVALID' && diag.path === 'actions[0].pre.left.prop',
      ),
    );
  });

  it('reports map-space property kind mismatches for zonePropIncludes', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      zones: [
        {
          id: 'market:none',
          zoneKind: 'board',
          owner: 'none',
          visibility: 'public',
          ordering: 'set',
          category: 'city',
          attributes: { population: 2, econ: 1, terrainTags: ['urban'], country: 'southVietnam', coastal: false },
          adjacentTo: [],
        },
        { id: 'deck:none', zoneKind: 'aux', owner: 'none', visibility: 'hidden', ordering: 'stack' },
      ],
      actions: [
        {
          ...base.actions[0],
          pre: { op: 'zonePropIncludes', zone: 'market:none', prop: 'category', value: 'city' },
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some((diag) => diag.code === 'REF_MAP_SPACE_PROP_KIND_INVALID' && diag.path === 'actions[0].pre.prop'),
    );
  });

  it('validates metadata-declared condition fields across zone, value, numeric, and nested traversal', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      zones: [
        {
          id: 'market:none',
          zoneKind: 'board',
          owner: 'none',
          visibility: 'public',
          ordering: 'set',
          category: 'city',
          attributes: { population: 2, econ: 1, terrainTags: ['urban'], country: 'southVietnam', coastal: false },
          adjacentTo: [],
        },
        { id: 'deck:none', zoneKind: 'aux', owner: 'none', visibility: 'hidden', ordering: 'stack' },
      ],
      actions: [
        {
          ...base.actions[0],
          pre: {
            op: 'and',
            args: [
              { op: 'adjacent', left: 'missing-adjacent:none', right: 'market:none' },
              {
                op: 'zonePropIncludes',
                zone: 'market:none',
                prop: 'terrainTags',
                value: { ref: 'zoneProp', zone: 'missing-value:none', prop: 'country' },
              },
              {
                op: 'markerShiftAllowed',
                space: 'market:none',
                marker: 'supportOpposition',
                delta: { ref: 'zoneCount', zone: 'missing-delta:none' },
              },
              {
                op: 'connected',
                from: 'market:none',
                to: 'deck:none',
                via: { op: 'adjacent', left: 'missing-via:none', right: 'market:none' },
              },
            ],
          },
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    const expected = [
      { code: 'REF_ZONE_MISSING', path: `${conditionSurfacePathForActionPre(0)}.args[0].left` },
      { code: 'REF_MAP_SPACE_MISSING', path: `${conditionSurfacePathForActionPre(0)}.args[1].value.zone` },
      { code: 'REF_ZONE_MISSING', path: `${conditionSurfacePathForActionPre(0)}.args[2].delta.zone` },
      { code: 'REF_ZONE_MISSING', path: `${conditionSurfacePathForActionPre(0)}.args[3].via.left` },
    ] as const;

    for (const entry of expected) {
      assert.ok(
        diagnostics.some((diag) => diag.code === entry.code && diag.path === entry.path),
        `Expected ${entry.code} at ${entry.path}`,
      );
    }
  });

  it('reports missing zone references in derived metric filters', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      derivedMetrics: [
        {
          id: 'support-total',
          computation: 'markerTotal',
          zoneFilter: { zoneIds: ['missing-zone' as ZoneId] },
          requirements: [{ key: 'population', expectedType: 'number' }],
          runtime: {
            kind: 'markerTotal',
            markerId: 'support',
            markerConfig: {
              activeState: 'activeSupport',
              passiveState: 'passiveSupport',
            },
          },
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) => diag.code === 'DERIVED_METRIC_ZONE_REFERENCE_MISSING' && diag.path === 'derivedMetrics[0].zoneFilter.zoneIds[0]',
      ),
    );
  });

  it('reports non-numeric zone attributes required by derived metrics', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      zones: [
        {
          id: 'market:none',
          zoneKind: 'board',
          owner: 'none',
          visibility: 'public',
          ordering: 'set',
          category: 'city',
          attributes: { population: '2', econ: 1, terrainTags: ['urban'], country: 'southVietnam', coastal: false },
          adjacentTo: [],
        },
        { id: 'deck:none', zoneKind: 'aux', owner: 'none', visibility: 'hidden', ordering: 'stack' },
      ],
      derivedMetrics: [
        {
          id: 'support-total',
          computation: 'markerTotal',
          zoneFilter: { zoneKinds: ['board'] as const, category: ['city'] },
          requirements: [{ key: 'population', expectedType: 'number' }],
          runtime: {
            kind: 'markerTotal',
            markerId: 'support',
            markerConfig: {
              activeState: 'activeSupport',
              passiveState: 'passiveSupport',
            },
          },
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) => diag.code === 'DERIVED_METRIC_ZONE_ATTRIBUTE_INVALID' && diag.path === 'zones[0].attributes.population',
      ),
    );
  });

  it('reports explicit zoneProp selectors that are not declared map spaces', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      zones: [
        {
          id: 'market:none',
          zoneKind: 'board',
          owner: 'none',
          visibility: 'public',
          ordering: 'set',
          category: 'city',
          attributes: { population: 2, econ: 1, terrainTags: ['urban'], country: 'southVietnam', coastal: false },
          adjacentTo: [],
        },
        { id: 'deck:none', zoneKind: 'aux', owner: 'none', visibility: 'hidden', ordering: 'stack' },
      ],
      actions: [
        {
          ...base.actions[0],
          pre: { op: '==', left: { ref: 'zoneProp', zone: 'deck:none', prop: 'category' }, right: 'city' },
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) => diag.code === 'REF_MAP_SPACE_MISSING' && diag.path === 'actions[0].pre.left.zone',
      ),
    );
  });

  it('does not treat category on aux zones as map-space identity', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      zones: [
        {
          id: 'board-space:none',
          zoneKind: 'board',
          owner: 'none',
          visibility: 'public',
          ordering: 'set',
          attributes: { population: 1, econ: 0, terrainTags: [], country: 'southVietnam', coastal: false },
          adjacentTo: [],
        },
        {
          id: 'market:none',
          zoneKind: 'aux',
          owner: 'none',
          visibility: 'public',
          ordering: 'set',
          category: 'city',
          attributes: { population: 2, econ: 1, terrainTags: ['urban'], country: 'southVietnam', coastal: false },
          adjacentTo: [],
        },
        { id: 'deck:none', zoneKind: 'aux', owner: 'none', visibility: 'hidden', ordering: 'stack' },
      ],
      actions: [
        {
          ...base.actions[0],
          pre: { op: '==', left: { ref: 'zoneProp', zone: 'market:none', prop: 'category' }, right: 'city' },
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(diagnostics.some((diag) => diag.code === 'REF_MAP_SPACE_MISSING' && diag.path === 'actions[0].pre.left.zone'));
  });

  it('accepts binding-qualified zone selectors for player-owned zone bases', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      zones: [
        ...base.zones,
        { id: 'hand:0', owner: 'player', visibility: 'owner', ordering: 'set' },
        { id: 'hand:1', owner: 'player', visibility: 'owner', ordering: 'set' },
      ],
      actions: [
        {
          ...base.actions[0],
          effects: [
            {
              forEach: {
                bind: '$p',
                over: { query: 'players' },
                effects: [{ draw: { from: 'deck:none', to: 'hand:$p', count: 1 } }],
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some((diag) => diag.path === 'actions[0].effects[0].forEach.effects[0].draw.to'),
      false,
    );
  });

  it('accepts dynamic bound zone selectors in query filters', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      zones: [
        {
          id: 'market:none',
          owner: 'none',
          visibility: 'public',
          ordering: 'set',
          category: 'city',
          attributes: { population: 1, econ: 1, terrainTags: ['urban'], country: 'southVietnam', coastal: false },
          adjacentTo: [],
        },
        { id: 'deck:none', owner: 'none', visibility: 'hidden', ordering: 'stack' },
      ],
      actions: [
        {
          ...base.actions[0],
          effects: [
            {
              forEach: {
                bind: '$zone',
                over: { query: 'zones' },
                effects: [
                  {
                    chooseOne: {
                      internalDecisionId: 'pick',
                      bind: '$target',
                      options: {
                        query: 'zones',
                        filter: {
                          condition: {
                            op: '==',
                            left: { ref: 'zoneProp', zone: '$zone', prop: 'category' },
                            right: 'city',
                          },
                        },
                      },
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some((diag) => diag.code === 'REF_ZONE_MISSING' && diag.path.includes('.left.zone')),
      false,
    );
  });

  it('reports undefined gvar references', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          pre: { op: '==', left: { ref: 'gvar', var: 'gold' }, right: 1 },
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(diagnostics.some((diag) => diag.code === 'REF_GVAR_MISSING' && diag.path === 'actions[0].pre.left.var'));
  });

  it('reports undefined pvar references', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          effects: [{ setVar: { scope: 'pvar', player: 'active', var: 'health', value: 1 } }],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some((diag) => diag.code === 'REF_PVAR_MISSING' && diag.path === 'actions[0].effects[0].setVar.var'),
    );
  });

  it('rejects addVar targeting boolean global vars', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      globalVars: [...base.globalVars, { name: 'flag', type: 'boolean', init: false }],
      actions: [
        {
          ...base.actions[0],
          effects: [{ addVar: { scope: 'global', var: 'flag', delta: 1 } }],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'ADDVAR_BOOLEAN_TARGET_INVALID'
          && diag.path === 'actions[0].effects[0].addVar.var'
          && diag.severity === 'error',
      ),
    );
  });

  it('rejects addVar targeting boolean per-player vars', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      perPlayerVars: [...base.perPlayerVars, { name: 'ready', type: 'boolean', init: false }],
      actions: [
        {
          ...base.actions[0],
          effects: [{ addVar: { scope: 'pvar', player: 'active', var: 'ready', delta: 1 } }],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'ADDVAR_BOOLEAN_TARGET_INVALID'
          && diag.path === 'actions[0].effects[0].addVar.var'
          && diag.severity === 'error',
      ),
    );
  });

  it('reports undefined zoneVar references for setVar and addVar', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          effects: [
            { setVar: { scope: 'zoneVar', zone: 'deck:none', var: 'supply', value: 1 } },
            { addVar: { scope: 'zoneVar', zone: 'deck:none', var: 'supply', delta: 1 } },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some((diag) => diag.code === 'REF_ZONEVAR_MISSING' && diag.path === 'actions[0].effects[0].setVar.var'),
    );
    assert.ok(
      diagnostics.some((diag) => diag.code === 'REF_ZONEVAR_MISSING' && diag.path === 'actions[0].effects[1].addVar.var'),
    );
  });

  it('rejects boolean zoneVars at structural validation time', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      zoneVars: [{ name: 'locked', type: 'boolean', init: false }],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some((diag) => diag.code === 'ZONE_VAR_TYPE_INVALID' && diag.path === 'zoneVars[0].type'),
    );
  });

  it('keeps boolean zoneVar diagnostics at structure layer for addVar', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      zoneVars: [{ name: 'locked', type: 'boolean', init: false }],
      actions: [
        {
          ...base.actions[0],
          effects: [{ addVar: { scope: 'zoneVar', zone: 'deck:none', var: 'locked', delta: 1 } }],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some((diag) => diag.code === 'ZONE_VAR_TYPE_INVALID' && diag.path === 'zoneVars[0].type'),
    );
    assert.equal(
      diagnostics.some(
        (diag) => diag.code === 'ADDVAR_BOOLEAN_TARGET_INVALID' && diag.path === 'actions[0].effects[0].addVar.var',
      ),
      false,
    );
  });

  it('accepts valid zoneVar setVar and addVar targets', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      zoneVars: [{ name: 'supply', type: 'int', init: 0, min: 0, max: 10 }],
      actions: [
        {
          ...base.actions[0],
          effects: [
            { setVar: { scope: 'zoneVar', zone: 'deck:none', var: 'supply', value: 2 } },
            { addVar: { scope: 'zoneVar', zone: 'deck:none', var: 'supply', delta: 1 } },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.equal(diagnostics.some((diag) => diag.code === 'REF_ZONEVAR_MISSING'), false);
    assert.equal(diagnostics.some((diag) => diag.code === 'ADDVAR_BOOLEAN_TARGET_INVALID'), false);
  });

  it('reports missing runtime data assets for assetRows domains', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          params: [
            {
              name: '$row',
              domain: {
                query: 'assetRows',
                tableId: 'tournament-standard::blindSchedule.levels',
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) => diag.code === 'REF_RUNTIME_TABLE_MISSING' && diag.path === 'actions[0].params[0].domain.tableId',
      ),
    );
  });

  it('reports invalid runtime table field references in assetRows where predicates', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      tableContracts: [
        {
          id: 'tournament-standard::blindSchedule.levels',
          assetId: 'tournament-standard',
          tablePath: 'blindSchedule.levels',
          fields: [{ field: 'level', type: 'int' }],
        },
      ],
      actions: [
        {
          ...base.actions[0],
          params: [
            {
              name: '$row',
              domain: {
                query: 'assetRows',
                tableId: 'tournament-standard::blindSchedule.levels',
                where: [{ field: 'smallBlind', op: 'eq', value: 10 }],
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'REF_RUNTIME_TABLE_FIELD_MISSING' &&
          diag.path === 'actions[0].params[0].domain.where[0].field',
      ),
    );
  });

  it('reports invalid runtime table field references in assetField refs', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      tableContracts: [
        {
          id: 'tournament-standard::blindSchedule.levels',
          assetId: 'tournament-standard',
          tablePath: 'blindSchedule.levels',
          fields: [{ field: 'level', type: 'int' as const }],
        },
      ],
      actions: [
        {
          ...base.actions[0],
          effects: [
            {
              setVar: {
                scope: 'global',
                var: 'turn',
                value: {
                  ref: 'assetField',
                  row: '$row',
                  tableId: 'tournament-standard::blindSchedule.levels',
                  field: 'smallBlind',
                },
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) => diag.code === 'REF_RUNTIME_TABLE_FIELD_MISSING' && diag.path === 'actions[0].effects[0].setVar.value.field',
      ),
    );
  });

  it('reports malformed runtime table uniqueBy declarations', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      runtimeDataAssets: [{ id: 'tournament-standard', kind: 'scenario', payload: { blindSchedule: { levels: [] } } }],
      tableContracts: [
        {
          id: 'tournament-standard::blindSchedule.levels',
          assetId: 'tournament-standard',
          tablePath: 'blindSchedule.levels',
          fields: [
            { field: 'level', type: 'int' as const },
            { field: 'smallBlind', type: 'int' as const },
          ],
          uniqueBy: [[], ['missing'], ['level', 'level'], ['level'], ['level']],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(diagnostics.some((diag) => diag.code === 'RUNTIME_TABLE_UNIQUE_KEY_EMPTY' && diag.path === 'tableContracts[0].uniqueBy[0]'));
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'REF_RUNTIME_TABLE_UNIQUE_KEY_FIELD_MISSING' && diag.path === 'tableContracts[0].uniqueBy[1][0]',
      ),
    );
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'RUNTIME_TABLE_UNIQUE_KEY_FIELD_DUPLICATE' && diag.path === 'tableContracts[0].uniqueBy[2][1]',
      ),
    );
    assert.ok(diagnostics.some((diag) => diag.code === 'RUNTIME_TABLE_UNIQUE_KEY_DUPLICATE' && diag.path === 'tableContracts[0].uniqueBy[4]'));
  });

  it('enforces uniqueBy tuples against runtime table rows', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      runtimeDataAssets: [
        {
          id: 'tournament-standard',
          kind: 'scenario',
          payload: {
            blindSchedule: {
              levels: [
                { level: 1, smallBlind: 10 },
                { level: 1, smallBlind: 15 },
              ],
            },
          },
        },
      ],
      tableContracts: [
        {
          id: 'tournament-standard::blindSchedule.levels',
          assetId: 'tournament-standard',
          tablePath: 'blindSchedule.levels',
          fields: [
            { field: 'level', type: 'int' as const },
            { field: 'smallBlind', type: 'int' as const },
          ],
          uniqueBy: [['level']],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(diagnostics.some((diag) => diag.code === 'RUNTIME_TABLE_UNIQUE_KEY_VIOLATION' && diag.path === 'tableContracts[0].uniqueBy[0]'));
  });

  it('enforces monotonic/contiguous/numericRange runtime table constraints', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      runtimeDataAssets: [
        {
          id: 'tournament-standard',
          kind: 'scenario',
          payload: {
            settings: {
              blindSchedule: [
                { level: 0, handsUntilNext: 10 },
                { level: 2, handsUntilNext: 0 },
                { level: 4, handsUntilNext: 5 },
              ],
            },
          },
        },
      ],
      tableContracts: [
        {
          id: 'tournament-standard::settings.blindSchedule',
          assetId: 'tournament-standard',
          tablePath: 'settings.blindSchedule',
          fields: [
            { field: 'level', type: 'int' as const },
            { field: 'handsUntilNext', type: 'int' as const },
          ],
          constraints: [
            { kind: 'monotonic', field: 'handsUntilNext', direction: 'desc' as const },
            { kind: 'contiguousInt', field: 'level', start: 0, step: 1 },
            { kind: 'numericRange', field: 'handsUntilNext', min: 1 },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(diagnostics.some((diag) => diag.code === 'RUNTIME_TABLE_CONSTRAINT_MONOTONIC_VIOLATION'));
    assert.ok(diagnostics.some((diag) => diag.code === 'RUNTIME_TABLE_CONSTRAINT_CONTIGUOUS_VIOLATION'));
    assert.ok(diagnostics.some((diag) => diag.code === 'RUNTIME_TABLE_CONSTRAINT_RANGE_VIOLATION'));
  });

  it('accepts valid runtime table constraints', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      runtimeDataAssets: [
        {
          id: 'tournament-standard',
          kind: 'scenario',
          payload: {
            settings: {
              blindSchedule: [
                { level: 0, handsUntilNext: 10 },
                { level: 1, handsUntilNext: 8 },
                { level: 2, handsUntilNext: 6 },
              ],
            },
          },
        },
      ],
      tableContracts: [
        {
          id: 'tournament-standard::settings.blindSchedule',
          assetId: 'tournament-standard',
          tablePath: 'settings.blindSchedule',
          fields: [
            { field: 'level', type: 'int' as const },
            { field: 'handsUntilNext', type: 'int' as const },
          ],
          uniqueBy: [['level']],
          constraints: [
            { kind: 'monotonic', field: 'level', direction: 'asc' as const },
            { kind: 'contiguousInt', field: 'level', start: 0, step: 1 },
            { kind: 'numericRange', field: 'handsUntilNext', min: 1 },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some(
        (diag) =>
          diag.code === 'RUNTIME_TABLE_UNIQUE_KEY_VIOLATION' ||
          diag.code === 'RUNTIME_TABLE_CONSTRAINT_MONOTONIC_VIOLATION' ||
          diag.code === 'RUNTIME_TABLE_CONSTRAINT_CONTIGUOUS_VIOLATION' ||
          diag.code === 'RUNTIME_TABLE_CONSTRAINT_RANGE_VIOLATION',
      ),
      false,
    );
  });

  it('reports exactlyOne assetRows queries without key-constraining where predicates', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      runtimeDataAssets: [{ id: 'tournament-standard', kind: 'scenario', payload: { blindSchedule: { levels: [] } } }],
      tableContracts: [
        {
          id: 'tournament-standard::blindSchedule.levels',
          assetId: 'tournament-standard',
          tablePath: 'blindSchedule.levels',
          fields: [
            { field: 'level', type: 'int' as const },
            { field: 'smallBlind', type: 'int' as const },
          ],
          uniqueBy: [['level']],
        },
      ],
      actions: [
        {
          ...base.actions[0],
          params: [
            {
              name: '$row',
              domain: {
                query: 'assetRows',
                tableId: 'tournament-standard::blindSchedule.levels',
                cardinality: 'exactlyOne',
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) => diag.code === 'DOMAIN_ASSET_ROWS_EXACTLY_ONE_WHERE_REQUIRED' && diag.path === 'actions[0].params[0].domain.where',
      ),
    );
  });

  it('reports exactlyOne assetRows queries when table contracts lack uniqueBy', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      runtimeDataAssets: [{ id: 'tournament-standard', kind: 'scenario', payload: { blindSchedule: { levels: [] } } }],
      tableContracts: [
        {
          id: 'tournament-standard::blindSchedule.levels',
          assetId: 'tournament-standard',
          tablePath: 'blindSchedule.levels',
          fields: [{ field: 'level', type: 'int' as const }],
        },
      ],
      actions: [
        {
          ...base.actions[0],
          params: [
            {
              name: '$row',
              domain: {
                query: 'assetRows',
                tableId: 'tournament-standard::blindSchedule.levels',
                where: [{ field: 'level', op: 'eq', value: 1 }],
                cardinality: 'exactlyOne',
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'DOMAIN_ASSET_ROWS_EXACTLY_ONE_UNIQUE_KEY_REQUIRED' &&
          diag.path === 'actions[0].params[0].domain.where',
      ),
    );
  });

  it('reports exactlyOne assetRows queries when predicates do not constrain a unique key', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      runtimeDataAssets: [{ id: 'tournament-standard', kind: 'scenario', payload: { blindSchedule: { levels: [] } } }],
      tableContracts: [
        {
          id: 'tournament-standard::blindSchedule.levels',
          assetId: 'tournament-standard',
          tablePath: 'blindSchedule.levels',
          fields: [
            { field: 'level', type: 'int' as const },
            { field: 'smallBlind', type: 'int' as const },
          ],
          uniqueBy: [['level']],
        },
      ],
      actions: [
        {
          ...base.actions[0],
          params: [
            {
              name: '$row',
              domain: {
                query: 'assetRows',
                tableId: 'tournament-standard::blindSchedule.levels',
                where: [{ field: 'smallBlind', op: 'eq', value: 10 }],
                cardinality: 'exactlyOne',
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'DOMAIN_ASSET_ROWS_EXACTLY_ONE_NOT_KEY_CONSTRAINED' &&
          diag.path === 'actions[0].params[0].domain.where',
      ),
    );
  });

  it('accepts exactlyOne assetRows queries when predicates constrain a declared unique key', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      runtimeDataAssets: [{ id: 'tournament-standard', kind: 'scenario', payload: { blindSchedule: { levels: [] } } }],
      tableContracts: [
        {
          id: 'tournament-standard::blindSchedule.levels',
          assetId: 'tournament-standard',
          tablePath: 'blindSchedule.levels',
          fields: [
            { field: 'level', type: 'int' as const },
            { field: 'smallBlind', type: 'int' as const },
          ],
          uniqueBy: [['level']],
        },
      ],
      actions: [
        {
          ...base.actions[0],
          params: [
            {
              name: '$row',
              domain: {
                query: 'assetRows',
                tableId: 'tournament-standard::blindSchedule.levels',
                where: [{ field: 'level', op: 'eq', value: 2 }],
                cardinality: 'exactlyOne',
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some(
        (diag) =>
          diag.code === 'DOMAIN_ASSET_ROWS_EXACTLY_ONE_WHERE_REQUIRED' ||
          diag.code === 'DOMAIN_ASSET_ROWS_EXACTLY_ONE_UNIQUE_KEY_REQUIRED' ||
          diag.code === 'DOMAIN_ASSET_ROWS_EXACTLY_ONE_NOT_KEY_CONSTRAINED',
      ),
      false,
    );
  });

  it('reports concat queries with empty sources', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          params: [
            {
              name: '$choice',
              domain: {
                query: 'concat',
                sources: [],
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) => diag.code === 'DOMAIN_QUERY_INVALID' && diag.path === 'actions[0].params[0].domain.sources',
      ),
    );
  });

  it('reports concat queries with mixed runtime item shapes', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          params: [
            {
              name: '$choice',
              domain: {
                query: 'concat',
                sources: [
                  { query: 'players' },
                  { query: 'zones' },
                ],
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) => diag.code === 'DOMAIN_QUERY_SHAPE_MISMATCH' && diag.path === 'actions[0].params[0].domain.sources',
      ),
    );
  });

  it('reports prioritized queries with empty tiers', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          params: [
            {
              name: '$choice',
              domain: {
                query: 'prioritized',
                tiers: [],
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) => diag.code === 'DOMAIN_QUERY_INVALID' && diag.path === 'actions[0].params[0].domain.tiers',
      ),
    );
  });

  it('reports prioritized queries with mixed runtime item shapes', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          params: [
            {
              name: '$choice',
              domain: {
                query: 'prioritized',
                tiers: [
                  { query: 'players' },
                  { query: 'zones' },
                ],
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) => diag.code === 'DOMAIN_QUERY_SHAPE_MISMATCH' && diag.path === 'actions[0].params[0].domain.tiers',
      ),
    );
  });

  it('warns when prioritized qualifierKey is not declared on any token type', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      tokenTypes: [{ id: 'troops', props: { faction: 'string' } }],
      actions: [
        {
          ...base.actions[0],
          params: [
            {
              name: '$choice',
              domain: {
                query: 'prioritized',
                qualifierKey: 'type',
                tiers: [
                  { query: 'tokensInZone', zone: 'deck:none' },
                ],
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'REF_PRIORITIZED_QUALIFIER_KEY_MISSING'
          && diag.path === 'actions[0].params[0].domain.qualifierKey'
          && diag.severity === 'warning',
      ),
    );
  });

  it('accepts prioritized qualifierKey when declared on a token type', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      tokenTypes: [
        { id: 'troops', props: { faction: 'string' } },
        { id: 'police', props: { type: 'string' } },
      ],
      actions: [
        {
          ...base.actions[0],
          params: [
            {
              name: '$choice',
              domain: {
                query: 'prioritized',
                qualifierKey: 'type',
                tiers: [
                  { query: 'tokensInZone', zone: 'deck:none' },
                ],
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some(
        (diag) =>
          diag.code === 'REF_PRIORITIZED_QUALIFIER_KEY_MISSING'
          && diag.path === 'actions[0].params[0].domain.qualifierKey',
      ),
      false,
    );
  });

  it('accepts tokensInZone domains with dynamic zoneExpr selectors', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          params: [
            {
              name: '$choice',
              domain: {
                query: 'tokensInZone',
                zone: { zoneExpr: { ref: 'binding', name: '$zone' } },
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some((diag) => diag.path.startsWith('actions[0].params[0].domain.zone')),
      false,
    );
  });

  it('validates nested zoneExpr ValueExpr in dynamic tokensInZone domains', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          params: [
            {
              name: '$choice',
              domain: {
                query: 'tokensInZone',
                zone: { zoneExpr: { ref: 'gvar', var: 'missingGlobal' } },
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) => diag.code === 'REF_GVAR_MISSING' && diag.path === 'actions[0].params[0].domain.zone.zoneExpr.var',
      ),
    );
  });

  it('accepts adjacent/connected zone queries with dynamic zoneExpr selectors', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          params: [
            {
              name: '$adj',
              domain: {
                query: 'adjacentZones',
                zone: { zoneExpr: { ref: 'binding', name: '$zone' } },
              },
            },
            {
              name: '$conn',
              domain: {
                query: 'connectedZones',
                zone: { zoneExpr: { ref: 'binding', name: '$zone' } },
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some((diag) => diag.path.startsWith('actions[0].params[0].domain.zone')),
      false,
    );
    assert.equal(
      diagnostics.some((diag) => diag.path.startsWith('actions[0].params[1].domain.zone')),
      false,
    );
  });

  it('accepts aggregate valueExpr over non-numeric query items', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      mapSpaces: [
        {
          id: 'market:none',
          category: 'city',
          attributes: { population: 2, econ: 1, terrainTags: ['urban'], country: 'southVietnam', coastal: false },
          adjacentTo: [],
        },
      ],
      actions: [
        {
          ...base.actions[0],
          effects: [
            {
              setVar: {
                scope: 'global',
                var: 'money',
                value: {
                  aggregate: {
                    op: 'sum',
                    query: { query: 'mapSpaces' },
                    bind: '$zone',
                    valueExpr: { ref: 'zoneProp', zone: '$zone', prop: 'population' },
                  },
                },
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some((diag) => diag.path.startsWith('actions[0].effects[0].setVar.value.aggregate')),
      false,
    );
  });

  it('validates transferVar variable references by scope', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          effects: [
            {
              transferVar: {
                from: { scope: 'pvar', player: 'actor', var: 'health' },
                to: { scope: 'global', var: 'bank' },
                amount: 1,
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some((diag) => diag.code === 'REF_PVAR_MISSING' && diag.path === 'actions[0].effects[0].transferVar.from.var'),
    );
    assert.ok(
      diagnostics.some((diag) => diag.code === 'REF_GVAR_MISSING' && diag.path === 'actions[0].effects[0].transferVar.to.var'),
    );
  });

  it('skips static missing-var diagnostics for dynamic scoped variable names while still validating structure', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          params: [{ name: '$n', domain: { query: 'intsInVarRange', var: { ref: 'binding', name: '$resourceVar' } } }],
          effects: [
            { setVar: { scope: 'global', var: { ref: 'binding', name: '$resourceVar' }, value: 1 } },
            {
              transferVar: {
                from: { scope: 'global', var: { ref: 'grantContext', key: 'fromVar' } },
                to: { scope: 'pvar', player: 'actor', var: { ref: 'binding', name: '$playerVar' } },
                amount: 1,
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.equal(diagnostics.some((diag) => diag.code === 'REF_GVAR_MISSING' || diag.code === 'REF_PVAR_MISSING'), false);
  });

  it('still validates canonical binding names inside dynamic scoped variable expressions', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          effects: [{ setVar: { scope: 'global', var: { ref: 'binding', name: 'notCanonical' }, value: 1 } }],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) => diag.code === 'REF_BINDING_INVALID' && diag.path === 'actions[0].effects[0].setVar.var.name',
      ),
    );
  });

  it('does not duplicate structural transferVar endpoint diagnostics handled by schema contracts', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      zoneVars: [{ name: 'supply', type: 'int', init: 0, min: 0, max: 10 }],
      actions: [
        {
          ...base.actions[0],
          effects: [
            {
              transferVar: {
                from: { scope: 'global', player: 'actor', var: 'money' },
                to: { scope: 'zoneVar', zone: 'deck:none', player: 'actor', var: 'supply' },
                amount: 1,
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some(
        (diag) =>
          diag.code === 'EFFECT_TRANSFER_VAR_TO_PLAYER_REQUIRED'
          || diag.code === 'EFFECT_TRANSFER_VAR_FROM_PLAYER_REQUIRED'
          || diag.code === 'EFFECT_TRANSFER_VAR_GLOBAL_SCOPE_PLAYER_FORBIDDEN'
          || diag.code === 'EFFECT_TRANSFER_VAR_NON_ZONE_SCOPE_ZONE_FORBIDDEN'
          || diag.code === 'EFFECT_TRANSFER_VAR_FROM_ZONE_REQUIRED'
          || diag.code === 'EFFECT_TRANSFER_VAR_TO_ZONE_REQUIRED'
          || diag.code === 'EFFECT_TRANSFER_VAR_ZONE_SCOPE_PLAYER_FORBIDDEN',
      ),
      false,
    );
  });

  it('rejects transferVar boolean variable targets', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      perPlayerVars: [...base.perPlayerVars, { name: 'ready', type: 'boolean', init: false }],
      actions: [
        {
          ...base.actions[0],
          effects: [
            {
              transferVar: {
                from: { scope: 'pvar', player: 'actor', var: 'ready' },
                to: { scope: 'pvar', player: 'active', var: 'vp' },
                amount: 1,
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) => diag.code === 'EFFECT_TRANSFER_VAR_BOOLEAN_TARGET_INVALID'
          && diag.path === 'actions[0].effects[0].transferVar.from.var',
      ),
    );
  });

  it('keeps boolean zoneVar diagnostics at structure layer for transferVar', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      zoneVars: [{ name: 'locked', type: 'boolean', init: false }],
      actions: [
        {
          ...base.actions[0],
          effects: [
            {
              transferVar: {
                from: { scope: 'zoneVar', zone: 'deck:none', var: 'locked' },
                to: { scope: 'global', var: 'vp' },
                amount: 1,
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some((diag) => diag.code === 'ZONE_VAR_TYPE_INVALID' && diag.path === 'zoneVars[0].type'),
    );
    assert.equal(
      diagnostics.some(
        (diag) => diag.code === 'EFFECT_TRANSFER_VAR_BOOLEAN_TARGET_INVALID'
          && diag.path === 'actions[0].effects[0].transferVar.from.var',
      ),
      false,
    );
  });

  it('keeps boolean zoneVar diagnostics at structure layer for transferVar destination', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      zoneVars: [{ name: 'locked', type: 'boolean', init: false }],
      actions: [
        {
          ...base.actions[0],
          effects: [
            {
              transferVar: {
                from: { scope: 'global', var: 'vp' },
                to: { scope: 'zoneVar', zone: 'deck:none', var: 'locked' },
                amount: 1,
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some((diag) => diag.code === 'ZONE_VAR_TYPE_INVALID' && diag.path === 'zoneVars[0].type'),
    );
    assert.equal(
      diagnostics.some(
        (diag) => diag.code === 'EFFECT_TRANSFER_VAR_BOOLEAN_TARGET_INVALID'
          && diag.path === 'actions[0].effects[0].transferVar.to.var',
      ),
      false,
    );
  });

  it('reports invalid phase references with alternatives', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [{ ...base.actions[0], phase: ['mian'] }],
    });

    const diagnostics = validateGameDef(def);
    const missingPhase = diagnostics.find((diag) => diag.code === 'REF_PHASE_MISSING');

    assert.ok(missingPhase);
    assert.equal(missingPhase.path, 'actions[0].phase[0]');
    assert.deepEqual(missingPhase.alternatives, ['main']);
  });

  it('reports invalid gotoPhaseExact target references with alternatives', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          effects: [{ gotoPhaseExact: { phase: 'mian' } }],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    const missingPhase = diagnostics.find((diag) => diag.code === 'REF_PHASE_MISSING');

    assert.ok(missingPhase);
    assert.equal(missingPhase.path, 'actions[0].effects[0].gotoPhaseExact.phase');
    assert.deepEqual(missingPhase.alternatives, ['main']);
  });

  it('reports invalid action references in actionResolved triggers', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      triggers: [
        {
          ...base.triggers[0],
          event: { type: 'actionResolved', action: 'playCrad' },
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) => diag.code === 'REF_ACTION_MISSING' && diag.path === 'triggers[0].event.action',
      ),
    );
  });

  it('reports invalid createToken type references', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          effects: [{ createToken: { type: 'crad', zone: 'market:none' } }],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) => diag.code === 'REF_TOKEN_TYPE_MISSING' && diag.path === 'actions[0].effects[0].createToken.type',
      ),
    );
  });

  it('reports invalid var references in varChanged triggers', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      triggers: [
        {
          id: 'onMissingVar',
          event: { type: 'varChanged', scope: 'global', var: 'monee' },
          effects: [],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) => diag.code === 'REF_VAR_MISSING' && diag.path === 'triggers[0].event.var',
      ),
    );
  });

  it('reports malformed intsInRange param domains', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          params: [{ name: '$n', domain: { query: 'intsInRange', min: 5, max: 1 } }],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'DOMAIN_INTS_RANGE_INVALID' &&
          diag.path === 'actions[0].params[0].domain' &&
          diag.severity === 'error',
      ),
    );
  });

  it('reports duplicate action param names', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          params: [
            { name: '$n', domain: { query: 'intsInRange', min: 0, max: 3 } },
            { name: '$n', domain: { query: 'intsInRange', min: 0, max: 3 } },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'DUPLICATE_ACTION_PARAM_NAME' &&
          diag.path === 'actions[0].params[1]' &&
          diag.severity === 'error',
      ),
    );
  });

  it('reports reserved runtime binding names used as action param names', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          params: [{ name: '__freeOperation', domain: { query: 'intsInRange', min: 0, max: 3 } }],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'ACTION_PARAM_RESERVED_NAME' &&
          diag.path === 'actions[0].params[0].name' &&
          diag.severity === 'error',
      ),
    );
  });

  it('accepts intsInRange dynamic bounds as ValueExpr', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          params: [
            {
              name: '$n',
              domain: {
                query: 'intsInRange',
                min: 1,
                max: { ref: 'gvar', var: 'money' },
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some((diag) => diag.code === 'DOMAIN_INTS_RANGE_INVALID' || diag.code === 'DOMAIN_INTS_RANGE_BOUND_INVALID'),
      false,
    );
  });

  it('reports non-integer literal intsInRange bounds', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          params: [{ name: '$n', domain: { query: 'intsInRange', min: 0.5, max: 3 } }],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'DOMAIN_INTS_RANGE_BOUND_INVALID' &&
          diag.path === 'actions[0].params[0].domain.min' &&
          diag.severity === 'error',
      ),
    );
  });

  it('reports malformed intsInRange cardinality controls', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          params: [
            {
              name: '$n',
              domain: {
                query: 'intsInRange',
                min: 1,
                max: 5,
                step: 0,
                alwaysInclude: [2.5],
                maxResults: 1,
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'DOMAIN_INTS_RANGE_STEP_INVALID'
          && diag.path === 'actions[0].params[0].domain.step'
          && diag.severity === 'error',
      ),
    );
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'DOMAIN_INTS_RANGE_ALWAYS_INCLUDE_INVALID'
          && diag.path === 'actions[0].params[0].domain.alwaysInclude[0]'
          && diag.severity === 'error',
      ),
    );
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'DOMAIN_INTS_RANGE_MAX_RESULTS_INVALID'
          && diag.path === 'actions[0].params[0].domain.maxResults'
          && diag.severity === 'error',
      ),
    );
  });

  it('accepts nextInOrderByCondition domain with numeric from and condition predicate', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          params: [
            {
              name: '$next',
              domain: {
                query: 'nextInOrderByCondition',
                source: { query: 'players' },
                from: { ref: 'gvar', var: 'money' },
                bind: '$seatCandidate',
                where: { op: '==', left: { ref: 'binding', name: '$seatCandidate' }, right: 1 },
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some(
        (diag) =>
          diag.code === 'DOMAIN_INTS_RANGE_BOUND_INVALID' ||
          diag.code === 'VALUE_EXPR_NUMERIC_REQUIRED' ||
          diag.code === 'CNL_COMPILER_MISSING_CAPABILITY',
      ),
      false,
    );
  });

  it('reports shape-mismatched nextInOrderByCondition.source domains', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          params: [
            {
              name: '$next',
              domain: {
                query: 'nextInOrderByCondition',
                source: {
                  query: 'concat',
                  sources: [{ query: 'players' }, { query: 'zones' }],
                },
                from: 1,
                bind: '$seatCandidate',
                where: { op: '==', left: { ref: 'binding', name: '$seatCandidate' }, right: 1 },
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'DOMAIN_QUERY_SHAPE_MISMATCH' &&
          diag.path === 'actions[0].params[0].domain.source.sources' &&
          diag.severity === 'error',
      ),
    );
  });

  it('reports tokenZones source shape mismatches for incompatible known source shapes', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          params: [
            {
              name: '$zone',
              domain: {
                query: 'tokenZones',
                source: { query: 'players' },
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'DOMAIN_TOKEN_ZONES_SOURCE_SHAPE_MISMATCH'
          && diag.path === 'actions[0].params[0].domain.source'
          && diag.severity === 'error',
      ),
    );
  });

  it('reports tokenZones dedupe when payload is not boolean', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          params: [
            {
              name: '$zone',
              domain: {
                query: 'tokenZones',
                source: { query: 'tokensInZone', zone: 'hand:0' },
                dedupe: 'yes',
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'DOMAIN_TOKEN_ZONES_DEDUPE_INVALID'
          && diag.path === 'actions[0].params[0].domain.dedupe'
          && diag.severity === 'error',
      ),
    );
  });

  it('accepts tokenZones source shapes that are token, string, or unknown', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          params: [
            {
              name: '$zoneFromStrings',
              domain: {
                query: 'tokenZones',
                source: { query: 'enums', values: ['token-1', 'token-2'] },
              },
            },
            {
              name: '$zoneFromUnknown',
              domain: {
                query: 'tokenZones',
                source: { query: 'binding', name: '$runtimeTokens' },
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some((diag) => diag.code === 'DOMAIN_TOKEN_ZONES_SOURCE_SHAPE_MISMATCH'),
      false,
    );
  });

  it('ignores unknown source shape but still reports incompatible known tokenZones source shapes', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          params: [
            {
              name: '$zone',
              domain: {
                query: 'tokenZones',
                source: {
                  query: 'concat',
                  sources: [
                    { query: 'binding', name: '$runtimeSource' },
                    { query: 'assetRows', tableId: 'table' },
                  ],
                },
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'DOMAIN_TOKEN_ZONES_SOURCE_SHAPE_MISMATCH'
          && diag.path === 'actions[0].params[0].domain.source'
          && diag.message.includes('[object]'),
      ),
    );
  });

  it('reports nextInOrderByCondition source/anchor mismatch for string source and numeric anchor', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          params: [
            {
              name: '$next',
              domain: {
                query: 'nextInOrderByCondition',
                source: { query: 'enums', values: ['preflop', 'flop', 'turn', 'river'] },
                from: 1,
                bind: '$street',
                where: { op: '==', left: { ref: 'binding', name: '$street' }, right: 'river' },
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'DOMAIN_NEXT_IN_ORDER_SOURCE_ANCHOR_SHAPE_MISMATCH' &&
          diag.path === 'actions[0].params[0].domain.from' &&
          diag.severity === 'error',
      ),
    );
  });

  it('reports nextInOrderByCondition source/anchor mismatch for numeric source and string anchor', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          params: [
            {
              name: '$next',
              domain: {
                query: 'nextInOrderByCondition',
                source: { query: 'players' },
                from: 'dealer-button',
                bind: '$seatCandidate',
                where: { op: '==', left: { ref: 'binding', name: '$seatCandidate' }, right: 1 },
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'DOMAIN_NEXT_IN_ORDER_SOURCE_ANCHOR_SHAPE_MISMATCH' &&
          diag.path === 'actions[0].params[0].domain.from' &&
          diag.severity === 'error',
      ),
    );
  });

  it('accepts shape-compatible nextInOrderByCondition source/anchor pairs', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          params: [
            {
              name: '$next',
              domain: {
                query: 'nextInOrderByCondition',
                source: { query: 'enums', values: ['preflop', 'flop', 'turn', 'river'] },
                from: 'turn',
                bind: '$street',
                where: { op: '==', left: { ref: 'binding', name: '$street' }, right: 'river' },
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some((diag) => diag.code === 'DOMAIN_NEXT_IN_ORDER_SOURCE_ANCHOR_SHAPE_MISMATCH'),
      false,
    );
  });

  it('does not report source/anchor mismatch when nextInOrderByCondition source shape is unknown', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          params: [
            {
              name: '$next',
              domain: {
                query: 'nextInOrderByCondition',
                source: { query: 'binding', name: '$runtimeOrder' },
                from: 1,
                bind: '$candidate',
                where: { op: '==', left: { ref: 'binding', name: '$candidate' }, right: 2 },
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some((diag) => diag.code === 'DOMAIN_NEXT_IN_ORDER_SOURCE_ANCHOR_SHAPE_MISMATCH'),
      false,
    );
  });

  it('reports non-canonical nextInOrderByCondition.bind', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          params: [
            {
              name: '$next',
              domain: {
                query: 'nextInOrderByCondition',
                source: { query: 'players' },
                from: 1,
                bind: 'seatCandidate',
                where: { op: '==', left: { ref: 'binding', name: '$seatCandidate' }, right: 1 },
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'DOMAIN_NEXT_IN_ORDER_BIND_INVALID' &&
          diag.path === 'actions[0].params[0].domain.bind' &&
          diag.severity === 'error',
      ),
    );
  });

  it('reports non-canonical removeByPriority bind fields', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          effects: [
            {
              removeByPriority: {
                budget: 1,
                groups: [
                  {
                    bind: 'candidate',
                    over: { query: 'tokensInZone', zone: 'deck:none' },
                    to: 'market:none',
                    countBind: 'removedCount',
                  },
                ],
                remainingBind: 'remainingBudget',
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'EFFECT_REMOVE_BY_PRIORITY_BIND_INVALID'
          && diag.path === 'actions[0].effects[0].removeByPriority.groups[0].bind'
          && diag.severity === 'error',
      ),
    );
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'EFFECT_REMOVE_BY_PRIORITY_COUNT_BIND_INVALID'
          && diag.path === 'actions[0].effects[0].removeByPriority.groups[0].countBind'
          && diag.severity === 'error',
      ),
    );
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'EFFECT_REMOVE_BY_PRIORITY_REMAINING_BIND_INVALID'
          && diag.path === 'actions[0].effects[0].removeByPriority.remainingBind'
          && diag.severity === 'error',
      ),
    );
  });

  it('reports non-canonical binder declarations across behavior surfaces', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          effects: [
            {
              forEach: {
                bind: 'row',
                countBind: 'count',
                over: { query: 'players' },
                effects: [],
                in: [],
              },
            },
            {
              reduce: {
                itemBind: 'item',
                accBind: 'acc',
                over: { query: 'intsInRange', min: 1, max: 2 },
                initial: 0,
                next: 0,
                resultBind: 'sum',
                in: [],
              },
            },
            { let: { bind: 'tmp', value: 1, in: [] } },
            { bindValue: { bind: 'tmp', value: 1 } },
            {
              evaluateSubset: {
                source: { query: 'players' },
                subsetSize: 1,
                subsetBind: 'subset',
                compute: [],
                scoreExpr: 1,
                resultBind: 'score',
                bestSubsetBind: 'best',
                in: [],
              },
            },
            { chooseOne: { internalDecisionId: 'decision:$pick', bind: 'pick', options: { query: 'players' } } },
            { chooseN: { internalDecisionId: 'decision:$pick', bind: 'pickN', options: { query: 'players' }, n: 1 } },
            { rollRandom: { bind: 'die', min: 1, max: 6, in: [] } },
            {
              transferVar: {
                from: { scope: 'global', var: 'money' },
                to: { scope: 'global', var: 'money' },
                amount: 1,
                actualBind: 'actual',
              },
            },
            {
              bindValue: {
                bind: '$ok',
                value: {
                  aggregate: {
                    op: 'sum',
                    query: { query: 'intsInRange', min: 1, max: 2 },
                    bind: 'n',
                    valueExpr: 1,
                  },
                },
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    const expected = [
      'EFFECT_FOR_EACH_BIND_INVALID',
      'EFFECT_FOR_EACH_COUNT_BIND_INVALID',
      'EFFECT_REDUCE_ITEM_BIND_INVALID',
      'EFFECT_REDUCE_ACC_BIND_INVALID',
      'EFFECT_REDUCE_RESULT_BIND_INVALID',
      'EFFECT_LET_BIND_INVALID',
      'EFFECT_BIND_VALUE_BIND_INVALID',
      'EFFECT_EVALUATE_SUBSET_BIND_INVALID',
      'EFFECT_EVALUATE_SUBSET_RESULT_BIND_INVALID',
      'EFFECT_EVALUATE_SUBSET_BEST_BIND_INVALID',
      'EFFECT_CHOOSE_ONE_BIND_INVALID',
      'EFFECT_CHOOSE_N_BIND_INVALID',
      'EFFECT_ROLL_RANDOM_BIND_INVALID',
      'EFFECT_TRANSFER_VAR_ACTUAL_BIND_INVALID',
      'VALUE_EXPR_AGGREGATE_BIND_INVALID',
    ];

    for (const code of expected) {
      assert.ok(diagnostics.some((diag) => diag.code === code), `missing diagnostic code ${code}`);
    }
  });

  it('keeps declared effect binder policies in parity with binder-surface contract declarations', () => {
    const declaredPatterns = [...collectDeclaredEffectBinderPatternsFromContract()].sort();
    const policyPatterns = [...collectEffectDeclaredBinderPolicyPatternsForTest()].sort();

    assert.deepEqual(
      policyPatterns,
      declaredPatterns,
      'validator declared-binder policy keys must exactly match contract-declared effect binder patterns',
    );
  });

  it('reports missing intsInVarRange source variable', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          params: [{ name: '$n', domain: { query: 'intsInVarRange', var: 'monye' } }],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'DOMAIN_INTS_VAR_RANGE_SOURCE_MISSING' &&
          diag.path === 'actions[0].params[0].domain.var' &&
          diag.severity === 'error',
      ),
    );
  });

  it('does not report static intsInVarRange source-missing diagnostics for dynamic variable-name expressions', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          params: [{ name: '$n', domain: { query: 'intsInVarRange', var: { ref: 'grantContext', key: 'resourceVar' } } }],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some((diag) => diag.code === 'DOMAIN_INTS_VAR_RANGE_SOURCE_MISSING' && diag.path === 'actions[0].params[0].domain.var'),
      false,
    );
  });

  it('reports non-int intsInVarRange source variable', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      globalVars: [...base.globalVars, { name: 'flag', type: 'boolean', init: false }],
      actions: [
        {
          ...base.actions[0],
          params: [{ name: '$n', domain: { query: 'intsInVarRange', var: 'flag' } }],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'DOMAIN_INTS_VAR_RANGE_SOURCE_TYPE_INVALID' &&
          diag.path === 'actions[0].params[0].domain.var' &&
          diag.severity === 'error',
      ),
    );
  });

  it('reports malformed intsInVarRange cardinality controls', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          params: [
            {
              name: '$n',
              domain: {
                query: 'intsInVarRange',
                var: 'money',
                min: 1,
                max: 5,
                step: 0,
                alwaysInclude: [2.5],
                maxResults: 1,
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'DOMAIN_INTS_VAR_RANGE_STEP_INVALID'
          && diag.path === 'actions[0].params[0].domain.step'
          && diag.severity === 'error',
      ),
    );
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'DOMAIN_INTS_VAR_RANGE_ALWAYS_INCLUDE_INVALID'
          && diag.path === 'actions[0].params[0].domain.alwaysInclude[0]'
          && diag.severity === 'error',
      ),
    );
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'DOMAIN_INTS_VAR_RANGE_MAX_RESULTS_INVALID'
          && diag.path === 'actions[0].params[0].domain.maxResults'
          && diag.severity === 'error',
      ),
    );
  });

  it('reports unknown marker lattice references in setMarker effects', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          effects: [{ setMarker: { space: 'market:none', marker: 'unknownMarker', state: 'neutral' } }],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) => diag.code === 'REF_MARKER_LATTICE_MISSING' && diag.path === 'actions[0].effects[0].setMarker.marker',
      ),
    );
  });

  it('reports unknown marker lattice references in shiftMarker effects', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          effects: [{ shiftMarker: { space: 'market:none', marker: 'unknownMarker', delta: 1 } }],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'REF_MARKER_LATTICE_MISSING' && diag.path === 'actions[0].effects[0].shiftMarker.marker',
      ),
    );
  });

  it('reports invalid static marker state literals in setMarker effects', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          effects: [{ setMarker: { space: 'market:none', marker: 'supportOpposition', state: 'notAState' } }],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) => diag.code === 'REF_MARKER_STATE_MISSING' && diag.path === 'actions[0].effects[0].setMarker.state',
      ),
    );
  });

  it('reports unknown marker lattice references in markerState refs', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          pre: {
            op: '==',
            left: { ref: 'markerState', space: 'market:none', marker: 'unknownMarker' },
            right: 'neutral',
          },
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(diagnostics.some((diag) => diag.code === 'REF_MARKER_LATTICE_MISSING' && diag.path === 'actions[0].pre.left.marker'));
  });

  it('reports invalid static marker-state comparisons against marker lattices', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          pre: {
            op: '==',
            left: { ref: 'markerState', space: 'market:none', marker: 'supportOpposition' },
            right: 'illegalState',
          },
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(diagnostics.some((diag) => diag.code === 'REF_MARKER_STATE_MISSING' && diag.path === 'actions[0].pre.right'));
  });

  it('reports unknown global marker lattice references in globalMarkerState refs', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          pre: {
            op: '==',
            left: { ref: 'globalMarkerState', marker: 'unknownGlobalMarker' },
            right: 'inactive',
          },
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) => diag.code === 'REF_GLOBAL_MARKER_LATTICE_MISSING' && diag.path === 'actions[0].pre.left.marker',
      ),
    );
  });

  it('reports unknown global marker lattice references in setGlobalMarker effects', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          effects: [{ setGlobalMarker: { marker: 'unknownGlobalMarker', state: 'inactive' } }],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'REF_GLOBAL_MARKER_LATTICE_MISSING' && diag.path === 'actions[0].effects[0].setGlobalMarker.marker',
      ),
    );
  });

  it('reports operation profile action references missing from actions', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actionPipelines: [
        {
          id: 'patrol-profile',
          actionId: 'patrol',
          legality: null,
          costValidation: null, costEffects: [],
          targeting: {},
          stages: [{ stage: 'resolve' }],
          atomicity: 'atomic',
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some((diag) => diag.code === 'REF_ACTION_MISSING' && diag.path === 'actionPipelines[0].actionId'),
    );
  });

  it('accepts accompanyingOps set to any', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actionPipelines: [
        {
          id: 'profile-a',
          actionId: 'playCard',
          accompanyingOps: 'any',
          legality: null,
          costValidation: null, costEffects: [],
          targeting: {},
          stages: [{ stage: 'resolve' }],
          atomicity: 'atomic',
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(!diagnostics.some((diag) => diag.code === 'REF_ACTION_MISSING' && diag.path.includes('.accompanyingOps[')));
  });

  it('accepts accompanyingOps entries that reference declared actions', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actionPipelines: [
        {
          id: 'profile-a',
          actionId: 'playCard',
          accompanyingOps: ['playCard'],
          legality: null,
          costValidation: null, costEffects: [],
          targeting: {},
          stages: [{ stage: 'resolve' }],
          atomicity: 'atomic',
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(!diagnostics.some((diag) => diag.code === 'REF_ACTION_MISSING' && diag.path.includes('.accompanyingOps[')));
  });

  it('reports accompanyingOps entries that reference unknown actions', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actionPipelines: [
        {
          id: 'profile-a',
          actionId: 'playCard',
          accompanyingOps: ['nonexistent'],
          legality: null,
          costValidation: null, costEffects: [],
          targeting: {},
          stages: [{ stage: 'resolve' }],
          atomicity: 'atomic',
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) => diag.code === 'REF_ACTION_MISSING' && diag.path === 'actionPipelines[0].accompanyingOps[0]',
      ),
    );
  });

  it('accepts operation profiles with accompanyingOps omitted', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actionPipelines: [
        {
          id: 'profile-a',
          actionId: 'playCard',
          legality: null,
          costValidation: null, costEffects: [],
          targeting: {},
          stages: [{ stage: 'resolve' }],
          atomicity: 'atomic',
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(!diagnostics.some((diag) => diag.code === 'REF_ACTION_MISSING' && diag.path.includes('.accompanyingOps[')));
  });

  it('reports ambiguous operation profile action mappings', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actionPipelines: [
        {
          id: 'profile-a',
          actionId: 'playCard',
          legality: null,
          costValidation: null, costEffects: [],
          targeting: {},
          stages: [{ stage: 'resolve' }],
          atomicity: 'atomic',
        },
        {
          id: 'profile-b',
          actionId: 'playCard',
          legality: null,
          costValidation: null, costEffects: [],
          targeting: {},
          stages: [{ stage: 'resolve' }],
          atomicity: 'partial',
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) => diag.code === 'ACTION_PIPELINE_ACTION_MAPPING_AMBIGUOUS' && diag.path === 'actionPipelines',
      ),
    );
  });

  it('accepts multi-profile action mappings when every pipeline has applicability', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actionPipelines: [
        {
          id: 'profile-a',
          actionId: 'playCard',
          applicability: { op: '==', left: 1, right: 1 },
          legality: null,
          costValidation: null, costEffects: [],
          targeting: {},
          stages: [{ stage: 'resolve' }],
          atomicity: 'atomic',
        },
        {
          id: 'profile-b',
          actionId: 'playCard',
          applicability: { op: '==', left: 1, right: 1 },
          legality: null,
          costValidation: null, costEffects: [],
          targeting: {},
          stages: [{ stage: 'resolve' }],
          atomicity: 'partial',
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      !diagnostics.some((diag) => diag.code === 'ACTION_PIPELINE_ACTION_MAPPING_AMBIGUOUS'),
    );
  });

  it('accepts linkedWindows that reference declared turn-flow eligibility override windows', () => {
    const def = withPipelineLinkedWindows(['special-window']);

    const diagnostics = validateGameDef(def);
    assert.ok(!diagnostics.some((diag) => diag.code === 'REF_TURN_FLOW_OVERRIDE_WINDOW_MISSING'));
  });

  it('accepts linkedWindows that are canonically equivalent to declared override windows', () => {
    const def = withPipelineLinkedWindows(
      [' special-window ', 'caf\u00e9'],
      { overrideWindowIds: ['special-window', 'cafe\u0301'] },
    );

    const diagnostics = validateGameDef(def);
    assert.ok(!diagnostics.some((diag) => diag.code === 'REF_TURN_FLOW_OVERRIDE_WINDOW_MISSING'));
  });

  it('reports linkedWindows entries that reference unknown turn-flow eligibility override windows', () => {
    const def = withPipelineLinkedWindows(['missing-window']);

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'REF_TURN_FLOW_OVERRIDE_WINDOW_MISSING' &&
          diag.path === 'actionPipelines[0].linkedWindows[0]',
      ),
    );
  });

  it('reports linkedWindows entries that reference windows without action-pipeline usage', () => {
    const def = withPipelineLinkedWindows(['special-window'], { overrideWindowUsages: ['eligibilityOverride'] });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'REF_TURN_FLOW_OVERRIDE_WINDOW_MISSING' &&
          diag.path === 'actionPipelines[0].linkedWindows[0]',
      ),
    );
  });

  it('does not report linkedWindows diagnostics when linkedWindows is absent', () => {
    const def = withPipelineLinkedWindows(undefined);

    const diagnostics = validateGameDef(def);
    assert.ok(!diagnostics.some((diag) => diag.code === 'REF_TURN_FLOW_OVERRIDE_WINDOW_MISSING'));
  });

  it('skips linkedWindows reference validation when turn order is not card-driven', () => {
    const def = withPipelineLinkedWindows(['missing-window'], { turnOrderType: 'roundRobin' });

    const diagnostics = validateGameDef(def);
    assert.ok(!diagnostics.some((diag) => diag.code === 'REF_TURN_FLOW_OVERRIDE_WINDOW_MISSING'));
  });

  it('reports unknown zoneProp in pipeline stage effects', () => {
    const def = withPipelineZonePropCondition('spaceId', 'market:none');

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'REF_MAP_SPACE_PROP_MISSING' &&
          diag.path === 'actionPipelines[0].stages[0].effects[0].if.when.left.prop',
      ),
    );
  });

  it('accepts valid zoneProp id in pipeline stage effects', () => {
    const def = withPipelineZonePropCondition('id', 'market:none');

    const diagnostics = validateGameDef(def);
    assert.ok(
      !diagnostics.some(
        (diag) =>
          diag.code === 'REF_MAP_SPACE_PROP_MISSING' &&
          diag.path.startsWith('actionPipelines[0].stages'),
      ),
    );
  });

  it('accepts valid zoneProp category in pipeline stage effects', () => {
    const def = withPipelineZonePropCondition('category', 'city');

    const diagnostics = validateGameDef(def);
    assert.ok(
      !diagnostics.some(
        (diag) =>
          diag.code === 'REF_MAP_SPACE_PROP_MISSING' &&
          diag.path.startsWith('actionPipelines[0].stages'),
      ),
    );
  });

  it('accepts valid attribute prop in pipeline stage effects', () => {
    const def = withPipelineZonePropCondition('population', 2);

    const diagnostics = validateGameDef(def);
    assert.ok(
      !diagnostics.some(
        (diag) =>
          diag.code === 'REF_MAP_SPACE_PROP_MISSING' &&
          diag.path.startsWith('actionPipelines[0].stages'),
      ),
    );
  });

  it('reports unknown zoneProp in pipeline costEffects', () => {
    const def = withPipelineZonePropCondition('badProp', 'x', 'cost');

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'REF_MAP_SPACE_PROP_MISSING' &&
          diag.path === 'actionPipelines[0].costEffects[0].if.when.left.prop',
      ),
    );
  });

  it('does not throw for malformed pipeline omission matrix and reports expected required-field diagnostics', () => {
    const requiredFieldDiagnostics = {
      stages: { code: 'ACTION_PIPELINE_STAGES_MISSING', path: 'actionPipelines[0].stages' },
      targeting: { code: 'ACTION_PIPELINE_TARGETING_MISSING', path: 'actionPipelines[0].targeting' },
    } as const;
    const cases: Array<{
      readonly name: string;
      readonly omittedFields: readonly ('costEffects' | 'stages' | 'targeting')[];
      readonly expectedPresent: readonly (keyof typeof requiredFieldDiagnostics)[];
      readonly expectedAbsent: readonly (keyof typeof requiredFieldDiagnostics)[];
    }> = [
      { name: 'missing costEffects', omittedFields: ['costEffects'], expectedPresent: [], expectedAbsent: ['stages', 'targeting'] },
      { name: 'missing stages', omittedFields: ['stages'], expectedPresent: ['stages'], expectedAbsent: ['targeting'] },
      { name: 'missing targeting', omittedFields: ['targeting'], expectedPresent: ['targeting'], expectedAbsent: ['stages'] },
      { name: 'missing stages and targeting', omittedFields: ['stages', 'targeting'], expectedPresent: ['stages', 'targeting'], expectedAbsent: [] },
      {
        name: 'missing costEffects, stages, and targeting',
        omittedFields: ['costEffects', 'stages', 'targeting'],
        expectedPresent: ['stages', 'targeting'],
        expectedAbsent: [],
      },
    ];

    for (const testCase of cases) {
      const diagnostics: ReturnType<typeof validateGameDef> = [];
      const def = withMalformedPipelineOmissions(testCase.omittedFields);
      let actualDiagnostics = diagnostics;
      assert.doesNotThrow(() => {
        actualDiagnostics = validateGameDef(def);
      }, testCase.name);
      for (const expectedKey of testCase.expectedPresent) {
        const expected = requiredFieldDiagnostics[expectedKey];
        assert.equal(
          actualDiagnostics.some((diag) => diag.code === expected.code && diag.path === expected.path),
          true,
          `${testCase.name}: expected ${expected.code} at ${expected.path}`,
        );
      }
      for (const expectedKey of testCase.expectedAbsent) {
        const expected = requiredFieldDiagnostics[expectedKey];
        assert.equal(
          actualDiagnostics.some((diag) => diag.code === expected.code && diag.path === expected.path),
          false,
          `${testCase.name}: did not expect ${expected.code} at ${expected.path}`,
        );
      }
    }
  });

  it('reports explicit diagnostics when pipeline stages/targeting have invalid runtime shapes', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actionPipelines: [
        {
          id: 'profile-a',
          actionId: 'playCard',
          legality: null,
          costValidation: null,
          costEffects: [],
          stages: null,
          targeting: null,
          atomicity: 'atomic',
        },
      ],
    });

    let diagnostics: ReturnType<typeof validateGameDef> = [];
    assert.doesNotThrow(() => {
      diagnostics = validateGameDef(def);
    });
    assert.equal(
      diagnostics.some(
        (diag) => diag.code === 'ACTION_PIPELINE_STAGES_MISSING' && diag.path === 'actionPipelines[0].stages',
      ),
      true,
    );
    assert.equal(
      diagnostics.some(
        (diag) => diag.code === 'ACTION_PIPELINE_TARGETING_MISSING' && diag.path === 'actionPipelines[0].targeting',
      ),
      true,
    );
  });

  it('does not throw when a pipeline stage entry has an invalid runtime shape', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actionPipelines: [
        {
          id: 'profile-a',
          actionId: 'playCard',
          legality: null,
          costValidation: null,
          costEffects: [],
          targeting: {},
          stages: [null],
          atomicity: 'atomic',
        },
      ],
    });

    let diagnostics: ReturnType<typeof validateGameDef> = [];
    assert.doesNotThrow(() => {
      diagnostics = validateGameDef(def);
    });
    assert.equal(
      diagnostics.some(
        (diag) => diag.code === 'ACTION_PIPELINE_STAGE_INVALID' && diag.path === 'actionPipelines[0].stages[0]',
      ),
      true,
    );
  });

  it('reports unknown coupPlan final-round omitted phases', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'deck:none', lookahead: 'deck:none', leader: 'deck:none' },
            eligibility: { seats: ['0', '1'] },

            windows: [],
            actionClassByActionId: { pass: 'pass' },
            optionMatrix: [],
            passRewards: [],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
          },
          coupPlan: {
            phases: [{ id: 'victory', steps: ['check-thresholds'] }],
            finalRoundOmitPhases: ['resources'],
            maxConsecutiveRounds: 1,
          },
        },
      },
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'COUP_PLAN_FINAL_ROUND_OMIT_UNKNOWN_PHASE' &&
          diag.path === 'turnOrder.config.coupPlan.finalRoundOmitPhases[0]',
      ),
    );
  });

  it('reports empty coupPlan phases when coupPlan is declared', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'deck:none', lookahead: 'deck:none', leader: 'deck:none' },
            eligibility: { seats: ['0', '1'] },

            windows: [],
            actionClassByActionId: { pass: 'pass' },
            optionMatrix: [],
            passRewards: [],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
          },
          coupPlan: {
            phases: [],
          },
        },
      },
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some((diag) => diag.code === 'COUP_PLAN_PHASES_EMPTY' && diag.path === 'turnOrder.config.coupPlan.phases'),
    );
  });

  it('requires coupPlan phase ids to match turnStructure phase ids', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      turnStructure: {
        phases: [{ id: 'operations' }],
      },
      actions: [{ ...base.actions[0], phase: ['operations'] }],
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'deck:none', lookahead: 'deck:none', leader: 'deck:none' },
            eligibility: { seats: ['0', '1'] },

            windows: [],
            actionClassByActionId: { pass: 'pass' },
            optionMatrix: [],
            passRewards: [],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
          },
          coupPlan: {
            phases: [{ id: 'victory', steps: ['check-thresholds'] }],
            finalRoundOmitPhases: ['victory'],
            maxConsecutiveRounds: 1,
          },
        },
      },
    });

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some(
        (diag) =>
          diag.code === 'COUP_PLAN_PHASE_NOT_IN_TURN_STRUCTURE' &&
          diag.path === 'turnOrder.config.coupPlan.phases[0].id',
      ),
      true,
    );
  });

  it('reports missing references inside victory expressions', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      terminal: {
        ...base.terminal,
        checkpoints: [
          {
            id: 'us-threshold',
            seat: 'us',
            timing: 'duringCoup',
            when: { op: '>=', left: { ref: 'gvar', var: 'unknown' }, right: 50 },
          },
        ],
        margins: [{ seat: 'us', value: { ref: 'pvar', player: 'active', var: 'missingPvar' } }],
        ranking: { order: 'desc' },
      },
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some((diag) => diag.code === 'REF_GVAR_MISSING' && diag.path === 'terminal.checkpoints[0].when.left.var'),
    );
    assert.ok(
      diagnostics.some((diag) => diag.code === 'REF_PVAR_MISSING' && diag.path === 'terminal.margins[0].value.var'),
    );
  });
});

describe('validateGameDef constraints and warnings', () => {
  it('reports PlayerSel.id outside configured bounds', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [{ ...base.actions[0], actor: { id: 4 } }],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) => diag.code === 'PLAYER_SELECTOR_ID_OUT_OF_BOUNDS' && diag.path === 'actions[0].actor',
      ),
    );
  });

  it('reports action executor id outside configured bounds', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [{ ...base.actions[0], executor: { id: 4 } }],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) => diag.code === 'PLAYER_SELECTOR_ID_OUT_OF_BOUNDS' && diag.path === 'actions[0].executor',
      ),
    );
  });

  it('reports invalid players metadata', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      metadata: { ...base.metadata, players: { min: 0, max: 0 } },
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some((diag) => diag.code === 'META_PLAYERS_MIN_INVALID' && diag.path === 'metadata.players.min'),
    );
  });

  it('reports invalid maxTriggerDepth metadata', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      metadata: { ...base.metadata, maxTriggerDepth: 1.5 },
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) => diag.code === 'META_MAX_TRIGGER_DEPTH_INVALID' && diag.path === 'metadata.maxTriggerDepth',
      ),
    );
  });

  it('reports variable bounds inconsistency', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      globalVars: [{ name: 'money', type: 'int', min: 2, init: 1, max: 99 }],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(diagnostics.some((diag) => diag.code === 'VAR_BOUNDS_INVALID' && diag.path === 'globalVars[0]'));
  });

  it('reports duplicate marker lattice ids on direct GameDef input', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      markerLattices: [
        ...(base.markerLattices ?? []),
        { ...(base.markerLattices ?? [])[0]! },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some((diag) => diag.code === 'DUPLICATE_MARKER_LATTICE_ID' && diag.path === 'markerLattices[1]'),
    );
  });

  it('reports direct GameDef marker constraint violations from initial marker states', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      zones: [
        {
          id: 'province:none',
          zoneKind: 'board',
          owner: 'none',
          visibility: 'public',
          ordering: 'set',
          category: 'province',
          attributes: { population: 0 },
          adjacentTo: [],
        },
        base.zones[1],
      ],
      markerLattices: [
        {
          id: 'supportOpposition',
          states: ['neutral', 'activeSupport'],
          defaultState: 'neutral',
          constraints: [
            {
              when: { op: '==', left: { ref: 'zoneProp', zone: '$space', prop: 'population' }, right: 0 },
              allowedStates: ['neutral'],
            },
          ],
        },
      ],
      spaceMarkers: [{ spaceId: 'province:none', markerId: 'supportOpposition', state: 'activeSupport' }],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some((diag) => diag.code === 'SPACE_MARKER_CONSTRAINT_VIOLATION' && diag.path === 'zones[0].id'),
    );
  });

  it('reports direct GameDef marker constraints that cannot be evaluated', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      zones: [
        {
          id: 'province:none',
          zoneKind: 'board',
          owner: 'none',
          visibility: 'public',
          ordering: 'set',
          category: 'province',
          adjacentTo: [],
        },
        base.zones[1],
      ],
      markerLattices: [
        {
          id: 'supportOpposition',
          states: ['neutral'],
          defaultState: 'neutral',
          constraints: [
            {
              when: { op: '==', left: { ref: 'zoneProp', zone: 'missing:none', prop: 'category' }, right: 'city' },
              allowedStates: ['neutral'],
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some((diag) => diag.code === 'SPACE_MARKER_CONSTRAINT_EVALUATION_FAILED' && diag.path === 'zones[0].id'),
    );
  });

  it('reports score end-condition without scoring definition', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      terminal: { conditions: [{ when: { op: '==', left: 1, right: 1 }, result: { type: 'score' } }] },
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) => diag.code === 'SCORING_REQUIRED_FOR_SCORE_RESULT' && diag.path === 'terminal.conditions[0].result',
      ),
    );
  });

  it('warns when scoring is configured but never used by end-conditions', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      terminal: {
        ...base.terminal,
        scoring: { method: 'highest', value: 1 },
      },
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some((diag) => diag.code === 'SCORING_UNUSED' && diag.path === 'terminal.scoring' && diag.severity === 'warning'),
    );
  });

  it('warns on asymmetric adjacency declarations with spatial diagnostics', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      zones: [
        { ...base.zones[0], adjacentTo: [{ to: 'deck:none', direction: 'bidirectional' }] },
        { ...base.zones[1], adjacentTo: [] },
      ],
    });

    const diagnostics = validateGameDef(def);
    const diagnostic = diagnostics.find((diag) => diag.code === 'SPATIAL_ASYMMETRIC_EDGE_NORMALIZED');
    assert.ok(diagnostic);
    assert.equal(diagnostic.path, 'zones[0].adjacentTo[0].to');
    assert.equal(diagnostic.severity, 'warning');
    assert.equal(typeof diagnostic.message, 'string');
    assert.equal(typeof diagnostic.suggestion, 'string');
  });

  it('reports dangling adjacency references with spatial diagnostics', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      zones: [{ ...base.zones[0], adjacentTo: [{ to: 'missing:none', direction: 'bidirectional' }] }, base.zones[1]],
    });

    const diagnostic = validateGameDef(def).find((diag) => diag.code === 'SPATIAL_DANGLING_ZONE_REF');
    assert.ok(diagnostic);
    assert.equal(diagnostic.path, 'zones[0].adjacentTo[0].to');
    assert.equal(diagnostic.severity, 'error');
    assert.equal(typeof diagnostic.message, 'string');
    assert.equal(typeof diagnostic.suggestion, 'string');
  });

  it('reports unsorted adjacency declarations with spatial diagnostics', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      zones: [
        {
          ...base.zones[0],
          adjacentTo: [
            { to: 'market:none', direction: 'bidirectional' },
            { to: 'deck:none', direction: 'bidirectional' },
          ],
        },
        base.zones[1],
      ],
    });

    const diagnostic = validateGameDef(def).find((diag) => diag.code === 'SPATIAL_NEIGHBORS_UNSORTED');
    assert.ok(diagnostic);
    assert.equal(diagnostic.path, 'zones[0].adjacentTo[1].to');
    assert.equal(diagnostic.severity, 'error');
    assert.equal(typeof diagnostic.message, 'string');
    assert.equal(typeof diagnostic.suggestion, 'string');
  });

  it('reports missing adjacency direction as an error', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      zones: [{ ...base.zones[0], adjacentTo: [{ to: 'deck:none' }] }, base.zones[1]],
    });

    const diagnostic = validateGameDef(def).find((diag) => diag.code === 'SPATIAL_ADJACENCY_DIRECTION_REQUIRED');
    assert.ok(diagnostic);
    assert.equal(diagnostic.path, 'zones[0].adjacentTo[0].direction');
    assert.equal(diagnostic.severity, 'error');
  });

  it('reports conflicting directions for duplicate adjacency target as an error', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      zones: [
        {
          ...base.zones[0],
          adjacentTo: [
            { to: 'deck:none', direction: 'bidirectional' },
            { to: 'deck:none', direction: 'unidirectional' },
          ],
        },
        base.zones[1],
      ],
    });

    const diagnostic = validateGameDef(def).find((diag) => diag.code === 'SPATIAL_CONFLICTING_NEIGHBOR_DIRECTION');
    assert.ok(diagnostic);
    assert.equal(diagnostic.path, 'zones[0].adjacentTo[1].direction');
    assert.equal(diagnostic.severity, 'error');
  });

  it('reports ownership mismatch for :none selector targeting player-owned zone', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      zones: [{ ...base.zones[0], owner: 'player' }, base.zones[1]],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'ZONE_SELECTOR_OWNERSHIP_INVALID' &&
          diag.path === 'actions[0].effects[0].draw.to' &&
          diag.severity === 'error',
      ),
    );
  });

  it('reports unowned zone ids that do not use :none qualifier', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      zones: [{ ...base.zones[0], id: 'market:0', owner: 'none' }, base.zones[1]],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) => diag.code === 'ZONE_ID_OWNERSHIP_INVALID' && diag.path === 'zones[0].id' && diag.severity === 'error',
      ),
    );
  });

  it('reports player-owned zone ids without numeric qualifiers', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      zones: [{ ...base.zones[0], id: 'hand:actor', owner: 'player' }, base.zones[1]],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'ZONE_ID_PLAYER_QUALIFIER_INVALID' && diag.path === 'zones[0].id' && diag.severity === 'error',
      ),
    );
  });

  it('reports player-owned zone ids that exceed metadata.players.max bounds', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      zones: [{ ...base.zones[0], id: 'hand:4', owner: 'player' }, base.zones[1]],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'ZONE_ID_PLAYER_INDEX_OUT_OF_BOUNDS' &&
          diag.path === 'zones[0].id' &&
          diag.severity === 'error',
      ),
    );
  });

  it('reports invalid chooseN range cardinality declarations', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          effects: [
            {
              chooseN: {
                bind: '$pick',
                options: { query: 'players' },
                n: 1,
                max: 2,
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'EFFECT_CHOOSE_N_CARDINALITY_INVALID' &&
          diag.path === 'actions[0].effects[0].chooseN' &&
          diag.severity === 'error',
      ),
    );
  });

  it('rejects chooseOne/chooseN options queries with non-encodable runtime shapes', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      runtimeDataAssets: [{ id: 'tournament-standard', kind: 'scenario', payload: { blindSchedule: { levels: [] } } }],
      tableContracts: [
        {
          id: 'tournament-standard::blindSchedule.levels',
          assetId: 'tournament-standard',
          tablePath: 'blindSchedule.levels',
          fields: [{ field: 'bigBlind', type: 'int' }],
        },
      ],
      actions: [
        {
          ...base.actions[0],
          effects: [
            {
              chooseOne: {
                bind: '$row',
                options: { query: 'assetRows', tableId: 'tournament-standard::blindSchedule.levels' },
              },
            },
            {
              chooseN: {
                bind: '$rows',
                options: { query: 'assetRows', tableId: 'tournament-standard::blindSchedule.levels' },
                max: 1,
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    const chooseOneDiagnostic = diagnostics.find(
      (diag) =>
        diag.code === 'EFFECT_CHOICE_OPTIONS_RUNTIME_SHAPE_INVALID'
        && diag.path === 'actions[0].effects[0].chooseOne.options'
        && diag.severity === 'error',
    );
    const chooseNDiagnostic = diagnostics.find(
      (diag) =>
        diag.code === 'EFFECT_CHOICE_OPTIONS_RUNTIME_SHAPE_INVALID'
        && diag.path === 'actions[0].effects[1].chooseN.options'
        && diag.severity === 'error',
    );
    assert.ok(chooseOneDiagnostic);
    assert.ok(chooseNDiagnostic);
    assert.deepEqual(chooseOneDiagnostic.alternatives, ['object']);
    assert.deepEqual(chooseNDiagnostic.alternatives, ['object']);
  });

  it('suppresses secondary choose options shape diagnostics when options queries already fail validation', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          effects: [
            {
              chooseOne: {
                bind: '$row',
                options: { query: 'assetRows', tableId: 'missing-table' },
              },
            },
            {
              chooseN: {
                bind: '$rows',
                options: { query: 'assetRows', tableId: 'missing-table' },
                max: 1,
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some(
        (diag) =>
          diag.code === 'REF_RUNTIME_TABLE_MISSING'
          && diag.path === 'actions[0].effects[0].chooseOne.options.tableId'
          && diag.severity === 'error',
      ),
      true,
    );
    assert.equal(
      diagnostics.some(
        (diag) =>
          diag.code === 'REF_RUNTIME_TABLE_MISSING'
          && diag.path === 'actions[0].effects[1].chooseN.options.tableId'
          && diag.severity === 'error',
      ),
      true,
    );
    assert.equal(
      diagnostics.some(
        (diag) =>
          diag.code === 'EFFECT_CHOICE_OPTIONS_RUNTIME_SHAPE_INVALID'
          && diag.path === 'actions[0].effects[0].chooseOne.options',
      ),
      false,
    );
    assert.equal(
      diagnostics.some(
        (diag) =>
          diag.code === 'EFFECT_CHOICE_OPTIONS_RUNTIME_SHAPE_INVALID'
          && diag.path === 'actions[0].effects[1].chooseN.options',
      ),
      false,
    );
  });

  it('accepts chooseOne/chooseN options queries with move-param-encodable runtime shapes', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          effects: [
            { chooseOne: { bind: '$seat', options: { query: 'players' } } },
            { chooseN: { bind: '$tokens', options: { query: 'tokensInZone', zone: 'deck:none' }, max: 1 } },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some((diag) => diag.code === 'EFFECT_CHOICE_OPTIONS_RUNTIME_SHAPE_INVALID'),
      false,
    );
  });

  it('accepts chooseN expression-valued range bounds in behavior validation', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      globalVars: [...base.globalVars, { name: 'dynamicMax', type: 'int', init: 2, min: 0, max: 6 }],
      actions: [
        {
          ...base.actions[0],
          effects: [
            {
              chooseN: {
                bind: '$pick',
                options: { query: 'players' },
                min: { if: { when: true, then: 0, else: 1 } },
                max: { ref: 'gvar', var: 'dynamicMax' },
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some((diag) => diag.code === 'EFFECT_CHOOSE_N_CARDINALITY_INVALID'),
      false,
    );
  });

  it('returns no diagnostics for fully valid game def', () => {
    const diagnostics = validateGameDef(createValidGameDef());
    assert.deepEqual(diagnostics, []);
  });

  it('returns no diagnostics for FITL foundation map fixture', () => {
    const diagnostics = validateGameDef(readGameDefFixture('fitl-map-foundation-valid.json'));
    assert.deepEqual(diagnostics, []);
  });

  it('reports error when stacking faction filters lack canonical tokenType faction metadata', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      tokenTypes: [{ id: 'troops', props: { faction: 'string' } }],
      stackingConstraints: [
        {
          id: 'nv-restriction',
          description: 'Only NVA/VC in North Vietnam',
          spaceFilter: { country: ['northVietnam'] },
          pieceFilter: { seats: ['US', 'ARVN'] },
          rule: 'prohibit' as const,
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(diagnostics.some((diag) => diag.code === 'STACKING_CONSTRAINT_TOKEN_TYPE_SEAT_MISSING'));
  });

  it('reports error when token type faction references undeclared faction id', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      seats: [{ id: 'us' }],
      tokenTypes: [{ id: 'troops', seat: 'arvn', props: { faction: 'string' } }],
    });

    const diagnostics = validateGameDef(def);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'TOKEN_TYPE_SEAT_UNDECLARED'
          && diag.path === 'tokenTypes[0].seat'
          && diag.severity === 'error',
      ),
    );
  });
});

describe('validateInitialPlacementsAgainstStackingConstraints', () => {
  const spaces: readonly ZoneDef[] = [
    { id: 'quang-tri' as ZoneId, owner: 'none', visibility: 'public', ordering: 'set', category: 'province', attributes: { population: 1, econ: 0, country: 'south-vietnam', coastal: false } },
    { id: 'hue' as ZoneId, owner: 'none', visibility: 'public', ordering: 'set', category: 'city', attributes: { population: 2, econ: 0, country: 'south-vietnam', coastal: true } },
    { id: 'route-1' as ZoneId, owner: 'none', visibility: 'public', ordering: 'set', category: 'loc', attributes: { population: 0, econ: 1, country: 'south-vietnam', coastal: false } },
    { id: 'hanoi' as ZoneId, owner: 'none', visibility: 'public', ordering: 'set', category: 'city', attributes: { population: 3, econ: 0, country: 'north-vietnam', coastal: false } },
  ];

  const maxBasesConstraint: StackingConstraint = {
    id: 'max-2-bases',
    description: 'Max 2 bases per province or city',
    spaceFilter: { category: ['province', 'city'] },
    pieceFilter: { pieceTypeIds: ['base'] },
    rule: 'maxCount',
    maxCount: 2,
  };

  const noBasesOnLocConstraint: StackingConstraint = {
    id: 'no-bases-on-loc',
    description: 'No bases on LoCs',
    spaceFilter: { category: ['loc'] },
    pieceFilter: { pieceTypeIds: ['base'] },
    rule: 'prohibit',
  };

  const nvRestrictionConstraint: StackingConstraint = {
    id: 'nv-restriction',
    description: 'Only NVA/VC in North Vietnam',
    spaceFilter: { attributeEquals: { country: 'north-vietnam' } },
    pieceFilter: { seats: ['US', 'ARVN'] },
    rule: 'prohibit',
  };
  const pieceTypeFactionById = new Map<string, string>([
    ['troops', 'US'],
    ['base', 'US'],
    ['guerrilla', 'NVA'],
    ['us-troops', 'us'],
  ]);

  it('reports error when 3 bases placed in province (maxCount 2)', () => {
    const placements: readonly ScenarioPiecePlacement[] = [
      { spaceId: 'quang-tri', pieceTypeId: 'base', seat: 'US', count: 1 },
      { spaceId: 'quang-tri', pieceTypeId: 'base', seat: 'ARVN', count: 1 },
      { spaceId: 'quang-tri', pieceTypeId: 'base', seat: 'NVA', count: 1 },
    ];

    const diagnostics = validateInitialPlacementsAgainstStackingConstraints(
      [maxBasesConstraint],
      placements,
      spaces,
    );

    assert.equal(diagnostics.length, 1);
    const diag = diagnostics.find((d) => d.code === 'STACKING_CONSTRAINT_VIOLATION');
    assert.ok(diag);
    assert.equal(diag.severity, 'error');
    assert.ok(diag.message.includes('3'));
    assert.ok(diag.message.includes('quang-tri'));
  });

  it('reports error when base placed on LoC (prohibit)', () => {
    const placements: readonly ScenarioPiecePlacement[] = [
      { spaceId: 'route-1', pieceTypeId: 'base', seat: 'NVA', count: 1 },
    ];

    const diagnostics = validateInitialPlacementsAgainstStackingConstraints(
      [noBasesOnLocConstraint],
      placements,
      spaces,
    );

    assert.equal(diagnostics.length, 1);
    const diag = diagnostics.find((d) => d.code === 'STACKING_CONSTRAINT_VIOLATION');
    assert.ok(diag);
    assert.ok(diag.message.includes('route-1'));
  });

  it('reports error when US piece placed in North Vietnam (prohibit by faction+country)', () => {
    const placements: readonly ScenarioPiecePlacement[] = [
      { spaceId: 'hanoi', pieceTypeId: 'troops', seat: 'US', count: 2 },
    ];

    const diagnostics = validateInitialPlacementsAgainstStackingConstraints(
      [nvRestrictionConstraint],
      placements,
      spaces,
      pieceTypeFactionById,
    );

    assert.equal(diagnostics.length, 1);
    const diag = diagnostics.find((d) => d.code === 'STACKING_CONSTRAINT_VIOLATION');
    assert.ok(diag);
    assert.ok(diag.message.includes('hanoi'));
    assert.ok(diag.message.includes('2'));
  });

  it('produces no diagnostics for valid placements within all constraints', () => {
    const placements: readonly ScenarioPiecePlacement[] = [
      { spaceId: 'quang-tri', pieceTypeId: 'base', seat: 'US', count: 1 },
      { spaceId: 'quang-tri', pieceTypeId: 'base', seat: 'ARVN', count: 1 },
      { spaceId: 'quang-tri', pieceTypeId: 'troops', seat: 'US', count: 5 },
      { spaceId: 'hue', pieceTypeId: 'base', seat: 'NVA', count: 2 },
      { spaceId: 'hanoi', pieceTypeId: 'guerrilla', seat: 'NVA', count: 3 },
    ];

    const diagnostics = validateInitialPlacementsAgainstStackingConstraints(
      [maxBasesConstraint, noBasesOnLocConstraint, nvRestrictionConstraint],
      placements,
      spaces,
      pieceTypeFactionById,
    );

    assert.deepEqual(diagnostics, []);
  });

  it('produces no diagnostics when no stacking constraints defined (backward-compatible)', () => {
    const placements: readonly ScenarioPiecePlacement[] = [
      { spaceId: 'quang-tri', pieceTypeId: 'base', seat: 'US', count: 5 },
    ];

    const diagnostics = validateInitialPlacementsAgainstStackingConstraints(
      [],
      placements,
      spaces,
    );

    assert.deepEqual(diagnostics, []);
  });

  it('reports multiple violations across different constraints', () => {
    const placements: readonly ScenarioPiecePlacement[] = [
      { spaceId: 'quang-tri', pieceTypeId: 'base', seat: 'US', count: 3 },
      { spaceId: 'route-1', pieceTypeId: 'base', seat: 'ARVN', count: 1 },
      { spaceId: 'hanoi', pieceTypeId: 'troops', seat: 'ARVN', count: 1 },
    ];

    const diagnostics = validateInitialPlacementsAgainstStackingConstraints(
      [maxBasesConstraint, noBasesOnLocConstraint, nvRestrictionConstraint],
      placements,
      spaces,
      pieceTypeFactionById,
    );

    assert.equal(diagnostics.length, 3);
    assert.ok(diagnostics.every((d) => d.code === 'STACKING_CONSTRAINT_VIOLATION'));
  });

  it('does not flag non-matching piece types against constraint', () => {
    const placements: readonly ScenarioPiecePlacement[] = [
      { spaceId: 'quang-tri', pieceTypeId: 'troops', seat: 'US', count: 10 },
    ];

    const diagnostics = validateInitialPlacementsAgainstStackingConstraints(
      [maxBasesConstraint],
      placements,
      spaces,
    );

    assert.deepEqual(diagnostics, []);
  });

  it('does not flag NVA/VC pieces in North Vietnam against restriction', () => {
    const placements: readonly ScenarioPiecePlacement[] = [
      { spaceId: 'hanoi', pieceTypeId: 'guerrilla', seat: 'NVA', count: 5 },
      { spaceId: 'hanoi', pieceTypeId: 'guerrilla', seat: 'VC', count: 3 },
    ];

    const diagnostics = validateInitialPlacementsAgainstStackingConstraints(
      [nvRestrictionConstraint],
      placements,
      spaces,
      pieceTypeFactionById,
    );

    assert.deepEqual(diagnostics, []);
  });

  it('uses canonical piece-type faction mapping when provided', () => {
    const canonicalConstraint: StackingConstraint = {
      id: 'nv-restriction-canonical',
      description: 'Only nva/vc in North Vietnam (canonical ids)',
      spaceFilter: { attributeEquals: { country: 'north-vietnam' } },
      pieceFilter: { seats: ['us', 'arvn'] },
      rule: 'prohibit',
    };
    const placements: readonly ScenarioPiecePlacement[] = [
      { spaceId: 'hanoi', pieceTypeId: 'us-troops', seat: 'US', count: 1 },
    ];
    const pieceTypeFactionById = new Map<string, string>([['us-troops', 'us']]);

    const diagnostics = validateInitialPlacementsAgainstStackingConstraints(
      [canonicalConstraint],
      placements,
      spaces,
      pieceTypeFactionById,
    );

    assert.equal(diagnostics.length, 1);
    const diag = diagnostics.find((d) => d.code === 'STACKING_CONSTRAINT_VIOLATION');
    assert.ok(diag);
    assert.ok(diag.message.includes('hanoi'));
  });

  it('matches array-valued attributeEquals filters by value', () => {
    const arrayConstraint: StackingConstraint = {
      id: 'terrain-array-filter',
      description: 'No bases in terrain-tagged spaces',
      spaceFilter: { attributeEquals: { terrainTags: ['highland', 'jungle'] } },
      pieceFilter: { pieceTypeIds: ['base'] },
      rule: 'prohibit',
    };
    const spacesWithTerrain: readonly ZoneDef[] = [
      {
        ...spaces[0]!,
        attributes: {
          ...(spaces[0]!.attributes ?? {}),
          terrainTags: ['highland', 'jungle'],
        },
      } as ZoneDef,
    ];
    const placements: readonly ScenarioPiecePlacement[] = [
      { spaceId: 'quang-tri', pieceTypeId: 'base', seat: 'US', count: 1 },
    ];

    const diagnostics = validateInitialPlacementsAgainstStackingConstraints(
      [arrayConstraint],
      placements,
      spacesWithTerrain,
    );

    assert.equal(diagnostics.length, 1);
    assert.equal(diagnostics[0]?.code, 'STACKING_CONSTRAINT_VIOLATION');
  });

  it('does not match array-valued attributeEquals filters when order differs', () => {
    const arrayConstraint: StackingConstraint = {
      id: 'terrain-array-filter-order',
      description: 'No bases in terrain-tagged spaces',
      spaceFilter: { attributeEquals: { terrainTags: ['highland', 'jungle'] } },
      pieceFilter: { pieceTypeIds: ['base'] },
      rule: 'prohibit',
    };
    const spacesWithTerrain: readonly ZoneDef[] = [
      {
        ...spaces[0]!,
        attributes: {
          ...(spaces[0]!.attributes ?? {}),
          terrainTags: ['jungle', 'highland'],
        },
      } as ZoneDef,
    ];
    const placements: readonly ScenarioPiecePlacement[] = [
      { spaceId: 'quang-tri', pieceTypeId: 'base', seat: 'US', count: 1 },
    ];

    const diagnostics = validateInitialPlacementsAgainstStackingConstraints(
      [arrayConstraint],
      placements,
      spacesWithTerrain,
    );

    assert.deepEqual(diagnostics, []);
  });
});

describe('validateGameDef arithmetic diagnostics', () => {
  it('reports static divide-by-zero diagnostics for integer division operators', () => {
    const base = createValidGameDef();
    const def = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          effects: [
            { addVar: { scope: 'global', var: 'money', delta: { op: '/', left: 10, right: 0 } } },
            { addVar: { scope: 'global', var: 'money', delta: { op: 'floorDiv', left: 10, right: 0 } } },
            { addVar: { scope: 'global', var: 'money', delta: { op: 'ceilDiv', left: 10, right: 0 } } },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    const staticDivideByZeroDiagnostics = diagnostics.filter((diag) => diag.code === 'VALUE_EXPR_DIVISION_BY_ZERO_STATIC');

    assert.equal(staticDivideByZeroDiagnostics.length, 3);
    assert.equal(
      staticDivideByZeroDiagnostics.some((diag) => diag.path === 'actions[0].effects[0].addVar.delta.right'),
      true,
    );
    assert.equal(
      staticDivideByZeroDiagnostics.some((diag) => diag.path === 'actions[0].effects[1].addVar.delta.right'),
      true,
    );
    assert.equal(
      staticDivideByZeroDiagnostics.some((diag) => diag.path === 'actions[0].effects[2].addVar.delta.right'),
      true,
    );
  });
});

describe('validateGameDef free-operation sequence-context linkage diagnostics', () => {
  const withEventFreeOperationGrants = (freeOperationGrants: readonly unknown[]): GameDef => {
    const base = createValidGameDef();
    return asTaggedGameDef({
      ...base,
      eventDecks: [
        {
          id: 'deck',
          drawZone: 'deck:none',
          discardZone: 'market:none',
          cards: [
            {
              id: 'card-1',
              title: 'Sequence Context Linkage',
              sideMode: 'single',
              unshaded: {
                text: 'sequence context test',
                freeOperationGrants,
              },
            },
          ],
        },
      ],
    });
  };

  const withEventCardSideConfig = (unshaded: Record<string, unknown>): GameDef => {
    const base = createValidGameDef();
    return asTaggedGameDef({
      ...base,
      eventDecks: [
        {
          id: 'deck',
          drawZone: 'deck:none',
          discardZone: 'market:none',
          cards: [
            {
              id: 'card-1',
              title: 'Sequence Context Linkage',
              sideMode: 'single',
              unshaded: {
                text: 'sequence context test',
                ...unshaded,
              },
            },
          ],
        },
      ],
    });
  };

  const withEventTargetSelector = (
    selector: Record<string, unknown>,
    cardinality: Record<string, unknown>,
    options?: {
      readonly baseOverrides?: Record<string, unknown>;
    },
  ): GameDef => {
    const base = withEventCardSideConfig({
      targets: [
        {
          id: '$target',
          selector,
          cardinality,
          application: 'each',
          effects: [],
        },
      ],
    });
    return asTaggedGameDef({
      ...base,
      ...(options?.baseOverrides ?? {}),
    });
  };

  it('validates event side effects through the generic effect validator', () => {
    const def = withEventCardSideConfig({
      effects: [
        {
          draw: { from: 'deck:none', to: 'missing:none', count: 1 },
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some(
        (diag) =>
          diag.code === 'REF_ZONE_MISSING'
          && diag.path === 'eventDecks[0].cards[0].unshaded.effects[0].draw.to',
      ),
      true,
    );
  });

  it('validates event card playCondition through the generic condition validator', () => {
    const def = asTaggedGameDef({
      ...withEventCardSideConfig({}),
      eventDecks: [
        {
          id: 'deck',
          drawZone: 'deck:none',
          discardZone: 'market:none',
          cards: [
            {
              id: 'card-1',
              title: 'Sequence Context Linkage',
              sideMode: 'single',
              playCondition: {
                op: '==',
                left: { ref: 'zoneCount', zone: 'missing:none' },
                right: 0,
              },
              unshaded: { text: 'sequence context test' },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some(
        (diag) =>
          diag.code === 'REF_ZONE_MISSING'
          && diag.path === 'eventDecks[0].cards[0].playCondition.left.zone',
      ),
      true,
    );
  });

  it('validates nested branch target effects on event cards through the generic effect validator', () => {
    const def = withEventCardSideConfig({
      branches: [
        {
          id: 'branch-1',
          targets: [
            {
              id: 'target-1',
              selector: { query: 'players' },
              cardinality: { n: 1 },
              application: 'each',
              effects: [
                {
                  draw: { from: 'deck:none', to: 'missing:none', count: 1 },
                },
              ],
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some(
        (diag) =>
          diag.code === 'REF_ZONE_MISSING'
          && diag.path === 'eventDecks[0].cards[0].unshaded.branches[0].targets[0].effects[0].draw.to',
      ),
      true,
    );
  });

  it('rejects single-select event target selectors with non-encodable runtime shapes', () => {
    const def = withEventTargetSelector(
      { query: 'assetRows', tableId: 'tournament-standard::blindSchedule.levels' },
      { n: 1 },
      {
        baseOverrides: {
          runtimeDataAssets: [{ id: 'tournament-standard', kind: 'scenario', payload: { blindSchedule: { levels: [] } } }],
          tableContracts: [
            {
              id: 'tournament-standard::blindSchedule.levels',
              assetId: 'tournament-standard',
              tablePath: 'blindSchedule.levels',
              fields: [{ field: 'bigBlind', type: 'int' }],
            },
          ],
        },
      },
    );

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some(
        (diag) =>
          diag.code === 'EFFECT_CHOICE_OPTIONS_RUNTIME_SHAPE_INVALID'
          && diag.path === 'eventDecks[0].cards[0].unshaded.targets[0].selector'
          && diag.severity === 'error',
      ),
      true,
    );
  });

  it('rejects multi-select event target selectors with non-encodable runtime shapes', () => {
    const def = withEventTargetSelector(
      { query: 'assetRows', tableId: 'tournament-standard::blindSchedule.levels' },
      { max: 2 },
      {
        baseOverrides: {
          runtimeDataAssets: [{ id: 'tournament-standard', kind: 'scenario', payload: { blindSchedule: { levels: [] } } }],
          tableContracts: [
            {
              id: 'tournament-standard::blindSchedule.levels',
              assetId: 'tournament-standard',
              tablePath: 'blindSchedule.levels',
              fields: [{ field: 'bigBlind', type: 'int' }],
            },
          ],
        },
      },
    );

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some(
        (diag) =>
          diag.code === 'EFFECT_CHOICE_OPTIONS_RUNTIME_SHAPE_INVALID'
          && diag.path === 'eventDecks[0].cards[0].unshaded.targets[0].selector'
          && diag.severity === 'error',
      ),
      true,
    );
  });

  it('suppresses event target runtime-shape diagnostics when selector validation already fails', () => {
    const def = withEventTargetSelector(
      { query: 'assetRows', tableId: 'missing-table' },
      { n: 1 },
    );

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some(
        (diag) =>
          diag.code === 'REF_RUNTIME_TABLE_MISSING'
          && diag.path === 'eventDecks[0].cards[0].unshaded.targets[0].selector.tableId'
          && diag.severity === 'error',
      ),
      true,
    );
    assert.equal(
      diagnostics.some(
        (diag) =>
          diag.code === 'EFFECT_CHOICE_OPTIONS_RUNTIME_SHAPE_INVALID'
          && diag.path === 'eventDecks[0].cards[0].unshaded.targets[0].selector',
      ),
      false,
    );
  });

  it('accepts event target selectors with move-param-encodable runtime shapes', () => {
    const def = withEventTargetSelector(
      { query: 'tokensInZone', zone: 'deck:none' },
      { max: 1 },
    );

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some(
        (diag) =>
          diag.code === 'EFFECT_CHOICE_OPTIONS_RUNTIME_SHAPE_INVALID'
          && diag.path === 'eventDecks[0].cards[0].unshaded.targets[0].selector',
      ),
      false,
    );
  });

  it('validates event freeOperationGrants through the shared grant validator', () => {
    const def = withEventCardSideConfig({
      freeOperationGrants: [
        {
          seat: '0',
          sequence: { batch: 'ctx-chain', step: -1 },
          operationClass: 'operation',
          actionIds: ['playCard'],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some(
        (diag) =>
          diag.code === 'EFFECT_GRANT_FREE_OPERATION_SEQUENCE_INVALID'
          && diag.path === 'eventDecks[0].cards[0].unshaded.freeOperationGrants[0].sequence.step',
      ),
      true,
    );
  });

  it('rejects event freeOperationGrants that require completion without postResolutionTurnFlow', () => {
    const def = withEventCardSideConfig({
      freeOperationGrants: [
        {
          seat: '0',
          sequence: { batch: 'ctx-chain', step: 0 },
          operationClass: 'operation',
          actionIds: ['playCard'],
          completionPolicy: 'required',
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some(
        (diag) =>
          diag.code === 'EFFECT_GRANT_FREE_OPERATION_POST_RESOLUTION_TURN_FLOW_REQUIRED'
          && diag.path === 'eventDecks[0].cards[0].unshaded.freeOperationGrants[0].postResolutionTurnFlow',
      ),
      true,
    );
  });

  it('rejects event freeOperationGrants that set postResolutionTurnFlow without required completionPolicy', () => {
    const def = withEventCardSideConfig({
      freeOperationGrants: [
        {
          seat: '0',
          sequence: { batch: 'ctx-chain', step: 0 },
          operationClass: 'operation',
          actionIds: ['playCard'],
          postResolutionTurnFlow: 'resumeCardFlow',
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some(
        (diag) =>
          diag.code === 'EFFECT_GRANT_FREE_OPERATION_COMPLETION_POLICY_REQUIRED'
          && diag.path === 'eventDecks[0].cards[0].unshaded.freeOperationGrants[0].completionPolicy',
      ),
      true,
    );
  });

  it('rejects mixed progressionPolicy values within one declarative free-operation batch', () => {
    const def = withEventFreeOperationGrants([
      {
        seat: '0',
        sequence: { batch: 'ctx-chain', step: 0, progressionPolicy: 'strictInOrder' },
        operationClass: 'operation',
        actionIds: ['playCard'],
      },
      {
        seat: '0',
        sequence: { batch: 'ctx-chain', step: 1, progressionPolicy: 'implementWhatCanInOrder' },
        operationClass: 'operation',
        actionIds: ['playCard'],
      },
    ]);

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some(
        (diag) =>
          diag.code === 'FREE_OPERATION_SEQUENCE_MIXED_PROGRESSION_POLICY'
          && diag.path === 'eventDecks[0].cards[0].unshaded.freeOperationGrants[0].sequence.progressionPolicy',
      ),
      true,
    );
    assert.equal(
      diagnostics.some(
        (diag) =>
          diag.code === 'FREE_OPERATION_SEQUENCE_MIXED_PROGRESSION_POLICY'
          && diag.path === 'eventDecks[0].cards[0].unshaded.freeOperationGrants[1].sequence.progressionPolicy',
      ),
      true,
    );
  });

  it('treats omitted progressionPolicy as strictInOrder for declarative batch validation', () => {
    const def = withEventFreeOperationGrants([
      {
        seat: '0',
        sequence: { batch: 'ctx-chain', step: 0 },
        operationClass: 'operation',
        actionIds: ['playCard'],
      },
      {
        seat: '0',
        sequence: { batch: 'ctx-chain', step: 1, progressionPolicy: 'strictInOrder' },
        operationClass: 'operation',
        actionIds: ['playCard'],
      },
    ]);

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some((diag) => diag.code === 'FREE_OPERATION_SEQUENCE_MIXED_PROGRESSION_POLICY'),
      false,
    );
  });

  it('renders sequenceContext requires sequence against the correct freeOperationGrant surface', () => {
    const def = withEventCardSideConfig({
      freeOperationGrants: [
        {
          seat: '0',
          operationClass: 'operation',
          actionIds: ['playCard'],
          sequenceContext: { captureMoveZoneCandidatesAs: 'selected-space' },
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.deepEqual(
      diagnostics.find(
        (diag) =>
          diag.code === 'EFFECT_GRANT_FREE_OPERATION_SEQUENCE_CONTEXT_INVALID'
          && diag.path === 'eventDecks[0].cards[0].unshaded.freeOperationGrants[0].sequenceContext',
      ),
      {
        code: 'EFFECT_GRANT_FREE_OPERATION_SEQUENCE_CONTEXT_INVALID',
        path: 'eventDecks[0].cards[0].unshaded.freeOperationGrants[0].sequenceContext',
        severity: 'error',
        message: 'freeOperationGrant.sequenceContext requires freeOperationGrant.sequence.',
        suggestion: 'Declare sequence.batch and sequence.step when using sequenceContext.',
      },
    );
  });

  it('rejects invalid moveZoneBindings on event freeOperationGrants', () => {
    const def = withEventCardSideConfig({
      freeOperationGrants: [
        {
          seat: '0',
          sequence: { batch: 'ctx-chain', step: 0 },
          operationClass: 'operation',
          actionIds: ['playCard'],
          moveZoneBindings: [''],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some(
        (diag) =>
          diag.code === 'EFFECT_GRANT_FREE_OPERATION_MOVE_ZONE_BINDINGS_INVALID'
          && diag.path === 'eventDecks[0].cards[0].unshaded.freeOperationGrants[0].moveZoneBindings',
      ),
      true,
    );
  });

  it('rejects invalid moveZoneProbeBindings on event freeOperationGrants', () => {
    const diagnostics = validateGameDef({
      ...createValidGameDef(),
      eventDecks: [{
        id: 'deck',
        drawZone: 'deck:none',
        discardZone: 'discard:none',
        cards: [{
          id: 'card',
          title: 'Card',
          sideMode: 'single',
          unshaded: {
            text: 'x',
            freeOperationGrants: [{
              seat: '1',
              operationClass: 'operation',
              sequence: { batch: 'x', step: 0 },
              moveZoneProbeBindings: [''],
            }],
          },
        }],
      }],
    });

    assert.equal(
      diagnostics.some((diag) =>
        diag.code === 'EFFECT_GRANT_FREE_OPERATION_MOVE_ZONE_PROBE_BINDINGS_INVALID'
          && diag.path === 'eventDecks[0].cards[0].unshaded.freeOperationGrants[0].moveZoneProbeBindings'),
      true,
    );
  });

  it('rejects requireMoveZoneCandidatesFrom when no matching capture exists in the batch', () => {
    const def = withEventFreeOperationGrants([
      {
        seat: '0',
        sequence: { batch: 'ctx-chain', step: 1 },
        operationClass: 'operation',
        actionIds: ['playCard'],
        sequenceContext: { requireMoveZoneCandidatesFrom: 'selected-space' },
      },
    ]);

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some(
        (diag) =>
          diag.code === 'FREE_OPERATION_SEQUENCE_CONTEXT_REQUIRE_CAPTURE_MISSING'
          && diag.path === 'eventDecks[0].cards[0].unshaded.freeOperationGrants[0].sequenceContext.requireMoveZoneCandidatesFrom',
      ),
      true,
    );
  });

  it('rejects requireMoveZoneCandidatesFrom when matching capture is at same or later sequence step', () => {
    const def = withEventFreeOperationGrants([
      {
        seat: '0',
        sequence: { batch: 'ctx-chain', step: 1 },
        operationClass: 'operation',
        actionIds: ['playCard'],
        sequenceContext: { requireMoveZoneCandidatesFrom: 'selected-space' },
      },
      {
        seat: '0',
        sequence: { batch: 'ctx-chain', step: 1 },
        operationClass: 'operation',
        actionIds: ['playCard'],
        sequenceContext: { captureMoveZoneCandidatesAs: 'selected-space' },
      },
    ]);

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some(
        (diag) =>
          diag.code === 'FREE_OPERATION_SEQUENCE_CONTEXT_REQUIRE_CAPTURE_ORDER_INVALID'
          && diag.path === 'eventDecks[0].cards[0].unshaded.freeOperationGrants[0].sequenceContext.requireMoveZoneCandidatesFrom',
      ),
      true,
    );
  });

  it('accepts requireMoveZoneCandidatesFrom when matching capture exists at an earlier sequence step', () => {
    const def = withEventFreeOperationGrants([
      {
        seat: '0',
        sequence: { batch: 'ctx-chain', step: 0 },
        operationClass: 'operation',
        actionIds: ['playCard'],
        sequenceContext: { captureMoveZoneCandidatesAs: 'selected-space' },
      },
      {
        seat: '0',
        sequence: { batch: 'ctx-chain', step: 1 },
        operationClass: 'operation',
        actionIds: ['playCard'],
        sequenceContext: { requireMoveZoneCandidatesFrom: 'selected-space' },
      },
    ]);

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some((diag) => diag.code.startsWith('FREE_OPERATION_SEQUENCE_CONTEXT_REQUIRE_CAPTURE_')),
      false,
    );
  });

  it('rejects same-batch cross-step sequence context under implementWhatCanInOrder for declarative grants', () => {
    const def = withEventFreeOperationGrants([
      {
        seat: '0',
        sequence: { batch: 'ctx-chain', step: 0, progressionPolicy: 'implementWhatCanInOrder' },
        operationClass: 'operation',
        actionIds: ['playCard'],
        sequenceContext: { captureMoveZoneCandidatesAs: 'selected-space' },
      },
      {
        seat: '0',
        sequence: { batch: 'ctx-chain', step: 1, progressionPolicy: 'implementWhatCanInOrder' },
        operationClass: 'operation',
        actionIds: ['playCard'],
        sequenceContext: { requireMoveZoneCandidatesFrom: 'selected-space' },
      },
    ]);

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some(
        (diag) =>
          diag.code === 'FREE_OPERATION_GRANT_SKIP_CAPABLE_CROSS_STEP_CONTEXT'
          && diag.path === 'eventDecks[0].cards[0].unshaded.freeOperationGrants[1].sequenceContext.requireMoveZoneCandidatesFrom',
      ),
      true,
    );
  });

  it('allows same-batch cross-step sequence context under strictInOrder for declarative grants', () => {
    const def = withEventFreeOperationGrants([
      {
        seat: '0',
        sequence: { batch: 'ctx-chain', step: 0, progressionPolicy: 'strictInOrder' },
        operationClass: 'operation',
        actionIds: ['playCard'],
        sequenceContext: { captureMoveZoneCandidatesAs: 'selected-space' },
      },
      {
        seat: '0',
        sequence: { batch: 'ctx-chain', step: 1, progressionPolicy: 'strictInOrder' },
        operationClass: 'operation',
        actionIds: ['playCard'],
        sequenceContext: { requireMoveZoneCandidatesFrom: 'selected-space' },
      },
    ]);

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some((diag) => diag.code === 'FREE_OPERATION_GRANT_SKIP_CAPABLE_CROSS_STEP_CONTEXT'),
      false,
    );
  });

  it('rejects mixed progressionPolicy values within one effect-issued free-operation batch', () => {
    const effects: readonly EffectAST[] = [
      eff({
        grantFreeOperation: {
          seat: '0',
          operationClass: 'operation',
          sequence: { batch: 'effect-chain', step: 0, progressionPolicy: 'strictInOrder' },
        },
      }),
      eff({
        grantFreeOperation: {
          seat: '0',
          operationClass: 'operation',
          sequence: { batch: 'effect-chain', step: 1, progressionPolicy: 'implementWhatCanInOrder' },
        },
      }),
    ] as const;
    const def = asTaggedGameDef({
      ...createValidGameDef(),
      actions: [
        {
          ...createValidGameDef().actions[0]!,
          effects,
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some(
        (diag) =>
          diag.code === 'FREE_OPERATION_SEQUENCE_MIXED_PROGRESSION_POLICY'
          && diag.path === 'actions[0].effects[0].grantFreeOperation.sequence.progressionPolicy',
      ),
      true,
    );
    assert.equal(
      diagnostics.some(
        (diag) =>
          diag.code === 'FREE_OPERATION_SEQUENCE_MIXED_PROGRESSION_POLICY'
          && diag.path === 'actions[0].effects[1].grantFreeOperation.sequence.progressionPolicy',
      ),
      true,
    );
  });

  it('accepts side capture plus branch require when the selected branch scope matches runtime issuance', () => {
    const def = withEventCardSideConfig({
      freeOperationGrants: [
        {
          seat: '0',
          sequence: { batch: 'ctx-branch-chain', step: 0 },
          operationClass: 'operation',
          actionIds: ['playCard'],
          sequenceContext: { captureMoveZoneCandidatesAs: 'selected-space' },
        },
      ],
      branches: [
        {
          id: 'branch-1',
          freeOperationGrants: [
            {
              seat: '0',
              sequence: { batch: 'ctx-branch-chain', step: 1 },
              operationClass: 'operation',
              actionIds: ['playCard'],
              sequenceContext: { requireMoveZoneCandidatesFrom: 'selected-space' },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some((diag) => diag.code.startsWith('FREE_OPERATION_SEQUENCE_CONTEXT_REQUIRE_CAPTURE_')),
      false,
    );
  });

  it('rejects ambiguous overlapping event freeOperationGrants on the same side', () => {
    const def = withEventCardSideConfig({
      freeOperationGrants: [
        {
          seat: '0',
          sequence: { batch: 'ambiguous-a', step: 0 },
          operationClass: 'operation',
          actionIds: ['playCard'],
          uses: 1,
        },
        {
          seat: '0',
          sequence: { batch: 'ambiguous-b', step: 0 },
          operationClass: 'operation',
          actionIds: ['playCard'],
          uses: 2,
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some(
        (diag) =>
          diag.code === 'FREE_OPERATION_GRANT_OVERLAP_AMBIGUOUS'
          && diag.path === 'eventDecks[0].cards[0].unshaded.freeOperationGrants[0]',
      ),
      true,
    );
    assert.equal(
      diagnostics.some(
        (diag) =>
          diag.code === 'FREE_OPERATION_GRANT_OVERLAP_AMBIGUOUS'
          && diag.path === 'eventDecks[0].cards[0].unshaded.freeOperationGrants[1]',
      ),
      true,
    );
  });

  it('accepts contract-equivalent duplicate event freeOperationGrants', () => {
    const def = withEventCardSideConfig({
      freeOperationGrants: [
        {
          seat: '0',
          sequence: { batch: 'duplicate-a', step: 0 },
          operationClass: 'operation',
          actionIds: ['playCard'],
          completionPolicy: 'required',
          outcomePolicy: 'mustChangeGameplayState',
          postResolutionTurnFlow: 'resumeCardFlow',
        },
        {
          seat: '0',
          sequence: { batch: 'duplicate-b', step: 0 },
          operationClass: 'operation',
          actionIds: ['playCard'],
          completionPolicy: 'required',
          outcomePolicy: 'mustChangeGameplayState',
          postResolutionTurnFlow: 'resumeCardFlow',
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some((diag) => diag.code === 'FREE_OPERATION_GRANT_OVERLAP_AMBIGUOUS'),
      false,
    );
  });

  it('treats omitted uses and explicit uses: 1 as contract-equivalent duplicate event freeOperationGrants', () => {
    const def = withEventCardSideConfig({
      freeOperationGrants: [
        {
          seat: '0',
          sequence: { batch: 'duplicate-uses-a', step: 0 },
          operationClass: 'operation',
          actionIds: ['playCard'],
        },
        {
          seat: '0',
          sequence: { batch: 'duplicate-uses-b', step: 0 },
          operationClass: 'operation',
          actionIds: ['playCard'],
          uses: 1,
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some((diag) => diag.code === 'FREE_OPERATION_GRANT_OVERLAP_AMBIGUOUS'),
      false,
    );
  });

  it('accepts same-batch sequential event freeOperationGrants because they cannot co-issue', () => {
    const def = withEventCardSideConfig({
      freeOperationGrants: [
        {
          seat: '0',
          sequence: { batch: 'ordered', step: 0 },
          operationClass: 'operation',
          actionIds: ['playCard'],
          completionPolicy: 'required',
          postResolutionTurnFlow: 'resumeCardFlow',
        },
        {
          seat: '0',
          sequence: { batch: 'ordered', step: 1 },
          operationClass: 'operation',
          actionIds: ['playCard'],
          completionPolicy: 'required',
          outcomePolicy: 'mustChangeGameplayState',
          postResolutionTurnFlow: 'resumeCardFlow',
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some((diag) => diag.code === 'FREE_OPERATION_GRANT_OVERLAP_AMBIGUOUS'),
      false,
    );
  });

  it('rejects ambiguous overlapping event freeOperationGrants across side and branch issuance scope', () => {
    const def = withEventCardSideConfig({
      freeOperationGrants: [
        {
          seat: '0',
          sequence: { batch: 'cross-scope-side', step: 0 },
          operationClass: 'operation',
          actionIds: ['playCard'],
          uses: 1,
        },
      ],
      branches: [
        {
          id: 'branch-1',
          freeOperationGrants: [
            {
              seat: '0',
              sequence: { batch: 'cross-scope-branch', step: 0 },
              operationClass: 'operation',
              actionIds: ['playCard'],
              uses: 2,
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some(
        (diag) =>
          diag.code === 'FREE_OPERATION_GRANT_OVERLAP_AMBIGUOUS'
          && diag.path === 'eventDecks[0].cards[0].unshaded.freeOperationGrants[0]',
      ),
      true,
    );
    assert.equal(
      diagnostics.some(
        (diag) =>
          diag.code === 'FREE_OPERATION_GRANT_OVERLAP_AMBIGUOUS'
          && diag.path === 'eventDecks[0].cards[0].unshaded.branches[0].freeOperationGrants[0]',
      ),
      true,
    );
  });

  it('accepts side effect-issued capture plus branch effect-issued require when the selected branch scope matches runtime execution', () => {
    const def = withEventCardSideConfig({
      effects: [
        {
          grantFreeOperation: {
            seat: '0',
            sequence: { batch: 'ctx-effect-branch-chain', step: 0 },
            operationClass: 'operation',
            actionIds: ['playCard'],
            sequenceContext: { captureMoveZoneCandidatesAs: 'selected-space' },
          },
        },
      ],
      branches: [
        {
          id: 'branch-1',
          effects: [
            {
              grantFreeOperation: {
                seat: '0',
                sequence: { batch: 'ctx-effect-branch-chain', step: 1 },
                operationClass: 'operation',
                actionIds: ['playCard'],
                sequenceContext: { requireMoveZoneCandidatesFrom: 'selected-space' },
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some((diag) => diag.code.startsWith('FREE_OPERATION_SEQUENCE_CONTEXT_REQUIRE_CAPTURE_')),
      false,
    );
  });

  it('rejects effect-issued require in if.else when matching capture exists only in sibling if.then', () => {
    const def = withEventCardSideConfig({
      effects: [
        {
          if: {
            when: { op: '==', left: 1, right: 1 },
            then: [
              {
                grantFreeOperation: {
                  seat: '0',
                  sequence: { batch: 'ctx-effect-if-branch-chain', step: 0 },
                  operationClass: 'operation',
                  actionIds: ['playCard'],
                  sequenceContext: { captureMoveZoneCandidatesAs: 'selected-space' },
                },
              },
            ],
            else: [
              {
                grantFreeOperation: {
                  seat: '0',
                  sequence: { batch: 'ctx-effect-if-branch-chain', step: 1 },
                  operationClass: 'operation',
                  actionIds: ['playCard'],
                  sequenceContext: { requireMoveZoneCandidatesFrom: 'selected-space' },
                },
              },
            ],
          },
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some(
        (diag) =>
          diag.code === 'FREE_OPERATION_SEQUENCE_CONTEXT_REQUIRE_CAPTURE_MISSING'
          && diag.path === 'eventDecks[0].cards[0].unshaded.effects[0].if.else[0].grantFreeOperation.sequenceContext.requireMoveZoneCandidatesFrom',
      ),
      true,
    );
  });

  it('accepts effect-issued capture and require on the same if.then execution path', () => {
    const def = withEventCardSideConfig({
      effects: [
        {
          if: {
            when: { op: '==', left: 1, right: 1 },
            then: [
              {
                grantFreeOperation: {
                  seat: '0',
                  sequence: { batch: 'ctx-effect-if-then-chain', step: 0 },
                  operationClass: 'operation',
                  actionIds: ['playCard'],
                  sequenceContext: { captureMoveZoneCandidatesAs: 'selected-space' },
                },
              },
              {
                grantFreeOperation: {
                  seat: '0',
                  sequence: { batch: 'ctx-effect-if-then-chain', step: 1 },
                  operationClass: 'operation',
                  actionIds: ['playCard'],
                  sequenceContext: { requireMoveZoneCandidatesFrom: 'selected-space' },
                },
              },
            ],
          },
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some((diag) => diag.code.startsWith('FREE_OPERATION_SEQUENCE_CONTEXT_REQUIRE_CAPTURE_')),
      false,
    );
  });

  it('rejects same-batch cross-step sequence context under implementWhatCanInOrder for effect-issued grants', () => {
    const def = withEventCardSideConfig({
      effects: [
        {
          if: {
            when: { op: '==', left: 1, right: 1 },
            then: [
              {
                grantFreeOperation: {
                  seat: '0',
                  sequence: { batch: 'ctx-effect-skip-chain', step: 0, progressionPolicy: 'implementWhatCanInOrder' },
                  operationClass: 'operation',
                  actionIds: ['playCard'],
                  sequenceContext: { captureMoveZoneCandidatesAs: 'selected-space' },
                },
              },
              {
                grantFreeOperation: {
                  seat: '0',
                  sequence: { batch: 'ctx-effect-skip-chain', step: 1, progressionPolicy: 'implementWhatCanInOrder' },
                  operationClass: 'operation',
                  actionIds: ['playCard'],
                  sequenceContext: { requireMoveZoneCandidatesFrom: 'selected-space' },
                },
              },
            ],
          },
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some(
        (diag) =>
          diag.code === 'FREE_OPERATION_GRANT_SKIP_CAPABLE_CROSS_STEP_CONTEXT'
          && diag.path === 'eventDecks[0].cards[0].unshaded.effects[0].if.then[1].grantFreeOperation.sequenceContext.requireMoveZoneCandidatesFrom',
      ),
      true,
    );
  });

  it('accepts effect-issued capture and require on the same forEach.effects execution path', () => {
    const def = withEventCardSideConfig({
      effects: [
        {
          forEach: {
            bind: '$player',
            over: { query: 'players' },
            effects: [
              {
                grantFreeOperation: {
                  seat: '0',
                  sequence: { batch: 'ctx-effect-for-each-body-chain', step: 0 },
                  operationClass: 'operation',
                  actionIds: ['playCard'],
                  sequenceContext: { captureMoveZoneCandidatesAs: 'selected-space' },
                },
              },
              {
                grantFreeOperation: {
                  seat: '0',
                  sequence: { batch: 'ctx-effect-for-each-body-chain', step: 1 },
                  operationClass: 'operation',
                  actionIds: ['playCard'],
                  sequenceContext: { requireMoveZoneCandidatesFrom: 'selected-space' },
                },
              },
            ],
          },
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some((diag) => diag.code.startsWith('FREE_OPERATION_SEQUENCE_CONTEXT_REQUIRE_CAPTURE_')),
      false,
    );
  });

  it('rejects effect-issued require in forEach.in when matching capture exists only inside forEach.effects', () => {
    const def = withEventCardSideConfig({
      effects: [
        {
          forEach: {
            bind: '$player',
            countBind: '$count',
            over: { query: 'players' },
            effects: [
              {
                grantFreeOperation: {
                  seat: '0',
                  sequence: { batch: 'ctx-effect-for-each-continuation-chain', step: 0 },
                  operationClass: 'operation',
                  actionIds: ['playCard'],
                  sequenceContext: { captureMoveZoneCandidatesAs: 'selected-space' },
                },
              },
            ],
            in: [
              {
                grantFreeOperation: {
                  seat: '0',
                  sequence: { batch: 'ctx-effect-for-each-continuation-chain', step: 1 },
                  operationClass: 'operation',
                  actionIds: ['playCard'],
                  sequenceContext: { requireMoveZoneCandidatesFrom: 'selected-space' },
                },
              },
            ],
          },
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some(
        (diag) =>
          diag.code === 'FREE_OPERATION_SEQUENCE_CONTEXT_REQUIRE_CAPTURE_MISSING'
          && diag.path === 'eventDecks[0].cards[0].unshaded.effects[0].forEach.in[0].grantFreeOperation.sequenceContext.requireMoveZoneCandidatesFrom',
      ),
      true,
    );
  });

  it('rejects ambiguous overlapping effect-issued free-operation grants on the same execution path', () => {
    const def = withEventCardSideConfig({
      effects: [
        {
          grantFreeOperation: {
            seat: '0',
            sequence: { batch: 'effect-overlap-a', step: 0 },
            operationClass: 'operation',
            actionIds: ['playCard'],
            sequenceContext: { captureMoveZoneCandidatesAs: 'selected-space' },
          },
        },
        {
          grantFreeOperation: {
            seat: '0',
            sequence: { batch: 'effect-overlap-b', step: 0 },
            operationClass: 'operation',
            actionIds: ['playCard'],
            sequenceContext: { captureMoveZoneCandidatesAs: 'selected-space' },
          },
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some(
        (diag) =>
          diag.code === 'FREE_OPERATION_GRANT_OVERLAP_AMBIGUOUS'
          && diag.path === 'eventDecks[0].cards[0].unshaded.effects[0].grantFreeOperation',
      ),
      true,
    );
    assert.equal(
      diagnostics.some(
        (diag) =>
          diag.code === 'FREE_OPERATION_GRANT_OVERLAP_AMBIGUOUS'
          && diag.path === 'eventDecks[0].cards[0].unshaded.effects[1].grantFreeOperation',
      ),
      true,
    );
  });

  it('rejects ambiguous overlapping effect-issued free-operation grants across side and branch execution scope', () => {
    const def = withEventCardSideConfig({
      effects: [
        {
          grantFreeOperation: {
            seat: '0',
            sequence: { batch: 'effect-side-branch-overlap-a', step: 0 },
            operationClass: 'operation',
            actionIds: ['playCard'],
            sequenceContext: { captureMoveZoneCandidatesAs: 'selected-space' },
          },
        },
      ],
      branches: [
        {
          id: 'branch-1',
          effects: [
            {
              grantFreeOperation: {
                seat: '0',
                sequence: { batch: 'effect-side-branch-overlap-b', step: 0 },
                operationClass: 'operation',
                actionIds: ['playCard'],
                sequenceContext: { captureMoveZoneCandidatesAs: 'selected-space' },
              },
            },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some(
        (diag) =>
          diag.code === 'FREE_OPERATION_GRANT_OVERLAP_AMBIGUOUS'
          && diag.path === 'eventDecks[0].cards[0].unshaded.effects[0].grantFreeOperation',
      ),
      true,
    );
    assert.equal(
      diagnostics.some(
        (diag) =>
          diag.code === 'FREE_OPERATION_GRANT_OVERLAP_AMBIGUOUS'
          && diag.path === 'eventDecks[0].cards[0].unshaded.branches[0].effects[0].grantFreeOperation',
      ),
      true,
    );
  });

  it('accepts overlapping-looking effect-issued free-operation grants when they are on mutually exclusive if branches', () => {
    const def = withEventCardSideConfig({
      effects: [
        {
          if: {
            when: { op: '==', left: 1, right: 1 },
            then: [
              {
                grantFreeOperation: {
                  seat: '0',
                  sequence: { batch: 'effect-exclusive-then', step: 0 },
                  operationClass: 'operation',
                  actionIds: ['playCard'],
                  sequenceContext: { captureMoveZoneCandidatesAs: 'selected-space' },
                },
              },
            ],
            else: [
              {
                grantFreeOperation: {
                  seat: '0',
                  sequence: { batch: 'effect-exclusive-else', step: 0 },
                  operationClass: 'operation',
                  actionIds: ['playCard'],
                  sequenceContext: { captureMoveZoneCandidatesAs: 'selected-space' },
                },
              },
            ],
          },
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some((diag) => diag.code === 'FREE_OPERATION_GRANT_OVERLAP_AMBIGUOUS'),
      false,
    );
  });

  it('rejects sequence-context grants inside evaluateSubset.compute because the scope is non-persistent', () => {
    const def = withEventCardSideConfig({
      effects: [
        {
          evaluateSubset: {
            source: { query: 'players' },
            subsetSize: 1,
            subsetBind: '$subset',
            compute: [
              {
                grantFreeOperation: {
                  seat: '0',
                  sequence: { batch: 'ctx-effect-evaluate-subset-compute-chain', step: 0 },
                  operationClass: 'operation',
                  actionIds: ['playCard'],
                  sequenceContext: { captureMoveZoneCandidatesAs: 'selected-space' },
                },
              },
            ],
            scoreExpr: 1,
            resultBind: '$score',
            in: [],
          },
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some(
        (diag) =>
          diag.code === 'EFFECT_GRANT_FREE_OPERATION_SEQUENCE_CONTEXT_SCOPE_UNSUPPORTED'
          && diag.path === 'eventDecks[0].cards[0].unshaded.effects[0].evaluateSubset.compute[0].grantFreeOperation.sequenceContext',
      ),
      true,
    );
  });

  it('rejects nested sequence-context grants inside evaluateSubset.compute descendants', () => {
    const def = withEventCardSideConfig({
      effects: [
        {
          evaluateSubset: {
            source: { query: 'players' },
            subsetSize: 1,
            subsetBind: '$subset',
            compute: [
              {
                if: {
                  when: { op: '==', left: 1, right: 1 },
                  then: [
                    {
                      grantFreeOperation: {
                        seat: '0',
                        sequence: { batch: 'ctx-effect-evaluate-subset-compute-nested-chain', step: 0 },
                        operationClass: 'operation',
                        actionIds: ['playCard'],
                        sequenceContext: { captureMoveZoneCandidatesAs: 'selected-space' },
                      },
                    },
                  ],
                },
              },
            ],
            scoreExpr: 1,
            resultBind: '$score',
            in: [],
          },
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some(
        (diag) =>
          diag.code === 'EFFECT_GRANT_FREE_OPERATION_SEQUENCE_CONTEXT_SCOPE_UNSUPPORTED'
          && diag.path
            === 'eventDecks[0].cards[0].unshaded.effects[0].evaluateSubset.compute[0].if.then[0].grantFreeOperation.sequenceContext',
      ),
      true,
    );
  });

  it('accepts nested sequence-context grants inside evaluateSubset.in descendants', () => {
    const def = withEventCardSideConfig({
      effects: [
        {
          evaluateSubset: {
            source: { query: 'players' },
            subsetSize: 1,
            subsetBind: '$subset',
            compute: [],
            scoreExpr: 1,
            resultBind: '$score',
            in: [
              {
                if: {
                  when: { op: '==', left: 1, right: 1 },
                  then: [
                    {
                      grantFreeOperation: {
                        seat: '0',
                        sequence: { batch: 'ctx-effect-evaluate-subset-in-nested-chain', step: 0 },
                        operationClass: 'operation',
                        actionIds: ['playCard'],
                        sequenceContext: { captureMoveZoneCandidatesAs: 'selected-space' },
                      },
                    },
                    {
                      grantFreeOperation: {
                        seat: '0',
                        sequence: { batch: 'ctx-effect-evaluate-subset-in-nested-chain', step: 1 },
                        operationClass: 'operation',
                        actionIds: ['playCard'],
                        sequenceContext: { requireMoveZoneCandidatesFrom: 'selected-space' },
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      ],
    });

    const diagnostics = validateGameDef(def);
    assert.equal(
      diagnostics.some((diag) => diag.code === 'EFFECT_GRANT_FREE_OPERATION_SEQUENCE_CONTEXT_SCOPE_UNSUPPORTED'),
      false,
    );
    assert.equal(
      diagnostics.some((diag) => diag.code.startsWith('FREE_OPERATION_SEQUENCE_CONTEXT_REQUIRE_CAPTURE_')),
      false,
    );
  });
});

describe('validated GameDef boundary', () => {
  it('rejects card-driven turnFlow definitions missing actionClassByActionId', () => {
    const valid = withCardDrivenTurnFlow(createValidGameDef(), { US: 'US', ARVN: 'ARVN' }, ['US', 'ARVN']);
    const turnOrder = valid.turnOrder;
    if (turnOrder === undefined || turnOrder.type !== 'cardDriven') {
      throw new Error('Expected cardDriven turn order in validation fixture.');
    }

    const turnFlowWithoutActionClassMap = Object.fromEntries(
      Object.entries(turnOrder.config.turnFlow).filter(([key]) => key !== 'actionClassByActionId'),
    ) as typeof turnOrder.config.turnFlow;
    const invalid: GameDef = {
      ...valid,
      turnOrder: {
        ...turnOrder,
        config: {
          ...turnOrder.config,
          turnFlow: turnFlowWithoutActionClassMap as typeof turnOrder.config.turnFlow,
        },
      },
    };

    const result = validateGameDefBoundary(invalid);
    assert.equal(result.gameDef, null);
    assert.ok(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'TURN_FLOW_REQUIRED_KEY_MISSING'
          && diagnostic.path === 'turnOrder.config.turnFlow.actionClassByActionId',
      ),
    );
  });

  it('brands only when validation has no errors and caches the branded identity', () => {
    const valid = createValidGameDef();

    assert.equal(isValidatedGameDef(valid), false);
    const first = validateGameDefBoundary(valid);
    assert.notEqual(first.gameDef, null);
    assert.equal(first.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
    assert.equal(isValidatedGameDef(valid), true);

    const second = validateGameDefBoundary(valid);
    assert.equal(second.gameDef, first.gameDef);
    assert.deepEqual(second.diagnostics, []);
  });

  it('does not brand invalid definitions', () => {
    const invalid = asTaggedGameDef({
      ...createValidGameDef(),
      actions: [
        {
          ...createValidGameDef().actions[0],
          phase: ['missing-phase'],
        },
      ],
    });

    const result = validateGameDefBoundary(invalid);
    assert.equal(result.gameDef, null);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), true);
    assert.equal(isValidatedGameDef(invalid), false);
  });

  it('rejects duplicate limit IDs within an action', () => {
    const base = createValidGameDef();
    const invalid = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          limits: [
            { id: 'playCard::turn::0', scope: 'turn', max: 1 },
            { id: 'playCard::turn::0', scope: 'turn', max: 2 },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(invalid);
    const duplicateDiag = diagnostics.find((d) => d.code === 'DUPLICATE_LIMIT_ID');
    assert.ok(duplicateDiag, 'expected DUPLICATE_LIMIT_ID diagnostic');
    assert.equal(duplicateDiag.severity, 'error');
    assert.match(duplicateDiag.path, /actions\[0\]\.limits\[1\]\.id/);
  });

  it('rejects non-canonical limit IDs', () => {
    const base = createValidGameDef();
    const invalid = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          limits: [
            { id: 'wrong-format', scope: 'turn', max: 1 },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(invalid);
    const nonCanonicalDiag = diagnostics.find((d) => d.code === 'NON_CANONICAL_LIMIT_ID');
    assert.ok(nonCanonicalDiag, 'expected NON_CANONICAL_LIMIT_ID diagnostic');
    assert.equal(nonCanonicalDiag.severity, 'error');
    assert.match(nonCanonicalDiag.path, /actions\[0\]\.limits\[0\]\.id/);
    assert.match(nonCanonicalDiag.message, /playCard::turn::0/);
  });

  it('accepts valid canonical limit IDs', () => {
    const base = createValidGameDef();
    const valid = asTaggedGameDef({
      ...base,
      actions: [
        {
          ...base.actions[0],
          limits: [
            { id: 'playCard::turn::0', scope: 'turn', max: 1 },
            { id: 'playCard::phase::1', scope: 'phase', max: 2 },
          ],
        },
      ],
    });

    const diagnostics = validateGameDef(valid);
    const limitDiags = diagnostics.filter(
      (d) => d.code === 'DUPLICATE_LIMIT_ID' || d.code === 'NON_CANONICAL_LIMIT_ID',
    );
    assert.equal(limitDiags.length, 0, `unexpected limit diagnostics: ${JSON.stringify(limitDiags)}`);
  });

  it('reads ambiguous multi-profile candidates through the shared lookup helper', () => {
    const source = readKernelSource('src/kernel/validate-gamedef-extensions.ts');

    assert.ok(
      source.includes("import { getActionPipelinesForAction } from './action-pipeline-lookup.js';"),
    );
    assert.ok(
      source.includes('const profilesForAction = getActionPipelinesForAction(def, asActionId(actionId));'),
    );
    assert.doesNotMatch(
      source,
      /\(def\.actionPipelines\s*\?\?\s*\[\]\)\.filter\(\(profile\)\s*=>\s*profile\.actionId\s*===\s*actionId\)/u,
    );
  });
});
