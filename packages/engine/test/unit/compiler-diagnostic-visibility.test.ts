/**
 * Proves that compiler-stage error diagnostics (especially cross-validation)
 * are visible and detectable — closing a gap where `requireSuccessfulProductionCompilation`
 * only checked parser and validator diagnostics but not compiler diagnostics.
 *
 * The original bug: a FITL spec missing the `event` action declaration compiled
 * successfully (non-null gameDef) with error-level diagnostics in `compiled.diagnostics`,
 * but the test helper silently ignored them. This test ensures that scenario is now caught.
 */
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { GameSpecDoc } from '../../src/cnl/game-spec-doc.js';
import { createEmptyGameSpecDoc } from '../../src/cnl/game-spec-doc.js';
import { compileGameSpecToGameDef } from '../../src/cnl/compiler.js';

/**
 * Creates a minimal doc with card-driven turn order that references an `event`
 * action in `actionClassByActionId`. The doc is intentionally cast — this test
 * validates diagnostic behavior, not type-level correctness.
 */
function createMinimalCardDrivenDoc(): GameSpecDoc {
  return {
    ...createEmptyGameSpecDoc(),
    metadata: { id: 'diag-visibility', players: { min: 2, max: 4 } },
    seats: [
      { id: 'p1', displayName: 'Player 1', seatIndex: 0 },
      { id: 'p2', displayName: 'Player 2', seatIndex: 1 },
    ],
    zones: [
      { id: 'board', owner: 'none', visibility: 'public', ordering: 'set' },
    ],
    turnStructure: { phases: [{ id: 'main' }] },
    turnOrder: {
      type: 'cardDriven',
      config: {
        turnFlow: {
          cardLifecycle: { drawZone: 'board:none', discardZone: 'board:none', played: 'board:none', lookahead: 'board:none', leader: 'board:none' },
          eligibility: { seats: ['p1', 'p2'], values: ['eligible', 'ineligible'], initial: 'eligible' },
          windows: [
            { id: 'firstAction', duration: 'turn', usages: ['event'] },
            { id: 'secondAction', duration: 'turn', usages: ['operation'] },
          ],
          actionClassByActionId: {
            pass: 'pass',
            event: 'event',
            myOp: 'operation',
          },
          optionMatrix: [
            { firstAction: 'event', secondAction: ['event'] },
            { firstAction: 'operation', secondAction: ['operation'] },
          ],
          passRewards: [],
          durationWindows: [],
        },
      },
    } as unknown as GameSpecDoc['turnOrder'],
    actions: [
      { id: 'pass', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] },
      { id: 'myOp', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] },
      // NOTE: 'event' is referenced in actionClassByActionId but NOT declared here
    ],
    terminal: { conditions: [{ when: { op: '==', left: 1, right: 1 }, result: { type: 'draw' } }] },
  } as GameSpecDoc;
}

describe('compiler diagnostic visibility', () => {
  it('cross-validation errors appear in compiled.diagnostics when action is missing', () => {
    const doc = createMinimalCardDrivenDoc();

    const result = compileGameSpecToGameDef(doc);

    // Cross-validation runs during compilation and detects that
    // actionClassByActionId references 'event' which is not in the actions list.
    // Before the fix to requireSuccessfulProductionCompilation, these diagnostics
    // in compiled.diagnostics were silently ignored.

    const errorDiagnostics = result.diagnostics.filter((d) => d.severity === 'error');
    const crossRefErrors = errorDiagnostics.filter((d) => d.code.startsWith('CNL_XREF_'));

    assert.ok(
      crossRefErrors.some((d) => d.code === 'CNL_XREF_TURN_FLOW_ACTION_CLASS_ACTION_MISSING' && d.message.includes('event')),
      `Expected CNL_XREF_TURN_FLOW_ACTION_CLASS_ACTION_MISSING for 'event' but got:\n${crossRefErrors.map((d) => `  [${d.code}] ${d.message}`).join('\n') || '(none)'}`,
    );
  });

  it('cross-validation errors disappear when the missing action is properly declared', () => {
    const doc: GameSpecDoc = {
      ...createMinimalCardDrivenDoc(),
      actions: [
        { id: 'pass', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] },
        { id: 'event', actor: 'active', executor: 'actor', phase: ['main'], capabilities: ['cardEvent'], params: [], pre: null, cost: [], effects: [], limits: [] },
        { id: 'myOp', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] },
      ],
    };

    const result = compileGameSpecToGameDef(doc);

    // Only check cross-ref diagnostics — other compiler errors (seat catalog, etc.)
    // are expected from this minimal doc and are not relevant to the cross-validation test.
    const crossRefErrors = result.diagnostics.filter((d) => d.severity === 'error' && d.code.startsWith('CNL_XREF_'));
    assert.deepEqual(
      crossRefErrors,
      [],
      `Expected zero cross-ref error diagnostics but found:\n${crossRefErrors.map((d) => `  [${d.code}] ${d.path}: ${d.message}`).join('\n')}`,
    );
  });

  it('synthesized event action name collision triggers cross-validation when actionClassByActionId lacks the suffixed name', () => {
    // Reproduces the exact scenario from the original bug:
    // - 'event' action exists WITHOUT cardEvent capability
    // - Event decks present → synthesizer creates 'event_2' with cardEvent
    // - actionClassByActionId maps 'event' but not 'event_2' → error
    const doc: GameSpecDoc = {
      ...createMinimalCardDrivenDoc(),
      actions: [
        { id: 'pass', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] },
        // 'event' declared but WITHOUT cardEvent capability
        { id: 'event', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] },
        { id: 'myOp', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] },
      ],
      eventDecks: [
        {
          id: 'test-deck',
          drawZone: 'board:none',
          discardZone: 'board:none',
          cards: [
            {
              id: 'card-a',
              title: 'Card A',
              sideMode: 'single' as const,
              unshaded: { effects: [{ shuffle: { zone: 'board:none' } }] },
            },
          ],
        },
      ],
    };

    const result = compileGameSpecToGameDef(doc);

    // Compiler synthesizes 'event_2' since 'event' is taken but lacks cardEvent
    const errorDiagnostics = result.diagnostics.filter((d) => d.severity === 'error');

    assert.ok(
      errorDiagnostics.some((d) =>
        d.code === 'CNL_XREF_TURN_FLOW_ACTION_CLASS_REQUIRED_MISSING' &&
        d.message.includes('event_2'),
      ),
      `Expected CNL_XREF_TURN_FLOW_ACTION_CLASS_REQUIRED_MISSING for 'event_2' but got:\n${errorDiagnostics.map((d) => `  [${d.code}] ${d.message}`).join('\n') || '(none)'}`,
    );
  });
});
