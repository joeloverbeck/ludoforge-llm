/**
 * Blocker extractor: walks a ConditionAST with an evaluator function
 * to produce minimal human-readable blocker descriptions.
 *
 * Walk rules:
 * - `and`: collect only children where evaluate(child) === false
 * - `or`: show the smallest unsatisfied alternative (fewest sub-conditions)
 * - `not`: describe the positive condition that was violated
 * - Leaf comparisons: format as "Need {left} {op} {right}"
 */

import type { ConditionAST } from './types-ast.js';
import type { BlockerDetail, BlockerInfo } from './tooltip-rule-card.js';
import type { VerbalizationDef } from './verbalization-types.js';
import type { LabelContext } from './tooltip-label-resolver.js';
import { buildLabelContext } from './tooltip-label-resolver.js';
import { humanizeValueExpr } from './tooltip-value-stringifier.js';

// ---------------------------------------------------------------------------
// Condition size (for `or` minimal selection)
// ---------------------------------------------------------------------------

const conditionSize = (cond: ConditionAST): number => {
  if (typeof cond === 'boolean') return 1;
  switch (cond.op) {
    case 'and':
    case 'or':
      return cond.args.reduce((sum, arg) => sum + conditionSize(arg), 0);
    case 'not':
      return 1 + conditionSize(cond.arg);
    default:
      return 1;
  }
};

// ---------------------------------------------------------------------------
// Operator display
// ---------------------------------------------------------------------------

const OP_DISPLAY: Readonly<Record<string, string>> = {
  '==': '=',
  '!=': '\u2260',
  '<': '<',
  '<=': '\u2264',
  '>': '>',
  '>=': '\u2265',
};

// ---------------------------------------------------------------------------
// Core walk
// ---------------------------------------------------------------------------

const walkBlockers = (
  cond: ConditionAST,
  evaluate: (c: ConditionAST) => boolean,
  ctx: LabelContext,
  path: string,
): readonly BlockerDetail[] => {
  if (typeof cond === 'boolean') {
    if (cond) return [];
    return [{ astPath: path, description: 'Condition is false' }];
  }

  switch (cond.op) {
    case 'and': {
      // Collect only failing children
      const blockers: BlockerDetail[] = [];
      for (let i = 0; i < cond.args.length; i++) {
        const child = cond.args[i]!;
        const childPasses = safeEvaluate(child, evaluate);
        if (!childPasses) {
          blockers.push(...walkBlockers(child, evaluate, ctx, `${path}.args[${i}]`));
        }
      }
      return blockers;
    }

    case 'or': {
      // Show the smallest failing alternative
      let smallest: readonly BlockerDetail[] | undefined;
      let smallestSize = Infinity;
      for (let i = 0; i < cond.args.length; i++) {
        const child = cond.args[i]!;
        const childPasses = safeEvaluate(child, evaluate);
        if (childPasses) return []; // At least one passes → or is satisfied
        const size = conditionSize(child);
        if (size < smallestSize) {
          smallestSize = size;
          smallest = walkBlockers(child, evaluate, ctx, `${path}.args[${i}]`);
        }
      }
      return smallest ?? [];
    }

    case 'not': {
      // The inner condition IS true but shouldn't be → describe what was violated
      return [{ astPath: path, description: describeNotBlocker(cond.arg, ctx) }];
    }

    default:
      // Leaf comparison
      return [describeLeafBlocker(cond, ctx, path)];
  }
};

// ---------------------------------------------------------------------------
// Leaf description
// ---------------------------------------------------------------------------

