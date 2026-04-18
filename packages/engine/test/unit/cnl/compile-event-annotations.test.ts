// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildEventAnnotationIndex } from '../../../src/cnl/compile-event-annotations.js';
import { asZoneId } from '../../../src/kernel/branded.js';
import { EFFECT_KIND_TAG } from '../../../src/kernel/types-ast.js';
import type { EffectAST } from '../../../src/kernel/types-ast.js';
import type { ZoneDef } from '../../../src/kernel/types-core.js';
import type { EventDeckDef, EventSideDef } from '../../../src/kernel/types-events.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeZone = (id: string, ownerPlayerIndex?: number): ZoneDef => ({
  id: asZoneId(id),
  owner: ownerPlayerIndex !== undefined ? 'player' : 'none',
  visibility: 'public',
  ordering: 'set',
  ...(ownerPlayerIndex !== undefined ? { ownerPlayerIndex } : {}),
});

const makeGameDef = (overrides?: {
  zones?: readonly ZoneDef[];
  seats?: readonly { readonly id: string }[];
}) => ({
  zones: overrides?.zones ?? [],
  seats: overrides?.seats ?? [],
  globalVars: [] as readonly { readonly name: string }[],
  perPlayerVars: [] as readonly { readonly name: string }[],
});

const makeDeck = (
  id: string,
  cards: EventDeckDef['cards'],
): EventDeckDef => ({
  id,
  drawZone: 'draw',
  discardZone: 'discard',
  cards,
});

const makeSide = (overrides?: Partial<EventSideDef>): EventSideDef => ({
  ...overrides,
});

// Effect helpers using _k tags
const moveTokenEffect = (from: string, to: string): EffectAST =>
  ({ _k: EFFECT_KIND_TAG.moveToken, moveToken: { token: 'tok', from, to } }) as unknown as EffectAST;

const createTokenEffect = (zone: string): EffectAST =>
  ({ _k: EFFECT_KIND_TAG.createToken, createToken: { type: 'piece', zone } }) as unknown as EffectAST;

const destroyTokenEffect = (): EffectAST =>
  ({ _k: EFFECT_KIND_TAG.destroyToken, destroyToken: { token: 'tok' } }) as unknown as EffectAST;

const moveAllEffect = (from: string, to: string): EffectAST =>
  ({ _k: EFFECT_KIND_TAG.moveAll, moveAll: { from, to } }) as unknown as EffectAST;

const moveTokenAdjacentEffect = (from: string): EffectAST =>
  ({ _k: EFFECT_KIND_TAG.moveTokenAdjacent, moveTokenAdjacent: { token: 'tok', from } }) as unknown as EffectAST;

const setMarkerEffect = (): EffectAST =>
  ({ _k: EFFECT_KIND_TAG.setMarker, setMarker: { marker: 'm', state: 's' } }) as unknown as EffectAST;

const shiftMarkerEffect = (): EffectAST =>
  ({ _k: EFFECT_KIND_TAG.shiftMarker, shiftMarker: { marker: 'm', delta: 1 } }) as unknown as EffectAST;

const setGlobalMarkerEffect = (): EffectAST =>
  ({ _k: EFFECT_KIND_TAG.setGlobalMarker, setGlobalMarker: { marker: 'gm', state: 's' } }) as unknown as EffectAST;

const flipGlobalMarkerEffect = (): EffectAST =>
  ({ _k: EFFECT_KIND_TAG.flipGlobalMarker, flipGlobalMarker: { marker: 'gm' } }) as unknown as EffectAST;

const shiftGlobalMarkerEffect = (): EffectAST =>
  ({ _k: EFFECT_KIND_TAG.shiftGlobalMarker, shiftGlobalMarker: { marker: 'gm', delta: 1 } }) as unknown as EffectAST;

const setVarGlobalEffect = (): EffectAST =>
  ({ _k: EFFECT_KIND_TAG.setVar, setVar: { scope: 'global', var: 'gv', value: 1 } }) as unknown as EffectAST;

