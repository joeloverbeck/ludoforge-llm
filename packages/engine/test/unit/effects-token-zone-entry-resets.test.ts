import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { makeExecutionEffectContext, type EffectContextTestOverrides } from '../helpers/effect-context-test-helpers.js';
import {
  buildAdjacencyGraph,
  applyEffect,
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  createRng,
  createCollector,
  type EffectContext,
  type GameDef,
  type GameState,
  type Token,
  type TokenTypeDef,
  type ZoneDef,
} from '../../src/kernel/index.js';
import { applyZoneEntryResets } from '../../src/kernel/effects-token.js';

// ── Helper: applyZoneEntryResets unit tests ──────────────────────

describe('applyZoneEntryResets', () => {
  const baseToken: Token = {
    id: asTokenId('tok_base_0'),
    type: 'nva-bases',
    props: { tunnel: 'tunneled', faction: 'NVA' },
  };

  const tokenTypeDef: TokenTypeDef = {
    id: 'nva-bases',
    seat: 'nva',
    props: { tunnel: 'string', faction: 'string' },
    onZoneEntry: [
      { match: { zoneKind: 'aux' }, setProps: { tunnel: 'untunneled' } },
    ],
  };

  const auxZoneDef: ZoneDef = {
    id: asZoneId('available-NVA'),
    zoneKind: 'aux',
    owner: 'none',
    visibility: 'public',
    ordering: 'set',
  };

  const boardZoneDef: ZoneDef = {
    id: asZoneId('saigon:none'),
    zoneKind: 'board',
    owner: 'none',
    visibility: 'public',
    ordering: 'set',
    category: 'city',
  };

  it('resets props when destination matches zoneKind', () => {
    const result = applyZoneEntryResets(baseToken, tokenTypeDef, auxZoneDef);
    assert.equal(result.props.tunnel, 'untunneled');
    assert.equal(result.props.faction, 'NVA');
    assert.notEqual(result, baseToken);
  });

  it('returns same token reference when no rule matches', () => {
    const result = applyZoneEntryResets(baseToken, tokenTypeDef, boardZoneDef);
    assert.equal(result, baseToken);
    assert.equal(result.props.tunnel, 'tunneled');
  });

  it('returns same token reference when tokenTypeDef has no onZoneEntry', () => {
    const noRulesTypeDef: TokenTypeDef = {
      id: 'nva-bases',
      props: { tunnel: 'string' },
    };
    const result = applyZoneEntryResets(baseToken, noRulesTypeDef, auxZoneDef);
    assert.equal(result, baseToken);
  });

  it('returns same token reference when tokenTypeDef is undefined', () => {
    const result = applyZoneEntryResets(baseToken, undefined, auxZoneDef);
    assert.equal(result, baseToken);
  });

  it('returns same token reference when destinationZoneDef is undefined', () => {
    const result = applyZoneEntryResets(baseToken, tokenTypeDef, undefined);
    assert.equal(result, baseToken);
  });

  it('matches by category', () => {
    const categoryTypeDef: TokenTypeDef = {
      id: 'test-type',
      props: { status: 'string' },
      onZoneEntry: [
        { match: { category: 'city' }, setProps: { status: 'reset' } },
      ],
    };
    const tokenWithStatus: Token = {
      id: asTokenId('tok_test_0'),
      type: 'test-type',
      props: { status: 'active' },
    };
    const result = applyZoneEntryResets(tokenWithStatus, categoryTypeDef, boardZoneDef);
    assert.equal(result.props.status, 'reset');
  });

  it('requires both zoneKind AND category to match when both specified', () => {
    const bothTypeDef: TokenTypeDef = {
      id: 'test-type',
      props: { status: 'string' },
      onZoneEntry: [
        { match: { zoneKind: 'board', category: 'city' }, setProps: { status: 'reset' } },
      ],
    };
    const tokenWithStatus: Token = {
      id: asTokenId('tok_test_0'),
      type: 'test-type',
      props: { status: 'active' },
    };

    // Both match
    const result1 = applyZoneEntryResets(tokenWithStatus, bothTypeDef, boardZoneDef);
    assert.equal(result1.props.status, 'reset');

    // zoneKind matches but category doesn't
    const noCategoryZone: ZoneDef = {
      id: asZoneId('field:none'),
      zoneKind: 'board',
      owner: 'none',
      visibility: 'public',
      ordering: 'set',
    };
    const result2 = applyZoneEntryResets(tokenWithStatus, bothTypeDef, noCategoryZone);
    assert.equal(result2, tokenWithStatus);
  });

  it('ignores setProps keys not declared in tokenTypeDef.props', () => {
    const unknownPropTypeDef: TokenTypeDef = {
      id: 'test-type',
      props: { tunnel: 'string' },
      onZoneEntry: [
        { match: { zoneKind: 'aux' }, setProps: { tunnel: 'untunneled', nonExistent: 'value' } },
      ],
    };
    const tok: Token = {
      id: asTokenId('tok_test_0'),
      type: 'test-type',
      props: { tunnel: 'tunneled' },
    };
    const result = applyZoneEntryResets(tok, unknownPropTypeDef, auxZoneDef);
    assert.equal(result.props.tunnel, 'untunneled');
    assert.equal(result.props.nonExistent, undefined);
  });

  it('applies all matching rules (not just first)', () => {
    const multiRuleTypeDef: TokenTypeDef = {
      id: 'test-type',
      props: { a: 'string', b: 'string' },
      onZoneEntry: [
        { match: { zoneKind: 'aux' }, setProps: { a: 'reset-a' } },
        { match: { zoneKind: 'aux' }, setProps: { b: 'reset-b' } },
      ],
    };
    const tok: Token = {
      id: asTokenId('tok_test_0'),
      type: 'test-type',
      props: { a: 'original', b: 'original' },
    };
    const result = applyZoneEntryResets(tok, multiRuleTypeDef, auxZoneDef);
    assert.equal(result.props.a, 'reset-a');
    assert.equal(result.props.b, 'reset-b');
  });

  it('does not mutate original token', () => {
    const originalProps = { ...baseToken.props };
    applyZoneEntryResets(baseToken, tokenTypeDef, auxZoneDef);
    assert.deepEqual(baseToken.props, originalProps);
  });

  it('returns same token when prop already has target value', () => {
    const alreadyReset: Token = {
      id: asTokenId('tok_base_0'),
      type: 'nva-bases',
      props: { tunnel: 'untunneled', faction: 'NVA' },
    };
    const result = applyZoneEntryResets(alreadyReset, tokenTypeDef, auxZoneDef);
    assert.equal(result, alreadyReset);
  });
});