const describeLeafBlocker = (
  cond: Exclude<ConditionAST, boolean | { readonly op: 'and' | 'or' | 'not'; [k: string]: unknown }>,
  ctx: LabelContext,
  path: string,
): BlockerDetail => {
  switch (cond.op) {
    case '==':
    case '!=':
    case '<':
    case '<=':
    case '>':
    case '>=': {
      const left = humanizeValueExpr(cond.left, ctx);
      const right = humanizeValueExpr(cond.right, ctx);
      const opDisplay = OP_DISPLAY[cond.op] ?? cond.op;
      return {
        astPath: path,
        description: `Need ${left} ${opDisplay} ${right}`,
        requiredValue: right,
      };
    }
    case 'in': {
      const item = humanizeValueExpr(cond.item, ctx);
      return { astPath: path, description: `Need ${item} in set` };
    }
    case 'adjacent': {
      const left = humanizeValueExpr(cond.left, ctx);
      const right = humanizeValueExpr(cond.right, ctx);
      return { astPath: path, description: `Need ${left} adjacent to ${right}` };
    }
    case 'connected': {
      const from = humanizeValueExpr(cond.from, ctx);
      const to = humanizeValueExpr(cond.to, ctx);
      return { astPath: path, description: `Need ${from} connected to ${to}` };
    }
    case 'zonePropIncludes': {
      const zone = humanizeValueExpr(cond.zone, ctx);
      const value = humanizeValueExpr(cond.value, ctx);
      return { astPath: path, description: `Need ${zone}.${cond.prop} to include ${value}` };
    }
    case 'markerStateAllowed': {
      const state = humanizeValueExpr(cond.state, ctx);
      const zone = humanizeValueExpr(cond.space, ctx);
      return { astPath: path, description: `Need ${cond.marker} to allow ${state} in ${zone}` };
    }
    default: {
      const _exhaustive: never = cond;
      return _exhaustive;
    }
  }
};

// ---------------------------------------------------------------------------
// Not-blocker description
// ---------------------------------------------------------------------------

const INVERTED_OP_DISPLAY: Readonly<Record<string, string>> = {
  '==': '\u2260',
  '!=': '=',
  '<': '\u2265',
  '<=': '>',
  '>': '\u2264',
  '>=': '<',
};

const describeNotBlocker = (
  inner: ConditionAST,
  ctx: LabelContext,
): string => {
  if (typeof inner === 'boolean') return `Expected not ${String(inner)}`;

  switch (inner.op) {
    case '==':
    case '!=':
    case '<':
    case '<=':
    case '>':
    case '>=': {
      const left = humanizeValueExpr(inner.left, ctx);
      const right = humanizeValueExpr(inner.right, ctx);
      const opDisplay = INVERTED_OP_DISPLAY[inner.op] ?? inner.op;
      return `Need ${left} ${opDisplay} ${right}`;
    }
    case 'in': {
      const item = humanizeValueExpr(inner.item, ctx);
      return `Need ${item} not in set`;
    }
    case 'adjacent': {
      const left = humanizeValueExpr(inner.left, ctx);
      const right = humanizeValueExpr(inner.right, ctx);
      return `Need ${left} not adjacent to ${right}`;
    }
    case 'connected': {
      const from = humanizeValueExpr(inner.from, ctx);
      const to = humanizeValueExpr(inner.to, ctx);
      return `Need ${from} not connected to ${to}`;
    }
    case 'zonePropIncludes': {
      const zone = humanizeValueExpr(inner.zone, ctx);
      const value = humanizeValueExpr(inner.value, ctx);
      return `Need ${zone}.${inner.prop} to not include ${value}`;
    }
    case 'markerStateAllowed': {
      const state = humanizeValueExpr(inner.state, ctx);
      const zone = humanizeValueExpr(inner.space, ctx);
      return `Need ${inner.marker} to not allow ${state} in ${zone}`;
    }
    case 'and':
    case 'or':
    case 'not':
      return `Negation of compound condition`;
  }
};

// ---------------------------------------------------------------------------
// Safe evaluation wrapper
// ---------------------------------------------------------------------------

const safeEvaluate = (
  cond: ConditionAST,
  evaluate: (c: ConditionAST) => boolean,
): boolean => {
  try {
    return evaluate(cond);
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const extractBlockers = (
  condition: ConditionAST,
  evaluate: (cond: ConditionAST) => boolean,
  verbalization: VerbalizationDef | undefined,
): BlockerInfo => {
  const satisfied = safeEvaluate(condition, evaluate);
  if (satisfied) {
    return { satisfied: true, blockers: [] };
  }

  const ctx = buildLabelContext(verbalization);

  const blockers = walkBlockers(condition, evaluate, ctx, 'root');
  return { satisfied: false, blockers };
};
