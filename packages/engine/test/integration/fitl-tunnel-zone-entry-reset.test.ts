import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
import {
  applyEffect,
  asPlayerId,
  asTokenId,
  buildAdjacencyGraph,
  createCollector,
  createRng,
  initialState,
  type Token,
} from '../../src/kernel/index.js';
import { makeExecutionEffectContext } from '../helpers/effect-context-test-helpers.js';
import { eff } from '../helpers/effect-tag-helper.js';

describe('FITL tunnel zone-entry reset (integration)', () => {
  const compiled = compileProductionSpec();
  const gameDef = compiled.compiled.gameDef;

  it('compiled GameDef has onZoneEntry rules on nva-bases and vc-bases', () => {
    const nvaBases = gameDef.tokenTypes.find((tt) => tt.id === 'nva-bases');
    assert.ok(nvaBases !== undefined, 'nva-bases token type should exist');
    assert.ok(nvaBases.onZoneEntry !== undefined, 'nva-bases should have onZoneEntry');
    assert.ok(nvaBases.onZoneEntry.length > 0, 'nva-bases should have at least one onZoneEntry rule');
    assert.deepEqual(nvaBases.onZoneEntry[0]!.match, { zoneKind: 'aux' });
    assert.deepEqual(nvaBases.onZoneEntry[0]!.setProps, { tunnel: 'untunneled' });

    const vcBases = gameDef.tokenTypes.find((tt) => tt.id === 'vc-bases');
    assert.ok(vcBases !== undefined, 'vc-bases token type should exist');
    assert.ok(vcBases.onZoneEntry !== undefined, 'vc-bases should have onZoneEntry');
    assert.ok(vcBases.onZoneEntry.length > 0);
  });

  it('off-board zones have zoneKind: aux', () => {
    const auxZoneIds = [
      'available-US:none', 'available-ARVN:none', 'available-NVA:none', 'available-VC:none',
      'out-of-play-US:none', 'out-of-play-ARVN:none', 'out-of-play-NVA:none', 'out-of-play-VC:none',
      'casualties-US:none',
    ];
    for (const zoneId of auxZoneIds) {
      const zoneDef = gameDef.zones.find((z) => z.id === zoneId);
      assert.ok(zoneDef !== undefined, `Zone ${zoneId} should exist`);
      assert.equal(zoneDef.zoneKind, 'aux', `Zone ${zoneId} should have zoneKind: aux`);
    }
  });

  it('moves tunneled NVA base to Available and resets tunnel prop', () => {
    const tunneledNvaBase: Token = {
      id: asTokenId('tok_nva-bases_test'),
      type: 'nva-bases',
      props: { faction: 'NVA', type: 'base', tunnel: 'tunneled' },
    };

    const initResult = initialState(gameDef, 42);
    const zoneTokens = { ...initResult.state.zones };
    zoneTokens['saigon:none'] = [...(zoneTokens['saigon:none'] ?? []), tunneledNvaBase];
    const testState = { ...initResult.state, zones: zoneTokens };

    const adjacencyGraph = buildAdjacencyGraph(gameDef.zones);
    const ctx = makeExecutionEffectContext({
      def: gameDef,
      adjacencyGraph,
      state: testState,
      rng: createRng(42n),
      activePlayer: asPlayerId(0),
      actorPlayer: asPlayerId(0),
      bindings: { $token: tunneledNvaBase },
      moveParams: {},
      collector: createCollector(),
    });

    const result = applyEffect(
      eff({ moveToken: { token: '$token', from: 'saigon:none', to: 'available-NVA:none' } }),
      ctx,
    );

    const movedToken = result.state.zones['available-NVA:none']?.find(
      (t) => t.id === tunneledNvaBase.id,
    );
    assert.ok(movedToken !== undefined, 'Token should be in available-NVA:none');
    assert.equal(movedToken.props.tunnel, 'untunneled', 'Tunnel should be reset to untunneled');
    assert.equal(movedToken.props.faction, 'NVA', 'Other props should be preserved');
  });

  it('moves tunneled VC base to out-of-play and resets tunnel prop', () => {
    const tunneledVcBase: Token = {
      id: asTokenId('tok_vc-bases_test'),
      type: 'vc-bases',
      props: { faction: 'VC', type: 'base', tunnel: 'tunneled' },
    };

    const initResult = initialState(gameDef, 42);
    const zoneTokens = { ...initResult.state.zones };
    zoneTokens['tay-ninh:none'] = [...(zoneTokens['tay-ninh:none'] ?? []), tunneledVcBase];
    const testState = { ...initResult.state, zones: zoneTokens };

    const adjacencyGraph = buildAdjacencyGraph(gameDef.zones);
    const ctx = makeExecutionEffectContext({
      def: gameDef,
      adjacencyGraph,
      state: testState,
      rng: createRng(42n),
      activePlayer: asPlayerId(0),
      actorPlayer: asPlayerId(0),
      bindings: { $token: tunneledVcBase },
      moveParams: {},
      collector: createCollector(),
    });

    const result = applyEffect(
      eff({ moveToken: { token: '$token', from: 'tay-ninh:none', to: 'out-of-play-VC:none' } }),
      ctx,
    );

    const movedToken = result.state.zones['out-of-play-VC:none']?.find(
      (t) => t.id === tunneledVcBase.id,
    );
    assert.ok(movedToken !== undefined, 'Token should be in out-of-play-VC:none');
    assert.equal(movedToken.props.tunnel, 'untunneled', 'Tunnel should be reset');
  });

  it('does not change troop (no tunnel dimension) when moved to aux zone', () => {
    const troop: Token = {
      id: asTokenId('tok_us-troops_test'),
      type: 'us-troops',
      props: { faction: 'US', type: 'troop', activity: 'active' },
    };

    const initResult = initialState(gameDef, 42);
    const zoneTokens = { ...initResult.state.zones };
    zoneTokens['saigon:none'] = [...(zoneTokens['saigon:none'] ?? []), troop];
    const testState = { ...initResult.state, zones: zoneTokens };

    const adjacencyGraph = buildAdjacencyGraph(gameDef.zones);
    const ctx = makeExecutionEffectContext({
      def: gameDef,
      adjacencyGraph,
      state: testState,
      rng: createRng(42n),
      activePlayer: asPlayerId(0),
      actorPlayer: asPlayerId(0),
      bindings: { $token: troop },
      moveParams: {},
      collector: createCollector(),
    });

    const result = applyEffect(
      eff({ moveToken: { token: '$token', from: 'saigon:none', to: 'available-US:none' } }),
      ctx,
    );

    const movedToken = result.state.zones['available-US:none']?.find(
      (t) => t.id === troop.id,
    );
    assert.ok(movedToken !== undefined);
    assert.equal(movedToken.props.activity, 'active', 'Activity prop should be unchanged');
  });
});