// ── Integration: moveToken with zone-entry resets ─────────────────

describe('moveToken with onZoneEntry resets', () => {
  const makeDef = (overrides?: Partial<GameDef>): GameDef => ({
    metadata: { id: 'zone-entry-reset-test', players: { min: 1, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [
      { id: asZoneId('board:none'), zoneKind: 'board', owner: 'none', visibility: 'public', ordering: 'set' },
      { id: asZoneId('available:none'), zoneKind: 'aux', owner: 'none', visibility: 'public', ordering: 'set' },
      { id: asZoneId('out-of-play:none'), zoneKind: 'aux', owner: 'none', visibility: 'public', ordering: 'set' },
    ],
    tokenTypes: [
      {
        id: 'base',
        props: { tunnel: 'string' },
        transitions: [
          { prop: 'tunnel', from: 'untunneled', to: 'tunneled' },
          { prop: 'tunnel', from: 'tunneled', to: 'untunneled' },
        ],
        onZoneEntry: [
          { match: { zoneKind: 'aux' }, setProps: { tunnel: 'untunneled' } },
        ],
      },
      {
        id: 'troop',
        props: {},
      },
    ],
    setup: [],
    turnStructure: { phases: [] },
    actions: [],
    triggers: [],
    terminal: { conditions: [] },
    ...overrides,
  });

  const tunneledBase: Token = { id: asTokenId('tok_base_0'), type: 'base', props: { tunnel: 'tunneled' } };
  const untunneledBase: Token = { id: asTokenId('tok_base_1'), type: 'base', props: { tunnel: 'untunneled' } };
  const troop: Token = { id: asTokenId('tok_troop_0'), type: 'troop', props: {} };

  const makeState = (tokens?: Partial<Record<string, readonly Token[]>>): GameState => ({
    globalVars: {},
    perPlayerVars: {},
    zoneVars: {},
    playerCount: 2,
    zones: {
      'board:none': [tunneledBase],
      'available:none': [],
      'out-of-play:none': [],
      ...tokens,
    },
    nextTokenOrdinal: 10,
    currentPhase: asPhaseId('main'),
    activePlayer: asPlayerId(0),
    turnCount: 1,
    rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
    stateHash: 0n,
    _runningHash: 0n,
    actionUsage: {},
    turnOrderState: { type: 'roundRobin' },
    markers: {},
  });

  const makeCtx = (overrides?: EffectContextTestOverrides): EffectContext => {
    const def = overrides?.def ?? makeDef();
    return makeExecutionEffectContext({
      def,
      adjacencyGraph: buildAdjacencyGraph([]),
      state: overrides?.state ?? makeState(),
      rng: createRng(42n),
      activePlayer: asPlayerId(0),
      actorPlayer: asPlayerId(0),
      bindings: {},
      moveParams: {},
      collector: createCollector(),
      ...overrides,
    });
  };

  it('resets tunneled base when moved to aux zone', () => {
    const ctx = makeCtx({ bindings: { $token: tunneledBase } });
    const result = applyEffect(
      { moveToken: { token: '$token', from: 'board:none', to: 'available:none' } },
      ctx,
    );
    const movedToken = result.state.zones['available:none']?.[0];
    assert.ok(movedToken !== undefined);
    assert.equal(movedToken.props.tunnel, 'untunneled');
  });

  it('does not reset when moved to board zone', () => {
    const state = makeState({
      'board:none': [],
      'available:none': [tunneledBase],
    });
    const ctx = makeCtx({ state, bindings: { $token: tunneledBase } });
    const result = applyEffect(
      { moveToken: { token: '$token', from: 'available:none', to: 'board:none' } },
      ctx,
    );
    const movedToken = result.state.zones['board:none']?.[0];
    assert.ok(movedToken !== undefined);
    assert.equal(movedToken.props.tunnel, 'tunneled');
  });

  it('resets when moved to out-of-play zone', () => {
    const ctx = makeCtx({ bindings: { $token: tunneledBase } });
    const result = applyEffect(
      { moveToken: { token: '$token', from: 'board:none', to: 'out-of-play:none' } },
      ctx,
    );
    const movedToken = result.state.zones['out-of-play:none']?.[0];
    assert.ok(movedToken !== undefined);
    assert.equal(movedToken.props.tunnel, 'untunneled');
  });

  it('does not change untunneled base', () => {
    const state = makeState({ 'board:none': [untunneledBase] });
    const ctx = makeCtx({ state, bindings: { $token: untunneledBase } });
    const result = applyEffect(
      { moveToken: { token: '$token', from: 'board:none', to: 'available:none' } },
      ctx,
    );
    const movedToken = result.state.zones['available:none']?.[0];
    assert.ok(movedToken !== undefined);
    assert.equal(movedToken.props.tunnel, 'untunneled');
  });

  it('does not error for token type without onZoneEntry', () => {
    const state = makeState({ 'board:none': [troop] });
    const ctx = makeCtx({ state, bindings: { $token: troop } });
    const result = applyEffect(
      { moveToken: { token: '$token', from: 'board:none', to: 'available:none' } },
      ctx,
    );
    const movedToken = result.state.zones['available:none']?.[0];
    assert.ok(movedToken !== undefined);
    assert.equal(movedToken.id, troop.id);
    assert.deepEqual(movedToken.props, {});
  });

  it('emits setTokenProp trace for reset props', () => {
    const collector = createCollector({ trace: true });
    const ctx = makeCtx({ bindings: { $token: tunneledBase }, collector });
    applyEffect(
      { moveToken: { token: '$token', from: 'board:none', to: 'available:none' } },
      ctx,
    );
    const traces = collector.trace;
    assert.ok(traces !== null);
    const propTraces = traces.filter(
      (t) => t.kind === 'setTokenProp' && t.tokenId === 'tok_base_0',
    );
    assert.equal(propTraces.length, 1);
    const propTrace = propTraces[0]!;
    assert.equal(propTrace.kind, 'setTokenProp');
    if (propTrace.kind === 'setTokenProp') {
      assert.equal(propTrace.prop, 'tunnel');
      assert.equal(propTrace.oldValue, 'tunneled');
      assert.equal(propTrace.newValue, 'untunneled');
    }
  });
});
