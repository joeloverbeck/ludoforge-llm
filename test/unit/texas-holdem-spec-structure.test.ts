import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { join } from 'node:path';

import { loadGameSpecSource, parseGameSpec } from '../../src/cnl/index.js';
import { validateDataAssetEnvelope } from '../../src/kernel/data-assets.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';

describe('texas hold\'em spec structure', () => {
  it('parses the structural fragments and validates data-asset envelopes', () => {
    const markdown = loadGameSpecSource(join(process.cwd(), 'data', 'games', 'texas-holdem')).markdown;
    const parsed = parseGameSpec(markdown);

    assertNoErrors(parsed);

    assert.equal(parsed.doc.metadata?.id, 'texas-holdem-nlhe-tournament');
    assert.equal(parsed.doc.metadata?.players.min, 2);
    assert.equal(parsed.doc.metadata?.players.max, 10);
    assert.equal(parsed.doc.metadata?.defaultScenarioAssetId, 'tournament-standard');

    const zones = parsed.doc.zones ?? [];
    assert.deepEqual(
      zones.map((zone) => zone.id),
      ['deck', 'burn', 'community', 'hand', 'muck'],
    );

    const dataAssets = parsed.doc.dataAssets;
    assert.ok(dataAssets !== null);
    assert.equal(dataAssets.length, 2);

    const macros = parsed.doc.effectMacros;
    assert.ok(macros !== null);
    assert.deepEqual(
      macros.map((macro) => macro.id),
      [
        'hand-rank-score',
        'collect-forced-bets',
        'deal-community',
        'betting-round-completion',
        'advance-after-betting',
        'side-pot-distribution',
        'eliminate-busted-players',
        'escalate-blinds',
      ],
    );

    const collectForcedBets = macros.find((macro) => macro.id === 'collect-forced-bets');
    assert.ok(collectForcedBets);
    assert.deepEqual(
      collectForcedBets.params.map((param) => ({ name: param.name, type: param.type })),
      [
        { name: 'sbPlayer', type: 'playerSelector' },
        { name: 'bbPlayer', type: 'playerSelector' },
      ],
    );

    const dealCommunity = macros.find((macro) => macro.id === 'deal-community');
    assert.ok(dealCommunity);
    assert.deepEqual(
      dealCommunity.params.map((param) => ({ name: param.name, type: param.type })),
      [{ name: 'count', type: 'number' }],
    );

    dataAssets.forEach((asset, index) => {
      const validated = validateDataAssetEnvelope(asset, {
        expectedKinds: ['map', 'scenario', 'pieceCatalog'],
        pathPrefix: `doc.dataAssets.${index}`,
      });
      assert.equal(validated.diagnostics.length, 0);
      assert.ok(validated.asset !== null);
    });

    const scenario = dataAssets.find((asset) => asset.id === 'tournament-standard');
    assert.ok(scenario);
    assert.equal(scenario.kind, 'scenario');

    const payload = scenario.payload as {
      readonly pieceCatalogAssetId: string;
      readonly settings?: { readonly startingChips?: number };
    };

    assert.equal(payload.pieceCatalogAssetId, 'standard-52-deck');
    assert.equal(payload.settings?.startingChips, 1000);

    assert.deepEqual(
      parsed.doc.turnStructure?.phases.map((phase) => phase.id),
      ['hand-setup', 'preflop', 'flop', 'turn', 'river', 'showdown', 'hand-cleanup'],
    );
    assert.deepEqual(
      parsed.doc.actions?.map((action) => action.id),
      ['fold', 'check', 'call', 'raise', 'allIn'],
    );
    assert.deepEqual((parsed.doc.actions?.[0] as { readonly phase?: unknown })?.phase, ['preflop', 'flop', 'turn', 'river']);

    assert.equal(parsed.doc.terminal?.conditions.length, 1);
    assert.deepEqual(parsed.doc.terminal?.conditions[0]?.result, { type: 'score' });
    assert.equal(parsed.doc.terminal?.scoring?.method, 'highest');
  });
});
