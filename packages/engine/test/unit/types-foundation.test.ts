import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DegeneracyFlag,
  asPlayerId,
  asTokenId,
  asZoneId,
  type Diagnostic,
  type EvalErrorCodeWithDeferClass,
  type EvalErrorDeferClassForCode,
  type EvalErrorContextForCode,
  EVAL_ERROR_DEFER_CLASS,
  divisionByZeroError,
  hasEvalErrorDeferClass,
  type PlayerId,
  queryBoundsExceededError,
  type ZoneId,
  selectorCardinalityError,
  zonePropNotFoundError,
} from '../../src/kernel/index.js';

describe('kernel type foundations', () => {
  it('enforces brand separation at compile time', () => {
    const playerId: PlayerId = asPlayerId(1);
    const zoneId: ZoneId = asZoneId('market');
    const tokenId = asTokenId('card-1');

    // @ts-expect-error PlayerId must not be assignable to ZoneId.
    const badZoneId: ZoneId = playerId;
    void badZoneId;

    // @ts-expect-error TokenId must not be assignable to PlayerId.
    const badPlayerId: PlayerId = tokenId;
    void badPlayerId;

    assert.equal(typeof playerId, 'number');
    assert.equal(typeof zoneId, 'string');
  });

  it('keeps the exact DegeneracyFlag values', () => {
    assert.deepEqual(Object.values(DegeneracyFlag), [
      'LOOP_DETECTED',
      'NO_LEGAL_MOVES',
      'DOMINANT_ACTION',
      'TRIVIAL_WIN',
      'STALL',
      'TRIGGER_DEPTH_EXCEEDED',
    ]);
  });

  it('requires non-empty diagnostic essentials at runtime', () => {
    const diagnostic: Diagnostic = {
      code: 'REF_ZONE_MISSING',
      path: 'actions[0].effects[0].moveToken.to',
      severity: 'error',
      message: 'Unknown zone ID.',
    };

    assert.ok(diagnostic.code.length > 0);
    assert.ok(diagnostic.path.length > 0);
    assert.ok(diagnostic.message.length > 0);
  });

  it('rejects invalid selector-cardinality defer metadata at compile time', () => {
    selectorCardinalityError('ok', {
      selectorKind: 'zone',
      selector: '$zones',
      resolvedCount: 0,
      resolvedZones: [],
      deferClass: 'unresolvedBindingSelectorCardinality',
    });

    const invalidLiteralContext = {
      selectorKind: 'zone',
      selector: '$zones',
      resolvedCount: 0,
      resolvedZones: [],
      deferClass: 'invalidClass',
    };
    // @ts-expect-error Invalid deferClass literal must not be accepted.
    selectorCardinalityError('invalid', invalidLiteralContext);

    const typedContext: EvalErrorContextForCode<'SELECTOR_CARDINALITY'> = {
      selectorKind: 'zone',
      selector: '$zones',
      resolvedCount: 0,
      resolvedZones: [],
      deferClass: 'unresolvedBindingSelectorCardinality',
    };
    selectorCardinalityError('typed', typedContext);

    const widenedContext: Record<string, unknown> = {
      selectorKind: 'zone',
      selector: '$zones',
      resolvedCount: 0,
      resolvedZones: [],
      deferClass: 'unresolvedBindingSelectorCardinality',
    };
    // @ts-expect-error Widened context must not bypass deferClass typing.
    selectorCardinalityError('widened', widenedContext);

    // @ts-expect-error Zone selector cardinality metadata must include resolvedZones.
    selectorCardinalityError('missing zones', {
      selectorKind: 'zone',
      selector: '$zones',
      resolvedCount: 0,
    });

    // @ts-expect-error Player selector cardinality metadata must include resolvedPlayers when using resolvedCount shape.
    selectorCardinalityError('missing players', {
      selectorKind: 'player',
      selector: 'all',
      resolvedCount: 2,
    });

    selectorCardinalityError('player with zone payload', {
      selectorKind: 'player',
      selector: 'all',
      resolvedCount: 2,
      // @ts-expect-error Player selector cardinality metadata must not include resolvedZones.
      resolvedZones: [],
    });

    selectorCardinalityError('zone with player payload', {
      selectorKind: 'zone',
      selector: '$zones',
      resolvedCount: 0,
      // @ts-expect-error Zone selector cardinality metadata must not include resolvedPlayers.
      resolvedPlayers: [],
    });

    const widenedMixedPlayerContext: {
      selectorKind: 'player';
      selector: 'all';
      resolvedCount: number;
      resolvedPlayers: readonly PlayerId[];
      resolvedZones: readonly ZoneId[];
    } = {
      selectorKind: 'player',
      selector: 'all',
      resolvedCount: 1,
      resolvedPlayers: [asPlayerId(0)],
      resolvedZones: [asZoneId('hand:0')],
    };
    // @ts-expect-error Widened player selector-cardinality metadata must not include zone payload.
    selectorCardinalityError('widened player with zone payload', widenedMixedPlayerContext);

    const widenedMixedZoneContext: {
      selectorKind: 'zone';
      selector: '$zones';
      resolvedCount: number;
      resolvedZones: readonly ZoneId[];
      resolvedPlayers: readonly PlayerId[];
    } = {
      selectorKind: 'zone',
      selector: '$zones',
      resolvedCount: 1,
      resolvedZones: [asZoneId('hand:0')],
      resolvedPlayers: [asPlayerId(0)],
    };
    // @ts-expect-error Widened zone selector-cardinality metadata must not include player payload.
    selectorCardinalityError('widened zone with player payload', widenedMixedZoneContext);

    // @ts-expect-error Selector-cardinality metadata requires explicit selectorKind discriminator.
    selectorCardinalityError('missing selector kind', {
      selector: '$zones',
      resolvedCount: 0,
      resolvedZones: [],
    });

    const deferCode: EvalErrorCodeWithDeferClass = 'SELECTOR_CARDINALITY';
    assert.equal(deferCode, 'SELECTOR_CARDINALITY');

    const validDeferClass: EvalErrorDeferClassForCode<'SELECTOR_CARDINALITY'> =
      EVAL_ERROR_DEFER_CLASS.UNRESOLVED_BINDING_SELECTOR_CARDINALITY;
    assert.equal(validDeferClass, EVAL_ERROR_DEFER_CLASS.UNRESOLVED_BINDING_SELECTOR_CARDINALITY);

    const typedError = selectorCardinalityError('typed defer classifier', typedContext);
    assert.equal(
      hasEvalErrorDeferClass(
        typedError,
        'SELECTOR_CARDINALITY',
        EVAL_ERROR_DEFER_CLASS.UNRESOLVED_BINDING_SELECTOR_CARDINALITY,
      ),
      true,
    );

    // @ts-expect-error Only eval error codes with defer classes are allowed.
    hasEvalErrorDeferClass(typedError, 'MISSING_BINDING', validDeferClass);

    // @ts-expect-error MISSING_BINDING does not have a defer-class type.
    const invalidCodeDeferClass: EvalErrorDeferClassForCode<'MISSING_BINDING'> =
      EVAL_ERROR_DEFER_CLASS.UNRESOLVED_BINDING_SELECTOR_CARDINALITY;
    void invalidCodeDeferClass;
  });

  it('enforces structured context contracts for additional eval error codes', () => {
    queryBoundsExceededError('too many', {
      query: { query: 'players' },
      maxQueryResults: 10,
      resultLength: 11,
    });

    divisionByZeroError('division by zero', {
      expr: { op: '/', left: 1, right: 0 },
      left: 1,
      right: 0,
    });

    zonePropNotFoundError('missing zone', {
      zoneId: asZoneId('market'),
      availableZoneIds: [asZoneId('market')],
      reference: { ref: 'zoneProp', zone: 'market', prop: 'terrain' },
    });

    // @ts-expect-error QUERY_BOUNDS_EXCEEDED requires structured context fields.
    queryBoundsExceededError('too many', { query: { query: 'players' } });

    // @ts-expect-error DIVISION_BY_ZERO requires expr, left, and right.
    divisionByZeroError('division by zero', { expr: { op: '/', left: 1, right: 0 } });

    queryBoundsExceededError('too many', {
      query: { query: 'players' },
      maxQueryResults: 10,
      resultLength: 11,
      // @ts-expect-error QUERY_BOUNDS_EXCEEDED must reject undeclared literal keys.
      unexpected: true,
    });

    const widenedQueryWithUndeclaredKey: {
      query: { query: 'players' };
      maxQueryResults: number;
      resultLength: number;
      unexpected: boolean;
    } = {
      query: { query: 'players' },
      maxQueryResults: 10,
      resultLength: 11,
      unexpected: true,
    };
    // @ts-expect-error QUERY_BOUNDS_EXCEEDED must reject widened undeclared keys.
    queryBoundsExceededError('too many widened', widenedQueryWithUndeclaredKey);

    const widenedDivisionWithUndeclaredKey: {
      expr: { op: '/'; left: 1; right: 0 };
      left: number;
      right: number;
      extraInfo: string;
    } = {
      expr: { op: '/', left: 1, right: 0 },
      left: 1,
      right: 0,
      extraInfo: 'debug',
    };
    // @ts-expect-error DIVISION_BY_ZERO must reject widened undeclared keys.
    divisionByZeroError('division by zero widened', widenedDivisionWithUndeclaredKey);

    // @ts-expect-error ZONE_PROP_NOT_FOUND requires zoneId.
    zonePropNotFoundError('missing zone', {
      availableZoneIds: [asZoneId('market')],
      reference: { ref: 'zoneProp', zone: 'market', prop: 'terrain' },
    });

    zonePropNotFoundError('missing zone', {
      // @ts-expect-error ZONE_PROP_NOT_FOUND zoneId must be branded ZoneId, not plain string.
      zoneId: 'market',
      reference: { ref: 'zoneProp', zone: 'market', prop: 'terrain' },
    });

    const widenedZonePropWithUndeclaredKey: {
      zoneId: ZoneId;
      reference: { ref: 'zoneProp'; zone: 'market'; prop: 'terrain' };
      undeclared: number;
    } = {
      zoneId: asZoneId('market'),
      reference: { ref: 'zoneProp', zone: 'market', prop: 'terrain' },
      undeclared: 1,
    };
    // @ts-expect-error ZONE_PROP_NOT_FOUND must reject widened undeclared keys.
    zonePropNotFoundError('missing zone widened undeclared', widenedZonePropWithUndeclaredKey);
  });
});
