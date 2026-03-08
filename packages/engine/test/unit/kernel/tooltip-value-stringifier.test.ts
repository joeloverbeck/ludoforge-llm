import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  stringifyValueExpr,
  stringifyNumericExpr,
  stringifyZoneRef,
} from '../../../src/kernel/tooltip-value-stringifier.js';

describe('tooltip-value-stringifier', () => {
  describe('stringifyZoneRef', () => {
    it('returns string zones as-is', () => {
      assert.equal(stringifyZoneRef('saigon'), 'saigon');
    });

    it('returns <expr> for zone expressions', () => {
      assert.equal(stringifyZoneRef({ zoneExpr: { ref: 'binding', name: 'x' } }), '<expr>');
    });
  });

  describe('stringifyValueExpr — primitives', () => {
    it('stringifies numbers', () => {
      assert.equal(stringifyValueExpr(42), '42');
    });

    it('stringifies booleans', () => {
      assert.equal(stringifyValueExpr(true), 'true');
      assert.equal(stringifyValueExpr(false), 'false');
    });

    it('stringifies strings', () => {
      assert.equal(stringifyValueExpr('hello'), 'hello');
    });
  });

  describe('stringifyValueExpr — all 12 ref types', () => {
    it('gvar → expr.var', () => {
      assert.equal(stringifyValueExpr({ ref: 'gvar', var: 'aid' }), 'aid');
    });

    it('pvar → expr.var', () => {
      assert.equal(
        stringifyValueExpr({ ref: 'pvar', player: 'active', var: 'resources' }),
        'resources',
      );
    });

    it('binding with displayName → displayName', () => {
      assert.equal(
        stringifyValueExpr({ ref: 'binding', name: '__internal', displayName: 'piece' }),
        'piece',
      );
    });

    it('binding without displayName → name', () => {
      assert.equal(
        stringifyValueExpr({ ref: 'binding', name: 'token' }),
        'token',
      );
    });

    it('binding with __macro_ name → sanitized semantic tail', () => {
      assert.equal(
        stringifyValueExpr({ ref: 'binding', name: '__macro_place_from_available__piece' }),
        'Piece',
      );
    });

    it('globalMarkerState → expr.marker', () => {
      assert.equal(
        stringifyValueExpr({ ref: 'globalMarkerState', marker: 'trail' }),
        'trail',
      );
    });

    it('markerState → "{marker} of {space}"', () => {
      assert.equal(
        stringifyValueExpr({ ref: 'markerState', space: 'saigon', marker: 'control' }),
        'control of saigon',
      );
    });

    it('zoneCount → "pieces in {zone}"', () => {
      assert.equal(
        stringifyValueExpr({ ref: 'zoneCount', zone: 'hanoi' }),
        'pieces in hanoi',
      );
    });

    it('tokenProp → "{token}.{prop}"', () => {
      assert.equal(
        stringifyValueExpr({ ref: 'tokenProp', token: 'guerrilla', prop: 'activity' }),
        'guerrilla.activity',
      );
    });

    it('assetField → "{field}"', () => {
      assert.equal(
        stringifyValueExpr({ ref: 'assetField', row: 'row1', tableId: 'events', field: 'title' }),
        'title',
      );
    });

    it('zoneProp → "{zone}.{prop}"', () => {
      assert.equal(
        stringifyValueExpr({ ref: 'zoneProp', zone: 'saigon', prop: 'population' }),
        'saigon.population',
      );
    });

    it('activePlayer → "activePlayer"', () => {
      assert.equal(
        stringifyValueExpr({ ref: 'activePlayer' }),
        'activePlayer',
      );
    });

    it('tokenZone → "zone of {token}"', () => {
      assert.equal(
        stringifyValueExpr({ ref: 'tokenZone', token: 'ranger' }),
        'zone of ranger',
      );
    });

    it('zoneVar → "{var} of {zone}"', () => {
      assert.equal(
        stringifyValueExpr({ ref: 'zoneVar', zone: 'hue', var: 'support' }),
        'support of hue',
      );
    });
  });

  describe('stringifyValueExpr — arithmetic expressions', () => {
    it('renders "{left} {op} {right}"', () => {
      assert.equal(
        stringifyValueExpr({ op: '+', left: 3, right: 5 }),
        '3 + 5',
      );
    });

    it('handles nested arithmetic', () => {
      assert.equal(
        stringifyValueExpr({
          op: '*',
          left: { op: '+', left: 1, right: 2 },
          right: 4,
        }),
        '1 + 2 * 4',
      );
    });

    it('handles ref in arithmetic', () => {
      assert.equal(
        stringifyValueExpr({
          op: '-',
          left: { ref: 'gvar', var: 'aid' },
          right: 1,
        }),
        'aid - 1',
      );
    });
  });

  describe('stringifyValueExpr — aggregate expressions', () => {
    it('count aggregate → "count of ..."', () => {
      assert.equal(
        stringifyValueExpr({
          aggregate: { op: 'count', query: { query: 'enums', values: ['a', 'b'] } },
        }),
        'count of ...',
      );
    });

    it('sum aggregate → "sum of ..."', () => {
      assert.equal(
        stringifyValueExpr({
          aggregate: {
            op: 'sum',
            query: { query: 'enums', values: ['x'] },
            bind: 'item',
            valueExpr: 1,
          },
        }),
        'sum of ...',
      );
    });
  });

  describe('stringifyValueExpr — concat expressions', () => {
    it('renders concatenated values', () => {
      assert.equal(
        stringifyValueExpr({ concat: ['hello', 'world'] }),
        'hello + world',
      );
    });
  });

  describe('stringifyValueExpr — conditional expressions', () => {
    it('renders "then or else"', () => {
      assert.equal(
        stringifyValueExpr({
          if: {
            when: { op: '==', left: 1, right: 1 },
            then: 'yes',
            else: 'no',
          },
        }),
        'yes or no',
      );
    });
  });

  describe('stringifyNumericExpr', () => {
    it('stringifies numbers directly', () => {
      assert.equal(stringifyNumericExpr(7), '7');
    });

    it('handles arithmetic expressions', () => {
      assert.equal(
        stringifyNumericExpr({ op: '+', left: 3, right: 2 }),
        '3 + 2',
      );
    });

    it('handles aggregate expressions', () => {
      assert.equal(
        stringifyNumericExpr({
          aggregate: { op: 'count', query: { query: 'enums', values: ['a'] } },
        }),
        'count of ...',
      );
    });

    it('falls back to stringifyValueExpr for references', () => {
      assert.equal(
        stringifyNumericExpr({ ref: 'gvar', var: 'aid' }),
        'aid',
      );
    });

    it('handles all ref types via fallback', () => {
      assert.equal(
        stringifyNumericExpr({ ref: 'zoneCount', zone: 'hanoi' }),
        'pieces in hanoi',
      );
    });
  });
});
