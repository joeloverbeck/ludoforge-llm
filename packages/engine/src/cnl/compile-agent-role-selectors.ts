import type {
  CompiledPolicySelector,
  CompiledRoleSelector,
  SelectorId,
} from '../kernel/types.js';

export function compileRoleSelector(
  role: string,
  selectorId: string,
  selector: CompiledPolicySelector,
): CompiledRoleSelector {
  return {
    selectorId: selectorId as SelectorId,
    role,
    scopes: selector.scopes,
    source: selector.source,
    result: selector.result,
    costClass: selector.costClass,
    dependencies: selector.dependencies,
    refs: {
      id: `role.${role}.id`,
      quality: `role.${role}.quality`,
      rank: `role.${role}.rank`,
      components: `role.${role}.components`,
    },
  };
}
