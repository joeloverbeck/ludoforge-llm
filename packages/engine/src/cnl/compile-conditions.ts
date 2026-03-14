import { createConditionLowerers } from './compile-conditions-conditions.js';
import { createQueryLowerers } from './compile-conditions-queries.js';
import {
  type ConditionLoweringContext,
  type ConditionLoweringResult,
  type ConditionLoweringRuntime,
} from './compile-conditions-shared.js';
import { createTokenFilterLowerers } from './compile-conditions-token-filters.js';
import { createValueLowerers } from './compile-conditions-values.js';

const runtime = {} as ConditionLoweringRuntime;

Object.assign(runtime, createTokenFilterLowerers(runtime));
Object.assign(runtime, createValueLowerers(runtime));
Object.assign(runtime, createQueryLowerers(runtime));
Object.assign(runtime, createConditionLowerers(runtime));

export type { ConditionLoweringContext, ConditionLoweringResult };

export const lowerConditionNode = runtime.lowerConditionNode;
export const lowerValueNode = runtime.lowerValueNode;
export const lowerNumericValueNode = runtime.lowerNumericValueNode;
export const lowerScopedVarNameExpr = runtime.lowerScopedVarNameExpr;
export const lowerTokenFilterExpr = runtime.lowerTokenFilterExpr;
export const lowerQueryNode = runtime.lowerQueryNode;
