import type { EffectTraceEntry } from '@ludoforge/engine/runtime';

import type { GsapLike } from './gsap-setup.js';
import {
  ANIMATION_PRESET_IDS,
  type AnimationDescriptor,
  type AnimationPresetId,
  type BuiltinAnimationPresetId,
} from './animation-types.js';

type VisualAnimationDescriptor = Exclude<AnimationDescriptor, { kind: 'skipped' }>;
export type PresetCompatibleDescriptorKind = VisualAnimationDescriptor['kind'];

export interface PresetTweenContext {
  readonly gsap: GsapLike;
  readonly timeline: unknown;
  readonly spriteRefs: unknown;
}

export type PresetTweenFactory = (
  descriptor: VisualAnimationDescriptor,
  context: PresetTweenContext,
) => void;

export interface AnimationPresetDefinition {
  readonly id: AnimationPresetId;
  readonly defaultDurationSeconds: number;
  readonly compatibleKinds: readonly PresetCompatibleDescriptorKind[];
  readonly createTween: PresetTweenFactory;
}

interface AnimationPresetMetadata {
  readonly defaultDurationSeconds: number;
  readonly compatibleKinds: readonly PresetCompatibleDescriptorKind[];
  readonly createTween: PresetTweenFactory;
}

export interface PresetRegistry {
  readonly size: number;
  list(): readonly AnimationPresetDefinition[];
  has(id: AnimationPresetId): boolean;
  get(id: AnimationPresetId): AnimationPresetDefinition | undefined;
  require(id: AnimationPresetId): AnimationPresetDefinition;
  requireCompatible(id: AnimationPresetId, descriptorKind: PresetCompatibleDescriptorKind): AnimationPresetDefinition;
  register(definition: AnimationPresetDefinition): PresetRegistry;
  registerMany(definitions: readonly AnimationPresetDefinition[]): PresetRegistry;
}

const DEFAULT_TRACE_KIND_PRESET_IDS: Readonly<Record<EffectTraceEntry['kind'], AnimationPresetId | null>> = {
  moveToken: 'arc-tween',
  createToken: 'fade-in-scale',
  destroyToken: 'fade-out-scale',
  setTokenProp: 'tint-flash',
  varChange: 'counter-roll',
  resourceTransfer: 'counter-roll',
  lifecycleEvent: 'banner-slide',
  forEach: null,
  reduce: null,
};

const NOOP_TWEEN_FACTORY: PresetTweenFactory = () => {
  // Placeholder until ANIMSYS-004 timeline builder wires concrete GSAP tween creation.
};

const VISUAL_DESCRIPTOR_KINDS: readonly PresetCompatibleDescriptorKind[] = [
  'moveToken',
  'createToken',
  'destroyToken',
  'setTokenProp',
  'varChange',
  'resourceTransfer',
  'phaseTransition',
];

const BUILTIN_PRESET_METADATA = {
  'arc-tween': {
    defaultDurationSeconds: 0.4,
    compatibleKinds: ['moveToken'],
    createTween: NOOP_TWEEN_FACTORY,
  },
  'fade-in-scale': {
    defaultDurationSeconds: 0.3,
    compatibleKinds: ['createToken'],
    createTween: NOOP_TWEEN_FACTORY,
  },
  'fade-out-scale': {
    defaultDurationSeconds: 0.3,
    compatibleKinds: ['destroyToken'],
    createTween: NOOP_TWEEN_FACTORY,
  },
  'tint-flash': {
    defaultDurationSeconds: 0.4,
    compatibleKinds: ['setTokenProp'],
    createTween: NOOP_TWEEN_FACTORY,
  },
  'counter-roll': {
    defaultDurationSeconds: 0.3,
    compatibleKinds: ['varChange', 'resourceTransfer'],
    createTween: NOOP_TWEEN_FACTORY,
  },
  'banner-slide': {
    defaultDurationSeconds: 1.5,
    compatibleKinds: ['phaseTransition'],
    createTween: NOOP_TWEEN_FACTORY,
  },
  pulse: {
    defaultDurationSeconds: 0.2,
    compatibleKinds: VISUAL_DESCRIPTOR_KINDS,
    createTween: NOOP_TWEEN_FACTORY,
  },
} as const satisfies Readonly<Record<BuiltinAnimationPresetId, AnimationPresetMetadata>>;

