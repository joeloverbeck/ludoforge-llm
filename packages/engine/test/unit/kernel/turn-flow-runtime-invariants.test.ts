import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import ts from 'typescript';

import { asPlayerId } from '../../../src/kernel/branded.js';
import { createSeatResolutionContext } from '../../../src/kernel/seat-resolution.js';
import { TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS } from '../../../src/kernel/turn-flow-active-seat-invariant-surfaces.js';
import { requireCardDrivenActiveSeat } from '../../../src/kernel/turn-flow-runtime-invariants.js';
import type { GameDef, GameState } from '../../../src/kernel/types.js';
import { collectCallExpressionsByIdentifier, parseTypeScriptSource, unwrapTypeScriptExpression } from '../../helpers/kernel-source-ast-guard.js';
import { readKernelSource } from '../../helpers/kernel-source-guard.js';

const makeDef = (): GameDef =>
  ({
    metadata: { id: 'turn-flow-runtime-invariants-test', players: { min: 2, max: 2 } },
    seats: [{ id: 'us' }, { id: 'nva' }],
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: 'main' }] },
    actions: [],
    triggers: [],
    terminal: { conditions: [] },
    turnOrder: {
      type: 'cardDriven',
      config: {
        turnFlow: {
          cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
          eligibility: { seats: ['US', 'NVA'] },

          windows: [],
          optionMatrix: [],
          passRewards: [],
          durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
        },
      },
    },
  }) as unknown as GameDef;

const makeState = (): GameState =>
  ({
    globalVars: {},
    perPlayerVars: {},
    zoneVars: {},
    playerCount: 2,
    zones: {},
    nextTokenOrdinal: 0,
    currentPhase: 'main',
    activePlayer: asPlayerId(1),
    turnCount: 1,
    rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
    stateHash: 0n,
    _runningHash: 0n,
    actionUsage: {},
    turnOrderState: {
      type: 'cardDriven',
      runtime: {
        seatOrder: ['US', 'NVA'],
        eligibility: { US: true, NVA: true },
        currentCard: {
          firstEligible: 'US',
          secondEligible: 'NVA',
          actedSeats: [],
          passedSeats: [],
          nonPassCount: 0,
          firstActionClass: null,
        },
        pendingEligibilityOverrides: [],
      },
    },
    markers: {},
  reveals: undefined,
  globalMarkers: undefined,
  activeLastingEffects: undefined,
  interruptPhaseStack: undefined,
  }) as unknown as GameState;

describe('turn-flow-runtime-invariants', () => {
  it('resolves active seat using a prebuilt operation-scoped seat-resolution context', () => {
    const def = makeDef();
    const state = makeState();
    const seatResolution = createSeatResolutionContext(def, state.playerCount);

    assert.equal(
      requireCardDrivenActiveSeat(
        def,
        state,
        TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS.ELIGIBILITY_CHECK,
        seatResolution,
      ),
      'NVA',
    );
    assert.equal(
      requireCardDrivenActiveSeat(
        def,
        state,
        TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS.ELIGIBILITY_CHECK,
        seatResolution,
      ),
      'NVA',
    );
  });

  it('forbids implicit seat-resolution fallback in active-seat invariant helper', () => {
    const source = readKernelSource('src/kernel/turn-flow-runtime-invariants.ts');
    const sourceFile = parseTypeScriptSource(source, 'turn-flow-runtime-invariants.ts');

    const createCalls = collectCallExpressionsByIdentifier(sourceFile, 'createSeatResolutionContext');
    assert.equal(
      createCalls.length,
      0,
      'turn-flow runtime invariants must not build seat-resolution context implicitly',
    );

    const requireCardDrivenActiveSeatDeclaration = sourceFile.statements
      .filter(ts.isVariableStatement)
      .flatMap((statement) => statement.declarationList.declarations)
      .find(
        (declaration) =>
          ts.isIdentifier(declaration.name) &&
          declaration.name.text === 'requireCardDrivenActiveSeat' &&
          declaration.initializer !== undefined &&
          (ts.isArrowFunction(unwrapTypeScriptExpression(declaration.initializer)) ||
            ts.isFunctionExpression(unwrapTypeScriptExpression(declaration.initializer))),
      );

    assert.equal(
      requireCardDrivenActiveSeatDeclaration !== undefined,
      true,
      'requireCardDrivenActiveSeat declaration must exist as a function value',
    );
    if (requireCardDrivenActiveSeatDeclaration === undefined || requireCardDrivenActiveSeatDeclaration.initializer === undefined) {
      return;
    }

    const initializer = unwrapTypeScriptExpression(requireCardDrivenActiveSeatDeclaration.initializer);
    assert.equal(ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer), true);
    if (!ts.isArrowFunction(initializer) && !ts.isFunctionExpression(initializer)) {
      return;
    }

    assert.equal(initializer.parameters.length, 4, 'requireCardDrivenActiveSeat must require explicit seatResolution parameter');
    const seatResolutionParameter = initializer.parameters[3];
    assert.equal(seatResolutionParameter !== undefined, true);
    assert.equal(seatResolutionParameter?.questionToken === undefined, true, 'seatResolution parameter must not be optional');
    assert.equal(
      seatResolutionParameter?.name !== undefined && ts.isIdentifier(seatResolutionParameter.name)
        ? seatResolutionParameter.name.text === 'seatResolution'
        : false,
      true,
      'requireCardDrivenActiveSeat fourth parameter must be named seatResolution',
    );
    assert.equal(
      seatResolutionParameter?.type !== undefined &&
        ts.isTypeReferenceNode(seatResolutionParameter.type) &&
        seatResolutionParameter.type.typeName.getText(sourceFile) === 'SeatResolutionContext',
      true,
      'requireCardDrivenActiveSeat seatResolution parameter must be typed as SeatResolutionContext',
    );

    const resolveSeatCalls = collectCallExpressionsByIdentifier(sourceFile, 'resolveTurnFlowSeatForPlayerIndex');
    assert.equal(
      resolveSeatCalls.some((call) => {
        if (call.arguments.length !== 3) {
          return false;
        }
        const thirdArgument = unwrapTypeScriptExpression(call.arguments[2]!);
        return (
          ts.isPropertyAccessExpression(thirdArgument) &&
          ts.isIdentifier(thirdArgument.expression) &&
          thirdArgument.expression.text === 'seatResolution' &&
          thirdArgument.name.text === 'index'
        );
      }),
      true,
      'requireCardDrivenActiveSeat must resolve active seat through explicit seatResolution.index',
    );
  });
});
