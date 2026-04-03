import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { InternTable } from '../../../src/kernel/index.js';
import {
  externActionIndex,
  externGlobalVarIndex,
  externInternedIndex,
  externPerPlayerVarIndex,
  externPhaseIndex,
  externPlayerIndex,
  externSeatIndex,
  externTokenTypeIndex,
  externZoneIndex,
  externZoneVarIndex,
  internActionName,
  internGlobalVarName,
  internInternedName,
  internPerPlayerVarName,
  internPhaseName,
  internPlayerName,
  internSeatName,
  internTokenTypeName,
  internZoneName,
  internZoneVarName,
} from '../../../src/kernel/index.js';

const table: InternTable = {
  zones: ['alpha:none', 'beta:none'],
  actions: ['attack', 'pass'],
  tokenTypes: ['base', 'leader'],
  seats: ['ARVN', 'US'],
  players: ['US', 'ARVN'],
  phases: ['coup', 'main'],
  globalVars: ['commitment', 'resources'],
  perPlayerVars: ['score'],
  zoneVars: ['support'],
};

describe('intern codecs', () => {
  it('round-trips all domain name/index codecs', () => {
    assert.equal(internZoneName(externZoneIndex(1, table), table), 1);
    assert.equal(internActionName(externActionIndex(0, table), table), 0);
    assert.equal(internTokenTypeName(externTokenTypeIndex(1, table), table), 1);
    assert.equal(internSeatName(externSeatIndex(0, table), table), 0);
    assert.equal(internPlayerName(externPlayerIndex(1, table), table), 1);
    assert.equal(internPhaseName(externPhaseIndex(0, table), table), 0);
    assert.equal(internGlobalVarName(externGlobalVarIndex(1, table), table), 1);
    assert.equal(internPerPlayerVarName(externPerPlayerVarIndex(0, table), table), 0);
    assert.equal(internZoneVarName(externZoneVarIndex(0, table), table), 0);
  });

  it('supports generic domain lookup helpers', () => {
    assert.equal(externInternedIndex(table, 'players', 0), 'US');
    assert.equal(internInternedName(table, 'players', 'ARVN'), 1);
  });

  it('throws for unknown names and indices', () => {
    assert.throws(() => internZoneName('missing:none', table), /Unknown zone: missing:none/);
    assert.throws(() => externActionIndex(9, table), /Unknown action index: 9/);
    assert.throws(() => internInternedName(table, 'phases', 'missing'), /Unknown phases: missing/);
  });
});
