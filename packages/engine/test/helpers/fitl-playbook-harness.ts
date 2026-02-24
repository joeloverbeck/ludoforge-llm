import * as assert from 'node:assert/strict';

import {
  applyMove,
  type GameState,
  type Move,
  type ValidatedGameDef,
} from '../../src/kernel/index.js';
import {
  applyMoveWithResolvedDecisionIds,
  type ResolveDecisionParamsOptions,
} from './decision-param-helpers.js';
import { requireCardDrivenRuntime } from './turn-order-helpers.js';

// ---------------------------------------------------------------------------
// Snapshot types
// ---------------------------------------------------------------------------

export interface ZoneTokenCountCheck {
  readonly zone: string;
  readonly faction: string;
  readonly type: string;
  readonly count: number;
  readonly props?: Readonly<Record<string, string>>;
}

export interface MarkerCheck {
  readonly space: string;
  readonly marker: string;
  readonly expected: string;
}

export interface PlaybookStateSnapshot {
  readonly globalVars?: Readonly<Record<string, number>>;
  readonly eligibility?: Readonly<Record<string, boolean>>;
  readonly activePlayer?: number;
  readonly currentCard?: string;
  readonly previewCard?: string;
  readonly deckSize?: number;
  readonly seatOrder?: readonly string[];
  readonly firstEligible?: string;
  readonly secondEligible?: string;
  readonly nonPassCount?: number;
  readonly zoneTokenCounts?: readonly ZoneTokenCountCheck[];
  readonly markers?: readonly MarkerCheck[];
}

// ---------------------------------------------------------------------------
// Move types
// ---------------------------------------------------------------------------

export type PlaybookMove =
  | {
      readonly kind: 'simple';
      readonly label: string;
      readonly move: Move;
    }
  | {
      readonly kind: 'resolved';
      readonly label: string;
      readonly move: Move;
      readonly options?: ResolveDecisionParamsOptions;
    };

// ---------------------------------------------------------------------------
// Turn descriptor
// ---------------------------------------------------------------------------

export interface PlaybookTurn {
  readonly label: string;
  readonly moves: readonly PlaybookMove[];
  readonly expectedEndState: PlaybookStateSnapshot;
}

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------

const zoneHasCard = (state: GameState, zoneId: string, cardId: string): boolean =>
  (state.zones[zoneId] ?? []).some((token) => token.props.cardId === cardId);

const countTokensInZone = (
  state: GameState,
  zoneId: string,
  filters: { faction: string; type: string; props?: Readonly<Record<string, string>> },
): number =>
  (state.zones[zoneId] ?? []).filter((token) => {
    if (String(token.props.faction) !== filters.faction) return false;
    if (String(token.props.type) !== filters.type) return false;
    if (filters.props !== undefined) {
      for (const [key, value] of Object.entries(filters.props)) {
        if (String(token.props[key]) !== value) return false;
      }
    }
    return true;
  }).length;

export const assertPlaybookSnapshot = (
  state: GameState,
  expected: PlaybookStateSnapshot,
  label: string,
): void => {
  if (expected.globalVars !== undefined) {
    for (const [varName, expectedValue] of Object.entries(expected.globalVars)) {
      assert.equal(
        Number(state.globalVars[varName]),
        expectedValue,
        `${label}: expected ${varName}=${expectedValue}, got ${Number(state.globalVars[varName])}`,
      );
    }
  }

  if (expected.eligibility !== undefined) {
    const runtime = requireCardDrivenRuntime(state);
    for (const [seat, expectedEligible] of Object.entries(expected.eligibility)) {
      assert.equal(
        runtime.eligibility[seat],
        expectedEligible,
        `${label}: expected seat ${seat} eligibility=${expectedEligible}, got ${runtime.eligibility[seat]}`,
      );
    }
  }

  if (expected.activePlayer !== undefined) {
    assert.equal(
      Number(state.activePlayer),
      expected.activePlayer,
      `${label}: expected activePlayer=${expected.activePlayer}, got ${Number(state.activePlayer)}`,
    );
  }

  if (expected.currentCard !== undefined) {
    assert.ok(
      zoneHasCard(state, 'played:none', expected.currentCard),
      `${label}: expected ${expected.currentCard} in played:none`,
    );
  }

  if (expected.previewCard !== undefined) {
    assert.ok(
      zoneHasCard(state, 'lookahead:none', expected.previewCard),
      `${label}: expected ${expected.previewCard} in lookahead:none`,
    );
  }

  if (expected.deckSize !== undefined) {
    const actualDeckSize = (state.zones['deck:none'] ?? []).length;
    assert.equal(
      actualDeckSize,
      expected.deckSize,
      `${label}: expected deck size=${expected.deckSize}, got ${actualDeckSize}`,
    );
  }

  if (expected.seatOrder !== undefined || expected.firstEligible !== undefined ||
      expected.secondEligible !== undefined || expected.nonPassCount !== undefined) {
    const runtime = requireCardDrivenRuntime(state);

    if (expected.seatOrder !== undefined) {
      assert.deepEqual(
        runtime.seatOrder,
        expected.seatOrder,
        `${label}: seatOrder mismatch`,
      );
    }

    if (expected.firstEligible !== undefined) {
      assert.equal(
        runtime.currentCard.firstEligible,
        expected.firstEligible,
        `${label}: expected firstEligible=${expected.firstEligible}, got ${runtime.currentCard.firstEligible}`,
      );
    }

    if (expected.secondEligible !== undefined) {
      assert.equal(
        runtime.currentCard.secondEligible,
        expected.secondEligible,
        `${label}: expected secondEligible=${expected.secondEligible}, got ${runtime.currentCard.secondEligible}`,
      );
    }

    if (expected.nonPassCount !== undefined) {
      assert.equal(
        runtime.currentCard.nonPassCount,
        expected.nonPassCount,
        `${label}: expected nonPassCount=${expected.nonPassCount}, got ${runtime.currentCard.nonPassCount}`,
      );
    }
  }

  if (expected.zoneTokenCounts !== undefined) {
    for (const check of expected.zoneTokenCounts) {
      const actual = countTokensInZone(state, check.zone, {
        faction: check.faction,
        type: check.type,
        ...(check.props !== undefined ? { props: check.props } : {}),
      });
      const propsDesc = check.props !== undefined
        ? ` with ${JSON.stringify(check.props)}`
        : '';
      assert.equal(
        actual,
        check.count,
        `${label}: expected ${check.faction} ${check.type}${propsDesc} in ${check.zone} = ${check.count}, got ${actual}`,
      );
    }
  }

  if (expected.markers !== undefined) {
    for (const check of expected.markers) {
      const actual = state.markers[check.space]?.[check.marker];
      assert.equal(
        actual,
        check.expected,
        `${label}: expected ${check.marker} at ${check.space} = ${check.expected}, got ${String(actual)}`,
      );
    }
  }
};

// ---------------------------------------------------------------------------
// Turn replay
// ---------------------------------------------------------------------------

export const replayPlaybookTurn = (
  def: ValidatedGameDef,
  state: GameState,
  turn: PlaybookTurn,
): GameState => {
  let current = state;
  for (const playMove of turn.moves) {
    if (playMove.kind === 'simple') {
      const result = applyMove(def, current, playMove.move);
      current = result.state;
    } else {
      const result = applyMoveWithResolvedDecisionIds(
        def,
        current,
        playMove.move,
        playMove.options,
      );
      current = result.state;
    }
  }
  assertPlaybookSnapshot(current, turn.expectedEndState, turn.label);
  return current;
};
