import type { EffectTraceEntry } from '@ludoforge/engine/runtime';

export type EffectTraceKind = EffectTraceEntry['kind'];

export const SKIPPED_TRACE_KINDS = ['forEach', 'reduce', 'reveal', 'conceal', 'shuffle'] as const;
export type SkippedTraceKind = (typeof SKIPPED_TRACE_KINDS)[number];

export const TRACE_KIND_DEFAULT_PRESET_IDS: Readonly<Record<EffectTraceKind, string | null>> = {
  moveToken: 'arc-tween',
  createToken: 'fade-in-scale',
  destroyToken: 'fade-out-scale',
  setTokenProp: 'tint-flash',
  varChange: 'counter-tick',
  resourceTransfer: 'counter-tick',
  lifecycleEvent: 'banner-overlay',
  shuffle: null,
  forEach: null,
  reduce: null,
  reveal: null,
  conceal: null,
};

export function isSkippedTraceKind(kind: EffectTraceKind): kind is SkippedTraceKind {
  return kind === 'forEach' || kind === 'reduce' || kind === 'reveal' || kind === 'conceal' || kind === 'shuffle';
}

export function isSkippedTraceEntry(
  entry: EffectTraceEntry,
): entry is Extract<EffectTraceEntry, { kind: SkippedTraceKind }> {
  return isSkippedTraceKind(entry.kind);
}