const setVarPerPlayerEffect = (): EffectAST =>
  ({ _k: EFFECT_KIND_TAG.setVar, setVar: { scope: 'pvar', var: 'pv', player: 'self', value: 1 } }) as unknown as EffectAST;

const addVarGlobalEffect = (): EffectAST =>
  ({ _k: EFFECT_KIND_TAG.addVar, addVar: { scope: 'global', var: 'gv', delta: 1 } }) as unknown as EffectAST;

const addVarPerPlayerEffect = (): EffectAST =>
  ({ _k: EFFECT_KIND_TAG.addVar, addVar: { scope: 'pvar', var: 'pv', player: 'self', delta: 1 } }) as unknown as EffectAST;

const transferVarEffect = (): EffectAST =>
  ({ _k: EFFECT_KIND_TAG.transferVar, transferVar: { from: { scope: 'global', var: 'a' }, to: { scope: 'global', var: 'b' }, amount: 1 } }) as unknown as EffectAST;

const drawEffect = (): EffectAST =>
  ({ _k: EFFECT_KIND_TAG.draw, draw: { from: 'deck', to: 'hand', count: 1 } }) as unknown as EffectAST;

const shuffleEffect = (): EffectAST =>
  ({ _k: EFFECT_KIND_TAG.shuffle, shuffle: { zone: 'deck' } }) as unknown as EffectAST;

const gotoPhaseEffect = (): EffectAST =>
  ({ _k: EFFECT_KIND_TAG.gotoPhaseExact, gotoPhaseExact: { phase: 'p' } }) as unknown as EffectAST;

const advancePhaseEffect = (): EffectAST =>
  ({ _k: EFFECT_KIND_TAG.advancePhase, advancePhase: {} }) as unknown as EffectAST;

const pushInterruptEffect = (): EffectAST =>
  ({ _k: EFFECT_KIND_TAG.pushInterruptPhase, pushInterruptPhase: { phase: 'p' } }) as unknown as EffectAST;

const popInterruptEffect = (): EffectAST =>
  ({ _k: EFFECT_KIND_TAG.popInterruptPhase, popInterruptPhase: {} }) as unknown as EffectAST;

const chooseOneEffect = (): EffectAST =>
  ({ _k: EFFECT_KIND_TAG.chooseOne, chooseOne: { internalDecisionId: 'd1', bind: 'b', options: { query: 'enums', values: ['a', 'b'] } } }) as unknown as EffectAST;

const chooseNEffect = (): EffectAST =>
  ({ _k: EFFECT_KIND_TAG.chooseN, chooseN: { internalDecisionId: 'd2', bind: 'b', options: { query: 'enums', values: ['a'] }, n: 1 } }) as unknown as EffectAST;

const ifEffect = (thenEffects: readonly EffectAST[], elseEffects?: readonly EffectAST[]): EffectAST =>
  ({
    _k: EFFECT_KIND_TAG.if,
    if: {
      when: { _k: 0, always: true },
      then: thenEffects,
      ...(elseEffects !== undefined ? { else: elseEffects } : {}),
    },
  }) as unknown as EffectAST;

const forEachEffect = (effects: readonly EffectAST[], inEffects?: readonly EffectAST[]): EffectAST =>
  ({
    _k: EFFECT_KIND_TAG.forEach,
    forEach: {
      bind: 'item',
      over: { query: 'enums', values: ['a'] },
      effects,
      ...(inEffects !== undefined ? { in: inEffects } : {}),
    },
  }) as unknown as EffectAST;

const letEffect = (inEffects: readonly EffectAST[]): EffectAST =>
  ({
    _k: EFFECT_KIND_TAG.let,
    let: { bind: 'x', value: 1, in: inEffects },
  }) as unknown as EffectAST;

const bindValueEffect = (): EffectAST =>
  ({ _k: EFFECT_KIND_TAG.bindValue, bindValue: { bind: 'x', value: 1 } }) as unknown as EffectAST;

