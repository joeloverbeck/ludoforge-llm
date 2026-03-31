/**
 * Effect AST walker that builds a CompiledEventAnnotationIndex from compiled event decks.
 *
 * Walks every effect array on each event card side, recursively descending into
 * control-flow constructs (if/forEach/let/reduce/rollRandom/evaluateSubset/removeByPriority),
 * and counts leaf effects into a flat numeric feature vector per side.
 *
 * Conservative counting: both branches of if/else are counted.  This is
 * intentional — the annotation is a heuristic signal, not an exact prediction.
 */

import { EFFECT_KIND_TAG } from '../kernel/types-ast.js';
import type { EffectAST } from '../kernel/types-ast.js';
import type {
  CompiledEventAnnotationIndex,
  CompiledEventCardAnnotation,
  CompiledEventSideAnnotation,
  ZoneDef,
} from '../kernel/types-core.js';
import type {
  EventBranchDef,
  EventDeckDef,
  EventSideDef,
} from '../kernel/types-events.js';

// ---------------------------------------------------------------------------
// Internal mutable accumulator (frozen into CompiledEventSideAnnotation)
// ---------------------------------------------------------------------------

interface MutableAnnotationAccumulator {
  readonly tokenPlacements: Record<string, number>;
  readonly tokenRemovals: Record<string, number>;
  readonly tokenCreations: Record<string, number>;
  readonly tokenDestructions: Record<string, number>;
  markerModifications: number;
  globalMarkerModifications: number;
  globalVarModifications: number;
  perPlayerVarModifications: number;
  varTransfers: number;
  drawCount: number;
  shuffleCount: number;
  hasPhaseControl: boolean;
  hasDecisionPoints: boolean;
  effectNodeCount: number;
}

const emptyAccumulator = (): MutableAnnotationAccumulator => ({
  tokenPlacements: {},
  tokenRemovals: {},
  tokenCreations: {},
  tokenDestructions: {},
  markerModifications: 0,
  globalMarkerModifications: 0,
  globalVarModifications: 0,
  perPlayerVarModifications: 0,
  varTransfers: 0,
  drawCount: 0,
  shuffleCount: 0,
  hasPhaseControl: false,
  hasDecisionPoints: false,
  effectNodeCount: 0,
});

// ---------------------------------------------------------------------------
// Context for seat / scope resolution
// ---------------------------------------------------------------------------

interface AnnotationContext {
  /** Map from zone ID to owning seat ID (or undefined if unowned). */
  readonly zoneToSeat: ReadonlyMap<string, string>;
  /** Set of global variable names for scope disambiguation. */
  readonly globalVarNames: ReadonlySet<string>;
}

const buildAnnotationContext = (gameDef: {
  readonly zones: readonly ZoneDef[];
  readonly seats?: readonly { readonly id: string }[];
  readonly globalVars: readonly { readonly name: string }[];
}): AnnotationContext => {
  const zoneToSeat = new Map<string, string>();
  const seatIds = gameDef.seats ?? [];
  for (const zone of gameDef.zones) {
    if (zone.owner === 'player' && zone.ownerPlayerIndex !== undefined) {
      const seat = seatIds[zone.ownerPlayerIndex];
      if (seat !== undefined) {
        zoneToSeat.set(zone.id, seat.id);
      }
    }
  }

  const globalVarNames = new Set<string>();
  for (const v of gameDef.globalVars) {
    globalVarNames.add(v.name);
  }

  return { zoneToSeat, globalVarNames };
};

// ---------------------------------------------------------------------------
// Zone ref → seat resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a ZoneRef to a seat ID for annotation counting.
 * - Literal zone ID → look up in zoneToSeat map
 * - Dynamic expression → 'dynamic'
 */
const resolveZoneRefSeat = (
  zoneRef: string | { readonly zoneExpr: unknown },
  ctx: AnnotationContext,
): string => {
  if (typeof zoneRef !== 'string') {
    return 'dynamic';
  }
  return ctx.zoneToSeat.get(zoneRef) ?? 'dynamic';
};

