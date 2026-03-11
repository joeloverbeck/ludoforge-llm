import type { Diagnostic } from '../kernel/diagnostics.js';
import {
  hasBindingIdentifier,
  rankBindingIdentifierAlternatives,
} from '../contracts/index.js';
import { createBindingShadowWarning } from './binding-diagnostics.js';

export class BindingScope {
  private readonly frames: string[][] = [];
  private readonly guardedByCondition = new Map<string, Set<string>>();

  constructor(
    initial: readonly string[],
    frames?: readonly (readonly string[])[],
    guardedByCondition?: ReadonlyMap<string, ReadonlySet<string>>,
  ) {
    if (frames !== undefined) {
      for (const frame of frames) {
        this.frames.push([...frame]);
      }
    } else {
      this.frames.push([...initial]);
    }
    if (guardedByCondition !== undefined) {
      for (const [condition, bindings] of guardedByCondition.entries()) {
        this.guardedByCondition.set(condition, new Set(bindings));
      }
    }
  }

  has(name: string): boolean {
    return this.frames.some((frame) => hasBindingIdentifier(name, frame));
  }

  /** Permanently add a binding to the top frame (for sequential effects). */
  register(name: string): void {
    const top = this.frames[this.frames.length - 1];
    if (top !== undefined) {
      top.push(name);
    }
  }

  visibleBindings(): readonly string[] {
    const deduped = new Set<string>();
    for (let index = this.frames.length - 1; index >= 0; index -= 1) {
      for (const name of this.frames[index] ?? []) {
        deduped.add(name);
      }
    }
    return [...deduped].sort((left, right) => left.localeCompare(right));
  }

  clone(): BindingScope {
    return new BindingScope([], this.frames, this.guardedByCondition);
  }

  registerGuarded(condition: string, name: string): void {
    const existing = this.guardedByCondition.get(condition);
    if (existing !== undefined) {
      existing.add(name);
      return;
    }
    this.guardedByCondition.set(condition, new Set([name]));
  }

  guardedBindingsFor(condition: string): readonly string[] {
    const bindings = this.guardedByCondition.get(condition);
    if (bindings === undefined) {
      return [];
    }
    return [...bindings].sort((left, right) => left.localeCompare(right));
  }

  withBinding<TValue>(name: string, callback: () => TValue): TValue {
    this.frames.push([name]);
    try {
      return callback();
    } finally {
      this.frames.pop();
    }
  }

  withBindings<TValue>(names: readonly string[], callback: () => TValue): TValue {
    this.frames.push([...names]);
    try {
      return callback();
    } finally {
      this.frames.pop();
    }
  }

  shadowWarning(name: string, path: string): readonly Diagnostic[] {
    if (!this.has(name)) {
      return [];
    }
    return [createBindingShadowWarning(name, path)];
  }

  alternativesFor(name: string): readonly string[] {
    return rankBindingIdentifierAlternatives(name, this.visibleBindings());
  }
}

/**
 * After a choice/random effect is lowered, register its `bind` name in the
 * scope so subsequent effects in the same array can reference it.
 */
export function registerSequentialBinding(effect: import('../kernel/types.js').EffectAST, scope: BindingScope): void {
  const bindings = collectSequentialBindingsLocal(effect);
  for (const binding of bindings) {
    scope.register(binding);
  }
}

// Re-import to avoid circular dependency — uses the same logic from binder-surface-registry
import { collectSequentialBindings as collectSequentialBindingsLocal } from './binder-surface-registry.js';
