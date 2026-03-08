import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  stringifyValueExpr,
  stringifyNumericExpr,
  stringifyZoneRef,
  humanizeValueExpr,
} from '../../../src/kernel/tooltip-value-stringifier.js';
import type { LabelContext } from '../../../src/kernel/tooltip-label-resolver.js';

describe('tooltip-value-stringifier', () => {
  describe('stringifyZoneRef', () => {
    it('returns string zones as-is', () => {
      assert.equal(stringifyZoneRef('saigon'), 'saigon');
    });

    it('returns binding name for zone expressions with binding ref', () => {
      assert.equal(stringifyZoneRef({ zoneExpr: { ref: 'binding', name: 'x' } }), 'x');
    });

    it('strips __macro_ prefix from string zone refs and humanizes', () => {
      assert.equal(stringifyZoneRef('__macro_targetZone'), 'Target Zone');
    });

    it('strips __macro_ with double-underscore segments to semantic tail', () => {
      assert.equal(
        stringifyZoneRef('__macro_place_from_available__piece'),
        'Piece',
      );
    });

    it('humanizes __macro_ binding in zoneExpr', () => {
      assert.equal(
        stringifyZoneRef({ zoneExpr: { ref: 'binding', name: '__macro_foo__zone' } }),
        'Zone',
      );
    });

    it('never returns <expr> for a binding ref zoneExpr', () => {
      const result = stringifyZoneRef({ zoneExpr: { ref: 'binding', name: '__macro_bar__dest' } });
      assert.ok(!result.includes('<expr>'), `Got <expr> for binding ref: "${result}"`);
    });

    it('delegates non-binding zoneExpr to stringifyValueExpr', () => {
      assert.equal(
        stringifyZoneRef({ zoneExpr: { ref: 'gvar', var: 'targetZone' } }),
        'targetZone',
      );
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

  // ---------------------------------------------------------------------------
  // humanizeValueExpr — label-aware humanization
  // ---------------------------------------------------------------------------

  describe('humanizeValueExpr', () => {
    const noLabels: LabelContext = { verbalization: undefined, acronyms: new Set() };
    const withLabels: LabelContext = {
      verbalization: {
        labels: {
          aid: 'Aid',
          resources: 'Resources',
          trail: 'Trail',
          control: 'Control',
          saigon: 'Saigon',
          hanoi: 'Hanoi',
          hue: 'Hue',
          guerrilla: 'Guerrilla',
          activity: 'Activity',
          population: 'Population',
          support: 'Support',
          ranger: 'Ranger',
          title: 'Title',
        },
        stages: {},
        macros: {},
        sentencePlans: {},
        suppressPatterns: [],
        stageDescriptions: {},
        modifierEffects: {},
      },
      acronyms: new Set(),
    };

    describe('primitives', () => {
      it('humanizes numbers', () => {
        assert.equal(humanizeValueExpr(42, noLabels), '42');
      });

      it('humanizes booleans', () => {
        assert.equal(humanizeValueExpr(true, noLabels), 'true');
      });

      it('humanizes strings via label resolution', () => {
        assert.equal(humanizeValueExpr('aid', withLabels), 'Aid');
      });

      it('humanizes strings without labels via auto-humanize', () => {
        assert.equal(humanizeValueExpr('hello', noLabels), 'Hello');
      });
    });

    describe('reference types with label resolution', () => {
      it('gvar resolves via label', () => {
        assert.equal(humanizeValueExpr({ ref: 'gvar', var: 'aid' }, withLabels), 'Aid');
      });

      it('pvar resolves via label', () => {
        assert.equal(
          humanizeValueExpr({ ref: 'pvar', player: 'active', var: 'resources' }, withLabels),
          'Resources',
        );
      });

      it('binding resolves via label', () => {
        assert.equal(
          humanizeValueExpr({ ref: 'binding', name: 'resources' }, withLabels),
          'Resources',
        );
      });

      it('binding with __macro_ prefix strips and resolves', () => {
        assert.equal(
          humanizeValueExpr(
            { ref: 'binding', name: '__macro_place_from_available__resources' },
            withLabels,
          ),
          'Resources',
        );
      });

      it('globalMarkerState resolves via label', () => {
        assert.equal(
          humanizeValueExpr({ ref: 'globalMarkerState', marker: 'trail' }, withLabels),
          'Trail',
        );
      });

      it('markerState resolves both parts via label', () => {
        assert.equal(
          humanizeValueExpr(
            { ref: 'markerState', space: 'saigon', marker: 'control' },
            withLabels,
          ),
          'Control of Saigon',
        );
      });

      it('zoneCount resolves zone via label', () => {
        assert.equal(
          humanizeValueExpr({ ref: 'zoneCount', zone: 'hanoi' }, withLabels),
          'pieces in Hanoi',
        );
      });

      it('tokenProp resolves both parts via label', () => {
        assert.equal(
          humanizeValueExpr(
            { ref: 'tokenProp', token: 'guerrilla', prop: 'activity' },
            withLabels,
          ),
          'Guerrilla.Activity',
        );
      });

      it('assetField resolves via label', () => {
        assert.equal(
          humanizeValueExpr(
            { ref: 'assetField', row: 'row1', tableId: 'events', field: 'title' },
            withLabels,
          ),
          'Title',
        );
      });

      it('zoneProp resolves both parts via label', () => {
        assert.equal(
          humanizeValueExpr(
            { ref: 'zoneProp', zone: 'saigon', prop: 'population' },
            withLabels,
          ),
          'Saigon.Population',
        );
      });

      it('activePlayer returns "active player"', () => {
        assert.equal(
          humanizeValueExpr({ ref: 'activePlayer' }, noLabels),
          'active player',
        );
      });

      it('tokenZone resolves via label', () => {
        assert.equal(
          humanizeValueExpr({ ref: 'tokenZone', token: 'ranger' }, withLabels),
          'zone of Ranger',
        );
      });

      it('zoneVar resolves both parts via label', () => {
        assert.equal(
          humanizeValueExpr({ ref: 'zoneVar', zone: 'hue', var: 'support' }, withLabels),
          'Support of Hue',
        );
      });
    });

    describe('arithmetic', () => {
      it('renders simple arithmetic with labels', () => {
        assert.equal(
          humanizeValueExpr(
            { op: '+', left: { ref: 'gvar', var: 'aid' }, right: 3 },
            withLabels,
          ),
          'Aid + 3',
        );
      });

      it('renders nested arithmetic (a + b) * c', () => {
        assert.equal(
          humanizeValueExpr(
            {
              op: '*',
              left: { op: '+', left: { ref: 'gvar', var: 'aid' }, right: 2 },
              right: { ref: 'pvar', player: 'active', var: 'resources' },
            },
            withLabels,
          ),
          'Aid + 2 * Resources',
        );
      });
    });

    describe('aggregate', () => {
      it('count aggregate → "number of matching items"', () => {
        assert.equal(
          humanizeValueExpr(
            { aggregate: { op: 'count', query: { query: 'enums', values: ['a', 'b'] } } },
            noLabels,
          ),
          'number of matching items',
        );
      });

      it('sum aggregate with binding → "sum of <field>"', () => {
        assert.equal(
          humanizeValueExpr(
            {
              aggregate: {
                op: 'sum',
                query: { query: 'enums', values: ['x'] },
                bind: 'resources',
                valueExpr: 1,
              },
            },
            withLabels,
          ),
          'sum of Resources',
        );
      });

      it('max aggregate with __macro_ binding → sanitized label', () => {
        assert.equal(
          humanizeValueExpr(
            {
              aggregate: {
                op: 'max',
                query: { query: 'enums', values: ['x'] },
                bind: '__macro_foo__resources',
                valueExpr: 1,
              },
            },
            withLabels,
          ),
          'max of Resources',
        );
      });
    });

    describe('concat', () => {
      it('renders joined parts with labels', () => {
        assert.equal(
          humanizeValueExpr(
            { concat: ['aid', { ref: 'gvar', var: 'trail' }] },
            withLabels,
          ),
          'Aid Trail',
        );
      });

      it('renders mixed literal/ref concat', () => {
        assert.equal(
          humanizeValueExpr(
            { concat: [42, 'hello', { ref: 'gvar', var: 'aid' }] },
            withLabels,
          ),
          '42 Hello Aid',
        );
      });
    });

    describe('conditional', () => {
      it('renders "X if condition met, otherwise Y"', () => {
        assert.equal(
          humanizeValueExpr(
            {
              if: {
                when: { op: '==', left: 1, right: 1 },
                then: { ref: 'gvar', var: 'aid' },
                else: 0,
              },
            },
            withLabels,
          ),
          'Aid if condition met, otherwise 0',
        );
      });
    });

    describe('no <value> placeholder', () => {
      it('never produces <value> for any supported shape', () => {
        const shapes: readonly unknown[] = [
          42,
          true,
          'aid',
          { ref: 'gvar', var: 'aid' },
          { ref: 'pvar', player: 'active', var: 'resources' },
          { ref: 'binding', name: 'token' },
          { ref: 'globalMarkerState', marker: 'trail' },
          { ref: 'markerState', space: 'saigon', marker: 'control' },
          { ref: 'zoneCount', zone: 'hanoi' },
          { ref: 'tokenProp', token: 'guerrilla', prop: 'activity' },
          { ref: 'assetField', row: 'r', tableId: 't', field: 'title' },
          { ref: 'zoneProp', zone: 'saigon', prop: 'population' },
          { ref: 'activePlayer' },
          { ref: 'tokenZone', token: 'ranger' },
          { ref: 'zoneVar', zone: 'hue', var: 'support' },
          { op: '+', left: 1, right: 2 },
          { aggregate: { op: 'count', query: { query: 'enums', values: ['a'] } } },
          {
            aggregate: {
              op: 'sum',
              query: { query: 'enums', values: ['x'] },
              bind: 'item',
              valueExpr: 1,
            },
          },
          { concat: ['a', 'b'] },
          { if: { when: true, then: 1, else: 0 } },
        ];
        for (const expr of shapes) {
          const result = humanizeValueExpr(expr as never, noLabels);
          assert.ok(
            !result.includes('<value>'),
            `Got <value> for shape: ${JSON.stringify(expr)} → "${result}"`,
          );
        }
      });
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
