import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { asActionId, asPlayerId, asTokenId, initialState, type GameDef, type GameState, type Token } from '../../src/kernel/index.js';
import { findDeep } from '../helpers/ast-search-helpers.js';
import { applyMoveWithResolvedDecisionIds } from '../helpers/decision-param-helpers.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { clearAllZones } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const makeToken = (id: string, type: string, faction: string, extra?: Record<string, unknown>): Token => ({
  id: asTokenId(id),
  type,
  props: { faction, type, ...extra },
});

const compileDef = (): GameDef => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assert.notEqual(compiled.gameDef, null);
  return compiled.gameDef!;
};

describe('FITL Rule 1.4.1 US map sourcing exception', () => {
  it('US Train place-irregulars can source US irregulars from map when none are available', () => {
    const def = compileDef();
    const targetSpace = 'qui-nhon:none';
    const sourceSpace = 'quang-nam:none';
    const irregularId = 'us-irregular-map-source-1';

    const baseState = clearAllZones(initialState(def, 9123, 4).state);
    const setup: GameState = {
      ...baseState,
      activePlayer: asPlayerId(0),
      zones: {
        ...baseState.zones,
        [targetSpace]: [makeToken('us-train-eligibility-troop', 'troops', 'US', { type: 'troops' })],
        [sourceSpace]: [makeToken(irregularId, 'irregular', 'US', { type: 'irregular' })],
        'available-US:none': [],
      },
    };

    const result = applyMoveWithResolvedDecisionIds(
      def,
      setup,
      {
        actionId: asActionId('train'),
        params: {
          targetSpaces: [targetSpace],
          $trainChoice: 'place-irregulars',
          $subActionSpaces: [],
        },
      },
      {
        overrides: [
          {
            when: (request) => /sourceSpaces/.test(request.name),
            value: [sourceSpace],
          },
        ],
      },
    );

    const final = result.state;
    assert.equal(
      (final.zones[targetSpace] ?? []).some((token) => token.id === irregularId),
      true,
      'Expected US irregular to be sourced from map into Train target space',
    );
    assert.equal(
      (final.zones[sourceSpace] ?? []).some((token) => token.id === irregularId),
      false,
      'Expected sourced US irregular to be removed from its original map space',
    );
  });

  it('encodes map-sourcing gate as (faction != US) OR (pieceType == irregular)', () => {
    const { parsed } = compileProductionSpec();
    assertNoErrors(parsed);
    const macro = parsed.doc.effectMacros?.find((candidate) => candidate.id === 'place-from-available-or-map');
    assert.ok(macro, 'Expected place-from-available-or-map macro');

    const gateNodes = findDeep(macro, (node) =>
      node?.op === 'or' &&
      Array.isArray(node?.args) &&
      node.args.some(
        (arg: unknown) =>
          typeof arg === 'object' &&
          arg !== null &&
          (arg as { op?: string; left?: { param?: string }; right?: string }).op === '!=' &&
          (arg as { op?: string; left?: { param?: string }; right?: string }).left?.param === 'faction' &&
          (arg as { op?: string; left?: { param?: string }; right?: string }).right === 'US',
      ) &&
      node.args.some(
        (arg: unknown) =>
          typeof arg === 'object' &&
          arg !== null &&
          (arg as { op?: string; left?: { param?: string }; right?: string }).op === '==' &&
          (arg as { op?: string; left?: { param?: string }; right?: string }).left?.param === 'pieceType' &&
          (arg as { op?: string; left?: { param?: string }; right?: string }).right === 'irregular',
      ),
    );

    assert.ok(gateNodes.length >= 1, 'Expected US map-sourcing exception gate in macro');
  });

  it('ensures every place-from-available-or-map call site provides pieceType and faction args', () => {
    const { parsed } = compileProductionSpec();
    assertNoErrors(parsed);

    const calls = findDeep(parsed.doc, (node) => node?.macro === 'place-from-available-or-map');
    assert.ok(calls.length > 0, 'Expected place-from-available-or-map macro call sites');
    for (const call of calls) {
      assert.notEqual(call.args?.pieceType, undefined, 'Macro call must provide pieceType');
      assert.notEqual(call.args?.faction, undefined, 'Macro call must provide faction');
    }
  });
});
