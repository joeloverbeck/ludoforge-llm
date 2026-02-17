import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { expandEffectMacros } from '../../../src/cnl/expand-effect-macros.js';
import { createEmptyGameSpecDoc, type EffectMacroDef, type GameSpecDoc } from '../../../src/cnl/game-spec-doc.js';

class SeededRng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  nextUInt32(): number {
    this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
    return this.state;
  }

  nextInt(maxExclusive: number): number {
    return this.nextUInt32() % maxExclusive;
  }

  pick<T>(values: readonly T[]): T {
    return values[this.nextInt(values.length)] as T;
  }

  token(prefix: string, length = 4): string {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz';
    let result = prefix;
    for (let i = 0; i < length; i += 1) {
      result += alphabet[this.nextInt(alphabet.length)];
    }
    return result;
  }
}

function makeDoc(overrides: Partial<GameSpecDoc>): GameSpecDoc {
  return { ...createEmptyGameSpecDoc(), ...overrides };
}

function collectBindingNames(node: unknown, names: Set<string>): void {
  if (Array.isArray(node)) {
    node.forEach((child) => collectBindingNames(child, names));
    return;
  }
  if (typeof node !== 'object' || node === null) {
    return;
  }

  const record = node as Record<string, unknown>;
  for (const [key, value] of Object.entries(record)) {
    if ((key === 'bind' || key === 'countBind' || key === 'remainingBind') && typeof value === 'string') {
      names.add(value);
    }
    if (key === 'name' && record.ref === 'binding' && typeof value === 'string') {
      names.add(value);
    }
    collectBindingNames(value, names);
  }
}

function buildValidStressDoc(seed: number): {
  readonly doc: GameSpecDoc;
  readonly invocationRawLiteral: string;
  readonly invocationBinding: string;
} {
  const rng = new SeededRng(seed);
  const chainDepth = 1 + rng.nextInt(3);

  const leafId = rng.token('leaf-');
  const wrapperIds = Array.from({ length: chainDepth }, (_, index) => `${rng.token('wrap-')}-${index}`);

  const invocationBinding = `$${rng.token('choice')}`;
  const invocationRawLiteral = `literal-${invocationBinding}`;

  const leafMacro: EffectMacroDef = {
    id: leafId,
    params: [
      { name: 'binding', type: 'bindingName' },
      { name: 'template', type: 'bindingTemplate' },
      { name: 'zone', type: 'zoneSelector' },
      { name: 'raw', type: 'string' },
    ],
    exports: [],
    effects: [
      { setVar: { scope: 'global', var: 'bindingOut', value: { param: 'binding' } } },
      { setVar: { scope: 'global', var: 'templateOut', value: { param: 'template' } } },
      { setVar: { scope: 'global', var: 'zoneOut', value: { param: 'zone' } } },
      { createToken: { type: { param: 'raw' }, zone: 'deck:none', props: { label: { param: 'raw' }, exact: { param: 'raw' } } } },
    ],
  };

  const wrapperMacros: EffectMacroDef[] = wrapperIds.map((id, index) => {
    const localBinder = `$${rng.token(`local${index}`)}`;
    const nextMacro = index === wrapperIds.length - 1 ? leafId : wrapperIds[index + 1];
    return {
      id,
      params: [
        { name: 'binding', type: 'bindingName' },
        { name: 'template', type: 'bindingTemplate' },
        { name: 'zone', type: 'zoneSelector' },
        { name: 'raw', type: 'string' },
      ],
      exports: [],
      effects: [
        { chooseOne: { bind: localBinder, options: { query: 'enums', values: ['a', 'b', 'c'] } } },
        { setVar: { scope: 'global', var: `trace${index}`, value: { ref: 'binding', name: localBinder } } },
        {
          macro: nextMacro,
          args: {
            binding: { param: 'binding' },
            template: { param: 'template' },
            zone: { param: 'zone' },
            raw: { param: 'raw' },
          },
        },
      ],
    };
  });

  const topMacro = wrapperIds[0] as string;
  const doc = makeDoc({
    effectMacros: [...wrapperMacros, leafMacro],
    setup: [
      {
        macro: topMacro,
        args: {
          binding: invocationBinding,
          template: `token-{${invocationBinding}}`,
          zone: `discard:{${invocationBinding}}`,
          raw: invocationRawLiteral,
        },
      },
    ],
  });

  return { doc, invocationRawLiteral, invocationBinding };
}