const setTokenPropEffect = (): EffectAST =>
  ({ _k: EFFECT_KIND_TAG.setTokenProp, setTokenProp: { token: 'tok', prop: 'p', value: 1 } }) as unknown as EffectAST;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildEventAnnotationIndex', () => {
  it('returns empty index for empty decks', () => {
    const index = buildEventAnnotationIndex([], makeGameDef());
    assert.deepEqual(index.entries, {});
  });

  it('returns empty index for deck with no cards', () => {
    const index = buildEventAnnotationIndex(
      [makeDeck('d1', [])],
      makeGameDef(),
    );
    assert.deepEqual(index.entries, {});
  });

  it('annotates a card with no effects', () => {
    const decks = [
      makeDeck('d1', [
        { id: 'c1', title: 'Card 1', sideMode: 'single', unshaded: makeSide() },
      ]),
    ];

    const index = buildEventAnnotationIndex(decks, makeGameDef());
    const ann = index.entries['c1']!;
    assert.equal(ann.cardId, 'c1');
    assert.notEqual(ann.unshaded, undefined);
    assert.equal(ann.unshaded!.effectNodeCount, 0);
    assert.equal(ann.unshaded!.markerModifications, 0);
    assert.equal(ann.unshaded!.grantsOperation, false);
    assert.equal(ann.shaded, undefined);
  });

  describe('token effect counting', () => {
    it('counts moveToken placements and removals per seat', () => {
      const gameDef = makeGameDef({
        zones: [makeZone('z-us', 0), makeZone('z-nva', 1)],
        seats: [{ id: 'us' }, { id: 'nva' }],
      });

      const side = makeSide({
        effects: [
          moveTokenEffect('z-us', 'z-nva'),  // remove from us, place at nva
          moveTokenEffect('z-nva', 'z-us'),  // remove from nva, place at us
          moveTokenEffect('z-us', 'z-us'),   // remove and place at us
        ],
      });

      const decks = [makeDeck('d1', [{ id: 'c1', title: 'C', sideMode: 'single', unshaded: side }])];
      const index = buildEventAnnotationIndex(decks, gameDef);
      const ann = index.entries['c1']!.unshaded!;

      assert.equal(ann.tokenPlacements['nva'], 1);
      assert.equal(ann.tokenPlacements['us'], 2);
      assert.equal(ann.tokenRemovals['us'], 2);
      assert.equal(ann.tokenRemovals['nva'], 1);
    });

    it('counts createToken as both creation and placement', () => {
      const gameDef = makeGameDef({
        zones: [makeZone('z-us', 0)],
        seats: [{ id: 'us' }],
      });

      const side = makeSide({ effects: [createTokenEffect('z-us')] });
      const decks = [makeDeck('d1', [{ id: 'c1', title: 'C', sideMode: 'single', unshaded: side }])];
      const index = buildEventAnnotationIndex(decks, gameDef);
      const ann = index.entries['c1']!.unshaded!;

      assert.equal(ann.tokenCreations['us'], 1);
      assert.equal(ann.tokenPlacements['us'], 1);
      // Invariant: tokenCreations is a subset of tokenPlacements
      for (const [seat, count] of Object.entries(ann.tokenCreations)) {
        assert.ok(count <= (ann.tokenPlacements[seat] ?? 0));
      }
    });

    it('counts destroyToken as both destruction and removal attributed to dynamic', () => {
      const side = makeSide({ effects: [destroyTokenEffect()] });
      const decks = [makeDeck('d1', [{ id: 'c1', title: 'C', sideMode: 'single', unshaded: side }])];
      const index = buildEventAnnotationIndex(decks, makeGameDef());
      const ann = index.entries['c1']!.unshaded!;

      assert.equal(ann.tokenDestructions['dynamic'], 1);
      assert.equal(ann.tokenRemovals['dynamic'], 1);
    });

    it('attributes moveAll and moveTokenAdjacent to dynamic', () => {
      const side = makeSide({
        effects: [moveAllEffect('z1', 'z2'), moveTokenAdjacentEffect('z1')],
      });
      const decks = [makeDeck('d1', [{ id: 'c1', title: 'C', sideMode: 'single', unshaded: side }])];
      const index = buildEventAnnotationIndex(decks, makeGameDef());
      const ann = index.entries['c1']!.unshaded!;

      assert.equal(ann.tokenPlacements['dynamic'], 2);
      assert.equal(ann.tokenRemovals['dynamic'], 2);
    });

    it('attributes dynamic zone expressions to dynamic seat', () => {
      const dynamicMoveToken: EffectAST = ({
        _k: EFFECT_KIND_TAG.moveToken,
        moveToken: { token: 'tok', from: { zoneExpr: { ref: 'someVar' } }, to: { zoneExpr: { ref: 'otherVar' } } },
      }) as unknown as EffectAST;

      const side = makeSide({ effects: [dynamicMoveToken] });
      const decks = [makeDeck('d1', [{ id: 'c1', title: 'C', sideMode: 'single', unshaded: side }])];
      const index = buildEventAnnotationIndex(decks, makeGameDef());
      const ann = index.entries['c1']!.unshaded!;

      assert.equal(ann.tokenPlacements['dynamic'], 1);
      assert.equal(ann.tokenRemovals['dynamic'], 1);
    });
  });

  describe('marker effect counting', () => {
    it('counts setMarker and shiftMarker as markerModifications', () => {
      const side = makeSide({
        effects: [setMarkerEffect(), shiftMarkerEffect(), setMarkerEffect()],
      });
      const decks = [makeDeck('d1', [{ id: 'c1', title: 'C', sideMode: 'single', unshaded: side }])];
      const index = buildEventAnnotationIndex(decks, makeGameDef());

      assert.equal(index.entries['c1']!.unshaded!.markerModifications, 3);
    });

    it('counts global marker effects', () => {
      const side = makeSide({
        effects: [setGlobalMarkerEffect(), flipGlobalMarkerEffect(), shiftGlobalMarkerEffect()],
      });
      const decks = [makeDeck('d1', [{ id: 'c1', title: 'C', sideMode: 'single', unshaded: side }])];
      const index = buildEventAnnotationIndex(decks, makeGameDef());

      assert.equal(index.entries['c1']!.unshaded!.globalMarkerModifications, 3);
    });
  });

  describe('variable effect counting', () => {
    it('counts setVar/addVar on global scope', () => {
      const side = makeSide({
        effects: [setVarGlobalEffect(), addVarGlobalEffect()],
      });
      const decks = [makeDeck('d1', [{ id: 'c1', title: 'C', sideMode: 'single', unshaded: side }])];
      const index = buildEventAnnotationIndex(decks, makeGameDef());

      assert.equal(index.entries['c1']!.unshaded!.globalVarModifications, 2);
      assert.equal(index.entries['c1']!.unshaded!.perPlayerVarModifications, 0);
    });

    it('counts setVar/addVar on perPlayer scope', () => {
      const side = makeSide({
        effects: [setVarPerPlayerEffect(), addVarPerPlayerEffect()],
      });
      const decks = [makeDeck('d1', [{ id: 'c1', title: 'C', sideMode: 'single', unshaded: side }])];
      const index = buildEventAnnotationIndex(decks, makeGameDef());

      assert.equal(index.entries['c1']!.unshaded!.perPlayerVarModifications, 2);
      assert.equal(index.entries['c1']!.unshaded!.globalVarModifications, 0);
    });

    it('counts transferVar', () => {
      const side = makeSide({ effects: [transferVarEffect()] });
      const decks = [makeDeck('d1', [{ id: 'c1', title: 'C', sideMode: 'single', unshaded: side }])];
      const index = buildEventAnnotationIndex(decks, makeGameDef());

      assert.equal(index.entries['c1']!.unshaded!.varTransfers, 1);
    });
  });

  describe('deck effect counting', () => {
    it('counts draw and shuffle', () => {
      const side = makeSide({
        effects: [drawEffect(), drawEffect(), shuffleEffect()],
      });
      const decks = [makeDeck('d1', [{ id: 'c1', title: 'C', sideMode: 'single', unshaded: side }])];
      const index = buildEventAnnotationIndex(decks, makeGameDef());

      assert.equal(index.entries['c1']!.unshaded!.drawCount, 2);
      assert.equal(index.entries['c1']!.unshaded!.shuffleCount, 1);
    });
  });

  describe('phase control detection', () => {
    it('detects all phase control effect kinds', () => {
      for (const effect of [gotoPhaseEffect(), advancePhaseEffect(), pushInterruptEffect(), popInterruptEffect()]) {
        const side = makeSide({ effects: [effect] });
        const decks = [makeDeck('d1', [{ id: 'c1', title: 'C', sideMode: 'single', unshaded: side }])];
        const index = buildEventAnnotationIndex(decks, makeGameDef());
        assert.equal(index.entries['c1']!.unshaded!.hasPhaseControl, true);
      }
    });
  });

  describe('decision point detection', () => {
    it('detects chooseOne', () => {
      const side = makeSide({ effects: [chooseOneEffect()] });
      const decks = [makeDeck('d1', [{ id: 'c1', title: 'C', sideMode: 'single', unshaded: side }])];
      const index = buildEventAnnotationIndex(decks, makeGameDef());
      assert.equal(index.entries['c1']!.unshaded!.hasDecisionPoints, true);
    });

    it('detects chooseN', () => {
      const side = makeSide({ effects: [chooseNEffect()] });
      const decks = [makeDeck('d1', [{ id: 'c1', title: 'C', sideMode: 'single', unshaded: side }])];
      const index = buildEventAnnotationIndex(decks, makeGameDef());
      assert.equal(index.entries['c1']!.unshaded!.hasDecisionPoints, true);
    });
  });

  describe('conservative counting (both if/else branches)', () => {
    it('counts effects in both then and else branches', () => {
      const gameDef = makeGameDef({
        zones: [makeZone('z-us', 0)],
        seats: [{ id: 'us' }],
      });

      const side = makeSide({
        effects: [
          ifEffect(
            [createTokenEffect('z-us'), createTokenEffect('z-us')],  // then: 2 creations
            [createTokenEffect('z-us')],                               // else: 1 creation
          ),
        ],
      });
      const decks = [makeDeck('d1', [{ id: 'c1', title: 'C', sideMode: 'single', unshaded: side }])];
      const index = buildEventAnnotationIndex(decks, gameDef);
      const ann = index.entries['c1']!.unshaded!;

      // Conservative: 2 + 1 = 3
      assert.equal(ann.tokenCreations['us'], 3);
      assert.equal(ann.tokenPlacements['us'], 3);
      // if node + 3 inner = 4
      assert.equal(ann.effectNodeCount, 4);
    });
  });

  describe('nested control flow', () => {
    it('walks forEach effects and in-effects', () => {
      const side = makeSide({
        effects: [
          forEachEffect(
            [setMarkerEffect()],                       // forEach.effects
            [setGlobalMarkerEffect()],                 // forEach.in
          ),
        ],
      });
      const decks = [makeDeck('d1', [{ id: 'c1', title: 'C', sideMode: 'single', unshaded: side }])];
      const index = buildEventAnnotationIndex(decks, makeGameDef());
      const ann = index.entries['c1']!.unshaded!;

      assert.equal(ann.markerModifications, 1);
      assert.equal(ann.globalMarkerModifications, 1);
      // forEach + setMarker + setGlobalMarker = 3
      assert.equal(ann.effectNodeCount, 3);
    });

    it('walks let.in effects', () => {
      const side = makeSide({
        effects: [letEffect([drawEffect()])],
      });
      const decks = [makeDeck('d1', [{ id: 'c1', title: 'C', sideMode: 'single', unshaded: side }])];
      const index = buildEventAnnotationIndex(decks, makeGameDef());
      const ann = index.entries['c1']!.unshaded!;

      assert.equal(ann.drawCount, 1);
      assert.equal(ann.effectNodeCount, 2); // let + draw
    });
  });

  describe('structural property extraction', () => {
    it('detects freeOperationGrants', () => {
      const side = makeSide({
        freeOperationGrants: [
          {
            seat: 'us',
            operationClass: 'specialActivity' as const,
            sequence: { batch: 'b', step: 1 },
          },
          {
            seat: 'nva',
            operationClass: 'operation' as const,
            sequence: { batch: 'b', step: 2 },
          },
        ],
      });
      const decks = [makeDeck('d1', [{ id: 'c1', title: 'C', sideMode: 'single', unshaded: side }])];
      const index = buildEventAnnotationIndex(decks, makeGameDef());
      const ann = index.entries['c1']!.unshaded!;

      assert.equal(ann.grantsOperation, true);
      assert.deepEqual([...ann.grantOperationSeats].sort(), ['nva', 'us']);
    });

    it('detects eligibilityOverrides', () => {
      const side = makeSide({
        eligibilityOverrides: [
          { target: { kind: 'active' }, eligible: true, windowId: 'w1' },
        ],
      });
      const decks = [makeDeck('d1', [{ id: 'c1', title: 'C', sideMode: 'single', unshaded: side }])];
      const index = buildEventAnnotationIndex(decks, makeGameDef());

      assert.equal(index.entries['c1']!.unshaded!.hasEligibilityOverride, true);
    });

    it('detects lastingEffects', () => {
      const side = makeSide({
        lastingEffects: [
          { id: 'le1', duration: 'turn' as const, setupEffects: [setMarkerEffect()] },
        ],
      });
      const decks = [makeDeck('d1', [{ id: 'c1', title: 'C', sideMode: 'single', unshaded: side }])];
      const index = buildEventAnnotationIndex(decks, makeGameDef());

      assert.equal(index.entries['c1']!.unshaded!.hasLastingEffect, true);
      assert.equal(index.entries['c1']!.unshaded!.markerModifications, 1); // from setupEffects
    });

    it('detects branches', () => {
      const side = makeSide({
        branches: [
          { id: 'b1', effects: [setMarkerEffect()] },
        ],
      });
      const decks = [makeDeck('d1', [{ id: 'c1', title: 'C', sideMode: 'single', unshaded: side }])];
      const index = buildEventAnnotationIndex(decks, makeGameDef());

      assert.equal(index.entries['c1']!.unshaded!.hasBranches, true);
      assert.equal(index.entries['c1']!.unshaded!.markerModifications, 1); // from branch effects
    });

    it('detects structural properties from branches', () => {
      const side = makeSide({
        branches: [
          {
            id: 'b1',
            freeOperationGrants: [{ seat: 'vc', operationClass: 'operation' as const, sequence: { batch: 'b', step: 1 } }],
            eligibilityOverrides: [{ target: { kind: 'active' }, eligible: false, windowId: 'w1' }],
            lastingEffects: [{ id: 'le1', duration: 'turn' as const, setupEffects: [] }],
          },
        ],
      });
      const decks = [makeDeck('d1', [{ id: 'c1', title: 'C', sideMode: 'single', unshaded: side }])];
      const index = buildEventAnnotationIndex(decks, makeGameDef());
      const ann = index.entries['c1']!.unshaded!;

      assert.equal(ann.grantsOperation, true);
      assert.deepEqual(ann.grantOperationSeats, ['vc']);
      assert.equal(ann.hasEligibilityOverride, true);
      assert.equal(ann.hasLastingEffect, true);
      assert.equal(ann.hasBranches, true);
    });
  });

  describe('side traversal completeness', () => {
    it('walks all eight effect array locations', () => {
      const side = makeSide({
        effects: [setMarkerEffect()],                                    // 1. side.effects
        branches: [{
          id: 'b1',
          effects: [setMarkerEffect()],                                  // 2. branches[].effects
          targets: [{ id: 't1', selector: { query: 'enums', values: ['a'] }, cardinality: { n: 1 }, application: 'each', effects: [setMarkerEffect()] }],  // 6. branches[].targets[].effects
          lastingEffects: [{
            id: 'ble1',
            duration: 'turn' as const,
            setupEffects: [setMarkerEffect()],                           // 7. branches[].lastingEffects[].setupEffects
            teardownEffects: [setMarkerEffect()],                        // 8. branches[].lastingEffects[].teardownEffects
          }],
        }],
        targets: [{ id: 't2', selector: { query: 'enums', values: ['a'] }, cardinality: { n: 1 }, application: 'each', effects: [setMarkerEffect()] }],  // 3. targets[].effects
        lastingEffects: [{
          id: 'le1',
          duration: 'turn' as const,
          setupEffects: [setMarkerEffect()],                             // 4. lastingEffects[].setupEffects
          teardownEffects: [setMarkerEffect()],                          // 5. lastingEffects[].teardownEffects
        }],
      });

      const decks = [makeDeck('d1', [{ id: 'c1', title: 'C', sideMode: 'single', unshaded: side }])];
      const index = buildEventAnnotationIndex(decks, makeGameDef());

      // 8 setMarker effects across all locations
      assert.equal(index.entries['c1']!.unshaded!.markerModifications, 8);
      assert.equal(index.entries['c1']!.unshaded!.effectNodeCount, 8);
    });
  });

  describe('dual-sided cards', () => {
    it('annotates both unshaded and shaded sides independently', () => {
      const decks = [
        makeDeck('d1', [{
          id: 'c1',
          title: 'Card',
          sideMode: 'dual',
          unshaded: makeSide({ effects: [setMarkerEffect(), setMarkerEffect()] }),
          shaded: makeSide({ effects: [drawEffect()] }),
        }]),
      ];
      const index = buildEventAnnotationIndex(decks, makeGameDef());
      const ann = index.entries['c1']!;

      assert.equal(ann.unshaded!.markerModifications, 2);
      assert.equal(ann.unshaded!.drawCount, 0);
      assert.equal(ann.shaded!.markerModifications, 0);
      assert.equal(ann.shaded!.drawCount, 1);
    });
  });

  describe('effectNodeCount', () => {
    it('counts all visited nodes including nested control flow', () => {
      const side = makeSide({
        effects: [
          setMarkerEffect(),
          ifEffect([drawEffect(), shuffleEffect()]),
          forEachEffect([setGlobalMarkerEffect()]),
        ],
      });
      const decks = [makeDeck('d1', [{ id: 'c1', title: 'C', sideMode: 'single', unshaded: side }])];
      const index = buildEventAnnotationIndex(decks, makeGameDef());

      // setMarker(1) + if(1) + draw(1) + shuffle(1) + forEach(1) + setGlobalMarker(1) = 6
      assert.equal(index.entries['c1']!.unshaded!.effectNodeCount, 6);
    });

    it('is >= sum of all other numeric counts', () => {
      const side = makeSide({
        effects: [
          setMarkerEffect(),
          setGlobalMarkerEffect(),
          setVarGlobalEffect(),
          drawEffect(),
          transferVarEffect(),
        ],
      });
      const decks = [makeDeck('d1', [{ id: 'c1', title: 'C', sideMode: 'single', unshaded: side }])];
      const index = buildEventAnnotationIndex(decks, makeGameDef());
      const ann = index.entries['c1']!.unshaded!;

      const otherCounts =
        ann.markerModifications +
        ann.globalMarkerModifications +
        ann.globalVarModifications +
        ann.perPlayerVarModifications +
        ann.varTransfers +
        ann.drawCount +
        ann.shuffleCount +
        Object.values(ann.tokenPlacements).reduce((s, n) => s + n, 0) +
        Object.values(ann.tokenRemovals).reduce((s, n) => s + n, 0);

      assert.ok(ann.effectNodeCount >= otherCounts);
    });
  });

  describe('unrecognized _k tags', () => {
    it('contributes only to effectNodeCount', () => {
      const unknownEffect = { _k: 999 } as unknown as EffectAST;
      const side = makeSide({ effects: [unknownEffect, setMarkerEffect()] });
      const decks = [makeDeck('d1', [{ id: 'c1', title: 'C', sideMode: 'single', unshaded: side }])];
      const index = buildEventAnnotationIndex(decks, makeGameDef());
      const ann = index.entries['c1']!.unshaded!;

      assert.equal(ann.effectNodeCount, 2); // unknown + setMarker
      assert.equal(ann.markerModifications, 1); // only setMarker counted
    });
  });

  describe('multiple decks', () => {
    it('indexes cards from multiple decks', () => {
      const decks = [
        makeDeck('d1', [
          { id: 'c1', title: 'C1', sideMode: 'single', unshaded: makeSide({ effects: [drawEffect()] }) },
        ]),
        makeDeck('d2', [
          { id: 'c2', title: 'C2', sideMode: 'single', unshaded: makeSide({ effects: [shuffleEffect()] }) },
        ]),
      ];
      const index = buildEventAnnotationIndex(decks, makeGameDef());

      assert.equal(Object.keys(index.entries).length, 2);
      assert.equal(index.entries['c1']!.unshaded!.drawCount, 1);
      assert.equal(index.entries['c2']!.unshaded!.shuffleCount, 1);
    });
  });

  describe('non-negative invariant', () => {
    it('all numeric annotation fields are non-negative', () => {
      const side = makeSide({
        effects: [
          setMarkerEffect(), setGlobalMarkerEffect(),
          setVarGlobalEffect(), setVarPerPlayerEffect(),
          transferVarEffect(), drawEffect(), shuffleEffect(),
          destroyTokenEffect(),
        ],
      });
      const decks = [makeDeck('d1', [{ id: 'c1', title: 'C', sideMode: 'single', unshaded: side }])];
      const index = buildEventAnnotationIndex(decks, makeGameDef());
      const ann = index.entries['c1']!.unshaded!;

      assert.ok(ann.markerModifications >= 0);
      assert.ok(ann.globalMarkerModifications >= 0);
      assert.ok(ann.globalVarModifications >= 0);
      assert.ok(ann.perPlayerVarModifications >= 0);
      assert.ok(ann.varTransfers >= 0);
      assert.ok(ann.drawCount >= 0);
      assert.ok(ann.shuffleCount >= 0);
      assert.ok(ann.effectNodeCount >= 0);

      for (const count of Object.values(ann.tokenPlacements)) {
        assert.ok(count >= 0);
      }
      for (const count of Object.values(ann.tokenRemovals)) {
        assert.ok(count >= 0);
      }
      for (const count of Object.values(ann.tokenCreations)) {
        assert.ok(count >= 0);
      }
      for (const count of Object.values(ann.tokenDestructions)) {
        assert.ok(count >= 0);
      }
    });
  });

  describe('other effect kinds (bindValue, setTokenProp) only increment effectNodeCount', () => {
    it('counts bindValue and setTokenProp only in effectNodeCount', () => {
      const side = makeSide({
        effects: [bindValueEffect(), setTokenPropEffect()],
      });
      const decks = [makeDeck('d1', [{ id: 'c1', title: 'C', sideMode: 'single', unshaded: side }])];
      const index = buildEventAnnotationIndex(decks, makeGameDef());
      const ann = index.entries['c1']!.unshaded!;

      assert.equal(ann.effectNodeCount, 2);
      assert.equal(ann.markerModifications, 0);
      assert.equal(ann.globalMarkerModifications, 0);
      assert.equal(ann.globalVarModifications, 0);
      assert.equal(ann.perPlayerVarModifications, 0);
      assert.equal(ann.drawCount, 0);
      assert.equal(ann.shuffleCount, 0);
    });
  });
});