// ---------------------------------------------------------------------------
// Increment helpers
// ---------------------------------------------------------------------------

const inc = (record: Record<string, number>, key: string): void => {
  record[key] = (record[key] ?? 0) + 1;
};

// ---------------------------------------------------------------------------
// Recursive effect walker
// ---------------------------------------------------------------------------

const walkAndCount = (
  effects: readonly EffectAST[],
  acc: MutableAnnotationAccumulator,
  ctx: AnnotationContext,
): void => {
  for (const effect of effects) {
    acc.effectNodeCount += 1;

    // Dispatch on _k for leaf counting
    switch (effect._k) {
      // --- Token effects ---
      case EFFECT_KIND_TAG.moveToken: {
        const mt = effect.moveToken;
        const toSeat = resolveZoneRefSeat(mt.to, ctx);
        inc(acc.tokenPlacements, toSeat);
        const fromSeat = resolveZoneRefSeat(mt.from, ctx);
        inc(acc.tokenRemovals, fromSeat);
        break;
      }
      case EFFECT_KIND_TAG.createToken: {
        const ct = effect.createToken;
        const seat = resolveZoneRefSeat(ct.zone, ctx);
        inc(acc.tokenCreations, seat);
        inc(acc.tokenPlacements, seat);
        break;
      }
      case EFFECT_KIND_TAG.destroyToken: {
        // destroyToken only has a token selector, no zone — attribute to dynamic
        inc(acc.tokenDestructions, 'dynamic');
        inc(acc.tokenRemovals, 'dynamic');
        break;
      }
      case EFFECT_KIND_TAG.moveAll: {
        inc(acc.tokenPlacements, 'dynamic');
        inc(acc.tokenRemovals, 'dynamic');
        break;
      }
      case EFFECT_KIND_TAG.moveTokenAdjacent: {
        inc(acc.tokenPlacements, 'dynamic');
        inc(acc.tokenRemovals, 'dynamic');
        break;
      }

      // --- Marker effects ---
      case EFFECT_KIND_TAG.setMarker:
      case EFFECT_KIND_TAG.shiftMarker:
        acc.markerModifications += 1;
        break;
      case EFFECT_KIND_TAG.setGlobalMarker:
      case EFFECT_KIND_TAG.flipGlobalMarker:
      case EFFECT_KIND_TAG.shiftGlobalMarker:
        acc.globalMarkerModifications += 1;
        break;

      // --- Variable effects ---
      case EFFECT_KIND_TAG.setVar: {
        const sv = effect.setVar;
        if (sv.scope === 'global') {
          acc.globalVarModifications += 1;
        } else if (sv.scope === 'pvar') {
          acc.perPlayerVarModifications += 1;
        }
        // zoneVar — neither global nor perPlayer, skip
        break;
      }
      case EFFECT_KIND_TAG.addVar: {
        const av = effect.addVar;
        if (av.scope === 'global') {
          acc.globalVarModifications += 1;
        } else if (av.scope === 'pvar') {
          acc.perPlayerVarModifications += 1;
        }
        break;
      }
      case EFFECT_KIND_TAG.transferVar:
        acc.varTransfers += 1;
        break;

      // --- Deck effects ---
      case EFFECT_KIND_TAG.draw:
        acc.drawCount += 1;
        break;
      case EFFECT_KIND_TAG.shuffle:
        acc.shuffleCount += 1;
        break;

      // --- Phase control ---
      case EFFECT_KIND_TAG.gotoPhaseExact:
      case EFFECT_KIND_TAG.advancePhase:
      case EFFECT_KIND_TAG.pushInterruptPhase:
      case EFFECT_KIND_TAG.popInterruptPhase:
        acc.hasPhaseControl = true;
        break;

      // --- Decision points ---
      case EFFECT_KIND_TAG.chooseOne:
      case EFFECT_KIND_TAG.chooseN:
        acc.hasDecisionPoints = true;
        break;

      default:
        // Non-leaf or unrecognized — only effectNodeCount (already incremented)
        break;
    }

    // Recurse into control-flow constructs
    switch (effect._k) {
      case EFFECT_KIND_TAG.if:
        walkAndCount(effect.if.then, acc, ctx);
        if (effect.if.else !== undefined) {
          walkAndCount(effect.if.else, acc, ctx);
        }
        break;
      case EFFECT_KIND_TAG.forEach:
        walkAndCount(effect.forEach.effects, acc, ctx);
        if (effect.forEach.in !== undefined) {
          walkAndCount(effect.forEach.in, acc, ctx);
        }
        break;
      case EFFECT_KIND_TAG.let:
        walkAndCount(effect.let.in, acc, ctx);
        break;
      case EFFECT_KIND_TAG.reduce:
        walkAndCount(effect.reduce.in, acc, ctx);
        break;
      case EFFECT_KIND_TAG.rollRandom:
        walkAndCount(effect.rollRandom.in, acc, ctx);
        break;
      case EFFECT_KIND_TAG.evaluateSubset:
        walkAndCount(effect.evaluateSubset.compute, acc, ctx);
        walkAndCount(effect.evaluateSubset.in, acc, ctx);
        break;
      case EFFECT_KIND_TAG.removeByPriority:
        if (effect.removeByPriority.in !== undefined) {
          walkAndCount(effect.removeByPriority.in, acc, ctx);
        }
        break;
      default:
        break;
    }
  }
};

