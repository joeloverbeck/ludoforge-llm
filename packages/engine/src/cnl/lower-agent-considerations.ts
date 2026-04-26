import type {
  AgentPolicyExpr,
  CompiledAgentLibraryIndex,
  CompiledPolicyCatalog,
  CompiledPolicyConsideration,
  CompiledPolicyExpr,
} from '../kernel/types.js';

export function lowerAgentConsiderations(
  library: CompiledAgentLibraryIndex,
): CompiledPolicyCatalog {
  const considerations: Record<string, CompiledPolicyConsideration> = {};

  for (const [considerationId, consideration] of Object.entries(library.considerations)) {
    const weight = lowerAgentPolicyExpr(consideration.weight);
    const value = lowerAgentPolicyExpr(consideration.value);
    const when = consideration.when === undefined ? null : lowerAgentPolicyExpr(consideration.when);
    if (weight === null || value === null || (consideration.when !== undefined && when === null)) {
      continue;
    }
    considerations[considerationId] = {
      ...(consideration.scopes === undefined ? {} : { scopes: consideration.scopes }),
      costClass: consideration.costClass,
      ...(when === null ? {} : { when }),
      weight,
      value,
      ...(consideration.unknownAs === undefined ? {} : { unknownAs: consideration.unknownAs }),
      ...(consideration.clamp === undefined ? {} : { clamp: consideration.clamp }),
      dependencies: consideration.dependencies,
    };
  }

  return { considerations };
}

export function lowerAgentPolicyExpr(expr: AgentPolicyExpr): CompiledPolicyExpr | null {
  switch (expr.kind) {
    case 'literal':
      return { kind: 'literal', value: expr.value };
    case 'param':
      return { kind: 'param', id: expr.id };
    case 'ref':
      return { kind: 'ref', ref: expr.ref };
    case 'op': {
      const args: CompiledPolicyExpr[] = [];
      for (const arg of expr.args) {
        const lowered = lowerAgentPolicyExpr(arg);
        if (lowered === null) {
          return null;
        }
        args.push(lowered);
      }
      return { kind: 'op', op: expr.op, args };
    }
    case 'zoneProp':
    case 'zoneTokenAgg':
    case 'globalTokenAgg':
    case 'globalZoneAgg':
    case 'adjacentTokenAgg':
    case 'seatAgg':
      return null;
  }
}
