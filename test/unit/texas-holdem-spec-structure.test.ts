import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { Ajv } from 'ajv';

import { validateDataAssetEnvelope } from '../../src/kernel/data-assets.js';
import { assertNoErrors, assertNoDiagnostics } from '../helpers/diagnostic-helpers.js';
import { compileTexasProductionSpec, readTexasProductionSpec } from '../helpers/production-spec-helpers.js';
import { parseGameSpec } from '../../src/cnl/index.js';

describe('texas hold\'em spec structure', () => {
  it('parses the structural fragments and validates data-asset envelopes', () => {
    const markdown = readTexasProductionSpec();
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
        'find-next-non-eliminated',
        'find-next-to-act',
        'post-forced-bets-and-set-preflop-actor',
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
      const validated = validateDataAssetEnvelope(
        {
          id: asset.id,
          kind: asset.kind,
          payload: asset.payload,
        },
        {
        expectedKinds: ['map', 'scenario', 'pieceCatalog'],
        pathPrefix: `doc.dataAssets.${index}`,
        },
      );
      assert.equal(validated.diagnostics.length, 0);
      assert.ok(validated.asset !== null);
    });

    const scenario = dataAssets.find((asset) => asset.id === 'tournament-standard');
    assert.ok(scenario);
    assert.equal(scenario.kind, 'scenario');

    const payload = scenario.payload as {
      readonly pieceCatalogAssetId: string;
      readonly factionPools?: readonly {
        readonly faction: string;
        readonly availableZoneId: string;
        readonly outOfPlayZoneId?: string;
      }[];
      readonly settings?: { readonly startingChips?: number };
    };

    assert.equal(payload.pieceCatalogAssetId, 'standard-52-deck');
    assert.deepEqual(payload.factionPools, [{ faction: 'neutral', availableZoneId: 'deck:none', outOfPlayZoneId: 'muck:none' }]);
    assert.equal(payload.settings?.startingChips, 1000);
    assert.equal(Array.isArray((scenario as { readonly tableContracts?: unknown }).tableContracts), true);

    assert.ok(Array.isArray(parsed.doc.setup));
    assert.equal((parsed.doc.setup ?? []).length > 0, true);

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

  it('compiles with zero diagnostics', () => {
    const { parsed, validatorDiagnostics: validated, compiled } = compileTexasProductionSpec();
    assertNoErrors(parsed);
    assert.equal(validated.length, 0);
    assertNoDiagnostics(compiled, parsed.sourceMap);
    assert.notEqual(compiled.gameDef, null);
  });

  it('materializes expected compiled zone topology for Texas hold\'em', () => {
    const { parsed, validatorDiagnostics: validated, compiled } = compileTexasProductionSpec();
    assertNoErrors(parsed);
    assert.equal(validated.length, 0);
    assertNoDiagnostics(compiled, parsed.sourceMap);
    assert.notEqual(compiled.gameDef, null);

    const zoneBases = new Map<string, { owner: string; visibility: string; ordering: string; count: number }>();
    for (const zone of compiled.gameDef!.zones) {
      const base = zone.id.split(':')[0] ?? zone.id;
      const current = zoneBases.get(base);
      if (current === undefined) {
        zoneBases.set(base, { owner: zone.owner, visibility: zone.visibility, ordering: zone.ordering, count: 1 });
        continue;
      }
      assert.equal(zone.owner, current.owner);
      assert.equal(zone.visibility, current.visibility);
      assert.equal(zone.ordering, current.ordering);
      current.count += 1;
    }

    assert.deepEqual([...zoneBases.keys()], ['deck', 'burn', 'community', 'hand', 'muck']);
    assert.deepEqual(zoneBases.get('deck'), { owner: 'none', visibility: 'hidden', ordering: 'stack', count: 1 });
    assert.deepEqual(zoneBases.get('burn'), { owner: 'none', visibility: 'hidden', ordering: 'set', count: 1 });
    assert.deepEqual(zoneBases.get('community'), { owner: 'none', visibility: 'public', ordering: 'queue', count: 1 });
    assert.deepEqual(zoneBases.get('hand'), { owner: 'player', visibility: 'owner', ordering: 'set', count: 10 });
    assert.deepEqual(zoneBases.get('muck'), { owner: 'none', visibility: 'hidden', ordering: 'set', count: 1 });
  });

  it('compiles expected per-player and global variable contracts', () => {
    const { parsed, validatorDiagnostics: validated, compiled } = compileTexasProductionSpec();
    assertNoErrors(parsed);
    assert.equal(validated.length, 0);
    assertNoDiagnostics(compiled, parsed.sourceMap);
    assert.notEqual(compiled.gameDef, null);

    const pvars = compiled.gameDef!.perPlayerVars;
    const gvars = compiled.gameDef!.globalVars;
    assert.deepEqual(
      pvars.map((variable) => variable.name),
      ['chipStack', 'streetBet', 'totalBet', 'handActive', 'allIn', 'eliminated', 'seatIndex', 'showdownScore'],
    );
    assert.deepEqual(
      gvars.map((variable) => variable.name),
      [
        'pot',
        'currentBet',
        'lastRaiseSize',
        'dealerSeat',
        'smallBlind',
        'bigBlind',
        'ante',
        'blindLevel',
        'handsPlayed',
        'handPhase',
        'activePlayers',
        'playersInHand',
        'actingPosition',
        'bettingClosed',
        'oddChipRemainder',
      ],
    );
  });

  it('keeps compiled actions, phases, and terminal contract aligned to tournament flow', () => {
    const { parsed, validatorDiagnostics: validated, compiled } = compileTexasProductionSpec();
    assertNoErrors(parsed);
    assert.equal(validated.length, 0);
    assertNoDiagnostics(compiled, parsed.sourceMap);
    assert.notEqual(compiled.gameDef, null);

    const gameDef = compiled.gameDef!;
    assert.deepEqual(gameDef.actions.map((action) => action.id), ['fold', 'check', 'call', 'raise', 'allIn']);
    assert.deepEqual(gameDef.turnStructure.phases.map((phase) => phase.id), [
      'hand-setup',
      'preflop',
      'flop',
      'turn',
      'river',
      'showdown',
      'hand-cleanup',
    ]);
    assert.equal(gameDef.terminal.conditions.length, 1);
    assert.equal(JSON.stringify(gameDef.terminal.conditions[0]?.when).includes('"var":"activePlayers"'), true);
    assert.equal(JSON.stringify(gameDef.terminal.conditions[0]?.when).includes('"right":1'), true);
  });

  it('lowers macro invocations and emits required Texas effect families', () => {
    const { parsed, validatorDiagnostics: validated, compiled } = compileTexasProductionSpec();
    assertNoErrors(parsed);
    assert.equal(validated.length, 0);
    assertNoDiagnostics(compiled, parsed.sourceMap);
    assert.notEqual(compiled.gameDef, null);

    const serialized = JSON.stringify(compiled.gameDef);
    assert.equal(serialized.includes('"macro":'), false);
    assert.equal(serialized.includes('"reveal":'), true);
    assert.equal(serialized.includes('"evaluateSubset":'), true);
    assert.equal(serialized.includes('"commitResource":'), true);
  });

  it('validates compiled Texas GameDef against schemas/GameDef.schema.json', () => {
    const { parsed, validatorDiagnostics: validated, compiled } = compileTexasProductionSpec();
    assertNoErrors(parsed);
    assert.equal(validated.length, 0);
    assertNoDiagnostics(compiled, parsed.sourceMap);
    assert.notEqual(compiled.gameDef, null);

    const schemaPath = path.join(process.cwd(), 'schemas', 'GameDef.schema.json');
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as Record<string, unknown>;
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(schema);
    assert.equal(validate(compiled.gameDef), true, JSON.stringify(validate.errors, null, 2));
  });

  it('reuses the helper compile cache when the production source hash is unchanged', () => {
    const first = compileTexasProductionSpec();
    const second = compileTexasProductionSpec();
    assert.equal(first, second);
  });

  it('keeps side-pot loops runtime-derived and avoids hardcoded seat ranges', () => {
    const markdown = readTexasProductionSpec();
    const parsed = parseGameSpec(markdown);
    assertNoErrors(parsed);

    const sidePotMacro = parsed.doc.effectMacros?.find((macro) => macro.id === 'side-pot-distribution');
    assert.ok(sidePotMacro);

    const serialized = JSON.stringify(sidePotMacro.effects);
    assert.equal(serialized.includes('"query":"intsInRange","min":1,"max":10'), false);
    assert.equal(serialized.includes('"query":"intsInRange","min":0,"max":9'), false);
    assert.equal(serialized.includes('"var":"activePlayers"'), true);
    assert.equal(serialized.includes('"var":"oddChipRemainder"'), true);
    assert.equal(serialized.includes('"var":"seatIndex"'), false);
  });

  it('encodes blind escalation via scenario schedule rows instead of hardcoded blind constants', () => {
    const markdown = readTexasProductionSpec();
    const parsed = parseGameSpec(markdown);
    assertNoErrors(parsed);

    const escalateBlinds = parsed.doc.effectMacros?.find((macro) => macro.id === 'escalate-blinds');
    assert.ok(escalateBlinds);

    const serialized = JSON.stringify(escalateBlinds.effects);
    assert.equal(serialized.includes('settings.blindSchedule'), true);
    assert.equal(serialized.includes('tournament-standard::settings.blindSchedule'), false);
    assert.equal(serialized.includes('"field":"handsUntilNext"'), true);
    assert.equal(serialized.includes('"field":"sb"'), true);
    assert.equal(serialized.includes('"field":"bb"'), true);
    assert.equal(serialized.includes('"field":"ante"'), true);
    assert.equal(serialized.includes('"cardinality":"exactlyOne"'), true);

    assert.equal(/"var":"smallBlind","value":\d+/.test(serialized), false);
    assert.equal(/"var":"bigBlind","value":\d+/.test(serialized), false);
    assert.equal(/"var":"ante","value":\d+/.test(serialized), false);
  });

  it('derives blind schedule runtime table unique keys for strict exactlyOne validation', () => {
    const { parsed, validatorDiagnostics: validated, compiled } = compileTexasProductionSpec();
    assertNoErrors(parsed);
    assert.equal(validated.length, 0);
    assertNoDiagnostics(compiled, parsed.sourceMap);
    assert.notEqual(compiled.gameDef, null);

    const blindScheduleContract = compiled.gameDef?.tableContracts?.find(
      (contract) => contract.id === 'tournament-standard::settings.blindSchedule',
    );
    assert.ok(blindScheduleContract);
    assert.equal(blindScheduleContract.uniqueBy?.some((tuple) => tuple.length === 1 && tuple[0] === 'level'), true);
    assert.equal(
      blindScheduleContract.constraints?.some(
        (constraint) => constraint.kind === 'contiguousInt' && constraint.field === 'level' && constraint.start === 0 && constraint.step === 1,
      ),
      true,
    );
    assert.equal(
      blindScheduleContract.constraints?.some(
        (constraint) => constraint.kind === 'numericRange' && constraint.field === 'handsUntilNext' && constraint.min === 1,
      ),
      true,
    );
  });
});