// ---------------------------------------------------------------------------
// Side-level annotation
// ---------------------------------------------------------------------------

const walkAllSideEffects = (
  side: EventSideDef,
  acc: MutableAnnotationAccumulator,
  ctx: AnnotationContext,
): void => {
  // 1. side.effects
  if (side.effects !== undefined) {
    walkAndCount(side.effects, acc, ctx);
  }

  // 2-3. side.branches[].effects and side.branches[].targets[].effects
  if (side.branches !== undefined) {
    walkBranches(side.branches, acc, ctx);
  }

  // 4. side.targets[].effects
  if (side.targets !== undefined) {
    for (const target of side.targets) {
      walkAndCount(target.effects, acc, ctx);
    }
  }

  // 5-6. side.lastingEffects[].setupEffects / teardownEffects
  if (side.lastingEffects !== undefined) {
    walkLastingEffects(side.lastingEffects, acc, ctx);
  }
};

const walkBranches = (
  branches: readonly EventBranchDef[],
  acc: MutableAnnotationAccumulator,
  ctx: AnnotationContext,
): void => {
  for (const branch of branches) {
    if (branch.effects !== undefined) {
      walkAndCount(branch.effects, acc, ctx);
    }
    if (branch.targets !== undefined) {
      for (const target of branch.targets) {
        walkAndCount(target.effects, acc, ctx);
      }
    }
    if (branch.lastingEffects !== undefined) {
      walkLastingEffects(branch.lastingEffects, acc, ctx);
    }
  }
};

const walkLastingEffects = (
  lastingEffects: readonly { readonly setupEffects: readonly EffectAST[]; readonly teardownEffects?: readonly EffectAST[] }[],
  acc: MutableAnnotationAccumulator,
  ctx: AnnotationContext,
): void => {
  for (const le of lastingEffects) {
    walkAndCount(le.setupEffects, acc, ctx);
    if (le.teardownEffects !== undefined) {
      walkAndCount(le.teardownEffects, acc, ctx);
    }
  }
};