export const BUILTIN_ANIMATION_PRESET_DEFINITIONS: readonly AnimationPresetDefinition[] = Object.freeze(
  ANIMATION_PRESET_IDS.map((id) => {
    const metadata = BUILTIN_PRESET_METADATA[id];
    const compatibleKinds = Object.freeze([...metadata.compatibleKinds]);
    return Object.freeze({
      id,
      defaultDurationSeconds: metadata.defaultDurationSeconds,
      compatibleKinds,
      createTween: metadata.createTween,
    } satisfies AnimationPresetDefinition);
  }),
);

export function resolveDefaultPresetIdForTraceKind(traceKind: EffectTraceEntry['kind']): AnimationPresetId {
  const presetId = DEFAULT_TRACE_KIND_PRESET_IDS[traceKind];
  if (presetId === null) {
    throw new Error(`Trace kind "${traceKind}" does not map to a visual animation preset.`);
  }
  return presetId;
}

export function createPresetRegistry(
  definitions: readonly AnimationPresetDefinition[] = BUILTIN_ANIMATION_PRESET_DEFINITIONS,
): PresetRegistry {
  const map = createPresetMap(definitions);
  return createRegistryFromMap(map);
}

export function assertPresetDefinition(definition: AnimationPresetDefinition): void {
  if (definition.id.trim().length === 0) {
    throw new Error('Animation preset id must be non-empty.');
  }
  if (!Number.isFinite(definition.defaultDurationSeconds) || definition.defaultDurationSeconds <= 0) {
    throw new Error(`Animation preset "${definition.id}" defaultDurationSeconds must be > 0.`);
  }
  if (definition.compatibleKinds.length === 0) {
    throw new Error(`Animation preset "${definition.id}" must declare at least one compatible descriptor kind.`);
  }
  if (typeof definition.createTween !== 'function') {
    throw new Error(`Animation preset "${definition.id}" createTween must be a function.`);
  }

  const seenKinds = new Set<PresetCompatibleDescriptorKind>();
  for (const kind of definition.compatibleKinds) {
    if (!VISUAL_DESCRIPTOR_KINDS.includes(kind)) {
      throw new Error(`Animation preset "${definition.id}" has unsupported descriptor kind "${kind}".`);
    }
    if (seenKinds.has(kind)) {
      throw new Error(`Animation preset "${definition.id}" repeats descriptor kind "${kind}".`);
    }
    seenKinds.add(kind);
  }
}

function createPresetMap(definitions: readonly AnimationPresetDefinition[]): Map<string, AnimationPresetDefinition> {
  const map = new Map<string, AnimationPresetDefinition>();
  for (const definition of definitions) {
    assertPresetDefinition(definition);
    if (map.has(definition.id)) {
      throw new Error(`Animation preset id must be unique (id=${definition.id}).`);
    }
    map.set(definition.id, freezePresetDefinition(definition));
  }
  return map;
}

function createRegistryFromMap(map: ReadonlyMap<string, AnimationPresetDefinition>): PresetRegistry {
  const presets = Object.freeze([...map.values()]);

  return {
    size: map.size,
    list: () => presets,
    has: (id) => map.has(id),
    get: (id) => map.get(id),
    require: (id) => {
      const definition = map.get(id);
      if (definition === undefined) {
        throw new Error(`Animation preset "${id}" is not registered.`);
      }
      return definition;
    },
    requireCompatible: (id, descriptorKind) => {
      const definition = map.get(id);
      if (definition === undefined) {
        throw new Error(`Animation preset "${id}" is not registered.`);
      }
      if (!definition.compatibleKinds.includes(descriptorKind)) {
        throw new Error(
          `Animation preset "${id}" is not compatible with descriptor kind "${descriptorKind}".`,
        );
      }
      return definition;
    },
    register: (definition) => {
      assertPresetDefinition(definition);
      if (map.has(definition.id)) {
        throw new Error(`Animation preset id must be unique (id=${definition.id}).`);
      }
      const next = new Map(map);
      next.set(definition.id, freezePresetDefinition(definition));
      return createRegistryFromMap(next);
    },
    registerMany: (definitionsToRegister) => {
      const next = new Map(map);
      for (const definition of definitionsToRegister) {
        assertPresetDefinition(definition);
        if (next.has(definition.id)) {
          throw new Error(`Animation preset id must be unique (id=${definition.id}).`);
        }
        next.set(definition.id, freezePresetDefinition(definition));
      }
      return createRegistryFromMap(next);
    },
  };
}

function freezePresetDefinition(definition: AnimationPresetDefinition): AnimationPresetDefinition {
  return Object.freeze({
    id: definition.id,
    defaultDurationSeconds: definition.defaultDurationSeconds,
    compatibleKinds: Object.freeze([...definition.compatibleKinds]),
    createTween: definition.createTween,
  } satisfies AnimationPresetDefinition);
}
