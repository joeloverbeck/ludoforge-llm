import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEffect, type NormalizerContext } from '../../../src/kernel/tooltip-normalizer.js';
import type { EffectAST } from '../../../src/kernel/types-ast.js';
import type { TooltipMessage } from '../../../src/kernel/tooltip-ir.js';

const EMPTY_CTX: NormalizerContext = {
  verbalization: undefined,
  suppressPatterns: [],
};

const ctxWithPatterns = (patterns: readonly string[]): NormalizerContext => ({
  verbalization: undefined,
  suppressPatterns: patterns,
});

/** Assert exactly one message returned and return it. */
const single = (messages: readonly TooltipMessage[]): TooltipMessage => {
  assert.equal(messages.length, 1, `Expected 1 message, got ${messages.length}`);
  return messages[0]!;
};

describe('tooltip-normalizer', () => {
  // --- Variable rules (1-8) ---

  describe('variable effects', () => {
    it('rule 1: addVar with negative literal → PayMessage', () => {
      const effect: EffectAST = { addVar: { scope: 'global', var: 'aid', delta: -3 } };
      const msg = single(normalizeEffect(effect, EMPTY_CTX, 'effects[0]'));
      assert.equal(msg.kind, 'pay');
      assert.equal(msg.astPath, 'effects[0]');
      if (msg.kind === 'pay') {
        assert.equal(msg.resource, 'aid');
        assert.equal(msg.amount, 3);
      }
    });

    it('rule 2: addVar with positive literal → GainMessage', () => {
      const effect: EffectAST = { addVar: { scope: 'global', var: 'resources', delta: 5 } };
      const msg = single(normalizeEffect(effect, EMPTY_CTX, 'effects[1]'));
      assert.equal(msg.kind, 'gain');
      if (msg.kind === 'gain') {
        assert.equal(msg.resource, 'resources');
        assert.equal(msg.amount, 5);
      }
    });

    it('rule 3: transferVar with literal amount → TransferMessage without amountExpr', () => {
      const effect: EffectAST = {
        transferVar: {
          from: { scope: 'global', var: 'aid' },
          to: { scope: 'global', var: 'patronage' },
          amount: 2,
        },
      };
      const msg = single(normalizeEffect(effect, EMPTY_CTX, 'effects[2]'));
      assert.equal(msg.kind, 'transfer');
      if (msg.kind === 'transfer') {
        assert.equal(msg.from, 'aid');
        assert.equal(msg.to, 'patronage');
        assert.equal(msg.amount, 2);
        assert.equal(msg.amountExpr, undefined);
      }
    });

    it('rule 3: transferVar with binding expression → TransferMessage with amountExpr', () => {
      const effect: EffectAST = {
        transferVar: {
          from: { scope: 'global', var: 'aid' },
          to: { scope: 'global', var: 'patronage' },
          amount: { ref: 'binding', name: 'x' },
        },
      };
      const msg = single(normalizeEffect(effect, EMPTY_CTX, 'effects[2b]'));
      assert.equal(msg.kind, 'transfer');
      if (msg.kind === 'transfer') {
        assert.equal(msg.amount, 0);
        assert.equal(msg.amountExpr, 'x');
      }
    });

    it('rule 4: setVar with suppressed name (suffix Count) → SuppressedMessage', () => {
      const effect: EffectAST = { setVar: { scope: 'global', var: 'sweepCount', value: 0 } };
      const msg = single(normalizeEffect(effect, EMPTY_CTX, 'e[0]'));
      assert.equal(msg.kind, 'suppressed');
    });

    it('rule 5: setVar with __prefix → SuppressedMessage', () => {
      const effect: EffectAST = { setVar: { scope: 'global', var: '__temp', value: 0 } };
      const msg = single(normalizeEffect(effect, EMPTY_CTX, 'e[1]'));
      assert.equal(msg.kind, 'suppressed');
    });

    it('rule 6: setVar with suppressed name (suffix Tracker) → SuppressedMessage', () => {
      const effect: EffectAST = { setVar: { scope: 'global', var: 'rallyTracker', value: 0 } };
      const msg = single(normalizeEffect(effect, EMPTY_CTX, 'e[2]'));
      assert.equal(msg.kind, 'suppressed');
    });

    it('rule 4 with explicit suppress pattern → SuppressedMessage', () => {
      const effect: EffectAST = { setVar: { scope: 'global', var: 'tempSetup', value: 0 } };
      const ctx = ctxWithPatterns(['temp*']);
      const msg = single(normalizeEffect(effect, ctx, 'e[3]'));
      assert.equal(msg.kind, 'suppressed');
    });

    it('rule 7: setVar generic → SetMessage', () => {
      const effect: EffectAST = { setVar: { scope: 'global', var: 'patronage', value: 3 } };
      const msg = single(normalizeEffect(effect, EMPTY_CTX, 'e[4]'));
      assert.equal(msg.kind, 'set');
      if (msg.kind === 'set') {
        assert.equal(msg.target, 'patronage');
        assert.equal(msg.value, '3');
      }
    });

    it('rule 8: addVar with non-literal expr → SetMessage', () => {
      const effect: EffectAST = {
        addVar: {
          scope: 'global',
          var: 'aid',
          delta: { ref: 'binding', name: 'amount' },
        },
      };
      const msg = single(normalizeEffect(effect, EMPTY_CTX, 'e[5]'));
      assert.equal(msg.kind, 'set');
      if (msg.kind === 'set') {
        assert.equal(msg.target, 'aid');
        assert.equal(msg.value, 'amount');
      }
    });

    it('addVar with zero literal → SetMessage (not pay or gain)', () => {
      const effect: EffectAST = { addVar: { scope: 'global', var: 'aid', delta: 0 } };
      const msg = single(normalizeEffect(effect, EMPTY_CTX, 'e[6]'));
      assert.equal(msg.kind, 'set');
    });

    it('addVar on suppressed var → SuppressedMessage', () => {
      const effect: EffectAST = { addVar: { scope: 'global', var: '__internal', delta: 5 } };
      const msg = single(normalizeEffect(effect, EMPTY_CTX, 'e[7]'));
      assert.equal(msg.kind, 'suppressed');
    });

    it('setVar with pvar scope → SetMessage with correct var name', () => {
      const effect: EffectAST = {
        setVar: { scope: 'pvar', var: 'influence', player: 'actor', value: 10 },
      };
      const msg = single(normalizeEffect(effect, EMPTY_CTX, 'e[8]'));
      assert.equal(msg.kind, 'set');
      if (msg.kind === 'set') {
        assert.equal(msg.target, 'influence');
      }
    });

    // --- Scope context preservation tests (LEGACTTOO-013) ---

    it('addVar global scope → PayMessage with no scope/scopeOwner', () => {
      const effect: EffectAST = { addVar: { scope: 'global', var: 'aid', delta: -3 } };
      const msg = single(normalizeEffect(effect, EMPTY_CTX, 'sc[0]'));
      assert.equal(msg.kind, 'pay');
      if (msg.kind === 'pay') {
        assert.equal(msg.scope, undefined);
        assert.equal(msg.scopeOwner, undefined);
      }
    });

    it('addVar pvar scope → GainMessage with scope: player, scopeOwner', () => {
      const effect: EffectAST = {
        addVar: { scope: 'pvar', var: 'resources', player: 'actor', delta: 3 },
      };
      const msg = single(normalizeEffect(effect, EMPTY_CTX, 'sc[1]'));
      assert.equal(msg.kind, 'gain');
      if (msg.kind === 'gain') {
        assert.equal(msg.scope, 'player');
        assert.equal(msg.scopeOwner, 'actor');
        assert.equal(msg.resource, 'resources');
        assert.equal(msg.amount, 3);
      }
    });

    it('addVar zoneVar scope → GainMessage with scope: zone, scopeOwner', () => {
      const effect: EffectAST = {
        addVar: { scope: 'zoneVar', var: 'econ', zone: 'saigon', delta: 2 },
      };
      const msg = single(normalizeEffect(effect, EMPTY_CTX, 'sc[2]'));
      assert.equal(msg.kind, 'gain');
      if (msg.kind === 'gain') {
        assert.equal(msg.scope, 'zone');
        assert.equal(msg.scopeOwner, 'saigon');
      }
    });

    it('setVar pvar scope → SetMessage with scope: player', () => {
      const effect: EffectAST = {
        setVar: { scope: 'pvar', var: 'patronage', player: 'active', value: 5 },
      };
      const msg = single(normalizeEffect(effect, EMPTY_CTX, 'sc[3]'));
      assert.equal(msg.kind, 'set');
      if (msg.kind === 'set') {
        assert.equal(msg.scope, 'player');
        assert.equal(msg.scopeOwner, 'active');
      }
    });

    it('transferVar with pvar endpoints → TransferMessage with per-endpoint scope', () => {
      const effect: EffectAST = {
        transferVar: {
          from: { scope: 'pvar', var: 'resources', player: 'actor' },
          to: { scope: 'pvar', var: 'resources', player: 'active' },
          amount: 3,
        },
      };
      const msg = single(normalizeEffect(effect, EMPTY_CTX, 'sc[4]'));
      assert.equal(msg.kind, 'transfer');
      if (msg.kind === 'transfer') {
        assert.equal(msg.fromScope, 'player');
        assert.equal(msg.fromScopeOwner, 'actor');
        assert.equal(msg.toScope, 'player');
        assert.equal(msg.toScopeOwner, 'active');
      }
    });

    it('transferVar with global endpoints → TransferMessage with no scope fields', () => {
      const effect: EffectAST = {
        transferVar: {
          from: { scope: 'global', var: 'aid' },
          to: { scope: 'global', var: 'patronage' },
          amount: 2,
        },
      };
      const msg = single(normalizeEffect(effect, EMPTY_CTX, 'sc[5]'));
      assert.equal(msg.kind, 'transfer');
      if (msg.kind === 'transfer') {
        assert.equal(msg.fromScope, undefined);
        assert.equal(msg.fromScopeOwner, undefined);
        assert.equal(msg.toScope, undefined);
        assert.equal(msg.toScopeOwner, undefined);
      }
    });

    it('addVar pvar with PlayerId object → scopeOwner stringified', () => {
      const effect: EffectAST = {
        addVar: { scope: 'pvar', var: 'resources', player: { id: 2 as never }, delta: 1 },
      };
      const msg = single(normalizeEffect(effect, EMPTY_CTX, 'sc[6]'));
      assert.equal(msg.kind, 'gain');
      if (msg.kind === 'gain') {
        assert.equal(msg.scope, 'player');
        assert.equal(msg.scopeOwner, '2');
      }
    });

    it('addVar zoneVar with ZoneRef expression → scopeOwner is <expr>', () => {
      const effect: EffectAST = {
        addVar: {
          scope: 'zoneVar',
          var: 'econ',
          zone: { zoneExpr: { ref: 'binding', name: 'targetZone' } },
          delta: 1,
        },
      };
      const msg = single(normalizeEffect(effect, EMPTY_CTX, 'sc[7]'));
      assert.equal(msg.kind, 'gain');
      if (msg.kind === 'gain') {
        assert.equal(msg.scope, 'zone');
        assert.equal(msg.scopeOwner, '<expr>');
      }
    });
  });

  // --- Token rules (9-23b) ---

  describe('token effects', () => {
    it('rule 9: moveToken from available-* → PlaceMessage', () => {
      const effect: EffectAST = {
        moveToken: { token: 'usTroop', from: 'available-us', to: 'saigon' },
      };
      const msg = single(normalizeEffect(effect, EMPTY_CTX, 't[0]'));
      assert.equal(msg.kind, 'place');
      if (msg.kind === 'place') {
        assert.equal(msg.tokenFilter, 'usTroop');
        assert.equal(msg.targetZone, 'saigon');
      }
    });

    it('rule 10: moveToken to casualties-* → RemoveMessage', () => {
      const effect: EffectAST = {
        moveToken: { token: 'nvaGuerrilla', from: 'hanoi', to: 'casualties-nva' },
      };
      const msg = single(normalizeEffect(effect, EMPTY_CTX, 't[1]'));
      assert.equal(msg.kind, 'remove');
      if (msg.kind === 'remove') {
        assert.equal(msg.tokenFilter, 'nvaGuerrilla');
        assert.equal(msg.fromZone, 'hanoi');
        assert.equal(msg.destination, 'casualties-nva');
      }
    });

    it('rule 10: moveToken to available-* → RemoveMessage', () => {
      const effect: EffectAST = {
        moveToken: { token: 'usTroop', from: 'saigon', to: 'available-us' },
      };
      const msg = single(normalizeEffect(effect, EMPTY_CTX, 't[2]'));
      assert.equal(msg.kind, 'remove');
    });

    it('rule 11: moveTokenAdjacent → MoveMessage(variant: adjacent)', () => {
      const effect: EffectAST = {
        moveTokenAdjacent: { token: 'usTroop', from: 'saigon' },
      };
      const msg = single(normalizeEffect(effect, EMPTY_CTX, 't[3]'));
      assert.equal(msg.kind, 'move');
      if (msg.kind === 'move') {
        assert.equal(msg.variant, 'adjacent');
        assert.equal(msg.tokenFilter, 'usTroop');
        assert.equal(msg.fromZone, 'saigon');
      }
    });

    it('rule 12: moveToken generic → MoveMessage', () => {
      const effect: EffectAST = {
        moveToken: { token: 'usTroop', from: 'saigon', to: 'hue' },
      };
      const msg = single(normalizeEffect(effect, EMPTY_CTX, 't[4]'));
      assert.equal(msg.kind, 'move');
      if (msg.kind === 'move') {
        assert.equal(msg.variant, undefined);
        assert.equal(msg.fromZone, 'saigon');
        assert.equal(msg.toZone, 'hue');
      }
    });

    it('rule 13: setTokenProp activity=underground → ActivateMessage', () => {
      const effect: EffectAST = {
        setTokenProp: { token: 'vcGuerrilla', prop: 'activity', value: 'underground' },
      };
      const msg = single(normalizeEffect(effect, EMPTY_CTX, 't[5]'));
      assert.equal(msg.kind, 'activate');
      if (msg.kind === 'activate') {
        assert.equal(msg.tokenFilter, 'vcGuerrilla');
      }
    });

    it('rule 13: setTokenProp activity=active → ActivateMessage', () => {
      const effect: EffectAST = {
        setTokenProp: { token: 'vcGuerrilla', prop: 'activity', value: 'active' },
      };
      const msg = single(normalizeEffect(effect, EMPTY_CTX, 't[6]'));
      assert.equal(msg.kind, 'activate');
    });

    it('rule 14: setTokenProp activity=inactive → DeactivateMessage', () => {
      const effect: EffectAST = {
        setTokenProp: { token: 'arvnPolice', prop: 'activity', value: 'inactive' },
      };
      const msg = single(normalizeEffect(effect, EMPTY_CTX, 't[7]'));
      assert.equal(msg.kind, 'deactivate');
      if (msg.kind === 'deactivate') {
        assert.equal(msg.tokenFilter, 'arvnPolice');
      }
    });

    it('rule 15: setTokenProp generic → SetMessage', () => {
      const effect: EffectAST = {
        setTokenProp: { token: 'card', prop: 'facing', value: 'up' },
      };
      const msg = single(normalizeEffect(effect, EMPTY_CTX, 't[8]'));
      assert.equal(msg.kind, 'set');
      if (msg.kind === 'set') {
        assert.equal(msg.target, 'card.facing');
        assert.equal(msg.value, 'up');
      }
    });

    it('rule 16: createToken → CreateMessage', () => {
      const effect: EffectAST = {
        createToken: { type: 'guerrilla', zone: 'saigon' },
      };
      const msg = single(normalizeEffect(effect, EMPTY_CTX, 't[9]'));
      assert.equal(msg.kind, 'create');
      if (msg.kind === 'create') {
        assert.equal(msg.tokenFilter, 'guerrilla');
        assert.equal(msg.targetZone, 'saigon');
      }
    });

    it('rule 17: destroyToken → DestroyMessage', () => {
      const effect: EffectAST = { destroyToken: { token: 'base' } };
      const msg = single(normalizeEffect(effect, EMPTY_CTX, 't[10]'));
      assert.equal(msg.kind, 'destroy');
      if (msg.kind === 'destroy') {
        assert.equal(msg.tokenFilter, 'base');
      }
    });

    it('rule 18: draw → DrawMessage', () => {
      const effect: EffectAST = { draw: { from: 'eventDeck', to: 'hand', count: 2 } };
      const msg = single(normalizeEffect(effect, EMPTY_CTX, 't[11]'));
      assert.equal(msg.kind, 'draw');
      if (msg.kind === 'draw') {
        assert.equal(msg.source, 'eventDeck');
        assert.equal(msg.count, 2);
      }
    });

    it('rule 19: reveal → RevealMessage', () => {
      const effect: EffectAST = { reveal: { zone: 'hand', to: 'all' } };
      const msg = single(normalizeEffect(effect, EMPTY_CTX, 't[12]'));
      assert.equal(msg.kind, 'reveal');
      if (msg.kind === 'reveal') {
        assert.equal(msg.target, 'hand');
      }
    });

    it('rule 20: shuffle → ShuffleMessage', () => {
      const effect: EffectAST = { shuffle: { zone: 'eventDeck' } };
      const msg = single(normalizeEffect(effect, EMPTY_CTX, 't[13]'));
      assert.equal(msg.kind, 'shuffle');
      if (msg.kind === 'shuffle') {
        assert.equal(msg.target, 'eventDeck');
      }
    });

    it('rule 21: moveAll from available-* → PlaceMessage', () => {
      const effect: EffectAST = { moveAll: { from: 'available-nva', to: 'hanoi' } };
      const msg = single(normalizeEffect(effect, EMPTY_CTX, 't[14]'));
      assert.equal(msg.kind, 'place');
      if (msg.kind === 'place') {
        assert.equal(msg.tokenFilter, '*');
        assert.equal(msg.targetZone, 'hanoi');
      }
    });

    it('rule 22: moveAll to casualties-* → RemoveMessage', () => {
      const effect: EffectAST = { moveAll: { from: 'saigon', to: 'casualties-arvn' } };
      const msg = single(normalizeEffect(effect, EMPTY_CTX, 't[15]'));
      assert.equal(msg.kind, 'remove');
    });

    it('rule 23: moveAll generic → MoveMessage', () => {
      const effect: EffectAST = { moveAll: { from: 'saigon', to: 'hue' } };
      const msg = single(normalizeEffect(effect, EMPTY_CTX, 't[16]'));
      assert.equal(msg.kind, 'move');
      if (msg.kind === 'move') {
        assert.equal(msg.tokenFilter, '*');
        assert.equal(msg.filter, undefined);
      }
    });

    it('moveAll with filter → output message includes filter string', () => {
      const effect: EffectAST = {
        moveAll: { from: 'saigon', to: 'hue', filter: { op: '>', left: { ref: 'gvar', var: 'count' }, right: 0 } },
      };
      const msg = single(normalizeEffect(effect, EMPTY_CTX, 't[16b]'));
      assert.equal(msg.kind, 'move');
      if (msg.kind === 'move') {
        assert.equal(msg.filter, '<condition>');
      }
    });

    it('moveAll from supply with filter → PlaceMessage with filter', () => {
      const effect: EffectAST = {
        moveAll: { from: 'available-us', to: 'saigon', filter: { op: '==', left: { ref: 'gvar', var: 'type' }, right: 'troop' } },
      };
      const msg = single(normalizeEffect(effect, EMPTY_CTX, 't[16c]'));
      assert.equal(msg.kind, 'place');
      if (msg.kind === 'place') {
        assert.equal(msg.filter, '<condition>');
      }
    });

    it('moveAll to removal zone with filter → RemoveMessage with filter', () => {
      const effect: EffectAST = {
        moveAll: { from: 'saigon', to: 'casualties-nva', filter: { op: '==', left: { ref: 'gvar', var: 'type' }, right: 'guerrilla' } },
      };
      const msg = single(normalizeEffect(effect, EMPTY_CTX, 't[16d]'));
      assert.equal(msg.kind, 'remove');
      if (msg.kind === 'remove') {
        assert.equal(msg.filter, '<condition>');
        assert.equal(msg.destination, 'casualties-nva');
      }
    });

    it('rule 23b: conceal → ConcealMessage', () => {
      const effect: EffectAST = { conceal: { zone: 'hand' } };
      const msg = single(normalizeEffect(effect, EMPTY_CTX, 't[17]'));
      assert.equal(msg.kind, 'conceal');
      if (msg.kind === 'conceal') {
        assert.equal(msg.target, 'hand');
      }
    });

    it('moveToken with ZoneRef expression → uses <expr>', () => {
      const effect: EffectAST = {
        moveToken: {
          token: 'troop',
          from: { zoneExpr: { ref: 'binding', name: 'sourceZone' } },
          to: 'target',
        },
      };
      const msg = single(normalizeEffect(effect, EMPTY_CTX, 't[18]'));
      assert.equal(msg.kind, 'move');
      if (msg.kind === 'move') {
        assert.equal(msg.fromZone, '<expr>');
      }
    });
  });

  // --- Marker rules (24-28) ---

  describe('marker effects', () => {
    it('rule 24: shiftMarker → ShiftMessage', () => {
      const effect: EffectAST = {
        shiftMarker: { space: 'saigon', marker: 'support', delta: 1 },
      };
      const msg = single(normalizeEffect(effect, EMPTY_CTX, 'm[0]'));
      assert.equal(msg.kind, 'shift');
      if (msg.kind === 'shift') {
        assert.equal(msg.marker, 'support');
        assert.equal(msg.direction, '+');
        assert.equal(msg.amount, 1);
        assert.equal(msg.deltaExpr, undefined);
      }
    });

    it('rule 24: shiftMarker with binding expression → ShiftMessage with deltaExpr', () => {
      const effect: EffectAST = {
        shiftMarker: { space: 'saigon', marker: 'support', delta: { ref: 'binding', name: 'shiftAmount' } },
      };
      const msg = single(normalizeEffect(effect, EMPTY_CTX, 'm[0b]'));
      assert.equal(msg.kind, 'shift');
      if (msg.kind === 'shift') {
        assert.equal(msg.amount, 0);
        assert.equal(msg.direction, '+');
        assert.equal(msg.deltaExpr, 'shiftAmount');
      }
    });

    it('rule 24: shiftMarker negative → ShiftMessage with minus direction', () => {
      const effect: EffectAST = {
        shiftMarker: { space: 'saigon', marker: 'support', delta: -2 },
      };
      const msg = single(normalizeEffect(effect, EMPTY_CTX, 'm[1]'));
      assert.equal(msg.kind, 'shift');
      if (msg.kind === 'shift') {
        assert.equal(msg.direction, '-');
        assert.equal(msg.amount, 2);
      }
    });

    it('rule 25: setMarker → SetMessage', () => {
      const effect: EffectAST = {
        setMarker: { space: 'saigon', marker: 'control', state: 'coin' },
      };
      const msg = single(normalizeEffect(effect, EMPTY_CTX, 'm[2]'));
      assert.equal(msg.kind, 'set');
      if (msg.kind === 'set') {
        assert.equal(msg.target, 'control');
        assert.equal(msg.value, 'coin');
      }
    });

    it('rule 26: setGlobalMarker → SetMessage', () => {
      const effect: EffectAST = {
        setGlobalMarker: { marker: 'monsoon', state: 'active' },
      };
      const msg = single(normalizeEffect(effect, EMPTY_CTX, 'm[3]'));
      assert.equal(msg.kind, 'set');
      if (msg.kind === 'set') {
        assert.equal(msg.target, 'monsoon');
        assert.equal(msg.value, 'active');
      }
    });

    it('rule 27: flipGlobalMarker → SetMessage with toggle', () => {
      const effect: EffectAST = {
        flipGlobalMarker: { marker: 'monsoon', stateA: 'active', stateB: 'inactive' },
      };
      const msg = single(normalizeEffect(effect, EMPTY_CTX, 'm[4]'));
      assert.equal(msg.kind, 'set');
      if (msg.kind === 'set') {
        assert.equal(msg.toggle, true);
        assert.equal(msg.target, 'monsoon');
        assert.equal(msg.value, 'active/inactive');
      }
    });

    it('rule 28: shiftGlobalMarker → ShiftMessage', () => {
      const effect: EffectAST = {
        shiftGlobalMarker: { marker: 'trail', delta: 2 },
      };
      const msg = single(normalizeEffect(effect, EMPTY_CTX, 'm[5]'));
      assert.equal(msg.kind, 'shift');
      if (msg.kind === 'shift') {
        assert.equal(msg.marker, 'trail');
        assert.equal(msg.direction, '+');
        assert.equal(msg.amount, 2);
        assert.equal(msg.deltaExpr, undefined);
      }
    });

    it('rule 28: shiftGlobalMarker with binding expression → ShiftMessage with deltaExpr', () => {
      const effect: EffectAST = {
        shiftGlobalMarker: { marker: 'trail', delta: { ref: 'binding', name: 'trailDelta' } },
      };
      const msg = single(normalizeEffect(effect, EMPTY_CTX, 'm[5b]'));
      assert.equal(msg.kind, 'shift');
      if (msg.kind === 'shift') {
        assert.equal(msg.amount, 0);
        assert.equal(msg.direction, '+');
        assert.equal(msg.deltaExpr, 'trailDelta');
      }
    });
  });

  // --- Scaffolding/unhandled ---

  describe('scaffolding and unhandled effects', () => {
    it('let effect → SuppressedMessage (scaffolding)', () => {
      const effect: EffectAST = {
        let: { bind: 'x', value: 'zone1', in: [] },
      };
      const msg = single(normalizeEffect(effect, EMPTY_CTX, 's[0]'));
      assert.equal(msg.kind, 'suppressed');
      if (msg.kind === 'suppressed') {
        assert.ok(msg.reason.includes('scaffolding'));
      }
    });

    it('bindValue effect → SuppressedMessage (scaffolding)', () => {
      const effect: EffectAST = {
        bindValue: { bind: 'temp', value: 42 },
      };
      const msg = single(normalizeEffect(effect, EMPTY_CTX, 's[1]'));
      assert.equal(msg.kind, 'suppressed');
    });

    it('setActivePlayer effect → SuppressedMessage (scaffolding)', () => {
      const effect: EffectAST = {
        setActivePlayer: { player: { id: 'us' as never } },
      };
      const msg = single(normalizeEffect(effect, EMPTY_CTX, 's[2]'));
      assert.equal(msg.kind, 'suppressed');
    });

    it('forEach with empty effects → SuppressedMessage (empty forEach)', () => {
      const effect: EffectAST = {
        forEach: { bind: 'x', over: { query: 'enums', values: ['a'] }, effects: [] },
      };
      const msg = single(normalizeEffect(effect, EMPTY_CTX, 'u[0]'));
      assert.equal(msg.kind, 'suppressed');
      if (msg.kind === 'suppressed') {
        assert.ok(msg.reason.includes('empty'));
      }
    });

    it('if effect with empty then → ModifierMessage only', () => {
      const effect: EffectAST = {
        if: { when: true, then: [] },
      };
      const msg = single(normalizeEffect(effect, EMPTY_CTX, 'u[1]'));
      assert.equal(msg.kind, 'modifier');
    });
  });

  // --- Compound / control-flow rules (28-41) ---

  describe('compound effects', () => {
    it('rule 28: chooseN over mapSpaces → SelectMessage(spaces) with bounds', () => {
      const effect: EffectAST = {
        chooseN: {
          internalDecisionId: 'd1',
          bind: 'spaces',
          options: { query: 'mapSpaces' },
          min: 1,
          max: 6,
        },
      };
      const msg = single(normalizeEffect(effect, EMPTY_CTX, 'c[0]'));
      assert.equal(msg.kind, 'select');
      if (msg.kind === 'select') {
        assert.equal(msg.target, 'spaces');
        assert.deepStrictEqual(msg.bounds, { min: 1, max: 6 });
      }
    });

    it('rule 28: chooseN with exact n → bounds min===max', () => {
      const effect: EffectAST = {
        chooseN: {
          internalDecisionId: 'd2',
          bind: 'spaces',
          options: { query: 'mapSpaces' },
          n: 3,
        },
      };
      const msg = single(normalizeEffect(effect, EMPTY_CTX, 'c[0b]'));
      if (msg.kind === 'select') {
        assert.deepStrictEqual(msg.bounds, { min: 3, max: 3 });
      }
    });

    it('rule 29: chooseN over tokensInZone → SelectMessage(zones)', () => {
      const effect: EffectAST = {
        chooseN: {
          internalDecisionId: 'd3',
          bind: 'tokens',
          options: { query: 'tokensInZone', zone: 'saigon' },
          min: 1,
          max: 4,
        },
      };
      const msg = single(normalizeEffect(effect, EMPTY_CTX, 'c[1]'));
      assert.equal(msg.kind, 'select');
      if (msg.kind === 'select') {
        assert.equal(msg.target, 'zones');
      }
    });

    it('rule 29b: chooseN generic → SelectMessage(spaces) fallback', () => {
      const effect: EffectAST = {
        chooseN: {
          internalDecisionId: 'd4',
          bind: 'items',
          options: { query: 'enums', values: ['a', 'b', 'c'] },
          min: 1,
          max: 2,
        },
      };
      const msg = single(normalizeEffect(effect, EMPTY_CTX, 'c[1b]'));
      assert.equal(msg.kind, 'select');
      if (msg.kind === 'select') {
        assert.equal(msg.target, 'spaces');
      }
    });

    it('rule 30: chooseOne over enums → ChooseMessage with options', () => {
      const effect: EffectAST = {
        chooseOne: {
          internalDecisionId: 'd5',
          bind: 'action',
          options: { query: 'enums', values: ['attack', 'defend'] },
        },
      };
      const msg = single(normalizeEffect(effect, EMPTY_CTX, 'c[2]'));
      assert.equal(msg.kind, 'choose');
      if (msg.kind === 'choose') {
        assert.deepStrictEqual(msg.options, ['attack', 'defend']);
        assert.equal(msg.paramName, 'action');
      }
    });

    it('rule 30b: chooseOne generic → ChooseMessage with empty options', () => {
      const effect: EffectAST = {
        chooseOne: {
          internalDecisionId: 'd6',
          bind: 'target',
          options: { query: 'mapSpaces' },
        },
      };
      const msg = single(normalizeEffect(effect, EMPTY_CTX, 'c[2b]'));
      assert.equal(msg.kind, 'choose');
      if (msg.kind === 'choose') {
        assert.deepStrictEqual(msg.options, []);
        assert.equal(msg.paramName, 'target');
      }
    });

    it('rule 31: forEach → recursively normalizes children', () => {
      const effect: EffectAST = {
        forEach: {
          bind: 'space',
          over: { query: 'mapSpaces' },
          effects: [
            { addVar: { scope: 'global', var: 'aid', delta: 1 } },
            { setVar: { scope: 'global', var: 'patronage', value: 5 } },
          ],
        },
      };
      const messages = normalizeEffect(effect, EMPTY_CTX, 'c[3]');
      assert.equal(messages.length, 2);
      assert.equal(messages[0]!.kind, 'gain');
      assert.equal(messages[1]!.kind, 'set');
      assert.ok(messages[0]!.astPath.startsWith('c[3].effects'));
    });

    it('rule 31: forEach with empty effects → single suppressed message', () => {
      const effect: EffectAST = {
        forEach: {
          bind: 'x',
          over: { query: 'enums', values: ['a'] },
          effects: [],
        },
      };
      const msg = single(normalizeEffect(effect, EMPTY_CTX, 'c[3b]'));
      assert.equal(msg.kind, 'suppressed');
    });

    it('rule 31: forEach with in-block → normalizes both effects and in', () => {
      const effect: EffectAST = {
        forEach: {
          bind: 'space',
          over: { query: 'mapSpaces' },
          effects: [
            { addVar: { scope: 'global', var: 'aid', delta: 1 } },
          ],
          in: [
            { setVar: { scope: 'global', var: 'result', value: 10 } },
          ],
        },
      };
      const messages = normalizeEffect(effect, EMPTY_CTX, 'c[3c]');
      assert.equal(messages.length, 2);
      assert.equal(messages[0]!.kind, 'gain');
      assert.equal(messages[1]!.kind, 'set');
      assert.ok(messages[1]!.astPath.startsWith('c[3c].in'));
    });

    it('rule 32: if with globalMarkerState → ModifierMessage', () => {
      const effect: EffectAST = {
        if: {
          when: {
            op: '==',
            left: { ref: 'globalMarkerState', marker: 'monsoon' },
            right: 'active',
          },
          then: [
            { addVar: { scope: 'global', var: 'aid', delta: -1 } },
          ],
        },
      };
      const messages = normalizeEffect(effect, EMPTY_CTX, 'c[4]');
      assert.ok(messages.length >= 2, 'Should produce modifier + child messages');
      assert.equal(messages[0]!.kind, 'modifier');
      if (messages[0]!.kind === 'modifier') {
        assert.ok(messages[0]!.condition.includes('monsoon'));
      }
      assert.equal(messages[1]!.kind, 'pay');
    });

    it('rule 33: if generic → ModifierMessage + then children', () => {
      const effect: EffectAST = {
        if: {
          when: { op: '>', left: { ref: 'gvar', var: 'aid' }, right: 0 },
          then: [
            { addVar: { scope: 'global', var: 'aid', delta: -1 } },
          ],
        },
      };
      const messages = normalizeEffect(effect, EMPTY_CTX, 'c[5]');
      assert.ok(messages.length >= 2);
      assert.equal(messages[0]!.kind, 'modifier');
      assert.equal(messages[1]!.kind, 'pay');
    });

    it('rule 33: if with else → includes both then and else children', () => {
      const effect: EffectAST = {
        if: {
          when: true,
          then: [{ addVar: { scope: 'global', var: 'a', delta: 1 } }],
          else: [{ addVar: { scope: 'global', var: 'b', delta: 2 } }],
        },
      };
      const messages = normalizeEffect(effect, EMPTY_CTX, 'c[5b]');
      assert.equal(messages.length, 3); // modifier + then + else
      assert.equal(messages[0]!.kind, 'modifier');
      assert.equal(messages[1]!.kind, 'gain');
      assert.equal(messages[2]!.kind, 'gain');
    });

    it('rule 34: rollRandom → RollMessage + children', () => {
      const effect: EffectAST = {
        rollRandom: {
          bind: 'dieRoll',
          min: 1,
          max: 6,
          in: [
            { addVar: { scope: 'global', var: 'aid', delta: 1 } },
          ],
        },
      };
      const messages = normalizeEffect(effect, EMPTY_CTX, 'c[6]');
      assert.ok(messages.length >= 2);
      assert.equal(messages[0]!.kind, 'roll');
      if (messages[0]!.kind === 'roll') {
        assert.deepStrictEqual(messages[0]!.range, { min: 1, max: 6 });
        assert.equal(messages[0]!.bindTo, 'dieRoll');
      }
      assert.equal(messages[1]!.kind, 'gain');
    });

    it('rule 35: removeByPriority → RemoveMessage + budget', () => {
      const effect: EffectAST = {
        removeByPriority: {
          budget: 3,
          groups: [{
            bind: 'token',
            over: { query: 'tokensInZone', zone: 'saigon' },
            to: 'casualties-nva',
          }],
        },
      };
      const messages = normalizeEffect(effect, EMPTY_CTX, 'c[7]');
      assert.ok(messages.length >= 2, 'Should include budget set + remove');
      const removeMsg = messages.find(m => m.kind === 'remove');
      assert.ok(removeMsg !== undefined, 'Should produce a RemoveMessage');
      if (removeMsg?.kind === 'remove') {
        assert.equal(removeMsg.destination, 'casualties-nva');
      }
    });

    it('rule 41: grantFreeOperation → GrantMessage', () => {
      const effect: EffectAST = {
        grantFreeOperation: {
          seat: 'arvn',
          operationClass: 'operation',
        },
      };
      const msg = single(normalizeEffect(effect, EMPTY_CTX, 'c[8]'));
      assert.equal(msg.kind, 'grant');
      if (msg.kind === 'grant') {
        assert.equal(msg.operation, 'operation');
        assert.equal(msg.targetPlayer, 'arvn');
      }
    });

    it('reduce → SuppressedMessage (internal computation)', () => {
      const effect: EffectAST = {
        reduce: {
          itemBind: 'item',
          accBind: 'acc',
          over: { query: 'enums', values: ['a', 'b'] },
          initial: 0,
          next: 0,
          resultBind: 'result',
          in: [],
        },
      };
      const msg = single(normalizeEffect(effect, EMPTY_CTX, 'c[9]'));
      assert.equal(msg.kind, 'suppressed');
      if (msg.kind === 'suppressed') {
        assert.ok(msg.reason.includes('reduce'));
      }
    });
  });

  // --- Macro override ---

  describe('macro override', () => {
    it('effect with macroOrigin + verbalization summary → single summary message', () => {
      const ctx: NormalizerContext = {
        verbalization: {
          labels: {},
          stages: {},
          macros: { trainUs: { class: 'operation', summary: 'Place US forces and build support' } },
          sentencePlans: {},
          suppressPatterns: [],
        },
        suppressPatterns: [],
      };
      const effect: EffectAST = {
        forEach: {
          bind: 'space',
          over: { query: 'mapSpaces' },
          macroOrigin: { macroId: 'trainUs', stem: 'train' },
          effects: [
            { addVar: { scope: 'global', var: 'aid', delta: 1 } },
            { addVar: { scope: 'global', var: 'aid', delta: 2 } },
          ],
        },
      };
      const messages = normalizeEffect(effect, ctx, 'macro[0]');
      assert.equal(messages.length, 1, 'Macro override should produce exactly 1 message');
      assert.equal(messages[0]!.kind, 'set');
      if (messages[0]!.kind === 'set') {
        assert.equal(messages[0]!.value, 'Place US forces and build support');
        assert.equal(messages[0]!.macroOrigin, 'trainUs');
      }
    });

    it('effect with macroOrigin but no verbalization → normal processing', () => {
      const effect: EffectAST = {
        forEach: {
          bind: 'space',
          over: { query: 'mapSpaces' },
          macroOrigin: { macroId: 'trainUs', stem: 'train' },
          effects: [
            { addVar: { scope: 'global', var: 'aid', delta: 1 } },
          ],
        },
      };
      const messages = normalizeEffect(effect, EMPTY_CTX, 'macro[1]');
      assert.ok(messages.length >= 1);
      assert.equal(messages[0]!.kind, 'gain');
    });

    it('effect with macroOrigin but macro has no summary → normal processing', () => {
      const ctx: NormalizerContext = {
        verbalization: {
          labels: {},
          stages: {},
          macros: { otherMacro: { class: 'operation', summary: 'Other summary' } },
          sentencePlans: {},
          suppressPatterns: [],
        },
        suppressPatterns: [],
      };
      const effect: EffectAST = {
        forEach: {
          bind: 'space',
          over: { query: 'mapSpaces' },
          macroOrigin: { macroId: 'trainUs', stem: 'train' },
          effects: [
            { addVar: { scope: 'global', var: 'aid', delta: 1 } },
          ],
        },
      };
      const messages = normalizeEffect(effect, ctx, 'macro[2]');
      assert.ok(messages.length >= 1);
      assert.equal(messages[0]!.kind, 'gain');
    });
  });

  // --- Invariants ---

  describe('invariants', () => {
    it('every message has a non-empty astPath', () => {
      const effects: EffectAST[] = [
        { addVar: { scope: 'global', var: 'aid', delta: -1 } },
        { setVar: { scope: 'global', var: 'x', value: 0 } },
        { moveToken: { token: 't', from: 'a', to: 'b' } },
        { shiftMarker: { space: 's', marker: 'm', delta: 1 } },
        { shuffle: { zone: 'deck' } },
      ];

      for (const [i, effect] of effects.entries()) {
        const messages = normalizeEffect(effect, EMPTY_CTX, `inv[${i}]`);
        assert.ok(messages.length >= 1, `Effect ${i} must produce at least one message`);
        for (const msg of messages) {
          assert.ok(msg.astPath.length > 0, `Message from effect ${i} must have non-empty astPath`);
        }
      }
    });

    it('normalizeEffect is pure — same input produces same output', () => {
      const effect: EffectAST = { addVar: { scope: 'global', var: 'aid', delta: -3 } };
      const result1 = normalizeEffect(effect, EMPTY_CTX, 'p[0]');
      const result2 = normalizeEffect(effect, EMPTY_CTX, 'p[0]');
      assert.deepStrictEqual(result1, result2);
    });
  });
});