const extractStructuralProperties = (
  side: EventSideDef,
): {
  grantsOperation: boolean;
  grantOperationSeats: readonly string[];
  hasEligibilityOverride: boolean;
  hasLastingEffect: boolean;
  hasBranches: boolean;
} => {
  const grantsOperation =
    side.freeOperationGrants !== undefined && side.freeOperationGrants.length > 0;

  const grantOperationSeats: string[] = [];
  if (side.freeOperationGrants !== undefined) {
    for (const grant of side.freeOperationGrants) {
      if (!grantOperationSeats.includes(grant.seat)) {
        grantOperationSeats.push(grant.seat);
      }
    }
  }

  const hasEligibilityOverride =
    side.eligibilityOverrides !== undefined && side.eligibilityOverrides.length > 0;
  const hasLastingEffect =
    side.lastingEffects !== undefined && side.lastingEffects.length > 0;
  const hasBranches =
    side.branches !== undefined && side.branches.length > 0;

  // Also check branches for freeOperationGrants / eligibilityOverrides / lastingEffects
  let branchGrantsOp = false;
  let branchHasEligOverride = false;
  let branchHasLasting = false;
  if (side.branches !== undefined) {
    for (const branch of side.branches) {
      if (branch.freeOperationGrants !== undefined && branch.freeOperationGrants.length > 0) {
        branchGrantsOp = true;
        for (const grant of branch.freeOperationGrants) {
          if (!grantOperationSeats.includes(grant.seat)) {
            grantOperationSeats.push(grant.seat);
          }
        }
      }
      if (branch.eligibilityOverrides !== undefined && branch.eligibilityOverrides.length > 0) {
        branchHasEligOverride = true;
      }
      if (branch.lastingEffects !== undefined && branch.lastingEffects.length > 0) {
        branchHasLasting = true;
      }
    }
  }

  return {
    grantsOperation: grantsOperation || branchGrantsOp,
    grantOperationSeats,
    hasEligibilityOverride: hasEligibilityOverride || branchHasEligOverride,
    hasLastingEffect: hasLastingEffect || branchHasLasting,
    hasBranches,
  };
};

const freezeRecord = (rec: Record<string, number>): Readonly<Record<string, number>> =>
  Object.freeze({ ...rec });

const annotateSide = (
  side: EventSideDef,
  ctx: AnnotationContext,
): CompiledEventSideAnnotation => {
  const acc = emptyAccumulator();
  walkAllSideEffects(side, acc, ctx);
  const structural = extractStructuralProperties(side);

  return {
    tokenPlacements: freezeRecord(acc.tokenPlacements),
    tokenRemovals: freezeRecord(acc.tokenRemovals),
    tokenCreations: freezeRecord(acc.tokenCreations),
    tokenDestructions: freezeRecord(acc.tokenDestructions),
    markerModifications: acc.markerModifications,
    globalMarkerModifications: acc.globalMarkerModifications,
    globalVarModifications: acc.globalVarModifications,
    perPlayerVarModifications: acc.perPlayerVarModifications,
    varTransfers: acc.varTransfers,
    drawCount: acc.drawCount,
    shuffleCount: acc.shuffleCount,
    grantsOperation: structural.grantsOperation,
    grantOperationSeats: structural.grantOperationSeats,
    hasEligibilityOverride: structural.hasEligibilityOverride,
    hasLastingEffect: structural.hasLastingEffect,
    hasBranches: structural.hasBranches,
    hasPhaseControl: acc.hasPhaseControl,
    hasDecisionPoints: acc.hasDecisionPoints,
    effectNodeCount: acc.effectNodeCount,
  };
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Walk every event card's effect ASTs and build a CompiledEventAnnotationIndex
 * summarizing what each card side does as a flat numeric feature vector.
 *
 * Pure function — no mutation of input structures.
 */
export const buildEventAnnotationIndex = (
  eventDecks: readonly EventDeckDef[],
  gameDef: {
    readonly globalVars: readonly { readonly name: string }[];
    readonly perPlayerVars: readonly { readonly name: string }[];
    readonly zones: readonly ZoneDef[];
    readonly seats?: readonly { readonly id: string }[];
  },
): CompiledEventAnnotationIndex => {
  const ctx = buildAnnotationContext(gameDef);
  const entries: Record<string, CompiledEventCardAnnotation> = {};

  for (const deck of eventDecks) {
    for (const card of deck.cards) {
      const annotation: {
        cardId: string;
        unshaded?: CompiledEventSideAnnotation;
        shaded?: CompiledEventSideAnnotation;
      } = { cardId: card.id };

      if (card.unshaded !== undefined) {
        annotation.unshaded = annotateSide(card.unshaded, ctx);
      }
      if (card.shaded !== undefined) {
        annotation.shaded = annotateSide(card.shaded, ctx);
      }

      entries[card.id] = annotation;
    }
  }

  return { entries };
};