function buildInvalidStressDoc(seed: number): GameSpecDoc {
  const rng = new SeededRng(seed);
  const variant = rng.pick(['leak', 'template', 'missing-arg'] as const);

  if (variant === 'missing-arg') {
    const macro: EffectMacroDef = {
      id: rng.token('missing-'),
      params: [{ name: 'name', type: 'bindingName' }],
      exports: [],
      effects: [{ setVar: { scope: 'global', var: 'x', value: { param: 'name' } } }],
    };
    return makeDoc({
      effectMacros: [macro],
      setup: [{ macro: macro.id, args: {} }],
    });
  }

  const inner: EffectMacroDef = {
    id: rng.token('inner-'),
    params: [{ name: 'name', type: 'string' }],
    exports: [],
    effects: [{ setVar: { scope: 'global', var: 'x', value: { ref: 'binding', name: { param: 'name' } } } }],
  };
  const localBinder = `$${rng.token('choice')}`;
  const outer: EffectMacroDef = {
    id: rng.token('outer-'),
    params: [],
    exports: [],
    effects: [
      { chooseOne: { bind: localBinder, options: { query: 'enums', values: ['a', 'b'] } } },
      {
        macro: inner.id,
        args: {
          name: variant === 'leak' ? localBinder : `discard:{${localBinder}}`,
        },
      },
    ],
  };

  return makeDoc({
    effectMacros: [inner, outer],
    setup: [{ macro: outer.id, args: {} }],
  });
}

describe('macro hygiene property-style invariants', () => {
  it('expansion output is deterministic for generated nested macro documents', () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const { doc } = buildValidStressDoc(seed);
      const first = expandEffectMacros(doc);
      const second = expandEffectMacros(doc);

      assert.deepEqual(second.doc, first.doc, `seed=${seed}: expanded doc should be deterministic`);
      assert.deepEqual(second.diagnostics, first.diagnostics, `seed=${seed}: diagnostics should be deterministic`);
    }
  });

  it('does not mutate non-binding literals and avoids unexported binder leakage', () => {
    for (let seed = 51; seed <= 100; seed += 1) {
      const { doc, invocationRawLiteral, invocationBinding } = buildValidStressDoc(seed);
      const result = expandEffectMacros(doc);

      assert.equal(
        result.diagnostics.some((diagnostic) => diagnostic.code === 'EFFECT_MACRO_HYGIENE_BINDING_LEAK'),
        false,
        `seed=${seed}: unexported binder should not leak`,
      );
      assert.equal(
        result.diagnostics.some((diagnostic) => diagnostic.code === 'EFFECT_MACRO_HYGIENE_UNRESOLVED_TEMPLATE'),
        false,
        `seed=${seed}: unresolved templates should not remain in valid docs`,
      );

      const createTokenEffect = result.doc.setup?.find(
        (effect) =>
          typeof effect === 'object' &&
          effect !== null &&
          'createToken' in effect,
      ) as { createToken: { type: string; props: { label: string; exact: string } } } | undefined;

      assert.notEqual(createTokenEffect, undefined, `seed=${seed}: expected generated createToken effect`);
      assert.equal(createTokenEffect?.createToken.type, invocationRawLiteral, `seed=${seed}: type literal mutated unexpectedly`);
      assert.equal(createTokenEffect?.createToken.props.label, invocationRawLiteral, `seed=${seed}: props.label mutated unexpectedly`);
      assert.equal(createTokenEffect?.createToken.props.exact, invocationRawLiteral, `seed=${seed}: props.exact mutated unexpectedly`);

      const referencedBindings = new Set<string>();
      collectBindingNames(result.doc.setup, referencedBindings);
      assert.equal(
        referencedBindings.has(invocationBinding),
        false,
        `seed=${seed}: original unexported invocation binder should not be used as a binding declaration/reference`,
      );
    }
  });

  it('invalid generated docs emit deterministic diagnostics and reproducible codes', () => {
    for (let seed = 101; seed <= 150; seed += 1) {
      const doc = buildInvalidStressDoc(seed);
      const first = expandEffectMacros(doc);
      const second = expandEffectMacros(doc);

      assert.deepEqual(second.diagnostics, first.diagnostics, `seed=${seed}: diagnostics should be deterministic`);
      assert.equal(first.diagnostics.length > 0, true, `seed=${seed}: invalid doc must produce diagnostics`);
      assert.equal(
        first.diagnostics.some((diagnostic) =>
          [
            'EFFECT_MACRO_HYGIENE_BINDING_LEAK',
            'EFFECT_MACRO_HYGIENE_UNRESOLVED_TEMPLATE',
            'EFFECT_MACRO_MISSING_ARGS',
          ].includes(diagnostic.code),
        ),
        true,
        `seed=${seed}: expected known deterministic macro diagnostic family`,
      );
    }
  });
});
